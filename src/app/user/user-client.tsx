"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIServiceId, CreateTaskInput, ImageResolution } from "@/lib/ai/types";
import { apiFetch, apiPath } from "@/lib/api-url";
import { TEMPLATE_CATEGORIES, type PromptTemplate, type TemplateCategory } from "@/lib/template-catalog";
import styles from "./generate.module.css";

type TaskResponse = { data?: { taskId?: string }; error?: string; creditCost?: number; remainingCredits?: number };
type ProfileResponse = { userId: string; credits: number; previewCosts: { image1k: number; image2k: number; image4k: number } };
type HistoryItem = { id: string; mediaType: "image" | "video"; urls: string[]; prompt: string; createdAt: string };
type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type DashboardCache = {
  userId: string;
  userName: string;
  credits: number;
  costPreview: ProfileResponse["previewCosts"] | null;
  history: HistoryItem[];
  packages: CreditPackage[];
  templates: PromptTemplate[];
};

type ControlDropdown = "aspect" | "style" | "model" | "mode" | null;

type CardItem = {
  id: string;
  title: string;
  meta: string;
  thumbUrl: string;
  urls: string[];
  createdAt: string;
};

const CACHE_KEY = "aistudio_user_dashboard_cache_v1";
const aspectOptions = ["1:1", "16:9", "4:3", "3:4", "9:16"];
const styleOptions = ["Cinematic", "Ảnh thực", "Anime", "3D Render", "Editorial"];
const quantityOptions = [1, 2];
const resolutionOptions: ImageResolution[] = ["1k", "2k", "4k"];

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
  const [imageModel, setImageModel] = useState<"gpt" | "seedream">("gpt");
  const [generationMode, setGenerationMode] = useState<"text" | "image">("text");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [quantity, setQuantity] = useState(1);
  const [imageResolution, setImageResolution] = useState<ImageResolution>("2k");
  const [activeTab, setActiveTab] = useState<"result" | "history">("result");
  const [activeStyle, setActiveStyle] = useState("Cinematic");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [openControl, setOpenControl] = useState<ControlDropdown>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [templateLibrary, setTemplateLibrary] = useState<PromptTemplate[]>([]);
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>("All");

  const [taskId, setTaskId] = useState("");
  const [statusText, setStatusText] = useState("Sẵn sàng tạo ảnh.");
  const [loading, setLoading] = useState(false);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const saveCache = useCallback((next: Partial<DashboardCache>) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      const base: DashboardCache = raw ? (JSON.parse(raw) as DashboardCache) : { userId: "", userName: "User", credits: 0, costPreview: null, history: [], packages: [], templates: [] };
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...base, ...next }));
    } catch {}
  }, []);

  const currentCost = useMemo(() => {
    if (imageModel === "seedream") {
      const single = costPreview?.image1k ?? null;
      return single ? single * quantity : null;
    }
    const single = imageResolution === "4k" ? costPreview?.image4k : imageResolution === "2k" ? costPreview?.image2k : costPreview?.image1k;
    return single ? single * quantity : null;
  }, [costPreview, imageResolution, quantity, imageModel]);

  const canGenerate = prompt.trim().length >= 3 && (generationMode === "text" || /^https?:\/\//.test(referenceUrl)) && !uploading;

  useEffect(() => {
    router.prefetch("/user/video");
    router.prefetch("/user/kling");
  }, [router]);

  useEffect(() => {
    if (generationMode === "image") {
      setShowAdvancedSettings(true);
    }
  }, [generationMode]);

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
          const cached = JSON.parse(raw) as DashboardCache;
          if (cached.userId) setUserId(cached.userId);
          if (cached.userName) setUserName(cached.userName);
          if (typeof cached.credits === "number") setCredits(cached.credits);
          if (cached.costPreview) setCostPreview(cached.costPreview);
          if (Array.isArray(cached.history)) setHistory(cached.history.filter((x) => x.mediaType === "image"));
          if (Array.isArray(cached.packages)) setPackages(cached.packages);
          if (Array.isArray(cached.templates)) setTemplateLibrary(cached.templates);
        }
      } catch {}
    }

    async function bootstrap() {
      const [profileRes, packageRes, templateRes] = await Promise.all([
        apiFetch(apiPath("/api/user/profile")),
        apiFetch(apiPath("/api/public/credit-packages")),
        apiFetch(apiPath("/api/public/templates?mediaType=image")),
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
          const imageItems = (historyData.items || []).filter((x) => x.mediaType === "image");
          setHistory(imageItems);
          saveCache({ history: imageItems });
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
    setActiveTab("result");

    const body: CreateTaskInput = {
      serviceId: (
        imageModel === "gpt"
          ? (generationMode === "text" ? "gpt-image-2-text" : "gpt-image-2-image")
          : (generationMode === "text" ? "seedream-5-lite-text" : "seedream-5-lite-image")
      ) as AIServiceId,
      prompt: `${prompt}${negativePrompt.trim() ? `\nNegative prompt: ${negativePrompt.trim()}` : ""}${activeStyle !== "Khong chon" ? `\nStyle: ${activeStyle}` : ""}`,
      aspectRatio,
      imageResolution: imageModel === "gpt" ? imageResolution : "1k",
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

  function openUrls(urls: string[], index = 0) {
    setLightboxUrls(urls);
    setLightboxIndex(index);
  }

  const recentResultCards: CardItem[] = resultUrls.map((url, index) => ({
    id: `${url}-${index}`,
    title: truncate(prompt),
    meta: `${imageModel === "gpt" ? "GPT Image 2" : "Seedream 5 Lite"} · ${aspectRatio}`,
    thumbUrl: url,
    urls: resultUrls,
    createdAt: new Date().toISOString(),
  }));

  const historyCards: CardItem[] = history.map((item) => ({
    id: item.id,
    title: truncate(item.prompt || "Tạo ảnh AI"),
    meta: `${item.urls.length} ảnh · ${new Date(item.createdAt).toLocaleDateString("vi-VN")}`,
    thumbUrl: item.urls[0],
    urls: item.urls,
    createdAt: item.createdAt,
  }));

  const displayCards = (activeTab === "result" && (loading || recentResultCards.length > 0)) ? recentResultCards : historyCards;
  const filteredCards = displayCards.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(search.toLowerCase()));
  const progressWidth = Math.max(8, Math.min(100, Math.round((credits / Math.max(credits + (currentCost || 0), 1000)) * 100)));
  const createdImageCount = history.reduce((sum, item) => sum + item.urls.length, 0) + resultUrls.length;
  const projectCount = history.length;
  const activePackage = packages[0];
  const filteredTemplates = useMemo(() => {
    if (templateCategory === "All") return templateLibrary;
    return templateLibrary.filter((item) => item.category === templateCategory || item.tags.includes(templateCategory));
  }, [templateCategory, templateLibrary]);

  const applyTemplate = useCallback((item: PromptTemplate) => {
    setPrompt(item.prompt);
    if (aspectOptions.includes(item.aspectRatio)) setAspectRatio(item.aspectRatio);
    const matchedStyle = styleOptions.find((style) => item.tags.includes(style) || item.prompt.toLowerCase().includes(style.toLowerCase()));
    if (matchedStyle) setActiveStyle(matchedStyle);
    setActiveTab("result");
    document.getElementById("generator")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <Link href="/" className={styles.logoLink}>
            <span className={styles.logoMark} />
            <span className={styles.logoText}>VizoAI</span>
          </Link>

          <nav className={styles.navMenu}>
            <a className={`${styles.navItem} ${styles.activeNav}`} href="#dashboard"><span className={styles.navIcon}>⌂</span><span className={styles.navText}>Dashboard</span></a>
            <a className={styles.navItem} href="#generator"><span className={styles.navIcon}>▧</span><span className={styles.navText}>Tạo ảnh</span></a>
            <Link className={styles.navItem} href="/user/video"><span className={styles.navIcon}>▶</span><span className={styles.navText}>Tạo video</span></Link>
            <Link className={styles.navItem} href="/user/templates"><span className={styles.navIcon}>▦</span><span className={styles.navText}>Mẫu có sẵn</span></Link>
            <Link className={styles.navItem} href="/user/history"><span className={styles.navIcon}>↺</span><span className={styles.navText}>Lịch sử</span></Link>
            <a className={styles.navItem} href="#styles"><span className={styles.navIcon}>♡</span><span className={styles.navText}>Phong cách</span></a>
            <Link className={styles.navItem} href="/admin"><span className={styles.navIcon}>⚙</span><span className={styles.navText}>Cài đặt</span></Link>
          </nav>

          <div className={styles.sidebarSpacer} />

          <div className={styles.upgradeCard}>
            <h3>Nâng cấp Pro</h3>
            <p>Tạo ảnh nhiều hơn, mở khóa model cao cấp và xuất file chất lượng cao cho chiến dịch thật.</p>
            <button type="button">Nâng cấp ngay →</button>
          </div>

          <div className={styles.planBox}>
            <div className={styles.planRow}><span>Gói hiện tại</span><strong>{activePackage?.badge || "Free"}</strong></div>
            <div className={styles.planRow}><span>Credits còn lại</span><strong>{formatCredits(credits)}</strong></div>
          </div>
        </aside>

        <main className={styles.main} id="dashboard">
          <header className={styles.topbar}>
            <div className={styles.search}>
              <span>🔍</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm ảnh, prompt, lịch sử..." />
              <div className={styles.shortcut}>Ctrl K</div>
            </div>

            <div className={styles.topActions}>
              <div className={styles.creditsPill}>⚡ {formatCredits(credits)} Credits</div>
              <button type="button" className={styles.iconBtn}><span>🔔</span><span className={styles.iconDot} /></button>
              <button type="button" className={styles.iconBtn} onClick={handleLogout}>⎋</button>
              <div className={styles.userCard}>
                <div className={styles.avatar} />
                <div>
                  <strong>{userName}</strong>
                  <span>{activePackage?.name || "Free Plan"}</span>
                </div>
              </div>
            </div>
          </header>

          <section className={styles.generator} id="generator">
            <div className={styles.generatorTabs}>
              <button type="button" className={`${styles.generatorTab} ${styles.generatorTabActive}`}>✨ AI Image</button>
              <Link href="/user/video" className={`${styles.generatorTab} ${styles.generatorTabLink}`}>🎬 AI Video</Link>
              <Link href="/user/kling" className={`${styles.generatorTab} ${styles.generatorTabLink}`}>🎞 Kling Motion</Link>
            </div>

            <form onSubmit={onGenerate}>
              <div className={styles.promptBox}>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Mô tả nội dung anh muốn tạo... Ví dụ: poster sản phẩm, phong cách cinematic, ánh sáng cao cấp." />
                <div className={styles.promptSide}>
                  <button type="button" className={styles.magicBtn}>✦</button>
                  <span>{prompt.length} chars</span>
                </div>
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
                      <small>Tỷ lệ ảnh</small>
                      <strong>{aspectRatio}</strong>
                    </div>
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
                    className={`${styles.settingButton} ${openControl === "style" ? styles.settingButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "style" ? null : "style")}
                  >
                    <div className={styles.controlSelectIcon}>✺</div>
                    <div>
                      <small>Phong cách</small>
                      <strong>{activeStyle}</strong>
                    </div>
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
                    className={`${styles.settingButton} ${openControl === "model" ? styles.settingButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "model" ? null : "model")}
                  >
                    <div className={styles.controlSelectIcon}>▤</div>
                    <div>
                      <small>Model</small>
                      <strong>{imageModel === "gpt" ? "GPT Image 2" : "Seedream 5 Lite"}</strong>
                    </div>
                  </button>
                  {openControl === "model" ? (
                    <div className={styles.settingMenu}>
                      <button type="button" className={`${styles.settingMenuItem} ${imageModel === "gpt" ? styles.settingMenuItemActive : ""}`} onClick={() => { setImageModel("gpt"); if (imageResolution === "1k") setImageResolution("2k"); setOpenControl(null); }}>
                        GPT Image 2
                      </button>
                      <button type="button" className={`${styles.settingMenuItem} ${imageModel === "seedream" ? styles.settingMenuItemActive : ""}`} onClick={() => { setImageModel("seedream"); setImageResolution("1k"); setOpenControl(null); }}>
                        Seedream 5 Lite
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className={styles.settingDropdown}>
                  <button
                    type="button"
                    className={`${styles.settingButton} ${generationMode === "image" || openControl === "mode" ? styles.settingButtonActive : ""}`}
                    onClick={() => setOpenControl((prev) => prev === "mode" ? null : "mode")}
                  >
                    <div className={styles.controlSelectIcon}>🖼</div>
                    <div>
                      <small>Chế độ tạo</small>
                      <strong>{generationMode === "text" ? "Text to Image" : "Image to Image"}</strong>
                    </div>
                  </button>
                  {openControl === "mode" ? (
                    <div className={styles.settingMenu}>
                      <button type="button" className={`${styles.settingMenuItem} ${generationMode === "text" ? styles.settingMenuItemActive : ""}`} onClick={() => { setGenerationMode("text"); setOpenControl(null); }}>
                        Text to Image
                      </button>
                      <button type="button" className={`${styles.settingMenuItem} ${generationMode === "image" ? styles.settingMenuItemActive : ""}`} onClick={() => { setGenerationMode("image"); setShowAdvancedSettings(true); setOpenControl(null); }}>
                        Image to Image
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
                    setNegativePrompt("");
                    setReferenceUrl("");
                    setActiveStyle("Cinematic");
                    setGenerationMode("text");
                    setAspectRatio("16:9");
                    setQuantity(1);
                    setImageResolution(imageModel === "gpt" ? "2k" : "1k");
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
                    <span className={styles.fieldHint}>Quantity, resolution, reference image và negative prompt</span>
                  </div>

                  <div className={styles.advancedPanelGrid}>
                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Số lượng ảnh</h4><span className={styles.fieldHint}>Tối đa 2 ảnh</span></div>
                      <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
                        {quantityOptions.map((value) => <option key={value} value={value}>{value} ảnh</option>)}
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Độ phân giải</h4><span className={styles.fieldHint}>{imageModel === "gpt" ? "1K / 2K / 4K" : "Seedream chỉ hỗ trợ 1K"}</span></div>
                      <select value={imageResolution} onChange={(e) => setImageResolution(e.target.value as ImageResolution)} disabled={imageModel !== "gpt"}>
                        {resolutionOptions.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Workflow</h4><span className={styles.fieldHint}>{generationMode === "image" ? "Đang bật ảnh tham chiếu" : "Prompt thuần"}</span></div>
                      <select value={generationMode} onChange={(e) => setGenerationMode(e.target.value as "text" | "image")}>
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
                        {imageModel === "seedream" ? "Seedream 5 Lite đang được khóa về 1K để đúng workflow của model." : "GPT Image 2 hỗ trợ xuất 1K, 2K và 4K."}
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
          </section>

          <section className={styles.statsGrid}>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statPurple}`}>🖼</div><div><small>Ảnh đã tạo</small><h3>{createdImageCount.toLocaleString("vi-VN")}</h3></div><div className={styles.statUp}>↑ 18%</div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statBlue}`}>✨</div><div><small>Model đang dùng</small><h3>{imageModel === "gpt" ? "GPT" : "Lite"}</h3></div><div className={styles.statUp}>↑ 9%</div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statOrange}`}>⚡</div><div><small>Credits còn lại</small><h3>{formatCredits(credits)}</h3><div className={styles.progressTrack}><span style={{ width: `${progressWidth}%` }} /></div></div></article>
            <article className={styles.statCard}><div className={`${styles.statIcon} ${styles.statGreen}`}>📁</div><div><small>Dự án đã lưu</small><h3>{projectCount.toLocaleString("vi-VN")}</h3></div><div className={styles.statUp}>↑ 6%</div></article>
          </section>

          <section className={styles.contentGrid} id="recent">
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <h2>{activeTab === "result" ? "Kết quả & sản phẩm gần đây" : "Lịch sử tạo ảnh"}</h2>
                <div className={styles.segmentTabs}>
                  <button type="button" className={`${styles.segmentTab} ${activeTab === "result" ? styles.segmentTabActive : ""}`} onClick={() => setActiveTab("result")}>Kết quả</button>
                  <button type="button" className={`${styles.segmentTab} ${activeTab === "history" ? styles.segmentTabActive : ""}`} onClick={() => setActiveTab("history")}>Lịch sử</button>
                </div>
              </div>

              {loading ? (
                <div className={styles.loadingBox}><div className={styles.spinner} /><b>Đang tạo ảnh...</b><p>{statusText}</p></div>
              ) : filteredCards.length === 0 ? (
                <div className={styles.emptyState}>{activeTab === "result" ? "Chưa có ảnh kết quả. Hãy nhập prompt và bấm Generate." : "Chưa có lịch sử phù hợp với bộ lọc hiện tại."}</div>
              ) : (
                <div className={`${styles.creationGrid} ${activeTab === "result" ? styles.creationGridCompact : ""}`}>
                  {filteredCards.slice(0, 8).map((item) => (
                    <button key={item.id} type="button" className={styles.creationCard} onClick={() => openUrls(item.urls)}>
                      <div className={styles.creationThumb}>
                        <span className={styles.creationType}>▧</span>
                        <img src={item.thumbUrl} alt={item.title} />
                      </div>
                      <div className={styles.creationMeta}>
                        <strong>{item.title}</strong>
                        <span>{item.meta}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {lightboxUrls ? (
        <div className={styles.lightbox} onClick={() => setLightboxUrls(null)}>
          <button className={styles.lightboxClose} onClick={(e) => { e.stopPropagation(); setLightboxUrls(null); }}>✕</button>
          {lightboxUrls.length > 1 ? <button className={styles.lightboxNav} onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + lightboxUrls.length) % lightboxUrls.length); }}>‹</button> : null}
          <img src={lightboxUrls[lightboxIndex]} alt="preview" className={styles.lightboxMedia} onClick={(e) => e.stopPropagation()} />
          {lightboxUrls.length > 1 ? <button className={styles.lightboxNav} onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i + 1) % lightboxUrls.length); }}>›</button> : null}
        </div>
      ) : null}
    </div>
  );
}













