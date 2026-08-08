import inspect
import os
import sys
import importlib
from pathlib import Path
from multiprocessing.managers import BaseManager, Server
from typing import cast

from framework.base_engine import BaseEngine

def load_engine(engine_dir: str) -> BaseEngine:
    engine_path = Path(engine_dir).resolve()

    # Load venv if there is one
    python: str = f"python{sys.version_info.major}.{sys.version_info.minor}"
    venv_site = Path(engine_dir) / ".venv" / "lib" / python / "site-packages"
    if venv_site.exists():
        sys.path.insert(0, str(venv_site.resolve()))
        print(f"Added {str(venv_site.resolve())} to path")

    # Add engine path for local imports
    sys.path.insert(0, str(engine_path))
    print(f"Added {str(engine_path)} to path")

    # Add Jupiter Client path for imports
    parent_dir: Path = Path(".").resolve().parent
    sys.path.insert(0, str(parent_dir))
    print(f"Added {str(parent_dir)} to path")

    # Add engines path for imports
    engines_dir: Path = Path(".").resolve().parent / "engines"
    sys.path.insert(0, str(engines_dir))
    print(f"Added {str(engines_dir)} to path")

    # Scan python files in engine dir
    print(f"Scanning {engine_path}")
    for root, _, files in os.walk(engine_path):
        relative_path = Path(root).relative_to(engine_path.parent)
        if any(part.startswith("_") for part in relative_path.parts):
            continue

        for file in files:
            if file.startswith("__") or not file.endswith(".py"):
                continue

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
                    if inspect.isclass(attr) and issubclass(attr, BaseEngine) and attr is not BaseEngine:
                        print(f"Discovered engine '{attr.__name__}' in '{full_module_name}'")
                        return attr();

            except Exception as e:
                print(str(e))

    raise ValueError(f"Could not find BaseEngine implementation in {engine_dir}")

def safe_go(ms_left: int) -> str:
    raw: str = instance.go(ms_left)
    # Strip out non alphanumeric chars
    clean: str = repr(raw)
    # Remove empty spaces
    clean = clean.strip()
    # Remove surrounding quotes
    clean = clean[1:-1]
    # Remove trailing character if promoting
    if len(clean) > 4:
        clean = clean[:-1]
    return clean

engine_dir: str = sys.argv[1]
port: int = int(sys.argv[2])

instance: BaseEngine = load_engine(engine_dir)

class EngineManager(BaseManager): pass 
EngineManager.register("init", callable=instance.init)
EngineManager.register("go", callable=safe_go)
EngineManager.register("move", callable=instance.move)

manager: EngineManager = EngineManager(address=("127.0.0.1", port), authkey=b"jupiter")
server: Server = manager.get_server()

print(f"Engine process started on port {port}", flush=True)
server.serve_forever()
