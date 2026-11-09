# web

The representation side: projections and the web shell. TypeScript, Vite, GPL-3.0-or-later.

Projections are pure mappings from configuration, force state, optional associations and optional interaction context to a declarative scene description (concept section 7). The shell renders scene descriptions and provides the board, input, navigation and import.

The first projection is the raw-values projection (concept 7.1): red tallies for threats and green for defences on occupied squares, side-coloured tallies on empty squares, exact figures in the piece and square panels and on hover. It is built first and never removed.

## Layout

| Path | What it is | Imports the DOM? |
|---|---|---|
| `src/contract/` | `force-state.ts` and `game.ts` are generated from the schemas in `contract/schema/` by `npm run contract:types` and are not committed. `index.ts` re-exports them and holds the 64 square names. | No |
| `src/record/` | The game record (concept section 6): a list of FENs connected by moves, with a cursor. Built from one FEN or from a parsed game, whose notation and headers it keeps. First, previous, next, last, jump; playing from the middle discards what followed. | No |
| `src/projections/` | Pure functions from (force state, interaction context) to scene descriptions: the raw-values board (`raw-values.ts`), the current-piece and current-square panels (`panels.ts`), the readout strip (in `raw-values.ts`), the interaction context with the board orientation and its drawing order (`context.ts`), and the plain words they use (`words.ts`). | No |
| `src/core/` | Loads the WebAssembly package from `core/wasm/pkg/` and wraps its three calls: analyse a FEN, apply a move, parse a game. The only module that knows the package exists. | Yes |
| `src/shell/` | Renders scenes into the page and owns the state: board, layer selector, FEN and PGN inputs, panels, move list, keyboard navigation. | Yes |
| `tests/` | Vitest: the game record against the game fixtures in `contract/fixtures/games/`, and the projections against the whole-board snapshots in `contract/fixtures/snapshots/`. | No |
| `e2e/` | The Playwright smoke tests of the built site in chromium: `smoke.spec.ts` for the board, the FEN input and moves made by hand, `pgn.spec.ts` for an imported game, `flip.spec.ts` for the board seen from black's side. They also take the screenshots in `docs/screenshots/`. | - |

`tsconfig.pure.json` typechecks `src/contract`, `src/record` and `src/projections` without the DOM library, so an import from the DOM there fails to compile.

## Design system

The shell follows Instrument v0.1, the design system on the Design canvas "Force Chess Design System" (2026-11-09). Its values are the `:root` tokens at the top of `src/shell/styles.css`: neutral greys, one interaction blue, and the four mark colours of concept 7.1, each with the edge colour that keeps it visible on both square shades.

### Pieces

The pieces are the mpchess SVG set by Maxime Chupin (GPL-3.0), under `public/pieces/mpchess/` with a `LICENSE` notice beside the files naming the author, the licence as the source states it, the repository and the commit the files were copied from. Each piece is drawn as an image at 46px with alt text such as "White rook" and a `data-piece` attribute.

### Fonts

IBM Plex Sans for words, IBM Plex Mono for figures, FEN and notation, and Inter ExtraBold for the square names on the board. They are vendored, not fetched from Google Fonts: an analysis board is opened offline and on machines that block font hosts, a page that asks a third party for its fonts falls back to the system font there and the figures would then be set in whatever monospace the machine has, and loading them from a host would also tell that host every time the board is opened. The vendoring goes through the fontsource packages (`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `@fontsource/inter`, SIL Open Font License 1.1, pinned in `package.json`) rather than through files committed under `public/fonts/`, so the binaries, their licence texts and their versions are tracked by npm like any other dependency and nothing binary is committed. `src/shell/fonts.ts` imports the Latin subset of only the weights the shell uses (Plex Sans 400, 500, 600; Plex Mono 400, 500; Inter 800), which Vite copies into `dist/`: six woff2 files, 128 KB in all, with their woff fallbacks beside them, against an 866 KB WebAssembly module.

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

Opens a dev server. Paste a FEN into the box and press Load, or put it in the URL after `#`. Open "Load a game (PGN)" at the bottom of the Moves panel, paste a game in PGN into its box and press Load game: the Moves panel then names the players, event, date and result on one line and lists the moves as the text wrote them; click any move to see the position after it. Only the first game of a text is loaded, and the line says how many there were. Click a piece of the side to move, then a destination, to play a move; the arrow keys, Home and End walk the record. Hover any square and the readout strip under the board shows its exact figures at the selected layer; when the pointer leaves the board the strip keeps the selected square's figures. Click any square to fill the piece and square panels, whose sections fold with a click on their heading. Press Flip board, at the right end of the layer selector's row, or the `f` key, to look at the position from black's side; the button's tooltip says which side is at the bottom, and flipping changes only where each square is drawn, nothing about the position or the marks.

## Test

```bash
npm test
```

Runs Vitest. The contract types are regenerated first, so a schema change that breaks a projection fails here.

```bash
npm run test:e2e
```

Builds the site, serves it with `vite preview` on port 4173, and runs the chromium smoke tests. It prints a `MEASUREMENTS` line with the load time, document size and analysis time of the starting position. The PGN test loads the same WebAssembly package in Node to compute what the board at a chosen move must show, so the page is checked against the core and not by eye.

The three screenshots under `docs/screenshots/` (`starting-position-L0`, `pinned-rook-L1`, and `imported-game-L0`, the short game of the fixtures three moves in) show the measured analysis time, so they differ on every run. They are rewritten only on request, and the rewrite is reviewed in git like any other change in what the page shows:

```bash
FORCE_CHESS_SCREENSHOTS=1 npm run test:e2e
```

## Build

```bash
npm run build
```

Typechecks both configurations, then writes a static site to `dist/` that loads the WebAssembly module relatively, so it can be served from any path.
