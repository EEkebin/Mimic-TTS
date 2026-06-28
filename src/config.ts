import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  TTS_URL: z.string().url().default("http://localhost:8011"),
  STT_URL: z.string().url().default("http://localhost:8012"),
  DATA_DIR: z.string().default("./data"),
  TTS_LANGUAGE: z.string().default("English"),
  MAX_TTS_CHARS: z.coerce.number().int().positive().default(300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
