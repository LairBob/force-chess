// The control lens is checked against the raw values it is drawn over
// (concept 7.1): on every one of the 64 squares, the fill the page draws is
// compared with the tally marks on the same square. A square tinted white
// must carry more white-side marks than black-side ones, a black tint the
// other way, hatching marks of both sides, and no tint no marks; the step
// must be the size of the lead, capped at three. The lens is a view: it is
// not in the URL hash, it draws nothing at L2, and it leaves the marks alone.

import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const SCREENSHOTS = fileURLToPath(new URL("../../docs/screenshots/", import.meta.url));
const WRITE_SCREENSHOTS = process.env["FORCE_CHESS_SCREENSHOTS"] === "1";

const PINNED_ROOK = "4r3/8/8/8/8/1k6/4R1P1/4K3 w - - 0 1";
// Kiwipete (docs/measurements/corpus.fen): every piece on, batteries, pins, and squares of every class.
const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

interface DrawnSquare {
  piece: string | null;
  fill: string | null;
  step: number;
  contested: boolean;
  marks: Record<string, number>;
  /** The computed background layers, to check that a fill is actually painted. */
  background: string;
}

/** Every square as the page draws it: the piece, the fill attributes, the mark count per meaning and the painted background. */
async function drawnBoard(page: Page): Promise<Record<string, DrawnSquare>> {
  return page.evaluate(() => {
    const result: Record<string, DrawnSquare> = {};
    for (const node of document.querySelectorAll<HTMLElement>("#board [data-square]")) {
      const marks: Record<string, number> = {};
      for (const row of node.querySelectorAll<HTMLElement>("[data-tally]")) {
        marks[row.dataset["tally"] ?? ""] = row.querySelectorAll(".mark").length;
      }
      result[node.dataset["square"] ?? ""] = {
        piece: node.querySelector<HTMLElement>("[data-piece]")?.dataset["piece"] ?? null,
        fill: node.dataset["fill"] ?? null,
        step: Number(node.dataset["fillStep"] ?? "0"),
        contested: node.dataset["contested"] === "true",
        marks,
        background: getComputedStyle(node).backgroundImage,
      };
    }
    return result;
  });
}

/** The marks of each side on a square: side marks on an empty square, threats and defences by the occupant's colour. */
function sideMarks(square: DrawnSquare): { white: number; black: number } {
  const count = (meaning: string) => square.marks[meaning] ?? 0;
  if (square.piece === null) return { white: count("white"), black: count("black") };
  const friendly = square.piece.startsWith("white") ? "white" : "black";
  const threats = count("threat");
  const defences = count("defence");
  return friendly === "white" ? { white: defences, black: threats } : { white: threats, black: defences };
}

/** Checks every square's fill against its marks. Returns the number of squares that carried a tint or hatching. */
function checkAgainstMarks(board: Record<string, DrawnSquare>): number {
  expect(Object.keys(board)).toHaveLength(64);
  let drawn = 0;
  for (const [name, square] of Object.entries(board)) {
    const { white, black } = sideMarks(square);
    expect(square.fill, name).not.toBeNull();
    switch (square.fill) {
      case "white":
        expect(white, `${name}: white tint needs more white marks`).toBeGreaterThan(black);
        break;
      case "black":
        expect(black, `${name}: black tint needs more black marks`).toBeGreaterThan(white);
        break;
      case "even":
        expect(white, `${name}: even needs marks of both sides`).toBeGreaterThan(0);
        expect(white, `${name}: even needs equal marks`).toBe(black);
        break;
      case "none":
        expect(white + black, `${name}: no tint means no marks`).toBe(0);
        break;
      default:
        throw new Error(`${name}: unexpected fill ${square.fill}`);
    }
    expect(square.step, `${name}: step is the lead capped at three`).toBe(Math.min(3, Math.abs(white - black)));
    expect(square.contested, `${name}: hatching means both sides reach it`).toBe(white > 0 && black > 0);
    // What is named is painted: a tint or a hatch is a gradient layer of the background, and a plain square has none.
    const painted = square.background.includes("gradient");
    expect(painted, `${name}: ${square.fill} step ${square.step} ${square.contested ? "hatched" : ""} painted? ${square.background}`).toBe(
      square.step > 0 || square.contested,
    );
    if (painted) drawn += 1;
  }
  return drawn;
}

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("html[data-ready='true']")).toBeAttached({ timeout: 20_000 });
}

async function loadFen(page: Page, fen: string): Promise<void> {
  await page.fill("#fen-input", fen);
  await page.click("#load-fen");
  await expect(page.locator("#fen-input")).toHaveValue(fen);
}

test("every square's fill agrees with its marks, on three positions at L0 and L1", async ({ page }) => {
  await ready(page);
  // The raw values draw no fill at all.
  const raw = await drawnBoard(page);
  expect(Object.values(raw).every((square) => square.fill === null && !square.background.includes("gradient"))).toBe(true);
  await expect(page.locator("#lens-note")).toBeHidden();

  await page.getByLabel("Control").check();
  await expect(page.locator("#lens-note")).toContainText("tinted for the side with more pieces");
  // Switching the lens analyses nothing again and changes no mark.
  expect(await page.locator("html").getAttribute("data-analysed-positions")).toBe("1");
  const lens = await drawnBoard(page);
  for (const [name, square] of Object.entries(lens)) expect(square.marks, name).toEqual(raw[name]?.marks);

  for (const fen of [null, PINNED_ROOK, KIWIPETE]) {
    if (fen) await loadFen(page, fen);
    for (const layer of ["L0, geometry", "L1, legality"]) {
      await page.getByLabel(layer).check();
      const drawn = checkAgainstMarks(await drawnBoard(page));
      expect(drawn, `${fen ?? "starting position"} at ${layer}`).toBeGreaterThan(20);
    }
  }
});

test("the lens names the fill in the readout, the panel and the legend, and draws nothing at L2", async ({ page }) => {
  await ready(page);
  await loadFen(page, KIWIPETE);
  await page.getByLabel("Control").check();
  // The legend gains the three steps of each side and the hatching after the marks.
  const legendLabels = page.locator("#legend dt");
  await expect(legendLabels).toHaveCount(11);
  await expect(legendLabels.nth(4)).toHaveText("White tint, by one");
  await expect(legendLabels.nth(10)).toHaveText("Hatched");
  await expect(page.locator("#legend .swatch")).toHaveCount(7);

  // d5: the white pawn is reached by three black pieces and defended by two: contested, black ahead by one.
  const d5 = page.locator("[data-square='d5']");
  await expect(d5).toHaveAttribute("data-fill", "black");
  await expect(d5).toHaveAttribute("data-fill-step", "1");
  await expect(d5).toHaveAttribute("data-contested", "true");
  await d5.hover();
  const readout = page.locator("#readout");
  await expect(readout).toContainText("Control at L0 contested");
  await expect(readout).toContainText("Lens at L0 contested, black ahead by 1, tint by one, hatched");
  await d5.click();
  await expect(page.locator("#square-panel")).toContainText("At L0: Contested, black ahead by 1 piece: black tint by one, hatched.");
  // g2: the pawn is reached by one piece of each side: even, hatched, no tint.
  await expect(page.locator("[data-square='g2']")).toHaveAttribute("data-fill", "even");
  await expect(page.locator("[data-square='g2']")).toHaveAttribute("data-fill-step", "0");

  // At L2 the lens stays chosen, draws nothing, and says why; the legend drops the fills.
  await page.getByLabel("L2, lookahead").check();
  await expect(page.locator("#lens-note")).toContainText("L0 and L1 only");
  await expect(page.locator("#board [data-fill]")).toHaveCount(0);
  await expect(page.locator("#legend .swatch")).toHaveCount(0);
  await expect(page.getByLabel("Control")).toBeChecked();
  await page.getByLabel("L1, legality").check();
  await expect(page.locator("#board [data-fill]")).toHaveCount(64);

  // The lens is a view, not a position: the URL hash holds the FEN and nothing about the lens.
  expect(decodeURIComponent(page.url().split("#")[1] ?? "")).toBe(KIWIPETE);
  await page.reload();
  await expect(page.locator("html[data-ready='true']")).toBeAttached({ timeout: 20_000 });
  await expect(page.getByLabel("Raw values")).toBeChecked();
});

test("the pinned rook under the control lens at L1", async ({ page }) => {
  await ready(page);
  await loadFen(page, PINNED_ROOK);
  await page.getByLabel("L1, legality").check();
  await page.getByLabel("Control").check();
  // The rook on e2 is pinned by the rook on e8. At L0 the king defends it and the black rook reaches it: even.
  // At L1 the king's recapture is excluded (the king would step into the black rook's line), so black is
  // ahead by one and the square is no longer contested.
  await page.getByLabel("L0, geometry").check();
  await expect(page.locator("[data-square='e2']")).toHaveAttribute("data-fill", "even");
  await page.getByLabel("L1, legality").check();
  await expect(page.locator("[data-square='e2']")).toHaveAttribute("data-fill", "black");
  await expect(page.locator("[data-square='e2']")).toHaveAttribute("data-fill-step", "1");
  await expect(page.locator("[data-square='e2']")).toHaveAttribute("data-contested", "false");
  // Nothing reaches c2 at L1, so it has no tint; the king alone reaches a3, black by one.
  await expect(page.locator("[data-square='c2']")).toHaveAttribute("data-fill", "none");
  await expect(page.locator("[data-square='a3']")).toHaveAttribute("data-fill", "black");
  await expect(page.locator("[data-square='a3']")).toHaveAttribute("data-fill-step", "1");
  await page.locator("[data-square='e2']").click();
  await page.mouse.move(5, 5);
  await expect(page.locator("#square-panel")).toContainText("Control lens");
  if (WRITE_SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}control-lens-L1.png` });
});
