"""Qwen3-TTS voice-cloning microservice for Mimic-TTS.

The model is loaded ONCE at startup and kept resident in VRAM, so each /clone pays only for
generation — no per-request model reload. A warmup pass at startup compiles CUDA kernels so the
first real request isn't slow. Generations are serialized with a lock (a single GPU model can't be
run concurrently) and run under inference_mode.

POST /clone  (multipart): text, [language], [ref_text], audio(file)  -> WAV bytes
GET  /health
"""
import io
import os
import subprocess
import tempfile
import threading

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from qwen_tts import Qwen3TTSModel

MODEL_ID = os.environ.get("TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
# Pascal (P100) has no FlashAttention-2, but it can use PyTorch SDPA's math/mem-efficient kernels,
# which are usually faster than a naive eager loop. Falls back to eager if SDPA can't load/run.
ATTN = os.environ.get("TTS_ATTN", "sdpa")

# Let cuDNN pick the fastest kernels for our (steady) input shapes.
torch.backends.cudnn.benchmark = True

app = FastAPI()
_lock = threading.Lock()
_attn_used = ATTN


def _load(attn: str):
    return Qwen3TTSModel.from_pretrained(
        MODEL_ID, device_map="cuda:0", dtype=torch.float16, attn_implementation=attn
    )


def _silent_ref() -> str:
    """A 1s low-noise WAV used only to warm up the generation kernels at startup."""
    p = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    sf.write(p, (0.01 * np.random.randn(24000)).astype("float32"), 24000)
    return p


def _warmup() -> None:
    ref = _silent_ref()
    try:
        with torch.inference_mode():
            model.generate_voice_clone(text="warm up.", language="English", ref_audio=ref, x_vector_only_mode=True)
    finally:
        try:
            os.remove(ref)
        except OSError:
            pass


print(f"Loading {MODEL_ID} (resident, attn={ATTN})...", flush=True)
try:
    model = _load(ATTN)
    _warmup()
except Exception as e:  # noqa: BLE001 — SDPA may not load/run on this GPU; fall back to eager.
    print(f"attn={ATTN} failed ({type(e).__name__}: {str(e)[:200]}); falling back to eager.", flush=True)
    _attn_used = "eager"
    model = _load("eager")
    _warmup()
print(f"Model loaded, warmed, and resident (attn={_attn_used}).", flush=True)


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID, "resident": True, "attn": _attn_used}


def to_wav(raw: bytes) -> str:
    """Convert any audio (mp3/ogg/...) to mono 24k WAV via ffmpeg; returns a temp path."""
    src = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
    src.write(raw)
    src.close()
    out = src.name + ".wav"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", src.name, "-ar", "24000", "-ac", "1", out],
            check=True,
            capture_output=True,
        )
    finally:
        os.remove(src.name)
    return out


# Sync endpoint → FastAPI runs it in a threadpool; the lock serializes GPU work.
@app.post("/clone")
def clone(
    text: str = Form(...),
    language: str = Form("English"),
    ref_text: str = Form(""),
    audio: UploadFile = File(...),
):
    try:
        ref_wav = to_wav(audio.file.read())
    except subprocess.CalledProcessError as e:
        return JSONResponse(status_code=400, content={"error": f"bad audio: {e.stderr.decode()[:300]}"})

    kwargs = {"text": text, "language": language, "ref_audio": ref_wav}
    if ref_text.strip():
        kwargs["ref_text"] = ref_text  # ICL mode (higher fidelity with a transcript)
    else:
        kwargs["x_vector_only_mode"] = True  # transcript-free zero-shot cloning

    try:
        with _lock, torch.inference_mode():
            wavs, sr = model.generate_voice_clone(**kwargs)
        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV")
    except Exception as e:  # noqa: BLE001 — surface any generation failure to the caller
        return JSONResponse(status_code=500, content={"error": str(e)[:600]})
    finally:
        try:
            os.remove(ref_wav)
        except OSError:
            pass

    return Response(content=buf.getvalue(), media_type="audio/wav")
