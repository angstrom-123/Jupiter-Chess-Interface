import asyncio
from collections.abc import AsyncIterable

import mimetypes
import json
import subprocess
from typing import ClassVar
from pathlib import Path

from pydantic import BaseModel, ConfigDict
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import FileResponse, StreamingResponse

from src.board import GameOverReason
from framework.base_engine import BaseEngine, TimeControl
from src.loader import Loader
from src.board_state import Color
from src.tournament import TournamentEvent, TournamentRunner, TournamentStream

# ==================== App Definitions ==================== 

CLIENT_DIR = Path(".").resolve().parent / "client"

class State(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(arbitrary_types_allowed=True)
    
    turn: Color = Color.WHITE

    white_engine: BaseEngine | None = None
    white_engine_process: subprocess.Popen[bytes] | None = None

    black_engine: BaseEngine | None = None
    black_engine_process: subprocess.Popen[bytes] | None = None

    tournament_runner: TournamentRunner | None = None

# ==================== App Data ==================== 

loader: Loader = Loader()
engines: dict[str, Path] = {}
for dir_path in loader.engine_dirs:
    engines[dir_path.name] = dir_path

state: State = State() 

# ==================== Request / Reponse Body Structures ==================== 

NO_RESPONSE = Response(status_code=status.HTTP_200_OK, media_type="application/json", content="{}")

class TournamentUpdateModel(BaseModel):
    event: str
    winner: Color | None = None
    white_ms: int | None = None
    black_ms: int | None = None
    move: str | None = None
    swapped: bool | None = None
    reason: GameOverReason | None = None

class TimeControlInfoModel(BaseModel):
    seconds: int 
    increment: int

class GameStartInfoModel(BaseModel):
    fen: str
    white_player: str
    black_player: str 
    time_control: TimeControlInfoModel

class FindMoveInfoModel(BaseModel):
    ms_left: int 

class MakeMoveInfoModel(BaseModel):
    move_lan: str

class StartTournamentInfoModel(BaseModel):
    game_count: int
    engine_1: str 
    engine_2: str 
    time_control: TimeControlInfoModel

# ==================== FastAPI Setup ==================== 

mimetypes.add_type("text/javascript", ".mjs")

app = FastAPI()

# ==================== FastAPI Endpoints ==================== 

@app.post("/game-start/")
async def game_start(request: Request):
    info: GameStartInfoModel = GameStartInfoModel.model_validate_json(await request.body())
    tc: TimeControl = TimeControl(info.time_control.seconds, info.time_control.increment)

    if state.white_engine_process is not None:
        state.white_engine_process.terminate()

    if state.black_engine_process is not None:
        state.black_engine_process.terminate()

    state.white_engine = None
    state.black_engine = None

    state.white_engine_process = None
    state.black_engine_process = None

    if info.white_player != "Local":
        # Invalid white player
        if info.white_player not in engines:
            return Response(status_code=status.HTTP_400_BAD_REQUEST)

        state.white_engine, state.white_engine_process = loader.launch_engine(engines[info.white_player])
        state.white_engine.init(tc, info.fen)

    if info.black_player != "Local":
        # Invalid black player
        if info.black_player not in engines:
            return Response(status_code=status.HTTP_400_BAD_REQUEST)

        state.black_engine, state.black_engine_process = loader.launch_engine(engines[info.black_player])
        state.black_engine.init(tc, info.fen)

    state.turn = Color.WHITE;

    return NO_RESPONSE

@app.get("/engine-list/")
async def engine_list(_request: Request):
    return Response(
        status_code=status.HTTP_200_OK,
        media_type="application/json",
        content=json.dumps({ "engines": list(engines.keys()) })
    )

@app.post("/best-move/")
async def best_move(request: Request):
    info: FindMoveInfoModel = FindMoveInfoModel.model_validate_json(await request.body())

    move: str | None
    if state.turn == Color.WHITE:
        if state.white_engine is None:
            return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        move = state.white_engine.go(info.ms_left)
    else:
        if state.black_engine is None:
            return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        move = state.black_engine.go(info.ms_left)

    lan: str = move if move is not None else ""

    return Response(
        status_code=status.HTTP_200_OK,
        media_type="application/json",
        content=json.dumps({
            "move_lan": lan
        })
    )

@app.post("/make-move/")
async def make_move(request: Request):
    info: MakeMoveInfoModel = MakeMoveInfoModel.model_validate_json(await request.body())

    # Apply the move for any active engines 
    if state.white_engine is not None:
        state.white_engine.move(info.move_lan)
    if state.black_engine is not None:
        state.black_engine.move(info.move_lan)

    # Swap the turn
    state.turn = Color.WHITE if state.turn is Color.BLACK else Color.BLACK

    return NO_RESPONSE

@app.get("/game-over/")
async def game_over(_request: Request):
    print("\n\n=== GAME OVER ===\n")
    if state.white_engine is not None:
        print("White Engine Post Game Metrics:")
        state.white_engine.game_over()
    if state.black_engine is not None:
        print("Black Engine Post Game Metrics:")
        state.black_engine.game_over()

    return NO_RESPONSE

@app.post("/start-tournament/")
async def start_tournament(request: Request) -> StreamingResponse:
    info: StartTournamentInfoModel = StartTournamentInfoModel.model_validate_json(await request.body())
    tc: TimeControl = TimeControl(info.time_control.seconds, info.time_control.increment)

    if info.engine_1 not in engines or info.engine_2 not in engines:
        async def error():
            data = TournamentUpdateModel(event=str(TournamentEvent.ERROR))
            sse_frame = f"event: {str(TournamentEvent.ERROR)}\ndata: {data.model_dump_json()}\n\n"
            yield sse_frame.encode("utf-8")
        return StreamingResponse(error(), media_type="text/event-stream")
    else:
        async def stream_tournament() -> AsyncIterable[bytes]:
            state.tournament_runner = TournamentRunner(loader, engines[info.engine_1], engines[info.engine_2], tc, info.game_count)
            stream: TournamentStream = state.tournament_runner.run()
            async for s in stream:
                if state.tournament_runner.is_interrupted():
                    data = TournamentUpdateModel(event=str(TournamentEvent.GAME_END), winner=None, reason="interrupt")
                    sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                    yield sse_frame.encode("utf-8")
                    await stream.aclose();

                match s.event:
                    case TournamentEvent.MOVE:
                        data = TournamentUpdateModel(
                            event=str(s.event),
                            white_ms=s.white_ms,
                            black_ms=s.black_ms,
                            move=s.move,
                        )
                        sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                        yield sse_frame.encode("utf-8")
                        await asyncio.sleep(0) # Flush buffer
                    case TournamentEvent.GAME_START:
                        data = TournamentUpdateModel(event=str(s.event), swapped=s.swapped)
                        sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                        yield sse_frame.encode("utf-8")
                        await asyncio.sleep(0) # Flush buffer
                    case TournamentEvent.GAME_END:
                        data = TournamentUpdateModel(event=str(s.event), winner=s.winner, reason=s.reason)
                        sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                        yield sse_frame.encode("utf-8")
                        await asyncio.sleep(0) # Flush buffer
                    case TournamentEvent.TOURNAMENT_END:
                        data = TournamentUpdateModel(event=str(s.event))
                        sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                        yield sse_frame.encode("utf-8")
                        await asyncio.sleep(0) # Flush buffer
                    case _:
                        data = TournamentUpdateModel(event=str(TournamentEvent.ERROR))
                        sse_frame = f"event: {str(TournamentEvent.ERROR)}\ndata: {data.model_dump_json()}\n\n"
                        yield sse_frame.encode("utf-8")
                        break
            await stream.aclose()

    return StreamingResponse(
        stream_tournament(), 
        media_type="text/event-stream", 
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/stop-tournament/")
async def stop_tournament(_req: Request):
    if state.tournament_runner is not None:
        state.tournament_runner.interrupt()

    return NO_RESPONSE

# ==================== Routing ==================== 

@app.get("/")
async def index():
    return FileResponse(CLIENT_DIR / "index.html");

@app.get("/replay")
async def replay():
    return FileResponse(CLIENT_DIR / "replay.html");

@app.get("/tournament")
async def tournament():
    return FileResponse(CLIENT_DIR / "tournament.html");

app.frontend("/", directory=CLIENT_DIR)
