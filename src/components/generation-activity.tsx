"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, CircleAlert, Check, X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { apiFetch, apiPath } from "@/lib/api-url";
import type { GenerationTask } from "@/lib/generation-tasks";
import styles from "./generation-activity.module.css";

export function GenerationActivity({ mediaType, creating, onRefresh }: { mediaType: "image" | "video"; creating: boolean; onRefresh: () => void }) {
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [observedAt, setObservedAt] = useState(0);
  const [preview, setPreview] = useState<{ urls: string[]; index: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!preview || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [preview]);
  function closePreview() { dialogRef.current?.close(); setPreview(null); }
  function stepPreview(delta: number) { setPreview((current) => current ? { ...current, index: (current.index + delta + current.urls.length) % current.urls.length } : null); }
  function isVideo(url: string) { return mediaType === "video" && !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url); }
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
      {task.status === "success" ? <div className={styles.outputs}>{task.urls.map((url, index) => <button type="button" className={styles.output} key={url} onClick={() => setPreview({ urls: task.urls, index })} aria-label={`Mở ${isVideo(url) ? "video" : "ảnh"} ${index + 1}`}>
        {isVideo(url) ? <video src={url} muted playsInline preload="metadata" /> : <img src={url} alt={`Kết quả ${index + 1}`} />}
        <span className={styles.expand}><Maximize2 size={18} /></span>
      </button>)}</div> : null}
    </article>)}
    {preview ? <dialog ref={dialogRef} className={styles.lightbox} aria-label="Xem kết quả" onCancel={closePreview} onClose={() => setPreview(null)} onClick={(event) => { if (event.target === event.currentTarget) closePreview(); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); stepPreview(-1); } if (event.key === "ArrowRight") { event.preventDefault(); stepPreview(1); } }}>
      <button autoFocus type="button" className={styles.close} onClick={closePreview} aria-label="Đóng"><X size={24} /></button>
      <div className={styles.previewMedia}>{isVideo(preview.urls[preview.index]) ? <video key={preview.urls[preview.index]} src={preview.urls[preview.index]} controls playsInline autoPlay /> : <img src={preview.urls[preview.index]} alt={`Kết quả ${preview.index + 1}`} />}</div>
      {preview.urls.length > 1 ? <><button type="button" className={`${styles.navigation} ${styles.previous}`} onClick={() => stepPreview(-1)} aria-label="Kết quả trước"><ChevronLeft size={26} /></button><button type="button" className={`${styles.navigation} ${styles.next}`} onClick={() => stepPreview(1)} aria-label="Kết quả tiếp"><ChevronRight size={26} /></button><span className={styles.counter}>{preview.index + 1} / {preview.urls.length}</span></> : null}
    </dialog> : null}
  </section>;
}
