#include "zobrist.h"
#include "core.h"
#include "rng.h"

#include <cassert>
#include <immintrin.h>

Zobrist::Zobrist()
{
    uint64_t seed[4] = { 1, 2, 3, 4 };
    RomuQuadRandom rng(seed);
    rng.Warm();

    for (uint64_t i = 0; i < ZOBRIST_NUMBER_COUNT; i++)
        m_Randoms[i] = rng.Generate();
}

ZobristKey Zobrist::ComputeKey(const BoardState& state) const
{
    ZobristKey key = 0;
    uint64_t offset = 0;

    // Pieces
    for (uint8_t i = 0; i < Color::MAX_ENUM; i++) {
        Color::Value color = static_cast<Color::Value>(i);
        for (uint8_t j = Piece::PAWN; j < Piece::MAX_ENUM; j++) {
            Piece::Value piece = static_cast<Piece::Value>(j);
            Bitboard occupancy = state.pieces.OccupancyMask(color, piece);
            while (occupancy) {
                uint8_t index = _tzcnt_u64(occupancy);
                key ^= m_Randoms[offset + index];
                occupancy &= (occupancy - 1);
            }
            offset += 64;
        }
    }

    // Castling rights
    if (state.rights & CastlingRight::KINGSIDE_WHITE)
        key ^= m_Randoms[offset];
    offset++;

    if (state.rights & CastlingRight::QUEENSIDE_WHITE)
        key ^= m_Randoms[offset];
    offset++;

    if (state.rights & CastlingRight::KINGSIDE_BLACK)
        key ^= m_Randoms[offset];
    offset++;

    if (state.rights & CastlingRight::QUEENSIDE_BLACK)
        key ^= m_Randoms[offset];
    offset++;

    // En Passant File
    if (state.enPassantIndex != UINT8_MAX) {
        // Check if any of our pawns can en passant the opponent pawn that just double pushed
        // This means that two identical positions (except for the en passant square) will hash to 
        // the same value as long as there is no pawn to capture en passant.
        // This check only accounts for pseudo-legal en passant captures but is better than nothing.
        uint8_t file = state.enPassantIndex & 7;
        uint8_t square = 8 * (state.turn == Color::WHITE ? 4 : 3) + file;
        uint64_t adjacentMask = 0;
        if (file > 0) adjacentMask |= (1ul << (square - 1));
        if (file < 7) adjacentMask |= (1ul << (square + 1));
        if (adjacentMask & state.pieces.OccupancyMask(state.turn, Piece::PAWN))
            key ^= m_Randoms[offset + file];
    }
    offset += 8;

    // Turn to move
    if (state.turn == Color::BLACK)
        key ^= m_Randoms[offset];
    offset++;

    assert(offset == ZOBRIST_NUMBER_COUNT && "Mistake in zobrist offset computation");

    return key;
}
