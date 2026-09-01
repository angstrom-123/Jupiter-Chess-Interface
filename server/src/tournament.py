from enum import Enum
import subprocess
import time

from pathlib import Path
from collections.abc import AsyncGenerator

from src.board import Board, GameOverReason, Move
from src.board_state import Color, opposite_color, show_color
from framework import BaseEngine, TimeControl
from src.loader import Loader

class TournamentEvent(Enum):
    INTERNAL_SUCCESS = 0 
    INTERNAL_FAILURE = 1 

    GAME_START = 10
    GAME_END = 11 
    MOVE = 12
    ERROR = 13
    TOURNAMENT_END = 14

class TournamentUpdate:
    event: TournamentEvent
    winner: Color | None
    white_ms: int | None
    black_ms: int | None
    move: str | None
    swapped: bool | None
    reason: GameOverReason | None

    def __init__(
        self, 
        event: TournamentEvent, 
        white_ms: int | None = None, 
        black_ms: int | None = None,
        move: str | None = None,
        winner: Color | None = None,
        swapped: bool | None = None,
        reason: GameOverReason | None = None,
    ):
        self.event = event 
        self.white_ms = white_ms 
        self.black_ms = black_ms 
        self.move = move
        self.winner = winner
        self.swapped = swapped
        self.reason = reason

TournamentStream = AsyncGenerator[TournamentUpdate]

class TournamentResults:
    wins_1: int = 0
    wins_2: int = 0
    draws: int = 0
    failures: list[list[Move]] = []
    reasons: list[GameOverReason] = []

class TournamentTimer:
    def __init__(self, tc: TimeControl):
        self._white_ms: int = tc.seconds * 1000
        self._black_ms: int = tc.seconds * 1000 
        self._incremenent_ms: int = tc.increment * 1000
        self._start_ms: int = 0
        self._is_white: bool = True

    def start(self):
        self._start_ms = time.perf_counter_ns() // 1_000_000

    def ms_left(self, color: Color) -> int:
       return self._white_ms if color is Color.WHITE else self._black_ms

    def swap(self):
        now_ms: int = time.perf_counter_ns() // 1_000_000
        delta_ms: int = now_ms - self._start_ms
        self._start_ms = now_ms
        if self._is_white:
            self._white_ms -= (delta_ms - self._incremenent_ms)
        else:
            self._black_ms -= (delta_ms - self._incremenent_ms) 
        self._is_white = not self._is_white

class TournamentRunner:
    _engine_1: BaseEngine
    _process_1: subprocess.Popen[bytes]
    _engine_2: BaseEngine
    _process_2: subprocess.Popen[bytes]
    _interrupted: bool = False

    def __init__(
        self,
        loader: Loader,
        white_engine_path: Path,
        black_engine_path: Path,
        tc: TimeControl,
        count: int
    ):
        self._engine_1, self._process_1 = loader.launch_engine(white_engine_path)
        self._engine_2, self._process_2 = loader.launch_engine(black_engine_path)
        self._tc: TimeControl = tc 
        self._count: int = count
        self._results: TournamentResults = TournamentResults()

    def interrupt(self):
        self._interrupted = True 

    def is_interrupted(self) -> bool:
        return self._interrupted

    def get_results(self) -> TournamentResults:
        return self._results

    async def run_no_stream(self) -> TournamentResults:
        async for s in self.run():
            pass
        return self._results

    async def run(self) -> TournamentStream:
        if self._count <= 0:
            raise ValueError("Tournament game count must be positive")

        print(f"Running tournament for {self._count} games")
        try:
            for i in range(self._count):
                swap: bool = i >= self._count // 2

                yield TournamentUpdate(TournamentEvent.GAME_START, swapped=swap)

                stream: TournamentStream = self._play_game(swap)
                winner: Color | None = None
                reason: GameOverReason | None = None

                async for s in stream:
                    match s.event:
                        case TournamentEvent.INTERNAL_SUCCESS:
                            winner = s.winner
                            reason = s.reason
                            if (s.winner is Color.WHITE and not swap) or (s.winner is Color.BLACK and swap):
                                self._results.wins_1 += 1 
                            elif (s.winner is Color.WHITE and swap) or (s.winner is Color.BLACK and not swap):
                                self._results.wins_2 += 1
                            else:
                                self._results.draws += 1
                            await stream.aclose()
                            break
                        case TournamentEvent.INTERNAL_FAILURE:
                            yield TournamentUpdate(TournamentEvent.GAME_END, winner=None, reason="error")
                        case TournamentEvent.MOVE:
                            yield s
                        case _:
                            raise ValueError("Bad event type received from _play_game()")

                yield TournamentUpdate(TournamentEvent.GAME_END, winner=winner, reason=reason)

                self._show_results(i)
                
            yield TournamentUpdate(TournamentEvent.TOURNAMENT_END);
        except Exception as e:
            print("Tournament interrupted because:")
            print(e)

    async def _play_game(self, swapped: bool) -> TournamentStream:
        self._engine_1.init(self._tc)
        self._engine_2.init(self._tc)

        players: tuple[BaseEngine, BaseEngine] = (self._engine_1, self._engine_2) if not swapped else (self._engine_2, self._engine_1)
        board: Board = Board()

        timer: TournamentTimer = TournamentTimer(self._tc)
        timer.start()

        while True:
            turn: Color = board.get_state().turn

            # Check if game ended on previous move
            if (reason := board.is_game_over()) is not None:
                self._results.reasons.append(reason)
                self._show_boards(f"Game ended with {reason} on {show_color(turn)}'s turn: ", board, players[0], players[1])
                for player in players:
                    player.game_over();
                yield TournamentUpdate(TournamentEvent.INTERNAL_SUCCESS, winner=opposite_color(turn) if reason == "checkmate" else None, reason=reason)
                return

            # Get move from engine
            lan: str | None = players[turn].go(timer.ms_left(turn))

            # Check for timeout (engine failed to even generate move)
            if lan is None:
                self._results.reasons.append("timeout")
                self._show_boards(f"Game ended with timeout after {show_color(turn)}'s move: ", board, players[0], players[1])
                for player in players:
                    player.game_over();
                yield TournamentUpdate(TournamentEvent.INTERNAL_SUCCESS, winner=opposite_color(turn), reason="timeout")
                return

            # Only allow the move if it is considered legal
            if not board.is_legal_move(move := Move.from_lan(board.get_state(), lan)):
                self._show_boards(f"Illegal move {lan}", board, players[0], players[1])
                self._results.failures.append(board.get_history())
                yield TournamentUpdate(TournamentEvent.INTERNAL_FAILURE)
                return

            # Apply move to engines and internal state
            for player in players:
                player.move(lan)
            _ = board.make_move(move)
            timer.swap()

            # Check for timeout (clock)
            if timer.ms_left(turn) <= 0:
                self._results.reasons.append("timeout")
                self._show_boards(f"Game ended with timeout after {show_color(turn)}'s move: ", board, players[0], players[1])
                for player in players:
                    player.game_over();
                yield TournamentUpdate(TournamentEvent.INTERNAL_SUCCESS, winner=opposite_color(turn), reason="timeout")
                return

            yield TournamentUpdate(
                TournamentEvent.MOVE, 
                white_ms=timer.ms_left(Color.WHITE), 
                black_ms=timer.ms_left(Color.BLACK), 
                move=lan
            )

    def _show_boards(self, msg: str, board: Board, white: BaseEngine, black: BaseEngine):
        print(msg)
        print(repr(board))
        print("\nWhite engine state:")
        print(white.show())
        print("\nBlack engine state")
        print(black.show())

    def _show_results(self, game_number: int):
        print(f"[{game_number + 1}/{self._count}] Jupiter - {self._results.wins_1} - {self._results.draws} - {self._results.wins_2} - Jupiter")
        reason_counts: dict[GameOverReason, int] = {}
        for r in self._results.reasons:
            reason_counts[r] = reason_counts[r] + 1 if reason_counts.get(r) is not None else 1
        for k in reason_counts.keys():
            print(f" - {k}: {reason_counts[k]}")
        print(f" - error: {len(self._results.failures)}")
