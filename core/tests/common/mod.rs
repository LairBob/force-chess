//! Shared helpers for the integration tests: where the contract lives, and
//! the JSON Schema validators for its documents.

#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

pub fn contract_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("core/ sits inside the repository")
        .join("contract")
}

pub fn targeted_dir() -> PathBuf {
    contract_dir().join("fixtures").join("targeted")
}

pub fn snapshots_dir() -> PathBuf {
    contract_dir().join("fixtures").join("snapshots")
}

pub fn read_json(path: &Path) -> Value {
    let text = fs::read_to_string(path)
        .unwrap_or_else(|err| panic!("cannot read {}: {err}", path.display()));
    serde_json::from_str(&text)
        .unwrap_or_else(|err| panic!("{} is not valid JSON: {err}", path.display()))
}

/// Every targeted fixture, as (file stem, parsed JSON), in file-name order.
pub fn targeted_fixtures() -> Vec<(String, Value)> {
    let mut paths: Vec<PathBuf> = fs::read_dir(targeted_dir())
        .expect("the targeted fixture directory exists")
        .map(|entry| entry.expect("a directory entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "no targeted fixtures found");
    paths
        .into_iter()
        .map(|path| {
            let stem = path
                .file_stem()
                .expect("a file name")
                .to_string_lossy()
                .into_owned();
            (stem, read_json(&path))
        })
        .collect()
}

pub struct SchemaCheck {
    validator: jsonschema::Validator,
    name: &'static str,
}

impl SchemaCheck {
    fn load(file: &str, name: &'static str) -> SchemaCheck {
        let schema = read_json(&contract_dir().join("schema").join(file));
        let validator = jsonschema::draft202012::new(&schema)
            .unwrap_or_else(|err| panic!("{file} is not a usable draft 2020-12 schema: {err}"));
        SchemaCheck { validator, name }
    }

    pub fn force_state() -> SchemaCheck {
        SchemaCheck::load("force-state.schema.json", "force-state schema")
    }

    pub fn targeted_fixture() -> SchemaCheck {
        SchemaCheck::load("fixture-targeted.schema.json", "targeted fixture schema")
    }

    /// Every way the document breaks the schema, one line each.
    pub fn errors(&self, document: &Value) -> Vec<String> {
        self.validator
            .iter_errors(document)
            .map(|err| format!("{} violation at {}: {err}", self.name, err.instance_path()))
            .collect()
    }
}

impl SchemaCheck {
    pub fn game() -> SchemaCheck {
        SchemaCheck::load("game.schema.json", "game schema")
    }
}
