// Renders a BoardScene as 64 squares. Every mark drawn here is named by the
// scene; this file decides only colours, shapes, sizes and glyphs.

import type { Color, PieceType, Square } from "../contract/index.ts";
import type { BoardScene, ControlFill, Readout, SquareScene, TallyRow } from "../projections/index.ts";
import { el, replaceChildren, svg } from "./dom.ts";

/**
 * The pieces are the mpchess SVG set (Maxime Chupin, GPL-3.0), served from
 * public/pieces/mpchess/ with its licence notice beside the files, named by
 * colour letter and piece letter as the set names them.
 */
const PIECE_FILES: Record<Color, Record<PieceType, string>> = {
  white: { king: "wK", queen: "wQ", rook: "wR", bishop: "wB", knight: "wN", pawn: "wP" },
  black: { king: "bK", queen: "bQ", rook: "bR", bishop: "bB", knight: "bN", pawn: "bP" },
};

/** The image for one piece: 46px, placed by the stylesheet, named in plain words for anyone who cannot see it. */
function pieceImage(color: Color, type: PieceType): HTMLImageElement {
  const name = `${color[0]!.toUpperCase()}${color.slice(1)} ${type}`;
  return el("img", {
    className: "piece",
    src: `pieces/mpchess/${PIECE_FILES[color][type]}.svg`,
    alt: name,
    width: "46",
    height: "46",
    draggable: "false",
    "data-piece": `${color} ${type}`,
  });
}

const ROW_TITLES: Record<TallyRow["meaning"], string> = {
  threat: "enemy pieces reaching this piece",
  defence: "friendly pieces reaching this piece",
  white: "white pieces reaching this square",
  black: "black pieces reaching this square",
};

/**
 * The shape of a mark says what its colour says (concept 7.1): a threat is a
 * triangle pointing down onto the piece, a defence a triangle pointing up
 * under it, and a side's reach onto an empty square a plain square. Drawn on
 * an 8 by 8 grid with a 1px edge in the mark's edge colour.
 */
const MARK_SHAPES: Record<TallyRow["meaning"], { shape: string; points: string }> = {
  threat: { shape: "triangle-down", points: "0.5,1 7.5,1 4,7.5" },
  defence: { shape: "triangle-up", points: "4,0.5 7.5,7 0.5,7" },
  white: { shape: "square", points: "0.5,0.5 7.5,0.5 7.5,7.5 0.5,7.5" },
  black: { shape: "square", points: "0.5,0.5 7.5,0.5 7.5,7.5 0.5,7.5" },
};

/** One mark, for the board and for the legend. Its colour comes from the stylesheet by its meaning. */
export function markNode(meaning: TallyRow["meaning"]): SVGSVGElement {
  const { shape, points } = MARK_SHAPES[meaning];
  return svg(
    "svg",
    { class: `mark mark-${meaning}`, "data-shape": shape, width: "8", height: "8", viewBox: "0 0 8 8", "aria-hidden": "true" },
    svg("polygon", { points }),
  );
}

/**
 * The control lens names a fill as data; here it becomes classes and data
 * attributes. `data-fill` is the leader (white or black), "even" for a
 * contested square with no leader, or "none"; `data-fill-step` is the
 * lead's step; `data-contested` marks the hatching. The colours come from
 * the stylesheet by these classes, so a swatch in the legend can carry the
 * same ones.
 */
export function fillAttributes(fill: ControlFill): { classes: string[]; data: Record<string, string> } {
  const classes: string[] = [];
  if (fill.leader !== null) classes.push(`fill-${fill.leader}-${fill.step}`);
  if (fill.control === "contested") classes.push("contested");
  return {
    classes,
    data: {
      "data-fill": fill.leader ?? (fill.control === "contested" ? "even" : "none"),
      "data-fill-step": String(fill.step),
      "data-contested": fill.control === "contested" ? "true" : "false",
    },
  };
}

/** A small square carrying a fill, for the legend: the fill over a light square and over a dark one, side by side. */
export function swatchNode(fill: Pick<ControlFill, "control" | "leader" | "step">): HTMLElement {
  const { classes } = fillAttributes({ ...fill, net: 0 });
  return el(
    "span",
    { className: "swatch", "aria-hidden": "true" },
    el("span", { className: ["swatch-half", "light", ...classes].join(" ") }),
    el("span", { className: ["swatch-half", "dark", ...classes].join(" ") }),
  );
}

export interface BoardHandlers {
  onSquareClick(square: Square): void;
  onSquareHover(square: Square | null): void;
}

function renderTallies(rows: readonly TallyRow[]): HTMLElement {
  return el(
    "div",
    { className: "tallies" },
    ...rows.map((row) =>
      el(
        "div",
        {
          className: `tally-row tally-${row.meaning}`,
          "data-tally": row.meaning,
          "data-count": String(row.count),
          title: `${row.count} ${ROW_TITLES[row.meaning]}`,
        },
        ...Array.from({ length: row.count }, () => markNode(row.meaning)),
      ),
    ),
  );
}

function renderSquare(scene: SquareScene, handlers: BoardHandlers): HTMLElement {
  const classes = ["square", scene.shade];
  if (scene.selected) classes.push("selected");
  if (scene.hovered) classes.push("hovered");
  if (scene.destination) classes.push(`destination-${scene.destination}`);
  if (scene.movable) classes.push("movable");
  if (scene.inCheck) classes.push("in-check");
  const fill = scene.fill ? fillAttributes(scene.fill) : null;
  if (fill) classes.push(...fill.classes);
  const file = scene.square[0] ?? "a";
  const node = el(
    "div",
    {
      className: classes.join(" "),
      "data-square": scene.square,
      "data-file": file,
      ...(fill?.data ?? {}),
      role: "button",
      tabindex: "-1",
      "aria-label": scene.piece
        ? `${scene.square}, ${scene.piece.color} ${scene.piece.type}`
        : `${scene.square}, empty`,
    },
    scene.piece ? pieceImage(scene.piece.color, scene.piece.type) : null,
    scene.destination ? el("span", { className: "destination-mark" }) : null,
    renderTallies(scene.tallies),
    el("span", { className: "coordinate" }, scene.square),
  );
  node.addEventListener("click", () => handlers.onSquareClick(scene.square));
  node.addEventListener("mouseenter", () => handlers.onSquareHover(scene.square));
  return node;
}

/** Draws the 64 squares into `container`. Every square carries its own name, so the scene's edge labels are not drawn. */
export function renderBoard(container: HTMLElement, scene: BoardScene, handlers: BoardHandlers): void {
  replaceChildren(container, ...scene.squares.map((square) => renderSquare(square, handlers)));
}

/** The readout strip under the board: the figures of the square being read, or a line saying how to read one. */
export function renderReadout(container: HTMLElement, readout: Readout | null): void {
  if (!readout) {
    container.removeAttribute("data-readout-square");
    replaceChildren(container, el("span", { className: "readout-placeholder" }, "Hover a square, or click one, to read its figures here."));
    return;
  }
  container.dataset["readoutSquare"] = readout.square;
  replaceChildren(
    container,
    el("span", { className: "readout-heading" }, readout.heading),
    ...readout.pairs.map((pair) =>
      el("span", { className: "readout-pair" }, `${pair.label} `, el("span", { className: "value" }, pair.value)),
    ),
  );
}
