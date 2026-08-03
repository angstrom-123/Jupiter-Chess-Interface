import { GameOverReason } from "./board.mjs";
import { BoardState, char, Square } from "./boardState.mjs";
import { FenParser } from "./fenParser.mjs";
import { Move, MoveType, type MoveData } from "./move.mjs";
import { ZobristTable } from "./zobrist.mjs";

export enum Piece {
    PAWN,
    KNIGHT,
    BISHOP,
    ROOK,
    QUEEN,
    KING,
    MAX_ENUM,
}
export function invalidPiece(): Piece {
    return Piece.MAX_ENUM;
}
export function pieceValid(piece: Piece): boolean {
    return piece != Piece.MAX_ENUM;
}

export enum Color {
    WHITE,
    BLACK,
    MAX_ENUM,
}
export function invalidColor(): Color {
    return Color.MAX_ENUM;
}
export function colorValid(color: Color): boolean {
    return color != Color.MAX_ENUM;
}
export function oppositeColor(color: Color): Color {
    switch (color) {
        case Color.WHITE:
            return Color.BLACK;
        case Color.BLACK:
            return Color.WHITE;
        default:
            throw new Error("Bad color in opposite color");
    }
}
export function showColor(color: Color): string {
    switch (color) {
        case Color.WHITE:
            return "white";
        case Color.BLACK:
            return "black";
        default:
            throw new Error("Bad color in show color");
    }
}

export class Coordinate {
    public x: number;
    public y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public static fromIndex(index: number): Coordinate {
        return new Coordinate(index % 8, Math.floor(index / 8));
    }

    public toIndex(): number {
        return this.x + 8 * this.y;
    }

    public inBounds(): boolean {
        return this.x >= 0 && this.x <= 7 && this.y >= 0 && this.y <= 7;
    }

    public mul(x: number): Coordinate {
        return new Coordinate(this.x * x, this.y * x);
    }

    public add(coord: Coordinate): Coordinate;
    public add(x: number, y: number): Coordinate;
    public add(first: Coordinate | number, second?: number): Coordinate {
        if (first instanceof Coordinate) return new Coordinate(this.x + first.x, this.y + first.y);
        else return new Coordinate(this.x + first, this.y + second!);
    }

    public sub(coord: Coordinate): Coordinate;
    public sub(x: number, y: number): Coordinate;
    public sub(first: Coordinate | number, second?: number): Coordinate {
        if (first instanceof Coordinate) return new Coordinate(this.x - first.x, this.y - first.y);
        else return new Coordinate(this.x - first, this.y - second!);
    }
}

export class BoardController {
    private startFen: string;
    private state: BoardState;
    private attacks: boolean[][];
    private positionHistory: bigint[];
    private moveHistory: Move[];
    private zobristTable: ZobristTable;
    private lastCaptureOrPawnPush: number = 0;

    constructor(fen: string) {
        this.startFen = fen;

        const parser: FenParser = new FenParser();
        this.state = parser.parse(fen);

        this.attacks = [new Array<boolean>(64), new Array<boolean>(64)];
        this.updateAttacks();

        this.zobristTable = new ZobristTable();
        this.positionHistory = [this.zobristTable.computeKey(this.state)];
        this.moveHistory = [];
    }

    public getState(): BoardState {
        return this.state;
    }

    public makeMove(move: Move): MoveData {
        const moveData: MoveData = {
            move: move,
            rights: structuredClone(this.state.rights),
            enPassantIndex: this.state.enPassantIndex,
            halfMoveCounter: this.state.halfMoveCounter,
            fullMoveCounter: this.state.fullMoveCounter,
            lastCaptureOrPawnPush: this.lastCaptureOrPawnPush,
        };

        this.state.pieces[move.from] = Square.invalid();
        this.state.pieces[move.to] = new Square(
            pieceValid(move.promote) ? move.promote : move.piece,
            move.color,
        );

        this.state.enPassantIndex = -1;

        // Handle special moves
        switch (move.type) {
            case MoveType.EN_PASSANT:
                const offset: number = this.state.turn === Color.WHITE ? 8 : -8;
                this.state.pieces[move.to + offset] = Square.invalid();
                break;
            case MoveType.DOUBLE_PUSH:
                this.state.enPassantIndex = (move.from + move.to) / 2;
                break;
            case MoveType.CASTLES_SHORT:
                // . . . . K . . R
                this.state.pieces[move.from + 3] = Square.invalid();
                this.state.pieces[move.from + 1] = new Square(Piece.ROOK, move.color);
                break;
            case MoveType.CASTLES_LONG:
                // R . . . K . . .
                this.state.pieces[move.from - 4] = Square.invalid();
                this.state.pieces[move.from - 1] = new Square(Piece.ROOK, move.color);
                break;
        }

        // King moved - revoke rights
        if (move.piece === Piece.KING)
            this.state.rights[move.color] = { kingside: false, queenside: false };

        // Rook moved - revoke right on that side
        if (move.piece === Piece.ROOK) {
            if (move.from === (this.state.turn === Color.WHITE ? 56 : 0))
                this.state.rights[move.color]!.queenside = false;
            else if (move.from === (this.state.turn === Color.WHITE ? 63 : 7))
                this.state.rights[move.color]!.kingside = false;
        }

        // Rook captured - revoke opponent right on that side
        if (move.capture === Piece.ROOK) {
            if (move.to === (this.state.turn === Color.WHITE ? 0 : 56))
                this.state.rights[oppositeColor(move.color)]!.queenside = false;
            else if (move.to === (this.state.turn === Color.WHITE ? 7 : 63))
                this.state.rights[oppositeColor(move.color)]!.kingside = false;
        }

        // Update 50 move rule counter
        if (move.piece === Piece.PAWN || pieceValid(move.capture))
            this.lastCaptureOrPawnPush = this.state.halfMoveCounter;

        this.updateAttacks();
        this.positionHistory.push(this.zobristTable.computeKey(this.state));
        this.moveHistory.push(move);
        if (this.state.turn === Color.WHITE && this.state.halfMoveCounter > 0)
            this.state.fullMoveCounter++;
        this.state.halfMoveCounter++;
        this.state.turn = oppositeColor(this.state.turn);

        return moveData;
    }

    public unmakeMove(moveData: MoveData) {
        const move: Move = moveData.move;

        this.state.pieces[move.from] = new Square(move.piece, move.color);
        this.state.pieces[move.to] = pieceValid(move.capture)
            ? new Square(move.capture, oppositeColor(move.color))
            : Square.invalid();

        // Handle special moves
        switch (move.type) {
            case MoveType.EN_PASSANT:
                const offset: number = move.color === Color.WHITE ? 8 : -8;
                this.state.pieces[move.to + offset] = new Square(
                    Piece.PAWN,
                    oppositeColor(move.color),
                );
                break;
            case MoveType.CASTLES_SHORT:
                // . . . . . R K .
                this.state.pieces[move.from + 1] = Square.invalid();
                this.state.pieces[move.from + 3] = new Square(Piece.ROOK, move.color);
                break;
            case MoveType.CASTLES_LONG:
                // . . K R . . . .
                this.state.pieces[move.from - 1] = Square.invalid();
                this.state.pieces[move.from - 4] = new Square(Piece.ROOK, move.color);
                break;
        }

        this.state.rights = moveData.rights;
        this.state.halfMoveCounter = moveData.halfMoveCounter;
        this.state.fullMoveCounter = moveData.fullMoveCounter;
        this.state.enPassantIndex = moveData.enPassantIndex;
        this.state.turn = move.color;
        this.lastCaptureOrPawnPush = moveData.lastCaptureOrPawnPush;

        this.updateAttacks();
        this.positionHistory.pop();
        this.moveHistory.pop();
    }

    public isGameOver(): GameOverReason {
        // Checkmate / Stalemate
        var hasMoves: boolean = false;
        for (let i: number = 0; i < 64; i++) {
            const square: Square = this.state.pieces[i]!;
            if (square.color === this.state.turn && this.getMoves(i, this.state.turn).length > 0) {
                hasMoves = true;
                break;
            }
        }
        if (!hasMoves) {
            var kingSquare: number = -1;
            for (let i: number = 0; i < 64; i++) {
                const square: Square = this.state.pieces[i]!;
                if (square.piece === Piece.KING && square.color === this.state.turn) {
                    kingSquare = i;
                    break;
                }
            }

            if (this.attacks[oppositeColor(this.state.turn)]![kingSquare])
                return GameOverReason.CHECKMATE;
            else 
                return GameOverReason.STALEMATE;
        }

        // Stalemate (material)
        var bishops: number = 0;
        var knights: number = 0;
        var hasEnoughMaterial: boolean = false;
        for (const square of this.state.pieces) {
            if (square.piece === Piece.KNIGHT) {
                knights++;
                if (knights + bishops >= 2) {
                    hasEnoughMaterial = true;
                    break;
                }
            } else if (square.piece === Piece.BISHOP) {
                bishops++;
                if (knights + bishops >= 2) {
                    hasEnoughMaterial = true;
                    break;
                }
            } else if (square.piece !== Piece.KING) {
                hasEnoughMaterial = true;
                break;
            }
        }
        if (!hasEnoughMaterial)
            return GameOverReason.STALEMATE;

        // Repetition
        const positions: Map<bigint, number> = new Map<bigint, number>;
        for (const hash of this.positionHistory) {
            const count: number | undefined = positions.get(hash);
            const newCount = (count) ? count + 1 : 1;
            if (newCount === 3)
                return GameOverReason.REPETITION;
            positions.set(hash, newCount);
        }

        // 50-move rule
        if (this.state.halfMoveCounter - this.lastCaptureOrPawnPush >= 100)
            return GameOverReason.FIFTY_MOVE_RULE;

        return GameOverReason.NONE;
    }

    public getHistory(): Move[] {
        return this.moveHistory;
    }

    public getStartingFen(): string {
        return this.startFen;
    }

    public getMoves(index: number, color: Color = Color.MAX_ENUM): number[] {
        if (!colorValid(color)) color = this.state.pieces[index]!.color;

        const getPseudolegals = (index: number, color: Color): number[] => {
            const square: Square = this.state.pieces[index]!;
            switch (square.piece) {
                case Piece.PAWN:
                    return this.pawnMoves(index, color);
                case Piece.KNIGHT:
                    return this.knightMoves(index, color);
                case Piece.BISHOP:
                    return this.bishopMoves(index, color);
                case Piece.ROOK:
                    return this.rookMoves(index, color);
                case Piece.QUEEN:
                    return this.queenMoves(index, color);
                case Piece.KING:
                    return this.kingMoves(index, color);
                default:
                    return [];
            }
        };
        const moves: number[] = [];
        const enemy: Color = oppositeColor(color);
        const pseudolegals: number[] = getPseudolegals(index, color);
        for (const toIndex of pseudolegals) {
            const move: Move = new Move(this.state, index, toIndex);
            const moveData: MoveData = this.makeMove(move);
            var safe: boolean = false;
            for (let i: number = 0; i < 64; i++) {
                if (this.state.pieces[i]!.equals(Piece.KING, color)) {
                    safe = !this.attacks[enemy]![i]!;
                    break;
                }
            }
            this.unmakeMove(moveData);
            if (safe) moves.push(toIndex);
        }
        return moves;
    }

    public getAttacks(index: number): number[] {
        const square: Square = this.state.pieces[index]!;
        switch (square.piece) {
            case Piece.PAWN:
                return this.pawnAttacks(index, square.color);
            case Piece.KNIGHT:
                return this.knightMoves(index, square.color);
            case Piece.BISHOP:
                return this.bishopMoves(index, square.color);
            case Piece.ROOK:
                return this.rookMoves(index, square.color);
            case Piece.QUEEN:
                return this.queenMoves(index, square.color);
            case Piece.KING:
                return this.kingAttacks(index, square.color);
            default:
                return [];
        }
    }

    public getFen(): string {
        var fen: string = "";

        // Pieces
        var index: number = 0;
        var counter: number = 0;
        while (index < 64) {
            const square: Square = this.state.pieces[index]!;

            if (pieceValid(square.piece) || (index > 0 && index % 8 === 0)) {
                if (counter > 0) fen += char(char("0").code + counter).char;

                counter = 0;
            }

            if (!pieceValid(square.piece)) {
                counter++;
            }

            if (index > 0 && index % 8 === 0) fen += "/";

            switch (square.piece) {
                case Piece.PAWN:
                    fen += square.color === Color.WHITE ? "P" : "p";
                    break;
                case Piece.KNIGHT:
                    fen += square.color === Color.WHITE ? "N" : "n";
                    break;
                case Piece.BISHOP:
                    fen += square.color === Color.WHITE ? "N" : "b";
                    break;
                case Piece.ROOK:
                    fen += square.color === Color.WHITE ? "R" : "r";
                    break;
                case Piece.QUEEN:
                    fen += square.color === Color.WHITE ? "Q" : "q";
                    break;
                case Piece.KING:
                    fen += square.color === Color.WHITE ? "K" : "k";
                    break;
            }

            index++;
        }

        fen += " ";

        // Turn to move
        fen += this.state.turn === Color.WHITE ? "w" : "b";

        fen += " ";

        // Castling rights
        var canCastle: boolean = false;
        for (const side of this.state.rights) {
            if (side.kingside || side.queenside) canCastle = true;
        }
        if (canCastle) {
            if (this.state.rights[Color.WHITE]!.kingside) fen += "K";
            if (this.state.rights[Color.WHITE]!.queenside) fen += "Q";
            if (this.state.rights[Color.BLACK]!.kingside) fen += "k";
            if (this.state.rights[Color.BLACK]!.queenside) fen += "q";
        } else {
            fen += "-";
        }

        fen += " ";

        // En passant square
        if (this.state.enPassantIndex !== -1) {
            const c: number = this.state.enPassantIndex % 8;
            const r: number = 7 - Math.floor(this.state.enPassantIndex / 8);

            const square: string = char(char("a").code + c).char + char(char("1").code + r).char;
            fen += square;
        } else {
            fen += "-";
        }

        fen += " ";

        // Half move counter
        fen += char(char("0").code + this.state.halfMoveCounter).char;

        fen += " ";

        // Full move counter
        fen += char(char("0").code + this.state.fullMoveCounter).char;

        return fen;
    }

    public showAttacks(color: Color) {
        var line: string = "";
        for (let i: number = 0; i < 64; i++) {
            if (i % 8 === 0) {
                line += "\n";
            }

            line += this.attacks[color]![i] ? "x" : ".";
            line += " ";
        }
        console.log(line + "\n");
    }

    public showPieces() {
        var line: string = "";
        for (let i: number = 0; i < 64; i++) {
            if (i % 8 === 0) {
                line += "\n";
            }

            const square: Square = this.state.pieces[i]!;
            switch (square.piece) {
                case Piece.PAWN:
                    line += square.color === Color.WHITE ? "P" : "p";
                    break;
                case Piece.KNIGHT:
                    line += square.color === Color.WHITE ? "N" : "n";
                    break;
                case Piece.BISHOP:
                    line += square.color === Color.WHITE ? "B" : "b";
                    break;
                case Piece.ROOK:
                    line += square.color === Color.WHITE ? "R" : "r";
                    break;
                case Piece.QUEEN:
                    line += square.color === Color.WHITE ? "Q" : "q";
                    break;
                case Piece.KING:
                    line += square.color === Color.WHITE ? "K" : "k";
                    break;
                default:
                    line += ".";
                    break;
            }
            line += " ";
        }
        console.log(line + "\n");
    }

    private updateAttacks() {
        this.attacks[Color.WHITE]!.fill(false);
        this.attacks[Color.BLACK]!.fill(false);
        for (let i: number = 0; i < 64; i++) {
            const attacks: number[] = this.getAttacks(i);
            const color: Color = this.state.pieces[i]!.color;
            for (const attack of attacks) this.attacks[color]![attack] = true;
        }
    }

    private pawnMoves(index: number, color: Color): number[] {
        const moves: number[] = [];
        const enemy: Color = oppositeColor(color);
        const direction: number = color === Color.WHITE ? -1 : 1;
        const coord: Coordinate = Coordinate.fromIndex(index);

        const singlePush: Coordinate = coord.add(0, direction);
        if (singlePush.inBounds() && !pieceValid(this.state.pieces[singlePush.toIndex()]!.piece)) {
            moves.push(singlePush.toIndex());
            const doublePush: Coordinate = singlePush.add(0, direction);
            if (
                doublePush.inBounds() &&
                !pieceValid(this.state.pieces[doublePush.toIndex()]!.piece)
            )
                moves.push(doublePush.toIndex());
        }

        const takesLeft: Coordinate = coord.add(-1, direction);
        const takesRight: Coordinate = coord.add(1, direction);
        for (const attack of [takesLeft, takesRight]) {
            if (
                (attack.inBounds() && this.state.pieces[attack.toIndex()]!.color === enemy) ||
                attack.toIndex() === this.state.enPassantIndex
            )
                moves.push(attack.toIndex());
        }

        return moves;
    }

    private pawnAttacks(index: number, color: Color): number[] {
        const moves: number[] = [];
        const direction: number = color === Color.WHITE ? -1 : 1;
        const coord: Coordinate = Coordinate.fromIndex(index);

        const takesLeft: Coordinate = coord.add(-1, direction);
        const takesRight: Coordinate = coord.add(1, direction);
        for (const attack of [takesLeft, takesRight]) {
            if (attack.inBounds() || attack.toIndex() === this.state.enPassantIndex)
                moves.push(attack.toIndex());
        }

        return moves;
    }

    private knightMoves(index: number, color: Color): number[] {
        const moves: number[] = [];
        const enemy: Color = oppositeColor(color);
        const coord: Coordinate = Coordinate.fromIndex(index);

        const moveCoords: Coordinate[] = [
            coord.add(1, 2),
            coord.add(2, 1),
            coord.add(2, -1),
            coord.add(1, -2),
            coord.add(-1, -2),
            coord.add(-2, -1),
            coord.add(-2, 1),
            coord.add(-1, 2),
        ];
        for (const attack of moveCoords) {
            if (attack.inBounds()) {
                const square: Square = this.state.pieces[attack.toIndex()]!;
                if (!pieceValid(square.piece) || square.color === enemy)
                    moves.push(attack.toIndex());
            }
        }
        return moves;
    }

    private bishopMoves(index: number, color: Color): number[] {
        return this.sliderAttacks(index, color, false, true);
    }

    private rookMoves(index: number, color: Color): number[] {
        return this.sliderAttacks(index, color, true, false);
    }

    private queenMoves(index: number, color: Color): number[] {
        return this.sliderAttacks(index, color, true, true);
    }

    private kingMoves(index: number, color: Color): number[] {
        const moves: number[] = [];
        const enemy: Color = oppositeColor(color);
        const attacks: boolean[] = this.attacks[enemy]!;
        const coord: Coordinate = Coordinate.fromIndex(index);

        const shortIndices: number[] = [index + 1, index + 2];
        const longIndices: number[] = [index - 1, index - 2];
        if (!attacks[index]) {
            for (const side of [shortIndices, longIndices]) {
                var canCastle: boolean =
                    side[0]! > index
                        ? this.state.rights[color]!.kingside
                        : this.state.rights[color]!.queenside;
                if (canCastle) {
                    for (const index of side) {
                        if (pieceValid(this.state.pieces[index]!.piece) || attacks[index]) {
                            canCastle = false;
                            break;
                        }
                    }
                }
                if (canCastle) moves.push(side[side.length - 1]!);
            }
        }

        const moveCoords: Coordinate[] = [
            coord.add(1, 1),
            coord.add(1, 0),
            coord.add(1, -1),
            coord.add(0, 1),
            coord.add(0, -1),
            coord.add(-1, 1),
            coord.add(-1, 0),
            coord.add(-1, -1),
        ];
        for (const coord of moveCoords) {
            if (coord.inBounds()) {
                const square: Square = this.state.pieces[coord.toIndex()]!;
                if (!pieceValid(square.piece) || square.color === enemy)
                    moves.push(coord.toIndex());
            }
        }

        return moves.concat(this.kingAttacks(index, color));
    }

    private kingAttacks(index: number, color: Color): number[] {
        const moves: number[] = [];
        const enemy: Color = oppositeColor(color);
        const coord: Coordinate = Coordinate.fromIndex(index);

        const moveCoords: Coordinate[] = [
            coord.add(1, 1),
            coord.add(1, 0),
            coord.add(1, -1),
            coord.add(0, 1),
            coord.add(0, -1),
            coord.add(-1, 1),
            coord.add(-1, 0),
            coord.add(-1, -1),
        ];
        for (const coord of moveCoords) {
            if (coord.inBounds()) {
                const square: Square = this.state.pieces[coord.toIndex()]!;
                if (!pieceValid(square.piece) || square.color === enemy)
                    moves.push(coord.toIndex());
            }
        }
        return moves;
    }

    private sliderAttacks(
        index: number,
        color: Color,
        orthogonal: boolean,
        diagonal: boolean,
    ): number[] {
        const moves: number[] = [];
        const enemy: Color = oppositeColor(color);
        const startCoord: Coordinate = Coordinate.fromIndex(index);

        const offsets: Coordinate[] = [
            new Coordinate(0, 1),
            new Coordinate(0, -1),
            new Coordinate(1, 0),
            new Coordinate(-1, 0),
            new Coordinate(1, 1),
            new Coordinate(1, -1),
            new Coordinate(-1, 1),
            new Coordinate(-1, -1),
        ];
        const start: number = orthogonal ? 0 : 4;
        const end: number = diagonal ? 8 : 4;

        for (let i: number = start; i < end; i++) {
            for (let distance: number = 1; distance < 8; distance++) {
                const coord: Coordinate = startCoord.add(offsets[i]!.mul(distance));
                if (!coord.inBounds()) break;

                const square: Square = this.state.pieces[coord.toIndex()]!;
                if (pieceValid(square.piece)) {
                    if (square.color === enemy) moves.push(coord.toIndex());
                    break;
                } else {
                    moves.push(coord.toIndex());
                }
            }
        }

        return moves;
    }
}
