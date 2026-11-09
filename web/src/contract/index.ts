// The contract as TypeScript. `force-state.ts` and `game.ts` are generated
// from the schemas in contract/schema/ by `npm run contract:types` and are
// not committed; everything here is a re-export or a fixed fact about the
// board, never a computation about a position.

export type {
  Battery,
  Color,
  Control,
  Edge,
  ExclusionCode,
  Lookahead,
  Move,
  MoveKind,
  PieceRecord,
  PieceType,
  Pin,
  SideStatus,
  SpecialMove,
  Square,
  SquareRecord,
  Xray,
} from "./force-state.ts";
import type { ForceStateOfOneConfiguration } from "./force-state.ts";
export type { Headers as GameHeaders, Move as ParsedMove, ParsedGame } from "./game.ts";

/** The force-state document of one configuration. */
export type ForceState = ForceStateOfOneConfiguration;

/** The three reach layers a projection can select (concept 4.1). L3 is numbers on squares, not a reach. */
export type Layer = "L0" | "L1" | "L2";

export const LAYERS: readonly Layer[] = ["L0", "L1", "L2"];

/** The piece a pawn may become. */
export type Promotion = "knight" | "bishop" | "rook" | "queen";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/** The 64 squares in board order: a1, b1, ... h1, a2, ... h8. */
export const ALL_SQUARES: readonly string[] = RANKS.flatMap((rank) =>
  FILES.map((file) => file + rank),
);

export function isSquare(text: string): boolean {
  return /^[a-h][1-8]$/.test(text);
}
