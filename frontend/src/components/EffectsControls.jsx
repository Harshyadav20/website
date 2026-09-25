import React from 'react'

function Row({ label, children, hint }) {
  return (
    <div className="ctl-row">
      <div className="ctl-label">
        <span>{label}</span>
        {hint && <span className="ctl-hint">{hint}</span>}
      </div>
      <div className="ctl-body">{children}</div>
    </div>
  )
}

const ANIMATIONS = [
  ['pop', 'Pop'], ['highlight', 'Highlight'], ['bounce', 'Bounce'],
  ['typewriter', 'Typewriter'], ['kinetic', 'Kinetic'], ['none', 'Static'],
]

export default function EffectsControls({ options, set, style, assets, hasTranscript, onReset }) {
  const anim = options.caption_animation || style.animation || 'pop'
  const position = options.caption_position || style.position
  const zoom = options.zoom || style.zoom
  const aspect = options.aspect || style.aspect

  return (
    <div className="panel card">
      <div className="panel-head">
        <h3>Captions &amp; effects</h3>
        {onReset && (
          <button className="btn ghost tiny" onClick={onReset} title="Back to this style's defaults">
            Reset
          </button>
        )}
      </div>

      <Row label="Captions" hint={hasTranscript ? undefined : 'needs transcript'}>
        <button className={`switch ${options.captions ? 'on' : ''}`}
                aria-pressed={options.captions}
                onClick={() => set({ captions: !options.captions })}>
          {options.captions ? 'ON' : 'OFF'}
        </button>
      </Row>

      <Row label="Animation" hint={options.caption_animation ? undefined : `style: ${style.animation || 'pop'}`}>
        <div className="seg wrap">
          {ANIMATIONS.map(([id, label]) => (
            <button key={id} className={anim === id ? 'active' : ''}
                    aria-pressed={anim === id}
                    onClick={() => set({ caption_animation: id })}>{label}</button>
          ))}
        </div>
      </Row>

      <Row label={`Font size — ${Math.round(options.font_scale * 100)}%`}>
        <input type="range" min="0.6" max="1.6" step="0.05" value={options.font_scale}
               aria-label="Caption font size"
               onChange={(e) => set({ font_scale: +e.target.value })} />
      </Row>

      <Row label="Position" hint={options.caption_position ? undefined : `style: ${style.position}`}>
        <div className="seg">
          {['bottom', 'middle', 'top'].map((p) => (
            <button key={p} className={position === p ? 'active' : ''}
                    aria-pressed={position === p}
                    onClick={() => set({ caption_position: p })}>{p}</button>
          ))}
        </div>
      </Row>

      <Row label="Uppercase" hint={options.uppercase == null ? `style: ${style.uppercase ? 'yes' : 'no'}` : undefined}>
        <div className="seg">
          {[['', 'style'], ['yes', 'YES'], ['no', 'lower']].map(([v, l]) => (
            <button key={l}
                    className={`${v === '' ? options.uppercase == null : options.uppercase === (v === 'yes') ? 'active' : ''}`}
                    onClick={() => set({ uppercase: v === '' ? null : v === 'yes' })}>{l}</button>
          ))}
        </div>
      </Row>

      <div className="divider" />

      <Row label="Zoom" hint={options.zoom ? undefined : `style: ${style.zoom}`}>
        <div className="seg">
          {['punch', 'slow', 'none'].map((z) => (
            <button key={z} className={zoom === z ? 'active' : ''}
                    aria-pressed={zoom === z}
                    onClick={() => set({ zoom: z })}>{z}</button>
          ))}
        </div>
      </Row>

      <Row label="9:16 framing" hint={options.aspect ? undefined : `style: ${style.aspect}`}>
        <div className="seg">
          {[['crop', 'crop'], ['blur', 'blur bars'], ['fit', 'fit']].map(([v, l]) => (
            <button key={v} className={aspect === v ? 'active' : ''}
                    aria-pressed={aspect === v}
                    onClick={() => set({ aspect: v })}>{l}</button>
          ))}
        </div>
      </Row>

      {aspect === 'crop' && (
        <Row label={`Crop focus X — ${Math.round((options.crop_x ?? 0.5) * 100)}%`}>
          <input type="range" min="0" max="1" step="0.05" value={options.crop_x ?? 0.5}
                 aria-label="Horizontal crop focus"
                 onChange={(e) => set({ crop_x: +e.target.value })} />
        </Row>
      )}

      <Row label="Remove silence" hint="cuts dead air, retimes captions">
        <button className={`switch ${options.remove_silence ? 'on' : ''}`}
                aria-pressed={options.remove_silence}
                onClick={() => set({ remove_silence: !options.remove_silence })}>
          {options.remove_silence ? 'ON' : 'OFF'}
        </button>
      </Row>

      <div className="divider" />

      <Row label="Music" hint={options.music == null ? `style: ${style.music || 'none'}` : undefined}>
        <select value={options.music ?? ''} aria-label="Background music"
                onChange={(e) => set({ music: e.target.value === '' ? null : e.target.value })}>
          <option value="">style default</option>
          {(assets?.music || []).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </Row>

      <Row label={`Music volume — ${Math.round((options.music_volume ?? 0.16) * 100)}%`}>
        <input type="range" min="0" max="0.5" step="0.02" value={options.music_volume ?? 0.16}
               aria-label="Music volume"
               onChange={(e) => set({ music_volume: +e.target.value })} />
      </Row>

      <Row label="Whoosh &amp; pop SFX" hint="synced to the zoom punches">
        <button className={`switch ${options.sfx ? 'on' : ''}`}
                aria-pressed={options.sfx}
                onClick={() => set({ sfx: !options.sfx })}>
          {options.sfx ? 'ON' : 'OFF'}
        </button>
      </Row>

      <Row label="Watermark text">
        <input type="text" className="text-input" placeholder="@yourhandle"
               aria-label="Watermark text"
               value={options.watermark} onChange={(e) => set({ watermark: e.target.value })} />
      </Row>
    </div>
  )
}
