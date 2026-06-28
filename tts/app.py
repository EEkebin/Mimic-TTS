"""Qwen3-TTS voice-cloning microservice for Mimic-TTS.

Each clone runs in a short-lived subprocess (worker.py) so the GPU is fully released afterwards —
the service holds zero VRAM when idle, which keeps it friendly when sharing a GPU.

POST /clone  (multipart): text, [language], [ref_text], audio(file)  -> WAV bytes
GET  /health
"""
import os
import subprocess
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response

MODEL_ID = os.environ.get("TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")

app = FastAPI()


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID}


def to_wav(raw: bytes) -> str:
    """Convert any Discord audio (ogg/opus, mp3, ...) to mono 24k WAV via ffmpeg."""
    src = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
    src.write(raw)
    src.close()
    out = src.name + ".wav"
    subprocess.run(
        ["ffmpeg", "-y", "-i", src.name, "-ar", "24000", "-ac", "1", out],
        check=True,
        capture_output=True,
    )
    return out


@app.post("/clone")
async def clone(
    text: str = Form(...),
    language: str = Form("English"),
    ref_text: str = Form(""),
    audio: UploadFile = File(...),
):
    try:
        ref_wav = to_wav(await audio.read())
    except subprocess.CalledProcessError as e:
        return JSONResponse(status_code=400, content={"error": f"bad audio: {e.stderr.decode()[:300]}"})

    out_wav = ref_wav + ".out.wav"
    cmd = ["python", "/app/worker.py", "--ref", ref_wav, "--text", text, "--language", language, "--out", out_wav]
    if ref_text.strip():
        cmd += ["--ref-text", ref_text]

    proc = subprocess.run(cmd, capture_output=True, timeout=300)
    if proc.returncode != 0 or not os.path.exists(out_wav):
        return JSONResponse(status_code=500, content={"error": proc.stderr.decode()[-600:]})

    with open(out_wav, "rb") as f:
        data = f.read()
    for p in (ref_wav, out_wav):
        try:
            os.remove(p)
        except OSError:
            pass
    return Response(content=data, media_type="audio/wav")
