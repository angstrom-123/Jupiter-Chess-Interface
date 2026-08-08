import { Char, char, type BoardState, type CastlingRights, type Square } from "./boardState.mjs";
import { Color, invalidPiece, Piece, pieceValid } from "./boardController.mjs";

export enum MoveType {
    NORMAL,
    EN_PASSANT,
    DOUBLE_PUSH,
    CASTLES_SHORT,
    CASTLES_LONG,
    MAX_ENUM,
}

export interface MoveData {
    move: Move;
    rights: CastlingRights[];
    enPassantIndex: number;
    halfMoveCounter: number;
    fullMoveCounter: number;
    lastCaptureOrPawnPush: number;
}

export class Move {
    public from: number;
    public to: number;
    public color: Color;
    public piece: Piece;
    public capture: Piece = invalidPiece();
    public promote: Piece = invalidPiece();
    public type: MoveType = MoveType.NORMAL;

    constructor(state: BoardState, from: number, to: number, promote: Piece = Piece.MAX_ENUM) {
        this.from = from;
        this.to = to;
        this.promote = promote;

        const square: Square = state.pieces[from]!;
        this.color = square.color;
        this.piece = square.piece;

        console.log("to:", to);
        state.showPieces();
        this.capture = state.pieces[to]!.piece;
        if (!pieceValid(this.capture) && this.piece === Piece.PAWN) {
            if (to === state.enPassantIndex) this.type = MoveType.EN_PASSANT;
            else if (Math.abs(from - to) === 16) this.type = MoveType.DOUBLE_PUSH;
        }

        if (this.piece === Piece.KING) {
            if (state.rights[this.color]!.queenside && from - to === 2)
                this.type = MoveType.CASTLES_LONG;
            else if (state.rights[this.color]!.kingside && from - to === -2)
                this.type = MoveType.CASTLES_SHORT;
        }
    }

    public toLan(): string {
        const fromCol: Char = char(char("a").code + (this.from % 8));
        const fromRow: Char = char(char("1").code + 7 - Math.floor(this.from / 8));
        const toCol: Char = char(char("a").code + (this.to % 8));
        const toRow: Char = char(char("1").code + 7 - Math.floor(this.to / 8));

        var lan: string = Char.string([fromCol, fromRow, toCol, toRow]);
        if (pieceValid(this.promote)) {
            var promote: string;
            switch (this.promote) {
                case Piece.KNIGHT:
                    promote = "n";
                    break;
                case Piece.BISHOP:
                    promote = "b";
                    break;
                case Piece.ROOK:
                    promote = "r";
                    break;
                case Piece.QUEEN:
                    promote = "q";
                    break;
            }
            lan += promote!;
        }

        return lan;
    }

    public static fromLan(state: BoardState, lan: string): Move {
        if (lan.length !== 4 && lan.length !== 5)
            throw new Error(`Failed to parse LAN '${lan}'- Bad length`);

        function index(chars: string): number {
            if (chars.length != 2)
                throw new Error(
                    `Failed to parse LAN piece '${chars}'- Need 2 chars to convert to index (e.g., e4)`,
                );

            const x: number = chars.charCodeAt(0) - char("a").code;
            const y: number = char("8").code - chars.charCodeAt(1);
            return x + 8 * y;
        }

        var move: Move = new Move(state, index(lan.substring(0, 2)), index(lan.substring(2, 4)));

        if (lan.length === 5) {
            var promote: Piece;
            switch (lan.charAt(4)) {
                case "n":
                    promote = Piece.KNIGHT;
                    break;
                case "b":
                    promote = Piece.BISHOP;
                    break;
                case "r":
                    promote = Piece.ROOK;
                    break;
                case "q":
                    promote = Piece.QUEEN;
                    break;
                default:
                    throw new Error(`Failed to parse LAN '${lan}'- Bad promotion`);
            }
            move.promote = promote;
        }

        return move;
    }
}
