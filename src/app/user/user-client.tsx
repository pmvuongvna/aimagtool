"use client";
import { GenerationActivity } from "@/components/generation-activity";
import { StudioTabs } from "@/components/studio-tabs";

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
import type { AIServiceId, CreateTaskInput, ImageBackground, ImageOutputFormat, ImageResolution, ImageSize } from "@/lib/ai/types";
import { apiFetch, apiPath } from "@/lib/api-url";
import { StudioNavigation } from "@/components/studio-navigation";
import styles from "./generate.module.css";

type TaskResponse = { data?: { taskId?: string }; error?: string; creditCost?: number; remainingCredits?: number };
type ProfileResponse = { userId: string; credits: number; previewCosts: { nanoBanana21: Record<ImageResolution, number>; gpt25Flare: Record<ImageResolution, number>; gpt25Sunburst: Record<ImageResolution, number>; imageEditExtraCost: number; image1k: number; image2k: number; image4k: number; imageEdit1k: number; imageEdit2k: number; imageEdit4k: number; qwen21Text1k: number; qwen21Text2k: number; qwen21Image1k: number; qwen21Image2k: number; seedream5FlashText1k: number; seedream5FlashText15k: number; seedream5FlashText2k: number; seedream5FlashImage1k: number; seedream5FlashImage15k: number; seedream5FlashImage2k: number } };
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
type ImageModelId = "gpt" | "gptSunburst" | "nanoBanana21" | "seedream" | "seedream5flash" | "qwen3" | "qwen2";
type ImageModelOption = {
  id: ImageModelId;
  label: string;
  description: string;
  textServiceId: AIServiceId;
  imageServiceId?: AIServiceId;
  aspectRatios: string[];
  imageAspectRatios?: string[];
  resolutions: ImageSize[];
};

const CACHE_KEY = "aistudio_user_dashboard_cache_v1";
const defaultAspectOptions = ["1:1", "16:9", "4:3", "3:4", "9:16"];
const nanoBanana21AspectOptions = ["auto", "1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5", "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"];
const gpt25AspectOptions = ["auto", "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9", "27:16", "16:27", "9:8", "8:9"];
const qwen21AspectOptions = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "9:21"];
const seedream5FlashAspectOptions = ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"];
const styleOptions = ["Cinematic", "Ảnh thực", "Anime", "3D Render", "Editorial"];
const quantityOptions = [1, 2];
const resolutionOptions: ImageResolution[] = ["1k", "2k", "4k"];
const QWEN_PROMPT_MAX_LENGTH = 5000;
const IMAGE_MODELS: ImageModelOption[] = [
  { id: "nanoBanana21", label: "Nano Banana 2.1", description: "Google image generation and multi-reference editing", textServiceId: "nano-banana-2-1-text", imageServiceId: "nano-banana-2-1-image", aspectRatios: nanoBanana21AspectOptions, resolutions: resolutionOptions },
  { id: "gpt", label: "GPT Image 2.5 Flare", description: "Fast generation and reference editing", textServiceId: "gpt-image-2-5-flare-text", imageServiceId: "gpt-image-2-5-flare-image", aspectRatios: gpt25AspectOptions, resolutions: resolutionOptions },
  { id: "gptSunburst", label: "GPT Image 2.5 Sunburst", description: "Refined generation and precise editing", textServiceId: "gpt-image-2-5-sunburst-text", imageServiceId: "gpt-image-2-5-sunburst-image", aspectRatios: gpt25AspectOptions, resolutions: resolutionOptions },
  { id: "seedream", label: "Seedream 5 Lite", description: "Fast creative rendering", textServiceId: "seedream-5-lite-text", imageServiceId: "seedream-5-lite-image", aspectRatios: defaultAspectOptions, resolutions: resolutionOptions },
  { id: "seedream5flash", label: "Seedream 5 Flash", description: "Fast generation and multi-image editing", textServiceId: "seedream-5-flash-text", imageServiceId: "seedream-5-flash-image", aspectRatios: seedream5FlashAspectOptions, resolutions: ["1k", "1.5k", "2k"] },
  { id: "qwen3", label: "Qwen3 Pro", description: "Detailed professional output", textServiceId: "qwen3-pro-text", imageServiceId: "qwen3-pro-image", aspectRatios: defaultAspectOptions, resolutions: resolutionOptions },
  { id: "qwen2", label: "Qwen 2.1", description: "Text, reference and local image editing", textServiceId: "qwen2-1-text", imageServiceId: "qwen2-1-image", aspectRatios: qwen21AspectOptions, imageAspectRatios: ["auto", ...qwen21AspectOptions], resolutions: ["1k", "2k"] },
];
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

function getImageModel(modelId: ImageModelId) {
  return IMAGE_MODELS.find((model) => model.id === modelId) || IMAGE_MODELS[0];
}

function parseReferenceUrls(value: string, limit = 10) {
  return Array.from(new Set(value.split(/[\n,]/).map((url) => url.trim()).filter(Boolean))).slice(0, limit);
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
  const [imageModel, setImageModel] = useState<ImageModelId>("gpt");
  const [generationMode, setGenerationMode] = useState<"text" | "image">("text");
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [maskUrl, setMaskUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [quantity, setQuantity] = useState(1);
  const [imageResolution, setImageResolution] = useState<ImageSize>("2k");
  const [imageBackground, setImageBackground] = useState<ImageBackground>("opaque");
  const [imageOutputFormat, setImageOutputFormat] = useState<ImageOutputFormat>("png");
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [imageSeed, setImageSeed] = useState(0);
  const [imageNsfwChecker, setImageNsfwChecker] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [activeStyle, setActiveStyle] = useState("Cinematic");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [openControl, setOpenControl] = useState<ControlDropdown>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [taskId, setTaskId] = useState("");
  const [statusText, setStatusText] = useState("Sẵn sàng tạo ảnh.");
  const [loading, setLoading] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [, setPackages] = useState<CreditPackage[]>([]);
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

  const selectedImageModel = getImageModel(imageModel);
  const isGpt25 = imageModel === "gpt" || imageModel === "gptSunburst";
  const isNanoBanana21 = imageModel === "nanoBanana21";
  const referenceLimit = isGpt25 ? 16 : isNanoBanana21 ? 14 : 10;
  const availableResolutions = isGpt25 && ["27:16", "16:27", "9:8", "8:9"].includes(aspectRatio) ? ["1k" as ImageSize] : selectedImageModel.resolutions;
  const supportsImageWorkflow = Boolean(selectedImageModel.imageServiceId);
  const availableAspectRatios = generationMode === "image" && selectedImageModel.imageAspectRatios ? selectedImageModel.imageAspectRatios : selectedImageModel.aspectRatios;
  const validReferenceUrls = referenceUrls.filter((url) => /^https?:\/\//.test(url));
  const supportsMultipleReferences = isGpt25 || isNanoBanana21 || imageModel === "qwen2" || imageModel === "seedream5flash";
  const qwenMaskInvalid = imageModel === "qwen2" && Boolean(maskUrl) && (validReferenceUrls.length !== 1 || imageBackground === "transparent");

  const currentCost = useMemo(() => {
    if (imageModel === "nanoBanana21") { const single = costPreview?.nanoBanana21?.[imageResolution as ImageResolution]; return single === undefined ? null : single * quantity; }
    if (imageModel === "gpt" || imageModel === "gptSunburst") {
      const rates = costPreview?.[imageModel === "gpt" ? "gpt25Flare" : "gpt25Sunburst"];
      const single = rates?.[imageResolution as ImageResolution];
      return single === undefined ? null : (single + (generationMode === "image" ? costPreview?.imageEditExtraCost || 0 : 0)) * quantity;
    }
    if (imageModel === "qwen2") {
      const single = generationMode === "image"
        ? (imageResolution === "2k" ? costPreview?.qwen21Image2k : costPreview?.qwen21Image1k)
        : (imageResolution === "2k" ? costPreview?.qwen21Text2k : costPreview?.qwen21Text1k);
      return typeof single === "number" ? single * quantity : null;
    }
    if (imageModel === "seedream5flash") {
      const sizeKey = imageResolution === "1.5k" ? "15k" : imageResolution === "2k" ? "2k" : "1k";
      const costKey = `seedream5Flash${generationMode === "image" ? "Image" : "Text"}${sizeKey[0].toUpperCase()}${sizeKey.slice(1)}` as keyof ProfileResponse["previewCosts"];
      const single = costPreview?.[costKey];
      return typeof single === "number" ? single * quantity : null;
    }
    const single = generationMode === "image"
      ? (imageResolution === "4k" ? costPreview?.imageEdit4k : imageResolution === "2k" ? costPreview?.imageEdit2k : costPreview?.imageEdit1k)
      : (imageResolution === "4k" ? costPreview?.image4k : imageResolution === "2k" ? costPreview?.image2k : costPreview?.image1k);
    return single ? single * quantity : null;
  }, [costPreview, generationMode, imageModel, imageResolution, quantity]);

  const composedPrompt = composeImagePrompt(prompt, negativePrompt, activeStyle);
  const promptTooLong = isGpt25 || isNanoBanana21 ? composedPrompt.length > 20000 : (imageModel === "qwen3" || imageModel === "qwen2" || imageModel === "seedream5flash") && composedPrompt.length > QWEN_PROMPT_MAX_LENGTH;
  const canGenerate = prompt.trim().length >= 3 && !promptTooLong && !qwenMaskInvalid && availableResolutions.includes(imageResolution) && (generationMode === "text" || (supportsImageWorkflow && validReferenceUrls.length > 0 && (!supportsMultipleReferences || validReferenceUrls.length <= referenceLimit))) && !uploading;

  function changeGenerationMode(nextMode: "text" | "image") {
    setGenerationMode(nextMode);
    if (imageModel === "qwen2") {
      if (nextMode === "image" && !selectedImageModel.imageAspectRatios?.includes(aspectRatio)) setAspectRatio("auto");
      if (nextMode === "text" && aspectRatio === "auto") setAspectRatio("3:2");
    }
    if (nextMode === "image") setShowAdvancedSettings(true);
  }

  function selectImageModel(nextModelId: ImageModelId) {
    const nextModel = getImageModel(nextModelId);
    setImageModel(nextModelId);
    if (!nextModel.imageServiceId) setGenerationMode("text");
    if (nextModelId !== "qwen2" && nextModelId !== "seedream5flash" && nextModelId !== "gpt" && nextModelId !== "gptSunburst" && nextModelId !== "nanoBanana21") {
      setReferenceUrls((current) => current.slice(0, 1));
    }
    else setReferenceUrls((current) => current.slice(0, nextModelId === "gpt" || nextModelId === "gptSunburst" ? 16 : nextModelId === "nanoBanana21" ? 14 : 10));
    if (nextModelId === "nanoBanana21" && imageOutputFormat === "webp") setImageOutputFormat("png");
    if (nextModelId !== "gpt" && nextModelId !== "gptSunburst" && imageBackground === "auto") setImageBackground("opaque");
    if (nextModelId !== "qwen2") {
      setMaskUrl("");
    }
    if (nextModelId === "seedream5flash" && imageOutputFormat === "webp") setImageOutputFormat("jpeg");
    if (!nextModel.resolutions.includes(imageResolution)) setImageResolution(nextModel.resolutions[nextModel.resolutions.length - 1]);
    const nextAspectRatios = generationMode === "image" && nextModel.imageAspectRatios ? nextModel.imageAspectRatios : nextModel.aspectRatios;
    if (!nextAspectRatios.includes(aspectRatio)) setAspectRatio(nextAspectRatios.includes("16:9") ? "16:9" : nextAspectRatios[0]);
    if (nextModelId === "qwen2" || nextModelId === "qwen3" || nextModelId === "seedream5flash") setShowAdvancedSettings(true);
    setOpenControl(null);
  }

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

  const refreshGenerationHistory = useCallback(() => {
    void apiFetch(apiPath("/api/user/history"), { cache: "no-store" }).then(async (response) => {
      if (response.ok) { const data = await response.json() as { items?: HistoryItem[] }; setHistory(data.items || []); }
    }).catch(() => {});
  }, []);
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

  async function uploadImageFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch(apiPath("/api/ai/upload"), { method: "POST", body: fd });
    const payload = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !payload.url) throw new Error(payload.error || "Upload thất bại.");
    return payload.url;
  }

  async function handleReferenceUploads(files: File[]) {
    if (!files.length) return;
    const remainingSlots = supportsMultipleReferences ? Math.max(0, referenceLimit - referenceUrls.length) : 1;
    const selectedFiles = files.slice(0, remainingSlots);
    if (!selectedFiles.length) {
      setStatusText(`${selectedImageModel.label} hỗ trợ tối đa ${referenceLimit} ảnh tham chiếu.`);
      return;
    }
    setUploading(true);
    setStatusText(`Đang upload ${selectedFiles.length} ảnh tham chiếu...`);
    try {
      const uploadedUrls: string[] = [];
      for (const file of selectedFiles) {
        if ((isGpt25 || isNanoBanana21) && file.size > 30 * 1024 * 1024) throw new Error("Ảnh tham chiếu tối đa 30MB.");
        uploadedUrls.push(await uploadImageFile(file));
      }
      setReferenceUrls((current) => supportsMultipleReferences ? Array.from(new Set([...current, ...uploadedUrls])).slice(0, referenceLimit) : [uploadedUrls[0]]);
      setStatusText(`Đã upload ${uploadedUrls.length} ảnh tham chiếu.`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Upload thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function handleMaskUpload(file: File) {
    setUploading(true);
    setStatusText("Đang upload mask...");
    try {
      const url = await uploadImageFile(file);
      setMaskUrl(url);
      setImageBackground("opaque");
      setStatusText("Đã upload mask chỉnh sửa cục bộ.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Upload mask thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!canGenerate) return;
    const serviceId = generationMode === "image" ? selectedImageModel.imageServiceId : selectedImageModel.textServiceId;
    if (!serviceId) {
      setStatusText(`${selectedImageModel.label} chỉ hỗ trợ Text to Image.`);
      return;
    }
    const batchId = crypto.randomUUID();
    setActiveBatchId(batchId);
    setLoading(true);
    setResultUrls([]);
    setStatusText("Đang tạo ảnh...");

    const body: CreateTaskInput = {
      serviceId,
      prompt: composedPrompt,
      aspectRatio,
      imageResolution: imageResolution === "1.5k" ? undefined : imageResolution as ImageResolution,
      imageSize: imageModel === "seedream5flash" ? imageResolution : undefined,
      inputUrl: generationMode === "image" ? validReferenceUrls[0] : undefined,
      inputUrls: generationMode === "image" && supportsMultipleReferences ? validReferenceUrls : undefined,
      maskUrl: generationMode === "image" && imageModel === "qwen2" ? maskUrl || undefined : undefined,
      ...(isGpt25 ? { imageBackground } : {}),
      ...(isNanoBanana21 ? { imageOutputFormat: imageOutputFormat === "png" ? "png" : "jpeg" } : {}),
      ...(imageModel === "qwen2" ? {
        imageBackground,
        imageOutputFormat,
        enhancePrompt,
        seed: imageSeed,
        nsfwChecker: imageNsfwChecker,
      } : {}),
      ...(imageModel === "seedream5flash" ? {
        imageOutputFormat: imageOutputFormat === "png" ? "png" : "jpeg",
        nsfwChecker: imageNsfwChecker,
      } : {}),
    };

    const taskIds: string[] = [];
    for (let i = 0; i < quantity; i += 1) {
      const res = await apiFetch(apiPath("/api/ai/create-task"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId, "x-idempotency-key": crypto.randomUUID(), "x-generation-batch-id": batchId },
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
    meta: `${selectedImageModel.label} · ${imageResolution.toUpperCase()} · ${aspectRatio}`,
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
            <Link href="/user/credits" className={styles.sidebarUtility}>
              <Crown size={18} />
              <span>Nạp credit</span>
              <ChevronRight size={15} />
            </Link>
            <div className={styles.sidebarUser} id="account">
              <span className={styles.userAvatar}><UserRound size={18} /></span>
              <span className={styles.sidebarUserCopy}>
                <strong>{userName}</strong>
                <small>Credit wallet</small>
              </span>
              <button type="button" onClick={handleLogout} aria-label="Đăng xuất"><LogOut size={16} /></button>
            </div>
          </div>
        </aside>

        <main className={`${styles.main} ${styles.imageStudioMain}`} id="dashboard">
          <header className={styles.imageTopbar}>
            <div className={styles.topActions}>
              <Link href="/user/credits" className={styles.creditsPill}><Coins size={16} aria-hidden="true" /> {formatCredits(credits)} Credits</Link>
              <button type="button" className={styles.iconBtn} aria-label="Thông báo"><Bell size={17} aria-hidden="true" /><span className={styles.iconDot} /></button>
              <Link href="/user/credits" className={styles.upgradeButton}><Crown size={17} /> Nạp credit</Link>
            </div>
          </header>

          <section className={styles.imageHero}>
            <span className={styles.heroEyebrow}>AI Creative Studio</span>
            <h1>Biến ý tưởng thành<br />hình ảnh ấn tượng cùng <em>AI</em></h1>
            <p>Tạo hình ảnh và video chất lượng cao từ mô tả của anh trong vài giây.</p>
          </section>

          <section className={styles.generator} id="generator">
            <StudioTabs active="image" />

            <GenerationActivity key={activeBatchId || "restored-image"} activeBatchId={activeBatchId} mediaType="image" creating={loading} onRefresh={refreshGenerationHistory} />
            <form onSubmit={onGenerate}>
              <div className={styles.imageComposer} ref={controlsRef}>
                <div className={styles.promptBox}>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Mô tả điều anh muốn tạo..." />
                  <span className={styles.promptCount}>{isGpt25 || isNanoBanana21 ? `${composedPrompt.length}/20000` : imageModel === "qwen3" || imageModel === "qwen2" || imageModel === "seedream5flash" ? `${composedPrompt.length}/${QWEN_PROMPT_MAX_LENGTH}` : prompt.length}</span>
                </div>

                <div className={styles.composerToolbar}>
                  <div className={styles.optionCluster}>
                    <button
                      type="button"
                      className={`${styles.toolbarButton} ${generationMode === "image" ? styles.toolbarButtonActive : ""}`}
                      disabled={!supportsImageWorkflow}
                      title={supportsImageWorkflow ? "Dùng ảnh tham chiếu" : `${selectedImageModel.label} chỉ hỗ trợ Text to Image`}
                      onClick={() => {
                        changeGenerationMode(generationMode === "image" ? "text" : "image");
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
                      {availableAspectRatios.map((value) => (
                        <button key={value} type="button" className={`${styles.settingMenuItem} ${aspectRatio === value ? styles.settingMenuItemActive : ""}`} onClick={() => { setAspectRatio(value); if (isGpt25 && ["27:16", "16:27", "9:8", "8:9"].includes(value)) setImageResolution("1k"); setOpenControl(null); }}>
                          {value === "auto" ? "Tự động" : value}
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
                    <span>{selectedImageModel.label}</span>
                  </button>
                  {openControl === "model" ? (
                    <div className={`${styles.settingMenu} ${styles.modelChoiceMenu}`}>
                      {IMAGE_MODELS.map((model) => {
                        const ModelIcon = model.id === "gpt" ? Sparkles : model.id === "seedream" || model.id === "seedream5flash" ? WandSparkles : Images;
                        const toneClass = model.id === "gpt" ? styles.modelChoiceTeal : model.id === "seedream" ? styles.modelChoiceViolet : model.id === "seedream5flash" ? styles.modelChoiceBlue : model.id === "qwen3" ? styles.modelChoiceAmber : styles.modelChoiceBlue;
                        return (
                          <button key={model.id} type="button" className={`${styles.modelChoiceOption} ${toneClass} ${imageModel === model.id ? styles.modelChoiceActive : ""}`} onClick={() => selectImageModel(model.id)}>
                            <span><ModelIcon size={16} /></span><div><strong>{model.label}{model.id === "seedream5flash" ? <em>MỚI</em> : null}</strong><small>{model.description}</small></div>
                          </button>
                        );
                      })}
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
                        setReferenceUrls([]);
                        setMaskUrl("");
                        setActiveStyle("Cinematic");
                        changeGenerationMode("text");
                        setAspectRatio("16:9");
                        setQuantity(1);
                        setImageResolution("2k");
                        setImageBackground("opaque");
                        setImageOutputFormat("png");
                        setEnhancePrompt(true);
                        setImageSeed(0);
                        setImageNsfwChecker(false);
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
                      <div className={styles.fieldBlockHeader}><h4>Độ phân giải</h4><span className={styles.fieldHint}>{imageModel === "seedream5flash" ? "1K / 1.5K / 2K" : imageModel === "qwen2" ? "1K / 2K" : imageModel === "seedream" ? "Basic 2K / High 3K / Ultra 4K" : "1K / 2K / 4K"}</span></div>
                      <select value={imageResolution} onChange={(e) => setImageResolution(e.target.value as ImageSize)}>
                        {availableResolutions.map((value) => <option key={value} value={value}>{imageModel === "seedream" ? (value === "1k" ? "Basic (2K)" : value === "2k" ? "High (3K)" : "Ultra (4K)") : value.toUpperCase()}</option>)}
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <div className={styles.fieldBlockHeader}><h4>Workflow</h4><span className={styles.fieldHint}>{generationMode === "image" ? "Đang bật ảnh tham chiếu" : "Prompt thuần"}</span></div>
                      <select value={generationMode} onChange={(e) => changeGenerationMode(e.target.value as "text" | "image")}>
                        <option value="text">Text to Image</option>
                        <option value="image" disabled={!supportsImageWorkflow}>Image to Image{supportsImageWorkflow ? "" : " (không hỗ trợ)"}</option>
                      </select>
                    </div>

                    {isNanoBanana21 ? <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Định dạng</h4></div><select value={imageOutputFormat === "png" ? "png" : "jpeg"} onChange={(e) => setImageOutputFormat(e.target.value as ImageOutputFormat)}><option value="png">PNG</option><option value="jpeg">JPG</option></select></div> : null}
                    {isGpt25 ? <div className={styles.fieldBlock}><div className={styles.fieldBlockHeader}><h4>Nền ảnh</h4></div><select value={imageBackground} onChange={(e) => setImageBackground(e.target.value as ImageBackground)}><option value="opaque">Nền thông thường</option><option value="transparent">Nền trong suốt</option><option value="auto">Tự động</option></select></div> : null}
                    {imageModel === "qwen2" ? (
                      <>
                        <div className={styles.fieldBlock}>
                          <div className={styles.fieldBlockHeader}><h4>Nền ảnh</h4><span className={styles.fieldHint}>Có thể xuất alpha thật</span></div>
                          <select value={imageBackground} onChange={(e) => {
                            const nextBackground = e.target.value as ImageBackground;
                            setImageBackground(nextBackground);
                            if (nextBackground === "transparent" && imageOutputFormat === "jpeg") setImageOutputFormat("png");
                          }}>
                            <option value="opaque">Nền thông thường</option>
                            <option value="transparent" disabled={Boolean(maskUrl)}>Nền trong suốt{maskUrl ? " (không dùng với mask)" : ""}</option>
                          </select>
                        </div>

                        <div className={styles.fieldBlock}>
                          <div className={styles.fieldBlockHeader}><h4>Định dạng</h4><span className={styles.fieldHint}>PNG, WebP hoặc JPEG</span></div>
                          <select value={imageOutputFormat} onChange={(e) => setImageOutputFormat(e.target.value as ImageOutputFormat)}>
                            <option value="png">PNG</option>
                            <option value="webp">WebP</option>
                            <option value="jpeg" disabled={imageBackground === "transparent"}>JPEG</option>
                          </select>
                        </div>

                        <div className={styles.fieldBlock}>
                          <div className={styles.fieldBlockHeader}><h4>Seed</h4><span className={styles.fieldHint}>0 để dùng mặc định</span></div>
                          <input type="number" min={0} step={1} value={imageSeed} onChange={(e) => setImageSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
                        </div>

                        <div className={`${styles.fieldBlock} ${styles.qwenOptionBlock}`}>
                          <div className={styles.fieldBlockHeader}><h4>Tối ưu model</h4><span className={styles.fieldHint}>Áp dụng riêng cho Qwen 2.1</span></div>
                          <label className={styles.toggleRow}>
                            <span><strong>Enhance prompt</strong><small>AI mở rộng mô tả để tăng chất lượng ảnh.</small></span>
                            <input type="checkbox" checked={enhancePrompt} onChange={(e) => setEnhancePrompt(e.target.checked)} />
                          </label>
                          <label className={styles.toggleRow}>
                            <span><strong>Kiểm duyệt nội dung</strong><small>Mặc định tắt, có thể bật cho từng tác vụ.</small></span>
                            <input type="checkbox" checked={imageNsfwChecker} onChange={(e) => setImageNsfwChecker(e.target.checked)} />
                          </label>
                        </div>
                      </>
                    ) : null}

                    {imageModel === "seedream5flash" ? (
                      <>
                        <div className={styles.fieldBlock}>
                          <div className={styles.fieldBlockHeader}><h4>Định dạng</h4><span className={styles.fieldHint}>PNG hoặc JPEG</span></div>
                          <select value={imageOutputFormat === "png" ? "png" : "jpeg"} onChange={(e) => setImageOutputFormat(e.target.value as ImageOutputFormat)}>
                            <option value="jpeg">JPEG</option>
                            <option value="png">PNG</option>
                          </select>
                        </div>
                        <div className={`${styles.fieldBlock} ${styles.qwenOptionBlock}`}>
                          <div className={styles.fieldBlockHeader}><h4>Kiểm duyệt</h4><span className={styles.fieldHint}>Áp dụng riêng cho Seedream 5 Flash</span></div>
                          <label className={styles.toggleRow}>
                            <span><strong>NSFW checker</strong><small>Mặc định tắt, có thể bật cho từng tác vụ.</small></span>
                            <input type="checkbox" checked={imageNsfwChecker} onChange={(e) => setImageNsfwChecker(e.target.checked)} />
                          </label>
                        </div>
                      </>
                    ) : null}

                    {generationMode === "image" ? (
                      <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}>
                        <div className={styles.fieldBlockHeader}><h4>Ảnh tham chiếu</h4><span className={styles.fieldHint}>{uploading ? "Đang upload..." : `${validReferenceUrls.length}/${supportsMultipleReferences ? referenceLimit : 1} ảnh`}</span></div>
                        <div className={styles.uploadRow}>
                          <input type="file" accept="image/jpeg,image/png,image/webp" multiple={supportsMultipleReferences} onChange={(e) => void handleReferenceUploads(Array.from(e.target.files || []))} />
                          {supportsMultipleReferences ? (
                            <textarea rows={3} value={referenceUrls.join("\n")} onChange={(e) => setReferenceUrls(parseReferenceUrls(e.target.value, referenceLimit))} placeholder={`Mỗi URL ảnh trên một dòng, tối đa ${referenceLimit} ảnh`} />
                          ) : (
                            <input value={referenceUrls[0] || ""} onChange={(e) => setReferenceUrls(e.target.value.trim() ? [e.target.value] : [])} placeholder="https://... (URL sau khi upload)" />
                          )}
                        </div>
                        {validReferenceUrls.length ? (
                          <div className={styles.referenceGrid}>
                            {validReferenceUrls.map((url, index) => (
                              <div className={styles.referenceThumb} key={`${url}-${index}`}>
                                <img src={url} alt={`Ảnh tham chiếu ${index + 1}`} />
                                <button type="button" aria-label={`Bỏ ảnh tham chiếu ${index + 1}`} onClick={() => setReferenceUrls((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {imageModel === "qwen2" ? (
                          <div className={styles.maskEditor}>
                            <div className={styles.fieldBlockHeader}><h4>Mask chỉnh sửa cục bộ</h4><span className={styles.fieldHint}>Không bắt buộc, cần đúng 1 ảnh tham chiếu</span></div>
                            <div className={styles.uploadRow}>
                              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleMaskUpload(file); }} />
                              <input value={maskUrl} onChange={(e) => { const nextUrl = e.target.value; setMaskUrl(nextUrl); if (nextUrl.trim()) setImageBackground("opaque"); }} placeholder="https://... URL mask đen trắng" />
                            </div>
                            {maskUrl ? (
                              <div className={styles.maskPreview}>
                                <img src={maskUrl} alt="Mask chỉnh sửa cục bộ" />
                                <button type="button" onClick={() => setMaskUrl("")}><X size={14} /> Bỏ mask</button>
                              </div>
                            ) : null}
                            {qwenMaskInvalid ? <p className={styles.validationNote}>Mask chỉ dùng với đúng một ảnh tham chiếu và nền thông thường.</p> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className={`${styles.fieldBlock} ${styles.advancedPanelWide}`}>
                      <div className={styles.fieldBlockHeader}><h4>Prompt nâng cao</h4><span className={styles.fieldHint}>Negative prompt</span></div>
                      <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="Những gì anh không muốn xuất hiện trong ảnh" />
                      <div style={{ marginTop: 10 }} className={styles.subtleNote}>
                        {isNanoBanana21 ? "Nano Banana 2.1: tối đa 14 ảnh tham chiếu, 30MB mỗi ảnh; hỗ trợ 1K/2K/4K và JPG/PNG." : imageModel === "seedream5flash" ? "Seedream 5 Flash hỗ trợ Text to Image và Image to Image với nhiều ảnh tham chiếu, kích thước 1K/1.5K/2K và NSFW checker mặc định tắt." : imageModel === "qwen2" ? "Qwen 2.1 hỗ trợ Text to Image và Image to Image với tối đa 10 ảnh tham chiếu. Mask chuyển sang chỉnh sửa cục bộ; NSFW checker mặc định tắt." : imageModel === "qwen3" ? "Qwen3 Pro hỗ trợ Text to Image và Image to Image theo Kie.ai; Image to Image cần ảnh tham chiếu." : imageModel === "seedream" ? "Seedream 5 Lite dùng quality basic/high/ultra tương ứng 2K/3K/4K theo Kie.ai." : "GPT Image 2.5: tối đa 16 ảnh tham chiếu. Tỷ lệ 27:16, 16:27, 9:8 và 8:9 chỉ hỗ trợ 1K. Sunburst nền trong suốt ở 2K/4K cần prompt mô tả chủ thể tách nền, không cảnh nền hoặc bóng."}
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

            {filteredCards.length === 0 ? (
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



