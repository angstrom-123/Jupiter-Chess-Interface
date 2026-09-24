# How to Work With Jupiter Client

Your engine should live in its own repository and will be brought in as a submodule.
The guide will walk you through setting up the client for your engine development and connecting your repository to it.

## 1. Fork and Clone

1. `fork` this repo into your own GitHub account
2. `clone` your fork locally, using `--recurse-submodules` to pull in other engines:
   ```bash
   git clone --recurse-submodules https://github.com/your-username/your-repo
   cd your-repo
   ```

## 2. Create a Branch

Create a new branch for your engine implementation:
```bash
git checkout -b your-engine-branch
```

## 3. Register Your Submodule

Add your personal engine repository as a submodule under `engines/`

```bash
cd engines
git submodule add https://github.com/your-username/your-engine engines/YourEngineName
```

## 4. Setup and Test Locally 

1. Navigate to your new engine folder and set up your environment (e.g., compiling your source files, or creating a virtual environment and installing dependencies)
2. Implement the interface class inheriting from `BaseEngine` (check the following section for more details)
3. Boot up the server and see if your engine shows up in the dropdown (check the [readme](README.md) for more details)

## 5. Commit Your Changes

Once everything works, commit the submodule and configuration to your branch and push to your fork
```bash
git add .gitmodules engines/YourEngineName 
git commit -m "Add YourEngineName submodule"
git push origin your-engine-branch
```

## 6. Open a Pull Request

Once you are happy with your engine and wish to add it to the main repo, open a Pull Request from your fork's branch to `main`

# How to Implement the API For Your Own Engine

This guide is not very detailed. Additional information about methods to be overriden is in the source code of 
`BaseEngine` inside of `server/framework/base_engine.py`. Additionally, you can refer to the (fully implemented) 
`Jupiter` chess engine, that I have written myself, to see how it works (although this engine is not simple.)

## 1. Setup Your Module 

1. Inside your engine's folder (inside of the `engines/` directory of the client) create a blank file called `__init__.py`
2. If you intend to use python dependencies for your engine, create a virtual environment in this folder and set it up as you wish.
In any case, you are responsible for ensuring that your engine is fully installed and built so that `Jupiter` can correctly use it.
3. Create another file for your engine's interface code, for example `my_engine.py`

## 2. Import Required Definitions

In your engine's python file (in this case `my_engine.py`) write the following imports:
```python 
from typing import override
from framework.base_engine import BaseEngine, TimeControl
```

## 3. Block in Your Engine Class

Create a class for your engine inheriting from `BaseEngine` and block in the required methods.  
These methods all need to be fully implemented for your engine to be usable in the `Play` and 
`Tournament` modes.
```python 
class MyEngine(BaseEngine):
    @override 
    def init(self, tc: TimeControl, fen: str | None) -> None:
        pass 

    @override 
    def go(self, ms_left: int) -> str:
        pass 

    @override 
    def move(self, move_lan: str) -> None:
        pass 
```

## 4. Implement the Methods as You Wish 

Now you must implement all of the above methods. These are described in detail in the comments of 
`BaseEngine` in `server/framework/base_engine.py`. Here are some brief descriptions of each:
- `init` should initialise this engine instance with a time control and a FEN string describing the 
state of the board. Subsequent calls to `init` should clear all state (blank slate).
- `go` should return a UCI-flavoured LAN string representing the best move in the current position 
given the amount of time remaining on the clock. UCI-LAN states the start and end squares followed 
by an optional promotion (e.g. `e2e4`, `a2a8`, `c7c8q` for promotion, `e1c1` for castling)
- `move` should apply a move in UCI-LAN to your engine's internal board representation.

It is absolutely fine to add variables and extra methods, but remember that all state must be reset 
on a call to `init`. It is a good idea to put extra methods in another file and import them to keep 
the interface file tidy.

## 5. Test Your Engine 

1. Save and build your engine (which should be set up correctly as per the above steps)
2. Launch the web server (as is described in the [readme](README.md))
3. Open the web server in your browser and navigate to the `Play` tab 
4. In the dropdown for either opponent, you should now see the name of your engine 
5. Selecting this engine as (for example) the black player, and local as the white player, you  
should be able to play a game against your engine

## 6. Implement Optional Methods 

If you want to extend the debuggability of your engine, or you would like your engine to support 
automated parameter tuning, then you may like to implement some optional methods.
You may choose to implement these following optional methods:
- `def game_over(self) -> None`: This method is called at the end of a game played by your engine 
and is a good place to print out some debugging info or engine metrics from the last game.
- `def show(self) -> str`: This method is called upon some errors in tournaments and tuning and is 
useful for seeing the internal state of your engine when it crashes. This should return a string of 
your internal engine state for debugging.
- `def tuning_get_params(self) -> dict[str, float]`: This method is required for tuning. It should 
return a dictionary of parameter names and their respective normalised values (in a range of -1 to 
1). These parameters should be things like evaluation coefficients, various weights and constants, 
or anything else that may affect the playing strength of your engine that you want tuned. If your 
values are not normalised internally, then normalise them yourself and then perform the inverse 
transform when assigning these parameters in `tuning_set_params`.
- `def tuning_set_params(self, dict[str, float]) -> None`: This method is required for tuning. It 
should assign a dictionary of parameter names and their respective normalised values (in a range of 
-1 to 1) to your engine. These parameter names will match the names from `tuning_get_params` and 
will be the perturbed parameters to use for the current tuning trial. 
