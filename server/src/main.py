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

from src.engine_wrapper import EngineWrapper
from src.board import GameOverReason
from framework.base_engine import TimeControl
from src.loader import Loader
from src.board_state import Color
from src.tournament import TournamentEvent, TournamentRunner, TournamentStream
from src.tuner import SPSAEvent, EngineTuner, SPSAStream

# ==================== App Definitions ==================== 

CLIENT_DIR = Path(".").resolve().parent / "client"

class State(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(arbitrary_types_allowed=True)
    
    turn: Color = Color.WHITE

    # white_engine: BaseEngine | None = None
    white_engine: EngineWrapper | None = None
    white_engine_process: subprocess.Popen[bytes] | None = None

    # black_engine: BaseEngine | None = None
    black_engine: EngineWrapper | None = None
    black_engine_process: subprocess.Popen[bytes] | None = None

    tournament_runner: TournamentRunner | None = None
    engine_tuner: EngineTuner | None = None

# ==================== App Data ==================== 

initialised: bool = False
loader: Loader = Loader()
engines: dict[str, Path] = {}
tunable_engines: dict[str, Path] = {}
state: State = State() 

async def init():
    global initialised

    if initialised:
        return

    for dir_path in loader.engine_dirs:
        engines[dir_path.name] = dir_path

    for dir_path in loader.engine_dirs:
         if await loader.is_tunable(dir_path):
            tunable_engines[dir_path.name] = dir_path

    print(tunable_engines)

    initialised = True

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

class TuningUpdateModel(BaseModel):
    event: str 
    tournament_update: TournamentUpdateModel | None = None
    params: dict[str, float] | None = None

class TimeControlInfoModel(BaseModel):
    seconds: float 
    increment: float

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

class StartTuningInfoModel(BaseModel):
    iterations: int 
    engine: str
    c: float | None = None
    smallest_change: float | None = None

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

        white_engine, state.white_engine_process = await loader.launch_engine(engines[info.white_player])
        state.white_engine = EngineWrapper(white_engine)
        state.white_engine.init(tc, info.fen)

    if info.black_player != "Local":
        # Invalid black player
        if info.black_player not in engines:
            return Response(status_code=status.HTTP_400_BAD_REQUEST)

        black_engine, state.black_engine_process = await loader.launch_engine(engines[info.black_player])
        state.black_engine = EngineWrapper(black_engine)
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

@app.get("/tunable-engine-list/")
async def tunable_engine_list(_request: Request):
    return Response(
        status_code=status.HTTP_200_OK,
        media_type="application/json",
        content=json.dumps({ "engines": list(tunable_engines.keys()) })
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

    async def stream_tournament() -> AsyncIterable[bytes]:
        state.tournament_runner = TournamentRunner(loader, engines[info.engine_1], engines[info.engine_2], tc, info.game_count)
        await state.tournament_runner.init()
        stream: TournamentStream = state.tournament_runner.run()
        async for s in stream:
            # Stop the tournament mid run
            if state.tournament_runner.is_interrupted():
                # Cleanly terminate the last game with an interrupt
                data = TournamentUpdateModel(event=str(TournamentEvent.GAME_END), winner=None, reason="interrupt")
                sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                yield sse_frame.encode("utf-8")

                # Yield a tournament end event before closing off the stream
                data = TournamentUpdateModel(event=str(TournamentEvent.TOURNAMENT_END))
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
                    print("Bad event received from tournament event stream:")
                    print(s)
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

@app.post("/start-tuning/")
async def start_tuning(request: Request) -> StreamingResponse:
    info: StartTuningInfoModel = StartTuningInfoModel.model_validate_json(await request.body())
    if info.engine not in engines:
        async def error():
            data = TuningUpdateModel(event=str(SPSAEvent.ERROR))
            sse_frame = f"event: {str(SPSAEvent.ERROR)}\ndata: {data.model_dump_json()}\n\n"
            yield sse_frame.encode("utf-8")
        return StreamingResponse(error(), media_type="text/event-stream")

    async def stream_tuning() -> AsyncIterable[bytes]:
        state.engine_tuner = EngineTuner(loader, engines[info.engine])
        await state.engine_tuner.init()
        stream: SPSAStream = state.engine_tuner.run(info.iterations, user_c=info.c, user_target_delta=info.smallest_change)
        async for s in stream:
            # Stop the tuning mid run
            if state.engine_tuner.is_interrupted():
                # Yield a tuning done event before closing off the stream
                data = TuningUpdateModel(event=str(SPSAEvent.TUNING_DONE))
                sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                yield sse_frame.encode("utf-8")

                await stream.aclose();

            # SPSAUpdate wraps tournament update and passes tournament events through
            # It adds in some events specific to tuning like "params update" and "tuning done"
            # Otherwise, it is basically just a thin wrapper over the existing tournament update
            match s.event:
                # Send specific tuning updates
                case SPSAEvent.PARAMS_UPDATE:
                    data = TuningUpdateModel(
                        event=str(s.event),
                        params=s.params
                    )
                    sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                    yield sse_frame.encode("utf-8")
                    await asyncio.sleep(0) # Flush buffer
                case SPSAEvent.TUNING_DONE:
                    data = TuningUpdateModel(event=str(s.event))
                    sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                    yield sse_frame.encode("utf-8")
                    await asyncio.sleep(0) # Flush buffer

                # Forward the tournament update in a thin wrapper
                case SPSAEvent.TOURNAMENT_UPDATE:
                    if s.tu is None:
                        raise ValueError("Tournament update must not be None for SPSAEvent.TOURNAMENT_UPDATE")

                    match s.tu.event:
                        case TournamentEvent.MOVE:
                            data = TuningUpdateModel(
                                event=str(s.event),
                                tournament_update=TournamentUpdateModel(
                                    event=str(s.tu.event),
                                    white_ms=s.tu.white_ms,
                                    black_ms=s.tu.black_ms,
                                    move=s.tu.move
                                )
                            )
                            sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                            yield sse_frame.encode("utf-8")
                            await asyncio.sleep(0) # Flush buffer
                        case TournamentEvent.GAME_START:
                            data = TuningUpdateModel(
                                event=str(s.event),
                                tournament_update=TournamentUpdateModel(
                                    event=str(s.tu.event), 
                                    swapped=s.tu.swapped
                                )
                            )
                            sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                            yield sse_frame.encode("utf-8")
                            await asyncio.sleep(0) # Flush buffer
                        case TournamentEvent.GAME_END:
                            data = TuningUpdateModel(
                                event=str(s.event),
                                tournament_update=TournamentUpdateModel(
                                    event=str(s.tu.event), 
                                    winner=s.tu.winner, 
                                    reason=s.tu.reason
                                )
                            )
                            sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                            yield sse_frame.encode("utf-8")
                            await asyncio.sleep(0) # Flush buffer
                        case TournamentEvent.TOURNAMENT_END:
                            data = TuningUpdateModel(
                                event=str(s.event),
                                tournament_update=TournamentUpdateModel(
                                    event=str(s.tu.event)
                                )
                            )
                            sse_frame = f"event: {str(data.event)}\ndata: {data.model_dump_json()}\n\n"
                            yield sse_frame.encode("utf-8")
                            await asyncio.sleep(0) # Flush buffer
                        case _:
                            print("Bad event received from tournament event stream:")
                            print(s)
                case _:
                    print("Bad event received from tuning event stream:")
                    print(s)
        await stream.aclose()

    return StreamingResponse(
        stream_tuning(), 
        media_type="text/event-stream", 
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/stop-tuning/")
async def stop_tuning(_req: Request):
    if state.engine_tuner is not None:
        state.engine_tuner.interrupt()

    return NO_RESPONSE

# ==================== Routing ==================== 

@app.get("/")
async def index():
    await init()
    return FileResponse(CLIENT_DIR / "index.html")

@app.get("/replay")
async def replay():
    await init()
    return FileResponse(CLIENT_DIR / "replay.html")

@app.get("/tournament")
async def tournament():
    await init()
    return FileResponse(CLIENT_DIR / "tournament.html")

@app.get("/tune")
async def tune():
    await init()
    return FileResponse(CLIENT_DIR / "tune.html")

app.frontend("/", directory=CLIENT_DIR)
