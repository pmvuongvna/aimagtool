export type AIServiceId =
  | "nano-banana-2-1-text"
  | "nano-banana-2-1-image"
  | "gpt-image-2-text"
  | "gpt-image-2-image"
  | "gpt-image-2-5-flare-text"
  | "gpt-image-2-5-flare-image"
  | "gpt-image-2-5-sunburst-text"
  | "gpt-image-2-5-sunburst-image"
  | "seedream-5-lite-text"
  | "seedream-5-lite-image"
  | "seedream-5-flash-text"
  | "seedream-5-flash-image"
  | "qwen2-1-text"
  | "qwen2-1-image"
  | "qwen3-pro-image"
  | "qwen3-pro-text"
  | "grok-text-video"
  | "grok-image-video"
  | "seedance-2-text-video"
  | "seedance-2-image-video"
  | "seedance-2-5-video"
  | "kling-motion-control";

export type ImageResolution = "1k" | "2k" | "4k";
export type ImageSize = ImageResolution | "1.5k";
export type ImageBackground = "opaque" | "transparent" | "auto";
export type ImageOutputFormat = "png" | "webp" | "jpeg";
export type VideoResolution = "480p" | "720p";
export type SeedanceVideoResolution = "480p" | "720p" | "1080p" | "4k";
export type Seedance25VideoResolution = Exclude<SeedanceVideoResolution, "4k">;
export type VideoOutputFormat = "mp4" | "mov";
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
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  imageResolution?: ImageResolution;
  imageSize?: ImageSize;
  imageBackground?: ImageBackground;
  imageOutputFormat?: ImageOutputFormat;
  enhancePrompt?: boolean;
  seed?: number;
  videoResolution?: VideoResolution | SeedanceVideoResolution;
  videoMode?: VideoMode;
  duration?: number;
  generateAudio?: boolean;
  returnLastFrame?: boolean;
  videoOutputFormat?: VideoOutputFormat;
  webSearch?: boolean;
  nsfwChecker?: boolean;
  klingMotionMode?: KlingMotionMode;
  characterOrientation?: CharacterOrientation;
};
