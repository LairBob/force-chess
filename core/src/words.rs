//! Plain words for pieces, squares and lists (concept P8).
//!
//! Every explanation the force state carries names pieces by colour, type and
//! square, so a reader needs no chess intuition to follow it.

use shakmaty::{Board, Color, Piece, Role, Square};

pub fn color_name(color: Color) -> &'static str {
    match color {
        Color::White => "white",
        Color::Black => "black",
    }
}

pub fn role_name(role: Role) -> &'static str {
    match role {
        Role::Pawn => "pawn",
        Role::Knight => "knight",
        Role::Bishop => "bishop",
        Role::Rook => "rook",
        Role::Queen => "queen",
        Role::King => "king",
    }
}

/// "white knight", without a square.
pub fn piece_kind(piece: Piece) -> String {
    format!("{} {}", color_name(piece.color), role_name(piece.role))
}

/// "the white knight on e3".
pub fn piece_on(piece: Piece, square: Square) -> String {
    format!("the {} on {}", piece_kind(piece), square)
}

/// "the white knight on e3", reading the piece from the board.
///
/// Callers only ask about squares they know to be occupied; an empty square
/// is described as such rather than causing a failure.
pub fn named(board: &Board, square: Square) -> String {
    match board.piece_at(square) {
        Some(piece) => piece_on(piece, square),
        None => format!("the empty square {square}"),
    }
}

/// Capitalises the first letter, for the start of a sentence.
pub fn sentence_case(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// "a", "a and b", "a, b and c".
pub fn join_and(items: &[String]) -> String {
    match items {
        [] => String::new(),
        [only] => only.clone(),
        [init @ .., last] => format!("{} and {}", init.join(", "), last),
    }
}

/// "first", "second", ... for ranks, used when naming a line of the board.
pub fn rank_ordinal(rank_index: u32) -> &'static str {
    [
        "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
    ][rank_index as usize]
}
