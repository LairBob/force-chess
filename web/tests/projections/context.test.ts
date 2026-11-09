import { describe, expect, it } from "vitest";
import { ALL_SQUARES, FILES, RANKS } from "../../src/contract/index.ts";
import { boardLayout, type Orientation } from "../../src/projections/context.ts";
import { boardScene } from "../../src/projections/raw-values.ts";
import type { InteractionContext } from "../../src/projections/context.ts";
import { snapshot } from "../snapshots.ts";

const starting = snapshot("starting-position");

const context = (overrides: Partial<InteractionContext> = {}): InteractionContext => ({
  layer: "L0",
  selected: null,
  hovered: null,
  sideToMove: "white",
  orientation: "white",
  ...overrides,
});

describe("board layout by orientation", () => {
  it("puts white at the bottom: a8 top left, h1 bottom right, files a to h, ranks 8 down to 1", () => {
    const layout = boardLayout("white");
    expect(layout.rows[0]?.[0]).toBe("a8");
    expect(layout.rows[0]?.[7]).toBe("h8");
    expect(layout.rows[7]?.[0]).toBe("a1");
    expect(layout.rows[7]?.[7]).toBe("h1");
    expect(layout.files).toEqual([...FILES]);
    expect(layout.ranks).toEqual([...RANKS].reverse());
  });

  it("puts black at the bottom: h1 top left, a8 bottom right, files h to a, ranks 1 down to 8", () => {
    const layout = boardLayout("black");
    expect(layout.rows[0]?.[0]).toBe("h1");
    expect(layout.rows[0]?.[7]).toBe("a1");
    expect(layout.rows[7]?.[0]).toBe("h8");
    expect(layout.rows[7]?.[7]).toBe("a8");
    expect(layout.files).toEqual([...FILES].reverse());
    expect(layout.ranks).toEqual([...RANKS]);
  });

  it("draws every square exactly once in either orientation", () => {
    for (const orientation of ["white", "black"] as const satisfies readonly Orientation[]) {
      const layout = boardLayout(orientation);
      expect(layout.rows).toHaveLength(8);
      for (const row of layout.rows) expect(row).toHaveLength(8);
      const drawn = layout.rows.flat();
      expect(new Set(drawn).size).toBe(64);
      expect([...drawn].sort()).toEqual([...ALL_SQUARES].sort());
    }
  });

  it("flipping reverses the drawing order of the squares", () => {
    expect(boardLayout("black").rows.flat()).toEqual([...boardLayout("white").rows.flat()].reverse());
  });
});

describe("the board scene under each orientation", () => {
  const white = boardScene(starting, context({ selected: "e2", hovered: "d7" }));
  const black = boardScene(starting, context({ selected: "e2", hovered: "d7", orientation: "black" }));

  it("follows the layout's drawing order and carries its edge labels", () => {
    expect(white.squares.map((s) => s.square)).toEqual(boardLayout("white").rows.flat());
    expect(black.squares.map((s) => s.square)).toEqual(boardLayout("black").rows.flat());
    expect(white.files).toEqual(boardLayout("white").files);
    expect(black.files).toEqual(boardLayout("black").files);
    expect(white.ranks).toEqual(boardLayout("white").ranks);
    expect(black.ranks).toEqual(boardLayout("black").ranks);
  });

  it("gives every square the same marks, shade, selection and hover either way round", () => {
    const bySquare = (scene: typeof white) => new Map(scene.squares.map((s) => [s.square, s]));
    const fromWhite = bySquare(white);
    const fromBlack = bySquare(black);
    for (const square of ALL_SQUARES) {
      expect(fromBlack.get(square)).toEqual(fromWhite.get(square));
    }
    expect(fromBlack.get("e2")?.selected).toBe(true);
    expect(fromBlack.get("d7")?.hovered).toBe(true);
    expect(fromBlack.get("e2")?.tallies).toEqual([{ meaning: "defence", count: 4 }]);
    expect(fromBlack.get("a1")?.shade).toBe("dark");
    expect(fromBlack.get("h1")?.shade).toBe("light");
  });
});
