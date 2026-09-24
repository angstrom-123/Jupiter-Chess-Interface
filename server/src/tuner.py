from collections.abc import AsyncGenerator
from enum import Enum
from typing import cast

import numpy as np

from pathlib import Path

from framework.base_engine import BaseEngine, TimeControl
from src.loader import Loader
from src.tournament import TournamentResults, TournamentRunner, TournamentStream, TournamentUpdate

GAME_COUNT: int = 40

class SPSAEvent(Enum):
    ERROR = 0
    PARAMS_UPDATE = 1 
    TUNING_DONE = 2
    TOURNAMENT_UPDATE = 3

class SPSAUpdate():
    event: SPSAEvent
    tu: TournamentUpdate | None
    params: dict[str, float] | None

    def __init__(
        self, 
        event: SPSAEvent, 
        tu: TournamentUpdate | None = None, 
        params: dict[str, float] | None = None
    ):
        self.event = event 
        self.tu = tu
        self.params = params

SPSAStream = AsyncGenerator[SPSAUpdate]

# TODO:
#       DO NOT SHOW ENGINES THAT DON'T SUPPORT TUNING IN THE TUNING PAGE 
#       ALSO CREATE A DISPLAY OF ALL THE VARIABLES THAT ARE BEING TUNED LIVE PER ENGINE
class EngineTuner:
    _runner: TournamentRunner
    _reference_params: dict[str, float] = {}
    _perturbed_params: dict[str, float] = {}
    _interrupted: bool = False

    def __init__(self, loader: Loader, engine_path: Path):
        self._runner = TournamentRunner(
            loader, 
            engine_path, 
            engine_path, 
            TimeControl(10, 0.1), # This is very standard
            GAME_COUNT, 
            post_init_1=self._post_init_1, # Instrumented here
        )

    # Instrumented tournament runner to call this after initialising the engines
    # Engine 2 is the reference engine and will not have its params adjusted
    def _post_init_1(self, engine: BaseEngine) -> None:
        engine.tuning_set_params(self._perturbed_params)

    def is_interrupted(self) -> bool:
        return self._interrupted

    def interrupt(self) -> None:
        self._runner.interrupt()
        self._interrupted = True

    async def init(self) -> None:
        await self._runner.init()

        # Init a dummy engine so that we can safely get its parameters
        # The engine will be safely reinitialised when running later
        tmp: BaseEngine = self._runner.get_engine_1()
        tmp.init(TimeControl(1))
        self._reference_params = tmp.tuning_get_params()
        self._runner.cleanup()

    async def run(self, iterations: int, user_c: float | None = None, user_target_delta: float | None = None) -> SPSAStream:
        if len(self._reference_params.keys()) == 0:
            raise AttributeError("init not called on engine tuner")

        self._interrupted = False

        # SPSA paper that this implementation is derived from:
        #     https://www.jhuapl.edu/spsa/PDF-SPSA/Spall_Implementation_of_the_Simultaneous.PDF

        # === Step 1: Initialisation and Coefficient Selection ===

        if user_c is None:
            user_c = 0.05 
        if user_target_delta is None:
            user_target_delta = 0.05

        # Values for alpha and gamma are recommended by the paper 
        alpha: float = 0.602 
        gamma: float = 0.101
        # c should be a small, positive number, approximately equal the standard deviation of measurement noise
        c: float = user_c # 0.05 by default
        # A should be much less than the maximum number of iterations (10% or less)
        A: float = iterations / 15.0
        # (a / (A + 1)^alpha) * feature magnitude ~= smallest desired change in magnitude of theta in early iterations
        TARGET_DELTA: float = user_target_delta # 0.05 by default
        a: float = cast(float, TARGET_DELTA * ((A + 1.0)**alpha))

        # Initial guess at optimal parameters to update at each iteration
        params_dict: dict[str, float] = dict(self._reference_params)
        params: np.ndarray = np.asarray(list(params_dict.values()))

        yield SPSAUpdate(SPSAEvent.PARAMS_UPDATE, params=params_dict)

        # Track number of times only a small change is made to params for early termination
        n_small_deltas: int = 0
        MAX_SMALL_DELTAS: int = 4

        for k in range(iterations):
            if self._interrupted:
                break

            ak: float = cast(float, a / ((k + 1.0 + A)**alpha))
            ck: float = cast(float, c / ((k + 1.0)**gamma))

            # === Step 2: Generation of Simultaneous Perturbation ===

            # Compute perturbation vector, perturb features
            p_vector: np.ndarray = np.random.choice([-1.0, 1.0], size=len(params_dict.keys()), p=[0.5, 0.5])
            params_plus_dict: dict[str, float] = {}
            params_minus_dict: dict[str, float] = {}
            for i, key in enumerate(params_dict.keys()):
                params_plus_dict[key] = np.clip(cast(float, params[i] + ck * p_vector[i]), -1.0, 1.0)
                params_minus_dict[key] = np.clip(cast(float, params[i] - ck * p_vector[i]), -1.0, 1.0)

            # === Step 3: Loss Function Evaluations === 

            # Measure engine play with perturbed params against reference opponent
            self._perturbed_params = params_plus_dict
            await self._runner.init()
            stream_1: TournamentStream = self._runner.run()
            async for s in stream_1:
                if self._interrupted:
                    await stream_1.aclose()
                    break
                yield SPSAUpdate(SPSAEvent.TOURNAMENT_UPDATE, tu=s)
            loss_plus: float = self._compute_loss(self._runner.get_results())

            self._perturbed_params = params_minus_dict 
            await self._runner.init()
            stream_2: TournamentStream = self._runner.run()
            async for s in stream_2:
                if self._interrupted:
                    await stream_2.aclose()
                    break
                yield SPSAUpdate(SPSAEvent.TOURNAMENT_UPDATE, tu=s)
            loss_minus: float = self._compute_loss(self._runner.get_results())

            # === Step 4: Gradient Approximation ===

            gradient: np.ndarray = ((loss_plus - loss_minus) / (2.0 * ck)) * (p_vector**-1.0)

            # === Step 5: Updating Theta Estimate ===

            new_params: np.ndarray = np.clip(params - ak * gradient, -1.0, 1.0)
            mean_delta: float = np.mean(np.abs(new_params - params))
            params = new_params

            # This should work ok because modern python preserves order of dict items
            for i, key in enumerate(params_dict.keys()):
                params_dict[key] = new_params[i]
            yield SPSAUpdate(SPSAEvent.PARAMS_UPDATE, params=params_dict)

            # === Step 6: Iteration or Termination ===

            if mean_delta > 0.02:
                n_small_deltas = 0
            else:
                # If there is little change in successive iterations then terminate early
                n_small_deltas += 1 
                if n_small_deltas >= MAX_SMALL_DELTAS:
                    break

        yield SPSAUpdate(SPSAEvent.TUNING_DONE)

    # Loss is taken relative to engine 1 (the engine that is being tuned)
    # Engine 2 is a reference opponent used specifically for this measurement
    # A lower loss means engine 1 performed better, we seek to minimise loss 
    def _compute_loss(self, results: TournamentResults) -> float:
        win_score: float = 1.0 
        draw_score: float = 0.5 

        # Exclude draws by engine failure from scoring but do not penalise
        n_failures: int = len(results.failures)
        score: float = results.wins_1 * win_score + (results.draws - n_failures) * draw_score
        max_score: float = (GAME_COUNT - n_failures) * win_score

        loss: float = (max_score - score) / max_score
        return loss
