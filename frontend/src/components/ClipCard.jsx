import React from 'react'
import { fmtMMSS } from '../services/api.js'

const TAGS = { fire: '🔥', bulb: '💡', star: '⭐', target: '🎯', laugh: '😂', scissors: '✂️' }

export default function ClipCard({ clip, active, onSelect }) {
  const dur = Math.round(clip.end - clip.start)
  return (
    <div className={`clip-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="clip-row1">
        <span className="clip-tag">{TAGS[clip.tag] || '⭐'}</span>
        <span className="clip-title">{clip.title || 'Untitled clip'}</span>
        <span className="chip">{dur}s</span>
      </div>
      {clip.hook && <div className="clip-hook">“{clip.hook}”</div>}
      <div className="clip-row2">
        <span className="clip-time">{fmtMMSS(clip.start)} → {fmtMMSS(clip.end)}</span>
        {clip.source && (
          <span className={`src-chip ${clip.source}`}>{clip.source === 'ai' ? 'AI pick' : clip.source}</span>
        )}
      </div>
      {clip.reason && <div className="clip-reason">{clip.reason}</div>}
      <div className="score"><div className="score-fill" style={{ width: `${clip.score}%` }} /></div>
    </div>
  )
}
