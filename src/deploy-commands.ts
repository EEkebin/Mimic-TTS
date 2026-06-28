import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands/index.js";

const body = commands.map((c) => c.data.toJSON());
const rest = new REST().setToken(config.DISCORD_TOKEN);

console.log(`Registering ${body.length} global commands for application ${config.DISCORD_CLIENT_ID}...`);
const data = (await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body })) as unknown[];
console.log(`✅ Registered ${data.length} commands. (Global commands can take up to ~1h to appear the first time.)`);
