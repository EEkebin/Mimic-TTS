import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { config } from "../config.js";
import { downloadAttachment } from "../tts.js";
import { transcribe } from "../stt.js";
import { upsertVoice } from "../db.js";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export const data = new SlashCommandBuilder()
  .setName("register")
  .setDescription("Register your voice: upload a short clip and Mimic-TTS will speak as you.")
  // Guild-install only — the bot needs to be in the server to join voice and read VC chat.
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addAttachmentOption((o) =>
    o.setName("sample").setDescription("A clean ~5–15s voice clip (mp3/ogg/wav/m4a)").setRequired(true),
  );

function looksLikeAudio(contentType: string | null, name: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith("audio")) return true;
  return /\.(mp3|ogg|oga|wav|m4a|flac|webm)$/i.test(name);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sample = interaction.options.getAttachment("sample", true);

  if (!looksLikeAudio(sample.contentType, sample.name)) {
    await interaction.editReply("That's not an audio file — upload an mp3/ogg/wav/m4a clip (~5–15s).");
    return;
  }
  if (sample.size > MAX_BYTES) {
    await interaction.editReply("That clip is too big (max 12 MB). A short ~5–15s sample is plenty.");
    return;
  }

  let audio: Buffer;
  try {
    audio = await downloadAttachment(sample.url);
  } catch (err) {
    console.error("register: download failed:", err);
    await interaction.editReply("Couldn't download that clip — try uploading it again.");
    return;
  }

  let transcript: string;
  try {
    transcript = await transcribe(audio, sample.name);
  } catch (err) {
    console.error("register: transcription failed:", err);
    await interaction.editReply("Couldn't transcribe that clip — make sure it's clear speech and try again.");
    return;
  }

  // Persist the sample to disk, keyed by user id.
  const ext = (path.extname(sample.name) || ".mp3").toLowerCase();
  const dir = path.join(config.DATA_DIR, "voices");
  mkdirSync(dir, { recursive: true });
  const mp3Path = path.join(dir, `${interaction.user.id}${ext}`);
  try {
    await writeFile(mp3Path, audio);
  } catch (err) {
    console.error("register: save failed:", err);
    await interaction.editReply("Couldn't save your sample — try again in a bit.");
    return;
  }

  upsertVoice({
    user_id: interaction.user.id,
    username: interaction.user.username,
    mp3_path: mp3Path,
    transcript,
    created_at: Date.now(),
  });

  const preview = transcript ? `\n> 📝 *Heard:* "${transcript.slice(0, 200)}"` : "";
  await interaction.editReply(
    `✅ Registered your voice! Now use \`/join\` and type in a voice channel's chat — I'll speak as you.${preview}`,
  );
}
