import { createTask } from "@/lib/kie";
import type { AIServiceId, CreateTaskInput } from "./types";

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

function requireHttpUrl(inputUrl?: string) {
  const normalized = inputUrl?.trim();
  if (!normalized || !/^https?:\/\//.test(normalized)) {
    throw new Error("inputUrl must be a valid http(s) URL.");
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
      quality: "basic",
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
      quality: "basic",
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
