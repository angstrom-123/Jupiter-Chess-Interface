from typing import Literal, override

from src.board_state import BoardCoord, BoardState, CastlingRights, Color, Piece, opposite_color, show_color, show_piece
from src.zobrist import ZobristTable

SpecialMove = Literal["castle short", "castle long", "en passant", "double push"]
GameOverReason = Literal["timeout", "checkmate", "stalemate", "material", "repetition", "fifty move rule", "interrupt", "error"]

class Move():
    def __init__(
        self, 
        state: BoardState,
        from_ix: int,
        to_ix: int,
        promote: Piece | None = None
    ):
        self.from_ix: int = from_ix
        self.to_ix: int = to_ix

        square: tuple[Piece | None, Color | None] = state.squares[from_ix]
        if square[0] is None or square[1] is None:
            raise RuntimeError("Cannot create a move with no originating piece")

        self.piece: Piece = square[0]
        self.color: Color = square[1]
        self.capture: Piece | None = state.squares[to_ix][0]
        self.promote: Piece | None = promote
        self.special: SpecialMove | None = None

        if self.piece is Piece.PAWN:
            delta: int = abs(from_ix - to_ix)
            if delta == 16:
                self.special = "double push"
            elif (delta == 7 or delta == 9) and self.capture is None:
                self.special = "en passant"
        elif self.piece is Piece.KING and abs(from_ix - to_ix) == 2:
            self.special = "castle short" if to_ix > from_ix else "castle long"

    @override
    def __repr__(self) -> str:
        string: str = ""

        string += f"from: {self.from_ix}\n"
        string += f"to: {self.to_ix}\n"
        string += f"color: {show_color(self.color)}\n"
        string += f"piece: {show_piece(self.piece)}\n"
        string += f"capture: {show_piece(self.capture)}\n"
        string += f"promote: {show_piece(self.promote)}\n"
        string += f"special: {self.special}\n"

        return string

    def to_lan(self) -> str:
        lan: str = ""
        lan += chr(ord("a") + (self.from_ix & 7))
        lan += chr(ord("8") - (self.from_ix // 8))
        lan += chr(ord("a") + (self.to_ix & 7))
        lan += chr(ord("8") - (self.to_ix // 8))

        match self.promote:
            case Piece.KNIGHT:
                lan += "n"
            case Piece.BISHOP:
                lan += "b"
            case Piece.ROOK:
                lan += "r"
            case Piece.QUEEN:
                lan += "q"
            case _:
                pass

        return lan

    @classmethod 
    def from_lan(cls, state: BoardState, lan: str) -> "Move":
        if len(lan) not in [4, 5]:
            print(f"Invalid LAN length: `{lan}`")
            raise ValueError(f"Invalid LAN length: `{lan}`")

        from_coord: BoardCoord = BoardCoord(ord(lan[0]) - ord("a"), ord("8") - ord(lan[1]))
        to_coord: BoardCoord = BoardCoord(ord(lan[2]) - ord("a"), ord("8") - ord(lan[3]))
        if not from_coord or not to_coord:
            print(f"Invalid LAN coordinates: `{lan}`")
            raise ValueError(f"Invalid LAN coordinates: `{lan}`")

        promote: Piece | None = None
        if len(lan) == 5:
            match lan[4]:
                case "n":
                    promote = Piece.KNIGHT
                case "b":
                    promote = Piece.BISHOP
                case "r":
                    promote = Piece.ROOK
                case "q":
                    promote = Piece.QUEEN
                case _:
                    print(f"Invalid LAN promote: `{lan}`")
                    raise ValueError(f"Invalid LAN promote: `{lan}`")

        return cls(state, from_coord.index(), to_coord.index(), promote)

    @override
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Move):
            return NotImplemented

        # Specifically do not check for the promotion to match
        return self.piece == other.piece \
            and self.color == other.color \
            and self.capture == other.capture \
            and self.special == other.special \
            and self.to_ix == other.to_ix \
            and self.from_ix == other.from_ix

class MoveData:
    def __init__(self, move: Move, rights: list[CastlingRights], enpassant: int, half_move: int, full_move: int, fifty_ctr: int):
        self.move: Move = move
        self.rights: list[CastlingRights] = []
        for r in rights:
            self.rights.append(CastlingRights(r.long, r.short))
        self.enpassant: int = enpassant
        self.half_move: int = half_move
        self.full_move: int = full_move
        self.fifty_ctr: int = fifty_ctr

class Board:
    # TODO: Add support for fen parsing here
    def __init__(self, fen: str | None = None):
        self._zobrist: ZobristTable = ZobristTable()
        self._state: BoardState = BoardState()
        self._attacks: list[list[bool]] = [[False] * 64] * 2
        self._fifty_ctr: int = 0
        self._history: list[int] = [self._zobrist.hash(self._state)]
        self._moves: list[Move] = []

    @override
    def __repr__(self):
        string: str = ""

        for i in range(64):
            if i & 7 == 0:
                string += "\n"

            p, c = self._state.squares[i]
            match p:
                case Piece.PAWN:
                    string += "p" if c is Color.BLACK else "P"
                case Piece.KNIGHT:
                    string += "n" if c is Color.BLACK else "N"
                case Piece.BISHOP:
                    string += "b" if c is Color.BLACK else "B"
                case Piece.ROOK:
                    string += "r" if c is Color.BLACK else "R"
                case Piece.QUEEN:
                    string += "q" if c is Color.BLACK else "Q"
                case Piece.KING:
                    string += "k" if c is Color.BLACK else "K"
                case _:
                    string += "."

            string += " "
        return string

    def get_state(self) -> BoardState:
        return self._state

    def is_game_over(self) -> GameOverReason | None:
        # Checkmate / Stalemate
        can_move: bool = False
        for i, (p, c) in enumerate(self._state.squares):
            if c is self._state.turn and len(self._get_moves(i)) > 0:
                can_move = True
                break

        if not can_move:
            king_square: int = -1
            for i, (p, c) in enumerate(self._state.squares):
                if p is Piece.KING and c is self._state.turn:
                    king_square = i
                    break

            return "checkmate" if self._attacks[opposite_color(self._state.turn)][king_square] else "stalemate"

        # Stalemate (material)
        n_bishops: list[int] = [0, 0]
        n_knights: list[int] = [0, 0]
        enough_material: bool = False
        for p, c in self._state.squares:
            if c is None:
                continue

            if p is Piece.KNIGHT:
                n_knights[c] += 1
            elif p is Piece.BISHOP:
                n_bishops[c] += 1
            elif p is not Piece.KING:
                enough_material = True
                break

            if n_knights[c] + n_bishops[c] >= 2:
                enough_material = True
                break

        if not enough_material:
            return "material"

        # Repetition
        positions: dict[int, int] = {}
        for hash in self._history:
            count: int | None = positions.get(hash)
            count = 1 if count is None else count + 1
            if count == 3:
                return "repetition"
            positions[hash] = count

        # 50-move rule
        if self._fifty_ctr >= 75:
            return "fifty move rule"

        return None

    def get_history(self) -> list[Move]:
        return self._moves

    def is_legal_move(self, move: Move) -> bool:
        return move in self._get_moves(move.from_ix)

    def make_move(self, move: Move) -> MoveData:
        data: MoveData = MoveData(move, self._state.rights, self._state.enpassant, self._state.half_move, self._state.full_move, self._fifty_ctr)

        self._state.squares[move.from_ix] = (None, None)
        self._state.squares[move.to_ix] = (move.piece, move.color) if move.promote is None else (move.promote, move.color)

        # specials
        match move.special:
            case "castle short":
                self._state.squares[move.from_ix + 3] = (None, None)
                self._state.squares[move.from_ix + 1] = (Piece.ROOK, move.color)
                self._state.rights[move.color] = CastlingRights(False, False)
            case "castle long":
                self._state.squares[move.from_ix - 4] = (None, None)
                self._state.squares[move.from_ix - 1] = (Piece.ROOK, move.color)
                self._state.rights[move.color] = CastlingRights(False, False)
            case "en passant":
                offset: int = 8 if data.move.color is Color.WHITE else -8
                self._state.squares[data.move.to_ix + offset] = (None, None)
            case "double push":
                direction: int = -1 if move.color is Color.WHITE else 1
                self._state.enpassant = move.to_ix + (8 * -direction)
            case _:
                pass
        if move.special != "double push":
            self._state.enpassant = -1

        # castling rights revoked on king or rook move
        if move.piece is Piece.ROOK:
            if move.color is Color.BLACK:
                if move.from_ix == 0:
                    self._state.rights[Color.BLACK].long = False
                elif move.from_ix == 7:
                    self._state.rights[Color.BLACK].short = False
            else:
                if move.from_ix == 56:
                    self._state.rights[Color.WHITE].long = False
                elif move.from_ix == 63:
                    self._state.rights[Color.WHITE].short = False
        elif move.piece is Piece.KING:
            self._state.rights[move.color].long = False
            self._state.rights[move.color].short = False

        # Castling rights revoked if rook captured
        if move.capture is Piece.ROOK:
            if move.color is Color.BLACK:
                if move.to_ix == 56:
                    self._state.rights[Color.WHITE].long = False
                elif move.to_ix == 63:
                    self._state.rights[Color.WHITE].short = False
            else:
                if move.to_ix == 0:
                    self._state.rights[Color.BLACK].long = False
                elif move.to_ix == 7:
                    self._state.rights[Color.BLACK].short = False

        # update 50-move rule counter
        if move.piece is Piece.PAWN or move.capture is not None:
            self._fifty_ctr = 0
        else:
            self._fifty_ctr += 1

        self._state.turn = opposite_color(self._state.turn)
        self._history.append(self._zobrist.hash(self._state))
        self._moves.append(move)
        self._update_attacks()

        return data

    def _unmake_move(self, data: MoveData):
        self._state.squares[data.move.from_ix] = (data.move.piece, data.move.color)
        self._state.squares[data.move.to_ix] = (data.move.capture, opposite_color(data.move.color) if data.move.capture is not None else None)

        match data.move.special:
            case "en passant":
                offset: int = 8 if data.move.color is Color.WHITE else -8
                self._state.squares[data.move.to_ix + offset] = (Piece.PAWN, opposite_color(data.move.color))
            case "castle short":
                # . . . . . R K .
                self._state.squares[data.move.from_ix + 1] = (None, None)
                self._state.squares[data.move.from_ix + 3] = (Piece.ROOK, data.move.color)
            case "castle long":
                # . . K R . . . .
                self._state.squares[data.move.from_ix - 1] = (None, None)
                self._state.squares[data.move.from_ix - 4] = (Piece.ROOK, data.move.color)
            case _:
                pass

        self._state.rights = data.rights
        self._state.half_move = data.half_move
        self._state.full_move = data.full_move
        self._state.enpassant = data.enpassant
        self._state.turn = data.move.color
        self._fifty_ctr = data.fifty_ctr

        self._update_attacks()
        _ = self._history.pop()
        _ = self._moves.pop()

    def _update_attacks(self):
        self._attacks[Color.WHITE] = [False] * 64
        self._attacks[Color.BLACK] = [False] * 64
        for i in range(64):
            color: Color | None = self._state.squares[i][1]
            if color is not None:
                for ix in self._get_attacks(i):
                    self._attacks[color][ix] = True

    def _get_moves(self, index: int) -> list[Move]:
        color: Color | None = self._state.squares[index][1]
        if color is None:
            return []

        enemy: Color = opposite_color(color)
        moves: list[Move] = []
        pseudo_legals: list[int] = []
        match self._state.squares[index][0]:
            case Piece.PAWN:
                pseudo_legals = self._pawn_moves(index, color)
            case Piece.KNIGHT:
                pseudo_legals = self._knight_moves(index, color)
            case Piece.BISHOP:
                pseudo_legals = self._bishop_moves(index, color)
            case Piece.ROOK:
                pseudo_legals = self._rook_moves(index, color)
            case Piece.QUEEN:
                pseudo_legals = self._queen_moves(index, color)
            case Piece.KING:
                pseudo_legals = self._king_moves(index, color)
            case _:
                return []

        for to_ix in pseudo_legals:
            move: Move = Move(self._state, index, to_ix)
            data: MoveData = self.make_move(move)
            safe: bool = False
            for i in range(64):
                if self._state.squares[i] == (Piece.KING, color):
                    safe = not self._attacks[enemy][i]
                    break
            self._unmake_move(data)
            if safe:
                moves.append(move)
        return moves

    def _get_attacks(self, index: int) -> list[int]:
        piece, color = self._state.squares[index]
        if color is None or piece is None:
            return []

        match piece:
            case Piece.PAWN:
                return self._pawn_attacks(index, color)
            case Piece.KNIGHT:
                return self._knight_moves(index, color)
            case Piece.BISHOP:
                return self._bishop_moves(index, color)
            case Piece.ROOK:
                return self._rook_moves(index, color)
            case Piece.QUEEN:
                return self._queen_moves(index, color)
            case Piece.KING:
                return self._king_attacks(index, color)

    def _pawn_moves(self, index: int, color: Color) -> list[int]:
        moves: list[int] = []
        enemy: Color = opposite_color(color)
        direction: int = -1 if color is Color.WHITE else 1
        coord: BoardCoord = BoardCoord(index)
        start_y: int = 1 if color is Color.BLACK else 6

        single_push: BoardCoord = coord + BoardCoord(0, direction)
        if single_push and self._state.squares[single_push.index()][0] is None:
            moves.append(single_push.index())
            double_push: BoardCoord = single_push + BoardCoord(0, direction)
            if double_push and self._state.squares[double_push.index()][0] is None and coord.y == start_y:
                moves.append(double_push.index())

        takes_left: BoardCoord = coord + BoardCoord(-1, direction)
        takes_right: BoardCoord = coord + BoardCoord(1, direction)
        for attack in [takes_left, takes_right]:
            if attack and (self._state.squares[attack.index()][1] == enemy or attack.index() == self._state.enpassant):
                moves.append(attack.index())

        return moves

    def _pawn_attacks(self, index: int, color: Color) -> list[int]:
        moves: list[int] = []
        direction: int = -1 if color is Color.WHITE else 1
        coord: BoardCoord = BoardCoord(index)

        takes_left: BoardCoord = coord + BoardCoord(-1, direction)
        takes_right: BoardCoord = coord + BoardCoord(1, direction)
        for attack in [takes_left, takes_right]:
            if attack or attack.index == self._state.enpassant:
                moves.append(attack.index())

        return moves

    def _knight_moves(self, index: int, color: Color) -> list[int]:
        moves: list[int] = []
        enemy: Color = opposite_color(color)
        coord: BoardCoord = BoardCoord(index)

        move_coords: list[BoardCoord] = [
            coord + BoardCoord(1, 2),
            coord + BoardCoord(2, 1),
            coord + BoardCoord(2, -1),
            coord + BoardCoord(1, -2),
            coord + BoardCoord(-1, -2),
            coord + BoardCoord(-2, -1),
            coord + BoardCoord(-2, 1),
            coord + BoardCoord(-1, 2),
        ]
        for attack in move_coords:
            if attack and self._state.squares[attack.index()][1] in [None, enemy]:
                moves.append(attack.index())
        return moves

    def _bishop_moves(self, index: int, color: Color) -> list[int]:
        return self._slider_attacks(index, color, False, True)

    def _rook_moves(self, index: int, color: Color) -> list[int]:
        return self._slider_attacks(index, color, True, False)

    def _queen_moves(self, index: int, color: Color) -> list[int]:
        return self._slider_attacks(index, color, True, True)

    def _king_moves(self, index: int, color: Color) -> list[int]:
        moves: list[int] = []
        enemy: Color = opposite_color(color)
        attacks: list[bool] = self._attacks[enemy]
        coord: BoardCoord = BoardCoord(index)

        short_indices: tuple[list[int], list[int]] = ([index + 1, index + 2], [index + 1, index + 2])
        long_indices: tuple[list[int], list[int]] = ([index - 1, index - 2], [index - 1, index - 2, index - 3])
        if not attacks[index]:
            for side in [short_indices, long_indices]:
                can_castle: bool = self._state.rights[color].short if side[0][0] > index else self._state.rights[color].long
                if can_castle:
                    for ix in side[0]:
                        if attacks[ix]:
                            can_castle = False
                            break

                    for ix in side[1]:
                        if self._state.squares[ix][0] is not None:
                            can_castle = False
                            break
                if can_castle:
                    moves.append(side[0][-1])

        move_coords: list[BoardCoord] = [
            coord + BoardCoord(1, 1),
            coord + BoardCoord(1, 0),
            coord + BoardCoord(1, -1),
            coord + BoardCoord(0, 1),
            coord + BoardCoord(0, -1),
            coord + BoardCoord(-1, 1),
            coord + BoardCoord(-1, 0),
            coord + BoardCoord(-1, -1),
        ]
        for coord in move_coords:
            if coord and self._state.squares[coord.index()][1] in [None, enemy]:
                moves.append(coord.index())

        return moves + self._king_attacks(index, color)

    def _king_attacks(self, index: int, color: Color) -> list[int]:
        moves: list[int] = []
        enemy: Color = opposite_color(color)
        coord: BoardCoord = BoardCoord(index)

        move_coords: list[BoardCoord] = [
            coord + BoardCoord(1, 1),
            coord + BoardCoord(1, 0),
            coord + BoardCoord(1, -1),
            coord + BoardCoord(0, 1),
            coord + BoardCoord(0, -1),
            coord + BoardCoord(-1, 1),
            coord + BoardCoord(-1, 0),
            coord + BoardCoord(-1, -1),
        ]
        for coord in move_coords:
            if coord and self._state.squares[coord.index()][1] in [None, enemy]:
                moves.append(coord.index())
        return moves

    def _slider_attacks(self, index: int, color: Color, orthogonal: bool, diagonal: bool) -> list[int]:
        moves: list[int] = []
        enemy: Color = opposite_color(color)
        start_coord: BoardCoord = BoardCoord(index)

        offsets: list[BoardCoord] = [
            BoardCoord(0, 1),
            BoardCoord(0, -1),
            BoardCoord(1, 0),
            BoardCoord(-1, 0),
            BoardCoord(1, 1),
            BoardCoord(1, -1),
            BoardCoord(-1, 1),
            BoardCoord(-1, -1),
        ]
        start: int = 0 if orthogonal else 4
        end: int = 8 if diagonal else 4

        for i in range(start, end):
            for distance in range(1, 8):
                coord: BoardCoord = start_coord + offsets[i] * distance
                if not coord:
                    break

                p, c = self._state.squares[coord.index()]
                if p is not None:
                    if c is enemy:
                        moves.append(coord.index())
                    break
                else:
                    moves.append(coord.index())
        return moves
