import importlib
import inspect
import os
import sys
from pathlib import Path
from typing import cast

from framework.base_engine import BaseEngine

class Discovery:
    def __init__(self):
        self._base_dir: Path = Path(".")
        self._discovery_dir: Path = self._base_dir.resolve().parent / "engines"
        self._types: dict[str, type[BaseEngine]] = {}

    def discover(self) -> dict[str, type[BaseEngine]]:
        parent_dir: str = str(self._base_dir.absolute())
        if parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)
        
        # This allows us to find the "engines" module in the dir above
        discovery_dir: str = str(self._discovery_dir.resolve().parent)
        if discovery_dir not in sys.path:
            sys.path.insert(0, discovery_dir)

        for root, _, files in os.walk(self._discovery_dir):
            relative_path = Path(root).relative_to(self._discovery_dir)
            if any(part.startswith("_") for part in relative_path.parts):
                continue

            for file in files:
                if file.endswith(".py") and not file.startswith("__"):
                    self._traverse_file(file, relative_path)

        return self._types

    def _traverse_file(self, file: str, relative_path: Path) -> None:
        module_name: str = file[:-3] # Remove ".py"

        try:
            # Build module path
            if str(relative_path) == ".":
                full_module_name = f"engines.{module_name}"
            else:
                full_module_name = f"engines.{str(relative_path).replace(os.sep, ".")}.{module_name}"

            # Import module
            module = importlib.import_module(full_module_name)

            # Find subclasses of BaseEngine
            for attr_name in dir(module):
                attr: type | object = cast(type | object, getattr(module, attr_name))
                if inspect.isclass(attr) and self._is_engine_subclass(attr):
                    engine_name = attr.__name__
                    self._types[engine_name] = cast(type[BaseEngine], attr)
                    print(f"Discovered engine '{engine_name}' in '{full_module_name}'")

        except Exception as e:
            print(str(e))
            pass

    def _is_engine_subclass(self, attr: type) -> bool:
        if not inspect.isclass(attr):
            return False

        if not issubclass(attr, BaseEngine):
            return False

        if attr is BaseEngine:
            return False 

        # Check if methods are overriden
        try:
            instance = attr()
            for method in BaseEngine.required_methods:
                if getattr(BaseEngine, method) is getattr(instance, method):
                    return False
            return True
        except:
            return False

