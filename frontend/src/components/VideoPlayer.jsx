import React, { useEffect, useRef, useState } from 'react'
import { fmtMMSS } from '../services/api.js'

/**
 * Preview of the ORIGINAL video with a 9:16 crop guide overlay so the user
 * sees exactly what the vertical render will keep.
 */
export default function VideoPlayer({ project, selected, seekTo, onSeekHandled, options }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const stopAtRef = useRef(null)

  useEffect(() => {
    if (seekTo == null || !ref.current) return
    ref.current.currentTime = seekTo
    onSeekHandled?.()
  }, [seekTo, onSeekHandled])

  // "Play clip" — play from clip.start and stop at clip.end
  const playClip = () => {
    const v = ref.current
    if (!v || !selected) return
    if (time < selected.start || time >= selected.end - 0.05) v.currentTime = selected.start
    stopAtRef.current = selected.end
    v.play()
    setPlaying(true)
  }

  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (playing) { v.pause(); setPlaying(false) }
    else { stopAtRef.current = null; v.play(); setPlaying(true) }
  }

  return (
    <div className="player-wrap">
      <div className="player-box">
        <video
          ref={ref}
          src={project.url}
          playsInline
          onTimeUpdate={(e) => {
            setTime(e.currentTarget.currentTime)
            if (stopAtRef.current != null && e.currentTarget.currentTime >= stopAtRef.current) {
              e.currentTarget.pause()
              setPlaying(false)
              stopAtRef.current = null
            }
          }}
          onEnded={() => setPlaying(false)}
          onClick={toggle}
        />
        {/* 9:16 crop guide */}
        {options.aspect !== 'blur' && options.aspect !== 'fit' && (
          <div className="crop-guide" style={{ left: `${(options.crop_x ?? 0.5) * 100}%` }}>
            <span className="crop-label">9:16</span>
          </div>
        )}
        <div className="player-hud">
          <button className="play-btn" onClick={selected ? playClip : toggle}>
            {playing ? '⏸' : '▶'}
          </button>
          <span className="time">{fmtMMSS(time)} / {fmtMMSS(project.duration)}</span>
          {selected && <span className="chip">clip {fmtMMSS(selected.start)}–{fmtMMSS(selected.end)}</span>}
        </div>
      </div>
      <div className="player-caption-hint muted">
        Preview shows the original 16:9 — the dashed guide marks the 9:16 crop window.
        Captions, zoom and music are burned in when you render.
      </div>
    </div>
  )
}
