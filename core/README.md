# core

The reference implementation of the analysis side. Rust, built on shakmaty, compiled to WebAssembly for the web shell.

One entry point: a configuration in, the force state out, as JSON conforming to `contract/schema/`. Done means the full fixture corpus in `contract/fixtures/` passes.

Imports nothing from the DOM, any UI framework, or any platform.
