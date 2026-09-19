import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, uploadFile, fmtDur } from '../services/api.js'
import VideoUploader from '../components/VideoUploader.jsx'

export default function Dashboard({ onOpen }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [sampleBusy, setSampleBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    api.projects().then(setProjects).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [])
  useEffect(refresh, [refresh])

  const openProject = async (p) => {
    onOpen(p.id)
  }

  const useSample = async () => {
    setSampleBusy(true)
    setError('')
    try {
      const p = await api.useSample()
      onOpen(p.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setSampleBusy(false)
    }
  }

  const del = async (p, ev) => {
    ev.stopPropagation()
    if (!confirm(`Delete "${p.name}" and all its renders?`)) return
    await api.deleteProject(p.id)
    refresh()
  }

  return (
    <main className="dashboard">
      <section className="hero">
        <h1>Turn long videos into <span className="grad">shorts</span>, automatically.</h1>
        <p className="hero-sub">
          Upload a podcast, interview or lecture. ClipForge transcribes it, finds the strongest
          moments, and renders captioned 9:16 clips with zooms, animated text and music — all
          processed locally with FFmpeg.
        </p>
        <div className="hero-cols">
          <VideoUploader onUploaded={openProject} />
          <div className="hero-side">
            <div className="card sample-card">
              <h3>🎙️ No video handy?</h3>
              <p>Load the bundled demo — a 60-second creator podcast with real speech, pauses and hooks.</p>
              <button className="btn secondary" onClick={useSample} disabled={sampleBusy}>
                {sampleBusy ? 'Loading…' : 'Try the sample video'}
              </button>
            </div>
            <div className="card pipeline-card">
              <h3>How it works</h3>
              <ol className="pipeline">
                <li><b>Upload</b> your long video</li>
                <li><b>Whisper/Vosk</b> transcribes locally</li>
                <li><b>AI</b> scores the best moments</li>
                <li><b>FFmpeg</b> renders 9:16 with animated captions</li>
              </ol>
            </div>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </section>

      <section className="projects">
        <h2>Your projects</h2>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="muted">No projects yet — upload a video above.</div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div key={p.id} className="card project-card" onClick={() => openProject(p)}>
                <div className="project-thumb">
                  {p.thumb_url
                    ? <img src={p.thumb_url} alt="" />
                    : <div className="thumb-fallback">🎞️</div>}
                  <span className="chip dur">{fmtDur(p.duration)}</span>
                  {p.status === 'analyzing' && <span className="chip analyzing">Analyzing…</span>}
                  {p.status === 'done' && <span className="chip done">Analyzed</span>}
                </div>
                <div className="project-meta">
                  <div className="project-name">{p.name}</div>
                  <div className="project-sub">
                    {p.width}×{p.height} · {new Date(p.created_at).toLocaleString()}
                  </div>
                </div>
                <button className="icon-btn delete" title="Delete project"
                        onClick={(e) => del(p, e)}>🗑</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
