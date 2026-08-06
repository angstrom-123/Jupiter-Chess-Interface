import mimetypes
import json
from typing import ClassVar, Literal
from pathlib import Path

from pydantic import BaseModel, ConfigDict
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import FileResponse

from framework.base_engine import BaseEngine, TimeControl
from src.discovery import Discovery

# ==================== App Definitions ==================== 

CLIENT_DIR = Path(".").resolve().parent / "client"

Color = Literal["white", "black"]

class State(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(arbitrary_types_allowed=True)
    
    turn: Color = "white"
    white_engine: BaseEngine | None = None
    black_engine: BaseEngine | None = None

# ==================== App Data ==================== 

discovery: Discovery = Discovery()
engines: dict[str, type[BaseEngine]] = discovery.discover()
state: State = State() 

# ==================== Request / Reponse Body Structures ==================== 

NO_RESPONSE = Response(status_code=status.HTTP_200_OK, media_type="application/json", content="{}")

class TimeControlInfo(BaseModel):
    seconds: int 
    increment: int

class GameStartInfo(BaseModel):
    fen: str
    white_player: str
    black_player: str 
    time_control: TimeControlInfo

class FindMoveInfo(BaseModel):
    ms_left: int 

class MakeMoveInfo(BaseModel):
    move_lan: str

# ==================== FastAPI Setup ==================== 

mimetypes.add_type("text/javascript", ".mjs")

app = FastAPI()

# ==================== FastAPI Endpoints ==================== 

@app.post("/game-start/")
async def game_start(request: Request):
    info: GameStartInfo = GameStartInfo.model_validate_json(await request.body())
    tc: TimeControl = TimeControl(info.time_control.seconds, info.time_control.increment)

    if info.white_player != "Local":
        # Invalid white player
        if info.white_player not in engines:
            return Response(status_code=status.HTTP_400_BAD_REQUEST)

        state.white_engine = engines[info.white_player]()
        state.white_engine.init(tc, info.fen)

    if info.black_player != "Local":
        # Invalid black player
        if info.black_player not in engines:
            return Response(status_code=status.HTTP_400_BAD_REQUEST)

        state.black_engine = engines[info.black_player]()
        state.black_engine.init(tc, info.fen)

    state.turn = "white";

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
    info: FindMoveInfo = FindMoveInfo.model_validate_json(await request.body())

    print(f"Ms left: {info.ms_left}")

    move: str
    if state.turn == "white":
        if state.white_engine is None:
            return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        move = state.white_engine.go(info.ms_left)
    else:
        if state.black_engine is None:
            return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        move = state.black_engine.go(info.ms_left)

    return Response(
        status_code=status.HTTP_200_OK,
        media_type="application/json",
        content=json.dumps({
            "move_lan": move
        })
    )

@app.post("/make-move/")
async def make_move(request: Request):
    info: MakeMoveInfo = MakeMoveInfo.model_validate_json(await request.body())

    # Apply the move for any active engines 
    if state.white_engine is not None:
        state.white_engine.move(info.move_lan)
    if state.black_engine is not None:
        state.black_engine.move(info.move_lan)

    # Swap the turn
    state.turn = "white" if state.turn == "black" else "black"

    return NO_RESPONSE

# ==================== Routing ==================== 

@app.get("/")
async def index():
    return FileResponse(CLIENT_DIR / "index.html");

@app.get("/replay")
async def replay():
    return FileResponse(CLIENT_DIR / "replay.html");

app.frontend("/", directory=CLIENT_DIR)
