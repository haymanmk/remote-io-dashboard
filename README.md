# Remote IO Dashboard

Electron desktop dashboard for monitoring and controlling a Remote IO device over TCP. The app provides live digital input monitoring, digital output control, WS2812 LED management, UART bridging, and device network/settings management from a single UI.

## Features

- Connects to a device at `host` and TCP port `8500 + portOffset`
- Live view of 16 digital inputs via async subscription updates
- Toggle control for 16 digital outputs
- Control for a 25-pixel WS2812 LED strip
- Two UART channels with send/receive logs and baud-rate controls
- Network and device settings editor with a small NodalCore-compatible settings server

## Stack

- Electron + electron-vite
- React 18 + TypeScript
- Native Node TCP client in the Electron main process

## Project layout

```text
src/main/       Electron main process, TCP client, settings server
src/preload/    Secure renderer bridge
src/renderer/   React UI
proto/          Protocol-related assets
bin/start.js    Launcher used by NodalCore
nodal.json      NodalCore metadata
```

## Getting started

This repository uses `pnpm` for dependency management.

```bash
pnpm install
pnpm dev
```

Useful scripts:

```bash
pnpm run typecheck
pnpm run build
pnpm run preview
```

If you prefer `npm`, the same scripts are available through `npm run <script>`, but `pnpm` is the primary workflow because the lockfile is committed.

## How it works

The Electron main process owns the TCP connection to the Remote IO device and exposes a small IPC API through the preload script. The React renderer consumes that API to drive the dashboard UI.

At startup, the app also opens a local HTTP settings server so NodalCore can read the schema and update `host` / `portOffset`. When launched through `bin/start.js`, the built app prints `NODALCORE_READY <port>` to stdout for the parent process.

## Before pushing

Build artifacts and local dependencies are ignored through `.gitignore`, so you can safely add the project to git and push the source files without committing `node_modules/` or `out/`.
