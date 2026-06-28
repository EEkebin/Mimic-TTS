"""Whisper speech-to-text microservice for Mimic-TTS.

Transcribes an uploaded voice sample so the text can be used as Qwen3-TTS's `ref_text`
(in-context cloning gives a higher-fidelity voice clone than transcript-free mode).

POST /transcribe  (multipart): audio(file)  -> {"text": "...", "language": "en"}
GET  /health
"""
import os
import tempfile

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "base")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI()
# Loaded once at startup and kept resident — the model is small (~150MB for "base").
model = WhisperModel(MODEL, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    suffix = os.path.splitext(audio.filename or "")[1] or ".bin"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(await audio.read())
        tmp.close()
        # faster-whisper decodes the input itself (via PyAV/ffmpeg).
        segments, info = model.transcribe(tmp.name, beam_size=5)
        text = "".join(seg.text for seg in segments).strip()
        return {"text": text, "language": info.language}
    except Exception as e:  # noqa: BLE001 — surface any decode/transcribe failure to the caller
        return JSONResponse(status_code=500, content={"error": str(e)[:500]})
    finally:
        try:
            os.remove(tmp.name)
        except OSError:
            pass
