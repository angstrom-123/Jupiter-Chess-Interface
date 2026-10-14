# Jupiter Chess Interface

> [!NOTE]
> Please clone recursively to also get access to engines bundled with this repo.

## Prerequisites
- Python >=3.14
- Astral uv
- npm

## Build and Run

### Transpile the client

```shell
cd client
npm install
npm run build
cd ..
```

### Create Source the Virtual Environment

```shell
cd server
uv venv
```

### Source the Virtual Environment

#### Linux / Mac

```shell
source .venv/bin/activate
```

#### Windows

```shell
.venv\Scripts\activate
```

### Install python dependencies

```shell
uv sync
```

### Build any engines

Make sure that any engine implementations inside of `/engines` are fully built / compiled, otherwise the server will error-out when validating them on startup.
If there are no engines in the directory, then do not worry - the server should work fine.

### Start the server

```shell
fastapi run
```

### Open in browser

The active port will be listed by the `fastapi run` command (default 8000).
Access at localhost:port (default http://localhost:8000).

## Windows Issues I Ran Into (And how to fix them)
1. Browser unable to connect to fastapi server after starting it up:
   - This happens because fastapi is not able to find your python executable
   - First, verify that there are no browser policies (e.g., https only mode, proxies) that may be blocking localhost connections
     - If there is a browser policy like this, then disable it and restart your browser before retrying
   - Next, verify that there are no aliases for Python on your machine
     - You can check this by searching for "manage app execution aliases" in the start menu and finding python.exe and python3.exe
     - If the alias is checked "on" then switch it to "off"
     - Restart your terminal and try again
2. Upon connecting to server, get error: "[WinError 2] The system cannot find the file specified..."
   - This happens because my engine loader is unable to find your python executable
   - To verify, try running `python3 --version` in your terminal
     - If this works, then you have a different problem
     - Otherwise, the issue is that `python3` is not recognised as a command on your machine
     - To fix, create a symlink to `python` so that it can be referenced as `python3`
       1. Open a new terminal as administrator
       2. execute `where python` in your terminal (if you are connected to the venv, you should see two. Use the one located outside the venv for this)
       3. `cd` to the path that it shows
       4. execute `mklink python3.exe python.exe` to create the symlink
       5. verify that it has worked by running `python3`. If there is no error, it has worked
     - Now restart your terminal and run fastapi again, everything should work
