import "server-only";
import { Pool } from "pg";

const globalKey = "__aistudio_pg_pool__";

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || "";
}

export function hasDatabase() {
  return Boolean(getDatabaseUrl());
}

export function getPool() {
  const g = globalThis as typeof globalThis & { [globalKey]?: Pool };
  if (!g[globalKey]) {
    const connectionString = getDatabaseUrl();
    if (!connectionString) throw new Error("DATABASE_URL is missing.");
    g[globalKey] = new Pool({
      connectionString,
      max: 5,
      ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });
  }
  return g[globalKey] as Pool;
}

let initialized = false;
export async function ensureSchema() {
  if (initialized || !hasDatabase()) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS credit_settings (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_credits (
      user_id TEXT PRIMARY KEY,
      credits NUMERIC(14, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS history_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      media_type TEXT NOT NULL,
      urls JSONB NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_history_user_created ON history_items(user_id, created_at DESC);
  `);
  initialized = true;
}
