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
git submodule add https://github.com/your-username/your-engine engines/YourEngineName
```

## 4. Setup and Test Locally 

1. Navigate to your new engine folder and set up your environment (e.g., compiling your source files, or creating a virtual environment and installing dependencies)
2. Implement the interface class inheriting from `BaseEngine` (check the [readme](README.md) for more details)
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
