// The info panels (concept section 7, "Info panels"): the current piece and
// the current square, spelling out every state the document holds for them
// in plain words. Both read the same records. Nothing is computed about the
// position; every line is a record, an index looked up, or a count of a list.

import type {
  Color,
  Edge,
  ForceState,
  PieceRecord,
  SpecialMove,
  Square,
  SquareRecord,
} from "../contract/index.ts";
import { reachCount } from "./raw-values.ts";
import type { LabelValue, PanelItem, PanelScene, PanelSection } from "./scene.ts";
import {
  capitalise,
  edgeRoute,
  joinAnd,
  lookaheadWords,
  moveWords,
  otherSide,
  pieceOn,
} from "./words.ts";

function edgeItem(state: ForceState, edge: Edge, named: "from" | "to"): PanelItem {
  const subject = named === "from" ? pieceOn(state, edge.from) : pieceOn(state, edge.to);
  const text = `${capitalise(subject)} (${edgeRoute(state, edge)})`;
  if (edge.L1.legal) {
    return { text, detail: "Legal at L1: could be exercised if its side held the move.", tone: "legal" };
  }
  return { text, detail: `Excluded at L1: ${edge.L1.reason?.text ?? "no reason given"}`, tone: "excluded" };
}

function edgeItems(state: ForceState, indices: readonly number[], named: "from" | "to"): PanelItem[] {
  return indices.flatMap((index) => {
    const edge = state.relations.edges[index];
    return edge ? [edgeItem(state, edge, named)] : [];
  });
}

function lookaheadItems(state: ForceState, indices: readonly number[]): PanelItem[] {
  return indices.flatMap((index) => {
    const entry = state.relations.lookaheads[index];
    return entry ? [{ text: capitalise(lookaheadWords(state, entry)), tone: "plain" as const }] : [];
  });
}

/** The three counts of one colour's reach onto a square, as pairs. */
function reachPairs(state: ForceState, record: SquareRecord, color: Color, label: string): LabelValue[] {
  return [
    { label: `${label} at L0`, value: String(reachCount(state, record, color, "L0")) },
    { label: `${label} at L1`, value: String(reachCount(state, record, color, "L1")) },
    { label: `${label} at L2`, value: String(reachCount(state, record, color, "L2")) },
  ];
}

/** Who reaches a square from one side: the L0 edges with their L1 status, then the L2 entries. */
function reachSection(
  state: ForceState,
  record: SquareRecord,
  color: Color,
  title: string,
  countLabel: string,
): PanelSection {
  const by = record.attackers[color];
  const items = [
    ...edgeItems(state, by.L0, "from"),
    ...lookaheadItems(state, by.L2),
  ];
  return {
    title,
    pairs: reachPairs(state, record, color, countLabel),
    items,
    empty: `No ${color} piece reaches this square at any layer.`,
  };
}

function valuationPairs(record: SquareRecord, layer: "L0" | "L1"): LabelValue[] {
  const v = record.valuation[layer];
  return [
    { label: `White count at ${layer}`, value: String(v.white.count) },
    { label: `White value at ${layer}`, value: String(v.white.value) },
    { label: `Black count at ${layer}`, value: String(v.black.count) },
    { label: `Black value at ${layer}`, value: String(v.black.value) },
    { label: `Net count at ${layer} (white minus black)`, value: String(v.net.count) },
    { label: `Net value at ${layer} (white minus black)`, value: String(v.net.value) },
  ];
}

function specialMoveItem(name: string, move: SpecialMove | undefined): PanelItem | null {
  if (!move) return null;
  if (move.available) {
    return {
      text: `${name}: available${move.target ? `, to ${move.target}` : ""}.`,
      tone: "legal",
    };
  }
  return {
    text: `${name}: not available${move.target ? ` (would go to ${move.target})` : ""}.`,
    detail: move.reason?.text ?? "No reason given.",
    tone: "excluded",
  };
}

function constraintItems(state: ForceState, square: Square, piece: PieceRecord): PanelItem[] {
  const items: PanelItem[] = [];
  if (piece.constraints.pinned !== null) {
    const pin = state.relations.pins[piece.constraints.pinned];
    if (pin) {
      items.push({
        text: `Pinned by the ${pieceOn(state, pin.pinner)} against its king on ${pin.king}.`,
        detail: `The pin runs along ${pin.line.join(", ")}. Moving off that line would expose the king, so every reach off the line is excluded at L1.`,
        tone: "excluded",
      });
    }
  }
  if (piece.constraints.inCheck !== null) {
    const checkers = piece.constraints.inCheck.checkers.map((s) => `the ${pieceOn(state, s)}`);
    items.push({
      text: `In check from ${joinAnd(checkers)}.`,
      detail: "Check means an enemy piece reaches this king directly; the side must answer it before anything else.",
      tone: "excluded",
    });
  }
  if (piece.constraints.noLegalMoves !== null) {
    items.push({
      text: `No legal moves (${piece.constraints.noLegalMoves.code.replace(/_/g, " ")}).`,
      detail: piece.constraints.noLegalMoves.text,
      tone: "excluded",
    });
  }
  return items;
}

function relationItems(state: ForceState, square: Square): PanelItem[] {
  const items: PanelItem[] = [];
  for (const pin of state.relations.pins) {
    if (pin.pinner === square) {
      items.push({
        text: `Pins the ${pieceOn(state, pin.pinned)} against the king on ${pin.king}, along ${pin.line.join(", ")}.`,
      });
    }
  }
  for (const xray of state.relations.xrays) {
    if (xray.piece === square) {
      items.push({
        text: `X-rays through the ${pieceOn(state, xray.through)} to ${xray.beyond.join(", ")}.`,
        detail: "An x-ray is a line that continues through one enemy piece that moves along the same kind of line.",
      });
    } else if (xray.through === square) {
      items.push({
        text: `Is x-rayed by the ${pieceOn(state, xray.piece)}, which looks through it to ${xray.beyond.join(", ")}.`,
      });
    }
  }
  for (const battery of state.relations.batteries) {
    if (battery.back === square) {
      items.push({
        text: `Forms a battery behind the ${pieceOn(state, battery.front)}, reaching ${battery.covered.join(", ")} through it.`,
        detail: "A battery is two friendly pieces on one line that move along the same kind of line; the back one reaches through the front one.",
      });
    } else if (battery.front === square) {
      items.push({
        text: `Is the front of a battery with the ${pieceOn(state, battery.back)} behind it, which reaches ${battery.covered.join(", ")} through this piece.`,
      });
    }
  }
  return items;
}

/** The current-piece panel for the piece on `square`; null when the square is empty. */
export function piecePanel(state: ForceState, square: Square): PanelScene | null {
  const piece = state.pieces[square];
  if (!piece) return null;
  const enemy = otherSide(piece.color);
  const record = state.squares[square];
  const ownMoves = piece.lookaheads.filter(
    (index) => state.relations.lookaheads[index]?.move.from === square,
  );
  const side = state.sides[piece.color];

  const sections: PanelSection[] = [];
  sections.push({
    title: "At a glance",
    pairs: [
      { label: "Piece", value: `${piece.color} ${piece.type}` },
      { label: "Square", value: square },
      { label: "Material value", value: String(state.valuationScale[piece.type]) },
      { label: "Mobility (squares it can move to)", value: String(piece.mobility) },
      { label: "Legal moves", value: String(ownMoves.length) },
      { label: `${capitalise(piece.color)}'s status if it held the move`, value: side.status },
    ],
  });
  sections.push({
    title: "Constraints",
    items: constraintItems(state, square, piece),
    empty: "None: not pinned, not in check, and it has legal moves.",
  });
  if (record) {
    sections.push({
      title: "Threatened by",
      pairs: reachPairs(state, record, enemy, "Threats"),
      items: [
        ...edgeItems(state, piece.attackedBy.L0, "from"),
        ...lookaheadItems(state, piece.attackedBy.L2),
      ],
      empty: "No enemy piece reaches this piece at any layer.",
    });
    sections.push({
      title: "Defended by",
      pairs: reachPairs(state, record, piece.color, "Defenses"),
      items: [
        ...edgeItems(state, piece.defendedBy.L0, "from"),
        ...lookaheadItems(state, piece.defendedBy.L2),
      ],
      empty: "No friendly piece reaches this piece at any layer.",
    });
  }
  sections.push({
    title: "Attacks (empty squares and enemy pieces it reaches)",
    pairs: [
      { label: "At L0", value: String(piece.attacks.L0.length) },
      { label: "Legal at L1", value: String(piece.attacks.L1.legal.length) },
      { label: "Excluded at L1", value: String(piece.attacks.L1.excluded.length) },
    ],
    items: edgeItems(state, piece.attacks.L0, "to"),
    empty: "It reaches no empty square and no enemy piece.",
  });
  sections.push({
    title: "Defends (friendly pieces it reaches)",
    pairs: [
      { label: "At L0", value: String(piece.defends.L0.length) },
      { label: "Legal at L1", value: String(piece.defends.L1.legal.length) },
      { label: "Excluded at L1", value: String(piece.defends.L1.excluded.length) },
    ],
    items: edgeItems(state, piece.defends.L0, "to"),
    empty: "It reaches no friendly piece.",
  });
  sections.push({
    title: "Legal moves, and what it would reach after each (L2)",
    items: ownMoves.flatMap((index) => {
      const entry = state.relations.lookaheads[index];
      if (!entry) return [];
      const attacks = entry.attacks.length > 0 ? entry.attacks.join(", ") : "nothing";
      return [
        {
          text: capitalise(moveWords(state, entry.move)),
          detail: `Would then reach: ${attacks}.`,
          tone: "legal" as const,
        },
      ];
    }),
    empty: "No legal moves if its side held the move.",
  });
  const special = [
    specialMoveItem("Castling kingside", piece.specialMoves.castleKingside),
    specialMoveItem("Castling queenside", piece.specialMoves.castleQueenside),
    specialMoveItem("En passant", piece.specialMoves.enPassant),
    specialMoveItem("Promotion", piece.specialMoves.promotion),
  ].filter((item): item is PanelItem => item !== null);
  if (special.length > 0) {
    sections.push({ title: "Special moves", items: special });
  }
  sections.push({
    title: "Pins, x-rays and batteries",
    items: relationItems(state, square),
    empty: "This piece is in no pin, x-ray or battery.",
  });

  return {
    title: capitalise(pieceOn(state, square)),
    subtitle: "Current piece: everything the document says about it.",
    sections,
  };
}

/** The current-square panel for any square, occupied or not. */
export function squarePanel(state: ForceState, square: Square): PanelScene {
  const record = state.squares[square];
  const occupant = record?.occupant ?? null;
  const glance: LabelValue[] = [
    { label: "Square", value: square },
    { label: "Occupant", value: occupant ? `${occupant.color} ${occupant.type}` : "none" },
  ];
  if (!record) {
    return {
      title: `Square ${square}`,
      subtitle: "Current square: everything the document says about it.",
      sections: [
        { title: "At a glance", pairs: glance },
        {
          title: "Report",
          empty: "Nothing: the square is empty and no piece reaches it at any layer.",
        },
      ],
    };
  }
  glance.push({ label: "Control at L0", value: record.control.L0 });
  glance.push({ label: "Control at L1", value: record.control.L1 });

  const sections: PanelSection[] = [{ title: "At a glance", pairs: glance }];
  if (occupant) {
    const enemy = otherSide(occupant.color);
    sections.push({
      title: "Threats and defenses of the occupant",
      pairs: [
        ...reachPairs(state, record, enemy, "Threats"),
        { label: "Threat value at L0", value: String(record.valuation.L0[enemy].value) },
        { label: "Threat value at L1", value: String(record.valuation.L1[enemy].value) },
        ...reachPairs(state, record, occupant.color, "Defenses"),
        { label: "Defense value at L0", value: String(record.valuation.L0[occupant.color].value) },
        { label: "Defense value at L1", value: String(record.valuation.L1[occupant.color].value) },
      ],
    });
  }
  sections.push({
    title: "Valuation (L3): counts and summed material values of the pieces reaching here",
    pairs: [...valuationPairs(record, "L0"), ...valuationPairs(record, "L1")],
  });
  sections.push(reachSection(state, record, "white", "White pieces reaching this square", "White reach"));
  sections.push(reachSection(state, record, "black", "Black pieces reaching this square", "Black reach"));
  return {
    title: `Square ${square}`,
    subtitle: "Current square: everything the document says about it.",
    sections,
  };
}
