#!/usr/bin/env python3

from typing import override

from framework.base_engine import BaseEngine, TimeControl

from faker import Faker

class Test(BaseEngine):
    @override
    def init(self, tc: TimeControl, fen: str | None = None) -> None:
        fake = Faker()
        print("Import successful")

    @override
    def go(self, ms_left: int) -> str:
        return "e4e5"

    @override
    def move(self, move: str) -> None:
        pass
