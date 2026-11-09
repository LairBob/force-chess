# Force Chess

Force Chess makes the latent forces in a chess position explicit. For every square and every piece it states who can act on it, who threatens it, who protects it, what constrains it, and why. A player sees the structure of a position instead of inferring it.

The product is the logical force state: a pure, content-addressable function of a board configuration. Everything a user sees is a projection of that state.

## Read first

- `docs/concept/FORCE_CHESS_CONCEPT.md` is the authoritative statement of what this is. Every other document and every line of code answers to it.
- `docs/assessment/2026-11-08-concept-assessment.md` records the two earlier attempts and why this repository starts fresh.
- `docs/DECISIONS.md` is the running log of implementation decisions.

## Layout

The repository is organised by the layers in the concept document, not by phases.

| Part | Holds | Depends on |
|---|---|---|
| `contract/` | The force-state schema and the fixture corpus. Language-neutral data. The specification any implementation must satisfy. | nothing |
| `core/` | The reference implementation of the analysis side: configuration in, force state out. Rust, built on shakmaty, compiled to WebAssembly. | `contract/` |
| `web/` | The representation side: projections and the web shell. TypeScript. | `core/` (as a WebAssembly module), `contract/` (for types) |

Nothing in `contract/` or `core/` may import from the DOM, a UI framework, or any platform.

## Status

Concept bracketed 2026-11-08. No implementation yet. The first piece of work is the force-state schema in `contract/`, followed by hand-written fixtures, followed by the Rust core.

## Licence

GPL-3.0-or-later. See `LICENSE`.
