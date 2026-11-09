// Loads whole-board snapshot documents from contract/fixtures/snapshots/.
// The projections are tested against these, never against hand-typed
// documents, so a contract change shows up here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ForceState } from "../src/contract/index.ts";

export function snapshot(id: string): ForceState {
  const url = new URL(`../../contract/fixtures/snapshots/${id}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as ForceState;
}
