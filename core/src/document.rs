//! The force-state document, in exactly the shape of
//! `contract/schema/force-state.schema.json`, and its assembly from the layers.
//!
//! Every relation is stored once under `relations`; square and piece records
//! hold indices into it (contract v0.2.0). Lists are emitted in a fixed order
//! so that the same configuration always produces the same bytes: pieces and
//! squares in board order (a1, b1, ... h8), each piece's edges by target
//! square name (a1, a2, ... h8), legal moves by moving piece in board order
//! then destination by name.

use std::collections::BTreeSet;

use serde::Serialize;
use serde::ser::{SerializeMap, Serializer};
use shakmaty::{Bitboard, Color, File, Piece, Rank, Role, Square, attacks};

use crate::config::{Configuration, EnPassantTarget};
use crate::geometry::{self, Geometry, name_order};
use crate::legality::{Context, Exclusion, Trial};
use crate::moves::{self, LegalMove, Lookahead, MoveKind};
use crate::words::{color_name, join_and, named, piece_on, role_name, sentence_case};

pub const CONTRACT_VERSION: &str = "0.2.2";

/// A JSON object keyed by square name, emitted in the order given.
#[derive(Debug, Clone)]
pub struct SquareMap<T>(pub Vec<(Square, T)>);

impl<T: Serialize> Serialize for SquareMap<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (square, value) in &self.0 {
            map.serialize_entry(&square.to_string(), value)?;
        }
        map.end()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceState {
    pub contract_version: &'static str,
    pub configuration: ConfigurationRecord,
    pub valuation_scale: ValuationScale,
    pub sides: Sides,
    pub pieces: SquareMap<PieceRecord>,
    pub relations: Relations,
    pub squares: SquareMap<SquareRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationRecord {
    pub key: String,
    pub key_algorithm: &'static str,
    pub canonical: String,
    pub placement: String,
    pub castling: CastlingRecord,
    pub en_passant: Option<EnPassantRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CastlingRecord {
    pub white: RightsRecord,
    pub black: RightsRecord,
}

#[derive(Debug, Clone, Serialize)]
pub struct RightsRecord {
    pub kingside: bool,
    pub queenside: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnPassantRecord {
    pub square: String,
    pub capturable_by: &'static str,
    pub pawn_to_capture: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValuationScale {
    pub pawn: u32,
    pub knight: u32,
    pub bishop: u32,
    pub rook: u32,
    pub queen: u32,
    pub king: u32,
}

/// Material values (concept 4.1 L3). The king is counted as an attacker or
/// defender but adds nothing to a sum.
pub fn value_of(role: Role) -> u32 {
    match role {
        Role::Pawn => 1,
        Role::Knight | Role::Bishop => 3,
        Role::Rook => 5,
        Role::Queen => 9,
        Role::King => 0,
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Sides {
    pub white: SideStatus,
    pub black: SideStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideStatus {
    pub king_square: String,
    pub in_check: bool,
    pub checkers: Vec<String>,
    pub status: &'static str,
    pub legal_move_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct Relations {
    pub edges: Vec<EdgeRecord>,
    pub lookaheads: Vec<LookaheadRecord>,
    pub pins: Vec<PinRecord>,
    pub xrays: Vec<XrayRecord>,
    pub batteries: Vec<BatteryRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Reason {
    pub code: &'static str,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct L1Status {
    pub legal: bool,
    pub reason: Option<Reason>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EdgeRecord {
    pub from: String,
    pub to: String,
    pub role: &'static str,
    pub kind: &'static str,
    pub path: Vec<String>,
    pub through: Option<String>,
    #[serde(rename = "L1")]
    pub l1: L1Status,
}

#[derive(Debug, Clone, Serialize)]
pub struct MoveRecord {
    pub from: String,
    pub to: String,
    pub kind: &'static str,
    pub promotion: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LookaheadRecord {
    pub piece: String,
    #[serde(rename = "move")]
    pub mv: MoveRecord,
    pub attacks: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PinRecord {
    pub pinner: String,
    pub pinned: String,
    pub king: String,
    pub line: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct XrayRecord {
    pub piece: String,
    pub through: String,
    pub beyond: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BatteryRecord {
    pub front: String,
    pub back: String,
    pub covered: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct LegalitySplit {
    pub legal: Vec<usize>,
    pub excluded: Vec<usize>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ByLayer {
    #[serde(rename = "L0")]
    pub l0: Vec<usize>,
    #[serde(rename = "L1")]
    pub l1: LegalitySplit,
    #[serde(rename = "L2")]
    pub l2: Vec<usize>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct OutgoingByLayer {
    #[serde(rename = "L0")]
    pub l0: Vec<usize>,
    #[serde(rename = "L1")]
    pub l1: LegalitySplit,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ByColorAndLayer {
    pub white: ByLayer,
    pub black: ByLayer,
}

#[derive(Debug, Clone, Serialize)]
pub struct Occupant {
    pub color: &'static str,
    #[serde(rename = "type")]
    pub kind: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct ControlRecord {
    #[serde(rename = "L0")]
    pub l0: &'static str,
    #[serde(rename = "L1")]
    pub l1: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct CountValue {
    pub count: usize,
    pub value: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct NetCountValue {
    pub count: i64,
    pub value: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Valuation {
    pub white: CountValue,
    pub black: CountValue,
    pub net: NetCountValue,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValuationRecord {
    #[serde(rename = "L0")]
    pub l0: Valuation,
    #[serde(rename = "L1")]
    pub l1: Valuation,
}

#[derive(Debug, Clone, Serialize)]
pub struct SquareRecord {
    pub occupant: Option<Occupant>,
    pub attackers: ByColorAndLayer,
    pub control: ControlRecord,
    pub valuation: ValuationRecord,
}

#[derive(Debug, Clone, Serialize)]
pub struct InCheck {
    pub checkers: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Constraints {
    pub pinned: Option<usize>,
    pub in_check: Option<InCheck>,
    pub no_legal_moves: Option<Reason>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpecialMove {
    pub available: bool,
    pub target: Option<String>,
    pub reason: Option<Reason>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecialMoves {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub castle_kingside: Option<SpecialMove>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub castle_queenside: Option<SpecialMove>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub en_passant: Option<SpecialMove>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub promotion: Option<SpecialMove>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PieceRecord {
    pub color: &'static str,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub attacks: OutgoingByLayer,
    pub defends: OutgoingByLayer,
    pub attacked_by: ByLayer,
    pub defended_by: ByLayer,
    pub lookaheads: Vec<usize>,
    pub constraints: Constraints,
    pub mobility: usize,
    pub special_moves: SpecialMoves,
}

/// One L0 edge with its L1 verdict, before it is written out.
struct Edge {
    from: Square,
    to: Square,
    color: Color,
    defence: bool,
    legal: bool,
    /// Material value of the reaching piece, for the L3 sums.
    value: u32,
}

fn squares(list: &[Square]) -> Vec<String> {
    list.iter().map(Square::to_string).collect()
}

fn reason(exclusion: &Exclusion, ctx: &Context, trial: Trial) -> Reason {
    Reason {
        code: exclusion.code(),
        text: ctx.explain(trial, exclusion),
    }
}

/// Assembles the whole document for one configuration.
pub fn build(config: &Configuration) -> ForceState {
    let board = &config.board;
    let geometry: Geometry = geometry::compute(board);
    let ctx = Context {
        config,
        pins: &geometry.pins,
    };

    // L0 edges with their L1 status.
    let mut edges = Vec::new();
    let mut edge_records = Vec::new();
    for reach in &geometry.reaches {
        let mover = board.piece_at(reach.from).expect("the reaching piece stands here");
        let defence = board.color_at(reach.to) == Some(mover.color);
        let trial = Trial {
            from: reach.from,
            to: reach.to,
            en_passant_victim: ctx.en_passant_victim(reach.from, reach.to),
            promotion: None,
        };
        let exclusion = ctx.test(trial);
        edges.push(Edge {
            from: reach.from,
            to: reach.to,
            color: mover.color,
            defence,
            legal: exclusion.is_none(),
            value: value_of(mover.role),
        });
        edge_records.push(EdgeRecord {
            from: reach.from.to_string(),
            to: reach.to.to_string(),
            role: if defence { "defence" } else { "attack" },
            kind: reach.kind.code(),
            path: squares(&reach.path),
            through: reach.through.map(|sq| sq.to_string()),
            l1: L1Status {
                legal: exclusion.is_none(),
                reason: exclusion.map(|e| reason(&e, &ctx, trial)),
            },
        });
    }

    // Legal moves for both sides, and L2.
    let (white_moves, _) = moves::legal_moves(&ctx, Color::White);
    let (black_moves, _) = moves::legal_moves(&ctx, Color::Black);
    let mut all_moves: Vec<LegalMove> = white_moves.iter().chain(&black_moves).copied().collect();
    moves::sort_moves(&mut all_moves);
    let lookaheads = moves::lookaheads(board, &all_moves);

    let sides = Sides {
        white: side_status(&ctx, Color::White, white_moves.len()),
        black: side_status(&ctx, Color::Black, black_moves.len()),
    };

    let pieces = geometry::pieces_in_board_order(board)
        .into_iter()
        .map(|(square, piece)| {
            (
                square,
                piece_record(&ctx, square, piece, &edges, &lookaheads, &all_moves),
            )
        })
        .collect();

    let mut square_records = Vec::new();
    for square in Square::ALL {
        if let Some(record) = square_record(board.piece_at(square), square, &edges, &lookaheads) {
            square_records.push((square, record));
        }
    }

    ForceState {
        contract_version: CONTRACT_VERSION,
        configuration: configuration_record(config),
        valuation_scale: ValuationScale {
            pawn: value_of(Role::Pawn),
            knight: value_of(Role::Knight),
            bishop: value_of(Role::Bishop),
            rook: value_of(Role::Rook),
            queen: value_of(Role::Queen),
            king: value_of(Role::King),
        },
        sides,
        pieces: SquareMap(pieces),
        relations: Relations {
            edges: edge_records,
            lookaheads: lookaheads.iter().map(lookahead_record).collect(),
            pins: geometry
                .pins
                .iter()
                .map(|pin| PinRecord {
                    pinner: pin.pinner.to_string(),
                    pinned: pin.pinned.to_string(),
                    king: pin.king.to_string(),
                    line: squares(&pin.line),
                })
                .collect(),
            xrays: geometry
                .xrays
                .iter()
                .map(|x| XrayRecord {
                    piece: x.piece.to_string(),
                    through: x.through.to_string(),
                    beyond: squares(&x.squares),
                })
                .collect(),
            batteries: geometry
                .batteries
                .iter()
                .map(|b| BatteryRecord {
                    front: b.through.to_string(),
                    back: b.piece.to_string(),
                    covered: squares(&b.squares),
                })
                .collect(),
        },
        squares: SquareMap(square_records),
    }
}

fn configuration_record(config: &Configuration) -> ConfigurationRecord {
    let rights = |color: Color| {
        let r = config.castling.get(color);
        RightsRecord {
            kingside: r.kingside,
            queenside: r.queenside,
        }
    };
    ConfigurationRecord {
        key: config.key.clone(),
        key_algorithm: "sha256-hex",
        canonical: config.canonical.clone(),
        placement: config.placement.clone(),
        castling: CastlingRecord {
            white: rights(Color::White),
            black: rights(Color::Black),
        },
        en_passant: config.en_passant.map(|ep: EnPassantTarget| EnPassantRecord {
            square: ep.square.to_string(),
            capturable_by: color_name(ep.capturable_by),
            pawn_to_capture: ep.pawn_to_capture.to_string(),
        }),
    }
}

fn lookahead_record(entry: &Lookahead) -> LookaheadRecord {
    LookaheadRecord {
        piece: entry.piece.to_string(),
        mv: MoveRecord {
            from: entry.mv.from.to_string(),
            to: entry.mv.to.to_string(),
            kind: entry.mv.kind.code(),
            promotion: entry.mv.promotion.map(role_name),
        },
        attacks: squares(&entry.attacks),
    }
}

fn sorted_by_name(bits: Bitboard) -> Vec<Square> {
    let mut list: Vec<Square> = bits.into_iter().collect();
    list.sort_by_key(name_order);
    list
}

fn side_status(ctx: &Context, color: Color, legal_move_count: usize) -> SideStatus {
    let board = ctx.board();
    let king = board.king_of(color).expect("each side has one king");
    let checkers = sorted_by_name(ctx.checkers(color));
    let in_check = !checkers.is_empty();
    let status = match (in_check, legal_move_count > 0) {
        (false, true) => "normal",
        (true, true) => "check",
        (true, false) => "checkmate",
        (false, false) => "stalemate",
    };
    SideStatus {
        king_square: king.to_string(),
        in_check,
        checkers: squares(&checkers),
        status,
        legal_move_count,
    }
}

fn split(indices: &[usize], edges: &[Edge]) -> LegalitySplit {
    let (legal, excluded) = indices.iter().partition(|&&i| edges[i].legal);
    LegalitySplit { legal, excluded }
}

fn by_layer(l0: Vec<usize>, l2: Vec<usize>, edges: &[Edge]) -> ByLayer {
    ByLayer {
        l1: split(&l0, edges),
        l0,
        l2,
    }
}

fn outgoing(l0: Vec<usize>, edges: &[Edge]) -> OutgoingByLayer {
    OutgoingByLayer {
        l1: split(&l0, edges),
        l0,
    }
}

fn piece_record(
    ctx: &Context,
    square: Square,
    piece: Piece,
    edges: &[Edge],
    lookaheads: &[Lookahead],
    all_moves: &[LegalMove],
) -> PieceRecord {
    let indices = |keep: &dyn Fn(&Edge) -> bool| -> Vec<usize> {
        (0..edges.len()).filter(|&i| keep(&edges[i])).collect()
    };
    let attacks_out = indices(&|e| e.from == square && !e.defence);
    let defends_out = indices(&|e| e.from == square && e.defence);
    let attacked_by = indices(&|e| e.to == square && e.color != piece.color);
    let defended_by = indices(&|e| e.to == square && e.color == piece.color);

    // Moves in which this piece itself moves: its own moves and, for a rook,
    // castling. Its own lookahead entries do not defend the square it leaves.
    let own_moves: Vec<LegalMove> = lookaheads
        .iter()
        .filter(|entry| entry.piece == square)
        .map(|entry| entry.mv)
        .collect();
    let reach_l2 = |friendly: bool| -> Vec<usize> {
        (0..lookaheads.len())
            .filter(|&i| {
                let entry = &lookaheads[i];
                (entry.color == piece.color) == friendly
                    && entry.attacks.contains(&square)
                    && !(friendly && own_moves.contains(&entry.mv))
            })
            .collect()
    };

    let own_lookaheads: Vec<usize> = (0..lookaheads.len())
        .filter(|&i| lookaheads[i].piece == square)
        .collect();
    let my_moves: Vec<&LegalMove> = all_moves.iter().filter(|m| m.from == square).collect();
    let destinations: BTreeSet<u32> = my_moves.iter().map(|m| m.to.to_u32()).collect();
    let mobility = destinations.len();

    let pinned = ctx.pins.iter().position(|pin| pin.pinned == square);
    let in_check = (piece.role == Role::King)
        .then(|| sorted_by_name(ctx.checkers(piece.color)))
        .filter(|checkers| !checkers.is_empty())
        .map(|checkers| InCheck {
            checkers: squares(&checkers),
        });
    let no_legal_moves = (mobility == 0).then(|| no_legal_moves(ctx, square, piece));

    let special_moves = match piece.role {
        Role::King => SpecialMoves {
            castle_kingside: Some(castling(ctx, piece.color, true, all_moves)),
            castle_queenside: Some(castling(ctx, piece.color, false, all_moves)),
            ..SpecialMoves::default()
        },
        Role::Pawn => SpecialMoves {
            en_passant: Some(en_passant(ctx, square, piece, all_moves)),
            promotion: Some(promotion(ctx, square, piece, all_moves)),
            ..SpecialMoves::default()
        },
        _ => SpecialMoves::default(),
    };

    PieceRecord {
        color: color_name(piece.color),
        kind: role_name(piece.role),
        attacks: outgoing(attacks_out, edges),
        defends: outgoing(defends_out, edges),
        attacked_by: by_layer(attacked_by, reach_l2(false), edges),
        defended_by: by_layer(defended_by, reach_l2(true), edges),
        lookaheads: own_lookaheads,
        constraints: Constraints {
            pinned,
            in_check,
            no_legal_moves,
        },
        mobility,
        special_moves,
    }
}

fn square_record(
    occupant: Option<Piece>,
    square: Square,
    edges: &[Edge],
    lookaheads: &[Lookahead],
) -> Option<SquareRecord> {
    let side = |color: Color| -> ByLayer {
        let l0: Vec<usize> = (0..edges.len())
            .filter(|&i| edges[i].to == square && edges[i].color == color)
            .collect();
        let l2: Vec<usize> = (0..lookaheads.len())
            .filter(|&i| lookaheads[i].color == color && lookaheads[i].attacks.contains(&square))
            .collect();
        by_layer(l0, l2, edges)
    };
    let attackers = ByColorAndLayer {
        white: side(Color::White),
        black: side(Color::Black),
    };
    let reached = |layer: &ByLayer| !layer.l0.is_empty() || !layer.l2.is_empty();
    if occupant.is_none() && !reached(&attackers.white) && !reached(&attackers.black) {
        return None;
    }

    let value = |list: &[usize]| -> u32 { list.iter().map(|&i| edges[i].value).sum() };
    let valuation = |white: &[usize], black: &[usize]| Valuation {
        white: CountValue {
            count: white.len(),
            value: value(white),
        },
        black: CountValue {
            count: black.len(),
            value: value(black),
        },
        net: NetCountValue {
            count: white.len() as i64 - black.len() as i64,
            value: i64::from(value(white)) - i64::from(value(black)),
        },
    };
    let control = |white: usize, black: usize| match (white > 0, black > 0) {
        (true, true) => "contested",
        (true, false) => "white",
        (false, true) => "black",
        (false, false) => "none",
    };

    let (w, b) = (&attackers.white, &attackers.black);
    let record = SquareRecord {
        occupant: occupant.map(|piece| Occupant {
            color: color_name(piece.color),
            kind: role_name(piece.role),
        }),
        control: ControlRecord {
            l0: control(w.l0.len(), b.l0.len()),
            l1: control(w.l1.legal.len(), b.l1.legal.len()),
        },
        valuation: ValuationRecord {
            l0: valuation(&w.l0, &b.l0),
            l1: valuation(&w.l1.legal, &b.l1.legal),
        },
        attackers,
    };
    Some(record)
}

/// The moves a piece could make if nothing but its own king's safety mattered:
/// every square its pattern reaches that is not held by its own side, pawn
/// steps forward, pawn captures, and en passant. A king is never captured, so
/// the enemy king's square is never one of them. Castling is a special move
/// with its own reasons and is not included.
fn candidate_trials(ctx: &Context, square: Square, piece: Piece) -> Vec<Trial> {
    let board = ctx.board();
    let own = board.by_color(piece.color);
    let enemy = board.by_color(!piece.color);
    let enemy_king = board.kings() & enemy;
    let mut trials = Vec::new();
    if piece.role == Role::Pawn {
        for to in moves::pawn_pushes(board, square, piece.color) {
            trials.push(Trial::plain(square, to));
        }
        for to in attacks::pawn_attacks(piece.color, square) {
            if (enemy & !enemy_king).contains(to) {
                trials.push(Trial::plain(square, to));
            } else if let Some(victim) = ctx.en_passant_victim(square, to) {
                trials.push(Trial {
                    from: square,
                    to,
                    en_passant_victim: Some(victim),
                    promotion: None,
                });
            }
        }
    } else {
        for to in attacks::attacks(square, piece, board.occupied()) & !own & !enemy_king {
            trials.push(Trial::plain(square, to));
        }
    }
    trials.sort_by_key(|t| name_order(&t.to));
    trials
}

fn no_legal_moves(ctx: &Context, square: Square, piece: Piece) -> Reason {
    let board = ctx.board();
    let subject = sentence_case(&piece_on(piece, square));
    let trials = candidate_trials(ctx, square, piece);
    if trials.is_empty() {
        let text = if piece.role == Role::Pawn {
            format!(
                "{subject} cannot move: the square in front of it is occupied and it has nothing to capture."
            )
        } else {
            format!(
                "{subject} cannot move: every square it could go to is off the board or blocked by a piece of its own side."
            )
        };
        return Reason {
            code: "blocked",
            text,
        };
    }
    let verdicts: Vec<(Trial, Exclusion)> = trials
        .into_iter()
        .map(|trial| {
            let exclusion = ctx
                .test(trial)
                .expect("a piece with no legal moves has no legal candidate move");
            (trial, exclusion)
        })
        .collect();
    let codes: BTreeSet<&'static str> = verdicts.iter().map(|(_, e)| e.code()).collect();
    if codes.len() == 1 {
        let (trial, exclusion) = &verdicts[0];
        let detail = ctx.explain(*trial, exclusion);
        let code = exclusion.code();
        let summary = match exclusion {
            Exclusion::Pinned { pin } => format!(
                "{subject} cannot move: it is pinned to its king on {} by {}, and none of its moves stays on that line.",
                ctx.pins[*pin].king,
                named(board, ctx.pins[*pin].pinner)
            ),
            Exclusion::KingInCheck { checkers } => {
                let names: Vec<String> = checkers.iter().map(|&sq| named(board, sq)).collect();
                format!(
                    "{subject} cannot move: its king is in check from {}, and none of its moves answers the check.",
                    join_and(&names)
                )
            }
            Exclusion::KingIntoAttack { .. } => format!(
                "{subject} cannot move: every square it could go to is attacked by the enemy."
            ),
            Exclusion::ExposesKing { .. } => {
                format!("{subject} cannot move: its only moves would leave its own king attacked. {detail}")
            }
        };
        return Reason {
            code,
            text: summary,
        };
    }
    let details: Vec<String> = verdicts
        .iter()
        .map(|(trial, exclusion)| ctx.explain(*trial, exclusion))
        .collect();
    Reason {
        code: "mixed",
        text: format!(
            "{subject} cannot move, for more than one reason. {}",
            details.join(" ")
        ),
    }
}

fn special_reason(code: &'static str, text: String) -> Option<Reason> {
    Some(Reason { code, text })
}

fn castling(ctx: &Context, color: Color, kingside: bool, all_moves: &[LegalMove]) -> SpecialMove {
    let board = ctx.board();
    let rank = color.backrank();
    let target = Square::from_coords(if kingside { File::G } else { File::C }, rank);
    let kind = if kingside {
        MoveKind::CastleKingside
    } else {
        MoveKind::CastleQueenside
    };
    let available = all_moves
        .iter()
        .any(|m| m.kind == kind && board.color_at(m.from) == Some(color));
    let wing = if kingside { "kingside" } else { "queenside" };
    let side = color_name(color);
    let rights = ctx.config.castling.get(color);
    let has_right = if kingside {
        rights.kingside
    } else {
        rights.queenside
    };
    let (king_path, must_be_empty) = moves::castling_squares(color, kingside);
    let occupied: Vec<Square> = must_be_empty
        .iter()
        .copied()
        .filter(|&sq| board.piece_at(sq).is_some())
        .collect();
    let checkers = ctx.checkers(color);
    let attacked: Vec<(Square, Bitboard)> = king_path
        .iter()
        .map(|&sq| (sq, moves::attacked_for_king(board, color, sq)))
        .filter(|(_, attackers)| attackers.any())
        .collect();

    let reason = if available {
        None
    } else if !has_right {
        special_reason(
            "no_right",
            format!(
                "The {side} king has no right to castle {wing}. Castling (the king moving two squares towards a rook, which jumps over it) is allowed only while neither the king nor that rook has ever moved."
            ),
        )
    } else if !occupied.is_empty() {
        let names: Vec<String> = occupied.iter().map(|&sq| named(board, sq)).collect();
        let needed: Vec<String> = must_be_empty.iter().map(Square::to_string).collect();
        special_reason(
            "path_blocked",
            format!(
                "Castling {wing} needs {} empty, but {} {} in the way.",
                join_and(&needed),
                join_and(&names),
                if names.len() == 1 { "stands" } else { "stand" }
            ),
        )
    } else if checkers.any() {
        let names: Vec<String> = checkers.into_iter().map(|sq| named(board, sq)).collect();
        special_reason(
            "in_check",
            format!(
                "The {side} king may not castle while it is in check from {}.",
                join_and(&names)
            ),
        )
    } else if !attacked.is_empty() {
        let parts: Vec<String> = attacked
            .iter()
            .map(|(sq, attackers)| {
                let names: Vec<String> = attackers.into_iter().map(|a| named(board, a)).collect();
                format!("{sq} is attacked by {}", join_and(&names))
            })
            .collect();
        special_reason(
            "path_attacked",
            format!(
                "The {side} king may not castle {wing}, because it may not pass over or land on an attacked square: {}.",
                join_and(&parts)
            ),
        )
    } else {
        panic!(
            "castling {wing} for {side} is refused by the move generator but every rule here allows it; canonical form {}",
            ctx.config.canonical
        );
    };
    SpecialMove {
        available,
        target: Some(target.to_string()),
        reason,
    }
}

fn en_passant(ctx: &Context, square: Square, piece: Piece, all_moves: &[LegalMove]) -> SpecialMove {
    let subject = sentence_case(&piece_on(piece, square));
    let capture = ctx.config.en_passant.and_then(|ep| {
        ctx.en_passant_victim(square, ep.square)
            .map(|victim| (ep.square, victim))
    });
    let Some((target, victim)) = capture else {
        let text = match ctx.config.en_passant {
            Some(ep) if ep.capturable_by == piece.color => format!(
                "{subject} has no en passant capture: the en passant square {} is not diagonally in front of it. En passant (capturing a pawn that has just moved two squares as if it had moved one) is only possible for a pawn standing right beside that pawn.",
                ep.square
            ),
            _ => format!(
                "{subject} has no en passant capture: en passant (capturing a pawn that has just moved two squares as if it had moved one) is only possible right after an enemy pawn makes that two-square move and lands beside this one."
            ),
        };
        return SpecialMove {
            available: false,
            target: None,
            reason: special_reason("no_target", text),
        };
    };
    let trial = Trial {
        from: square,
        to: target,
        en_passant_victim: Some(victim),
        promotion: None,
    };
    let exclusion = ctx.test(trial);
    let available = exclusion.is_none();
    debug_assert_eq!(
        available,
        all_moves
            .iter()
            .any(|m| m.from == square && m.kind == MoveKind::EnPassant),
        "en passant from {square} disagrees with the move generator"
    );
    SpecialMove {
        available,
        target: Some(target.to_string()),
        reason: exclusion.map(|e| reason(&e, ctx, trial)),
    }
}

fn promotion(ctx: &Context, square: Square, piece: Piece, all_moves: &[LegalMove]) -> SpecialMove {
    let board = ctx.board();
    let subject = sentence_case(&piece_on(piece, square));
    let seventh = if piece.color == Color::White {
        Rank::Seventh
    } else {
        Rank::Second
    };
    if square.rank() != seventh {
        return SpecialMove {
            available: false,
            target: None,
            reason: special_reason(
                "not_on_rank",
                format!(
                    "{subject} is not one step from promotion: a {} pawn promotes on reaching rank {}, so it must first stand on rank {}. (Promotion: a pawn reaching the far end of the board is replaced by a queen, rook, bishop or knight of its own colour.)",
                    color_name(piece.color),
                    if piece.color == Color::White { 8 } else { 1 },
                    if piece.color == Color::White { 7 } else { 2 }
                ),
            ),
        };
    }
    if let Some(first) = all_moves
        .iter()
        .find(|m| m.from == square && m.promotion.is_some())
    {
        return SpecialMove {
            available: true,
            target: Some(first.to.to_string()),
            reason: None,
        };
    }
    let trials = candidate_trials(ctx, square, piece);
    match trials.first() {
        None => SpecialMove {
            available: false,
            target: None,
            reason: special_reason(
                "blocked",
                format!(
                    "{subject} cannot promote: the square in front of it is occupied by {} and there is nothing to capture on the last rank.",
                    geometry::step(square, (0, if piece.color == Color::White { 1 } else { -1 }))
                        .map_or_else(|| "nothing".to_string(), |ahead| named(board, ahead))
                ),
            ),
        },
        Some(&trial) => {
            let trial = Trial {
                promotion: Some(Role::Queen),
                ..trial
            };
            let exclusion = ctx
                .test(trial)
                .expect("a promotion that is not a legal move fails the king-safety test");
            SpecialMove {
                available: false,
                target: Some(trial.to.to_string()),
                reason: Some(reason(&exclusion, ctx, trial)),
            }
        }
    }
}
