import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import * as register from "./register.js";
import * as unregister from "./unregister.js";
import * as join from "./join.js";
import * as leave from "./leave.js";
import * as whoami from "./whoami.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [register, unregister, join, leave, whoami];
export const commandMap = new Map<string, Command>(commands.map((c) => [c.data.name, c]));
