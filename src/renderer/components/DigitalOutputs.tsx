import { useState } from 'react'
import { useRemoteIO } from '../context/RemoteIOContext'
import { useCommands } from '../hooks/useCommands'

const PIN_LABELS: Record<number, string> = {
  1: 'PC7',  2: 'PC8',  3: 'PC9',  4: 'PC10', 5: 'PC11', 6: 'PC12',
  7: 'PD0',  8: 'PD1',  9: 'PD2',  10: 'PD3', 11: 'PD4', 12: 'PD6',
  13: 'PD7', 14: 'PD11', 15: 'PD12', 16: 'PD13',
}

export function DigitalOutputs() {
  const { state, dispatch } = useRemoteIO()
  const cmds = useCommands()
  const disabled = state.connection !== 'connected'
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const r = await cmds.readAllOutputs()
      if (r.ok && r.reply?.kind === 'read' && r.reply.values) {
        const n = parseInt(r.reply.values[0] ?? '0')
        const outputs = Array.from({ length: 16 }, (_, i) => Boolean((n >> i) & 1))
        dispatch({ type: 'OUTPUTS_REFRESHED', outputs })
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function toggle(pin: number) {
    const current = state.outputs[pin - 1]
    const next: 0 | 1 = current ? 0 : 1
    const result = await cmds.setOutput(pin, next)
    if (result.ok) {
      dispatch({ type: 'OUTPUT_CHANGED', pin, state: Boolean(next) })
    }
  }

  return (
    <div style={styles.panel}>
      <div style={styles.topRow}>
        <h2 style={styles.heading}>Digital Outputs</h2>
        <button
          style={styles.refreshBtn}
          onClick={refresh}
          disabled={disabled || refreshing}
        >
          {refreshing ? 'Reading…' : 'Refresh'}
        </button>
      </div>
      <p style={styles.sub}>Click a pin to toggle. Changes are sent immediately to the device.</p>
      <div style={styles.grid}>
        {state.outputs.map((active, i) => {
          const pin = i + 1
          return (
            <button
              key={pin}
              style={{
                ...styles.pin,
                background: active ? '#1d3a6b' : 'var(--bg-card)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              onClick={() => !disabled && toggle(pin)}
              disabled={disabled}
              title={`OUT${pin} (${PIN_LABELS[pin]}): ${active ? 'HIGH' : 'LOW'}`}
            >
              <div style={{
                ...styles.indicator,
                background: active ? 'var(--accent)' : 'var(--border)',
                boxShadow: active ? '0 0 8px var(--accent)' : 'none',
              }} />
              <span style={styles.pinNum}>OUT{pin}</span>
              <span style={styles.pinLabel}>{PIN_LABELS[pin]}</span>
              <span style={{ ...styles.state, color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                {active ? 'HIGH' : 'LOW'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: 24,
    overflowY: 'auto',
    height: '100%',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heading: {
    fontSize: 16,
    fontWeight: 600,
  },
  refreshBtn: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    padding: '4px 12px',
    borderRadius: 'var(--radius)',
    fontSize: 12,
    cursor: 'pointer',
  },
  sub: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    marginBottom: 20,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 12,
  },
  pin: {
    borderRadius: 'var(--radius-lg)',
    padding: '14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s',
  },
  indicator: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    transition: 'all 0.15s',
  },
  pinNum: {
    fontWeight: 600,
    fontSize: 13,
    color: 'var(--text-primary)',
  },
  pinLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  },
  state: {
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.05em',
  },
}
