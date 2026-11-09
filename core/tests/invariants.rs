//! Checks that hold for every position, run over a few thousand positions
//! reached from rich starting points: the fallback move generator agrees with
//! shakmaty, L1 reach agrees with legal moves, and every document is valid
//! against the force-state schema.

mod common;

use std::collections::BTreeSet;

use serde_json::Value;
use shakmaty::fen::Fen;
use shakmaty::{CastlingMode, Chess, Color, EnPassantMode, Position};

use force_core::config;
use force_core::geometry;
use force_core::legality::Context;
use force_core::moves::{self, Source};

/// Starting points chosen to exercise castling both ways, en passant,
/// promotion with and without capture, pins, checks and discovered checks.
const ROOTS: &[&str] = &[
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    // "Kiwipete", the standard move-generator stress position.
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    // En passant along a rank with the king on it, and promotions.
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    // A knight check, a bishop pin and a queen on an open diagonal.
    "4k3/8/8/1b6/8/3N4/4K3/8 w - - 0 1",
];

fn positions() -> Vec<Chess> {
    let mut found = Vec::new();
    let mut seen = BTreeSet::new();
    for root in ROOTS {
        let start: Chess = Fen::from_ascii(root.as_bytes())
            .unwrap()
            .into_position(CastlingMode::Standard)
            .unwrap();
        let mut frontier = vec![start];
        for _depth in 0..=2 {
            let mut next = Vec::new();
            for position in frontier {
                let fen = Fen::from_position(&position, EnPassantMode::Always).to_string();
                if !seen.insert(fen) {
                    continue;
                }
                for m in position.legal_moves() {
                    let mut child = position.clone();
                    child.play_unchecked(m);
                    next.push(child);
                }
                found.push(position);
            }
            frontier = next;
        }
    }
    found
}

fn fen_of(position: &Chess) -> String {
    Fen::from_position(position, EnPassantMode::Always).to_string()
}

#[test]
fn own_generator_agrees_with_shakmaty_wherever_shakmaty_accepts_the_position() {
    let mut compared = 0;
    for position in positions() {
        let fen = fen_of(&position);
        let config = config::parse(&fen).unwrap_or_else(|err| panic!("{fen}: {err}"));
        let geometry = geometry::compute(&config.board);
        let ctx = Context {
            config: &config,
            pins: &geometry.pins,
        };
        for color in Color::ALL {
            let (bought, source) = moves::legal_moves(&ctx, color);
            if source != Source::Shakmaty {
                continue;
            }
            let mut own = moves::own_legal_moves(&ctx, color);
            moves::sort_moves(&mut own);
            assert_eq!(own, bought, "{fen}, {color:?} to move");
            compared += 1;
        }
    }
    assert!(compared > 1000, "only {compared} sides compared");
}

/// For every piece, its legal destinations (castling aside) are exactly the
/// L1-legal squares it reaches directly and could stand on: for pieces, any
/// square not held by its own side; for pawns, the diagonal squares holding an
/// enemy piece or the en passant target, plus the pushes, which are not reach.
#[test]
fn legal_moves_agree_with_l1_reach() {
    for position in positions().into_iter().step_by(7) {
        let fen = fen_of(&position);
        let doc = force_core::force_state_json(&fen).unwrap();
        let edges = doc["relations"]["edges"].as_array().unwrap();
        let ep_square = doc["configuration"]["enPassant"]["square"].as_str();
        let ep_side = doc["configuration"]["enPassant"]["capturableBy"].as_str();
        for (square, piece) in doc["pieces"].as_object().unwrap() {
            let color = piece["color"].as_str().unwrap();
            let moves: BTreeSet<String> = piece["lookaheads"]
                .as_array()
                .unwrap()
                .iter()
                .map(|i| &doc["relations"]["lookaheads"][i.as_u64().unwrap() as usize]["move"])
                .filter(|mv| {
                    mv["from"] == square.as_str()
                        && !mv["kind"].as_str().unwrap().starts_with("castle")
                })
                .map(|mv| mv["to"].as_str().unwrap().to_string())
                .collect();
            let reach: BTreeSet<String> = edges
                .iter()
                .filter(|e| {
                    e["from"] == square.as_str()
                        && e["kind"] == "direct"
                        && e["L1"]["legal"] == true
                })
                .filter(|e| {
                    let to = e["to"].as_str().unwrap();
                    let occupant = &doc["pieces"][to];
                    let enemy_piece = !occupant.is_null()
                        && occupant["color"] != color
                        && occupant["type"] != "king";
                    if piece["type"] == "pawn" {
                        enemy_piece || (Some(to) == ep_square && Some(color) == ep_side)
                    } else {
                        occupant.is_null() || enemy_piece
                    }
                })
                .map(|e| e["to"].as_str().unwrap().to_string())
                .collect();
            if piece["type"] == "pawn" {
                assert!(
                    reach.is_subset(&moves),
                    "{fen}: pawn {square} captures {reach:?} vs moves {moves:?}"
                );
                let pushes: BTreeSet<&String> = moves.difference(&reach).collect();
                for push in pushes {
                    assert_eq!(
                        &push[..1],
                        &square[..1],
                        "{fen}: pawn {square} moves to {push} without reach"
                    );
                }
            } else {
                assert_eq!(reach, moves, "{fen}: {square}");
            }
            assert_eq!(
                piece["mobility"].as_u64().unwrap() as usize,
                moves.len()
                    + usize::from(piece["specialMoves"]["castleKingside"]["available"] == true)
                    + usize::from(piece["specialMoves"]["castleQueenside"]["available"] == true),
                "{fen}: mobility of {square}"
            );
        }
    }
}

#[test]
fn every_document_is_valid_against_the_schema() {
    let schema = common::SchemaCheck::force_state();
    let mut checked = 0;
    let mut problems = Vec::new();
    for position in positions().into_iter().step_by(5) {
        let fen = fen_of(&position);
        let doc: Value = force_core::force_state_json(&fen).unwrap();
        for error in schema.errors(&doc) {
            problems.push(format!("{fen}: {error}"));
        }
        checked += 1;
    }
    assert!(
        problems.is_empty(),
        "{} problems in {checked} documents:\n{}",
        problems.len(),
        problems.join("\n")
    );
}

/// When one king is in check, shakmaty refuses the position with the other
/// side to move, and that side's moves come from this crate's generator. A
/// king is never captured, so the rook giving check does not list the capture
/// of the king among its moves, although its reach onto the king's square is
/// legal at L1.
#[test]
fn side_whose_opponent_is_in_check_moves_by_the_standard_rules() {
    let fen = "4r1k1/8/8/8/4K3/8/8/8 w - - 0 1";
    let config = config::parse(fen).unwrap();
    let geometry = geometry::compute(&config.board);
    let ctx = Context {
        config: &config,
        pins: &geometry.pins,
    };
    let (black, source) = moves::legal_moves(&ctx, Color::Black);
    assert_eq!(source, Source::OwnGenerator);
    let listed: Vec<String> = black
        .iter()
        .map(|m| format!("{}{}", m.from, m.to))
        .collect();
    assert_eq!(
        listed,
        [
            "e8a8", "e8b8", "e8c8", "e8d8", "e8e5", "e8e6", "e8e7", "e8f8", "g8f7", "g8f8", "g8g7",
            "g8h7", "g8h8"
        ]
    );
    let doc = force_core::force_state_json(fen).unwrap();
    let to_king = doc["relations"]["edges"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["from"] == "e8" && e["to"] == "e4")
        .unwrap();
    assert_eq!(to_king["L1"]["legal"], true);
    assert_eq!(doc["sides"]["black"]["legalMoveCount"], 13);
}
