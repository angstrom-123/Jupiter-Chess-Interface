#pragma once

#include "exception.h"
#include <cstdint>
#include <cstdlib>

uint8_t ToIndex(uint8_t x, uint8_t y);
uint8_t Difference(uint8_t a, uint8_t b);

struct EngineState {
    typedef enum : uint8_t {
        OK,
        ERROR,
        ERROR_MALFORMED_FEN_STRING,
        ERROR_BAD_FEN_POSITIONS,
        ERROR_BAD_FEN_ACTIVE_COLOR,
        ERROR_BAD_FEN_CASTLING_RIGHTS,
        ERROR_BAD_FEN_EN_PASSANT_SQUARE,
        ERROR_BAD_FEN_HALF_MOVE_COUNTER,
        ERROR_BAD_FEN_FULL_MOVE_COUNTER,
        ERROR_MALFORMED_LAN_STRING,
        ERROR_COULDNT_FIND_MOVE
    } Value;
};

struct Color {
    typedef enum : uint8_t {
        WHITE,
        BLACK,
        MAX_ENUM
    } Value;

    static Value Invalid() { return Value::MAX_ENUM; }
    static bool IsValid(Value value) { return value < Value::MAX_ENUM; }
    static Value Opposite(Value value) 
    { 
        switch (value) {
            case Value::WHITE: return Value::BLACK;
            case Value::BLACK: return Value::WHITE;
            default: throw Exception("Getting opposite of invalid colour.");
        }
    }
};

struct Piece {
    typedef enum : uint8_t {
        PAWN,
        KNIGHT,
        BISHOP,
        ROOK,
        QUEEN,
        KING,
        MAX_ENUM
    } Value;

    static Value Invalid() { return Value::MAX_ENUM; }
    static bool IsValid(Value value) { return value < Value::MAX_ENUM; }
    static const char *Show(Value value)
    {
        switch (value) {
            case PAWN: return "Pawn";
            case KNIGHT: return "Knight";
            case BISHOP: return "Bishop";
            case ROOK: return "Rook";
            case QUEEN: return "Queen";
            case KING: return "King";
            default: return "None";
        }
    }
    static int64_t Evaluate(Value value) 
    {
        switch (value) {
            case PAWN: return 100;
            case KNIGHT: return 300;
            case BISHOP: return 310;
            case ROOK: return 500;
            case QUEEN: return 975;
            case KING: return 0;
            default: throw Exception("Evaluating invalid piece.");
        }
    }
};

using CastlingRights = uint8_t;
struct CastlingRight {
    typedef enum : uint8_t {
        KINGSIDE_WHITE = 0x1,
        KINGSIDE_BLACK = 0x2,
        QUEENSIDE_WHITE = 0x4,
        QUEENSIDE_BLACK = 0x8,
    } Value;
    static Value Kingside(Color::Value color)
    {
        switch (color) {
            case Color::WHITE: return KINGSIDE_WHITE;
            case Color::BLACK: return KINGSIDE_BLACK;
            default: throw Exception("Getting kingside castling right for invalid colour.");
        }
    }
    static Value Queenside(Color::Value color)
    {
        switch (color) {
            case Color::WHITE: return QUEENSIDE_WHITE;
            case Color::BLACK: return QUEENSIDE_BLACK;
            default: throw Exception("Getting queenside castling right for invalid colour.");
        }
    }
};

struct FenView {
    uint64_t start;
    uint64_t end;
};
