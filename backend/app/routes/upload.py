"""Upload + project management routes."""
from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import config
from ..models import project as db
from ..utils.ffmpeg import FFmpegError, probe
from ..utils.files import ext_of, safe_stem
from ..services.video_analyzer import make_thumbnail

router = APIRouter(prefix="/api", tags=["projects"])


def _require_ffmpeg() -> None:
    """Every path that probes/cuts media needs FFmpeg — say so in JSON."""
    if not config.FFMPEG_BIN:
        raise HTTPException(
            503,
            "FFmpeg is not available on this server. Install it, run "
            "scripts/ensure_deps.sh, or point FFMPEG_BIN at the binary.",
        )


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    _require_ffmpeg()
    stem = safe_stem(file.filename or "video")
    pid = db.new_id("prj")
    dest = config.UPLOADS_DIR / f"{pid}{ext_of(file.filename or '')}"
    size = 0
    try:
        with open(dest, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > config.MAX_UPLOAD_MB * 1024 * 1024:
                    raise HTTPException(413, f"File larger than {config.MAX_UPLOAD_MB} MB")
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "Empty file")
    try:
        meta = probe(dest)
    except FFmpegError as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, f"Not a readable media file: {e}") from e
    if not meta["duration"]:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "Could not read duration — is this a video file?")
    meta["size"] = size
    db.create_project(stem, file.filename or stem, str(dest), meta, pid=pid)
    make_thumbnail(pid)
    return _with_urls(db.get_project(pid))


@router.post("/sample")
def use_sample():
    """Create a project from the bundled demo video (no re-upload needed)."""
    _require_ffmpeg()
    samples = sorted(config.SAMPLES_DIR.glob("*.mp4"))
    if not samples:
        raise HTTPException(404, "No sample video bundled. Upload your own!")
    src = samples[0]
    pid = db.new_id("prj")
    dest = config.UPLOADS_DIR / f"{pid}.mp4"
    shutil.copy(src, dest)
    try:
        meta = probe(dest)
    except FFmpegError as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(500, f"Could not read the sample video: {e}") from e
    meta["size"] = dest.stat().st_size
    db.create_project("Sample — Creator Podcast", src.name, str(dest), meta, pid=pid)
    make_thumbnail(pid)
    return _with_urls(db.get_project(pid))


def _with_urls(p: dict | None) -> dict | None:
    """Attach browser-facing media URLs to a project row."""
    if not p:
        return p
    if p.get("filepath"):
        p["url"] = "/media/uploads/" + Path(p["filepath"]).name
    if p.get("thumb"):
        p["thumb_url"] = "/media/uploads/thumbs/" + Path(p["thumb"]).name
    return p


@router.get("/projects")
def projects():
    return [_with_urls(p) for p in db.list_projects()]


@router.get("/projects/{pid}")
def project(pid: str):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "project not found")
    return _with_urls(p)


@router.delete("/projects/{pid}")
def delete_project(pid: str):
    if not db.get_project(pid):
        raise HTTPException(404, "project not found")
    db.delete_project(pid)
    return {"ok": True}


@router.get("/system")
def system():
    return config.system_status()
