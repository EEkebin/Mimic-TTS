# Mimic-TTS 🎙️

> A Discord bot that speaks your typed messages **live, in your own cloned voice**.

Register once with a short voice clip; from then on, whenever you type in a voice channel's text chat,
Mimic-TTS speaks your message aloud in the voice channel — sounding like **you**. Multiple people can
register, and Mimic-TTS voices each of them in turn.

Runs entirely on your own hardware: **Qwen3-TTS** for voice cloning (GPU) and **Whisper** for
transcription (CPU). No third-party AI API.

---

## Contents

- [How it works](#how-it-works)
- [Commands](#commands)
- [Pipelines](#pipelines)
- [Architecture](#architecture)
- [Setup](#setup)
- [Configuration](#configuration)
- [Notes and limitations](#notes-and-limitations)
- [Disclaimer](#disclaimer)

---

## How it works

1. **`/register`** with an audio clip. Mimic-TTS transcribes it (Whisper) and stores the clip + transcript.
   The transcript is used as Qwen3-TTS's reference text, which gives a higher-fidelity clone.
2. **`/join`** while you're in a voice channel. Mimic-TTS joins it and opens a persistent connection.
3. **Type in that voice channel's built-in text chat.** If you're registered, Mimic-TTS generates speech
   from your message in your cloned voice and plays it in the channel. Messages are spoken one at a
   time, in order.

---

## Commands

| Command | What it does |
| --- | --- |
| `/register sample:<audio>` | Transcribe + store your voice sample (upserts if you re-register). |
| `/join` | Join the voice channel you're currently in. |
| `/leave` | Disconnect Mimic-TTS from voice. |
| `/unregister` | Delete your stored sample + transcript. |
| `/whoami` | Check whether you're registered (shows your sample transcript). |

---

## Pipelines

### `/register`

```
/register {audio} ─▶ defer (ephemeral) ─▶ validate audio (type/size ≤ 12 MB)
                  ─▶ download clip
                  ─▶ STT /transcribe (Whisper, CPU) ─▶ transcript
                  ─▶ save clip to data/voices/<userId>.<ext>
                  ─▶ upsert {user_id, username, mp3_path, transcript} in SQLite
                  ─▶ confirm + transcript preview
```

### Speaking (messageCreate)

```
message ─▶ is it in a voice channel's text chat?           (else ignore)
        ─▶ is Mimic-TTS connected to THAT channel?            (else ignore)
        ─▶ is the author registered?                       (else ignore)
        ─▶ clean text: resolve mentions, drop links/emoji markup, cap length
        ─▶ enqueue (per-guild queue)
                └─ drain one at a time:
                     TTS /clone {text, sample mp3, transcript} ─▶ WAV
                     ─▶ play in the voice channel ─▶ next job
```

Generation and playback are **serialized per guild**, so rapid-fire messages queue up and play in
order rather than overlapping (and TTS generations don't pile onto the GPU at once).

---

## Architecture

```
Discord (slash commands + messageCreate; guild-installed)
   │
   ▼
Node / TypeScript bot (discord.js v14, ESM, tsx on Node 24)
   ├─►  Qwen3-TTS   (podman, GPU)  →  voice cloning      — /clone, one-shot worker subprocess
   ├─►  Whisper     (podman, CPU)  →  transcription      — /transcribe (faster-whisper, int8)
   └─►  SQLite      (better-sqlite3) + data/voices/*.mp3 — registrations
```

- **TTS** runs each generation in a short-lived subprocess that exits, so it holds **zero VRAM when
  idle** — important when sharing a GPU with other workloads.
- **Whisper is CPU-only** by default, so transcription never competes with the TTS model for VRAM.
- **Voice** uses `@discordjs/voice` ≥ 0.19 + `@snazzah/davey`, so it satisfies Discord's mandatory
  E2EE (DAVE) voice protocol.

---

## Setup

Requirements: Linux host with **Podman** + NVIDIA Container Toolkit (CDI; `nvidia.com/gpu=all`),
**Node 24+**, and a Discord application.

### 1. Discord application (one-time)

Create a **new** app at <https://discord.com/developers/applications>:

- **Bot → Token** → `DISCORD_TOKEN`; **Application ID** → `DISCORD_CLIENT_ID`.
- **Bot → Privileged Gateway Intents:** enable **Message Content** and **Server Members**.
- Invite the bot to your server (guild-install) with the **bot** + **applications.commands** scopes
  and the **Connect** + **Speak** voice permissions.

### 2. Services + bot

```bash
cd ~/mimic-tts && nvm use
npm install

cp .env.example .env          # fill DISCORD_TOKEN + DISCORD_CLIENT_ID

podman-compose up -d --build  # build + start tts (GPU) and stt (CPU)
#  first run downloads the Qwen3-TTS and Whisper models

npm run deploy                # register slash commands
npm run dev                   # run the bot (or use a systemd service)
```

Verify the services:

```bash
curl localhost:8011/health    # {"ok":true,"model":"Qwen/Qwen3-TTS-..."}
curl localhost:8012/health    # {"ok":true,"model":"base","device":"cpu"}
```

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | — (required) | Bot token. |
| `DISCORD_CLIENT_ID` | — (required) | Application ID, for command registration. |
| `TTS_URL` | `http://localhost:8011` | Qwen3-TTS service. |
| `STT_URL` | `http://localhost:8012` | Whisper service. |
| `DATA_DIR` | `./data` | SQLite DB + saved voice samples (gitignored). |
| `TTS_LANGUAGE` | `English` | Language hint passed to TTS. |
| `MAX_TTS_CHARS` | `300` | Max characters spoken per message. |

Whisper model/device is set in `compose.yml` (`WHISPER_MODEL`, `WHISPER_DEVICE`,
`WHISPER_COMPUTE_TYPE`) — bump to `small`/`medium` or move to GPU there if you want.

---

## Notes and limitations

- **One voice per user, global.** Re-running `/register` overwrites your previous sample.
- **One channel per guild.** `/join` moves Mimic-TTS to your channel.
- **Sample quality matters.** A clean, ~5–15 s mono clip of clear speech clones best.
- **GPU sharing.** If you run this alongside another GPU workload on a 16 GB card, the TTS model
  (~4 GB during generation) plus a large resident model can approach the VRAM ceiling.

---

## Disclaimer

Mimic-TTS is a **personal, self-hosted novelty bot**. Use it responsibly and at your own risk.

- **Consent and impersonation.** Only register and clone voices **you have permission to use**. Do not
  use Mimic-TTS to impersonate real people, deceive, defraud, or harass. You are responsible for how the
  cloned audio is used and for complying with Discord's Terms of Service, Community Guidelines, and all
  applicable laws (including biometric/voice-likeness laws in your jurisdiction).
- **Stored data.** Voice samples and transcripts are stored locally (SQLite + `data/voices/`). Anyone
  with access to the host can read them. `/unregister` deletes a user's sample and transcript.
- **Accuracy.** Transcription and voice cloning are imperfect and may misrepresent what was said or
  how someone sounds.
- **No warranty.** Provided "as is", without warranty of any kind; the authors are not liable for
  misuse or damages.
