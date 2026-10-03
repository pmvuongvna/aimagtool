export type AIServiceId =
  | "gpt-image-2-text"
  | "gpt-image-2-image"
  | "seedream-5-lite-text"
  | "seedream-5-lite-image"
  | "qwen2-1-text"
  | "qwen2-1-image"
  | "qwen3-pro-image"
  | "qwen3-pro-text"
  | "grok-text-video"
  | "grok-image-video"
  | "seedance-2-text-video"
  | "seedance-2-image-video"
  | "kling-motion-control";

export type ImageResolution = "1k" | "2k" | "4k";
export type ImageBackground = "opaque" | "transparent";
export type ImageOutputFormat = "png" | "webp" | "jpeg";
export type VideoResolution = "480p" | "720p";
export type SeedanceVideoResolution = "480p" | "720p" | "1080p" | "4k";
export type VideoMode = "fun" | "normal" | "spicy";
export type KlingMotionMode = "720p" | "1080p";
export type CharacterOrientation = "image" | "video";

export type CreateTaskInput = {
  serviceId: AIServiceId;
  prompt: string;
  aspectRatio?: string;
  inputUrl?: string;
  inputUrls?: string[];
  maskUrl?: string;
  referenceVideoUrl?: string;
  imageResolution?: ImageResolution;
  imageBackground?: ImageBackground;
  imageOutputFormat?: ImageOutputFormat;
  enhancePrompt?: boolean;
  seed?: number;
  videoResolution?: VideoResolution | SeedanceVideoResolution;
  videoMode?: VideoMode;
  duration?: number;
  nsfwChecker?: boolean;
  klingMotionMode?: KlingMotionMode;
  characterOrientation?: CharacterOrientation;
};
