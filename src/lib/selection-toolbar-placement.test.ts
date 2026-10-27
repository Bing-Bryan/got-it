import { describe, expect, it } from "vitest";
import {
  selectionToolbarPlacement,
  SELECTION_TOOLBAR_GAP,
  SELECTION_TOOLBAR_MARGIN,
} from "./selection-toolbar-placement";

const toolbar = { width: 510, height: 64 };
const viewport = { width: 1200, height: 900 };

describe("selection toolbar placement", () => {
  it("sits 12px below the selection when there is room", () => {
    const anchor = { top: 300, bottom: 340, left: 500, width: 140 };
    const placement = selectionToolbarPlacement(anchor, toolbar, viewport);
    expect(placement).toMatchObject({ top: 352, left: 570, side: "below" });
    expect(placement.top - anchor.bottom).toBe(SELECTION_TOOLBAR_GAP);
  });

  it("flips above with the same 12px gap when the lower edge is too close", () => {
    const anchor = { top: 800, bottom: 825, left: 500, width: 140 };
    const placement = selectionToolbarPlacement(anchor, toolbar, viewport);
    expect(placement.side).toBe("above");
    expect(placement.top).toBe(724);
    expect(anchor.top - (placement.top + toolbar.height)).toBe(SELECTION_TOOLBAR_GAP);
  });

  it("stays inside the viewport when neither side has enough room", () => {
    const tallToolbar = { width: 510, height: 500 };
    const placement = selectionToolbarPlacement(
      { top: 400, bottom: 860, left: 500, width: 140 },
      tallToolbar,
      viewport,
    );
    expect(placement.top).toBe(SELECTION_TOOLBAR_MARGIN);
    expect(placement.top + tallToolbar.height).toBeLessThanOrEqual(viewport.height - SELECTION_TOOLBAR_MARGIN);
    expect(["above", "below"]).toContain(placement.side);
  });

  it("keeps the centered toolbar within the horizontal margins on both edges", () => {
    expect(selectionToolbarPlacement({ top: 100, bottom: 120, left: 0, width: 20 }, toolbar, viewport).left).toBe(267);
    expect(selectionToolbarPlacement({ top: 100, bottom: 120, left: 1180, width: 20 }, toolbar, viewport).left).toBe(933);
  });
});
