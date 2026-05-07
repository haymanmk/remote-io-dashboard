import { useState, useCallback } from 'react'
import { useRemoteIO } from '../context/RemoteIOContext'

type LedColor = { r: number; g: number; b: number }

const LED_COUNT = 25

function toHex({ r, g, b }: LedColor): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function fromHex(hex: string): LedColor {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function brightness({ r, g, b }: LedColor): number {
  return (r + g + b) / 3
}

export function LedPanel() {
  const { state, setLed } = useRemoteIO()
  const [selected, setSelected] = useState<number | null>(null)
  const disabled = state.connection !== 'connected'

  const setAll = useCallback(async (color: LedColor) => {
    if (disabled) return
    for (let i = 0; i < LED_COUNT; i++) {
      await setLed(i, color.r, color.g, color.b)
    }
  }, [disabled, setLed])

  async function handleColorChange(index: number, hex: string) {
    const color = fromHex(hex)
    await setLed(index, color.r, color.g, color.b)
  }

  const selectedColor = selected !== null ? state.leds[selected] : null

  return (
    <div style={styles.panel}>
      <h2 style={styles.heading}>WS2812 LED Strip</h2>
      <p style={styles.sub}>25 LEDs. Click a LED to select and change its color.</p>

      <div style={styles.toolbar}>
        <button
          style={{ ...styles.btn, background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          onClick={() => setAll({ r: 0, g: 0, b: 0 })}
          disabled={disabled}
        >
          All Off
        </button>
        <button
          style={{ ...styles.btn, background: '#2d1f00', border: '1px solid #78350f' }}
          onClick={() => setAll({ r: 255, g: 140, b: 0 })}
          disabled={disabled}
        >
          All Warm
        </button>
        <button
          style={{ ...styles.btn, background: '#0d2140', border: '1px solid var(--accent)' }}
          onClick={() => setAll({ r: 0, g: 100, b: 255 })}
          disabled={disabled}
        >
          All Blue
        </button>
      </div>

      <div style={styles.strip}>
        {state.leds.map((color, i) => (
          <button
            key={i}
            style={{
              ...styles.led,
              background: toHex(color),
              border: selected === i
                ? '2px solid #fff'
                : brightness(color) < 30
                  ? '1px solid var(--border)'
                  : '2px solid transparent',
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            title={`LED ${i}: RGB(${color.r}, ${color.g}, ${color.b})`}
            onClick={() => !disabled && setSelected(selected === i ? null : i)}
            disabled={disabled}
          />
        ))}
      </div>

      {selected !== null && selectedColor && (
        <div style={styles.colorEditor}>
          <span style={styles.colorLabel}>LED {selected}</span>
          <input
            type="color"
            value={toHex(selectedColor)}
            onChange={(e) => handleColorChange(selected, e.target.value)}
            style={styles.colorInput}
          />
          <span style={styles.rgb}>
            RGB({selectedColor.r}, {selectedColor.g}, {selectedColor.b})
          </span>
          <button
            style={{ ...styles.btn, background: 'var(--danger)', fontSize: 12 }}
            onClick={() => handleColorChange(selected, '#000000')}
          >
            Off
          </button>
        </div>
      )}
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
    marginBottom: 16,
  },
  toolbar: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
  },
  btn: {
    padding: '5px 12px',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontWeight: 500,
  },
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  led: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    transition: 'transform 0.1s, border 0.1s',
  },
  colorEditor: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '12px 16px',
  },
  colorLabel: {
    fontWeight: 600,
    fontSize: 13,
  },
  colorInput: {
    width: 44,
    height: 36,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: 2,
    background: 'var(--input-bg)',
    cursor: 'pointer',
  },
  rgb: {
    color: 'var(--text-secondary)',
    fontFamily: 'monospace',
    fontSize: 13,
  },
}
