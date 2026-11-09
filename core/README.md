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
