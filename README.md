# Chess Engine

Work-In-Progress - Partially implemented, API subject to change.
A chess engine written in C++ with a Python 3 API.

## Prerequisites
- Modern C++ compiler (>=c++23)
- Python 3.1x
- Astral uv
- npm
- CMake
- make / windows alternative (c++ build system)

## Build and Run Client

### Build library
```shell
mkdir build && cd build 
cmake .. -DCMAKE_BUILD_TYPE=Release 
make
cd ..
```

### Set up Server
```shell
uv sync
```

On Linux Run:
```shell
source .venv/bin/activate
```
On Windows Run: 
```shell
.\venv\Scripts\Activate.ps1
```

### Set up client
```shell
npm install 
```

### Start the server
```shell
npm run start
```

### Done 
Your server should be running at http://localhost:8000 (by default)

## Custom Engines

The client and server support arbitrary engines for move generation as long as they implement a simple API.
To do this, create a subclass of the `BaseEngine` class in `engine.py` and implement all its methods.
Descriptions of the inputs / outputs of all methods are available in the source code in `engine.py`.
Once implemented, add it to the list of engines in `players.py` to register it.
It will now show up as an option in the client interface.
Refer to `jupiter.py` (detailed below and in source code) for an example.

## Custom Engine Example (Jupiter)

### Wrapper Class

Create `jupiter.py`:
```python
from typing_extensions import override

# This is the API class that needs to be implemented
from server.engine import BaseEngine

# This is the custom engine implementation - in this case Jupiter's Board
from jupiter import Board

# Override all required methods of BaseEngine
class Jupiter(BaseEngine):
    name: str = "Jupiter"
    board: Board | None = None 

    @override
    def init(self, tc: TimeControl, fen: str | None = None) -> None:
        if fen is None:
            self.board = Board()
        else:
            self.board = Board(fen)

        self.board.set_time_control(tc.seconds, tc.increment)

    @override
    def go(self, msLeft: int) -> str:
        if self.board is not None:
            return self.board.go(msLeft)
        else:
            raise AttributeError("self.board is not initialised. Try calling init.")

    @override
    def move(self, move: str) -> None:
        if self.board is not None:
            self.board.make_move(move)
        else:
            raise AttributeError("self.board is not initialised. Try calling init.")
```

### Register Engine

Add to `players.py`:
```python 
# Import whichever engine wrapper you like
from server.jupiter import Jupiter

# Any engines need to be registered here
engines: list[type[BaseEngine]] = [
    Jupiter,
]
```

## Engine Development

### Debug Library Build
```shell
mkdir build && cd build 
cmake .. -DCMAKE_BUILD_TYPE=Debug
make
```

### Rebuilding Library
If you ever rebuild the c++ library, you need to refresh uv dependencies.
```shell
uv pip install -e . --force-reinstall
```

Alternatively, you can compile the library and reinstall dependencies like so (Linux).
```shell
npm run reinstall
```

### Development Server
Note that typescript files do not currently auto-refresh, so you need to rerun the dev server if you change those. Changes to the server-side should be fine.
```shell
npm run dev
```
