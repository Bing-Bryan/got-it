import type { ReadingBookmark } from './bookmark-types';
import type { DocumentSnapshot } from '../types';
import type { WebTranslationState } from './web-translation';
import { collectBookmarkHighlights } from './translated-bookmarks';

export interface BookmarkHighlightOptions {
  document: DocumentSnapshot;
  translation?: WebTranslationState;
  readingSide: 'original' | 'translated';
}

/** Custom highlights decorate ranges without extracting/wrapping any document text. */
export function applyBookmarkHighlights(
  article: HTMLElement,
  bookmarks: ReadingBookmark[],
  options?: BookmarkHighlightOptions,
): () => void {
  const css = globalThis.CSS as typeof CSS & { highlights?: Map<string, Highlight> };
  if (!css?.highlights || typeof Highlight === 'undefined') return () => {};

  const { exact, paragraph } = collectBookmarkHighlights(article, bookmarks, options);
  const exactHighlight = exact.length ? new Highlight(...exact) : null;
  const paragraphHighlight = paragraph.length ? new Highlight(...paragraph) : null;
  if (exactHighlight) css.highlights.set('got-it-bookmarks', exactHighlight);
  else css.highlights.delete('got-it-bookmarks');
  if (paragraphHighlight) css.highlights.set('got-it-bookmarks-block', paragraphHighlight);
  else css.highlights.delete('got-it-bookmarks-block');

  return () => {
    if (exactHighlight && css.highlights?.get('got-it-bookmarks') === exactHighlight) css.highlights.delete('got-it-bookmarks');
    if (paragraphHighlight && css.highlights?.get('got-it-bookmarks-block') === paragraphHighlight) css.highlights.delete('got-it-bookmarks-block');
  };
}
