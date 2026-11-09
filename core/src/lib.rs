//! force-core: the reference implementation of the Force Chess analysis side.
//!
//! A board configuration goes in; its force state comes out, as a JSON
//! document that follows `contract/schema/force-state.schema.json`
//! (concept sections 3 and 4). The pipeline, in order:
//!
//! 1. [`config`]: read a FEN, drop the side to move and clocks, normalise
//!    castling rights and the en passant target, hash the canonical string.
//! 2. [`geometry`]: L0, every reach by movement pattern, with batteries,
//!    x-rays, lines through the enemy king, and pins.
//! 3. [`legality`]: L1, the single hypothetical-move test and its reasons.
//! 4. [`moves`]: legal moves for both sides and the L2 lookahead.
//! 5. [`document`]: L3 valuation, side status, piece constraints, mobility,
//!    special moves, and the normalised document itself.
//!
//! Rules of chess come from shakmaty wherever it has them (P5, P7).

pub mod config;
pub mod document;
pub mod geometry;
pub mod legality;
pub mod moves;
pub mod words;

pub use config::ConfigError;
pub use document::{CONTRACT_VERSION, ForceState};

/// The force state of the position a FEN describes. Side to move and clocks
/// are ignored: they are not part of the configuration.
pub fn force_state(fen: &str) -> Result<ForceState, ConfigError> {
    let config = config::parse(fen)?;
    Ok(document::build(&config))
}

/// The force state as a JSON value.
pub fn force_state_json(fen: &str) -> Result<serde_json::Value, ConfigError> {
    let state = force_state(fen)?;
    Ok(serde_json::to_value(&state).expect("the force state always serialises"))
}

/// The force state as pretty-printed JSON text with a final newline, the form
/// the snapshots are stored in.
pub fn force_state_pretty(fen: &str) -> Result<String, ConfigError> {
    let state = force_state(fen)?;
    let mut text = serde_json::to_string_pretty(&state).expect("the force state always serialises");
    text.push('\n');
    Ok(text)
}
