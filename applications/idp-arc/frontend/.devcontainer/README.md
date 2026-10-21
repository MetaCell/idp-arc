# Dev Container Configuration

This directory contains the configuration for running the frontend application in a VS Code Dev Container.

## Features

- **Node.js LTS**: Pre-configured with the latest LTS version of Node.js
- **Yarn**: Yarn package manager pre-installed
- **Playwright**: E2E testing environment with browser dependencies
- **VS Code Extensions**: Essential extensions for React/TypeScript development
- **Auto-start**: Development server automatically starts when container launches
- **Port Forwarding**: Vite dev server (port 5173) automatically forwarded

## Usage

1. Open this folder in VS Code
2. When prompted, click "Reopen in Container"
3. Wait for the container to build and dependencies to install
4. The dev server will start automatically on port 5173

## Manual Commands

If you need to run commands manually:

```bash
# Install dependencies
yarn install

# Start dev server
yarn dev

# Run linting
yarn lint

# Run e2e tests
yarn test:e2e

# Run e2e tests in UI mode
yarn test:e2e:ui
```

## Customization

You can modify `.devcontainer/devcontainer.json` to:
- Add more VS Code extensions
- Change Node.js version
- Add additional features
- Modify port forwarding
- Customize startup commands
