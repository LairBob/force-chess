//! Prints the force state of a position as JSON.
//!
//!     cargo run --example force_state -- "<FEN>"
//!     cargo run --example force_state -- --compact "<FEN>"
//!
//! The side to move, halfmove clock and fullmove number may be given or left
//! out; they are not part of the configuration and change nothing.

use std::process::ExitCode;

fn main() -> ExitCode {
    let mut compact = false;
    let mut words = Vec::new();
    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "--compact" => compact = true,
            "-h" | "--help" => {
                println!(
                    "Usage: cargo run --example force_state -- [--compact] \"<FEN>\"\n\nPrints the force state of the position as JSON (pretty-printed unless --compact)."
                );
                return ExitCode::SUCCESS;
            }
            _ => words.push(arg),
        }
    }
    if words.is_empty() {
        eprintln!("Give a position as a FEN, for example:\n  cargo run --example force_state -- \"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\"");
        return ExitCode::FAILURE;
    }
    // A FEN has spaces in it; accept it quoted as one argument or unquoted as several.
    let fen = words.join(" ");
    match force_core::force_state(&fen) {
        Ok(state) => {
            let text = if compact {
                serde_json::to_string(&state)
            } else {
                serde_json::to_string_pretty(&state)
            };
            println!("{}", text.expect("the force state always serialises"));
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("{err}");
            ExitCode::FAILURE
        }
    }
}
