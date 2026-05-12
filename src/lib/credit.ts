import type { CreateTaskInput, ImageResolution, VideoResolution } from "@/lib/ai/types";

export type CreditSettings = {
  creditPackages: CreditPackage[];
  imageCredits: Record<ImageResolution, number>;
  videoCredits: Record<VideoResolution, number>;
  grokVideoCreditsPerSecond: Record<VideoResolution, number>;
  imageEditExtraCost: number;
  defaultUserCredits: number;
};

export type CreditPackage = {
  id: string;
  name: string;
  credits: number;
  priceVnd: number;
  badge?: string;
  active: boolean;
};

type CreditSettingsPatch = {
  creditPackages?: CreditPackage[];
  imageCredits?: Partial<Record<ImageResolution, number>>;
  videoCredits?: Partial<Record<VideoResolution, number>>;
  grokVideoCreditsPerSecond?: Partial<Record<VideoResolution, number>>;
  imageEditExtraCost?: number;
  defaultUserCredits?: number;
};

type CreditState = {
  settings: CreditSettings;
  users: Map<string, number>;
};

function asNonNegativeNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

const DEFAULT_SETTINGS: CreditSettings = {
  creditPackages: [
    { id: "starter", name: "Starter", credits: 500, priceVnd: 99000, badge: "Phổ biến", active: true },
    { id: "creator", name: "Creator", credits: 2500, priceVnd: 399000, badge: "Tiết kiệm", active: true },
    { id: "studio", name: "Studio", credits: 10000, priceVnd: 1299000, badge: "Pro", active: true },
  ],
  imageCredits: { "1k": 8, "2k": 16, "4k": 32 },
  videoCredits: { "480p": 45, "720p": 80 },
  grokVideoCreditsPerSecond: { "480p": 1.6, "720p": 3 },
  imageEditExtraCost: 4,
  defaultUserCredits: 500,
};

const state: CreditState = {
  settings: { ...DEFAULT_SETTINGS },
  users: new Map<string, number>(),
};

export function getUserCredits(userId: string) {
  if (!state.users.has(userId)) {
    state.users.set(userId, state.settings.defaultUserCredits);
  }
  return state.users.get(userId) ?? 0;
}

export function setUserCredits(userId: string, credits: number) {
  state.users.set(userId, Math.max(0, Math.floor(credits)));
  return getUserCredits(userId);
}

export function getCreditSettings() {
  return {
    ...state.settings,
    creditPackages: state.settings.creditPackages.map((item) => ({ ...item })),
    imageCredits: { ...state.settings.imageCredits },
    videoCredits: { ...state.settings.videoCredits },
    grokVideoCreditsPerSecond: { ...state.settings.grokVideoCreditsPerSecond },
  };
}

export function updateCreditSettings(next: CreditSettingsPatch) {
  if (Array.isArray(next.creditPackages)) {
    state.settings.creditPackages = next.creditPackages
      .map((item, index) => ({
        id: String(item.id || `package-${index + 1}`),
        name: String(item.name || `Gói ${index + 1}`),
        credits: Math.max(0, Math.floor(item.credits || 0)),
        priceVnd: Math.max(0, Math.floor(item.priceVnd || 0)),
        badge: typeof item.badge === "string" ? item.badge : "",
        active: item.active !== false,
      }))
      .slice(0, 12);
  }
  if (next.imageCredits) {
    state.settings.imageCredits = {
      "1k": asNonNegativeNumber(next.imageCredits["1k"] ?? state.settings.imageCredits["1k"], state.settings.imageCredits["1k"]),
      "2k": asNonNegativeNumber(next.imageCredits["2k"] ?? state.settings.imageCredits["2k"], state.settings.imageCredits["2k"]),
      "4k": asNonNegativeNumber(next.imageCredits["4k"] ?? state.settings.imageCredits["4k"], state.settings.imageCredits["4k"]),
    };
  }
  if (next.videoCredits) {
    state.settings.videoCredits = {
      "480p": asNonNegativeNumber(next.videoCredits["480p"] ?? state.settings.videoCredits["480p"], state.settings.videoCredits["480p"]),
      "720p": asNonNegativeNumber(next.videoCredits["720p"] ?? state.settings.videoCredits["720p"], state.settings.videoCredits["720p"]),
    };
  }
  if (next.grokVideoCreditsPerSecond) {
    state.settings.grokVideoCreditsPerSecond = {
      "480p": asNonNegativeNumber(
        next.grokVideoCreditsPerSecond["480p"] ?? state.settings.grokVideoCreditsPerSecond["480p"],
        state.settings.grokVideoCreditsPerSecond["480p"],
      ),
      "720p": asNonNegativeNumber(
        next.grokVideoCreditsPerSecond["720p"] ?? state.settings.grokVideoCreditsPerSecond["720p"],
        state.settings.grokVideoCreditsPerSecond["720p"],
      ),
    };
  }
  if (typeof next.imageEditExtraCost === "number") state.settings.imageEditExtraCost = Math.max(0, Math.floor(next.imageEditExtraCost));
  if (typeof next.defaultUserCredits === "number") state.settings.defaultUserCredits = Math.max(0, Math.floor(next.defaultUserCredits));
  return getCreditSettings();
}

export function calculateTaskCost(input: CreateTaskInput) {
  if (
    input.serviceId === "gpt-image-2-text" ||
    input.serviceId === "gpt-image-2-image" ||
    input.serviceId === "seedream-5-lite-text" ||
    input.serviceId === "seedream-5-lite-image"
  ) {
    const quality = input.imageResolution || "1k";
    const base = state.settings.imageCredits[quality];
    return input.serviceId === "gpt-image-2-image" ? base + state.settings.imageEditExtraCost : base;
  }
  if (input.serviceId === "grok-text-video" || input.serviceId === "grok-image-video") {
    const quality = input.videoResolution || "480p";
    const seconds = Math.max(1, Math.min(30, Math.floor(input.duration || 6)));
    const perSecond = state.settings.grokVideoCreditsPerSecond[quality];
    return Math.round(perSecond * seconds * 10) / 10;
  }
  const quality = input.videoResolution || "480p";
  return state.settings.videoCredits[quality];
}

export function chargeCredits(userId: string, amount: number) {
  const current = getUserCredits(userId);
  if (amount <= 0) return { ok: true as const, credits: current };
  if (current < amount) return { ok: false as const, credits: current };
  state.users.set(userId, current - amount);
  return { ok: true as const, credits: current - amount };
}

export function refundCredits(userId: string, amount: number) {
  const current = getUserCredits(userId);
  state.users.set(userId, current + Math.max(0, amount));
  return state.users.get(userId) ?? current;
}
