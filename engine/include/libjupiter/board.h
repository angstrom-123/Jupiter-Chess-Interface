#pragma once

#include <cstdint>
#include <string>

#include "boardState.h"
#include "core.h"
#include "move.h"
#include "searcher.h"
#include "history.h"

namespace libjupiter {
    class Board {
    public:
        Board(const char *fen);
        void SetTimeControl(uint64_t seconds, uint64_t increment);
        Move Go(uint64_t moveMs);
        void MakeMove(LongAlgebraicMove lan);
        bool HasError();
        const char *GetError();
        void Show(std::string& result);

    private:
        void Clear();
        bool SplitFEN(const char *fen, uint64_t length, FenView (&views)[13]);

    private:
        EngineState::Value m_InternalState{EngineState::OK};
        Zobrist m_Zobrist;
        History m_History;
        Searcher m_Searcher;
        BoardState m_State;
        uint64_t m_FullMoves{1};
    };
}
