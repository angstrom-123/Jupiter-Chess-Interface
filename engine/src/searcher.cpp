#include "searcher.h"
#include "boardState.h"
#include "move.h"
#include "evaluator.h"
#include "movegen.h"
#include "transpositionTable.h"

#include <chrono>
#include <cmath>
#include <cstdint>
#include <ctime>
#include <immintrin.h>
#include <iostream>
#include <utility>

namespace chrono = std::chrono;

Move Searcher::FindBest(const BoardState& state, History& history, uint64_t msRemaining)
{
    auto startPoint = chrono::high_resolution_clock::now();
    uint64_t startMs = chrono::time_point_cast<chrono::milliseconds>(startPoint).time_since_epoch().count();

    float m = std::max(10l, 50 - static_cast<int64_t>(state.halfMoves) / 2);
    float i = std::max(0l, static_cast<int64_t>(m_TimeControlIncrement) - 1) * 1000;
    float c = 1.0; // TODO: Set this complexity somehow, and implement search extensions
    uint64_t targetTimeMs = ((msRemaining / m) * c) + i;

    uint64_t targetMs = startMs + targetTimeMs;
    std::cout << "Target search time: " << targetTimeMs << "ms" << std::endl;

    BoardState workingState(state);
    m_SearchAborted = false;

    m_NodesSearched = 0;
    m_NodesQuiesced = 0;
    m_NodesEvaluated = 0;
    m_TranspositionHits = 0;

    // Iterative deepening
    Move bestMove = Move::Invalid();
    uint8_t depth = 0;
    while (++depth) {
        // Only check termination condition every 2048 nodes to save expensive clock calls
        if ((m_NodesSearched & 2047) == 0) {
            auto nowPoint = chrono::high_resolution_clock::now();
            uint64_t nowMs = chrono::time_point_cast<chrono::milliseconds>(nowPoint).time_since_epoch().count();
            if (nowMs >= targetMs) {
                std::cout << "Search aborted" << std::endl;
                break;
            }
        }

        AttackMoveBuffer attackMoves;
        movegen::FindAttacks(std::forward<const BoardState>(state), m_AttackTable, attackMoves);

        QuietMoveBuffer quietMoves;
        movegen::FindQuiets(std::forward<const BoardState>(state), m_AttackTable, quietMoves);

        CombinedMoveBuffer moves;
        OrderMoves(std::forward<const BoardState>(state), bestMove, attackMoves, quietMoves, moves);
        std::cout << "Found " << moves.Size() << " moves at root" << std::endl;

        Move depthBestMove = Move::Invalid();
        int64_t bestScore = -INT64_MAX;
        int64_t alpha = -INT64_MAX;
        int64_t beta = INT64_MAX;

        for (Move move : moves) {
            m_NodesSearched++;
            MoveData moveData = MakeMove(move, workingState);
            if (!WasLegal(moveData, workingState)) {
                UnmakeMove(moveData, workingState);
                continue;
            }
            m_NodesEvaluated++;

            int64_t score;

            // Repetition draw check
            history.Push(workingState);
            if (history.IsRepetition()) {
                score = 0; // TODO: Contempt?
            } else {
                score = -Search((SearchInfo) {
                    .state = workingState, 
                    .history = history,
                    .alpha = -beta, 
                    .beta = -alpha, 
                    .depth = static_cast<uint8_t>(depth - 1), 
                    .ply = 1,
                    .targetMs = targetMs
                });
            }
            UnmakeMove(moveData, workingState);
            history.Pop();

            // Ran out of time
            if (m_SearchAborted)
                break;

            if (score > bestScore) {
                bestScore = score;
                depthBestMove = move;
                if (score > alpha)
                    alpha = score;
            }
        }

        // Ran out of time - Incomplete search so don't save result
        if (m_SearchAborted) {
            std::cout << "Search aborted" << std::endl;
            break;
        }

        // Checkmate or stalemate
        if (!Move::IsValid(depthBestMove)) {
            std::cout << "Couldn't find a valid move" << std::endl;
            break;
        }

        // Save best move
        bestMove = depthBestMove;

        // Reconstruct and show principal variation at this depth
        LineBuffer principalVariation;
        principalVariation.PushBack(bestMove);

        BoardState reconstructState(workingState);
        MakeMove(bestMove, reconstructState);
        for (uint8_t i = 1; i < depth; i++) { // Already saved the first move
            TableEntry entry = m_TranspositionTable.Get(std::forward<const BoardState>(reconstructState));
            if (!entry.IsValid())
                break;

            if (!Move::IsValid(entry.bestMove))
                break;

            MoveData moveData = MakeMove(entry.bestMove, reconstructState);
            if (!WasLegal(moveData, std::forward<const BoardState>(reconstructState))) {
                UnmakeMove(moveData, reconstructState);
                break;
            }

            principalVariation.PushBack(entry.bestMove);
        }
        std::cout << "Principal Variation (depth=" << static_cast<int>(depth) << "): ";
        for (const auto move : principalVariation)
            std::cout << move.ToLAN().chars << ", ";
        std::cout << std::endl;
    }
    
    auto endPoint = chrono::high_resolution_clock::now();
    uint64_t endMs = chrono::time_point_cast<chrono::milliseconds>(endPoint).time_since_epoch().count();

    uint64_t msTaken = endMs - startMs;
    float mnpsSearch = static_cast<float>(m_NodesSearched) / static_cast<float>(msTaken) / 1000.0;
    float mnpsEvaluate = static_cast<float>(m_NodesEvaluated) / static_cast<float>(msTaken) / 1000.0;
    std::cout << "Searched " << m_NodesSearched << " nodes in " << msTaken << "ms (" << std::setprecision(3) << mnpsSearch << " million nps)" <<  std::endl;
    std::cout << "  of those Quiesced " << m_NodesQuiesced << " nodes" << std::endl;
    std::cout << "Evaluated " << m_NodesEvaluated << " nodes in " << msTaken << "ms (" << std::setprecision(3) << mnpsEvaluate << " million nps)" <<  std::endl;
    std::cout << "Hit " << m_TranspositionHits << " transpositions (" << m_TranspositionTable.OccupiedMiB() << "MiB)" << std::endl;

    return bestMove;
}

int64_t Searcher::Search(SearchInfo&& info)
{
    // Only check termination condition every 2048 nodes to save expensive clock calls
    if ((m_NodesSearched & 2047) == 0) {
        auto nowPoint = chrono::high_resolution_clock::now();
        uint64_t nowMs = chrono::time_point_cast<chrono::milliseconds>(nowPoint).time_since_epoch().count();
        if (nowMs >= info.targetMs) {
            m_SearchAborted = true;
            return 0;
        }
    }

    // Return early if already searched this position to >= depth, else get best move so far
    Move refutationMove = Move::Invalid();
    TableEntry lookup = m_TranspositionTable.Get(std::forward<const BoardState>(info.state));
    if (lookup.IsValid()) {
        refutationMove = lookup.bestMove;

        m_TranspositionHits++;

        if (lookup.depth >= info.depth) {
            int64_t score = lookup.score;

            if (score > MATE_THRESOLD) 
                score += info.ply;

            if (score < -MATE_THRESOLD) 
                score -= info.ply;

            if (lookup.nodeType == NodeType::LOWER_BOUND)
                info.alpha = std::max(info.alpha, score);

            if (lookup.nodeType == NodeType::UPPER_BOUND)
                info.beta = std::min(info.beta, score);

            if (info.alpha >= info.beta)
                return score;
        }
    }

    if (info.depth == 0) 
        return Quiesce((QuiesceInfo) {
            .state = info.state, 
            .history = info.history,
            .alpha = info.alpha, 
            .beta = info.beta, 
            .ply = info.ply,
            .targetMs = info.targetMs
        });

    int64_t max = -INT64_MAX;
    Move bestMove = Move::Invalid();

    AttackMoveBuffer attackMoves;
    movegen::FindAttacks(std::forward<const BoardState>(info.state), m_AttackTable, attackMoves);

    QuietMoveBuffer quietMoves;
    movegen::FindQuiets(std::forward<const BoardState>(info.state), m_AttackTable, quietMoves);

    CombinedMoveBuffer moves;
    OrderMoves(std::forward<const BoardState>(info.state), refutationMove, attackMoves, quietMoves, moves);

    int64_t originalAlpha = info.alpha; // For classifying the node type at the end

    for (Move move : moves) {
        m_NodesSearched++;
        MoveData moveData = MakeMove(move, info.state);
        if (!WasLegal(moveData, info.state)) {
            UnmakeMove(moveData, info.state);
            continue;
        }
        m_NodesEvaluated++;

        int64_t score;

        // Repetition draw check
        info.history.Push(info.state);
        if (info.history.IsRepetition())
            score = 0; // TODO: Contempt?
        else
            score = -Search(SearchInfo::Next(info));
        UnmakeMove(moveData, info.state);
        info.history.Pop();

        if (m_SearchAborted) 
            return 0;

        if (score > max) {
            max = score;
            bestMove = move;

            // Upper bound
            if (score > info.alpha)
                info.alpha = score;
        }

        // Lower bound
        if (score >= info.beta) {
            m_TranspositionTable.Save(info.state, (const TableEntryInfo) {
                .score = max,
                .bestMove = bestMove,
                .depth = info.depth,
                .nodeType = NodeType::LOWER_BOUND
            });
            return max;
        }
    }

    if (max == -INT64_MAX) {
        Bitboard king = info.state.pieces.OccupancyMask(info.state.turn, Piece::KING);
        if (SquareUnderAttack(king, Color::Opposite(info.state.turn), info.state)) 
            max = -MATE_EVAL + info.ply; // Checkmate
        else 
            max = 0; // Stalemate
    }
    
    // Upper bound if raised alpha, else exact
    m_TranspositionTable.Save(info.state, (const TableEntryInfo) {
        .score = max,
        .bestMove = bestMove,
        .depth = info.depth,
        .nodeType = (max > originalAlpha) ? NodeType::EXACT : NodeType::UPPER_BOUND
    });

    return max;
}

int64_t Searcher::Quiesce(QuiesceInfo&& info)
{
    // Only check termination condition every 2048 nodes to save expensive clock calls
    if ((m_NodesSearched & 2047) == 0) {
        auto nowPoint = chrono::high_resolution_clock::now();
        uint64_t nowMs = chrono::time_point_cast<chrono::milliseconds>(nowPoint).time_since_epoch().count();
        if (nowMs >= info.targetMs) {
            m_SearchAborted = true;
            return 0;
        }
    }

    int64_t staticEval = m_Eval.Evaluate(info.state);

    // Stand Pat
    int64_t max = staticEval;
    if (max >= info.beta)
        return max;
    if (max > info.alpha)
        info.alpha = max;

    // Transposition Lookup
    Move refutationMove = Move::Invalid();
    TableEntry lookup = m_TranspositionTable.Get(std::forward<const BoardState>(info.state));
    if (lookup.IsValid()) {
        // Only save refutation move if it is a capture (as this is a quiescence search)
        if (Piece::IsValid(info.state.pieces.PieceInSquare(Color::Opposite(info.state.turn), lookup.bestMove.to)))
            refutationMove = lookup.bestMove;

        m_TranspositionHits++;

        int64_t score = lookup.score;

        if (score > MATE_THRESOLD) 
            score += info.ply;

        if (score < -MATE_THRESOLD) 
            score -= info.ply;

        if (lookup.nodeType == NodeType::LOWER_BOUND)
            info.alpha = std::max(info.alpha, score);

        if (lookup.nodeType == NodeType::UPPER_BOUND)
            info.beta = std::min(info.beta, score);

        if (info.alpha >= info.beta)
            return score;
    }

    AttackMoveBuffer attackMoves;
    movegen::FindAttacks(info.state, m_AttackTable, attackMoves);

    CombinedMoveBuffer moves;
    OrderMoves(std::forward<const BoardState>(info.state), refutationMove, attackMoves, moves);

    const uint8_t phase = m_Eval.GamePhase(std::forward<const BoardState>(info.state)) < 90;

    for (const Move move : moves) {
        // Delta pruning
        if (phase < 85) { // Don't prune in late endgames
            const int64_t DELTA_MARGIN = 200;
            if (!Piece::IsValid(move.promote)) { // Don't prune promotions

                Piece::Value capture = info.state.pieces.PieceInSquare(Color::Opposite(info.state.turn), move.to);
                if (!Piece::IsValid(capture)) // en passant
                    capture = info.state.pieces.PieceInSquare(Color::Opposite(info.state.turn), (info.state.turn == Color::WHITE) ? move.to + 8 : move.to - 8);

                if (staticEval + Piece::Evaluate(capture) + DELTA_MARGIN < info.alpha)
                    continue;
            }
        }

        m_NodesSearched++;
        m_NodesQuiesced++;

        MoveData moveData = MakeMove(move, info.state);
        if (!WasLegal(moveData, info.state)) {
            UnmakeMove(moveData, info.state);
            continue;
        }
        m_NodesEvaluated++;

        int64_t score;

        // Repetition draw check
        info.history.Push(info.state);
        if (info.history.IsRepetition())
            score = 0; // TODO: Contempt?
        else
            score = -Quiesce(QuiesceInfo::Next(info));
        UnmakeMove(moveData, info.state);
        info.history.Pop();

        if (score >= info.beta)
            return score;

        if (score > max)
            max = score;

        if (score > info.alpha)
            info.alpha = score;
    }

    return max;
}

void Searcher::SetTimeControl(uint64_t seconds, uint64_t increment)
{
    m_TimeControlSeconds = seconds;
    m_TimeControlIncrement = increment;
}

MoveData Searcher::MakeMove(Move move, BoardState& state)
{
    Piece::Value capture = state.pieces.PieceInSquare(move.to).second;

    Color::Value friendly = state.turn;
    Color::Value enemy = Color::Opposite(state.turn);

    // For unmaking the move later
    MoveData moveData = {
        .move = move,
        .capture = capture,
        .rights = state.rights,
        .turn = state.turn,
        .enPassantIndex = state.enPassantIndex,
        .halfMoves = state.halfMoves
    };

    // Move piece
    state.pieces.Unset(friendly, move.piece, move.from);
    if (Piece::IsValid(move.promote))
        state.pieces.Set(friendly, move.promote, move.to);
    else
        state.pieces.Set(friendly, move.piece, move.to);

    // Remove capture
    if (Piece::IsValid(capture))
        state.pieces.Unset(enemy, capture, move.to);

    // Move rook if castling
    if (move.piece == Piece::KING && Difference(move.from, move.to) == 2) {
        if (move.from > move.to) {
            state.pieces.Unset(friendly, Piece::ROOK, move.from - 4);
            state.pieces.Set(friendly, Piece::ROOK, move.from - 1);
        } else {
            state.pieces.Unset(friendly, Piece::ROOK, move.from + 3);
            state.pieces.Set(friendly, Piece::ROOK, move.from + 1);
        }
    }

    // Remove pawn if en passant
    if (move.piece == Piece::PAWN && move.to == state.enPassantIndex)
        state.pieces.Unset(enemy, Piece::PAWN, (friendly == Color::WHITE) ? move.to + 8 : move.to - 8);

    // Avoid updating castling rights after both sides lose the right
    if (state.rights > 0) {
        // Remove castling rights if king moved
        if (move.piece == Piece::KING)
            state.rights = 0;

        // Remove castling rights if rook moved from start square
        if (move.piece == Piece::ROOK) {
            if (move.from == (friendly == Color::WHITE ? 63 : 7))
                state.rights &= ~CastlingRight::Kingside(friendly);
            else if (move.from == (friendly == Color::WHITE ? 56 : 0))
                state.rights &= ~CastlingRight::Queenside(friendly);
        }

        // Remove castling rights if rook captured on start square
        if (capture == Piece::ROOK) {
            if (move.to == (enemy == Color::WHITE ? 63 : 7))
                state.rights &= ~CastlingRight::Kingside(enemy);
            else if (move.from == (enemy == Color::WHITE ? 56 : 0))
                state.rights &= ~CastlingRight::Queenside(enemy);
        }
    }

    // Update en passant square if double pawn push
    state.enPassantIndex = UINT8_MAX;
    if (move.piece == Piece::PAWN && Difference(move.from, move.to) == 16)
        state.enPassantIndex = (friendly == Color::WHITE) ? move.to + 8 : move.to - 8;

    state.turn = enemy;
    state.halfMoves++;

    return moveData;
}

void Searcher::UnmakeMove(MoveData moveData, BoardState& state)
{
    const Move& move = moveData.move;

    Color::Value friendly = moveData.turn;
    Color::Value enemy = Color::Opposite(moveData.turn);

    // Replace moving piece
    state.pieces.Set(friendly, move.piece, move.from);
    if (Piece::IsValid(move.promote))
        state.pieces.Unset(friendly, move.promote, move.to);
    else
        state.pieces.Unset(friendly, move.piece, move.to);

    // Replace capture
    if (Piece::IsValid(moveData.capture))
        state.pieces.Set(enemy, moveData.capture, move.to);

    // Replace rook if castling
    if (move.piece == Piece::KING && Difference(move.from, move.to) == 2) {
        if (move.from > move.to) {
            state.pieces.Set(friendly, Piece::ROOK, move.from - 4);
            state.pieces.Unset(friendly, Piece::ROOK, move.from - 1);
        } else {
            state.pieces.Set(friendly, Piece::ROOK, move.from + 3);
            state.pieces.Unset(friendly, Piece::ROOK, move.from + 1);
        }
    }

    // Replace pawn if en passant
    if (move.piece == Piece::PAWN && move.to == moveData.enPassantIndex)
        state.pieces.Set(enemy, Piece::PAWN, (friendly == Color::WHITE) ? move.to + 8 : move.to - 8);

    // Update variables
    state.rights = moveData.rights;
    state.turn = moveData.turn;
    state.enPassantIndex = moveData.enPassantIndex;
    state.halfMoves = moveData.halfMoves;
}

bool Searcher::SquareUnderAttack(uint64_t bit, Color::Value color, const BoardState& state)
{
    uint8_t index = _tzcnt_u64(bit);
    Color::Value enemy = Color::Opposite(color);
    Bitboard occupancy = state.pieces.OccupancyMask();

    // Pawns
    {
        Bitboard attacks = m_AttackTable.GetAttacks(index, Piece::PAWN, enemy, occupancy);
        if (attacks & state.pieces.OccupancyMask(color, Piece::PAWN))
            return true;
    }

    // Knights
    {
        Bitboard attacks = m_AttackTable.GetAttacks(index, Piece::KNIGHT, enemy, occupancy);
        if (attacks & state.pieces.OccupancyMask(color, Piece::KNIGHT))
            return true;
    }

    // Bishops
    {
        Bitboard attacks = m_AttackTable.GetAttacks(index, Piece::BISHOP, enemy, occupancy);
        if (attacks & state.pieces.OccupancyMask(color, Piece::BISHOP))
            return true;
    }

    // Rooks
    {
        Bitboard attacks = m_AttackTable.GetAttacks(index, Piece::ROOK, enemy, occupancy);
        if (attacks & state.pieces.OccupancyMask(color, Piece::ROOK))
            return true;
    }

    // Queens
    {
        Bitboard attacks = m_AttackTable.GetAttacks(index, Piece::QUEEN, enemy, occupancy);
        if (attacks & state.pieces.OccupancyMask(color, Piece::QUEEN))
            return true;
    }

    // Kings
    {
        Bitboard attacks = m_AttackTable.GetAttacks(index, Piece::KING, enemy, occupancy);
        if (attacks & state.pieces.OccupancyMask(color, Piece::KING))
            return true;
    }

    return false;
}

bool Searcher::WasLegal(MoveData moveData, const BoardState& state)
{
    Bitboard king = state.pieces.OccupancyMask(moveData.turn, Piece::KING);

    bool targetAttacked = SquareUnderAttack(king, Color::Opposite(moveData.turn), std::forward<const BoardState>(state));

    // Check intermediate and start squares if castling
    if (moveData.move.piece == Piece::KING && Difference(moveData.move.from, moveData.move.to) == 2) {
        bool startAttacked = SquareUnderAttack(1ul << moveData.move.from, Color::Opposite(moveData.turn), std::forward<const BoardState>(state));
        uint8_t midIndex = (moveData.move.from > moveData.move.to) ? moveData.move.from - 1 : moveData.move.from + 1;
        bool midAttacked = SquareUnderAttack(1ul << midIndex, Color::Opposite(moveData.turn), std::forward<const BoardState>(state));

        return !(targetAttacked || startAttacked || midAttacked);
    }

    return !targetAttacked;
}

void Searcher::OrderMoves(const BoardState& state, Move bestMove, const AttackMoveBuffer& attacks, CombinedMoveBuffer& ordered)
{
    if (Move::IsValid(bestMove))
        ordered.PushBack(bestMove);

    Buffer<Move, 50> badAttacks;
    for (const Move move : attacks) {
        if (move == bestMove)
            continue;

        int64_t see = SEE(move, std::forward<const BoardState>(state));
        if (see > 0)
            ordered.PushBack(move);
        else 
            badAttacks.PushBack(move);
    }

    for (const Move move : badAttacks) {
        ordered.PushBack(move);
    }
}

void Searcher::OrderMoves(const BoardState& state, Move bestMove, const AttackMoveBuffer& attacks, const QuietMoveBuffer& quiets, CombinedMoveBuffer& ordered)
{
    if (Move::IsValid(bestMove))
        ordered.PushBack(bestMove);

    Buffer<Move, 50> badAttacks;
    for (const Move move : attacks) {
        if (move == bestMove)
            continue;

        int64_t see = SEE(move, std::forward<const BoardState>(state));
        if (see > 0)
            ordered.PushBack(move);
        else 
            badAttacks.PushBack(move);
    }

    for (const Move move : quiets) {
        if (move == bestMove)
            continue;

        ordered.PushBack(move);
    }

    for (const Move move : badAttacks) {
        ordered.PushBack(move);
    }
}

int64_t Searcher::SEE(Move move, const BoardState& state)
{
    BitboardSet pieces(state.pieces);
    Color::Value enemy = Color::Opposite(state.turn);

    // Simulate first capture
    Piece::Value firstCapture = pieces.PieceInSquare(enemy, move.to);
    if (!Piece::IsValid(firstCapture)) // en passant
        firstCapture = pieces.PieceInSquare(enemy, (enemy == Color::WHITE) ? move.to - 8 : move.to + 8);
    pieces.Unset(enemy, firstCapture, move.to);
    pieces.Unset(state.turn, move.piece, move.from);
    pieces.Set(state.turn, move.piece, move.to);

    Buffer<int64_t, 16> gain;
    gain.PushBack(Piece::Evaluate(firstCapture));

    // TODO: Don't recalculate attackers at each iteration, just update the bitboards 
    //       iteratively at each step. Then only sliders need recalculation (in case of discovery).

    Color::Value turn = enemy;
    Piece::Value target = move.piece;
    while (true) {
        Color::Value opponentTurn = Color::Opposite(turn);

        // Find attackers
        Bitboard attackers[Color::MAX_ENUM][Piece::MAX_ENUM];
        for (uint8_t i = Color::WHITE; i < Color::MAX_ENUM; i++) {
            Color::Value friendly = static_cast<Color::Value>(i);
            Color::Value opponent = Color::Opposite(friendly);
            for (uint8_t j = Piece::PAWN; j < Piece::MAX_ENUM; j++) {
                Piece::Value piece = static_cast<Piece::Value>(j);
                attackers[friendly][piece] = m_AttackTable.GetAttacks(move.to, piece, opponent, pieces.OccupancyMask()) & pieces.OccupancyMask(friendly, piece);
            }
        }

        // Find least valuable attacker
        uint8_t from = UINT8_MAX;
        Piece::Value attacker = Piece::Invalid();
        for (uint8_t i = Piece::PAWN; i < Piece::MAX_ENUM; i++) {
            Bitboard attackerOccupancy = attackers[turn][i];
            if (attackerOccupancy) {
                from = _tzcnt_u64(attackerOccupancy);
                attacker = static_cast<Piece::Value>(i);
                attackers[turn][i] &= (attackerOccupancy - 1);
                break;
            }
        }
        if (!Piece::IsValid(attacker))
            break;

        // Update gain
        gain.PushBack(Piece::Evaluate(target) - gain[gain.Size() - 1]);

        // Simulate capture
        pieces.Unset(turn, attacker, from);
        pieces.Unset(opponentTurn, target, move.to);
        pieces.Set(turn, attacker, move.to);

        // Swap turn
        target = attacker;
        turn = Color::Opposite(turn);
    }

    // Traverse gain
    for (int8_t i = static_cast<int8_t>(gain.Size()) - 1; i > 0; i--)
        gain[i - 1] = -std::max(-gain[i - 1], gain[i]);

    return gain[0];
}
