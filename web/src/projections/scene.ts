// Scene descriptions (concept section 7): declarative data saying what to
// draw and what each drawn element means. The shell renders them; nothing
// here is a drawing call.

import type { Color, Control, PieceType, Square } from "../contract/index.ts";

/** One exact figure, shown as text: `Threats: 3`. */
export interface LabelValue {
  readonly label: string;
  readonly value: string;
}

/**
 * One row of tally marks (concept 7.1). `threat` and `defence` rows appear
 * on occupied squares, red and green; `white` and `black` rows appear on
 * empty squares in the side colours. One mark per unit, never scaled.
 */
export interface TallyRow {
  readonly meaning: "threat" | "defence" | "white" | "black";
  readonly count: number;
}

/** How far ahead the leading side is on a square under the control lens: 1 by one piece, 2 by two, 3 by three or more; 0 when no side leads. */
export type ControlStep = 0 | 1 | 2 | 3;

/**
 * The fill of one square under the control lens (concept section 7, "Control
 * heatmap"): the document's class, the leading side and the size of its lead
 * as a named step. Data, not a colour: the shell maps it to one.
 */
export interface ControlFill {
  /** The document's class: who reaches the square at this layer, counting pieces and ignoring the occupant. */
  readonly control: Control;
  /** The side with more pieces reaching the square, or null when the counts are equal or nothing reaches it. */
  readonly leader: Color | null;
  /** The lead's step: 1, 2 or 3 (three or more); 0 when there is no leader. */
  readonly step: ControlStep;
  /** The exact difference, white minus black, as the document reports it. */
  readonly net: number;
}

export interface SquareScene {
  readonly square: Square;
  readonly shade: "light" | "dark";
  readonly piece: { readonly color: Color; readonly type: PieceType } | null;
  readonly tallies: readonly TallyRow[];
  readonly selected: boolean;
  readonly hovered: boolean;
  /** A legal destination of the selected piece: a plain move or a capture. */
  readonly destination: "move" | "capture" | null;
  /** The piece here belongs to the side to move and can be picked up. */
  readonly movable: boolean;
  /** A king in check, as the document reports for its side. */
  readonly inCheck: boolean;
  /** The square's fill under the control lens; null under the raw values, and at L2, where the lens draws nothing. */
  readonly fill: ControlFill | null;
}

/** The exact figures of one square at one layer, for the readout strip under the board: a heading naming the square and its piece, then label-value pairs. */
export interface Readout {
  readonly square: Square;
  readonly heading: string;
  readonly pairs: readonly LabelValue[];
}

export interface BoardScene {
  /** The 64 squares in drawing order: the top row of the screen first, left to right, as the orientation places them. */
  readonly squares: readonly SquareScene[];
  /** The file letters along the bottom edge, left to right. */
  readonly files: readonly string[];
  /** The rank digits along the left edge, top to bottom. */
  readonly ranks: readonly string[];
  /** The figures of the hovered square, or of the selected square when nothing is hovered, or null. */
  readonly readout: Readout | null;
}

export interface PanelItem {
  readonly text: string;
  /** A second line: the plain-words reason, or what follows. */
  readonly detail?: string;
  /** Legal at L1, excluded at L1, reached only after a move (L2), or none of these. */
  readonly tone?: "legal" | "excluded" | "lookahead" | "plain";
}

export interface PanelSection {
  readonly title: string;
  readonly pairs?: readonly LabelValue[];
  readonly items?: readonly PanelItem[];
  /** Shown when the section has no pairs and no items. */
  readonly empty?: string;
}

export interface PanelScene {
  readonly title: string;
  readonly subtitle?: string;
  readonly sections: readonly PanelSection[];
}
