from src.board_state import BoardState, Color, Piece

class RomuRandom:
    def __init__(self, w: int, x: int, y: int, z: int):
        self._w: int = w 
        self._x: int = x 
        self._y: int = y 
        self._z: int = z 

    def warm(self, iterations: int = 10):
        for _ in range(iterations):
            _: int = self.generate()

    def generate(self) -> int:
        wp: int = self._w
        xp: int = self._x
        yp: int = self._y
        zp: int = self._z

        self._w = 15241094284759029579 * zp # a-mult
        self._x = zp + self._rotl(wp, 52) # b-rotl, c-add
        self._y = yp - xp # d-sub
        self._z = yp + wp # e-add
        self._z = self._rotl(self._z, 19) # f-rotl
        return xp

    def _rotl(self, d: int, lrot: int) -> int:
        return (d << lrot) | (d >> (64 - lrot))

class ZobristTable:
    def __init__(self):
        rng: RomuRandom = RomuRandom(0, 1, 2, 3)
        rng.warm()
        self._table: list[int] = [0] * 781
        for i in range(781):
            self._table[i] = rng.generate()

    def hash(self, state: BoardState) -> int:
        key: int = 0
        offset: int = 0

        # pieces
        for color in Color:
            for piece in Piece:
                for index in range(64):
                    p, c = state.squares[index]
                    if c == color and p == piece:
                        key ^= self._table[offset + index]
                offset += 64

        # Castling rights
        if state.rights[Color.WHITE].short:
            key ^= self._table[offset]
        offset += 1

        if state.rights[Color.WHITE].long:
            key ^= self._table[offset]
        offset += 1

        if state.rights[Color.BLACK].short:
            key ^= self._table[offset]
        offset += 1

        if state.rights[Color.BLACK].long:
            key ^= self._table[offset]
        offset += 1

        # En Passant File
        enpassant: int = state.enpassant
        if enpassant != -1:
            file: int = enpassant & 7
            if state.turn is Color.WHITE:
                index = 8 * 4 + file 
            else:
                index = 8 * 3 + file

            if file > 0 and state.squares[index - 1][0] is Piece.PAWN:
                key ^= self._table[offset + file]
            elif file < 7 and state.squares[index + 1][0] is Piece.PAWN:
                key ^= self._table[offset + file]
        offset += 8

        if state.turn is Color.BLACK:
            key ^= self._table[offset]
        offset += 1

        if offset != 781:
            raise RuntimeError("Zobrist Hashing ended with bad offset")

        return key

