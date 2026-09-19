import React, { useRef } from 'react'
import { fmtMMSS } from '../services/api.js'

/**
 * Speech/silence timeline with a draggable clip window.
 * Silence = grey gaps, speech = violet blocks, selected clip = green window.
 */
export default function Timeline({ project, analysis, selected, onSelect, onSeek }) {
  const trackRef = useRef(null)
  const dragRef = useRef(null) // {mode: 'start'|'end'|'move', ...}
  const duration = project.duration || 1
  const silences = analysis?.silences || []

  const pct = (t) => (t / duration) * 100

  const timeAt = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
  }

  const startDrag = (mode) => (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    if (!selected) return
    dragRef.current = { mode, start: selected.start, end: selected.end, x0: ev.clientX }
    const move = (e) => {
      const d = dragRef.current
      if (!d) return
      const t = timeAt(e.clientX)
      if (d.mode === 'start') {
        onSelect({ ...selected, start: Math.min(t, selected.end - 1) })
      } else if (d.mode === 'end') {
        onSelect({ ...selected, end: Math.max(t, selected.start + 1) })
      } else if (d.mode === 'seek') {
        onSeek(t)
      }
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="timeline">
      <div className="timeline-labels muted">
        <span>0:00</span>
        <span>speech / silence map</span>
        <span>{fmtMMSS(duration)}</span>
      </div>
      <div className="timeline-track" ref={trackRef}
           onmousedown={startDrag('seek')}>
        {/* speech base */}
        <div className="tl-speech" />
        {/* silence blocks */}
        {silences.map((s, i) => (
          <div key={i} className="tl-silence"
               style={{ left: `${pct(s.start)}%`, width: `${pct(s.end - s.start)}%` }}
               title={`silence ${s.dur.toFixed(1)}s`} />
        ))}
        {/* selected clip window */}
        {selected && (
          <div className="tl-clip" style={{ left: `${pct(selected.start)}%`, width: `${pct(selected.end - selected.start)}%` }}>
            <div className="tl-handle left" onMouseDown={startDrag('start')} />
            <div className="tl-handle right" onMouseDown={startDrag('end')} />
          </div>
        )}
      </div>
    </div>
  )
}
