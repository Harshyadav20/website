# 🎬 ClipForge — AI Video Clipper & Editor

Turn one long video into many short-form clips (YouTube Shorts / Reels / TikTok)
**automatically** — transcription, moment-finding, 9:16 reframing, animated
captions, zooms, silence removal, music and SFX, all rendered locally by FFmpeg.

```
LONG VIDEO
   │
   ▼
AI ANALYSIS ──── silence detection · transcript (local STT) · hook & moment scoring
   │
   ├── 🔥 Hook   ⭐ Key moment   💡 Insight   🎯 Strong statement
   │
   ▼
AUTO CLIPPING ── 15s · 30s · 45s · 60s suggestions
   │
   ▼
EDIT & STYLE ── 7 presets (Viral, Podcast, Cinematic…) · 6 caption animations
   │             zoom punches · blur bars · silence removal · watermark · music
   ▼
FFMPEG RENDER ── 1080×1920 H.264 MP4 with burned-in animated captions
```

## Stack

| Function            | Technology                                    |
| ------------------- | --------------------------------------------- |
| Frontend            | React 18 + Vite (built SPA served by FastAPI) |
| Backend             | Python 3.11 + FastAPI + SQLite                |
| Video processing    | FFmpeg 7 (static build, auto-bootstrapped)    |
| Speech-to-text      | Vosk (bundled) or **faster-whisper** if installed |
| AI clip finding     | Gemini free tier → Ollama → local heuristic fallback |
| Text animation      | FFmpeg + libass (word-level ASS events)       |
| Storage             | Local filesystem                              |

**Cost model:** the video never leaves your machine. Only a few KB of
*transcript text* is optionally sent to Gemini — and if you don't set a key
(or run Ollama), a local heuristic scorer finds clips with zero API calls.

## Quickstart

```bash
# 1. bootstrap (ffmpeg binary + vosk model + python deps — idempotent)
bash scripts/ensure_deps.sh

# 2. build the frontend (or skip: API works standalone)
cd frontend && npm install && npm run build && cd ..

# 3. run
cd backend
PYTHONPATH=vendor python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
# open http://localhost:8000
```

Optional AI providers (`.env` or environment):

```bash
export GEMINI_API_KEY=...      # free key: https://aistudio.google.com/apikey
export OLLAMA_BASE_URL=http://localhost:11434   # zero-cost local alternative
```

`faster-whisper` upgrade (better transcripts, punctuation): `pip install faster-whisper`
— it is auto-detected and preferred over Vosk.

## Features

### Analysis pipeline
- **Upload** any mp4/mov/mkv/webm (or audio-only).
- **Silence map** via ffmpeg `silencedetect`.
- **Transcript** with *word-level timestamps* (Vosk offline, or faster-whisper).
- **Clip finder** — three interchangeable engines, tried in order:
  1. **Gemini** (free tier): transcript → JSON of `{start, end, hook, title, reason, tag, score}`.
  2. **Ollama**: same prompt against a local model.
  3. **Local heuristic**: sliding-window scorer over sentences — hook keywords,
     speech density, boundary cleanliness, silence penalty. Works with zero keys.
- Suggested clips target 15/30/45/60s and are snapped to speech boundaries.

### Editor
- Speech/silence timeline with draggable clip window.
- 16:9 preview with a live 9:16 crop guide (with adjustable focus X).
- Transcript panel — click any sentence to seek; in-clip sentences highlighted.
- Manual clips + numeric start/end nudging.
- **AI command box**: "make this a 30 second viral reel" → parses to a settings patch.

### Rendering (FFmpeg)
- **9:16 conversion**: center-crop (with focus control), blurred-bars, or fit.
- **Animated captions** burned via libass, one Dialogue event *per word*:
  - `pop` — words scale in one-by-one at fixed positions
  - `highlight` — active word flashes in the style accent color
  - `bounce` — springy scale overshoot
  - `typewriter` — words appear as spoken
  - `kinetic` — one giant word at a time, centered
  - `none` — static lines with fade
- **Zoom**: automatic punch-ins at sentence starts (with ease-in/out), or slow push.
- **Silence removal**: interior silences are cut and captions are *re-timed*
  onto the new timeline.
- **Music** beds (synthesized, royalty-free-by-construction), whoosh/pop **SFX**
  synced to zoom punches, **watermark** text overlay.
- 7 style presets driving font/color/animation/zoom/framing defaults.

### Styles

| Style | Look |
| ----- | ---- |
| 🔥 Viral | Anton, yellow word pops, punch zooms |
| ✨ Clean | Montserrat ExtraBold, purple highlight |
| 🎙️ Podcast | Green keyword highlight, blur bars |
| 🎬 Cinematic | Bebas Neue, letter-spaced typewriter, centered |
| 💼 Corporate | Boxed subdued captions |
| 🎮 Gaming | Huge bouncing cyan words |
| ◻️ Minimal | Small quiet captions |

## Project structure

```
├── backend/
│   ├── app/
│   │   ├── main.py               FastAPI app, SPA + media serving
│   │   ├── config.py             paths, engine discovery, feature flags
│   │   ├── routes/               upload · clips(analysis) · captions · render · command
│   │   ├── services/
│   │   │   ├── video_analyzer.py probe → silence → STT → AI → clips
│   │   │   ├── whisper_service.py  faster-whisper / vosk engines
│   │   │   ├── ai_service.py     Gemini → Ollama → heuristic; command parsing
│   │   │   ├── clip_service.py   local heuristic scorer
│   │   │   ├── caption_service.py ASS builder (animations, styles, watermark)
│   │   │   └── render_service.py FFmpeg pipeline + job manager
│   │   ├── utils/                ffmpeg wrapper · fonts · timeline math
│   │   └── models/project.py     SQLite persistence
│   ├── uploads/ renders/ captions/ data/     (runtime, gitignored)
│   └── requirements.txt
├── frontend/
│   └── src/ pages(Dashboard, Editor) · components · services/api.js
├── assets/
│   ├── fonts/                    Anton · Bebas Neue · Montserrat · DejaVu
│   ├── music/                    upbeat · chill · ambient (synthesized)
│   ├── sfx/                      whoosh · pop (synthesized)
│   ├── samples/                  bundled AI-narrated demo video
│   └── templates/styles.json     style preset definitions
└── scripts/ensure_deps.sh        idempotent bootstrap
```

## API overview

| Method | Route | Purpose |
| ------ | ----- | ------- |
| POST | `/api/upload` | upload video (multipart) → project |
| POST | `/api/sample` | create project from bundled demo video |
| GET  | `/api/projects` / `/{pid}` | list / fetch projects |
| POST | `/api/projects/{pid}/analyze` | run full analysis (background) |
| GET  | `/api/projects/{pid}/analysis` | transcript, silences, clips, stage |
| POST/GET | `/api/projects/{pid}/clips` | manual clip CRUD |
| GET  | `/api/styles` · `/api/assets` | style presets · music/sfx/fonts |
| POST | `/api/projects/{pid}/captions/preview` | inspect generated .ass |
| POST | `/api/projects/{pid}/render` | start render job |
| GET  | `/api/renders/{rid}` | job status/progress/result URL |
| POST | `/api/projects/{pid}/command` | natural-language edit command |

## Roadmap

- [x] V1 — upload → cut → 9:16 → export
- [x] V2 — local transcription → animated burned captions
- [x] V3 — AI clip detection (Gemini / Ollama / heuristic)
- [x] V4 — animated captions, zoom, silence removal
- [x] V5 — styles, music, SFX, watermark
- [ ] V6 — full multi-track timeline editor
- [ ] V7 — free-form AI commands driving the whole pipeline

Planned: speaker tracking for dynamic 9:16 crops (currently a fixed focus-X
control), B-roll insertion, and per-platform export presets.
