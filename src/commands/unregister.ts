import { rm } from "node:fs/promises";
import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getVoice, deleteVoice } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("unregister")
  .setDescription("Delete your registered voice (sample + transcript).")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const voice = getVoice(interaction.user.id);
  if (!voice) {
    await interaction.reply({ content: "You don't have a voice registered.", flags: MessageFlags.Ephemeral });
    return;
  }
  await rm(voice.mp3_path, { force: true }).catch(() => {});
  deleteVoice(interaction.user.id);
  await interaction.reply({ content: "🗑️ Your voice has been deleted.", flags: MessageFlags.Ephemeral });
}
