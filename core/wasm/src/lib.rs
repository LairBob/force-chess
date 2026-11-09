//! force-core-wasm: the thin WebAssembly face of force-core.
//!
//! Three functions cross the boundary, all taking and returning strings so
//! the JSON contracts in `contract/schema/` are the only shared shapes:
//!
//! - [`analyze`] turns a FEN into its force-state document.
//! - [`apply_move`] plays one legal move on a FEN and returns the new FEN,
//!   with the rules bought from shakmaty (P5, P7).
//! - [`parse_game`] reads the first game of a PGN text into its parsed-game
//!   document.
//!
//! Failures are thrown as a [`ForceError`] carrying a code and a plain-words
//! sentence (P8). force-core itself knows nothing of this crate.

use shakmaty::fen::Fen;
use shakmaty::{Chess, EnPassantMode, Move, Position, Role, Square};
use wasm_bindgen::prelude::*;

use force_core::words::{color_name, piece_on, sentence_case};

/// Why a call could not be completed. `code` is one of `unreadable` (the
/// text is not a FEN, or not PGN), `impossible` (the FEN describes a board no
/// game can reach), `illegal_move` (the move is not legal in this position,
/// or a move of a game cannot be played where it stands), `bad_square` (a
/// square name is not a square) or `no_game` (the text holds no game).
/// `text` is a sentence for a reader with no chess vocabulary.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct ForceError {
    pub code: String,
    pub text: String,
}

impl ForceError {
    fn new(code: &str, text: impl Into<String>) -> Self {
        ForceError {
            code: code.to_string(),
            text: text.into(),
        }
    }
}

impl From<force_core::ConfigError> for ForceError {
    fn from(err: force_core::ConfigError) -> Self {
        let code = match err {
            force_core::ConfigError::Unreadable(_) => "unreadable",
            force_core::ConfigError::Impossible(_) => "impossible",
        };
        ForceError::new(code, err.to_string())
    }
}

impl From<force_core::GameError> for ForceError {
    fn from(err: force_core::GameError) -> Self {
        ForceError::new(err.code(), err.to_string())
    }
}

/// The contract version the documents follow.
#[wasm_bindgen(js_name = contractVersion)]
pub fn contract_version() -> String {
    force_core::CONTRACT_VERSION.to_string()
}

/// The force-state document of the position a FEN describes, as minified
/// JSON. The side to move and the clocks are ignored, as the contract says.
#[wasm_bindgen]
pub fn analyze(fen: &str) -> Result<String, ForceError> {
    let state = force_core::force_state(fen)?;
    Ok(serde_json::to_string(&state).expect("the force state always serialises"))
}

/// The parsed-game document of the first game in a PGN text, as minified
/// JSON following `contract/schema/game.schema.json`. Variations, comments
/// and annotation glyphs are skipped; the document says how many games the
/// text held.
#[wasm_bindgen(js_name = parseGame)]
pub fn parse_game(pgn: &str) -> Result<String, ForceError> {
    let game = force_core::parse_game(pgn)?;
    Ok(serde_json::to_string(&game).expect("the parsed game always serialises"))
}

/// Plays the move from `from` to `to` (with `promotion` naming the piece a
/// pawn becomes: `queen`, `rook`, `bishop` or `knight`) for the side the FEN
/// says is to move, and returns the FEN of the position after it. Castling is
/// given as the king's move, e1 to g1 for instance. The move must be legal.
#[wasm_bindgen(js_name = applyMove)]
pub fn apply_move(
    fen: &str,
    from: &str,
    to: &str,
    promotion: Option<String>,
) -> Result<String, ForceError> {
    let position = force_core::config::position_from_fen(fen)?;
    let from_square = parse_square(from)?;
    let to_square = parse_square(to)?;
    let promotion_role = match promotion.as_deref() {
        None | Some("") => None,
        Some("queen") => Some(Role::Queen),
        Some("rook") => Some(Role::Rook),
        Some("bishop") => Some(Role::Bishop),
        Some("knight") => Some(Role::Knight),
        Some(other) => {
            return Err(ForceError::new(
                "illegal_move",
                format!(
                    "A pawn can become a queen, a rook, a bishop or a knight, not \"{other}\"."
                ),
            ));
        }
    };

    let chosen = position
        .legal_moves()
        .into_iter()
        .find(|m| matches_request(m, from_square, to_square, promotion_role));
    let Some(chosen) = chosen else {
        return Err(ForceError::new(
            "illegal_move",
            describe_illegal(&position, from_square, to_square, promotion_role),
        ));
    };

    let after = position.play(chosen).map_err(|err| {
        ForceError::new(
            "illegal_move",
            format!("The move could not be played: {err}."),
        )
    })?;
    Ok(Fen::from_position(&after, EnPassantMode::PseudoLegal).to_string())
}

fn parse_square(text: &str) -> Result<Square, ForceError> {
    text.parse::<Square>().map_err(|_| {
        ForceError::new(
            "bad_square",
            format!("\"{text}\" is not a square; squares are named a1 to h8."),
        )
    })
}

/// Whether a legal move is the one asked for. Castling in shakmaty is a king
/// move onto its rook; the shell asks for it as the king's two-square move.
fn matches_request(m: &Move, from: Square, to: Square, promotion: Option<Role>) -> bool {
    match *m {
        Move::Castle { king, rook } => {
            let rank = king.rank();
            let landing = if rook.file() > king.file() {
                Square::from_coords(shakmaty::File::G, rank)
            } else {
                Square::from_coords(shakmaty::File::C, rank)
            };
            from == king && (to == landing || to == rook) && promotion.is_none()
        }
        // A promotion must name the piece, and a plain move must not: the
        // shell always says which it is asking for.
        _ => m.from() == Some(from) && m.to() == to && m.promotion() == promotion,
    }
}

fn describe_illegal(position: &Chess, from: Square, to: Square, promotion: Option<Role>) -> String {
    let board = position.board();
    let turn = position.turn();
    match board.piece_at(from) {
        None => format!("There is no piece on {from} to move."),
        Some(piece) if piece.color != turn => sentence_case(&format!(
            "it is {}'s move, so {} cannot move now.",
            color_name(turn),
            piece_on(piece, from)
        )),
        Some(piece) => {
            let has_promotions = position
                .legal_moves()
                .iter()
                .any(|m| m.from() == Some(from) && m.to() == to && m.promotion().is_some());
            if has_promotions && promotion.is_none() {
                return sentence_case(&format!(
                    "{} reaches {to} only by promoting, so the piece it becomes must be named.",
                    piece_on(piece, from)
                ));
            }
            sentence_case(&format!(
                "{} cannot move to {to} in this position.",
                piece_on(piece, from)
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const START: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    #[test]
    fn analyze_returns_the_document() {
        let text = analyze(START).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["contractVersion"], force_core::CONTRACT_VERSION);
        assert_eq!(value["sides"]["white"]["legalMoveCount"], 20);
    }

    #[test]
    fn analyze_refuses_with_a_sentence() {
        let err = analyze("8/8/8/8/8/8/8/8 w - - 0 1").unwrap_err();
        assert_eq!(err.code, "impossible");
        assert!(err.text.contains("king"), "{}", err.text);
        let err = analyze("not a fen").unwrap_err();
        assert_eq!(err.code, "unreadable");
    }

    #[test]
    fn parse_game_returns_the_document() {
        let text = parse_game("1. e4 e5 2. Nf3 *").unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["gameVersion"], force_core::GAME_VERSION);
        assert_eq!(value["moves"].as_array().unwrap().len(), 3);
        assert_eq!(value["moves"][2]["san"], "Nf3");
        assert_eq!(value["gamesInText"], 1);
    }

    #[test]
    fn parse_game_refuses_with_a_sentence() {
        let err = parse_game("1. e4 e5 2. Qh5 Nc6 3. Qh8 *").unwrap_err();
        assert_eq!(err.code, "illegal_move");
        assert_eq!(
            err.text,
            "White's 3rd move, Qh8, is not legal in the position it is played from."
        );
        let err = parse_game("").unwrap_err();
        assert_eq!(err.code, "no_game");
    }

    #[test]
    fn apply_move_plays_a_pawn_push() {
        let after = apply_move(START, "e2", "e4", None).unwrap();
        assert_eq!(
            after,
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        );
    }

    #[test]
    fn apply_move_refuses_an_illegal_move() {
        let err = apply_move(START, "e2", "e5", None).unwrap_err();
        assert_eq!(err.code, "illegal_move");
        assert_eq!(
            err.text,
            "The white pawn on e2 cannot move to e5 in this position."
        );
        let err = apply_move(START, "e7", "e5", None).unwrap_err();
        assert_eq!(
            err.text,
            "It is white's move, so the black pawn on e7 cannot move now."
        );
        let err = apply_move(START, "e4", "e5", None).unwrap_err();
        assert_eq!(err.text, "There is no piece on e4 to move.");
    }

    #[test]
    fn apply_move_castles_by_the_king_move() {
        let fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
        let after = apply_move(fen, "e1", "g1", None).unwrap();
        assert_eq!(after, "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1");
        let after = apply_move(fen, "e1", "c1", None).unwrap();
        assert_eq!(after, "r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1");
    }

    #[test]
    fn apply_move_promotes_only_when_the_piece_is_named() {
        let fen = "8/P6k/8/8/8/8/8/K7 w - - 0 1";
        let err = apply_move(fen, "a7", "a8", None).unwrap_err();
        assert_eq!(err.code, "illegal_move");
        assert!(err.text.contains("promoting"), "{}", err.text);
        let after = apply_move(fen, "a7", "a8", Some("knight".into())).unwrap();
        assert_eq!(after, "N7/7k/8/8/8/8/8/K7 b - - 0 1");
    }

    #[test]
    fn apply_move_records_a_pseudo_legal_en_passant_target() {
        // After e2-e4 with a black pawn on d4, the target e3 is written.
        let fen = "4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1";
        let after = apply_move(fen, "e2", "e4", None).unwrap();
        assert_eq!(after, "4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
        // Without a black pawn beside it, no target is written.
        let fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
        let after = apply_move(fen, "e2", "e4", None).unwrap();
        assert_eq!(after, "4k3/8/8/8/4P3/8/8/4K3 b - - 0 1");
    }
}
