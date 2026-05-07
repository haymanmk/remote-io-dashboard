# Remote IO Dashboard — NodalCore Plugin

Device-bridge plugin for the STM32 Remote IO firmware. Connects over TCP to
the firmware's text protocol (port 8500 + offset) and exposes a live
dashboard panel inside NodalCore's Workspace tab.

- 16 digital inputs (subscription)
- 16 digital outputs
- 25-LED WS2812 strip
- 2 UART channels (rx/tx)

## Prerequisites

- Node.js 20+, pnpm 9+
- [yalc](https://github.com/wclr/yalc): `npm i -g yalc`
- A local checkout of the NodalCore monorepo at `~/Workspace/js/NodalCore`

## Bootstrap

```bash
# In the NodalCore monorepo: publish @nodalcore/sdk to local yalc store
cd ~/Workspace/js/NodalCore
pnpm sdk:publish-local

# In this repo:
cd ~/Workspace/js/remote-io-dashboard
yalc add @nodalcore/sdk
pnpm install
pnpm build
```

## Build

```bash
pnpm build           # plugin (dist/) + panel (panel/)
pnpm build:plugin    # tsup only
pnpm build:panel     # vite only
pnpm test            # vitest unit tests
pnpm typecheck       # both tsconfigs
```

## Install into NodalCore

```bash
node ~/Workspace/js/NodalCore/apps/cli/dist/index.js \
  plugin install /home/hayman/Workspace/js/remote-io-dashboard
```

Or via the desktop app: `pnpm dev` in the NodalCore monorepo → Plugins tab →
Install local → pick this directory.

After install, in NodalCore: **Plugins → Remote IO Dashboard** to set
`host` / `portOffset`, then **Connect**, then **Workspace tab → Live
Dashboard** to open the panel.

## Iterating on the SDK

When the upstream SDK changes:

```
[in NodalCore]                   [here]
edit packages/sdk/src/...
pnpm sdk:publish-local  ────────► yalc auto-pushes
                                  pnpm build  # rebundle
                                  reinstall plugin into NodalCore
```

(NodalCore's installer copies; it doesn't follow yalc symlinks at runtime.
The bundled `dist/index.js` is fully self-contained.)
