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

function getState(): HistoryState {
  const g = globalThis as typeof globalThis & { [globalKey]?: HistoryState };
  if (!g[globalKey]) g[globalKey] = { items: [] };
  return g[globalKey] as HistoryState;
}

function createId() {
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
    state.items = state.items.slice(0, 200);
    return item;
  }

  await ensureSchema();
  const pool = getPool();
  await pool.query(
    "INSERT INTO history_items (id, user_id, media_type, urls, prompt, created_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6)",
    [item.id, item.userId, item.mediaType, JSON.stringify(item.urls), item.prompt, item.createdAt],
  );
  return item;
}

export async function getHistoryByUser(userId: string) {
  if (!hasDatabase()) {
    return getState().items.filter((x) => x.userId === userId);
  }

  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    "SELECT id, user_id, media_type, urls, prompt, created_at FROM history_items WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200",
    [userId],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    mediaType: (row.media_type === "video" ? "video" : "image") as MediaType,
    urls: Array.isArray(row.urls) ? (row.urls as string[]) : [],
    prompt: String(row.prompt || ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}
