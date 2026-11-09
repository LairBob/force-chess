// Analyses a FEN with the reference implementation, loaded as the same
// WebAssembly package the shell uses (core/wasm/pkg/, built by `npm run
// wasm`). For positions that have no snapshot in contract/fixtures/, such
// as the middlegames of docs/measurements/corpus.fen.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze, initSync } from "../../core/wasm/pkg/force_core_wasm.js";
import type { ForceState } from "../src/contract/index.ts";

initSync({ module: readFileSync(fileURLToPath(new URL("../../core/wasm/pkg/force_core_wasm_bg.wasm", import.meta.url))) });

export function analysed(fen: string): ForceState {
  return JSON.parse(analyze(fen)) as ForceState;
}

/** The FENs of docs/measurements/corpus.fen by the comment that names them, so a test can pick a position by its name. */
export function corpusFen(name: string): string {
  const text = readFileSync(fileURLToPath(new URL("../../docs/measurements/corpus.fen", import.meta.url)), "utf8");
  for (const line of text.split("\n")) {
    const [fen, comment] = line.split("#").map((part) => part.trim());
    if (fen && comment && comment.includes(name)) return fen;
  }
  throw new Error(`No corpus position is named ${name}.`);
}
