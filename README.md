# Jupiter Chess Interface

## Prerequisites
- Python >=3.12
- Astral uv
- npm

## Build and Run

### Transpile the client

```shell
cd client
npm run build
cd ..
```

### Source the virtual environment

#### Linux / Mac
```shell
cd server
source .venv/bin/activate
```

#### Windows Powershell:

```shell
cd server 
.venv\bin\activate.ps1
```

#### Windows CMD:

```shell
cd server 
.venv\bin\activate.bat
```

### Install python dependencies

```shell
uv pip install -e . --force-reinstall
uv sync
```

### Start the server

```shell
fastapi run
```

### Open in browser

The active port will be listed by the `fastapi run` command (default 8000).
Access at localhost:port (default http://localhost:8000).

> [!NOTE]
> [Jupiter Engine](https://github.com/angstrom-123/Jupiter-Chess-Engine) is bundled with this repo if you cloned recursively. It will not show up in the web client unless you build it. Follow the steps in Jupiter's documentation to do so if you wish.

## Develop

### Writing an Engine

#### Architecture

- Your engine will go in the `engines/` folder 
- Your engine will implement the abstract class `BaseEngine` from `framework.base_engine`
- If your engine uses python, then make sure you have a virtual environment set up inside your engine folder with your dependencies
- You should work in a fork of this repository and have your engine in a separate repo linked as a submodule
  - More details are available in [contributors.md](CONTRIBUTORS.md)

#### Step 1 - Setup Your Project

1. Create a new folder inside of `engines` for your engine
2. Go inside your new engine folder
3. Create an empty file named exactly `__init__.py` to register your module
4. Create a new python file. This will be your interface with Jupiter Client. You can call it anything, for example `example_engine.py`
5. Inside this file, import required classes: `from framework.base_engine import BaseEngine, TimeControl`
6. Also import the `override` annotation: `from typing import override`
7. Create a class for your engine that inherits from `BaseEngine`. Name it what you like, for example `class ExampleEngine(BaseEngine):`
8. If you wish to use python for your engine, create a virtual environment directly inside your engine folder for all dependencies
9. If you wish to use another language, you must make sure that it is compiled and ready for use in the python interface file 

#### Step 2 - Implement The API

Currently there are three required methods that you must implement in your engine class. It is reccommended to keep additional engine implementation separate to keep this interface clean.

The methods that you must implement are:
1. init: `init(self, tc: TimeControl, fen: str | None = None) -> None`
  - Initialise your engine with a provided time control and initial position in FEN (Forsyth-Edwards Notation)
2. go: `go(self, ms_left: int) -> str`
  - Come up with a move given the amount of time remaining in milliseconds
  - The response MUST be in UCI-flavoured LAN.
    - Examples: e2e4, e7e5, e1g1 (white short castling), e7e8q (for promotion)
    - Knights are notated as `n`, Kings are notated as `k`
3. move: `move(self, move: str) -> None`
  - Apply a move to the engine's internal state
  - This move will arrive in the same UCI LAN as described above
  - The move will be legal, but may not be the one that your engine generated with `go`

### Example Engine

Here is an example of a dummy engine to illustrate the format of your interface.
For a fully implemented example, refer to Jupiter engine (`engines/jupiter/jupiter.py`).

```python
from typing import override
from framework.base_engine import BaseEngine, TimeControl

# Import your engine implementation here

class ExampleEngine(BaseEngine):
    # Add any other members you want here 

    @override
    def init(self, tc: TimeControl, fen: str | None = None) -> None:
        
        # Initialise your engine here

        raise NotImplementedError("Please implement this method")

    @override
    def go(self, ms_left: int) -> str:

        # Find the best move and return it in UCI LAN here

        raise NotImplementedError("Please implement this method")

    @override
    def move(self, move: str) -> None:

        # Apply a UCI LAN move to your engine here

        raise NotImplementedError("Please implement this method")
```
