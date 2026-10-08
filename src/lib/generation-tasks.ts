import "server-only";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";
import { getTaskDetails } from "@/lib/kie";
import { addHistoryItem } from "@/lib/history";

export type GenerationTask = { id: string; batchId?: string; userId: string; mediaType: "image" | "video"; prompt: string; status: string; urls: string[]; error?: string; createdAt: string };
const memory = new Map<string, GenerationTask>();
export async function saveGenerationTask(task: GenerationTask) {
  if (!hasDatabase()) { memory.set(task.id, task); return; }
  await ensureSchema();
  await getPool().query("INSERT INTO generation_tasks (id,user_id,media_type,prompt,batch_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [task.id, task.userId, task.mediaType, task.prompt, task.batchId || task.id]);
}
function mapRow(row: Record<string, unknown>): GenerationTask {
  return { id: String(row.id), batchId: String(row.batch_id || row.id), userId: String(row.user_id), mediaType: row.media_type as "image" | "video", prompt: String(row.prompt), status: String(row.status), urls: row.urls as string[], error: row.error ? String(row.error) : undefined, createdAt: new Date(String(row.created_at)).toISOString() };
}
function collect(value: unknown): string[] {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) return [value];
    try { return collect(JSON.parse(value)); } catch { return []; }
  }
  if (Array.isArray(value)) return value.flatMap(collect);
  if (value && typeof value === "object") return Object.values(value).flatMap(collect);
  return [];
}
export async function listGenerationTasks(userId: string) {
  let tasks: GenerationTask[];
  if (hasDatabase()) {
    await ensureSchema();
    const result = await getPool().query("SELECT * FROM generation_tasks WHERE user_id=$1 AND created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 50", [userId]);
    tasks = result.rows.map(mapRow);
  } else tasks = [...memory.values()].filter((task) => task.userId === userId).reverse();
  for (const task of tasks.filter((item) => !["success", "failed"].includes(item.status))) {
    try {
      const payload = await getTaskDetails(task.id);
      const data = payload.data || {};
      const state = String(data.state || "pending").toLowerCase();
      if (["success", "completed", "succeeded"].includes(state)) {
        task.urls = [...new Set(collect(data.resultJson || data.resultUrls || data.output))];
        if (!task.urls.length) continue;
        const videos = task.urls.filter((url) => /\.(mp4|mov|webm)(\?|$)/i.test(url));
        await addHistoryItem({ userId, mediaType: task.mediaType, urls: task.mediaType === "video" && videos.length ? videos : task.urls, prompt: task.prompt });
        task.status = "success";
      } else if (["fail", "failed", "error"].includes(state)) {
        task.status = "failed"; task.error = String(data.failMsg || data.errorMessage || "Generation failed");
      } else task.status = state;
      if (hasDatabase()) await getPool().query("UPDATE generation_tasks SET status=$2,urls=$3::jsonb,error=$4,updated_at=NOW() WHERE id=$1", [task.id, task.status, JSON.stringify(task.urls), task.error || null]);
    } catch { /* Leave tasks retryable after temporary provider errors. */ }
  }
  return tasks;
}
