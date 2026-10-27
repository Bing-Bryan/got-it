import { describe, expect, it, vi } from 'vitest';
import { createInitialWorkspace } from '../sample';
import { webWorkspace } from '../test-support/web';
import { bookmarkQuote, type ReadingBookmark } from './bookmark-types';
import { applyBookmarkHighlights } from './bookmark-highlights';
import { documentTranslationSource } from './document-translation';
import { translatedRendering } from './translation-reading';
import {
  collectBookmarkHighlights,
  translatedBookmarkBlocks,
  translatedBookmarkDisplay,
  translatedBookmarkDisplays,
} from './translated-bookmarks';

const markdown = `# 标题

First full paragraph for the bookmark.

Second paragraph for another block.`;
const original = createInitialWorkspace();
original.document = {
  kind: 'markdown',
  id: 'translated-bookmark-doc',
  filename: 'safe.md',
  markdown,
  contentHash: 'safe-hash',
  importedAt: '2026',
  isDemo: false,
};
const sourceInfo = documentTranslationSource(original.document)!;
const units = Object.fromEntries(sourceInfo.source.units.map((unit, index) => [unit.id, `中文译文${index + 1}`]));
const translation = {
  version: 2 as const,
  id: 'translation-1',
  target: 'zh' as const,
  documentId: original.document.id,
  sourceVersion: sourceInfo.sourceVersion,
  status: 'complete' as const,
  modelConfig: { model: 'gpt-6-luna', reasoningEffort: 'medium' as const },
  units,
  updatedAt: '2026',
};
const workspace = { ...original, readingSide: 'translated' as const, webTranslation: translation };
const blocks = sourceInfo.source.blocks.filter(block => block.tag === 'p');
const first = blocks[0];
const second = blocks[1];

function bookmark(anchor: Partial<ReadingBookmark['anchor']> & Pick<ReadingBookmark['anchor'], 'blockId' | 'quote' | 'start' | 'end'>, id = 'bookmark-1'): ReadingBookmark {
  return {
    id,
    version: 1,
    createdAt: '2026-10-27',
    creationOperationId: 'operation-1',
    entryId: 'entry-1',
    revisionId: 'revision-1',
    documentId: original.document.id,
    contentVersion: 'safe-hash',
    sourceKind: 'markdown',
    sourceTitle: 'safe.md',
    anchor: {
      documentId: original.document.id,
      blockId: anchor.blockId,
      headingPath: [],
      quote: anchor.quote,
      prefix: '',
      suffix: '',
      start: anchor.start,
      end: anchor.end,
      matchStatus: 'matched',
      ...(anchor.translation ? { translation: anchor.translation } : {}),
      ...(anchor.segments ? { segments: anchor.segments } : {}),
    },
    excerpt: anchor.quote,
    contextBefore: '',
    contextAfter: '',
  } as ReadingBookmark;
}

function fullBookmark(id = 'bookmark-full'): ReadingBookmark {
  return bookmark({ blockId: first.id, quote: first.text, start: 0, end: first.text.length }, id);
}

describe('translated bookmark projection', () => {
  it('maps a full original block to the current Chinese block', () => {
    const display = translatedBookmarkDisplay(fullBookmark(), workspace.document, translation);
    expect(display.kind).toBe('paragraph');
    expect(display.full).toBe(true);
    expect(display.quote).toBe('中文译文2');
  });

  it('maps a partial original block to a paragraph-level display', () => {
    const part = first.text.slice(0, 6);
    const display = translatedBookmarkDisplay(bookmark({ blockId: first.id, quote: part, start: 0, end: part.length }), workspace.document, translation);
    expect(display.kind).toBe('paragraph');
    expect(display.full).toBe(false);
    expect(display.quote).toBe('中文译文2');
  });

  it('keeps an exact translated excerpt and marks stale translations', () => {
    const translated = translatedBookmarkBlocks(workspace.document, translation)!.get(first.id)!;
    const quote = translated.slice(0, 4);
    const exact = bookmark({
      blockId: first.id,
      quote: first.text,
      start: 0,
      end: first.text.length,
      translation: { version: 2 as const, translationId: translation.id, sourceVersion: translation.sourceVersion, blockId: first.id, quote, prefix: '', suffix: '', start: 0, end: quote.length },
    });
    expect(translatedBookmarkDisplay(exact, workspace.document, translation).kind).toBe('exact');
    expect(translatedBookmarkDisplay(exact, workspace.document, translation).quote).toBe(quote);
    const stale = bookmark({ ...exact.anchor, blockId: first.id, quote: first.text, start: 0, end: first.text.length, translation: { ...exact.anchor.translation!, translationId: 'old-translation' } });
    expect(translatedBookmarkDisplay(stale, workspace.document, translation).kind).toBe('stale');
  });

  it('falls back to the saved original when the translation is missing, incomplete or version-mismatched', () => {
    const saved = fullBookmark();
    expect(translatedBookmarkDisplay(saved, workspace.document, undefined).kind).toBe('original');
    expect(translatedBookmarkDisplay(saved, workspace.document, { ...translation, sourceVersion: 'stale-version' }).kind).toBe('original');
    const missingUnit = { ...translation, units: { ...translation.units } };
    for (const unit of sourceInfo.source.units) if (unit.blockId === first.id) delete missingUnit.units[unit.id];
    expect(translatedBookmarkDisplay(saved, workspace.document, missingUnit).kind).toBe('original');
  });

  it('joins multi-block bookmarks and marks them partial when any block is partial', () => {
    const segments = [
      { ...fullBookmark().anchor, blockId: first.id },
      { ...fullBookmark().anchor, blockId: second.id, quote: second.text.slice(0, 5), start: 0, end: 5 },
    ];
    const display = translatedBookmarkDisplay(bookmark({ ...segments[0], quote: `${first.text}\n${second.text.slice(0, 5)}`, start: 0, end: first.text.length + second.text.slice(0, 5).length, segments }), workspace.document, translation);
    expect(display.kind).toBe('paragraph');
    expect(display.full).toBe(false);
    expect(display.quote).toContain('\n');
  });

  it('keeps a multi-block translated bookmark exact instead of projecting whole paragraphs', () => {
    const blocksText = translatedBookmarkBlocks(workspace.document, translation)!;
    const segments = [first, second].map(block => {
      const translated = blocksText.get(block.id)!;
      return {
        documentId: workspace.document.id,
        blockId: block.id,
        headingPath: [],
        quote: block.text,
        prefix: '',
        suffix: '',
        start: 0,
        end: block.text.length,
        matchStatus: 'matched' as const,
        translation: { version: 2 as const, translationId: translation.id, sourceVersion: translation.sourceVersion, blockId: block.id, quote: translated.slice(0, 4), prefix: '', suffix: '', start: 0, end: 4 },
      };
    });
    const { translation: _firstTranslation, ...firstSegment } = segments[0];
    const combined = segments.map(segment => segment.quote).join('\n');
    const multi = bookmark({ ...firstSegment, quote: combined, start: 0, end: combined.length, segments }, 'multi-translated');
    const display = translatedBookmarkDisplay(multi, workspace.document, translation);
    expect(display.kind).toBe('exact');
    expect(display.full).toBe(false);
    expect(display.quote).toBe(segments.map(segment => segment.translation.quote).join('\n'));

    const article = document.createElement('article');
    article.innerHTML = translatedRendering(workspace).html;
    article.dataset.readingSide = 'translated';
    article.dataset.translationId = translation.id;
    article.dataset.translationVersion = '2';
    const ranges = collectBookmarkHighlights(article, [multi], {
      document: workspace.document,
      translation,
      readingSide: 'translated',
    });
    expect(ranges.exact).toHaveLength(2);
    expect(ranges.exact.map(range => range.toString()).join('\n')).toContain('中文译文');
    expect(ranges.paragraph).toHaveLength(0);
  });

  it('marks old-revision rows as fallback instead of claiming a current projection', () => {
    const oldOriginal = { ...fullBookmark('old-original'), revisionId: 'old-revision' };
    const oldTranslatedBase = fullBookmark('old-translated');
    const oldTranslated = {
      ...oldTranslatedBase,
      revisionId: 'old-revision',
      anchor: {
        ...oldTranslatedBase.anchor,
        translation: { version: 2 as const, translationId: 'old-translation', sourceVersion: translation.sourceVersion, blockId: first.id, quote: '旧中文', prefix: '', suffix: '', start: 0, end: 3 },
      },
    };
    const displays = translatedBookmarkDisplays([oldOriginal, oldTranslated], workspace.document, translation, 'current-revision');
    expect(displays.get('old-original')?.kind).toBe('original');
    expect(displays.get('old-translated')?.kind).toBe('stale');
    expect(displays.get('old-translated')?.quote).toBe('旧中文');
  });

  it('collects exact and paragraph ranges without touching the article DOM', () => {
    const view = translatedRendering(workspace);
    const article = document.createElement('article');
    article.innerHTML = view.html;
    article.dataset.readingSide = 'translated';
    article.dataset.translationId = translation.id;
    article.dataset.translationVersion = '2';
    const before = article.innerHTML;
    const partialQuote = first.text.slice(0, 6);
    const partial = bookmark({ blockId: first.id, quote: partialQuote, start: 0, end: partialQuote.length }, 'partial');
    const ranges = collectBookmarkHighlights(article, [fullBookmark(), partial], {
      document: workspace.document,
      translation,
      readingSide: 'translated',
    });
    expect(ranges.exact).toHaveLength(1);
    expect(ranges.paragraph).toHaveLength(1);
    expect(article.innerHTML).toBe(before);
    expect(bookmarkQuote(partial.anchor)).toBe(partialQuote);
    expect(article.querySelector('[data-block-id]')).not.toBeNull();
  });


  it('projects bookmarks in a translated web document', () => {
    const web = webWorkspace();
    web.document.markdown = '# 静态文章\n\nFirst English paragraph for the bookmark.';
    const info = documentTranslationSource(web.document)!;
    const webTranslation = {
      version: 2 as const,
      id: 'web-translation-test',
      target: 'zh' as const,
      documentId: web.document.id,
      sourceVersion: info.sourceVersion,
      status: 'complete' as const,
      modelConfig: { model: 'gpt-6-luna', reasoningEffort: 'medium' as const },
      units: Object.fromEntries(info.source.units.map(unit => [unit.id, '中文网页段落'])),
      updatedAt: '2026',
    };
    const block = info.source.blocks.find(item => item.text.includes('First English paragraph'))!;
    const bookmark: ReadingBookmark = {
      id: 'web-bookmark', version: 1, createdAt: '2026', creationOperationId: 'web-operation',
      entryId: 'web-entry', revisionId: 'web-revision', documentId: web.document.id,
      contentVersion: 'web-hash', sourceKind: 'web', sourceTitle: '静态文章',
      anchor: { documentId: web.document.id, blockId: block.id, headingPath: [], quote: block.text, prefix: '', suffix: '', start: 0, end: block.text.length, matchStatus: 'matched' },
      excerpt: block.text, contextBefore: '', contextAfter: '',
    };
    const display = translatedBookmarkDisplay(bookmark, web.document, webTranslation);
    expect(display.kind).toBe('paragraph');
    expect(display.full).toBe(true);
    expect(display.quote).toBe('中文网页段落');
  });

  it('registers solid and dashed highlight ranges and degrades without the API', () => {
    const view = translatedRendering(workspace);
    const article = document.createElement('article');
    article.innerHTML = view.html;
    article.dataset.readingSide = 'translated';
    article.dataset.translationId = translation.id;
    article.dataset.translationVersion = '2';
    const partialQuote = first.text.slice(0, 6);
    const partial = bookmark({ blockId: first.id, quote: partialQuote, start: 0, end: partialQuote.length }, 'partial');
    const registry = new Map<string, { ranges: Range[] }>();
    vi.stubGlobal('CSS', { highlights: registry });
    vi.stubGlobal('Highlight', class {
      ranges: Range[];
      constructor(...ranges: Range[]) { this.ranges = ranges; }
    });
    try {
      const cleanup = applyBookmarkHighlights(article, [fullBookmark(), partial], {
        document: workspace.document,
        translation,
        readingSide: 'translated',
      });
      expect(registry.get('got-it-bookmarks')?.ranges).toHaveLength(1);
      expect(registry.get('got-it-bookmarks-block')?.ranges).toHaveLength(1);
      cleanup();
      expect(registry.size).toBe(0);
      vi.stubGlobal('CSS', { highlights: null });
      const degraded = applyBookmarkHighlights(article, [fullBookmark()], {
        document: workspace.document,
        translation,
        readingSide: 'translated',
      });
      expect(typeof degraded).toBe('function');
      degraded();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
