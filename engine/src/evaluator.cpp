#include "evaluator.h"
#include "movegen.h"
#include <immintrin.h>
#include <cmath>

int64_t Evaluator::Evaluate(const BoardState& state)
{
    int64_t eval = 0;

    eval += MaterialBalance(std::forward<const BoardState>(state));
    eval += PiecePositions(std::forward<const BoardState>(state));

    return eval;
}

int64_t Evaluator::MaterialBalance(const BoardState& state)
{
    int64_t materialEval = 0;

    Color::Value friendly = state.turn;
    Color::Value enemy = Color::Opposite(state.turn);

    int64_t nPawns = state.pieces.Count(friendly, Piece::PAWN) - state.pieces.Count(enemy, Piece::PAWN);
    int64_t nKnights = state.pieces.Count(friendly, Piece::KNIGHT) - state.pieces.Count(enemy, Piece::KNIGHT);
    int64_t nBishops = state.pieces.Count(friendly, Piece::BISHOP) - state.pieces.Count(enemy, Piece::BISHOP);
    int64_t nRooks = state.pieces.Count(friendly, Piece::ROOK) - state.pieces.Count(enemy, Piece::ROOK);
    int64_t nQueens = state.pieces.Count(friendly, Piece::QUEEN) - state.pieces.Count(enemy, Piece::QUEEN);

    materialEval = (nPawns * Piece::Evaluate(Piece::PAWN)) 
        + (nKnights * Piece::Evaluate(Piece::KNIGHT)) 
        + (nBishops * Piece::Evaluate(Piece::BISHOP)) 
        + (nRooks * Piece::Evaluate(Piece::ROOK)) 
        + (nQueens * Piece::Evaluate(Piece::QUEEN));

    return materialEval;
}

int64_t Evaluator::PiecePositions(const BoardState& state)
{
    int64_t piecePositionEval = 0;

    Color::Value friendly = state.turn;
    Color::Value enemy = Color::Opposite(state.turn);

    uint8_t phase = GamePhase(std::forward<const BoardState>(state));

    for (uint8_t i = Piece::PAWN; i < Piece::MAX_ENUM; i++) {
        Piece::Value piece = static_cast<Piece::Value>(i);

        Bitboard friendlyoccupancy = state.pieces.OccupancyMask(friendly, piece);
        while (friendlyoccupancy) {
            uint8_t index = _tzcnt_u64(friendlyoccupancy);
            piecePositionEval += m_PieceSquareTables.Get(friendly, piece, index, phase);
            friendlyoccupancy &= (friendlyoccupancy - 1);
        }

        Bitboard enemyoccupancy = state.pieces.OccupancyMask(enemy, piece);
        while (enemyoccupancy) {
            uint8_t index = _tzcnt_u64(enemyoccupancy);
            piecePositionEval -= m_PieceSquareTables.Get(enemy, piece, index, phase);
            enemyoccupancy &= (enemyoccupancy - 1);
        }
    }

    return piecePositionEval;
}

// 0-100, higher = more likely to be endgame
uint8_t Evaluator::GamePhase(const BoardState& state)
{
    uint8_t score = 0;

    constexpr float MINOR_PIECE_WEIGHT = 35.0;
    constexpr float MAJOR_PIECE_WEIGHT = 50.0;
    constexpr float PAWN_WEIGHT = 15.0;

    static_assert(MINOR_PIECE_WEIGHT + MAJOR_PIECE_WEIGHT + PAWN_WEIGHT == 100.0, "Weights must sum to 100.");

    // Minor piece counts
    uint8_t nKnights = state.pieces.Count(Color::WHITE, Piece::KNIGHT) + state.pieces.Count(Color::BLACK, Piece::KNIGHT);
    uint8_t nBishops = state.pieces.Count(Color::WHITE, Piece::BISHOP) + state.pieces.Count(Color::BLACK, Piece::BISHOP);

    score += std::floor(MINOR_PIECE_WEIGHT / static_cast<float>(std::max(nKnights + nBishops, 1)));

    // Major piece counts
    uint8_t nRooks = state.pieces.Count(Color::WHITE, Piece::ROOK) + state.pieces.Count(Color::BLACK, Piece::ROOK);
    uint8_t nQueens = state.pieces.Count(Color::WHITE, Piece::QUEEN) + state.pieces.Count(Color::BLACK, Piece::QUEEN);

    score += std::floor(MAJOR_PIECE_WEIGHT / static_cast<float>(std::max(nRooks + nQueens, 1)));

    // Pawn counts
    uint8_t nPawns = state.pieces.Count(Color::WHITE, Piece::PAWN) + state.pieces.Count(Color::BLACK, Piece::PAWN);

    score += std::floor(PAWN_WEIGHT / static_cast<float>(std::max(nPawns, static_cast<uint8_t>(1))));

    return score;
}
