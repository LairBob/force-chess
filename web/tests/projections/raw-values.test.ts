import { describe, expect, it } from "vitest";
import {
  boardScene,
  destinations,
  hoverFigures,
  reachCount,
  tallies,
} from "../../src/projections/raw-values.ts";
import type { InteractionContext } from "../../src/projections/context.ts";
import { snapshot } from "../snapshots.ts";

const starting = snapshot("starting-position");
const pinned = snapshot("pin-along-file");
const check = snapshot("through-enemy-king");

const context = (overrides: Partial<InteractionContext> = {}): InteractionContext => ({
  layer: "L0",
  selected: null,
  hovered: null,
  sideToMove: "white",
  ...overrides,
});

describe("tallies at L0 in the starting position", () => {
  it("shows side-coloured marks on empty squares pawns reach", () => {
    expect(tallies(starting, "d3", "L0")).toEqual([{ meaning: "white", count: 2 }]);
    expect(tallies(starting, "f3", "L0")).toEqual([{ meaning: "white", count: 3 }]);
    expect(tallies(starting, "d6", "L0")).toEqual([{ meaning: "black", count: 2 }]);
  });

  it("shows nothing on squares nobody reaches", () => {
    expect(tallies(starting, "e4", "L0")).toEqual([]);
    expect(tallies(starting, "d5", "L0")).toEqual([]);
    expect(tallies(starting, "a1", "L0")).toEqual([]);
  });

  it("shows one green mark per defender and no red marks on an unthreatened piece", () => {
    expect(tallies(starting, "e2", "L0")).toEqual([{ meaning: "defence", count: 4 }]);
    expect(tallies(starting, "b1", "L0")).toEqual([{ meaning: "defence", count: 1 }]);
  });
});

describe("tallies by layer", () => {
  it("drops an excluded defence at L1", () => {
    expect(tallies(pinned, "d5", "L0")).toEqual([{ meaning: "defence", count: 1 }]);
    expect(tallies(pinned, "d5", "L1")).toEqual([]);
  });

  it("counts distinct pieces at L2, not entries", () => {
    const record = starting.squares["g5"]!;
    expect(record.attackers.white.L2.length).toBe(4);
    expect(reachCount(starting, record, "white", "L2")).toBe(3);
    expect(tallies(starting, "e5", "L2")).toEqual([
      { meaning: "white", count: 3 },
      { meaning: "black", count: 3 },
    ]);
    expect(tallies(starting, "e4", "L2")).toEqual([
      { meaning: "white", count: 3 },
      { meaning: "black", count: 3 },
    ]);
  });

  it("puts red before green on a threatened and defended piece", () => {
    expect(tallies(snapshot("queen-bishop-battery"), "g7", "L0")).toEqual([
      { meaning: "threat", count: 2 },
      { meaning: "defence", count: 1 },
    ]);
    expect(tallies(snapshot("queen-bishop-battery"), "g7", "L1")).toEqual([
      { meaning: "threat", count: 2 },
    ]);
  });
});

describe("hover figures", () => {
  it("reports the exact counts, values and control of an occupied square", () => {
    expect(hoverFigures(starting, "e2", "L0")).toEqual([
      { label: "Square", value: "e2" },
      { label: "Piece", value: "white pawn" },
      { label: "Threats at L0", value: "0" },
      { label: "Threat value at L0", value: "0" },
      { label: "Defenses at L0", value: "4" },
      { label: "Defense value at L0", value: "15" },
      { label: "Control at L0", value: "white" },
    ]);
  });

  it("reports both sides' reach on an empty square and nothing on an unreported one", () => {
    expect(hoverFigures(starting, "f3", "L1")).toEqual([
      { label: "Square", value: "f3" },
      { label: "Piece", value: "none" },
      { label: "White reach at L1", value: "3" },
      { label: "White value at L1", value: "5" },
      { label: "Black reach at L1", value: "0" },
      { label: "Black value at L1", value: "0" },
      { label: "Control at L1", value: "white" },
    ]);
    expect(hoverFigures(starting, "a1", "L2").map((p) => p.label)).toEqual([
      "Square",
      "Piece",
      "Threats at L2",
      "Defenses at L2",
    ]);
    expect(hoverFigures(pinned, "h2", "L0")).toEqual([
      { label: "Square", value: "h2" },
      { label: "Report", value: "nothing: empty and reached by no piece" },
    ]);
  });
});

describe("board scene", () => {
  it("draws 64 squares from a8 to h1 with the right shades and pieces", () => {
    const scene = boardScene(starting, context());
    expect(scene.squares.length).toBe(64);
    expect(scene.squares[0]?.square).toBe("a8");
    expect(scene.squares[63]?.square).toBe("h1");
    expect(scene.squares.find((s) => s.square === "a1")?.shade).toBe("dark");
    expect(scene.squares.find((s) => s.square === "h1")?.shade).toBe("light");
    expect(scene.squares.find((s) => s.square === "e1")?.piece).toEqual({ color: "white", type: "king" });
    expect(scene.squares.find((s) => s.square === "e4")?.piece).toBeNull();
  });

  it("marks the selected piece's legal destinations only for the side to move", () => {
    const white = boardScene(starting, context({ selected: "b1" }));
    expect(white.squares.filter((s) => s.destination).map((s) => s.square)).toEqual(["a3", "c3"]);
    expect(white.squares.find((s) => s.square === "b1")?.selected).toBe(true);
    const black = boardScene(starting, context({ selected: "b1", sideToMove: "black" }));
    expect(black.squares.filter((s) => s.destination)).toEqual([]);
    expect(black.squares.find((s) => s.square === "b8")?.movable).toBe(true);
    expect(black.squares.find((s) => s.square === "b1")?.movable).toBe(false);
  });

  it("marks a capture destination and a king in check", () => {
    const moves = destinations(check, "e4");
    expect(moves.size).toBe(6);
    expect([...moves.values()].every((kind) => kind === "move")).toBe(true);
    const scene = boardScene(check, context());
    expect(scene.squares.find((s) => s.square === "e4")?.inCheck).toBe(true);
    expect(scene.squares.find((s) => s.square === "g8")?.inCheck).toBe(false);
    const battery = snapshot("queen-bishop-battery");
    expect(destinations(battery, "c3").get("g7")).toBe("capture");
    expect(destinations(battery, "c3").get("d4")).toBe("move");
  });

  it("attaches the hover figures to the hovered square and nowhere else", () => {
    const scene = boardScene(starting, context({ hovered: "e2", layer: "L1" }));
    const e2 = scene.squares.find((s) => s.square === "e2")!;
    expect(e2.hovered).toBe(true);
    expect(e2.hover?.find((p) => p.label === "Defenses at L1")?.value).toBe("4");
    expect(scene.squares.filter((s) => s.hover !== null).length).toBe(1);
  });

  it("tallies the selected layer", () => {
    const l0 = boardScene(pinned, context({ layer: "L0" }));
    const l1 = boardScene(pinned, context({ layer: "L1" }));
    expect(l0.squares.find((s) => s.square === "d5")?.tallies).toEqual([{ meaning: "defence", count: 1 }]);
    expect(l1.squares.find((s) => s.square === "d5")?.tallies).toEqual([]);
  });
});
