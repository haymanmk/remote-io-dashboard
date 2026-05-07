# NodalCore Device-Bridge Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the standalone Electron Remote IO Dashboard into a NodalCore SDK 0.2.0 device-bridge plugin (`connectionType: "tcp"`) with the React UI repackaged as a single panel webview. Drop Electron from this repo entirely.

**Architecture:** Two output trees at the repo root: `dist/` (tsup-bundled plugin worker that NodalCore forks) and `panel/` (Vite-built React panel served via `nodal-plugin://`). The plugin worker owns the TCP socket and translates panel↔device messages over `ctx.views.{onMessage,postMessage}`. Settings (host/portOffset) are host-managed via `contributes.configuration`.

**Tech Stack:** TypeScript 5.7 (ESM), Node 20, React 18, Vite 6, tsup 8, Vitest 1, `@nodalcore/sdk` 0.2.0 (consumed via yalc).

**Spec:** `docs/superpowers/specs/2026-05-07-nodalcore-device-bridge-refactor-design.md`

**Out-of-scope (intentional drops vs. current Electron app):** system tray, critical-status alert window, auto-connect/auto-reconnect logic, in-app device-firmware-settings tab. The host owns Connect/Disconnect; alerts can be re-added later via `ctx.window.showMessage`.

**Out-of-scope (vs. spec):** the spec lists `setOutputs` (bulk W4) and `setLeds` (bulk W8) in the panel→plugin protocol table. The reference protocol (`useCommands.ts`) has no bulk commands today, so v1 omits them; any "Set All / Fill All" UI loops the per-element command. Adding bulk writes is a follow-up once the firmware contract for them is confirmed.

---

## File structure

After this plan, the repo looks like:

```
remote-io-dashboard/
├── nodal.json                        (rewritten — task 8)
├── package.json                      (rewritten — task 2)
├── tsconfig.json                     (new — task 6)
├── tsconfig.plugin.json              (new — task 6)
├── tsconfig.panel.json               (new — task 6)
├── tsup.config.ts                    (new — task 4)
├── vite.config.ts                    (new — task 5)
├── vitest.config.ts                  (new — task 7)
├── .gitignore                        (modified — task 1)
├── README.md                         (new — task 25)
├── src/
│   ├── plugin/
│   │   ├── index.ts                  (new — task 13)
│   │   ├── tcp-client.ts             (moved — task 9)
│   │   ├── protocol.ts               (moved — task 9)
│   │   ├── uart-throttle.ts          (new + tests — task 10)
│   │   ├── uart-ring-buffer.ts       (new + tests — task 11)
│   │   └── dispatcher.ts             (new + tests — task 12)
│   └── panel/
│       ├── index.html                (moved — task 15)
│       ├── main.tsx                  (rewritten — task 15)
│       ├── App.tsx                   (rewritten — task 23)
│       ├── components/
│       │   ├── StatusIndicator.tsx   (new — task 18)
│       │   ├── DigitalInputs.tsx     (moved+adapted — task 19)
│       │   ├── DigitalOutputs.tsx    (moved+adapted — task 20)
│       │   ├── LedPanel.tsx          (moved+adapted — task 21)
│       │   └── UartPanel.tsx         (moved+adapted — task 22)
│       ├── context/
│       │   └── RemoteIOContext.tsx   (rewritten — task 17)
│       ├── styles/                   (moved — task 15)
│       └── types/
│           └── global.d.ts           (new — task 16)
└── (deleted in task 24:)
    ├── bin/
    ├── electron.vite.config.ts
    ├── PACKAGING.md
    ├── src/main/
    ├── src/preload/
    └── src/renderer/
```

Tests live alongside their source as `*.test.ts` (vitest convention).

---

## Phase 0: Scaffolding

### Task 1: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Read existing `.gitignore`**

```bash
cat .gitignore
```

- [ ] **Step 2: Append plugin-specific ignores**

Append these lines (avoid duplicates if any already exist):

```
# Build outputs
dist/
panel/
out/

# Yalc local SDK store
.yalc/
yalc.lock

# Vite cache
node_modules/.vite/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore dist/, panel/, .yalc/ for plugin layout"
```

---

### Task 2: Rewrite `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace contents**

Overwrite `package.json` with:

```json
{
  "name": "remote-io-dashboard",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build:plugin": "tsup",
    "build:panel": "vite build",
    "build": "pnpm build:plugin && pnpm build:panel",
    "dev:plugin": "tsup --watch",
    "dev:panel": "vite build --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.plugin.json && tsc --noEmit -p tsconfig.panel.json"
  },
  "dependencies": {
    "@nodalcore/sdk": "file:.yalc/@nodalcore/sdk",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/json-schema": "^7.0.15",
    "@types/node": "^22.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Verify file is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json'))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit (do not run pnpm install yet — yalc must come first)**

```bash
git add package.json
git commit -m "chore(deps): swap electron stack for tsup+vite+vitest plugin layout"
```

---

### Task 3: Yalc bootstrap of `@nodalcore/sdk`

**Files:** none (filesystem state only)

- [ ] **Step 1: Verify `yalc` is installed**

```bash
which yalc || echo "MISSING"
```

Expected: a path. If `MISSING`, install it: `npm i -g yalc`.

- [ ] **Step 2: Publish SDK from NodalCore monorepo to local yalc store**

```bash
cd ~/Workspace/js/NodalCore && pnpm sdk:publish-local
```

Expected output ends with something like `@nodalcore/sdk@0.2.0+<hash> published in store.`

- [ ] **Step 3: Add SDK to this project**

```bash
cd ~/Workspace/js/remote-io-dashboard && yalc add @nodalcore/sdk
```

This rewrites `package.json`'s `@nodalcore/sdk` entry to point at `.yalc/@nodalcore/sdk` (already what we wrote in Task 2 — yalc will leave it as-is).

- [ ] **Step 4: Install all deps**

```bash
pnpm install
```

Expected: completes without errors. `node_modules/@nodalcore/sdk/` exists and is a symlink/copy of `.yalc/@nodalcore/sdk`.

- [ ] **Step 5: Verify SDK exports are reachable**

```bash
node --input-type=module -e "import('@nodalcore/sdk').then(m => console.log(Object.keys(m).slice(0, 10)))"
```

Expected: includes `DevicePlugin`, `createIpcTransport`, `createExtensionContext` (or similar — at minimum `DevicePlugin` must be present).

- [ ] **Step 6: Commit**

```bash
git add yalc.lock package.json pnpm-lock.yaml
git commit -m "chore(deps): pin @nodalcore/sdk via yalc"
```

(`yalc.lock` is gitignored per task 1; if it shows up untracked that's fine, just don't add it.)

---

### Task 4: Add `tsup.config.ts`

**Files:**
- Create: `tsup.config.ts`

- [ ] **Step 1: Create the config**

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

- [ ] **Step 2: Commit**

```bash
git add tsup.config.ts
git commit -m "build: tsup config for device-bridge plugin worker"
```

---

### Task 5: Add `vite.config.ts` and panel HTML stub

**Files:**
- Create: `vite.config.ts`
- Create: `src/panel/index.html`

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/panel',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../panel',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 2: Create `src/panel/index.html` (placeholder — replaced in Task 15)**

```bash
mkdir -p src/panel
```

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Remote IO Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts src/panel/index.html
git commit -m "build: vite config + html stub for nodal-plugin:// panel"
```

---

### Task 6: Add tsconfigs

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.plugin.json`
- Create: `tsconfig.panel.json`

- [ ] **Step 1: Create `tsconfig.json` (root, used by editors)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.plugin.json" },
    { "path": "./tsconfig.panel.json" }
  ]
}
```

- [ ] **Step 2: Create `tsconfig.plugin.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"],
    "composite": true,
    "rootDir": "./src/plugin"
  },
  "include": ["src/plugin/**/*.ts"]
}
```

- [ ] **Step 3: Create `tsconfig.panel.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": [],
    "composite": true,
    "rootDir": "./src/panel"
  },
  "include": ["src/panel/**/*.ts", "src/panel/**/*.tsx"]
}
```

- [ ] **Step 4: Verify both compile cleanly (will be empty so far — that's fine)**

```bash
pnpm typecheck
```

Expected: completes with exit 0 (no `.ts` files yet to fail on).

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.plugin.json tsconfig.panel.json
git commit -m "build: split tsconfigs for node plugin vs web panel"
```

---

### Task 7: Add `vitest.config.ts`

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create the config**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 2: Verify vitest is callable**

```bash
pnpm test
```

Expected: `No test files found` (exit 0 or 1 depending on vitest version — either is fine; we just want to confirm vitest itself runs).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "build: vitest config for plugin unit tests"
```

---

## Phase 1: Manifest

### Task 8: Rewrite `nodal.json`

**Files:**
- Modify: `nodal.json`

- [ ] **Step 1: Replace contents**

```json
{
  "id": "com.nodalcore.remote-io-dashboard",
  "name": "Remote IO Dashboard",
  "version": "0.2.0",
  "sdkVersion": "^0.2.0",
  "type": "device-bridge",
  "main": "dist/index.js",
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
  "author": "Remote IO Dashboard",
  "tags": ["io", "tcp", "hardware", "zephyr"]
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('nodal.json'))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add nodal.json
git commit -m "feat(manifest): SDK 0.2.0 device-bridge with tcp + dashboard panel"
```

---

## Phase 2: Plugin worker

### Task 9: Move `tcp-client.ts` and `protocol.ts` into `src/plugin/`

**Files:**
- Move: `src/main/tcp-client.ts` → `src/plugin/tcp-client.ts`
- Move: `src/main/protocol.ts` → `src/plugin/protocol.ts`

- [ ] **Step 1: Move with git so history is preserved**

```bash
mkdir -p src/plugin
git mv src/main/tcp-client.ts src/plugin/tcp-client.ts
git mv src/main/protocol.ts   src/plugin/protocol.ts
```

- [ ] **Step 2: Verify imports inside both files still resolve**

These files only import `node:net`, `node:events`, and `./protocol.js` (within tcp-client). After the move both targets sit in `src/plugin/`, so the relative import is unchanged.

```bash
grep -nE "^import" src/plugin/tcp-client.ts src/plugin/protocol.ts
```

Expected: no cross-folder imports outside of `node:*` and `./protocol.js`.

- [ ] **Step 3: Typecheck (plugin only — panel still empty)**

```bash
pnpm tsc --noEmit -p tsconfig.plugin.json
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: move tcp-client and protocol under src/plugin/"
```

---

### Task 10: UART throttle (test-first)

**Background:** Per the spec, UART rx pushes to the panel are coalesced by a 50 ms last-wins window per channel. Bytes are concatenated within the window (lossless within the batch, just batched in time).

**Files:**
- Create: `src/plugin/uart-throttle.ts`
- Test: `src/plugin/uart-throttle.test.ts`

- [ ] **Step 1: Write the failing test**

`src/plugin/uart-throttle.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UartThrottle } from './uart-throttle.js'

describe('UartThrottle', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('emits a single batch per channel within a window', () => {
    const flushed: Array<{ channel: number; data: string }> = []
    const t = new UartThrottle(50, (channel, data) => { flushed.push({ channel, data }) })
    t.push(0, 'he')
    t.push(0, 'llo')
    expect(flushed).toEqual([])     // not yet flushed
    vi.advanceTimersByTime(50)
    expect(flushed).toEqual([{ channel: 0, data: 'hello' }])
  })

  it('keeps channels independent', () => {
    const flushed: Array<{ channel: number; data: string }> = []
    const t = new UartThrottle(50, (channel, data) => { flushed.push({ channel, data }) })
    t.push(0, 'A')
    t.push(1, 'B')
    vi.advanceTimersByTime(50)
    expect(flushed).toEqual([
      { channel: 0, data: 'A' },
      { channel: 1, data: 'B' },
    ])
  })

  it('starts a fresh window after flush', () => {
    const flushed: Array<{ channel: number; data: string }> = []
    const t = new UartThrottle(50, (channel, data) => { flushed.push({ channel, data }) })
    t.push(0, 'A')
    vi.advanceTimersByTime(50)
    t.push(0, 'B')
    vi.advanceTimersByTime(50)
    expect(flushed).toEqual([
      { channel: 0, data: 'A' },
      { channel: 0, data: 'B' },
    ])
  })

  it('dispose clears pending timers without emitting', () => {
    const flushed: Array<{ channel: number; data: string }> = []
    const t = new UartThrottle(50, (channel, data) => { flushed.push({ channel, data }) })
    t.push(0, 'pending')
    t.dispose()
    vi.advanceTimersByTime(100)
    expect(flushed).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test — must FAIL with module-not-found**

```bash
pnpm test
```

Expected: failure. The error references `Cannot find module './uart-throttle.js'` (or similar TS resolution error).

- [ ] **Step 3: Write the implementation**

`src/plugin/uart-throttle.ts`:

```ts
type Flush = (channel: number, data: string) => void

export class UartThrottle {
  private buffers = new Map<number, string>()
  private timers  = new Map<number, ReturnType<typeof setTimeout>>()

  constructor(private readonly windowMs: number, private readonly onFlush: Flush) {}

  push(channel: number, data: string): void {
    this.buffers.set(channel, (this.buffers.get(channel) ?? '') + data)
    if (this.timers.has(channel)) return
    this.timers.set(channel, setTimeout(() => this.flush(channel), this.windowMs))
  }

  private flush(channel: number): void {
    const data = this.buffers.get(channel)
    this.buffers.delete(channel)
    this.timers.delete(channel)
    if (data !== undefined) this.onFlush(channel, data)
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    this.buffers.clear()
  }
}
```

- [ ] **Step 4: Run tests — all four pass**

```bash
pnpm test
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/plugin/uart-throttle.ts src/plugin/uart-throttle.test.ts
git commit -m "feat(plugin): UART per-channel 50ms throttle for panel pushes"
```

---

### Task 11: UART ring buffer (test-first)

**Background:** Per the spec, a 256-line FIFO per channel is held in the worker and returned in the `getSnapshot` reply so a freshly-opened panel sees recent UART history.

**Files:**
- Create: `src/plugin/uart-ring-buffer.ts`
- Test: `src/plugin/uart-ring-buffer.test.ts`

- [ ] **Step 1: Write the failing test**

`src/plugin/uart-ring-buffer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { UartRingBuffer } from './uart-ring-buffer.js'

describe('UartRingBuffer', () => {
  it('stores up to capacity per channel', () => {
    const rb = new UartRingBuffer(3)
    rb.push(0, 'a'); rb.push(0, 'b'); rb.push(0, 'c')
    expect(rb.snapshot(0)).toEqual(['a', 'b', 'c'])
  })

  it('drops oldest when over capacity', () => {
    const rb = new UartRingBuffer(3)
    rb.push(0, 'a'); rb.push(0, 'b'); rb.push(0, 'c'); rb.push(0, 'd')
    expect(rb.snapshot(0)).toEqual(['b', 'c', 'd'])
  })

  it('keeps channels independent', () => {
    const rb = new UartRingBuffer(2)
    rb.push(0, 'a'); rb.push(1, 'x'); rb.push(0, 'b'); rb.push(1, 'y')
    expect(rb.snapshot(0)).toEqual(['a', 'b'])
    expect(rb.snapshot(1)).toEqual(['x', 'y'])
  })

  it('snapshot returns a copy (mutation does not affect the buffer)', () => {
    const rb = new UartRingBuffer(3)
    rb.push(0, 'a')
    const snap = rb.snapshot(0)
    snap.push('mutated')
    expect(rb.snapshot(0)).toEqual(['a'])
  })

  it('returns empty array for unknown channel', () => {
    const rb = new UartRingBuffer(3)
    expect(rb.snapshot(0)).toEqual([])
  })
})
```

- [ ] **Step 2: Run — must FAIL**

```bash
pnpm test src/plugin/uart-ring-buffer.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Implement**

`src/plugin/uart-ring-buffer.ts`:

```ts
export class UartRingBuffer {
  private buffers = new Map<number, string[]>()

  constructor(private readonly capacity: number) {}

  push(channel: number, line: string): void {
    let buf = this.buffers.get(channel)
    if (!buf) { buf = []; this.buffers.set(channel, buf) }
    buf.push(line)
    if (buf.length > this.capacity) buf.splice(0, buf.length - this.capacity)
  }

  snapshot(channel: number): string[] {
    return [...(this.buffers.get(channel) ?? [])]
  }

  clear(): void {
    this.buffers.clear()
  }
}
```

- [ ] **Step 4: Run — passes**

```bash
pnpm test src/plugin/uart-ring-buffer.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/plugin/uart-ring-buffer.ts src/plugin/uart-ring-buffer.test.ts
git commit -m "feat(plugin): UART ring buffer (256-line history per channel)"
```

---

### Task 12: Panel-message dispatcher (test-first)

**Background:** Decouple message routing from `activate(ctx)` so we can unit-test the protocol mapping without a real `ctx`. The dispatcher is a pure function from `(msg) → Promise<reply>`, parameterized over a `RemoteIOClient`-shaped command surface.

**Files:**
- Create: `src/plugin/dispatcher.ts`
- Test: `src/plugin/dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

`src/plugin/dispatcher.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createDispatcher, type DispatcherDeps } from './dispatcher.js'
import type { ParsedReply } from './protocol.js'

function makeDeps(overrides: Partial<DispatcherDeps> = {}): DispatcherDeps {
  return {
    sendCommand: vi.fn(async () => ({ kind: 'write', id: 0 } as ParsedReply)),
    isConnected: () => true,
    snapshot: () => ({
      connection: 'connected',
      deviceStatus: 'OK',
      inputs:  Array<boolean>(16).fill(false),
      outputs: Array<boolean>(16).fill(false),
      leds: Array.from({ length: 25 }, () => ({ r: 0, g: 0, b: 0 })),
      uart: { 0: [], 1: [] },
    }),
    ...overrides,
  }
}

describe('createDispatcher', () => {
  it('getSnapshot returns the snapshot regardless of connection state', async () => {
    const deps = makeDeps({ isConnected: () => false })
    const dispatch = createDispatcher(deps)
    const reply = await dispatch({ type: 'getSnapshot' })
    expect(reply).toMatchObject({ connection: 'connected' /* whatever snapshot says */ })
  })

  it('setOutput issues W4 with index+value when connected', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 4 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    const reply = await dispatch({ type: 'setOutput', index: 3, value: 1 })
    expect(send).toHaveBeenCalledWith('W', 4, null, 3, 1)
    expect(reply).toEqual({ ok: true })
  })

  it('setOutput rejects with {error} when disconnected', async () => {
    const send = vi.fn()
    const dispatch = createDispatcher(makeDeps({ isConnected: () => false, sendCommand: send }))
    const reply = await dispatch({ type: 'setOutput', index: 3, value: 1 })
    expect(send).not.toHaveBeenCalled()
    expect(reply).toEqual({ error: 'not connected' })
  })

  it('subscribeInputs issues W5 with all 16 pins', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 5 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    await dispatch({ type: 'subscribeInputs' })
    expect(send).toHaveBeenCalledWith('W', 5, null,
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    )
  })

  it('unsubscribeInputs issues W6 with all 16 pins', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 6 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    await dispatch({ type: 'unsubscribeInputs' })
    expect(send).toHaveBeenCalledWith('W', 6, null,
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    )
  })

  it('uartSend issues W7.<channel> <length> <data> matching firmware framing', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 7 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    await dispatch({ type: 'uartSend', channel: 1, data: 'hello' })
    expect(send).toHaveBeenCalledWith('W', 7, 1, 5, 'hello')
  })

  it('setLed issues W8 with index, r, g, b', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 8 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    await dispatch({ type: 'setLed', index: 0, r: 255, g: 64, b: 0 })
    expect(send).toHaveBeenCalledWith('W', 8, null, 0, 255, 64, 0)
  })

  it('unknown type returns an error envelope', async () => {
    const dispatch = createDispatcher(makeDeps())
    const reply = await dispatch({ type: 'whoops' } as any)
    expect(reply).toEqual({ error: 'unknown type: whoops' })
  })

  it('command failures surface as {error: <message>}', async () => {
    const send = vi.fn(async () => { throw new Error('Device error ERR221') })
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    const reply = await dispatch({ type: 'setOutput', index: 0, value: 1 })
    expect(reply).toEqual({ error: 'Device error ERR221' })
  })
})
```

- [ ] **Step 2: Run — must FAIL**

```bash
pnpm test src/plugin/dispatcher.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

`src/plugin/dispatcher.ts`:

```ts
import type { CommandType, ParsedReply } from './protocol.js'

export interface PanelSnapshot {
  connection: 'connected' | 'disconnected'
  deviceStatus: string | null
  inputs: boolean[]
  outputs: boolean[]
  leds: Array<{ r: number; g: number; b: number }>
  uart: Record<number, string[]>
}

export interface DispatcherDeps {
  sendCommand: (
    type: CommandType,
    id: number,
    variant: number | null,
    ...params: (string | number)[]
  ) => Promise<ParsedReply>
  isConnected: () => boolean
  snapshot: () => PanelSnapshot
}

export type PanelMessage =
  | { type: 'getSnapshot' }
  | { type: 'setOutput';   index: number; value: 0 | 1 }
  | { type: 'setLed';      index: number; r: number; g: number; b: number }
  | { type: 'uartSend';    channel: number; data: string }
  | { type: 'subscribeInputs' }
  | { type: 'unsubscribeInputs' }

const ALL_PINS = Array.from({ length: 16 }, (_, i) => i + 1)

export function createDispatcher(deps: DispatcherDeps) {
  return async (raw: unknown): Promise<unknown> => {
    const msg = raw as PanelMessage
    if (msg?.type === 'getSnapshot') return deps.snapshot()
    if (!deps.isConnected()) return { error: 'not connected' }
    try {
      switch (msg.type) {
        case 'setOutput':
          await deps.sendCommand('W', 4, null, msg.index, msg.value)
          return { ok: true }
        case 'setLed':
          await deps.sendCommand('W', 8, null, msg.index, msg.r, msg.g, msg.b)
          return { ok: true }
        case 'uartSend':
          await deps.sendCommand('W', 7, msg.channel, msg.data.length, msg.data)
          return { ok: true }
        case 'subscribeInputs':
          await deps.sendCommand('W', 5, null, ...ALL_PINS)
          return { ok: true }
        case 'unsubscribeInputs':
          await deps.sendCommand('W', 6, null, ...ALL_PINS)
          return { ok: true }
        default:
          return { error: `unknown type: ${(msg as { type?: string })?.type ?? 'undefined'}` }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }
}
```

- [ ] **Step 4: Run tests — all 9 pass**

```bash
pnpm test src/plugin/dispatcher.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/plugin/dispatcher.ts src/plugin/dispatcher.test.ts
git commit -m "feat(plugin): panel-message dispatcher (pure, tested)"
```

---

### Task 13: Plugin entry — `src/plugin/index.ts`

**Background:** Wires together `RemoteIOClient`, `createDispatcher`, `UartThrottle`, `UartRingBuffer`, and `ctx` into the device-bridge contract.

**Files:**
- Create: `src/plugin/index.ts`

- [ ] **Step 1: Create the file**

```ts
import type { ConnectionOptions, ExtensionContext } from '@nodalcore/sdk'
import { DevicePlugin } from '@nodalcore/sdk'
import { RemoteIOClient } from './tcp-client.js'
import { createDispatcher, type PanelSnapshot } from './dispatcher.js'
import { UartThrottle } from './uart-throttle.js'
import { UartRingBuffer } from './uart-ring-buffer.js'
import { parseBitfield } from './protocol.js'

const SLOT = 'dashboard'
const UART_THROTTLE_MS = 50
const UART_HISTORY_LINES = 256

let ctxRef: ExtensionContext | null = null
const client = new RemoteIOClient()
const uartHistory = new UartRingBuffer(UART_HISTORY_LINES)
let uartThrottle: UartThrottle | null = null

let lastInputs:  boolean[]      = Array<boolean>(16).fill(false)
let lastOutputs: boolean[]      = Array<boolean>(16).fill(false)
let lastLeds:    Array<{ r: number; g: number; b: number }> =
  Array.from({ length: 25 }, () => ({ r: 0, g: 0, b: 0 }))
let lastStatus:  string | null  = null

function pushToPanel(payload: unknown): void {
  if (!ctxRef) return
  void ctxRef.views.postMessage(SLOT, payload).catch(() => { /* panel not open */ })
}

function snapshot(): PanelSnapshot {
  return {
    connection: client.connected ? 'connected' : 'disconnected',
    deviceStatus: lastStatus,
    inputs:  [...lastInputs],
    outputs: [...lastOutputs],
    leds:    lastLeds.map((v) => ({ ...v })),
    uart: {
      0: uartHistory.snapshot(0),
      1: uartHistory.snapshot(1),
    },
  }
}

const dispatch = createDispatcher({
  sendCommand: (type, id, variant, ...params) =>
    client.sendCommand(type, id, variant, ...params),
  isConnected: () => client.connected,
  snapshot,
})

export default class RemoteIOPlugin extends DevicePlugin {
  readonly connectionType = 'tcp' as const

  async connect(_options: ConnectionOptions): Promise<void> {
    const cfg = await ctxRef!.workspace.getConfiguration()
    const host = (cfg.host as string | undefined) ?? '192.168.1.10'
    const portOffset = (cfg.portOffset as number | undefined) ?? 0
    const port = 8500 + portOffset

    await client.connect(host, port)

    // Hydrate state with the same R3/R4/R1 sequence the old main process used.
    try {
      const inR  = await client.sendCommand('R', 3, null, -1)
      lastInputs  = inR.kind  === 'read' ? parseBitfield(inR.values)  : Array<boolean>(16).fill(false)
      const outR = await client.sendCommand('R', 4, null, -1)
      lastOutputs = outR.kind === 'read' ? parseBitfield(outR.values) : Array<boolean>(16).fill(false)
      const stR  = await client.sendCommand('R', 1, null)
      lastStatus = stR.kind  === 'read' ? (stR.values[0] ?? '') : ''
    } catch {
      // Hydration failures are non-fatal; the panel will retry via getSnapshot.
    }

    pushToPanel({ type: 'connectionState', state: 'connected', deviceStatus: lastStatus })
  }

  async disconnect(): Promise<void> {
    client.disconnect()
    pushToPanel({ type: 'connectionState', state: 'disconnected' })
  }
}

export async function activate(ctx: ExtensionContext): Promise<void> {
  ctxRef = ctx

  uartThrottle = new UartThrottle(UART_THROTTLE_MS, (channel, data) => {
    pushToPanel({ type: 'uart', channel, data })
  })

  ctx.views.onMessage(SLOT, dispatch)

  client.on('inputChange', (data: { pin: number; state: boolean }) => {
    lastInputs = [...lastInputs]
    lastInputs[data.pin - 1] = data.state
    pushToPanel({ type: 'inputs', values: lastInputs })
  })

  client.on('uartData', (data: { channel: number; payload: string }) => {
    uartHistory.push(data.channel, data.payload)
    uartThrottle!.push(data.channel, data.payload)
  })

  client.on('statusUpdate', (status: string) => {
    lastStatus = status
    pushToPanel({ type: 'connectionState', state: 'connected', deviceStatus: status })
  })

  client.on('close', () => {
    lastStatus = null
    pushToPanel({ type: 'connectionState', state: 'disconnected', deviceStatus: 'CONNECTION_LOST' })
  })

  await ctx.window.showMessage('Remote IO plugin activated')
}

export async function deactivate(): Promise<void> {
  client.disconnect()
  uartThrottle?.dispose()
  uartThrottle = null
  uartHistory.clear()
  ctxRef = null
}
```

- [ ] **Step 2: Typecheck plugin**

```bash
pnpm tsc --noEmit -p tsconfig.plugin.json
```

Expected: exit 0.

- [ ] **Step 3: Run all tests (regression check)**

```bash
pnpm test
```

Expected: all earlier tests still pass; `index.ts` itself has no tests.

- [ ] **Step 4: Commit**

```bash
git add src/plugin/index.ts
git commit -m "feat(plugin): activate(ctx) + DevicePlugin wiring with TCP/views/UART throttle"
```

---

### Task 14: Build the plugin bundle and run a loader smoke test

**Files:** none (verification only)

- [ ] **Step 1: Build plugin only**

```bash
pnpm build:plugin
```

Expected: `dist/index.js` and `dist/index.d.ts` are produced. No errors.

- [ ] **Step 2: Loader smoke test**

```bash
node --input-type=module \
  -e "import('./dist/index.js').then(m => console.log(Object.keys(m).sort().join(',')))"
```

Expected output exactly:

```
activate,deactivate,default
```

If you get `ERR_MODULE_NOT_FOUND` for any module, tsup's `noExternal: [/.*/]` is misconfigured — re-check `tsup.config.ts`.

- [ ] **Step 3: Confirm bundle is self-contained**

```bash
grep -cE "from ['\"]@nodalcore/sdk['\"]" dist/index.js || echo "OK (no external SDK imports)"
```

Expected: `OK (no external SDK imports)`. If grep finds matches, the bundle still has bare imports — tsup config is wrong.

- [ ] **Step 4: Commit a checkpoint (no code change, but mark verification)**

No commit needed — this task is verification only. Move on.

---

## Phase 3: Panel migration

### Task 15: Panel entry stub — `main.tsx`, `index.html`, `styles/`

**Files:**
- Modify: `src/panel/index.html`
- Create: `src/panel/main.tsx`
- Move: `src/renderer/styles/` → `src/panel/styles/`

- [ ] **Step 1: Move CSS**

```bash
git mv src/renderer/styles src/panel/styles
```

- [ ] **Step 2: Replace `src/panel/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Remote IO Dashboard</title>
    <link rel="stylesheet" href="./styles/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

(If the existing CSS file is named differently than `styles/index.css`, adjust the `href`. Run `ls src/panel/styles/` to confirm.)

- [ ] **Step 3: Create `src/panel/main.tsx` (stub — full app wired in Task 23)**

```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')
createRoot(root).render(<App />)
```

- [ ] **Step 4: Create a tiny `src/panel/App.tsx` placeholder so vite has something to bundle**

```tsx
export function App() {
  return <div style={{ padding: 24 }}>Remote IO Dashboard — loading…</div>
}
```

- [ ] **Step 5: Build the panel**

```bash
pnpm build:panel
```

Expected: `panel/index.html` plus `panel/assets/...` produced. All asset URLs in `panel/index.html` should be **relative** (start with `./` or `assets/`). Verify:

```bash
grep -E 'src=|href=' panel/index.html
```

Expected: no `/assets/...` (absolute) — only `./assets/...` or `assets/...`.

- [ ] **Step 6: Commit**

```bash
git add src/panel/index.html src/panel/main.tsx src/panel/App.tsx
git add src/panel/styles
git rm -r src/renderer/styles 2>/dev/null || true   # already moved by git mv
git commit -m "feat(panel): vite entry + placeholder App + ported styles"
```

---

### Task 16: `window.nodalcore` type declarations

**Files:**
- Create: `src/panel/types/global.d.ts`

- [ ] **Step 1: Create the file**

```ts
export {}

declare global {
  interface Window {
    nodalcore: {
      postMessage(data: unknown): Promise<unknown>
      onMessage(handler: (data: unknown) => void): () => void
    }
  }
}
```

- [ ] **Step 2: Typecheck panel**

```bash
pnpm tsc --noEmit -p tsconfig.panel.json
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/panel/types/global.d.ts
git commit -m "feat(panel): window.nodalcore type declaration"
```

---

### Task 17: Rewrite `RemoteIOContext.tsx` over `window.nodalcore`

**Background:** The existing context (`src/renderer/context/RemoteIOContext.tsx`) speaks to `window.remoteio.*` via the Electron preload bridge. We rewrite it to use `window.nodalcore.{postMessage,onMessage}`.

**Files:**
- Create: `src/panel/context/RemoteIOContext.tsx`
- (After this task, the old file at `src/renderer/context/RemoteIOContext.tsx` is no longer referenced; it's deleted in Task 24.)

- [ ] **Step 1: Read the existing context to preserve its public shape**

```bash
cat src/renderer/context/RemoteIOContext.tsx
```

Note the exported `useRemoteIO()` return shape so consuming components don't change.

- [ ] **Step 2: Create the new context**

```bash
mkdir -p src/panel/context
```

`src/panel/context/RemoteIOContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'

type ConnectionState = 'connected' | 'disconnected'
type LedRgb = { r: number; g: number; b: number }

export interface RemoteIOState {
  connection: ConnectionState
  deviceStatus: string | null
  inputs:  boolean[]
  outputs: boolean[]
  leds:    LedRgb[]
  uart:    Record<number, string[]>
}

const INITIAL_STATE: RemoteIOState = {
  connection: 'disconnected',
  deviceStatus: null,
  inputs:  Array<boolean>(16).fill(false),
  outputs: Array<boolean>(16).fill(false),
  leds:    Array.from({ length: 25 }, () => ({ r: 0, g: 0, b: 0 })),
  uart:    { 0: [], 1: [] },
}

type Action =
  | { type: 'snapshot'; snapshot: RemoteIOState }
  | { type: 'connectionState'; state: ConnectionState; deviceStatus?: string | null }
  | { type: 'inputs'; values: boolean[] }
  | { type: 'uart'; channel: number; data: string }
  | { type: 'localSetOutput'; index: number; value: 0 | 1 }
  | { type: 'localSetLed'; index: number; r: number; g: number; b: number }

function reducer(state: RemoteIOState, action: Action): RemoteIOState {
  switch (action.type) {
    case 'snapshot':
      return { ...action.snapshot }
    case 'connectionState':
      return { ...state, connection: action.state, deviceStatus: action.deviceStatus ?? state.deviceStatus }
    case 'inputs':
      return { ...state, inputs: [...action.values] }
    case 'uart': {
      const next = { ...state.uart, [action.channel]: [...(state.uart[action.channel] ?? []), action.data] }
      return { ...state, uart: next }
    }
    case 'localSetOutput': {
      const next = [...state.outputs]
      next[action.index - 1] = action.value === 1
      return { ...state, outputs: next }
    }
    case 'localSetLed': {
      const next = [...state.leds]
      next[action.index] = { r: action.r, g: action.g, b: action.b }
      return { ...state, leds: next }
    }
    default:
      return state
  }
}

interface ContextValue {
  state: RemoteIOState
  send:  <T = unknown>(msg: { type: string; [k: string]: unknown }) => Promise<T>
  setOutput: (index: number, value: 0 | 1) => Promise<void>
  setLed:    (index: number, r: number, g: number, b: number) => Promise<void>
  uartSend:  (channel: number, data: string) => Promise<void>
  subscribeInputs:   () => Promise<void>
  unsubscribeInputs: () => Promise<void>
}

const Ctx = createContext<ContextValue | null>(null)

export function RemoteIOProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  // Initial snapshot
  useEffect(() => {
    let alive = true
    void window.nodalcore.postMessage({ type: 'getSnapshot' }).then((snap) => {
      if (alive && snap) dispatch({ type: 'snapshot', snapshot: snap as RemoteIOState })
    })
    return () => { alive = false }
  }, [])

  // Subscribe to plugin pushes
  useEffect(() => {
    const off = window.nodalcore.onMessage((raw) => {
      const msg = raw as { type: string; [k: string]: unknown }
      if (msg.type === 'connectionState') {
        dispatch({
          type: 'connectionState',
          state: msg.state as ConnectionState,
          deviceStatus: (msg.deviceStatus as string | null | undefined) ?? null,
        })
      } else if (msg.type === 'inputs') {
        dispatch({ type: 'inputs', values: msg.values as boolean[] })
      } else if (msg.type === 'uart') {
        dispatch({ type: 'uart', channel: msg.channel as number, data: msg.data as string })
      }
    })
    return () => { off() }
  }, [])

  // Re-snapshot on visibility return (panel was hidden, may have missed pushes)
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        void window.nodalcore.postMessage({ type: 'getSnapshot' }).then((snap) => {
          if (snap) dispatch({ type: 'snapshot', snapshot: snap as RemoteIOState })
        })
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  async function send<T = unknown>(msg: { type: string; [k: string]: unknown }): Promise<T> {
    const reply = await window.nodalcore.postMessage(msg)
    if (reply && typeof reply === 'object' && 'error' in reply) {
      throw new Error(String((reply as { error: unknown }).error))
    }
    return reply as T
  }

  async function setOutput(index: number, value: 0 | 1) {
    await send({ type: 'setOutput', index, value })
    dispatch({ type: 'localSetOutput', index, value })
  }

  async function setLed(index: number, r: number, g: number, b: number) {
    await send({ type: 'setLed', index, r, g, b })
    dispatch({ type: 'localSetLed', index, r, g, b })
  }

  async function uartSend(channel: number, data: string) {
    await send({ type: 'uartSend', channel, data })
  }

  async function subscribeInputs()   { await send({ type: 'subscribeInputs' }) }
  async function unsubscribeInputs() { await send({ type: 'unsubscribeInputs' }) }

  return (
    <Ctx.Provider value={{ state, send, setOutput, setLed, uartSend, subscribeInputs, unsubscribeInputs }}>
      {children}
    </Ctx.Provider>
  )
}

export function useRemoteIO(): ContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRemoteIO must be used within <RemoteIOProvider>')
  return ctx
}
```

- [ ] **Step 3: Typecheck panel**

```bash
pnpm tsc --noEmit -p tsconfig.panel.json
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/panel/context/RemoteIOContext.tsx
git commit -m "feat(panel): RemoteIOContext over window.nodalcore"
```

---

### Task 18: `StatusIndicator` component

**Files:**
- Create: `src/panel/components/StatusIndicator.tsx`

- [ ] **Step 1: Create the component**

```bash
mkdir -p src/panel/components
```

`src/panel/components/StatusIndicator.tsx`:

```tsx
import { useRemoteIO } from '../context/RemoteIOContext.js'

function statusColor(status: string | null): string {
  if (!status) return 'var(--text-muted)'
  if (status === 'OK') return 'var(--success)'
  if (status.includes('UPDATE') || status.includes('CHECKING')) return 'var(--warning)'
  if (status.includes('ERROR') || status.includes('FAIL')) return 'var(--danger)'
  return 'var(--text-muted)'
}

export function StatusIndicator() {
  const { state } = useRemoteIO()
  const connected = state.connection === 'connected'
  return (
    <div style={styles.row}>
      <span style={{ ...styles.dot, background: connected ? 'var(--success)' : 'var(--text-muted)' }} />
      <span style={styles.label}>{connected ? 'Live' : 'Disconnected'}</span>
      {state.deviceStatus !== null && connected && (
        <span style={{ ...styles.status, color: statusColor(state.deviceStatus) }}>
          {state.deviceStatus || '—'}
        </span>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row:   { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' },
  dot:   { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  label: { fontSize: 12, color: 'var(--text-secondary)' },
  status:{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, marginLeft: 'auto' },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panel/components/StatusIndicator.tsx
git commit -m "feat(panel): StatusIndicator pill replaces ConnectionBar"
```

---

### Task 19: Migrate `DigitalInputs` component

**Files:**
- Move: `src/renderer/components/DigitalInputs.tsx` → `src/panel/components/DigitalInputs.tsx`
- Adapt: replace any `window.remoteio.*` calls with the context's `send` / equivalent helper

- [ ] **Step 1: Move with git**

```bash
git mv src/renderer/components/DigitalInputs.tsx src/panel/components/DigitalInputs.tsx
```

- [ ] **Step 2: Inspect for `window.remoteio` usages**

```bash
grep -nE "window\.remoteio|useCommands" src/panel/components/DigitalInputs.tsx
```

Note every match — these are the lines to rewrite.

- [ ] **Step 3: Rewrite the import + body**

For each match:
- `import { useCommands } from '../hooks/useCommands.js'` → delete (no useCommands in v1).
- `window.remoteio.subscribeInputs()` → `subscribeInputs()` from `useRemoteIO()`.
- `window.remoteio.unsubscribeInputs()` → `unsubscribeInputs()` from `useRemoteIO()`.
- Any direct command sends (e.g. `cmds.readInputs()`) → these were used to refresh on-demand; replace with `send({ type: 'getSnapshot' })` and read `inputs` off the result, OR rely on the context's pushed `inputs` events. Prefer the latter — remove the manual refresh.
- Replace the import path of `useRemoteIO`:
  ```ts
  import { useRemoteIO } from '../context/RemoteIOContext.js'
  ```

- [ ] **Step 4: Typecheck and confirm only this file is touched**

```bash
pnpm tsc --noEmit -p tsconfig.panel.json
```

Expected: exit 0 (or pre-existing errors from un-migrated siblings — they'll resolve in tasks 20–22).

- [ ] **Step 5: Commit**

```bash
git add src/panel/components/DigitalInputs.tsx
git commit -m "feat(panel): port DigitalInputs to window.nodalcore context"
```

---

### Task 20: Migrate `DigitalOutputs` component

**Files:**
- Move: `src/renderer/components/DigitalOutputs.tsx` → `src/panel/components/DigitalOutputs.tsx`

- [ ] **Step 1: Move**

```bash
git mv src/renderer/components/DigitalOutputs.tsx src/panel/components/DigitalOutputs.tsx
```

- [ ] **Step 2: Rewrite IPC layer**

```bash
grep -nE "window\.remoteio|useCommands" src/panel/components/DigitalOutputs.tsx
```

For each match, swap to:
- Toggle handler: replace `cmds.setOutput(pin, value)` with `setOutput(pin, value)` from `useRemoteIO()`.
- Any "Set All / Clear All" buttons: loop `setOutput(i, value)` for `i=1..16`. (The dispatcher does not expose a bulk W4; v1 sequences single writes.)
- Update the `useRemoteIO` import path to `'../context/RemoteIOContext.js'`.

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit -p tsconfig.panel.json
```

- [ ] **Step 4: Commit**

```bash
git add src/panel/components/DigitalOutputs.tsx
git commit -m "feat(panel): port DigitalOutputs to window.nodalcore context"
```

---

### Task 21: Migrate `LedPanel` component

**Files:**
- Move: `src/renderer/components/LedPanel.tsx` → `src/panel/components/LedPanel.tsx`

- [ ] **Step 1: Move**

```bash
git mv src/renderer/components/LedPanel.tsx src/panel/components/LedPanel.tsx
```

- [ ] **Step 2: Rewrite IPC layer**

```bash
grep -nE "window\.remoteio|useCommands" src/panel/components/LedPanel.tsx
```

Swap to:
- Single LED: `setLed(index, r, g, b)` from `useRemoteIO()`.
- Any "Fill All" / preset buttons: loop `setLed(i, r, g, b)` for `i=0..24`. (No bulk W8 in v1; sequenced single writes.)
- Update `useRemoteIO` import path.

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit -p tsconfig.panel.json
```

- [ ] **Step 4: Commit**

```bash
git add src/panel/components/LedPanel.tsx
git commit -m "feat(panel): port LedPanel to window.nodalcore context"
```

---

### Task 22: Migrate `UartPanel` component

**Files:**
- Move: `src/renderer/components/UartPanel.tsx` → `src/panel/components/UartPanel.tsx`

- [ ] **Step 1: Move**

```bash
git mv src/renderer/components/UartPanel.tsx src/panel/components/UartPanel.tsx
```

- [ ] **Step 2: Rewrite IPC layer**

```bash
grep -nE "window\.remoteio|useCommands" src/panel/components/UartPanel.tsx
```

Swap to:
- Tx: `uartSend(channel, data)` from `useRemoteIO()`.
- Rx: read from `state.uart[channel]` (already wired in the context's `uart` reducer).
- Update `useRemoteIO` import path.

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit -p tsconfig.panel.json
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/panel/components/UartPanel.tsx
git commit -m "feat(panel): port UartPanel to window.nodalcore context"
```

---

### Task 23: Final `App.tsx` with 4 tabs

**Files:**
- Modify: `src/panel/App.tsx`
- Modify: `src/panel/main.tsx` (wrap App in RemoteIOProvider)

- [ ] **Step 1: Replace `src/panel/App.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react'
import { RemoteIOProvider, useRemoteIO } from './context/RemoteIOContext.js'
import { StatusIndicator } from './components/StatusIndicator.js'
import { DigitalInputs }   from './components/DigitalInputs.js'
import { DigitalOutputs }  from './components/DigitalOutputs.js'
import { LedPanel }        from './components/LedPanel.js'
import { UartPanel }       from './components/UartPanel.js'

type Tab = 'inputs' | 'outputs' | 'leds' | 'uart'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inputs',  label: 'Digital Inputs',  icon: '⬇' },
  { id: 'outputs', label: 'Digital Outputs', icon: '⬆' },
  { id: 'leds',    label: 'LED Strip',       icon: '●' },
  { id: 'uart',    label: 'UART',            icon: '⇄' },
]

function Shell() {
  const [activeTab, setActiveTab] = useState<Tab>('inputs')
  const { state, subscribeInputs, unsubscribeInputs } = useRemoteIO()
  const isConnected = state.connection === 'connected'
  const subscribed = useRef(false)

  // Subscribe inputs only while the inputs tab is active and the panel is visible.
  useEffect(() => {
    if (!isConnected) { subscribed.current = false; return }
    const wantSub = activeTab === 'inputs' && !document.hidden
    if (wantSub && !subscribed.current) {
      void subscribeInputs().then(() => { subscribed.current = true })
    } else if (!wantSub && subscribed.current) {
      void unsubscribeInputs().then(() => { subscribed.current = false })
    }
  }, [activeTab, isConnected, subscribeInputs, unsubscribeInputs])

  useEffect(() => {
    const onVis = () => {
      if (!isConnected) return
      if (document.hidden && subscribed.current) {
        void unsubscribeInputs().then(() => { subscribed.current = false })
      } else if (!document.hidden && activeTab === 'inputs' && !subscribed.current) {
        void subscribeInputs().then(() => { subscribed.current = true })
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [activeTab, isConnected, subscribeInputs, unsubscribeInputs])

  return (
    <div style={styles.root}>
      <StatusIndicator />
      <div style={styles.body}>
        <nav style={styles.nav}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              style={{
                ...styles.navBtn,
                background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderRight: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={styles.navIcon}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <main style={styles.main}>
          {activeTab === 'inputs'  && <DigitalInputs />}
          {activeTab === 'outputs' && <DigitalOutputs />}
          {activeTab === 'leds'    && <LedPanel />}
          {activeTab === 'uart'    && <UartPanel />}
        </main>
      </div>
    </div>
  )
}

export function App() {
  return (
    <RemoteIOProvider>
      <Shell />
    </RemoteIOProvider>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  nav:  {
    width: 176, flexShrink: 0, background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)', display: 'flex',
    flexDirection: 'column', paddingTop: 8,
  },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    fontSize: 13, fontWeight: 500, border: 'none', textAlign: 'left',
    cursor: 'pointer', transition: 'all 0.1s', width: '100%',
  },
  navIcon: { fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 },
  main:    { flex: 1, overflow: 'hidden', background: 'var(--bg-app)' },
}
```

- [ ] **Step 2: Update `src/panel/main.tsx` (App is now a named export of App.tsx — no change needed if step 1 kept the named export. Verify.)**

```bash
grep -n "import { App }" src/panel/main.tsx
```

Expected: matches the import. If it imports `default`, change to named.

- [ ] **Step 3: Typecheck and build the panel**

```bash
pnpm typecheck && pnpm build:panel
```

Expected: both succeed. `panel/index.html` updated with the full app.

- [ ] **Step 4: Commit**

```bash
git add src/panel/App.tsx src/panel/main.tsx
git commit -m "feat(panel): final App with 4 tabs + visibility-aware input subscription"
```

---

## Phase 4: Cleanup

### Task 24: Delete obsolete Electron files

**Files:**
- Delete: `bin/`, `electron.vite.config.ts`, `PACKAGING.md`
- Delete: `src/main/`, `src/preload/`, `src/renderer/`

- [ ] **Step 1: Confirm no current code references them**

```bash
grep -rnE "src/main|src/preload|src/renderer|electron\.vite\.config|bin/start" \
  --include='*.ts' --include='*.tsx' --include='*.json' \
  src/ vite.config.ts tsup.config.ts vitest.config.ts \
  package.json nodal.json 2>/dev/null
```

Expected: no matches.

- [ ] **Step 2: Delete**

```bash
git rm -r bin/ src/main/ src/preload/ src/renderer/
git rm electron.vite.config.ts PACKAGING.md 2>/dev/null || true
```

(Some of those paths may already be gone from prior `git mv` operations; the `|| true` swallows that.)

- [ ] **Step 3: Final typecheck + tests + build to confirm nothing broke**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: all green. Both `dist/index.js` and `panel/index.html` produced.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Electron shell, settings server, and old src trees"
```

---

### Task 25: Add a README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create the file**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with bootstrap, build, and install instructions"
```

---

## Phase 5: End-to-end validation

### Task 26: Install into NodalCore and exercise the dashboard

**Files:** none (verification only — no commits)

- [ ] **Step 1: Final clean rebuild**

```bash
rm -rf dist panel
pnpm build
```

Expected: both trees rebuilt without errors.

- [ ] **Step 2: Loader smoke recheck**

```bash
node --input-type=module \
  -e "import('./dist/index.js').then(m => console.log(Object.keys(m).sort().join(',')))"
```

Expected: `activate,deactivate,default`

- [ ] **Step 3: Install into NodalCore via CLI**

```bash
node ~/Workspace/js/NodalCore/apps/cli/dist/index.js \
  plugin install /home/hayman/Workspace/js/remote-io-dashboard
```

Expected: success message; `~/.nodalcore/plugins/com.nodalcore.remote-io-dashboard/` exists with `nodal.json`, `dist/index.js`, `panel/index.html`.

- [ ] **Step 4: Open NodalCore desktop**

```bash
cd ~/Workspace/js/NodalCore && pnpm dev
```

Expected: app launches without errors. The plugin appears in the Plugins list.

- [ ] **Step 5: Configure and connect**

- Open Plugins → Remote IO Dashboard.
- The settings form (RJSF) shows `host` and `portOffset` fields with the schema's defaults.
- Set `host` to your device's IP, save.
- Click **Connect**. NodalCore activates the plugin worker and calls `connect()`.
- A toast "Remote IO plugin activated" appears.

- [ ] **Step 6: Open the dashboard panel**

- Switch to the **Workspace** tab.
- Click the `Live Dashboard` panel launcher.
- The panel renders inside the workspace area. The status indicator shows `Live` with the device's status string.

- [ ] **Step 7: Functional walkthrough**

- **Digital Outputs tab:** toggle pin 1; the firmware should respond and the UI button should reflect the new state.
- **Digital Inputs tab:** trigger a hardware input; within ~50 ms the corresponding indicator updates. Switch to another tab → indicators stop updating (subscription dropped). Switch back → updates resume.
- **LED Strip tab:** set LED 0 to red; the physical LED on the device should light up.
- **UART tab:** send a string on UART0; observe the device echo it back (or whatever the device-side script does); incoming text appears.
- **Network drop:** unplug the network cable. Within ~5 s (keepalive cycle), the panel's status indicator changes to `Disconnected` and `CONNECTION_LOST` shows in the status field.

- [ ] **Step 8: If anything fails**

Rebuild → reinstall → reload NodalCore. Common pitfalls:
- `ERR_MODULE_NOT_FOUND` at activation → check `tsup.config.ts` for `noExternal: [/.*/]` and the `createRequire` banner.
- Panel HTML 404 / blank → check `vite.config.ts` `base: './'` and that `panel/index.html` references relative `./assets/...`.
- Settings form empty → re-validate `nodal.json` JSON; the installer rejects bad manifests silently in some paths.

- [ ] **Step 9: Tag the working snapshot**

```bash
git tag v0.2.0-plugin
```

(No push — local tag only. Push when the user is ready.)

---

## Self-review checklist (informational — completed during plan authoring)

- [x] Spec coverage:
  - Architecture diagram → Task 13 (entry) + Task 23 (panel)
  - Source layout → Tasks 4–7, 9, 15–22
  - tsup config → Task 4
  - vite config → Task 5
  - package.json → Task 2
  - nodal.json → Task 8
  - Plugin entry skeleton → Task 13
  - Message protocol → Task 12 (dispatcher) + Task 17 (context)
  - UART throttle + ring buffer → Tasks 10, 11
  - Lifecycle/errors → Task 13
  - Validation steps → Tasks 14, 24, 26
  - Yalc workflow → Tasks 3, 25
  - Risks (`ConnectionOptions`, hot-reload, atomic-upgrade) → documented in spec, accepted
  - File-by-file change summary → all entries map to tasks above

- [x] No placeholders: every task has runnable commands and complete code blocks.

- [x] Type/method consistency: dispatcher's `DispatcherDeps` matches `RemoteIOClient.sendCommand`/`connected`. Context's `setOutput(index, value)` matches dispatcher's `setOutput {index, value}`. UART throttle constructor `(windowMs, onFlush)` is consistent across Task 10 (define) and Task 13 (use).

- [x] Out-of-scope features (alerts, auto-connect, tray) explicitly noted at the top of this plan, not silently dropped.
