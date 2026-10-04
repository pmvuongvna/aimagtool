import { createTask } from "@/lib/kie";
import type { AIServiceId, CharacterOrientation, CreateTaskInput, KlingMotionMode, SeedanceVideoResolution } from "./types";

type ServiceConfig = {
  model: string;
  requiresReferenceImage: boolean;
  buildInput: (payload: CreateTaskInput) => Record<string, unknown>;
};

function requirePrompt(prompt: string) {
  const normalized = prompt.trim();
  if (normalized.length < 3) {
    throw new Error("Prompt must be at least 3 characters.");
  }
  return normalized;
}

function requirePromptWithinLimit(prompt: string, maxLength: number, modelName: string) {
  const normalized = requirePrompt(prompt);
  if (normalized.length > maxLength) {
    throw new Error(`${modelName} prompt cannot exceed ${maxLength} characters.`);
  }
  return normalized;
}

function requireHttpUrl(inputUrl?: string, fieldName = "inputUrl") {
  const normalized = inputUrl?.trim();
  if (!normalized || !/^https?:\/\//.test(normalized)) {
    throw new Error(`${fieldName} must be a valid http(s) URL.`);
  }
  return normalized;
}

function requireHttpUrls(inputUrls?: string[], fallbackUrl?: string, modelLabel = "Image to Image") {
  const candidates = inputUrls?.length ? inputUrls : fallbackUrl ? [fallbackUrl] : [];
  if (candidates.length < 1 || candidates.length > 10) {
    throw new Error(`${modelLabel} requires between 1 and 10 reference images.`);
  }
  return candidates.map((url, index) => requireHttpUrl(url, `inputUrls[${index}]`));
}

function normalizeSeedream5FlashAspectRatio(aspectRatio?: string) {
  const allowed = new Set(["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"]);
  return allowed.has(aspectRatio || "") ? aspectRatio : "1:1";
}

function normalizeSeedream5FlashSize(size?: CreateTaskInput["imageSize"]) {
  if (size === "1.5k") return "1.5K";
  return size === "2k" ? "2K" : "1K";
}

function normalizeSeedream5FlashFormat(format?: CreateTaskInput["imageOutputFormat"]) {
  return format === "png" ? "png" : "jpeg";
}

function normalizeDuration(duration?: number) {
  return Math.max(1, Math.min(30, Math.floor(duration || 6)));
}

function normalizeSeedanceDuration(duration?: number) {
  return Math.max(1, Math.min(15, Math.floor(duration || 15)));
}

function mapImageResolution(resolution?: CreateTaskInput["imageResolution"]) {
  if (!resolution) return "1K";
  if (resolution === "1k") return "1K";
  if (resolution === "2k") return "2K";
  return "4K";
}

function mapSeedreamQuality(resolution?: CreateTaskInput["imageResolution"]) {
  if (resolution === "4k") return "ultra";
  if (resolution === "2k") return "high";
  return "basic";
}

function mapQwenImageSize(aspectRatio?: string) {
  const allowed = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);
  return allowed.has(aspectRatio || "") ? aspectRatio : "1:1";
}

function normalizeQwen21AspectRatio(aspectRatio?: string, allowAuto = false) {
  const allowed = new Set(["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "9:21"]);
  if (allowAuto && aspectRatio === "auto") return "auto";
  return allowed.has(aspectRatio || "") ? aspectRatio : allowAuto ? "auto" : "3:2";
}

function normalizeQwen21Resolution(resolution?: CreateTaskInput["imageResolution"]) {
  return resolution === "2k" ? "2K" : "1K";
}

function normalizeImageSeed(seed?: number) {
  if (!Number.isFinite(seed)) return 0;
  return Math.max(0, Math.floor(seed || 0));
}

function getQwen21OutputSettings(payload: CreateTaskInput) {
  const background = payload.imageBackground === "transparent" ? "transparent" : "opaque";
  const allowedFormats = new Set(["png", "webp", "jpeg"]);
  const outputFormat = allowedFormats.has(payload.imageOutputFormat || "") ? payload.imageOutputFormat! : "png";
  if (background === "transparent" && outputFormat === "jpeg") {
    throw new Error("Qwen 2.1 cannot combine a transparent background with JPEG output.");
  }
  return { background, outputFormat };
}

function normalizeKlingMode(mode?: KlingMotionMode) {
  return mode === "1080p" ? "1080p" : "720p";
}

function normalizeSeedanceResolution(resolution?: CreateTaskInput["videoResolution"]): SeedanceVideoResolution {
  const allowed = new Set(["480p", "720p", "1080p", "4k"]);
  return allowed.has(resolution || "") ? (resolution as SeedanceVideoResolution) : "720p";
}

function normalizeSeedanceAspectRatio(aspectRatio?: string) {
  const allowed = new Set(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]);
  return allowed.has(aspectRatio || "") ? aspectRatio : "16:9";
}

function normalizeSeedance25Resolution(resolution?: CreateTaskInput["videoResolution"]) {
  return resolution === "480p" || resolution === "1080p" ? resolution : "720p";
}

function normalizeSeedance25AspectRatio(aspectRatio?: string) {
  const allowed = new Set(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"]);
  return allowed.has(aspectRatio || "") ? aspectRatio : "adaptive";
}

function normalizeSeedance25Duration(duration?: number) {
  if (duration === -1) return -1;
  return Math.max(1, Math.min(30, Math.floor(duration || 5)));
}

function normalizeOptionalPrompt(prompt: string, maxLength: number, modelName: string) {
  const normalized = prompt.trim();
  if (normalized.length > maxLength) throw new Error(`${modelName} prompt must be ${maxLength} characters or fewer.`);
  return normalized;
}

function optionalHttpUrl(url?: string, fieldName = "url") {
  return url?.trim() ? requireHttpUrl(url, fieldName) : undefined;
}

function optionalHttpUrls(urls: string[] | undefined, maxCount: number, fieldName: string) {
  const normalized = (urls || []).map((url) => url.trim()).filter(Boolean);
  if (normalized.length > maxCount) throw new Error(`${fieldName} supports up to ${maxCount} files.`);
  return normalized.map((url, index) => requireHttpUrl(url, `${fieldName}[${index}]`));
}

function normalizeCharacterOrientation(value?: CharacterOrientation) {
  return value === "video" ? "video" : "image";
}

const SERVICES: Record<AIServiceId, ServiceConfig> = {
  "gpt-image-2-text": {
    model: "gpt-image-2-text-to-image",
    requiresReferenceImage: false,
    buildInput: (payload) => ({
      prompt: requirePrompt(payload.prompt),
      aspect_ratio: payload.aspectRatio || "16:9",
      resolution: mapImageResolution(payload.imageResolution),
    }),
  },
  "gpt-image-2-image": {
    model: "gpt-image-2-image-to-image",
    requiresReferenceImage: true,
    buildInput: (payload) => ({
      prompt: requirePrompt(payload.prompt),
      aspect_ratio: payload.aspectRatio || "16:9",
      resolution: mapImageResolution(payload.imageResolution),
      input_urls: [requireHttpUrl(payload.inputUrl)],
    }),
  },
  "seedream-5-lite-text": {
    model: "seedream/5-lite-text-to-image",
    requiresReferenceImage: false,
    buildInput: (payload) => ({
      prompt: requirePrompt(payload.prompt),
      aspect_ratio: payload.aspectRatio || "1:1",
      quality: mapSeedreamQuality(payload.imageResolution),
      nsfw_checker: false,
    }),
  },
  "seedream-5-lite-image": {
    model: "seedream/5-lite-image-to-image",
    requiresReferenceImage: true,
    buildInput: (payload) => ({
      prompt: requirePrompt(payload.prompt),
      image_urls: [requireHttpUrl(payload.inputUrl)],
      aspect_ratio: payload.aspectRatio || "1:1",
      quality: mapSeedreamQuality(payload.imageResolution),
    }),
  },
  "seedream-5-flash-text": {
    model: "seedream/5-flash-text-to-image",
    requiresReferenceImage: false,
    buildInput: (payload) => ({
      prompt: requirePromptWithinLimit(payload.prompt, 5000, "Seedream 5 Flash"),
      aspect_ratio: normalizeSeedream5FlashAspectRatio(payload.aspectRatio),
      size: normalizeSeedream5FlashSize(payload.imageSize),
      output_format: normalizeSeedream5FlashFormat(payload.imageOutputFormat),
      nsfw_checker: payload.nsfwChecker ?? false,
    }),
  },
  "seedream-5-flash-image": {
    model: "seedream/5-flash-image-to-image",
    requiresReferenceImage: true,
    buildInput: (payload) => ({
      image_urls: requireHttpUrls(payload.inputUrls, payload.inputUrl, "Seedream 5 Flash Image to Image"),
      prompt: requirePromptWithinLimit(payload.prompt, 5000, "Seedream 5 Flash"),
      aspect_ratio: normalizeSeedream5FlashAspectRatio(payload.aspectRatio),
      size: normalizeSeedream5FlashSize(payload.imageSize),
      output_format: normalizeSeedream5FlashFormat(payload.imageOutputFormat),
      nsfw_checker: payload.nsfwChecker ?? false,
    }),
  },
  "qwen2-1-text": {
    model: "qwen2-1/text-to-image",
    requiresReferenceImage: false,
    buildInput: (payload) => {
      const { background, outputFormat } = getQwen21OutputSettings(payload);
      return {
        prompt: requirePromptWithinLimit(payload.prompt, 5000, "Qwen 2.1"),
        aspect_ratio: normalizeQwen21AspectRatio(payload.aspectRatio),
        resolution: normalizeQwen21Resolution(payload.imageResolution),
        background,
        output_format: outputFormat,
        enhance_prompt: payload.enhancePrompt ?? true,
        seed: normalizeImageSeed(payload.seed),
        nsfw_checker: payload.nsfwChecker ?? false,
      };
    },
  },
  "qwen2-1-image": {
    model: "qwen2-1/image-to-image",
    requiresReferenceImage: true,
    buildInput: (payload) => {
      const imageUrls = requireHttpUrls(payload.inputUrls, payload.inputUrl, "Qwen 2.1 Image to Image");
      const maskUrl = payload.maskUrl?.trim() ? requireHttpUrl(payload.maskUrl, "maskUrl") : undefined;
      const { background, outputFormat } = getQwen21OutputSettings(payload);
      if (maskUrl && imageUrls.length !== 1) {
        throw new Error("Qwen 2.1 inpainting requires exactly one reference image.");
      }
      if (maskUrl && background === "transparent") {
        throw new Error("Qwen 2.1 inpainting cannot use a transparent background.");
      }

      return {
        image_urls: imageUrls,
        prompt: requirePromptWithinLimit(payload.prompt, 5000, "Qwen 2.1"),
        ...(maskUrl ? { mask_url: maskUrl } : {
          aspect_ratio: normalizeQwen21AspectRatio(payload.aspectRatio, true),
          enhance_prompt: payload.enhancePrompt ?? true,
        }),
        resolution: normalizeQwen21Resolution(payload.imageResolution),
        background,
        output_format: outputFormat,
        seed: normalizeImageSeed(payload.seed),
        nsfw_checker: payload.nsfwChecker ?? false,
      };
    },
  },
  "qwen3-pro-text": {
    model: "qwen3/pro-text-to-image",
    requiresReferenceImage: false,
    buildInput: (payload) => ({
      prompt: requirePromptWithinLimit(payload.prompt, 5000, "Qwen3 Pro"),
      image_size: mapQwenImageSize(payload.aspectRatio),
      negative_prompt: "",
      enable_safety_checker: true,
      nsfw_checker: false,
    }),
  },
  "qwen3-pro-image": {
    model: "qwen3/pro-image-to-image",
    requiresReferenceImage: true,
    buildInput: (payload) => ({
      prompt: requirePromptWithinLimit(payload.prompt, 5000, "Qwen3 Pro"),
      image_urls: [requireHttpUrl(payload.inputUrl)],
      aspect_ratio: payload.aspectRatio || "1:1",
      resolution: mapImageResolution(payload.imageResolution),
    }),
  },
  "grok-text-video": {
    model: "grok-imagine/text-to-video",
    requiresReferenceImage: false,
    buildInput: (payload) => ({
      prompt: requirePrompt(payload.prompt),
      aspect_ratio: payload.aspectRatio || "2:3",
      mode: payload.videoMode || "normal",
      duration: normalizeDuration(payload.duration),
      resolution: payload.videoResolution || "480p",
      nsfw_checker: payload.nsfwChecker ?? true,
    }),
  },
  "grok-image-video": {
    model: "grok-imagine/image-to-video",
    requiresReferenceImage: true,
    buildInput: (payload) => ({
      prompt: requirePrompt(payload.prompt),
      image_urls: [requireHttpUrl(payload.inputUrl)],
      mode: payload.videoMode || "normal",
      aspect_ratio: payload.aspectRatio || "2:3",
      duration: normalizeDuration(payload.duration),
      resolution: payload.videoResolution || "480p",
      nsfw_checker: payload.nsfwChecker ?? true,
    }),
  },
  "seedance-2-text-video": {
    model: "bytedance/seedance-2",
    requiresReferenceImage: false,
    buildInput: (payload) => ({
      prompt: requirePromptWithinLimit(payload.prompt, 20000, "Seedance 2"),
      generate_audio: true,
      resolution: normalizeSeedanceResolution(payload.videoResolution),
      aspect_ratio: normalizeSeedanceAspectRatio(payload.aspectRatio),
      duration: normalizeSeedanceDuration(payload.duration),
      web_search: false,
      nsfw_checker: payload.nsfwChecker ?? true,
    }),
  },
  "seedance-2-image-video": {
    model: "bytedance/seedance-2",
    requiresReferenceImage: true,
    buildInput: (payload) => {
      const imageUrl = requireHttpUrl(payload.inputUrl);
      return {
        first_frame_url: imageUrl,
        prompt: requirePromptWithinLimit(payload.prompt, 20000, "Seedance 2"),
        reference_image_urls: [imageUrl],
        generate_audio: true,
        resolution: normalizeSeedanceResolution(payload.videoResolution),
        aspect_ratio: normalizeSeedanceAspectRatio(payload.aspectRatio),
        duration: normalizeSeedanceDuration(payload.duration),
        web_search: false,
        nsfw_checker: payload.nsfwChecker ?? true,
      };
    },
  },
  "seedance-2-5-video": {
    model: "bytedance/seedance-2-5",
    requiresReferenceImage: false,
    buildInput: (payload) => {
      const firstFrameUrl = optionalHttpUrl(payload.firstFrameUrl, "firstFrameUrl");
      const lastFrameUrl = optionalHttpUrl(payload.lastFrameUrl, "lastFrameUrl");
      const referenceImageUrls = optionalHttpUrls(payload.referenceImageUrls, 10, "referenceImageUrls");
      const referenceVideoUrls = optionalHttpUrls(payload.referenceVideoUrls, 3, "referenceVideoUrls");
      const referenceAudioUrls = optionalHttpUrls(payload.referenceAudioUrls, 3, "referenceAudioUrls");
      return {
        ...(firstFrameUrl ? { first_frame_url: firstFrameUrl } : {}),
        ...(lastFrameUrl ? { last_frame_url: lastFrameUrl } : {}),
        prompt: normalizeOptionalPrompt(payload.prompt, 30000, "Seedance 2.5"),
        ...(referenceImageUrls.length ? { reference_image_urls: referenceImageUrls } : {}),
        ...(referenceVideoUrls.length ? { reference_video_urls: referenceVideoUrls } : {}),
        ...(referenceAudioUrls.length ? { reference_audio_urls: referenceAudioUrls } : {}),
        generate_audio: payload.generateAudio ?? true,
        return_last_frame: payload.returnLastFrame ?? false,
        resolution: normalizeSeedance25Resolution(payload.videoResolution),
        aspect_ratio: normalizeSeedance25AspectRatio(payload.aspectRatio),
        duration: normalizeSeedance25Duration(payload.duration),
        output_format: payload.videoOutputFormat === "mov" ? "mov" : "mp4",
        web_search: payload.webSearch ?? false,
        nsfw_checker: payload.nsfwChecker ?? true,
      };
    },
  },
  "kling-motion-control": {
    model: "kling-2.6/motion-control",
    requiresReferenceImage: true,
    buildInput: (payload) => ({
      prompt: requirePrompt(payload.prompt),
      input_urls: [requireHttpUrl(payload.inputUrl, "inputUrl")],
      video_urls: [requireHttpUrl(payload.referenceVideoUrl, "referenceVideoUrl")],
      character_orientation: normalizeCharacterOrientation(payload.characterOrientation),
      mode: normalizeKlingMode(payload.klingMotionMode),
    }),
  },
};

export function getServiceConfig(serviceId: AIServiceId) {
  return SERVICES[serviceId];
}

export async function createAIGenerationTask(payload: CreateTaskInput) {
  const service = SERVICES[payload.serviceId];
  if (!service) {
    throw new Error("Unsupported serviceId.");
  }

  return createTask(service.model, service.buildInput(payload));
}
