//! Reading one game from PGN text (concept section 6).
//!
//! The text is tokenised by pgn-reader, the PGN companion of shakmaty, and
//! every move of the main line is checked and played by shakmaty, so the
//! rules stay bought (P5, P7). The result is the parsed-game document of
//! `contract/schema/game.schema.json`: a few headers, the starting FEN, and
//! for each move its notation as written, its squares and the FEN after it.
//! Variations, comments and annotation glyphs are skipped. Only the first
//! game of a text is read; the document says how many there were.
//!
//! Every refusal is a sentence for a reader with no chess vocabulary (P8),
//! naming the side, the move number and the move as written.

use std::fmt;
use std::io::Cursor;
use std::ops::ControlFlow;

use pgn_reader::{KnownOutcome, Outcome, RawTag, Reader, SanPlus, Skip, Visitor};
use serde::Serialize;
use shakmaty::fen::Fen;
use shakmaty::san::{San, SanError};
use shakmaty::{Chess, Color, EnPassantMode, File, Move, Position, Role, Square};

use crate::config::{ConfigError, position_from_fen};
use crate::words::{color_name, role_name, sentence_case};

/// The version of the parsed-game document this module writes.
pub const GAME_VERSION: &str = "0.1.0";

/// Why a text could not be read as a game. Every message is a sentence in
/// plain words.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GameError {
    /// The text holds neither headers nor moves.
    NoGame(String),
    /// The text, or its FEN header, cannot be read.
    Unreadable(String),
    /// The FEN header describes a board no game can reach.
    Impossible(String),
    /// A move of the main line cannot be played where it stands.
    IllegalMove(String),
}

impl GameError {
    /// The short code a caller can switch on.
    pub fn code(&self) -> &'static str {
        match self {
            GameError::NoGame(_) => "no_game",
            GameError::Unreadable(_) => "unreadable",
            GameError::Impossible(_) => "impossible",
            GameError::IllegalMove(_) => "illegal_move",
        }
    }
}

impl fmt::Display for GameError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GameError::NoGame(text)
            | GameError::Unreadable(text)
            | GameError::Impossible(text)
            | GameError::IllegalMove(text) => f.write_str(text),
        }
    }
}

impl std::error::Error for GameError {}

impl From<ConfigError> for GameError {
    fn from(err: ConfigError) -> Self {
        let text = format!("The game's FEN header could not be used. {err}");
        match err {
            ConfigError::Unreadable(_) => GameError::Unreadable(text),
            ConfigError::Impossible(_) => GameError::Impossible(text),
        }
    }
}

/// The parsed-game document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedGame {
    pub game_version: &'static str,
    pub headers: Headers,
    pub start_fen: String,
    pub moves: Vec<GameMove>,
    pub games_in_text: usize,
}

/// The seven standard headers. Absent, or a placeholder, is `None`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct Headers {
    pub event: Option<String>,
    pub site: Option<String>,
    pub date: Option<String>,
    pub round: Option<String>,
    pub white: Option<String>,
    pub black: Option<String>,
    pub result: Option<String>,
}

/// One move of the main line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMove {
    pub san: String,
    pub from: String,
    pub to: String,
    pub promotion: Option<&'static str>,
    pub fen_after: String,
}

/// Reads the first game in `text`.
pub fn parse_game(text: &str) -> Result<ParsedGame, GameError> {
    let mut reader = Reader::new(Cursor::new(text.as_bytes()));
    let mut visitor = GameVisitor;
    let first = reader.read_game(&mut visitor).map_err(unreadable)?;
    let Some(first) = first else {
        return Err(no_game());
    };
    let mut game = first?;
    game.games_in_text = 1;
    while reader.skip_game().map_err(unreadable)? {
        game.games_in_text += 1;
    }
    Ok(game)
}

/// The parsed game as a JSON value.
pub fn parse_game_json(text: &str) -> Result<serde_json::Value, GameError> {
    let game = parse_game(text)?;
    Ok(serde_json::to_value(&game).expect("the parsed game always serialises"))
}

fn no_game() -> GameError {
    GameError::NoGame(
        "This text contains no chess game: no headers and no moves were found.".to_string(),
    )
}

fn unreadable(err: std::io::Error) -> GameError {
    GameError::Unreadable(format!("This text could not be read as PGN: {err}."))
}

/// What the headers say before the move text starts.
#[derive(Default)]
struct Tags {
    headers: Headers,
    fen: Option<String>,
    /// The result token at the end of the move text is used only when
    /// the Result header is missing, so the two are kept apart.
    result_header_seen: bool,
    any: bool,
}

/// The game as it is being played through.
struct Movetext {
    headers: Headers,
    result_header_seen: bool,
    had_tags: bool,
    start_fen: String,
    position: Chess,
    moves: Vec<GameMove>,
    outcome: Option<Outcome>,
}

struct GameVisitor;

impl Visitor for GameVisitor {
    type Tags = Tags;
    type Movetext = Movetext;
    type Output = Result<ParsedGame, GameError>;

    fn begin_tags(&mut self) -> ControlFlow<Self::Output, Self::Tags> {
        ControlFlow::Continue(Tags::default())
    }

    fn tag(
        &mut self,
        tags: &mut Self::Tags,
        name: &[u8],
        value: RawTag<'_>,
    ) -> ControlFlow<Self::Output> {
        tags.any = true;
        let value = value.decode_utf8_lossy().into_owned();
        let slot = match name {
            b"Event" => &mut tags.headers.event,
            b"Site" => &mut tags.headers.site,
            b"Date" => &mut tags.headers.date,
            b"Round" => &mut tags.headers.round,
            b"White" => &mut tags.headers.white,
            b"Black" => &mut tags.headers.black,
            b"Result" => {
                tags.result_header_seen = true;
                tags.headers.result = result_text(&value).map(str::to_string);
                return ControlFlow::Continue(());
            }
            b"FEN" => {
                tags.fen = Some(value);
                return ControlFlow::Continue(());
            }
            _ => return ControlFlow::Continue(()),
        };
        *slot = header_value(value);
        ControlFlow::Continue(())
    }

    fn begin_movetext(&mut self, tags: Self::Tags) -> ControlFlow<Self::Output, Self::Movetext> {
        let position = match &tags.fen {
            // A FEN header is honoured whether or not SetUp "1" accompanies it.
            Some(fen) => match position_from_fen(fen) {
                Ok(position) => position,
                Err(err) => return ControlFlow::Break(Err(GameError::from(err))),
            },
            None => Chess::default(),
        };
        ControlFlow::Continue(Movetext {
            headers: tags.headers,
            result_header_seen: tags.result_header_seen,
            had_tags: tags.any,
            start_fen: fen_of(&position),
            position,
            moves: Vec::new(),
            outcome: None,
        })
    }

    fn san(
        &mut self,
        movetext: &mut Self::Movetext,
        san_plus: SanPlus,
    ) -> ControlFlow<Self::Output> {
        let written = san_plus.to_string();
        let position = &movetext.position;
        let m = match san_plus.san.to_move(position) {
            Ok(m) => m,
            Err(err) => {
                return ControlFlow::Break(Err(GameError::IllegalMove(describe_refusal(
                    position,
                    &written,
                    &san_plus.san,
                    err,
                ))));
            }
        };
        let (from, to) = squares_of(&m);
        movetext.position.play_unchecked(m);
        movetext.moves.push(GameMove {
            san: written,
            from: from.to_string(),
            to: to.to_string(),
            promotion: m.promotion().map(promotion_name),
            fen_after: fen_of(&movetext.position),
        });
        ControlFlow::Continue(())
    }

    fn begin_variation(
        &mut self,
        _movetext: &mut Self::Movetext,
    ) -> ControlFlow<Self::Output, Skip> {
        ControlFlow::Continue(Skip(true))
    }

    fn outcome(
        &mut self,
        movetext: &mut Self::Movetext,
        outcome: Outcome,
    ) -> ControlFlow<Self::Output> {
        movetext.outcome = Some(outcome);
        ControlFlow::Continue(())
    }

    fn end_game(&mut self, movetext: Self::Movetext) -> Self::Output {
        if !movetext.had_tags && movetext.moves.is_empty() {
            return Err(no_game());
        }
        let mut headers = movetext.headers;
        if !movetext.result_header_seen {
            headers.result = movetext.outcome.and_then(outcome_text).map(str::to_string);
        }
        Ok(ParsedGame {
            game_version: GAME_VERSION,
            headers,
            start_fen: movetext.start_fen,
            moves: movetext.moves,
            games_in_text: 0,
        })
    }
}

/// A header value, or `None` for PGN's placeholders: an empty value, or one
/// made only of `?`, `.` and `-` ("?", "????.??.??", "-").
fn header_value(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.chars().all(|c| matches!(c, '?' | '.' | '-')) {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn result_text(value: &str) -> Option<&'static str> {
    match value.trim() {
        "1-0" => Some("1-0"),
        "0-1" => Some("0-1"),
        "1/2-1/2" => Some("1/2-1/2"),
        _ => None,
    }
}

fn outcome_text(outcome: Outcome) -> Option<&'static str> {
    match outcome {
        Outcome::Known(KnownOutcome::Decisive {
            winner: Color::White,
        }) => Some("1-0"),
        Outcome::Known(KnownOutcome::Decisive {
            winner: Color::Black,
        }) => Some("0-1"),
        Outcome::Known(KnownOutcome::Draw) => Some("1/2-1/2"),
        Outcome::Unknown => None,
    }
}

/// The FEN written the way the force-state contract keeps an en passant
/// target: only when an enemy pawn stands beside the pawn that just moved.
fn fen_of(position: &Chess) -> String {
    Fen::from_position(position, EnPassantMode::PseudoLegal).to_string()
}

/// The squares the document records: castling as the king's two-square move.
fn squares_of(m: &Move) -> (Square, Square) {
    match *m {
        Move::Castle { king, rook } => {
            let file = if rook.file() > king.file() {
                File::G
            } else {
                File::C
            };
            (king, Square::from_coords(file, king.rank()))
        }
        _ => (
            m.from().expect("every move in a game has a from square"),
            m.to(),
        ),
    }
}

fn promotion_name(role: Role) -> &'static str {
    role_name(role)
}

/// "Black's 14th move, Nxe5, is not legal in the position it is played from."
fn describe_refusal(position: &Chess, written: &str, san: &San, err: SanError) -> String {
    let side = sentence_case(color_name(position.turn()));
    let number = ordinal(position.fullmoves().get());
    match err {
        SanError::IllegalSan => format!(
            "{side}'s {number} move, {written}, is not legal in the position it is played from."
        ),
        SanError::AmbiguousSan => {
            let piece = match san {
                San::Normal { role, .. } => {
                    format!("{} {}", color_name(position.turn()), role_name(*role))
                }
                _ => format!("{} piece", color_name(position.turn())),
            };
            format!(
                "{side}'s {number} move, {written}, could be made by more than one {piece}, so it is not clear which is meant."
            )
        }
    }
}

/// "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "112th".
pub fn ordinal(n: u32) -> String {
    let suffix = match (n % 10, n % 100) {
        (_, 11..=13) => "th",
        (1, _) => "st",
        (2, _) => "nd",
        (3, _) => "rd",
        _ => "th",
    };
    format!("{n}{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinals_follow_english() {
        let cases = [
            (1, "1st"),
            (2, "2nd"),
            (3, "3rd"),
            (4, "4th"),
            (11, "11th"),
            (12, "12th"),
            (13, "13th"),
            (21, "21st"),
            (22, "22nd"),
            (23, "23rd"),
            (101, "101st"),
            (111, "111th"),
            (112, "112th"),
        ];
        for (n, expected) in cases {
            assert_eq!(ordinal(n), expected);
        }
    }

    #[test]
    fn placeholders_become_null() {
        assert_eq!(header_value("?".to_string()), None);
        assert_eq!(header_value("????.??.??".to_string()), None);
        assert_eq!(header_value("-".to_string()), None);
        assert_eq!(header_value("  ".to_string()), None);
        assert_eq!(
            header_value("1999.??.??".to_string()),
            Some("1999.??.??".to_string())
        );
        assert_eq!(
            header_value(" Alice ".to_string()),
            Some("Alice".to_string())
        );
    }

    #[test]
    fn castling_is_the_kings_two_square_move() {
        let game = parse_game("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 O-O *").unwrap();
        let white = &game.moves[6];
        assert_eq!(
            (white.san.as_str(), white.from.as_str(), white.to.as_str()),
            ("O-O", "e1", "g1")
        );
        let black = &game.moves[9];
        assert_eq!((black.from.as_str(), black.to.as_str()), ("e8", "g8"));
    }

    #[test]
    fn a_promotion_names_the_piece() {
        let game = parse_game("[FEN \"8/P6k/8/8/8/8/8/K7 w - - 0 1\"]\n\n1. a8=N *").unwrap();
        assert_eq!(game.moves[0].promotion, Some("knight"));
        assert_eq!(game.moves[0].fen_after, "N7/7k/8/8/8/8/8/K7 b - - 0 1");
    }

    #[test]
    fn the_result_token_fills_in_a_missing_result_header() {
        let game = parse_game("1. f3 e5 2. g4 Qh4# 0-1").unwrap();
        assert_eq!(game.headers.result.as_deref(), Some("0-1"));
        let game = parse_game("[Result \"*\"]\n\n1. f3 e5 2. g4 Qh4# 0-1").unwrap();
        assert_eq!(game.headers.result, None);
    }

    #[test]
    fn an_impossible_fen_header_is_refused_with_the_configuration_sentence() {
        let err = parse_game("[FEN \"8/8/8/8/8/8/8/8 w - - 0 1\"]\n\n*").unwrap_err();
        assert_eq!(err.code(), "impossible");
        assert!(
            err.to_string()
                .starts_with("The game's FEN header could not be used."),
            "{err}"
        );
    }
}
