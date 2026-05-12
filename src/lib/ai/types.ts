export type AIServiceId =
  | "gpt-image-2-text"
  | "gpt-image-2-image"
  | "seedream-5-lite-text"
  | "seedream-5-lite-image"
  | "grok-text-video"
  | "grok-image-video";

export type ImageResolution = "1k" | "2k" | "4k";
export type VideoResolution = "480p" | "720p";
export type VideoMode = "fun" | "normal" | "spicy";

export type CreateTaskInput = {
  serviceId: AIServiceId;
  prompt: string;
  aspectRatio?: string;
  inputUrl?: string;
  imageResolution?: ImageResolution;
  videoResolution?: VideoResolution;
  videoMode?: VideoMode;
  duration?: number;
  nsfwChecker?: boolean;
};
