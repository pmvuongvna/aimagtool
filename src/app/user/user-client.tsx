"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AIServiceId, CreateTaskInput, ImageResolution } from "@/lib/ai/types";
import { apiFetch, apiPath } from "@/lib/api-url";
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
};

type CardItem = {
  id: string;
  title: string;
  meta: string;
  thumbUrl: string;
  urls: string[];
  createdAt: string;
};

const CACHE_KEY = "aistudio_user_dashboard_cache_v1";
const templates = [
  { title: "YouTube Thumbnail", ratio: "16:9", image: "https://images.unsplash.com/photo-1611162616475-46b635cb6868?auto=format&fit=crop&w=300&q=80" },
  { title: "Product Showcase", ratio: "1:1", image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=300&q=80" },
  { title: "Instagram Post", ratio: "1:1", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&q=80" },
  { title: "Fantasy Art", ratio: "16:9", image: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=300&q=80" },
  { title: "Short Video Ad", ratio: "9:16", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80" },
];
const styleCards = [
  { title: "Cinematic", image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=300&q=80" },
  { title: "Realistic", image: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=300&q=80" },
  { title: "Anime", image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=300&q=80" },
  { title: "3D Render", image: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=300&q=80" },
];

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
  const [resultAspectRatio, setResultAspectRatio] = useState("16:9");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

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
      const base: DashboardCache = raw ? (JSON.parse(raw) as DashboardCache) : { userId: "", userName: "User", credits: 0, costPreview: null, history: [], packages: [] };
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
  }, [router]);

  useEffect(() => {
    if (generationMode === "image") {
      setShowAdvancedSettings(true);
    }
  }, [generationMode]);

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
    setResultAspectRatio(aspectRatio);
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
  const activityItems = historyCards.slice(0, 4);
  const progressWidth = Math.max(8, Math.min(100, Math.round((credits / Math.max(credits + (currentCost || 0), 1000)) * 100)));
  const createdImageCount = history.reduce((sum, item) => sum + item.urls.length, 0) + resultUrls.length;
  const projectCount = history.length;
  const activePackage = packages[0];

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
            <a className={styles.navItem} href="#templates"><span className={styles.navIcon}>▦</span><span className={styles.navText}>Mẫu có sẵn</span></a>
            <a className={styles.navItem} href="#recent"><span className={styles.navIcon}>↺</span><span className={styles.navText}>Lịch sử</span></a>
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
            </div>

            <form onSubmit={onGenerate}>
              <div className={styles.promptBox}>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, 1000))} placeholder="Mô tả nội dung anh muốn tạo... Ví dụ: poster sản phẩm, phong cách cinematic, ánh sáng cao cấp." />
                <div className={styles.promptSide}>
                  <button type="button" className={styles.magicBtn}>✦</button>
                  <span>{prompt.length} / 1000</span>
                </div>
              </div>

              <div className={styles.controlsCompact}>
                <button
                  type="button"
                  className={`${styles.settingButton} ${styles.settingAspect}`}
                  onClick={() => setAspectRatio(aspectOptions[(aspectOptions.indexOf(aspectRatio) + 1) % aspectOptions.length])}
                >
                  <div className={styles.controlSelectIcon}>▭</div>
                  <div>
                    <small>Tỷ lệ ảnh</small>
                    <strong>{aspectRatio}</strong>
                  </div>
                </button>

                <button
                  type="button"
                  className={`${styles.settingButton} ${styles.settingStyle}`}
                  onClick={() => setActiveStyle(styleOptions[(styleOptions.indexOf(activeStyle) + 1) % styleOptions.length])}
                >
                  <div className={styles.controlSelectIcon}>✺</div>
                  <div>
                    <small>Phong cách</small>
                    <strong>{activeStyle}</strong>
                  </div>
                </button>

                <button
                  type="button"
                  className={`${styles.settingButton} ${styles.settingModel}`}
                  onClick={() => {
                    const nextModel = imageModel === "gpt" ? "seedream" : "gpt";
                    setImageModel(nextModel);
                    if (nextModel === "seedream") setImageResolution("1k");
                    if (nextModel === "gpt" && imageResolution === "1k") setImageResolution("2k");
                  }}
                >
                  <div className={styles.controlSelectIcon}>▤</div>
                  <div>
                    <small>Model</small>
                    <strong>{imageModel === "gpt" ? "GPT Image 2" : "Seedream 5 Lite"}</strong>
                  </div>
                </button>

                <button
                  type="button"
                  className={`${styles.settingButton} ${styles.settingMode} ${generationMode === "image" ? styles.settingButtonActive : ""}`}
                  onClick={() => setGenerationMode(generationMode === "text" ? "image" : "text")}
                >
                  <div className={styles.controlSelectIcon}>🖼</div>
                  <div>
                    <small>Chế độ tạo</small>
                    <strong>{generationMode === "text" ? "Text to Image" : "Image to Image"}</strong>
                  </div>
                </button>

                <button type="button" className={styles.advancedToggle} onClick={() => setShowAdvancedSettings((prev) => !prev)}>
                  {showAdvancedSettings ? "Ẩn Advanced" : "Advanced settings"}
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
                <button className={styles.generateBtn} type="submit" disabled={loading || !canGenerate}>{loading ? "Đang tạo..." : `✨ Generate · ${formatCredits(currentCost ?? 0)}`}</button>
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
                      <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value.slice(0, 1000))} placeholder="Những gì anh không muốn xuất hiện trong ảnh" />
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
                <div className={styles.creationGrid}>
                  {filteredCards.slice(0, 8).map((item) => (
                    <button key={item.id} type="button" className={styles.creationCard} onClick={() => openUrls(item.urls)}>
                      <div className={`${styles.creationThumb} ${styles.creationThumbContain}`} style={activeTab === "result" && item.urls.length === 1 ? { aspectRatio: resultAspectRatio } : undefined}>
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

            <div className={styles.panel}>
              <div className={styles.panelHead}><h2>Hoạt động gần đây</h2></div>
              <div className={styles.activityList}>
                {activityItems.length === 0 ? (
                  <div className={styles.emptyState}>Chưa có hoạt động nào được lưu.</div>
                ) : activityItems.map((item) => (
                  <button key={item.id} type="button" className={styles.activityItem} onClick={() => openUrls(item.urls)}>
                    <div className={styles.activityImg}><img src={item.thumbUrl} alt={item.title} /></div>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </div>
                    <time>{new Date(item.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>
                  </button>
                ))}
              </div>
              <button type="button" className={styles.fullBtn} onClick={() => setActiveTab("history")}>Xem toàn bộ hoạt động</button>
            </div>
          </section>

          <section className={styles.bottomGrid}>
            <div className={styles.panel} id="templates">
              <div className={styles.panelHead}><h2>Mẫu tạo nhanh</h2><button type="button" className={styles.viewBtn}>Xem tất cả</button></div>
              <div className={styles.templates}>
                {templates.map((item) => (
                  <div key={item.title} className={styles.templateCard}>
                    <div className={styles.templateImg} style={{ backgroundImage: `url(${item.image})` }} />
                    <div className={styles.templateBody}><strong>{item.title}</strong><span>{item.ratio}</span></div>
                  </div>
                ))}
                <div className={styles.customSize}><div><b>+</b><strong>Custom Size</strong><br /><span>Tự chọn kích thước</span></div></div>
              </div>
            </div>

            <div className={styles.panel} id="styles">
              <div className={styles.panelHead}><h2>Phong cách phổ biến</h2><button type="button" className={styles.viewBtn}>Xem tất cả</button></div>
              <div className={styles.stylesGrid}>
                {styleCards.map((item) => (
                  <div key={item.title} className={styles.styleCard} style={{ backgroundImage: `url(${item.image})` }}><strong>{item.title}</strong></div>
                ))}
              </div>
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




