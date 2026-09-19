"""LLM-backed clip finding: Gemini free tier -> Ollama -> local heuristic.

Only the *transcript* (a few KB of text) is ever sent to the AI — never the
video itself. That keeps usage well inside the Gemini free tier and makes a
local Ollama swap trivial.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from typing import Optional

from .. import config
from . import clip_service

PROMPT = """You are a short-form video editor who finds the most viral moments in long videos.
Below is a transcript of a long video as JSON segments with start/end seconds and text.

Find the {n} strongest short-form clips (for YouTube Shorts / Reels / TikTok).
Target durations in seconds: {targets}.

Rules:
- Each clip MUST start at the beginning of a strong "hook" (an intriguing statement, question, big claim, mistake, secret, number, or emotional moment).
- Each clip must fit close to one of the target durations (within +/-25%).
- Prefer clips that form a complete thought (no cut-off sentences).
- Avoid spans with long pauses.

Respond with ONLY valid JSON, no markdown, in this exact shape:
{{"clips":[{{"start": <seconds>, "end": <seconds>, "target": <target seconds>,
   "hook": "<first attention-grabbing words>", "title": "<max 8 word title>",
   "reason": "<one short sentence why this works>", "tag": "<one of: fire|bulb|star|target|laugh>",
   "score": <0-100>}}]}}"""

_last_engine = "heuristic"


def engine_used() -> str:
    return _last_engine


def find_clips(segments: list[dict], silences: list[dict], duration: float,
               targets: list[int]) -> list[dict]:
    global _last_engine
    for attempt in (_via_gemini, _via_ollama):
        try:
            clips = attempt(segments, silences, duration, targets)
            if clips:
                _last_engine = attempt.__name__.replace("_via_", "")
                return clips
        except Exception as e:  # noqa: BLE001
            print(f"[ai_service] {attempt.__name__} failed: {e}")
    _last_engine = "heuristic"
    return clip_service.find_heuristic_clips(segments, silences, duration, targets)


# ------------------------------------------------------------------ helpers
def _transcript_payload(segments: list[dict], max_chars: int = 18000) -> str:
    lines = []
    total = 0
    for s in segments:
        line = json.dumps({"start": s["start"], "end": s["end"], "text": (s.get("text") or "")[:220]})
        total += len(line)
        if total > max_chars:
            lines.append(json.dumps({"start": s["start"], "end": s["end"], "text": "…"}))
            break
        lines.append(line)
    return "[" + ",".join(lines) + "]"


def _validate_clips(raw: dict | list, segments: list[dict], silences: list[dict],
                    duration: float, targets: list[int]) -> list[dict]:
    clips = raw.get("clips") if isinstance(raw, dict) else raw
    if not isinstance(clips, list):
        return []
    out = []
    for c in clips:
        try:
            start, end = float(c["start"]), float(c["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if end - start < 5 or end - start > max(targets) * 1.8:
            continue
        start, end = max(0.0, start), min(duration, end)
        start, end = clip_service.snap_to_speech(start, end, segments)
        if end - start < 5:
            continue
        out.append({
            "id": f"clip_{abs(hash((start, end))) % 10**12}",
            "title": (c.get("title") or clip_service._title_from(c.get("hook", "")))[:80],
            "hook": (c.get("hook") or "")[:140],
            "reason": (c.get("reason") or "")[:240],
            "tag": c.get("tag") if c.get("tag") in ("fire", "bulb", "star", "target", "laugh") else "star",
            "start": round(start, 2), "end": round(end, 2),
            "target": int(min(targets, key=lambda t: abs(t - (end - start)))),
            "score": max(0.0, min(100.0, float(c.get("score", 75)))),
            "source": "ai",
        })
    # drop heavy overlaps
    out.sort(key=lambda c: -c["score"])
    kept: list[dict] = []
    for c in out:
        if all(min(c["end"], k["end"]) - max(c["start"], k["start"]) <
               0.3 * min(c["end"] - c["start"], k["end"] - k["start"]) for k in kept):
            kept.append(c)
    return kept[:10]


# ------------------------------------------------------------------ Gemini
def _via_gemini(segments, silences, duration, targets) -> list[dict]:
    if not config.GEMINI_API_KEY:
        return []
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{config.GEMINI_MODEL}:generateContent?key={config.GEMINI_API_KEY}")
    body = json.dumps({
        "contents": [{"parts": [{"text": PROMPT.format(
            n=min(8, max(4, len(segments) // 3)), targets=targets) +
            "\n\nTranscript:\n" + _transcript_payload(segments)}]}],
        "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode())
    text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
    return _validate_clips(_loads_relaxed(text), segments, silences, duration, targets)


# ------------------------------------------------------------------ Ollama
def _via_ollama(segments, silences, duration, targets) -> list[dict]:
    if not config.OLLAMA_BASE_URL:
        return []
    url = config.OLLAMA_BASE_URL.rstrip("/") + "/api/chat"
    body = json.dumps({
        "model": config.OLLAMA_MODEL,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.4},
        "messages": [{"role": "user", "content": PROMPT.format(
            n=min(8, max(4, len(segments) // 3)), targets=targets) +
            "\n\nTranscript:\n" + _transcript_payload(segments)}],
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode())
    text = data.get("message", {}).get("content", "")
    return _validate_clips(_loads_relaxed(text), segments, silences, duration, targets)


def _loads_relaxed(text: str) -> Optional[dict]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?|\n?```$", "", text)
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


# ------------------------------------------------------------------ AI command parsing
def parse_command(text: str, context: dict) -> dict:
    """Turn a natural-language editing command into an options patch.
    Uses Gemini/Ollama when available, otherwise a regex parser."""
    for attempt in (_cmd_via_gemini, _cmd_via_ollama):
        try:
            patch = attempt(text, context)
            if patch:
                return {"engine": attempt.__name__.replace("_cmd_via_", ""), "patch": patch}
        except Exception:  # noqa: BLE001
            pass
    return {"engine": "regex", "patch": _cmd_regex(text)}


CMD_PROMPT = """You are an editing assistant. The user gives a command about a short-form video edit.
Known styles: clean, podcast, viral, cinematic, corporate, gaming, minimal.
Caption animations: pop, highlight, bounce, typewriter, kinetic, none.
Options you may set (all optional): style, caption_animation, duration (seconds, one of 15/30/45/60),
remove_silence (bool), zoom (one of none|punch|slow), aspect (one of crop|blur|fit), music (bool).

User command: "{cmd}"

Respond ONLY with a JSON object of the options to change, e.g. {{"style":"viral","duration":30}}."""


def _cmd_via_gemini(text: str, context: dict) -> Optional[dict]:
    if not config.GEMINI_API_KEY:
        return None
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{config.GEMINI_MODEL}:generateContent?key={config.GEMINI_API_KEY}")
    body = json.dumps({"contents": [{"parts": [{"text": CMD_PROMPT.format(cmd=text)}]}],
                       "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    out = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
    return _sanitize_patch(json.loads(out))


def _cmd_via_ollama(text: str, context: dict) -> Optional[dict]:
    if not config.OLLAMA_BASE_URL:
        return None
    url = config.OLLAMA_BASE_URL.rstrip("/") + "/api/chat"
    body = json.dumps({"model": config.OLLAMA_MODEL, "format": "json", "stream": False,
                       "messages": [{"role": "user", "content": CMD_PROMPT.format(cmd=text)}]}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode())
    return _sanitize_patch(json.loads(data.get("message", {}).get("content", "{}")))


def _sanitize_patch(p: dict) -> dict:
    ok_keys = {"style", "caption_animation", "duration", "remove_silence", "zoom", "aspect", "music"}
    p = {k: v for k, v in p.items() if k in ok_keys}
    if "duration" in p:
        try:
            p["duration"] = int(min((15, 30, 45, 60), key=lambda t: abs(t - int(p["duration"]))))
        except (TypeError, ValueError):
            p.pop("duration")
    return p


def _cmd_regex(text: str) -> dict:
    t = text.lower()
    patch: dict = {}
    for style in ("viral", "podcast", "cinematic", "corporate", "gaming", "minimal", "clean"):
        if style in t:
            patch["style"] = style
            break
    for anim in ("typewriter", "kinetic", "highlight", "bounce", "pop"):
        if anim in t:
            patch["caption_animation"] = "pop" if anim == "pop" else anim
            break
    m = re.search(r"(\d{1,2})\s*(?:-|\s)?(?:second|sec|s\b)", t)
    if m and int(m.group(1)) in (15, 30, 45, 60):
        patch["duration"] = int(m.group(1))
    if "silence" in t:
        patch["remove_silence"] = "remove" in t or "cut" in t or "no silence" in t
    if "zoom" in t:
        patch["zoom"] = "none" if "no zoom" in t else "punch"
    if "blur" in t or "bars" in t:
        patch["aspect"] = "blur"
    return patch
