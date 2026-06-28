import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { leave as leaveVoice } from "../voiceManager.js";

export const data = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("Disconnect Mimic-TTS from the voice channel.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }
  const left = leaveVoice(interaction.guild.id);
  await interaction.reply({
    content: left ? "👋 Left the voice channel." : "I'm not in a voice channel here.",
    flags: MessageFlags.Ephemeral,
  });
}
