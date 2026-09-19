"""AI Video Clipper & Editor — FastAPI backend.

Serves the API under /api, media under /media, and the built React SPA
from backend/static at /.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .models import project as db
from .routes import captions, clips, command, render, upload


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    # renders interrupted by a server restart cannot resume
    for r in db.list_renders():
        if r["status"] in ("queued", "running"):
            db.update_render(r["id"], status="error", message="Interrupted by server restart")
    print("── AI Video Clipper & Editor ──────────────────────")
    for k, v in config.system_status().items():
        print(f"   {k:16} {v}")
    print("───────────────────────────────────────────────────")
    yield


app = FastAPI(title="AI Video Clipper & Editor", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(clips.router)
app.include_router(captions.router)
app.include_router(render.router)
app.include_router(command.router)


@app.get("/api/health")
def health():
    return {"ok": True, **config.system_status()}


# ---------------------------------------------------------------- media
app.mount("/media/uploads", StaticFiles(directory=config.UPLOADS_DIR), name="uploads")
app.mount("/media/renders", StaticFiles(directory=config.RENDERS_DIR), name="renders")
app.mount("/media/assets", StaticFiles(directory=config.ASSETS_DIR), name="assets")


def _media_url(path: str | None) -> str | None:
    if not path:
        return None
    p = str(path)
    for prefix, mount in ((str(config.UPLOADS_DIR), "/media/uploads"),):
        if p.startswith(prefix):
            return mount + p[len(prefix):]
    return None


# expose helper for routes that need file urls
app.state.media_url = _media_url


# ---------------------------------------------------------------- SPA
@app.get("/")
def spa_root():
    index = config.STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse({"detail": "Frontend not built. Run: cd frontend && npm run build"},
                        status_code=404)


@app.get("/{path:path}")
def spa_catch_all(path: str):
    file = config.STATIC_DIR / path
    if file.is_file() and ".." not in path:
        return FileResponse(file)
    return spa_root()
