"""Natural-language editing commands: "make this a 30s viral reel"."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..models import project as db
from ..services import ai_service, clip_service

router = APIRouter(prefix="/api/projects/{pid}", tags=["command"])


class CommandBody(BaseModel):
    text: str


@router.post("/command")
def command(pid: str, body: CommandBody):
    if not db.get_project(pid):
        raise HTTPException(404, "project not found")
    if not body.text.strip():
        raise HTTPException(400, "Empty command")
    result = ai_service.parse_command(body.text, {})
    # if a duration was requested, also suggest the best matching clip
    patch = result["patch"]
    if "duration" in patch:
        analysis = db.get_analysis(pid)
        if analysis:
            target = patch["duration"]
            ranked = [c for c in analysis["clips"]
                      if abs((c["end"] - c["start"]) - target) <= target * 0.35]
            if ranked:
                patch["clip_id"] = ranked[0]["id"]
    return {"engine": result["engine"], "patch": patch,
            "message": "Applied: " + (", ".join(f"{k} = {v}" for k, v in patch.items())
                                      if patch else "nothing recognized")}
