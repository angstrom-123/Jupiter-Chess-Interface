import asyncio
import os
import socket
import sys
from typing import cast
from multiprocessing.managers import BaseManager
import subprocess
from pathlib import Path

from framework.base_engine import BaseEngine

class EngineManager(BaseManager): pass 
EngineManager.register("ChessEngine")

def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return cast(int, s.getsockname()[1])

class Loader:
    def __init__(self):
        self.engines_dir: Path = Path(".").resolve().parent / "engines"
        self.engine_dirs: list[Path] = []
        for file in self.engines_dir.iterdir():
            if file.is_dir() and not str(file.name).startswith("__"):
                self.engine_dirs.append(file)
        print("Discovered engine directories:\n", [str(f) for f in self.engine_dirs])

    async def is_tunable(self, engine_dir: Path) -> bool:
        engine, process = await self.launch_engine(engine_dir)

        # Try calling all required methods to see if they are implemented or not
        try:
            engine.tuning_set_params({})
        except Exception as e:
            if isinstance(e, NotImplementedError):
                process.terminate()
                return False

        try:
            _ = engine.tuning_get_params()
        except Exception as e:
            if isinstance(e, NotImplementedError):
                process.terminate()
                return False 

        process.terminate()
        return True

    async def launch_engine(self, engine_dir: Path) -> tuple[BaseEngine, subprocess.Popen[bytes]]:
        engine_dir = engine_dir.resolve()
        venv_python: Path = engine_dir / ".venv" / "bin" / "python3"
        python_exec = str(venv_python) if venv_python.exists() else "python3"

        env = os.environ.copy()
        current_python_path = env.get("PYTHONPATH", "")
        project_root_path: Path = Path(".").resolve().parent
        server_path: Path = project_root_path / "server"
        src_path: Path = server_path / "src"
        framework_path: Path = server_path / "framework"
        additional_paths = [str(project_root_path), str(server_path), str(src_path), str(framework_path)]

        python = f"python{sys.version_info.major}.{sys.version_info.minor}"
        site_packages_path: Path = engine_dir / ".venv" / "lib" / python / "site-packages"
        if not site_packages_path.exists():
            site_packages_path = engine_dir / ".venv" / "lib" / "site-packages"
        if site_packages_path.exists():
            additional_paths.append(str(site_packages_path))

        if current_python_path:
            additional_paths.append(current_python_path)

        env["PYTHONPATH"] = os.path.pathsep.join(additional_paths)

        port: int = get_free_port()
        proc: subprocess.Popen[bytes] = subprocess.Popen([python_exec, "src/run_engine.py", str(engine_dir), str(port)], env=env)
        # TODO: Test
        # time.sleep(1.0)

        # Poll the process to see if it is ready before returning
        while True:
            try:
                _, writer = await asyncio.open_connection("127.0.0.1", port)
                writer.close()
                await writer.wait_closed()
                break
            except (OSError, ConnectionRefusedError):
                await asyncio.sleep(0.1)

        manager = EngineManager(address=("127.0.0.1", port), authkey=b"jupiter")
        manager.connect()

        remote_engine = manager.ChessEngine()

        return remote_engine, proc
