import React from 'react'

export default function StyleGrid({ styles, value, onPick }) {
  return (
    <div className="style-grid">
      {(styles || []).map((s) => (
        <button key={s.id}
                className={`style-tile ${value === s.id ? 'active' : ''}`}
                onClick={() => onPick(s.id)}
                title={s.description}>
          <span className="style-emoji">{s.emoji}</span>
          <span>{s.name}</span>
        </button>
      ))}
    </div>
  )
}
