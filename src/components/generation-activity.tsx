"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, CircleAlert, Check, X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { apiFetch, apiPath } from "@/lib/api-url";
import type { GenerationTask } from "@/lib/generation-tasks";
import { selectGenerationBatch } from "@/lib/generation-display";
import styles from "./generation-activity.module.css";

export function GenerationActivity({ mediaType, creating, activeBatchId, onRefresh }: { mediaType: "image" | "video"; creating: boolean; activeBatchId?: string; onRefresh: () => void }) {
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
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
        const completed = items.filter((task) => task.status === "success").map((task) => task.id).join(",");
        if (completed !== previous) { previous = completed; onRefresh(); }
      } catch { /* Retry on the next poll. */ }
      finally { if (!stopped) timer = setTimeout(refresh, 5000); }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [mediaType, creating, activeBatchId, onRefresh]);
  const visible = selectGenerationBatch(tasks, activeBatchId);
  const urls = [...new Set(visible.filter((task) => task.status === "success").flatMap((task) => task.urls))];
  const pending = creating || visible.some((task) => !["success", "failed"].includes(task.status));
  const errors = visible.filter((task) => task.status === "failed");
  if (!visible.length && !creating && !activeBatchId) return null;
  return <section className={styles.activity} aria-label="Generation activity" aria-live="polite">
    <div className={styles.header}><h2>{mediaType === "image" ? "Kết quả tạo ảnh" : "Kết quả tạo video"}</h2><span className={styles.status}>{pending ? <><LoaderCircle className={styles.spin} size={16} /> Đang tạo</> : urls.length ? <><Check size={16} /> Hoàn tất</> : <><CircleAlert size={16} /> Chưa có kết quả</>}</span></div>
    {pending && !urls.length ? <div className={styles.pending}><LoaderCircle className={styles.spin} size={28} /><span>{mediaType === "image" ? "Đang tạo ảnh..." : "Đang tạo video..."}</span></div> : null}
    {urls.length ? <div className={styles.outputs}>{urls.map((url, index) => <button type="button" className={styles.output} key={url} onClick={() => setPreview({ urls, index })} aria-label={`Mở ${isVideo(url) ? "video" : "ảnh"} ${index + 1}`}>
        {isVideo(url) ? <video src={url} muted playsInline preload="metadata" /> : <img src={url} alt={`Kết quả ${index + 1}`} />}
        <span className={styles.expand}><Maximize2 size={18} /></span>
      </button>)}</div> : null}
    {errors.map((task) => <p className={styles.error} key={task.id}><CircleAlert size={16} />{task.error || "Tác vụ thất bại. Vui lòng thử lại."}</p>)}
    {preview ? <dialog ref={dialogRef} className={styles.lightbox} aria-label="Xem kết quả" onCancel={closePreview} onClose={() => setPreview(null)} onClick={(event) => { if (event.target === event.currentTarget) closePreview(); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); stepPreview(-1); } if (event.key === "ArrowRight") { event.preventDefault(); stepPreview(1); } }}>
      <button autoFocus type="button" className={styles.close} onClick={closePreview} aria-label="Đóng"><X size={24} /></button>
      <div className={styles.previewMedia}>{isVideo(preview.urls[preview.index]) ? <video key={preview.urls[preview.index]} src={preview.urls[preview.index]} controls playsInline autoPlay /> : <img src={preview.urls[preview.index]} alt={`Kết quả ${preview.index + 1}`} />}</div>
      {preview.urls.length > 1 ? <><button type="button" className={`${styles.navigation} ${styles.previous}`} onClick={() => stepPreview(-1)} aria-label="Kết quả trước"><ChevronLeft size={26} /></button><button type="button" className={`${styles.navigation} ${styles.next}`} onClick={() => stepPreview(1)} aria-label="Kết quả tiếp"><ChevronRight size={26} /></button><span className={styles.counter}>{preview.index + 1} / {preview.urls.length}</span></> : null}
    </dialog> : null}
  </section>;
}
