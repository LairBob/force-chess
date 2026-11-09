// The raw-values projection (concept 7.1): one tally mark per unit on every
// square that has something to report, and the exact figures as label-value
// pairs on hover. No scaling, no thresholds, no interpretation. This
// projection is built first and is never removed.
//
// Everything here is a lookup in the document: a count is the length of an
// index list, a value is a number the document already holds.

import type { Color, ForceState, Layer, Promotion, Square, SquareRecord } from "../contract/index.ts";
import { FILES, RANKS } from "../contract/index.ts";
import { boardLayout, type InteractionContext } from "./context.ts";
import type { BoardScene, LabelValue, Readout, SquareScene, TallyRow } from "./scene.ts";
import { capitalise, otherSide } from "./words.ts";

/**
 * How many pieces of one colour reach a square at a layer. L0 and L1 are
 * edge counts; L2 counts distinct pieces among the lookahead entries, as the
 * schema says a reader does.
 */
export function reachCount(
  state: ForceState,
  record: SquareRecord,
  color: Color,
  layer: Layer,
): number {
  const by = record.attackers[color];
  switch (layer) {
    case "L0":
      return by.L0.length;
    case "L1":
      return by.L1.legal.length;
    case "L2":
      return new Set(by.L2.map((index) => state.relations.lookaheads[index]?.piece)).size;
  }
}

/** The tally rows for one square at one layer; empty when there is nothing to report. */
export function tallies(state: ForceState, square: Square, layer: Layer): TallyRow[] {
  const record = state.squares[square];
  if (!record) return [];
  const white = reachCount(state, record, "white", layer);
  const black = reachCount(state, record, "black", layer);
  const rows: TallyRow[] = [];
  if (record.occupant) {
    const enemy = otherSide(record.occupant.color);
    const threats = enemy === "white" ? white : black;
    const defences = enemy === "white" ? black : white;
    if (threats > 0) rows.push({ meaning: "threat", count: threats });
    if (defences > 0) rows.push({ meaning: "defence", count: defences });
  } else {
    if (white > 0) rows.push({ meaning: "white", count: white });
    if (black > 0) rows.push({ meaning: "black", count: black });
  }
  return rows;
}

/** What the readout says about a square: the piece on it in words, or null, and the figures at the layer. */
function figures(state: ForceState, square: Square, layer: Layer): { piece: string | null; pairs: LabelValue[] } {
  const record = state.squares[square];
  const pairs: LabelValue[] = [];
  if (!record) {
    pairs.push({ label: "Report", value: "nothing: empty and reached by no piece" });
    return { piece: null, pairs };
  }
  const valuation = layer === "L2" ? null : record.valuation[layer];
  let piece: string | null = null;
  if (record.occupant) {
    const enemy = otherSide(record.occupant.color);
    const friendly = record.occupant.color;
    piece = `${friendly} ${record.occupant.type}`;
    pairs.push({ label: `Threats at ${layer}`, value: String(reachCount(state, record, enemy, layer)) });
    if (valuation) pairs.push({ label: `Threat value at ${layer}`, value: String(valuation[enemy].value) });
    pairs.push({ label: `Defenses at ${layer}`, value: String(reachCount(state, record, friendly, layer)) });
    if (valuation) pairs.push({ label: `Defense value at ${layer}`, value: String(valuation[friendly].value) });
  } else {
    pairs.push({ label: `White reach at ${layer}`, value: String(reachCount(state, record, "white", layer)) });
    if (valuation) pairs.push({ label: `White value at ${layer}`, value: String(valuation.white.value) });
    pairs.push({ label: `Black reach at ${layer}`, value: String(reachCount(state, record, "black", layer)) });
    if (valuation) pairs.push({ label: `Black value at ${layer}`, value: String(valuation.black.value) });
  }
  if (layer !== "L2") {
    pairs.push({ label: `Control at ${layer}`, value: record.control[layer] });
  }
  return { piece, pairs };
}

/** The exact figures behind the tallies, as label-value pairs, the square and its piece first. */
export function hoverFigures(state: ForceState, square: Square, layer: Layer): LabelValue[] {
  const { piece, pairs } = figures(state, square, layer);
  const head: LabelValue[] = [{ label: "Square", value: square }];
  if (state.squares[square]) head.push({ label: "Piece", value: piece ?? "none" });
  return [...head, ...pairs];
}

/** The readout strip's content for one square: "e2, white pawn" or "e4, empty", then the figures. */
export function readout(state: ForceState, square: Square, layer: Layer): Readout {
  const { piece, pairs } = figures(state, square, layer);
  return { square, heading: `${square}, ${piece ?? "empty"}`, pairs };
}

/** The legal destinations of the piece on `square`, read from its lookahead entries. */
export function destinations(
  state: ForceState,
  square: Square,
): Map<Square, "move" | "capture"> {
  const result = new Map<Square, "move" | "capture">();
  const piece = state.pieces[square];
  if (!piece) return result;
  for (const index of piece.lookaheads) {
    const entry = state.relations.lookaheads[index];
    if (!entry || entry.move.from !== square) continue;
    const kind = entry.move.kind === "capture" || entry.move.kind === "en_passant" ? "capture" : "move";
    result.set(entry.move.to, kind);
  }
  return result;
}

/** The whole board as a scene: tallies at the selected layer, plus the marks the interaction context asks for, in the drawing order the orientation gives. */
export function boardScene(state: ForceState, context: InteractionContext): BoardScene {
  const moves =
    context.selected !== null && state.pieces[context.selected]?.color === context.sideToMove
      ? destinations(state, context.selected)
      : new Map<Square, "move" | "capture">();
  const layout = boardLayout(context.orientation);
  const squares: SquareScene[] = [];
  for (const row of layout.rows) {
    for (const square of row) {
      // The shade belongs to the square, not to where it is drawn: a1 is dark from either side.
      const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number]);
      const rankIndex = RANKS.indexOf(square[1] as (typeof RANKS)[number]);
      const piece = state.pieces[square];
      squares.push({
        square,
        shade: (fileIndex + rankIndex) % 2 === 0 ? "dark" : "light",
        piece: piece ? { color: piece.color, type: piece.type } : null,
        tallies: tallies(state, square, context.layer),
        selected: context.selected === square,
        hovered: context.hovered === square,
        destination: moves.get(square) ?? null,
        movable: piece !== undefined && piece.color === context.sideToMove,
        inCheck: piece?.type === "king" && state.sides[piece.color].inCheck,
      });
    }
  }
  // The strip reads the square under the pointer; with the pointer away it keeps the selected square's figures.
  const readSquare = context.hovered ?? context.selected;
  return {
    squares,
    files: layout.files,
    ranks: layout.ranks,
    readout: readSquare === null ? null : readout(state, readSquare, context.layer),
  };
}

/** One line of the legend: the meaning of a mark, so the shell can draw the mark itself beside the words. */
export interface TallyLegendEntry extends LabelValue {
  readonly meaning: TallyRow["meaning"];
}

/** A one-line summary of what the tallies mean, for the legend. */
export function tallyLegend(): TallyLegendEntry[] {
  return [
    { meaning: "threat", label: "Red mark, pointing down", value: "one enemy piece reaching the piece on this square" },
    { meaning: "defence", label: "Green mark, pointing up", value: "one friendly piece reaching the piece on this square" },
    { meaning: "white", label: "White mark", value: "one white piece reaching this empty square" },
    { meaning: "black", label: "Black mark", value: "one black piece reaching this empty square" },
  ];
}

export { capitalise };

/** The pieces the pawn on `from` could become by moving to `to`, from its lookahead entries; empty when the move is not a promotion. */
export function promotionChoices(state: ForceState, from: Square, to: Square): Promotion[] {
  const piece = state.pieces[from];
  if (!piece) return [];
  const choices: Promotion[] = [];
  for (const index of piece.lookaheads) {
    const entry = state.relations.lookaheads[index];
    if (entry && entry.move.from === from && entry.move.to === to && entry.move.promotion) {
      choices.push(entry.move.promotion);
    }
  }
  return choices;
}
