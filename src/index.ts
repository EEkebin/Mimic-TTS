import { Client, GatewayIntentBits, Events, MessageFlags, ChannelType, type Message } from "discord.js";
import { config } from "./config.js";
import { commandMap } from "./commands/index.js";
import { getVoice } from "./db.js";
import { connectedChannelId, enqueue } from "./voiceManager.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Mimic-TTS online as ${c.user.tag} — ${commandMap.size} commands loaded.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = "Something glitched out — try that again.";
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
      else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    } catch {
      /* interaction expired */
    }
  }
});

/** Turn a Discord message into clean speakable text (resolve mentions, drop links/emoji markup, cap). */
function speakable(message: Message): string {
  let t = message.cleanContent || "";
  t = t.replace(/<a?:(\w+):\d+>/g, "$1"); // custom emoji -> its name
  t = t.replace(/https?:\/\/\S+/g, ""); // don't read out URLs
  t = t.replace(/\s+/g, " ").trim();
  return t.slice(0, config.MAX_TTS_CHARS);
}

// Speak a registered user's message when they type in the voice channel's text chat
// AND Mimic-TTS is connected to that same channel.
client.on(Events.MessageCreate, (message: Message) => {
  if (message.author.bot || !message.guild) return;
  if (message.channel.type !== ChannelType.GuildVoice) return;
  if (connectedChannelId(message.guild.id) !== message.channelId) return;

  const voice = getVoice(message.author.id);
  if (!voice) return;

  const text = speakable(message);
  if (!text) return;

  enqueue(message.guild.id, { mp3Path: voice.mp3_path, transcript: voice.transcript, text });
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down...`);
  await client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => console.error("Unhandled promise rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

await client.login(config.DISCORD_TOKEN);
