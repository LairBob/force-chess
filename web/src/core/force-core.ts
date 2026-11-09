// The analysis side, reached through the WebAssembly package built from
// core/wasm/ (`npm run wasm`). This is the only module in web/ that knows
// the package exists; everything else sees a force state, a parsed game
// and FENs.

import init, { analyze as analyzeRaw, applyMove as applyMoveRaw, contractVersion, parseGame as parseGameRaw } from "../../../core/wasm/pkg/force_core_wasm.js";
import wasmUrl from "../../../core/wasm/pkg/force_core_wasm_bg.wasm?url";
import type { ForceState, ParsedGame, Promotion } from "../contract/index.ts";

/** A refusal from the core, with its code and plain-words sentence. */
export interface CoreError {
  readonly code: "unreadable" | "impossible" | "illegal_move" | "bad_square" | "no_game";
  readonly text: string;
}

export function isCoreError(value: unknown): value is CoreError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

function rethrow(error: unknown): never {
  if (isCoreError(error)) {
    throw { code: error.code, text: error.text } satisfies CoreError;
  }
  throw error;
}

export interface Analysis {
  readonly state: ForceState;
  /** Size of the JSON document the core produced, in bytes of UTF-8. */
  readonly bytes: number;
  /** Time spent in the core and in JSON.parse, in milliseconds. */
  readonly milliseconds: number;
}

export interface ForceCore {
  readonly contractVersion: string;
  analyze(fen: string): Analysis;
  applyMove(fen: string, from: string, to: string, promotion: Promotion | null): string;
  /** The first game in a PGN text, with the FEN after every move. */
  parseGame(pgn: string): ParsedGame;
}

export async function loadForceCore(): Promise<ForceCore> {
  await init({ module_or_path: wasmUrl });
  return {
    contractVersion: contractVersion(),
    analyze(fen) {
      const started = performance.now();
      let text: string;
      try {
        text = analyzeRaw(fen);
      } catch (error) {
        rethrow(error);
      }
      const state = JSON.parse(text) as ForceState;
      return {
        state,
        bytes: new TextEncoder().encode(text).length,
        milliseconds: performance.now() - started,
      };
    },
    applyMove(fen, from, to, promotion) {
      try {
        return applyMoveRaw(fen, from, to, promotion ?? undefined);
      } catch (error) {
        rethrow(error);
      }
    },
    parseGame(pgn) {
      let text: string;
      try {
        text = parseGameRaw(pgn);
      } catch (error) {
        rethrow(error);
      }
      return JSON.parse(text) as ParsedGame;
    },
  };
}
