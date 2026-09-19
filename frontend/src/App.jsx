import React, { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Editor from './pages/Editor.jsx'
import { api } from './services/api.js'

export default function App() {
  const [view, setView] = useState({ name: 'dashboard' })
  const [health, setHealth] = useState(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'dashboard' })}>
          <span className="brand-mark">🎬</span> ClipForge
          <span className="brand-sub">AI Video Clipper &amp; Editor</span>
        </button>
        <div className="topbar-right">
          {health && (
            <div className="engine-badges" title="Active processing engines">
              <span className={`badge ${health.ffmpeg ? 'ok' : 'bad'}`}>
                FFmpeg {health.ffmpeg ? '✓' : '✗'}
              </span>
              <span className="badge ok">STT: {health.stt_engine}</span>
              <span className="badge ok">AI: {health.ai_engine}</span>
            </div>
          )}
        </div>
      </header>
      {view.name === 'dashboard' ? (
        <Dashboard onOpen={(id) => setView({ name: 'editor', id })} />
      ) : (
        <Editor id={view.id} onBack={() => setView({ name: 'dashboard' })} />
      )}
    </div>
  )
}
