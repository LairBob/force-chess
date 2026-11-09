# contract

The language-neutral specification of the force model.

- `schema/` — the force-state schema: the shape of the data the analysis side produces for a configuration. Written from sections 3 and 4 of the concept document.
- `fixtures/` — the corpus any implementation must pass. Two granularities (concept 4.5): hand-written targeted assertions about particular squares and pieces in particular positions, and whole-board snapshots generated from the reference implementation once the targeted assertions pass.

Nothing here computes anything. Nothing here depends on a language, a framework, or a platform.
