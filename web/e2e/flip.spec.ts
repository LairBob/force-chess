// Flipping the board is a change of viewpoint and nothing else: the same 64
// squares are drawn from black's side, each still carrying its own name,
// every square keeps its marks, the selection and the panels stay as they
// were, and no position is analysed again.

import { expect, test, type Locator, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("html[data-ready='true']")).toBeAttached({ timeout: 20_000 });
}

function square(page: Page, name: string): Locator {
  return page.locator(`[data-square="${name}"]`);
}

/** The squares in the order the page draws them, top row first, left to right. */
async function drawingOrder(page: Page): Promise<string[]> {
  return page.locator("#board [data-square]").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset["square"] ?? ""));
}

/** The mark count per meaning on every square, keyed by square. */
async function marksOnPage(page: Page): Promise<Record<string, Record<string, number>>> {
  return page.evaluate(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const node of document.querySelectorAll<HTMLElement>("[data-square]")) {
      const marks: Record<string, number> = {};
      for (const row of node.querySelectorAll<HTMLElement>("[data-tally]")) {
        marks[row.dataset["tally"] ?? ""] = row.querySelectorAll(".mark").length;
      }
      result[node.dataset["square"] ?? ""] = marks;
    }
    return result;
  });
}

async function box(locator: Locator): Promise<{ x: number; y: number }> {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("The element has no box.");
  return { x: rect.x, y: rect.y };
}

test("white is at the bottom by default, with a8 top left and every square named", async ({ page }) => {
  await ready(page);
  const order = await drawingOrder(page);
  expect(order[0]).toBe("a8");
  expect(order[63]).toBe("h1");
  await expect(square(page, "a8").locator(".coordinate")).toHaveText("a8");
  await expect(square(page, "h1").locator(".coordinate")).toHaveText("h1");
  await expect(page.locator("#board .coordinate")).toHaveCount(64);
  await expect(page.locator("#board-frame")).toHaveAttribute("data-bottom", "white");
  await expect(page.locator("#flip-board")).toHaveAttribute("title", /White is at the bottom/);
});

test("flipping draws the board from black's side and changes nothing about the squares", async ({ page }) => {
  await ready(page);
  await square(page, "e2").click();
  await expect(square(page, "e2")).toHaveClass(/selected/);
  await expect(square(page, "e4")).toHaveClass(/destination-move/);
  const marksBefore = await marksOnPage(page);
  const piecePanelBefore = await page.locator("#piece-panel").innerText();
  const squarePanelBefore = await page.locator("#square-panel").innerText();
  const statusBefore = await page.locator("#status").innerText();
  const analysedBefore = await page.locator("html").getAttribute("data-analysed-positions");
  expect(analysedBefore).toBe("1");

  await page.click("#flip-board");

  // Drawing order and geometry: a8 is now bottom right, h1 top left.
  const order = await drawingOrder(page);
  expect(order[0]).toBe("h1");
  expect(order[63]).toBe("a8");
  const a8 = await box(square(page, "a8"));
  const h1 = await box(square(page, "h1"));
  const h8 = await box(square(page, "h8"));
  const a1 = await box(square(page, "a1"));
  expect(a8.x).toBeGreaterThan(h1.x + 7 * 70);
  expect(a8.y).toBeGreaterThan(h1.y + 7 * 70);
  expect(h8.y).toBeCloseTo(a8.y, 0);
  expect(h8.x).toBeCloseTo(h1.x, 0);
  expect(a1.y).toBeCloseTo(h1.y, 0);
  expect(a1.x).toBeCloseTo(a8.x, 0);
  // Each square still carries its own name, so the top left square now reads h1.
  await expect(square(page, "h1").locator(".coordinate")).toHaveText("h1");
  await expect(page.locator("#board [data-square]").first().locator(".coordinate")).toHaveText("h1");
  await expect(page.locator("#board-frame")).toHaveAttribute("data-bottom", "black");
  await expect(page.locator("#flip-board")).toHaveAttribute("title", /Black is at the bottom/);

  // The marks keep their meaning: the same colours on the same squares.
  expect(await square(page, "e2").locator("[data-tally='defence'] .mark").count()).toBe(4);
  expect(await square(page, "d3").locator("[data-tally='white'] .mark").count()).toBe(2);
  expect(await square(page, "d6").locator("[data-tally='black'] .mark").count()).toBe(2);
  expect(await marksOnPage(page)).toEqual(marksBefore);
  expect(marksBefore["e2"]).toEqual({ defence: 4 });
  expect(marksBefore["d3"]).toEqual({ white: 2 });

  // The selection, its destinations, the panels and the status are as they were.
  await expect(square(page, "e2")).toHaveClass(/selected/);
  await expect(square(page, "e4")).toHaveClass(/destination-move/);
  expect(await page.locator("#piece-panel").innerText()).toBe(piecePanelBefore);
  expect(await page.locator("#square-panel").innerText()).toBe(squarePanelBefore);
  expect(await page.locator("#status").innerText()).toBe(statusBefore);
  // Nothing was analysed again.
  await expect(page.locator("html")).toHaveAttribute("data-analysed-positions", analysedBefore ?? "");

  // The hover card opens towards the middle of the screen, not off the edge: h-file squares now sit on the left.
  await square(page, "h2").hover();
  await expect(square(page, "h2").locator("[data-hover-card]")).toHaveClass(/to-right/);

  // Flipping back restores the order; the move list is untouched throughout.
  await page.keyboard.press("f");
  expect((await drawingOrder(page))[0]).toBe("a8");
  await expect(page.locator("#move-list")).toContainText("No moves yet");
  await expect(page.locator("html")).toHaveAttribute("data-analysed-positions", analysedBefore ?? "");
});

test("the f key flips the board, but not while typing in the FEN or PGN box", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("f");
  await expect(page.locator("#board-frame")).toHaveAttribute("data-bottom", "black");
  await page.keyboard.press("f");
  await expect(page.locator("#board-frame")).toHaveAttribute("data-bottom", "white");

  await page.locator("#fen-input").focus();
  await page.keyboard.type("f");
  await expect(page.locator("#board-frame")).toHaveAttribute("data-bottom", "white");
  await expect(page.locator("#fen-input")).toHaveValue(/f$/);

  await page.locator("#pgn-input").focus();
  await page.keyboard.type("f");
  await expect(page.locator("#board-frame")).toHaveAttribute("data-bottom", "white");
  await expect(page.locator("#pgn-input")).toHaveValue("f");

  // Ctrl+F stays with the browser.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+f");
  await expect(page.locator("#board-frame")).toHaveAttribute("data-bottom", "white");
});

test("a flipped board shows a loaded position from black's side with the same marks the fixture gives", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("f");
  await page.fill("#fen-input", "4r3/8/8/8/8/1k6/4R1P1/4K3 w - - 0 1");
  await page.click("#load-fen");
  await expect(page.locator("[data-piece]")).toHaveCount(5);
  expect((await drawingOrder(page))[0]).toBe("h1");
  expect(await square(page, "c2").locator("[data-tally='white'] .mark").count()).toBe(1);
  expect(await square(page, "c2").locator("[data-tally='black'] .mark").count()).toBe(1);
  expect(await square(page, "e1").locator("[data-tally='threat'] .mark").count()).toBe(1);
  await expect(page.locator("html")).toHaveAttribute("data-analysed-positions", "2");
});
