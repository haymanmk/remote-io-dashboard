import { useState, useEffect } from 'react'
import { useRemoteIO } from '../context/RemoteIOContext'
import { useCommands } from '../hooks/useCommands'

interface NetworkSettings {
  ip: string
  portOffset: string
  netmask: string
  gateway: string
  mac: string
}

interface UartSettings {
  baud0: string
  baud1: string
}

function parseIP(values: string[] | undefined): string {
  if (!values || values.length < 4) return ''
  return values.slice(0, 4).join('.')
}

function parseMAC(values: string[] | undefined): string {
  if (!values || values.length < 6) return ''
  return values.slice(0, 6).map((v) => parseInt(v).toString(16).padStart(2, '0')).join(':')
}

function splitIP(s: string): number[] {
  return s.split('.').map(Number)
}

function splitMAC(s: string): number[] {
  return s.split(':').map((v) => parseInt(v, 16))
}

export function DeviceSettings() {
  const { state } = useRemoteIO()
  const cmds = useCommands()
  const connected = state.connection === 'connected'

  const [net, setNet] = useState<NetworkSettings>({ ip: '', portOffset: '', netmask: '', gateway: '', mac: '' })
  const [uart, setUart] = useState<UartSettings>({ baud0: '', baud1: '' })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  async function readAll() {
    if (!connected) return
    setLoading(true)
    try {
      const [ipR, portR, nmR, gwR, macR, b0R, b1R] = await Promise.all([
        cmds.readIP(),
        cmds.readPortOffset(),
        cmds.readNetmask(),
        cmds.readGateway(),
        cmds.readMAC(),
        cmds.readUartBaud(0),
        cmds.readUartBaud(1),
      ])
      setNet({
        ip:         parseIP(ipR.reply?.values),
        portOffset: portR.reply?.values?.[0] ?? '',
        netmask:    parseIP(nmR.reply?.values),
        gateway:    parseIP(gwR.reply?.values),
        mac:        parseMAC(macR.reply?.values),
      })
      setUart({
        baud0: b0R.reply?.values?.[0] ?? '',
        baud1: b1R.reply?.values?.[0] ?? '',
      })
    } catch (err) {
      setMessage({ text: String(err), ok: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (connected) readAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  function flash(ok: boolean, text: string) {
    setMessage({ ok, text })
    setTimeout(() => setMessage(null), 3000)
  }

  async function saveIP() {
    const parts = splitIP(net.ip)
    if (parts.length !== 4 || parts.some(isNaN)) { flash(false, 'Invalid IP format'); return }
    const r = await cmds.writeIP(...(parts as [number, number, number, number]))
    flash(r.ok, r.ok ? 'IP saved (reboot to apply)' : r.error ?? 'Failed')
  }

  async function savePortOffset() {
    const n = parseInt(net.portOffset)
    if (isNaN(n)) { flash(false, 'Invalid port offset'); return }
    const r = await cmds.writePortOffset(n)
    flash(r.ok, r.ok ? 'Port offset saved (reboot to apply)' : r.error ?? 'Failed')
  }

  async function saveNetmask() {
    const parts = splitIP(net.netmask)
    if (parts.length !== 4 || parts.some(isNaN)) { flash(false, 'Invalid netmask'); return }
    const r = await cmds.writeNetmask(...(parts as [number, number, number, number]))
    flash(r.ok, r.ok ? 'Netmask saved' : r.error ?? 'Failed')
  }

  async function saveGateway() {
    const parts = splitIP(net.gateway)
    if (parts.length !== 4 || parts.some(isNaN)) { flash(false, 'Invalid gateway'); return }
    const r = await cmds.writeGateway(...(parts as [number, number, number, number]))
    flash(r.ok, r.ok ? 'Gateway saved' : r.error ?? 'Failed')
  }

  async function saveMAC() {
    const parts = splitMAC(net.mac)
    if (parts.length !== 6 || parts.some(isNaN)) { flash(false, 'Invalid MAC (use hex octets separated by :)'); return }
    const r = await cmds.writeMAC(...(parts as [number, number, number, number, number, number]))
    flash(r.ok, r.ok ? 'MAC saved (reboot to apply)' : r.error ?? 'Failed')
  }

  async function saveBaud(ch: number, value: string) {
    const n = parseInt(value)
    if (isNaN(n)) { flash(false, 'Invalid baud rate'); return }
    const r = await cmds.writeUartBaud(ch, n)
    flash(r.ok, r.ok ? `UART${ch} baud saved (reboot to apply)` : r.error ?? 'Failed')
  }

  return (
    <div style={styles.panel}>
      <div style={styles.topRow}>
        <h2 style={styles.heading}>Device Settings</h2>
        <button style={styles.refreshBtn} onClick={readAll} disabled={!connected || loading}>
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      </div>
      {!connected && <p style={styles.notice}>Connect to the device to view and edit settings.</p>}

      {message && (
        <div style={{ ...styles.message, borderColor: message.ok ? 'var(--success)' : 'var(--danger)', color: message.ok ? 'var(--success)' : 'var(--danger)' }}>
          {message.text}
        </div>
      )}

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Network</h3>
        <SettingRow
          label="IP Address" hint="R101 / W101"
          value={net.ip} onChange={(v) => setNet({ ...net, ip: v })}
          onSave={saveIP} disabled={!connected}
          placeholder="192.168.1.10"
        />
        <SettingRow
          label="Port Offset" hint="R102 / W102 — effective port = 8500 + offset"
          value={net.portOffset} onChange={(v) => setNet({ ...net, portOffset: v })}
          onSave={savePortOffset} disabled={!connected}
          placeholder="0"
        />
        <SettingRow
          label="Netmask" hint="R103 / W103"
          value={net.netmask} onChange={(v) => setNet({ ...net, netmask: v })}
          onSave={saveNetmask} disabled={!connected}
          placeholder="255.255.255.0"
        />
        <SettingRow
          label="Gateway" hint="R104 / W104"
          value={net.gateway} onChange={(v) => setNet({ ...net, gateway: v })}
          onSave={saveGateway} disabled={!connected}
          placeholder="192.168.1.1"
        />
        <SettingRow
          label="MAC Address" hint="R105 / W105 — hex octets separated by :"
          value={net.mac} onChange={(v) => setNet({ ...net, mac: v })}
          onSave={saveMAC} disabled={!connected}
          placeholder="00:05:4f:01:02:03"
        />
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>UART Baud Rates</h3>
        <SettingRow
          label="UART0 (USART2)" hint="R106.0 / W106.0"
          value={uart.baud0} onChange={(v) => setUart({ ...uart, baud0: v })}
          onSave={() => saveBaud(0, uart.baud0)} disabled={!connected}
          placeholder="19200"
        />
        <SettingRow
          label="UART1 (UART5)" hint="R106.1 / W106.1"
          value={uart.baud1} onChange={(v) => setUart({ ...uart, baud1: v })}
          onSave={() => saveBaud(1, uart.baud1)} disabled={!connected}
          placeholder="9600"
        />
      </section>

      <p style={styles.footnote}>
        Note: Network settings take effect after device reboot.
      </p>
    </div>
  )
}

function SettingRow({
  label, hint, value, onChange, onSave, disabled, placeholder,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  onSave: () => void
  disabled: boolean
  placeholder: string
}) {
  return (
    <div style={rowStyles.row}>
      <div style={rowStyles.labelCol}>
        <span style={rowStyles.label}>{label}</span>
        <span style={rowStyles.hint}>{hint}</span>
      </div>
      <input
        style={{ ...rowStyles.input, opacity: disabled ? 0.5 : 1 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
      />
      <button
        style={{ ...rowStyles.saveBtn, opacity: disabled ? 0.4 : 1 }}
        onClick={onSave}
        disabled={disabled}
      >
        Save
      </button>
    </div>
  )
}

const rowStyles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
  },
  labelCol: {
    width: 200,
    flexShrink: 0,
  },
  label: {
    display: 'block',
    fontWeight: 500,
    fontSize: 13,
  },
  hint: {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  input: {
    flex: 1,
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    padding: '5px 8px',
    fontSize: 13,
    fontFamily: 'monospace',
    outline: 'none',
  },
  saveBtn: {
    background: 'var(--accent)',
    color: '#fff',
    padding: '5px 14px',
    borderRadius: 'var(--radius)',
    fontWeight: 500,
    fontSize: 12,
    flexShrink: 0,
  },
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: 24,
    overflowY: 'auto',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  },
  notice: {
    color: 'var(--text-muted)',
    fontSize: 12,
    marginBottom: 16,
  },
  message: {
    padding: '8px 12px',
    borderRadius: 'var(--radius)',
    border: '1px solid',
    fontSize: 13,
    marginBottom: 12,
    background: 'var(--bg-card)',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  footnote: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 'auto',
    paddingTop: 16,
  },
}
