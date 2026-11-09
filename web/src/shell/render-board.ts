// Renders a BoardScene as 64 squares. Every mark drawn here is named by the
// scene; this file decides only colours, sizes and glyphs.

import type { Color, PieceType, Square } from "../contract/index.ts";
import type { BoardScene, SquareScene, TallyRow } from "../projections/index.ts";
import { el, replaceChildren } from "./dom.ts";

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
        ...Array.from({ length: row.count }, () => el("span", { className: "mark" })),
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
          { className: `hover-card ${file >= "e" ? "to-left" : "to-right"}`, "data-hover-card": "" },
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

export function renderBoard(container: HTMLElement, scene: BoardScene, handlers: BoardHandlers): void {
  replaceChildren(container, ...scene.squares.map((square) => renderSquare(square, handlers)));
}
