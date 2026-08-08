# Jupiter Chess Interface

> [!NOTE]
> Please clone recursively to also get access to engines bundled with this repo.

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

## Develop

### Writing an Engine

#### Architecture

- Your engine will go in the `engines/` folder 
- Your engine will implement the abstract class `BaseEngine` from `framework.base_engine`
- If your engine uses python, then make sure you have a virtual environment set up inside your engine folder with your dependencies
- You should work in a fork of this repository and have your engine in a separate repo linked as a submodule
  - More details are available in [contributors](CONTRIBUTORS.md)

#### Step 1 - Setup Your Project

These steps show you how to set up your engine to interact with Jupiter, details on setting up your project are found in [contributors](CONTRIBUTORS.md). 

1. In your engine folder, create an empty file called `__init__.py` to register your module 
2. Create a python file to be your interface for Jupiter's server, you can call it anything you like 
3. Inside this python file import the required modules
   - `from framework.base_engine import BaseEngine, TimeControl`
   - `from typing import override`
4. Create a class for your engine that inherits from `BaseEngine`
5. If using python dependencies, create a virtual environment (`.venv/`) for these

#### Step 2 - Implement The API

Currently there are three required methods that you must implement in your engine class. It is reccommended to keep additional engine implementation separate to keep this interface clean.

The methods that you must implement are:
1. init: `init(self, tc: TimeControl, fen: str | None = None) -> None`
  - Initialise your engine with a provided time control and initial position in FEN (Forsyth-Edwards Notation)
2. go: `go(self, ms_left: int) -> str`
  - Come up with a move given the amount of time remaining in milliseconds
  - The response MUST be in UCI-flavoured LAN.
    - Examples: `"e2e4"`, `"e7e5"`, `"e1g1"` (white short castling), `"e7e8q"` (for promotion)
    - Knights are notated as `"n"`, Kings are notated as `"k"`
3. move: `move(self, move: str) -> None`
  - Apply a move to the engine's internal state
  - This move will arrive in the same UCI LAN as described above
  - The move will be legal, but may not be the one that your engine generated with `go`

#### Step 3 - Prepare For Execution

Any build system is supported, but you are responsible for installing any dependencies and compiling any source files prior to running the server.

For example:
- If you are using python and have external dependencies in your virtual environment, make sure these are all installed.
- If you use a compiled language, make sure the source files are compiled.

### Example Engine

Here is an example of a dummy engine implementation to illustrate the format of your interface.
For a fully implemented example, refer to [Jupiter Engine](https://.https://github.com/angstrom-123/Jupiter-Chess-Engine)

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
