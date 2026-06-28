import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getVoice } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("whoami")
  .setDescription("Check whether you've registered a voice with Mimic-TTS.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const voice = getVoice(interaction.user.id);
  if (!voice) {
    await interaction.reply({
      content: "You haven't registered a voice yet. Use `/register` with a short audio clip.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const when = `<t:${Math.floor(voice.created_at / 1000)}:R>`;
  await interaction.reply({
    content: `✅ You're registered (${when}).\n> 📝 *Sample transcript:* "${voice.transcript.slice(0, 200) || "(none)"}"`,
    flags: MessageFlags.Ephemeral,
  });
}
