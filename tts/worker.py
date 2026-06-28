"""One-shot voice-clone worker. Runs as a subprocess so ALL its GPU memory is reclaimed on exit
(keeps the TTS service holding zero VRAM when idle, so it stays friendly when sharing a GPU)."""
import argparse
import os

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

MODEL_ID = os.environ.get("TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--text", required=True)
    ap.add_argument("--ref-text", default="")
    ap.add_argument("--language", default="English")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    # fp16 + eager: older GPUs (e.g. Pascal) have no bf16 / FlashAttention-2.
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID, device_map="cuda:0", dtype=torch.float16, attn_implementation="eager"
    )
    kwargs = {"text": a.text, "language": a.language, "ref_audio": a.ref}
    if a.ref_text.strip():
        kwargs["ref_text"] = a.ref_text  # ICL mode (higher fidelity with a transcript)
    else:
        kwargs["x_vector_only_mode"] = True  # transcript-free zero-shot cloning
    wavs, sr = model.generate_voice_clone(**kwargs)
    sf.write(a.out, wavs[0], sr)


if __name__ == "__main__":
    main()
