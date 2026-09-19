"""Caption + style routes."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config
from ..models import project as db
from ..services import caption_service
from ..utils.timestamps import TimelineMapper

router = APIRouter(prefix="/api", tags=["captions"])


@router.get("/styles")
def styles():
    data = json.loads((config.TEMPLATES_DIR / "styles.json").read_text())
    return data


@router.get("/animations")
def animations():
    return {"animations": list(caption_service.ANIMATIONS)}


class CaptionPreviewBody(BaseModel):
    start: float
    end: float
    style: str = "viral"
    caption_animation: str | None = None
    font_scale: float = 1.0
    caption_position: str | None = None
    uppercase: bool | None = None
    remove_silence: bool = False


@router.post("/projects/{pid}/captions/preview")
def caption_preview(pid: str, body: CaptionPreviewBody):
    """Return the generated ASS file so users can inspect the animation timing."""
    if not db.get_project(pid):
        raise HTTPException(404, "project not found")
    analysis = db.get_analysis(pid)
    sidecar = config.CAPTIONS_DIR / f"{pid}.words.json"
    if not sidecar.is_file():
        raise HTTPException(400, "No transcript available — run analysis first")
    words = json.loads(sidecar.read_text())
    styles = caption_service.load_styles()
    style = styles.get(body.style, styles["viral"])
    mapper = (TimelineMapper.from_silences(body.start, body.end, analysis["silences"])
              if body.remove_silence and analysis
              else TimelineMapper.identity(body.start, body.end))
    ass = caption_service.build_captions_ass(
        words, body.start, body.end, style, body.model_dump(), mapper)
    if not ass:
        raise HTTPException(400, "No caption words in that range")
    return {"ass": ass, "duration": round(mapper.total, 2)}
