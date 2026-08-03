#pragma once

#include "zobrist.h"
#include "buffer.h"

class History {
public:
    History(Zobrist& zobrist)
        : m_Zobrist{zobrist} {}

    bool IsRepetition();
    void Push(const BoardState& state);
    void Pop();

private:
    Buffer<ZobristKey, 512> m_History;
    Zobrist& m_Zobrist;
};
