from enum import IntEnum

class Color(IntEnum):
    WHITE = 0
    BLACK = 1

def show_color(color: Color | None):
    match color:
        case Color.WHITE:
            return "white"
        case Color.BLACK:
            return "black"
        case _:
            return "None"

def opposite_color(color: Color):
    match color:
        case Color.WHITE:
            return Color.BLACK
        case Color.BLACK:
            return Color.WHITE

class Piece(IntEnum):
    PAWN = 0
    KNIGHT = 1
    BISHOP = 2
    ROOK = 3
    QUEEN = 4
    KING = 5

def show_piece(piece: Piece | None):
    match piece:
        case Piece.PAWN:
            return "pawn"
        case Piece.KNIGHT:
            return "knight"
        case Piece.BISHOP:
            return "bishop"
        case Piece.ROOK:
            return "rook"
        case Piece.QUEEN:
            return "queen"
        case Piece.KING:
            return "king"
        case _:
            return "None"

class CastlingRights:
    long: bool = True
    short: bool = True

    def __init__(self, long: bool = True, short: bool = True):
        self.long = long 
        self.short = short

class BoardCoord:
    def __init__(self, lhs: int, rhs: int | None = None):
        if rhs is None:
            self.x: int = lhs & 7
            self.y: int = lhs // 8
        else:
            self.x = lhs 
            self.y = rhs

    def index(self) -> int:
        return self.x + self.y * 8

    def __add__(self, other: "BoardCoord") -> "BoardCoord":
        return BoardCoord(self.x + other.x, self.y + other.y)

    def __sub__(self, other: "BoardCoord") -> "BoardCoord":
        return BoardCoord(self.x - other.x, self.y - other.y)

    def __mul__(self, other: int) -> "BoardCoord":
        return BoardCoord(self.x * other, self.y * other)

    def __bool__(self) -> bool:
        return self.x >= 0 and self.x <= 7 and self.y >= 0 and self.y <= 7

class BoardState:
    squares: list[tuple[Piece | None, Color | None]]
    rights: list[CastlingRights] = [CastlingRights()] * 2
    turn: Color = Color.WHITE
    enpassant: int = -1
    half_move: int = 0
    full_move: int = 1

    def __init__(self):
        self.squares = [(None, None)] * 64
        for i, c in enumerate("rnbqkbnrpppppppp                                PPPPPPPPRNBQKBNR"):
            match c:
                case 'p' | 'P':
                    self.squares[i] = ( Piece.PAWN, Color.BLACK if c.islower() else Color.WHITE )
                case 'n' | 'N':
                    self.squares[i] = ( Piece.KNIGHT, Color.BLACK if c.islower() else Color.WHITE )
                case 'b' | 'B':
                    self.squares[i] = ( Piece.BISHOP, Color.BLACK if c.islower() else Color.WHITE )
                case 'r' | 'R':
                    self.squares[i] = ( Piece.ROOK, Color.BLACK if c.islower() else Color.WHITE ) 
                case 'q' | 'Q':
                    self.squares[i] = ( Piece.QUEEN, Color.BLACK if c.islower() else Color.WHITE )
                case 'k' | 'K':
                    self.squares[i] = ( Piece.KING, Color.BLACK if c.islower() else Color.WHITE )
                case ' ':
                    continue
                case _:
                    raise ValueError("Board format not valid")

