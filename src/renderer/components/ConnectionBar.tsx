import { useEffect, useState } from 'react'
import { useRemoteIO } from '../context/RemoteIOContext'
import type { RemoteIOEvent } from '../types/global'

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200]

export function ConnectionBar() {
  const { state, dispatch } = useRemoteIO()
  const [host, setHost] = useState('192.168.1.10')
  const [portOffset, setPortOffset] = useState(0)
  const [autoConnect, setAutoConnectState] = useState(false)

  const connected = state.connection === 'connected'
  const connecting = state.connection === 'connecting'

  // Hydrate the config-driven controls from the main process and stay in sync with host-side edits
  useEffect(() => {
    window.remoteio.getConfig().then((cfg) => {
      setHost(cfg.host)
      setPortOffset(cfg.portOffset)
      setAutoConnectState(cfg.autoConnect)
    })
    return window.remoteio.on((event: RemoteIOEvent) => {
      if (event.type === 'config-changed') {
        setHost(event.config.host)
        setPortOffset(event.config.portOffset)
        setAutoConnectState(event.config.autoConnect)
      }
    })
  }, [])

  async function handleAutoConnectToggle(enabled: boolean) {
    setAutoConnectState(enabled)
    await window.remoteio.setAutoConnect(enabled)
  }

  async function handleConnect() {
    dispatch({ type: 'CONNECTING' })
    const result = await window.remoteio.connect(host, portOffset)
    if (result.ok) {
      dispatch({
        type: 'CONNECTED',
        inputs:  result.inputs  ?? Array<boolean>(16).fill(false),
        outputs: result.outputs ?? Array<boolean>(16).fill(false),
      })
      if (result.status) dispatch({ type: 'STATUS_UPDATED', status: result.status })
    } else {
      dispatch({ type: 'ERROR', message: result.error ?? 'Connection failed' })
    }
  }

  async function handleDisconnect() {
    await window.remoteio.disconnect()
    dispatch({ type: 'DISCONNECTED' })
  }

  const statusColor =
    state.connection === 'connected'  ? 'var(--success)' :
    state.connection === 'connecting' ? 'var(--warning)' :
    state.connection === 'error'      ? 'var(--danger)'  :
    'var(--text-muted)'

  const statusLabel =
    state.connection === 'connected'  ? 'Connected' :
    state.connection === 'connecting' ? 'Connecting…' :
    state.connection === 'error'      ? `Error: ${state.errorMessage}` :
    'Disconnected'

  return (
    <div style={styles.bar}>
      <span style={styles.title}>Remote IO Dashboard</span>

      <div style={styles.controls}>
        <label style={styles.label}>IP</label>
        <input
          style={styles.input}
          value={host}
          onChange={(e) => setHost(e.target.value)}
          disabled={connected || connecting}
          placeholder="192.168.1.10"
          spellCheck={false}
        />

        <label style={styles.label}>Port offset</label>
        <input
          style={{ ...styles.input, width: 60 }}
          type="number"
          value={portOffset}
          min={0}
          max={65035}
          onChange={(e) => setPortOffset(Number(e.target.value))}
          disabled={connected || connecting}
        />

        <span style={styles.portHint}>→ {8500 + portOffset}</span>

        <label style={styles.autoConnectLabel} title="Connect automatically on launch and after disconnects so background alerts continue to fire.">
          <input
            type="checkbox"
            checked={autoConnect}
            onChange={(e) => handleAutoConnectToggle(e.target.checked)}
            style={styles.autoConnectCheckbox}
          />
          Auto-connect
        </label>
      </div>

      <div style={styles.right}>
        <span style={{ ...styles.dot, background: statusColor }} title={statusLabel} />
        <span style={styles.statusText}>{statusLabel}</span>

        {!connected ? (
          <button
            style={{ ...styles.btn, background: 'var(--accent)' }}
            onClick={handleConnect}
            disabled={connecting}
          >
            Connect
          </button>
        ) : (
          <button
            style={{ ...styles.btn, background: 'var(--danger)' }}
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 16px',
    height: 52,
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    marginRight: 8,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  label: {
    color: 'var(--text-secondary)',
    fontSize: 12,
  },
  input: {
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    padding: '4px 8px',
    width: 140,
    outline: 'none',
  },
  portHint: {
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  autoConnectLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: 'var(--text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
    userSelect: 'none',
    marginLeft: 12,
  },
  autoConnectCheckbox: {
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  btn: {
    padding: '5px 14px',
    borderRadius: 'var(--radius)',
    color: '#fff',
    fontWeight: 500,
    fontSize: 13,
  },
}
