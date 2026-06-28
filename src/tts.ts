import { readFile } from "node:fs/promises";
import { config } from "./config.js";

/** Send text + a reference voice sample (+ its transcript) to Qwen3-TTS; get back WAV bytes. */
export async function cloneVoice(text: string, mp3Path: string, refText: string): Promise<Buffer> {
  const sample = await readFile(mp3Path);
  const form = new FormData();
  form.set("text", text);
  form.set("language", config.TTS_LANGUAGE);
  if (refText.trim()) form.set("ref_text", refText);
  form.set("audio", new Blob([sample], { type: "audio/mpeg" }), "sample.mp3");

  const res = await fetch(`${config.TTS_URL}/clone`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Download a Discord attachment URL into a Buffer. */
export async function downloadAttachment(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
