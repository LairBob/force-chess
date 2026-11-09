# Force-state document size, measured on 60 positions

2026-11-09. Contract 0.4.0, force-core 0.1.0 at commit aabd0ca. Measured on the VM: 2 cores of an AMD EPYC-Milan processor, 7.7 GB of memory, Rust 1.99.1 release build, Node 22.22.2 (V8 12.4).

The concept deferred compactness until it was measured on middlegames (concept section 9; decisions of 2026-11-08). This is that measurement. Nothing in the contract or the core's output was changed to produce it.

## Headline

- A real position's document is 65 to 89 KB minified, 75 KB at the median. The starting position, at 66 KB, is near the bottom of the middlegame range, not the top. Endgames are 15 to 51 KB. Gzipped, every document is under 9 KB.
- Producing it takes 0.4 ms natively (0.5 ms worst) and about 1.2 ms in the browser-equivalent engine, parse included (1.4 ms worst over 101 runs; 4.4 ms seen once on a busy machine). A parsed document holds about 136 KB of JavaScript heap.
- The bytes are structure, not content. Object keys are 55 % of every document and punctuation another 14 %; a median document carries about 4,600 keys, averaging under five characters each. The data itself (square names, indices, counts, sentences) is under a third of the bytes.
- Nothing in the format needs to change before more is built on it. The call and its reasons are in the last section; the compaction options are costed so the call can be revisited with numbers when a trigger appears.

## Method

- The corpus is `corpus.fen` in this directory: 60 real positions with their sources, from the starting position through openings at move 8 to 12, dense middlegames (Kiwipete, perft positions, Win at Chess and Stockfish bench positions), tactical positions from nine famous games, late middlegames, rook, bishop and pawn endings, three classical studies, and the bare kings.
- `core/examples/measure.rs` reads the file, and for every position builds the force state and writes it as minified JSON exactly as the WebAssembly `analyze` does. It reports the byte size, the size after the system `gzip -9` (no compression crate was added to the manifest), the native time as the median of 31 runs, the counts of relations, and the byte share of each top-level section. It ends with min, median and max per column and with every byte of the corpus attributed once to what it spells (key, square name, sentence, number, other string, literal, punctuation). Run it from `core/`:

  ```
  cargo run --release --example measure -- ../docs/measurements/corpus.fen
  ```

- The WebAssembly path was measured by importing the already-built package from `core/wasm/pkg/` into a Node script, calling `analyze` on the same 60 FENs (median of 101 runs after warm-up), timing `JSON.parse` separately, and reading the V8 heap held by the 60 parsed documents. Nothing under `web/` was edited or run. The output bytes were identical to the native output for every position.
- The savings table was produced by rewriting each parsed document under each option and re-serialising it, over the whole corpus. These are estimates of the byte effect only; none of the options was implemented.

## Results, native

Timing is the median of 31 runs of parse FEN, build, serialise, in a release build. "Legal moves" is both sides added together, read as "if this side held the move". "Squares" is the number of square records in the document (a square with nothing to report is omitted).

| # | Position | Pieces | Bytes | Gzip | ms | Legal moves | Edges | Lookaheads | Pins | X-rays | Batteries | Squares |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Starting position. | 32 | 66271 | 4363 | 0.26 | 40 | 76 | 40 | 0 | 0 | 0 | 64 |
| 2 | Ruy Lopez, Closed, main line after 9.h3. | 32 | 77450 | 6879 | 0.35 | 58 | 123 | 58 | 1 | 0 | 6 | 64 |
| 3 | Sicilian Najdorf, English Attack, after 10...Nbd7. | 30 | 81417 | 7681 | 0.43 | 73 | 144 | 73 | 0 | 0 | 7 | 64 |
| 4 | Queen's Gambit Declined, Tartakower, after 11.O-O. | 28 | 74977 | 6823 | 0.36 | 62 | 120 | 62 | 0 | 0 | 7 | 64 |
| 5 | King's Indian, Classical (Mar del Plata), after 9...Nd7. | 32 | 75325 | 6497 | 0.35 | 59 | 116 | 59 | 0 | 0 | 3 | 64 |
| 6 | French Winawer, Poisoned Pawn, after 7...Qc7. | 30 | 75708 | 6673 | 0.37 | 74 | 106 | 75 | 0 | 0 | 0 | 64 |
| 7 | Giuoco Piano, modern slow line, after 10...Re8. | 32 | 79941 | 7331 | 0.39 | 68 | 129 | 68 | 2 | 0 | 5 | 64 |
| 8 | Nimzo-Indian, Rubinstein, after 10...Qc7. | 28 | 74969 | 6910 | 0.38 | 73 | 118 | 73 | 0 | 0 | 2 | 64 |
| 9 | Caro-Kann Advance, after 8...Nc6. | 32 | 79643 | 7423 | 0.40 | 75 | 129 | 75 | 0 | 0 | 4 | 64 |
| 10 | Semi-Slav Meran, after 10...c5. | 30 | 75968 | 6988 | 0.37 | 74 | 125 | 74 | 0 | 0 | 3 | 64 |
| 11 | Sicilian Dragon, Yugoslav Attack, after 12.h4. | 30 | 83117 | 8052 | 0.44 | 81 | 150 | 81 | 1 | 0 | 8 | 64 |
| 12 | Stockfish bench position (closed centre, all pieces on). | 32 | 77262 | 6865 | 0.36 | 61 | 123 | 61 | 0 | 0 | 6 | 64 |
| 13 | Kiwipete, perft position 2 (Chess Programming Wiki). | 32 | 84542 | 7932 | 0.45 | 91 | 142 | 95 | 0 | 1 | 2 | 64 |
| 14 | Perft position 6 (Chess Programming Wiki), symmetrical Itali... | 32 | 85908 | 7949 | 0.46 | 92 | 150 | 92 | 2 | 0 | 2 | 64 |
| 15 | Perft position 4 (Chess Programming Wiki), promotions for bo... | 31 | 89267 | 7650 | 0.45 | 51 | 133 | 52 | 0 | 1 | 3 | 64 |
| 16 | Perft position 5 (Chess Programming Wiki), white pawn on d7. | 28 | 72730 | 7001 | 0.39 | 78 | 106 | 79 | 0 | 0 | 1 | 64 |
| 17 | Stockfish bench position, with a live en passant target on a... | 26 | 74981 | 7157 | 0.40 | 80 | 113 | 83 | 0 | 0 | 1 | 64 |
| 18 | Win at Chess 001 (Qg6). | 26 | 81937 | 8154 | 0.47 | 94 | 141 | 94 | 0 | 0 | 4 | 64 |
| 19 | Win at Chess 004 (Qxh7+). | 26 | 74160 | 7154 | 0.38 | 75 | 106 | 75 | 1 | 1 | 2 | 64 |
| 20 | Win at Chess 014 (Qxh7+), queen-bishop battery on h7. | 28 | 78341 | 7527 | 0.41 | 80 | 127 | 80 | 1 | 0 | 4 | 64 |
| 21 | Win at Chess 016 (Nc3). | 26 | 76540 | 7250 | 0.41 | 78 | 122 | 78 | 0 | 2 | 4 | 64 |
| 22 | Win at Chess 017 (Ne5). | 26 | 76495 | 7198 | 0.39 | 80 | 118 | 80 | 1 | 0 | 4 | 64 |
| 23 | Win at Chess 023 (g4). | 26 | 78466 | 7477 | 0.42 | 83 | 124 | 83 | 0 | 0 | 3 | 64 |
| 24 | Win at Chess 011 (Bxc6). | 27 | 76794 | 7510 | 0.41 | 73 | 125 | 73 | 0 | 1 | 5 | 64 |
| 25 | Win at Chess 010 (Rxh7). | 23 | 76235 | 7522 | 0.42 | 79 | 119 | 79 | 1 | 2 | 2 | 64 |
| 26 | Win at Chess 009 (Bh2+). | 23 | 76450 | 7570 | 0.44 | 81 | 123 | 81 | 0 | 0 | 4 | 64 |
| 27 | Stockfish bench position, heavy pieces facing each other. | 24 | 76140 | 7434 | 0.42 | 78 | 124 | 78 | 0 | 0 | 5 | 64 |
| 28 | Stockfish bench position, locked pawns, kingside attack. | 27 | 76742 | 7054 | 0.38 | 62 | 118 | 62 | 1 | 0 | 4 | 64 |
| 29 | Anderssen v Kieseritzky, London 1851 (the Immortal Game), be... | 24 | 69901 | 6586 | 0.37 | 68 | 100 | 68 | 0 | 0 | 0 | 64 |
| 30 | Morphy v Duke of Brunswick and Count Isouard, Paris 1858 (th... | 21 | 72169 | 7085 | 0.41 | 77 | 104 | 77 | 0 | 2 | 0 | 64 |
| 31 | Byrne v Fischer, New York 1956 (the Game of the Century), be... | 25 | 79538 | 8117 | 0.46 | 91 | 134 | 91 | 1 | 2 | 2 | 64 |
| 32 | Lasker v Thomas, London 1912, before 11.Qxh7+. | 28 | 77470 | 7520 | 0.40 | 88 | 119 | 90 | 0 | 0 | 2 | 64 |
| 33 | Reti v Tartakower, Vienna 1910, before 9.Qd8+. | 27 | 80127 | 8111 | 0.49 | 94 | 124 | 94 | 0 | 0 | 1 | 64 |
| 34 | Rotlewi v Rubinstein, Lodz 1907 (Rubinstein's Immortal), bef... | 26 | 84728 | 8643 | 0.49 | 92 | 147 | 92 | 2 | 2 | 3 | 64 |
| 35 | Levitsky v Marshall, Breslau 1912, before 23...Qg3. | 19 | 76410 | 7861 | 0.44 | 91 | 119 | 91 | 1 | 2 | 3 | 64 |
| 36 | Kasparov v Topalov, Wijk aan Zee 1999, before 24.Rxd4. | 26 | 80887 | 7882 | 0.46 | 85 | 129 | 85 | 0 | 2 | 4 | 64 |
| 37 | Win at Chess 003 (Rg3). | 24 | 78519 | 7863 | 0.44 | 90 | 126 | 90 | 1 | 0 | 2 | 64 |
| 38 | Win at Chess 008 (Rf7). | 21 | 70881 | 6752 | 0.36 | 62 | 98 | 62 | 2 | 3 | 1 | 64 |
| 39 | Win at Chess 012 (Qxf3+). | 20 | 71413 | 6957 | 0.38 | 65 | 108 | 65 | 0 | 0 | 5 | 64 |
| 40 | Win at Chess 013 (Qxf8+). | 20 | 71416 | 7071 | 0.39 | 81 | 105 | 81 | 0 | 0 | 2 | 64 |
| 41 | Win at Chess 021 (Qh6). | 20 | 71777 | 7135 | 0.39 | 84 | 111 | 84 | 0 | 2 | 0 | 64 |
| 42 | Botvinnik v Capablanca, AVRO 1938, before 30.Ba3. | 19 | 65725 | 5950 | 0.31 | 55 | 87 | 55 | 1 | 0 | 0 | 64 |
| 43 | Win at Chess 005 (Qc4+). | 17 | 65687 | 6245 | 0.35 | 68 | 90 | 68 | 0 | 0 | 0 | 64 |
| 44 | Stockfish bench position, rooks and bishops, exposed kings. | 19 | 71050 | 7078 | 0.40 | 80 | 110 | 80 | 0 | 0 | 2 | 64 |
| 45 | Stockfish bench position, white pawn on b7. | 23 | 79079 | 7728 | 0.41 | 78 | 125 | 78 | 2 | 2 | 2 | 64 |
| 46 | Stockfish bench position, queen and knight against a bare ki... | 4 | 43606 | 3717 | 0.22 | 43 | 46 | 43 | 0 | 0 | 0 | 64 |
| 47 | Win at Chess 002 (Rxb2), rook ending. | 14 | 51182 | 3882 | 0.20 | 28 | 49 | 28 | 0 | 0 | 0 | 64 |
| 48 | Win at Chess 006 (Rb7), rook ending. | 7 | 42827 | 3479 | 0.19 | 28 | 38 | 28 | 0 | 0 | 0 | 64 |
| 49 | Perft position 3 (Chess Programming Wiki), rook ending with ... | 10 | 46605 | 3915 | 0.18 | 29 | 41 | 29 | 2 | 0 | 0 | 64 |
| 50 | The Lucena position, rook ending (textbook). | 5 | 41800 | 3370 | 0.19 | 31 | 40 | 31 | 0 | 0 | 0 | 64 |
| 51 | Stockfish bench position, rook against pawn. | 5 | 37784 | 2987 | 0.14 | 23 | 26 | 23 | 1 | 0 | 0 | 63 |
| 52 | Stockfish bench position, bishop ending with a pawn about to... | 6 | 33940 | 2945 | 0.13 | 24 | 27 | 24 | 0 | 0 | 0 | 52 |
| 53 | Stockfish bench position, bishop against pawn. | 5 | 31128 | 2699 | 0.11 | 21 | 23 | 21 | 1 | 0 | 0 | 50 |
| 54 | Stockfish bench position, en passant target d3 in an ending. | 5 | 33569 | 2978 | 0.13 | 24 | 27 | 24 | 1 | 0 | 0 | 54 |
| 55 | Stockfish bench position, bishop and pawn, stalemate motif. | 4 | 27519 | 2587 | 0.11 | 18 | 25 | 18 | 0 | 0 | 0 | 42 |
| 56 | Stockfish bench position, four rooks with every castling rig... | 6 | 45897 | 3637 | 0.25 | 52 | 52 | 56 | 0 | 0 | 0 | 64 |
| 57 | The Saavedra position (1895), pawn ending study. | 4 | 36944 | 2788 | 0.14 | 22 | 27 | 22 | 0 | 0 | 0 | 64 |
| 58 | Reti's study (1921), pawn ending. | 4 | 18396 | 1893 | 0.06 | 9 | 11 | 9 | 0 | 0 | 0 | 28 |
| 59 | Stockfish bench position, king and pawn against king. | 3 | 14964 | 1797 | 0.06 | 5 | 15 | 5 | 0 | 0 | 0 | 19 |
| 60 | Bare kings, the extreme. | 2 | 17052 | 1449 | 0.06 | 10 | 10 | 10 | 0 | 0 | 0 | 30 |

### Byte share per section, percent of each document

| # | Pieces | squares | pieces | relations.edges | relations.lookaheads | relations.pins | relations.xrays | relations.batteries | other |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 32 | 40.4 | 38.9 | 13.3 | 6.3 | 0.0 | 0.0 | 0.0 | 1.1 |
| 2 | 32 | 35.8 | 33.9 | 20.1 | 8.7 | 0.1 | 0.0 | 0.3 | 1.0 |
| 3 | 30 | 34.9 | 29.7 | 23.0 | 11.0 | 0.0 | 0.0 | 0.4 | 1.0 |
| 4 | 28 | 37.2 | 30.5 | 20.7 | 10.2 | 0.0 | 0.0 | 0.4 | 1.0 |
| 5 | 32 | 36.7 | 34.2 | 18.8 | 9.1 | 0.0 | 0.0 | 0.2 | 1.0 |
| 6 | 30 | 37.4 | 32.5 | 16.4 | 12.7 | 0.0 | 0.0 | 0.0 | 1.0 |
| 7 | 32 | 35.0 | 32.6 | 20.9 | 9.9 | 0.2 | 0.0 | 0.3 | 1.0 |
| 8 | 28 | 37.5 | 30.3 | 18.9 | 12.1 | 0.0 | 0.0 | 0.1 | 1.0 |
| 9 | 32 | 35.5 | 32.2 | 19.7 | 11.4 | 0.0 | 0.0 | 0.2 | 1.0 |
| 10 | 30 | 36.9 | 30.6 | 19.7 | 11.6 | 0.0 | 0.0 | 0.2 | 1.0 |
| 11 | 30 | 34.3 | 28.9 | 23.5 | 11.8 | 0.1 | 0.0 | 0.5 | 0.9 |
| 12 | 32 | 36.0 | 33.5 | 19.8 | 9.3 | 0.0 | 0.0 | 0.4 | 1.0 |
| 13 | 32 | 34.0 | 30.2 | 20.9 | 13.7 | 0.0 | 0.1 | 0.1 | 0.9 |
| 14 | 32 | 33.5 | 30.8 | 21.8 | 12.8 | 0.2 | 0.0 | 0.1 | 0.9 |
| 15 | 31 | 31.3 | 28.4 | 31.8 | 7.3 | 0.0 | 0.1 | 0.2 | 0.9 |
| 16 | 28 | 38.7 | 28.3 | 18.3 | 13.6 | 0.0 | 0.0 | 0.1 | 1.0 |
| 17 | 26 | 37.9 | 28.5 | 18.1 | 14.3 | 0.0 | 0.0 | 0.1 | 1.0 |
| 18 | 26 | 35.5 | 26.4 | 22.0 | 14.9 | 0.0 | 0.0 | 0.2 | 0.9 |
| 19 | 26 | 38.1 | 29.5 | 18.1 | 13.0 | 0.1 | 0.1 | 0.1 | 1.0 |
| 20 | 28 | 36.1 | 29.3 | 20.7 | 12.6 | 0.1 | 0.0 | 0.2 | 1.0 |
| 21 | 26 | 36.9 | 28.4 | 20.6 | 12.7 | 0.0 | 0.1 | 0.3 | 1.0 |
| 22 | 26 | 37.0 | 28.6 | 20.1 | 13.0 | 0.1 | 0.0 | 0.3 | 1.0 |
| 23 | 26 | 36.6 | 28.8 | 19.6 | 13.8 | 0.0 | 0.0 | 0.2 | 1.0 |
| 24 | 27 | 37.0 | 27.8 | 21.3 | 12.5 | 0.0 | 0.1 | 0.3 | 1.0 |
| 25 | 23 | 37.4 | 25.5 | 21.9 | 13.8 | 0.1 | 0.1 | 0.1 | 1.0 |
| 26 | 23 | 37.6 | 25.7 | 21.0 | 14.4 | 0.0 | 0.0 | 0.3 | 1.0 |
| 27 | 24 | 37.3 | 26.6 | 21.6 | 13.2 | 0.0 | 0.0 | 0.3 | 1.0 |
| 28 | 27 | 36.7 | 31.7 | 19.7 | 10.5 | 0.1 | 0.0 | 0.2 | 1.0 |
| 29 | 24 | 40.2 | 27.4 | 18.4 | 13.0 | 0.0 | 0.0 | 0.0 | 1.1 |
| 30 | 21 | 39.7 | 25.9 | 18.1 | 15.1 | 0.0 | 0.1 | 0.0 | 1.0 |
| 31 | 25 | 36.3 | 25.4 | 22.1 | 14.8 | 0.1 | 0.1 | 0.1 | 1.0 |
| 32 | 28 | 36.8 | 28.8 | 18.9 | 14.4 | 0.0 | 0.0 | 0.1 | 1.0 |
| 33 | 27 | 36.9 | 26.3 | 19.5 | 16.3 | 0.0 | 0.0 | 0.1 | 1.0 |
| 34 | 26 | 34.4 | 25.1 | 24.7 | 14.3 | 0.2 | 0.1 | 0.2 | 0.9 |
| 35 | 19 | 38.4 | 22.0 | 21.3 | 16.9 | 0.1 | 0.1 | 0.2 | 1.0 |
| 36 | 26 | 35.8 | 27.8 | 20.8 | 14.2 | 0.0 | 0.1 | 0.2 | 0.9 |
| 37 | 24 | 37.0 | 25.6 | 20.8 | 15.4 | 0.1 | 0.0 | 0.1 | 1.0 |
| 38 | 21 | 39.5 | 25.4 | 21.5 | 12.0 | 0.2 | 0.2 | 0.1 | 1.1 |
| 39 | 20 | 39.8 | 25.6 | 20.0 | 13.1 | 0.0 | 0.0 | 0.3 | 1.1 |
| 40 | 20 | 40.1 | 24.4 | 18.5 | 15.8 | 0.0 | 0.0 | 0.1 | 1.1 |
| 41 | 20 | 40.1 | 23.6 | 18.8 | 16.2 | 0.0 | 0.1 | 0.0 | 1.1 |
| 42 | 19 | 42.2 | 26.5 | 18.6 | 11.4 | 0.1 | 0.0 | 0.0 | 1.1 |
| 43 | 17 | 42.8 | 23.7 | 17.9 | 14.5 | 0.0 | 0.0 | 0.0 | 1.1 |
| 44 | 19 | 40.5 | 23.1 | 19.5 | 15.8 | 0.0 | 0.0 | 0.1 | 1.1 |
| 45 | 23 | 36.1 | 24.1 | 25.4 | 13.0 | 0.2 | 0.1 | 0.1 | 1.0 |
| 46 | 4 | 62.6 | 7.1 | 13.0 | 15.8 | 0.0 | 0.0 | 0.0 | 1.6 |
| 47 | 14 | 51.5 | 27.6 | 12.4 | 7.0 | 0.0 | 0.0 | 0.0 | 1.4 |
| 48 | 7 | 61.4 | 14.7 | 12.5 | 9.6 | 0.0 | 0.0 | 0.0 | 1.7 |
| 49 | 10 | 56.3 | 20.4 | 13.2 | 8.1 | 0.4 | 0.0 | 0.0 | 1.6 |
| 50 | 5 | 63.3 | 9.9 | 13.7 | 11.3 | 0.0 | 0.0 | 0.0 | 1.7 |
| 51 | 5 | 67.7 | 12.4 | 9.3 | 8.4 | 0.2 | 0.0 | 0.0 | 1.9 |
| 52 | 6 | 62.3 | 15.6 | 10.9 | 9.0 | 0.0 | 0.0 | 0.0 | 2.1 |
| 53 | 5 | 65.0 | 14.9 | 9.2 | 8.3 | 0.2 | 0.0 | 0.0 | 2.3 |
| 54 | 5 | 65.3 | 12.7 | 10.5 | 8.9 | 0.2 | 0.0 | 0.0 | 2.3 |
| 55 | 4 | 62.1 | 13.2 | 13.3 | 8.8 | 0.0 | 0.0 | 0.0 | 2.6 |
| 56 | 6 | 59.6 | 6.7 | 14.1 | 18.1 | 0.0 | 0.0 | 0.0 | 1.6 |
| 57 | 4 | 70.3 | 9.5 | 9.6 | 8.6 | 0.0 | 0.0 | 0.0 | 1.9 |
| 58 | 4 | 61.1 | 21.7 | 7.6 | 5.7 | 0.0 | 0.0 | 0.0 | 3.8 |
| 59 | 3 | 51.4 | 21.0 | 18.7 | 4.2 | 0.0 | 0.0 | 0.0 | 4.8 |
| 60 | 2 | 70.4 | 11.4 | 6.7 | 7.3 | 0.0 | 0.0 | 0.0 | 4.1 |

### Summary over the corpus

| Column | Min | Median | Max |
|---|---:|---:|---:|
| Pieces | 2 | 24 | 32 |
| Bytes | 14964 | 75153 | 89267 |
| Gzip bytes | 1449 | 7062 | 8643 |
| ms | 0.06 | 0.38 | 0.49 |
| Legal moves (both sides) | 5 | 73 | 94 |
| Edges | 10 | 117 | 150 |
| Lookaheads | 5 | 73 | 95 |
| Pins | 0 | 0 | 2 |
| X-rays | 0 | 0 | 3 |
| Batteries | 0 | 2 | 8 |
| Squares with a record | 19 | 64 | 64 |
| squares % | 31.3 | 37.6 | 70.4 |
| pieces % | 6.7 | 26.5 | 38.9 |
| relations.edges % | 6.7 | 19.5 | 31.8 |
| relations.lookaheads % | 4.2 | 12.6 | 18.1 |
| relations.pins % | 0.0 | 0.0 | 0.4 |
| relations.xrays % | 0.0 | 0.0 | 0.2 |
| relations.batteries % | 0.0 | 0.1 | 0.5 |
| relations.other % | 0.9 | 1.0 | 4.8 |

## Results, WebAssembly in Node

The same package the web shell loads, run in Node 22 on the same 60 positions, median of 101 runs. The per-position table is in appendix A.

| Column | Min | Median | Max |
|---|---:|---:|---:|
| analyze ms | 0.12 | 0.75 | 0.93 |
| JSON.parse ms | 0.08 | 0.42 | 0.50 |
| analyze + parse ms | 0.20 | 1.17 | 1.42 |

Two runs of 31 and 101 iterations agreed on these figures. A first run made while the machine was still busy with a build gave analyze medians of up to 3.6 ms and totals of up to 4.4 ms; that is the worst case seen and is recorded as such. The web shell's own measurement in chromium on this VM on 2026-11-08 was 6 to 8 ms for the starting position on a cold first call. All of these are well inside one 16.7 ms frame.

The 60 parsed documents held 8.0 MB of V8 heap, 136 KB per document on average, about 1.8 times the size of the text. A game of 200 positions with every document cached would hold about 27 MB.

## What dominates the byte count, and why

**By section.** Over the corpus, `squares` is 40 % of the bytes, `pieces` 27 %, `relations.edges` 19 %, `relations.lookaheads` 12 %. Pins, x-rays and batteries together are under half a percent; the configuration, the valuation scale and the side statuses about 1 %. In a middlegame the shares are steadier than the corpus total suggests (squares 34 to 40 %, pieces 25 to 34 %, edges 18 to 25 %, lookaheads 9 to 17 %); in an endgame the square records take over (60 to 70 %) because they are the one cost that does not shrink with the material.

**By record.** The average costs over the corpus:

| Record | Count | Bytes | Bytes per record |
|---|---:|---:|---:|
| square record | 3,666 | 1,600,880 | 437 |
| piece record | 1,262 | 1,050,726 | 833 |
| edge, legal at L1 | 5,320 | about 615,000 | 115 |
| edge, excluded at L1 | 523 | 140,990 | 270 |
| lookahead entry | 3,785 | 492,713 | 130 |

A square record costs 437 bytes whatever it holds, because its shape is fixed: two colours, each with `L0`, `L1.legal`, `L1.excluded` and `L2` lists, then `control` at two layers and `valuation` at two layers with `white`, `black` and `net` pairs of `count` and `value`. That is about 40 keys before a single index is written. And nearly every square has a record: 64 of 64 in 50 of the 60 positions, because one ply of lookahead reaches almost every square on the board. 542 of the 3,666 square records (15 %) belong to empty squares that nothing reaches at L0 and exist only for their L2 lists; they average 397 bytes each. The "squares with nothing to report are omitted" rule of v0.2.0 therefore only bites in sparse endgames.

A piece record costs 833 bytes on average. For a pawn, 649 of them are `specialMoves`: the en passant and promotion entries, each unavailable for the structural reason that no target exists or the pawn is not on its seventh rank, each with a sentence of 230 to 250 characters that is the same for every pawn except the square name. Those two sentences alone (`no_target`, `not_on_rank`) are 7.6 % of the corpus; with the kings' `no_right` castling sentences, 8.6 %. The sentences that carry position-specific provenance (`pinned`, `king_into_attack`, `king_in_check`, `line_blocked`, `blocked`, `exposes_king`) are 2.3 %.

**By spelling.** Attributing every byte of the corpus once:

| Spelling | Bytes | Share |
|---|---:|---:|
| Object keys (with quotes and colon) | 2167754 | 54.6 % |
| Square names (with quotes) | 230912 | 5.8 % |
| Sentences (`text` fields, with quotes) | 429292 | 10.8 % |
|   of which `blocked` | 21845 | 0.6 % |
|   of which `king_in_check` | 10389 | 0.3 % |
|   of which `king_into_attack` | 16827 | 0.4 % |
|   of which `line_blocked` | 22814 | 0.6 % |
|   of which `no_right` | 39668 | 1.0 % |
|   of which `no_target` | 144837 | 3.7 % |
|   of which `not_on_rank` | 155000 | 3.9 % |
|   of which `path_attacked` | 188 | 0.0 % |
|   of which `path_blocked` | 1908 | 0.0 % |
|   of which `pinned` | 15816 | 0.4 % |
| Numbers (indices, counts, values) | 187647 | 4.7 % |
| Other strings (codes, colours, types, key, FEN fields) | 254960 | 6.4 % |
| true, false, null | 120825 | 3.0 % |
| Braces, brackets, commas | 576376 | 14.5 % |
| total | 3967766 | 100.0 % |

The keys are not long: the average is 4.8 characters, and the common ones (`L0`, `L1`, `L2`, `legal`, `white`, `black`, `count`, `value`) are already short. There are simply many of them: 4,642 per document on average, 5,800 in Kiwipete, 1,464 in the bare-kings document. The document is a deep tree of small objects, and the JSON cost of a small object is its keys and its braces. This is why gzip takes a document from 75 KB to 7 KB (a ratio of about 10 to 1): the structure repeats and compresses away; the data would not compress nearly as well on its own.

## How the numbers scale

A least-squares fit over the 60 documents, taking the four counts that vary:

    bytes = 113 + 427 x pieces + 275 x edges + 50 x lookaheads + 443 x square records

with a largest error of 8.3 KB. The coefficients are not the per-record costs above, because each edge also appears as an index in up to four lists (its piece's `attacks` or `defends` at L0 and L1, and its target's `attackedBy`, `defendedBy` or the square's `attackers` at L0 and L1), and because pieces, edges and lookaheads rise together. Read it as a guide, not a formula.

- **Piece count sets the floor, not the ceiling.** The 64 square records are a near-fixed cost of about 28 KB in any position with more than a handful of pieces. Above that, each piece adds roughly 0.8 KB of its own record and the edges and lookahead entries it generates. So the starting position (32 pieces, 66 KB) is smaller than Levitsky v Marshall (19 pieces, 76 KB) and the queen-and-knight ending (4 pieces) is still 44 KB.
- **Open lines and activity set the ceiling.** The counts that drive size are edges (10 to 150) and legal moves (5 to 94), and both measure how far the pieces see. A closed opening after ten moves has 106 to 130 edges and 58 to 75 legal moves; an open middlegame with developed pieces has 140 to 150 edges and 90 to 94 legal moves. Kiwipete and perft position 6 are the two largest "ordinary" documents (85 and 86 KB) for exactly this reason.
- **Exclusions are the one place where content, not shape, costs.** An edge excluded at L1 costs 270 bytes against 115 for a legal one, because it carries its sentence. 9 % of the corpus's edges are excluded. The largest document of all, perft position 4 at 89 KB, has 65 of its 133 edges excluded (one king is in check, and many pieces are pinned); its edges section is 32 % of the document where 20 % is typical.
- **Promotions multiply lookahead entries, not bytes.** A pawn on its seventh rank yields four lookahead entries per destination (perft positions 4 and 5), but at 130 bytes each this is a few hundred bytes.
- **Pins, x-rays and batteries are free.** No position in the corpus has more than 8 batteries, 3 x-rays or 2 pins; their lists never exceed half a percent of a document.

Against the contract README's statement that documents "stay well under a megabyte": the worst position found is 89 KB, so that holds with a factor of ten to spare, and the README's estimate of "a few hundred edges" was high; real positions have 100 to 150.

## Options and their estimated savings

Each option was applied to every document in the corpus and the result re-serialised. The saving is over the whole corpus; the last column is the median document afterwards (75,153 bytes before).

| Option | Corpus bytes after | Saving | Median document after |
|---|---:|---:|---:|
| A. Drop the sentence for no_target, not_on_rank, no_right (keep the code) | 3616645 | 8.8 % | 67485 |
| B. Drop every sentence (all `text` fields) | 3520682 | 11.3 % | 66281 |
| C. Omit empty lists and null members | 3313245 | 16.5 % | 62280 |
| D. Two-character keys everywhere | 3192462 | 19.5 % | 60268 |
| E. Integer square indices (0 to 63) instead of square names in values | 3843678 | 3.1 % | 72965 |
| F. Split L2 out (lookaheads list and every L2 index list) | 3265559 | 17.7 % | 61170 |
| G. Drop valuation counts and net (derivable from the lists) | 3609532 | 9.0 % | 68878 |
| H. A + C + G together (still readable) | 2603890 | 34.4 % | 48372 |
| I. H + D (compact, not readable) | 2140121 | 46.1 % | 39740 |

How each would be read, against the concept:

- **A, drop the three structural sentences (8.8 %).** The sentences for "no en passant target", "not on the seventh rank" and "no castling right" are definitions, not provenance: they say the same thing for every pawn and king, varying only in the square name. A projection could supply the sentence from the code. This is the one option that removes nothing a reader needs, and it also removes the single most repeated text on the screen. It is a contract change (the `text` field would become optional for those codes), so it waits for a reason to bump the version.
- **B, drop every sentence (11.3 %).** Rejected on P8: the position-specific sentences are the provenance the concept requires (4.3), and they are only 2.2 % of the bytes.
- **C, omit empty lists and null members (16.5 %).** Cheap to emit (serde skips on a flag) but every consumer must then read absence as empty, and the generated TypeScript types turn optional everywhere. A real saving for a real cost in every projection; worth it only when size has become a problem.
- **D, two-character keys (19.5 %).** The largest single lever and the one most often reached for, yet it buys only a fifth because the keys are already short. It makes the document unreadable, which the fixtures, the snapshots, the panels and every debugging session depend on, and gzip already removes the same bytes on any wire at no cost to readability. Rejected.
- **E, integer square indices (3.1 %).** Square names are 5.8 % of the bytes and an integer still costs one or two. Rejected: not worth losing `"e4"` in a document a novice reads.
- **F, split L2 into a separately requestable part (17.7 %).** Measures what L2 costs, but there is nothing to gain by splitting it: the shell computes the document locally and the panels show every layer at once, so the second part would be requested every time. The layers are separate in the model, as the concept asks; they do not need to be separate on the wire.
- **G, drop valuation counts and net (9.0 %).** The counts duplicate list lengths and `net` is a subtraction, both of which the concept treats as "not computing anything about the position" (P2) when a reader does them. The v0.2.0 contract already removed `attackerCount` on that reasoning and kept these because the valuation record is the raw L3 projection Laurent reads first (7.1). Keep them until the raw projection has been looked at long enough to know which figures are actually read.
- **H, A + C + G together (34.4 %)** keeps the document readable and halves the structural overhead. **I, H plus short keys (46.1 %)**, is where a format designed for compactness would land; it is also where the document stops being legible.

What none of these change: the gzipped size is already 7 KB at the median, and the time to produce and parse is already about a millisecond.

## Recommendation

**Do nothing to the format now.** Specifically: no contract change, no serde flags, no shorter keys, no indices, no layer splitting, before more is built on contract 0.4.0.

The reasons, from the numbers:

1. The document never crosses a network today. It is produced inside the browser and parsed once; 0.4 ms native, about 1.2 ms in the browser-equivalent engine, 1.4 ms worst in a stable run, against a 16.7 ms frame budget. Size is paid for in parse time and heap, and both are small.
2. The worst real position is 89 KB and 8.6 KB gzipped. If a document ever does cross a wire (a server materialising strategic associations, a shared position link, a stored game), gzip gives a 10-to-1 reduction for free, more than any readable compaction and about as much as the unreadable one.
3. Everything that could be cut is either structure that compression already removes, or words the concept requires. The one piece of real redundancy, the three structural sentences (option A), is 9 % of the bytes and is better removed when a contract bump is happening for another reason than as a change of its own.
4. The cost of changing now is paid by every consumer: the generated types, the two projections, the fixture snapshots (15 files), and this measurement, for a saving nobody currently needs.

Three things that are not contract changes follow from the measurement and are recorded as implementation notes:

- **Bound the shell's cache.** The shell caches documents by FEN with no limit (decisions, 2026-11-08). At 136 KB of heap per parsed document a long game or a PGN import of several hundred positions would hold tens of megabytes. A cap on the number of cached positions (the most recent few dozen, say) is the correct fix and belongs to the shell, not the format.
- **Re-measure on every contract bump.** `measure.rs` and `corpus.fen` are now part of the repository; rerunning them after a contract change and appending the summary table to this directory keeps the trend visible for the cost of one command.
- **Reopen this decision on a trigger, not a feeling.** The triggers that would make compaction worth its cost: a document is stored per position or sent over a network as part of a feature; or analysis plus parse exceeds about 8 ms on a target device at the rate the diff lens or hover needs; or a measured heap problem survives the cache bound. If one appears, the order of work is option A, then C, then G (together 34 %, still readable), each a minor contract version with its fixture snapshots regenerated and reviewed in git.

## Appendix A: WebAssembly timings per position

Median of 101 runs in Node 22.22.2, V8 12.4, after warm-up. Bytes are identical to the native column.

| # | Position | Bytes | analyze ms | JSON.parse ms | total ms |
|---|---|---:|---:|---:|---:|
| 1 | Starting position. | 66271 | 0.66 | 0.41 | 1.07 |
| 2 | Ruy Lopez, Closed, main line after 9.h3. | 77450 | 0.78 | 0.43 | 1.21 |
| 3 | Sicilian Najdorf, English Attack, after 10...Nbd7. | 81417 | 0.88 | 0.47 | 1.35 |
| 4 | Queen's Gambit Declined, Tartakower, after 11.O-O. | 74977 | 0.73 | 0.42 | 1.15 |
| 5 | King's Indian, Classical (Mar del Plata), after 9...Nd7. | 75325 | 0.72 | 0.42 | 1.13 |
| 6 | French Winawer, Poisoned Pawn, after 7...Qc7. | 75708 | 0.76 | 0.43 | 1.18 |
| 7 | Giuoco Piano, modern slow line, after 10...Re8. | 79941 | 0.81 | 0.45 | 1.26 |
| 8 | Nimzo-Indian, Rubinstein, after 10...Qc7. | 74969 | 0.75 | 0.42 | 1.17 |
| 9 | Caro-Kann Advance, after 8...Nc6. | 79643 | 0.82 | 0.44 | 1.26 |
| 10 | Semi-Slav Meran, after 10...c5. | 75968 | 0.77 | 0.43 | 1.20 |
| 11 | Sicilian Dragon, Yugoslav Attack, after 12.h4. | 83117 | 0.87 | 0.47 | 1.34 |
| 12 | Stockfish bench position (closed centre, all pieces on). | 77262 | 0.77 | 0.50 | 1.27 |
| 13 | Kiwipete, perft position 2 (Chess Programming Wiki). | 84542 | 0.90 | 0.49 | 1.39 |
| 14 | Perft position 6 (Chess Programming Wiki), symmetrical Itali... | 85908 | 0.92 | 0.48 | 1.40 |
| 15 | Perft position 4 (Chess Programming Wiki), promotions for bo... | 89267 | 0.88 | 0.45 | 1.33 |
| 16 | Perft position 5 (Chess Programming Wiki), white pawn on d7. | 72730 | 0.75 | 0.42 | 1.17 |
| 17 | Stockfish bench position, with a live en passant target on a... | 74981 | 0.76 | 0.42 | 1.18 |
| 18 | Win at Chess 001 (Qg6). | 81937 | 0.90 | 0.47 | 1.37 |
| 19 | Win at Chess 004 (Qxh7+). | 74160 | 0.75 | 0.41 | 1.16 |
| 20 | Win at Chess 014 (Qxh7+), queen-bishop battery on h7. | 78341 | 0.82 | 0.44 | 1.26 |
| 21 | Win at Chess 016 (Nc3). | 76540 | 0.77 | 0.43 | 1.20 |
| 22 | Win at Chess 017 (Ne5). | 76495 | 0.77 | 0.43 | 1.20 |
| 23 | Win at Chess 023 (g4). | 78466 | 0.80 | 0.44 | 1.23 |
| 24 | Win at Chess 011 (Bxc6). | 76794 | 0.79 | 0.43 | 1.23 |
| 25 | Win at Chess 010 (Rxh7). | 76235 | 0.78 | 0.42 | 1.20 |
| 26 | Win at Chess 009 (Bh2+). | 76450 | 0.81 | 0.43 | 1.24 |
| 27 | Stockfish bench position, heavy pieces facing each other. | 76140 | 0.79 | 0.43 | 1.22 |
| 28 | Stockfish bench position, locked pawns, kingside attack. | 76742 | 0.74 | 0.42 | 1.16 |
| 29 | Anderssen v Kieseritzky, London 1851 (the Immortal Game), be... | 69901 | 0.70 | 0.40 | 1.10 |
| 30 | Morphy v Duke of Brunswick and Count Isouard, Paris 1858 (th... | 72169 | 0.74 | 0.41 | 1.16 |
| 31 | Byrne v Fischer, New York 1956 (the Game of the Century), be... | 79538 | 0.85 | 0.45 | 1.30 |
| 32 | Lasker v Thomas, London 1912, before 11.Qxh7+. | 77470 | 0.81 | 0.44 | 1.24 |
| 33 | Reti v Tartakower, Vienna 1910, before 9.Qd8+. | 80127 | 0.90 | 0.46 | 1.36 |
| 34 | Rotlewi v Rubinstein, Lodz 1907 (Rubinstein's Immortal), bef... | 84728 | 0.93 | 0.48 | 1.42 |
| 35 | Levitsky v Marshall, Breslau 1912, before 23...Qg3. | 76410 | 0.82 | 0.44 | 1.26 |
| 36 | Kasparov v Topalov, Wijk aan Zee 1999, before 24.Rxd4. | 80887 | 0.85 | 0.45 | 1.30 |
| 37 | Win at Chess 003 (Rg3). | 78519 | 0.83 | 0.45 | 1.28 |
| 38 | Win at Chess 008 (Rf7). | 70881 | 0.68 | 0.40 | 1.07 |
| 39 | Win at Chess 012 (Qxf3+). | 71413 | 0.72 | 0.40 | 1.12 |
| 40 | Win at Chess 013 (Qxf8+). | 71416 | 0.73 | 0.41 | 1.13 |
| 41 | Win at Chess 021 (Qh6). | 71777 | 0.74 | 0.41 | 1.15 |
| 42 | Botvinnik v Capablanca, AVRO 1938, before 30.Ba3. | 65725 | 0.60 | 0.37 | 0.97 |
| 43 | Win at Chess 005 (Qc4+). | 65687 | 0.66 | 0.38 | 1.04 |
| 44 | Stockfish bench position, rooks and bishops, exposed kings. | 71050 | 0.74 | 0.41 | 1.15 |
| 45 | Stockfish bench position, white pawn on b7. | 79079 | 0.78 | 0.43 | 1.22 |
| 46 | Stockfish bench position, queen and knight against a bare ki... | 43606 | 0.40 | 0.27 | 0.67 |
| 47 | Win at Chess 002 (Rxb2), rook ending. | 51182 | 0.39 | 0.29 | 0.68 |
| 48 | Win at Chess 006 (Rb7), rook ending. | 42827 | 0.35 | 0.26 | 0.61 |
| 49 | Perft position 3 (Chess Programming Wiki), rook ending with ... | 46605 | 0.36 | 0.27 | 0.63 |
| 50 | The Lucena position, rook ending (textbook). | 41800 | 0.36 | 0.26 | 0.62 |
| 51 | Stockfish bench position, rook against pawn. | 37784 | 0.29 | 0.23 | 0.52 |
| 52 | Stockfish bench position, bishop ending with a pawn about to... | 33940 | 0.27 | 0.21 | 0.47 |
| 53 | Stockfish bench position, bishop against pawn. | 31128 | 0.24 | 0.19 | 0.44 |
| 54 | Stockfish bench position, en passant target d3 in an ending. | 33569 | 0.26 | 0.21 | 0.47 |
| 55 | Stockfish bench position, bishop and pawn, stalemate motif. | 27519 | 0.23 | 0.17 | 0.40 |
| 56 | Stockfish bench position, four rooks with every castling rig... | 45897 | 0.45 | 0.29 | 0.74 |
| 57 | The Saavedra position (1895), pawn ending study. | 36944 | 0.29 | 0.23 | 0.52 |
| 58 | Reti's study (1921), pawn ending. | 18396 | 0.13 | 0.11 | 0.23 |
| 59 | Stockfish bench position, king and pawn against king. | 14964 | 0.12 | 0.08 | 0.20 |
| 60 | Bare kings, the extreme. | 17052 | 0.13 | 0.10 | 0.23 |

## Appendix B: reproducing this

```
cd core
cargo run --release --example measure -- --runs 31 ../docs/measurements/corpus.fen
```

The WebAssembly figures need the package built (`wasm-pack build wasm --target web --release --out-dir pkg` from `core/`), then a Node script that imports `core/wasm/pkg/force_core_wasm.js`, calls its default export with `{ module_or_path: <the .wasm bytes> }`, and times `analyze(fen)` and `JSON.parse` on each line of the corpus. The savings table was produced the same way, rewriting each parsed document per option and re-serialising it. Neither script is part of the repository; they were one-off measurement tools and the method above is enough to repeat them.
