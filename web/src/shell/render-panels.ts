// Renders a PanelScene: a kicker and a title, then sections as native
// disclosures holding label-value pairs and lists. The words come from the
// projection; nothing is computed here. Each item's L1 status is a badge
// told apart by shape, not hue: filled for legal, outlined for excluded,
// dashed for a reach that exists only after a move.

import type { PanelItem, PanelScene } from "../projections/index.ts";
import { el, replaceChildren } from "./dom.ts";

const BADGES: Record<NonNullable<PanelItem["tone"]>, { text: string; title: string } | null> = {
  legal: { text: "LEGAL", title: "Legal at L1" },
  excluded: { text: "EXCL", title: "Excluded at L1" },
  lookahead: { text: "L2", title: "Only after a move (L2)" },
  plain: null,
};

function renderItem(item: PanelItem): HTMLElement {
  const tone = item.tone ?? "plain";
  const badge = BADGES[tone];
  return el(
    "li",
    { className: `item tone-${tone}` },
    badge ? el("span", { className: `badge badge-${tone}`, title: badge.title }, badge.text) : el("span", { className: "badge-none" }),
    el(
      "span",
      { className: "item-body" },
      el("span", { className: "item-text" }, item.text),
      item.detail ? el("span", { className: "item-detail" }, item.detail) : null,
    ),
  );
}

export function renderPanel(container: HTMLElement, scene: PanelScene | null, placeholder: string): void {
  if (!scene) {
    replaceChildren(container, el("p", { className: "placeholder" }, placeholder));
    return;
  }
  replaceChildren(
    container,
    el(
      "div",
      { className: "panel-head" },
      scene.subtitle ? el("p", { className: "kicker" }, scene.subtitle) : null,
      el("h2", {}, scene.title),
    ),
    ...scene.sections.map((section) => {
      const hasPairs = (section.pairs?.length ?? 0) > 0;
      const items = section.items ?? [];
      const hasItems = items.length > 0;
      // A list's length in the summary line, so a collapsed section still gives its count.
      const summary = hasItems ? `${section.title} · ${items.length}` : section.title;
      return el(
        "details",
        { className: "panel-section", open: true },
        el("summary", {}, summary),
        hasPairs
          ? el(
              "dl",
              { className: "pairs" },
              ...(section.pairs ?? []).flatMap((pair) => [el("dt", {}, pair.label), el("dd", {}, pair.value)]),
            )
          : null,
        hasItems ? el("ul", { className: "items" }, ...items.map(renderItem)) : null,
        !hasItems && section.empty && !(hasPairs && section.items === undefined)
          ? el("p", { className: "empty" }, section.empty)
          : null,
      );
    }),
  );
}
