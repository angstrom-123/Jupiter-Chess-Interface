import { BoardState, char, Char, Square } from "./boardState.mjs";
import { Color, Piece } from "./boardController.mjs";

interface FenChunk {
    start: number;
    end: number;
}

export class FenParser {
    public parse(fen: string): BoardState {
        var state: BoardState = new BoardState();

        const chunks: FenChunk[] = this.validate(fen);
        var chunk: FenChunk = chunks[0]!;

        // Piece positions
        var boardIndex: number = 0;
        for (let i: number = 0; i < 8; i++) {
            const chunk: FenChunk = chunks[i]!;
            for (let j: number = chunk.start; j < chunk.end; j++) {
                if (boardIndex >= 64) throw new Error("Failed to parse FEN - Bad piece positions");

                // const c: string = fen.charAt(j);
                const c: Char = char(fen.charAt(j));
                const color: Color = c.code > char("Z").code ? Color.BLACK : Color.WHITE;
                switch (c.char) {
                    case "1":
                    case "2":
                    case "3":
                    case "4":
                    case "5":
                    case "6":
                    case "7":
                    case "8":
                        boardIndex += c.code - char("0").code - 1;
                        break;
                    case "p":
                    case "P":
                        state.pieces[boardIndex] = new Square(Piece.PAWN, color);
                        break;
                    case "n":
                    case "N":
                        state.pieces[boardIndex] = new Square(Piece.KNIGHT, color);
                        break;
                    case "b":
                    case "B":
                        state.pieces[boardIndex] = new Square(Piece.BISHOP, color);
                        break;
                    case "r":
                    case "R":
                        state.pieces[boardIndex] = new Square(Piece.ROOK, color);
                        break;
                    case "q":
                    case "Q":
                        state.pieces[boardIndex] = new Square(Piece.QUEEN, color);
                        break;
                    case "k":
                    case "K":
                        state.pieces[boardIndex] = new Square(Piece.KING, color);
                        break;
                    default:
                        throw new Error("Failed to parse FEN - Bad character in piece posisions");
                }
                boardIndex++;
            }
        }

        // Turn to move
        chunk = chunks[8]!;
        if (chunk.end - chunk.start > 1) throw new Error("Failed to parse FEN - Bad turn to move");

        switch (fen.charAt(chunk.start)) {
            case "w":
                state.turn = Color.WHITE;
                break;
            case "b":
                state.turn = Color.BLACK;
                break;
            default:
                throw new Error("Failed to parse FEN - Bad character in turn to move");
        }

        // Castling rights
        chunk = chunks[9]!;
        if (chunk.end - chunk.start === 1) {
            if (fen.charAt(chunk.start) !== "-")
                throw new Error("Failed to parse FEN - Bad character in castling rights");
        } else {
            for (let i: number = chunk.start; i < chunk.end; i++) {
                const c: string = fen.charAt(i);
                switch (c) {
                    case "K":
                        state.rights[Color.WHITE]!.kingside = true;
                        break;
                    case "k":
                        state.rights[Color.BLACK]!.kingside = true;
                        break;
                    case "Q":
                        state.rights[Color.WHITE]!.queenside = true;
                        break;
                    case "q":
                        state.rights[Color.BLACK]!.queenside = true;
                        break;
                    default:
                        throw new Error("Failed to parse FEN - Bad character in castling rights");
                }
            }
        }

        // En Passant square
        chunk = chunks[10]!;
        if (chunk.end - chunk.start === 1) {
            if (fen.charAt(chunk.start) !== "-")
                throw new Error("Failed to parse FEN - Bad character in en passant square");
        } else if (chunk.end - chunk.start == 2) {
            const col: Char = char(fen.charAt(chunk.start));
            const row: Char = char(fen.charAt(chunk.start + 1));
            if (
                col.code < char("a").code ||
                col.code > char("h").code ||
                row.code < char("1").code ||
                row.code > char("8").code
            )
                throw new Error("Failed to parse FEN - Bad character in en passant square");
            state.enPassantIndex =
                col.code - char("a").code + 8 * (8 - (row.code - char("1").code));
        } else {
            throw new Error("Failed to parse FEN - Bad en passant square");
        }

        // Half Move counter
        chunk = chunks[11]!;
        try {
            state.halfMoveCounter = parseInt(fen.substring(chunk.start, chunk.end));
        } catch (_e) {
            throw new Error("Failed to parse FEN - Bad half move counter");
        }

        // Full Move counter
        chunk = chunks[12]!;
        try {
            state.fullMoveCounter = parseInt(fen.substring(chunk.start, chunk.end));
        } catch (_e) {
            throw new Error("Failed to parse FEN - Bad full move counter");
        }

        return state;
    }

    private validate(fen: string): FenChunk[] {
        const allowedChars: string[] = [
            "p",
            "P",
            "n",
            "N",
            "b",
            "B",
            "r",
            "R",
            "q",
            "Q",
            "k",
            "K",
            "w",
            "-",
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
        ];

        var chunks: FenChunk[] = [];

        var spaces: number = 0;
        var slashes: number = 0;
        for (const c of fen) {
            if (c === "/") {
                slashes++;
                continue;
            }

            if (c === " ") {
                spaces++;
                continue;
            }

            if (!allowedChars.includes(c))
                throw new Error("Failed to parse FEN - Disallowed character");
        }

        if (spaces != 5 || slashes != 7)
            throw new Error("Failed to parse FEN - Bad space or slash count");

        var start: number = 0;
        for (let end: number = 1; end < fen.length; end++) {
            if (fen.charAt(end) === " " || fen.charAt(end) === "/") {
                chunks.push({ start: start, end: end });
                start = end + 1;
            }
        }
        chunks.push({ start: start, end: fen.length });

        if (chunks.length != 13) throw new Error("Failed to parse FEN - Bad chunk count");

        return chunks;
    }
}
