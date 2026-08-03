import { Color, invalidColor, invalidPiece, Piece } from "./boardController.mjs";

export function char(arg: string | number): Char {
    return new Char(arg);
}

export class Char {
    public char: string;
    public code: number;

    constructor(arg: string | number) {
        if (typeof arg === "string") {
            if (arg.length !== 1) throw new Error("Not a character");
            this.char = arg;
            this.code = arg.charCodeAt(0);
        } else {
            this.code = arg;
            this.char = String.fromCharCode(arg);
        }
    }

    public static string(chars: Char[]): string {
        var res: string = "";
        for (const char of chars) res += char.char;
        return res;
    }
}

export interface CastlingRights {
    kingside: boolean;
    queenside: boolean;
}

export class Square {
    public piece: Piece;
    public color: Color;

    constructor(piece: Piece, color: Color) {
        this.piece = piece;
        this.color = color;
    }

    public equals(piece: Piece, color: Color): boolean;
    public equals(first: Piece | Square, second?: Color): boolean {
        if (first instanceof Square)
            return first.piece === this.piece && first.color === this.color;
        else return first === this.piece && second === this.color;
    }

    public static invalid(): Square {
        return new Square(invalidPiece(), invalidColor());
    }
}

export class BoardState {
    public pieces: Square[];
    public rights: CastlingRights[];
    public turn: Color;
    public enPassantIndex: number;
    public halfMoveCounter: number;
    public fullMoveCounter: number;

    constructor() {
        this.pieces = new Array<Square>(64);
        this.pieces.fill(Square.invalid());
        this.rights = [
            { kingside: false, queenside: false },
            { kingside: false, queenside: false },
        ];
        this.turn = Color.WHITE;
        this.enPassantIndex = -1;
        this.halfMoveCounter = 0;
        this.fullMoveCounter = 1;
    }
}
