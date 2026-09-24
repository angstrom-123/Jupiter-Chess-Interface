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
