"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreateTaskInput, VideoMode, VideoResolution } from "@/lib/ai/types";
import { apiFetch, apiPath } from "@/lib/api-url";
import styles from "../generate.module.css";

type TaskResponse = { data?: { taskId?: string }; error?: string; creditCost?: number; remainingCredits?: number };
type ProfileResponse = { userId: string; credits: number; previewCosts: { video480p: number; video720p: number } };
type HistoryItem = { id: string; mediaType: "image" | "video"; urls: string[]; prompt: string; createdAt: string };
type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type VideoDashboardCache = {
  userId: string;
  userName: string;
  credits: number;
  costPreview: ProfileResponse["previewCosts"] | null;
  history: HistoryItem[];
  packages: CreditPackage[];
};

type ControlDropdown = "aspect" | "duration" | "resolution" | "workflow" | null;

type CardItem = {
  id: string;
  title: string;
  meta: string;
  thumbUrl: string;
  videoUrl: string;
  createdAt: string;
};

const CACHE_KEY = "aistudio_video_dashboard_cache_v1";
const templates = [
  { title: "Short Vertical Reel", ratio: "9:16", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80" },
  { title: "Product Motion", ratio: "16:9", image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=300&q=80" },
  { title: "Landscape Timelapse", ratio: "16:9", image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=300&q=80" },
  { title: "Fashion Clip", ratio: "2:3", image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80" },
  { title: "Concept Teaser", ratio: "4:3", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=300&q=80" },
];
const styleCards = [
  { title: "Cinematic", image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=300&q=80" },
  { title: "Documentary", image: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=300&q=80" },
  { title: "Anime Motion", image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=300&q=80" },
  { title: "3D Trailer", image: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=300&q=80" },
];

const videoAspectOptions = ["auto", "2:3", "16:9", "9:16", "4:3", "3:4", "1:1"];
const durationOptions = [5, 10, 15, 20, 25, 30];
const videoResolutionOptions: VideoResolution[] = ["480p", "720p"];
const videoModeOptions: VideoMode[] = ["normal", "fun", "spicy"];

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

function truncate(value: string, max = 34) {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export default function VideoClient({ initialPrompt }: { initialPrompt: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("User");
  const [credits, setCredits] = useState(0);
  const [costPreview, setCostPreview] = useState<ProfileResponse["previewCosts"] | null>(null);
  const [search, setSearch] = useState("");

  const [prompt, setPrompt] = useState(initialPrompt.trim() || "A cinematic drone shot of a futuristic city at night with neon reflections on wet streets.");
  const [videoModeType, setVideoModeType] = useState<"text" | "image">("text");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("2:3");
  const [mode, setMode] = useState<VideoMode>("normal");
  const [duration, setDuration] = useState(6);
  const [resolution, setResolution] = useState<VideoResolution>("480p");
  const [activeTab, setActiveTab] = useState<"result" | "history">("result");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [openControl, setOpenControl] = useState<ControlDropdown>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  const [taskId, setTaskId] = useState("");
  const [statusText, setStatusText] = useState("Sẵn sàng tạo video.");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const saveCache = useCallback((next: Partial<VideoDashboardCache>) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      const base: VideoDashboardCache = raw ? (JSON.parse(raw) as VideoDashboardCache) : { userId: "", userName: "User", credits: 0, costPreview: null, history: [], packages: [] };
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...base, ...next }));
    } catch {}
  }, []);

  const currentCost = useMemo(() => {
    const rate = (resolution === "720p" ? costPreview?.video720p : costPreview?.video480p) ?? null;
    if (rate === null) return null;
    return Math.round(rate * duration * 10) / 10;
  }, [costPreview, resolution, duration]);

  const canGenerate = prompt.trim().length >= 3 && (videoModeType === "text" || /^https?:\/\//.test(referenceUrl)) && !uploading;

  useEffect(() => {
    router.prefetch("/user");
  }, [router]);

  useEffect(() => {
    if (videoModeType === "image") {
      setShowAdvancedSettings(true);
    }
  }, [videoModeType]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!controlsRef.current) return;
      if (!controlsRef.current.contains(event.target as Node)) {
        setOpenControl(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as VideoDashboardCache;
          if (cached.userId) setUserId(cached.userId);
          if (cached.userName) setUserName(cached.userName);
          if (typeof cached.credits === "number") setCredits(cached.credits);
          if (cached.costPreview) setCostPreview(cached.costPreview);
          if (Array.isArray(cached.history)) setHistory(cached.history.filter((x) => x.mediaType === "video"));
          if (Array.isArray(cached.packages)) setPackages(cached.packages);
        }
      } catch {}
    }

    async function bootstrap() {
      const [profileRes, packageRes] = await Promise.all([
        apiFetch(apiPath("/api/user/profile")),
        apiFetch(apiPath("/api/public/credit-packages")),
      ]);

      if (profileRes.ok) {
        const data = (await profileRes.json()) as ProfileResponse & { user?: { id: string; name: string } | null };
        const resolvedUserId = data.user?.id || data.userId || "demo-user";
        setUserId(resolvedUserId);
        if (data.user?.name) setUserName(data.user.name);
        setCredits(data.credits);
        setCostPreview(data.previewCosts);
        saveCache({ userId: resolvedUserId, userName: data.user?.name || "User", credits: data.credits, costPreview: data.previewCosts });

        const historyRes = await apiFetch(apiPath(`/api/user/history?userId=${encodeURIComponent(resolvedUserId)}`));
        if (historyRes.ok) {
          const historyData = (await historyRes.json()) as { items?: HistoryItem[] };
          const videoItems = (historyData.items || []).filter((x) => x.mediaType === "video");
          setHistory(videoItems);
          saveCache({ history: videoItems });
        }
      }

      if (packageRes.ok) {
        const payload = (await packageRes.json()) as { packages?: CreditPackage[] };
        const nextPackages = payload.packages || [];
        setPackages(nextPackages);
        saveCache({ packages: nextPackages });
      }
    }

    void bootstrap();
  }, [saveCache]);

  const checkTask = useCallback(async (targetTaskId: string) => {
    const res = await apiFetch(apiPath(`/api/ai/task/${targetTaskId}`));
    const payload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return { kind: "failed" as const, message: (typeof payload.error === "string" && payload.error) || "Không đọc được trạng thái task." };
    }
    const data = (payload.data as Record<string, unknown>) || {};
    const state = String(data.state || "unknown");
    setStatusText(`Trạng thái: ${state}`);
    if (isFailedState(state)) {
      return { kind: "failed" as const, message: extractTaskError(payload, data) || "Tạo video thất bại. Vui lòng thử lại." };
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
      const res = await apiFetch(apiPath("/api/ai/upload"), { method: "POST", body: fd });
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
    setActiveTab("result");

    const body: CreateTaskInput = {
      serviceId: videoModeType === "text" ? "grok-text-video" : "grok-image-video",
      prompt,
      aspectRatio: aspectRatio === "auto" ? undefined : aspectRatio,
      videoMode: mode,
      duration: Math.max(1, Math.min(30, duration)),
      videoResolution: resolution,
      inputUrl: videoModeType === "image" ? referenceUrl : undefined,
    };

    const res = await apiFetch(apiPath("/api/ai/create-task"), {
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
      const r = await apiFetch(apiPath("/api/user/history"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ mediaType: "video", urls: [result.video], prompt }),
      });
      if (r.ok) {
        const p = (await r.json()) as { item?: HistoryItem };
        if (p.item) {
          setHistory((prev) => {
            const next = [p.item!, ...prev].slice(0, 24);
            saveCache({ history: next });
            return next;
          });
        }
      }
    } else {
      setStatusText(result.message || "Tạo video thất bại.");
    }
    setLoading(false);
  }

  async function handleLogout() {
    await apiFetch(apiPath("/api/auth/logout"), { method: "POST" });
    window.location.assign("/login");
  }

  const resultCards: CardItem[] = resultUrl ? [{
    id: resultUrl,
    title: truncate(prompt),
    meta: `Grok Imagine · ${aspectRatio} · ${duration}s`,
    thumbUrl: resultUrl,
    videoUrl: resultUrl,
    createdAt: new Date().toISOString(),
  }] : [];

  const historyCards: CardItem[] = history.map((item) => ({
    id: item.id,
    title: truncate(item.prompt || "Tạo video AI"),
    meta: `${new Date(item.createdAt).toLocaleDateString("vi-VN")} · ${item.urls.length} clip`,
    thumbUrl: item.urls[0],
    videoUrl: item.urls[0],
    createdAt: item.createdAt,
  }));

  const displayCards = (activeTab === "result" && (loading || resultCards.length > 0)) ? resultCards : historyCards;
  const filteredCards = displayCards.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(search.toLowerCase()));
  const activityItems = historyCards.slice(0, 4);
  const progressWidth = Math.max(8, Math.min(100, Math.round((credits / Math.max(credits + (currentCost || 0), 1000)) * 100)));
  const activePackage = packages[0];

  return (
    <div className={styles.page}>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <Link href="/" className={styles.logoLink}><span className={styles.logoMark} /><span className={styles.logoText}>VizoAI</span></Link>
          <nav className={styles.navMenu}>
            <Link className={styles.navItem} href="/user"><span className={styles.navIcon}>⌂</span><span className={styles.navText}>Dashboard</span></Link>
            <Link className={styles.navItem} href="/user"><span className={styles.navIcon}>▧</span><span className={styles.navText}>Tạo ảnh</span></Link>
            <a className={`${styles.navItem} ${styles.activeNav}`} href="#generator"><span className={styles.navIcon}>▶</span><span className={styles.navText}>Tạo video</span></a>
            <a className={styles.navItem} href="#templates"><span className={styles.navIcon}>▦</span><span className={styles.navText}>Mẫu có sẵn</span></a>
            <a className={styles.navItem} href="#recent"><span className={styles.navIcon}>↺</span><span className={styles.navText}>Lịch sử</span></a>
            <a className={styles.navItem} href="#styles"><span className={styles.navIcon}>♡</span><span className={styles.navText}>Phong cách</span></a>
            <Link className={styles.navItem} href="/admin"><span className={styles.navIcon}>⚙</span><span className={styles.navText}>Cài đặt</span></Link>
          </nav>
          <div className={styles.sidebarSpacer} />
          <div className={styles.upgradeCard}><h3>Nâng cấp Pro</h3><p>Tăng thời lượng, mở khóa 720p và thêm credits cho các chiến dịch video liên tục.</p><button type="button">Nâng cấp ngay →</button></div>
          <div className={styles.planBox}><div className={styles.planRow}><span>Gói hiện tại</span><strong>{activePackage?.badge || "Free"}</strong></div><div className={styles.planRow}><span>Credits còn lại</span><strong>{formatCredits(credits)}</strong></div></div>
        </aside>

        <main className={styles.main} id="dashboard">
          <header className={styles.topbar}>
            <div className={styles.search}><span>🔍</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm clip, prompt, lịch sử..." /><div className={styles.shortcut}>Ctrl K</div></div>
            <div className={styles.topActions}>
              <div className={styles.creditsPill}>⚡ {formatCredits(credits)} Credits</div>
              <button type="button" className={styles.iconBtn}><span>🔔</span><span className={styles.iconDot} /></button>
              <button type="button" className={styles.iconBtn} onClick={handleLogout}>⎋</button>
              <div className={styles.userCard}><div className={styles.avatar} /><div><strong>{userName}</strong><span>{activePackage?.name || "Free Plan"}</span></div></div>
            </div>
          </header>

          <section className={styles.generator} id="generator">
            <div className={styles.generatorTabs}>
              <Link href="/user" className={`${styles.generatorTab} ${styles.generatorTabLink}`}>✨ AI Image</Link>
              <button type="button" className={`${styles.generatorTab} ${styles.generatorTabActive}`}>🎬 AI Video</button>
            </div>
            <form onSubmit={onGenerate}>
              <div className={styles.promptBox}>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, 20000))} placeholder="Mô tả cảnh quay, nhịp điệu, góc máy, ánh sáng và đối tượng chuyển động..." />
                <div className={styles.promptSide}><button type="button" className={styles.magicBtn}>✦</button><span>{prompt.length} / 20000</span></div>
              </div>

              <div className={styles.controlsCompact} ref={controlsRef}>
                <div className={styles.optionCluster}>
                <div className={styles.settingDropdown}>
                  <button
                    type="button"
                    className={`${styles.settingButton} ${openControl === "aspect" ? styles.settingButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "aspect" ? null : "aspect")}
                  >
                    <div className={styles.controlSelectIcon}>▭</div>
                    <div>
                      <small>Tỷ lệ video</small>
                      <strong>{aspectRatio}</strong>
                    </div>
                  </button>
                  {openControl === "aspect" ? (
                    <div className={styles.settingMenu}>
                      {videoAspectOptions.map((value) => (
                        <button key={value} type="button" className={`${styles.settingMenuItem} ${aspectRatio === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setAspectRatio(value); setOpenControl(null); }}>
                          {value}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className={styles.settingDropdown}>
                  <button
                    type="button"
                    className={`${styles.settingButton} ${openControl === "duration" ? styles.settingButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "duration" ? null : "duration")}
                  >
                    <div className={styles.controlSelectIcon}>⏱</div>
                    <div>
                      <small>Thời lượng</small>
                      <strong>{duration}s</strong>
                    </div>
                  </button>
                  {openControl === "duration" ? (
                    <div className={styles.settingMenu}>
                      {durationOptions.map((value) => (
                        <button key={value} type="button" className={`${styles.settingMenuItem} ${duration === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setDuration(value); setOpenControl(null); }}>
                          {value}s
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className={styles.settingDropdown}>
                  <button
                    type="button"
                    className={`${styles.settingButton} ${openControl === "resolution" ? styles.settingButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "resolution" ? null : "resolution")}
                  >
                    <div className={styles.controlSelectIcon}>▤</div>
                    <div>
                      <small>Độ phân giải</small>
                      <strong>{resolution}</strong>
                    </div>
                  </button>
                  {openControl === "resolution" ? (
                    <div className={styles.settingMenu}>
                      {videoResolutionOptions.map((value) => (
                        <button key={value} type="button" className={`${styles.settingMenuItem} ${resolution === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setResolution(value); setOpenControl(null); }}>
                          {value}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className={styles.settingDropdown}>
                  <button
                    type="button"
                    className={`${styles.settingButton} ${videoModeType === "image" || openControl === "workflow" ? styles.settingButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "workflow" ? null : "workflow")}
                  >
                    <div className={styles.controlSelectIcon}>🖼</div>
                    <div>
                      <small>Workflow</small>
                      <strong>{videoModeType === "text" ? "Text to Video" : "Image to Video"}</strong>
                    </div>
                  </button>
                  {openControl === "workflow" ? (
                    <div className={styles.settingMenu}>
                      <button type="button" className={`${styles.settingMenuItem} ${videoModeType === "text" ? styles.settingMenuItemActive : ""}`} onClick={() => { setVideoModeType("text"); setOpenControl(null); }}>
                        Text to Video
                      </button>
                      <button type="button" className={`${styles.settingMenuItem} ${videoModeType === "image" ? styles.settingMenuItemActive : ""}`} onClick={() => { setVideoModeType("image"); setShowAdvancedSettings(true); setOpenControl(null); }}>
                        Image to Video
                      </button>
                    </div>
                  ) : null}
                </div>

                </div>

                <div className={styles.actionCluster}>
                  <button type="button" className={styles.advancedToggle} onClick={() => setShowAdvancedSettings((prev) => !prev)}>
                  {showAdvancedSettings ? "Hide advanced" : "Advanced settings"}
                </button>
                <button
                  type="button"
                  className={styles.resetBtn}
                  onClick={() => {
                    setPrompt("");
                    setReferenceUrl("");
                    setMode("normal");
                    setAspectRatio("2:3");
                    setDuration(6);
                    setResolution("480p");
                    setVideoModeType("text");
                  }}
                >
                  Reset
                </button>
                <button className={styles.generateBtn} type="submit" disabled={loading || !canGenerate}>{loading ? "Generating..." : `Generate • ${formatCredits(currentCost ?? 0)}`}</button>
                </div>
              </div>

              {showAdvancedSettings ? (
                <div className={styles.advancedPanel}>
                  <div className={styles.fieldBlockHeader}>
                    <h4>Advanced settings</h4>
                    <span className={styles.fieldHint}>Mode, reference image và trạng thái render</span>
                  </div>

                  <div className={styles.advancedPanelGrid}>
                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Model AI</h4><span className={styles.fieldHint}>Grok Imagine</span></div>
                      <select value={videoModeType} onChange={(e) => setVideoModeType(e.target.value as "text" | "image")}>
                        <option value="text">Text to Video</option>
                        <option value="image">Image to Video</option>
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Video mode</h4><span className={styles.fieldHint}>Tính cách chuyển động</span></div>
                      <select value={mode} onChange={(e) => setMode(e.target.value as VideoMode)}>
                        {videoModeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Output</h4><span className={styles.fieldHint}>Duration + quality</span></div>
                      <div className={styles.subtleNote}>{duration}s · {resolution} · {aspectRatio}</div>
                    </div>

                    {videoModeType === "image" ? (
                      <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}>
                        <div className={styles.fieldBlockHeader}><h4>Ảnh tham chiếu</h4><span className={styles.fieldHint}>{uploading ? "Đang upload..." : referenceUrl ? "Đã có URL ảnh" : "Upload hoặc dán URL"}</span></div>
                        <div className={styles.uploadRow}>
                          <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file); }} />
                          <input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://... (URL sau khi upload)" />
                        </div>
                        {referenceUrl ? (
                          <div className={styles.referencePreview}>
                            <img src={referenceUrl} alt="Ảnh tham chiếu video" />
                            <div className={styles.referencePreviewMeta}>Ảnh này sẽ được dùng làm khung gốc cho workflow Image to Video.</div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}>
                      <div className={styles.fieldBlockHeader}><h4>Trạng thái render</h4><span className={styles.fieldHint}>Theo dõi realtime</span></div>
                      <textarea value={statusText} readOnly />
                      <div style={{ marginTop: 10 }} className={styles.subtleNote}>Task ID: {taskId || "chưa tạo"}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={styles.statusBar}><span>{statusText}</span><span>Ước tính: {formatCredits(currentCost ?? 0)} credit</span></div>
            </form>
          </section>

          <section className={styles.statsGrid}>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statPurple}`}>🎬</div><div><small>Video đã tạo</small><h3>{history.length + (resultUrl ? 1 : 0)}</h3></div><div className={styles.statUp}>↑ 14%</div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statBlue}`}>⏱</div><div><small>Thời lượng hiện tại</small><h3>{duration}s</h3></div><div className={styles.statUp}>↑ 6%</div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statOrange}`}>⚡</div><div><small>Credits còn lại</small><h3>{formatCredits(credits)}</h3><div className={styles.progressTrack}><span style={{ width: `${progressWidth}%` }} /></div></div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statGreen}`}>📁</div><div><small>Dự án video</small><h3>{history.length}</h3></div><div className={styles.statUp}>↑ 11%</div></article>
          </section>

          <section className={styles.contentGrid} id="recent">
            <div className={styles.panel}>
              <div className={styles.panelHead}><h2>{activeTab === "result" ? "Kết quả & sản phẩm gần đây" : "Lịch sử render video"}</h2><div className={styles.segmentTabs}><button type="button" className={`${styles.segmentTab} ${activeTab === "result" ? styles.segmentTabActive : ""}`} onClick={() => setActiveTab("result")}>Kết quả</button><button type="button" className={`${styles.segmentTab} ${activeTab === "history" ? styles.segmentTabActive : ""}`} onClick={() => setActiveTab("history")}>Lịch sử</button></div></div>
              {loading ? (
                <div className={styles.loadingBox}><div className={styles.spinner} /><b>Đang render video...</b><p>{statusText}</p></div>
              ) : filteredCards.length === 0 ? (
                <div className={styles.emptyState}>{activeTab === "result" ? "Chưa có video kết quả. Hãy nhập prompt và bấm Generate." : "Chưa có lịch sử video phù hợp với bộ lọc hiện tại."}</div>
              ) : (
                <div className={styles.creationGrid}>
                  {filteredCards.slice(0, 8).map((item) => (
                    <button key={item.id} type="button" className={styles.creationCard} onClick={() => setLightboxUrl(item.videoUrl)}>
                      <div className={`${styles.creationThumb} ${styles.creationThumbContain}`}><span className={styles.creationType}>▶</span><video src={item.videoUrl} muted playsInline /><span className={styles.playBadge}>▶</span></div>
                      <div className={styles.creationMeta}><strong>{item.title}</strong><span>{item.meta}</span></div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHead}><h2>Hoạt động gần đây</h2></div>
              <div className={styles.activityList}>
                {activityItems.length === 0 ? (
                  <div className={styles.emptyState}>Chưa có hoạt động video nào được lưu.</div>
                ) : activityItems.map((item) => (
                  <button key={item.id} type="button" className={styles.activityItem} onClick={() => setLightboxUrl(item.videoUrl)}>
                    <div className={styles.activityImg}><video src={item.videoUrl} muted playsInline /></div>
                    <div><strong>{item.title}</strong><span>{item.meta}</span></div>
                    <time>{new Date(item.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>
                  </button>
                ))}
              </div>
              <button type="button" className={styles.fullBtn} onClick={() => setActiveTab("history")}>Xem toàn bộ hoạt động</button>
            </div>
          </section>

          <section className={styles.bottomGrid}>
            <div className={styles.panel} id="templates"><div className={styles.panelHead}><h2>Mẫu tạo nhanh</h2><button type="button" className={styles.viewBtn}>Xem tất cả</button></div><div className={styles.templates}>{templates.map((item) => <div key={item.title} className={styles.templateCard}><div className={styles.templateImg} style={{ backgroundImage: `url(${item.image})` }} /><div className={styles.templateBody}><strong>{item.title}</strong><span>{item.ratio}</span></div></div>)}<div className={styles.customSize}><div><b>+</b><strong>Custom Size</strong><br /><span>Tự chọn kịch bản</span></div></div></div></div>
            <div className={styles.panel} id="styles"><div className={styles.panelHead}><h2>Phong cách phổ biến</h2><button type="button" className={styles.viewBtn}>Xem tất cả</button></div><div className={styles.stylesGrid}>{styleCards.map((item) => <div key={item.title} className={styles.styleCard} style={{ backgroundImage: `url(${item.image})` }}><strong>{item.title}</strong></div>)}</div></div>
          </section>
        </main>
      </div>

      {lightboxUrl ? (
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <button className={styles.lightboxClose} onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}>✕</button>
          <video src={lightboxUrl} controls autoPlay className={styles.lightboxMedia} onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}




