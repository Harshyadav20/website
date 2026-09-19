import React, { useRef, useState } from 'react'
import { uploadFile } from '../services/api.js'

export default function VideoUploader({ onUploaded }) {
  const [drag, setDrag] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const send = async (file) => {
    setError('')
    if (!file) return
    if (!/\.(mp4|mov|mkv|webm|m4v|avi|mp3|m4a|wav)$/i.test(file.name)) {
      setError('Please choose a video or audio file (mp4, mov, mkv, webm…)')
      return
    }
    setProgress(0)
    try {
      const p = await uploadFile(file, setProgress)
      onUploaded(p)
    } catch (e) {
      setError(e.message)
      setProgress(null)
    }
  }

  return (
    <div
      className={`uploader ${drag ? 'drag' : ''} ${progress !== null ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]) }}
      onClick={() => progress === null && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept="video/*,audio/*" hidden
             onChange={(e) => send(e.target.files[0])} />
      {progress === null ? (
        <>
          <div className="uploader-icon">📥</div>
          <div className="uploader-title">Drop your long video here</div>
          <div className="uploader-sub">or click to browse — mp4 / mov / mkv / webm, up to 2 GB</div>
        </>
      ) : (
        <div className="uploader-progress">
          <div className="spinner" />
          <div className="uploader-title">Uploading… {Math.round(progress * 100)}%</div>
          <div className="bar"><div className="bar-fill" style={{ width: `${progress * 100}%` }} /></div>
        </div>
      )}
      {error && <div className="error-banner small">{error}</div>}
    </div>
  )
}
