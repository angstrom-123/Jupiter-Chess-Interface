#include "transpositionTable.h"
#include <cstring>

TranspositionTable::TranspositionTable(Zobrist& zobrist)
    : m_Zobrist{zobrist}
{
    m_Table = new TableEntry[TRANSPOSITION_TABLE_SIZE];
    std::memset(m_Table, 0, TRANSPOSITION_TABLE_SIZE * sizeof(TableEntry));
}

TranspositionTable::~TranspositionTable()
{
    delete[] m_Table;
}

std::size_t TranspositionTable::OccupiedMiB() const 
{
    return static_cast<float>(m_Occupancy * sizeof(TableEntry)) / (1024.0 * 1024.0);
}

TableEntry TranspositionTable::Get(const BoardState& state) const
{
    uint64_t key = m_Zobrist.ComputeKey(std::forward<const BoardState>(state));
    return Get(key);
}

TableEntry TranspositionTable::Get(ZobristKey key) const
{
    uint64_t index = Index(key);
    TableEntry entry = m_Table[index];
    if (entry.hash == key)
        return entry;
    return TableEntry::Invalid();
}

void TranspositionTable::Save(const BoardState& state, const TableEntryInfo&& info)
{
    ZobristKey key = m_Zobrist.ComputeKey(std::forward<const BoardState>(state));
    uint64_t index = Index(key);

    const TableEntry& oldEntry = m_Table[index];
    const TableEntry& newEntry = {
        .hash = key,
        .score = info.score,
        .bestMove = info.bestMove,
        .depth = info.depth,
        .nodeType = info.nodeType,
        .age = static_cast<uint16_t>(state.halfMoves) // Theoretically not enough bits but it's ok
    };

    if (!oldEntry.IsValid()) {                      // Fresh position
        m_Table[index] = newEntry;
        m_Occupancy++;
    } else if (newEntry.hash == oldEntry.hash) {    // Repeat position
        if (newEntry.depth >= oldEntry.depth || newEntry.nodeType >= oldEntry.nodeType)
            m_Table[index] = newEntry;
    } else {                                        // Collision
        int64_t oldValue = oldEntry.depth * 1'000 - oldEntry.age;
        int64_t newValue = newEntry.depth * 1'000 - newEntry.age;
        if (newValue > oldValue)
            m_Table[index] = newEntry;
    }
}

uint64_t TranspositionTable::Index(ZobristKey key) const 
{
    return key & (TRANSPOSITION_TABLE_SIZE - 1);
}
