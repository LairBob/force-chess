//! The game fixtures (contract/fixtures/README.md, "Game fixtures").
//!
//! For every `<id>.pgn` in contract/fixtures/games/, read the text as a game
//! and compare the result with `<id>.json` beside it: a parsed-game document,
//! checked against the game schema and compared as JSON, or a refusal whose
//! code and sentence must match exactly.
//!
//! To write the expected documents of the successful imports after reviewing
//! a change, run
//!
//!     FORCE_CORE_UPDATE_GAMES=1 cargo test --test pgn
//!
//! and read the diff in git before committing it.

mod common;

use std::fs;
use std::path::PathBuf;

use serde_json::{Value, json};

use common::{SchemaCheck, contract_dir, read_json};

const UPDATE: &str = "FORCE_CORE_UPDATE_GAMES";

fn games_dir() -> PathBuf {
    contract_dir().join("fixtures").join("games")
}

fn game_texts() -> Vec<(String, String)> {
    let mut paths: Vec<PathBuf> = fs::read_dir(games_dir())
        .expect("the game fixture directory exists")
        .map(|entry| entry.expect("a directory entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "pgn"))
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "no game fixtures found");
    paths
        .into_iter()
        .map(|path| {
            let stem = path
                .file_stem()
                .expect("a file name")
                .to_string_lossy()
                .into_owned();
            let text = fs::read_to_string(&path)
                .unwrap_or_else(|err| panic!("cannot read {}: {err}", path.display()));
            (stem, text)
        })
        .collect()
}

#[test]
fn every_game_fixture_matches_its_expected_result() {
    let update = std::env::var_os(UPDATE).is_some_and(|value| value == "1");
    let schema = SchemaCheck::game();
    let mut failures = Vec::new();
    let texts = game_texts();

    for (id, text) in &texts {
        let expected_path = games_dir().join(format!("{id}.json"));
        let actual = match force_core::pgn::parse_game_json(text) {
            Ok(document) => document,
            Err(err) => json!({ "error": { "code": err.code(), "text": err.to_string() } }),
        };

        if update && actual.get("error").is_none() {
            let mut pretty = serde_json::to_string_pretty(&actual).expect("serialises");
            pretty.push('\n');
            fs::write(&expected_path, pretty)
                .unwrap_or_else(|err| panic!("cannot write {}: {err}", expected_path.display()));
            continue;
        }

        if !expected_path.is_file() {
            failures.push(format!(
                "game {id}: no expected file {}; the current result is\n{}",
                expected_path.display(),
                serde_json::to_string_pretty(&actual).expect("serialises")
            ));
            continue;
        }
        let expected = read_json(&expected_path);
        if expected.get("error").is_none() {
            for error in schema.errors(&expected) {
                failures.push(format!(
                    "game {id}: the expected file breaks the schema: {error}"
                ));
            }
        }
        if actual.get("error").is_none() {
            for error in schema.errors(&actual) {
                failures.push(format!(
                    "game {id}: the parsed game breaks the schema: {error}"
                ));
            }
        }
        if actual != expected {
            failures.push(format!(
                "game {id}: the result differs from {}.\n  expected: {}\n  found:    {}",
                expected_path.display(),
                summary(&expected),
                summary(&actual)
            ));
        }
    }

    assert!(
        failures.is_empty(),
        "{} of {} game fixtures failed:\n\n{}\n",
        failures.len(),
        texts.len(),
        failures.join("\n\n")
    );
}

/// The first point where two documents differ, so the failure can be read.
fn summary(value: &Value) -> String {
    let text = serde_json::to_string(value).expect("serialises");
    if text.len() > 600 {
        format!("{}... ({} bytes)", &text[..600], text.len())
    } else {
        text
    }
}

#[test]
fn the_long_game_has_seventy_moves_each_from_the_position_before() {
    let text = fs::read_to_string(games_dir().join("long-game.pgn")).expect("the long game exists");
    let game = force_core::parse_game(&text).expect("the long game is legal");
    assert_eq!(game.moves.len(), 140);
    // Each FEN after a move is the position the next move is played from:
    // the force state of each is well defined.
    let mut before = game.start_fen.clone();
    for (n, m) in game.moves.iter().enumerate() {
        force_core::force_state(&before)
            .unwrap_or_else(|err| panic!("move {n} ({}): {err}", m.san));
        before = m.fen_after.clone();
    }
    force_core::force_state(&before).expect("the final position analyses");
}
