import { createTask } from "@/lib/kie";
import type { AIServiceId, CharacterOrientation, CreateTaskInput, KlingMotionMode } from "./types";

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

function normalizeDuration(duration?: number) {
  return Math.max(1, Math.min(30, Math.floor(duration || 6)));
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

function mapQwenImageSize(resolution?: CreateTaskInput["imageResolution"], aspectRatio?: string) {
  const isHd = resolution !== "1k";
  const prefix = aspectRatio === "4:3" ? "landscape_4_3"
    : aspectRatio === "3:4" ? "portrait_4_3"
      : aspectRatio === "16:9" ? "landscape_16_9"
        : aspectRatio === "9:16" ? "portrait_16_9"
          : "square";
  return isHd && prefix === "square" ? "square_hd" : prefix;
}

function normalizeKlingMode(mode?: KlingMotionMode) {
  return mode === "1080p" ? "1080p" : "720p";
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
  "qwen3-pro-text": {
    model: "qwen3/pro-text-to-image",
    requiresReferenceImage: false,
    buildInput: (payload) => ({
      prompt: requirePromptWithinLimit(payload.prompt, 5000, "Qwen3 Pro"),
      image_size: mapQwenImageSize(payload.imageResolution, payload.aspectRatio),
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
