# web

The representation side: projections and the web shell. TypeScript.

Projections are pure mappings from configuration, force state, optional associations and optional interaction context to a declarative scene description (concept section 7). The shell renders scene descriptions and provides the board, input, navigation, import and export.

The first projection is the raw-values projection (concept 7.1): red tallies for threats and green for defences on occupied squares, side-coloured tallies on empty squares, exact figures in the piece and square panels. It is built first and never removed.
