// The marks have a shape as well as a colour (concept 7.1): on the
// pin-along-file position at L1 the threat on the knight is a triangle
// pointing down, the defence of the king a triangle pointing up, and each
// side's reach onto an empty square a plain square. The shapes are read
// from the drawn polygons, not from a colour or a class name.

import { expect, test, type Page } from "@playwright/test";

// contract/fixtures/snapshots/pin-along-file.json: the white knight on e3 is pinned by the rook on e8.
const PIN_ALONG_FILE = "4r1k1/8/8/3P4/8/4N3/8/4K3 w - - 0 1";

interface Polygon {
  readonly points: readonly { x: number; y: number }[];
}

function parsePoints(points: string | null): Polygon {
  return {
    points: (points ?? "")
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number))
      .map(([x, y]) => ({ x: x ?? Number.NaN, y: y ?? Number.NaN })),
  };
}

/** The polygons of the marks on one square, in the row they belong to. */
async function polygons(page: Page, square: string, meaning: string): Promise<Polygon[]> {
  const drawn = await page
    .locator(`[data-square="${square}"] [data-tally="${meaning}"] .mark polygon`)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("points")));
  return drawn.map(parsePoints);
}

/** "down" when the lone vertex of a triangle is below the other two, "up" when it is above, "square" for four corners. */
function shape(polygon: Polygon): "down" | "up" | "square" | "other" {
  const points = polygon.points;
  if (points.length === 4) return "square";
  if (points.length !== 3) return "other";
  const ys = points.map((p) => p.y);
  const lone = ys.find((y) => ys.filter((other) => other === y).length === 1);
  if (lone === undefined) return "other";
  const rest = ys.filter((y) => y !== lone);
  return lone > Math.max(...rest) ? "down" : lone < Math.min(...rest) ? "up" : "other";
}

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("html[data-ready='true']")).toBeAttached({ timeout: 20_000 });
}

test("threats point down, defences point up and side reach is square, one mark per unit", async ({ page }) => {
  await ready(page);
  await page.fill("#fen-input", PIN_ALONG_FILE);
  await page.click("#load-fen");
  await expect(page.locator("[data-piece]")).toHaveCount(5);
  await page.getByLabel("L1, legality").check();

  // The rook on e8 threatens the pinned knight: one threat, nothing defends it.
  const threats = await polygons(page, "e3", "threat");
  expect(threats.map(shape)).toEqual(["down"]);
  expect(await polygons(page, "e3", "defence")).toEqual([]);
  // The rook defends its king on g8 along the back rank: one defence.
  const defences = await polygons(page, "g8", "defence");
  expect(defences.map(shape)).toEqual(["up"]);
  // e6 is empty and reached by the white knight and the black rook: one square mark each.
  const white = await polygons(page, "e6", "white");
  expect(white.map(shape)).toEqual(["square"]);
  expect((await polygons(page, "e6", "black")).map(shape)).toEqual(["square"]);
  // f8: two black pieces reach it, two square marks, and no white one.
  expect((await polygons(page, "f8", "black")).map(shape)).toEqual(["square", "square"]);
  expect(await polygons(page, "f8", "white")).toEqual([]);
  // The three shapes are three different drawings, and every mark is the same size.
  const drawings = new Set([threats[0], defences[0], white[0]].map((p) => JSON.stringify(p?.points)));
  expect(drawings.size).toBe(3);
  const sizes = await page
    .locator("#board .mark")
    .evaluateAll((nodes) => [...new Set(nodes.map((n) => `${n.getBoundingClientRect().width}x${n.getBoundingClientRect().height}`))]);
  expect(sizes).toEqual(["8x8"]);

  // The legend draws the same three shapes it explains, in the order of the rows.
  const legend = await page.locator("#legend .mark polygon").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("points")));
  expect(legend.map((points) => shape(parsePoints(points)))).toEqual(["down", "up", "square", "square"]);
});

test("a seventh mark in a row starts a new line under the first six", async ({ page }) => {
  await ready(page);
  // Eight white pieces reach the rook on d4 at L0: the queen on d1, the rooks on a4 and h4, the bishops on c3
  // and e5, the knights on b3 and f3 and the pawn on e3. The count is read from the page; the wrap is what is asserted.
  await page.fill("#fen-input", "6k1/8/8/4B3/R2R3R/1NB1PN2/8/3Q2K1 w - - 0 1");
  await page.click("#load-fen");
  await expect(page.locator("[data-piece]")).toHaveCount(11);
  const marks = page.locator("[data-square='d4'] [data-tally='defence'] .mark");
  const count = await marks.count();
  expect(count).toBeGreaterThan(6);
  const tops = await marks.evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().top)));
  expect(new Set(tops.slice(0, 6)).size).toBe(1);
  expect(tops[6]).toBeGreaterThan(tops[0] ?? 0);
});
