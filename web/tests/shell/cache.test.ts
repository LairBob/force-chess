import { describe, expect, it } from "vitest";
import { CACHED_POSITIONS, createPositionCache } from "../../src/shell/cache.ts";

describe("position cache", () => {
  it("holds at most its capacity, dropping the least recently used entry", () => {
    const cache = createPositionCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.keys()).toEqual(["a", "b", "c"]);

    cache.set("d", 4);
    expect(cache.size).toBe(3);
    expect(cache.keys()).toEqual(["b", "c", "d"]);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.has("a")).toBe(false);
  });

  it("counts a hit as a use, so a position returned to survives the next eviction", () => {
    const cache = createPositionCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.get("a")).toBe(1);
    expect(cache.keys()).toEqual(["b", "c", "a"]);

    cache.set("d", 4);
    expect(cache.keys()).toEqual(["c", "a", "d"]);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
  });

  it("evicts in order of last use, not of first insertion", () => {
    const cache = createPositionCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.get("b");
    cache.get("a");
    cache.set("c", 3);
    expect(cache.keys()).toEqual(["a", "c"]);
  });

  it("re-setting a held key replaces its value and marks it recent without evicting", () => {
    const cache = createPositionCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    expect(cache.size).toBe(2);
    expect(cache.keys()).toEqual(["b", "a"]);
    expect(cache.get("a")).toBe(10);
    expect(cache.get("b")).toBe(2);
  });

  it("does not count has() as a use", () => {
    const cache = createPositionCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.has("a")).toBe(true);
    cache.set("c", 3);
    expect(cache.keys()).toEqual(["b", "c"]);
  });

  it("defaults to the shell's bound of a few dozen positions", () => {
    const cache = createPositionCache<number>();
    for (let i = 0; i < CACHED_POSITIONS + 10; i += 1) cache.set(`fen ${i}`, i);
    expect(cache.size).toBe(CACHED_POSITIONS);
    expect(cache.has("fen 0")).toBe(false);
    expect(cache.has(`fen ${CACHED_POSITIONS + 9}`)).toBe(true);
  });

  it("refuses a capacity that is not a whole number of at least one", () => {
    expect(() => createPositionCache(0)).toThrow();
    expect(() => createPositionCache(1.5)).toThrow();
  });
});
