import { Readable } from "node:stream";
import ffmpegStatic from "ffmpeg-static";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  type VoiceConnection,
  type AudioPlayer,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { cloneVoice } from "./tts.js";

const ffmpegPath = ffmpegStatic as unknown as string | null;
// Lets prism-media find ffmpeg to transcode the WAV into Opus for Discord.
if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;

/** One queued line to be spoken: generate from `text` in the given user's voice, then play. */
export interface SpeakJob {
  mp3Path: string;
  transcript: string;
  text: string;
}

interface GuildVoice {
  connection: VoiceConnection;
  player: AudioPlayer;
  channelId: string;
  queue: SpeakJob[];
  /** True while a job is being generated or is currently playing. */
  busy: boolean;
}

const guilds = new Map<string, GuildVoice>();

/** Join (or move to) a voice channel and open a persistent connection + playback queue. */
export async function join(channel: VoiceBasedChannel): Promise<void> {
  const existing = guilds.get(channel.guild.id);
  if (existing) {
    if (existing.channelId === channel.id) return; // already here
    leave(channel.guild.id); // moving channels → tear down and rejoin
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  connection.on("error", (e) => console.warn("voice connection error:", e));
  // DAVE/E2EE handshake must complete here, or the connection never becomes Ready.
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  const player = createAudioPlayer();
  connection.subscribe(player);

  const gv: GuildVoice = { connection, player, channelId: channel.id, queue: [], busy: false };
  player.on(AudioPlayerStatus.Idle, () => {
    gv.busy = false;
    void drain(channel.guild.id);
  });
  player.on("error", (err) => {
    console.error("audio player error:", err);
    gv.busy = false;
    void drain(channel.guild.id);
  });
  connection.on(VoiceConnectionStatus.Disconnected, () => leave(channel.guild.id));

  guilds.set(channel.guild.id, gv);
}

/** Disconnect and clear the queue for a guild. */
export function leave(guildId: string): boolean {
  const gv = guilds.get(guildId);
  if (!gv) return false;
  gv.queue = [];
  try {
    gv.connection.destroy();
  } catch {
    /* already destroyed */
  }
  guilds.delete(guildId);
  return true;
}

/** The voice channel the bot is currently connected to in a guild, or null. */
export function connectedChannelId(guildId: string): string | null {
  return guilds.get(guildId)?.channelId ?? null;
}

/** Queue a line to be spoken. Returns false if the bot isn't connected in that guild. */
export function enqueue(guildId: string, job: SpeakJob): boolean {
  const gv = guilds.get(guildId);
  if (!gv) return false;
  gv.queue.push(job);
  void drain(guildId);
  return true;
}

/** Generate + play one job at a time per guild (serialized, so TTS gens don't overlap). */
async function drain(guildId: string): Promise<void> {
  const gv = guilds.get(guildId);
  if (!gv || gv.busy) return;
  const job = gv.queue.shift();
  if (!job) return;

  gv.busy = true;
  try {
    const wav = await cloneVoice(job.text, job.mp3Path, job.transcript);
    if (!guilds.has(guildId)) return; // left while generating
    const resource = createAudioResource(Readable.from(wav), { inputType: StreamType.Arbitrary });
    gv.player.play(resource); // Idle handler resumes the queue when this finishes
  } catch (err) {
    console.error("speak job failed:", err);
    gv.busy = false;
    void drain(guildId); // skip the failed line, keep going
  }
}
