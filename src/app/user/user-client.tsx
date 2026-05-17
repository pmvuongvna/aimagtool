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

export default function UserClient({ initialPrompt }: { initialPrompt: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState("demo-user");
  const [userName, setUserName] = useState("User");
  const [credits, setCredits] = useState(0);
  const [costPreview, setCostPreview] = useState<ProfileResponse["previewCosts"] | null>(null);

  const [prompt, setPrompt] = useState(initialPrompt.trim() || "Cô gái đứng trên đỉnh núi, ánh hoàng hôn vàng cam, siêu thực, cinematic.");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [imageModel, setImageModel] = useState<"gpt" | "seedream">("gpt");
  const [modelOpen, setModelOpen] = useState(false);
  const [generationMode, setGenerationMode] = useState<"text" | "image">("text");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quantity, setQuantity] = useState(2);
  const [imageResolution, setImageResolution] = useState<ImageResolution>("2k");
  const [activeTab, setActiveTab] = useState<"create" | "history">("create");
  const [activeStyle, setActiveStyle] = useState("Ảnh thực");
  const [resultAspectRatio, setResultAspectRatio] = useState("1:1");

  const [taskId, setTaskId] = useState("");
  const [statusText, setStatusText] = useState("Sẵn sàng tạo ảnh.");
  const [loading, setLoading] = useState(false);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [clientNow, setClientNow] = useState("");

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
    setClientNow(new Date().toLocaleString("vi-VN"));
  }, []);

  useEffect(() => {
    async function loadProfile() {
      const res = await apiFetch(apiPath(`/api/user/profile?userId=${encodeURIComponent(userId)}`));
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
      const res = await apiFetch(apiPath("/api/public/credit-packages"));
      if (!res.ok) return;
      const payload = (await res.json()) as { packages?: CreditPackage[] };
      setPackages(payload.packages || []);
    }
    void loadPackages();
  }, []);

  useEffect(() => {
    async function loadHistory() {
      const res = await apiFetch(apiPath(`/api/user/history?userId=${encodeURIComponent(userId)}`));
      if (!res.ok) return;
      const data = (await res.json()) as { items?: HistoryItem[] };
      setHistory((data.items || []).filter((x) => x.mediaType === "image"));
    }
    void loadHistory();
  }, [userId]);

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

    const body: CreateTaskInput = {
      serviceId: (
        imageModel === "gpt"
          ? (generationMode === "text" ? "gpt-image-2-text" : "gpt-image-2-image")
          : (generationMode === "text" ? "seedream-5-lite-text" : "seedream-5-lite-image")
      ) as AIServiceId,
      prompt: `${prompt}${negativePrompt.trim() ? `\nNegative prompt: ${negativePrompt.trim()}` : ""}${activeStyle !== "Không chọn" ? `\nStyle: ${activeStyle}` : ""}`,
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
        if (payload.item) setHistory((prev) => [payload.item!, ...prev].slice(0, 24));
      }
    }
  }

  async function handleLogout() {
    await apiFetch(apiPath("/api/auth/logout"), { method: "POST" });
    router.push("/login");
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/"><span className={styles.logo} />AIStudio</Link>
        <nav className={styles.nav}>
          <Link href="/">Trang chủ</Link>
          <a className={styles.active}>Tạo ảnh</a>
          <Link href="/user/video" onMouseEnter={() => router.prefetch("/user/video")}>Tạo video</Link>
          <Link href="/admin">Công cụ AI⌄</Link>
        </nav>
        <div className={styles.topActions}>
          <div className={styles.credit}>▣ {formatCredits(credits)}</div>
          <button className={`${styles.iconBtn} ${styles.hideSm}`} onClick={handleLogout}>⎋</button>
          <div className={styles.avatar} />
          <b>{userName}⌄</b>
        </div>
      </header>

      <main className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === "create" ? styles.activeTab : ""}`} onClick={() => setActiveTab("create")}>▣ Tạo ảnh</button>
            <button className={`${styles.tab} ${activeTab === "history" ? styles.activeTab : ""}`} onClick={() => setActiveTab("history")}>◴ Lịch sử</button>
          </div>

          <form className={styles.form} onSubmit={onGenerate}>
            <div className={styles.field}>
              <label>Mô hình AI</label>
              <button
                type="button"
                className={`${styles.modelCard} ${styles.modelTrigger}`}
                onClick={() => setModelOpen((v) => !v)}
              >
                <img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80" alt="Model" />
                <div>
                  <b>{imageModel === "gpt" ? "GPT Image 2" : "Seedream 5 Lite"}</b>
                  <span>{generationMode === "text" ? "Text to Image" : "Image to Image"}</span>
                </div>
                <span className={styles.badge}>{modelOpen ? "Thu gọn" : "Đang dùng"}</span>
              </button>
              {modelOpen ? (
                <div className={styles.modelDropdown}>
                  <button
                    type="button"
                    className={`${styles.modelOption} ${imageModel === "gpt" ? styles.modelOptionActive : ""}`}
                    onClick={() => {
                      setImageModel("gpt");
                      setModelOpen(false);
                    }}
                  >
                    <b>GPT Image 2</b>
                    <span>Text/Image to Image • hỗ trợ 1K/2K/4K</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.modelOption} ${imageModel === "seedream" ? styles.modelOptionActive : ""}`}
                    onClick={() => {
                      setImageModel("seedream");
                      setImageResolution("1k");
                      setModelOpen(false);
                    }}
                  >
                    <b>Seedream 5 Lite</b>
                    <span>Text/Image to Image • quality basic</span>
                  </button>
                </div>
              ) : null}
            </div>

            <div className={styles.field}>
              <label>Chế độ tạo ảnh</label>
              <div className={styles.optionsTwo}>
                <button type="button" className={`${styles.option} ${generationMode === "text" ? styles.activeOption : ""}`} onClick={() => setGenerationMode("text")}>Text → Image</button>
                <button type="button" className={`${styles.option} ${generationMode === "image" ? styles.activeOption : ""}`} onClick={() => setGenerationMode("image")}>Image → Image</button>
              </div>
            </div>

            {generationMode === "image" ? (
              <div className={styles.field}>
                <label>Ảnh tham chiếu <span className={styles.hint}>bắt buộc</span></label>
                <div className={styles.uploadBox}>
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }} />
                  <input className={styles.urlInput} value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://... (URL sau khi upload)" />
                </div>
              </div>
            ) : null}

            <div className={styles.field}><label>Prompt <span className={styles.hint}>{prompt.length}/1000</span></label><textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, 1000))} /></div>
            <div className={styles.field}><label>Negative Prompt <span className={styles.hint}>tùy chọn</span></label><textarea className={styles.negative} value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value.slice(0, 1000))} placeholder="Nhập những gì bạn không muốn xuất hiện" /></div>
            <div className={styles.field}><label>Tỷ lệ khung hình</label><div className={styles.options}>{["1:1", "16:9", "4:3", "3:4", "9:16"].map((v) => <button key={v} type="button" className={`${styles.option} ${aspectRatio === v ? styles.activeOption : ""}`} onClick={() => setAspectRatio(v)}>{v}</button>)}</div></div>
            <div className={styles.field}><label>Số lượng ảnh</label><div className={styles.optionsTwo}>{[1, 2].map((v) => <button key={v} type="button" className={`${styles.option} ${quantity === v ? styles.activeOption : ""}`} onClick={() => setQuantity(v)}>{v}</button>)}</div></div>

            {imageModel === "gpt" ? (
              <div className={styles.field}><label>Chất lượng</label><div className={styles.optionsThree}><button type="button" className={`${styles.option} ${imageResolution === "1k" ? styles.activeOption : ""}`} onClick={() => setImageResolution("1k")}>1K</button><button type="button" className={`${styles.option} ${imageResolution === "2k" ? styles.activeOption : ""}`} onClick={() => setImageResolution("2k")}>2K</button><button type="button" className={`${styles.option} ${imageResolution === "4k" ? styles.activeOption : ""}`} onClick={() => setImageResolution("4k")}>4K</button></div></div>
            ) : (
              <div className={styles.field}><label>Chất lượng</label><div className={styles.emptyTip}>Seedream 5 Lite dùng tham số quality = basic theo API.</div></div>
            )}

            <div className={styles.field}><label>Phong cách</label><div className={styles.styleGrid}>{[["Không chọn", "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=160&q=80"], ["Ảnh thực", "https://images.unsplash.com/photo-1496440737103-cd596325d314?auto=format&fit=crop&w=160&q=80"], ["Anime", "https://images.unsplash.com/photo-1635322966219-b75ed372eb01?auto=format&fit=crop&w=160&q=80"], ["CGI", "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=160&q=80"], ["Tranh vẽ", "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=160&q=80"]].map(([name, src]) => <button key={name} type="button" className={`${styles.style} ${activeStyle === name ? styles.activeStyle : ""}`} onClick={() => setActiveStyle(name)}><img src={src} alt={name} /><span>{name}</span></button>)}</div></div>
            <button className={styles.generateBtn} type="submit" disabled={loading || !canGenerate}>{loading ? "Đang tạo ảnh..." : `Tạo ảnh ✨   ⚡ ${formatCredits(currentCost ?? 0)}`}</button>
            <div className={styles.hint}>Ước tính trừ: <b>{formatCredits(currentCost ?? 0)} credit</b> cho lần tạo này.</div>
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
            <div className={styles.resultHead}><div className={styles.resultTitle}><h2>{activeTab === "history" ? "Lịch sử" : "Kết quả"}</h2><span className={styles.count}>{activeTab === "history" ? `${history.length} mục` : `${resultUrls.length} ảnh`}</span><span className={styles.hint}>{taskId ? `Task: ${taskId}` : clientNow || "--:--"}</span></div><button className={styles.downloadAll}>⇩ Tải tất cả</button></div>

            {activeTab === "history" ? (
              history.length === 0 ? <div className={styles.emptyTip}>Chưa có lịch sử ảnh.</div> :
              <div className={styles.historyGrid}>
                {history.map((item) => (
                  <button
                    key={item.id}
                    className={styles.historyCard}
                    onClick={() => {
                      setLightboxUrls(item.urls);
                      setLightboxIndex(0);
                    }}
                  >
                    <div className={`${styles.historyPreviewGrid} ${item.urls.length > 1 ? styles.historyPreviewTwo : styles.historyPreviewOne}`}>
                      {item.urls.slice(0, 2).map((url) => (
                        <div key={url} className={styles.historyPreviewItem}>
                          <img src={url} alt="history" />
                        </div>
                      ))}
                    </div>
                    <div className={styles.historyMeta}>
                      <b>{item.urls.length} ảnh</b>
                      <span>{new Date(item.createdAt).toLocaleString("vi-VN")}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : loading ? (
              <div className={styles.loadingBox}><div className={styles.spinner} /><b>Đang tạo ảnh...</b><p>{statusText}</p></div>
            ) : resultUrls.length === 0 ? (
              <div className={styles.emptyTip}>Chưa có ảnh kết quả. Hãy nhập prompt và bấm Tạo ảnh.</div>
            ) : resultUrls.length === 1 ? (
              <div className={styles.imageGridSingle}>
                <button
                  className={`${styles.imageCard} ${styles.resultCard} ${styles.resultButton}`}
                  style={{ aspectRatio: resultAspectRatio }}
                  onClick={() => {
                    setLightboxUrls(resultUrls);
                    setLightboxIndex(0);
                  }}
                >
                  <img src={resultUrls[0]} alt="Generated" className={styles.resultImg} />
                </button>
              </div>
            ) : resultUrls.length <= 2 ? (
              <div className={styles.imageGridTwo}>
                {resultUrls.map((url, index) => (
                  <button
                    key={url}
                    className={`${styles.imageCard} ${styles.resultCard} ${styles.resultButton}`}
                    style={{ aspectRatio: resultAspectRatio }}
                    onClick={() => {
                      setLightboxUrls(resultUrls);
                      setLightboxIndex(index);
                    }}
                  >
                    <img src={url} alt="Generated" className={styles.resultImg} />
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.imageGridFour}>
                {resultUrls.map((url, index) => (
                  <button
                    key={url}
                    className={`${styles.imageCard} ${styles.resultCard} ${styles.resultButton}`}
                    style={{ aspectRatio: resultAspectRatio }}
                    onClick={() => {
                      setLightboxUrls(resultUrls);
                      setLightboxIndex(index);
                    }}
                  >
                    <img src={url} alt="Generated" className={styles.resultImg} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

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




