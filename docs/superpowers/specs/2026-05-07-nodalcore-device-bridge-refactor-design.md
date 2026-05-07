# Refactor Remote IO Dashboard into a NodalCore device-bridge plugin

Date: 2026-05-07
Status: Approved for implementation planning

## Context

The Remote IO Dashboard currently ships as a standalone Electron 34 app that
also doubles as a NodalCore plugin via a `bin/start.js` shim and an in-process
HTTP "settings server". NodalCore has since moved to a VSCode-style plugin
model (SDK 0.2.0, `contributes` block, RJSF-driven settings, fork-IPC for
device-bridges, `WebContentsView` panel webviews via the `nodal-plugin://`
privileged scheme). The current manifest no longer validates: `settingsSchema`
is rejected, `sdkVersion: "^1.0.0"` no longer satisfies `SDK_VERSION = '0.2.0'`,
and there is no `contributes` block at all.

We are refactoring this project into a **plugin-only** `device-bridge` with
`connectionType: "tcp"`. The Electron shell is dropped. The React UI is
retargeted to a single panel webview that loads inside NodalCore's Workspace
tab. Settings move to `manifest.contributes.configuration.properties` and are
read via `ctx.workspace.getConfiguration()`. The plugin is developed outside
the NodalCore monorepo using yalc to consume `@nodalcore/sdk`.

## Goals

- Conform to the NodalCore SDK 0.2.0 plugin contract.
- Preserve all current functionality: 16 digital inputs, 16 digital outputs, 25
  WS2812 LEDs, two UART channels, device status.
- Run unmodified against the existing Zephyr firmware on the STM32 — no
  protocol changes.
- Use only the host-supplied UI surfaces — no separate Electron window.

## Non-goals (explicitly out of scope for v1)

- Standalone (non-NodalCore) runnability.
- AppImage / artifact publishing — pending NodalCore's tarball-install path.
- Multi-panel split (one panel per tab).
- Theme contribution.
- StatusBar or sidebar slot contributions.
- Backwards compatibility with the old standalone-tool nodal.json or
  `settings-server.ts`. Both are deleted.

## Architecture

The plugin is a `device-bridge` with `connectionType: "tcp"`. NodalCore forks
a worker on Connect, dynamically imports `dist/index.js`, calls `activate(ctx)`
once, then calls `DevicePlugin.connect(options)`. We open a TCP socket to the
Remote IO firmware. The React UI lives in **one** panel webview (`Live
Dashboard`) loaded by the host at
`nodal-plugin://com.nodalcore.remote-io-dashboard/panel/index.html`. All
plugin↔panel traffic flows through `ctx.views.{onMessage,postMessage}` on slot
id `dashboard`.

```
┌──────────────────────────────────────────────────────────────────┐
│  NodalCore (host)                                                 │
│   ┌────────────────────┐         ┌──────────────────────────────┐ │
│   │  Worker (forked)   │         │  WebContentsView             │ │
│   │  remote-io plugin  │◀──IPC──▶│  panel/index.html (React)    │ │
│   │  - DevicePlugin    │ broker  │  window.nodalcore.{post,on}  │ │
│   │  - tcp-client      │         └──────────────────────────────┘ │
│   │  - protocol parser │                                          │
│   └─────────┬──────────┘                                          │
└─────────────┼─────────────────────────────────────────────────────┘
              │ TCP (host: 8500 + portOffset)
              ▼
       Remote IO firmware (STM32 / Zephyr)
```

## Source layout

```
remote-io-dashboard/
├── nodal.json
├── package.json
├── tsup.config.ts
├── vite.config.ts
├── tsconfig.plugin.json        # node target, scopes src/plugin
├── tsconfig.panel.json         # web target, scopes src/panel
├── src/
│   ├── plugin/
│   │   ├── index.ts            # default DevicePlugin + activate(ctx) + deactivate()
│   │   ├── tcp-client.ts       # moved verbatim from src/main
│   │   └── protocol.ts         # moved verbatim from src/main
│   └── panel/
│       ├── index.html          # Vite entry
│       ├── main.tsx
│       ├── App.tsx             # ex-renderer App, minus Settings tab + ConnectionBar
│       ├── components/         # DigitalInputs, DigitalOutputs, LedPanel,
│       │                       # UartPanel, StatusIndicator (new)
│       ├── context/RemoteIOContext.tsx
│       ├── hooks/
│       └── styles/
├── dist/                       # tsup output (gitignored)
├── panel/                      # vite output (gitignored) — served via nodal-plugin://
└── .yalc/                      # yalc local store (gitignored)
```

Deletions: `bin/`, `src/main/index.ts`, `src/main/settings-server.ts`,
`src/preload/`, `src/renderer/index.html`, `electron.vite.config.ts`,
`PACKAGING.md` (host owns packaging now). `react`/`react-dom` move from
runtime deps for the Electron renderer to deps consumed only by the panel
bundle.

## Build pipeline

Two separate bundlers, two output trees, both at the repo root.

### `tsup.config.ts` (plugin worker)

Verbatim from `examples/plugin-device-bridge/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/plugin/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  noExternal: [/.*/],
  banner: {
    js: [
      'import { createRequire as __nodalcoreCreateRequire } from "node:module";',
      'const require = __nodalcoreCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  dts: true,
  sourcemap: false,
  clean: true,
})
```

### `vite.config.ts` (panel)

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/panel',
  base: './',                        // RELATIVE — required for nodal-plugin:// origins
  plugins: [react()],
  build: {
    outDir: '../../panel',           // emits to repo-root /panel
    emptyOutDir: true,
  },
})
```

Relative `base` is critical: the panel HTML is loaded at
`nodal-plugin://<id>/panel/index.html`, so all asset URLs must be relative to
that location. An absolute base would break under the privileged scheme.

### `package.json`

```jsonc
{
  "name": "remote-io-dashboard",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build:plugin": "tsup",
    "build:panel":  "vite build",
    "build":        "pnpm build:plugin && pnpm build:panel",
    "dev:plugin":   "tsup --watch",
    "dev:panel":    "vite build --watch",
    "typecheck":    "tsc --noEmit -p tsconfig.plugin.json && tsc --noEmit -p tsconfig.panel.json"
  },
  "dependencies": {
    "@nodalcore/sdk": "file:.yalc/@nodalcore/sdk",
    "react":     "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "tsup":                  "^8.0.0",
    "vite":                  "^6.0.0",
    "@vitejs/plugin-react":  "^4.0.0",
    "typescript":            "^5.7.0",
    "@types/react":          "^18.0.0",
    "@types/react-dom":      "^18.0.0",
    "@types/json-schema":    "^7.0.15"
  }
}
```

`@nodalcore/sdk` is sourced via yalc — the literal `file:` path is what `yalc
add` writes; it survives `pnpm install`.

## Manifest (`nodal.json`)

```jsonc
{
  "id":         "com.nodalcore.remote-io-dashboard",
  "name":       "Remote IO Dashboard",
  "version":    "0.2.0",
  "sdkVersion": "^0.2.0",
  "type":       "device-bridge",
  "main":       "dist/index.js",
  "connectionType": "tcp",
  "permissions": ["network"],
  "contributes": {
    "configuration": {
      "title": "Remote IO Settings",
      "properties": {
        "host": {
          "type": "string",
          "title": "Device IP",
          "default": "192.168.1.10"
        },
        "portOffset": {
          "type": "integer",
          "title": "Port Offset",
          "description": "Effective TCP port = 8500 + offset",
          "default": 0,
          "minimum": 0,
          "maximum": 65035
        }
      }
    },
    "views": {
      "panel": [
        { "id": "dashboard", "name": "Live Dashboard", "html": "panel/index.html" }
      ]
    }
  },
  "tags": ["io", "tcp", "hardware", "zephyr"]
}
```

## Plugin entry — `src/plugin/index.ts`

Skeleton (full implementation in the plan):

```ts
import type { ConnectionOptions, ExtensionContext } from '@nodalcore/sdk'
import { DevicePlugin } from '@nodalcore/sdk'
import { TcpClient } from './tcp-client.js'
import { /* command builders, parsers */ } from './protocol.js'

let ctxRef: ExtensionContext | null = null
let client: TcpClient | null = null

export default class RemoteIOPlugin extends DevicePlugin {
  readonly connectionType = 'tcp' as const

  async connect(_options: ConnectionOptions): Promise<void> {
    const cfg = await ctxRef!.workspace.getConfiguration()
    const host = (cfg.host as string) ?? '192.168.1.10'
    const portOffset = (cfg.portOffset as number) ?? 0
    client = new TcpClient({ host, port: 8500 + portOffset })
    await client.connect()
    void ctxRef!.views.postMessage('dashboard', {
      type: 'connectionState', state: 'connected',
    }).catch(() => {})
    // wire client events → ctx.views.postMessage('dashboard', …)
  }

  async disconnect(): Promise<void> {
    await client?.close()
    client = null
    void ctxRef!.views.postMessage('dashboard', {
      type: 'connectionState', state: 'disconnected',
    }).catch(() => {})
  }
}

export async function activate(ctx: ExtensionContext): Promise<void> {
  ctxRef = ctx
  ctx.views.onMessage('dashboard', async (raw) => {
    const msg = raw as { type: string; [k: string]: unknown }
    switch (msg.type) {
      case 'getSnapshot':       return getSnapshot()
      case 'setOutput':         return client?.setOutput(msg) ?? { error: 'not connected' }
      case 'setOutputs':        return client?.setOutputs(msg) ?? { error: 'not connected' }
      case 'setLed':            return client?.setLed(msg) ?? { error: 'not connected' }
      case 'setLeds':           return client?.setLeds(msg) ?? { error: 'not connected' }
      case 'uartSend':          return client?.uartSend(msg) ?? { error: 'not connected' }
      case 'subscribeInputs':   return client?.subscribeInputs() ?? { error: 'not connected' }
      case 'unsubscribeInputs': return client?.unsubscribeInputs() ?? { error: 'not connected' }
      default: return { error: `unknown type: ${msg.type}` }
    }
  })
}

export async function deactivate(): Promise<void> {
  await client?.close()
  client = null
  ctxRef = null
}
```

`activate(ctx)` runs once after fork; `connect(options)` opens the socket on
the host's request. Reading config inside `connect` (rather than relying on
`options`) matches the reference example — the host doesn't pre-resolve
plugin-defined config into `ConnectionOptions` today.

## Plugin ↔ panel message protocol

Single slot id `dashboard`. JSON envelopes shaped `{type, ...payload}`.

### Panel → plugin (request/response)

| `type` | Payload | Returns | When |
|---|---|---|---|
| `getSnapshot` | — | `{connection, deviceStatus, inputs[16], outputs[16], leds[25], uart}` | Panel mount + on visibility-becomes-visible |
| `setOutput` | `{index, value}` | `{ok:true}` or `{error}` | User toggles a digital output |
| `setOutputs` | `{mask, values}` | `{ok}` | Bulk set |
| `setLed` | `{index, r, g, b}` | `{ok}` | LED dot |
| `setLeds` | `{values:[...]}` | `{ok}` | LED bulk |
| `uartSend` | `{channel, data}` | `{ok}` | UART tx |
| `subscribeInputs` | — | `{ok}` | Inputs tab focused |
| `unsubscribeInputs` | — | `{ok}` | Inputs tab unfocused / panel hidden |

### Plugin → panel (push)

| `type` | Payload | When |
|---|---|---|
| `connectionState` | `{state:'connected'\|'disconnected', deviceStatus?}` | Connect/Disconnect/error |
| `inputs` | `{values:number[16]}` | Firmware push (when subscribed) |
| `uart` | `{channel, data}` | Firmware UART rx |

### Visibility and backpressure

- Inputs subscription is panel-driven: the existing `App.tsx` already
  subscribes/unsubscribes on `document.hidden`. We keep that.
- UART rx is held in two structures inside the plugin worker:
  1. **Live push throttle** — a 50 ms last-wins coalescer per channel that
     batches incoming bytes into a single `uart` push to the panel. Drops
     intra-window jitter; preserves all bytes (concatenated, not sampled).
  2. **History ring buffer** — a 256-line FIFO per channel, returned in
     `getSnapshot.uart`. A freshly-opened panel reads recent history from
     the snapshot rather than relying on a replay of pushes (which the host
     does not provide on visibility change).
- Plugin → panel pushes resolve `false` if no panel is attached. We
  `void postMessage(...).catch(() => {})` — drop is acceptable; the panel
  will re-snapshot on next mount.

## Lifecycle, errors, IPC plumbing

- `activate(ctx)` runs once after fork. Stashes `ctx` in module scope, wires
  `views.onMessage('dashboard', ...)`. Does **not** open TCP.
- `connect(options)` opens the TCP socket using `host`/`portOffset` from
  `ctx.workspace.getConfiguration()`. On failure, throws — host surfaces it.
  On success, pushes `connectionState:'connected'`.
- `disconnect()` closes the socket and pushes `connectionState:'disconnected'`.
- TCP unexpected close: reset state, push
  `{connectionState, state:'disconnected', deviceStatus:'CONNECTION_LOST'}`.
- Panel-handler exceptions are caught at the SDK transport layer and returned
  as rejected promises (per `host-api.md`).
- Protocol parse errors are logged to the worker's stderr (visible in
  NodalCore logs); the panel sees no state change.
- `getSnapshot` is idempotent and safe before `connect()` — returns
  `connection:'disconnected'`.

The renderer's `window.remoteio` IPC surface (preload bridge) is replaced
end-to-end with `window.nodalcore.{postMessage,onMessage}`. The panel's React
context (`RemoteIOContext`) is rewritten to dispatch on the new surface and
hold the same shape of state. No component logic above the context layer
needs to change.

## Validation

1. `pnpm typecheck` — both tsconfigs pass.
2. `pnpm build` — produces `dist/index.js` (with `.d.ts`) and
   `panel/index.html` plus assets.
3. Loader smoke test:
   ```bash
   node --input-type=module \
     -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"
   ```
   must print `[ 'default', 'activate', 'deactivate' ]` without
   `ERR_MODULE_NOT_FOUND`. Catches missing-bundle imports caused by tsup
   misconfiguration.
4. Install into NodalCore:
   ```bash
   node ~/Workspace/js/NodalCore/apps/cli/dist/index.js \
     plugin install /home/hayman/Workspace/js/remote-io-dashboard
   ```
   (or via `pnpm dev` in NodalCore → Plugins page → Install local.)
5. Functional walkthrough in the desktop app:
   - Open Plugins → Remote IO Dashboard → settings form renders from our
     schema.
   - Fill `host` / `portOffset` → save → click Connect.
   - Switch to Workspace tab → open `Live Dashboard` panel.
   - Toggle a digital output, verify firmware response.
   - Trigger a digital input on the device, verify panel updates.
   - Set an LED color, observe the strip.
   - Send and receive on UART.
   - Pull the network cable, observe `CONNECTION_LOST`.

## Yalc workflow

`@nodalcore/sdk` is not yet on npm. We use yalc as a local registry.

**One-time bootstrap:**
```bash
# In the NodalCore monorepo:
cd ~/Workspace/js/NodalCore
pnpm sdk:publish-local

# In this repo:
cd ~/Workspace/js/remote-io-dashboard
yalc add @nodalcore/sdk
pnpm install
pnpm build
```

**Iteration loop** when the upstream SDK changes:
```
[in NodalCore]                 [here]
edit packages/sdk/src/...
pnpm sdk:publish-local  ──────► yalc auto-pushes
                                pnpm build
```

The yalc-installed SDK is bundled into `dist/index.js` by tsup
(`noExternal: [/.*/]`), so the installed plugin at
`~/.nodalcore/plugins/com.nodalcore.remote-io-dashboard/` runs with no
`node_modules` requirement at runtime.

## Risks and open questions

- **`ConnectionOptions` semantics** are under-specified upstream. Reading
  config inside `connect()` works today (matches the reference), but if
  NodalCore later starts pre-resolving configuration into `options`, our
  `connect()` will need to prefer `options` first and fall back to
  `getConfiguration()`. Single-line change; not a blocker.
- **Panel hot-reload during dev**: the host's `did-finish-load` listener
  destroys child views on every renderer reload, losing transient panel
  state. Mitigation: any state that must survive a host hot-reload goes
  through `ctx.workspace.setConfiguration`. v1 doesn't need this, but UART
  history could be a candidate later.
- **Atomic-upgrade race** on `nodal-plugin://` reads is a known
  upstream fragility. Not addressed here.

## File-by-file change summary

| Path | Change |
|---|---|
| `nodal.json` | Rewritten to SDK 0.2.0 device-bridge shape with `contributes` block |
| `package.json` | Drop electron, electron-vite; add tsup, vite, @vitejs/plugin-react; pin SDK via yalc |
| `tsup.config.ts` | New — copy of reference plugin's config with our entry |
| `vite.config.ts` | New — panel build, relative base, output to `panel/` |
| `tsconfig.plugin.json` | New — node target, `src/plugin/**` |
| `tsconfig.panel.json` | New — web target, `src/panel/**` |
| `src/plugin/index.ts` | New — default `DevicePlugin` + `activate(ctx)` + `deactivate()` |
| `src/plugin/tcp-client.ts` | Move verbatim from `src/main/tcp-client.ts` (plain Node EventEmitter, no Electron dependency) |
| `src/plugin/protocol.ts` | Move from `src/main/protocol.ts` unchanged |
| `src/panel/index.html` | Move from `src/renderer/index.html` |
| `src/panel/main.tsx` | Move from `src/renderer/main.tsx` |
| `src/panel/App.tsx` | Move + edit: drop Settings tab and ConnectionBar (replace with StatusIndicator) |
| `src/panel/components/StatusIndicator.tsx` | New — read-only connection status pill |
| `src/panel/components/{DigitalInputs,DigitalOutputs,LedPanel,UartPanel}.tsx` | Move from `src/renderer/components/`; update IPC calls to `window.nodalcore.postMessage` |
| `src/panel/components/{ConnectionBar,DeviceSettings,AlertPage}.tsx` | Delete |
| `src/panel/context/RemoteIOContext.tsx` | Move + rewrite IPC layer to `window.nodalcore` |
| `src/panel/hooks/`, `src/panel/styles/`, `src/panel/types/` | Move from `src/renderer/` |
| `src/main/`, `src/preload/`, `src/renderer/` | Delete |
| `bin/start.js`, `electron.vite.config.ts`, `PACKAGING.md` | Delete |
| `.gitignore` | Add `dist/`, `panel/`, `.yalc/`, `yalc.lock` |
| `README.md` | New — yalc bootstrap, build, install-into-NodalCore steps |
