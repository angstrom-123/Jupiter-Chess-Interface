#include <charconv>
#include <cstring>
#include <immintrin.h>
#include <iostream>
#include <sstream>
#include <string>

#include "libjupiter/board.h"
#include "core.h"
#include "move.h"
#include "zobrist.h"

namespace libjupiter {
    Board::Board(const char *fen)
        : m_Zobrist{Zobrist()}, m_History{m_Zobrist}, m_Searcher{m_Zobrist}
    {
        if (fen == nullptr)
        {
            m_State.pieces.StartPos();
            m_State.rights = CastlingRight::KINGSIDE_BLACK | 
                CastlingRight::KINGSIDE_WHITE |
                CastlingRight::QUEENSIDE_BLACK |
                CastlingRight::QUEENSIDE_WHITE,
            m_State.turn = Color::WHITE;
            m_State.enPassantIndex = UINT8_MAX;
            m_State.halfMoves = 0;
            return;
        }

        Clear();
        uint64_t length = std::strlen(fen);

        // Split at delimiters and initial validation
        FenView views[13];
        if (!SplitFEN(fen, length, views)) {
            m_InternalState = EngineState::ERROR_MALFORMED_FEN_STRING;
            return;
        }

        // Read piece positions
        {
            uint64_t boardIndex = 0;
            for (uint64_t i = 0; i < 8; i++) {
                const FenView& v = views[i];
                for (uint64_t j = v.start; j < v.end; j++) {
                    if (boardIndex >= 64) {
                        m_InternalState = EngineState::ERROR_BAD_FEN_POSITIONS;
                        return;
                    }

                    char c = fen[j];
                    Color::Value color = (c > 'Z') ? Color::BLACK : Color::WHITE;
                    switch (c) {
                        case '1'...'8':
                            boardIndex += c - '0' - 1; // -1 because board index increments later too
                            break;
                        case 'p': case 'P':
                            m_State.pieces.Set(color, Piece::PAWN, boardIndex);
                            break;
                        case 'n': case 'N':
                            m_State.pieces.Set(color, Piece::KNIGHT, boardIndex);
                            break;
                        case 'b': case 'B':
                            m_State.pieces.Set(color, Piece::BISHOP, boardIndex);
                            break;
                        case 'r': case 'R':
                            m_State.pieces.Set(color, Piece::ROOK, boardIndex);
                            break;
                        case 'q': case 'Q':
                            m_State.pieces.Set(color, Piece::QUEEN, boardIndex);
                            break;
                        case 'k': case 'K':
                            m_State.pieces.Set(color, Piece::KING, boardIndex);
                            break;
                        default:
                            m_InternalState = EngineState::ERROR_BAD_FEN_POSITIONS;
                            return;
                    }
                    boardIndex++;
                }
            }
        }

        // Read color to move 
        {
            const FenView& v = views[8];
            if (v.end - v.start > 1) {
                m_InternalState = EngineState::ERROR_BAD_FEN_ACTIVE_COLOR;
                return;
            }

            if (fen[v.start] == 'w') {
                m_State.turn = Color::WHITE;
            } else if (fen[v.start] == 'b') {
                m_State.turn = Color::BLACK;
            } else {
                m_InternalState = EngineState::ERROR_BAD_FEN_ACTIVE_COLOR;
                return;
            }
        }

        // Read castling rights
        {
            const FenView& v = views[9];
            m_State.rights = 0;

            if (v.end - v.start == 1) {
                if (fen[v.start] != '-') {
                    m_InternalState = EngineState::ERROR_BAD_FEN_CASTLING_RIGHTS;
                    return;
                }
            } else {
                for (uint64_t i = v.start; i < v.end; i++) {
                    char c = fen[i];
                    switch (c) {
                        case 'K':
                            m_State.rights |= CastlingRight::KINGSIDE_WHITE;
                            break;
                        case 'k':
                            m_State.rights |= CastlingRight::KINGSIDE_BLACK;
                            break;
                        case 'Q':
                            m_State.rights |= CastlingRight::QUEENSIDE_WHITE;
                            break;
                        case 'q':
                            m_State.rights |= CastlingRight::QUEENSIDE_BLACK;
                            break;
                        default:
                            m_InternalState = EngineState::ERROR_BAD_FEN_CASTLING_RIGHTS;
                            return;
                    }
                }
            }
        }

        // Read en-passant square
        {
            const FenView& v = views[10];
            if (v.end - v.start == 1 && fen[v.start] == '-') {
                m_State.enPassantIndex = UINT8_MAX;
            } else if (v.end - v.start == 2) {
                char first = fen[v.start];
                char second = fen[v.start + 1];
                if (first < 'a' || first > 'h' || second < '1' || second > '8') {
                    m_InternalState = EngineState::ERROR_BAD_FEN_EN_PASSANT_SQUARE;
                    return;
                }
                m_State.enPassantIndex = first - 'a' + 8 * (8 - (second - '1'));
            } else {
                m_InternalState = EngineState::ERROR_BAD_FEN_EN_PASSANT_SQUARE;
                return;
            }
        }

        // Read half-move counter 
        {
            const FenView& v = views[11];
            auto res = std::from_chars(&fen[v.start], &fen[v.end], m_State.halfMoves);
            if (res.ec != std::errc()) {
                m_InternalState = EngineState::ERROR_BAD_FEN_HALF_MOVE_COUNTER;
                return;
            }
        }

        // Read full-move counter 
        {
            const FenView& v = views[12];
            auto res = std::from_chars(&fen[v.start], &fen[v.end], m_FullMoves);
            if (res.ec != std::errc()) {
                m_InternalState = EngineState::ERROR_BAD_FEN_FULL_MOVE_COUNTER;
                return;
            }
        }

        // Save initial board state to history
        m_History.Push(m_State);
    }

    void Board::SetTimeControl(uint64_t seconds, uint64_t increment)
    {
        m_Searcher.SetTimeControl(seconds, increment);
    }

    Move Board::Go(uint64_t moveMs)
    {
        // TODO: Draw by repetition, 50-move rule

        Move bestMove = m_Searcher.FindBest(m_State, m_History, moveMs);
        if (!Move::IsValid(bestMove))
            m_InternalState = EngineState::ERROR_COULDNT_FIND_MOVE;

        return bestMove;
    }

    void Board::MakeMove(LongAlgebraicMove lan)
    {
        Move move = Move::FromLAN(lan, m_State.pieces);
        if (!Move::IsValid(move)) {
            m_InternalState = EngineState::ERROR_MALFORMED_LAN_STRING;
            return;
        }

        m_Searcher.MakeMove(move, m_State);
        m_History.Push(m_State);

        if (m_State.turn == Color::WHITE)
            m_FullMoves++;

        m_InternalState = EngineState::OK;
    }

    bool Board::HasError()
    {
        return m_InternalState >= EngineState::ERROR;
    }

    const char *Board::GetError()
    {
        switch (m_InternalState) {
            case EngineState::ERROR_MALFORMED_FEN_STRING:
                return "Malformed FEN string";
            case EngineState::ERROR_BAD_FEN_POSITIONS:
                return "Bad piece positions in FEN string";
            case EngineState::ERROR_BAD_FEN_ACTIVE_COLOR:
                return "Bad active color in FEN string";
            case EngineState::ERROR_BAD_FEN_CASTLING_RIGHTS:
                return "Bad castling rights in FEN string";
            case EngineState::ERROR_BAD_FEN_EN_PASSANT_SQUARE:
                return "Bad en passant square in FEN string";
            case EngineState::ERROR_BAD_FEN_HALF_MOVE_COUNTER:
                return "Bad half-move counter in FEN string";
            case EngineState::ERROR_BAD_FEN_FULL_MOVE_COUNTER:
                return "Bad full-move counter in FEN string";
            case EngineState::ERROR_MALFORMED_LAN_STRING:
                return "Malformed LAN string";
            case EngineState::ERROR_COULDNT_FIND_MOVE:
                return "Couldn't find move";
            default:
                return nullptr;
        }
    }

    void Board::Show(std::string& result)
    {
        std::ostringstream ss;
        ss << "Move " << m_FullMoves << std::endl
            << (m_State.turn == Color::BLACK ? "Black" : "White") << " to move" << std::endl
            << "Castling rights: " << std::endl
            << "    White long: " << ((m_State.rights & CastlingRight::QUEENSIDE_WHITE) ? "true" : "false")
            << ", short: " << ((m_State.rights & CastlingRight::KINGSIDE_WHITE) ? "true" : "false") << std::endl
            << "    Black long: " << ((m_State.rights & CastlingRight::QUEENSIDE_BLACK) ? "true" : "false")
            << ", short: " << ((m_State.rights & CastlingRight::KINGSIDE_BLACK) ? "true" : "false") << std::endl
            << "Board: ";

        const char symbols[Color::MAX_ENUM][Piece::MAX_ENUM] = {
            { 'P', 'N', 'B', 'R', 'Q', 'K' },
            { 'p', 'n', 'b', 'r', 'q', 'k' }
        };

        for (uint64_t i = 0; i < 64; i++) {
            if (i % 8 == 0)
                ss << std::endl << "    ";
            
            const auto [color, piece] = m_State.pieces.PieceInSquare(i);
            if (Color::IsValid(color) && Piece::IsValid(piece))
                ss << symbols[color][piece] << ' ';
            else
                ss << ". ";
        }
        result = ss.str();
    }

    void Board::Clear()
    {
        m_InternalState = EngineState::OK;
        m_State.pieces = BitboardSet{};
        m_State.rights = CastlingRights{};
        m_State.turn = Color::WHITE;
        m_State.enPassantIndex = UINT8_MAX;
        m_State.halfMoves = 0;
        m_FullMoves = 1;
    }

    bool Board::SplitFEN(const char *fen, uint64_t length, FenView (&views)[13]) 
    {
        // Verify that the string is well formed
        uint64_t spaceCounter = 0;
        uint64_t slashCounter = 0;
        for (uint64_t i = 0; i < length; i++) {
            char c = fen[i];
            switch (c) {
                case ' ':
                    spaceCounter++;
                    break;
                case '/':
                    slashCounter++;
                    break;
                case 'p': case 'P':
                case 'n': case 'N':
                case 'b': case 'B':
                case 'r': case 'R':
                case 'q': case 'Q':
                case 'k': case 'K':
                case 'w': case '-':
                case '0'...'9':
                    break;
                default:
                    return false;
            }
        }
        if (spaceCounter != 5 || slashCounter != 7)
            return false;

        // Split at delimiting characters (spaces and forward slashes)
        uint64_t viewCounter = 0;
        uint64_t start = 0;
        for (uint64_t end = 1; end < length; end++) {
            if (fen[end] == ' ' || fen[end] == '/') {
                views[viewCounter++] = { start, end };
                start = end + 1;
            }
        }
        views[viewCounter++] = { start, length };
        if (viewCounter != 13)
            return false;

        return true;
    }
}
