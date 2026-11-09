# Force Chess: assessment of both attempts and a top-down restatement of the concept

Date: 2026-11-08
Status: assessment complete. Decision 1 in section 7 is confirmed; the refined concept lives in `docs/concept/FORCE_CHESS_CONCEPT.md`. Nothing here is a plan.

## 1. What exists

Two repositories, both authored by Laurent with Claude Code, both bottom-up attempts at the same idea. Neither is Python.

| | `LairBob/force-chess` ("A") | `LairBob/force-chess-claude` ("B") |
|---|---|---|
| Period | 2025-09-10 to 2025-09-11, plus a merge today | 2025-11-27 to 2026-05-03 |
| Stack | Vanilla JS, HTML, CSS. No build, no deps, no tests | React 19, TypeScript strict, Vite, chess.js, react-chessboard, Vitest, Playwright |
| Size | ~3,300 lines JS, one 2,500-line `ChessBoard` class | ~1,500 lines source, ~1,800 lines tests, 151 tests green |
| Rules engine | Hand-rolled. No castling, en passant, promotion, checkmate or stalemate detection | chess.js. Complete rules, FEN, PGN |
| Differentiator | Built first. Per-square reach, threat/protection balance, immediate vs potential threats, pins, info panels | Not started. Planned as Phase 4, specified as a scalar heatmap |
| Spec material | `dev-guides/state-logic-framework.md`, `docs/architecture-guide.md`, `docs/user-guide.md`, user-written principles at the foot of `CLAUDE.md` | `docs/charter/PROJECT_CHARTER.json`, `docs/research/visualization.md`, `PROJECT_PROGRESS.json` |

The two attempts inverted each other. A built the interesting part on a broken foundation. B built a sound foundation and never reached the interesting part.

## 2. The concept, reconstructed from both

The artifacts do not contain the vision in Laurent's own words except for four bullets at the end of A's `CLAUDE.md`. Everything else was written by Claude from prompts. So what follows is an inference from the union of both repos, to be corrected.

### 2.1 The one-sentence version

Force Chess is a chess board that makes the latent forces in a position visible: for every square and every piece, who can reach it, who threatens it, who protects it, what constrains it, and how that will change.

### 2.2 What "force" means in each attempt

The attempts disagree on this, and it is the central thing to settle.

**A treats force as a multi-dimensional state.** Each square and each piece carries a record of named logical states: reach by colour with a reason when reach is blocked ("blocked path", "friendly occupied", "would expose king"), threat versus protection counts on occupied squares, immediate versus potential (one-ply lookahead) threat, pinned, movable, check-resolving, high-value. The state-logic framework document enumerates these states with dependencies, exclusivity rules and display precedence. The board shows them as four corner indicators per square, and two info panels (current piece, current square) spell out every state in words and lists.

**B treats force as a scalar.** One number per square: white attackers minus black attackers, mapped to a green/red/yellow ramp. This is the tlee753/chess-visualizer idea, copied into the research doc.

A's model is richer and matches the name. B's is a single lens that A's model can produce as a derived view. My read is that A's model is the vision and B's heatmap is one projection of it.

### 2.3 The principle Laurent actually wrote down

The four user-authored bullets in A's `CLAUDE.md` say, in effect:

1. Visual properties for each category of logical state must be modular and changeable without touching game logic.
2. Thumbnails in the info panels must reflect the same logical state as the board.
3. The piece panel and the square panel must offer closely aligned information and formatting.
4. Every aspect of the state logic must be explicitly visible in the info panels. Add state, and the panel must describe it.

Read together, these are one architectural commitment: **the logical state model is the product. Every visual is a projection of it, and nothing is shown that the model does not name.** That is the top-down idea. Neither attempt implemented it, because in A the state lives in DOM class names and in B it does not exist yet.

### 2.4 What the artifacts leave undetermined

These are the gaps a top-down spec has to close, and most of them only Laurent can answer.

- **Who it is for.** A's `CLAUDE.md` says "single-player casual gaming" with an AI opponent and OAuth game history. B's charter says "educational and analytical". These lead to different products. An analysis board for understanding positions needs no opponent, no clock, no accounts. A game needs all three eventually.
- **Reach versus attack.** A counts legal moves to a square as reach, which excludes pinned pieces and excludes pawns' diagonal control of empty squares. B counts attackers, which includes both. Chess "control" is normally attack-based, not move-based. The choice changes every number on the board.
- **Counted or weighted.** Both attempts count pieces. Neither weights by value or computes the outcome of an exchange on a square. A pawn and a queen attacking the same square are not the same force.
- **Lookahead.** A's "potential threat" is one ply (squares a piece could attack after one legal move). The user guide claims two. Whether lookahead is part of the core concept, and how deep, decides most of the computational cost and much of the visual noise.
- **Batteries and x-rays.** Neither attempt counts a rook behind a rook, or a bishop behind a queen. For "force" this is a large omission.
- **Time.** Nothing in either attempt shows how force changes across a game or across a candidate move. B's research doc mentions a "what-if preview" on hover and nothing more.
- **Variations.** B deliberately drops PGN variations. An analysis tool eventually needs a move tree, not a list.

## 3. Diagnosis: why bottom-up stalled twice

**A** had the concept but no foundation. The rules engine is incomplete, logic and DOM are fused in one class, the potential-threat calculation mutates the live board during simulation, and there are no tests. The force model cannot be changed safely, so it froze on 2025-09-11.

**B** had the foundation but spent all of it on commodity. Seven months and 49 commits produced a competent wrapper around chess.js and react-chessboard that any chess site already offers. The charter put the differentiator at priority 3 behind "playable chess" and "notation", and the phase plan honoured that order. The one spec for the differentiator is a thin scalar borrowed from a reference project. The concept vocabulary from A is entirely absent from B.

**Both** share the real omission: the force model was never defined as a pure function from position to per-square and per-piece records, with a corpus of positions and expected outputs. Without that, there was nothing for the top-down vision to attach to, and each session built whatever was adjacent to the last commit.

## 4. A top-down restatement (draft)

Statements for Laurent to accept, amend or strike.

**Concept.** Force Chess makes the forces acting on every square and every piece explicit and visible, so that a player can see the structure of a position rather than infer it.

**Core tenet.** There is one position-analysis model. It is pure: position in, a complete set of named per-square and per-piece states out. Every visual, every panel, every tooltip is a projection of that output. If the model does not name a state, the UI cannot show it. If the model names a state, the UI must be able to show it.

**Layers, from inside out.**

1. **Rules kernel.** Legal moves, check, game end, FEN, PGN. Commodity. Bought, not built. (chess.js today; replaceable behind an interface.)
2. **Force model.** The intellectual property. Named states and quantities per square and per piece, with provenance (which pieces produce each state, and why a piece that looks like it should reach a square does not).
3. **Game record.** Move history, navigation, later a variation tree. Pure, no UI.
4. **Projections.** Lenses over the force model's output: heatmap, corner indicators, info panels, numeric overlays, diffs between two positions. Each lens is a pure mapping from model output to a declarative description of what to draw.
5. **Shell.** The thing that draws and hosts. Web first. Mobile later if ever.

**Portability rule.** Layers 1 to 4 import nothing from the DOM, React, or any platform. Their inputs and outputs are plain data that serialise to JSON. This is the whole of the mobile requirement: it costs nothing now and keeps React Native, Capacitor, or a plain PWA all open.

**Verification rule.** The force model is specified by a language-neutral fixture corpus: position (FEN) in, expected per-square and per-piece states out. Any implementation in any language must pass it. This is what makes the model evolvable without a UI and makes a future port cheap.

## 5. The language question

Laurent raised whether this should be built in Python. Neither existing repo is, so the question is open rather than a reversal.

- The force model has to run where the board is drawn, on every move and ideally on every hover. In a browser that means JavaScript or WebAssembly. Python in the browser (Pyodide) is a 10 MB download with slow start and awkward interop. Python on a server means a round trip per position, no offline use, and hosting to run. Both are poor fits for a real-time overlay.
- The computation itself is small. Attack maps over 64 squares with one-ply lookahead is well within TypeScript's reach at interactive rates. There is no performance case for a lower-level language yet.
- Python is excellent for the research side. python-chess makes it cheap to prototype force-model variants and generate the fixture corpus. That is a legitimate role for a Python sandbox, if one is wanted, and the corpus is how it stays in sync with the shipping core.
- If a native or high-performance core is ever justified, the route is Rust compiled to WebAssembly for the web and linked natively on mobile. Not Python. That decision does not need to be made now and the portability rule above keeps it available.

Recommendation: TypeScript for layers 1 to 4, as a package with no UI dependency. Python optional, for experiments, sharing the fixture corpus.

## 6. Adopt or abandon

Neither repo is the foundation. The foundation is the spec in section 4, which neither contains. Given that:

- **B's shell and discipline are worth keeping.** The toolchain, the test setup, the chess.js and react-chessboard integration, and the game-record work are a sound host. The one structural fix is moving the game-record logic out of the React hook into a pure module, which is small.
- **A's concept material is worth mining and A's code is not.** The state taxonomy, the reach-with-reason idea, the threat/protection balance, the four-corner layout, and the info-panel principle should become the first draft of the force-model spec. The code should be retired.
- The force model should start as a new pure package, specified by fixtures before it has a UI.

This is a recommendation, not a decision. It holds only if section 2.2's reading is right that A's multi-dimensional model is the vision.

## 7. Decisions only Laurent can make

In order of how much they change everything downstream.

1. **Is A's state model the vision, with B's heatmap as one lens over it?** Or is the scalar heatmap the actual idea and A over-built?
   **Confirmed by Laurent, 2026-11-08.** A's multi-dimensional model is the vision; the heatmap is one lens. Laurent added that force state must be a hashable, idempotent function of a board configuration, that strategic associations must be independently materializable, and that all representations translate that abstract state. The refined spec is `docs/concept/FORCE_CHESS_CONCEPT.md`.
2. **Who is this for, in the first version?** Laurent analysing positions; a learner being taught; a casual player wanting a game with overlays. Pick one for v1.
3. **What is the primitive of force: attack or legal reach? Counted or weighted?** This decides the numbers.
4. **Is lookahead part of the core concept?** If yes, how deep, and does it need to be real-time?
5. **Where did "Python" come from?** If there is a third attempt or a notebook somewhere, it belongs in this assessment.
   **Answered 2026-11-08.** Python is Laurent's primary language; the earlier efforts assumed a hands-on relationship with the code. There is no third artifact.
6. **Is the layer model in section 4 right?** Especially the tenet that nothing is shown that the model does not name.

## Appendix: notable facts from the code

- A's `getPiecesInReachOfSquare` reports, for every piece that cannot reach a square, why not. That provenance idea is the most original thing in either repo.
- A's `calculateTacticalPieData` detects defenders by placing a fake enemy piece on the square and asking for legal moves. Correct in spirit, but it mutates the live board and runs a full legal-move generation per friendly piece per square.
- A's `ThreatCalculator.incrementalUpdate` is not correct: it clears threat entries for squares in a radius and re-adds only threats from pieces on those squares, so sliding pieces outside the radius whose lines were opened or closed are missed. In practice the "major change" check forces a full recompute most of the time, which hides the bug.
- B's `useChessGame.getPGN` replays the redo stack into the engine and unwinds it to produce a full-game PGN, because the engine only holds the displayed ply. That is the symptom of the game record living inside the hook.
- B's chess.js 1.4.0 exposes `attackers(square, color)` and react-chessboard 5 exposes `squareRenderer`, so the Phase 4 approach in B's progress file is technically feasible as written. It is just the wrong spec.

## Decisions log (implementation)

- 2026-11-08: New work starts in a fresh repository structured by the spec's layers (contract, core, web shell). Both existing repositories to be archived with a pointer to it. Approved by Laurent.
- 2026-11-08: Rules library shakmaty, licence GPL-3.0. Laurent was indifferent on licence; decided on completeness (SAN, FEN, pin/checker helpers, Zobrist), maintenance and pedigree. Analysis side Rust to WebAssembly; representation side TypeScript.
- 2026-11-08: Python is out of scope in every form. Laurent stated no expectation or intent of a Python sandbox or any Python exploration, and that no structural decision may accommodate Python.
