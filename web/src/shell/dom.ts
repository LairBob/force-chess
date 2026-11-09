// A small helper for building DOM nodes. The shell rebuilds what it shows
// from scene descriptions on every change; the board is 64 squares and the
// panels a few hundred lines, so no diffing is needed.

export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === "className") {
      node.className = String(value);
    } else if (value === true) {
      node.setAttribute(name, "");
    } else {
      node.setAttribute(name, value);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function replaceChildren(parent: Element, ...children: Child[]): void {
  parent.replaceChildren(
    ...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false),
  );
}
