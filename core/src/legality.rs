//! L1, legality (concept 4.1): whether a reach could be exercised if its side
//! held the move, and if not, why.
//!
//! There is one test for everything (contract/schema/README.md, the layers):
//! move the piece to the square, with whatever stands there removed, and see
//! whether the mover's own king is attacked afterwards. "Attacked" is decided
//! by shakmaty's attack tables on the board after the hypothetical move, so a
//! pinned enemy piece still attacks and a line through the king's old square
//! is open, exactly as the standard rules require.

use shakmaty::{Bitboard, Board, Color, Piece, Role, Square, attacks};

use crate::config::Configuration;
use crate::geometry::{self, Kind, Pin};
use crate::words::{color_name, join_and, named, piece_on, rank_ordinal, sentence_case};

/// Why a reach or a move cannot be made. The order of the variants is the
/// contract's priority order: when more than one applies, the first wins.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Exclusion {
    /// The mover is the king and would stand on an attacked square. Names
    /// every enemy piece attacking it there, directly or as the back piece of
    /// a battery.
    KingIntoAttack { attackers: Vec<(Square, Kind)> },
    /// The reach passes through another piece (a battery, x-ray or line
    /// through the enemy king), so the piece cannot move there now. Names the
    /// pieces in the way, nearest first.
    LineBlocked { blockers: Vec<Square> },
    /// The mover is pinned and the square is off the pin line.
    Pinned { pin: usize },
    /// The mover's king is in check and the move neither captures the single
    /// checking piece nor blocks its line.
    KingInCheck { checkers: Vec<Square> },
    /// Any other way of leaving the king attacked: today only an en passant
    /// capture that opens a line to the king.
    ExposesKing { attackers: Vec<Square> },
}

impl Exclusion {
    pub fn code(&self) -> &'static str {
        match self {
            Exclusion::KingIntoAttack { .. } => "king_into_attack",
            Exclusion::LineBlocked { .. } => "line_blocked",
            Exclusion::Pinned { .. } => "pinned",
            Exclusion::KingInCheck { .. } => "king_in_check",
            Exclusion::ExposesKing { .. } => "exposes_king",
        }
    }
}

/// A move or reach to be tested: a piece going from one square to another,
/// with the squares whose pieces it removes.
#[derive(Debug, Clone, Copy)]
pub struct Trial {
    pub from: Square,
    pub to: Square,
    /// The square of a pawn taken en passant, which is not `to`.
    pub en_passant_victim: Option<Square>,
    /// What a promoting pawn becomes; it does not change the king's safety but
    /// keeps the hypothetical board honest.
    pub promotion: Option<Role>,
}

impl Trial {
    pub fn plain(from: Square, to: Square) -> Trial {
        Trial {
            from,
            to,
            en_passant_victim: None,
            promotion: None,
        }
    }
}

/// What the legality test needs to know about the position once.
pub struct Context<'a> {
    pub config: &'a Configuration,
    pub pins: &'a [Pin],
}

impl Context<'_> {
    pub fn board(&self) -> &Board {
        &self.config.board
    }

    /// The enemy pieces giving direct check to this side's king now.
    pub fn checkers(&self, color: Color) -> Bitboard {
        let board = self.board();
        let king = board.king_of(color).expect("each side has one king");
        board.attacks_to(king, !color, board.occupied())
    }

    fn pin_of(&self, square: Square) -> Option<usize> {
        self.pins.iter().position(|pin| pin.pinned == square)
    }

    /// Whether this reach is the capture of the en passant target by a pawn of
    /// the side allowed to make it; if so, the square of the pawn it removes.
    pub fn en_passant_victim(&self, from: Square, to: Square) -> Option<Square> {
        let target = self.config.en_passant?;
        let piece = self.board().piece_at(from)?;
        let is_capture = piece.role == Role::Pawn
            && piece.color == target.capturable_by
            && to == target.square
            && attacks::pawn_attacks(piece.color, from).contains(to);
        is_capture.then_some(target.pawn_to_capture)
    }

    /// Runs the single hypothetical-move test. None means legal.
    ///
    /// The move must exist before its safety is asked about: a piece whose
    /// way to the square is not clear cannot go there now, whatever kind of
    /// L0 edge describes the reach. A king only ever steps to a neighbouring
    /// square, so its way is always clear and king_into_attack keeps its place
    /// first in the priority order.
    pub fn test(&self, trial: Trial) -> Option<Exclusion> {
        let board = self.board();
        let mover = board
            .piece_at(trial.from)
            .expect("the mover stands on its square");
        let in_the_way = attacks::between(trial.from, trial.to) & board.occupied();
        if in_the_way.any() {
            let mut blockers: Vec<Square> = in_the_way.into_iter().collect();
            blockers.sort_by_key(|&sq| trial.from.distance(sq));
            return Some(Exclusion::LineBlocked { blockers });
        }
        let after = board_after(board, trial);
        // A piece reaching its own king's square: the test removes whatever
        // stands on the target, which here is the king itself, so no king of
        // the mover's colour is left to be attacked and the reach is legal.
        // (A king is never captured, so this "recapture" never happens in a
        // game; docs/DECISIONS.md records why the literal reading is kept.)
        let king = after.king_of(mover.color)?;
        let attackers = after.attacks_to(king, !mover.color, after.occupied());
        if attackers.is_empty() {
            return None;
        }

        if mover.role == Role::King {
            return Some(Exclusion::KingIntoAttack {
                attackers: geometry::supporters_of_attack(&after, trial.to, !mover.color),
            });
        }
        if let Some(pin) = self.pin_of(trial.from)
            && !self.pins[pin].line.contains(&trial.to)
        {
            return Some(Exclusion::Pinned { pin });
        }
        let checkers = self.checkers(mover.color);
        if checkers.any() {
            let own_king = board.king_of(mover.color).expect("each side has one king");
            let answers = checkers.count() == 1 && {
                let checker = checkers.first().expect("one checker");
                trial.to == checker
                    || trial.en_passant_victim == Some(checker)
                    || attacks::between(checker, own_king).contains(trial.to)
            };
            if !answers {
                return Some(Exclusion::KingInCheck {
                    checkers: checkers.into_iter().collect(),
                });
            }
        }
        Some(Exclusion::ExposesKing {
            attackers: attackers.into_iter().collect(),
        })
    }

    /// The plain-words sentence for an exclusion of this trial.
    pub fn explain(&self, trial: Trial, exclusion: &Exclusion) -> String {
        let board = self.board();
        let mover = board
            .piece_at(trial.from)
            .expect("the mover stands on its square");
        let subject = sentence_case(&piece_on(mover, trial.from));
        let action = self.action(trial, mover);
        let king_square = board.king_of(mover.color).expect("each side has one king");
        match exclusion {
            Exclusion::KingIntoAttack { attackers } => {
                let names: Vec<String> = attackers
                    .iter()
                    .map(|&(square, kind)| {
                        let after = board_after(board, trial);
                        let name = named(&after, square);
                        match (kind, battery_front(&after, square, trial.to)) {
                            (Kind::Battery, Some(front)) => {
                                format!("{name} (through {})", named(&after, front))
                            }
                            _ => name,
                        }
                    })
                    .collect();
                match board.color_at(trial.to) {
                    Some(color) if color == mover.color => format!(
                        "{subject} cannot {action}: if {} were taken, the king would be attacked there by {}.",
                        named(board, trial.to),
                        join_and(&names)
                    ),
                    _ => format!(
                        "{subject} cannot {action}: on {} it would be attacked by {}.",
                        trial.to,
                        join_and(&names)
                    ),
                }
            }
            Exclusion::LineBlocked { blockers } => {
                let names: Vec<String> = blockers.iter().map(|&sq| named(board, sq)).collect();
                format!(
                    "{subject} would reach {} only once {} {} the line.",
                    trial.to,
                    join_and(&names),
                    if names.len() == 1 { "leaves" } else { "leave" }
                )
            }
            Exclusion::Pinned { pin } => {
                let pin = &self.pins[*pin];
                format!(
                    "{subject} cannot {action}: it is pinned, meaning it is the only piece standing between {} and its own king on {}, so leaving that line would expose the king to attack.",
                    named(board, pin.pinner),
                    pin.king
                )
            }
            Exclusion::KingInCheck { checkers } => {
                let names: Vec<String> = checkers.iter().map(|&sq| named(board, sq)).collect();
                if checkers.len() > 1 {
                    format!(
                        "{subject} cannot {action}: its king on {king_square} is in double check, attacked by {} at once, and only a move of the king itself can answer two checks.",
                        join_and(&names)
                    )
                } else {
                    format!(
                        "{subject} cannot {action}: its king on {king_square} is in check (under direct attack) from {}, and this move neither captures that piece nor blocks its line.",
                        names[0]
                    )
                }
            }
            Exclusion::ExposesKing { attackers } => {
                let after = board_after(board, trial);
                let names: Vec<String> = attackers.iter().map(|&sq| named(&after, sq)).collect();
                match trial.en_passant_victim {
                    Some(victim) => format!(
                        "{subject} cannot {action}: the capture would take both the {} pawn on {} and the {} pawn on {victim} off the {} rank, opening a line along which {} would attack the {} king on {king_square}.",
                        color_name(mover.color),
                        trial.from,
                        color_name(!mover.color),
                        rank_ordinal(trial.from.rank().to_u32()),
                        join_and(&names),
                        color_name(mover.color)
                    ),
                    None => format!(
                        "{subject} cannot {action}: it would leave its own king on {king_square} attacked by {}.",
                        join_and(&names)
                    ),
                }
            }
        }
    }

    /// What the trial would do, as a verb phrase: "capture the black pawn on
    /// d5", "move to e3", "recapture on g7".
    fn action(&self, trial: Trial, mover: Piece) -> String {
        let board = self.board();
        if let Some(victim) = trial.en_passant_victim {
            return format!(
                "capture {} en passant (the special capture of a pawn that has just moved two squares, passing this one) by moving to {}",
                named(board, victim),
                trial.to
            );
        }
        match board.piece_at(trial.to) {
            Some(target) if target.color == mover.color => format!("recapture on {}", trial.to),
            Some(target) => format!("capture {}", piece_on(target, trial.to)),
            None if mover.role == Role::Pawn
                && attacks::pawn_attacks(mover.color, trial.from).contains(trial.to) =>
            {
                format!("capture on {}", trial.to)
            }
            None => format!("move to {}", trial.to),
        }
    }
}

/// The board after the trial move, with whatever stood on the destination
/// (and the pawn taken en passant) removed.
pub fn board_after(board: &Board, trial: Trial) -> Board {
    let mut after = board.clone();
    let mut mover = after
        .remove_piece_at(trial.from)
        .expect("the mover stands on its square");
    after.discard_piece_at(trial.to);
    if let Some(victim) = trial.en_passant_victim {
        after.discard_piece_at(victim);
    }
    if let Some(role) = trial.promotion {
        mover.role = role;
    }
    after.set_piece_at(trial.to, mover);
    after
}

/// For a battery onto `target` from the piece on `back`, the front piece it
/// looks through.
fn battery_front(board: &Board, back: Square, target: Square) -> Option<Square> {
    let between = attacks::between(back, target) & board.occupied();
    (between.count() == 1).then(|| between.first()).flatten()
}
