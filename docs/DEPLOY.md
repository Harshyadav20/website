# Deploying Clipper AI

The repository ships everything needed to run as **one container**: the built
React SPA, the FastAPI backend, FFmpeg (with libass + libx264) and the offline
Vosk speech model. There is nothing to install on the host and no second service
to wire up.

```
┌──────────────────────── container ────────────────────────┐
│  FastAPI (uvicorn, $PORT)                                 │
│   ├─ /            React SPA (backend/static)              │
│   ├─ /api/*       REST API + background jobs              │
│   ├─ /media/*     uploaded videos + rendered MP4s         │
│   ├─ ffmpeg       Debian package, asserted at build time  │
│   └─ /opt/vosk-…  speech model baked into the image       │
└───────────────────────────────────────────────────────────┘
```

---

## 1. Render (free tier) — the guided path

1. Push this branch and merge it into the repository's default branch (`main`).
   Render reads `render.yaml` from the **default branch**.
2. Sign in to [render.com](https://render.com) with GitHub.
3. **New → Blueprint** → select the `website` repository → **Apply**.
4. Render creates the `clipper-ai` web service, builds `./Dockerfile` and deploys it.
   - First build: ~5 minutes (apt FFmpeg, npm build, pip install, 41 MB speech model).
   - When it goes live you get `https://clipper-ai.onrender.com`.
5. Optional environment variables (set in the dashboard, or supplied when the
   Blueprint asks for them):
   - `GEMINI_API_KEY` — free key from <https://aistudio.google.com/apikey>; enables
     cloud clip picking. Leave empty for the built-in local scorer.
   - `MAX_UPLOAD_MB` — defaults to `200` on the free plan.
   - `OLLAMA_BASE_URL` — only if you run an Ollama server somewhere reachable.

### Free-plan behaviour

| Symptom | Why | What to do |
| --- | --- | --- |
| "Demo storage" banner | no persistent disk on free | download clips you want to keep |
| Projects vanish after a redeploy | ephemeral filesystem | attach a disk (below) |
| First request after idle takes ~30 s | free instances sleep | the browser retries; the health check wakes it |
| Render is slow / 512 MB RAM | free instance | export 720p, use short source clips |
| Gemini key ignored | env var not set on the service | set it and redeploy |

### Durable storage

Paid instances can mount a disk. Add this to the service in `render.yaml` and
delete the `EPHEMERAL_STORAGE` line:

```yaml
    plan: starter
    disk:
      name: clipper-data
      mountPath: /var/data
      sizeGB: 5
```

`DATA_DIR=/var/data` is already set in the image, so uploads, renders and the
SQLite database move onto the disk with no code changes.

### Blueprint without merging

If you want to deploy *before* merging: Render dashboard → **New → Web Service**
→ pick the repo → **Branch: `arena/01a0be6f-website`** → Runtime **Docker** →
Dockerfile path `./Dockerfile` → Health check path `/api/health`.

---

## 2. Any Docker host

```bash
docker build -t clipper-ai .
docker run -d --name clipper-ai -p 8000:8000 \
  -v clipper-data:/var/data \
  -e PORT=8000 \
  -e MAX_UPLOAD_MB=2048 \
  clipper-ai
```

`-v clipper-data:/var/data` keeps projects across restarts. Without it the
container is disposable, exactly like the Render free tier.

`docker compose up --build` does the same thing using `docker-compose.yml`.

---

## 3. Fly.io / Railway / Koyeb

All three build a Dockerfile directly.

```bash
# Fly.io
fly launch --dockerfile Dockerfile --name clipper-ai
fly volumes create clipper_data --size 5
fly secrets set GEMINI_API_KEY=...        # optional
# then set DATA_DIR=/data in fly.toml [env] and mount the volume at /data
fly deploy
```

Railway/Koyeb: point the service at this repo, keep the Dockerfile, set
`PORT` (they inject it), `MAX_UPLOAD_MB`, and mount a volume at `/var/data`.

---

## 4. VPS with nginx

```bash
git clone <repo> && cd website
docker build -t clipper-ai .
docker run -d --restart unless-stopped --name clipper-ai \
  -p 127.0.0.1:8000:8000 -v /srv/clipper-data:/var/data clipper-ai
```

```nginx
server {
  listen 443 ssl http2;
  server_name clips.example.com;
  client_max_body_size 2048m;          # matches MAX_UPLOAD_MB

  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;          # long renders
    proxy_buffering off;               # smooth video streaming
  }
}
```

The image already runs uvicorn with `--proxy-headers`, so generated URLs and
scheme detection behave behind a reverse proxy.

---

## Verifying a deployment

```bash
curl -s https://<your-host>/api/health | python3 -m json.tool
```

Expect:

```json
{
  "ok": true,
  "app": "Clipper AI",
  "version": "1.1.0",
  "ffmpeg": true,
  "stt_engine": "vosk",
  "ai_engine": "builtin heuristic",
  "max_upload_mb": 200,
  "ephemeral_storage": true
}
```

Then, in the browser: **Try the sample video** → analysis runs → pick a clip →
**Render** → the MP4 plays inline and downloads.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Build fails on the Vosk download | network hiccup fetching the model | rebuild, or pass `--build-arg VOSK_MODEL_URL=…` |
| Build fails on the FFmpeg assertion | base image lost libass/libx264 | pin a different base image or install a static FFmpeg build |
| `ffmpeg: false` in `/api/health` | binary missing/unreadable | set `FFMPEG_BIN` to an absolute path |
| `stt_engine: "none"` | Vosk model not found | set `VOSK_MODEL_PATH` to a directory containing `conf/` |
| Captions render without text | fonts not found by libass | keep `assets/fonts` in the image (the Dockerfile copies it) |
| Upload returns 413 | over `MAX_UPLOAD_MB`, or proxy limit | raise both `MAX_UPLOAD_MB` and nginx `client_max_body_size` |
| Render stuck at "Queued" | instance restarted mid-render | jobs do not survive restarts; render again |
