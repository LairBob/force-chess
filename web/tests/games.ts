// Loads the expected parsed-game documents from contract/fixtures/games/.
// The record is tested against these, never against hand-typed games.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ParsedGame } from "../src/contract/index.ts";

export function parsedGame(id: string): ParsedGame {
  const url = new URL(`../../contract/fixtures/games/${id}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as ParsedGame;
}

export function gameText(id: string): string {
  const url = new URL(`../../contract/fixtures/games/${id}.pgn`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}
