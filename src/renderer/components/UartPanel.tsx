import { useState, useEffect, useRef } from 'react'
import { useRemoteIO } from '../context/RemoteIOContext'
import { useCommands } from '../hooks/useCommands'
import type { RemoteIOEvent } from '../types/global'

interface LogEntry {
  dir: 'tx' | 'rx'
  channel: number
  text: string
  ts: string
}

const BAUD_OPTIONS = [9600, 19200, 38400, 57600, 115200]

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8)
}

/** Replace CR/LF bytes with a printable symbol so the log stays on one line. */
function displayText(text: string): string {
  return text.replace(/\r\n/g, ' ↵').replace(/\r/g, ' ↵').replace(/\n/g, ' ↵')
}

function UartChannel({ channel }: { channel: number }) {
  const { state } = useRemoteIO()
  const cmds = useCommands()
  const [input, setInput] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const [baud, setBaud] = useState<number | null>(null)
  const [appendCRLF, setAppendCRLF] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const disabled = state.connection !== 'connected'

  // Subscribe to uart-data events for this channel
  useEffect(() => {
    const unsub = window.remoteio.on((event: RemoteIOEvent) => {
      if (event.type === 'uart-data' && event.channel === channel) {
        setLog((prev) => [...prev.slice(-499), {
          dir: 'rx', channel, text: event.payload, ts: timestamp(),
        }])
      }
    })
    return unsub
  }, [channel])

  // Auto-scroll log
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  // Read baud rate on connect
  useEffect(() => {
    if (state.connection !== 'connected') { setBaud(null); return }
    cmds.readUartBaud(channel).then((r) => {
      if (r.ok && r.reply?.kind === 'read') setBaud(Number(r.reply.values?.[0]))
    })
  }, [state.connection, channel])

  async function send() {
    const text = input.trim()
    if (!text || disabled) return
    const payload = appendCRLF ? text + '\r\n' : text
    const result = await cmds.sendUart(channel, payload)
    if (result.ok) {
      setLog((prev) => [...prev.slice(-499), { dir: 'tx', channel, text: payload, ts: timestamp() }])
      setInput('')
    }
  }

  async function handleBaudChange(newBaud: number) {
    const result = await cmds.writeUartBaud(channel, newBaud)
    if (result.ok) setBaud(newBaud)
  }

  return (
    <div style={styles.channel}>
      <div style={styles.channelHeader}>
        <span style={styles.channelTitle}>UART{channel}</span>
        <span style={styles.peripheral}>{channel === 0 ? 'USART2 (PD5/PA3)' : 'UART5 (PB6/PB12)'}</span>
        <span style={styles.baudLabel}>Baud:</span>
        <select
          style={styles.select}
          value={baud ?? ''}
          onChange={(e) => handleBaudChange(Number(e.target.value))}
          disabled={disabled}
        >
          {baud === null && <option value="">—</option>}
          {BAUD_OPTIONS.map((b) => (
            <option key={b} value={b}>{b.toLocaleString()}</option>
          ))}
        </select>
        <button
          style={styles.clearBtn}
          onClick={() => setLog([])}
        >
          Clear
        </button>
      </div>

      <div ref={logRef} style={styles.log}>
        {log.length === 0 ? (
          <span style={styles.empty}>No data yet</span>
        ) : (
          log.map((entry, i) => (
            <div key={i} style={styles.logLine}>
              <span style={styles.ts}>{entry.ts}</span>
              <span style={{
                ...styles.dir,
                color: entry.dir === 'tx' ? 'var(--accent)' : 'var(--success)',
              }}>
                {entry.dir.toUpperCase()}
              </span>
              <span style={styles.text}>{displayText(entry.text)}</span>
            </div>
          ))
        )}
      </div>

      <div style={styles.inputRow}>
        <input
          style={styles.textInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type and press Enter to send…"
          disabled={disabled}
          spellCheck={false}
        />
        <label style={styles.crlfLabel}>
          <input
            type="checkbox"
            checked={appendCRLF}
            onChange={(e) => setAppendCRLF(e.target.checked)}
            style={{ margin: 0 }}
          />
          CR+LF
        </label>
        <button
          style={{ ...styles.sendBtn, opacity: disabled ? 0.5 : 1 }}
          onClick={send}
          disabled={disabled}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export function UartPanel() {
  const { state } = useRemoteIO()

  return (
    <div style={styles.panel}>
      <h2 style={styles.heading}>UART Bridge</h2>
      {state.connection !== 'connected' && (
        <p style={styles.notice}>Connect to the device to use UART channels.</p>
      )}
      <div style={styles.channels}>
        <UartChannel channel={0} />
        <UartChannel channel={1} />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: 24,
    overflowY: 'auto',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: 600,
  },
  notice: {
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  channels: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    flex: 1,
    minHeight: 0,
  },
  channel: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  channelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-panel)',
    flexShrink: 0,
  },
  channelTitle: {
    fontWeight: 700,
    fontSize: 13,
  },
  peripheral: {
    color: 'var(--text-muted)',
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  baudLabel: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  select: {
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    padding: '2px 6px',
    fontSize: 12,
  },
  clearBtn: {
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 'var(--radius)',
  },
  log: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minHeight: 0,
  },
  empty: {
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  logLine: {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
  },
  ts: {
    color: 'var(--text-muted)',
    fontSize: 11,
    flexShrink: 0,
  },
  dir: {
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
    width: 24,
  },
  text: {
    color: 'var(--text-primary)',
    wordBreak: 'break-all',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '8px 12px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    padding: '5px 8px',
    fontSize: 12,
    fontFamily: 'monospace',
    outline: 'none',
  },
  crlfLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    userSelect: 'none',
    flexShrink: 0,
  },
  sendBtn: {
    background: 'var(--accent)',
    color: '#fff',
    padding: '5px 12px',
    borderRadius: 'var(--radius)',
    fontWeight: 500,
    fontSize: 12,
  },
}
