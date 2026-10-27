export interface SelectionToolbarAnchor {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface SelectionToolbarSize {
  width: number;
  height: number;
}

export interface SelectionToolbarViewport {
  width: number;
  height: number;
}

export type SelectionToolbarSide = "below" | "above";

export const SELECTION_TOOLBAR_GAP = 12;
export const SELECTION_TOOLBAR_MARGIN = 12;

/**
 * Keeps the selection toolbar beside the selected text: below with a 12px gap
 * whenever it fits, otherwise above with the same gap. The toolbar is centered
 * on the selection but never leaves the viewport.
 */
export function selectionToolbarPlacement(
  anchor: SelectionToolbarAnchor,
  size: SelectionToolbarSize,
  viewport: SelectionToolbarViewport,
) {
  const minTop = SELECTION_TOOLBAR_MARGIN;
  const maxTop = Math.max(minTop, viewport.height - SELECTION_TOOLBAR_MARGIN - size.height);
  const below = anchor.bottom + SELECTION_TOOLBAR_GAP;
  const above = anchor.top - SELECTION_TOOLBAR_GAP - size.height;

  let top: number;
  let side: SelectionToolbarSide;
  if (below <= maxTop) {
    top = below;
    side = "below";
  } else if (above >= minTop) {
    top = above;
    side = "above";
  } else {
    // Both sides are too tight. Prefer the side with more room, while still
    // keeping the toolbar reachable inside the viewport.
    const roomBelow = viewport.height - SELECTION_TOOLBAR_MARGIN - below;
    const roomAbove = anchor.top - SELECTION_TOOLBAR_GAP - minTop;
    side = roomAbove > roomBelow ? "above" : "below";
    top = side === "above" ? above : below;
  }
  top = Math.max(minTop, Math.min(maxTop, top));

  const halfWidth = size.width / 2;
  const center = anchor.left + anchor.width / 2;
  const minCenter = SELECTION_TOOLBAR_MARGIN + halfWidth;
  const maxCenter = viewport.width - SELECTION_TOOLBAR_MARGIN - halfWidth;
  const left = minCenter <= maxCenter ? Math.max(minCenter, Math.min(maxCenter, center)) : viewport.width / 2;

  return { left, top, side };
}
