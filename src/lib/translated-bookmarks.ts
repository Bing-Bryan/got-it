import type { DocumentSnapshot } from '../types';
import { bookmarkDomRanges } from './bookmark-selection';
import { bookmarkQuote, bookmarkSegments, type BookmarkAnchor, type ReadingBookmark } from './bookmark-types';
import { documentTranslationSource } from './document-translation';
import { renderTranslatedHtml, validUnitTranslation, type WebTranslationState } from './web-translation';

export type BookmarkDisplayKind = 'exact' | 'paragraph' | 'stale' | 'original';

export interface BookmarkDisplay {
  quote: string;
  kind: BookmarkDisplayKind;
  full: boolean;
}

interface TranslationContext {
  translated: Map<string, string>;
  original: Map<string, string>;
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

function translationContext(document: DocumentSnapshot, translation: WebTranslationState | undefined): TranslationContext | null {
  if (!translation || document.kind === 'pdf' || translation.documentId !== document.id) return null;
  const sourceInfo = documentTranslationSource(document);
  if (!sourceInfo || sourceInfo.sourceVersion !== translation.sourceVersion) return null;
  const { source } = sourceInfo;
  const unitsByBlock = new Map<string, typeof source.units>();
  for (const unit of source.units) {
    const list = unitsByBlock.get(unit.blockId) ?? [];
    list.push(unit);
    unitsByBlock.set(unit.blockId, list);
  }
  const complete = new Set<string>();
  for (const [blockId, units] of unitsByBlock) {
    if (units.every(unit => validUnitTranslation(unit, translation.units[unit.id]))) complete.add(blockId);
  }
  if (!complete.size) return null;

  const rendered = new DOMParser().parseFromString(renderTranslatedHtml(source, translation.units), 'text/html');
  const translated = new Map<string, string>();
  for (const element of rendered.querySelectorAll<HTMLElement>('[data-block-id]')) {
    const blockId = element.dataset.blockId;
    if (blockId && complete.has(blockId)) translated.set(blockId, element.textContent?.trim() ?? '');
  }
  const original = new Map(source.blocks.map(block => [block.id, block.text]));
  return { translated, original };
}

function blockParts(anchor: BookmarkAnchor, context: TranslationContext) {
  const parts: Array<{ translated: string; full: boolean }> = [];
  for (const segment of bookmarkSegments(anchor)) {
    const translated = context.translated.get(segment.blockId);
    const original = context.original.get(segment.blockId);
    if (translated === undefined || original === undefined) return null;
    const full = normalize(original) === normalize(segment.quote);
    parts.push({ translated, full });
  }
  return parts.length ? parts : null;
}

function isCurrentTranslation(anchor: BookmarkAnchor, translation?: WebTranslationState): boolean {
  const segments = bookmarkSegments(anchor);
  return !!translation && segments.length > 0 && segments.every(segment => !!segment.translation
    && translation.id === segment.translation.translationId
    && translation.version === segment.translation.version
    && translation.sourceVersion === segment.translation.sourceVersion);
}

/**
 * Display-only projection of a bookmark into the current translation. It never
 * mutates the saved anchor: the original quote stays the source of truth.
 */
export function translatedBookmarkDisplay(
  bookmark: ReadingBookmark,
  document: DocumentSnapshot,
  translation?: WebTranslationState,
): BookmarkDisplay {
  const anchor = bookmark.anchor;
  if (anchor.image) return { quote: bookmarkQuote(anchor), kind: 'original', full: false };

  const segments = bookmarkSegments(anchor);
  if (segments.some(segment => segment.translation)) {
    if (!segments.every(segment => segment.translation)) {
      return { quote: segments.map(segment => segment.quote).join('\n'), kind: 'original', full: false };
    }
    return { quote: bookmarkQuote(anchor), kind: isCurrentTranslation(anchor, translation) ? 'exact' : 'stale', full: false };
  }

  const context = translationContext(document, translation);
  if (!context) return { quote: bookmarkQuote(anchor), kind: 'original', full: false };
  const parts = blockParts(anchor, context);
  if (!parts) return { quote: bookmarkQuote(anchor), kind: 'original', full: false };
  return {
    quote: parts.map(part => part.translated).join('\n'),
    kind: 'paragraph',
    full: parts.every(part => part.full),
  };
}

export function translatedBookmarkDisplays(
  bookmarks: ReadingBookmark[],
  document: DocumentSnapshot,
  translation?: WebTranslationState,
  activeRevisionId?: string,
): Map<string, BookmarkDisplay> {
  return new Map(bookmarks.map(bookmark => {
    if (activeRevisionId && bookmark.revisionId !== activeRevisionId) {
      return [bookmark.id, {
        quote: bookmarkQuote(bookmark.anchor),
        kind: bookmarkSegments(bookmark.anchor).some(segment => segment.translation) ? 'stale' : 'original',
        full: false,
      } satisfies BookmarkDisplay];
    }
    return [bookmark.id, translatedBookmarkDisplay(bookmark, document, translation)];
  }));
}

function spanRange(article: HTMLElement, element: HTMLElement): Range {
  const range = article.ownerDocument.createRange();
  range.selectNodeContents(element);
  return range;
}

/**
 * Returns exact word-level ranges for translated bookmarks and paragraph-level
 * ranges for original bookmarks projected into the current translation.
 */
export function collectBookmarkHighlights(
  article: HTMLElement,
  bookmarks: ReadingBookmark[],
  options?: { document: DocumentSnapshot; translation?: WebTranslationState; readingSide: 'original' | 'translated' },
): { exact: Range[]; paragraph: Range[] } {
  const exact: Range[] = [];
  const paragraph: Range[] = [];
  if (!options || options.readingSide !== 'translated' || article.dataset.readingSide !== 'translated') {
    for (const bookmark of bookmarks) exact.push(...(bookmarkDomRanges(article, bookmark.anchor) ?? []));
    return { exact, paragraph };
  }

  const context = translationContext(options.document, options.translation);
  const blocks = new Map<string, HTMLElement>();
  for (const element of article.querySelectorAll<HTMLElement>('[data-block-id]')) {
    if (element.dataset.blockId) blocks.set(element.dataset.blockId, element);
  }

  for (const bookmark of bookmarks) {
    const anchor = bookmark.anchor;
    if (anchor.image) continue;
    const segments = bookmarkSegments(anchor);
    if (segments.some(segment => segment.translation)) {
      if (isCurrentTranslation(anchor, options.translation)) exact.push(...(bookmarkDomRanges(article, anchor) ?? []));
      continue;
    }
    if (!context) continue;

    const parts = blockParts(anchor, context);
    if (!parts) continue;
    const ranges: Array<{ range: Range; full: boolean }> = [];
    let mapped = true;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const element = blocks.get(segment.blockId);
      const part = parts[index];
      if (!element || !part) { mapped = false; break; }
      const range = spanRange(article, element);
      if (range.collapsed) { mapped = false; break; }
      ranges.push({ range, full: part.full });
    }
    if (!mapped) continue;
    for (const { range, full } of ranges) (full ? exact : paragraph).push(range);
  }
  return { exact, paragraph };
}

/** Used by unit tests and callers that only need the block map. */
export function translatedBookmarkBlocks(
  document: DocumentSnapshot,
  translation?: WebTranslationState,
): Map<string, string> | null {
  return translationContext(document, translation)?.translated ?? null;
}
