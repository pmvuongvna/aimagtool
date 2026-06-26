import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { TEMPLATE_CATEGORIES, type PromptTemplate, type TemplateCategory, type TemplateMediaType } from "@/lib/template-catalog";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";

export type PromptImportSettings = {
  enabled: boolean;
  importCount: number;
  morningHour: number;
  eveningHour: number;
  source: "meigen";
  lastImportedAt: string | null;
};

export type PromptImportRun = {
  id: string;
  source: string;
  mode: string;
  status: string;
  requestedCount: number;
  importedCount: number;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type PromptTemplateAdminInput = {
  title: string;
  prompt: string;
  thumbnailUrl?: string;
  mediaType: TemplateMediaType;
  model: string;
  aspectRatio: string;
  category: TemplateCategory;
  tags: string[];
  authorName?: string;
  published?: boolean;
  featured?: boolean;
  source?: string;
  sourcePromptId?: string;
  sourceUrl?: string;
};

type PromptImportOptions = {
  mode?: "manual" | "cron";
  count?: number;
  listingUrls?: string[];
};

type PromptImportSummary = {
  run: PromptImportRun;
  items: PromptTemplate[];
};

type CandidateSummary = {
  title: string;
  detailUrl: string;
  thumbnailUrl?: string;
  prompt?: string;
  model?: string;
  authorName?: string;
  mediaType?: TemplateMediaType;
  aspectRatio?: string;
  tags?: string[];
};

const DEFAULT_IMPORT_SETTINGS: PromptImportSettings = {
  enabled: true,
  importCount: 12,
  morningHour: 9,
  eveningHour: 21,
  source: "meigen",
  lastImportedAt: null,
};

const DEFAULT_LISTING_URLS = [
  "https://www.meigen.ai/",
  "https://www.meigen.ai/?model=gptimage",
  "https://www.meigen.ai/?category=videos",
];

let memorySettings: PromptImportSettings = { ...DEFAULT_IMPORT_SETTINGS };
const memoryRuns: PromptImportRun[] = [];
const memoryTemplates = new Map<string, PromptTemplate>();

function clampImportCount(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_IMPORT_SETTINGS.importCount;
  return Math.max(1, Math.min(50, Math.floor(value!)));
}

function normalizeHour(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(23, Math.floor(value!)));
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

function normalizeTemplateCategory(value?: string): TemplateCategory {
  const matched = TEMPLATE_CATEGORIES.find((item) => item === value);
  return matched || "All";
}

function buildTemplateId(source: string, sourcePromptId: string | undefined, title: string, prompt: string) {
  const seed = `${source}|${sourcePromptId || title}|${prompt}`;
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 16);
  return `${source}-${hash}`;
}

async function readImportSettings() {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query("SELECT data FROM prompt_import_settings WHERE id = 'global' LIMIT 1");
  if ((result.rowCount || 0) === 0) {
    await pool.query("INSERT INTO prompt_import_settings (id, data) VALUES ('global', $1::jsonb)", [JSON.stringify(DEFAULT_IMPORT_SETTINGS)]);
    return { ...DEFAULT_IMPORT_SETTINGS };
  }
  const row = result.rows[0]?.data as Partial<PromptImportSettings> | undefined;
  return {
    enabled: row?.enabled !== false,
    importCount: clampImportCount(row?.importCount),
    morningHour: normalizeHour(row?.morningHour, DEFAULT_IMPORT_SETTINGS.morningHour),
    eveningHour: normalizeHour(row?.eveningHour, DEFAULT_IMPORT_SETTINGS.eveningHour),
    source: "meigen",
    lastImportedAt: typeof row?.lastImportedAt === "string" ? row.lastImportedAt : null,
  } satisfies PromptImportSettings;
}

async function writeImportSettings(settings: PromptImportSettings) {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    "INSERT INTO prompt_import_settings (id, data, updated_at) VALUES ('global', $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()",
    [JSON.stringify(settings)],
  );
}

export async function getPromptImportSettings() {
  if (!hasDatabase()) return { ...memorySettings };
  memorySettings = await readImportSettings();
  return { ...memorySettings };
}

export async function updatePromptImportSettings(next: Partial<PromptImportSettings>) {
  const current = await getPromptImportSettings();
  const updated: PromptImportSettings = {
    enabled: next.enabled ?? current.enabled,
    importCount: clampImportCount(next.importCount ?? current.importCount),
    morningHour: normalizeHour(next.morningHour ?? current.morningHour, current.morningHour),
    eveningHour: normalizeHour(next.eveningHour ?? current.eveningHour, current.eveningHour),
    source: "meigen",
    lastImportedAt: next.lastImportedAt ?? current.lastImportedAt,
  };
  memorySettings = { ...updated };
  if (hasDatabase()) await writeImportSettings(updated);
  return updated;
}

function mapTemplateRow(row: Record<string, unknown>): PromptTemplate {
  return {
    id: String(row.id),
    source: String(row.source || "internal"),
    sourcePromptId: row.source_prompt_id ? String(row.source_prompt_id) : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    title: String(row.title || "Untitled"),
    prompt: String(row.prompt || ""),
    thumbnailUrl: String(row.thumbnail_url || ""),
    mediaType: row.media_type === "video" ? "video" : "image",
    model: String(row.model || ""),
    aspectRatio: String(row.aspect_ratio || ""),
    category: normalizeTemplateCategory(String(row.category || "All")),
    tags: Array.isArray(row.tags) ? row.tags.map((item) => String(item)) : [],
    authorName: row.author_name ? String(row.author_name) : undefined,
    published: Boolean(row.published),
    featured: Boolean(row.featured),
  };
}

export async function listAdminTemplates(limit = 60) {
  const max = Math.max(1, Math.min(200, Math.floor(limit)));
  if (!hasDatabase()) {
    return Array.from(memoryTemplates.values()).slice(0, max);
  }
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, source, source_prompt_id, source_url, title, prompt, thumbnail_url, media_type, model, aspect_ratio, category, tags, author_name, published, featured
     FROM prompt_templates
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $1`,
    [max],
  );
  return result.rows.map((row) => mapTemplateRow(row as Record<string, unknown>));
}

export async function listPromptImportRuns(limit = 20) {
  const max = Math.max(1, Math.min(100, Math.floor(limit)));
  if (!hasDatabase()) return memoryRuns.slice(0, max);
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, source, mode, status, requested_count, imported_count, message, details, created_at
     FROM prompt_import_runs
     ORDER BY created_at DESC
     LIMIT $1`,
    [max],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    source: String(row.source),
    mode: String(row.mode),
    status: String(row.status),
    requestedCount: Number(row.requested_count || 0),
    importedCount: Number(row.imported_count || 0),
    message: String(row.message || ""),
    details: (row.details as Record<string, unknown>) || {},
    createdAt: new Date(String(row.created_at)).toISOString(),
  } satisfies PromptImportRun));
}

async function writePromptImportRun(run: PromptImportRun) {
  if (!hasDatabase()) {
    memoryRuns.unshift(run);
    memoryRuns.splice(20);
    return;
  }
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO prompt_import_runs (id, source, mode, status, requested_count, imported_count, message, details, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())`,
    [run.id, run.source, run.mode, run.status, run.requestedCount, run.importedCount, run.message, JSON.stringify(run.details || {})],
  );
}

function pickString(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pickUrl(obj: Record<string, unknown>, keys: string[], baseUrl: string) {
  const raw = pickString(obj, keys);
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function walk(value: unknown, visitor: (value: unknown) => void) {
  visitor(value);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visitor));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => walk(item, visitor));
  }
}

function extractNextData(html: string) {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractMeta(html: string, property: string) {
  const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  return html.match(regex)?.[1]?.trim() || "";
}

function sanitizePrompt(value: string) {
  return value.replace(/\s+/g, " ").replace(/&quot;/g, '"').trim();
}

function inferMediaType(input: { title: string; prompt: string; model: string; detailUrl: string; tags: string[]; categoryHint?: string }): TemplateMediaType {
  const text = `${input.title} ${input.prompt} ${input.model} ${input.detailUrl} ${input.tags.join(" ")} ${input.categoryHint || ""}`.toLowerCase();
  if (/(video|motion|camera|shot|scene|clip|cinematic movement|trailer)/.test(text)) return "video";
  return "image";
}

function inferAspectRatio(text: string, fallback: string) {
  const match = text.match(/\b(1:1|16:9|9:16|4:3|3:4|2:3|3:2)\b/);
  return match?.[1] || fallback;
}

function inferCategory(input: { title: string; prompt: string; model: string; mediaType: TemplateMediaType; tags: string[]; categoryHint?: string }): TemplateCategory {
  const joined = `${input.title} ${input.prompt} ${input.model} ${input.tags.join(" ")} ${input.categoryHint || ""}`.toLowerCase();
  if (input.mediaType === "video") return "Videos";
  if (/(logo|branding|identity|brand|wordmark|packaging)/.test(joined)) return "Brand & Logo";
  if (/(product|perfume|bottle|watch|sneaker|commercial|ad campaign|advertising|cosmetic)/.test(joined)) return "Ads & Product";
  if (/(portrait|face|woman|man|girl|boy|model|editorial|lifestyle)/.test(joined)) return "Portraits";
  if (/(wallpaper|landscape|mountain|aurora|sky|scenery|background)/.test(joined)) return "Wallpaper";
  if (/(3d|render|illustration|anime|concept art|fantasy|sci-fi|character)/.test(joined)) return "Illustration & 3D";
  if (/(poster|visual|typography|cover|flyer|banner)/.test(joined)) return "Posters & Visuals";
  return "All";
}

function inferModel(input: { mediaType: TemplateMediaType; model?: string; title: string; prompt: string; detailUrl: string }) {
  const raw = `${input.model || ""} ${input.title} ${input.prompt} ${input.detailUrl}`.toLowerCase();
  if (raw.includes("seedream")) return "Seedream 5 Lite";
  if (raw.includes("video") || input.mediaType === "video") return "Grok Imagine";
  if (raw.includes("gpt")) return "GPT Image 2";
  return "GPT Image 2";
}

function extractCandidateObjects(data: unknown, baseUrl: string) {
  const candidates: CandidateSummary[] = [];
  walk(data, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const obj = value as Record<string, unknown>;
    const title = pickString(obj, ["title", "name", "headline", "label"]);
    const detailUrl = pickUrl(obj, ["url", "href", "path", "link"], baseUrl) || (() => {
      const slug = pickString(obj, ["slug"]);
      if (!slug) return "";
      try {
        return new URL(slug.startsWith("/") ? slug : `/${slug}`, baseUrl).toString();
      } catch {
        return "";
      }
    })();
    const thumbnailUrl = pickUrl(obj, ["thumbnailUrl", "thumbnail", "image", "coverImage", "cover", "previewImage", "imageUrl"], baseUrl);
    const prompt = pickString(obj, ["prompt", "text", "description", "content"]);
    const model = pickString(obj, ["model", "modelName"]);
    const categoryHint = pickString(obj, ["category", "section"]);
    const authorValue = obj.author;
    const authorName = typeof authorValue === "string"
      ? authorValue
      : authorValue && typeof authorValue === "object"
        ? pickString(authorValue as Record<string, unknown>, ["name", "title"])
        : "";
    const tags = Array.isArray(obj.tags) ? obj.tags.map((item) => String(item)) : [];

    if (!title) return;
    if (!detailUrl && !prompt) return;
    candidates.push({ title, detailUrl, thumbnailUrl, prompt, model, authorName, tags, mediaType: categoryHint.toLowerCase().includes("video") ? "video" : undefined });
  });
  return candidates;
}

function extractAnchorCandidates(html: string, baseUrl: string) {
  const candidates: CandidateSummary[] = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const href = match[1];
    const inner = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!inner || inner.length < 6) continue;
    if (/^(home|search|history|favorites|tags)$/i.test(inner)) continue;
    let detailUrl = "";
    try {
      detailUrl = new URL(href, baseUrl).toString();
    } catch {}
    if (!detailUrl || detailUrl === baseUrl) continue;
    const imageMatch = match[2].match(/<img[^>]+src=["']([^"']+)["']/i);
    candidates.push({ title: inner, detailUrl, thumbnailUrl: imageMatch?.[1] || "" });
  }
  return candidates;
}

function dedupeCandidates(items: CandidateSummary[]) {
  const map = new Map<string, CandidateSummary>();
  for (const item of items) {
    const key = item.detailUrl || `${item.title}|${item.prompt || ""}`;
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || (!prev.prompt && item.prompt) || (!prev.thumbnailUrl && item.thumbnailUrl)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; EscanorPromptBot/1.0; +https://escanor.app)",
      accept: "text/html,application/xhtml+xml",
      "cache-control": "no-cache",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

async function extractDetailPrompt(candidate: CandidateSummary) {
  const html = candidate.detailUrl ? await fetchHtml(candidate.detailUrl) : "";
  const nextData = html ? extractNextData(html) : null;
  const stringHits: string[] = [];
  walk(nextData, (value) => {
    if (typeof value !== "string") return;
    const normalized = sanitizePrompt(value);
    if (normalized.length < 30 || normalized.length > 4000) return;
    if (/(^https?:\/\/)|(^\/)|(^[A-Z0-9_-]{18,}$)/i.test(normalized)) return;
    stringHits.push(normalized);
  });
  const prompt = [candidate.prompt, ...stringHits].filter((value): value is string => Boolean(value)).sort((a, b) => b.length - a.length)[0] || "";
  const title = candidate.title || extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
  const thumbnailUrl = candidate.thumbnailUrl || extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
  const authorName = candidate.authorName || extractMeta(html, "author");
  const model = candidate.model || stringHits.find((text) => /gpt|seedream|video/i.test(text)) || "";
  return {
    title: sanitizePrompt(title || "Untitled prompt"),
    prompt: sanitizePrompt(prompt),
    thumbnailUrl,
    authorName,
    model,
    html,
  };
}

function templateFromCandidate(candidate: CandidateSummary, detail: Awaited<ReturnType<typeof extractDetailPrompt>>): PromptTemplateAdminInput | null {
  const prompt = detail.prompt || candidate.prompt || "";
  if (prompt.length < 24) return null;
  const title = detail.title || candidate.title || prompt.slice(0, 48);
  const mediaType = inferMediaType({ title, prompt, model: detail.model || candidate.model || "", detailUrl: candidate.detailUrl, tags: candidate.tags || [] });
  const model = inferModel({ mediaType, model: detail.model || candidate.model, title, prompt, detailUrl: candidate.detailUrl });
  const category = inferCategory({ title, prompt, model, mediaType, tags: candidate.tags || [] });
  const aspectRatio = inferAspectRatio(`${prompt} ${title}`, mediaType === "video" ? "16:9" : "1:1");
  const tags = normalizeTags([category, ...(candidate.tags || []), mediaType === "video" ? "Videos" : model]);
  return {
    title,
    prompt,
    thumbnailUrl: detail.thumbnailUrl || candidate.thumbnailUrl || "",
    mediaType,
    model,
    aspectRatio,
    category,
    tags,
    authorName: detail.authorName || candidate.authorName || "MeiGen",
    published: true,
    featured: false,
    source: "meigen",
    sourcePromptId: candidate.detailUrl,
    sourceUrl: candidate.detailUrl,
  };
}

export async function createOrUpdateTemplate(input: PromptTemplateAdminInput) {
  const normalized: PromptTemplate = {
    id: buildTemplateId(input.source || "internal", input.sourcePromptId || input.sourceUrl || input.title, input.title, input.prompt),
    source: input.source || "internal",
    sourcePromptId: input.sourcePromptId,
    sourceUrl: input.sourceUrl,
    title: input.title.trim(),
    prompt: input.prompt.trim(),
    thumbnailUrl: (input.thumbnailUrl || "").trim(),
    mediaType: input.mediaType,
    model: input.model.trim(),
    aspectRatio: input.aspectRatio.trim() || (input.mediaType === "video" ? "16:9" : "1:1"),
    category: normalizeTemplateCategory(input.category),
    tags: normalizeTags(input.tags || []),
    authorName: (input.authorName || "").trim(),
    published: input.published !== false,
    featured: input.featured === true,
  };

  if (!hasDatabase()) {
    memoryTemplates.set(normalized.id, normalized);
    return normalized;
  }

  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO prompt_templates (
      id, source, source_prompt_id, source_url, title, prompt, thumbnail_url,
      media_type, model, aspect_ratio, category, tags, author_name,
      published, featured, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12::jsonb,$13,
      $14,$15,NOW(),NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      source = EXCLUDED.source,
      source_prompt_id = EXCLUDED.source_prompt_id,
      source_url = EXCLUDED.source_url,
      title = EXCLUDED.title,
      prompt = EXCLUDED.prompt,
      thumbnail_url = EXCLUDED.thumbnail_url,
      media_type = EXCLUDED.media_type,
      model = EXCLUDED.model,
      aspect_ratio = EXCLUDED.aspect_ratio,
      category = EXCLUDED.category,
      tags = EXCLUDED.tags,
      author_name = EXCLUDED.author_name,
      published = EXCLUDED.published,
      featured = EXCLUDED.featured,
      updated_at = NOW()`,
    [
      normalized.id,
      normalized.source,
      normalized.sourcePromptId || null,
      normalized.sourceUrl || null,
      normalized.title,
      normalized.prompt,
      normalized.thumbnailUrl,
      normalized.mediaType,
      normalized.model,
      normalized.aspectRatio,
      normalized.category,
      JSON.stringify(normalized.tags),
      normalized.authorName || null,
      normalized.published,
      normalized.featured,
    ],
  );

  return normalized;
}

function shouldImportNow(settings: PromptImportSettings, now = new Date()) {
  const hour = now.getHours();
  return settings.enabled && (hour === settings.morningHour || hour === settings.eveningHour);
}

async function collectListingCandidates(listingUrls: string[]) {
  const collected: CandidateSummary[] = [];
  for (const url of listingUrls) {
    try {
      const html = await fetchHtml(url);
      const nextData = extractNextData(html);
      if (nextData) collected.push(...extractCandidateObjects(nextData, url));
      collected.push(...extractAnchorCandidates(html, url));
    } catch {
      continue;
    }
  }
  return dedupeCandidates(collected).filter((item) => item.title && item.detailUrl && item.detailUrl.startsWith("https://www.meigen.ai"));
}

export async function runMeigenImport(options: PromptImportOptions = {}): Promise<PromptImportSummary> {
  const settings = await getPromptImportSettings();
  const mode = options.mode || "manual";
  if (mode === "cron" && !shouldImportNow(settings)) {
    const run: PromptImportRun = {
      id: randomUUID(),
      source: "meigen",
      mode,
      status: "skipped",
      requestedCount: settings.importCount,
      importedCount: 0,
      message: "Current hour does not match configured import window.",
      details: { morningHour: settings.morningHour, eveningHour: settings.eveningHour },
      createdAt: new Date().toISOString(),
    };
    await writePromptImportRun(run);
    return { run, items: [] };
  }

  const requestedCount = clampImportCount(options.count ?? settings.importCount);
  const candidates = await collectListingCandidates(options.listingUrls || DEFAULT_LISTING_URLS);
  const imported: PromptTemplate[] = [];
  const errors: string[] = [];

  for (const candidate of candidates.slice(0, Math.max(requestedCount * 4, 20))) {
    if (imported.length >= requestedCount) break;
    try {
      const detail = await extractDetailPrompt(candidate);
      const normalized = templateFromCandidate(candidate, detail);
      if (!normalized) continue;
      const saved = await createOrUpdateTemplate(normalized);
      imported.push(saved);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown import error");
    }
  }

  const updatedSettings = await updatePromptImportSettings({ lastImportedAt: new Date().toISOString() });
  const run: PromptImportRun = {
    id: randomUUID(),
    source: "meigen",
    mode,
    status: imported.length > 0 ? "success" : "failed",
    requestedCount,
    importedCount: imported.length,
    message: imported.length > 0 ? `Imported ${imported.length} prompt templates from MeiGen.` : "No prompt templates could be imported from MeiGen.",
    details: {
      listingUrls: options.listingUrls || DEFAULT_LISTING_URLS,
      errors: errors.slice(0, 10),
      lastImportedAt: updatedSettings.lastImportedAt,
      titles: imported.map((item) => item.title).slice(0, 12),
    },
    createdAt: new Date().toISOString(),
  };
  await writePromptImportRun(run);
  return { run, items: imported };
}

export async function getTemplateAdminSnapshot() {
  const [importSettings, runs, templates] = await Promise.all([
    getPromptImportSettings(),
    listPromptImportRuns(12),
    listAdminTemplates(32),
  ]);
  return { importSettings, runs, templates };
}

