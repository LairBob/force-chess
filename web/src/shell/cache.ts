// A bounded cache of analysed positions, keyed by FEN. The shell keeps a
// parsed force-state document for every position it has shown so that
// stepping back through a game is served without analysing again. Each
// document is tens of kilobytes of heap (docs/measurements/2026-11-09), so
// the cache keeps only the most recently used positions and drops the one
// used longest ago when it is full.
//
// No DOM here: the module is plain data so it can be tested on its own.

/** How many analysed positions the shell keeps. */
export const CACHED_POSITIONS = 64;

export interface PositionCache<T> {
  /** The value for a key, marking it as the most recently used, or undefined. */
  get(key: string): T | undefined;
  /** Stores a value as the most recently used, evicting the least recently used one if the cache is full. */
  set(key: string, value: T): void;
  /** Whether the key is held, without marking it as used. */
  has(key: string): boolean;
  /** The keys held, least recently used first. */
  keys(): string[];
  /** How many entries are held. */
  readonly size: number;
}

/**
 * A least-recently-used cache holding at most `capacity` entries. A hit
 * counts as a use, so a position navigated back to stays while positions
 * passed once drift out.
 */
export function createPositionCache<T>(capacity: number = CACHED_POSITIONS): PositionCache<T> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error(`A position cache needs a whole capacity of at least 1, not ${capacity}.`);
  }
  // A Map iterates in insertion order, so deleting and re-inserting an entry
  // moves it to the end: the first key is always the least recently used.
  const entries = new Map<string, T>();
  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as T;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      if (entries.has(key)) {
        entries.delete(key);
      } else if (entries.size >= capacity) {
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
      entries.set(key, value);
    },
    has(key) {
      return entries.has(key);
    },
    keys() {
      return [...entries.keys()];
    },
    get size() {
      return entries.size;
    },
  };
}
