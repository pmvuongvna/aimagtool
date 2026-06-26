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

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'internal',
      source_prompt_id TEXT,
      source_url TEXT,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT 'image',
      model TEXT NOT NULL DEFAULT '',
      aspect_ratio TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'All',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      author_name TEXT NOT NULL DEFAULT '',
      published BOOLEAN NOT NULL DEFAULT TRUE,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prompt_import_settings (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prompt_import_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'meigen',
      mode TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'success',
      requested_count INTEGER NOT NULL DEFAULT 0,
      imported_count INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_history_user_created ON history_items(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompt_templates_media ON prompt_templates(media_type, published, featured);
    CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category, published);
    CREATE INDEX IF NOT EXISTS idx_prompt_import_runs_created ON prompt_import_runs(created_at DESC);
  `);
  initialized = true;
}
