
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CharacterOrientation, CreateTaskInput, KlingMotionMode, VideoMode, VideoResolution } from "@/lib/ai/types";
import { apiFetch, apiPath } from "@/lib/api-url";
import { TEMPLATE_CATEGORIES, type PromptTemplate, type TemplateCategory } from "@/lib/template-catalog";
import styles from "../generate.module.css";

type VideoModel = "grok-imagine" | "kling-motion-control";
type VideoWorkflow = "text" | "image";
type TaskResponse = { data?: { taskId?: string }; error?: string; creditCost?: number; remainingCredits?: number };
type ProfileResponse = { userId: string; credits: number; previewCosts: { grok480p: number; grok720p: number; kling720p: number; kling1080p: number } };
type HistoryItem = { id: string; mediaType: "image" | "video"; urls: string[]; prompt: string; createdAt: string };
type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type VideoDashboardCache = { userId: string; userName: string; credits: number; costPreview: ProfileResponse["previewCosts"] | null; history: HistoryItem[]; packages: CreditPackage[]; templates: PromptTemplate[] };
type ControlDropdown = "model" | "aspect" | "quality" | "workflow" | null;
type CardItem = { id: string; title: string; meta: string; thumbUrl: string; videoUrl: string; createdAt: string };
const CACHE_KEY = "aistudio_video_dashboard_cache_v2";
const videoAspectOptions = ["auto", "2:3", "16:9", "9:16", "4:3", "3:4", "1:1"];
const durationOptions = [5, 10, 15, 20, 25, 30];
const videoResolutionOptions: VideoResolution[] = ["480p", "720p"];
const videoModeOptions: VideoMode[] = ["normal", "fun", "spicy"];
const klingModeOptions: KlingMotionMode[] = ["720p", "1080p"];
const characterOrientationOptions: CharacterOrientation[] = ["image", "video"];
function formatCredits(value: number) { return Number.isInteger(value) ? value.toLocaleString("vi-VN") : value.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function collectUrls(value: unknown, bucket: string[]) { if (!value) return; if (typeof value === "string") { if (/^https?:\/\//.test(value)) bucket.push(value); return; } if (Array.isArray(value)) return value.forEach((item) => collectUrls(item, bucket)); if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => collectUrls(item, bucket)); }
function extractResultUrls(data: Record<string, unknown>) { const urls: string[] = []; collectUrls(data.resultJson, urls); collectUrls(data.result, urls); collectUrls(data.output, urls); collectUrls(data.videos, urls); collectUrls(data.videoUrls, urls); collectUrls(data.resultUrls, urls); return Array.from(new Set(urls)); }
function isCompletedState(state: string) { return ["success", "completed", "succeeded", "done", "finish", "finished"].includes(state.toLowerCase()); }
function isFailedState(state: string) { return ["fail", "failed", "error", "cancelled", "canceled"].includes(state.toLowerCase()); }
function firstNonEmptyString(values: unknown[]) { for (const item of values) { if (typeof item === "string" && item.trim()) return item.trim(); } return ""; }
function extractTaskError(payload: Record<string, unknown>, data: Record<string, unknown>) { const result = data.result as Record<string, unknown> | undefined; const resultJson = data.resultJson as Record<string, unknown> | undefined; return firstNonEmptyString([payload.error, payload.msg, data.fail_reason, data.failReason, data.error, data.error_message, data.errorMessage, result?.error, result?.message, resultJson?.error, resultJson?.message]); }
function isVideoUrl(url: string) { return /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url); }
function truncate(value: string, max = 38) { const clean = value.trim(); return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`; }
export default function VideoClient({ initialPrompt }: { initialPrompt: string }) {
  const router = useRouter();
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("User");
  const [credits, setCredits] = useState(0);
  const [costPreview, setCostPreview] = useState<ProfileResponse["previewCosts"] | null>(null);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState(initialPrompt.trim() || "A cinematic tracking shot with premium lighting, refined motion, and crisp storytelling.");
  const [videoModel, setVideoModel] = useState<VideoModel>("grok-imagine");
  const [videoModeType, setVideoModeType] = useState<VideoWorkflow>("text");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("2:3");
  const [mode, setMode] = useState<VideoMode>("normal");
  const [duration, setDuration] = useState(6);
  const [resolution, setResolution] = useState<VideoResolution>("480p");
  const [klingMotionMode, setKlingMotionMode] = useState<KlingMotionMode>("720p");
  const [characterOrientation, setCharacterOrientation] = useState<CharacterOrientation>("image");
  const [activeTab, setActiveTab] = useState<"result" | "history">("result");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [openControl, setOpenControl] = useState<ControlDropdown>(null);
  const [templateLibrary, setTemplateLibrary] = useState<PromptTemplate[]>([]);
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>("All");
  const [taskId, setTaskId] = useState("");
  const [statusText, setStatusText] = useState("Sẵn sàng tạo video.");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const saveCache = useCallback((next: Partial<VideoDashboardCache>) => { if (typeof window === "undefined") return; try { const raw = window.sessionStorage.getItem(CACHE_KEY); const base: VideoDashboardCache = raw ? (JSON.parse(raw) as VideoDashboardCache) : { userId: "", userName: "User", credits: 0, costPreview: null, history: [], packages: [], templates: [] }; window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...base, ...next })); } catch {} }, []);
  const currentCost = useMemo(() => { if (!costPreview) return null; if (videoModel === "kling-motion-control") return klingMotionMode === "1080p" ? costPreview.kling1080p : costPreview.kling720p; const rate = resolution === "720p" ? costPreview.grok720p : costPreview.grok480p; return Math.round(rate * duration * 10) / 10; }, [costPreview, videoModel, klingMotionMode, resolution, duration]);
  const canGenerate = useMemo(() => { const hasPrompt = prompt.trim().length >= 3; if (!hasPrompt || uploadingImage || uploadingVideo) return false; if (videoModel === "kling-motion-control") return /^https?:\/\//.test(referenceUrl) && /^https?:\/\//.test(referenceVideoUrl); if (videoModeType === "image") return /^https?:\/\//.test(referenceUrl); return true; }, [prompt, uploadingImage, uploadingVideo, videoModel, referenceUrl, referenceVideoUrl, videoModeType]);
  useEffect(() => { router.prefetch("/user"); }, [router]);
  useEffect(() => { if (videoModel === "kling-motion-control" || videoModeType === "image") setShowAdvancedSettings(true); }, [videoModel, videoModeType]);
  useEffect(() => { function handlePointerDown(event: MouseEvent) { if (!controlsRef.current) return; if (!controlsRef.current.contains(event.target as Node)) setOpenControl(null); } document.addEventListener("mousedown", handlePointerDown); return () => document.removeEventListener("mousedown", handlePointerDown); }, []);
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
          if (Array.isArray(cached.templates)) setTemplateLibrary(cached.templates);
        }
      } catch {}
    }
    async function bootstrap() {
      const [profileRes, packageRes, templateRes] = await Promise.all([
        apiFetch(apiPath("/api/user/profile")),
        apiFetch(apiPath("/api/public/credit-packages")),
        apiFetch(apiPath("/api/public/templates?mediaType=video")),
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
      if (templateRes.ok) {
        const payload = (await templateRes.json()) as { items?: PromptTemplate[] };
        const nextTemplates = payload.items || [];
        setTemplateLibrary(nextTemplates);
        saveCache({ templates: nextTemplates });
      }
    }
    void bootstrap();
  }, [saveCache]);
  const checkTask = useCallback(async (targetTaskId: string) => {
    const res = await apiFetch(apiPath(`/api/ai/task/${targetTaskId}`));
    const payload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { kind: "failed" as const, message: (typeof payload.error === "string" && payload.error) || "Không đọc được trạng thái task." };
    const data = (payload.data as Record<string, unknown>) || {};
    const state = String(data.state || "unknown");
    setStatusText(`Trạng thái: ${state}`);
    if (isFailedState(state)) return { kind: "failed" as const, message: extractTaskError(payload, data) || "Tạo video thất bại. Vui lòng thử lại." };
    if (!isCompletedState(state)) return { kind: "pending" as const };
    let parsedResultJson: unknown = data.resultJson;
    if (typeof parsedResultJson === "string") { try { parsedResultJson = JSON.parse(parsedResultJson); } catch {} }
    const urls = extractResultUrls({ ...data, resultJson: parsedResultJson });
    const video = urls.find((url) => isVideoUrl(url)) || urls[0] || "";
    if (!video) return { kind: "failed" as const, message: extractTaskError(payload, data) || "Task đã hoàn tất nhưng không có video đầu ra." };
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
  async function handleFileUpload(file: File, kind: "image" | "video") {
    if (kind === "image") { setUploadingImage(true); setStatusText("Đang upload ảnh tham chiếu..."); } else { setUploadingVideo(true); setStatusText("Đang upload video motion tham chiếu..."); }
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await apiFetch(apiPath("/api/ai/upload"), { method: "POST", body: fd });
      const payload = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !payload.url) { setStatusText(payload.error || "Upload thất bại."); return; }
      if (kind === "image") { setReferenceUrl(payload.url); setStatusText("Đã upload ảnh tham chiếu."); } else { setReferenceVideoUrl(payload.url); setStatusText("Đã upload video motion tham chiếu."); }
    } finally {
      if (kind === "image") setUploadingImage(false); else setUploadingVideo(false);
    }
  }
  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!canGenerate) return;
    setLoading(true);
    setResultUrl("");
    setStatusText(videoModel === "kling-motion-control" ? "Đang tạo video với Kling Motion Control..." : "Đang tạo video...");
    setActiveTab("result");
    const body: CreateTaskInput = videoModel === "kling-motion-control"
      ? { serviceId: "kling-motion-control", prompt, inputUrl: referenceUrl, referenceVideoUrl, klingMotionMode, characterOrientation }
      : { serviceId: videoModeType === "text" ? "grok-text-video" : "grok-image-video", prompt, aspectRatio: aspectRatio === "auto" ? undefined : aspectRatio, videoMode: mode, duration: Math.max(1, Math.min(30, duration)), videoResolution: resolution, inputUrl: videoModeType === "image" ? referenceUrl : undefined };
    const res = await apiFetch(apiPath("/api/ai/create-task"), { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": userId }, body: JSON.stringify(body) });
    const payload = (await res.json()) as TaskResponse;
    if (!res.ok || !payload.data?.taskId) { setStatusText(payload.error || "Tạo video thất bại."); if (typeof payload.remainingCredits === "number") setCredits(payload.remainingCredits); setLoading(false); return; }
    setTaskId(payload.data.taskId);
    if (typeof payload.remainingCredits === "number") setCredits(payload.remainingCredits);
    const result = await waitForTaskVideo(payload.data.taskId);
    if (result.kind === "success") {
      setResultUrl(result.video);
      setStatusText("Hoàn tất video.");
      const historyPrompt = videoModel === "kling-motion-control" ? `[Kling Motion Control] ${prompt}` : prompt;
      const r = await apiFetch(apiPath("/api/user/history"), { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": userId }, body: JSON.stringify({ mediaType: "video", urls: [result.video], prompt: historyPrompt }) });
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
  async function handleLogout() { await apiFetch(apiPath("/api/auth/logout"), { method: "POST" }); window.location.assign("/login"); }
  const resultCards: CardItem[] = resultUrl ? [{ id: resultUrl, title: truncate(prompt), meta: videoModel === "kling-motion-control" ? `Kling Motion Control · ${klingMotionMode} · ${characterOrientation}` : `Grok Imagine · ${aspectRatio} · ${duration}s`, thumbUrl: resultUrl, videoUrl: resultUrl, createdAt: new Date().toISOString() }] : [];
  const historyCards: CardItem[] = history.map((item) => ({ id: item.id, title: truncate(item.prompt || "Tạo video AI"), meta: `${new Date(item.createdAt).toLocaleDateString("vi-VN")} · ${item.urls.length} clip`, thumbUrl: item.urls[0], videoUrl: item.urls[0], createdAt: item.createdAt }));
  const displayCards = activeTab === "result" && (loading || resultCards.length > 0) ? resultCards : historyCards;
  const filteredCards = displayCards.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(search.toLowerCase()));
  const progressWidth = Math.max(8, Math.min(100, Math.round((credits / Math.max(credits + (currentCost || 0), 1000)) * 100)));
  const filteredTemplates = useMemo(() => { if (templateCategory === "All") return templateLibrary; return templateLibrary.filter((item) => item.category === templateCategory || item.tags.includes(templateCategory)); }, [templateCategory, templateLibrary]);
  const applyTemplate = useCallback((item: PromptTemplate) => { setPrompt(item.prompt); if (videoAspectOptions.includes(item.aspectRatio)) setAspectRatio(item.aspectRatio); setVideoModel(item.mediaType === "video" && item.model.toLowerCase().includes("kling") ? "kling-motion-control" : "grok-imagine"); setVideoModeType("text"); setActiveTab("result"); document.getElementById("generator")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);
  const activePackage = packages[0];
  const modelLabel = videoModel === "kling-motion-control" ? "Kling 2.6" : "Grok Imagine";
  const qualityLabel = videoModel === "kling-motion-control" ? klingMotionMode : resolution;
  const workflowLabel = videoModel === "kling-motion-control" ? "Motion Control" : (videoModeType === "text" ? "Text to Video" : "Image to Video");
  const secondaryLabel = videoModel === "kling-motion-control" ? characterOrientation : aspectRatio;
  return (
    <div className={styles.page}>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <Link href="/" className={styles.logoLink}><span className={styles.logoMark} /><span className={styles.logoText}>VizoAI</span></Link>
          <nav className={styles.navMenu}>
            <Link className={styles.navItem} href="/user"><span className={styles.navIcon}>⌂</span><span className={styles.navText}>Dashboard</span></Link>
            <Link className={styles.navItem} href="/user"><span className={styles.navIcon}>▧</span><span className={styles.navText}>Tạo ảnh</span></Link>
            <a className={`${styles.navItem} ${styles.activeNav}`} href="#generator"><span className={styles.navIcon}>▶</span><span className={styles.navText}>Tạo video</span></a>
            <Link className={styles.navItem} href="/user/templates"><span className={styles.navIcon}>▦</span><span className={styles.navText}>Mẫu có sẵn</span></Link>
            <Link className={styles.navItem} href="/user/history"><span className={styles.navIcon}>↺</span><span className={styles.navText}>Lịch sử</span></Link>
            <a className={styles.navItem} href="#styles"><span className={styles.navIcon}>♡</span><span className={styles.navText}>Phong cách</span></a>
            <Link className={styles.navItem} href="/admin"><span className={styles.navIcon}>⚙</span><span className={styles.navText}>Cài đặt</span></Link>
          </nav>
          <div className={styles.sidebarSpacer} />
          <div className={styles.upgradeCard}><h3>Nâng cấp Pro</h3><p>Mở khóa pipeline video nâng cao, motion control và thêm credits cho các chiến dịch dựng clip liên tục.</p><button type="button">Nâng cấp ngay →</button></div>
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
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Mô tả cảnh quay, nhân vật, nhịp điệu chuyển động, ánh sáng, camera và mood của video..." />
                <div className={styles.promptSide}><button type="button" className={styles.magicBtn}>✦</button><span>{prompt.length}</span></div>
              </div>
              <div className={styles.controlsCompact} ref={controlsRef}>
                <div className={styles.optionCluster}>
                  <div className={styles.settingDropdown}><button type="button" className={`${styles.settingButton} ${openControl === "model" ? styles.settingButtonActive : ""}`} onClick={() => setOpenControl((prev) => prev === "model" ? null : "model")}><div className={styles.controlSelectIcon}>▤</div><div><small>Model</small><strong>{modelLabel}</strong></div></button>{openControl === "model" ? <div className={styles.settingMenu}><button type="button" className={`${styles.settingMenuItem} ${videoModel === "grok-imagine" ? styles.settingMenuItemActive : ""}`} onClick={() => { setVideoModel("grok-imagine"); setOpenControl(null); }}>Grok Imagine</button><button type="button" className={`${styles.settingMenuItem} ${videoModel === "kling-motion-control" ? styles.settingMenuItemActive : ""}`} onClick={() => { setVideoModel("kling-motion-control"); setShowAdvancedSettings(true); setOpenControl(null); }}>Kling 2.6 Motion Control</button></div> : null}</div>
                  <div className={styles.settingDropdown}><button type="button" className={`${styles.settingButton} ${openControl === "aspect" ? styles.settingButtonActive : ""}`} onClick={() => setOpenControl((prev) => prev === "aspect" ? null : "aspect")}><div className={styles.controlSelectIcon}>▭</div><div><small>{videoModel === "kling-motion-control" ? "Character" : "Tỷ lệ video"}</small><strong>{secondaryLabel}</strong></div></button>{openControl === "aspect" ? <div className={styles.settingMenu}>{videoModel === "kling-motion-control" ? characterOrientationOptions.map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${characterOrientation === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setCharacterOrientation(value); setOpenControl(null); }}>{value}</button>) : videoAspectOptions.map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${aspectRatio === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setAspectRatio(value); setOpenControl(null); }}>{value}</button>)}</div> : null}</div>
                  <div className={styles.settingDropdown}><button type="button" className={`${styles.settingButton} ${openControl === "quality" ? styles.settingButtonActive : ""}`} onClick={() => setOpenControl((prev) => prev === "quality" ? null : "quality")}><div className={styles.controlSelectIcon}>⏱</div><div><small>{videoModel === "kling-motion-control" ? "Output mode" : "Độ phân giải"}</small><strong>{qualityLabel}</strong></div></button>{openControl === "quality" ? <div className={styles.settingMenu}>{videoModel === "kling-motion-control" ? klingModeOptions.map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${klingMotionMode === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setKlingMotionMode(value); setOpenControl(null); }}>{value}</button>) : videoResolutionOptions.map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${resolution === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setResolution(value); setOpenControl(null); }}>{value}</button>)}</div> : null}</div>
                  <div className={styles.settingDropdown}><button type="button" className={`${styles.settingButton} ${openControl === "workflow" ? styles.settingButtonActive : ""}`} onClick={() => setOpenControl((prev) => prev === "workflow" ? null : "workflow")}><div className={styles.controlSelectIcon}>🖼</div><div><small>{videoModel === "kling-motion-control" ? "Workflow" : "Chế độ tạo"}</small><strong>{workflowLabel}</strong></div></button>{openControl === "workflow" ? <div className={styles.settingMenu}>{videoModel === "kling-motion-control" ? <button type="button" className={`${styles.settingMenuItem} ${styles.settingMenuItemActive}`} onClick={() => setOpenControl(null)}>Motion Control</button> : <><button type="button" className={`${styles.settingMenuItem} ${videoModeType === "text" ? styles.settingMenuItemActive : ""}`} onClick={() => { setVideoModeType("text"); setOpenControl(null); }}>Text to Video</button><button type="button" className={`${styles.settingMenuItem} ${videoModeType === "image" ? styles.settingMenuItemActive : ""}`} onClick={() => { setVideoModeType("image"); setShowAdvancedSettings(true); setOpenControl(null); }}>Image to Video</button></>}</div> : null}</div>
                </div>
                <div className={styles.actionCluster}>
                  <button type="button" className={styles.advancedToggle} onClick={() => setShowAdvancedSettings((prev) => !prev)}>{showAdvancedSettings ? "Hide advanced" : "Advanced settings"}</button>
                  <button type="button" className={styles.resetBtn} onClick={() => { setPrompt(""); setReferenceUrl(""); setReferenceVideoUrl(""); setMode("normal"); setAspectRatio("2:3"); setDuration(6); setResolution("480p"); setVideoModeType("text"); setVideoModel("grok-imagine"); setKlingMotionMode("720p"); setCharacterOrientation("image"); }}>Reset</button>
                  <button className={styles.generateBtn} type="submit" disabled={loading || !canGenerate}>{loading ? "Generating..." : `Generate • ${formatCredits(currentCost ?? 0)}`}</button>
                </div>
              </div>
              {showAdvancedSettings ? (
                <div className={styles.advancedPanel}>
                  <div className={styles.fieldBlockHeader}><h4>Advanced settings</h4><span className={styles.fieldHint}>Workflow, motion setup, reference assets, và trạng thái render</span></div>
                  <div className={styles.advancedPanelGrid}>
                    <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Model AI</h4><span className={styles.fieldHint}>Pipeline đang dùng</span></div><select value={videoModel} onChange={(e) => setVideoModel(e.target.value as VideoModel)}><option value="grok-imagine">Grok Imagine</option><option value="kling-motion-control">Kling 2.6 Motion Control</option></select></div>
                    {videoModel === "grok-imagine" ? (
                      <>
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Video mode</h4><span className={styles.fieldHint}>Tính cách chuyển động</span></div><select value={mode} onChange={(e) => setMode(e.target.value as VideoMode)}>{videoModeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Thời lượng</h4><span className={styles.fieldHint}>Tối đa 30 giây</span></div><select value={String(duration)} onChange={(e) => setDuration(Number(e.target.value))}>{durationOptions.map((value) => <option key={value} value={value}>{value}s</option>)}</select></div>
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Output</h4><span className={styles.fieldHint}>Duration + quality</span></div><div className={styles.subtleNote}>{duration}s · {resolution} · {aspectRatio} · {videoModeType === "text" ? "Text to Video" : "Image to Video"}</div></div>
                        {videoModeType === "image" ? <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}><div className={styles.fieldBlockHeader}><h4>Ảnh tham chiếu</h4><span className={styles.fieldHint}>{uploadingImage ? "Đang upload..." : referenceUrl ? "Đã có URL ảnh" : "Upload hoặc dán URL"}</span></div><div className={styles.uploadRow}><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file, "image"); }} /><input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://... (URL sau khi upload)" /></div>{referenceUrl ? <div className={styles.referencePreview}><img src={referenceUrl} alt="Ảnh tham chiếu video" /><div className={styles.referencePreviewMeta}>Ảnh này sẽ được dùng làm khung gốc cho workflow Image to Video.</div></div> : null}</div> : null}
                      </>
                    ) : (
                      <>
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Character orientation</h4><span className={styles.fieldHint}>Hướng điều khiển nhân vật</span></div><select value={characterOrientation} onChange={(e) => setCharacterOrientation(e.target.value as CharacterOrientation)}><option value="image">image</option><option value="video">video</option></select></div>
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Output mode</h4><span className={styles.fieldHint}>Theo tài liệu KIE</span></div><select value={klingMotionMode} onChange={(e) => setKlingMotionMode(e.target.value as KlingMotionMode)}><option value="720p">720p</option><option value="1080p">1080p</option></select></div>
                        <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}><div className={styles.fieldBlockHeader}><h4>Ảnh tham chiếu chính</h4><span className={styles.fieldHint}>{uploadingImage ? "Đang upload..." : referenceUrl ? "Đã sẵn sàng" : "Bắt buộc"}</span></div><div className={styles.uploadRow}><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file, "image"); }} /><input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://... ảnh tham chiếu" /></div>{referenceUrl ? <div className={styles.referencePreview}><img src={referenceUrl} alt="Ảnh tham chiếu Kling" /><div className={styles.referencePreviewMeta}>Ảnh này sẽ làm key visual chính cho Kling Motion Control.</div></div> : null}</div>
                        <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}><div className={styles.fieldBlockHeader}><h4>Video motion tham chiếu</h4><span className={styles.fieldHint}>{uploadingVideo ? "Đang upload..." : referenceVideoUrl ? "Đã sẵn sàng" : "Bắt buộc"}</span></div><div className={styles.uploadRow}><input type="file" accept="video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file, "video"); }} /><input value={referenceVideoUrl} onChange={(e) => setReferenceVideoUrl(e.target.value)} placeholder="https://... video motion reference" /></div>{referenceVideoUrl ? <div className={styles.referencePreview}><video src={referenceVideoUrl} controls muted playsInline /><div className={styles.referencePreviewMeta}>Video này cung cấp chuyển động để Kling áp vào ảnh tham chiếu.</div></div> : null}</div>
                      </>
                    )}
                    <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}><div className={styles.fieldBlockHeader}><h4>Trạng thái render</h4><span className={styles.fieldHint}>Theo dõi realtime</span></div><textarea value={statusText} readOnly /><div style={{ marginTop: 10 }} className={styles.subtleNote}>Task ID: {taskId || "chưa tạo"}</div></div>
                  </div>
                </div>
              ) : null}
              <div className={styles.statusBar}><span>{statusText}</span><span>Ước tính: {formatCredits(currentCost ?? 0)} credit</span></div>
            </form>
          </section>
          <section className={styles.statsGrid}>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statPurple}`}>🎬</div><div><small>Video đã tạo</small><h3>{history.length + (resultUrl ? 1 : 0)}</h3></div><div className={styles.statUp}>↑ 14%</div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statBlue}`}>🧠</div><div><small>Model đang dùng</small><h3>{videoModel === "kling-motion-control" ? "Kling" : "Grok"}</h3></div><div className={styles.statUp}>↑ 6%</div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statOrange}`}>⚡</div><div><small>Credits còn lại</small><h3>{formatCredits(credits)}</h3><div className={styles.progressTrack}><span style={{ width: `${progressWidth}%` }} /></div></div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statGreen}`}>📁</div><div><small>Workflow</small><h3>{workflowLabel}</h3></div><div className={styles.statUp}>↑ 11%</div></article>
          </section>
          <section className={styles.contentGrid} id="recent">
            <div className={styles.panel}>
              <div className={styles.panelHead}><h2>{activeTab === "result" ? "Kết quả & sản phẩm gần đây" : "Lịch sử render video"}</h2><div className={styles.segmentTabs}><button type="button" className={`${styles.segmentTab} ${activeTab === "result" ? styles.segmentTabActive : ""}`} onClick={() => setActiveTab("result")}>Kết quả</button><button type="button" className={`${styles.segmentTab} ${activeTab === "history" ? styles.segmentTabActive : ""}`} onClick={() => setActiveTab("history")}>Lịch sử</button></div></div>
              {loading ? <div className={styles.loadingBox}><div className={styles.spinner} /><b>Đang render video...</b><p>{statusText}</p></div> : filteredCards.length === 0 ? <div className={styles.emptyState}>{activeTab === "result" ? "Chưa có video kết quả. Hãy nhập prompt và bấm Generate." : "Chưa có lịch sử video phù hợp với bộ lọc hiện tại."}</div> : <div className={styles.creationGrid}>{filteredCards.slice(0, 8).map((item) => <button key={item.id} type="button" className={styles.creationCard} onClick={() => setLightboxUrl(item.videoUrl)}><div className={styles.creationThumb}><span className={styles.creationType}>▶</span><video src={item.videoUrl} muted playsInline /><span className={styles.playBadge}>▶</span></div><div className={styles.creationMeta}><strong>{item.title}</strong><span>{item.meta}</span></div></button>)}</div>}
            </div>
          </section>
          <section className={styles.quickPromptSection} id="styles">
            <div className={styles.quickPromptPanel}>
              <div className={styles.quickPromptHeader}><div><h3>Mẫu video nhanh</h3><p>Chọn prompt mẫu và áp vào form video ngay.</p></div><button type="button" className={styles.quickPromptCta} onClick={() => router.push("/user/templates")}>Xem tất cả</button></div>
              <div className={styles.quickPromptBody}>
                <aside className={styles.quickPromptSidebar}><span>TAGS</span><div className={styles.quickPromptTags}>{TEMPLATE_CATEGORIES.map((category) => <button key={category} type="button" className={`${styles.quickPromptTag} ${templateCategory === category ? styles.quickPromptTagActive : ""}`} onClick={() => setTemplateCategory(category)}>{category}</button>)}</div></aside>
                <div className={styles.quickPromptGrid}>{filteredTemplates.slice(0, 6).map((item) => <article key={item.id} className={styles.quickPromptCard}><div className={styles.quickPromptThumb} style={{ backgroundImage: `url(${item.thumbnailUrl})` }} /><div className={styles.quickPromptCopy}><strong>{item.title}</strong><span>{item.aspectRatio} · {item.model}</span><p>{item.prompt}</p><button type="button" className={styles.quickPromptUseBtn} onClick={() => applyTemplate(item)}>Dùng prompt</button></div></article>)}</div>
              </div>
            </div>
          </section>
        </main>
      </div>
      {lightboxUrl ? <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}><button className={styles.lightboxClose} onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}>✕</button><video src={lightboxUrl} controls autoPlay className={styles.lightboxMedia} onClick={(e) => e.stopPropagation()} /></div> : null}
    </div>
  );
}
