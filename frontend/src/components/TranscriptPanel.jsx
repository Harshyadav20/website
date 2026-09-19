import React, { useMemo, useRef } from 'react'

export default function TranscriptPanel({ analysis, selected, onSeek }) {
  const boxRef = useRef(null)
  const segs = analysis.transcript || []

  const highlighted = useMemo(() => {
    if (!selected) return new Set()
    return new Set(segs.filter((s) => s.end > selected.start && s.start < selected.end).map((s) => s.start))
  }, [segs, selected])

  return (
    <section className="panel card transcript">
      <div className="panel-head">
        <h3>Transcript</h3>
        <span className="muted">{segs.length} segments · click to seek</span>
      </div>
      <div className="transcript-body" ref={boxRef}>
        {segs.map((s, i) => (
          <span key={i}
                className={`tseg ${highlighted.has(s.start) ? 'inclip' : ''}`}
                onClick={() => onSeek(s.start)}>
            <span className="tseg-time">{fmt(s.start)}</span> {s.text}
          </span>
        ))}
      </div>
    </section>
  )
}

function fmt(t) {
  t = Math.max(0, Math.floor(t))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
