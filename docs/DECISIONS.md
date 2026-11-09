# Decisions

Implementation decisions, newest last. Concept-level decisions live in `docs/concept/FORCE_CHESS_CONCEPT.md` and are not repeated here.

## 2026-11-08

- **Fresh repository.** New work starts here, structured by the concept document's layers (contract, core, web). The two earlier repositories (`force-chess-claude`, TypeScript; the September 2025 vanilla-JS attempt, since renamed) are archived. Nothing in either is canonical.
- **Rules library: shakmaty. Licence: GPL-3.0-or-later.** Chosen on completeness (SAN, FEN, pin and checker helpers, Zobrist hashing), maintenance, and production pedigree at Lichess. cozy-chess (MIT) was the alternative; it lacks SAN and has been quiet since 2024. Laurent was indifferent on licence.
- **Analysis side in Rust, compiled to WebAssembly. Representation side in TypeScript.** The contract between them is JSON. The Rust implementation is the reference implementation.
- **Python is out of scope in every form.** No sandbox, no bindings, no structure chosen to accommodate it. Laurent's explicit instruction.
- **Contract first.** The force-state schema and the first hand-written fixtures are written and reviewed before any Rust.

## 2026-11-08, force-state schema (contract v0.1.0)

Schema-level choices the concept document left open, made while writing `contract/schema/force-state.schema.json` and the first targeted fixtures. Each is reversible by a contract version bump.

- **Configuration key: SHA-256 of the canonical string.** The concept names Zobrist hashing as a candidate; a Zobrist key would tie the contract to one library's tables and includes side to move. SHA-256 of the canonical FEN-derived string is reproducible in any language with no shared tables. The algorithm is named in the document (`keyAlgorithm`) so it can change.
- **Canonical form drops an unreachable en passant target and invalid castling rights.** An en passant target with no pawn of the capturing side beside the pawn it could take changes nothing on the board, so two FENs differing only by it are one configuration. A castling right whose king or rook has left its home square is dropped. Legality of the capture or the castling does not affect the key.
- **One L1 test for every edge.** An L0 attack or defence is legal at L1 if moving the piece to that square, with whatever stands there removed, leaves the mover's king unattacked. This single hypothetical covers pins, moving while in check, the king walking into attack, the king recapturing on a defended square, and the en passant capture that opens a line to the king. Four reason codes name the cases (`pinned`, `king_in_check`, `king_into_attack`, `exposes_king`), reported in that priority order with `king_into_attack` first, one reason per exclusion.
- **King moves are tested against the enemy's L0 reach.** A pinned enemy piece and a line continuing through the king both keep the king off a square, as the standard rules require. Consequence recorded in a fixture: a pinned rook that cannot legally move to a square still denies it to the enemy king.
- **A king defends a piece at L1 only when it could recapture.** With the defended piece removed, if any enemy piece attacks the square the king's defence is excluded with `king_into_attack`, naming every such enemy piece. Fixture: queen-bishop battery on g7.
- **Through-piece attacks at L0 are exactly three kinds, one piece deep.** `battery` through a friendly same-line piece, `xray` through an enemy same-line piece, `through_king` through the enemy king, continuing to the next piece inclusive or the board edge. A line through any other piece, or through two pieces, is not an attack. Pins are relations in their own right, but L0 stays pure geometry: when the pinned piece is itself a same-line piece the pinner has an `xray` edge onto the king square through it, and when it is not (a pinned knight, say) the line stops. An `xray` or `battery` edge onto a king square is never a check; only a direct attack is. So the pinner does not give check through the pinned piece.
- **Only absolute pins are pins.** A piece shielding its queen or rook is not pinned in the model. The en passant rank discovery is not a pin either (two pieces on the line); it is the one `exposes_king` case.
- **L2 records the moved piece only, direct attacks only, from its destination, including squares it already reached.** Discovered attacks by other pieces are not L2 entries; they are already visible as L0 batteries. Each promotion piece and both castling pieces produce their own entries. Projections that want "new reach" diff L2 against L0.
- **Control counts pieces and ignores the occupant.** `white`, `black`, `contested`, `none` from attacker counts at L0 and L1 only. L2 and values play no part.
- **Valuation scale 1/3/3/5/9, king 0.** The king is counted as an attacker or defender but adds nothing to summed value. The scale is reported in every document. No exchange is played out (concept 11).
- **Mobility counts destination squares; `legalMoves` lists moves.** A pawn on the seventh with one push has mobility 1 and four legal moves. Side-level `legalMoveCount` counts moves, matching standard move generation.
- **Side status is "if this side held the move", for both sides.** Side to move is not in the key, so check, checkmate and stalemate are reported per side under that reading. A configuration in which both kings are in check is not forbidden by the schema; the implementation may reject it as an illegal position.
- **Pieces are identified by their square.** A piece record is only meaningful within its configuration, so no cross-position identity is invented.
- **The three views repeat each other on purpose.** Square records, piece records and the relations list carry the same edges in full. Consumers read without joining; the reference implementation guarantees agreement and snapshots check it. The documents are large (the two-kings example is 190 KB pretty-printed); compactness is an implementation and transport concern, not a contract one, and is deferred until measured.
- **Fixtures name pieces in words** (`white knight f3`) and carry a `decisions` list so the chess fine points each one settles are readable without decoding the assertions. Every position was cross-checked against an independent chess library for legal moves and attacked squares before being committed.

## 2026-11-08, normalised contract (v0.2.0)

On Laurent's review of v0.1.0 the triple-view layout was rejected as wasteful, and measurement agreed: of the two-kings example's 76 KB minified, 48 KB was the square records embedding every edge in full and 19 KB was empty square skeletons. The "three views repeat each other on purpose" bullet above is superseded. Approved by Laurent, 2026-11-08.

- **Every relation is stored once, under `relations`, and referenced by zero-based index.** `edges` (L0 attack and defence, each carrying its own L1 status and reason), `lookaheads`, `pins`, `xrays`, `batteries`. Square and piece records hold index lists per colour and layer plus their summaries. Looking up an index is not computing anything about the position (P2).
- **A piece is identified by its square string alone.** Colour and type live once in `pieces`; edges name pieces by square.
- **One lookahead entry per legal move, listing the squares attacked after it**, instead of one entry per move-and-square pair. A piece's legal moves are its entries; the separate `legalMoves` list is gone. Castling still yields two entries (king and rook) for one move.
- **Squares with nothing to report are omitted.** A square absent from `squares` is empty, reached by nothing, control `none`, valuation zero. This is concept 7.1's rule applied to the data. `attackerCount` is gone; counts are the lengths of the index lists.
- **Result:** the two-kings example went from 184 KB to 41 KB pretty-printed (16 KB minified). The fixtures did not change; they assert facts, not layout. Contract version bumped to 0.2.0; the fixture format stays at 0.1.

## 2026-11-08, fixture corrections from the reference implementation (contract v0.2.1)

The first run of the Rust reference implementation against the corpus failed three assertions. In each case the implementation followed the contract's own stated rules and the standard rules of chess, and the fixture did not. The fixtures were corrected rather than the code bent to fit.

- **A battery runs both ways along its line.** The L0 rule says a line continues through a friendly same-line piece to the next piece inclusive or the board edge. Applied from both ends of a pair, that gives two batteries wherever the line continues past both pieces: on the b2-c3 diagonal the queen reaches g7 through the bishop and the bishop reaches a1 through the queen; on the a-file the black queen reaches a1 through the rook and the rook reaches a8 through the queen. `queen-bishop-battery` and `xray-through-enemy` had counted one battery each. Counting only the direction that ends on a piece would have been the other way to make the numbers agree, but doubled rooks on an open file plainly form a battery that ends at the board edge, so that reading was rejected. Both fixtures now expect two and assert the second battery explicitly; `contract/schema/README.md` says so in its definition of a battery.
- **Black's L2 reach of e5 in the starting position includes the d-pawn and f-pawn.** After d7-d6 the pawn on d6 attacks e5, and likewise after f7-f6, exactly mirroring white's d2-d4 and f2-f4, which the fixture already listed. The fixture had only the knight on b8.
- Contract version bumped to 0.2.1. The force-state shape did not change; the fixture format stays at 0.1.

## 2026-11-08, fixture runner semantics clarified (contract v0.2.2)

Writing the first runner found two places where `contract/fixtures/README.md` did not say exactly what to check. Both are now stated; no fixture and no document shape changed.

- **`occupantValue` in a `valuation` assertion** is asserted by several fixtures but is not a field of the force-state document. It is read as the occupant's value on the document's own `valuationScale`, or null for an empty square. This is a lookup, not a computation about the position (P2), so the document did not need a new field.
- **`attacks` at L2** said "lands on the square" in the README and "reaches the square" in the fixture schema. L2 is about what a piece attacks after its move, and square records list L2 entries by the squares they attack, so "reaches" is the meaning: the square is among the entry's attacked squares, not the move's destination.
- Contract version bumped to 0.2.2.

## 2026-11-08, a fifth no-legal-moves code (contract v0.3.0)

- **`exposes_king` is a no-legal-moves code.** The schema let a piece's `noLegalMoves` reason be `blocked`, `pinned`, `king_in_check`, `king_into_attack` or `mixed`, but a pawn whose push is blocked and whose only move is an en passant capture that opens a line to its king fits none of them: it is not pinned (two pieces stand on the line), its king is not in check, and it is not the king. The reference implementation produced `exposes_king` for it, matching the code its excluded move carries at L1, and the schema refused the document. The code was added to `NoLegalMovesCode` in both schemas, with a new fixture, `en-passant-only-move-exposes-king`.
- **Blocked squares do not make a reason mixed.** Already implied by `pin-along-file` (a pinned knight with one square held by its own pawn reports `pinned`), now said in the schema: the reason is drawn from the moves the piece could make if its king's safety did not matter, and `blocked` is reported only when there are none.
- Contract version bumped to 0.3.0, a minor version because a consumer that switches on the code list must handle the new value. The fixture format stays at 0.1: the change widens an enum and every existing fixture remains valid.

## 2026-11-08, reference implementation in Rust (`core/`, force-core 0.1.0, shakmaty 0.30.2)

Implementation decisions the contract left open, and chess fine points settled while writing the reference implementation. Each fine point was decided against the standard rules (P7). Where a targeted fixture pins it down, the fixture is named; otherwise the whole-board snapshots hold it.

### Rules bought, and where they are not

- **shakmaty 0.30.2, pinned exactly.** It supplies FEN reading, the attack tables, check detection on hypothetical boards, and legal move generation.
- **When one king is in check, the other side's moves come from our own generator.** shakmaty refuses to build a position in which the side not to move is in check, but the force state asks for both sides' moves whoever holds the move (concept 3). In that one case a small generator in `core/src/moves.rs` produces the moves from shakmaty's attack tables and the L1 test. It is checked against shakmaty on every position shakmaty accepts, which is several thousand sides in `tests/invariants.rs`.
- **A king is never captured, so capturing the king is never a legal move.** With white in check from the rook on e8, black's rook has no move to e4, although its reach onto e4 is still a legal L1 edge. That edge is the check itself (`through-enemy-king`, `tests/invariants.rs`).
- **shakmaty's "impossible check" and "too much material" refusals are ignored.** The force state of such a board is still well defined.

### Configurations refused

The configuration is refused with a plain-words sentence, rather than analysed, when it is not a board any game can reach:
- a side without exactly one king;
- a pawn on the first or last rank;
- both kings in check (the schema allowed refusing this);
- an en passant square that no pawn could just have created: not on the third or sixth rank, no pawn that made the double step, or the passed-over or starting square occupied.

An en passant square that a pawn did create, but that no enemy pawn stands beside to take, is dropped as the contract says, not refused.

### L1 fine points

- **A piece reaching its own king's square is legal at L1.** The single test removes whatever stands on the target, which here is the king itself, so no king is left to be attacked. A king is never captured, so this "recapture" never happens in a game; the literal reading of the contract was kept because none of the four reason codes describes it and it does no harm to the counts. It only changes anything when the king is in check: the queen beside a checked king still counts as its defender at L1.
- **The king-into-attack explanation names the pieces that would attack the square once the king stood there**: direct attackers first, then the back piece of any battery behind them (`queen-bishop-battery`).
- **King moves use the board after the move.** The king is lifted from its square, so a line through it is open, and the king's safety is tested with standard attacks. This matches the enemy's L0 reach including `through_king` edges (`through-enemy-king`).

### Constraints and special moves

- **No legal moves.** The reason is drawn from the moves a piece could make if its king's safety did not matter: pattern squares not held by its own side, pawn pushes, pawn captures and en passant. Castling is left out, and so is the enemy king's square. With no such moves the code is `blocked`. With one code across all of them, that code. With several, `mixed`, and the text lists each move's own sentence.
- **Castling** is reported on both kings in every configuration, with the destination square (g1, c1, g8, c8) as its target even when unavailable. The reasons are checked in this order: `no_right`, then `path_blocked` (any piece between king and rook, b1 included on the queenside), then `in_check`, then `path_attacked` (the king's crossing and landing squares, tested with the king lifted).
- **En passant** on a pawn that cannot take the target reports `no_target` with a null target. On the pawn that can, the target is the en passant square and the reason, when it is unavailable, is the L1 code of the capture.
- **Promotion.** A pawn not on its seventh rank reports `not_on_rank` with a null target. A pawn on it reports `blocked` with a null target when it has no push and no capture. When all its promotions fail the king-safety test, it reports the first one's L1 code and destination.

### Ordering, so that one configuration always gives the same bytes

- Pieces and squares are listed in board order: a1, b1, ... h1, a2, ... h8.
- Edges are grouped by piece in board order, and each piece's edges are ordered by target square name: a1, a2, ... h8.
- Legal moves and their lookahead entries are ordered by the moving piece in board order, then destination by name, then promotion piece (knight, bishop, rook, queen). A castling move is placed with the king's moves; its king entry comes first, then its rook entry.
- Pins are ordered by the pinned piece. X-rays and batteries are ordered by the piece looking through, in board order, then by direction.
- Checkers are ordered by square name.
- The two-kings example in `contract/schema/examples/` is reproduced exactly, apart from the wording of its sentences.

### L2 bookkeeping

- **A piece's `defendedBy.L2` leaves out its own moves.** This includes, for a rook, the castling move it takes part in: a piece moving away does not defend the square it leaves. Square records keep every entry, as the two-kings example shows.

### Snapshots

- One pretty-printed document per targeted fixture, named by the fixture id, compared byte for byte. They are rewritten only with `FORCE_CORE_UPDATE_SNAPSHOTS=1`, and a rewrite is reviewed in git like any other change in behaviour.

## 2026-11-08, WebAssembly bindings (`core/wasm/`, force-core-wasm 0.1.0)

- **A separate thin crate.** `force-core-wasm` depends on `force-core`, shakmaty and wasm-bindgen 0.2.130 and nothing else; `force-core` has no platform dependency. `core/` became a Cargo workspace so the two share a lock file and a target directory. wasm-pack 0.15.1 and the `wasm32-unknown-unknown` target are recorded in `core/README.md`.
- **Strings across the boundary.** `analyze` returns the minified JSON document; `applyMove` takes and returns FENs. The JSON contract stays the only shared shape, and the JavaScript side parses once.
- **Failures are thrown as a `ForceError` with a code and a sentence.** `unreadable` and `impossible` carry force-core's own sentence unchanged; `illegal_move` and `bad_square` are new, with sentences in the same style ("It is white's move, so the black pawn on e7 cannot move now."). An illegal move is detected by matching the request against shakmaty's legal moves, so the rules stay bought.
- **Castling is asked for as the king's two-square move** (e1 to g1), which is how the document records it; the rook's square is also accepted. **A promotion must name the piece.** A plain request onto the last rank is refused with a sentence saying so, so the shell has to ask the user rather than silently choosing a queen.
- **The returned FEN writes an en passant target when an enemy pawn stands beside the pawn that just moved two squares** (shakmaty's `EnPassantMode::PseudoLegal`). This is the contract's own rule for keeping a target, so the FEN the shell shows matches the document's canonical form rather than FEN's classic "always" or the stricter "only if legal".
- **Release builds optimise for size** (`opt-level = "s"`, LTO) at the workspace root, since the only release consumer is the browser. The package is 834 KB of WebAssembly, 152 KB gzipped. Not tuned further; concept section 9 defers compactness until measured and this is the first measurement.

## 2026-11-08, a promotion fixture (`promotion-available`)

No targeted fixture had a pawn that could promote, so the shell's promotion choice had nothing in the corpus to be tested against. The fixture adds a white pawn on a7 with a push to a8 and a capture on b8: the promotion target is the first promotion square in board order, each promotion piece is its own legal move and lookahead entry, mobility counts the two squares, and the lookahead attacks are those of the promoted piece. The document shape did not change, so the contract version stays at 0.3.0; the snapshot was generated by the reference implementation.

## 2026-11-08, the web shell (`web/`)

Choices the concept left open, made while building the first shell and the raw-values projection. All reversible; none touches the contract.

### Structure

- **No UI framework.** The shell is plain TypeScript on the DOM with one `el()` helper. A projection returns a scene description and the shell rebuilds the 64 squares and the panels from it on every change, which takes well under a frame. A framework would add a dependency, a build step and a second way of describing the page for no gain at this size; if the scene descriptions ever need diffing, a renderer can be swapped in behind the same scene types.
- **Projections and the game record cannot import the DOM.** `tsconfig.pure.json` typechecks `src/contract`, `src/record` and `src/projections` with only the ES2022 library, so an accidental `document` or `window` fails the build. Vitest runs those tests in Node.
- **Contract types are generated, never written.** `npm run contract:types` runs json-schema-to-typescript on the schema before dev, test and typecheck. The output is not committed; a schema change that breaks a projection fails `npm test`.
- **The WebAssembly package is imported from `core/wasm/pkg/` by relative path**, not published or copied, so there is one build of it. Vite copies the `.wasm` into `dist/assets/` and the site loads it relatively, so the build serves from any path.
- **The shell holds full FENs and the force state is cached by FEN.** The record needs the side to move, which the force state leaves out; two FENs for the same configuration analyse twice, which the configuration key could avoid later.
- **Measurements are written as `data-` attributes on the root element** (`data-ready-ms`, `data-document-bytes`, `data-analyze-ms`) so the smoke test reads them without a debugging hook. First figures in chromium on the VM: the page is interactive 70 ms after navigation starts, the starting position's document is 66,271 bytes minified, and the core produces and the shell parses it in 6 to 8 ms. Compactness stays deferred.

### The raw-values projection as drawn

- **One mark is a 7 px square with a 1 px border.** Rows are stacked at the bottom of the square, red above green on an occupied square, white above black on an empty one, and wrap when a row is longer than the square is wide. Nothing scales and nothing is hidden.
- **Side colours on both shades of square.** A white mark is white with a dark border and a black mark is black with a light border, so each is visible on both the light and the dark square. The red and green marks have a darker border of their own hue. The square colours are a muted tan and brown chosen so that both white and black marks and both glyph colours stay legible.
- **Counts at each layer are what the schema says a reader counts.** L0 is the length of the edge list, L1 the length of the legal list, L2 the number of distinct pieces among the lookahead entries. The tests pin g5 in the starting position: four entries, three pieces.
- **The layer selector sits above the board** as three radio buttons with a one-line explanation of the chosen layer beneath it, because the layer changes every mark on the board and should be read first. The exact figures on hover and in the panels name the layer in their labels (`Threats at L1`) so a figure is never read against the wrong layer.
- **Hover shows a card beside the square** with the label-value pairs for the selected layer: threats and defences with their summed values on an occupied square, white and black reach with values on an empty one, and the control classification; at L2 only counts, since the document has no L2 valuation. The card opens to the right on files a to d and to the left on e to h so it never leaves the board.
- **The panels show every layer at once**, whatever the selector says, and compute nothing: each line is a record, an index looked up in `relations`, or the length of a list. Every L0 edge is listed with its route (the squares crossed, and the piece looked through for a battery, x-ray or line through the king) and its L1 status with the document's sentence when excluded. Each legal move is listed with the squares the piece would then reach. Pins, x-rays and batteries are described from both ends. Chess terms (pin, battery, x-ray, check) are explained in a detail line where they first appear.
- **The spelling is "defenses" in labels**, following the concept's example `Defenses: 1`, and "defence" in the schema's codes, which are not shown.

### Interaction

- **Clicking a piece of the side to move marks its legal destinations** with a dot on an empty square and a ring on a capture, read from its lookahead entries. Clicking a destination plays the move through `applyMove`; nothing in the shell decides legality. Clicking any other square selects it, filling both panels; clicking the selected square again clears the selection. Pieces of the side not to move can be selected and read but not moved, since both sides' tallies are always shown and only the move privilege alternates.
- **A promotion asks which piece** with four buttons in the move list area before the move is played; the choices are the pawn's own lookahead entries.
- **The record shows moves as `e2-e4`, `e7xd6 e.p.`, `a7-a8=Q`, `O-O`**, numbered from the side that started. Standard algebraic notation would need disambiguation computed in the shell; long notation is what the record holds. Clicking a move jumps to the position after it.
- **Whose move it is is read from the FEN and shown in the status line** with both sides' status and legal move counts from the document, read as "if this side held the move".
- **A pasted FEN that the core refuses leaves the current position in place** and shows the core's sentence; a FEN in the URL hash loads on start, falling back to the starting position with the same message.
- **Board orientation is white at the bottom, always.** Flipping is projection context and is not built yet.
- **Pieces are Unicode chess glyphs** in the system font (DejaVu Sans on the VM, which has them), white glyphs drawn white with a dark edge. No image set, no library. A board library was not pulled in because the document already supplies the legal moves and `applyMove` executes them.

### What the smoke test checks against

The task's example for the smoke test named e4 and d5 as squares that show side-coloured marks in the starting position at L0. The fixture `starting-position` says nothing reaches e4 at L0, and the snapshot says the same of d5. The test therefore asserts what the fixture asserts: two white marks on d3, three on f3, none on e4 and d5, four green on e2, one green on b1 and g1, none on a1. At L2 e4 shows three marks of each side.
- **Screenshots are rewritten only with `FORCE_CHESS_SCREENSHOTS=1`.** They show the measured analysis time, so they differ on every run; like the core's snapshots, a rewrite is a deliberate act reviewed in git.

## 2026-11-08, blocked lines are excluded at L1 (contract v0.4.0)

Found while reviewing the web shell's pinned-rook screenshot: in `4r3/8/8/8/8/1k6/4R1P1/4K3`, the black rook on e8's `xray` edge to e1, through the white rook on e2, was legal at L1, so the white king showed a threat at the legality layer. That contradicts the contract's own definition of L1 (the L0 reach a piece "could actually exercise if its side held the move", tested by moving it to the square): a rook cannot move through the piece on e2. It was marked legal because the test never looked at the path, and none of the four reason codes described a blocked line. This corrects the reference implementation, and the fixtures that encoded its behaviour, against the contract's L1 definition and concept 4.1 (L0 is geometry; L1 is what can be done now).

- **New L1 reason code `line_blocked`.** Every edge of kind `battery`, `xray` or `through_king` is excluded at L1 with it, and the sentence names the piece in the way: "The black rook on e8 would reach e1 only once the white rook on e2 leaves the line." The L1 test itself refuses any reach whose path is not clear, so the edge kind and the move test cannot disagree.
- **Priority order: `king_into_attack`, `line_blocked`, `pinned`, `king_in_check`, `exposes_king`.** A blocked line is checked before king safety because the move does not exist to be tested. A king only steps to neighbouring squares, so its own moves are never blocked.
- **L0 is unchanged, and so is king safety.** King moves are still tested against the enemy's L0 reach, so a line through the king still keeps it off the squares behind it (`through-enemy-king`), and a pinned piece still guards squares from the enemy king (`pinned-piece-still-defends`). The king-into-attack sentence still names a battery's back piece (`queen-bishop-battery`).
- **L1 counts, control and valuation now count only edges that can be exercised.** These are what the raw tallies at L1 should show. Three existing assertions had encoded the old behaviour and were changed to follow the rule:
  - `queen-bishop-battery`: g7's white L1 attackers are now the bishop alone, not the bishop and queen.
  - `rook-battery`: a7's white L1 attackers are now the front rook alone.
  - `through-enemy-king`: e3's L1 control is now `none`. The king's step there is excluded by `king_into_attack` and the rook's line through the king by `line_blocked`.
- The earlier bullet "One L1 test for every edge" (v0.1.0) still holds, with the blocked-path check as the test's first step.
- Contract version bumped to 0.4.0, a minor version because the reason enum widened. The fixture format stays at 0.1.

## 2026-11-09, document size measured on 60 positions (`docs/measurements/`)

The concept and the v0.1.0 and v0.2.0 entries deferred compactness until it was measured on middlegames. It has been, on a corpus of 60 real positions (`docs/measurements/corpus.fen`: openings at move 8 to 12, dense and tactical middlegames from famous games and published test suites, late middlegames, endgames, bare kings) with `core/examples/measure.rs`, which weighs the document without changing it. The write-up with every table is `docs/measurements/2026-11-09-document-size.md`.

- **A real position's document is 65 to 89 KB minified, 75 KB at the median, under 9 KB gzipped.** The starting position (66 KB) is at the bottom of the middlegame range. Producing it takes 0.4 ms natively and about 1.2 ms in the browser-equivalent engine including `JSON.parse`; a parsed document holds about 136 KB of JavaScript heap.
- **The bytes are structure, not content.** Object keys are 55 % of every document and punctuation 14 %; the median document carries about 4,600 keys averaging under five characters. A square record costs 437 bytes whatever it holds, and nearly every square has one because one ply of lookahead reaches almost every square. The one piece of repeated content is the pair of structural sentences on every pawn (no en passant target, not on the seventh rank), 7.6 % of the bytes; the sentences that carry position-specific provenance are 2.3 %.
- **Size scales with open lines, not piece count.** The 64 square records are a near-fixed floor of about 28 KB; above it, edges (100 to 150 in a middlegame) and legal moves (60 to 94) set the size. An edge excluded at L1 costs 270 bytes against 115 for a legal one, because it carries its sentence.
- **Decision: no change to the format now.** No contract change, no serde skipping of empty members, no shorter keys, no square indices, no layer splitting. The document crosses no network, is produced and parsed in about a millisecond, and gzip already removes the structural overhead ten to one wherever a wire appears. The options were costed over the corpus so the call can be revisited with numbers: dropping the three structural sentences saves 8.8 %, omitting empty lists and nulls 16.5 %, two-character keys 19.5 %, integer squares 3.1 %, splitting L2 out 17.7 %, dropping valuation counts and net 9.0 %; the readable combination saves 34 %, the unreadable one 46 %. Shorter keys, integer squares, layer splitting and dropping the provenance sentences are rejected outright on legibility (P8, 4.3) or because the shell consumes every layer at once.
- **Triggers that reopen this:** a document stored per position or sent over a network as part of a feature; analysis plus parse above about 8 ms on a target device at the rate hover or a diff lens needs; a measured heap problem. The order of work would then be: drop the structural sentences, then omit empty members, then drop derivable valuation figures, each a minor contract version with the snapshots regenerated and reviewed.
- **Implementation notes, not contract changes:** the shell's FEN-keyed cache has no bound and should get one before long games or PGN imports are common; the measurement is rerun after every contract bump and its summary appended under `docs/measurements/`.

## 2026-11-09, PGN import (game document v0.1.0, pgn-reader 0.29.1)

A pasted game reaches the shell as a second contract document, parsed by the Rust core. Decisions made along the way; none touches the force-state contract, which stays at 0.4.0.

### Crate

- **pgn-reader 0.29.1, pinned exactly.** It is the PGN tokeniser from shakmaty's author and its shakmaty dependency is `0.30`, so it resolves to the exact pin `shakmaty = "=0.30.2"` without bumping anything. It pulls in `btoi` and `memchr`, both plain Rust that compile to WebAssembly, and it raises the crates' minimum Rust from 1.85 to 1.97 (the toolchain is 1.99.1). The alternative, a hand-written mainline tokeniser on shakmaty's SAN parser, was not needed.
- **The tokeniser does not validate; shakmaty does.** pgn-reader hands over each move as parsed notation and every move is turned into a legal move and played by shakmaty, so the rules stay bought (P5, P7). A notation that matches no legal move, or more than one, is a refusal.
- **One limitation accepted and recorded.** pgn-reader silently drops a move-text token it cannot read as notation (a typo such as `Nf33`), and tells its visitor nothing. Such a token therefore vanishes, and the game usually fails one move later with an illegal-move sentence about the next move, or imports with a move missing. A tokeniser of our own could name the bad token; revisit if Laurent meets it.

### What is read, and what is skipped

- **The main line only.** Variations are skipped with pgn-reader's skip fast path; comments, annotation glyphs (`!?`, `$6`) and the move numbers are dropped. The `annotated-game` fixture must parse to the very same document as the clean `short-game`.
- **The first game only; the count is reported.** `gamesInText` says how many games the text held, and the shell's game line says "The text held 2 games; this is the first." Multi-game libraries are a concept non-goal.
- **Seven headers, placeholders as null.** Event, Site, Date, Round, White, Black, Result. A value that is empty or made only of `?`, `.` and `-` (`?`, `????.??.??`, `-`) is null, so the shell never shows a question mark as a name. `Result` is taken from the header; when the header is missing the result token that ends the move text is used; `*` is null.
- **A `FEN` header is honoured with or without `SetUp "1"`.** It passes the same configuration checks as a pasted FEN, and a refusal carries the configuration's own sentence after "The game's FEN header could not be used." Move numbers then count on from the FEN's fullmove number, so a study starting at black's 30th move is listed as `30... Kd7 31. e4`.
- **Nothing is read from headers beyond these.** ECO, Elo, clocks and the rest wait for a consumer.

### The parsed-game document

- **A separate document, `contract/schema/game.schema.json`, versioned `gameVersion` 0.1.0.** It is about a record (concept section 6), not a configuration, so it does not belong in the force-state schema and does not move its version. It holds the headers, the full starting FEN, the moves and the game count.
- **Each move carries its notation as written, its squares, the promotion piece and the full FEN after it.** The FEN is written as `applyMove` writes it: the en passant field is present only when an enemy pawn stands beside the pawn that just moved, the contract's own rule for keeping a target. The move's squares follow the force state: castling is the king's two-square move; a promotion names the piece in words. Nothing else is computed in the document; the shell numbers the moves from the starting FEN.
- **The notation is the parsed move written back**, so `0-0` becomes `O-O` and a check sign is kept. A disambiguation the text wrote is kept too.
- **Refusals are sentences naming the side, the move number and the move as written:** "Black's 3rd move, Nxe5, is not legal in the position it is played from." and "White's 3rd move, Nd2, could be made by more than one white knight, so it is not clear which is meant." A text with neither headers nor moves is refused with `no_game`; an unterminated tag or comment with `unreadable`. The codes join the WebAssembly `ForceError` codes.
- **Fixtures pair a `.pgn` with the document or refusal it must produce**, in `contract/fixtures/games/`. The small ones were written by hand (Scholar's mate, the same game annotated, a study from a FEN header, two games in one text, an illegal move, an ambiguous move, an empty text, prose). `long-game` is a generated game of 70 moves, legal and meaningless, kept so a record of real length is exercised; its document was written by the reference implementation with `FORCE_CORE_UPDATE_GAMES=1`, like a snapshot. There is no ajv setup in the repository; the expected documents are checked against the game schema by the same jsonschema crate the force-state fixtures use. The runner compares results as JSON values, so formatting is free.
- **The FEN-to-position reader moved into `force-core`** (`config::position_from_fen`) so the game reader and `applyMove` share one set of refusals and sentences.

### Shell behaviour

- **A PGN box with its own Load game button beside the FEN box.** Its refusals appear in the same line as a refused FEN. Loading a game puts the cursor on the start position and leaves the URL hash alone.
- **The record carries notation and headers.** `GameMove.san` is optional: present for an imported move, absent for a move played on the board, which the record cannot name without the rules. The imported game's headers and count ride on the record (`imported`) and survive playing a move from the middle, which still truncates what followed.
- **The move list shows an imported move as the text wrote it**, numbered from the starting FEN's fullmove number, and a hand-played move in the long notation it used before. Clicking a move jumps to the position after it; the current move is marked; the arrow keys, Home and End still step. The list scrolls past 220 px.
- **Only the position the cursor lands on is analysed.** The shell used to analyse the position before every move on each render to find the move's kind for the notation; an imported move has its notation, so no analysis happens for it, and a 70-move game imports with the cache unchanged. The root element reports `data-analysed-positions` so the smoke test pins this.
- **One plain line about the game** above the moves: "Alice versus Bob, Casual game, 2026.11.09, 1-0." A missing name falls back to the side, a missing event or date is left out, a missing result says "no result recorded".
- **The smoke test checks the board against the core, not by eye.** `e2e/pgn.spec.ts` loads the same WebAssembly package in Node, analyses the fixture's FEN after the third move, runs the raw-values projection on all 64 squares, and compares pieces and mark counts with what the page shows. The third screenshot, `imported-game-L0`, is the short game after `3. Bc4`.

## 2026-11-09, the shell's position cache is bounded (`web/src/shell/cache.ts`)

The document-size measurement above left one implementation note open: the shell kept a parsed document for every FEN it had ever analysed, in a plain `Map`, so a long game or an imported one of a few hundred positions would hold tens of megabytes of heap for good.

- **The cache keeps the 64 most recently used positions and drops the least recently used one when a 65th arrives.** A hit counts as a use, so a position navigated back to stays while positions passed once drift out. 64 is a named constant, `CACHED_POSITIONS`, chosen as a few dozen: it covers stepping back and forth through the part of a game being studied and bounds the heap at about 64 times 136 KB, under 9 MB, whatever the game's length. An evicted position is simply analysed again, which costs about a millisecond, so the bound trades nothing visible. The cache is its own module with no DOM dependency, and its eviction order is pinned by a unit test rather than by the smoke test.

## 2026-11-09, board flip (`web/src/projections/context.ts`)

The board can be looked at from black's side. The concept (4.4) names board orientation as interaction context and shell state, never force state, and the implementation follows that line exactly.

- **Orientation is the side at the bottom of the screen, carried in the interaction context.** `InteractionContext.orientation` is `white` or `black`, white by default. `boardLayout(orientation)` is a pure function giving the drawing order of the 64 squares (eight rows from the top of the screen down, left to right) and the file and rank labels for the edges. The raw-values board scene follows that order and carries the labels; nothing else in it depends on the orientation. A unit test pins that every square is drawn exactly once either way, that the files and ranks reverse, and that each square has the same shade, marks, selection and hover from either side.
- **Nothing is analysed again on a flip.** The shell redraws from the documents it already holds, so the analysed-position count the root element reports does not change; the smoke test checks this. The selection, its destinations, the hover state, the move list and the sentences in the panels are untouched, since none of them depends on where a square is drawn.
- **The side of the hover card is decided by the screen column, not the file.** Before the flip the card opened to the left on files e to h; with black at the bottom those files sit on the left, so the renderer now uses the square's column on the screen. The hover card is the only drawn element whose placement depended on the file.
- **Edge labels are drawn in the shell**, rank digits down the left and file letters along the bottom, from the labels the scene carries. The per-square name in the corner of each square stays.
- **Orientation is not kept in the URL hash and not stored.** The hash holds the FEN, which is the position, and a link should show the same position to whoever opens it; which side they look from is their choice. The shell keeps nothing in local storage today and this is not reason enough to start, so every load begins with white at the bottom. Revisit if Laurent asks for the choice to stick.
- **The Flip board button sits next to the layer selector and the plain key `f` flips too.** The button's tooltip says in plain words which side is at the bottom. The key does nothing while the FEN or PGN box has focus, and a modifier (Ctrl, Alt, Meta) leaves the key to the browser.

## 2026-11-09, the Instrument design system in the shell (`web/src/shell/`)

The design system "Instrument v0.1", drawn on the Design canvas "Force Chess Design System" and handed over on 2026-11-09, is integrated into the web shell. Each decision below is one step of that integration; the canvas is the source of the values and the layout, and where the shell departs from it the departure is said here.

### Tokens and type

- **The stylesheet's root tokens are the system's values**, under the names the canvas uses: `--page`, `--panel`, `--hairline`, `--border`, `--text`, `--text-2`, `--muted`, `--error`; `--light-square`, `--dark-square`, `--board-frame`, the two coordinate inks; the four mark colours each with an `-edge`; `--selected`, `--selected-tint`, `--hovered`, `--destination`, `--check`; the type scale 24/17/14/13/11 and the space scale 4/8/12/16/24. The tan board is gone: the squares are two greys so that red, green, white and black are the only hues on the board. Nothing but the marks and the legend uses red or green; blue marks only the current state.
- **The fonts are vendored through the fontsource packages, not fetched from Google Fonts and not committed as files.** An analysis board must show its figures in the same monospace offline and behind a blocked font host, and a page should not report every opening to a font host. Fontsource pins the version and ships the SIL Open Font License text, and Vite copies the Latin subsets of the six weights used (128 KB of woff2) into the build. Committing woff2 files under `public/fonts/` would have the same effect with binaries in git and no record of the version; it was not chosen.

### The board and its marks

- **A mark has a shape as well as a colour.** The raw-values projection (concept 7.1) said "a row of small red squares"; the marks are now 8px inline SVGs with a 1px edge: a threat is a triangle pointing down onto the piece, a defence a triangle pointing up under it, a side's reach onto an empty square a plain square. The shape repeats what the colour says, so the pair survives colour blindness and greyscale. This is an extension of the raw-values projection, not a change to it: the scene still names only the meaning and the count of each row, one mark is still one unit, nothing is scaled, merged or hidden, and the rows keep their fixed order (threats above defences, white above black). The renderer maps a meaning to a shape as it maps it to a colour. Concept 7.1 gained one sentence saying so (version 0.5).
- **Rows wrap after six marks.** The tally block is 58px wide (six marks and five gaps), inset 3px from the left and bottom edges, and a seventh mark starts a new line. The canvas sets the rule; the old renderer let the square's width decide.
- **Every square carries its own name; the edge strips are gone.** The canvas puts the square name on every square in Inter ExtraBold 12px at 55 % ink on a light square and 60 % on a dark one, "because the user reads names, not edges", and draws no rank and file strips. The shell follows it. The board layout still carries the edge labels for a projection or shell that wants them; the flip test now reads the per-square names instead of the strips.
- **The legend draws the same marks it explains**, at 11px, with the words "Red mark, pointing down" and "Green mark, pointing up" so the shape is named once.

### Pieces

- **The pieces are the mpchess SVG set by Maxime Chupin, used as published.** The canvas surveyed the sets and decided on it on 2026-11-09: a complete set of twelve, legible at 46px on both square shades, modern and solid in the way Lichess draws pieces, and under a licence compatible with the repository's GPL-3.0-or-later. The Unicode glyphs are gone, with the font-dependent rendering that made white pieces faint on a Linux machine.
- **The licence was checked at the source, and it is not what the canvas said.** The canvas named the set as "mpchess, GPL-3.0-or-later (the LaTeX package on CTAN)". The CTAN package (https://ctan.org/pkg/mpchess) is under the LaTeX Project Public License 1.3c, with its cburnett piece file under GPL-2.0-or-later, and its README says so. The piece set is published separately, at https://github.com/chupinmaxime/mpchess-pieces (mirror of https://plmlab.math.cnrs.fr/mchupin/mpchess-pieces), whose LICENSE and README state the GNU General Public License version 3; Lichess, which ships the same set, records it as GPL-3.0-or-later. The files shipped are that repository's `svg/` files, unchanged, at commit 720f6e0 (2023-05-09). The handoff folder held the same drawings after an SVG optimiser (editor metadata removed, coordinates rounded); they render identically within anti-aliasing, and the unchanged originals were preferred so the provenance can be checked by a plain diff. The notice `web/public/pieces/mpchess/LICENSE` names the author, the licence as each source states it, the URL and the commit.
- **Each piece is an image with alt text** ("White rook", "Black pawn") and a `data-piece` attribute, placed at 46px, 13px from the left and 6px from the top of the square, as the canvas measures it. The smoke tests already found pieces by the data attribute; they now also check the alt text.

### Shell-state channels

- **Each piece of shell state has one visual channel, and none of it uses the mark colours except check.** The selected square has a 4px inset edge in the interaction blue; the hovered square a 2px inset edge in the same blue at 60 %; a legal destination of the selected piece an 18px dot and a capture a 62px ring, both in the destination blue at 50 %; the king in check a 3px inset edge in the threat colour, which replaces the red glow that used to fill the square. The marks keep the square's fill to themselves. When two states meet on one square the edges nest: selection outside, check inside it; hover outside, check inside it; a selected square keeps its 4px edge when hovered.

### Readout strip and panels

- **A readout strip under the board replaces the floating hover card.** The card opened beside the hovered square and covered up to two squares of marks while they were being read; the strip sits directly under the board at a fixed minimum height, so hovering covers nothing. It shows the hovered square's figures at the selected layer and, when the pointer leaves the board, keeps the selected square's, so a figure stays readable while the panels are read. The board scene now carries one `readout` (square, heading such as "e2, white pawn", pairs) instead of a `hover` list on each square; `hoverFigures` stays for the tests and the panels, the readout being the same figures under a heading.
- **The panels take the Components board.** A kicker ("Current piece", "Current square") over the title; every section a native `details` element, open by default, whose summary line carries the item count ("Defended by · 5") so a collapsed section still says how much it holds; label-value pairs as a two-column grid with the figures right-aligned in the monospace; and panels that grow with their content instead of scrolling inside themselves, which the old 420px limit forced on every piece with many reaches.
- **The L1 status of a reach is a badge told apart by shape, not hue.** LEGAL is ink filled, EXCL ink outlined, L2 dashed; the green and red squares that used to precede each item are gone, so red and green appear nowhere but the marks and the legend. Lookahead items (a reach that exists only after a move) carry their own tone, `lookahead`, where they were `plain` before, so the renderer can badge them without reading their words. Items with no status (pins, x-rays, batteries) have no badge.

### Layout

- **The page follows the App board.** A header with the title, the tagline and the FEN input under a "Position (FEN)" label with an ink Load button; below it the board column (the layer selector with its legend and one-line explanation, the board, the readout strip, the status line, the legend) and beside it the panels: current piece, current square, then the Moves panel with four 44px navigation buttons and the move list in the monospace, the current move in the blue tint with a blue edge and the moves after the cursor in muted text. The columns wrap under about 1,040px, the board column first. The content is 1,360px wide at most, centred.
- **The Flip board button sits at the right end of the layer selector's row**, an outlined 44px button level with the selector, because both change how the board is drawn and nothing about the position; the canvas did not place it. Its tooltip and the `f` key are unchanged.
- **The PGN box lives in the Moves panel, folded under a "Load a game (PGN)" disclosure**, closed by default, because a game text produces the record the panel shows, and because the canvas's header carries only the FEN input. The disclosure is a native `details` like the panel sections. The smoke tests open it before pasting. Refusals from a game text appear in the same message line under the FEN input as a refused FEN, as before.
- **The status line keeps the document size and analysis time** after the position's sentence, in muted small type, because the smoke test's screenshots are the record of those measurements. The canvas's status line stops at the legal-move counts.
- **The move list no longer scrolls inside the panel** (the 220px limit is gone), following the rule that panels grow. A 70-move game lists 140 moves in a few lines of the monospace.
