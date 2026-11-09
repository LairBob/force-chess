//! L0, geometry (concept 4.1): what each piece reaches by its movement
//! pattern, given only where the pieces stand.
//!
//! shakmaty supplies the attack tables for pawns, knights and kings. Sliding
//! lines are walked square by square here, because the contract needs more
//! than an attack set: the path of every reach, and the three ways a line is
//! looked through one piece (battery, x-ray, through the enemy king).

use shakmaty::{Board, Color, File, Piece, Rank, Role, Square, attacks};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Direct,
    Battery,
    Xray,
    ThroughKing,
}

impl Kind {
    pub fn code(self) -> &'static str {
        match self {
            Kind::Direct => "direct",
            Kind::Battery => "battery",
            Kind::Xray => "xray",
            Kind::ThroughKing => "through_king",
        }
    }
}

/// One piece reaching one square at L0.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reach {
    pub from: Square,
    pub to: Square,
    pub kind: Kind,
    /// Squares strictly between `from` and `to`, in order of travel.
    pub path: Vec<Square>,
    /// The piece looked through, for every kind but direct.
    pub through: Option<Square>,
}

/// A line looked through one piece: an x-ray (through an enemy piece) or a
/// battery (through a friendly one). `squares` are the squares reached beyond
/// that piece, in order of travel, up to and including the next piece.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LookThrough {
    pub piece: Square,
    pub through: Square,
    pub squares: Vec<Square>,
}

/// An absolute pin: `pinned` stands alone between `pinner` and its own king.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pin {
    pub pinner: Square,
    pub pinned: Square,
    pub king: Square,
    /// Every square from pinner to king inclusive, in order.
    pub line: Vec<Square>,
}

#[derive(Debug, Clone, Default)]
pub struct Geometry {
    /// Every L0 reach, grouped by piece in board order (a1, b1, ... h8) and,
    /// within one piece, ordered by target square name (a1, a2, ... h8).
    pub reaches: Vec<Reach>,
    pub xrays: Vec<LookThrough>,
    pub batteries: Vec<LookThrough>,
    pub pins: Vec<Pin>,
}

const ORTHOGONAL: [(i32, i32); 4] = [(0, 1), (1, 0), (0, -1), (-1, 0)];
const DIAGONAL: [(i32, i32); 4] = [(1, 1), (1, -1), (-1, -1), (-1, 1)];

/// The square one step away in a direction, or None off the board.
pub fn step(square: Square, (df, dr): (i32, i32)) -> Option<Square> {
    let file = square.file().to_u32() as i32 + df;
    let rank = square.rank().to_u32() as i32 + dr;
    if (0..8).contains(&file) && (0..8).contains(&rank) {
        Some(Square::from_coords(
            File::new(file as u32),
            Rank::new(rank as u32),
        ))
    } else {
        None
    }
}

/// Whether a piece of this type moves along this kind of line.
pub fn moves_along(role: Role, diagonal: bool) -> bool {
    match role {
        Role::Queen => true,
        Role::Rook => !diagonal,
        Role::Bishop => diagonal,
        _ => false,
    }
}

/// Orders squares by name: file first, then rank (a1, a2, ... b1, ...).
pub fn name_order(square: &Square) -> (u32, u32) {
    (square.file().to_u32(), square.rank().to_u32())
}

/// Every L0 relation on the board.
pub fn compute(board: &Board) -> Geometry {
    let mut geometry = Geometry::default();
    for (from, piece) in pieces_in_board_order(board) {
        let mut reaches = piece_reaches(board, from, piece, &mut geometry);
        reaches.sort_by_key(|reach| name_order(&reach.to));
        geometry.reaches.extend(reaches);
    }
    geometry.pins = pins(board);
    geometry
}

/// The pieces on the board, a1 first, then b1, ... h8.
pub fn pieces_in_board_order(board: &Board) -> Vec<(Square, Piece)> {
    let mut pieces: Vec<(Square, Piece)> = board.iter().collect();
    pieces.sort_by_key(|(square, _)| square.to_u32());
    pieces
}

/// Every piece of `color` reaching `target` on `board` directly or as the
/// back piece of a battery. Used to name the pieces that keep a king off a
/// square: an x-ray onto that square is blocked by the king's own piece, and a
/// line through the king does not apply once the king stands on the target.
pub fn supporters_of_attack(board: &Board, target: Square, color: Color) -> Vec<(Square, Kind)> {
    let mut scratch = Geometry::default();
    let mut found: Vec<(Square, Kind)> = Vec::new();
    for (from, piece) in pieces_in_board_order(board) {
        if piece.color != color {
            continue;
        }
        for reach in piece_reaches(board, from, piece, &mut scratch) {
            if reach.to == target && matches!(reach.kind, Kind::Direct | Kind::Battery) {
                found.push((from, reach.kind));
            }
        }
    }
    // Direct attackers first, then the pieces behind them.
    found.sort_by_key(|&(square, kind)| (kind != Kind::Direct, square.to_u32()));
    found
}

fn piece_reaches(board: &Board, from: Square, piece: Piece, geometry: &mut Geometry) -> Vec<Reach> {
    let stepping = match piece.role {
        Role::Pawn => Some(attacks::pawn_attacks(piece.color, from)),
        Role::Knight => Some(attacks::knight_attacks(from)),
        Role::King => Some(attacks::king_attacks(from)),
        _ => None,
    };
    if let Some(targets) = stepping {
        return targets
            .into_iter()
            .map(|to| Reach {
                from,
                to,
                kind: Kind::Direct,
                path: Vec::new(),
                through: None,
            })
            .collect();
    }

    let mut reaches = Vec::new();
    for (directions, diagonal) in [(ORTHOGONAL, false), (DIAGONAL, true)] {
        if !moves_along(piece.role, diagonal) {
            continue;
        }
        for direction in directions {
            walk_line(
                board,
                from,
                piece,
                direction,
                diagonal,
                &mut reaches,
                geometry,
            );
        }
    }
    reaches
}

/// Walks one line from a sliding piece. Every square up to the first piece is
/// a direct reach. The line continues through that first piece only when it
/// is a friendly piece moving along the same kind of line (battery), an enemy
/// piece moving along the same kind of line (x-ray), or the enemy king; it then
/// runs to the next piece inclusive or the edge of the board, and stops.
fn walk_line(
    board: &Board,
    from: Square,
    piece: Piece,
    direction: (i32, i32),
    diagonal: bool,
    reaches: &mut Vec<Reach>,
    geometry: &mut Geometry,
) {
    let mut path = Vec::new();
    let mut kind = Kind::Direct;
    let mut through: Option<Square> = None;
    let mut beyond = Vec::new();
    let mut current = from;
    while let Some(square) = step(current, direction) {
        current = square;
        reaches.push(Reach {
            from,
            to: square,
            kind,
            path: path.clone(),
            through,
        });
        if through.is_some() {
            beyond.push(square);
        }
        if let Some(blocker) = board.piece_at(square) {
            if through.is_some() {
                break;
            }
            let same_line = moves_along(blocker.role, diagonal);
            kind = if blocker.color == piece.color && same_line {
                Kind::Battery
            } else if blocker.color != piece.color && same_line {
                Kind::Xray
            } else if blocker.color != piece.color && blocker.role == Role::King {
                Kind::ThroughKing
            } else {
                break;
            };
            through = Some(square);
        }
        path.push(square);
    }
    if let (Some(through), false) = (through, beyond.is_empty()) {
        let relation = LookThrough {
            piece: from,
            through,
            squares: beyond,
        };
        match kind {
            Kind::Battery => geometry.batteries.push(relation),
            Kind::Xray => geometry.xrays.push(relation),
            _ => {}
        }
    }
}

/// Every absolute pin: a rook, bishop or queen with exactly one piece between
/// it and the enemy king on a line it moves along, that piece being the
/// king's own. Ordered by the pinned piece's square in board order.
fn pins(board: &Board) -> Vec<Pin> {
    let mut pins = Vec::new();
    for color in Color::ALL {
        let king = board.king_of(color).expect("each side has one king");
        for pinner in board.by_color(!color) & board.sliders() {
            let role = board.role_at(pinner).expect("a slider stands here");
            let df = king.file().to_u32() as i32 - pinner.file().to_u32() as i32;
            let dr = king.rank().to_u32() as i32 - pinner.rank().to_u32() as i32;
            let diagonal = df.abs() == dr.abs() && df != 0;
            let orthogonal = (df == 0) != (dr == 0);
            if !(diagonal || orthogonal) || !moves_along(role, diagonal) {
                continue;
            }
            let between = attacks::between(pinner, king) & board.occupied();
            if between.count() != 1 {
                continue;
            }
            let pinned = between.first().expect("one square");
            if board.color_at(pinned) != Some(color) {
                continue;
            }
            let direction = (df.signum(), dr.signum());
            let mut line = vec![pinner];
            let mut current = pinner;
            while current != king {
                current = step(current, direction).expect("the king lies on this line");
                line.push(current);
            }
            pins.push(Pin {
                pinner,
                pinned,
                king,
                line,
            });
        }
    }
    pins.sort_by_key(|pin| pin.pinned.to_u32());
    pins
}
