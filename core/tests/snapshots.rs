//! Whole-board snapshots (concept 4.5, contract/fixtures/README.md).
//!
//! For every targeted fixture position, the complete force-state document is
//! stored in contract/fixtures/snapshots/<fixture id>.json, pretty-printed. This
//! test compares the current output with each stored document: a difference
//! anywhere is a failure, and a changed snapshot is reviewed as a change in
//! behaviour before it is accepted.
//!
//! To write the snapshots after reviewing a change, run
//!
//!     FORCE_CORE_UPDATE_SNAPSHOTS=1 cargo test --test snapshots
//!
//! and read the diff in git before committing it.

mod common;

use std::collections::BTreeSet;
use std::fs;

use common::{SchemaCheck, read_json, snapshots_dir, targeted_fixtures};

const UPDATE: &str = "FORCE_CORE_UPDATE_SNAPSHOTS";

#[test]
fn every_snapshot_matches_the_current_force_state() {
    let update = std::env::var_os(UPDATE).is_some_and(|value| value == "1");
    let dir = snapshots_dir();
    let schema = SchemaCheck::force_state();
    let mut failures = Vec::new();
    let mut expected_files = BTreeSet::new();

    if update {
        fs::create_dir_all(&dir).expect("the snapshot directory can be created");
    }

    for (_, fixture) in targeted_fixtures() {
        let id = fixture["id"].as_str().expect("every fixture has an id");
        let fen = fixture["fen"].as_str().expect("every fixture has a FEN");
        let file = format!("{id}.json");
        let path = dir.join(&file);
        expected_files.insert(file.clone());
        let current = force_core::force_state_pretty(fen)
            .unwrap_or_else(|err| panic!("fixture {id}: the FEN was refused: {err}"));

        if update {
            fs::write(&path, &current)
                .unwrap_or_else(|err| panic!("cannot write {}: {err}", path.display()));
            continue;
        }

        let Ok(stored) = fs::read_to_string(&path) else {
            failures.push(format!(
                "snapshot {file} is missing; after checking the output, write it with {UPDATE}=1 cargo test --test snapshots"
            ));
            continue;
        };
        for error in schema.errors(&read_json(&path)) {
            failures.push(format!("snapshot {file}: {error}"));
        }
        if stored != current {
            failures.push(format!("snapshot {file} differs from the current force state:\n{}", first_difference(&stored, &current)));
        }
    }

    if !update && dir.exists() {
        for entry in fs::read_dir(&dir).expect("the snapshot directory can be read") {
            let name = entry.expect("a directory entry").file_name().to_string_lossy().into_owned();
            if name.ends_with(".json") && !expected_files.contains(&name) {
                failures.push(format!(
                    "snapshot {name} has no targeted fixture of the same id; remove it or restore its fixture"
                ));
            }
        }
    }

    assert!(
        failures.is_empty(),
        "{} snapshot problems:\n\n{}\n\nIf the change in behaviour is intended, review it and run {UPDATE}=1 cargo test --test snapshots.\n",
        failures.len(),
        failures.join("\n\n")
    );
}

/// The first line that differs, with a little context, so a reviewer can find
/// it in the pretty-printed documents.
fn first_difference(stored: &str, current: &str) -> String {
    let stored_lines: Vec<&str> = stored.lines().collect();
    let current_lines: Vec<&str> = current.lines().collect();
    let line = stored_lines
        .iter()
        .zip(&current_lines)
        .position(|(a, b)| a != b)
        .unwrap_or(stored_lines.len().min(current_lines.len()));
    let show = |lines: &[&str]| -> String {
        let start = line.saturating_sub(3);
        let end = (line + 3).min(lines.len());
        lines[start..end]
            .iter()
            .enumerate()
            .map(|(i, text)| format!("    {:>6} {text}", start + i + 1))
            .collect::<Vec<_>>()
            .join("\n")
    };
    format!(
        "  at line {} (stored has {} lines, current has {})\n  stored:\n{}\n  current:\n{}",
        line + 1,
        stored_lines.len(),
        current_lines.len(),
        show(&stored_lines),
        show(&current_lines)
    )
}
