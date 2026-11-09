| `src/pgn.rs` | Reads the first game of a PGN text into the parsed-game document of `contract/schema/game.schema.json`: headers, starting FEN, and each main-line move with its notation, squares and the FEN after it. Variations, comments and annotation glyphs are skipped. Every refusal names the side, the move number and the move as written. | 6 |
# core

The reference implementation of the analysis side. Rust, built on shakmaty, compiled to WebAssembly for the web shell.

One entry point: a configuration in, the force state out, as JSON conforming to `contract/schema/`. Done means the full fixture corpus in `contract/fixtures/` passes.

Imports nothing from the DOM, any UI framework, or any platform.

## Toolchain

Installed with rustup for the user `laurent` on 2026-11-08, stable channel, minimal profile plus clippy and rustfmt:

| Tool | Version |
|---|---|
| rustup | 1.29.3 |
| rustc | 1.99.1 (58cf8f9c3 2026-10-13) |
| cargo | 1.99.1 (5f94df478 2026-08-27) |
| clippy | 0.1.99 |

For the WebAssembly package, added 2026-11-08:

| Tool | Version |
|---|---|
| wasm-pack | 0.15.1 (`cargo install wasm-pack --locked`) |
| target `wasm32-unknown-unknown` | the stable 1.99.1 `rust-std` component (`rustup target add wasm32-unknown-unknown`) |
| wasm-bindgen | 0.2.130, pinned in `wasm/Cargo.toml`; wasm-pack fetches the matching CLI |

wasm-pack also fetches `wasm-opt` from binaryen on first use and runs it on the output.

To install the same toolchain on another machine:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable -c clippy -c rustfmt
```

## Crate

`force-core`, a library, GPL-3.0-or-later. Dependencies are pinned to exact versions: shakmaty 0.30.2 (the rules of chess), pgn-reader 0.29.1 (the PGN tokeniser from the same author, which depends on shakmaty 0.30 and raises the minimum Rust to 1.97), serde 1.0.229 and serde_json 1.0.154 (the JSON documents), sha2 0.11.1 (the configuration key). The tests also use jsonschema 0.61.0 to validate documents against the draft 2020-12 schemas in `contract/schema/`.

The output follows contract version 0.4.0 (`CONTRACT_VERSION` in `src/document.rs`).

| Module | What it does | Concept |
|---|---|---|
| `src/config.rs` | Reads a FEN. Drops the side to move and the clocks. Normalises castling rights and the en passant target. Builds the canonical string and its SHA-256 key. Refuses boards no game can reach. | 3 |
| `src/geometry.rs` | L0: every reach with its path, batteries, x-rays, lines through the enemy king, and pins. | 4.1 L0 |
| `src/legality.rs` | L1: the single hypothetical-move test, the four reason codes in priority order, and the plain-words sentences. | 4.1 L1, 4.3 |
| `src/moves.rs` | Legal moves for both sides, from shakmaty. A fallback generator covers the one case shakmaty refuses. Also the L2 lookahead entries. | 4.1 L2 |
| `src/document.rs` | The normalised document: L3 valuation, control, side status, constraints, mobility and special moves. | 4.1 L3, 4.2 |
| `src/words.rs` | Names pieces and squares in plain words. | P8 |

Implementation decisions and the chess fine points settled here are recorded in `docs/DECISIONS.md`.

## Build

From `core/`:

```bash
cargo build
```

`core/` is a Cargo workspace of two crates: `force-core` at the root and `force-core-wasm` in `wasm/`.

### The WebAssembly package

`wasm/` is a thin crate, `force-core-wasm`, that depends on `force-core` and wasm-bindgen; `force-core` itself has no platform dependency. It exposes four functions to JavaScript, all passing strings so the JSON contracts are the only shared shapes:

- `analyze(fen)` returns the force-state document as minified JSON.
- `applyMove(fen, from, to, promotion?)` plays one legal move for the side the FEN says is to move, using shakmaty, and returns the new FEN. Castling is asked for as the king's move (e1 to g1). A promotion must name the piece (`queen`, `rook`, `bishop`, `knight`). The en passant field of the returned FEN is written when an enemy pawn stands beside the pawn that just moved two squares, which is the contract's own rule for keeping a target.
- `parseGame(pgn)` reads the first game of a PGN text and returns the parsed-game document as minified JSON.
- `contractVersion()` returns the contract version the documents follow.

A refused FEN, an illegal move or an unusable game throws a `ForceError` with a `code` (`unreadable`, `impossible`, `illegal_move`, `bad_square`, `no_game`) and a `text` sentence in plain words. The core's own sentence is passed through unchanged for a refused configuration.

Build it from `core/`:

```bash
wasm-pack build wasm --target web --release --out-dir pkg
```

The output lands in `core/wasm/pkg/` (not committed): the `.wasm` binary, an ES module loader, and TypeScript declarations. `web/` imports it from there. The release profile at the workspace root optimises for size; the starting point is 834 KB of WebAssembly, most of it shakmaty's attack tables and the serialiser.

Its own tests (`cargo test -p force-core-wasm`) cover the move matching and the error sentences.

## Test

```bash
cargo test
```

This runs:

- `tests/fixtures.rs`, the targeted fixture runner. It takes every file in `contract/fixtures/targeted/`, checks it against the fixture schema, and computes the force state of its FEN. It validates the document against the force-state schema and evaluates every assertion. A failure names the fixture, the assertion, what was expected and what was found.
- `tests/snapshots.rs`, which compares the current output for every targeted fixture position with the whole-board snapshot in `contract/fixtures/snapshots/`, byte for byte.
- `tests/pgn.rs`, the game fixture runner. It reads every `.pgn` in `contract/fixtures/games/` and compares the result with the expected document or refusal beside it. The expected documents of successful imports are rewritten with `FORCE_CORE_UPDATE_GAMES=1 cargo test --test pgn`, then reviewed in git.
- `tests/invariants.rs`, which generates several thousand positions from six varied starting positions. It checks that the fallback move generator agrees with shakmaty, that legal moves agree with L1 reach, and that every sampled document is valid. This test takes about ten seconds in a debug build.
- unit tests on the configuration key and the normalisation rules.

Lint with:

```bash
cargo clippy --all-targets
```

When a change in behaviour is intended and has been reviewed, rewrite the snapshots with the command below. Then read the diff in git before committing it.

```bash
FORCE_CORE_UPDATE_SNAPSHOTS=1 cargo test --test snapshots
```

## See the force state of any position

```bash
cargo run --example force_state -- "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

This prints the document pretty-printed. Add `--compact` for one line. The side to move, the halfmove clock and the fullmove number may be given or left out; they change nothing. A FEN describing a board no game can reach is refused with a sentence saying why.
