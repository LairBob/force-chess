//! The configuration: the complete input to the force function (concept section 3).
//!
//! A FEN is read, its side to move and clocks are dropped, castling rights and
//! the en passant target are normalised exactly as `contract/schema/README.md`
//! says, and the canonical string is hashed into the configuration key.

use std::fmt;

use sha2::{Digest, Sha256};
use shakmaty::fen::Fen;
use shakmaty::{Bitboard, Board, ByColor, Color, File, Piece, Rank, Role, Square};

use crate::words::{color_name, join_and, piece_on};

/// Why a FEN could not be turned into a configuration. Every message is a
/// plain-words sentence naming the squares involved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigError {
    /// The text is not a FEN that can be read at all.
    Unreadable(String),
    /// The FEN reads, but describes a board that cannot occur in a game.
    Impossible(String),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::Unreadable(text) | ConfigError::Impossible(text) => f.write_str(text),
        }
    }
}

impl std::error::Error for ConfigError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct CastlingRights {
    pub kingside: bool,
    pub queenside: bool,
}

/// An en passant target that survived normalisation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EnPassantTarget {
    /// The square the capturing pawn moves to.
    pub square: Square,
    /// The only side that can make the capture.
    pub capturable_by: Color,
    /// The pawn that the capture removes.
    pub pawn_to_capture: Square,
}

#[derive(Debug, Clone)]
pub struct Configuration {
    pub board: Board,
    pub castling: ByColor<CastlingRights>,
    pub en_passant: Option<EnPassantTarget>,
    pub placement: String,
    pub canonical: String,
    pub key: String,
}

impl Configuration {
    /// The castling rights as shakmaty expects them: the squares of the rooks
    /// that may still castle.
    pub fn castling_rooks(&self) -> Bitboard {
        let mut rooks = Bitboard::EMPTY;
        for color in Color::ALL {
            let rights = self.castling.get(color);
            let rank = color.backrank();
            if rights.kingside {
                rooks.add(Square::from_coords(File::H, rank));
            }
            if rights.queenside {
                rooks.add(Square::from_coords(File::A, rank));
            }
        }
        rooks
    }
}

/// The square the king starts on, for one side.
pub fn king_home(color: Color) -> Square {
    Square::from_coords(File::E, color.backrank())
}

/// The square the rook on one wing starts on.
pub fn rook_home(color: Color, kingside: bool) -> Square {
    let file = if kingside { File::H } else { File::A };
    Square::from_coords(file, color.backrank())
}

/// Reads a FEN and builds its configuration.
pub fn parse(fen: &str) -> Result<Configuration, ConfigError> {
    let parsed = Fen::from_ascii(fen.trim().as_bytes()).map_err(|err| {
        ConfigError::Unreadable(format!(
            "This text cannot be read as a FEN position ({err}): \"{}\".",
            fen.trim()
        ))
    })?;
    let setup = parsed.into_setup();
    let board = setup.board;

    check_kings(&board)?;
    check_pawn_ranks(&board)?;
    check_both_in_check(&board)?;

    let castling = ByColor::new_with(|color| {
        let king_at_home = board.piece_at(king_home(color)) == Some(color.king());
        let right = |kingside: bool| {
            let rook_square = rook_home(color, kingside);
            setup.castling_rights.contains(rook_square)
                && king_at_home
                && board.piece_at(rook_square) == Some(color.rook())
        };
        CastlingRights {
            kingside: right(true),
            queenside: right(false),
        }
    });

    let en_passant = match setup.ep_square {
        None => None,
        Some(square) => normalise_en_passant(&board, square)?,
    };

    let placement = board.board_fen().to_string();
    let canonical = canonical_string(&placement, &castling, en_passant);
    let key = sha256_hex(&canonical);

    Ok(Configuration {
        board,
        castling,
        en_passant,
        placement,
        canonical,
        key,
    })
}

fn canonical_string(
    placement: &str,
    castling: &ByColor<CastlingRights>,
    en_passant: Option<EnPassantTarget>,
) -> String {
    let mut rights = String::new();
    if castling.white.kingside {
        rights.push('K');
    }
    if castling.white.queenside {
        rights.push('Q');
    }
    if castling.black.kingside {
        rights.push('k');
    }
    if castling.black.queenside {
        rights.push('q');
    }
    if rights.is_empty() {
        rights.push('-');
    }
    let target = en_passant.map_or_else(|| "-".to_string(), |ep| ep.square.to_string());
    format!("{placement} {rights} {target}")
}

fn sha256_hex(text: &str) -> String {
    Sha256::digest(text.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn check_kings(board: &Board) -> Result<(), ConfigError> {
    for color in Color::ALL {
        let count = (board.kings() & board.by_color(color)).count();
        if count != 1 {
            return Err(ConfigError::Impossible(format!(
                "The board must hold exactly one {} king; this one holds {count}.",
                color_name(color)
            )));
        }
    }
    Ok(())
}

fn check_pawn_ranks(board: &Board) -> Result<(), ConfigError> {
    let stranded = board.pawns() & Bitboard::BACKRANKS;
    if let Some(square) = stranded.first() {
        let piece = board
            .piece_at(square)
            .expect("a pawn stands on this square");
        return Err(ConfigError::Impossible(format!(
            "{} stands on the first or last rank, where no pawn can ever be: a pawn reaching the far end is promoted at once, and a pawn never stands behind its starting rank.",
            crate::words::sentence_case(&piece_on(piece, square))
        )));
    }
    Ok(())
}

fn check_both_in_check(board: &Board) -> Result<(), ConfigError> {
    let attackers = |color: Color| {
        let king = board.king_of(color).expect("each side has one king");
        board.attacks_to(king, !color, board.occupied())
    };
    let (white, black) = (attackers(Color::White), attackers(Color::Black));
    if white.any() && black.any() {
        let names = |bits: Bitboard| -> String {
            let list: Vec<String> = bits
                .into_iter()
                .map(|sq| piece_on(board.piece_at(sq).expect("an attacker"), sq))
                .collect();
            join_and(&list)
        };
        return Err(ConfigError::Impossible(format!(
            "Both kings are in check: the white king by {} and the black king by {}. That cannot happen in a game, because whoever moved last would have left their own king in check.",
            names(white),
            names(black)
        )));
    }
    Ok(())
}

/// Keeps an en passant target only when a pawn of the capturing side stands
/// beside the pawn it could take (contract/schema/README.md, canonical form).
/// A target that no pawn could just have created is not a configuration at all
/// and is refused with an explanation.
fn normalise_en_passant(
    board: &Board,
    square: Square,
) -> Result<Option<EnPassantTarget>, ConfigError> {
    // A target on the third rank was made by a white pawn stepping from the
    // second rank to the fourth, and only black can capture it; the sixth
    // rank mirrors that for black.
    let (capturer, pushed_from, pushed_to) = match square.rank() {
        Rank::Third => (Color::Black, Rank::Second, Rank::Fourth),
        Rank::Sixth => (Color::White, Rank::Seventh, Rank::Fifth),
        _ => {
            return Err(ConfigError::Impossible(format!(
                "The en passant square {square} is not on the third or sixth rank, so no pawn can just have passed over it."
            )));
        }
    };
    let mover = !capturer;
    let pawn_to_capture = Square::from_coords(square.file(), pushed_to);
    let origin = Square::from_coords(square.file(), pushed_from);
    let story = format!(
        "The en passant square {square} says a {} pawn has just moved two squares, from {origin} to {pawn_to_capture}",
        color_name(mover)
    );
    if board.piece_at(pawn_to_capture)
        != Some(Piece {
            color: mover,
            role: Role::Pawn,
        })
    {
        return Err(ConfigError::Impossible(format!(
            "{story}, but there is no {} pawn on {pawn_to_capture}.",
            color_name(mover)
        )));
    }
    if let Some(piece) = board.piece_at(square) {
        return Err(ConfigError::Impossible(format!(
            "{story}, but {} stands on {square}, which that pawn would have passed over.",
            piece_on(piece, square)
        )));
    }
    if let Some(piece) = board.piece_at(origin) {
        return Err(ConfigError::Impossible(format!(
            "{story}, but {} stands on {origin}, where that pawn would have started.",
            piece_on(piece, origin)
        )));
    }
    let beside =
        shakmaty::attacks::pawn_attacks(mover, square) & board.pawns() & board.by_color(capturer);
    // pawn_attacks(mover, target) gives the two squares diagonally behind the
    // target from the capturer's side, which are exactly the squares beside
    // the pawn to capture.
    if beside.is_empty() {
        return Ok(None);
    }
    Ok(Some(EnPassantTarget {
        square,
        capturable_by: capturer,
        pawn_to_capture,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_kings_key_matches_the_contract_example() {
        let config = parse("4k3/8/8/8/8/8/8/4K3 w - - 0 1").unwrap();
        assert_eq!(config.canonical, "4k3/8/8/8/8/8/8/4K3 - -");
        assert_eq!(
            config.key,
            "77e88eea6a991da038859d36b738bce9de93a4f1ba1ca707e4651f1929e80ce0"
        );
    }

    #[test]
    fn side_to_move_and_clocks_do_not_change_the_key() {
        let a = parse("4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1").unwrap();
        let b = parse("4k3/8/8/8/3pP3/8/8/4K3 w - e3 17 40").unwrap();
        assert_eq!(a.key, b.key);
    }

    #[test]
    fn castling_right_without_its_rook_is_dropped() {
        let config = parse("r3k3/8/8/8/8/8/8/4K2R w KQkq - 0 1").unwrap();
        assert_eq!(config.canonical, "r3k3/8/8/8/8/8/8/4K2R Kq -");
    }

    #[test]
    fn en_passant_target_with_no_pawn_behind_it_is_refused() {
        let err = parse("4k3/8/8/8/8/8/8/4K3 w - e3 0 1").unwrap_err();
        assert!(err.to_string().contains("no white pawn on e4"), "{err}");
    }
}
