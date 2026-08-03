#pragma once

#include "boardState.h"
#include "move.h"
#include "zobrist.h"

struct NodeType {
    typedef enum : uint8_t {
        UPPER_BOUND = 0,    // alpha cutoff
        LOWER_BOUND = 1,    // beta cutoff
        EXACT = 2           // no cutoff
    } Value;

    static const char *Show(Value value) 
    {
        switch (value) {
            case UPPER_BOUND: return "Upper Bound";
            case LOWER_BOUND: return "Lower Bound";
            case EXACT: return "Exact";
        }
    }
};

struct TableEntry {
    ZobristKey hash;
    int64_t score;
    Move bestMove;
    uint8_t depth;
    NodeType::Value nodeType;
    uint16_t age;

    bool IsValid() const { return hash > 0; }
    static TableEntry Invalid() { return TableEntry{}; }
};

struct TableEntryInfo {
    int64_t score;
    Move bestMove;
    uint8_t depth;
    NodeType::Value nodeType;
};

constexpr uint8_t TRANSPOSITION_TABLE_KEY_BITS = 17;
constexpr std::size_t TRANSPOSITION_TABLE_SIZE = 1ul << TRANSPOSITION_TABLE_KEY_BITS;

class TranspositionTable {
public:
    TranspositionTable(Zobrist& zobrist);
    ~TranspositionTable();

    std::size_t OccupiedMiB() const;
    TableEntry Get(const BoardState& state) const;
    TableEntry Get(ZobristKey key) const;
    void Save(const BoardState& state, const TableEntryInfo&& info);

private:
    uint64_t Index(ZobristKey key) const;

private:
    Zobrist& m_Zobrist;
    std::size_t m_Occupancy{0};
    TableEntry *m_Table{nullptr};
};
