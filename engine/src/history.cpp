#include "history.h"

bool History::IsRepetition()
{
    ZobristKey current = m_History[m_History.Size() - 1];
    for (int64_t i = m_History.Size() - 2; i >= 0; i--) {
        if (m_History[i] == current)
            return true;
    }
    return false;
}

void History::Push(const BoardState& state)
{
    m_History.PushBack(m_Zobrist.ComputeKey(std::forward<const BoardState>(state)));
}

void History::Pop()
{
    m_History.PopBack();
}
