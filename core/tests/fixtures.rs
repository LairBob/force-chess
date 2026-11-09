//! The targeted fixture runner (contract/fixtures/README.md, "How an
//! implementation runs the corpus").
//!
//! For every file in contract/fixtures/targeted/: check the file against the
//! fixture schema, compute the force state of its FEN, check the document
//! against the force-state schema, and evaluate every assertion with exactly
//! the semantics the README gives. Assertions are evaluated on the JSON
//! document alone, as any consumer would read it. Every failure is reported
//! with the fixture id, the assertion, what was expected and what was found;
//! an assertion kind this runner does not implement is a failure.

mod common;

use std::collections::BTreeSet;

use serde_json::{Value, json};

use common::{SchemaCheck, targeted_fixtures};

#[test]
fn every_targeted_fixture_passes() {
    let fixture_schema = SchemaCheck::targeted_fixture();
    let state_schema = SchemaCheck::force_state();
    let mut failures = Vec::new();
    let mut assertions_run = 0;
    let fixtures = targeted_fixtures();

    for (stem, fixture) in &fixtures {
        let id = fixture["id"].as_str().unwrap_or("<no id>");
        for error in fixture_schema.errors(fixture) {
            failures.push(format!("fixture {stem}: {error}"));
        }
        if id != stem {
            failures.push(format!(
                "fixture {stem}: its id is {id:?} but the file is named {stem}.json"
            ));
        }
        let fen = fixture["fen"].as_str().expect("every fixture has a FEN");
        let doc = match force_core::force_state_json(fen) {
            Ok(doc) => doc,
            Err(err) => {
                failures.push(format!("fixture {id}: the FEN was refused: {err}"));
                continue;
            }
        };
        for error in state_schema.errors(&doc) {
            failures.push(format!("fixture {id}: {error}"));
        }
        let assertions = fixture["assertions"]
            .as_array()
            .expect("assertions are a list");
        for (n, assertion) in assertions.iter().enumerate() {
            assertions_run += 1;
            if let Err(mismatch) = evaluate(&doc, assertion) {
                failures.push(format!(
                    "fixture {id}, assertion {n}: {}\n    expected: {}\n    found:    {}",
                    compact(assertion),
                    mismatch.expected,
                    mismatch.found
                ));
            }
        }
    }

    assert!(
        failures.is_empty(),
        "{} of {assertions_run} assertions or checks failed across {} fixtures:\n\n{}\n",
        failures.len(),
        fixtures.len(),
        failures.join("\n\n")
    );
}

#[derive(Debug)]
struct Mismatch {
    expected: String,
    found: String,
}

fn mismatch(expected: impl Into<String>, found: impl Into<String>) -> Mismatch {
    Mismatch {
        expected: expected.into(),
        found: found.into(),
    }
}

type Outcome = Result<(), Mismatch>;

fn compact(value: &Value) -> String {
    serde_json::to_string(value).expect("JSON serialises")
}

fn same(expected: &Value, found: &Value, what: &str) -> Outcome {
    if numbers_equal(expected, found) || expected == found {
        Ok(())
    } else {
        Err(mismatch(
            format!("{what} = {}", compact(expected)),
            format!("{what} = {}", compact(found)),
        ))
    }
}

fn numbers_equal(a: &Value, b: &Value) -> bool {
    matches!((a.as_f64(), b.as_f64()), (Some(x), Some(y)) if x == y)
}

fn text<'a>(value: &'a Value, field: &str) -> &'a str {
    value[field]
        .as_str()
        .unwrap_or_else(|| panic!("assertion field {field} must be a string"))
}

/// "white knight f3" checked against the document: the square, once the
/// piece standing there is confirmed to be that piece.
fn piece_square(doc: &Value, reference: &str) -> Result<String, Mismatch> {
    let parts: Vec<&str> = reference.split(' ').collect();
    let [color, kind, square] = parts[..] else {
        return Err(mismatch(
            "a piece named as 'colour type square'",
            format!("{reference:?}"),
        ));
    };
    let piece = &doc["pieces"][square];
    if piece.is_null() {
        return Err(mismatch(
            format!("the {color} {kind} on {square}"),
            format!("no piece on {square}"),
        ));
    }
    if piece["color"] != color || piece["type"] != kind {
        return Err(mismatch(
            format!("the {color} {kind} on {square}"),
            format!(
                "the {} {} on {square}",
                piece["color"].as_str().unwrap_or("?"),
                piece["type"].as_str().unwrap_or("?")
            ),
        ));
    }
    Ok(square.to_string())
}

/// The piece on a square named the way fixtures name pieces.
fn reference_of(doc: &Value, square: &str) -> String {
    let piece = &doc["pieces"][square];
    format!(
        "{} {} {square}",
        piece["color"].as_str().unwrap_or("?"),
        piece["type"].as_str().unwrap_or("?")
    )
}

fn edges(doc: &Value) -> &Vec<Value> {
    doc["relations"]["edges"]
        .as_array()
        .expect("edges are a list")
}

fn lookaheads(doc: &Value) -> &Vec<Value> {
    doc["relations"]["lookaheads"]
        .as_array()
        .expect("lookaheads are a list")
}

fn indices(value: &Value) -> Vec<usize> {
    value
        .as_array()
        .map(|list| {
            list.iter()
                .map(|i| i.as_u64().expect("an index") as usize)
                .collect()
        })
        .unwrap_or_default()
}

fn find_edge<'a>(doc: &'a Value, from: &str, to: &str) -> Option<&'a Value> {
    edges(doc)
        .iter()
        .find(|e| e["from"] == from && e["to"] == to)
}

fn color_of(doc: &Value, square: &str) -> String {
    doc["pieces"][square]["color"]
        .as_str()
        .unwrap_or("?")
        .to_string()
}

fn evaluate(doc: &Value, assertion: &Value) -> Outcome {
    let kind = assertion["assert"].as_str().unwrap_or("");
    match kind {
        "configuration" => configuration(doc, assertion),
        "attacks" => attacks(doc, assertion),
        "attackKind" => attack_kind(doc, assertion),
        "exclusion" => exclusion(doc, assertion),
        "squareAttackers" => square_attackers(doc, assertion),
        "control" => control(doc, assertion),
        "valuation" => valuation(doc, assertion),
        "pin" => pin(doc, assertion),
        "battery" => battery(doc, assertion),
        "xray" => xray(doc, assertion),
        "pieceConstraint" => piece_constraint(doc, assertion),
        "mobility" => mobility(doc, assertion),
        "specialMove" => special_move(doc, assertion),
        "lookahead" => lookahead(doc, assertion),
        "sideStatus" => side_status(doc, assertion),
        "relationCount" => relation_count(doc, assertion),
        other => Err(mismatch(
            "an assertion kind this runner implements",
            format!("the unknown assertion kind {other:?}"),
        )),
    }
}

fn configuration(doc: &Value, a: &Value) -> Outcome {
    let config = &doc["configuration"];
    let expect = &a["expect"];
    if let Some(canonical) = expect.get("canonical") {
        same(canonical, &config["canonical"], "canonical")?;
    }
    if let Some(castling) = expect.get("castling") {
        for color in ["white", "black"] {
            for wing in ["kingside", "queenside"] {
                if let Some(value) = castling.get(color).and_then(|c| c.get(wing)) {
                    same(
                        value,
                        &config["castling"][color][wing],
                        &format!("castling.{color}.{wing}"),
                    )?;
                }
            }
        }
    }
    if let Some(en_passant) = expect.get("enPassant") {
        same(en_passant, &config["enPassant"], "enPassant")?;
    }
    Ok(())
}

fn attacks(doc: &Value, a: &Value) -> Outcome {
    let from = piece_square(doc, text(a, "piece"))?;
    let to = text(a, "square");
    let layer = text(a, "layer");
    let expect = a["expect"].as_bool().expect("expect is a boolean");
    let found = match layer {
        "L0" => find_edge(doc, &from, to).is_some(),
        "L1" => find_edge(doc, &from, to).is_some_and(|e| e["L1"]["legal"] == true),
        "L2" => lookaheads(doc).iter().any(|entry| {
            entry["piece"] == from.as_str()
                && entry["attacks"]
                    .as_array()
                    .is_some_and(|squares| squares.iter().any(|s| s == to))
        }),
        other => return Err(mismatch("layer L0, L1 or L2", other)),
    };
    if found == expect {
        Ok(())
    } else {
        let describe = |reaches: bool| {
            format!(
                "{} {} {to} at {layer}",
                text(a, "piece"),
                if reaches { "reaches" } else { "does not reach" }
            )
        };
        Err(mismatch(describe(expect), describe(found)))
    }
}

fn attack_kind(doc: &Value, a: &Value) -> Outcome {
    let from = piece_square(doc, text(a, "piece"))?;
    let to = text(a, "square");
    let Some(edge) = find_edge(doc, &from, to) else {
        return Err(mismatch(
            format!("an L0 edge from {from} to {to}"),
            "no such edge",
        ));
    };
    same(&a["kind"], &edge["kind"], "kind")?;
    if let Some(through) = a.get("through") {
        same(through, &edge["through"], "through")?;
    }
    if let Some(path) = a.get("path") {
        same(path, &edge["path"], "path")?;
    }
    Ok(())
}

fn exclusion(doc: &Value, a: &Value) -> Outcome {
    let from = piece_square(doc, text(a, "piece"))?;
    let to = text(a, "square");
    let Some(edge) = find_edge(doc, &from, to) else {
        return Err(mismatch(
            format!("an L0 edge from {from} to {to}"),
            "no such edge",
        ));
    };
    if edge["L1"]["legal"] != false {
        return Err(mismatch(
            format!("the edge {from} to {to} excluded at L1"),
            "it is legal at L1",
        ));
    }
    let reason = &edge["L1"]["reason"];
    same(&a["reason"], &reason["code"], "reason code")?;
    let words = reason["text"].as_str().unwrap_or("");
    for square in a
        .get("mentions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let square = square.as_str().expect("a square");
        if !words.contains(square) {
            return Err(mismatch(
                format!("an explanation mentioning {square}"),
                format!("{words:?}"),
            ));
        }
    }
    Ok(())
}

/// The square record, or the record an absent square stands for: empty,
/// reached by nothing, control none, valuation zero.
fn square_record(doc: &Value, square: &str) -> Value {
    match doc["squares"].get(square) {
        Some(record) => record.clone(),
        None => {
            let zero = json!({ "count": 0, "value": 0 });
            let empty_layer = json!({ "L0": [], "L1": { "legal": [], "excluded": [] }, "L2": [] });
            let valuation = json!({ "white": zero, "black": zero, "net": zero });
            json!({
                "occupant": null,
                "attackers": { "white": empty_layer, "black": empty_layer },
                "control": { "L0": "none", "L1": "none" },
                "valuation": { "L0": valuation, "L1": valuation }
            })
        }
    }
}

fn square_attackers(doc: &Value, a: &Value) -> Outcome {
    let square = text(a, "square");
    let layer = text(a, "layer");
    let color = text(a, "color");
    let record = square_record(doc, square);
    let by_layer = &record["attackers"][color];
    let found: BTreeSet<String> = match layer {
        "L0" => indices(&by_layer["L0"])
            .into_iter()
            .map(|i| reference_of(doc, edges(doc)[i]["from"].as_str().expect("a square")))
            .collect(),
        "L1" => indices(&by_layer["L1"]["legal"])
            .into_iter()
            .map(|i| reference_of(doc, edges(doc)[i]["from"].as_str().expect("a square")))
            .collect(),
        "L2" => indices(&by_layer["L2"])
            .into_iter()
            .map(|i| reference_of(doc, lookaheads(doc)[i]["piece"].as_str().expect("a square")))
            .collect(),
        other => return Err(mismatch("layer L0, L1 or L2", other)),
    };
    let expect = &a["expect"];
    let refs = |field: &str| -> Option<BTreeSet<String>> {
        expect.get(field).map(|list| {
            list.as_array()
                .expect("a list of pieces")
                .iter()
                .map(|p| p.as_str().expect("a piece").to_string())
                .collect()
        })
    };
    let show = |set: &BTreeSet<String>| format!("{set:?}");
    if let Some(equals) = refs("equals")
        && equals != found
    {
        return Err(mismatch(
            format!("{color} at {layer} on {square} exactly {}", show(&equals)),
            show(&found),
        ));
    }
    if let Some(includes) = refs("includes")
        && !includes.is_subset(&found)
    {
        return Err(mismatch(
            format!(
                "{color} at {layer} on {square} including {}",
                show(&includes)
            ),
            show(&found),
        ));
    }
    if let Some(excludes) = refs("excludes")
        && !excludes.is_disjoint(&found)
    {
        return Err(mismatch(
            format!("{color} at {layer} on {square} without {}", show(&excludes)),
            show(&found),
        ));
    }
    if let Some(count) = expect.get("count") {
        same(
            count,
            &json!(found.len()),
            &format!("{color} count at {layer} on {square}"),
        )?;
    }
    Ok(())
}

fn control(doc: &Value, a: &Value) -> Outcome {
    let square = text(a, "square");
    let layer = text(a, "layer");
    let record = square_record(doc, square);
    same(
        &a["expect"],
        &record["control"][layer],
        &format!("control of {square} at {layer}"),
    )
}

fn valuation(doc: &Value, a: &Value) -> Outcome {
    let square = text(a, "square");
    let layer = text(a, "layer");
    let record = square_record(doc, square);
    let found = &record["valuation"][layer];
    let expect = &a["expect"];
    for side in ["white", "black", "net"] {
        if let Some(fields) = expect.get(side) {
            for field in ["count", "value"] {
                if let Some(value) = fields.get(field) {
                    same(
                        value,
                        &found[side][field],
                        &format!("{side}.{field} on {square} at {layer}"),
                    )?;
                }
            }
        }
    }
    if let Some(occupant_value) = expect.get("occupantValue") {
        // The occupant's material value on the document's own valuation scale,
        // or null for an empty square (contract/fixtures/README.md).
        let occupant = &record["occupant"];
        let found_value = if occupant.is_null() {
            Value::Null
        } else {
            doc["valuationScale"][occupant["type"].as_str().expect("a piece type")].clone()
        };
        same(
            occupant_value,
            &found_value,
            &format!("occupant value on {square}"),
        )?;
    }
    Ok(())
}

fn pin(doc: &Value, a: &Value) -> Outcome {
    let pinned = piece_square(doc, text(a, "pinned"))?;
    let pinner = piece_square(doc, text(a, "pinner"))?;
    let index = &doc["pieces"][&pinned]["constraints"]["pinned"];
    let Some(index) = index.as_u64() else {
        return Err(mismatch(format!("{pinned} pinned"), "not pinned"));
    };
    let relation = &doc["relations"]["pins"][index as usize];
    same(&json!(pinner), &relation["pinner"], "pinner")?;
    same(&json!(pinned), &relation["pinned"], "pinned")?;
    same(&a["king"], &relation["king"], "king")?;
    if let Some(line) = a.get("line") {
        same(line, &relation["line"], "line")?;
    }
    Ok(())
}

fn battery(doc: &Value, a: &Value) -> Outcome {
    let front = piece_square(doc, text(a, "front"))?;
    let back = piece_square(doc, text(a, "back"))?;
    let all = doc["relations"]["batteries"]
        .as_array()
        .expect("batteries are a list");
    let Some(relation) = all
        .iter()
        .find(|b| b["front"] == front.as_str() && b["back"] == back.as_str())
    else {
        return Err(mismatch(
            format!("a battery with front {front} and back {back}"),
            compact(&Value::Array(all.clone())),
        ));
    };
    if let Some(covered) = a.get("covered") {
        same(covered, &relation["covered"], "covered")?;
    }
    Ok(())
}

fn xray(doc: &Value, a: &Value) -> Outcome {
    let piece = piece_square(doc, text(a, "piece"))?;
    let through = piece_square(doc, text(a, "through"))?;
    if color_of(doc, &piece) == color_of(doc, &through) {
        return Err(mismatch(
            "an x-ray through an enemy piece",
            format!("{piece} and {through} are the same colour"),
        ));
    }
    let all = doc["relations"]["xrays"]
        .as_array()
        .expect("xrays are a list");
    let Some(relation) = all
        .iter()
        .find(|x| x["piece"] == piece.as_str() && x["through"] == through.as_str())
    else {
        return Err(mismatch(
            format!("an x-ray from {piece} through {through}"),
            compact(&Value::Array(all.clone())),
        ));
    };
    if let Some(beyond) = a.get("beyond") {
        same(beyond, &relation["beyond"], "beyond")?;
    }
    Ok(())
}

fn piece_constraint(doc: &Value, a: &Value) -> Outcome {
    let square = piece_square(doc, text(a, "piece"))?;
    let constraints = &doc["pieces"][&square]["constraints"];
    let expect = &a["expect"];
    if let Some(pinned) = expect.get("pinned") {
        same(pinned, &json!(!constraints["pinned"].is_null()), "pinned")?;
    }
    if let Some(in_check) = expect.get("inCheck") {
        same(
            in_check,
            &json!(!constraints["inCheck"].is_null()),
            "inCheck",
        )?;
    }
    if let Some(no_moves) = expect.get("noLegalMoves") {
        let found = &constraints["noLegalMoves"];
        match no_moves {
            Value::Bool(present) => same(
                &json!(present),
                &json!(!found.is_null()),
                "noLegalMoves present",
            )?,
            code => same(code, &found["code"], "noLegalMoves code")?,
        }
    }
    Ok(())
}

fn mobility(doc: &Value, a: &Value) -> Outcome {
    let square = piece_square(doc, text(a, "piece"))?;
    let piece = &doc["pieces"][&square];
    same(&a["expect"], &piece["mobility"], "mobility")?;
    if let Some(destinations) = a.get("destinations") {
        let expected: BTreeSet<String> = destinations
            .as_array()
            .expect("a list of squares")
            .iter()
            .map(|s| s.as_str().expect("a square").to_string())
            .collect();
        let found: BTreeSet<String> = indices(&piece["lookaheads"])
            .into_iter()
            .map(|i| &lookaheads(doc)[i]["move"])
            .filter(|mv| mv["from"] == square.as_str())
            .map(|mv| mv["to"].as_str().expect("a square").to_string())
            .collect();
        if expected != found {
            return Err(mismatch(
                format!("destinations {expected:?}"),
                format!("destinations {found:?}"),
            ));
        }
    }
    Ok(())
}

fn special_move(doc: &Value, a: &Value) -> Outcome {
    let square = piece_square(doc, text(a, "piece"))?;
    let name = text(a, "move");
    let Some(special) = doc["pieces"][&square]["specialMoves"].get(name) else {
        return Err(mismatch(
            format!("a {name} entry on {square}"),
            "no such entry",
        ));
    };
    let expect = &a["expect"];
    same(&expect["available"], &special["available"], "available")?;
    if let Some(target) = expect.get("target") {
        same(target, &special["target"], "target")?;
    }
    if let Some(code) = expect.get("reason") {
        same(code, &special["reason"]["code"], "reason code")?;
    }
    Ok(())
}

/// Where the piece of a lookahead entry lands: the move's destination, except
/// for the rook's entry of a castling move, whose move is the king's.
fn landing(entry: &Value) -> String {
    let mv = &entry["move"];
    let to = mv["to"].as_str().expect("a square");
    if entry["piece"] == mv["from"] {
        return to.to_string();
    }
    let rank = &to[1..];
    match mv["kind"].as_str() {
        Some("castle_kingside") => format!("f{rank}"),
        Some("castle_queenside") => format!("d{rank}"),
        _ => to.to_string(),
    }
}

fn lookahead(doc: &Value, a: &Value) -> Outcome {
    let square = piece_square(doc, text(a, "piece"))?;
    let to = text(a, "to");
    let promotion = a.get("promotion").cloned().unwrap_or(Value::Null);
    let matching: Vec<&Value> = indices(&doc["pieces"][&square]["lookaheads"])
        .into_iter()
        .map(|i| &lookaheads(doc)[i])
        .filter(|entry| landing(entry) == to && entry["move"]["promotion"] == promotion)
        .collect();
    let [entry] = matching[..] else {
        return Err(mismatch(
            format!(
                "one lookahead entry for {square} landing on {to} with promotion {}",
                compact(&promotion)
            ),
            format!("{} entries", matching.len()),
        ));
    };
    let attacked: BTreeSet<&str> = entry["attacks"]
        .as_array()
        .expect("a list of squares")
        .iter()
        .map(|s| s.as_str().expect("a square"))
        .collect();
    let listed = |field: &str| -> Vec<&str> {
        a["attacks"]
            .get(field)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|s| s.as_str().expect("a square"))
            .collect()
    };
    for square in listed("includes") {
        if !attacked.contains(square) {
            return Err(mismatch(
                format!("attacks after the move include {square}"),
                format!("attacks {attacked:?}"),
            ));
        }
    }
    for square in listed("excludes") {
        if attacked.contains(square) {
            return Err(mismatch(
                format!("attacks after the move exclude {square}"),
                format!("attacks {attacked:?}"),
            ));
        }
    }
    Ok(())
}

fn side_status(doc: &Value, a: &Value) -> Outcome {
    let color = text(a, "color");
    let side = &doc["sides"][color];
    let expect = &a["expect"];
    if let Some(in_check) = expect.get("inCheck") {
        same(in_check, &side["inCheck"], "inCheck")?;
    }
    if let Some(checkers) = expect.get("checkers") {
        let mut expected = BTreeSet::new();
        for reference in checkers.as_array().expect("a list of pieces") {
            expected.insert(piece_square(doc, reference.as_str().expect("a piece"))?);
        }
        let found: BTreeSet<String> = side["checkers"]
            .as_array()
            .expect("a list of squares")
            .iter()
            .map(|s| s.as_str().expect("a square").to_string())
            .collect();
        if expected != found {
            return Err(mismatch(
                format!("checkers {expected:?}"),
                format!("checkers {found:?}"),
            ));
        }
    }
    if let Some(status) = expect.get("status") {
        same(status, &side["status"], "status")?;
    }
    if let Some(count) = expect.get("legalMoveCount") {
        same(count, &side["legalMoveCount"], "legalMoveCount")?;
    }
    Ok(())
}

fn relation_count(doc: &Value, a: &Value) -> Outcome {
    let kind = text(a, "type");
    let color = a.get("color").and_then(Value::as_str);
    let relations = &doc["relations"];
    let list = |name: &str| relations[name].as_array().expect("a relation list").clone();
    // Each relation with the square of its acting piece.
    let acting: Vec<String> = match kind {
        "attack" | "defence" => list("edges")
            .into_iter()
            .filter(|e| e["role"] == kind)
            .map(|e| e["from"].as_str().expect("a square").to_string())
            .collect(),
        "pin" => list("pins")
            .into_iter()
            .map(|p| p["pinner"].as_str().expect("a square").to_string())
            .collect(),
        "xray" => list("xrays")
            .into_iter()
            .map(|x| x["piece"].as_str().expect("a square").to_string())
            .collect(),
        "battery" => list("batteries")
            .into_iter()
            .map(|b| b["back"].as_str().expect("a square").to_string())
            .collect(),
        "lookahead" => list("lookaheads")
            .into_iter()
            .map(|l| l["piece"].as_str().expect("a square").to_string())
            .collect(),
        other => {
            return Err(mismatch(
                "a relation type this runner implements",
                format!("{other:?}"),
            ));
        }
    };
    let count = acting
        .iter()
        .filter(|square| color.is_none_or(|c| color_of(doc, square) == c))
        .count();
    same(
        &a["expect"],
        &json!(count),
        &format!(
            "number of {kind} relations{}",
            color.map(|c| format!(" for {c}")).unwrap_or_default()
        ),
    )
}
