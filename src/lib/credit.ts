import type { CreateTaskInput, ImageResolution, VideoResolution } from "@/lib/ai/types";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";

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

function asNonNegativeNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizeCredits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
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

let memorySettings: CreditSettings = {
  ...DEFAULT_SETTINGS,
  creditPackages: DEFAULT_SETTINGS.creditPackages.map((x) => ({ ...x })),
};
const memoryUserCredits = new Map<string, number>();

function cloneSettings(settings: CreditSettings) {
  return {
    ...settings,
    creditPackages: settings.creditPackages.map((item) => ({ ...item })),
    imageCredits: { ...settings.imageCredits },
    videoCredits: { ...settings.videoCredits },
    grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond },
  };
}

async function readDbSettings() {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query("SELECT data FROM credit_settings WHERE id = 'global' LIMIT 1");
  if ((result.rowCount || 0) === 0) {
    await pool.query("INSERT INTO credit_settings (id, data) VALUES ('global', $1::jsonb)", [JSON.stringify(DEFAULT_SETTINGS)]);
    return cloneSettings(DEFAULT_SETTINGS);
  }
  const data = result.rows[0].data as CreditSettings;
  return cloneSettings(data);
}

async function writeDbSettings(settings: CreditSettings) {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    "INSERT INTO credit_settings (id, data, updated_at) VALUES ('global', $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()",
    [JSON.stringify(settings)],
  );
}

export async function getCreditSettings() {
  if (!hasDatabase()) return cloneSettings(memorySettings);
  memorySettings = await readDbSettings();
  return cloneSettings(memorySettings);
}

export async function updateCreditSettings(next: CreditSettingsPatch) {
  const current = await getCreditSettings();
  const updated = cloneSettings(current);

  if (Array.isArray(next.creditPackages)) {
    updated.creditPackages = next.creditPackages
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
    updated.imageCredits = {
      "1k": asNonNegativeNumber(next.imageCredits["1k"] ?? updated.imageCredits["1k"], updated.imageCredits["1k"]),
      "2k": asNonNegativeNumber(next.imageCredits["2k"] ?? updated.imageCredits["2k"], updated.imageCredits["2k"]),
      "4k": asNonNegativeNumber(next.imageCredits["4k"] ?? updated.imageCredits["4k"], updated.imageCredits["4k"]),
    };
  }
  if (next.videoCredits) {
    updated.videoCredits = {
      "480p": asNonNegativeNumber(next.videoCredits["480p"] ?? updated.videoCredits["480p"], updated.videoCredits["480p"]),
      "720p": asNonNegativeNumber(next.videoCredits["720p"] ?? updated.videoCredits["720p"], updated.videoCredits["720p"]),
    };
  }
  if (next.grokVideoCreditsPerSecond) {
    updated.grokVideoCreditsPerSecond = {
      "480p": asNonNegativeNumber(
        next.grokVideoCreditsPerSecond["480p"] ?? updated.grokVideoCreditsPerSecond["480p"],
        updated.grokVideoCreditsPerSecond["480p"],
      ),
      "720p": asNonNegativeNumber(
        next.grokVideoCreditsPerSecond["720p"] ?? updated.grokVideoCreditsPerSecond["720p"],
        updated.grokVideoCreditsPerSecond["720p"],
      ),
    };
  }
  if (typeof next.imageEditExtraCost === "number") updated.imageEditExtraCost = Math.max(0, Math.floor(next.imageEditExtraCost));
  if (typeof next.defaultUserCredits === "number") updated.defaultUserCredits = Math.max(0, Math.floor(next.defaultUserCredits));

  memorySettings = cloneSettings(updated);
  if (hasDatabase()) await writeDbSettings(updated);
  return cloneSettings(updated);
}

async function ensureDbUserCredits(userId: string) {
  await ensureSchema();
  const pool = getPool();
  const settings = await getCreditSettings();
  await pool.query(
    "INSERT INTO user_credits (user_id, credits, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO NOTHING",
    [userId, settings.defaultUserCredits],
  );
}

export async function getUserCredits(userId: string) {
  if (!hasDatabase()) {
    if (!memoryUserCredits.has(userId)) memoryUserCredits.set(userId, memorySettings.defaultUserCredits);
    return memoryUserCredits.get(userId) ?? 0;
  }

  await ensureDbUserCredits(userId);
  const pool = getPool();
  const result = await pool.query("SELECT credits FROM user_credits WHERE user_id = $1 LIMIT 1", [userId]);
  if ((result.rowCount || 0) === 0) return 0;
  return Number(result.rows[0].credits || 0);
}

export async function setUserCredits(userId: string, credits: number) {
  const normalized = normalizeCredits(credits);
  if (!hasDatabase()) {
    memoryUserCredits.set(userId, normalized);
    return normalized;
  }
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    "INSERT INTO user_credits (user_id, credits, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET credits = EXCLUDED.credits, updated_at = NOW()",
    [userId, normalized],
  );
  return normalized;
}

export async function calculateTaskCost(input: CreateTaskInput) {
  const settings = await getCreditSettings();
  if (
    input.serviceId === "gpt-image-2-text" ||
    input.serviceId === "gpt-image-2-image" ||
    input.serviceId === "seedream-5-lite-text" ||
    input.serviceId === "seedream-5-lite-image"
  ) {
    const quality = input.imageResolution || "1k";
    const base = settings.imageCredits[quality];
    return input.serviceId === "gpt-image-2-image" ? base + settings.imageEditExtraCost : base;
  }
  if (input.serviceId === "grok-text-video" || input.serviceId === "grok-image-video") {
    const quality = input.videoResolution || "480p";
    const seconds = Math.max(1, Math.min(30, Math.floor(input.duration || 6)));
    const perSecond = settings.grokVideoCreditsPerSecond[quality];
    return Math.round(perSecond * seconds * 10) / 10;
  }
  const quality = input.videoResolution || "480p";
  return settings.videoCredits[quality];
}

export async function chargeCredits(userId: string, amount: number) {
  const normalized = normalizeCredits(amount);
  if (normalized <= 0) return { ok: true as const, credits: await getUserCredits(userId) };

  if (!hasDatabase()) {
    const current = await getUserCredits(userId);
    if (current < normalized) return { ok: false as const, credits: current };
    const next = normalizeCredits(current - normalized);
    memoryUserCredits.set(userId, next);
    return { ok: true as const, credits: next };
  }

  await ensureDbUserCredits(userId);
  const pool = getPool();
  const result = await pool.query(
    "UPDATE user_credits SET credits = credits - $2, updated_at = NOW() WHERE user_id = $1 AND credits >= $2 RETURNING credits",
    [userId, normalized],
  );
  if ((result.rowCount || 0) === 0) {
    const current = await getUserCredits(userId);
    return { ok: false as const, credits: current };
  }
  return { ok: true as const, credits: Number(result.rows[0].credits) };
}

export async function refundCredits(userId: string, amount: number) {
  const normalized = normalizeCredits(amount);
  if (normalized <= 0) return getUserCredits(userId);

  if (!hasDatabase()) {
    const current = await getUserCredits(userId);
    const next = normalizeCredits(current + normalized);
    memoryUserCredits.set(userId, next);
    return next;
  }

  await ensureDbUserCredits(userId);
  const pool = getPool();
  const result = await pool.query(
    "UPDATE user_credits SET credits = credits + $2, updated_at = NOW() WHERE user_id = $1 RETURNING credits",
    [userId, normalized],
  );
  return Number(result.rows[0].credits || 0);
}
