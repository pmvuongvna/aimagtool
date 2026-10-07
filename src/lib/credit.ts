import type { CreateTaskInput, ImageResolution, KlingMotionMode, Seedance25VideoResolution, SeedanceVideoResolution, VideoResolution } from "@/lib/ai/types";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type CreditSettings = {
  creditPackageVersion: number;
  creditPackages: CreditPackage[];
  imageCredits: Record<ImageResolution, number>;
  gpt25FlareCredits: Record<ImageResolution, number>;
  gpt25SunburstCredits: Record<ImageResolution, number>;
  nanoBanana21Credits: Record<ImageResolution, number>;
  qwen21ImageCredits: Qwen21ImageCredits;
  seedream5FlashImageCredits: Seedream5FlashImageCredits;
  videoCredits: Record<VideoResolution, number>;
  grokVideoCreditsPerSecond: Record<VideoResolution, number>;
  seedanceVideoCredits: Record<SeedanceVideoResolution, number>;
  seedance25VideoCredits: Record<Seedance25VideoResolution, number>;
  klingMotionCredits: Record<KlingMotionMode, number>;
  imageEditExtraCost: number;
  defaultUserCredits: number;
};

export type Qwen21ImageCredits = {
  text1k: number;
  text2k: number;
  image1k: number;
  image2k: number;
};

export type Seedream5FlashImageCredits = {
  text1k: number;
  text15k: number;
  text2k: number;
  image1k: number;
  image15k: number;
  image2k: number;
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
  gpt25FlareCredits?: Partial<Record<ImageResolution, number>>;
  gpt25SunburstCredits?: Partial<Record<ImageResolution, number>>;
  nanoBanana21Credits?: Partial<Record<ImageResolution, number>>;
  qwen21ImageCredits?: Partial<Qwen21ImageCredits>;
  seedream5FlashImageCredits?: Partial<Seedream5FlashImageCredits>;
  videoCredits?: Partial<Record<VideoResolution, number>>;
  grokVideoCreditsPerSecond?: Partial<Record<VideoResolution, number>>;
  seedanceVideoCredits?: Partial<Record<SeedanceVideoResolution, number>>;
  seedance25VideoCredits?: Partial<Record<Seedance25VideoResolution, number>>;
  klingMotionCredits?: Partial<Record<KlingMotionMode, number>>;
  imageEditExtraCost?: number;
  defaultUserCredits?: number;
};

export type CreditMutationInput = {
  userId: string;
  delta: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
};

export type CreditMutationResult = {
  ok: boolean;
  applied: boolean;
  credits: number;
};

function asNonNegativeNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizeCredits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}
function normalizeGptCredits(input: Partial<Record<ImageResolution, number>> | undefined, fallback: Partial<Record<ImageResolution, number>>) {
  return {
    "1k": asNonNegativeNumber(input?.["1k"] ?? fallback["1k"] ?? 8, 8),
    "2k": asNonNegativeNumber(input?.["2k"] ?? fallback["2k"] ?? 16, 16),
    "4k": asNonNegativeNumber(input?.["4k"] ?? fallback["4k"] ?? 32, 32),
  };
}

const DEFAULT_SETTINGS: CreditSettings = {
  creditPackageVersion: 2,
  creditPackages: [
    { id: "starter", name: "Starter", credits: 500, priceVnd: 49000, badge: "Khởi đầu", active: true },
    { id: "creator", name: "Creator", credits: 1000, priceVnd: 99000, badge: "Phổ biến", active: true },
    { id: "studio", name: "Studio", credits: 2000, priceVnd: 199000, badge: "Nhiều credit", active: true },
  ],
  imageCredits: { "1k": 8, "2k": 16, "4k": 32 },
  gpt25FlareCredits: { "1k": 8, "2k": 16, "4k": 32 },
  gpt25SunburstCredits: { "1k": 8, "2k": 16, "4k": 32 },
  nanoBanana21Credits: { "1k": 8, "2k": 16, "4k": 32 },
  qwen21ImageCredits: { text1k: 8, text2k: 16, image1k: 12, image2k: 20 },
  seedream5FlashImageCredits: { text1k: 8, text15k: 12, text2k: 16, image1k: 12, image15k: 16, image2k: 20 },
  videoCredits: { "480p": 45, "720p": 80 },
  grokVideoCreditsPerSecond: { "480p": 1.6, "720p": 3 },
  seedanceVideoCredits: { "480p": 60, "720p": 100, "1080p": 160, "4k": 300 },
  seedance25VideoCredits: { "480p": 80, "720p": 140, "1080p": 220 },
  klingMotionCredits: { "720p": 80, "1080p": 120 },
  imageEditExtraCost: 4,
  defaultUserCredits: 50,
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
    gpt25FlareCredits: { ...settings.gpt25FlareCredits },
    gpt25SunburstCredits: { ...settings.gpt25SunburstCredits },
    nanoBanana21Credits: { ...settings.nanoBanana21Credits },
    qwen21ImageCredits: { ...settings.qwen21ImageCredits },
    seedream5FlashImageCredits: { ...settings.seedream5FlashImageCredits },
    videoCredits: { ...settings.videoCredits },
    grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond },
    seedanceVideoCredits: { ...settings.seedanceVideoCredits },
    seedance25VideoCredits: { ...settings.seedance25VideoCredits },
    klingMotionCredits: { ...settings.klingMotionCredits },
  };
}

function normalizeSettings(input?: Partial<CreditSettings> | null): CreditSettings {
  const source = input || {};
  const packageVersion = Number(source.creditPackageVersion || 0);
  return {
    creditPackageVersion: DEFAULT_SETTINGS.creditPackageVersion,
    gpt25FlareCredits: normalizeGptCredits(source.gpt25FlareCredits, source.imageCredits || DEFAULT_SETTINGS.imageCredits),
    gpt25SunburstCredits: normalizeGptCredits(source.gpt25SunburstCredits, source.imageCredits || DEFAULT_SETTINGS.imageCredits),
    nanoBanana21Credits: normalizeGptCredits(source.nanoBanana21Credits, DEFAULT_SETTINGS.nanoBanana21Credits),
    creditPackages: packageVersion >= DEFAULT_SETTINGS.creditPackageVersion && Array.isArray(source.creditPackages) && source.creditPackages.length
      ? source.creditPackages.map((item) => ({ ...item }))
      : DEFAULT_SETTINGS.creditPackages.map((item) => ({ ...item })),
    imageCredits: {
      "1k": asNonNegativeNumber(source.imageCredits?.["1k"] ?? DEFAULT_SETTINGS.imageCredits["1k"], DEFAULT_SETTINGS.imageCredits["1k"]),
      "2k": asNonNegativeNumber(source.imageCredits?.["2k"] ?? DEFAULT_SETTINGS.imageCredits["2k"], DEFAULT_SETTINGS.imageCredits["2k"]),
      "4k": asNonNegativeNumber(source.imageCredits?.["4k"] ?? DEFAULT_SETTINGS.imageCredits["4k"], DEFAULT_SETTINGS.imageCredits["4k"]),
    },
    qwen21ImageCredits: {
      text1k: asNonNegativeNumber(source.qwen21ImageCredits?.text1k ?? DEFAULT_SETTINGS.qwen21ImageCredits.text1k, DEFAULT_SETTINGS.qwen21ImageCredits.text1k),
      text2k: asNonNegativeNumber(source.qwen21ImageCredits?.text2k ?? DEFAULT_SETTINGS.qwen21ImageCredits.text2k, DEFAULT_SETTINGS.qwen21ImageCredits.text2k),
      image1k: asNonNegativeNumber(source.qwen21ImageCredits?.image1k ?? DEFAULT_SETTINGS.qwen21ImageCredits.image1k, DEFAULT_SETTINGS.qwen21ImageCredits.image1k),
      image2k: asNonNegativeNumber(source.qwen21ImageCredits?.image2k ?? DEFAULT_SETTINGS.qwen21ImageCredits.image2k, DEFAULT_SETTINGS.qwen21ImageCredits.image2k),
    },
    seedream5FlashImageCredits: {
      text1k: asNonNegativeNumber(source.seedream5FlashImageCredits?.text1k ?? DEFAULT_SETTINGS.seedream5FlashImageCredits.text1k, DEFAULT_SETTINGS.seedream5FlashImageCredits.text1k),
      text15k: asNonNegativeNumber(source.seedream5FlashImageCredits?.text15k ?? DEFAULT_SETTINGS.seedream5FlashImageCredits.text15k, DEFAULT_SETTINGS.seedream5FlashImageCredits.text15k),
      text2k: asNonNegativeNumber(source.seedream5FlashImageCredits?.text2k ?? DEFAULT_SETTINGS.seedream5FlashImageCredits.text2k, DEFAULT_SETTINGS.seedream5FlashImageCredits.text2k),
      image1k: asNonNegativeNumber(source.seedream5FlashImageCredits?.image1k ?? DEFAULT_SETTINGS.seedream5FlashImageCredits.image1k, DEFAULT_SETTINGS.seedream5FlashImageCredits.image1k),
      image15k: asNonNegativeNumber(source.seedream5FlashImageCredits?.image15k ?? DEFAULT_SETTINGS.seedream5FlashImageCredits.image15k, DEFAULT_SETTINGS.seedream5FlashImageCredits.image15k),
      image2k: asNonNegativeNumber(source.seedream5FlashImageCredits?.image2k ?? DEFAULT_SETTINGS.seedream5FlashImageCredits.image2k, DEFAULT_SETTINGS.seedream5FlashImageCredits.image2k),
    },
    videoCredits: {
      "480p": asNonNegativeNumber(source.videoCredits?.["480p"] ?? DEFAULT_SETTINGS.videoCredits["480p"], DEFAULT_SETTINGS.videoCredits["480p"]),
      "720p": asNonNegativeNumber(source.videoCredits?.["720p"] ?? DEFAULT_SETTINGS.videoCredits["720p"], DEFAULT_SETTINGS.videoCredits["720p"]),
    },
    grokVideoCreditsPerSecond: {
      "480p": asNonNegativeNumber(source.grokVideoCreditsPerSecond?.["480p"] ?? DEFAULT_SETTINGS.grokVideoCreditsPerSecond["480p"], DEFAULT_SETTINGS.grokVideoCreditsPerSecond["480p"]),
      "720p": asNonNegativeNumber(source.grokVideoCreditsPerSecond?.["720p"] ?? DEFAULT_SETTINGS.grokVideoCreditsPerSecond["720p"], DEFAULT_SETTINGS.grokVideoCreditsPerSecond["720p"]),
    },
    seedanceVideoCredits: {
      "480p": asNonNegativeNumber(source.seedanceVideoCredits?.["480p"] ?? DEFAULT_SETTINGS.seedanceVideoCredits["480p"], DEFAULT_SETTINGS.seedanceVideoCredits["480p"]),
      "720p": asNonNegativeNumber(source.seedanceVideoCredits?.["720p"] ?? DEFAULT_SETTINGS.seedanceVideoCredits["720p"], DEFAULT_SETTINGS.seedanceVideoCredits["720p"]),
      "1080p": asNonNegativeNumber(source.seedanceVideoCredits?.["1080p"] ?? DEFAULT_SETTINGS.seedanceVideoCredits["1080p"], DEFAULT_SETTINGS.seedanceVideoCredits["1080p"]),
      "4k": asNonNegativeNumber(source.seedanceVideoCredits?.["4k"] ?? DEFAULT_SETTINGS.seedanceVideoCredits["4k"], DEFAULT_SETTINGS.seedanceVideoCredits["4k"]),
    },
    seedance25VideoCredits: {
      "480p": asNonNegativeNumber(source.seedance25VideoCredits?.["480p"] ?? DEFAULT_SETTINGS.seedance25VideoCredits["480p"], DEFAULT_SETTINGS.seedance25VideoCredits["480p"]),
      "720p": asNonNegativeNumber(source.seedance25VideoCredits?.["720p"] ?? DEFAULT_SETTINGS.seedance25VideoCredits["720p"], DEFAULT_SETTINGS.seedance25VideoCredits["720p"]),
      "1080p": asNonNegativeNumber(source.seedance25VideoCredits?.["1080p"] ?? DEFAULT_SETTINGS.seedance25VideoCredits["1080p"], DEFAULT_SETTINGS.seedance25VideoCredits["1080p"]),
    },
    klingMotionCredits: {
      "720p": asNonNegativeNumber(source.klingMotionCredits?.["720p"] ?? DEFAULT_SETTINGS.klingMotionCredits["720p"], DEFAULT_SETTINGS.klingMotionCredits["720p"]),
      "1080p": asNonNegativeNumber(source.klingMotionCredits?.["1080p"] ?? DEFAULT_SETTINGS.klingMotionCredits["1080p"], DEFAULT_SETTINGS.klingMotionCredits["1080p"]),
    },
    imageEditExtraCost: asNonNegativeNumber(source.imageEditExtraCost ?? DEFAULT_SETTINGS.imageEditExtraCost, DEFAULT_SETTINGS.imageEditExtraCost),
    defaultUserCredits: asNonNegativeNumber(source.defaultUserCredits ?? DEFAULT_SETTINGS.defaultUserCredits, DEFAULT_SETTINGS.defaultUserCredits),
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
  return normalizeSettings(result.rows[0].data as Partial<CreditSettings>);
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
  if (next.gpt25FlareCredits) updated.gpt25FlareCredits = normalizeGptCredits(next.gpt25FlareCredits, current.gpt25FlareCredits);
  if (next.gpt25SunburstCredits) updated.gpt25SunburstCredits = normalizeGptCredits(next.gpt25SunburstCredits, current.gpt25SunburstCredits);
  if (next.nanoBanana21Credits) updated.nanoBanana21Credits = normalizeGptCredits(next.nanoBanana21Credits, current.nanoBanana21Credits);

  if (Array.isArray(next.creditPackages)) {
    updated.creditPackageVersion = DEFAULT_SETTINGS.creditPackageVersion;
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
  if (next.qwen21ImageCredits) {
    updated.qwen21ImageCredits = {
      text1k: asNonNegativeNumber(next.qwen21ImageCredits.text1k ?? updated.qwen21ImageCredits.text1k, updated.qwen21ImageCredits.text1k),
      text2k: asNonNegativeNumber(next.qwen21ImageCredits.text2k ?? updated.qwen21ImageCredits.text2k, updated.qwen21ImageCredits.text2k),
      image1k: asNonNegativeNumber(next.qwen21ImageCredits.image1k ?? updated.qwen21ImageCredits.image1k, updated.qwen21ImageCredits.image1k),
      image2k: asNonNegativeNumber(next.qwen21ImageCredits.image2k ?? updated.qwen21ImageCredits.image2k, updated.qwen21ImageCredits.image2k),
    };
  }
  if (next.seedream5FlashImageCredits) {
    updated.seedream5FlashImageCredits = {
      text1k: asNonNegativeNumber(next.seedream5FlashImageCredits.text1k ?? updated.seedream5FlashImageCredits.text1k, updated.seedream5FlashImageCredits.text1k),
      text15k: asNonNegativeNumber(next.seedream5FlashImageCredits.text15k ?? updated.seedream5FlashImageCredits.text15k, updated.seedream5FlashImageCredits.text15k),
      text2k: asNonNegativeNumber(next.seedream5FlashImageCredits.text2k ?? updated.seedream5FlashImageCredits.text2k, updated.seedream5FlashImageCredits.text2k),
      image1k: asNonNegativeNumber(next.seedream5FlashImageCredits.image1k ?? updated.seedream5FlashImageCredits.image1k, updated.seedream5FlashImageCredits.image1k),
      image15k: asNonNegativeNumber(next.seedream5FlashImageCredits.image15k ?? updated.seedream5FlashImageCredits.image15k, updated.seedream5FlashImageCredits.image15k),
      image2k: asNonNegativeNumber(next.seedream5FlashImageCredits.image2k ?? updated.seedream5FlashImageCredits.image2k, updated.seedream5FlashImageCredits.image2k),
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
      "480p": asNonNegativeNumber(next.grokVideoCreditsPerSecond["480p"] ?? updated.grokVideoCreditsPerSecond["480p"], updated.grokVideoCreditsPerSecond["480p"]),
      "720p": asNonNegativeNumber(next.grokVideoCreditsPerSecond["720p"] ?? updated.grokVideoCreditsPerSecond["720p"], updated.grokVideoCreditsPerSecond["720p"]),
    };
  }
  if (next.seedanceVideoCredits) {
    updated.seedanceVideoCredits = {
      "480p": asNonNegativeNumber(next.seedanceVideoCredits["480p"] ?? updated.seedanceVideoCredits["480p"], updated.seedanceVideoCredits["480p"]),
      "720p": asNonNegativeNumber(next.seedanceVideoCredits["720p"] ?? updated.seedanceVideoCredits["720p"], updated.seedanceVideoCredits["720p"]),
      "1080p": asNonNegativeNumber(next.seedanceVideoCredits["1080p"] ?? updated.seedanceVideoCredits["1080p"], updated.seedanceVideoCredits["1080p"]),
      "4k": asNonNegativeNumber(next.seedanceVideoCredits["4k"] ?? updated.seedanceVideoCredits["4k"], updated.seedanceVideoCredits["4k"]),
    };
  }
  if (next.seedance25VideoCredits) {
    updated.seedance25VideoCredits = {
      "480p": asNonNegativeNumber(next.seedance25VideoCredits["480p"] ?? updated.seedance25VideoCredits["480p"], updated.seedance25VideoCredits["480p"]),
      "720p": asNonNegativeNumber(next.seedance25VideoCredits["720p"] ?? updated.seedance25VideoCredits["720p"], updated.seedance25VideoCredits["720p"]),
      "1080p": asNonNegativeNumber(next.seedance25VideoCredits["1080p"] ?? updated.seedance25VideoCredits["1080p"], updated.seedance25VideoCredits["1080p"]),
    };
  }
  if (next.klingMotionCredits) {
    updated.klingMotionCredits = {
      "720p": asNonNegativeNumber(next.klingMotionCredits["720p"] ?? updated.klingMotionCredits["720p"], updated.klingMotionCredits["720p"]),
      "1080p": asNonNegativeNumber(next.klingMotionCredits["1080p"] ?? updated.klingMotionCredits["1080p"], updated.klingMotionCredits["1080p"]),
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
  const inserted = await pool.query(
    "INSERT INTO user_credits (user_id, credits, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO NOTHING",
    [userId, settings.defaultUserCredits],
  );
  if ((inserted.rowCount || 0) > 0 && settings.defaultUserCredits > 0) {
    await pool.query(
      `INSERT INTO credit_ledger (id, user_id, delta, balance_after, reason, reference_type, reference_id, metadata)
       VALUES ($1, $2, $3, $3, 'signup_bonus', 'signup_bonus', $2, $4::jsonb)
       ON CONFLICT (reference_type, reference_id) WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL DO NOTHING`,
      [randomUUID(), userId, settings.defaultUserCredits, JSON.stringify({ source: "default_user_credits" })],
    );
  }
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

export async function applyCreditMutationWithClient(client: PoolClient, input: CreditMutationInput): Promise<CreditMutationResult> {
  const delta = Math.round(input.delta * 100) / 100;
  if (!Number.isFinite(delta) || delta === 0) {
    const current = await client.query("SELECT credits FROM user_credits WHERE user_id = $1 LIMIT 1", [input.userId]);
    return { ok: true, applied: false, credits: Number(current.rows[0]?.credits || 0) };
  }

  if (input.referenceType && input.referenceId) {
    const existing = await client.query(
      "SELECT balance_after FROM credit_ledger WHERE reference_type = $1 AND reference_id = $2 LIMIT 1",
      [input.referenceType, input.referenceId],
    );
    if ((existing.rowCount || 0) > 0) {
      const current = await client.query("SELECT credits FROM user_credits WHERE user_id = $1 LIMIT 1", [input.userId]);
      return { ok: true, applied: false, credits: Number(current.rows[0]?.credits ?? existing.rows[0].balance_after ?? 0) };
    }
  }

  const settings = await getCreditSettings();
  await client.query(
    "INSERT INTO user_credits (user_id, credits, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO NOTHING",
    [input.userId, settings.defaultUserCredits],
  );
  const updated = await client.query(
    `UPDATE user_credits
     SET credits = ROUND((credits + $2)::numeric, 2), updated_at = NOW()
     WHERE user_id = $1 AND credits + $2 >= 0
     RETURNING credits`,
    [input.userId, delta],
  );
  if ((updated.rowCount || 0) === 0) {
    const current = await client.query("SELECT credits FROM user_credits WHERE user_id = $1 LIMIT 1", [input.userId]);
    return { ok: false, applied: false, credits: Number(current.rows[0]?.credits || 0) };
  }

  const credits = Number(updated.rows[0].credits || 0);
  await client.query(
    `INSERT INTO credit_ledger (id, user_id, delta, balance_after, reason, reference_type, reference_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [randomUUID(), input.userId, delta, credits, input.reason, input.referenceType || null, input.referenceId || null, JSON.stringify(input.metadata || {})],
  );
  return { ok: true, applied: true, credits };
}

export async function applyCreditMutation(input: CreditMutationInput): Promise<CreditMutationResult> {
  if (!hasDatabase()) {
    const current = await getUserCredits(input.userId);
    const next = normalizeCredits(current + input.delta);
    if (input.delta < 0 && current + input.delta < 0) return { ok: false, applied: false, credits: current };
    memoryUserCredits.set(input.userId, next);
    return { ok: true, applied: true, credits: next };
  }

  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await applyCreditMutationWithClient(client, input);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (input.referenceType && input.referenceId && (error as { code?: string }).code === "23505") {
      const existing = await getPool().query(
        "SELECT balance_after FROM credit_ledger WHERE reference_type = $1 AND reference_id = $2 LIMIT 1",
        [input.referenceType, input.referenceId],
      );
      if ((existing.rowCount || 0) > 0) {
        const current = await getPool().query("SELECT credits FROM user_credits WHERE user_id = $1 LIMIT 1", [input.userId]);
        return { ok: true, applied: false, credits: Number(current.rows[0]?.credits ?? existing.rows[0].balance_after ?? 0) };
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function setUserCredits(userId: string, credits: number, metadata: Record<string, unknown> = {}) {
  const normalized = normalizeCredits(credits);
  if (!hasDatabase()) {
    memoryUserCredits.set(userId, normalized);
    return normalized;
  }
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const settings = await getCreditSettings();
    await client.query(
      "INSERT INTO user_credits (user_id, credits, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO NOTHING",
      [userId, settings.defaultUserCredits],
    );
    const currentResult = await client.query("SELECT credits FROM user_credits WHERE user_id = $1 FOR UPDATE", [userId]);
    const current = Number(currentResult.rows[0]?.credits || 0);
    const result = await applyCreditMutationWithClient(client, {
      userId,
      delta: normalized - current,
      reason: "admin_adjustment",
      referenceType: "admin_adjustment",
      referenceId: randomUUID(),
      metadata: { targetBalance: normalized, ...metadata },
    });
    await client.query("COMMIT");
    return result.credits;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function calculateTaskCost(input: CreateTaskInput) {
  const settings = await getCreditSettings();
  if (input.serviceId === "nano-banana-2-1-text" || input.serviceId === "nano-banana-2-1-image") return settings.nanoBanana21Credits[input.imageResolution || "1k"];
  if (input.serviceId.startsWith("gpt-image-2-5-") || input.serviceId === "gpt-image-2-text" || input.serviceId === "gpt-image-2-image") {
    const rates = input.serviceId.includes("sunburst") ? settings.gpt25SunburstCredits : settings.gpt25FlareCredits;
    return rates[input.imageResolution || "1k"] + (input.serviceId.endsWith("-image") ? settings.imageEditExtraCost : 0);
  }
  if (input.serviceId === "seedream-5-flash-text" || input.serviceId === "seedream-5-flash-image") {
    const prefix = input.serviceId === "seedream-5-flash-image" ? "image" : "text";
    const size = input.imageSize === "1.5k" ? "15k" : input.imageSize === "2k" ? "2k" : "1k";
    return settings.seedream5FlashImageCredits[`${prefix}${size}` as keyof Seedream5FlashImageCredits];
  }
  if (input.serviceId === "qwen2-1-text" || input.serviceId === "qwen2-1-image") {
    const quality = input.imageResolution === "2k" ? "2k" : "1k";
    if (input.serviceId === "qwen2-1-image") {
      return quality === "2k" ? settings.qwen21ImageCredits.image2k : settings.qwen21ImageCredits.image1k;
    }
    return quality === "2k" ? settings.qwen21ImageCredits.text2k : settings.qwen21ImageCredits.text1k;
  }
  if (
    input.serviceId === "seedream-5-lite-text" ||
    input.serviceId === "seedream-5-lite-image" ||
    input.serviceId === "qwen3-pro-image" ||
    input.serviceId === "qwen3-pro-text"
  ) {
    const quality = input.imageResolution || "1k";
    const base = settings.imageCredits[quality];
    return input.serviceId === "seedream-5-lite-image" || input.serviceId === "qwen3-pro-image" ? base + settings.imageEditExtraCost : base;
  }
  if (input.serviceId === "grok-text-video" || input.serviceId === "grok-image-video") {
    const quality: VideoResolution = input.videoResolution === "720p" ? "720p" : "480p";
    const seconds = Math.max(1, Math.min(30, Math.floor(input.duration || 6)));
    const perSecond = settings.grokVideoCreditsPerSecond[quality];
    return Math.round(perSecond * seconds * 10) / 10;
  }
  if (input.serviceId === "seedance-2-text-video" || input.serviceId === "seedance-2-image-video") {
    const allowed = new Set(["480p", "720p", "1080p", "4k"]);
    const quality: SeedanceVideoResolution = allowed.has(input.videoResolution || "") ? (input.videoResolution as SeedanceVideoResolution) : "720p";
    return settings.seedanceVideoCredits[quality];
  }
  if (input.serviceId === "seedance-2-5-video") {
    const quality: Seedance25VideoResolution = input.videoResolution === "480p" || input.videoResolution === "1080p" ? input.videoResolution : "720p";
    return settings.seedance25VideoCredits[quality];
  }
  if (input.serviceId === "kling-motion-control") {
    const mode = input.klingMotionMode === "1080p" ? "1080p" : "720p";
    return settings.klingMotionCredits[mode];
  }
  const quality: VideoResolution = input.videoResolution === "720p" ? "720p" : "480p";
  return settings.videoCredits[quality];
}

export async function chargeCredits(userId: string, amount: number, referenceId: string = randomUUID(), metadata: Record<string, unknown> = {}) {
  const normalized = normalizeCredits(amount);
  if (normalized <= 0) return { ok: true as const, credits: await getUserCredits(userId) };

  if (!hasDatabase()) {
    const current = await getUserCredits(userId);
    if (current < normalized) return { ok: false as const, credits: current };
    const next = normalizeCredits(current - normalized);
    memoryUserCredits.set(userId, next);
    return { ok: true as const, credits: next };
  }

  const result = await applyCreditMutation({
    userId,
    delta: -normalized,
    reason: "generation_charge",
    referenceType: "generation_charge",
    referenceId,
    metadata,
  });
  return result.ok ? { ok: true as const, credits: result.credits } : { ok: false as const, credits: result.credits };
}

export async function refundCredits(userId: string, amount: number, referenceId: string = randomUUID(), metadata: Record<string, unknown> = {}) {
  const normalized = normalizeCredits(amount);
  if (normalized <= 0) return getUserCredits(userId);

  if (!hasDatabase()) {
    const current = await getUserCredits(userId);
    const next = normalizeCredits(current + normalized);
    memoryUserCredits.set(userId, next);
    return next;
  }

  const result = await applyCreditMutation({
    userId,
    delta: normalized,
    reason: "generation_refund",
    referenceType: "generation_refund",
    referenceId,
    metadata,
  });
  return result.credits;
}
