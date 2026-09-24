"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Image as ImageIcon,
  Images,
  LogOut,
  Palette,
  Ratio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserRound,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import type { AIServiceId, CreateTaskInput, ImageResolution } from "@/lib/ai/types";
import { apiFetch, apiPath } from "@/lib/api-url";
import { StudioNavigation } from "@/components/studio-navigation";
import styles from "./generate.module.css";

type TaskResponse = { data?: { taskId?: string }; error?: string; creditCost?: number; remainingCredits?: number };
type ProfileResponse = { userId: string; credits: number; previewCosts: { image1k: number; image2k: number; image4k: number; imageEdit1k: number; imageEdit2k: number; imageEdit4k: number } };
type HistoryItem = { id: string; mediaType: "image" | "video"; urls: string[]; prompt: string; createdAt: string };
type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type DashboardCache = {
  userId: string;
  userName: string;
  credits: number;
  costPreview: ProfileResponse["previewCosts"] | null;
  history: HistoryItem[];
  packages: CreditPackage[];
};

type ControlDropdown = "aspect" | "style" | "model" | "mode" | null;

type CardItem = {
  id: string;
  mediaType: "image" | "video";
  title: string;
  meta: string;
  thumbUrl: string;
  urls: string[];
  createdAt: string;
};

type GalleryFilter = "all" | "image" | "video" | "realistic" | "anime" | "cinematic";

const CACHE_KEY = "aistudio_user_dashboard_cache_v1";
const aspectOptions = ["1:1", "16:9", "4:3", "3:4", "9:16"];
const styleOptions = ["Cinematic", "Ảnh thực", "Anime", "3D Render", "Editorial"];
const quantityOptions = [1, 2];
const resolutionOptions: ImageResolution[] = ["1k", "2k", "4k"];
const QWEN_PROMPT_MAX_LENGTH = 5000;
const PROMPT_SUGGESTIONS = [
  "Phong cảnh núi yên bình lúc bình minh",
  "Thành phố tương lai giữa những tầng mây",
  "Chân dung cinematic với ánh sáng studio",
  "Sản phẩm cao cấp trên nền tối tối giản",
];
const GALLERY_FILTERS: { id: GalleryFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "image", label: "Hình ảnh" },
  { id: "video", label: "Video" },
  { id: "realistic", label: "Chân thực" },
  { id: "anime", label: "Anime" },
  { id: "cinematic", label: "Cinematic" },
];

function composeImagePrompt(prompt: string, negativePrompt: string, activeStyle: string) {
  return `${prompt}${negativePrompt.trim() ? `\nNegative prompt: ${negativePrompt.trim()}` : ""}${activeStyle !== "Khong chon" ? `\nStyle: ${activeStyle}` : ""}`;
}

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
  collectUrls(data.images, urls);
  collectUrls(data.imageUrls, urls);
  collectUrls(data.image_urls, urls);
  collectUrls(data.resultUrls, urls);
  return Array.from(new Set(urls));
}

function isCompletedState(state: string) {
  return ["success", "completed", "succeeded", "done", "finish", "finished"].includes(state.toLowerCase());
}

function truncate(value: string, max = 34) {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export default function UserClient({ initialPrompt }: { initialPrompt: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("User");
  const [credits, setCredits] = useState(0);
  const [costPreview, setCostPreview] = useState<ProfileResponse["previewCosts"] | null>(null);
  const [search, setSearch] = useState("");

  const [prompt, setPrompt] = useState(initialPrompt.trim() || "Cô gái đứng trên đỉnh núi, ánh hoàng hôn vàng cam, siêu thực, cinematic.");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [imageModel, setImageModel] = useState<"gpt" | "seedream" | "qwen3">("gpt");
  const [generationMode, setGenerationMode] = useState<"text" | "image">("text");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [quantity, setQuantity] = useState(1);
  const [imageResolution, setImageResolution] = useState<ImageResolution>("2k");
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [activeStyle, setActiveStyle] = useState("Cinematic");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [openControl, setOpenControl] = useState<ControlDropdown>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [taskId, setTaskId] = useState("");
  const [statusText, setStatusText] = useState("Sẵn sàng tạo ảnh.");
  const [loading, setLoading] = useState(false);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxMediaType, setLightboxMediaType] = useState<"image" | "video">("image");

  const saveCache = useCallback((next: Partial<DashboardCache>) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      const base: DashboardCache = raw ? (JSON.parse(raw) as DashboardCache) : { userId: "", userName: "User", credits: 0, costPreview: null, history: [], packages: [] };
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...base, ...next }));
    } catch {}
  }, []);

  const currentCost = useMemo(() => {
    const single = imageModel === "qwen3" && generationMode === "image"
      ? (imageResolution === "4k" ? costPreview?.imageEdit4k : imageResolution === "2k" ? costPreview?.imageEdit2k : costPreview?.imageEdit1k)
      : (imageResolution === "4k" ? costPreview?.image4k : imageResolution === "2k" ? costPreview?.image2k : costPreview?.image1k);
    return single ? single * quantity : null;
  }, [costPreview, generationMode, imageModel, imageResolution, quantity]);

  const composedPrompt = composeImagePrompt(prompt, negativePrompt, activeStyle);
  const promptTooLong = imageModel === "qwen3" && composedPrompt.length > QWEN_PROMPT_MAX_LENGTH;
  const canGenerate = prompt.trim().length >= 3 && !promptTooLong && (generationMode === "text" || /^https?:\/\//.test(referenceUrl)) && !uploading;

  useEffect(() => {
    router.prefetch("/user/video");
    router.prefetch("/user/kling");
  }, [router]);

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
      queueMicrotask(() => {
        try {
          const raw = window.sessionStorage.getItem(CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as DashboardCache;
            if (cached.userId) setUserId(cached.userId);
            if (cached.userName) setUserName(cached.userName);
            if (typeof cached.credits === "number") setCredits(cached.credits);
            if (cached.costPreview) setCostPreview(cached.costPreview);
            if (Array.isArray(cached.history)) setHistory(cached.history);
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
          const items = historyData.items || [];
          setHistory(items);
          saveCache({ history: items });
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
      setStatusText("Không đọc được trạng thái task.");
      setLoading(false);
      return [] as string[];
    }
    const data = (payload.data as Record<string, unknown>) || {};
    const state = String(data.state || "unknown");
    setStatusText(`Trạng thái: ${state}`);
    if (!isCompletedState(state)) return [] as string[];

    let parsedResultJson: unknown = data.resultJson;
    if (typeof parsedResultJson === "string") {
      try { parsedResultJson = JSON.parse(parsedResultJson); } catch {}
    }
    return extractResultUrls({ ...data, resultJson: parsedResultJson });
  }, []);

  async function waitForTaskImages(targetTaskId: string) {
    for (let i = 0; i < 50; i += 1) {
      const urls = await checkTask(targetTaskId);
      if (urls.length > 0) return urls;
      await new Promise((resolve) => setTimeout(resolve, 2800));
    }
    return [];
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
    setResultUrls([]);
    setStatusText("Đang tạo ảnh...");

    const body: CreateTaskInput = {
      serviceId: (
        imageModel === "gpt"
          ? (generationMode === "text" ? "gpt-image-2-text" : "gpt-image-2-image")
          : imageModel === "seedream"
            ? (generationMode === "text" ? "seedream-5-lite-text" : "seedream-5-lite-image")
            : (generationMode === "text" ? "qwen3-pro-text" : "qwen3-pro-image")
      ) as AIServiceId,
      prompt: composedPrompt,
      aspectRatio,
      imageResolution,
      inputUrl: generationMode === "image" ? referenceUrl : undefined,
    };

    const taskIds: string[] = [];
    for (let i = 0; i < quantity; i += 1) {
      const res = await apiFetch(apiPath("/api/ai/create-task"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as TaskResponse;
      if (!res.ok || !payload.data?.taskId) {
        setStatusText(payload.error || "Tạo ảnh thất bại.");
        if (typeof payload.remainingCredits === "number") setCredits(payload.remainingCredits);
        setLoading(false);
        return;
      }
      taskIds.push(payload.data.taskId);
      if (typeof payload.remainingCredits === "number") setCredits(payload.remainingCredits);
    }

    setTaskId(taskIds.join(", "));
    const allUrls: string[] = [];
    for (let i = 0; i < taskIds.length; i += 1) {
      setStatusText(`Đang xử lý ảnh ${i + 1}/${taskIds.length}...`);
      const urls = await waitForTaskImages(taskIds[i]);
      allUrls.push(...urls);
    }

    const uniqueUrls = Array.from(new Set(allUrls));
    setResultUrls(uniqueUrls);
    setStatusText(uniqueUrls.length > 0 ? `Hoàn tất ${uniqueUrls.length} ảnh.` : "Task hoàn tất nhưng chưa có ảnh.");
    setLoading(false);

    if (uniqueUrls.length > 0) {
      const r = await apiFetch(apiPath("/api/user/history"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ mediaType: "image", urls: uniqueUrls, prompt }),
      });
      if (r.ok) {
        const payload = (await r.json()) as { item?: HistoryItem };
        if (payload.item) {
          setHistory((prev) => {
            const next = [payload.item!, ...prev].slice(0, 24);
            saveCache({ history: next });
            return next;
          });
        }
      }
    }
  }

  async function handleLogout() {
    await apiFetch(apiPath("/api/auth/logout"), { method: "POST" });
    window.location.assign("/login");
  }

  function openUrls(urls: string[], index = 0, mediaType: "image" | "video" = "image") {
    setLightboxUrls(urls);
    setLightboxIndex(index);
    setLightboxMediaType(mediaType);
  }

  const recentResultCards: CardItem[] = resultUrls.map((url, index) => ({
    id: `${url}-${index}`,
    mediaType: "image",
    title: truncate(prompt),
    meta: `${imageModel === "gpt" ? "GPT Image 2" : imageModel === "seedream" ? "Seedream 5 Lite" : "Qwen3 Pro"} · ${imageResolution.toUpperCase()} · ${aspectRatio}`,
    thumbUrl: url,
    urls: resultUrls,
    createdAt: new Date().toISOString(),
  }));

  const historyCards: CardItem[] = history.map((item) => ({
    id: item.id,
    mediaType: item.mediaType,
    title: truncate(item.prompt || "Tạo ảnh AI"),
    meta: `${item.urls.length} ảnh · ${new Date(item.createdAt).toLocaleDateString("vi-VN")}`,
    thumbUrl: item.urls[0],
    urls: item.urls,
    createdAt: item.createdAt,
  }));

  const displayCards = [
    ...recentResultCards,
    ...historyCards.filter((item) => !recentResultCards.some((result) => result.thumbUrl === item.thumbUrl)),
  ];
  const filteredCards = displayCards.filter((item) => {
    const haystack = `${item.title} ${item.meta}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    if (!matchesSearch || galleryFilter === "all") return matchesSearch;
    if (galleryFilter === "image" || galleryFilter === "video") return item.mediaType === galleryFilter;
    if (galleryFilter === "realistic") return /realistic|photoreal|photo|chân thực|ảnh thực/.test(haystack);
    if (galleryFilter === "anime") return /anime|manga/.test(haystack);
    return /cinematic|điện ảnh/.test(haystack);
  });
  const activePackage = packages[0];
  return (
    <div className={`${styles.page} ${styles.imageStudioPage}`}>
      <div className={`${styles.appShell} ${styles.imageStudioShell}`}>
        <aside className={`${styles.sidebar} ${styles.imageStudioSidebar}`}>
          <Link href="/" className={styles.logoLink}>
            <span className={styles.logoMark} />
            <span className={styles.logoText}>VizoAI</span>
          </Link>

          <StudioNavigation active="dashboard" />

          <div className={styles.sidebarSpacer} />

          <div className={styles.sidebarAccount} id="upgrade">
            <Link href="/user#upgrade" className={styles.sidebarUtility}>
              <Crown size={18} />
              <span>Nâng cấp</span>
              <ChevronRight size={15} />
            </Link>
            <div className={styles.sidebarUser} id="account">
              <span className={styles.userAvatar}><UserRound size={18} /></span>
              <span className={styles.sidebarUserCopy}>
                <strong>{userName}</strong>
                <small>{activePackage?.name || "Free Plan"}</small>
              </span>
              <button type="button" onClick={handleLogout} aria-label="Đăng xuất"><LogOut size={16} /></button>
            </div>
          </div>
        </aside>

        <main className={`${styles.main} ${styles.imageStudioMain}`} id="dashboard">
          <header className={styles.imageTopbar}>
            <div className={styles.topActions}>
              <div className={styles.creditsPill}><Coins size={16} aria-hidden="true" /> {formatCredits(credits)} Credits</div>
              <button type="button" className={styles.iconBtn} aria-label="Thông báo"><Bell size={17} aria-hidden="true" /><span className={styles.iconDot} /></button>
              <Link href="/user#upgrade" className={styles.upgradeButton}><Crown size={17} /> Nâng cấp</Link>
            </div>
          </header>

          <section className={styles.imageHero}>
            <span className={styles.heroEyebrow}>AI Creative Studio</span>
            <h1>Biến ý tưởng thành<br />hình ảnh ấn tượng cùng <em>AI</em></h1>
            <p>Tạo hình ảnh và video chất lượng cao từ mô tả của anh trong vài giây.</p>
          </section>

          <section className={styles.generator} id="generator">
            <div className={styles.generatorTabs}>
              <button type="button" className={`${styles.generatorTab} ${styles.generatorTabActive}`}><ImageIcon size={17} /> Hình ảnh</button>
              <Link href="/user/video" className={`${styles.generatorTab} ${styles.generatorTabLink}`}><Video size={17} /> Video</Link>
            </div>

            <form onSubmit={onGenerate}>
              <div className={styles.imageComposer} ref={controlsRef}>
                <div className={styles.promptBox}>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Mô tả điều anh muốn tạo..." />
                  <span className={styles.promptCount}>{imageModel === "qwen3" ? `${composedPrompt.length}/${QWEN_PROMPT_MAX_LENGTH}` : prompt.length}</span>
                </div>

                <div className={styles.composerToolbar}>
                  <div className={styles.optionCluster}>
                    <button
                      type="button"
                      className={`${styles.toolbarButton} ${generationMode === "image" ? styles.toolbarButtonActive : ""}`}
                      onClick={() => {
                        setGenerationMode((current) => current === "image" ? "text" : "image");
                        setShowAdvancedSettings(true);
                      }}
                    >
                      <Upload size={17} />
                      <span>Tham chiếu</span>
                    </button>

                <div className={styles.settingDropdown}>
                  <button
                    type="button"
                    className={`${styles.toolbarButton} ${openControl === "style" ? styles.toolbarButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "style" ? null : "style")}
                  >
                    <Palette size={17} />
                    <span>{activeStyle}</span>
                  </button>
                  {openControl === "style" ? (
                    <div className={styles.settingMenu}>
                      {styleOptions.map((value) => (
                        <button key={value} type="button" className={`${styles.settingMenuItem} ${activeStyle === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setActiveStyle(value); setOpenControl(null); }}>
                          {value}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className={styles.settingDropdown}>
                  <button
                    type="button"
                    className={`${styles.toolbarButton} ${openControl === "aspect" ? styles.toolbarButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "aspect" ? null : "aspect")}
                  >
                    <Ratio size={17} />
                    <span>{aspectRatio}</span>
                  </button>
                  {openControl === "aspect" ? (
                    <div className={styles.settingMenu}>
                      {aspectOptions.map((value) => (
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
                    className={`${styles.toolbarButton} ${openControl === "model" ? styles.toolbarButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "model" ? null : "model")}
                  >
                    <Sparkles size={17} />
                    <span>{imageModel === "gpt" ? "GPT Image 2" : imageModel === "seedream" ? "Seedream 5 Lite" : "Qwen3 Pro"}</span>
                  </button>
                  {openControl === "model" ? (
                    <div className={`${styles.settingMenu} ${styles.modelChoiceMenu}`}>
                      <button type="button" className={`${styles.modelChoiceOption} ${styles.modelChoiceTeal} ${imageModel === "gpt" ? styles.modelChoiceActive : ""}`} onClick={() => { setImageModel("gpt"); if (imageResolution === "1k") setImageResolution("2k"); setOpenControl(null); }}>
                        <span><Sparkles size={16} /></span><div><strong>GPT Image 2</strong><small>Versatile image generation</small></div>
                      </button>
                      <button type="button" className={`${styles.modelChoiceOption} ${styles.modelChoiceViolet} ${imageModel === "seedream" ? styles.modelChoiceActive : ""}`} onClick={() => { setImageModel("seedream"); setOpenControl(null); }}>
                        <span><WandSparkles size={16} /></span><div><strong>Seedream 5 Lite</strong><small>Fast creative rendering</small></div>
                      </button>
                      <button type="button" className={`${styles.modelChoiceOption} ${styles.modelChoiceAmber} ${imageModel === "qwen3" ? styles.modelChoiceActive : ""}`} onClick={() => { setImageModel("qwen3"); setShowAdvancedSettings(true); setOpenControl(null); }}>
                        <span><Images size={16} /></span><div><strong>Qwen3 Pro</strong><small>Detailed professional output</small></div>
                      </button>
                    </div>
                  ) : null}
                </div>

                    <button type="button" className={`${styles.toolbarButton} ${showAdvancedSettings ? styles.toolbarButtonActive : ""}`} onClick={() => setShowAdvancedSettings((prev) => !prev)}>
                      <SlidersHorizontal size={17} />
                      <span>Cài đặt</span>
                    </button>

                    <button
                      type="button"
                      className={styles.toolbarIconButton}
                      aria-label="Đặt lại cài đặt"
                      onClick={() => {
                        setPrompt("");
                        setNegativePrompt("");
                        setReferenceUrl("");
                        setActiveStyle("Cinematic");
                        setGenerationMode("text");
                        setAspectRatio("16:9");
                        setQuantity(1);
                        setImageResolution("2k");
                      }}
                    >
                      <RotateCcw size={17} />
                  </button>
                  </div>

                  <button className={styles.generateBtn} type="submit" disabled={loading || !canGenerate}>
                    <WandSparkles size={18} />
                    {loading ? "Đang tạo..." : `Tạo ngay · ${formatCredits(currentCost ?? 0)}`}
                  </button>
                </div>
              </div>

              {showAdvancedSettings ? (
                <div className={styles.advancedPanel}>
                  <div className={styles.fieldBlockHeader}>
                    <h4>Cài đặt nâng cao</h4>
                    <span className={styles.fieldHint}>Model, độ phân giải, số lượng và workflow</span>
                  </div>

                  <div className={styles.advancedPanelGrid}>
                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Số lượng ảnh</h4><span className={styles.fieldHint}>Tối đa 2 ảnh</span></div>
                      <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
                        {quantityOptions.map((value) => <option key={value} value={value}>{value} ảnh</option>)}
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Độ phân giải</h4><span className={styles.fieldHint}>{imageModel === "qwen3" ? "1K / 2K / 4K" : imageModel === "gpt" ? "1K / 2K / 4K" : "Basic 2K / High 3K / Ultra 4K"}</span></div>
                      <select value={imageResolution} onChange={(e) => setImageResolution(e.target.value as ImageResolution)}>
                        {resolutionOptions.map((value) => <option key={value} value={value}>{imageModel === "seedream" ? (value === "1k" ? "Basic (2K)" : value === "2k" ? "High (3K)" : "Ultra (4K)") : value.toUpperCase()}</option>)}
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Workflow</h4><span className={styles.fieldHint}>{generationMode === "image" ? "Đang bật ảnh tham chiếu" : "Prompt thuần"}</span></div>
                      <select value={generationMode} onChange={(e) => { const nextMode = e.target.value as "text" | "image"; setGenerationMode(nextMode); if (nextMode === "image") setShowAdvancedSettings(true); }}>
                        <option value="text">Text to Image</option>
                        <option value="image">Image to Image</option>
                      </select>
                    </div>

                    {generationMode === "image" ? (
                      <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}>
                        <div className={styles.fieldBlockHeader}><h4>Ảnh tham chiếu</h4><span className={styles.fieldHint}>{uploading ? "Đang upload..." : referenceUrl ? "Đã có URL ảnh" : "Upload hoặc dán URL"}</span></div>
                        <div className={styles.uploadRow}>
                          <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file); }} />
                          <input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://... (URL sau khi upload)" />
                        </div>
                        {referenceUrl ? (
                          <div className={styles.referencePreview}>
                            <img src={referenceUrl} alt="Ảnh tham chiếu" />
                            <div className={styles.referencePreviewMeta}>Ảnh tham chiếu hiện tại sẽ được dùng cho workflow Image to Image.</div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}>
                      <div className={styles.fieldBlockHeader}><h4>Prompt nâng cao</h4><span className={styles.fieldHint}>Negative prompt</span></div>
                      <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="Những gì anh không muốn xuất hiện trong ảnh" />
                      <div style={{ marginTop: 10 }} className={styles.subtleNote}>
                        {imageModel === "qwen3" ? "Qwen3 Pro hỗ trợ Text to Image và Image to Image theo Kie.ai; Image to Image cần ảnh tham chiếu." : imageModel === "seedream" ? "Seedream 5 Lite dùng quality basic/high/ultra tương ứng 2K/3K/4K theo Kie.ai." : "GPT Image 2 hỗ trợ xuất 1K, 2K và 4K."}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={styles.statusBar}>
                <span>{statusText}</span>
                <span>Task: {taskId || "chưa tạo"}</span>
              </div>
            </form>

            <div className={styles.promptSuggestions}>
              <strong>Thử ngay:</strong>
              {PROMPT_SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)}>{suggestion}</button>
              ))}
            </div>
          </section>

          <section className={styles.exploreSection} id="recent">
            <div className={styles.exploreHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Thư viện của anh</span>
                <h2>Khám phá khả năng sáng tạo</h2>
                <p>Xem lại những hình ảnh và video đã tạo trong studio.</p>
              </div>
              <label className={styles.gallerySearch}>
                <Search size={16} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm trong thư viện..." />
              </label>
            </div>

            <div className={styles.galleryFilters}>
              {GALLERY_FILTERS.map((filter) => (
                <button key={filter.id} type="button" className={galleryFilter === filter.id ? styles.galleryFilterActive : ""} onClick={() => setGalleryFilter(filter.id)}>
                  {filter.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className={styles.loadingBox}><div className={styles.spinner} /><b>Đang tạo ảnh...</b><p>{statusText}</p></div>
            ) : filteredCards.length === 0 ? (
              <div className={styles.emptyState}>
                <Images size={28} />
                <strong>Chưa có nội dung phù hợp</strong>
                <span>Tác phẩm anh tạo sẽ xuất hiện tại đây.</span>
              </div>
            ) : (
              <div className={styles.exploreGrid}>
                {filteredCards.slice(0, 12).map((item) => (
                  <button key={item.id} type="button" className={styles.exploreCard} onClick={() => openUrls(item.urls, 0, item.mediaType)}>
                    <div className={styles.exploreMedia}>
                      {item.mediaType === "video" ? (
                        <video src={item.thumbUrl} muted preload="metadata" />
                      ) : (
                        <img src={item.thumbUrl} alt={item.title} />
                      )}
                      <span className={styles.mediaBadge}>{item.mediaType === "video" ? <Video size={13} /> : <ImageIcon size={13} />}{item.mediaType === "video" ? "Video" : "Image"}</span>
                    </div>
                    <span className={styles.exploreCardCopy}>
                      <strong>{item.title}</strong>
                      <small>{item.meta}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {lightboxUrls ? (
        <div className={styles.lightbox} onClick={() => setLightboxUrls(null)}>
          <button className={styles.lightboxClose} onClick={(e) => { e.stopPropagation(); setLightboxUrls(null); }} aria-label="Đóng"><X size={20} /></button>
          {lightboxUrls.length > 1 ? <button className={styles.lightboxNav} onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + lightboxUrls.length) % lightboxUrls.length); }} aria-label="Trước"><ChevronLeft size={22} /></button> : null}
          {lightboxMediaType === "video" ? (
            <video src={lightboxUrls[lightboxIndex]} controls autoPlay className={styles.lightboxMedia} onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={lightboxUrls[lightboxIndex]} alt="preview" className={styles.lightboxMedia} onClick={(e) => e.stopPropagation()} />
          )}
          {lightboxUrls.length > 1 ? <button className={styles.lightboxNav} onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i + 1) % lightboxUrls.length); }} aria-label="Sau"><ChevronRight size={22} /></button> : null}
        </div>
      ) : null}
    </div>
  );
}



