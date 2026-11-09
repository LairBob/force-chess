// Renders a PanelScene: a title, then sections of label-value pairs and
// lists. The words come from the projection; nothing is computed here.

import type { PanelScene } from "../projections/index.ts";
import { el, replaceChildren } from "./dom.ts";

export function renderPanel(container: HTMLElement, scene: PanelScene | null, placeholder: string): void {
  if (!scene) {
    replaceChildren(container, el("p", { className: "placeholder" }, placeholder));
    return;
  }
  replaceChildren(
    container,
    el("h2", {}, scene.title),
    scene.subtitle ? el("p", { className: "subtitle" }, scene.subtitle) : null,
    ...scene.sections.map((section) => {
      const hasPairs = (section.pairs?.length ?? 0) > 0;
      const hasItems = (section.items?.length ?? 0) > 0;
      return el(
        "section",
        { className: "panel-section" },
        el("h3", {}, section.title),
        hasPairs
          ? el(
              "dl",
              { className: "pairs" },
              ...(section.pairs ?? []).flatMap((pair) => [el("dt", {}, pair.label), el("dd", {}, pair.value)]),
            )
          : null,
        hasItems
          ? el(
              "ul",
              { className: "items" },
              ...(section.items ?? []).map((item) =>
                el(
                  "li",
                  { className: `item tone-${item.tone ?? "plain"}` },
                  el("span", { className: "item-text" }, item.text),
                  item.detail ? el("span", { className: "item-detail" }, item.detail) : null,
                ),
              ),
            )
          : null,
        !hasItems && section.empty && !(hasPairs && section.items === undefined)
          ? el("p", { className: "empty" }, section.empty)
          : null,
      );
    }),
  );
}
