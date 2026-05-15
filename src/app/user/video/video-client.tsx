"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { CreateTaskInput, VideoMode, VideoResolution } from "@/lib/ai/types";
import { apiPath } from "@/lib/api-url";
import styles from "../generate.module.css";

type TaskResponse = { data?: { taskId?: string }; error?: string; creditCost?: number; remainingCredits?: number };
type ProfileResponse = { userId: string; credits: number; previewCosts: { video480p: number; video720p: number } };
type HistoryItem = { id: string; mediaType: "image" | "video"; urls: string[]; prompt: string; createdAt: string };
type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };

function formatCredits(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("vi-VN")
    : value.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function collectUrls(value: unknown, bucket: string[]) {
  if (!value) return;
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) bucket.push(value);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item) => collectUrls(item, bucket));
  if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => collectUrls(item, bucket));
}

function extractResultUrls(data: Record<string, unknown>) {
  const urls: string[] = [];
  collectUrls(data.resultJson, urls);
  collectUrls(data.result, urls);
  collectUrls(data.output, urls);
  collectUrls(data.videos, urls);
  collectUrls(data.videoUrls, urls);
  collectUrls(data.resultUrls, urls);
  return Array.from(new Set(urls));
}

function isCompletedState(state: string) {
  return ["success", "completed", "succeeded", "done", "finish", "finished"].includes(state.toLowerCase());
}

function isFailedState(state: string) {
  return ["fail", "failed", "error", "cancelled", "canceled"].includes(state.toLowerCase());
}

function firstNonEmptyString(values: unknown[]) {
  for (const item of values) {
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return "";
}

function extractTaskError(payload: Record<string, unknown>, data: Record<string, unknown>) {
  const result = data.result as Record<string, unknown> | undefined;
  const resultJson = data.resultJson as Record<string, unknown> | undefined;
  return firstNonEmptyString([
    payload.error,
    payload.msg,
    data.fail_reason,
    data.failReason,
    data.error,
    data.error_message,
    data.errorMessage,
    result?.error,
    result?.message,
    resultJson?.error,
    resultJson?.message,
  ]);
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url);
}

export default function VideoClient({ initialPrompt }: { initialPrompt: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState("demo-user");
  const [userName, setUserName] = useState("User");
  const [credits, setCredits] = useState(0);
  const [costPreview, setCostPreview] = useState<ProfileResponse["previewCosts"] | null>(null);

  const [prompt, setPrompt] = useState(initialPrompt.trim() || "A cinematic drone shot of a futuristic city at night with neon reflections on wet streets.");
  const [videoModeType, setVideoModeType] = useState<"text" | "image">("text");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("2:3");
  const [mode, setMode] = useState<VideoMode>("normal");
  const [duration, setDuration] = useState(6);
  const [resolution, setResolution] = useState<VideoResolution>("480p");
  const [activeTab, setActiveTab] = useState<"create" | "history">("create");

  const [taskId, setTaskId] = useState("");
  const [statusText, setStatusText] = useState("Sẵn sàng tạo video.");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const currentCost = useMemo(() => {
    const rate = (resolution === "720p" ? costPreview?.video720p : costPreview?.video480p) ?? null;
    if (rate === null) return null;
    return Math.round(rate * duration * 10) / 10;
  }, [costPreview, resolution, duration]);
  const canGenerate = prompt.trim().length >= 3 && (videoModeType === "text" || /^https?:\/\//.test(referenceUrl)) && !uploading;

  useEffect(() => {
    async function loadProfile() {
      const res = await fetch(apiPath(`/api/user/profile?userId=${encodeURIComponent(userId)}`));
      if (!res.ok) return;
      const data = (await res.json()) as ProfileResponse & { user?: { id: string; name: string } | null };
      if (data.user?.id && data.user.id !== userId) setUserId(data.user.id);
      if (data.user?.name) setUserName(data.user.name);
      setCredits(data.credits);
      setCostPreview(data.previewCosts);
    }
    void loadProfile();
  }, [userId]);

  useEffect(() => {
    async function loadPackages() {
      const res = await fetch(apiPath("/api/public/credit-packages"));
      if (!res.ok) return;
      const payload = (await res.json()) as { packages?: CreditPackage[] };
      setPackages(payload.packages || []);
    }
    void loadPackages();
  }, []);

  useEffect(() => {
    async function loadHistory() {
      const res = await fetch(apiPath(`/api/user/history?userId=${encodeURIComponent(userId)}`));
      if (!res.ok) return;
      const data = (await res.json()) as { items?: HistoryItem[] };
      setHistory((data.items || []).filter((x) => x.mediaType === "video"));
    }
    void loadHistory();
  }, [userId]);

  const checkTask = useCallback(async (targetTaskId: string) => {
    const res = await fetch(apiPath(`/api/ai/task/${targetTaskId}`));
    const payload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return { kind: "failed" as const, message: (typeof payload.error === "string" && payload.error) || "Không đọc được trạng thái task." };
    }
    const data = (payload.data as Record<string, unknown>) || {};
    const state = String(data.state || "unknown");
    setStatusText(`Trạng thái: ${state}`);
    if (isFailedState(state)) {
      const taskMessage = extractTaskError(payload, data) || "Tạo video thất bại. Vui lòng thử lại.";
      return { kind: "failed" as const, message: taskMessage };
    }
    if (!isCompletedState(state)) return { kind: "pending" as const };

    let parsedResultJson: unknown = data.resultJson;
    if (typeof parsedResultJson === "string") {
      try { parsedResultJson = JSON.parse(parsedResultJson); } catch {}
    }
    const urls = extractResultUrls({ ...data, resultJson: parsedResultJson });
    const video = urls.find((url) => isVideoUrl(url)) || urls[0] || "";
    if (!video) {
      return { kind: "failed" as const, message: extractTaskError(payload, data) || "Task đã hoàn tất nhưng không có video đầu ra." };
    }
    return { kind: "success" as const, video };
  }, []);

  async function waitForTaskVideo(targetTaskId: string) {
    for (let i = 0; i < 60; i += 1) {
      const result = await checkTask(targetTaskId);
      if (result.kind === "success") return result;
      if (result.kind === "failed") return result;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return { kind: "failed" as const, message: "Quá thời gian chờ render video. Vui lòng kiểm tra lại task." };
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setStatusText("Đang upload ảnh tham chiếu...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(apiPath("/api/ai/upload"), { method: "POST", body: fd });
      const payload = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !payload.url) {
        setStatusText(payload.error || "Upload thất bại.");
        return;
      }
      setReferenceUrl(payload.url);
      setStatusText("Đã upload ảnh tham chiếu.");
    } finally {
      setUploading(false);
    }
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!canGenerate) return;
    setLoading(true);
    setResultUrl("");
    setStatusText("Đang tạo video...");

    const body: CreateTaskInput = {
      serviceId: videoModeType === "text" ? "grok-text-video" : "grok-image-video",
      prompt,
      aspectRatio: aspectRatio === "auto" ? undefined : aspectRatio,
      videoMode: mode,
      duration: Math.max(1, Math.min(30, duration)),
      videoResolution: resolution,
      inputUrl: videoModeType === "image" ? referenceUrl : undefined,
    };

    const res = await fetch(apiPath("/api/ai/create-task"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": userId },
      body: JSON.stringify(body),
    });

    const payload = (await res.json()) as TaskResponse;
    if (!res.ok || !payload.data?.taskId) {
      setStatusText(payload.error || "Tạo video thất bại.");
      if (typeof payload.remainingCredits === "number") setCredits(payload.remainingCredits);
      setLoading(false);
      return;
    }

    setTaskId(payload.data.taskId);
    if (typeof payload.remainingCredits === "number") setCredits(payload.remainingCredits);

    const result = await waitForTaskVideo(payload.data.taskId);
    if (result.kind === "success") {
      setResultUrl(result.video);
      setStatusText("Hoàn tất video.");
      const r = await fetch(apiPath("/api/user/history"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ mediaType: "video", urls: [result.video], prompt }),
      });
      if (r.ok) {
        const p = (await r.json()) as { item?: HistoryItem };
        if (p.item) setHistory((prev) => [p.item!, ...prev].slice(0, 24));
      }
    } else {
      setStatusText(result.message || "Tạo video thất bại.");
    }
    setLoading(false);
  }

  async function handleLogout() {
    await fetch(apiPath("/api/auth/logout"), { method: "POST" });
    router.push("/login");
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/"><span className={styles.logo} />AIStudio</Link>
        <nav className={styles.nav}><Link href="/">Trang chủ</Link><Link href="/user">Tạo ảnh</Link><a className={styles.active}>Tạo video</a><Link href="/admin">Công cụ AI⌄</Link></nav>
        <div className={styles.topActions}><div className={styles.credit}>▣ {formatCredits(credits)}</div><button className={`${styles.iconBtn} ${styles.hideSm}`} onClick={handleLogout}>⎋</button><div className={styles.avatar} /><b>{userName}⌄</b></div>
      </header>

      <main className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.tabs}><button className={`${styles.tab} ${activeTab === "create" ? styles.activeTab : ""}`} onClick={() => setActiveTab("create")}>▣ Tạo video</button><button className={`${styles.tab} ${activeTab === "history" ? styles.activeTab : ""}`} onClick={() => setActiveTab("history")}>◴ Lịch sử</button></div>
          <form className={styles.form} onSubmit={onGenerate}>
            <div className={styles.field}><label>Mô hình AI</label><div className={styles.modelCard}><img src="https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=200&q=80" alt="Model" /><div><b>Grok Imagine {videoModeType === "text" ? "Text-to-Video" : "Image-to-Video"}</b><span>Input: prompt, aspect_ratio, mode, duration, resolution</span></div><span className={styles.badge}>Đang dùng</span></div></div>
            <div className={styles.field}>
              <label>Chế độ tạo video</label>
              <div className={styles.optionsTwo}>
                <button type="button" className={`${styles.option} ${videoModeType === "text" ? styles.activeOption : ""}`} onClick={() => setVideoModeType("text")}>Text → Video</button>
                <button type="button" className={`${styles.option} ${videoModeType === "image" ? styles.activeOption : ""}`} onClick={() => setVideoModeType("image")}>Image → Video</button>
              </div>
            </div>
            {videoModeType === "image" ? (
              <div className={styles.field}>
                <label>Ảnh tham chiếu <span className={styles.hint}>bắt buộc</span></label>
                <div className={styles.uploadBox}>
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }} />
                  <input className={styles.urlInput} value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://... (URL sau khi upload)" />
                </div>
              </div>
            ) : null}
            <div className={styles.field}><label>Prompt <span className={styles.hint}>{prompt.length}/20000</span></label><textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, 20000))} /></div>
            <div className={styles.field}><label>Tỷ lệ khung hình (aspect_ratio)</label><div className={styles.options}>{["auto", "2:3", "16:9", "9:16", "4:3", "3:4", "1:1"].map((v) => <button key={v} type="button" className={`${styles.option} ${aspectRatio === v ? styles.activeOption : ""}`} onClick={() => setAspectRatio(v)}>{v}</button>)}</div></div>
            <div className={styles.field}><label>Mode</label><div className={styles.optionsThree}>{(["normal", "fun", "spicy"] as VideoMode[]).map((v) => <button key={v} type="button" className={`${styles.option} ${mode === v ? styles.activeOption : ""}`} onClick={() => setMode(v)}>{v}</button>)}</div></div>
            <div className={styles.field}><label>Duration (giây)</label><div className={styles.options}>{[5, 10, 15, 20, 25, 30].map((v) => <button key={v} type="button" className={`${styles.option} ${duration === v ? styles.activeOption : ""}`} onClick={() => setDuration(v)}>{v}s</button>)}</div></div>
            <div className={styles.field}><label>Resolution</label><div className={styles.optionsTwo}>{(["480p", "720p"] as VideoResolution[]).map((v) => <button key={v} type="button" className={`${styles.option} ${resolution === v ? styles.activeOption : ""}`} onClick={() => setResolution(v)}>{v}</button>)}</div></div>
            <button className={styles.generateBtn} type="submit" disabled={loading || !canGenerate}>{loading ? "Đang tạo video..." : `Tạo video ✨   ⚡ ${formatCredits(currentCost ?? 0)}`}</button>
            <div className={styles.hint}>Ước tính trừ: <b>{formatCredits(currentCost ?? 0)} credit</b> ({resolution} × {duration}s).</div>
            <div className={styles.emptyTip}>{statusText}</div>
            {packages.length > 0 ? (
              <div className={styles.field}>
                <label>Gói credit</label>
                <div className={styles.historyGrid}>
                  {packages.slice(0, 3).map((item) => (
                    <div key={item.id} className={styles.historyCard}>
                      <div className={styles.historyMeta}>
                        <b>{item.name} {item.badge ? `· ${item.badge}` : ""}</b>
                        <span>{item.credits.toLocaleString("vi-VN")} credits · {item.priceVnd.toLocaleString("vi-VN")}đ</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </form>
        </aside>

        <section className={styles.results}>
          <div className={styles.resultSection}>
            <div className={styles.resultHead}><div className={styles.resultTitle}><h2>{activeTab === "history" ? "Lịch sử video" : "Kết quả video"}</h2><span className={styles.count}>{activeTab === "history" ? `${history.length} mục` : (resultUrl ? "1 video" : "0 video")}</span><span className={styles.hint}>{taskId ? `Task: ${taskId}` : "Chưa có task"}</span></div><button className={styles.downloadAll}>⇩ Tải video</button></div>

            {loading ? (
              <div className={styles.loadingBox}><div className={styles.spinner} /><b>Đang render video...</b><p>{statusText}</p></div>
            ) : activeTab === "history" ? (
              history.length === 0 ? <div className={styles.emptyTip}>Chưa có lịch sử video.</div> :
              <div className={styles.historyGrid}>{history.map((item) => <button key={item.id} className={styles.historyCard} onClick={() => setLightboxUrl(item.urls[0])}><video src={item.urls[0]} className={styles.historyVideo} /><div className={styles.historyMeta}><b>Video</b><span>{new Date(item.createdAt).toLocaleString("vi-VN")}</span></div></button>)}</div>
            ) : !resultUrl ? (
              <div className={styles.emptyTip}>Chưa có video kết quả. Hãy nhập prompt và bấm Tạo video.</div>
            ) : (
              <div className={styles.imageGridSingle}><article className={`${styles.imageCard} ${styles.full}`}><video src={resultUrl} controls className={styles.videoResult} /></article></div>
            )}
          </div>
        </section>
      </main>

      {lightboxUrl ? (
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <button className={styles.lightboxClose} onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}>✕</button>
          <video src={lightboxUrl} controls autoPlay className={styles.lightboxMedia} onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}



