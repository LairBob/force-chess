// Interaction context (concept 4.4): transient shell state handed to a
// projection as an input. Never part of the force state.

import type { Color, Layer, Square } from "../contract/index.ts";
import { FILES, RANKS } from "../contract/index.ts";

/** Which side's pieces start nearest the viewer: the side drawn at the bottom of the screen. */
export type Orientation = Color;

export interface InteractionContext {
  /** The layer the raw-values projection tallies. */
  readonly layer: Layer;
  /** The square whose piece and square panels are shown, or null. */
  readonly selected: Square | null;
  /** The square under the pointer, or null. */
  readonly hovered: Square | null;
  /** Whose move it is, from the game record. Selects which pieces can be moved; nothing else. */
  readonly sideToMove: Color;
  /** The side at the bottom of the screen. A viewing choice: it changes where a square is drawn and nothing about it. */
  readonly orientation: Orientation;
}

/** Where each square is drawn for one orientation, and the labels on the edges. */
export interface BoardLayout {
  readonly orientation: Orientation;
  /** Eight rows from the top of the screen down, each eight squares from left to right. */
  readonly rows: readonly (readonly Square[])[];
  /** The file letters along the bottom edge, left to right. */
  readonly files: readonly string[];
  /** The rank digits along the left edge, top to bottom. */
  readonly ranks: readonly string[];
}

/**
 * The screen order of the squares. With white at the bottom a8 is top left
 * and h1 bottom right; with black at the bottom the board is turned half a
 * turn, so h1 is top left and a8 bottom right. Every square is drawn exactly
 * once either way.
 */
export function boardLayout(orientation: Orientation): BoardLayout {
  const files = orientation === "white" ? [...FILES] : [...FILES].reverse();
  const ranks = orientation === "white" ? [...RANKS].reverse() : [...RANKS];
  const rows = ranks.map((rank) => files.map((file) => `${file}${rank}`));
  return { orientation, rows, files, ranks };
}
