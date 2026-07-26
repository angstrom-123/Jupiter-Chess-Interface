#!/usr/bin/env python3

from libjupiter import Board

# ========== Create a board ==========

# Start Position
# board: Board = Board()

# Alternatively Arbitrary FEN
board: Board = Board("k7/8/8/8/3R4/8/8/K7 w - - 0 1")

# ========== Check for errors ==========

if board.has_error():
    error = board.get_error()
    print(error)
    exit(1)

# ========== Set Time Control ==========

# Time control
increment: int = 1
seconds: int = 30
board.set_time_control(seconds, increment)

# ========== Search for best move ==========

# 10 seconds left
time_remaining_ms: int = 10000

# Long algebraic notation (e.g. e2e4)
best_move: str = board.go(time_remaining_ms)
print(f"Best Move: {best_move}")

# ========== Update Board State ==========

print(f"\nBefore:\n\n{repr(board)}")

board.make_move(best_move)

print(f"\nAfter:\n\n{repr(board)}")
