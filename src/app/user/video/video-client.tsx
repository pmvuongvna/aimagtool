
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  Clapperboard,
  Coins,
  Image as ImageIcon,
  LogOut,
  MonitorUp,
  Ratio,
  Search,
  Sparkles,
  Timer,
  Video,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { CharacterOrientation, CreateTaskInput, KlingMotionMode, SeedanceVideoResolution, VideoMode, VideoResolution } from "@/lib/ai/types";
import { apiFetch, apiPath } from "@/lib/api-url";
import { StudioNavigation } from "@/components/studio-navigation";
import styles from "../generate.module.css";

type AiVideoModel = "grok-imagine" | "seedance-2";
type VideoModel = AiVideoModel | "kling-motion-control";
type VideoVariant = "grok" | "kling";
type VideoWorkflow = "text" | "image";
type AiVideoModelDefinition = {
  id: AiVideoModel;
  label: string;
  description: string;
  accent: "teal" | "violet";
  icon: LucideIcon;
  badge?: string;
  maxDuration: number;
  defaultResolution: SeedanceVideoResolution;
  resolutions: readonly SeedanceVideoResolution[];
  serviceIds: Record<VideoWorkflow, CreateTaskInput["serviceId"]>;
  supportsVideoMode: boolean;
  nsfwChecker?: boolean;
};
type TaskResponse = { data?: { taskId?: string }; error?: string; creditCost?: number; remainingCredits?: number };
type ProfileResponse = { userId: string; credits: number; previewCosts: { grok480p: number; grok720p: number; seedance480p: number; seedance720p: number; seedance1080p: number; seedance4k: number; kling720p: number; kling1080p: number } };
type HistoryItem = { id: string; mediaType: "image" | "video"; urls: string[]; prompt: string; createdAt: string };
type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type VideoDashboardCache = { userId: string; userName: string; credits: number; costPreview: ProfileResponse["previewCosts"] | null; history: HistoryItem[]; packages: CreditPackage[] };
type ControlDropdown = "model" | "aspect" | "quality" | "workflow" | "duration" | null;
type CardItem = { id: string; title: string; meta: string; thumbUrl: string; videoUrl: string; createdAt: string };
const CACHE_KEY = "aistudio_video_dashboard_cache_v3";
const videoAspectOptions = ["auto", "2:3", "16:9", "9:16", "4:3", "3:4", "1:1"];
const durationOptions = [5, 6, 10, 15, 20, 25, 30];
const videoResolutionOptions: VideoResolution[] = ["480p", "720p"];
const seedanceResolutionOptions: SeedanceVideoResolution[] = ["480p", "720p", "1080p", "4k"];
const videoModeOptions: VideoMode[] = ["normal", "fun", "spicy"];
const klingModeOptions: KlingMotionMode[] = ["720p", "1080p"];
const characterOrientationOptions: CharacterOrientation[] = ["image", "video"];
const AI_VIDEO_MODELS: readonly AiVideoModelDefinition[] = [
  {
    id: "grok-imagine",
    label: "Grok Imagine",
    description: "Fast cinematic video for everyday creation.",
    accent: "teal",
    icon: Sparkles,
    maxDuration: 30,
    defaultResolution: "480p",
    resolutions: videoResolutionOptions,
    serviceIds: { text: "grok-text-video", image: "grok-image-video" },
    supportsVideoMode: true,
  },
  {
    id: "seedance-2",
    label: "Seedance 2",
    description: "High-detail motion with output up to 4K.",
    accent: "violet",
    icon: Clapperboard,
    badge: "NEW",
    maxDuration: 15,
    defaultResolution: "1080p",
    resolutions: seedanceResolutionOptions,
    serviceIds: { text: "seedance-2-text-video", image: "seedance-2-image-video" },
    supportsVideoMode: false,
    nsfwChecker: true,
  },
];
const AI_VIDEO_MODEL_MAP = Object.fromEntries(AI_VIDEO_MODELS.map((model) => [model.id, model])) as Record<AiVideoModel, AiVideoModelDefinition>;
function isAiVideoModel(model: VideoModel): model is AiVideoModel { return model !== "kling-motion-control"; }
function formatCredits(value: number) { return Number.isInteger(value) ? value.toLocaleString("vi-VN") : value.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function collectUrls(value: unknown, bucket: string[]) { if (!value) return; if (typeof value === "string") { if (/^https?:\/\//.test(value)) bucket.push(value); return; } if (Array.isArray(value)) return value.forEach((item) => collectUrls(item, bucket)); if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => collectUrls(item, bucket)); }
function extractResultUrls(data: Record<string, unknown>) { const urls: string[] = []; collectUrls(data.resultJson, urls); collectUrls(data.result, urls); collectUrls(data.output, urls); collectUrls(data.videos, urls); collectUrls(data.videoUrls, urls); collectUrls(data.resultUrls, urls); return Array.from(new Set(urls)); }
function isCompletedState(state: string) { return ["success", "completed", "succeeded", "done", "finish", "finished"].includes(state.toLowerCase()); }
function isFailedState(state: string) { return ["fail", "failed", "error", "cancelled", "canceled"].includes(state.toLowerCase()); }
function firstNonEmptyString(values: unknown[]) { for (const item of values) { if (typeof item === "string" && item.trim()) return item.trim(); } return ""; }
function extractTaskError(payload: Record<string, unknown>, data: Record<string, unknown>) { const result = data.result as Record<string, unknown> | undefined; const resultJson = data.resultJson as Record<string, unknown> | undefined; return firstNonEmptyString([payload.error, payload.msg, data.fail_reason, data.failReason, data.error, data.error_message, data.errorMessage, result?.error, result?.message, resultJson?.error, resultJson?.message]); }
function isVideoUrl(url: string) { return /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url); }
function truncate(value: string, max = 38) { const clean = value.trim(); return clean.length <= max ? clean : `${clean.slice(0, max - 1)}...`; }
export default function VideoClient({ initialPrompt, variant = "grok" }: { initialPrompt: string; variant?: VideoVariant }) {
  const router = useRouter();
  const controlsRef = useRef<HTMLFormElement | null>(null);
  const isKlingPage = variant === "kling";
  const pageTitle = isKlingPage ? "Kling Motion" : "AI Video";
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("User");
  const [credits, setCredits] = useState(0);
  const [costPreview, setCostPreview] = useState<ProfileResponse["previewCosts"] | null>(null);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState(initialPrompt.trim() || (variant === "kling" ? "Elegant fashion portrait, natural human motion, refined body movement, cinematic realism." : "A cinematic tracking shot with premium lighting, refined motion, and crisp storytelling."));
  const [videoModel, setVideoModel] = useState<VideoModel>(variant === "kling" ? "kling-motion-control" : "grok-imagine");
  const [videoModeType, setVideoModeType] = useState<VideoWorkflow>("text");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("2:3");
  const [mode, setMode] = useState<VideoMode>("normal");
  const [duration, setDuration] = useState(6);
  const [resolution, setResolution] = useState<SeedanceVideoResolution>("480p");
  const [klingMotionMode, setKlingMotionMode] = useState<KlingMotionMode>("720p");
  const [characterOrientation, setCharacterOrientation] = useState<CharacterOrientation>("image");
  const [activeTab, setActiveTab] = useState<"result" | "history">("result");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(variant === "kling");
  const [openControl, setOpenControl] = useState<ControlDropdown>(null);
  const [taskId, setTaskId] = useState("");
  const [statusText, setStatusText] = useState(isKlingPage ? "Ready for Kling Motion generation." : "Ready for video generation.");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const saveCache = useCallback((next: Partial<VideoDashboardCache>) => { if (typeof window === "undefined") return; try { const raw = window.sessionStorage.getItem(CACHE_KEY); const base: VideoDashboardCache = raw ? (JSON.parse(raw) as VideoDashboardCache) : { userId: "", userName: "User", credits: 0, costPreview: null, history: [], packages: [] }; window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...base, ...next })); } catch {} }, []);
  const activeAiModel = isAiVideoModel(videoModel) ? AI_VIDEO_MODEL_MAP[videoModel] : null;
  const selectAiVideoModel = useCallback((nextModel: AiVideoModel) => {
    const definition = AI_VIDEO_MODEL_MAP[nextModel];
    setVideoModel(nextModel);
    setDuration((current) => Math.min(current, definition.maxDuration));
    setResolution((current) => definition.resolutions.includes(current) ? current : definition.defaultResolution);
    setOpenControl(null);
  }, []);
  const currentCost = useMemo(() => { if (!costPreview) return null; if (videoModel === "kling-motion-control") return klingMotionMode === "1080p" ? costPreview.kling1080p : costPreview.kling720p; if (videoModel === "seedance-2") { if (resolution === "4k") return costPreview.seedance4k ?? 300; if (resolution === "1080p") return costPreview.seedance1080p ?? 160; if (resolution === "720p") return costPreview.seedance720p ?? 100; return costPreview.seedance480p ?? 60; } const grokResolution: VideoResolution = resolution === "720p" ? "720p" : "480p"; const rate = grokResolution === "720p" ? costPreview.grok720p : costPreview.grok480p; return Math.round(rate * duration * 10) / 10; }, [costPreview, videoModel, klingMotionMode, resolution, duration]);
  const canGenerate = useMemo(() => { const hasPrompt = prompt.trim().length >= 3; if (!hasPrompt || uploadingImage || uploadingVideo) return false; if (videoModel === "kling-motion-control") return /^https?:\/\//.test(referenceUrl) && /^https?:\/\//.test(referenceVideoUrl); if (videoModeType === "image") return /^https?:\/\//.test(referenceUrl); return true; }, [prompt, uploadingImage, uploadingVideo, videoModel, referenceUrl, referenceVideoUrl, videoModeType]);
  useEffect(() => { router.prefetch("/user"); router.prefetch("/user/video"); router.prefetch("/user/kling"); }, [router]);
  useEffect(() => { function handlePointerDown(event: MouseEvent) { if (!controlsRef.current) return; if (!controlsRef.current.contains(event.target as Node)) setOpenControl(null); } document.addEventListener("mousedown", handlePointerDown); return () => document.removeEventListener("mousedown", handlePointerDown); }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      queueMicrotask(() => {
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
      });
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
    if (!res.ok) return { kind: "failed" as const, message: (typeof payload.error === "string" && payload.error) || "Unable to read task status." };
    const data = (payload.data as Record<string, unknown>) || {};
    const state = String(data.state || "unknown");
    setStatusText(`Status: ${state}`);
    if (isFailedState(state)) return { kind: "failed" as const, message: extractTaskError(payload, data) || "Video generation failed. Please try again." };
    if (!isCompletedState(state)) return { kind: "pending" as const };
    let parsedResultJson: unknown = data.resultJson;
    if (typeof parsedResultJson === "string") { try { parsedResultJson = JSON.parse(parsedResultJson); } catch {} }
    const urls = extractResultUrls({ ...data, resultJson: parsedResultJson });
    const video = urls.find((url) => isVideoUrl(url)) || urls[0] || "";
    if (!video) return { kind: "failed" as const, message: extractTaskError(payload, data) || "Task completed but no output video was returned." };
    return { kind: "success" as const, video };
  }, []);
  async function waitForTaskVideo(targetTaskId: string) {
    for (let i = 0; i < 60; i += 1) {
      const result = await checkTask(targetTaskId);
      if (result.kind === "success") return result;
      if (result.kind === "failed") return result;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return { kind: "failed" as const, message: "Timed out while waiting for video render. Please check the task again." };
  }
  async function handleFileUpload(file: File, kind: "image" | "video") {
    if (kind === "image") { setUploadingImage(true); setStatusText("Uploading reference image..."); } else { setUploadingVideo(true); setStatusText("Uploading motion reference video..."); }
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await apiFetch(apiPath("/api/ai/upload"), { method: "POST", body: fd });
      const payload = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !payload.url) { setStatusText(payload.error || "Upload failed."); return; }
      if (kind === "image") { setReferenceUrl(payload.url); setStatusText("Reference image uploaded."); } else { setReferenceVideoUrl(payload.url); setStatusText("Motion reference video uploaded."); }
    } finally {
      if (kind === "image") setUploadingImage(false); else setUploadingVideo(false);
    }
  }
  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!canGenerate) return;
    setLoading(true);
    setResultUrl("");
    setStatusText(videoModel === "kling-motion-control" ? "Generating with Kling Motion Control..." : videoModel === "seedance-2" ? "Generating with Seedance 2..." : "Generating video...");
    setActiveTab("result");
    const body: CreateTaskInput = videoModel === "kling-motion-control"
      ? { serviceId: "kling-motion-control", prompt, inputUrl: referenceUrl, referenceVideoUrl, klingMotionMode, characterOrientation }
      : {
          serviceId: AI_VIDEO_MODEL_MAP[videoModel].serviceIds[videoModeType],
          prompt,
          aspectRatio: aspectRatio === "auto" ? undefined : aspectRatio,
          videoMode: AI_VIDEO_MODEL_MAP[videoModel].supportsVideoMode ? mode : undefined,
          duration: Math.max(1, Math.min(AI_VIDEO_MODEL_MAP[videoModel].maxDuration, duration)),
          videoResolution: resolution,
          inputUrl: videoModeType === "image" ? referenceUrl : undefined,
          nsfwChecker: AI_VIDEO_MODEL_MAP[videoModel].nsfwChecker,
        };
    const res = await apiFetch(apiPath("/api/ai/create-task"), { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": userId }, body: JSON.stringify(body) });
    const payload = (await res.json()) as TaskResponse;
    if (!res.ok || !payload.data?.taskId) { setStatusText(payload.error || "Video generation failed."); if (typeof payload.remainingCredits === "number") setCredits(payload.remainingCredits); setLoading(false); return; }
    setTaskId(payload.data.taskId);
    if (typeof payload.remainingCredits === "number") setCredits(payload.remainingCredits);
    const result = await waitForTaskVideo(payload.data.taskId);
    if (result.kind === "success") {
      setResultUrl(result.video);
      setStatusText("Video completed.");
      const historyPrompt = videoModel === "kling-motion-control" ? `[Kling Motion Control] ${prompt}` : videoModel === "seedance-2" ? `[Seedance 2] ${prompt}` : prompt;
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
      setStatusText(result.message || "Video generation failed.");
    }
    setLoading(false);
  }
  async function handleLogout() { await apiFetch(apiPath("/api/auth/logout"), { method: "POST" }); window.location.assign("/login"); }
  const resultCards: CardItem[] = resultUrl ? [{ id: resultUrl, title: truncate(prompt), meta: videoModel === "kling-motion-control" ? `Kling Motion Control - ${klingMotionMode} - ${characterOrientation}` : videoModel === "seedance-2" ? `Seedance 2 - ${resolution} - ${duration}s` : `Grok Imagine - ${aspectRatio} - ${duration}s`, thumbUrl: resultUrl, videoUrl: resultUrl, createdAt: new Date().toISOString() }] : [];
  const historyCards: CardItem[] = history.map((item) => ({ id: item.id, title: truncate(item.prompt || "AI Video"), meta: `${new Date(item.createdAt).toLocaleDateString("vi-VN")} - ${item.urls.length} clip`, thumbUrl: item.urls[0], videoUrl: item.urls[0], createdAt: item.createdAt }));
  const displayCards = activeTab === "result" && (loading || resultCards.length > 0) ? resultCards : historyCards;
  const filteredCards = displayCards.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(search.toLowerCase()));
  const filteredHistoryCards = historyCards.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(search.toLowerCase()));
  const activePackage = packages[0];
  const modelLabel = videoModel === "kling-motion-control" ? "Kling 2.6" : AI_VIDEO_MODEL_MAP[videoModel].label;
  const qualityLabel = videoModel === "kling-motion-control" ? klingMotionMode : resolution;
  const workflowLabel = videoModel === "kling-motion-control" ? "Motion Control" : (videoModeType === "text" ? "Text to Video" : "Image to Video");
  const secondaryLabel = videoModel === "kling-motion-control" ? characterOrientation : aspectRatio;
  const ActiveModelIcon = activeAiModel?.icon ?? WandSparkles;
  return (
    <div className={`${styles.page} ${styles.videoPage}`}>
      <div className={`${styles.appShell} ${styles.videoAppShell}`}>
        <aside className={`${styles.sidebar} ${styles.videoSidebar}`}>
          <Link href="/" className={styles.logoLink}><span className={styles.logoMark} /><span className={styles.logoText}>VizoAI</span></Link>
          <StudioNavigation active={isKlingPage ? "kling" : "video"} />
          <div className={styles.sidebarSpacer} />
          <div className={styles.upgradeCard}><h3>Upgrade Pro</h3><p>Unlock advanced video pipelines, motion control, and extra credits for continuous video campaigns.</p><button type="button">Upgrade now {"->"}</button></div>
          <div className={styles.planBox}><div className={styles.planRow}><span>Current plan</span><strong>{activePackage?.badge || "Free"}</strong></div><div className={styles.planRow}><span>Credits left</span><strong>{formatCredits(credits)}</strong></div></div>
        </aside>
        <main className={`${styles.main} ${styles.videoMain}`} id="dashboard">
          <header className={styles.topbar}>
            <div className={styles.search}><Search size={17} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clips, prompts, history..." /><div className={styles.shortcut}>Ctrl K</div></div>
            <div className={styles.topActions}>
              <div className={styles.creditsPill}><Coins size={16} aria-hidden="true" /> {formatCredits(credits)} Credits</div>
              <button type="button" className={styles.iconBtn} aria-label="Notifications"><Bell size={17} aria-hidden="true" /><span className={styles.iconDot} /></button>
              <button type="button" className={styles.iconBtn} onClick={handleLogout} aria-label="Log out"><LogOut size={17} aria-hidden="true" /></button>
              <div className={styles.userCard}><div className={styles.avatar} /><div><strong>{userName}</strong><span>{activePackage?.name || "Free Plan"}</span></div></div>
            </div>
          </header>
          <section className={`${styles.generator} ${styles.videoStudio} ${isKlingPage ? styles.klingGenerator : ""}`} id="generator">
            <div className={`${styles.generatorTabs} ${isKlingPage ? styles.klingGeneratorTabs : ""}`}>
              <Link href="/user" className={`${styles.generatorTab} ${styles.generatorTabLink}`}><ImageIcon size={15} /> AI Image</Link>
              {!isKlingPage ? <button type="button" className={`${styles.generatorTab} ${styles.generatorTabActive}`}><Video size={15} /> AI Video</button> : <Link href="/user/video" className={`${styles.generatorTab} ${styles.generatorTabLink}`}><Video size={15} /> AI Video</Link>}
              {isKlingPage ? <button type="button" className={`${styles.generatorTab} ${styles.generatorTabActive}`}><WandSparkles size={15} /> Kling Motion</button> : <Link href="/user/kling" className={`${styles.generatorTab} ${styles.generatorTabLink}`}><WandSparkles size={15} /> Kling Motion</Link>}
            </div>
            <div className={styles.videoWorkspace}>
            <form onSubmit={onGenerate} className={styles.videoComposer} ref={controlsRef}>
              <div className={styles.composerHeading}>
                <div><span className={styles.eyebrow}>CREATE VIDEO</span><h1>{pageTitle}</h1><p>Build the scene, choose a model, and render without leaving the workspace.</p></div>
                <span className={styles.readyBadge}><i /> Ready</span>
              </div>
              {!isKlingPage ? (
                <div className={styles.modelSelector} aria-label="AI video model">
                  <div className={styles.modelShelfHeader}><span>Model</span><small>{AI_VIDEO_MODELS.length} available</small></div>
                  <div className={styles.settingDropdown}>
                    <button type="button" className={`${styles.modelSelectTrigger} ${activeAiModel?.accent === "violet" ? styles.modelSelectViolet : styles.modelSelectTeal} ${openControl === "model" ? styles.modelSelectOpen : ""}`} onClick={() => setOpenControl((current) => current === "model" ? null : "model")} aria-expanded={openControl === "model"}>
                      <span className={styles.modelSelectIcon}><ActiveModelIcon size={19} strokeWidth={1.8} /></span>
                      <span className={styles.modelTileCopy}><strong>{activeAiModel?.label}{activeAiModel?.badge ? <em>{activeAiModel.badge}</em> : null}</strong><small>{activeAiModel?.description}</small></span>
                      <ChevronDown className={styles.modelSelectChevron} size={18} aria-hidden="true" />
                    </button>
                    {openControl === "model" ? (
                      <div className={styles.modelSelectMenu}>
                        {AI_VIDEO_MODELS.map((model) => {
                          const ModelIcon = model.icon;
                          return (
                            <button key={model.id} type="button" className={`${styles.modelSelectOption} ${styles[`modelSelectOption${model.accent === "violet" ? "Violet" : "Teal"}`]} ${videoModel === model.id ? styles.modelSelectOptionActive : ""}`} onClick={() => selectAiVideoModel(model.id)}>
                              <span className={styles.modelSelectIcon}><ModelIcon size={19} strokeWidth={1.8} /></span>
                              <span className={styles.modelTileCopy}><strong>{model.label}{model.badge ? <em>{model.badge}</em> : null}</strong><small>{model.description}</small></span>
                              <span className={styles.modelRadio} aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className={`${styles.promptBox} ${isKlingPage ? styles.klingPromptBox : ""}`}>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the scene, subject, motion, lighting, camera, and mood of the video..." />
                <div className={styles.promptSide}><button type="button" className={styles.magicBtn}>+</button><span>{prompt.length}</span></div>
              </div>
              <div className={styles.controlsCompact}>
                <div className={styles.optionCluster}>
                  <div className={styles.settingDropdown}><button type="button" className={`${styles.settingButton} ${openControl === "aspect" ? styles.settingButtonActive : ""}`} onClick={() => setOpenControl((prev) => prev === "aspect" ? null : "aspect")}><div className={styles.controlSelectIcon}><Ratio size={16} /></div><div><small>{videoModel === "kling-motion-control" ? "Character" : "Aspect ratio"}</small><strong>{secondaryLabel}</strong></div></button>{openControl === "aspect" ? <div className={styles.settingMenu}>{videoModel === "kling-motion-control" ? characterOrientationOptions.map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${characterOrientation === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setCharacterOrientation(value); setOpenControl(null); }}>{value}</button>) : videoAspectOptions.map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${aspectRatio === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setAspectRatio(value); setOpenControl(null); }}>{value}</button>)}</div> : null}</div>
                  <div className={styles.settingDropdown}><button type="button" className={`${styles.settingButton} ${openControl === "quality" ? styles.settingButtonActive : ""}`} onClick={() => setOpenControl((prev) => prev === "quality" ? null : "quality")}><div className={styles.controlSelectIcon}><MonitorUp size={16} /></div><div><small>{videoModel === "kling-motion-control" ? "Output mode" : "Resolution"}</small><strong>{qualityLabel}</strong></div></button>{openControl === "quality" ? <div className={styles.settingMenu}>{videoModel === "kling-motion-control" ? klingModeOptions.map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${klingMotionMode === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setKlingMotionMode(value); setOpenControl(null); }}>{value}</button>) : (activeAiModel?.resolutions ?? videoResolutionOptions).map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${resolution === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setResolution(value); setOpenControl(null); }}>{value}</button>)}</div> : null}</div>
                  {!isKlingPage ? <div className={styles.settingDropdown}><button type="button" className={`${styles.settingButton} ${openControl === "duration" ? styles.settingButtonActive : ""}`} onClick={() => setOpenControl((prev) => prev === "duration" ? null : "duration")}><div className={styles.controlSelectIcon}><Timer size={16} /></div><div><small>Duration</small><strong>{duration}s</strong></div></button>{openControl === "duration" ? <div className={styles.settingMenu}>{durationOptions.filter((value) => value <= (activeAiModel?.maxDuration ?? 30)).map((value) => <button key={value} type="button" className={`${styles.settingMenuItem} ${duration === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setDuration(value); setOpenControl(null); }}>{value} seconds</button>)}</div> : null}</div> : null}
                  <div className={styles.settingDropdown}><button type="button" className={`${styles.settingButton} ${openControl === "workflow" ? styles.settingButtonActive : ""}`} onClick={() => setOpenControl((prev) => prev === "workflow" ? null : "workflow")}><div className={styles.controlSelectIcon}><Workflow size={16} /></div><div><small>{videoModel === "kling-motion-control" ? "Workflow" : "Generation mode"}</small><strong>{workflowLabel}</strong></div></button>{openControl === "workflow" ? <div className={styles.settingMenu}>{videoModel === "kling-motion-control" ? <button type="button" className={`${styles.settingMenuItem} ${styles.settingMenuItemActive}`} onClick={() => setOpenControl(null)}>Motion Control</button> : <><button type="button" className={`${styles.settingMenuItem} ${videoModeType === "text" ? styles.settingMenuItemActive : ""}`} onClick={() => { setVideoModeType("text"); setOpenControl(null); }}>Text to Video</button><button type="button" className={`${styles.settingMenuItem} ${videoModeType === "image" ? styles.settingMenuItemActive : ""}`} onClick={() => { setVideoModeType("image"); setShowAdvancedSettings(true); setOpenControl(null); }}>Image to Video</button></>}</div> : null}</div>
                </div>
                <div className={styles.actionCluster}>
                  <button type="button" className={styles.advancedToggle} onClick={() => setShowAdvancedSettings((prev) => !prev)}>{showAdvancedSettings ? "Hide advanced" : "Advanced settings"}</button>
                  <button type="button" className={styles.resetBtn} onClick={() => { setPrompt(""); setReferenceUrl(""); setReferenceVideoUrl(""); setMode("normal"); setAspectRatio("2:3"); setDuration(6); setResolution("480p"); setVideoModeType("text"); setVideoModel(variant === "kling" ? "kling-motion-control" : "grok-imagine"); setKlingMotionMode("720p"); setCharacterOrientation("image"); }}>Reset</button>
                  <button className={styles.generateBtn} type="submit" disabled={loading || !canGenerate}>{loading ? "Generating..." : `Generate - ${formatCredits(currentCost ?? 0)} credits`}</button>
                </div>
              </div>
              {showAdvancedSettings ? (
                <div className={styles.advancedPanel}>
                  <div className={styles.fieldBlockHeader}><h4>Advanced settings</h4><span className={styles.fieldHint}>Workflow, motion setup, reference assets, and render status</span></div>
                  <div className={styles.advancedPanelGrid}>
                    {isKlingPage ? <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Model AI</h4><span className={styles.fieldHint}>Active pipeline</span></div><div className={styles.subtleNote}>Kling 2.6 Motion Control</div></div> : null}
                    {variant !== "kling" ? (
                      <>
                        {activeAiModel?.supportsVideoMode ? <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Video mode</h4><span className={styles.fieldHint}>Motion style</span></div><select value={mode} onChange={(e) => setMode(e.target.value as VideoMode)}>{videoModeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></div> : null}
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Duration</h4><span className={styles.fieldHint}>Up to {activeAiModel?.maxDuration ?? 30} seconds</span></div><select value={String(duration)} onChange={(e) => setDuration(Number(e.target.value))}>{durationOptions.filter((value) => value <= (activeAiModel?.maxDuration ?? 30)).map((value) => <option key={value} value={value}>{value}s</option>)}</select></div>
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Output</h4><span className={styles.fieldHint}>Duration + quality</span></div><div className={styles.subtleNote}>{duration}s - {resolution} - {aspectRatio} - {videoModeType === "text" ? "Text to Video" : "Image to Video"}</div></div>
                        {videoModeType === "image" ? <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}><div className={styles.fieldBlockHeader}><h4>Reference image</h4><span className={styles.fieldHint}>{uploadingImage ? "Uploading..." : referenceUrl ? "Image URL ready" : "Upload or paste URL"}</span></div><div className={styles.uploadRow}><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file, "image"); }} /><input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://... (URL after upload)" /></div>{referenceUrl ? <div className={styles.referencePreview}><img src={referenceUrl} alt="Video reference image" /><div className={styles.referencePreviewMeta}>This image will be used as the source frame for Image to Video.</div></div> : null}</div> : null}
                      </>
                    ) : (
                      <>
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Character orientation</h4><span className={styles.fieldHint}>Character orientation</span></div><select value={characterOrientation} onChange={(e) => setCharacterOrientation(e.target.value as CharacterOrientation)}><option value="image">image</option><option value="video">video</option></select></div>
                        <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Output mode</h4><span className={styles.fieldHint}>Based on KIE docs</span></div><select value={klingMotionMode} onChange={(e) => setKlingMotionMode(e.target.value as KlingMotionMode)}><option value="720p">720p</option><option value="1080p">1080p</option></select></div>
                        <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}><div className={styles.fieldBlockHeader}><h4>Primary reference image</h4><span className={styles.fieldHint}>{uploadingImage ? "Uploading..." : referenceUrl ? "Ready" : "Required"}</span></div><div className={styles.uploadRow}><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file, "image"); }} /><input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://... reference image" /></div>{referenceUrl ? <div className={styles.referencePreview}><img src={referenceUrl} alt="Kling reference image" /><div className={styles.referencePreviewMeta}>This image becomes the key visual for Kling Motion Control.</div></div> : null}</div>
                        <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}><div className={styles.fieldBlockHeader}><h4>Motion reference video</h4><span className={styles.fieldHint}>{uploadingVideo ? "Uploading..." : referenceVideoUrl ? "Ready" : "Required"}</span></div><div className={styles.uploadRow}><input type="file" accept="video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file, "video"); }} /><input value={referenceVideoUrl} onChange={(e) => setReferenceVideoUrl(e.target.value)} placeholder="https://... motion reference video" /></div>{referenceVideoUrl ? <div className={styles.referencePreview}><video src={referenceVideoUrl} controls muted playsInline /><div className={styles.referencePreviewMeta}>This video provides motion data for the reference image.</div></div> : null}</div>
                      </>
                    )}
                    <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}><div className={styles.fieldBlockHeader}><h4>Render status</h4><span className={styles.fieldHint}>Realtime tracking</span></div><textarea value={statusText} readOnly /><div style={{ marginTop: 10 }} className={styles.subtleNote}>Task ID: {taskId || "not created yet"}</div></div>
                  </div>
                </div>
              ) : null}
              <div className={styles.statusBar}><span>{statusText}</span><span>Estimated: {formatCredits(currentCost ?? 0)} credit</span></div>
            </form>
            <aside className={styles.videoPreviewPane} aria-label="Video output preview">
              <div className={styles.previewHeader}>
                <div><span className={styles.eyebrow}>OUTPUT</span><h2>{activeTab === "result" ? "Current render" : "Render history"}</h2></div>
                <div className={styles.segmentTabs}><button type="button" className={`${styles.segmentTab} ${activeTab === "result" ? styles.segmentTabActive : ""}`} onClick={() => setActiveTab("result")}>Result</button><button type="button" className={`${styles.segmentTab} ${activeTab === "history" ? styles.segmentTabActive : ""}`} onClick={() => setActiveTab("history")}>History</button></div>
              </div>
              <div className={styles.previewStage}>
                {loading ? <div className={styles.previewEmpty}><div className={styles.spinner} /><strong>Rendering your video</strong><span>{statusText}</span></div> : filteredCards[0] ? <><video src={filteredCards[0].videoUrl} controls muted playsInline /><button type="button" className={styles.previewExpand} onClick={() => setLightboxUrl(filteredCards[0].videoUrl)}>Open preview</button></> : <div className={styles.previewEmpty}><span className={styles.previewGlyph}><Clapperboard size={20} /></span><strong>Your render will appear here</strong><span>Set up the scene and start generating.</span></div>}
              </div>
              <div className={styles.outputSummary}>
                <div><span>Model</span><strong>{modelLabel}</strong></div>
                <div><span>Output</span><strong>{qualityLabel} / {videoModel === "kling-motion-control" ? characterOrientation : `${duration}s`}</strong></div>
                <div><span>Cost</span><strong>{formatCredits(currentCost ?? 0)} credits</strong></div>
              </div>
              <div className={styles.renderQueue}>
                <div className={styles.renderQueueHead}><span>Render activity</span><strong>{loading ? "Processing" : taskId ? "Complete" : "Idle"}</strong></div>
                <div className={styles.renderTrack}><span style={{ width: loading ? "56%" : taskId ? "100%" : "8%" }} /></div>
                <p>{statusText}</p>
                <small>Task {taskId ? taskId.slice(0, 16) : "will be created after generation"}</small>
              </div>
            </aside>
            </div>
          </section>
          <section className={styles.contentGrid} id="recent">
            <div className={styles.panel}>
              <div className={styles.panelHead}><div><span className={styles.eyebrow}>LIBRARY</span><h2>Recent renders</h2></div><button type="button" className={styles.textLinkBtn} onClick={() => router.push("/user/history")}>View full history</button></div>
              {filteredHistoryCards.length === 0 ? <div className={styles.emptyState}>Your completed video renders will collect here.</div> : <div className={styles.creationGrid}>{filteredHistoryCards.slice(0, 8).map((item) => <button key={item.id} type="button" className={styles.creationCard} onClick={() => setLightboxUrl(item.videoUrl)}><div className={styles.creationThumb}><span className={styles.creationType}>Video</span><video src={item.videoUrl} muted playsInline /></div><div className={styles.creationMeta}><strong>{item.title}</strong><span>{item.meta}</span></div></button>)}</div>}
            </div>
          </section>
        </main>
      </div>
      {lightboxUrl ? <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}><button className={styles.lightboxClose} onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}>✕</button><video src={lightboxUrl} controls autoPlay className={styles.lightboxMedia} onClick={(e) => e.stopPropagation()} /></div> : null}
    </div>
  );
}

