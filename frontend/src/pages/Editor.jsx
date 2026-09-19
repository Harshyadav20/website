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

const DEFAULT_OPTIONS = {
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
  ['audio', 'Silence detection'],
  ['transcribe', 'Transcription'],
  ['ai', 'AI clip finding'],
  ['done', 'Complete'],
]

export default function Editor({ id, onBack }) {
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [running, setRunning] = useState(false)
  const [clips, setClips] = useState([])
  const [selected, setSelected] = useState(null)   // working copy of the clip
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [styles, setStyles] = useState({ styles: [] })
  const [assets, setAssets] = useState(null)
  const [seekTo, setSeekTo] = useState(null)       // seconds -> player seeks
  const [toast, setToast] = useState('')
  const pollRef = useRef(null)

  const set = (patch) => setOptions((o) => ({ ...o, ...patch }))

  const loadProject = useCallback(async () => {
    const p = await api.project(id)
    setProject(p)
    const a = await api.analysis(id)
    setAnalysis(a.analysis)
    setRunning(a.running)
    setClips(a.analysis?.clips || [])
  }, [id])

  useEffect(() => {
    loadProject()
    api.styles().then(setStyles).catch(() => {})
    api.assets().then(setAssets).catch(() => {})
  }, [loadProject])

  // kick off analysis automatically for fresh uploads
  useEffect(() => {
    if (!project || running || analysis) return
    if (project.status === 'ready') {
      api.analyze(id).then(() => setRunning(true)).catch(() => {})
    }
  }, [project, running, analysis, id])

  // poll while analyzing
  useEffect(() => {
    if (!running) return
    pollRef.current = setInterval(async () => {
      const a = await api.analysis(id)
      setRunning(a.running)
      setProject(a.project)
      if (!a.running) {
        setAnalysis(a.analysis)
        setClips(a.analysis?.clips || [])
        if (a.project?.status === 'error') setToast('Analysis failed: ' + a.project.error)
      }
    }, 1500)
    return () => clearInterval(pollRef.current)
  }, [running, id])

  const pickClip = (c) => {
    setSelected({ ...c })
    setSeekTo(c.start)
  }

  const addManualClip = () => {
    const start = Math.max(0, (selected?.start ?? 0))
    const end = Math.min(project.duration, start + 30)
    api.addClip(id, { start, end, title: 'Manual clip' }).then((c) => {
      setClips((cl) => [c, ...cl])
      pickClip(c)
    }).catch((e) => setToast(e.message))
  }

  const activeStyle = useMemo(
    () => styles.styles.find((s) => s.id === options.style) || styles.styles[0] || {},
    [styles, options.style])

  const onCommand = (res) => {
    const patch = res.patch || {}
    const next = { ...options }
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'clip_id') continue
      next[k] = v === undefined ? next[k] : v
    }
    setOptions(next)
    if (patch.clip_id) {
      const c = clips.find((x) => x.id === patch.clip_id)
      if (c) pickClip(c)
    }
    setToast(res.message || 'Command applied')
  }

  if (!project) return <main className="editor"><div className="muted pad">Loading…</div></main>

  const stageIdx = STAGES.findIndex(([k]) => k === project.stage)

  return (
    <main className="editor">
      <div className="editor-head">
        <button className="btn ghost" onClick={onBack}>← Projects</button>
        <h2 className="editor-title">{project.name}</h2>
        <span className="chip">{fmtMMSS(project.duration)} · {project.width}×{project.height}</span>
        {running && <span className="chip analyzing">Analyzing…</span>}
        {toast && <span className="chip done toast" onClick={() => setToast('')}>{toast} ✕</span>}
      </div>

      {(running || (project.status === 'analyzing')) && (
        <div className="stages card">
          {STAGES.map(([k, label], i) => (
            <div key={k} className={`stage ${i < stageIdx ? 'done' : ''} ${i === stageIdx ? 'active' : ''}`}>
              <span className="stage-dot">{i < stageIdx ? '✓' : i + 1}</span> {label}
            </div>
          ))}
          {project.stage_detail && <span className="muted stage-detail">{project.stage_detail}</span>}
        </div>
      )}
      {project.status === 'error' && (
        <div className="error-banner">Analysis error: {project.error}</div>
      )}

      <div className="editor-grid">
        {/* ---------------- left: clips ---------------- */}
        <section className="panel card">
          <div className="panel-head">
            <h3>Suggested clips</h3>
            <button className="btn tiny secondary" onClick={addManualClip}>+ Manual</button>
          </div>
          {clips.length === 0 && !running && (
            <div className="muted pad">
              No clips yet.{analysis ? ' Try re-running analysis or add a manual clip.' : ''}
            </div>
          )}
          <div className="clip-list">
            {clips.map((c) => (
              <ClipCard key={c.id} clip={c} active={selected?.id === c.id}
                        onSelect={() => pickClip(c)} project={project} />
            ))}
          </div>
          {analysis && (
            <div className="panel-foot muted">
              STT: {analysis.stt_engine} · Finder: {analysis.engine}
            </div>
          )}
        </section>

        {/* ---------------- center: player + timeline ---------------- */}
        <section className="panel card center-panel">
          <VideoPlayer project={project} selected={selected} seekTo={seekTo}
                       onSeekHandled={() => setSeekTo(null)}
                       options={options} />
          <Timeline project={project} analysis={analysis} selected={selected}
                    onSelect={setSelected} onSeek={(t) => setSeekTo(t)} />
          {selected && (
            <div className="clip-nudge">
              <label>Start</label>
              <input type="number" step="0.1" value={selected.start}
                     onChange={(e) => setSelected({ ...selected, start: +e.target.value })} />
              <label>End</label>
              <input type="number" step="0.1" value={selected.end}
                     onChange={(e) => setSelected({ ...selected, end: +e.target.value })} />
              <span className="chip">{(selected.end - selected.start).toFixed(1)}s</span>
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
          <EffectsControls options={options} set={set} style={activeStyle} assets={assets}
                           hasTranscript={!!analysis?.transcript?.length} />
          <RenderPanel projectId={id} project={project} selected={selected} options={options}
                       set={set} onToast={setToast} />
        </section>
      </div>

      {analysis?.transcript?.length > 0 && (
        <TranscriptPanel analysis={analysis} selected={selected} onSeek={(t) => setSeekTo(t)} />
      )}
    </main>
  )
}
