import React, { useState } from 'react'
import { api } from '../services/api.js'

const EXAMPLES = [
  'Make this a 30 second viral reel',
  'Make it look like a professional podcast clip',
  'Cinematic style, no zoom, cut the silence',
]

export default function CommandBox({ projectId, onResult, disabled }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (cmd) => {
    if (!cmd?.trim() || busy) return
    setBusy(true)
    try {
      const res = await api.command(projectId, cmd)
      onResult(res)
      setText('')
    } catch (e) {
      onResult({ message: e.message, patch: {}, error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="command-box">
      <div className="command-title">
        <span aria-hidden="true">✨</span> AI command
        <span className="muted">describe the edit in plain English</span>
      </div>
      <div className="command-row">
        <input
          className="text-input"
          placeholder='e.g. "make this a 30-second Instagram reel"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run(text)}
          disabled={disabled}
          aria-label="AI edit command"
        />
        <button className="btn primary" onClick={() => run(text)} disabled={disabled || busy || !text.trim()}>
          {busy ? '…' : 'Apply'}
        </button>
      </div>
      <div className="command-examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="example-chip" disabled={disabled || busy}
                  onClick={() => { setText(ex); run(ex) }}>{ex}</button>
        ))}
      </div>
    </div>
  )
}
