import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

export interface Voice {
  user_id: string;
  username: string;
  mp3_path: string;
  transcript: string;
  created_at: number;
}

mkdirSync(config.DATA_DIR, { recursive: true });
const db = new Database(path.join(config.DATA_DIR, "mimic-tts.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS voices (
    user_id    TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    mp3_path   TEXT NOT NULL,
    transcript TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const upsertStmt = db.prepare(`
  INSERT INTO voices (user_id, username, mp3_path, transcript, created_at)
  VALUES (@user_id, @username, @mp3_path, @transcript, @created_at)
  ON CONFLICT(user_id) DO UPDATE SET
    username = excluded.username,
    mp3_path = excluded.mp3_path,
    transcript = excluded.transcript,
    created_at = excluded.created_at
`);
const getStmt = db.prepare(`SELECT * FROM voices WHERE user_id = ?`);
const deleteStmt = db.prepare(`DELETE FROM voices WHERE user_id = ?`);

export function upsertVoice(v: Voice): void {
  upsertStmt.run(v);
}

export function getVoice(userId: string): Voice | undefined {
  return getStmt.get(userId) as Voice | undefined;
}

export function deleteVoice(userId: string): boolean {
  return deleteStmt.run(userId).changes > 0;
}
