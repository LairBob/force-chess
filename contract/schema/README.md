# Force-state schema

`force-state.schema.json` (JSON Schema draft 2020-12) describes the force state of one board configuration: everything the analysis side reports about a position, as data. It is written from sections 3 and 4 of `docs/concept/FORCE_CHESS_CONCEPT.md`. Where this file and the concept document disagree, the concept document wins.

`fixture-targeted.schema.json` describes the hand-written fixture files in `../fixtures/targeted/`. The fixture format is explained in `../fixtures/README.md`.

`examples/two-kings.json` is a complete force-state document for a board holding only the two kings, so the shape can be read end to end in a few screens. It was written by hand and checked against the schema; it is an illustration, not a fixture.

## Reading the document

A force state is a JSON object with seven top-level fields. Every fact is stored once, under `relations`; the square and piece records are indexes into it.

| Field | What it holds | Concept section |
|---|---|---|
| `contractVersion` | The version of this contract the document follows. | - |
| `configuration` | The input: where the pieces stand, which castling rights remain, and the en passant target if any. Also the canonical string and the key hashed from it. There is no side to move, by design. | 3 |
| `valuationScale` | The material values every sum used (pawn 1, knight 3, bishop 3, rook 5, queen 9, king 0). Reported so no reader has to guess. | 4.1 L3 |
| `sides` | For each side, read as "if this side held the move": where its king is, whether it is in check and by what, whether it has legal moves, and how many. | 3, 4.2 |
| `pieces` | One record per piece on the board, keyed by the square it stands on. Which edges it owns and which land on it, at each layer; its lookahead entries; its constraints; its mobility; its special moves. | 4.2 per piece |
| `relations` | Five lists, each stored once: `edges` (every L0 attack or defence, with its L1 status), `lookaheads` (every legal move with the squares attacked after it), `pins`, `xrays`, `batteries`. Everything else in the document refers to these by zero-based index. | 4.2 relations |
| `squares` | One record per square that has something to report. Who reaches it, by colour and layer, as indices; a control classification; the valuation numbers. A square missing from this object is empty and reached by nothing. | 4.2 per square, 7.1 |

A piece is named by its square everywhere: `"e8"` in an edge's `from` means the piece standing on e8, whose colour and type are under `pieces.e8`. A projection drawing a square reads its record and looks up the listed indices in `relations.edges`; one drawing a piece does the same from the piece record; one drawing lines reads `relations` directly. Nothing has to be computed about the position to do any of that (concept P2), and nothing is written twice.

## The layers

Every reach appears per layer (concept 4.1). The layers are the heart of the model.

- **L0, geometry.** What each piece reaches by its movement pattern, given only where the pieces stand. Each such reach is one entry in `relations.edges`. A pawn's two diagonal squares count whether or not anything is on them. A rook, bishop or queen also reaches through one piece in three cases, each named by the edge's `kind`: through a friendly piece that moves along the same kind of line (`battery`), through an enemy piece that moves along the same kind of line (`xray`), and through the enemy king (`through_king`), which the standard rules need in order to stop the king retreating along the line of a check. Everything else is `direct`. Pins and whose move it is are ignored here: a pinner whose pinned piece is a same-line piece has an `xray` edge onto the king square through it, exactly as through any other enemy piece, and that edge is not a check. A check is a direct attack on the king square; `xray`, `battery` and `through_king` edges never give check.
- **L1, legality.** Which L0 edges the piece could actually exercise if its side held the move. Each edge carries its own `L1` block: legal, or excluded with a `reason` that has a code and a sentence in plain words naming the pieces and squares involved. Square and piece records list the legal and the excluded indices separately. The test for every edge is the same. First, the piece must be able to move there now: if any piece stands between it and the square, the edge is excluded with `line_blocked`, which is the case for every `battery`, `xray` and `through_king` edge (L0 records what a line would reach through one piece; L1 records what the piece can do now). Then move the piece to that square, with whatever stands there removed, and see whether the mover's own king is attacked afterwards. That one test covers pins, moving while in check, a king walking into attack, a king recapturing on a defended square, and the en passant capture that opens a line to the king. L1 is computed for both sides at once.
- **L2, lookahead.** One entry in `relations.lookaheads` per legal move: the move, the piece, and the squares that piece would reach directly from where it lands. Square records list, per colour, the entries that reach them; piece records list their own entries. A piece's legal moves are its entries whose move starts on its square. Computed for both sides.
- **L3, valuation.** Not a reach but numbers on each square at L0 and at L1: how many pieces of each colour reach it, the sum of their material values, and the difference (white minus black). On an occupied square the enemy side's numbers are the threats to the occupant and the friendly side's numbers are its defences. No exchange is played out.

## Words used in the schema

- **Edge** is a piece reaching a square. Its `role` is `attack` if the square is empty or holds an enemy piece and `defence` if it holds a friendly piece. A square record lists all edges landing on it under `attackers` by colour; the occupant's colour are its defenders, the other colour its threats.
- **Path** is the list of squares a sliding piece crosses on the way to its target, in order. It is empty for a knight, a king, a pawn, or an adjacent square.
- **Pin** means the piece stands alone between an enemy rook, bishop or queen and its own king on one line. A piece pinned to anything other than its king is not pinned in this model. A pinned piece keeps all its L0 edges; at L1 everything off the pin line is excluded with reason `pinned`, and everything along the line, including capturing the pinner, stays legal.
- **Battery** means two friendly pieces that move along the same kind of line standing on one line, so the back one reaches through the front one. A queen pairs with a rook on a file or rank and with a bishop on a diagonal. A battery runs both ways: where the line continues past each end of the pair, there are two battery relations, each naming as front the piece nearer its own covered squares.
- **X-ray** means a rook, bishop or queen looking through one enemy piece that moves along the same kind of line, to what lies beyond it.
- **Control** is a cheap first lens on a square at L0 or L1: `white` if only white reaches it, `black` if only black does, `contested` if both do, `none` if neither does. It counts pieces, ignores values, and ignores the occupant.
- **Mobility** is the number of distinct squares a piece can legally move to. Its lookahead entries are the provenance, one per move; a promotion has one entry per piece it could become but counts once in mobility.
- **Special moves** are castling (on kings), en passant and promotion (on pawns). Each says whether it is available, the destination when one is defined, and a reason with a code when it is not.

## Exclusion reasons

| Code | Meaning in plain words |
|---|---|
| `line_blocked` | Another piece stands between this piece and the square, so it cannot move there now. Every battery, x-ray and through-the-king edge is excluded this way; the sentence names the piece in the way. |
| `pinned` | This piece is pinned to its king and the square is off the pin line. |
| `king_in_check` | Its king is in check and this move would neither take the checking piece nor block the line. |
| `king_into_attack` | This is the king, and the square is attacked by the enemy. The test uses the enemy's L0 reach, so a pinned enemy piece and a line continuing through this king both count. |
| `exposes_king` | Any other way the move would leave the king attacked. Today the only case is an en passant capture that opens a rank or diagonal. |

When more than one applies, the first in this order is reported: `king_into_attack`, `line_blocked`, `pinned`, `king_in_check`, `exposes_king`. A blocked line comes before the king-safety codes because the move does not exist to be tested; a king only steps to neighbouring squares, so its own moves are never blocked. King moves are still tested against the enemy's L0 reach, so a line through the king keeps it off the squares behind it even though that line is excluded at L1.

## Canonical form and key

The canonical string is the placement, castling and en passant fields of FEN, joined by single spaces, with two normalisations. A castling right is kept only when the king and the rook in question are on their home squares. An en passant target is kept only when a pawn of the capturing side stands beside the pawn it could take; a target nobody can reach is dropped, because it changes nothing on the board. The key is the lowercase hexadecimal SHA-256 of the canonical string, which any language can reproduce without shared tables.

## Size

The two-kings example is 16 KB minified. A full middlegame position has on the order of a few hundred edges and a few dozen legal moves per side, so documents stay well under a megabyte. The pretty-printed example on disk is for reading; transport is minified.

## The parsed-game document

`game.schema.json` describes a second, separate document: one chess game read from PGN text (concept section 6), versioned on its own as `gameVersion` 0.1.0. It carries the seven standard headers (null where the text has none or a placeholder such as `?`, `????.??.??` or `-`), the full FEN of the starting position, the main line as a list of moves, and how many games the text held. Each move has the standard algebraic notation as the text wrote it, its `from` and `to` squares (castling as the king's two-square move, as the force state records it), the promotion piece or null, and the full FEN after it. Variations, comments and annotation glyphs are not kept. Nothing in the document is about forces: a reader stepping through the game analyses each position by its configuration key when it lands on it.

A text the analysis side cannot turn into a game is refused with a code and a sentence in plain words, in the same way a FEN is refused: `no_game` when the text holds neither headers nor moves, `unreadable` or `impossible` when its FEN header cannot be used, and `illegal_move` when a move of the main line cannot be played, with the sentence naming the side, the move number and the move as written. The refusal shape is `{ "error": { "code", "text" } }`, and the game fixtures in `../fixtures/games/` use it for the texts that must be refused.
