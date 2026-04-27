#!/usr/bin/env node
// Launcher shim for NodalCore integration.
// Spawns the Electron app and pipes stdout so NODALCORE_READY reaches the spawner.
const electron = require('electron')
const { spawn } = require('child_process')
const path = require('path')

const proc = spawn(electron, [path.join(__dirname, '..', 'out', 'main', 'index.js')], {
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
})

proc.stdout.pipe(process.stdout)
proc.stderr.pipe(process.stderr)
proc.on('close', (code) => process.exit(code ?? 0))
proc.on('error', (err) => {
  process.stderr.write(`Failed to start Electron: ${err.message}\n`)
  process.exit(1)
})
