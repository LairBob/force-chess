import { describe, expect, it } from "vitest";
import { piecePanel, squarePanel } from "../../src/projections/panels.ts";
import type { PanelScene } from "../../src/projections/scene.ts";
import { snapshot } from "../snapshots.ts";

const starting = snapshot("starting-position");
const pinned = snapshot("pin-along-file");
const battery = snapshot("queen-bishop-battery");
const check = snapshot("through-enemy-king");

function section(panel: PanelScene | null, title: string) {
  const found = panel?.sections.find((s) => s.title.startsWith(title));
  if (!found) throw new Error(`No section starting with "${title}" in ${panel?.title}`);
  return found;
}

function pair(panel: PanelScene | null, sectionTitle: string, label: string): string {
  const found = section(panel, sectionTitle).pairs?.find((p) => p.label === label);
  if (!found) throw new Error(`No pair "${label}" in ${sectionTitle}`);
  return found.value;
}

describe("piece panel", () => {
  it("is empty for an empty square", () => {
    expect(piecePanel(starting, "e4")).toBeNull();
  });

  it("names the piece and its figures in plain words", () => {
    const panel = piecePanel(starting, "e2");
    expect(panel?.title).toBe("White pawn on e2");
    expect(pair(panel, "At a glance", "Mobility (squares it can move to)")).toBe("2");
    expect(pair(panel, "At a glance", "Legal moves")).toBe("2");
    expect(pair(panel, "At a glance", "Material value")).toBe("1");
    expect(pair(panel, "Defended by", "Defenses at L0")).toBe("4");
    expect(pair(panel, "Defended by", "Defenses at L1")).toBe("4");
    expect(pair(panel, "Threatened by", "Threats at L0")).toBe("0");
    expect(section(panel, "Defended by").items?.map((i) => i.text)).toEqual([
      "White queen on d1 (direct)",
      "White king on e1 (direct)",
      "White bishop on f1 (direct)",
      "White knight on g1 (direct)",
      "White knight on b1 after it moves to c3",
    ]);
    expect(section(panel, "Constraints").items).toEqual([]);
    expect(section(panel, "Constraints").empty).toMatch(/not pinned/);
  });

  it("spells out a pin, the exclusions it causes, and the no-legal-moves reason", () => {
    const panel = piecePanel(pinned, "e3");
    const constraints = section(panel, "Constraints").items ?? [];
    expect(constraints[0]?.text).toBe("Pinned by the black rook on e8 against its king on e1.");
    expect(constraints[0]?.detail).toContain("e8, e7, e6, e5, e4, e3, e2, e1");
    expect(constraints[1]?.text).toBe("No legal moves (pinned).");
    expect(constraints[1]?.detail).toBe(pinned.pieces["e3"]?.constraints.noLegalMoves?.text);
    const defends = section(panel, "Defends").items ?? [];
    expect(defends[0]?.text).toBe("White pawn on d5 (direct)");
    expect(defends[0]?.tone).toBe("excluded");
    expect(defends[0]?.detail).toMatch(/^Excluded at L1: .*e8/);
    expect(pair(panel, "Defends", "Excluded at L1")).toBe("1");
    expect(pair(panel, "Attacks", "Legal at L1")).toBe("0");
    expect(section(panel, "Legal moves").items).toEqual([]);
  });

  it("lists legal moves with what the piece would reach after each", () => {
    const panel = piecePanel(starting, "g1");
    const moves = section(panel, "Legal moves").items ?? [];
    expect(moves.map((m) => m.text)).toEqual(["To f3", "To h3"]);
    expect(moves[0]?.detail).toContain("e5");
    expect(moves[0]?.detail).toContain("d4");
  });

  it("reports special moves with the document's reason", () => {
    const panel = piecePanel(starting, "e1");
    const special = section(panel, "Special moves").items ?? [];
    expect(special[0]?.text).toBe("Castling kingside: not available (would go to g1).");
    expect(special[0]?.detail).toBe(starting.pieces["e1"]?.specialMoves.castleKingside?.reason?.text);
    expect(special[1]?.text).toBe("Castling queenside: not available (would go to c1).");
    const pawn = piecePanel(starting, "e2");
    expect(section(pawn, "Special moves").items?.map((i) => i.text)).toEqual([
      "En passant: not available.",
      "Promotion: not available.",
    ]);
  });

  it("describes batteries from both ends and routes through pieces", () => {
    const queen = piecePanel(battery, "b2");
    const relations = section(queen, "Pins, x-rays and batteries").items ?? [];
    expect(relations.map((r) => r.text)).toEqual([
      "Forms a battery behind the white bishop on c3, reaching d4, e5, f6, g7 through it.",
      "Is the front of a battery with the white bishop on c3 behind it, which reaches a1 through this piece.",
    ]);
    const attacks = section(queen, "Attacks").items ?? [];
    expect(attacks.find((a) => a.text.startsWith("Black pawn on g7"))?.text).toBe(
      "Black pawn on g7 (via c3, d4, e5, f6, battery through the white bishop on c3)",
    );
  });

  it("says a king is in check and why its squares are excluded", () => {
    const panel = piecePanel(check, "e4");
    const constraints = section(panel, "Constraints").items ?? [];
    expect(constraints[0]?.text).toBe("In check from the black rook on e8.");
    expect(pair(panel, "At a glance", "White's status if it held the move")).toBe("check");
    const attacks = section(panel, "Attacks").items ?? [];
    const e3 = attacks.find((a) => a.text.startsWith("The empty square e3"));
    expect(e3?.tone).toBe("excluded");
    expect(e3?.detail).toContain("e8");
  });
});

describe("square panel", () => {
  it("reports nothing for a square the document leaves out", () => {
    const panel = squarePanel(pinned, "h2");
    expect(panel.title).toBe("Square h2");
    expect(pair(panel, "At a glance", "Occupant")).toBe("none");
    expect(section(panel, "Report").empty).toMatch(/^Nothing/);
  });

  it("reports control, valuation and who reaches an empty square at every layer", () => {
    const panel = squarePanel(starting, "f3");
    expect(pair(panel, "At a glance", "Control at L0")).toBe("white");
    expect(pair(panel, "Valuation", "White count at L0")).toBe("3");
    expect(pair(panel, "Valuation", "White value at L0")).toBe("5");
    expect(pair(panel, "Valuation", "Net value at L1 (white minus black)")).toBe("5");
    const white = section(panel, "White pieces reaching this square");
    expect(white.items?.map((i) => i.text)).toEqual([
      "White knight on g1 (direct)",
      "White pawn on e2 (direct)",
      "White pawn on g2 (direct)",
    ]);
    expect(pair(panel, "White pieces reaching this square", "White reach at L2")).toBe("0");
    expect(section(panel, "Black pieces reaching this square").items).toEqual([]);
  });

  it("reports threats and defenses of an occupied square", () => {
    const panel = squarePanel(battery, "g7");
    expect(pair(panel, "At a glance", "Occupant")).toBe("black pawn");
    expect(pair(panel, "Threats and defenses", "Threats at L0")).toBe("2");
    expect(pair(panel, "Threats and defenses", "Threat value at L0")).toBe("12");
    expect(pair(panel, "Threats and defenses", "Defenses at L0")).toBe("1");
    expect(pair(panel, "Threats and defenses", "Defenses at L1")).toBe("0");
    const black = section(panel, "Black pieces reaching this square").items ?? [];
    expect(black[0]?.text).toBe("Black king on g8 (direct)");
    expect(black[0]?.tone).toBe("excluded");
    expect(black[0]?.detail).toContain("c3");
  });

  it("lists lookahead reach in words", () => {
    const panel = squarePanel(starting, "e4");
    const white = section(panel, "White pieces reaching this square").items ?? [];
    expect(white.map((i) => i.text)).toEqual([
      "White knight on b1 after it moves to c3",
      "White pawn on d2 after it moves to d3",
      "White pawn on f2 after it moves to f3",
    ]);
  });
});
