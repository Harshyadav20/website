"""FFmpeg render pipeline: cut -> (silence removal) -> 9:16 -> zoom -> captions
-> watermark -> music/SFX -> H.264 MP4.

Renders run on background threads; progress is parsed from ffmpeg's
`-progress pipe:1` output and surfaced through the API + SQLite.
"""
from __future__ import annotations

import threading
import traceback
from pathlib import Path
from typing import Optional

from .. import config
from ..models import project as db
from ..utils.ffmpeg import FFmpegError, run_with_progress
from ..utils.timestamps import TimelineMapper
from . import caption_service

FPS = 30
JOBS: dict[str, dict] = {}
_LOCK = threading.Lock()


def _start_job(rid: str, fn) -> None:
    def wrapper():
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            JOBS[rid] = {"status": "error", "progress": 0.0, "message": str(e)[:300]}
            db.update_render(rid, status="error", message=str(e)[:300])

    with _LOCK:
        JOBS[rid] = {"status": "queued", "progress": 0.0, "message": "Queued"}
    threading.Thread(target=wrapper, daemon=True).start()


def job_status(rid: str) -> Optional[dict]:
    with _LOCK:
        job = JOBS.get(rid)
    if job:
        return dict(job)
    row = db.get_render(rid)
    if not row:
        return None
    return {"status": row["status"], "progress": row["progress"], "message": row["message"]}


# ------------------------------------------------------------------ helpers
def _filter_safe(path: Path) -> str:
    """Escape a path for use inside a filter argument."""
    return str(path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def _punches(clip: dict, analysis: Optional[dict], mapper: TimelineMapper,
             total: float) -> list[tuple[float, float]]:
    """(in, out) times on the NEW timeline where we punch-in."""
    punches: list[tuple[float, float]] = []
    segs = (analysis or {}).get("transcript") or []
    starts = [s["start"] for s in segs
              if clip["start"] - 0.05 <= s["start"] <= clip["end"] - 1.0]
    if not starts:
        starts = [clip["start"]]
    # always open with a punch — instant energy
    mapped: list[float] = [0.0]
    for s in starts:
        m = mapper.map(s)
        if m is not None and 1.2 < m < total - 1.2:
            mapped.append(m)
    mapped.sort()
    dedup: list[float] = []
    for t in mapped:
        if not dedup or t - dedup[-1] >= 2.2:
            dedup.append(t)
    for i, t in enumerate(dedup[:6]):
        hold = 2.6 if i == 0 else 2.2
        out = min(t + hold, total - 0.35)
        if out - t > 0.8:
            punches.append((t, out))
    return punches


def _zoom_expr(punches: list[tuple[float, float]], mode: str, total_frames: int) -> str:
    amp = 0.12
    expr = ["1.0"]
    if mode == "punch":
        for t_in, t_out in punches:
            f1, f2 = int(t_in * FPS), int(t_out * FPS)
            rin = max(1, int(0.30 * FPS))
            rout = max(1, int(0.50 * FPS))
            expr.append(
                f"+{amp}*clip((on-{f1})/{rin},0,1)*(1-clip((on-{f2})/{rout},0,1))"
            )
    elif mode == "slow":
        rate = 0.09 / max(1, total_frames)
        expr.append(f"+{rate}*on")
    return "min(" + "".join(expr) + ",1.28)"


# ------------------------------------------------------------------ pipeline
def render_clip(pid: str, clip: dict, options: dict) -> dict:
    proj = db.get_project(pid)
    if not proj:
        raise ValueError("project not found")
    rec = db.create_render(pid, clip, options)
    rid = rec["id"]

    def work():
        db.update_render(rid, status="running", message="Preparing")
        JOBS[rid] = {"status": "running", "progress": 0.02, "message": "Preparing"}
        analysis = db.get_analysis(pid)
        styles = caption_service.load_styles()
        style = styles.get(options.get("style") or "viral", styles["viral"])

        src = Path(proj["filepath"])
        cl = dict(clip)  # local copy (avoid closure rebind issues)
        duration = proj["duration"] or 0.0
        start = max(0.0, min(float(cl.get("start", 0)), max(0.0, duration - 2)))
        end = min(duration or start + 30, max(start + 3, float(cl.get("end", start + 30))))
        cl = {**cl, "start": start, "end": end}

        remove_silence = bool(options.get("remove_silence", False))
        silences = (analysis or {}).get("silences") or []
        if remove_silence and silences:
            mapper = TimelineMapper.from_silences(start, end, silences)
        else:
            mapper = TimelineMapper.identity(start, end)
        total = max(0.5, mapper.total)

        out_w = 720 if options.get("resolution") == "720" else 1080
        out_h = out_w * 16 // 9
        preset = "ultrafast" if options.get("fast") else "veryfast"
        crf = "23" if options.get("fast") else "21"

        job_dir = config.RENDERS_DIR / rid
        job_dir.mkdir(parents=True, exist_ok=True)

        # ---------------- captions ----------------
        words = ((analysis or {}).get("transcript_words") or [])
        # transcript words are not persisted on the analysis row; rebuild from clips?
        # (words are re-derived by the analyzer and cached in a sidecar file)
        sidecar = config.CAPTIONS_DIR / f"{pid}.words.json"
        if not words and sidecar.is_file():
            import json
            words = json.loads(sidecar.read_text())
        ass_path: Optional[Path] = None
        if options.get("captions", True) and words:
            ass_text = caption_service.build_captions_ass(
                words, start, end, style, options, mapper)
            if ass_text:
                ass_path = job_dir / "captions.ass"
                ass_path.write_text(ass_text)

        wm_text = (options.get("watermark") or "").strip()
        wm_path: Optional[Path] = None
        if wm_text:
            wm_path = job_dir / "watermark.ass"
            wm_path.write_text(
                caption_service.build_watermark_ass(wm_text, total,
                                                    options.get("watermark_pos", "top-right")))

        # ---------------- zoom ----------------
        zoom_mode = options.get("zoom") or style.get("zoom", "none")
        punches = []
        if zoom_mode == "punch":
            punches = _punches(cl, analysis, mapper, total)

        # ---------------- build filter graph ----------------
        inputs: list[str] = []
        fparts: list[str] = []
        vlabels: list[str] = []
        alabels: list[str] = []
        n_seg = len(mapper.keep)

        for i, (a, b) in enumerate(mapper.keep):
            inputs += ["-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", str(src)]
            fparts.append(f"[{i}:v]fps={FPS},setpts=PTS-STARTPTS[v{i}]")
            vlabels.append(f"[v{i}]")
            if proj["has_audio"]:
                fparts.append(f"[{i}:a]aresample=48000,asetpts=PTS-STARTPTS[a{i}]")
                alabels.append(f"[a{i}]")

        if n_seg > 1:
            fparts.append("".join(vlabels) + f"concat=n={n_seg}:v=1:a=0[vc]")
            vcur = "[vc]"
            if alabels:
                fparts.append("".join(alabels) + f"concat=n={n_seg}:v=0:a=1[ac]")
            else:
                fparts.append("anullsrc=r=48000:cl=stereo,atrim=0:{total:.2f}[ac]")
        else:
            vcur = vlabels[0]
            if alabels:
                fparts.append(f"{alabels[0]}atrim=0:{total:.2f}[ac]")
            else:
                fparts.append("anullsrc=r=48000:cl=stereo,atrim=0:{total:.2f}[ac]")

        # ---------------- 9:16 transform ----------------
        aspect = options.get("aspect") or style.get("aspect", "crop")
        crop_fx = float(options.get("crop_x", 0.5))
        crop_fx = max(0.0, min(1.0, crop_fx))
        if aspect == "crop":
            fparts.append(
                f"{vcur}crop=w='min(iw,ih*9/16)':h='min(ih,iw*16/9)':"
                f"x='(iw-ow)*{crop_fx:.3f}':y='(ih-oh)/2',"
                f"scale={out_w}:{out_h}:flags=lanczos[v916]"
            )
        elif aspect == "blur":
            fparts.append(
                f"{vcur}split[bga][fga];"
                f"[bga]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
                f"crop={out_w}:{out_h},boxblur=24:2,gblur=sigma=6[bg];"
                f"[fga]scale={out_w}:{out_h}:force_original_aspect_ratio=decrease[fg];"
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2[v916]"
            )
        else:  # fit
            fparts.append(
                f"{vcur}scale={out_w}:{out_h}:force_original_aspect_ratio=decrease,"
                f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black[v916]"
            )

        # ---------------- zoom ----------------
        if zoom_mode in ("punch", "slow"):
            total_frames = int(total * FPS) + 4
            z = _zoom_expr(punches if zoom_mode == "punch" else [], zoom_mode, total_frames)
            up_w, up_h = int(out_w * 1.5) // 2 * 2, int(out_h * 1.5) // 2 * 2
            fparts.append(
                f"[v916]scale={up_w}:{up_h}:flags=lanczos,"
                f"zoompan=z='{z}':x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':"
                f"d=1:fps={FPS}:s={out_w}x{out_h}[vz]"
            )
            vcur = "[vz]"

        # ---------------- captions + watermark ----------------
        fontsdir = _filter_safe(config.FONTS_DIR)
        if ass_path:
            fparts.append(f"{vcur}ass=filename=captions.ass:fontsdir={fontsdir}[vcap]")
            vcur = "[vcap]"
        if wm_path:
            fparts.append(f"{vcur}ass=filename=watermark.ass:fontsdir={fontsdir}[vwm]")
            vcur = "[vwm]"
        fparts.append(f"{vcur}format=yuv420p[vout]")

        # ---------------- audio ----------------
        music_id = options.get("music", "none")
        if options.get("music") is None:
            music_id = style.get("music", "none")
        audio_inputs: list[str] = []
        extra_alabels: list[str] = []
        music_path = None
        if music_id and music_id != "none":
            cand = config.MUSIC_DIR / f"{music_id}.mp3"
            if cand.is_file():
                music_path = cand
        if music_path:
            idx = n_seg
            vol = float(options.get("music_volume", 0.16))
            audio_inputs += ["-stream_loop", "-1", "-i", str(music_path)]
            fparts.append(
                f"[{idx}:a]volume={vol},afade=t=out:st={max(0.0, total - 0.9):.2f}:d=0.9[am]"
            )
            extra_alabels.append("[am]")

        if options.get("sfx", True):
            whoosh = config.SFX_DIR / "whoosh.mp3"
            pop = config.SFX_DIR / "pop.mp3"
            vol = 0.5
            sfx_events: list[tuple[float, Path]] = []
            if whoosh.is_file():
                sfx_events.append((0.0, whoosh))
            if pop.is_file():
                sfx_events += [(t, pop) for t, _ in punches[:5]]
            idx0 = n_seg + (1 if music_path else 0)
            for k, (t, sfx_file) in enumerate(sfx_events):
                audio_inputs += ["-i", str(sfx_file)]
                ms = int(t * 1000)
                fparts.append(f"[{idx0 + k}:a]volume={vol},adelay={ms}:all=1[s{k}]")
                extra_alabels.append(f"[s{k}]")

        if extra_alabels:
            n_mix = 1 + len(extra_alabels)
            fparts.append(
                "[ac]" + "".join(extra_alabels) +
                f"amix=inputs={n_mix}:duration=first:normalize=0,"
                "aformat=sample_fmts=fltp:channel_layouts=stereo,alimiter=limit=0.95[aout]"
            )
        else:
            fparts.append("[ac]aformat=sample_fmts=fltp:channel_layouts=stereo,alimiter=limit=0.97[aout]")

        out_file = job_dir / "final.mp4"
        args = [
            "-y", "-loglevel", "error",
            *inputs, *audio_inputs,
            "-filter_complex", ";".join(fparts),
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", preset, "-crf", crf, "-profile:v", "high",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
            "-t", f"{total:.3f}", "-movflags", "+faststart",
            str(out_file),
        ]

        def on_prog(p: float) -> None:
            JOBS[rid] = {"status": "running",
                         "progress": round(0.05 + 0.9 * p, 4),
                         "message": f"Rendering… {int(p * 100)}%"}
            if p % 0.1 < 0.02:
                db.update_render(rid, progress=round(0.05 + 0.9 * p, 4),
                                 message=f"Rendering… {int(p * 100)}%")

        run_with_progress(args, total, on_prog, cwd=str(job_dir))
        if not out_file.is_file():
            raise FFmpegError("ffmpeg produced no output")

        db.update_render(rid, status="done", progress=1.0, message="Done",
                         output=str(out_file), width=out_w, height=out_h, duration=total)
        JOBS[rid] = {"status": "done", "progress": 1.0, "message": "Done",
                     "output": str(out_file)}

    _start_job(rid, work)
    return {**rec, "clip": clip, "options": options}
