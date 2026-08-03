import type { BoardState } from "./boardState.mjs";
import { Color, Piece, pieceValid } from "./boardController.mjs";

// Romu Pseudorandom Number Generators
//
// Copyright 2020 Mark A. Overton
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// ------------------------------------------------------------------------------------------------
//
// Website: romu-random.org
// Paper:   http://arxiv.org/abs/2002.11331

//===== RomuQuad ==================================================================================
//
// More robust than anyone could need, but uses more registers than RomuTrio.
// Est. capacity >= 2^90 bytes. Register pressure = 8 (high). State size = 256 bits.

// FORGIVING WITH SEED, SHOULD BE FINE TO SEED WITH ANY NUMBERS, ESPECIALLY IF WARMED BEFORE USE.
interface RomuSeed {
    w: bigint;
    x: bigint;
    y: bigint;
    z: bigint;
}
class RomuRandom {
    private w: bigint;
    private x: bigint;
    private y: bigint;
    private z: bigint;

    constructor({ w, x, y, z }: RomuSeed) {
        this.w = w;
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public warm(iterations: number = 10) {
        for (let i: number = 0; i < iterations; i++) this.generate();
    }

    public generate(): bigint {
        const wp: bigint = this.w;
        const xp: bigint = this.x;
        const yp: bigint = this.y;
        const zp: bigint = this.z;

        this.w = 15241094284759029579n * zp; // a-mult
        this.x = zp + this.rotl(wp, 52n); // b-rotl, c-add
        this.y = yp - xp; // d-sub
        this.z = yp + wp; // e-add
        this.z = this.rotl(this.z, 19n); // f-rotl
        return xp;
    }

    private rotl(d: bigint, lrot: bigint): bigint {
        return (d << lrot) | (d >> (64n - lrot));
    }
}

const ZOBRIST_COUNT = 781;
export class ZobristTable {
    private randoms: Array<bigint>;

    constructor() {
        const rng: RomuRandom = new RomuRandom({ w: 1n, x: 2n, y: 3n, z: 4n });
        rng.warm();

        this.randoms = new Array<bigint>(ZOBRIST_COUNT);
        for (let i: number = 0; i < ZOBRIST_COUNT; i++) this.randoms[i] = rng.generate();
    }

    public computeKey(state: BoardState): bigint {
        var key: bigint = 0n;
        var offset: number = 0;

        // Pieces
        for (let color: Color = Color.WHITE; color < Color.MAX_ENUM; color++) {
            for (let piece: Piece = Piece.PAWN; piece < Piece.MAX_ENUM; piece++) {
                for (let index: number = 0; index < 64; index++) {
                    if (pieceValid(state.pieces[index]!.piece))
                        key ^= this.randoms[offset + index]!;
                }
                offset += 64;
            }
        }

        // Castling rights
        if (state.rights[Color.WHITE]!.kingside) key ^= this.randoms[offset]!;
        offset++;

        if (state.rights[Color.WHITE]!.queenside) key ^= this.randoms[offset]!;
        offset++;

        if (state.rights[Color.BLACK]!.kingside) key ^= this.randoms[offset]!;
        offset++;

        if (state.rights[Color.BLACK]!.queenside) key ^= this.randoms[offset]!;
        offset++;

        // En Passant File
        const enPassantIndex: number = state.enPassantIndex;
        if (enPassantIndex !== -1) {
            const file: number = enPassantIndex & 7;
            const index: number = 8 * (state.turn === Color.WHITE ? 4 : 3) + file;
            if (
                (file > 0 && state.pieces[index - 1]!.piece === Piece.PAWN) ||
                (file < 7 && state.pieces[index + 1]!.piece === Piece.PAWN)
            )
                key ^= this.randoms[offset + file]!;
        }
        offset += 8;

        if (state.turn === Color.BLACK) key ^= this.randoms[offset]!;
        offset++;

        if (offset !== ZOBRIST_COUNT) throw new Error("Zobrist Hashing ended with bad offset");

        return key;
    }
}
