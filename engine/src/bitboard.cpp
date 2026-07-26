#include "bitboard.h"
#include <popcntintrin.h>

void BitboardSet::StartPos()
{
    m_Bits[Color::WHITE][Piece::PAWN]   = 0b00000000'11111111'00000000'00000000'00000000'00000000'00000000'00000000;
    m_Bits[Color::WHITE][Piece::KNIGHT] = 0b01000010'00000000'00000000'00000000'00000000'00000000'00000000'00000000;
    m_Bits[Color::WHITE][Piece::BISHOP] = 0b00100100'00000000'00000000'00000000'00000000'00000000'00000000'00000000;
    m_Bits[Color::WHITE][Piece::ROOK]   = 0b10000001'00000000'00000000'00000000'00000000'00000000'00000000'00000000;
    m_Bits[Color::WHITE][Piece::QUEEN]  = 0b00001000'00000000'00000000'00000000'00000000'00000000'00000000'00000000;
    m_Bits[Color::WHITE][Piece::KING]   = 0b00010000'00000000'00000000'00000000'00000000'00000000'00000000'00000000;

    m_Bits[Color::BLACK][Piece::PAWN]   = 0b00000000'00000000'00000000'00000000'00000000'00000000'11111111'00000000;
    m_Bits[Color::BLACK][Piece::KNIGHT] = 0b00000000'00000000'00000000'00000000'00000000'00000000'00000000'01000010;
    m_Bits[Color::BLACK][Piece::BISHOP] = 0b00000000'00000000'00000000'00000000'00000000'00000000'00000000'00100100;
    m_Bits[Color::BLACK][Piece::ROOK]   = 0b00000000'00000000'00000000'00000000'00000000'00000000'00000000'10000001;
    m_Bits[Color::BLACK][Piece::QUEEN]  = 0b00000000'00000000'00000000'00000000'00000000'00000000'00000000'00001000;
    m_Bits[Color::BLACK][Piece::KING]   = 0b00000000'00000000'00000000'00000000'00000000'00000000'00000000'00010000;

    m_Combined[Color::WHITE] = 0b11111111'11111111'00000000'00000000'00000000'00000000'00000000'00000000;
    m_Combined[Color::BLACK] = 0b00000000'00000000'00000000'00000000'00000000'00000000'11111111'11111111;
}

void BitboardSet::Set(Color::Value color, Piece::Value piece, uint8_t index)
{
    uint64_t bit = 1ul << index;
    m_Bits[color][piece] |= bit;
    m_Combined[color] |= bit;
}

void BitboardSet::Unset(Color::Value color, Piece::Value piece, uint8_t index)
{
    uint64_t bit = 1ul << index;
    m_Bits[color][piece] &= ~bit;
    m_Combined[color] &= ~bit;
}

void BitboardSet::UnsetAll(Color::Value color, uint8_t index)
{
    uint64_t bit = 1ul << index;
    if (m_Combined[color] & bit) {
        m_Bits[color][Piece::PAWN] &= ~bit;
        m_Bits[color][Piece::KNIGHT] &= ~bit;
        m_Bits[color][Piece::BISHOP] &= ~bit;
        m_Bits[color][Piece::ROOK] &= ~bit;
        m_Bits[color][Piece::QUEEN] &= ~bit;
        m_Bits[color][Piece::KING] &= ~bit;
        m_Combined[color] &= ~bit;
    }
}

void BitboardSet::Clear()
{
    for (auto& board : m_Bits[Color::WHITE]) 
        board = 0ul;

    for (auto& board : m_Bits[Color::BLACK])
        board = 0ul;
}

bool BitboardSet::Has(Color::Value color, Piece::Value piece, uint8_t index) const
{
    uint64_t bit = 1ul << index;
    return m_Bits[color][piece] & bit;
}

bool BitboardSet::Has(Color::Value color, uint8_t index) const
{
    uint64_t bit = 1ul << index;
    return m_Combined[color] & bit;
}

bool BitboardSet::Has(uint8_t index) const
{
    uint64_t bit = 1ul << index;
    return (m_Combined[Color::WHITE] | m_Combined[Color::BLACK]) & bit;
}

uint8_t BitboardSet::Count(Color::Value color, Piece::Value piece) const 
{
    return _mm_popcnt_u64(m_Bits[color][piece]);
}

Piece::Value BitboardSet::PieceInSquare(Color::Value color, uint8_t index) const 
{
    if (Has(index)) {
        uint64_t bit = 1ul << index;
        for (uint8_t piece = 0; piece < Piece::MAX_ENUM; piece++) {
            if (m_Bits[color][piece] & bit)
                return static_cast<Piece::Value>(piece);
        }
    }
    return Piece::Invalid();
}

std::pair<Color::Value, Piece::Value> BitboardSet::PieceInSquare(uint8_t index) const
{
    if (Has(index)) {
        uint64_t bit = 1ul << index;
        for (uint8_t color = 0; color < Color::MAX_ENUM; color++) {
            for (uint8_t piece = 0; piece < Piece::MAX_ENUM; piece++) {
                if (m_Bits[color][piece] & bit)
                    return std::make_pair(static_cast<Color::Value>(color), static_cast<Piece::Value>(piece));
            }
        }
    }
    return std::make_pair(Color::Invalid(), Piece::Invalid());
}

Bitboard BitboardSet::OccupancyMask(Color::Value color, Piece::Value piece) const
{
    return m_Bits[color][piece];
}

Bitboard BitboardSet::OccupancyMask(Color::Value color) const
{
    return m_Combined[color];
}

Bitboard BitboardSet::OccupancyMask() const
{
    return m_Combined[Color::WHITE] | m_Combined[Color::BLACK];
}
