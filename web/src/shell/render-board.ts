// Renders a BoardScene as 64 squares. Every mark drawn here is named by the
// scene; this file decides only colours, shapes, sizes and glyphs.

import type { Color, PieceType, Square } from "../contract/index.ts";
import type { BoardScene, SquareScene, TallyRow } from "../projections/index.ts";
import { el, replaceChildren, svg } from "./dom.ts";

const GLYPHS: Record<Color, Record<PieceType, string>> = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};

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

/** One square. `column` is where it sits on the screen, 0 at the left, which decides the side its hover card opens on. */
function renderSquare(scene: SquareScene, column: number, handlers: BoardHandlers): HTMLElement {
  const classes = ["square", scene.shade];
  if (scene.selected) classes.push("selected");
  if (scene.hovered) classes.push("hovered");
  if (scene.destination) classes.push(`destination-${scene.destination}`);
  if (scene.movable) classes.push("movable");
  if (scene.inCheck) classes.push("in-check");
  const file = scene.square[0] ?? "a";
  const node = el(
    "div",
    {
      className: classes.join(" "),
      "data-square": scene.square,
      "data-file": file,
      role: "button",
      tabindex: "-1",
      "aria-label": scene.piece
        ? `${scene.square}, ${scene.piece.color} ${scene.piece.type}`
        : `${scene.square}, empty`,
    },
    scene.piece
      ? el(
          "span",
          { className: `piece ${scene.piece.color}`, "data-piece": `${scene.piece.color} ${scene.piece.type}` },
          GLYPHS[scene.piece.color][scene.piece.type],
        )
      : null,
    scene.destination ? el("span", { className: "destination-mark" }) : null,
    renderTallies(scene.tallies),
    el("span", { className: "coordinate" }, scene.square),
    scene.hover
      ? el(
          "div",
          { className: `hover-card ${column >= 4 ? "to-left" : "to-right"}`, "data-hover-card": "" },
          ...scene.hover.map((pair) =>
            el("div", { className: "pair" }, el("span", { className: "label" }, pair.label), el("span", { className: "value" }, pair.value)),
          ),
        )
      : null,
  );
  node.addEventListener("click", () => handlers.onSquareClick(scene.square));
  node.addEventListener("mouseenter", () => handlers.onSquareHover(scene.square));
  return node;
}

/** Draws the 64 squares into `container`. Every square carries its own name, so the scene's edge labels are not drawn. */
export function renderBoard(container: HTMLElement, scene: BoardScene, handlers: BoardHandlers): void {
  replaceChildren(container, ...scene.squares.map((square, index) => renderSquare(square, index % 8, handlers)));
}
