"""Render routes + asset listings."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import config
from ..models import project as db
from ..services import render_service

router = APIRouter(prefix="/api", tags=["render"])


class RenderBody(BaseModel):
    clip: dict
    options: dict = {}


@router.post("/projects/{pid}/render")
def render(pid: str, body: RenderBody):
    if not db.get_project(pid):
        raise HTTPException(404, "project not found")
    try:
        return render_service.render_clip(pid, body.clip, body.options)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e)) from e


@router.get("/renders/{rid}")
def render_status(rid: str):
    status = render_service.job_status(rid)
    if not status:
        raise HTTPException(404, "render not found")
    row = db.get_render(rid)
    out = {**status, "id": rid}
    if row:
        out.update({
            "project_id": row["project_id"], "clip": row["clip"],
            "options": row["options"], "output": row["output"],
            "width": row["width"], "height": row["height"], "duration": row["duration"],
            "url": f"/media/renders/{rid}/final.mp4" if row["output"] else None,
        })
    return out


@router.get("/projects/{pid}/renders")
def project_renders(pid: str):
    rows = db.list_renders(pid)
    for r in rows:
        r["url"] = f"/media/renders/{r['id']}/final.mp4" if r.get("output") else None
    return rows


@router.get("/renders/{rid}/file")
def render_file(rid: str):
    row = db.get_render(rid)
    if not row or not row.get("output"):
        raise HTTPException(404, "render not found")
    path = Path(row["output"])
    if not path.is_file():
        raise HTTPException(404, "file missing")
    return FileResponse(path, media_type="video/mp4",
                        filename=f"short-{rid}.mp4")


# ------------------------------------------------------------------ assets
@router.get("/assets")
def assets():
    music = []
    for f in sorted(config.MUSIC_DIR.glob("*")):
        if f.suffix.lower() in (".mp3", ".m4a", ".wav", ".ogg"):
            music.append({"id": f.stem, "name": f.stem.replace("-", " ").title(),
                          "url": f"/media/assets/music/{f.name}", "size": f.stat().st_size})
    return {
        "music": [{"id": "none", "name": "No music", "url": None}] + music,
        "sfx_available": (config.SFX_DIR / "whoosh.mp3").is_file(),
        "fonts": [f.name for f in sorted(config.FONTS_DIR.glob("*.ttf"))],
    }
