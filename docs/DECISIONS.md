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
