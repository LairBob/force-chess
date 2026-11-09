//! Measures the force-state document over a corpus of positions.
//!
//!     cargo run --release --example measure -- docs/measurements/corpus.fen
//!     cargo run --release --example measure -- --runs 31 docs/measurements/corpus.fen
//!
//! The corpus is a text file with one FEN per line, each followed by a `#`
//! comment naming its source. Blank lines and lines that are only a comment
//! are skipped.
//!
//! For every position this prints the piece count, the size of the minified
//! JSON document in bytes, its size after `gzip -9`, the native time to
//! produce the document (median of `--runs` runs, default 21), the number of
//! relations of each kind, and the share of the bytes taken by each
//! top-level section. It ends with min, median and max for every column and
//! with a breakdown of the whole corpus's bytes by what they spell: object
//! keys, square names, plain-words sentences, list indices, and so on.
//!
//! The gzip size comes from the system `gzip` command, so that no compression
//! crate has to be added to the manifest. When `gzip` is not on the path the
//! column is left empty and a note says so.
//!
//! Nothing here changes the document; it only weighs it. The output is
//! Markdown so it can be pasted into `docs/measurements/`.

use std::collections::BTreeMap;
use std::io::Write;
use std::process::{Command, ExitCode, Stdio};
use std::time::Instant;

use serde_json::Value;

/// The sections whose byte share is reported, in the order of the columns.
/// `relations` is split into its five lists; everything else (the version,
/// the configuration, the valuation scale, the side statuses, and the
/// top-level punctuation) is reported as `other`.
const SECTIONS: [&str; 7] = [
    "squares",
    "pieces",
    "edges",
    "lookaheads",
    "pins",
    "xrays",
    "batteries",
];

struct Position {
    fen: String,
    source: String,
}

struct Measurement {
    pieces: usize,
    bytes: usize,
    gzip: Option<usize>,
    millis: f64,
    legal_moves: usize,
    edges: usize,
    lookaheads: usize,
    pins: usize,
    xrays: usize,
    batteries: usize,
    squares: usize,
    /// Bytes per section, keyed as in `SECTIONS`, plus `other`.
    section_bytes: BTreeMap<&'static str, usize>,
}

/// Where the bytes of a document go, by what each byte spells.
#[derive(Default)]
struct Spelling {
    /// Object keys, with their quotes and colon.
    keys: usize,
    /// Two-character square names, with their quotes.
    square_names: usize,
    /// Plain-words sentences (`text` fields), with their quotes, by the
    /// reason code they explain.
    sentences: BTreeMap<String, usize>,
    /// Integers: list indices, counts, values.
    numbers: usize,
    /// Other strings: codes, colours, piece types, the key, the FEN fields.
    other_strings: usize,
    /// `true`, `false` and `null`.
    literals: usize,
    /// Braces, brackets and commas.
    punctuation: usize,
}

impl Spelling {
    fn total(&self) -> usize {
        self.keys
            + self.square_names
            + self.sentences.values().sum::<usize>()
            + self.numbers
            + self.other_strings
            + self.literals
            + self.punctuation
    }

    fn add(&mut self, other: &Spelling) {
        self.keys += other.keys;
        self.square_names += other.square_names;
        for (code, bytes) in &other.sentences {
            *self.sentences.entry(code.clone()).or_default() += bytes;
        }
        self.numbers += other.numbers;
        self.other_strings += other.other_strings;
        self.literals += other.literals;
        self.punctuation += other.punctuation;
    }
}

fn main() -> ExitCode {
    let mut runs = 21usize;
    let mut path = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--runs" => match args.next().and_then(|n| n.parse().ok()) {
                Some(n) if n > 0 => runs = n,
                _ => {
                    eprintln!("--runs needs a positive number");
                    return ExitCode::FAILURE;
                }
            },
            "-h" | "--help" => {
                println!(
                    "Usage: cargo run --release --example measure -- [--runs N] <corpus.fen>\n\nMeasures the force-state document for every FEN in the file and prints Markdown tables."
                );
                return ExitCode::SUCCESS;
            }
            _ => path = Some(arg),
        }
    }
    let Some(path) = path else {
        eprintln!(
            "Give the corpus file, for example:\n  cargo run --release --example measure -- docs/measurements/corpus.fen"
        );
        return ExitCode::FAILURE;
    };
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) => {
            eprintln!("Could not read {path}: {err}");
            return ExitCode::FAILURE;
        }
    };
    let positions = parse_corpus(&text);
    if positions.is_empty() {
        eprintln!("{path} holds no positions.");
        return ExitCode::FAILURE;
    }

    let gzip_available = Command::new("gzip")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success());

    let mut measurements = Vec::new();
    let mut spelling = Spelling::default();
    for position in &positions {
        match measure(position, runs, gzip_available) {
            Ok((measurement, spelled)) => {
                measurements.push(measurement);
                spelling.add(&spelled);
            }
            Err(err) => {
                eprintln!("{}: {err}", position.fen);
                return ExitCode::FAILURE;
            }
        }
    }

    print_report(&positions, &measurements, &spelling, runs, gzip_available);
    ExitCode::SUCCESS
}

fn parse_corpus(text: &str) -> Vec<Position> {
    text.lines()
        .filter_map(|line| {
            let (fen, source) = match line.split_once('#') {
                Some((fen, source)) => (fen.trim(), source.trim()),
                None => (line.trim(), ""),
            };
            (!fen.is_empty()).then(|| Position {
                fen: fen.to_string(),
                source: source.to_string(),
            })
        })
        .collect()
}

fn measure(
    position: &Position,
    runs: usize,
    gzip_available: bool,
) -> Result<(Measurement, Spelling), String> {
    // What the WebAssembly `analyze` does for one call: read the FEN, build
    // the force state, write it as minified JSON.
    let produce = || -> Result<String, String> {
        let state = force_core::force_state(&position.fen).map_err(|err| err.to_string())?;
        serde_json::to_string(&state).map_err(|err| err.to_string())
    };

    let json = produce()?;
    let mut times: Vec<f64> = Vec::with_capacity(runs);
    for _ in 0..runs {
        let start = Instant::now();
        let text = produce()?;
        times.push(start.elapsed().as_secs_f64() * 1000.0);
        std::hint::black_box(text);
    }
    times.sort_by(|a, b| a.total_cmp(b));
    let millis = median(&times);

    let gzip = if gzip_available {
        Some(gzip_size(json.as_bytes())?)
    } else {
        None
    };

    let value: Value = serde_json::from_str(&json).map_err(|err| err.to_string())?;
    let relations = &value["relations"];
    let mut section_bytes = BTreeMap::new();
    let mut accounted = 0;
    for section in SECTIONS {
        let part = match section {
            "squares" | "pieces" => &value[section],
            list => &relations[list],
        };
        let bytes = compact_len(part);
        accounted += bytes;
        section_bytes.insert(section, bytes);
    }
    section_bytes.insert("other", json.len() - accounted);

    let sides = &value["sides"];
    let legal_moves = sides["white"]["legalMoveCount"]
        .as_u64()
        .unwrap_or_default() as usize
        + sides["black"]["legalMoveCount"]
            .as_u64()
            .unwrap_or_default() as usize;

    let mut spelled = Spelling::default();
    spell(&value, None, &mut spelled);
    debug_assert_eq!(spelled.total(), json.len());

    let measurement = Measurement {
        pieces: object_len(&value["pieces"]),
        bytes: json.len(),
        gzip,
        millis,
        legal_moves,
        edges: array_len(&relations["edges"]),
        lookaheads: array_len(&relations["lookaheads"]),
        pins: array_len(&relations["pins"]),
        xrays: array_len(&relations["xrays"]),
        batteries: array_len(&relations["batteries"]),
        squares: object_len(&value["squares"]),
        section_bytes,
    };
    Ok((measurement, spelled))
}

fn gzip_size(bytes: &[u8]) -> Result<usize, String> {
    let mut child = Command::new("gzip")
        .args(["-9", "-c"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|err| format!("could not start gzip: {err}"))?;
    let mut stdin = child.stdin.take().expect("stdin was requested");
    let input = bytes.to_vec();
    // Feed the input from another thread so that a full output pipe can never
    // stop gzip reading.
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let output = child
        .wait_with_output()
        .map_err(|err| format!("gzip failed: {err}"))?;
    writer
        .join()
        .map_err(|_| "could not write to gzip".to_string())?
        .map_err(|err| format!("could not write to gzip: {err}"))?;
    if !output.status.success() {
        return Err(format!("gzip exited with {}", output.status));
    }
    Ok(output.stdout.len())
}

fn compact_len(value: &Value) -> usize {
    serde_json::to_string(value)
        .expect("a parsed value serialises")
        .len()
}

fn object_len(value: &Value) -> usize {
    value.as_object().map_or(0, |map| map.len())
}

fn array_len(value: &Value) -> usize {
    value.as_array().map_or(0, |list| list.len())
}

fn is_square_name(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 2 && (b'a'..=b'h').contains(&bytes[0]) && (b'1'..=b'8').contains(&bytes[1])
}

/// Walks a value and attributes every byte of its minified form to one
/// category. `code` is the `code` beside a `text` field, when there is one,
/// so sentences can be grouped by the reason they explain.
fn spell(value: &Value, code: Option<&str>, into: &mut Spelling) {
    match value {
        Value::Null => into.literals += 4,
        Value::Bool(flag) => into.literals += if *flag { 4 } else { 5 },
        Value::Number(number) => into.numbers += number.to_string().len(),
        Value::String(text) => {
            let quoted = compact_len(value);
            if is_square_name(text) {
                into.square_names += quoted;
            } else {
                into.other_strings += quoted;
            }
        }
        Value::Array(items) => {
            into.punctuation += 2 + items.len().saturating_sub(1);
            for item in items {
                spell(item, None, into);
            }
        }
        Value::Object(map) => {
            into.punctuation += 2 + map.len().saturating_sub(1);
            let own_code = map.get("code").and_then(Value::as_str).or(code);
            for (key, item) in map {
                into.keys += key.len() + 3;
                if key == "text"
                    && let Value::String(_) = item
                {
                    let label = own_code.unwrap_or("(no code)").to_string();
                    *into.sentences.entry(label).or_default() += compact_len(item);
                    continue;
                }
                spell(item, own_code, into);
            }
        }
    }
}

fn median(sorted: &[f64]) -> f64 {
    let n = sorted.len();
    if n == 0 {
        return 0.0;
    }
    if n % 2 == 1 {
        sorted[n / 2]
    } else {
        (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
    }
}

fn median_usize(values: &[usize]) -> f64 {
    let mut sorted: Vec<f64> = values.iter().map(|&v| v as f64).collect();
    sorted.sort_by(|a, b| a.total_cmp(b));
    median(&sorted)
}

fn percent(part: usize, whole: usize) -> f64 {
    if whole == 0 {
        0.0
    } else {
        part as f64 * 100.0 / whole as f64
    }
}

fn short(source: &str, width: usize) -> String {
    let mut text: String = source.chars().take(width).collect();
    if source.chars().count() > width {
        text.push_str("...");
    }
    text
}

fn print_report(
    positions: &[Position],
    measurements: &[Measurement],
    spelling: &Spelling,
    runs: usize,
    gzip_available: bool,
) {
    let profile = if cfg!(debug_assertions) {
        "debug build; times are not representative, use --release"
    } else {
        "release build"
    };
    println!(
        "Positions: {}. Timing: median of {runs} runs, {profile}.",
        positions.len()
    );
    if !gzip_available {
        println!("`gzip` was not found on this machine, so the gzip column is empty.");
    }
    println!();

    println!("## Size and time per position");
    println!();
    println!(
        "| # | Position | Pieces | Bytes | Gzip | ms | Legal moves | Edges | Lookaheads | Pins | X-rays | Batteries | Squares |"
    );
    println!("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (i, (position, m)) in positions.iter().zip(measurements).enumerate() {
        println!(
            "| {} | {} | {} | {} | {} | {:.2} | {} | {} | {} | {} | {} | {} | {} |",
            i + 1,
            short(&position.source, 60),
            m.pieces,
            m.bytes,
            m.gzip.map_or(String::new(), |g| g.to_string()),
            m.millis,
            m.legal_moves,
            m.edges,
            m.lookaheads,
            m.pins,
            m.xrays,
            m.batteries,
            m.squares,
        );
    }
    println!();

    println!("## Byte share per section (percent of the document)");
    println!();
    println!(
        "| # | Pieces | squares | pieces | relations.edges | relations.lookaheads | relations.pins | relations.xrays | relations.batteries | other |"
    );
    println!("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (i, m) in measurements.iter().enumerate() {
        let share = |section: &str| percent(m.section_bytes[section], m.bytes);
        println!(
            "| {} | {} | {:.1} | {:.1} | {:.1} | {:.1} | {:.1} | {:.1} | {:.1} | {:.1} |",
            i + 1,
            m.pieces,
            share("squares"),
            share("pieces"),
            share("edges"),
            share("lookaheads"),
            share("pins"),
            share("xrays"),
            share("batteries"),
            share("other"),
        );
    }
    println!();

    println!("## Summary (min / median / max over the corpus)");
    println!();
    println!("| Column | Min | Median | Max |");
    println!("|---|---:|---:|---:|");
    let column = |name: &str, values: Vec<usize>| {
        let min = values.iter().copied().min().unwrap_or(0);
        let max = values.iter().copied().max().unwrap_or(0);
        println!("| {name} | {min} | {:.0} | {max} |", median_usize(&values));
    };
    column("Pieces", measurements.iter().map(|m| m.pieces).collect());
    column("Bytes", measurements.iter().map(|m| m.bytes).collect());
    if gzip_available {
        column(
            "Gzip bytes",
            measurements.iter().filter_map(|m| m.gzip).collect(),
        );
    }
    {
        let mut times: Vec<f64> = measurements.iter().map(|m| m.millis).collect();
        times.sort_by(|a, b| a.total_cmp(b));
        println!(
            "| ms | {:.2} | {:.2} | {:.2} |",
            times.first().copied().unwrap_or(0.0),
            median(&times),
            times.last().copied().unwrap_or(0.0)
        );
    }
    column(
        "Legal moves (both sides)",
        measurements.iter().map(|m| m.legal_moves).collect(),
    );
    column("Edges", measurements.iter().map(|m| m.edges).collect());
    column(
        "Lookaheads",
        measurements.iter().map(|m| m.lookaheads).collect(),
    );
    column("Pins", measurements.iter().map(|m| m.pins).collect());
    column("X-rays", measurements.iter().map(|m| m.xrays).collect());
    column(
        "Batteries",
        measurements.iter().map(|m| m.batteries).collect(),
    );
    column(
        "Squares with a record",
        measurements.iter().map(|m| m.squares).collect(),
    );
    for section in SECTIONS.iter().chain(std::iter::once(&"other")) {
        let shares: Vec<f64> = {
            let mut v: Vec<f64> = measurements
                .iter()
                .map(|m| percent(m.section_bytes[section], m.bytes))
                .collect();
            v.sort_by(|a, b| a.total_cmp(b));
            v
        };
        let label = match *section {
            "squares" | "pieces" => format!("{section} %"),
            list => format!("relations.{list} %"),
        };
        println!(
            "| {label} | {:.1} | {:.1} | {:.1} |",
            shares.first().copied().unwrap_or(0.0),
            median(&shares),
            shares.last().copied().unwrap_or(0.0)
        );
    }
    println!();

    let total_bytes: usize = measurements.iter().map(|m| m.bytes).sum();
    let section_totals =
        |section: &str| -> usize { measurements.iter().map(|m| m.section_bytes[section]).sum() };
    println!("## Whole corpus: bytes per section");
    println!();
    println!("| Section | Bytes | Share |");
    println!("|---|---:|---:|");
    for section in SECTIONS.iter().chain(std::iter::once(&"other")) {
        let bytes = section_totals(section);
        let label = match *section {
            "squares" | "pieces" | "other" => section.to_string(),
            list => format!("relations.{list}"),
        };
        println!(
            "| {label} | {bytes} | {:.1} % |",
            percent(bytes, total_bytes)
        );
    }
    println!("| total | {total_bytes} | 100.0 % |");
    println!();

    println!("## Whole corpus: bytes by what they spell");
    println!();
    println!("Every byte of every minified document, attributed once.");
    println!();
    println!("| Spelling | Bytes | Share |");
    println!("|---|---:|---:|");
    let total = spelling.total();
    let row = |label: &str, bytes: usize| {
        println!("| {label} | {bytes} | {:.1} % |", percent(bytes, total));
    };
    row("Object keys (with quotes and colon)", spelling.keys);
    row("Square names (with quotes)", spelling.square_names);
    let sentence_total: usize = spelling.sentences.values().sum();
    row("Sentences (`text` fields, with quotes)", sentence_total);
    for (code, bytes) in &spelling.sentences {
        row(&format!("  of which `{code}`"), *bytes);
    }
    row("Numbers (indices, counts, values)", spelling.numbers);
    row(
        "Other strings (codes, colours, types, key, FEN fields)",
        spelling.other_strings,
    );
    row("true, false, null", spelling.literals);
    row("Braces, brackets, commas", spelling.punctuation);
    row("total", total);
}
