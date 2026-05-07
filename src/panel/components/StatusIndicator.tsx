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
