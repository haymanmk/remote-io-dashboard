import { useRemoteIO } from '../context/RemoteIOContext'

const PIN_LABELS: Record<number, string> = {
  1: 'PE0', 2: 'PE2', 3: 'PE3', 4: 'PE4', 5: 'PE5', 6: 'PE6', 7: 'PE7', 8: 'PE8',
  9: 'PE10', 10: 'PF0', 11: 'PF1', 12: 'PF2', 13: 'PF4', 14: 'PF7', 15: 'PF8', 16: 'PF9',
}

export function DigitalInputs() {
  const { state } = useRemoteIO()
  const disabled = state.connection !== 'connected'

  return (
    <div style={styles.panel}>
      <h2 style={styles.heading}>Digital Inputs</h2>
      <p style={styles.sub}>Live state via S5 subscription. Pins are read-only.</p>
      <div style={styles.grid}>
        {state.inputs.map((active, i) => {
          const pin = i + 1
          return (
            <div key={pin} style={{ ...styles.pin, opacity: disabled ? 0.4 : 1 }}>
              <div style={{
                ...styles.indicator,
                background: active ? 'var(--success)' : 'var(--bg-card)',
                boxShadow: active ? '0 0 8px var(--success)' : 'none',
                border: `1px solid ${active ? 'var(--success)' : 'var(--border)'}`,
              }} />
              <span style={styles.pinNum}>IN{pin}</span>
              <span style={styles.pinLabel}>{PIN_LABELS[pin]}</span>
              <span style={{ ...styles.state, color: active ? 'var(--success)' : 'var(--text-muted)' }}>
                {active ? 'HIGH' : 'LOW'}
              </span>
            </div>
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
  heading: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 4,
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
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    transition: 'opacity 0.2s',
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
