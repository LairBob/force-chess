//! Legal moves for each side "if it held the move", and the L2 lookahead
//! built from them (concept 4.1 L2).
//!
//! Legal moves are bought from shakmaty. shakmaty refuses a position in which
//! the side not to move is in check, but the force state asks for both sides'
//! moves whoever is to move (concept section 3), so when one king is in check
//! the other side's moves come from a small generator here instead. It uses
//! shakmaty's attack tables and the same hypothetical-move test as L1, never
//! offers the capture of a king (a king is never captured in chess), and is
//! checked against shakmaty in the test suite on every position shakmaty
//! accepts.

use std::num::NonZeroU32;

use shakmaty::{
    Bitboard, Board, CastlingMode, Chess, Color, File, FromSetup, Move, Piece, Position,
    PositionErrorKinds, Rank, Role, Setup, Square, attacks,
};

use crate::config::{Configuration, king_home, rook_home};
use crate::geometry::name_order;
use crate::legality::{Context, Trial};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoveKind {
    Normal,
    Capture,
    EnPassant,
    CastleKingside,
    CastleQueenside,
}

impl MoveKind {
    pub fn code(self) -> &'static str {
        match self {
            MoveKind::Normal => "normal",
            MoveKind::Capture => "capture",
            MoveKind::EnPassant => "en_passant",
            MoveKind::CastleKingside => "castle_kingside",
            MoveKind::CastleQueenside => "castle_queenside",
        }
    }
}

/// One legal move. For castling, `from` and `to` are the king's squares.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LegalMove {
    pub from: Square,
    pub to: Square,
    pub kind: MoveKind,
    pub promotion: Option<Role>,
    /// For castling, the rook's square before and after.
    pub rook: Option<(Square, Square)>,
    /// For en passant, the square of the pawn taken.
    pub en_passant_victim: Option<Square>,
}

impl LegalMove {
    pub fn trial(&self) -> Trial {
        Trial {
            from: self.from,
            to: self.to,
            en_passant_victim: self.en_passant_victim,
            promotion: self.promotion,
        }
    }
}

/// One L2 entry: a legal move and the squares `piece` attacks directly from
/// where it lands. Castling yields two entries, king then rook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lookahead {
    pub piece: Square,
    pub color: Color,
    pub mv: LegalMove,
    pub attacks: Vec<Square>,
}

/// Where the legal moves of one side came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Shakmaty,
    OwnGenerator,
}

/// The legal moves of one side if it held the move, in a fixed order: by the
/// moving piece's square in board order, then destination by name, then
/// promotion piece (knight, bishop, rook, queen).
pub fn legal_moves(ctx: &Context, color: Color) -> (Vec<LegalMove>, Source) {
    let (mut moves, source) = match shakmaty_position(ctx.config, color) {
        Some(position) => (
            position
                .legal_moves()
                .into_iter()
                .map(|m| from_shakmaty(m, color))
                .collect(),
            Source::Shakmaty,
        ),
        None => (own_legal_moves(ctx, color), Source::OwnGenerator),
    };
    sort_moves(&mut moves);
    (moves, source)
}

pub fn sort_moves(moves: &mut [LegalMove]) {
    moves.sort_by_key(|m| {
        (
            m.from.to_u32(),
            name_order(&m.to),
            m.promotion.map_or(0, |role| role as u32),
        )
    });
}

/// The configuration as a shakmaty position with `color` to move, or None
/// when shakmaty refuses it because the other side's king is in check. Any
/// other refusal means configuration checks upstream missed something, which
/// is a bug in this crate, not a property of the position.
pub fn shakmaty_position(config: &Configuration, color: Color) -> Option<Chess> {
    let mut setup = Setup::empty();
    setup.board = config.board.clone();
    setup.turn = color;
    setup.castling_rights = config.castling_rooks();
    setup.ep_square = config
        .en_passant
        .filter(|ep| ep.capturable_by == color)
        .map(|ep| ep.square);
    setup.fullmoves = NonZeroU32::MIN;
    // Checks shakmaty calls impossible (too many checkers, say) and material
    // that cannot arise by promotion are not this crate's business: the
    // force state of such a board is still well defined.
    let mut result = Chess::from_setup(setup, CastlingMode::Standard);
    if let Err(err) = result {
        result = err.ignore_impossible_check();
    }
    if let Err(err) = result {
        result = err.ignore_too_much_material();
    }
    match result {
        Ok(position) => Some(position),
        Err(err) if err.kinds().contains(PositionErrorKinds::OPPOSITE_CHECK) => None,
        Err(err) => panic!(
            "shakmaty refused a configuration that passed every check here ({err}); canonical form {}",
            config.canonical
        ),
    }
}

fn from_shakmaty(m: Move, color: Color) -> LegalMove {
    match m {
        Move::Normal {
            from,
            capture,
            to,
            promotion,
            ..
        } => LegalMove {
            from,
            to,
            kind: if capture.is_some() {
                MoveKind::Capture
            } else {
                MoveKind::Normal
            },
            promotion,
            rook: None,
            en_passant_victim: None,
        },
        Move::EnPassant { from, to } => LegalMove {
            from,
            to,
            kind: MoveKind::EnPassant,
            promotion: None,
            rook: None,
            en_passant_victim: Some(Square::from_coords(to.file(), from.rank())),
        },
        Move::Castle { king, rook } => castle_move(color, king, rook.file() == File::H),
        Move::Put { .. } => unreachable!("standard chess has no piece drops"),
    }
}

fn castle_move(color: Color, king: Square, kingside: bool) -> LegalMove {
    let rank = color.backrank();
    let (king_to, rook_to) = if kingside {
        (File::G, File::F)
    } else {
        (File::C, File::D)
    };
    LegalMove {
        from: king,
        to: Square::from_coords(king_to, rank),
        kind: if kingside {
            MoveKind::CastleKingside
        } else {
            MoveKind::CastleQueenside
        },
        promotion: None,
        rook: Some((
            rook_home(color, kingside),
            Square::from_coords(rook_to, rank),
        )),
        en_passant_victim: None,
    }
}

/// The squares a castling king passes over and lands on, which must not be
/// attacked, and the squares between king and rook, which must be empty.
pub fn castling_squares(color: Color, kingside: bool) -> (Vec<Square>, Vec<Square>) {
    let rank = color.backrank();
    let at = |file: File| Square::from_coords(file, rank);
    if kingside {
        (
            vec![at(File::F), at(File::G)],
            vec![at(File::F), at(File::G)],
        )
    } else {
        (
            vec![at(File::D), at(File::C)],
            vec![at(File::D), at(File::C), at(File::B)],
        )
    }
}

/// Whether the enemy attacks `square`, reading the board with this side's
/// king lifted off, so that a line through the king counts (the enemy's L0
/// reach, as the contract tests king moves).
pub fn attacked_for_king(board: &Board, color: Color, square: Square) -> Bitboard {
    let king = board.king_of(color).expect("each side has one king");
    board.attacks_to(square, !color, board.occupied().without(king))
}

/// The fallback generator, used only when shakmaty refuses the position.
pub fn own_legal_moves(ctx: &Context, color: Color) -> Vec<LegalMove> {
    let board = ctx.board();
    let own = board.by_color(color);
    let enemy = board.by_color(!color);
    let enemy_king = board.kings() & enemy;
    let mut moves = Vec::new();

    for (from, piece) in board.iter() {
        if piece.color != color {
            continue;
        }
        let mut candidates: Vec<LegalMove> = Vec::new();
        let mut push = |to: Square, kind: MoveKind, victim: Option<Square>| {
            let last_rank = to.rank() == (!color).backrank();
            if piece.role == Role::Pawn && last_rank {
                for role in [Role::Knight, Role::Bishop, Role::Rook, Role::Queen] {
                    candidates.push(LegalMove {
                        from,
                        to,
                        kind,
                        promotion: Some(role),
                        rook: None,
                        en_passant_victim: victim,
                    });
                }
            } else {
                candidates.push(LegalMove {
                    from,
                    to,
                    kind,
                    promotion: None,
                    rook: None,
                    en_passant_victim: victim,
                });
            }
        };
        if piece.role == Role::Pawn {
            for to in pawn_pushes(board, from, color) {
                push(to, MoveKind::Normal, None);
            }
            for to in attacks::pawn_attacks(color, from) & enemy & !enemy_king {
                push(to, MoveKind::Capture, None);
            }
            if let Some(target) = ctx.config.en_passant
                && let Some(victim) = ctx.en_passant_victim(from, target.square)
            {
                push(target.square, MoveKind::EnPassant, Some(victim));
            }
        } else {
            let targets = attacks::attacks(from, piece, board.occupied()) & !own & !enemy_king;
            for to in targets {
                let kind = if enemy.contains(to) {
                    MoveKind::Capture
                } else {
                    MoveKind::Normal
                };
                push(to, kind, None);
            }
        }
        moves.extend(
            candidates
                .into_iter()
                .filter(|m| ctx.test(m.trial()).is_none()),
        );
    }

    for kingside in [true, false] {
        if castling_possible(ctx, color, kingside) {
            moves.push(castle_move(color, king_home(color), kingside));
        }
    }
    moves
}

/// The squares a pawn can step to straight ahead: one square if empty, and
/// two from its starting rank if both are empty.
pub fn pawn_pushes(board: &Board, from: Square, color: Color) -> Vec<Square> {
    let forward = if color == Color::White { 1 } else { -1 };
    let mut pushes = Vec::new();
    let Some(one) = crate::geometry::step(from, (0, forward)) else {
        return pushes;
    };
    if board.piece_at(one).is_some() {
        return pushes;
    }
    pushes.push(one);
    let start = if color == Color::White {
        Rank::Second
    } else {
        Rank::Seventh
    };
    if from.rank() == start
        && let Some(two) = crate::geometry::step(one, (0, forward))
        && board.piece_at(two).is_none()
    {
        pushes.push(two);
    }
    pushes
}

/// Whether castling on this wing is legal for `color`, by the standard rules:
/// the right remains, nothing stands between king and rook, the king is not in
/// check, and it neither passes over nor lands on an attacked square.
pub fn castling_possible(ctx: &Context, color: Color, kingside: bool) -> bool {
    let board = ctx.board();
    let rights = ctx.config.castling.get(color);
    let has_right = if kingside {
        rights.kingside
    } else {
        rights.queenside
    };
    if !has_right {
        return false;
    }
    let (king_path, empty) = castling_squares(color, kingside);
    empty.iter().all(|&sq| board.piece_at(sq).is_none())
        && ctx.checkers(color).is_empty()
        && king_path
            .iter()
            .all(|&sq| attacked_for_king(board, color, sq).is_empty())
}

/// The L2 entries for a list of legal moves, in the same order.
pub fn lookaheads(board: &Board, moves: &[LegalMove]) -> Vec<Lookahead> {
    let mut entries = Vec::new();
    for mv in moves {
        let color = board
            .color_at(mv.from)
            .expect("the mover stands on its square");
        match mv.rook {
            Some((rook_from, rook_to)) => {
                let mut after = board.clone();
                after.discard_piece_at(mv.from);
                after.discard_piece_at(rook_from);
                after.set_piece_at(mv.to, color.king());
                after.set_piece_at(rook_to, color.rook());
                entries.push(entry(&after, mv.from, color, *mv, mv.to, color.king()));
                entries.push(entry(&after, rook_from, color, *mv, rook_to, color.rook()));
            }
            None => {
                let after = crate::legality::board_after(board, mv.trial());
                let piece = after.piece_at(mv.to).expect("the moved piece stands here");
                entries.push(entry(&after, mv.from, color, *mv, mv.to, piece));
            }
        }
    }
    entries
}

fn entry(
    after: &Board,
    piece_square: Square,
    color: Color,
    mv: LegalMove,
    lands_on: Square,
    piece: Piece,
) -> Lookahead {
    let mut attacked: Vec<Square> = attacks::attacks(lands_on, piece, after.occupied())
        .into_iter()
        .collect();
    attacked.sort_by_key(name_order);
    Lookahead {
        piece: piece_square,
        color,
        mv,
        attacks: attacked,
    }
}
