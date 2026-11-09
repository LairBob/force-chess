// A pasted game loads through the core, its moves are listed as the text
// wrote them, and the board at a chosen move shows exactly what the core
// says about that position: the pieces and the raw tallies are compared
// square by square with the force state the same WebAssembly package
// computes in Node for the FEN the fixture gives.

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze, initSync } from "../../core/wasm/pkg/force_core_wasm.js";
import { ALL_SQUARES, type ForceState } from "../src/contract/index.ts";
import { tallies } from "../src/projections/raw-values.ts";
import type { ParsedGame } from "../src/contract/index.ts";

const GAMES = fileURLToPath(new URL("../../contract/fixtures/games/", import.meta.url));
const SCREENSHOTS = fileURLToPath(new URL("../../docs/screenshots/", import.meta.url));
const WRITE_SCREENSHOTS = process.env["FORCE_CHESS_SCREENSHOTS"] === "1";

initSync({ module: readFileSync(fileURLToPath(new URL("../../core/wasm/pkg/force_core_wasm_bg.wasm", import.meta.url))) });

function gameText(id: string): string {
  return readFileSync(`${GAMES}${id}.pgn`, "utf8");
}

function expectedGame(id: string): ParsedGame {
  return JSON.parse(readFileSync(`${GAMES}${id}.json`, "utf8")) as ParsedGame;
}

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("html[data-ready='true']")).toBeAttached({ timeout: 20_000 });
}

async function loadGame(page: Page, id: string): Promise<void> {
  await page.fill("#pgn-input", gameText(id));
  await page.click("#load-pgn");
}

interface SquareOnPage {
  piece: string | null;
  marks: Record<string, number>;
}

/** Every square as the page shows it: the piece and the mark count per meaning. */
async function boardOnPage(page: Page): Promise<Record<string, SquareOnPage>> {
  return page.evaluate(() => {
    const result: Record<string, { piece: string | null; marks: Record<string, number> }> = {};
    for (const node of document.querySelectorAll<HTMLElement>("[data-square]")) {
      const marks: Record<string, number> = {};
      for (const row of node.querySelectorAll<HTMLElement>("[data-tally]")) {
        marks[row.dataset["tally"] ?? ""] = row.querySelectorAll(".mark").length;
      }
      result[node.dataset["square"] ?? ""] = {
        piece: node.querySelector<HTMLElement>("[data-piece]")?.dataset["piece"] ?? null,
        marks,
      };
    }
    return result;
  });
}

/** The same 64 squares as the core describes the position, through the raw-values projection. */
function boardFromCore(fen: string): Record<string, SquareOnPage> {
  const state = JSON.parse(analyze(fen)) as ForceState;
  const result: Record<string, SquareOnPage> = {};
  for (const square of ALL_SQUARES) {
    const piece = state.pieces[square];
    const marks: Record<string, number> = {};
    for (const row of tallies(state, square, "L0")) marks[row.meaning] = row.count;
    result[square] = { piece: piece ? `${piece.color} ${piece.type}` : null, marks };
  }
  return result;
}

test("a pasted game loads and the third move shows the position the core computes for it", async ({ page }) => {
  await ready(page);
  const game = expectedGame("short-game");
  const analysedBefore = Number(await page.locator("html").getAttribute("data-analysed-positions"));

  await loadGame(page, "short-game");
  await expect(page.locator("#game-headers")).toHaveText("Alice versus Bob, Casual game, 2026.11.09, 1-0.");
  const moves = page.locator("#move-list li[data-move-index]");
  await expect(moves).toHaveCount(7);
  await expect(moves.nth(0)).toHaveText("1. e4");
  await expect(moves.nth(1)).toHaveText("e5");
  await expect(moves.nth(2)).toHaveText("2. Qh5");
  await expect(moves.nth(6)).toHaveText("4. Qxf7#");
  // The cursor is on the start, and nothing but the start has been analysed.
  await expect(page.locator("#fen-input")).toHaveValue(game.startFen);
  expect(Number(await page.locator("html").getAttribute("data-analysed-positions"))).toBe(analysedBefore);

  await moves.nth(2).locator("button").click();
  const fen = game.moves[2]?.fenAfter;
  if (!fen) throw new Error("the fixture has fewer than three moves");
  await expect(page.locator("#fen-input")).toHaveValue(fen);
  await expect(page.locator("#status")).toContainText("Black to move");
  await expect(moves.nth(2)).toHaveClass(/current/);
  await expect(moves.nth(1)).not.toHaveClass(/current/);
  // Only the position landed on was analysed.
  expect(Number(await page.locator("html").getAttribute("data-analysed-positions"))).toBe(analysedBefore + 1);

  expect(await boardOnPage(page)).toEqual(boardFromCore(fen));

  // The arrow keys step along the imported moves.
  await page.keyboard.press("ArrowRight");
  await expect(moves.nth(3)).toHaveClass(/current/);
  await expect(page.locator("#fen-input")).toHaveValue(game.moves[3]?.fenAfter ?? "");
  await page.keyboard.press("ArrowLeft");
  await expect(moves.nth(2)).toHaveClass(/current/);
  await page.keyboard.press("End");
  await expect(moves.nth(6)).toHaveClass(/current/);
  await expect(page.locator("#status")).toContainText("Black: checkmate, 0 legal moves");
  await page.keyboard.press("Home");
  await expect(page.locator("#move-list li.current")).toHaveCount(0);

  await moves.nth(4).locator("button").click();
  if (WRITE_SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}imported-game-L0.png` });
});

test("a game of seventy moves loads with only the start analysed, and the last move is reachable", async ({ page }) => {
  await ready(page);
  const game = expectedGame("long-game");
  const analysedBefore = Number(await page.locator("html").getAttribute("data-analysed-positions"));
  await loadGame(page, "long-game");
  const moves = page.locator("#move-list li[data-move-index]");
  await expect(moves).toHaveCount(140);
  await expect(moves.nth(139)).toHaveText("Nb2");
  expect(Number(await page.locator("html").getAttribute("data-analysed-positions"))).toBe(analysedBefore);
  await moves.nth(139).locator("button").click();
  await expect(page.locator("#fen-input")).toHaveValue(game.moves[139]?.fenAfter ?? "");
  expect(await boardOnPage(page)).toEqual(boardFromCore(game.moves[139]?.fenAfter ?? ""));
  // Playing a move from the end keeps the game's headers and adds the move without notation.
  await expect(page.locator("#game-headers")).toContainText("Random mover versus Random mover");
});

test("a game with an illegal move is refused with the core's sentence and the board stays", async ({ page }) => {
  await ready(page);
  await loadGame(page, "illegal-move");
  await expect(page.locator("#message")).toHaveText("Black's 3rd move, Nxe5, is not legal in the position it is played from.");
  await expect(page.locator("[data-piece]")).toHaveCount(32);
  await expect(page.locator("#move-list li[data-move-index]")).toHaveCount(0);
  await loadGame(page, "not-a-game");
  await expect(page.locator("#message")).toContainText("no chess game");
});
