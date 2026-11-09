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

wasm-pack is not installed yet; WebAssembly packaging is a later step.

To install the same toolchain on another machine:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable -c clippy -c rustfmt
```

## Crate

`force-core`, a library, GPL-3.0-or-later. Dependencies are pinned to exact versions: shakmaty 0.30.2 (the rules of chess), serde 1.0.229 and serde_json 1.0.154 (the JSON document), sha2 0.11.1 (the configuration key). The tests also use jsonschema 0.61.0 to validate documents against the draft 2020-12 schemas in `contract/schema/`.

The output follows contract version 0.3.0 (`CONTRACT_VERSION` in `src/document.rs`).

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

## Test

```bash
cargo test
```

This runs:

- `tests/fixtures.rs`, the targeted fixture runner. It takes every file in `contract/fixtures/targeted/`, checks it against the fixture schema, and computes the force state of its FEN. It validates the document against the force-state schema and evaluates every assertion. A failure names the fixture, the assertion, what was expected and what was found.
- `tests/snapshots.rs`, which compares the current output for every targeted fixture position with the whole-board snapshot in `contract/fixtures/snapshots/`, byte for byte.
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
