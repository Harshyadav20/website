const BASE = ''

async function j(res) {
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json()
}

export const api = {
  health: () => fetch(`${BASE}/api/health`).then(j),
  projects: () => fetch(`${BASE}/api/projects`).then(j),
  project: (id) => fetch(`${BASE}/api/projects/${id}`).then(j),
  deleteProject: (id) => fetch(`${BASE}/api/projects/${id}`, { method: 'DELETE' }).then(j),
  useSample: () => fetch(`${BASE}/api/sample`, { method: 'POST' }).then(j),
  analyze: (id, targets) =>
    fetch(`${BASE}/api/projects/${id}/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets }),
    }).then(j),
  analysis: (id) => fetch(`${BASE}/api/projects/${id}/analysis`).then(j),
  addClip: (id, clip) =>
    fetch(`${BASE}/api/projects/${id}/clips`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clip),
    }).then(j),
  deleteClip: (id, cid) => fetch(`${BASE}/api/projects/${id}/clips/${cid}`, { method: 'DELETE' }).then(j),
  styles: () => fetch(`${BASE}/api/styles`).then(j),
  assets: () => fetch(`${BASE}/api/assets`).then(j),
  render: (id, clip, options) =>
    fetch(`${BASE}/api/projects/${id}/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clip, options }),
    }).then(j),
  renderStatus: (rid) => fetch(`${BASE}/api/renders/${rid}`).then(j),
  projectRenders: (id) => fetch(`${BASE}/api/projects/${id}/renders`).then(j),
  command: (id, text) =>
    fetch(`${BASE}/api/projects/${id}/command`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(j),
  captionPreview: (id, body) =>
    fetch(`${BASE}/api/projects/${id}/captions/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),
}

/** Upload with progress events (fetch can't report upload progress). */
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new Error(data.detail || `Upload failed (${xhr.status})`))
      } catch (e) { reject(new Error(`Upload failed (${xhr.status})`)) }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.open('POST', `${BASE}/api/upload`)
    xhr.send(form)
  })
}

export const fmtMMSS = (s) => {
  s = Math.max(0, Math.round(s || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const fmtDur = (s) => {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`
}
