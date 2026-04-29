interface AlertInfo {
  title: string
  message: string
  color: string
  icon: string
}

function alertInfo(status: string): AlertInfo {
  switch (status) {
    case 'UPDATE_AVAILABLE':
      return {
        title: 'Firmware Update Available',
        message: 'A new firmware version has been found on the update server. The device will begin the update process shortly.',
        color: '#f59e0b',
        icon: '⬆',
      }
    case 'UPDATING':
    case 'MENDER_DOWNLOADING':
    case 'MENDER_INSTALLING':
      return {
        title: 'Update In Progress',
        message: 'A firmware update is being applied. Do not power off the device until the update completes.',
        color: '#f59e0b',
        icon: '⟳',
      }
    case 'MENDER_REBOOTING':
      return {
        title: 'Device Rebooting',
        message: 'The firmware update has been written to flash. The device is rebooting to apply the new firmware. Connection will restore automatically.',
        color: '#f59e0b',
        icon: '↺',
      }
    case 'ERROR':
      return {
        title: 'Device Error',
        message: 'The Remote IO device has reported a general error. Check the device for faults and reconnect if necessary.',
        color: '#ef4444',
        icon: '✕',
      }
    default:
      return {
        title: 'Device Alert',
        message: `The device reported an unexpected status: ${status}`,
        color: '#f59e0b',
        icon: '!',
      }
  }
}

export function AlertPage({ status }: { status: string }) {
  const info = alertInfo(status)

  function handleDismiss() {
    window.remoteio.dismissAlert(status)
  }

  return (
    <div style={styles.root}>
      <button style={styles.closeBtn} onClick={handleDismiss} aria-label="Dismiss alert">
        ✕
      </button>

      <div style={styles.card}>
        <div style={{ ...styles.iconRing, borderColor: info.color, color: info.color }}>
          {info.icon}
        </div>

        <h1 style={{ ...styles.title, color: info.color }}>{info.title}</h1>
        <p style={styles.message}>{info.message}</p>

        <div style={styles.statusChip}>
          <span style={styles.statusLabel}>Device status</span>
          <code style={{ ...styles.statusCode, color: info.color }}>{status}</code>
        </div>

        <button
          style={{ ...styles.dismissBtn, borderColor: info.color, color: info.color }}
          onClick={handleDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 12, 18, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    WebkitFontSmoothing: 'antialiased',
  },
  closeBtn: {
    position: 'fixed',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    border: '1px solid #2a2d3e',
    borderRadius: 8,
    background: '#1e2130',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    maxWidth: 480,
    width: '90%',
    padding: '48px 40px',
    background: '#1e2130',
    border: '1px solid #2a2d3e',
    borderRadius: 16,
    boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 30,
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.3,
    color: '#e2e8f0',
  },
  message: {
    margin: 0,
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 1.7,
    maxWidth: 380,
  },
  statusChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 20px',
    background: '#13151e',
    border: '1px solid #2a2d3e',
    borderRadius: 8,
    width: '100%',
  },
  statusLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  statusCode: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  dismissBtn: {
    marginTop: 8,
    padding: '10px 32px',
    background: 'transparent',
    border: '1px solid',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
}
