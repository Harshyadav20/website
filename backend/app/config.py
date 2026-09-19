"""Application paths, engine discovery and feature flags."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

# ---------------------------------------------------------------- paths
BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
REPO_ROOT = BASE_DIR.parent                               # repo root
APP_DIR = BASE_DIR / "app"
VENDOR_DIR = BASE_DIR / "vendor"                          # pip --target deps

ASSETS_DIR = REPO_ROOT / "assets"                         # fonts / music / sfx / templates
FONTS_DIR = ASSETS_DIR / "fonts"
MUSIC_DIR = ASSETS_DIR / "music"
SFX_DIR = ASSETS_DIR / "sfx"
TEMPLATES_DIR = ASSETS_DIR / "templates"

UPLOADS_DIR = BASE_DIR / "uploads"
SAMPLES_DIR = ASSETS_DIR / "samples"                 # bundled demo media (committed)
THUMBS_DIR = UPLOADS_DIR / "thumbs"
RENDERS_DIR = BASE_DIR / "renders"
CAPTIONS_DIR = BASE_DIR / "captions"
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"                          # built SPA served by FastAPI

DB_PATH = DATA_DIR / "app.db"

for _d in (UPLOADS_DIR, SAMPLES_DIR, THUMBS_DIR, RENDERS_DIR, CAPTIONS_DIR, DATA_DIR,
           FONTS_DIR, MUSIC_DIR, SFX_DIR, TEMPLATES_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- engines
def _resolve_ffmpeg() -> str | None:
    """Locate an ffmpeg binary: env override -> vendored -> cached static -> system."""
    candidates = [
        os.environ.get("FFMPEG_BIN"),
        str(Path.home() / ".cache" / "bin" / "ffmpeg"),
    ]
    if VENDOR_DIR.exists():
        candidates += [str(p) for p in sorted(VENDOR_DIR.glob("imageio_ffmpeg/binaries/ffmpeg-*"))]
    candidates.append(shutil.which("ffmpeg"))
    for c in candidates:
        if c and Path(c).is_file() and os.access(c, os.X_OK):
            return c
    return None


def _resolve_vosk_model() -> str | None:
    candidates = [
        os.environ.get("VOSK_MODEL_PATH"),
        str(Path.home() / ".cache" / "vosk" / "vosk-model-small-en-us-0.15"),
        str(ASSETS_DIR / "models" / "vosk-model-small-en-us-0.15"),
    ]
    for c in candidates:
        if c and (Path(c) / "conf").is_dir():
            return c
    return None


FFMPEG_BIN = _resolve_ffmpeg()
VOSK_MODEL_PATH = _resolve_vosk_model()

# ---------------------------------------------------------------- AI providers
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")

# ---------------------------------------------------------------- analysis defaults
SILENCE_NOISE_DB = float(os.environ.get("SILENCE_NOISE_DB", "-35"))
SILENCE_MIN_DUR = float(os.environ.get("SILENCE_MIN_DUR", "0.35"))
TARGET_DURATIONS = [15, 30, 45, 60]
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "2048"))


def ai_engine_name() -> str:
    if GEMINI_API_KEY:
        return f"gemini ({GEMINI_MODEL})"
    if OLLAMA_BASE_URL:
        return f"ollama ({OLLAMA_MODEL})"
    return "builtin heuristic"


def stt_engine_name() -> str:
    try:
        import faster_whisper  # noqa: F401
        return "faster-whisper"
    except Exception:
        pass
    if VOSK_MODEL_PATH:
        return "vosk"
    return "none"


def system_status() -> dict:
    return {
        "ffmpeg": bool(FFMPEG_BIN),
        "ffmpeg_path": FFMPEG_BIN,
        "stt_engine": stt_engine_name(),
        "ai_engine": ai_engine_name(),
        "gemini_configured": bool(GEMINI_API_KEY),
        "ollama_configured": bool(OLLAMA_BASE_URL),
    }
