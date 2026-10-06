"use client";
import { useEffect, useState } from "react";
import { LoaderCircle, CircleAlert, Check } from "lucide-react";
import { apiFetch, apiPath } from "@/lib/api-url";
import type { GenerationTask } from "@/lib/generation-tasks";
import styles from "./generation-activity.module.css";

export function GenerationActivity({ mediaType, creating, onRefresh }: { mediaType: "image" | "video"; creating: boolean; onRefresh: () => void }) {
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [observedAt, setObservedAt] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let previous = "";
    async function refresh() {
      try {
        const response = await apiFetch(apiPath("/api/user/generation-tasks"), { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { tasks: GenerationTask[] };
        if (stopped) return;
        const items = data.tasks.filter((task) => task.mediaType === mediaType);
        setTasks(items);
        setObservedAt(Date.now());
        const completed = items.filter((task) => task.status === "success").map((task) => task.id).join(",");
        if (completed !== previous) { previous = completed; onRefresh(); }
      } catch { /* Retry on the next poll. */ }
      finally { if (!stopped) timer = setTimeout(refresh, 5000); }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [mediaType, creating, onRefresh]);
  const visible = [...tasks.filter((task) => !["success", "failed"].includes(task.status)), ...tasks.filter((task) => ["success", "failed"].includes(task.status) && observedAt - new Date(task.createdAt).getTime() < 86400000).slice(0, 6)];
  if (!visible.length && !creating) return null;
  return <section className={styles.activity} aria-label="Generation activity" aria-live="polite">
    <h2>{mediaType === "image" ? "Tác vụ tạo ảnh" : "Tác vụ tạo video"}</h2>
    {!visible.length ? <div className={styles.row}><LoaderCircle className={styles.spin} size={18} /> Đang gửi yêu cầu...</div> : visible.map((task) => <article className={styles.row} key={task.id}>
      <div className={styles.details}>{task.status === "success" ? <Check size={18} /> : task.status === "failed" ? <CircleAlert size={18} /> : <LoaderCircle className={styles.spin} size={18} />}<div><strong>{task.prompt}</strong><span>{task.status === "success" ? "Hoàn tất" : task.status === "failed" ? task.error : `Đang tạo · ${task.status}`}</span></div></div>
      {task.status === "success" ? <div className={styles.outputs}>{task.urls.map((url) => mediaType === "video" && /\.(mp4|mov|webm)(\?|$)/i.test(url) ? <video key={url} src={url} controls preload="metadata" /> : <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Generated result" /></a>)}</div> : null}
    </article>)}
  </section>;
}
