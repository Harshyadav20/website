import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, fmtMMSS } from '../services/api.js'
import ClipCard from '../components/ClipCard.jsx'
import Timeline from '../components/Timeline.jsx'
import VideoPlayer from '../components/VideoPlayer.jsx'
import StyleGrid from '../components/StyleGrid.jsx'
import EffectsControls from '../components/EffectsControls.jsx'
import RenderPanel from '../components/RenderPanel.jsx'
import TranscriptPanel from '../components/TranscriptPanel.jsx'
import CommandBox from '../components/CommandBox.jsx'

export const DEFAULT_OPTIONS = {
  style: 'viral',
  captions: true,
  caption_animation: '',       // '' -> style default
  font_scale: 1.0,
  caption_position: '',        // '' -> style default
  uppercase: null,             // null -> style default
  zoom: '',                    // '' -> style default
  aspect: '',                  // '' -> style default
  crop_x: 0.5,
  remove_silence: false,
  watermark: '',
  music: null,                 // null -> style default, 'none' to disable
  music_volume: 0.16,
  sfx: true,
  resolution: '1080',
  fast: false,
}

const STAGES = [
  ['probe', 'Reading video'],
  ['audio', 'Silence map'],
  ['transcribe', 'Transcription'],
  ['ai', 'Clip finding'],
  ['done', 'Complete'],
]

export default function Editor({ id, notify, onBack }) {
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [running, setRunning] = useState(false)
  const [clips, setClips] = useState([])
  const [selected, setSelected] = useState(null)   // working copy of the clip
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [styles, setStyles] = useState({ styles: [] })
  const [assets, setAssets] = useState(null)
  const [seekTo, setSeekTo] = useState(null)       // seconds -> player seeks
  const [time, setTime] = useState(0)              // current playhead
  const pollRef = useRef(null)

  const set = useCallback((patch) => setOptions((o) => ({ ...o, ...patch })), [])

  const loadProject = useCallback(async () => {
    const p = await api.project(id)
    setProject(p)
    const a = await api.analysis(id)
    setAnalysis(a.analysis)
    setRunning(a.running)
    setClips(a.analysis?.clips || [])
  }, [id])

  useEffect(() => {
    loadProject().catch((e) => notify(e.message, 'error'))
    api.styles().then(setStyles).catch(() => {})
    api.assets().then(setAssets).catch(() => {})
  }, [loadProject, notify])

  // kick off analysis automatically for fresh uploads
  useEffect(() => {
    if (!project || running || analysis) return
    if (project.status === 'ready') {
      api.analyze(id).then(() => setRunning(true)).catch(() => {})
    }
  }, [project, running, analysis, id])

  // poll while analyzing
  useEffect(() => {
    if (!running) return undefined
    pollRef.current = setInterval(async () => {
      try {
        const a = await api.analysis(id)
        setRunning(a.running)
        setProject(a.project)
        if (!a.running) {
          setAnalysis(a.analysis)
          setClips(a.analysis?.clips || [])
          if (a.project?.status === 'error') notify('Analysis failed: ' + a.project.error, 'error')
          else notify(`Analysis complete — ${a.analysis?.clips?.length || 0} clips suggested`, 'success')
        }
      } catch { /* keep polling */ }
    }, 1500)
    return () => clearInterval(pollRef.current)
  }, [running, id, notify])

  const pickClip = useCallback((c) => {
    setSelected({ ...c })
    setSeekTo(c.start)
  }, [])

  const updateClip = (patch) => setSelected((s) => (s ? { ...s, ...patch } : s))

  const addManualClip = () => {
    const start = Math.max(0, Math.round((selected?.end ?? time ?? 0) * 10) / 10)
    const end = Math.min(project.duration, start + 30)
    if (end - start < 3) {
      notify('You are too close to the end of the video to add a clip', 'error')
      return
    }
    api.addClip(id, { start, end, title: 'Manual clip' }).then((c) => {
      setClips((cl) => [c, ...cl])
      pickClip(c)
      notify('Manual clip added', 'success')
    }).catch((e) => notify(e.message, 'error'))
  }

  const deleteClip = (clip) => {
    if (clip.source !== 'manual') return
    api.deleteClip(id, clip.id)
      .then(() => {
        setClips((cl) => cl.filter((c) => c.id !== clip.id))
        setSelected((s) => (s?.id === clip.id ? null : s))
        notify('Clip removed', 'success')
      })
      .catch((e) => notify(e.message, 'error'))
  }

  const reanalyze = () => {
    setAnalysis(null)
    api.analyze(id).then(() => { setRunning(true); notify('Re-running analysis…') })
      .catch((e) => notify(e.message, 'error'))
  }

  const activeStyle = useMemo(
    () => styles.styles.find((s) => s.id === options.style) || styles.styles[0] || {},
    [styles, options.style])

  const onCommand = (res) => {
    const patch = res.patch || {}
    setOptions((o) => {
      const next = { ...o }
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'clip_id' || v === undefined) continue
        next[k] = v
      }
      return next
    })
    if (patch.clip_id) {
      const c = clips.find((x) => x.id === patch.clip_id)
      if (c) pickClip(c)
    }
    notify(res.message || 'Command applied', Object.keys(patch).length ? 'success' : 'info')
  }

  if (!project) {
    return (
      <main className="editor">
        <div className="empty-state">
          <div className="spinner" aria-hidden="true" />
          <p>Loading project…</p>
        </div>
      </main>
    )
  }

  const stageIdx = STAGES.findIndex(([k]) => k === project.stage)
  const analyzing = running || project.status === 'analyzing'

  return (
    <main className="editor">
      <div className="editor-head">
        <button className="btn ghost" onClick={onBack}>← Projects</button>
        <h2 className="editor-title" title={project.name}>{project.name}</h2>
        <span className="chip">{fmtMMSS(project.duration)} · {project.width}×{project.height}</span>
        {analyzing && <span className="chip analyzing">Analyzing…</span>}
        {!analyzing && analysis && (
          <button className="btn tiny secondary" onClick={reanalyze} title="Run the clip finder again">
            ⟳ Re-analyze
          </button>
        )}
        <span className="spacer" />
        {analysis && (
          <span className="chip" title="Speech-to-text and clip-finding engines used">
            {analysis.stt_engine} · {analysis.engine}
          </span>
        )}
      </div>

      {analyzing && (
        <div className="card stages" aria-live="polite">
          {STAGES.map(([k, label], i) => (
            <div key={k} className={`stage ${i < stageIdx ? 'done' : ''} ${i === stageIdx ? 'active' : ''}`}>
              <span className="stage-dot">{i < stageIdx ? '✓' : i + 1}</span> {label}
            </div>
          ))}
          {project.stage_detail && <span className="muted stage-detail">{project.stage_detail}</span>}
        </div>
      )}

      {project.status === 'error' && (
        <div className="error-banner" role="alert">Analysis error: {project.error}</div>
      )}

      <div className="editor-grid">
        {/* ---------------- left: clips ---------------- */}
        <section className="panel card clips-panel">
          <div className="panel-head">
            <h3>Suggested clips</h3>
            <span className="muted">{clips.length ? `${clips.length} found` : ''}</span>
            <button className="btn tiny secondary" onClick={addManualClip}
                    title="Add a 30s clip at the playhead">+ Manual</button>
          </div>

          {clips.length === 0 && !analyzing && (
            <div className="muted pad">
              No clips yet.{analysis ? ' Re-run analysis or add a manual clip.' : ''}
            </div>
          )}

          <div className="clip-list">
            {clips.map((c, i) => (
              <ClipCard
                key={c.id}
                clip={c}
                rank={i + 1}
                active={selected?.id === c.id}
                onSelect={() => pickClip(c)}
                onDelete={c.source === 'manual' ? () => deleteClip(c) : undefined}
              />
            ))}
          </div>
        </section>

        {/* ---------------- center: player + timeline ---------------- */}
        <section className="panel card center-panel">
          <VideoPlayer
            project={project}
            selected={selected}
            seekTo={seekTo}
            onSeekHandled={() => setSeekTo(null)}
            aspect={options.aspect || activeStyle.aspect || 'crop'}
            cropX={options.crop_x ?? 0.5}
            onTimeUpdate={setTime}
            onSetStart={() => selected && updateClip({ start: Math.max(0, Math.min(time, selected.end - 3)) })}
            onSetEnd={() => selected && updateClip({ end: Math.min(project.duration, Math.max(time, selected.start + 3)) })}
            onNudgeEnd={(d) => selected && updateClip({ end: Math.max(selected.start + 3, Math.min(project.duration, selected.end + d)) })}
          />
          <Timeline
            project={project}
            analysis={analysis}
            selected={selected}
            time={time}
            onSelect={updateClip}
            onSeek={(t) => setSeekTo(t)}
          />

          {selected && (
            <div className="clip-nudge">
              <label htmlFor="clip-start">Start</label>
              <input id="clip-start" type="number" step="0.1" min="0" max={project.duration}
                     value={Number(selected.start.toFixed(1))}
                     onChange={(e) => updateClip({ start: Math.max(0, Math.min(+e.target.value, selected.end - 3)) })} />
              <label htmlFor="clip-end">End</label>
              <input id="clip-end" type="number" step="0.1" min="0" max={project.duration}
                     value={Number(selected.end.toFixed(1))}
                     onChange={(e) => updateClip({ end: Math.min(project.duration, Math.max(+e.target.value, selected.start + 3)) })} />
              <span className="chip">{(selected.end - selected.start).toFixed(1)}s</span>
              {selected.title && <span className="muted">{selected.title}</span>}
            </div>
          )}

          <CommandBox projectId={id} onResult={onCommand} disabled={!analysis} />
        </section>

        {/* ---------------- right: properties ---------------- */}
        <section className="props">
          <div className="panel card">
            <div className="panel-head"><h3>Style</h3></div>
            <StyleGrid styles={styles.styles} value={options.style}
                       onPick={(styleId) => set({ style: styleId })} />
            {activeStyle.description && <p className="muted style-desc">{activeStyle.description}</p>}
          </div>

          <EffectsControls
            options={options}
            set={set}
            style={activeStyle}
            assets={assets}
            hasTranscript={!!analysis?.transcript?.length}
            onReset={() => setOptions({ ...DEFAULT_OPTIONS, style: options.style })}
          />

          <RenderPanel
            projectId={id}
            project={project}
            selected={selected}
            options={options}
            set={set}
            notify={notify}
          />
        </section>
      </div>

      {analysis?.transcript?.length > 0 && (
        <TranscriptPanel analysis={analysis} selected={selected} onSeek={(t) => setSeekTo(t)} />
      )}
    </main>
  )
}
