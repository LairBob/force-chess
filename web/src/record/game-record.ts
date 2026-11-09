// The game record (concept section 6): an ordered list of configurations
// connected by moves, with a cursor. Pure data and pure operations; no force
// state is stored here (it is derived from each configuration by its key),
// and nothing is imported from the DOM.
//
// Configurations are held as full FENs because the side to move, which the
// force state deliberately leaves out, is what the record carries between
// positions (concept section 3).

import type { Color, Promotion, Square } from "../contract/index.ts";

export interface GameMove {
  readonly from: Square;
  readonly to: Square;
  readonly promotion: Promotion | null;
}

export interface GameRecord {
  /** positions[i] is the configuration before moves[i]; one more position than moves. */
  readonly positions: readonly string[];
  readonly moves: readonly GameMove[];
  /** Index into positions of the configuration currently shown. */
  readonly cursor: number;
}

export function recordFromFen(fen: string): GameRecord {
  return { positions: [fen], moves: [], cursor: 0 };
}

export function currentFen(record: GameRecord): string {
  const fen = record.positions[record.cursor];
  if (fen === undefined) {
    throw new Error(`The record has no position at index ${record.cursor}.`);
  }
  return fen;
}

/**
 * Appends a move played from the current position, discarding any moves that
 * followed it, and moves the cursor onto the resulting position. The caller
 * supplies the FEN after the move; the record does not know the rules.
 */
export function play(record: GameRecord, move: GameMove, resultingFen: string): GameRecord {
  const positions = [...record.positions.slice(0, record.cursor + 1), resultingFen];
  const moves = [...record.moves.slice(0, record.cursor), move];
  return { positions, moves, cursor: record.cursor + 1 };
}

export function first(record: GameRecord): GameRecord {
  return jump(record, 0);
}

export function previous(record: GameRecord): GameRecord {
  return jump(record, record.cursor - 1);
}

export function next(record: GameRecord): GameRecord {
  return jump(record, record.cursor + 1);
}

export function last(record: GameRecord): GameRecord {
  return jump(record, record.positions.length - 1);
}

/** Moves the cursor to `index`, clamped to the positions that exist. */
export function jump(record: GameRecord, index: number): GameRecord {
  const cursor = Math.min(Math.max(index, 0), record.positions.length - 1);
  return cursor === record.cursor ? record : { ...record, cursor };
}

export function canGoBack(record: GameRecord): boolean {
  return record.cursor > 0;
}

export function canGoForward(record: GameRecord): boolean {
  return record.cursor < record.positions.length - 1;
}

/**
 * Whose move it is, read from the second field of a FEN. Missing or
 * unrecognised, white is assumed, as every chess tool does.
 */
export function sideToMove(fen: string): Color {
  const field = fen.trim().split(/\s+/)[1];
  return field === "b" ? "black" : "white";
}

/** The number shown beside a move in a move list: 1 for white's first move and black's reply. */
export function moveNumber(record: GameRecord, index: number): number {
  const startingSide = sideToMove(record.positions[0] ?? "");
  const offset = startingSide === "black" ? 1 : 0;
  return Math.floor((index + offset) / 2) + 1;
}
