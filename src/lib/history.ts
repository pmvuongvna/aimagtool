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

export function addHistoryItem(input: Omit<HistoryItem, "id" | "createdAt">) {
  const item: HistoryItem = {
    id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  const state = getState();
  state.items.unshift(item);
  state.items = state.items.slice(0, 200);
  return item;
}

export function getHistoryByUser(userId: string) {
  return getState().items.filter((x) => x.userId === userId);
}
