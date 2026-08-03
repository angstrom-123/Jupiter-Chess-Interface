#pragma once

#include "boardState.h"
#include "buffer.h"
#include "core.h"
#include "evaluator.h"
#include "history.h"
#include "move.h"
#include "attackTable.h"
#include "movegen.h"
#include "transpositionTable.h"

using LineBuffer = Buffer<Move, 32>;

struct MoveData {
    Move move{Move::Invalid()};
    Piece::Value capture{Piece::Invalid()};
    CastlingRights rights{0};
    Color::Value turn{Color::Invalid()};
    uint8_t enPassantIndex{0};
    uint64_t halfMoves{0};
};

struct SearchInfo {
    BoardState& state;
    History& history;
    int64_t alpha; 
    int64_t beta; 
    uint8_t depth; 
    uint8_t ply; 
    uint64_t targetMs;

    static SearchInfo Next(SearchInfo& current)
    {
        return (SearchInfo) { 
            .state = current.state,
            .history = current.history,
            .alpha = -current.beta,
            .beta = -current.alpha,
            .depth = static_cast<uint8_t>(current.depth - 1),
            .ply = static_cast<uint8_t>(current.ply + 1),
            .targetMs = current.targetMs
        };
    }
};

struct QuiesceInfo {
    BoardState& state;
    History& history;
    int64_t alpha;
    int64_t beta;
    uint8_t ply;
    uint64_t targetMs;

    static QuiesceInfo Next(QuiesceInfo& current)
    {
        return (QuiesceInfo) {
            .state = current.state,
            .history = current.history,
            .alpha = -current.beta,
            .beta = -current.alpha,
            .ply = static_cast<uint8_t>(current.ply + 1),
            .targetMs = current.targetMs
        };
    }
};

class Searcher {
public:
    Searcher(Zobrist& zobrist)
        : m_TranspositionTable(zobrist) {}
    Move FindBest(const BoardState& state, History& history, uint64_t msRemaining);
    MoveData MakeMove(Move move, BoardState &state);
    void SetTimeControl(uint64_t seconds, uint64_t increment);

private:
    void UnmakeMove(MoveData moveData, BoardState& state);
    int64_t Search(SearchInfo&& info);
    int64_t Quiesce(QuiesceInfo&& info);
    bool SquareUnderAttackBy(uint64_t bit, Color::Value color, Piece::Value piece, const BoardState& state);
    bool SquareUnderAttack(uint64_t bit, Color::Value color, const BoardState& state);
    bool WasLegal(MoveData moveData, const BoardState& state);
    void OrderMoves(const BoardState& state, Move bestMove, const AttackMoveBuffer& attacks, const QuietMoveBuffer& quiets, CombinedMoveBuffer& ordered);
    void OrderMoves(const BoardState& state, Move bestMove, const AttackMoveBuffer& attacks, CombinedMoveBuffer& ordered);
    int64_t SEE(Move move, const BoardState& state);

private:
    uint64_t m_TimeControlSeconds{0};
    uint64_t m_TimeControlIncrement{0};
    uint64_t m_NodesEvaluated{0};
    uint64_t m_NodesSearched{0};
    uint64_t m_NodesQuiesced{0};
    uint64_t m_TranspositionHits{0};
    bool m_SearchAborted{false};
    AttackTable m_AttackTable{AttackTable()};
    Evaluator m_Eval{Evaluator()};
    TranspositionTable m_TranspositionTable;
};
