import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { join as joinVoice } from "../voiceManager.js";

export const data = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join your current voice channel so Mimic-TTS can speak registered users' messages.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const channel = member?.voice?.channel ?? null;
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await interaction.editReply("You're not in a voice channel I can join. Hop into one and try again.");
    return;
  }

  try {
    await joinVoice(channel);
  } catch (err) {
    console.error("join failed:", err);
    await interaction.editReply("Couldn't connect to that voice channel — try again in a moment.");
    return;
  }

  await interaction.editReply(
    `🔊 Joined **${channel.name}**. Registered users: type in this channel's text chat and I'll speak as you.`,
  );
}
