from framework import BaseEngine, TimeControl
from src.board import Board, Move

class EngineWrapper:
    def __init__(self, engine: BaseEngine):
        self._board: Board = Board();
        self._engine: BaseEngine = engine;

    def init(self, tc: TimeControl, fen: str | None = None) -> None:
        self._engine.init(tc, fen)
        self._board = Board(fen);

    def go(self, ms_left: int) -> str | None:
        return self._engine.go(ms_left)

    def move(self, lan: str) -> None:
        try:
            move: Move = Move.from_lan(self._board.get_state(), lan)
        except:
            raise ValueError(f"Engine generated invalid lan string: '{lan}'")

        if not self._board.is_legal_move(move):
            raise ValueError(f"Engine generated illegal move: '{lan}'")

        self._engine.move(lan)
        _ = self._board.make_move(move)

    def game_over(self) -> None:
        self._engine.game_over()

    def show(self) -> str:
        return self._engine.show()
