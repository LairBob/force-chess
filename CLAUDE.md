# Force Chess

Browser-based chess analysis board whose product is a logical "force state": for every square and piece, who can act on it, who threatens and protects it, what constrains it, and why. Every visual is a projection of that state.

## Authority

`docs/concept/FORCE_CHESS_CONCEPT.md` is authoritative. If code or another document disagrees with it, the concept document wins and the disagreement is raised, not papered over. Changes to the concept document are made only with Laurent's explicit agreement and are versioned in its header.

## Layout

- `contract/` — force-state schema and fixture corpus. Language-neutral data. No code that computes anything.
- `core/` — Rust reference implementation on shakmaty, compiled to WebAssembly. Configuration in, force state out.
- `web/` — TypeScript projections and web shell.
- `docs/DECISIONS.md` — implementation decision log, append-only.

`contract/` and `core/` import nothing from the DOM, any UI framework, or any platform.

## Rules that are not negotiable

- **Chess correctness is canonical** (concept P7). Every rule and fine point is implemented as the standard rules state it, bought from shakmaty where it exists. Never ask Laurent to adjudicate a chess fine point; decide it against the standard, record it in a fixture, and tell him what was decided.
- **Laurent is a chess novice** (concept P8). Every state, reason, and message is written in plain words with named pieces and squares. Chess terms are used correctly and explained once.
- **Raw values before design** (concept 7.1). Every quantity the model computes is visible as raw tallies and label-value pairs from the day it exists. Designed lenses come later and are compared against the raw projection.
- **Python is out of scope in every form.** Do not propose it.

## Working method

- Contract first: a change to what the model reports starts as a schema change and a fixture, then code.
- Fixtures are behaviour: targeted assertions pin down each rule; whole-board snapshots catch regressions. No test that asserts a constant equals itself, a CSS class name, or that a component renders.
- Narrow commits, one logical change each. No emojis in code or commit messages.
- Before claiming work complete: the fixture corpus passes, the build succeeds, and for UI changes the raw projection has been looked at in a browser.
- After a visual change, look at the raw projection in a browser, not only the tests: open the dev server or the preview, check the starting position, the pinned-rook position and an imported game at each layer, and read the regenerated screenshots. Tests pin counts and shapes; they do not see that a mark sits under a piece or a panel overflows.

## Toolchain

Rust stable with `wasm-pack` for `core/`; Node 22 with npm for `web/`. Install state on a given machine is checked, not assumed.
