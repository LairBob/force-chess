// The control lens (concept section 7, "Control heatmap"): the first
// designed lens, drawn beside the raw values and never instead of them. Each
// square gets a fill read from two things the document already holds at L0
// and L1: the square's control class (white, black, contested, none) and the
// net attacker count, white minus black. The class is the primary reading;
// the strength of the fill is the size of the lead, bounded to three named
// steps. The scene names the fill as data (leader, step, class); the shell
// maps it to a colour.
//
// L2 has no control class and no valuation in the contract, so the lens
// draws nothing there and says so (docs/DECISIONS.md, 2026-11-09).

import type { ForceState, Layer, Square } from "../contract/index.ts";
import type { InteractionContext } from "./context.ts";
import type { BoardScene, ControlFill, ControlStep, LabelValue, PanelScene } from "./scene.ts";
import { boardScene } from "./raw-values.ts";
import { squarePanel } from "./panels.ts";

/** The layers the lens can read: those with a control class and a valuation in the document. */
export type ControlLayer = Exclude<Layer, "L2">;

/** The largest named step. A lead of this many pieces or more is drawn the same. */
export const LARGEST_STEP: ControlStep = 3;

/** The names of the three steps, in plain words, indexed by step. */
export const STEP_WORDS: Record<ControlStep, string> = {
  0: "no lead",
  1: "by one",
  2: "by two",
  3: "by three or more",
};

/** Why the lens draws nothing at L2. */
export const CONTROL_AT_L2 =
  "The control lens reads each square's control class and net count, which the document gives at L0 and L1 only. At L2 the board shows the raw marks and no tint.";

/** One sentence on what the lens shows, for the note under the selector. */
export const CONTROL_EXPLANATION =
  "Each square is tinted for the side with more pieces reaching it, deeper the larger the lead (by one, by two, by three or more). Hatching means both sides reach it. The marks stay on top as the exact count.";

function stepOf(net: number): ControlStep {
  const lead = Math.abs(net);
  return lead >= LARGEST_STEP ? LARGEST_STEP : (lead as ControlStep);
}

/** The fill of one square at L0 or L1, straight from the record. A square absent from the document has control none. */
export function controlFill(state: ForceState, square: Square, layer: ControlLayer): ControlFill {
  const record = state.squares[square];
  if (!record) return { control: "none", leader: null, step: 0, net: 0 };
  const net = record.valuation[layer].net.count;
  return {
    control: record.control[layer],
    leader: net > 0 ? "white" : net < 0 ? "black" : null,
    step: stepOf(net),
    net,
  };
}

/** The fill in words: "White, uncontested, ahead by 4 (tinted by three or more)". */
export function controlWords(fill: ControlFill): string {
  const lead = Math.abs(fill.net);
  const pieces = lead === 1 ? "1 piece" : `${lead} pieces`;
  switch (fill.control) {
    case "none":
      return "No piece reaches this square: no tint.";
    case "contested":
      if (fill.leader === null) return "Contested, even: as many black pieces as white reach it. Hatched, no tint.";
      return `Contested, ${fill.leader} ahead by ${pieces}: ${fill.leader} tint ${STEP_WORDS[fill.step]}, hatched.`;
    case "white":
    case "black":
      return `${fill.control === "white" ? "White" : "Black"} only, ${pieces}: ${fill.control} tint ${STEP_WORDS[fill.step]}.`;
  }
}

/** The fill in a few words for the readout strip: "contested, black ahead by 1, tint by one, hatched". */
export function controlSummary(fill: ControlFill): string {
  const lead = Math.abs(fill.net);
  switch (fill.control) {
    case "none":
      return "nobody reaches it, no tint";
    case "contested":
      if (fill.leader === null) return "contested, even, hatched, no tint";
      return `contested, ${fill.leader} ahead by ${lead}, tint ${STEP_WORDS[fill.step]}, hatched`;
    case "white":
    case "black":
      return `${fill.control} only, ahead by ${lead}, tint ${STEP_WORDS[fill.step]}`;
  }
}

/** The lens's label-value pair for the readout strip: the fill at the layer in a few words. */
export function controlPair(state: ForceState, square: Square, layer: ControlLayer): LabelValue {
  return { label: `Lens at ${layer}`, value: controlSummary(controlFill(state, square, layer)) };
}

/**
 * The board under the control lens: the raw-values scene with a fill on
 * every square at L0 and L1, and the lens's words added to the readout. At L2
 * every fill is null and the scene is the raw-values scene. The tallies are
 * untouched: they stay drawn on top of the fills as the check on the lens.
 */
export function controlScene(state: ForceState, context: InteractionContext): BoardScene {
  const raw = boardScene(state, context);
  if (context.layer === "L2") return raw;
  const layer = context.layer;
  const squares = raw.squares.map((square) => ({ ...square, fill: controlFill(state, square.square, layer) }));
  const readout = raw.readout
    ? { ...raw.readout, pairs: [...raw.readout.pairs, controlPair(state, raw.readout.square, layer)] }
    : null;
  return { ...raw, squares, readout };
}

/** The current-square panel with one more section saying in a sentence what the lens draws for the square at L0 and L1. */
export function controlSquarePanel(state: ForceState, square: Square): PanelScene {
  const panel = squarePanel(state, square);
  return {
    ...panel,
    sections: [
      ...panel.sections,
      {
        title: "Control lens",
        items: (["L0", "L1"] as const).map((layer) => ({
          text: `At ${layer}: ${controlWords(controlFill(state, square, layer))}`,
          tone: "plain" as const,
        })),
      },
    ],
  };
}

/** One line of the lens's legend: the fill it explains, so the shell can draw a swatch of it beside the words. */
export interface ControlLegendEntry extends LabelValue {
  readonly fill: Pick<ControlFill, "control" | "leader" | "step">;
}

/** What the fills mean, one entry per drawn step and one for a contested square, for the legend. */
export function controlLegend(): ControlLegendEntry[] {
  const entries: ControlLegendEntry[] = [];
  for (const leader of ["white", "black"] as const) {
    const other = leader === "white" ? "black" : "white";
    const values: Record<1 | 2 | 3, string> = {
      1: `one more ${leader} piece than ${other} reaches this square`,
      2: `two more ${leader} pieces than ${other} reach this square`,
      3: `${leader} pieces reaching this square outnumber ${other}'s by three or more`,
    };
    for (const step of [1, 2, 3] as const) {
      entries.push({
        fill: { control: leader, leader, step },
        label: `${leader === "white" ? "White" : "Black"} tint, ${STEP_WORDS[step]}`,
        value: values[step],
      });
    }
  }
  entries.push({
    fill: { control: "contested", leader: null, step: 0 },
    label: "Hatched",
    value: "both sides reach this square; the tint under the hatching says who has more, and no tint means the same number each",
  });
  return entries;
}
