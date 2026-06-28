import { config } from "./config.js";

/** Transcribe an audio sample with the Whisper service. Returns the recognized text. */
export async function transcribe(audio: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.set("audio", new Blob([audio]), filename || "sample.mp3");

  const res = await fetch(`${config.STT_URL}/transcribe`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new Error(`STT error: ${data.error}`);
  return (data.text ?? "").trim();
}
