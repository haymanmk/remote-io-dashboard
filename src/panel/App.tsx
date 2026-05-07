import { useState, useEffect, useRef } from 'react'
import { RemoteIOProvider, useRemoteIO } from './context/RemoteIOContext.js'
import { StatusIndicator } from './components/StatusIndicator.js'
import { DigitalInputs }   from './components/DigitalInputs.js'
import { DigitalOutputs }  from './components/DigitalOutputs.js'
import { LedPanel }        from './components/LedPanel.js'
import { UartPanel }       from './components/UartPanel.js'

type Tab = 'inputs' | 'outputs' | 'leds' | 'uart'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inputs',  label: 'Digital Inputs',  icon: '⬇' },
  { id: 'outputs', label: 'Digital Outputs', icon: '⬆' },
  { id: 'leds',    label: 'LED Strip',       icon: '●' },
  { id: 'uart',    label: 'UART',            icon: '⇄' },
]

function Shell() {
  const [activeTab, setActiveTab] = useState<Tab>('inputs')
  const { state, subscribeInputs, unsubscribeInputs } = useRemoteIO()
  const isConnected = state.connection === 'connected'
  const subscribed = useRef(false)

  // Subscribe inputs only while the inputs tab is active and the panel is visible.
  useEffect(() => {
    if (!isConnected) { subscribed.current = false; return }
    const wantSub = activeTab === 'inputs' && !document.hidden
    if (wantSub && !subscribed.current) {
      void subscribeInputs().then(() => { subscribed.current = true })
    } else if (!wantSub && subscribed.current) {
      void unsubscribeInputs().then(() => { subscribed.current = false })
    }
  }, [activeTab, isConnected, subscribeInputs, unsubscribeInputs])

  useEffect(() => {
    const onVis = () => {
      if (!isConnected) return
      if (document.hidden && subscribed.current) {
        void unsubscribeInputs().then(() => { subscribed.current = false })
      } else if (!document.hidden && activeTab === 'inputs' && !subscribed.current) {
        void subscribeInputs().then(() => { subscribed.current = true })
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [activeTab, isConnected, subscribeInputs, unsubscribeInputs])

  return (
    <div style={styles.root}>
      <StatusIndicator />
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
        </nav>
        <main style={styles.main}>
          {activeTab === 'inputs'  && <DigitalInputs />}
          {activeTab === 'outputs' && <DigitalOutputs />}
          {activeTab === 'leds'    && <LedPanel />}
          {activeTab === 'uart'    && <UartPanel />}
        </main>
      </div>
    </div>
  )
}

export function App() {
  return (
    <RemoteIOProvider>
      <Shell />
    </RemoteIOProvider>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  nav:  {
    width: 176, flexShrink: 0, background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)', display: 'flex',
    flexDirection: 'column', paddingTop: 8,
  },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    fontSize: 13, fontWeight: 500, border: 'none', textAlign: 'left',
    cursor: 'pointer', transition: 'all 0.1s', width: '100%',
  },
  navIcon: { fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 },
  main:    { flex: 1, overflow: 'hidden', background: 'var(--bg-app)' },
}
