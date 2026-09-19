import React from 'react'

function Row({ label, children, hint }) {
  return (
    <div className="ctl-row">
      <div className="ctl-label">{label}{hint && <span className="ctl-hint">{hint}</span>}</div>
      <div className="ctl-body">{children}</div>
    </div>
  )
}

export default function EffectsControls({ options, set, style, assets, hasTranscript }) {
  const anims = [
    ['pop', 'Pop'], ['highlight', 'Highlight'], ['bounce', 'Bounce'],
    ['typewriter', 'Typewriter'], ['kinetic', 'Kinetic'], ['none', 'Static'],
  ]
  return (
    <div className="panel card">
      <div className="panel-head"><h3>Captions &amp; effects</h3></div>

      <Row label="Captions" hint={hasTranscript ? undefined : 'needs transcript'}>
        <button className={`switch ${options.captions ? 'on' : ''}`}
                onClick={() => set({ captions: !options.captions })}>
          {options.captions ? 'ON' : 'OFF'}
        </button>
      </Row>

      <Row label="Animation" hint={options.caption_animation ? undefined : `style: ${style.animation || 'pop'}`}>
        <div className="seg">
          {anims.map(([id, label]) => (
            <button key={id}
                    className={`${(options.caption_animation || style.animation || 'pop') === id ? 'active' : ''}`}
                    onClick={() => set({ caption_animation: id })}>{label}</button>
          ))}
        </div>
      </Row>

      <Row label={`Font size — ${Math.round(options.font_scale * 100)}%`}>
        <input type="range" min="0.6" max="1.6" step="0.05" value={options.font_scale}
               onChange={(e) => set({ font_scale: +e.target.value })} />
      </Row>

      <Row label="Position" hint={options.caption_position ? undefined : `style: ${style.position}`}>
        <div className="seg">
          {['bottom', 'middle', 'top'].map((p) => (
            <button key={p}
                    className={`${(options.caption_position || style.position) === p ? 'active' : ''}`}
                    onClick={() => set({ caption_position: p })}>{p}</button>
          ))}
        </div>
      </Row>

      <Row label="Uppercase" hint={options.uppercase == null ? `style: ${style.uppercase ? 'yes' : 'no'}` : undefined}>
        <div className="seg">
          {[['', 'style'], ['yes', 'YES'], ['no', 'lower']].map(([v, l]) => (
            <button key={l}
                    className={`${(v === '' ? options.uppercase == null : options.uppercase === (v === 'yes')) ? 'active' : ''}`}
                    onClick={() => set({ uppercase: v === '' ? null : v === 'yes' })}>{l}</button>
          ))}
        </div>
      </Row>

      <div className="divider" />

      <Row label="Zoom" hint={options.zoom ? undefined : `style: ${style.zoom}`}>
        <div className="seg">
          {['punch', 'slow', 'none'].map((z) => (
            <button key={z}
                    className={`${(options.zoom || style.zoom) === z ? 'active' : ''}`}
                    onClick={() => set({ zoom: z === 'none' ? 'none' : z })}>{z}</button>
          ))}
        </div>
      </Row>

      <Row label="9:16 framing" hint={options.aspect ? undefined : `style: ${style.aspect}`}>
        <div className="seg">
          {[['crop', 'crop'], ['blur', 'blur bars'], ['fit', 'fit']].map(([v, l]) => (
            <button key={v}
                    className={`${(options.aspect || style.aspect) === v ? 'active' : ''}`}
                    onClick={() => set({ aspect: v })}>{l}</button>
          ))}
        </div>
      </Row>

      {(options.aspect || style.aspect) === 'crop' && (
        <Row label={`Crop focus X — ${Math.round((options.crop_x ?? 0.5) * 100)}%`}>
          <input type="range" min="0" max="1" step="0.05" value={options.crop_x ?? 0.5}
                 onChange={(e) => set({ crop_x: +e.target.value })} />
        </Row>
      )}

      <Row label="Remove silence" hint="cuts dead air, retimes captions">
        <button className={`switch ${options.remove_silence ? 'on' : ''}`}
                onClick={() => set({ remove_silence: !options.remove_silence })}>
          {options.remove_silence ? 'ON' : 'OFF'}
        </button>
      </Row>

      <div className="divider" />

      <Row label="Music" hint={options.music == null ? `style: ${style.music || 'none'}` : undefined}>
        <select value={options.music ?? ''}
                onChange={(e) => set({ music: e.target.value === '' ? null : e.target.value })}>
          <option value="">style default</option>
          {(assets?.music || []).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </Row>

      <Row label={`Music volume — ${Math.round((options.music_volume ?? 0.16) * 100)}%`}>
        <input type="range" min="0" max="0.5" step="0.02" value={options.music_volume ?? 0.16}
               onChange={(e) => set({ music_volume: +e.target.value })} />
      </Row>

      <Row label="Whoosh &amp; pop SFX">
        <button className={`switch ${options.sfx ? 'on' : ''}`}
                onClick={() => set({ sfx: !options.sfx })}>
          {options.sfx ? 'ON' : 'OFF'}
        </button>
      </Row>

      <Row label="Watermark text">
        <input type="text" className="text-input" placeholder="@yourhandle"
               value={options.watermark} onChange={(e) => set({ watermark: e.target.value })} />
      </Row>
    </div>
  )
}
