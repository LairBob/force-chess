# Force-state schema

`force-state.schema.json` (JSON Schema draft 2020-12) describes the force state of one board configuration: everything the analysis side reports about a position, as data. It is written from sections 3 and 4 of `docs/concept/FORCE_CHESS_CONCEPT.md`. Where this file and the concept document disagree, the concept document wins.

`fixture-targeted.schema.json` describes the hand-written fixture files in `../fixtures/targeted/`. The fixture format is explained in `../fixtures/README.md`.

`examples/two-kings.json` is a complete force-state document for a board holding only the two kings, so the shape can be read end to end in a few screens. It was written by hand and checked against the schema; it is an illustration, not a fixture.

## Reading the document

A force state is a JSON object with seven top-level fields.

| Field | What it holds | Concept section |
|---|---|---|
| `contractVersion` | The version of this contract the document follows. | - |
| `configuration` | The input: where the pieces stand, which castling rights remain, and the en passant target if any. Also the canonical string and the key hashed from it. There is no side to move, by design. | 3 |
| `valuationScale` | The material values used for every summed value in the document (pawn 1, knight 3, bishop 3, rook 5, queen 9, king 0). Reported so no reader has to guess. | 4.1 L3 |
| `sides` | For each side, read as "if this side held the move": where its king is, whether it is in check and by what, whether it has legal moves, and how many. | 3, 4.2 |
| `squares` | One record per square, all 64. Who reaches this square, at each layer, by colour; counts; a control classification; the valuation numbers. | 4.2 per square |
| `pieces` | One record per piece on the board, keyed by the square it stands on. What it reaches and defends, what reaches and defends it, its constraints, its legal moves and mobility, and its special moves. | 4.2 per piece |
| `relations` | Every attack, defence, pin, x-ray, battery and lookahead edge as its own record, so a projection can draw lines or list them without re-deriving anything. | 4.2 relations |

The square records, the piece records and the relations list say the same things from three points of view. The duplication is deliberate: a projection drawing a square reads the square record, one drawing a piece reads the piece record, one drawing lines reads the relations, and none of them has to join or compute. The reference implementation guarantees the three agree, and the whole-board snapshot fixtures check that it does.

## The layers

Every attack set appears three times, once per layer (concept 4.1). The layers are the heart of the model.

- **L0, geometry.** What each piece reaches by its movement pattern, given only where the pieces stand. A pawn's two diagonal squares count whether or not anything is on them. A rook, bishop or queen also reaches through one piece in three cases, each named by the attack's `kind`: through a friendly piece that moves along the same kind of line (`battery`), through an enemy piece that moves along the same kind of line (`xray`), and through the enemy king (`through_king`), which the standard rules need in order to stop the king retreating along the line of a check. Everything else is `direct`. Pins and whose move it is are ignored here: a pinner whose pinned piece is a same-line piece has an `xray` edge onto the king square through it, exactly as through any other enemy piece, and that edge is not a check. A check is a direct attack on the king square; `xray`, `battery` and `through_king` edges never give check.
- **L1, legality.** Which L0 attacks the piece could actually exercise if its side held the move. Each L0 set is split into `legal` and `excluded`, and every excluded entry carries a `reason` with a code and a sentence in plain words naming the pieces and squares involved. The test for each attack is the same: move the piece to that square, with whatever stands there removed, and see whether the mover's own king is attacked afterwards. That one test covers pins, moving while in check, a king walking into attack, and the en passant capture that opens a line to the king. L1 is computed for both sides at once.
- **L2, lookahead.** After one legal move, which squares the moved piece would reach directly from where it lands. Each entry names the piece, the move, and the square. Computed for both sides.
- **L3, valuation.** Not an attack set but numbers on each square at L0 and at L1: how many pieces of each colour reach it, the sum of their material values, the difference (white minus black), and the material value of whatever stands on the square. On an occupied square the enemy side's numbers are the threats to the occupant and the friendly side's numbers are its defences. No exchange is played out.

## Words used in the schema

- **Attack** and **defence** are the same edge: a piece reaching a square. If the square is empty or holds an enemy piece it is an attack; if it holds a friendly piece it is a defence. A square record lists all of them under `attackers` by colour; pieces of the occupant's colour are its defenders, pieces of the other colour threaten it.
- **Path** is the list of squares a sliding piece crosses on the way to its target, in order. It is empty for a knight, a king, a pawn, or an adjacent square.
- **Pin** means the piece stands alone between an enemy rook, bishop or queen and its own king on one line. A piece pinned to anything other than its king is not pinned in this model. A pinned piece keeps all its L0 reach; at L1 everything off the pin line is excluded with reason `pinned`, and everything along the line, including capturing the pinner, stays legal.
- **Battery** means two friendly pieces that move along the same kind of line standing on one line, so the back one reaches through the front one. A queen pairs with a rook on a file or rank and with a bishop on a diagonal.
- **X-ray** means a rook, bishop or queen looking through one enemy piece that moves along the same kind of line, to what lies beyond it.
- **Control** is a cheap first lens on a square at L0 or L1: `white` if only white reaches it, `black` if only black does, `contested` if both do, `none` if neither does. It counts pieces, ignores values, and ignores the occupant.
- **Mobility** is the number of squares a piece can legally move to. Its `legalMoves` list is the provenance, one entry per move; a promotion appears once per piece it could become but counts once in mobility.
- **Special moves** are castling (on kings), en passant and promotion (on pawns). Each says whether it is available, the destination when one is defined, and a reason with a code when it is not.

## Exclusion reasons

| Code | Meaning in plain words |
|---|---|
| `pinned` | This piece is pinned to its king and the square is off the pin line. |
| `king_in_check` | Its king is in check and this move would neither take the checking piece nor block the line. |
| `king_into_attack` | This is the king, and the square is attacked by the enemy. The test uses the enemy's L0 reach, so a pinned enemy piece and a line continuing through this king both count. |
| `exposes_king` | Any other way the move would leave the king attacked. Today the only case is an en passant capture that opens a rank or diagonal. |

When more than one applies, the first in this order is reported: `king_into_attack`, `pinned`, `king_in_check`, `exposes_king`.

## Canonical form and key

The canonical string is the placement, castling and en passant fields of FEN, joined by single spaces, with two normalisations. A castling right is kept only when the king and the rook in question are on their home squares. An en passant target is kept only when a pawn of the capturing side stands beside the pawn it could take; a target nobody can reach is dropped, because it changes nothing on the board. The key is the lowercase hexadecimal SHA-256 of the canonical string, which any language can reproduce without shared tables.
