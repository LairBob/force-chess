# web

The representation side: projections and the web shell. TypeScript, Vite, GPL-3.0-or-later.

Projections are pure mappings from configuration, force state, optional associations and optional interaction context to a declarative scene description (concept section 7). The shell renders scene descriptions and provides the board, input, navigation and import.

The first projection is the raw-values projection (concept 7.1): red tallies for threats and green for defences on occupied squares, side-coloured tallies on empty squares, exact figures in the piece and square panels and on hover. It is built first and never removed.

## Layout

| Path | What it is | Imports the DOM? |
|---|---|---|
| `src/contract/` | `force-state.ts` is generated from `contract/schema/force-state.schema.json` by `npm run contract:types` and is not committed. `index.ts` re-exports it and holds the 64 square names. | No |
| `src/record/` | The game record (concept section 6): a list of FENs connected by moves, with a cursor. First, previous, next, last, jump; playing from the middle discards what followed. | No |
| `src/projections/` | Pure functions from (force state, interaction context) to scene descriptions: the raw-values board (`raw-values.ts`), the current-piece and current-square panels (`panels.ts`), and the plain words they use (`words.ts`). | No |
| `src/core/` | Loads the WebAssembly package from `core/wasm/pkg/` and wraps its two calls. The only module that knows the package exists. | Yes |
| `src/shell/` | Renders scenes into the page and owns the state: board, layer selector, FEN input, panels, move list, keyboard navigation. | Yes |
| `tests/` | Vitest: the game record, and the projections against the whole-board snapshots in `contract/fixtures/snapshots/`. | No |
| `e2e/` | The Playwright smoke test of the built site in chromium. It also takes the screenshots in `docs/screenshots/`. | - |

`tsconfig.pure.json` typechecks `src/contract`, `src/record` and `src/projections` without the DOM library, so an import from the DOM there fails to compile.

## Install

Node 22 and npm. The Rust toolchain, `wasm-pack` and the `wasm32-unknown-unknown` target as recorded in `core/README.md`.

```bash
npm install
```

The chromium used by the smoke test is downloaded once with `npx playwright install chromium`; on a bare Linux machine its system libraries are installed with `sudo npx playwright install-deps chromium`.

## Build the WebAssembly package

The shell imports `core/wasm/pkg/`, which is produced by wasm-pack and not committed. Build it before anything else, and again whenever `core/` changes:

```bash
npm run wasm
```

## Run

```bash
npm run dev
```

Opens a dev server. Paste a FEN into the box and press Load, or put it in the URL after `#`. Click a piece of the side to move, then a destination, to play a move; the arrow keys, Home and End walk the record. Hover any square for its exact figures; click any square to fill the piece and square panels.

## Test

```bash
npm test
```

Runs Vitest. The contract types are regenerated first, so a schema change that breaks a projection fails here.

```bash
npm run test:e2e
```

Builds the site, serves it with `vite preview` on port 4173, and runs the chromium smoke test. It rewrites the two screenshots under `docs/screenshots/` and prints a `MEASUREMENTS` line with the load time, document size and analysis time of the starting position.

## Build

```bash
npm run build
```

Typechecks both configurations, then writes a static site to `dist/` that loads the WebAssembly module relatively, so it can be served from any path.
