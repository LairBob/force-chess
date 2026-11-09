# Force Chess: top-level concept specification

Version 0.5, 2026-11-09 (0.4, 2026-11-08). Concept bracketed: every position in this document is confirmed by Laurent or follows from one that is.

How to read this: the positions in section 10 were first taken as defaults so the spec would be complete, and were all accepted by Laurent on 2026-11-08. They remain listed there so the reasoning behind each stays visible. This document says what the thing is. It does not say how to build it or in what order.

Nothing from the two earlier codebases is canonical. Where this document names an idea from one of them (the four-corner indicators, reach-with-reason, the control heatmap) it is an illustration of a category, not a requirement. Both earlier efforts are treated as complementary false starts whose only lasting contribution is the concept material they surfaced.

## 1. Concept

Force Chess makes the latent forces in a chess position explicit. For every square and every piece it states who can act on it, who threatens it, who protects it, what constrains it, and why. A player sees the structure of a position instead of inferring it.

The product is the logical force state. Everything a user sees is a projection of that state.

## 2. Governing principles

**P1. Force state is a pure function of board configuration.** Given a configuration, the force state is fully determined. Computing it twice yields the same result. It carries no history, no UI state, no player identity. It is content-addressable: the canonical configuration hashes to a key, and the force state is the value at that key.

**P2. Force state is representation-independent.** It is data. It knows nothing of colours, corners, pies, panels, or screens. It must be complete enough that any representation can be built from it without computing anything new about the position.

**P3. Strategic associations are separate, and equally pure.** Openings, named motifs, historical games, engine evaluations, and whatever else the position may be associated with someday are materializable data keyed by the same configuration key. They live beside the force state, never inside it, and never inside a representation.

**P4. Representations are translators.** A projection takes an abstract configuration, its force state, optionally its associations, and optionally a transient interaction context, and yields a description of a consumable, interactive experience. Many projections, one state. Adding a projection changes nothing upstream.

**P5. Rules are bought.** Legal move generation, check, game termination, FEN and PGN are commodity. They sit behind an interface so the supplier can change.

**P6. Language is deferred behind contracts.** The analysis side (configuration in, force state out) and the representation side (force state in, experience out) meet at a serializable data contract. Which language implements either side is decided per side, later, against stated criteria (section 9).

**P7. Chess correctness is canonical, never a product decision.** The rules of chess, including every standard extension and fine point (castling, en passant, promotion, x-ray through the enemy king for king-move legality, and the rest), are implemented exactly as the standard rules state them. They are bought where a trusted library exists and checked against it where not. No fine point is ever put to Laurent to adjudicate.

**P8. The tool is built for a novice.** Laurent is a chess novice building the view that an intuitive player already has in their head. Every state and every provenance record must therefore be legible without chess intuition: plain words, named pieces and squares, and the reason, not the jargon. Where chess vocabulary is used it is used correctly and explained once.

## 3. Configuration

A configuration is the complete input to the force function.

- Placement of pieces on the 64 squares.
- Castling rights, per side.
- En passant target square, if any.

Excluded: side to move, halfmove clock, fullmove number, move history, player names, clocks. None of these changes the forces on the board.

Side to move is deliberately not part of the key. Both players need both force profiles at every moment, whoever holds the move: the player to move needs to see the opponent's current threats and defences as much as their own. So the force state always carries the legality and lookahead layers for both sides (section 4.1), and "next to move" is a privilege that passes back and forth each turn. It is carried by the game record and handed to projections as context, where it selects which side's layers are active for interaction without hiding the other's. (One technicality follows: an en passant target is only capturable by one side, and the model records it that way.)

The canonical form is the placement, castling and en passant fields of FEN, normalised. Its hash is the configuration key. Two positions reached by different move orders have the same key and the same force state.

## 4. Force state

The output of the force function. Conceptually three kinds of record plus a set of relations, organised in layers. The layering is the heart of the spec: each layer is a pure refinement of the one below it and can be computed, cached, tested, and shown independently.

### 4.1 Layers

**L0. Geometry.** What each piece attacks by its movement pattern, given only the placement. Includes pawns' diagonal squares whether or not occupied. Includes attacks through pieces of the same line type (x-rays and batteries), recorded as such. A sliding attack continues through the enemy king to the square behind it, as the standard rules require for king-move legality, and is recorded as such. Ignores whose turn it is and ignores pins. This is the physics of the position. L0 is the primitive unit of force: the thing all other layers count, filter, or weight.

**L1. Legality.** Which L0 attacks could actually be exercised if that side held the move: the attacker is not pinned against that line and the move does not leave its own king in check. L1 is computed for both sides under the one configuration key, so each side's legal force is always available regardless of whose turn it is. It is a subset of L0 with reasons attached to every exclusion ("pinned by the rook on a1", "king would be exposed to the bishop on g4"). Whose move it actually is never appears here; that is projection context (section 3). This is where the vanilla-JS repo's "why can't this piece reach" idea lives.

**L2. Lookahead.** What each side could attack after one of its own legal moves, computed for both sides as L1 is. One ply, kept as a distinct layer so projections can show or hide it. Deeper lookahead is out of scope for the core; if ever wanted it is a separate engine-style component producing the same record types.

**L3. Valuation.** Material-weighted force and exchange outcomes on a square. In v1 the cheap quantities are computed and exposed raw (attacker and defender counts per side, their summed material values, net material pressure), with no designed visual affordance: no highlighting logic, no colour ramp. Full static exchange evaluation comes when a projection needs it. The point of computing the cheap part now is section 7.1: Laurent must be able to see the numbers on the board and judge the logic before anything is painted.

### 4.2 Records

**Per square.** For each of the 64 squares: occupant if any; the set of attackers by colour at each layer, each attacker with its square, piece type, and the path it uses; the set of defenders (same-colour attackers of an occupied square); derived summaries such as attacker count per colour per layer and a control classification (white, black, contested, none) that projections may use as a cheap first lens.

**Per piece.** For each piece on the board: what it attacks and defends at each layer; what attacks and defends it; its constraints (pinned, and to what; in check, and by what; no legal moves and why); its mobility count; special-move availability.

**Relations.** The attack, defence, pin, x-ray, and battery relations as first-class edges between pieces and squares, so that projections can draw lines, build lists, or compute diffs without re-deriving them.

### 4.3 Provenance

Every state names its causes. A square is not merely "contested"; it is contested by these pieces along these paths. A piece is not merely "pinned"; it is pinned by that piece against that king along that line. A piece that would attack a square but does not is reported at L1 with the reason. This is what lets the info panels obey the rule that everything in the model must be explicable in words.

### 4.4 What force state is not

Selection, hover, the currently displayed move, board orientation, colour scheme. Those are interaction context and shell state. They are inputs to a projection, never part of the force state. The vanilla-JS repo blurred this by keeping everything as DOM class names; this spec forbids it.

### 4.5 Verification

The force model is specified by a language-neutral fixture corpus: configuration in, expected per-square and per-piece states out. Any implementation in any language must pass it. This is what makes the model evolvable without a UI and makes a future port cheap. The corpus has two granularities from the start: targeted assertions about particular squares and pieces in particular positions, written by hand to pin down each rule; and whole-board snapshots of the complete force state, generated from the reference implementation once the targeted assertions have validated it, to catch regressions everywhere else.

## 5. Strategic associations

Out of scope for v1 but shaped now so they are not designed out.

Each association is a pure fact about a configuration key: "this configuration occurs in the Ruy Lopez", "this configuration occurred in Kasparov v Topalov 1999 after move 24", "an engine at depth 20 evaluates this at +0.6". They are produced by their own materializers from external sources and stored keyed by configuration key. The force state never depends on them. Projections may consume them.

## 6. Game record

A game record is an ordered structure of configurations connected by moves: a list in v1, a tree when variations are supported. Each node's force state is derived, not stored in the record, and is cacheable by its configuration key. The difference in force state between two nodes is itself derived data that a projection can request. Navigation (first, previous, next, last, jump) is a pure operation on the record. The record has no UI dependency.

## 7. Projections

A projection is a pure mapping:

(configuration, force state, associations?, interaction context?) → scene description

The scene description is declarative data describing what to draw and what each drawn element means, not drawing calls. The shell renders it. Candidate projections, each a lens over the same state:

- **Control heatmap.** One colour per square from the L0 or L1 attacker differential. The TypeScript repo's whole Phase 4 plan is this one lens.
- **Corner indicators.** The vanilla-JS repo's four-corner scheme: reach pies, threat/protection pies, threat and legal-move marks.
- **Info panels.** The current piece and current square, spelling out every state and listing every cause. Both panels derive from the same records, which gives the alignment Laurent asked for.
- **Raw values.** Label-value pairs per square and per piece, every layer, no styling. See 7.1. Built first.
- **Numeric overlay.** A designed version of the above: a single chosen quantity as digits with typographic weight and placement.
- **Relation lines.** Attack and defence edges drawn as arrows for a selected piece or square.
- **Diff lens.** Force state of this node against the previous node, or against a hovered candidate move.

A projection may expose settings (which layer, which colour, thresholds). Those settings are projection state, not force state.

### 7.1 The raw-values projection comes first

Every quantity the model computes is visible in raw form from the day it is computed, before any designed visual exists for it. The vehicle is a raw-values projection. On each square that has anything to report it shows the counts as tallies: a row of small red squares, one per threat, and a row of small green squares, one per defence. One mark per unit, no scaling, no thresholds, no interpretation; a row of three red marks means exactly three. A mark has a shape as well as a colour, saying the same thing twice: a threat points down onto the piece, a defence points up under it, and a side's reach onto an empty square is a plain square, so the marks still read without colour. Squares with nothing to report show nothing. The exact figures also appear as label-value pairs, for example `Threats: 3` and `Defenses: 1`, in the info panels for the current piece and current square, and on hover. The projection has a layer selector and no other design.

Tallies need one semantic rule. On an occupied square, red is enemy attackers of the occupant and green is friendly defenders of it. On an empty square there is no occupant to threaten or defend, so the marks are coloured by side instead (accepted by Laurent for now, 2026-11-08): one row of white-side attackers, one row of black-side attackers, in the two side colours rather than red and green. This keeps red and green meaning "danger to" and "support for" a specific piece, and keeps side colours meaning "who reaches here".

This projection is built first and is never removed. It is the human-readable check on the model's logic, the thing a designed lens (heatmap, corner indicators, valuation shading) is later compared against, and the answer to "what is the model actually saying about this square" at any point in the project. A designed lens may be deferred indefinitely; the raw values may not.

## 8. Shells

The shell hosts projections and provides the interactive surface: board rendering, input, navigation controls, import and export, persistence. Web first. A mobile shell, if ever built, consumes the same projections and the same force state. The only requirement placed on the architecture by the mobile option is that sections 3 to 7 import nothing from the DOM, from React, or from any platform.

## 9. The language question, restated

Laurent's framing: consider separating the logical work of examining a board's latent threats and defences from the work of representing that logic. This spec does separate them, at the contract between section 4 and section 7. Once that contract is data, the language on each side is a free choice.

**Analysis side (sections 3 to 6).** Criteria: must run wherever a position is first seen, which for a browser app means in the browser on every move and ideally on every hover; must be testable against the fixture corpus without any UI; should be portable to a mobile shell later. Options that meet the criteria: TypeScript (simplest, no toolchain beyond what exists), Rust compiled to WebAssembly (portable to native mobile and to servers; more toolchain). Options that do not: Python in the browser (payload and start-up cost), Python on a server (round trip per position, no offline use). Python was in the picture only because it is Laurent's primary language and the earlier efforts assumed a hands-on relationship with the code. Laurent has since stated there is no expectation or intent of any Python sandbox or Python exploration, and that no structural decision may be made to accommodate Python. Python is therefore out of scope in every form.

**Representation side (sections 7 and 8).** Criteria: whatever the shell platform demands. Web shell: TypeScript, with or without a framework.

**Ecosystem note (2026-11-08).** Rust has a production-grade chess ecosystem. shakmaty (by the Lichess developer who also wrote python-chess) provides bitboard attack tables, legal move generation, pin and checker computation, FEN, SAN, UCI and Zobrist hashing, and runs Lichess's tablebase and opening-explorer servers. Its attack tables are layer L0 directly and its Zobrist hash is the content-addressing P1 requires. cozy-chess and the chess crate are MIT-licensed magic-bitboard alternatives tuned for engines. Several top-tier engines (Viridithas, Black Marlin, Velvet, Stormphrax, Reckless) are Rust. Two caveats. shakmaty is GPL-3.0, which would make a browser app that links it as WebAssembly a GPL work; cozy-chess avoids that. And the ecosystem supplies physics (attack sets, legality) but not explanation: provenance, x-ray and battery relations as named edges, exclusion reasons, per-square and per-piece records, and lookahead are all original work, which is consistent with section 4 being the intellectual property. Net effect on the cost estimate above: Rust-first for the analysis side is close to the cheapest route to a passing fixture corpus, not the expensive one; the remaining costs are wasm-pack/wasm-bindgen for the web shell, uniffi for mobile bindings if ever, and serde for the JSON contract.

**Decision status (2026-11-08).** Rules library: shakmaty. Licence: GPL-3.0. Decided on the merits of completeness (SAN, FEN, pin and checker helpers for L1, Zobrist hashing for the configuration key), maintenance, and production pedigree; cozy-chess lacks SAN and has been quiet since 2024. Analysis side: Rust, as the reference implementation, compiled to WebAssembly for the web shell. Representation side: TypeScript. The contract still comes first: the force-state schema and the fixture corpus are the language-neutral specification. The first implementation of the analysis side should be the one with the least toolchain cost that passes the corpus, and it becomes the reference implementation. A second implementation in another language is justified only by a second consumer (a native mobile shell, a batch materializer for associations) or by measured performance need. The one caution: the TypeScript repo's current structure, where game-record logic lives in a React hook, violates the separation and would need to move whatever language is chosen.

## 10. Positions taken as defaults, all accepted 2026-11-08

Each was proposed as a default and accepted by Laurent. Overturning one later changes only the named sections.

| Decision | Default | Why | Affects |
|---|---|---|---|
| Audience for v1 | Analysis board: a player studying a position or stepping through a game. No opponent, clock, or accounts. Accepted. | It is the smallest product in which the force model is the whole value. The other audiences add systems on top of this one. | Section 8, non-goals |
| Primitive of force | L0 geometry (attack), with legality as a layer above it. Accepted. | Matches the chess meaning of control; keeps pinned defenders and pawn control of empty squares in the picture; legal reach falls out as a filter | Section 4.1 |
| Lookahead | One ply, as a separate layer. Accepted. | Cheap enough for real time; the one distinction the vanilla-JS repo found worth drawing; isolated so it can be hidden or removed | Section 4.1 |
| Tally colours on empty squares | Side colours (white and black marks) rather than red and green. Accepted for now. | Red and green mean danger to and support for a specific piece; an empty square has no such piece | Section 7.1 |

## 11. Non-goals for v1

AI opponent. Clocks. Accounts and cloud persistence. Variations in the game record. Strategic associations. Designed visual affordances for L3 valuation (the raw values are in scope, per 7.1). Full static exchange evaluation. Mobile shell. Multi-game PGN libraries. Any designed projection beyond the ones needed to prove the model is right and useful.

## 12. Open questions

1. Section 10 defaults: all accepted 2026-11-08.
2. Decided: side to move is out of the key; both sides' L1 and L2 layers are always carried (section 3).
3. Decided: yes, and generalised into P7. All standard rules and fine points are implemented canonically and never put to Laurent.
4. Decided: both granularities from the start (section 4.5).
5. Answered: Python is Laurent's primary language; no third artifact exists. Recorded in section 9.
6. Empty-square rule for tallies in 7.1: accepted for now. Revisit once the raw projection is on a real board.

No concept-level question remains open. The one remaining decision is the licence choice in section 9, which is a decision about implementation.
