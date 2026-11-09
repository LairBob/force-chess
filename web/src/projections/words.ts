// Plain words for what the document names by code (concept P8). Every
// function here turns a record into a phrase; none computes anything about
// the position.

import type {
  Color,
  Edge,
  ForceState,
  Layer,
  Lookahead,
  Move,
  PieceType,
  Square,
} from "../contract/index.ts";

export function capitalise(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/** "white knight on f3", or "the empty square e4" when nothing stands there. */
export function pieceOn(state: ForceState, square: Square): string {
  const piece = state.pieces[square];
  return piece ? `${piece.color} ${piece.type} on ${square}` : `the empty square ${square}`;
}

export function pieceWords(color: Color, type: PieceType, square: Square): string {
  return `${color} ${type} on ${square}`;
}

export function otherSide(color: Color): Color {
  return color === "white" ? "black" : "white";
}

/** "a, b and c". */
export function joinAnd(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const LAYER_NAMES: Record<Layer, string> = {
  L0: "L0, geometry",
  L1: "L1, legality",
  L2: "L2, lookahead",
};

export const LAYER_EXPLANATIONS: Record<Layer, string> = {
  L0: "What each piece reaches by its movement pattern, pins and whose move it is ignored.",
  L1: "The L0 reach each piece could actually use if its side held the move; the rest is excluded with a reason.",
  L2: "What each piece could reach after one of its own legal moves.",
};

/** How an edge gets to its square: "direct", "via d4, c5", "through the white pawn on d7". */
export function edgeRoute(state: ForceState, edge: Edge): string {
  const parts: string[] = [];
  if (edge.path.length > 0) parts.push(`via ${edge.path.join(", ")}`);
  if (edge.kind === "direct") {
    parts.push("direct");
  } else if (edge.through !== null) {
    const kind =
      edge.kind === "battery" ? "battery" : edge.kind === "xray" ? "x-ray" : "line through the king";
    parts.push(`${kind} through the ${pieceOn(state, edge.through)}`);
  }
  return parts.join(", ");
}

/** The move in words for a reader with no notation: "to e4", "takes the black pawn on e5", "castles kingside, to g1". */
export function moveWords(state: ForceState, move: Move): string {
  const becomes = move.promotion ? `, becomes a ${move.promotion}` : "";
  switch (move.kind) {
    case "castle_kingside":
      return `castles kingside, king to ${move.to}`;
    case "castle_queenside":
      return `castles queenside, king to ${move.to}`;
    case "en_passant":
      return `takes en passant on ${move.to}`;
    case "capture":
      return `takes the ${pieceOn(state, move.to)}${becomes}`;
    case "normal":
      return `to ${move.to}${becomes}`;
  }
}

/** Compact notation for a move list: "e2-e4", "e7xd6 e.p.", "a7-a8=Q", "O-O". */
export function moveNotation(move: {
  from: Square;
  to: Square;
  promotion: string | null;
  kind?: Move["kind"];
}): string {
  if (move.kind === "castle_kingside") return "O-O";
  if (move.kind === "castle_queenside") return "O-O-O";
  const joiner = move.kind === "capture" || move.kind === "en_passant" ? "x" : "-";
  const suffix = move.promotion ? `=${move.promotion[0]!.toUpperCase()}` : "";
  const ep = move.kind === "en_passant" ? " e.p." : "";
  return `${move.from}${joiner}${move.to}${suffix}${ep}`;
}

/** "white knight on g1 after moving to f3" for an L2 entry. */
export function lookaheadWords(state: ForceState, entry: Lookahead): string {
  const mover = pieceOn(state, entry.piece);
  const piece = state.pieces[entry.piece];
  const isCastlingRook =
    piece?.type === "rook" &&
    (entry.move.kind === "castle_kingside" || entry.move.kind === "castle_queenside");
  if (isCastlingRook) {
    return `${mover} after castling ${entry.move.kind === "castle_kingside" ? "kingside" : "queenside"}`;
  }
  return `${mover} after it ${moveWords(state, entry.move).replace(/^to /, "moves to ")}`;
}
