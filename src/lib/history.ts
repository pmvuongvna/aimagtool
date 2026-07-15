import { ensureSchema, getPool, hasDatabase } from "@/lib/db";

export type MediaType = "image" | "video";

export type HistoryItem = {
  id: string;
  userId: string;
  mediaType: MediaType;
  urls: string[];
  prompt: string;
  createdAt: string;
};

type HistoryState = {
  items: HistoryItem[];
};

const globalKey = "__aistudio_history_state__";
const HISTORY_RETENTION_DAYS = 7;
const HISTORY_LIMIT = 200;
const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function getState(): HistoryState {
  const g = globalThis as typeof globalThis & { [globalKey]?: HistoryState };
  if (!g[globalKey]) g[globalKey] = { items: [] };
  return g[globalKey] as HistoryState;
}

function createId() {
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCutoffDate() {
  return new Date(Date.now() - HISTORY_RETENTION_MS);
}

function filterRecentItems(items: HistoryItem[]) {
  const cutoff = getCutoffDate().getTime();
  return items.filter((item) => {
    const timestamp = new Date(item.createdAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
}

function normalizeUrls(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item) => typeof item === "string" && item.startsWith("http")).map((item) => String(item));
}

export async function purgeExpiredHistory() {
  if (!hasDatabase()) {
    const state = getState();
    state.items = filterRecentItems(state.items).slice(0, HISTORY_LIMIT);
    return;
  }

  await ensureSchema();
  const pool = getPool();
  await pool.query("DELETE FROM history_items WHERE created_at < NOW() - INTERVAL '7 days'");
}

export async function addHistoryItem(input: Omit<HistoryItem, "id" | "createdAt">) {
  const item: HistoryItem = {
    id: createId(),
    createdAt: new Date().toISOString(),
    ...input,
  };

  if (!hasDatabase()) {
    const state = getState();
    state.items.unshift(item);
    state.items = filterRecentItems(state.items).slice(0, HISTORY_LIMIT);
    return item;
  }

  await purgeExpiredHistory();
  const pool = getPool();
  await pool.query(
    "INSERT INTO history_items (id, user_id, media_type, urls, prompt, created_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6)",
    [item.id, item.userId, item.mediaType, JSON.stringify(item.urls), item.prompt, item.createdAt],
  );
  return item;
}

export async function getHistoryByUser(userId: string) {
  if (!hasDatabase()) {
    return filterRecentItems(getState().items)
      .filter((x) => x.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, HISTORY_LIMIT);
  }

  await purgeExpiredHistory();
  const pool = getPool();
  const result = await pool.query(
    "SELECT id, user_id, media_type, urls, prompt, created_at FROM history_items WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 200",
    [userId],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    mediaType: (row.media_type === "video" ? "video" : "image") as MediaType,
    urls: normalizeUrls(row.urls),
    prompt: String(row.prompt || ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}
