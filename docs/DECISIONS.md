# Decisions

Implementation decisions, newest last. Concept-level decisions live in `docs/concept/FORCE_CHESS_CONCEPT.md` and are not repeated here.

## 2026-11-08

- **Fresh repository.** New work starts here, structured by the concept document's layers (contract, core, web). The two earlier repositories (`force-chess-claude`, TypeScript; the September 2025 vanilla-JS attempt, since renamed) are archived. Nothing in either is canonical.
- **Rules library: shakmaty. Licence: GPL-3.0-or-later.** Chosen on completeness (SAN, FEN, pin and checker helpers, Zobrist hashing), maintenance, and production pedigree at Lichess. cozy-chess (MIT) was the alternative; it lacks SAN and has been quiet since 2024. Laurent was indifferent on licence.
- **Analysis side in Rust, compiled to WebAssembly. Representation side in TypeScript.** The contract between them is JSON. The Rust implementation is the reference implementation.
- **Python is out of scope in every form.** No sandbox, no bindings, no structure chosen to accommodate it. Laurent's explicit instruction.
- **Contract first.** The force-state schema and the first hand-written fixtures are written and reviewed before any Rust.
