import { REST, Routes } from "discord.js";
import { config } from "./config.js";

const rest = new REST().setToken(config.DISCORD_TOKEN);
console.log("Clearing all global commands...");
await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body: [] });
console.log("✅ Cleared.");
