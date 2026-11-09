// The control lens reads the document's control class and net count and
// names a fill from them. The fills are checked square by square against
// the reach counts the raw values show, because the raw values are the
// check on every designed lens (concept 7.1).

import { describe, expect, it } from "vitest";
import { ALL_SQUARES, type Color, type ForceState } from "../../src/contract/index.ts";
import type { InteractionContext } from "../../src/projections/context.ts";
import {
  controlFill,
  controlLegend,
  controlScene,
  controlSquarePanel,
  controlSummary,
  controlWords,
  type ControlLayer,
} from "../../src/projections/control.ts";
import { boardScene, reachCount, tallies } from "../../src/projections/raw-values.ts";
import { analysed, corpusFen } from "../core.ts";
import { snapshot } from "../snapshots.ts";

const starting = snapshot("starting-position");
const pinned = snapshot("pin-along-file");
// Kiwipete: a dense middlegame with every piece on, batteries, pins and a pawn on d5 that both sides reach.
const kiwipete = analysed(corpusFen("Kiwipete"));

const context = (overrides: Partial<InteractionContext> = {}): InteractionContext => ({
  layer: "L0",
  selected: null,
  hovered: null,
  sideToMove: "white",
  orientation: "white",
  ...overrides,
});

describe("the fill of a square", () => {
  it("names the class, the leader and a step bounded at three in the starting position", () => {
    // Twelve white pieces reach the squares of the first two ranks that one piece guards: by one.
    expect(controlFill(starting, "b1", "L0")).toEqual({ control: "white", leader: "white", step: 1, net: 1 });
    // d3 is reached by two pawns: by two. f3 by three pieces: three or more. e2 by four: still three or more.
    expect(controlFill(starting, "d3", "L0")).toEqual({ control: "white", leader: "white", step: 2, net: 2 });
    expect(controlFill(starting, "f3", "L0")).toEqual({ control: "white", leader: "white", step: 3, net: 3 });
    expect(controlFill(starting, "e2", "L0")).toEqual({ control: "white", leader: "white", step: 3, net: 4 });
    // The black side mirrors it with a negative net.
    expect(controlFill(starting, "d6", "L0")).toEqual({ control: "black", leader: "black", step: 2, net: -2 });
    expect(controlFill(starting, "e7", "L1")).toEqual({ control: "black", leader: "black", step: 3, net: -4 });
    // Nobody reaches the middle of the board at L0.
    expect(controlFill(starting, "e4", "L0")).toEqual({ control: "none", leader: null, step: 0, net: 0 });
    expect(controlFill(starting, "a1", "L1")).toEqual({ control: "none", leader: null, step: 0, net: 0 });
  });

  it("is symmetric between the sides in the starting position", () => {
    for (const square of ALL_SQUARES) {
      const mirror = `${square[0]}${9 - Number(square[1])}`;
      const white = controlFill(starting, square, "L0");
      const black = controlFill(starting, mirror, "L0");
      expect(black.net + white.net).toBe(0);
      expect(black.step).toBe(white.step);
    }
  });

  it("follows the layer: a pinned knight's reach counts at L0 and not at L1", () => {
    // The knight on e3 is pinned by the rook on e8. At L0 it still defends the pawn on d5 and reaches c2.
    expect(controlFill(pinned, "d5", "L0")).toEqual({ control: "white", leader: "white", step: 1, net: 1 });
    expect(controlFill(pinned, "c2", "L0")).toEqual({ control: "white", leader: "white", step: 1, net: 1 });
    // At L1 every reach of the pinned knight is excluded, so both squares have no tint.
    expect(controlFill(pinned, "d5", "L1")).toEqual({ control: "none", leader: null, step: 0, net: 0 });
    expect(controlFill(pinned, "c2", "L1")).toEqual({ control: "none", leader: null, step: 0, net: 0 });
    // The king still reaches d1 and the knight too, so d1 is by two at L0 and by one at L1.
    expect(controlFill(pinned, "d1", "L0").step).toBe(2);
    expect(controlFill(pinned, "d1", "L1").step).toBe(1);
    // e6: the rook and the pawn on d5 both reach it, one each: contested and even.
    expect(controlFill(pinned, "e6", "L0")).toEqual({ control: "contested", leader: null, step: 0, net: 0 });
    expect(controlFill(pinned, "e6", "L1")).toEqual({ control: "contested", leader: null, step: 0, net: 0 });
    // f8: the rook and the king, black by two.
    expect(controlFill(pinned, "f8", "L1")).toEqual({ control: "black", leader: "black", step: 2, net: -2 });
    // A square the document has no record for has no tint.
    expect(pinned.squares["h2"]).toBeUndefined();
    expect(controlFill(pinned, "h2", "L0")).toEqual({ control: "none", leader: null, step: 0, net: 0 });
  });

  it("reads a contested middlegame: a leader on a contested square, and an even square", () => {
    // The white pawn on d5 is reached by the knights on b6 and f6 and the pawn on e6, and defended
    // by the pawn on e4 and the knight on c3: contested, black ahead by one.
    expect(controlFill(kiwipete, "d5", "L0")).toEqual({ control: "contested", leader: "black", step: 1, net: -1 });
    expect(controlFill(kiwipete, "d5", "L1")).toEqual({ control: "contested", leader: "black", step: 1, net: -1 });
    // The black pawn on d7: one white attacker against four black defenders at L0, three at L1.
    expect(controlFill(kiwipete, "d7", "L0")).toEqual({ control: "contested", leader: "black", step: 3, net: -3 });
    expect(controlFill(kiwipete, "d7", "L1")).toEqual({ control: "contested", leader: "black", step: 2, net: -2 });
    // The pawn on g2: the bishop on a6 cannot reach it, but the pawn on h3 does, as does the king: even.
    expect(controlFill(kiwipete, "g2", "L0")).toEqual({ control: "contested", leader: null, step: 0, net: 0 });
    // f1: at L0 the bishop on a6 reaches it along the diagonal through the bishop on e2, so the square is
    // contested; at L1 that line is blocked and the square is white's alone.
    expect(controlFill(kiwipete, "f1", "L0").control).toBe("contested");
    expect(controlFill(kiwipete, "f1", "L1")).toEqual({ control: "white", leader: "white", step: 3, net: 3 });
    // Five white pieces reach d1 at L0: the step is still the largest.
    expect(controlFill(kiwipete, "d1", "L0")).toEqual({ control: "white", leader: "white", step: 3, net: 5 });
    // The knight on e5 is reached by nobody: an occupied square with no tint.
    expect(controlFill(kiwipete, "e5", "L0")).toEqual({ control: "none", leader: null, step: 0, net: 0 });
  });
});

/** The reach of each side onto a square at a layer, as the raw marks count it. */
function reach(state: ForceState, square: string, layer: ControlLayer): Record<Color, number> {
  const record = state.squares[square];
  if (!record) return { white: 0, black: 0 };
  return { white: reachCount(state, record, "white", layer), black: reachCount(state, record, "black", layer) };
}

describe("every fill agrees with the raw values on the same square", () => {
  for (const [name, state] of [
    ["starting position", starting],
    ["pin along a file", pinned],
    ["Kiwipete", kiwipete],
  ] as const) {
    for (const layer of ["L0", "L1"] as const) {
      it(`${name} at ${layer}`, () => {
        for (const square of ALL_SQUARES) {
          const fill = controlFill(state, square, layer);
          const { white, black } = reach(state, square, layer);
          expect(fill.net, square).toBe(white - black);
          expect(fill.step, square).toBe(Math.min(3, Math.abs(white - black)));
          switch (fill.leader) {
            case "white":
              expect(white, square).toBeGreaterThan(black);
              break;
            case "black":
              expect(black, square).toBeGreaterThan(white);
              break;
            case null:
              expect(white, square).toBe(black);
          }
          switch (fill.control) {
            case "white":
              expect(black, square).toBe(0);
              expect(white, square).toBeGreaterThan(0);
              break;
            case "black":
              expect(white, square).toBe(0);
              expect(black, square).toBeGreaterThan(0);
              break;
            case "contested":
              expect(white, square).toBeGreaterThan(0);
              expect(black, square).toBeGreaterThan(0);
              break;
            case "none":
              expect(white + black, square).toBe(0);
          }
          // The marks the raw values draw on the square add up to the same counts.
          const rows = tallies(state, square, layer);
          const occupant = state.squares[square]?.occupant;
          const marked: Record<Color, number> = { white: 0, black: 0 };
          for (const row of rows) {
            if (row.meaning === "white" || row.meaning === "black") marked[row.meaning] += row.count;
            else if (occupant) marked[row.meaning === "defence" ? occupant.color : occupant.color === "white" ? "black" : "white"] += row.count;
          }
          expect(marked, square).toEqual({ white, black });
        }
      });
    }
  }
});

describe("the fill in words", () => {
  it("says the class, the lead and the step in plain words", () => {
    expect(controlWords(controlFill(starting, "e2", "L0"))).toBe("White only, 4 pieces: white tint by three or more.");
    expect(controlWords(controlFill(starting, "b8", "L0"))).toBe("Black only, 1 piece: black tint by one.");
    expect(controlWords(controlFill(starting, "e4", "L0"))).toBe("No piece reaches this square: no tint.");
    expect(controlWords(controlFill(kiwipete, "d5", "L0"))).toBe("Contested, black ahead by 1 piece: black tint by one, hatched.");
    expect(controlWords(controlFill(kiwipete, "g2", "L0"))).toBe("Contested, even: as many black pieces as white reach it. Hatched, no tint.");
  });

  it("has a short form for the readout strip", () => {
    expect(controlSummary(controlFill(starting, "e2", "L0"))).toBe("white only, ahead by 4, tint by three or more");
    expect(controlSummary(controlFill(starting, "e4", "L0"))).toBe("nobody reaches it, no tint");
    expect(controlSummary(controlFill(kiwipete, "d5", "L0"))).toBe("contested, black ahead by 1, tint by one, hatched");
    expect(controlSummary(controlFill(kiwipete, "g2", "L0"))).toBe("contested, even, hatched, no tint");
  });
});

describe("the control scene", () => {
  it("is the raw-values scene with a fill on every square and the lens's words in the readout", () => {
    const raw = boardScene(kiwipete, context({ layer: "L1", hovered: "d5" }));
    const lens = controlScene(kiwipete, context({ layer: "L1", hovered: "d5" }));
    expect(lens.squares.map((s) => s.square)).toEqual(raw.squares.map((s) => s.square));
    for (const [index, square] of lens.squares.entries()) {
      expect({ ...square, fill: null }).toEqual(raw.squares[index]);
      expect(square.fill).toEqual(controlFill(kiwipete, square.square, "L1"));
    }
    expect(lens.readout?.pairs.slice(0, -1)).toEqual(raw.readout?.pairs);
    expect(lens.readout?.pairs.at(-1)).toEqual({
      label: "Lens at L1",
      value: "contested, black ahead by 1, tint by one, hatched",
    });
  });

  it("draws nothing at L2 and leaves the readout as the raw values give it", () => {
    const raw = boardScene(starting, context({ layer: "L2", hovered: "e4" }));
    const lens = controlScene(starting, context({ layer: "L2", hovered: "e4" }));
    expect(lens).toEqual(raw);
    expect(lens.squares.every((s) => s.fill === null)).toBe(true);
  });

  it("adds one section to the square panel with the lens's words at L0 and L1", () => {
    const panel = controlSquarePanel(kiwipete, "d7");
    const section = panel.sections.at(-1);
    expect(section?.title).toBe("Control lens");
    expect(section?.items).toEqual([
      { text: "At L0: Contested, black ahead by 3 pieces: black tint by three or more, hatched.", tone: "plain" },
      { text: "At L1: Contested, black ahead by 2 pieces: black tint by two, hatched.", tone: "plain" },
    ]);
  });

  it("explains three steps per side and the hatching in the legend", () => {
    const legend = controlLegend();
    expect(legend.map((entry) => entry.label)).toEqual([
      "White tint, by one",
      "White tint, by two",
      "White tint, by three or more",
      "Black tint, by one",
      "Black tint, by two",
      "Black tint, by three or more",
      "Hatched",
    ]);
    expect(legend[0]?.value).toBe("one more white piece than black reaches this square");
    expect(legend[5]?.value).toBe("black pieces reaching this square outnumber white's by three or more");
  });
});
