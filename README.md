# 🎬 Clipper AI — AI Video Clipper & Editor

Turn one long video into many short-form clips (YouTube Shorts / Reels / TikTok)
**automatically** — transcription, moment-finding, 9:16 reframing, animated
captions, zooms, silence removal, music and SFX, all rendered by FFmpeg.

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

| | |
| --- | --- |
| **Deploy in one click** | Render Blueprint → `render.yaml` → Docker image |
| **Runs anywhere** | Single container: React SPA + FastAPI + FFmpeg + offline STT |
| **Privacy-first** | Video never leaves the box; AI keys are optional |

## Stack

| Function            | Technology                                          |
| ------------------- | --------------------------------------------------- |
| Frontend            | React 18 + Vite (built SPA served by FastAPI)       |
| Backend             | Python 3.11 + FastAPI + SQLite                      |
| Video processing    | FFmpeg 7 / 5.1 (libass + libx264)                   |
| Speech-to-text      | Vosk (bundled model) or **faster-whisper** if installed |
| AI clip finding     | Gemini free tier → Ollama → local heuristic fallback |
| Text animation      | FFmpeg + libass (word-level ASS events)             |
| Storage             | Local filesystem or a mounted volume                |

**Cost model:** the video never leaves your machine. Only a few KB of
*transcript text* is optionally sent to Gemini — and if you don't set a key
(or run Ollama), a local heuristic scorer finds clips with zero API calls.

---

## Quickstart (local)

```bash
# 1. bootstrap (ffmpeg binary + vosk model + python deps — idempotent)
bash scripts/ensure_deps.sh

# 2. build the frontend (or skip: the API works standalone)
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

## Docker

```bash
docker build -t clipper-ai .
docker run -p 8000:8000 clipper-ai        # → http://localhost:8000

# or, with a named volume so projects survive rebuilds:
docker compose up --build
```

The image contains everything: FFmpeg, the Vosk speech model, the compiled SPA
and the API. `DATA_DIR=/var/data` is the single writable mount point.

---

## 🚀 Deploy to Render (free)

Everything needed is in this repo, so Render can build it unattended.

1. **Sign in** at [render.com](https://render.com) with GitHub (no credit card needed for the free plan).
2. **New → Blueprint**, pick the `website` repository, click **Apply**.
   Render reads `render.yaml`, builds `./Dockerfile` and deploys one web service.
3. Wait ~5 minutes for the first build (FFmpeg + speech model + SPA).
   You get a public URL like `https://clipper-ai.onrender.com`.
4. *(Optional, during the same wizard)* paste a `GEMINI_API_KEY` for AI clip picking — leave it blank to stay fully offline.

> **Blueprint files are read from the repository's default branch (`main`).**
> Merge this work into `main` first, or point Render at the
> `arena/01a0be6f-website` branch in the service settings.

Deploying with Render's **native Python runtime** instead (the form that asks
for Build/Start commands)? Copy the exact commands and environment variables
from [docs/DEPLOY.md](docs/DEPLOY.md#1b-render-native-runtime-no-docker--exact-field-values).

### What the free plan means

| Limit | Effect | Mitigation in this repo |
| --- | --- | --- |
| No persistent disk | uploads & renders are wiped on restart/redeploy | `EPHEMERAL_STORAGE=1` makes the UI warn users; attach a disk (paid) and remove it |
| 512 MB RAM / 0.1 CPU | rendering is slow, big uploads can OOM | `MAX_UPLOAD_MB=200` in `render.yaml`; pick **720p fast** for exports |
| Sleeps after ~15 min idle | first request after a nap takes ~30 s | the UI shows a spinner; the health check wakes it |
| Ephemeral filesystem | projects don't survive redeploys | download finished MP4s, or attach a disk |

Full walkthrough, other hosts (Fly.io, Railway, VPS + nginx) and troubleshooting:
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

---

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
- Speech/silence timeline with a draggable clip window and live playhead.
- 16:9 preview with a live 9:16 crop guide (adjustable focus X).
- Keyboard shortcuts: `space` play/pause, `←/→` seek (with `shift`: 5s),
  `I`/`O` set clip in/out, `[`/`]` trim the end.
- Transcript panel — search, click any sentence to seek; in-clip lines highlighted.
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

## Developing

```bash
make preview     # one shot: deps + SPA build + serve on :8000 (best first command)
make seed        # create the sample project and render its top clip
make deps        # ffmpeg + vosk model + python deps (idempotent)
make build       # build the SPA into backend/static
make api         # run the API on :8000 (serves the built SPA)
make dev         # vite dev server on :5173 with API proxy
make test        # backend byte-compile + production frontend build
make docker-run  # build and run the container on :8000
make help        # everything else
```

### UI smoke test

`npm run smoke` (in `frontend/`) renders the real app inside jsdom against a
running backend and walks dashboard → editor → clip select → style switch →
AI command → back, failing on any JavaScript error:

```bash
cd backend && PYTHONPATH=vendor python3 -m uvicorn app.main:app --port 8000 &
curl -X POST localhost:8000/api/sample
cd frontend && npm run smoke
```

Clip-dependent assertions are skipped automatically when the project has not
been analyzed yet, so it also runs on a backend without speech-to-text.
The smoke test uses jsdom, which needs **Node 22.22+** (`npm run build` itself
works on Node 18+).
GitHub Actions runs the backend, frontend-build and Docker jobs on every push.

## Configuration

Every path can be redirected with an environment variable, so the same image
runs on a laptop, in compose and on a host:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | HTTP port (Render sets this automatically) |
| `DATA_DIR` | `backend/` | Root for uploads, renders, captions and `app.db` |
| `UPLOADS_DIR` / `RENDERS_DIR` / `CAPTIONS_DIR` / `DB_PATH` | under `DATA_DIR` | Fine-grained overrides |
| `STATIC_DIR` | `backend/static` | Built SPA served at `/` |
| `FFMPEG_BIN` | auto-detected | Explicit FFmpeg binary |
| `VOSK_MODEL_PATH` | auto-detected | Vosk model directory |
| `MAX_UPLOAD_MB` | `2048` | Upload ceiling (UI shows it) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | – / `gemini-2.0-flash` | Cloud clip finder |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | – / `llama3.2` | Local LLM clip finder |
| `SILENCE_NOISE_DB`, `SILENCE_MIN_DUR` | `-35`, `0.35` | Silence detection tuning |
| `EPHEMERAL_STORAGE` | `0` | `1` shows the "uploads are cleared" banner |
| `DEPLOY_TARGET` | `local` | Free-form label surfaced in `/api/health` |

## Project structure

```
├── Dockerfile · .dockerignore     single-image build (SPA + API + FFmpeg + STT)
├── render.yaml                    Render Blueprint (one web service)
├── docker-compose.yml             local container run with a data volume
├── backend/
│   ├── app/
│   │   ├── main.py                FastAPI app, SPA + media serving, health
│   │   ├── config.py              paths, engine discovery, feature flags
│   │   ├── routes/                upload · clips(analysis) · captions · render · command
│   │   ├── services/
│   │   │   ├── video_analyzer.py  probe → silence → STT → AI → clips
│   │   │   ├── whisper_service.py faster-whisper / vosk engines
│   │   │   ├── ai_service.py      Gemini → Ollama → heuristic; command parsing
│   │   │   ├── clip_service.py    local heuristic scorer
│   │   │   ├── caption_service.py ASS builder (animations, styles, watermark)
│   │   │   └── render_service.py  FFmpeg pipeline + job manager
│   │   ├── utils/                 ffmpeg wrapper · fonts · timeline math
│   │   └── models/project.py      SQLite persistence
│   ├── uploads/ renders/ captions/ data/   (runtime, gitignored)
│   └── requirements.txt
├── frontend/
│   └── src/ pages(Dashboard, Editor) · components · services/api.js
├── assets/
│   ├── fonts/                     Anton · Bebas Neue · Montserrat · DejaVu
│   ├── music/                     upbeat · chill · ambient (synthesized)
│   ├── sfx/                       whoosh · pop (synthesized)
│   ├── samples/                   bundled AI-narrated demo video
│   └── templates/styles.json      style preset definitions
└── scripts/ensure_deps.sh         idempotent local bootstrap
```

## API overview

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET  | `/api/health` | engine status, version, upload limit, storage mode |
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
- [x] V6 — one-container deployment (Docker + Render Blueprint)
- [ ] V7 — full multi-track timeline editor
- [ ] V8 — free-form AI commands driving the whole pipeline

Planned: speaker tracking for dynamic 9:16 crops (currently a fixed focus-X
control), B-roll insertion, and per-platform export presets.
