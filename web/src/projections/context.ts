// Interaction context (concept 4.4): transient shell state handed to a
// projection as an input. Never part of the force state.

import type { Color, Layer, Square } from "../contract/index.ts";

export interface InteractionContext {
  /** The layer the raw-values projection tallies. */
  readonly layer: Layer;
  /** The square whose piece and square panels are shown, or null. */
  readonly selected: Square | null;
  /** The square under the pointer, or null. */
  readonly hovered: Square | null;
  /** Whose move it is, from the game record. Selects which pieces can be moved; nothing else. */
  readonly sideToMove: Color;
}
