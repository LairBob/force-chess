// Smoke test of the built site in chromium: the WebAssembly module loads,
// the raw tallies land on the squares the fixture corpus says they should,
// a move can be made and taken back, and a pasted FEN loads. Also takes
// the two screenshots committed under docs/screenshots/ and prints the
// first measurements of load time and document size.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const SCREENSHOTS = fileURLToPath(new URL("../../docs/screenshots/", import.meta.url));
// The screenshots carry the measured analysis time, so they differ on every
// run; they are rewritten only on request, and the rewrite is reviewed in git.
const WRITE_SCREENSHOTS = process.env["FORCE_CHESS_SCREENSHOTS"] === "1";

async function screenshot(page: Page, name: string): Promise<void> {
  if (WRITE_SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}${name}.png` });
}
const PINNED_ROOK = "4r3/8/8/8/8/1k6/4R1P1/4K3 w - - 0 1";

function square(page: Page, name: string): Locator {
  return page.locator(`[data-square="${name}"]`);
}

async function marks(page: Page, name: string, meaning: string): Promise<number> {
  return square(page, name).locator(`[data-tally="${meaning}"] .mark`).count();
}

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("html[data-ready='true']")).toBeAttached({ timeout: 20_000 });
}

test("the starting position shows the L0 tallies the fixture describes", async ({ page }) => {
  await ready(page);
  await expect(page.locator("[data-square]")).toHaveCount(64);
  await expect(page.locator("[data-piece]")).toHaveCount(32);
  await expect(page.locator("#status")).toContainText("White to move");
  await expect(page.locator("html")).toHaveAttribute("data-contract-version", "0.4.0");

  // Empty squares reached by pawns: side-coloured marks, one per piece.
  expect(await marks(page, "d3", "white")).toBe(2);
  expect(await marks(page, "f3", "white")).toBe(3);
  expect(await marks(page, "d6", "black")).toBe(2);
  expect(await marks(page, "f3", "black")).toBe(0);
  // Squares nobody reaches at L0 show nothing.
  await expect(square(page, "e4").locator(".mark")).toHaveCount(0);
  await expect(square(page, "d5").locator(".mark")).toHaveCount(0);
  // Occupied squares: green per defender, red per threat.
  expect(await marks(page, "e2", "defence")).toBe(4);
  expect(await marks(page, "e2", "threat")).toBe(0);
  expect(await marks(page, "b1", "defence")).toBe(1);
  expect(await marks(page, "g1", "defence")).toBe(1);
  await expect(square(page, "a1").locator(".mark")).toHaveCount(0);

  const html = page.locator("html");
  const measurements = {
    readyMs: await html.getAttribute("data-ready-ms"),
    documentBytes: await html.getAttribute("data-document-bytes"),
    analyzeMs: await html.getAttribute("data-analyze-ms"),
  };
  console.log(`MEASUREMENTS ${JSON.stringify(measurements)}`);

  await screenshot(page, "starting-position-L0");
});

test("the layer selector changes the tallies", async ({ page }) => {
  await ready(page);
  await page.getByLabel("L2, lookahead").check();
  await expect(square(page, "e4").locator("[data-tally='white'] .mark")).toHaveCount(3);
  await expect(square(page, "e4").locator("[data-tally='black'] .mark")).toHaveCount(3);
  await page.getByLabel("L1, legality").check();
  await expect(square(page, "e4").locator(".mark")).toHaveCount(0);
  expect(await marks(page, "f3", "white")).toBe(3);
});

test("hovering shows the exact figures and selecting fills the panels", async ({ page }) => {
  await ready(page);
  await square(page, "e2").hover();
  const card = square(page, "e2").locator("[data-hover-card]");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Defenses at L0");
  await expect(card).toContainText("15");

  await square(page, "e2").click();
  await expect(page.locator("#piece-panel h2")).toHaveText("White pawn on e2");
  await expect(page.locator("#piece-panel")).toContainText("Mobility (squares it can move to)");
  await expect(page.locator("#square-panel h2")).toHaveText("Square e2");
  await expect(page.locator("#square-panel")).toContainText("White queen on d1 (direct)");
  await expect(square(page, "e3")).toHaveClass(/destination-move/);
  await expect(square(page, "e4")).toHaveClass(/destination-move/);
});

test("a move is made by two clicks and the record navigates", async ({ page }) => {
  await ready(page);
  await square(page, "e2").click();
  await square(page, "e4").click();
  await expect(page.locator("#status")).toContainText("Black to move");
  await expect(page.locator("#move-list")).toContainText("1. e2-e4");
  await expect(page.locator("#fen-input")).toHaveValue("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  await expect(square(page, "e4").locator("[data-piece]")).toHaveAttribute("data-piece", "white pawn");
  // Black's pawn on d7 cannot be moved by white, but black's can now be picked up.
  await square(page, "e7").click();
  await expect(square(page, "e5")).toHaveClass(/destination-move/);
  await square(page, "e5").click();
  await expect(page.locator("#move-list")).toContainText("e7-e5");

  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#status")).toContainText("Black to move");
  await expect(square(page, "e5").locator("[data-piece]")).toHaveCount(0);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#status")).toContainText("White to move");
  await page.keyboard.press("Home");
  await expect(square(page, "e2").locator("[data-piece]")).toHaveAttribute("data-piece", "white pawn");
  await page.keyboard.press("End");
  await expect(square(page, "e5").locator("[data-piece]")).toHaveAttribute("data-piece", "black pawn");

  // Playing from the middle discards the moves after it.
  await page.keyboard.press("Home");
  await square(page, "g1").click();
  await square(page, "f3").click();
  await expect(page.locator("#move-list")).toContainText("1. g1-f3");
  await expect(page.locator("#move-list")).not.toContainText("e2-e4");
});

test("a pasted FEN loads, and a pinned rook loses its off-line reach at L1", async ({ page }) => {
  await ready(page);
  await page.fill("#fen-input", PINNED_ROOK);
  await page.click("#load-fen");
  await expect(page.locator("[data-piece]")).toHaveCount(5);
  // At L0 the white rook reaches c2 through d2 and the black king reaches it too.
  expect(await marks(page, "c2", "white")).toBe(1);
  expect(await marks(page, "c2", "black")).toBe(1);
  expect(await marks(page, "a3", "black")).toBe(1);
  // At L1 the rook is pinned to its king, so it cannot go to c2; and the king
  // may not step onto c2 either, because even a pinned rook attacks it. The
  // square shows nothing. a3, which the rook does not reach, keeps the king.
  await page.getByLabel("L1, legality").check();
  await expect(square(page, "c2").locator(".mark")).toHaveCount(0);
  expect(await marks(page, "a3", "black")).toBe(1);
  // At L0 the black rook x-rays through the pinned rook to e1, one threat to
  // the white king. At L1 that line is blocked by the rook on e2, so the king
  // shows no threat (contract v0.4.0, pinned-piece-still-defends).
  await page.getByLabel("L0, geometry").check();
  expect(await marks(page, "e1", "threat")).toBe(1);
  await page.getByLabel("L1, legality").check();
  await expect(square(page, "e1").locator('[data-tally="threat"] .mark')).toHaveCount(0);
  await square(page, "e2").click();
  await expect(page.locator("#piece-panel")).toContainText("Pinned by the black rook on e8 against its king on e1.");
  await screenshot(page, "pinned-rook-L1");
});

test("an impossible FEN is refused with the core's sentence", async ({ page }) => {
  await ready(page);
  await page.fill("#fen-input", "8/8/8/8/8/8/8/8 w - - 0 1");
  await page.click("#load-fen");
  await expect(page.locator("#message")).toContainText("king");
  await expect(page.locator("[data-piece]")).toHaveCount(32);
});
