import { useState } from 'react'
import { ConnectionBar } from './components/ConnectionBar'
import { DigitalInputs } from './components/DigitalInputs'
import { DigitalOutputs } from './components/DigitalOutputs'
import { LedPanel } from './components/LedPanel'
import { UartPanel } from './components/UartPanel'
import { DeviceSettings } from './components/DeviceSettings'
import { useRemoteIO } from './context/RemoteIOContext'

type Tab = 'inputs' | 'outputs' | 'leds' | 'uart' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inputs',   label: 'Digital Inputs',  icon: '⬇' },
  { id: 'outputs',  label: 'Digital Outputs', icon: '⬆' },
  { id: 'leds',     label: 'LED Strip',       icon: '●' },
  { id: 'uart',     label: 'UART',            icon: '⇄' },
  { id: 'settings', label: 'Settings',        icon: '⚙' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('inputs')
  const { state } = useRemoteIO()

  return (
    <div style={styles.root}>
      <ConnectionBar />
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

          <div style={styles.navSpacer} />
          {state.connection === 'connected' && (
            <div style={styles.connectedBadge}>
              <span style={styles.connectedDot} />
              Live
            </div>
          )}
        </nav>
        <main style={styles.main}>
          {activeTab === 'inputs'   && <DigitalInputs />}
          {activeTab === 'outputs'  && <DigitalOutputs />}
          {activeTab === 'leds'     && <LedPanel />}
          {activeTab === 'uart'     && <UartPanel />}
          {activeTab === 'settings' && <DeviceSettings />}
        </main>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  nav: {
    width: 176,
    flexShrink: 0,
    background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 8,
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 500,
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.1s',
    width: '100%',
  },
  navIcon: {
    fontSize: 15,
    width: 20,
    textAlign: 'center',
    flexShrink: 0,
  },
  navSpacer: {
    flex: 1,
  },
  connectedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    fontSize: 12,
    color: 'var(--success)',
    borderTop: '1px solid var(--border)',
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--success)',
    boxShadow: '0 0 6px var(--success)',
    animation: 'pulse 2s infinite',
    flexShrink: 0,
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    background: 'var(--bg-app)',
  },
}
