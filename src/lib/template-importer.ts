import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { TEMPLATE_CATEGORIES, DEFAULT_PROMPT_TEMPLATES, type PromptTemplate, type TemplateCategory, type TemplateMediaType } from "@/lib/template-catalog";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";
import { mirrorRemoteImageToR2, normalizeR2PublicImageUrl } from "@/lib/r2";

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

type ListingCollectionResult = {
  candidates: CandidateSummary[];
  errors: string[];
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
  "https://www.meigen.ai/sitemap.xml",
  "https://www.meigen.ai/",
  "https://www.meigen.ai/?model=gptimage",
  "https://www.meigen.ai/?model=seedream",
  "https://www.meigen.ai/?model=seedance",
  "https://www.meigen.ai/?model=midjourney",
  "https://www.meigen.ai/?category=videos",
];

let memorySettings: PromptImportSettings = { ...DEFAULT_IMPORT_SETTINGS };
const memoryRuns: PromptImportRun[] = [];
const globalTemplatesKey = "__aistudio_memory_templates__";
const memoryTemplates = (() => {
  const g = globalThis as typeof globalThis & { [globalTemplatesKey]?: Map<string, PromptTemplate> };
  if (!g[globalTemplatesKey]) {
    g[globalTemplatesKey] = new Map<string, PromptTemplate>();
    for (const item of DEFAULT_PROMPT_TEMPLATES) {
      g[globalTemplatesKey].set(item.id, item);
    }
  }
  return g[globalTemplatesKey];
})();

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
    thumbnailUrl: normalizeR2PublicImageUrl(String(row.thumbnail_url || "")),
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
export async function recordPromptImportRun(input: {
  source?: string;
  mode: string;
  status: string;
  requestedCount: number;
  importedCount: number;
  message: string;
  details?: Record<string, unknown>;
}) {
  const run: PromptImportRun = {
    id: randomUUID(),
    source: input.source || "meigen",
    mode: input.mode,
    status: input.status,
    requestedCount: input.requestedCount,
    importedCount: input.importedCount,
    message: input.message,
    details: input.details || {},
    createdAt: new Date().toISOString(),
  };
  await writePromptImportRun(run);
  return run;
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

function normalizeCandidateThumbnailUrl(value: string) {
  const url = sanitizePrompt(value || "");
  if (!url || !/^https?:\/\//i.test(url)) return "";

  try {
    const target = new URL(url);
    const host = target.hostname.toLowerCase();
    const pathname = target.pathname.toLowerCase();

    if ((host === "www.meigen.ai" || host === "meigen.ai") && (pathname === "/" || pathname === "")) return "";
    if ((host === "www.meigen.ai" || host === "meigen.ai") && !pathname.startsWith("/cdn-cgi/image/") && !/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(pathname)) return "";

    const looksLikeImageHost = host === "images.meigen.ai"
      || host === "images.escanor.app"
      || host.endsWith(".r2.dev")
      || host.endsWith(".cloudflarestorage.com")
      || pathname.startsWith("/cdn-cgi/image/")
      || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(pathname);

    return looksLikeImageHost ? target.toString() : "";
  } catch {
    return "";
  }
}

function isUsableTemplateThumbnailUrl(value: string) {
  const normalized = normalizeR2PublicImageUrl(String(value || "").trim());
  if (!normalized) return false;

  try {
    const target = new URL(normalized);
    const host = target.hostname.toLowerCase();
    const pathname = target.pathname.toLowerCase();

    if ((host === "www.meigen.ai" || host === "meigen.ai") && (pathname === "/" || pathname === "")) return false;

    return (
      host === "images.meigen.ai"
      || host === "images.escanor.app"
      || host.endsWith(".r2.dev")
      || host.endsWith(".cloudflarestorage.com")
      || pathname.startsWith("/cdn-cgi/image/")
      || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(pathname)
    );
  } catch {
    return false;
  }
}

function classifyModel(rawValue: string) {
  const raw = sanitizePrompt(rawValue).toLowerCase();
  if (/(seedance|seedance mini|seedance 4k)/.test(raw)) return { model: "Seedance", mediaType: "video" as const };
  if (/(grok imagine|grok-video|veo|kling|runway|luma)/.test(raw)) return { model: "Grok Imagine", mediaType: "video" as const };
  if (/(seedream)/.test(raw)) return { model: "Seedream 5 Lite", mediaType: "image" as const };
  if (/(midjourney)/.test(raw)) return { model: "Midjourney", mediaType: "image" as const };
  if (/(nanobanana)/.test(raw)) return { model: "Nanobanana Pro", mediaType: "image" as const };
  if (/(gpt image|gptimage|grok-image|\bgpt\b)/.test(raw)) return { model: "GPT Image 2", mediaType: "image" as const };
  return null;
}

function inferMediaType(input: { title: string; prompt: string; model: string; detailUrl: string; tags: string[]; categoryHint?: string }): TemplateMediaType {
  const text = `${input.title} ${input.prompt} ${input.model} ${input.detailUrl} ${input.tags.join(" ")} ${input.categoryHint || ""}`.toLowerCase();
  const classified = classifyModel(input.model);
  if (classified) return classified.mediaType;
  if (/(video|motion|clip|cinematic movement|trailer|timelapse|loop|animation|animate|fps|camera movement|dolly zoom|tracking shot|pan left|pan right)/.test(text)) return "video";
  return "image";
}

function inferAspectRatio(text: string, fallback: string) {
  const match = text.match(/\b(1:1|16:9|9:16|4:3|3:4|2:3|3:2)\b/);
  return match?.[1] || fallback;
}

function inferCategory(input: { title: string; prompt: string; model: string; mediaType: TemplateMediaType; tags: string[]; categoryHint?: string }): TemplateCategory {
  const lowercaseTags = input.tags.map((t) => t.toLowerCase());
  if (lowercaseTags.includes("portrait") || lowercaseTags.includes("portraits") || lowercaseTags.includes("girl") || lowercaseTags.includes("woman") || lowercaseTags.includes("man") || lowercaseTags.includes("model")) {
    return "Portraits";
  }
  if (lowercaseTags.includes("brand") || lowercaseTags.includes("logo") || lowercaseTags.includes("branding") || lowercaseTags.includes("wordmark")) {
    return "Brand & Logo";
  }
  if (lowercaseTags.includes("product") || lowercaseTags.includes("ads") || lowercaseTags.includes("ad") || lowercaseTags.includes("advertising") || lowercaseTags.includes("commercial")) {
    return "Ads & Product";
  }
  if (lowercaseTags.includes("wallpaper") || lowercaseTags.includes("background")) {
    return "Wallpaper";
  }
  if (lowercaseTags.includes("illustration") || lowercaseTags.includes("3d") || lowercaseTags.includes("anime") || lowercaseTags.includes("rendering") || lowercaseTags.includes("render")) {
    return "Illustration & 3D";
  }
  if (lowercaseTags.includes("poster") || lowercaseTags.includes("posters") || lowercaseTags.includes("visuals") || lowercaseTags.includes("cover") || lowercaseTags.includes("banner")) {
    return "Posters & Visuals";
  }
  if (input.mediaType === "video" || lowercaseTags.includes("video") || lowercaseTags.includes("videos")) {
    return "Videos";
  }

  let joined = `${input.title} ${input.prompt} ${input.model} ${input.tags.join(" ")} ${input.categoryHint || ""}`.toLowerCase();
  joined = joined.replace(/\b(no|without|avoid)\s+(logo|watermark|brand)s?\b/g, "");

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
  const classified = classifyModel(raw);
  if (classified) return classified.model;
  if (input.mediaType === "video") return "Grok Imagine";
  return "GPT Image 2";
}

function normalizeMeigenTemplateInput(input: PromptTemplateAdminInput): PromptTemplateAdminInput {
  if ((input.source || "internal") !== "meigen") return input;

  const mediaType = inferMediaType({
    title: input.title,
    prompt: input.prompt,
    model: input.model,
    detailUrl: input.sourceUrl || input.sourcePromptId || "",
    tags: input.tags || [],
    categoryHint: input.category,
  });
  const model = inferModel({
    mediaType,
    model: input.model,
    title: input.title,
    prompt: input.prompt,
    detailUrl: input.sourceUrl || input.sourcePromptId || "",
  });
  const category = inferCategory({
    title: input.title,
    prompt: input.prompt,
    model,
    mediaType,
    tags: input.tags || [],
    categoryHint: input.category,
  });
  const aspectRatio = inferAspectRatio(`${input.title} ${input.prompt} ${input.aspectRatio || ""}`, mediaType === "video" ? "16:9" : "1:1");
  const tags = normalizeTags([category, model, ...(input.tags || []), mediaType === "video" ? "AI Video" : "AI Image"]);

  return {
    ...input,
    mediaType,
    model,
    category,
    aspectRatio,
    tags,
  };
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

function extractRelatedPromptCandidates(content: string, currentUrl: string) {
  const found: CandidateSummary[] = [];
  const regex = /\[([^\]]{3,180})\]\((https:\/\/www\.meigen\.ai\/prompt\/[0-9]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    const title = sanitizePrompt(match[1] || "").replace(/^view prompt details$/i, "").trim();
    const detailUrl = sanitizePrompt(match[2] || "");
    if (!detailUrl || detailUrl === currentUrl) continue;
    found.push({
      title: title || "Untitled prompt",
      detailUrl,
    });
  }
  return dedupeCandidates(found);
}

type FetchedPage = {
  body: string;
  format: "html" | "markdown";
};

function looksLikeCloudflareChallenge(body: string) {
  const normalized = body.toLowerCase();
  return normalized.includes("just a moment") || normalized.includes("cf-browser-verification") || normalized.includes("cloudflare");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildJinaUrlVariants(url: string) {
  const target = new URL(url);
  return Array.from(new Set([
    `https://r.jina.ai/${url}`,
    `https://r.jina.ai/https://${target.host}${target.pathname}${target.search}`,
    `https://r.jina.ai/https://www.meigen.ai${target.pathname}${target.search}`,
  ]));
}

function fetchTextViaHttps(url: string, headers: Record<string, string>) {
  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = httpsRequest(url, { method: "GET", headers }, (res: import("node:http").IncomingMessage) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode || 0, body });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchDirectHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; EscanorPromptBot/1.0; +https://escanor.app)",
      accept: "text/html,application/xhtml+xml",
      "cache-control": "no-cache",
    },
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const body = await res.text();
  if (looksLikeCloudflareChallenge(body)) {
    throw new Error(`Cloudflare challenge for ${url}`);
  }
  return body;
}

async function fetchJinaMarkdown(url: string) {
  const headers = {
    "user-agent": "Mozilla/5.0 (compatible; EscanorPromptBot/1.0; +https://escanor.app)",
    accept: "text/plain,text/markdown;q=0.9,*/*;q=0.8",
    "cache-control": "no-cache",
  };
  const failures: string[] = [];
  for (const proxyUrl of buildJinaUrlVariants(url)) {
    let attempts = 0;
    while (attempts < 3) {
      const result = await fetchTextViaHttps(proxyUrl, headers);
      if (result.statusCode >= 200 && result.statusCode < 300) {
        return result.body;
      }
      if (result.statusCode === 429) {
        attempts += 1;
        console.log(`Jina Reader 429 rate limit hit. Waiting 5s before retry (attempt ${attempts}/3)...`);
        await sleep(5000);
        continue;
      }
      failures.push(`${proxyUrl} -> ${result.statusCode}`);
      break;
    }
  }
  throw new Error(`Fallback fetch failed for ${url}. Attempts: ${failures.join(" | ")}`);
}

async function fetchJinaHtml(url: string) {
  const headers = {
    "user-agent": "Mozilla/5.0 (compatible; EscanorPromptBot/1.0; +https://escanor.app)",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "cache-control": "no-cache",
    "X-Respond-With": "html",
  };
  const failures: string[] = [];
  for (const proxyUrl of buildJinaUrlVariants(url)) {
    let attempts = 0;
    while (attempts < 3) {
      const result = await fetchTextViaHttps(proxyUrl, headers);
      if (result.statusCode >= 200 && result.statusCode < 300) {
        return result.body;
      }
      if (result.statusCode === 429) {
        attempts += 1;
        console.log(`Jina Reader 429 rate limit hit. Waiting 5s before retry (attempt ${attempts}/3)...`);
        await sleep(5000);
        continue;
      }
      failures.push(`${proxyUrl} -> ${result.statusCode}`);
      break;
    }
  }
  throw new Error(`Fallback HTML fetch failed for ${url}. Attempts: ${failures.join(" | ")}`);
}

async function fetchPage(url: string): Promise<FetchedPage> {
  try {
    return {
      body: await fetchDirectHtml(url),
      format: "html",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/Cloudflare challenge|Fetch failed 403/i.test(message)) throw error;
    try {
      return {
        body: await fetchJinaHtml(url),
        format: "html",
      };
    } catch {
      return {
        body: await fetchJinaMarkdown(url),
        format: "markdown",
      };
    }
  }
}

function extractMarkdownCandidates(markdown: string) {
  const candidates: CandidateSummary[] = [];

  const compactRegex = /\[!\[Image\s+\d+:\s*AI art:\s*([\s\S]*?)\]\((https?:\/\/[^\s)]+)\)([\s\S]{0,220}?)\]\((https?:\/\/www\.meigen\.ai\/prompt\/[^\s)]+)\)/g;
  let compactMatch: RegExpExecArray | null;
  while ((compactMatch = compactRegex.exec(markdown))) {
    const descriptor = sanitizePrompt(compactMatch[1] || "");
    const thumbnailUrl = normalizeCandidateThumbnailUrl(compactMatch[2] || "");
    const trailing = sanitizePrompt(compactMatch[3] || "");
    const detailUrl = sanitizePrompt(compactMatch[4] || "");

    if (!descriptor || !detailUrl || descriptor.length < 8) continue;
    if (descriptor.startsWith("{")) continue;

    const descriptorParts = descriptor.split("|").map((item) => sanitizePrompt(item)).filter(Boolean);
    const title = descriptorParts[0]?.replace(/^AI art:\s*/i, "").trim() || descriptor;
    const model = descriptorParts[1]?.trim() || "";
    const authorFromDescriptor = descriptorParts.find((item) => item.startsWith("@"))?.replace(/^@/, "") || "";
    const authorFromTrailing = trailing.match(/@([A-Za-z0-9_.-]+)/)?.[1] || "";
    const authorName = authorFromDescriptor || authorFromTrailing;

    candidates.push({
      title,
      detailUrl,
      thumbnailUrl,
      model,
      authorName,
      mediaType: /video|seedance/i.test(model) ? "video" : undefined,
    });
  }

  const blockRegex = /\*\s+!\[Image\s+\d+:\s*AI art:\s*([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s+###\s+([^\n]+)\s+[\s\S]*?By\s+([^\n]+?)\s+[\s\S]*?Model:\s*([^\n]+)\s+[\s\S]*?\[View prompt details\]\((https?:\/\/www\.meigen\.ai\/prompt\/[^\s)]+)\)/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(markdown))) {
    const descriptor = sanitizePrompt(blockMatch[1] || "");
    const thumbnailUrl = normalizeCandidateThumbnailUrl(blockMatch[2] || "");
    const headingTitle = sanitizePrompt(blockMatch[3] || "");
    const authorLine = sanitizePrompt(blockMatch[4] || "");
    const model = sanitizePrompt(blockMatch[5] || "");
    const detailUrl = sanitizePrompt(blockMatch[6] || "");
    const authorName = authorLine.match(/@([A-Za-z0-9_.-]+)/)?.[1] || authorLine.replace(/^By\s+/i, "").trim();

    candidates.push({
      title: headingTitle || descriptor,
      detailUrl,
      thumbnailUrl,
      model,
      authorName,
      mediaType: /video|seedance/i.test(model) ? "video" : undefined,
    });
  }

  return dedupeCandidates(candidates).filter((item) => item.detailUrl);
}

function extractMarkdownSection(markdown: string, startMarker: string, endMarkers: string[]) {
  const startIndex = markdown.indexOf(startMarker);
  if (startIndex === -1) return "";
  const rest = markdown.slice(startIndex + startMarker.length);
  let endIndex = rest.length;

  for (const marker of endMarkers) {
    const markerIndex = rest.indexOf(marker);
    if (markerIndex !== -1 && markerIndex < endIndex) {
      endIndex = markerIndex;
    }
  }

  return rest.slice(0, endIndex).trim();
}

function extractPromptFromMarkdown(markdown: string) {
  const section = extractMarkdownSection(markdown, "\nPrompt\n", ["\nShow more", "\n### More like this", "\nUse as Prompt", "\nUse as Ref", "\n## "]);
  return sanitizePrompt(section);
}

function extractModelFromMarkdown(markdown: string) {
  const match = markdown.match(/\n(GPT Image(?: [0-9.]+)?|Nanobanana Pro|Seedance(?: mini\/4K)?|Midjourney|other|grok-image)\n\s*\n1 Copy Prompt/i);
  return sanitizePrompt(match?.[1] || "");
}

function extractTitleFromMarkdown(markdown: string) {
  const match = markdown.match(/^Title:\s*(.+)$/m);
  return sanitizePrompt((match?.[1] || "").replace(/\s+Prompt by.+$/i, ""));
}

function extractAuthorFromMarkdown(markdown: string) {
  const promptIndex = markdown.indexOf("\nPrompt\n");
  if (promptIndex === -1) return "";
  const beforePrompt = markdown.slice(Math.max(0, promptIndex - 240), promptIndex);
  const directHandle = beforePrompt.match(/@([A-Za-z0-9_.-]+)/);
  if (directHandle) return directHandle[1];
  const lines = beforePrompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 2] || lines[lines.length - 1] || "";
}

function extractThumbnailFromMarkdown(markdown: string) {
  const mediaSection = extractMarkdownSection(markdown, "\n## Media Preview\n", ["\nUse as Prompt", "\n### More like this", "\n## "]);
  const mediaMatch = mediaSection.match(/\((https:\/\/images\.meigen\.ai\/[^\s)]+)\)/);
  if (mediaMatch?.[1]) return normalizeCandidateThumbnailUrl(mediaMatch[1]);

  const fallbackMatch = markdown.match(/\((https:\/\/images\.meigen\.ai\/cdn-cgi\/image\/[^\s)]+)\)/);
  return normalizeCandidateThumbnailUrl(fallbackMatch?.[1] || "");
}

function extractNextFData(html: string): string[] {
  const strings: string[] = [];
  const regex = /self\.__next_f\.push\(\s*\[\s*\d+\s*,\s*"([\s\S]*?)"\s*\]\s*\)/g;
  let match;
  while ((match = regex.exec(html))) {
    const content = match[1];
    try {
      const decoded = JSON.parse(`"${content}"`);
      strings.push(decoded);
    } catch {
      const decoded = content
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      strings.push(decoded);
    }
  }
  return strings;
}

async function extractDetailPrompt(candidate: CandidateSummary) {
  const page = candidate.detailUrl ? await fetchPage(candidate.detailUrl) : { body: "", format: "html" as const };
  const html = page.format === "html" ? page.body : "";
  const markdown = page.format === "markdown" ? page.body : "";
  const nextData = html ? extractNextData(html) : null;
  const stringHits: string[] = [];
  
  walk(nextData, (value) => {
    if (typeof value !== "string") return;
    const normalized = sanitizePrompt(value);
    if (normalized.length < 30 || normalized.length > 50000) return;
    if (/(^https?:\/\/)|(^\/)|(^[A-Z0-9_-]{18,}$)/i.test(normalized)) return;
    stringHits.push(normalized);
  });

  if (html) {
    const nextFStrings = extractNextFData(html);
    for (const rawStr of nextFStrings) {
      const jsonMatches = rawStr.match(/\{(?:[^{}]|({[^{}]*}))*\}/g) || [];
      for (const jsonStr of [rawStr, ...jsonMatches]) {
        const normalized = sanitizePrompt(jsonStr);
        if (normalized.length < 30 || normalized.length > 50000) continue;
        if (/(^https?:\/\/)|(^\/)|(^[A-Z0-9_-]{18,}$)/i.test(normalized)) continue;
        stringHits.push(normalized);
      }
    }
  }

  const promptCandidates = [candidate.prompt, ...stringHits];
  if (markdown) {
    promptCandidates.push(extractPromptFromMarkdown(markdown));
  }
  const prompt = promptCandidates.filter((value): value is string => Boolean(value)).sort((a, b) => b.length - a.length)[0] || "";
  const title = candidate.title || extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || extractTitleFromMarkdown(markdown);
  const thumbnailUrl = normalizeCandidateThumbnailUrl(candidate.thumbnailUrl || extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || extractThumbnailFromMarkdown(markdown));
  const authorName = candidate.authorName || extractMeta(html, "author") || extractAuthorFromMarkdown(markdown);
  const model = candidate.model || stringHits.find((text) => /gpt|grok-image|seedream|seedance|midjourney|nanobanana|video/i.test(text)) || extractModelFromMarkdown(markdown) || "";
  const relatedCandidates = markdown ? extractRelatedPromptCandidates(markdown, candidate.detailUrl) : [];

  const tags: string[] = [];
  if (html) {
    const keywords = extractMeta(html, "keywords");
    if (keywords) {
      tags.push(...keywords.split(",").map((k) => k.trim()).filter(Boolean));
    }
    const categoriesMatch = html.match(/"content_categories"\s*:\s*\[([\s\S]*?)\]/);
    if (categoriesMatch?.[1]) {
      try {
        const parsed = JSON.parse(`[${categoriesMatch[1]}]`);
        if (Array.isArray(parsed)) {
          tags.push(...parsed.map((c) => String(c).trim()).filter(Boolean));
        }
      } catch {}
    }
  }

  return {
    title: sanitizePrompt(title || "Untitled prompt"),
    prompt: sanitizePrompt(prompt),
    thumbnailUrl,
    authorName,
    model,
    html,
    tags,
    relatedCandidates,
  };
}

function templateFromCandidate(candidate: CandidateSummary, detail: Awaited<ReturnType<typeof extractDetailPrompt>>): PromptTemplateAdminInput | null {
  const prompt = detail.prompt || candidate.prompt || "";
  if (prompt.length < 24) return null;
  const title = detail.title || candidate.title || prompt.slice(0, 48);
  const thumbnailUrl = detail.thumbnailUrl || candidate.thumbnailUrl || "";
  if (!thumbnailUrl) return null;
  const mediaType = inferMediaType({ title, prompt, model: detail.model || candidate.model || "", detailUrl: candidate.detailUrl, tags: [...(candidate.tags || []), ...(detail.tags || [])] });
  const model = inferModel({ mediaType, model: detail.model || candidate.model, title, prompt, detailUrl: candidate.detailUrl });
  const category = inferCategory({ title, prompt, model, mediaType, tags: [...(candidate.tags || []), ...(detail.tags || [])] });
  const aspectRatio = inferAspectRatio(`${prompt} ${title}`, mediaType === "video" ? "16:9" : "1:1");
  const tags = normalizeTags([category, ...(candidate.tags || []), ...(detail.tags || []), mediaType === "video" ? "Videos" : model]);
  return {
    title,
    prompt,
    thumbnailUrl,
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

async function resolveTemplateThumbnailUrl(input: PromptTemplateAdminInput) {
  const thumbnailUrl = normalizeR2PublicImageUrl((input.thumbnailUrl || "").trim());
  if (!thumbnailUrl || (input.source || "internal") !== "meigen") return thumbnailUrl;

  try {
    return await mirrorRemoteImageToR2({
      sourceUrl: thumbnailUrl,
      keyPrefix: "templates/meigen",
      cacheKey: `${input.sourcePromptId || input.sourceUrl || input.title}|${thumbnailUrl}`,
    });
  } catch (error) {
    console.error("Failed to mirror MeiGen thumbnail to R2", error);
    return thumbnailUrl;
  }
}

export async function createOrUpdateTemplate(input: PromptTemplateAdminInput) {
  const preparedInput = normalizeMeigenTemplateInput(input);
  const resolvedThumbnailUrl = await resolveTemplateThumbnailUrl(preparedInput);
  const normalized: PromptTemplate = {
    id: buildTemplateId(preparedInput.source || "internal", preparedInput.sourcePromptId || preparedInput.sourceUrl || preparedInput.title, preparedInput.title, preparedInput.prompt),
    source: preparedInput.source || "internal",
    sourcePromptId: preparedInput.sourcePromptId,
    sourceUrl: preparedInput.sourceUrl,
    title: preparedInput.title.trim(),
    prompt: preparedInput.prompt.trim(),
    thumbnailUrl: resolvedThumbnailUrl,
    mediaType: preparedInput.mediaType,
    model: preparedInput.model.trim(),
    aspectRatio: preparedInput.aspectRatio.trim() || (preparedInput.mediaType === "video" ? "16:9" : "1:1"),
    category: normalizeTemplateCategory(preparedInput.category),
    tags: normalizeTags(preparedInput.tags || []),
    authorName: (preparedInput.authorName || "").trim(),
    published: preparedInput.published !== false,
    featured: preparedInput.featured === true,
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


export async function rehostStoredTemplateThumbnails(limit = 48) {
  const max = Math.max(1, Math.min(250, Math.floor(limit)));
  const errors: string[] = [];
  let checked = 0;
  let updated = 0;
  let skipped = 0;

  if (!hasDatabase()) {
    for (const item of memoryTemplates.values()) {
      if (checked >= max) break;
      if (item.source !== "meigen" || !item.thumbnailUrl) continue;
      checked += 1;
      try {
        const mirrored = await mirrorRemoteImageToR2({
          sourceUrl: item.thumbnailUrl,
          keyPrefix: "templates/meigen",
          cacheKey: `${item.id}|${item.thumbnailUrl}`,
        });
        if (mirrored !== item.thumbnailUrl) {
          memoryTemplates.set(item.id, { ...item, thumbnailUrl: mirrored });
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown thumbnail rehost error");
      }
    }

    return { checked, updated, skipped, errors };
  }

  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, title, thumbnail_url, source_prompt_id, source_url
     FROM prompt_templates
     WHERE source = 'meigen' AND thumbnail_url <> ''
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $1`,
    [max],
  );

  for (const row of result.rows as Array<{ id: string; title: string; thumbnail_url: string; source_prompt_id: string | null; source_url: string | null }>) {
    checked += 1;
    try {
      const currentUrl = normalizeR2PublicImageUrl(String(row.thumbnail_url || "").trim());
      if (!currentUrl) {
        skipped += 1;
        continue;
      }

      const normalizedCurrent = normalizeR2PublicImageUrl(currentUrl);

      if (normalizedCurrent !== String(row.thumbnail_url || "").trim()) {
        await pool.query("UPDATE prompt_templates SET thumbnail_url = $2, updated_at = NOW() WHERE id = $1", [row.id, normalizedCurrent]);
        updated += 1;
        continue;
      }

      const mirrored = await mirrorRemoteImageToR2({
        sourceUrl: currentUrl,
        keyPrefix: "templates/meigen",
        cacheKey: `${row.id}|${row.source_prompt_id || row.source_url || row.title}|${currentUrl}`,
      });

      if (mirrored === currentUrl) {
        skipped += 1;
        continue;
      }

      await pool.query("UPDATE prompt_templates SET thumbnail_url = $2, updated_at = NOW() WHERE id = $1", [row.id, mirrored]);
      updated += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown thumbnail rehost error");
    }
  }

  return { checked, updated, skipped, errors };
}
export async function clearStoredMeigenTemplates() {
  if (!hasDatabase()) {
    let removedTemplates = 0;
    for (const [id, item] of memoryTemplates.entries()) {
      if (item.source === "meigen") {
        memoryTemplates.delete(id);
        removedTemplates += 1;
      }
    }
    const removedRuns = memoryRuns.filter((item) => item.source === "meigen").length;
    for (let index = memoryRuns.length - 1; index >= 0; index -= 1) {
      if (memoryRuns[index]?.source === "meigen") memoryRuns.splice(index, 1);
    }
    return { removedTemplates, removedRuns };
  }

  await ensureSchema();
  const pool = getPool();
  const templateResult = await pool.query("DELETE FROM prompt_templates WHERE source = 'meigen'");
  const runResult = await pool.query("DELETE FROM prompt_import_runs WHERE source = 'meigen'");
  return {
    removedTemplates: templateResult.rowCount || 0,
    removedRuns: runResult.rowCount || 0,
  };
}

export async function clearBrokenTemplateThumbnails() {
  if (!hasDatabase()) {
    const totalBefore = memoryTemplates.size;
    let removedTemplates = 0;
    for (const [id, item] of memoryTemplates.entries()) {
      if (item.source === "meigen" && !isUsableTemplateThumbnailUrl(item.thumbnailUrl || "")) {
        memoryTemplates.delete(id);
        removedTemplates += 1;
      }
    }
    return { checked: totalBefore, removedTemplates };
  }

  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, thumbnail_url
     FROM prompt_templates
     WHERE source = 'meigen'`,
  );

  let checked = 0;
  let removedTemplates = 0;

  for (const row of result.rows as Array<{ id: string; thumbnail_url: string | null }>) {
    checked += 1;
    if (isUsableTemplateThumbnailUrl(String(row.thumbnail_url || ""))) continue;
    await pool.query("DELETE FROM prompt_templates WHERE id = $1", [row.id]);
    removedTemplates += 1;
  }

  return { checked, removedTemplates };
}

function shouldImportNow(settings: PromptImportSettings, now = new Date()) {
  const hour = now.getHours();
  return settings.enabled && (hour === settings.morningHour || hour === settings.eveningHour);
}

async function collectListingCandidates(listingUrls: string[]): Promise<ListingCollectionResult> {
  const collected: CandidateSummary[] = [];
  const errors: string[] = [];
  for (const url of listingUrls) {
    try {
      const page = await fetchPage(url);
      if (url.includes("sitemap.xml") || /https:\/\/www\.meigen\.ai\/prompt\/[a-zA-Z0-9_-]+/.test(page.body)) {
        const urls = [...page.body.matchAll(/https:\/\/www\.meigen\.ai\/prompt\/[a-zA-Z0-9_-]+/g)].map((m) => m[0]);
        for (const u of urls) {
          collected.push({
            title: "MeiGen Prompt",
            detailUrl: u,
          });
        }
      } else if (page.format === "html") {
        const nextData = extractNextData(page.body);
        if (nextData) collected.push(...extractCandidateObjects(nextData, url));
        collected.push(...extractAnchorCandidates(page.body, url));
      } else {
        collected.push(...extractMarkdownCandidates(page.body));
      }
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : "Unknown listing import error"}`);
      continue;
    }
  }
  return {
    candidates: dedupeCandidates(collected).filter((item) => item.title && item.detailUrl && item.detailUrl.startsWith("https://www.meigen.ai")),
    errors,
  };
}

async function checkIfTemplateExists(detailUrl: string): Promise<boolean> {
  if (!hasDatabase()) {
    for (const item of memoryTemplates.values()) {
      if (item.sourceUrl === detailUrl || item.sourcePromptId === detailUrl) return true;
    }
    return false;
  }
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    "SELECT 1 FROM prompt_templates WHERE source_url = $1 OR source_prompt_id = $1 LIMIT 1",
    [detailUrl]
  );
  return (result.rowCount || 0) > 0;
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
  const listingResult = await collectListingCandidates(options.listingUrls || DEFAULT_LISTING_URLS);
  const candidates = listingResult.candidates;
  const imported: PromptTemplate[] = [];
  const errors: string[] = [...listingResult.errors];
  let skippedCount = 0;
  let attemptedCount = 0;

  const queue = [...candidates];
  const seen = new Set(queue.map((item) => item.detailUrl));
  const maxAttempts = Math.max(requestedCount * 12, 120);

  while (queue.length > 0 && imported.length < requestedCount && attemptedCount < maxAttempts) {
    const candidate = queue.shift();
    if (!candidate) break;
    attemptedCount += 1;
    try {
      if (candidate.detailUrl) {
        const exists = await checkIfTemplateExists(candidate.detailUrl);
        if (exists) {
          skippedCount += 1;
          continue;
        }
      }
      if (attemptedCount > 1) {
        await sleep(2500);
      }
      const detail = await extractDetailPrompt(candidate);
      for (const related of detail.relatedCandidates || []) {
        if (!related.detailUrl || seen.has(related.detailUrl)) continue;
        seen.add(related.detailUrl);
        queue.push(related);
      }
      const normalized = templateFromCandidate(candidate, detail);
      if (!normalized) {
        skippedCount += 1;
        continue;
      }
      const saved = await createOrUpdateTemplate(normalized);
      imported.push(saved);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown import error");
    }
  }

  const updatedSettings = await updatePromptImportSettings({ lastImportedAt: new Date().toISOString() });
  const failureReason = errors[0]
    || (candidates.length === 0 ? "No candidates were discovered from MeiGen listing pages." : "Candidates were found, but none could be normalized into prompt templates.");
  const run: PromptImportRun = {
    id: randomUUID(),
    source: "meigen",
    mode,
    status: imported.length > 0 ? "success" : "failed",
    requestedCount,
    importedCount: imported.length,
    message: imported.length > 0 ? `Imported ${imported.length} prompt templates from MeiGen.` : `No prompt templates could be imported from MeiGen. ${failureReason}`,
    details: {
      listingUrls: options.listingUrls || DEFAULT_LISTING_URLS,
      errors: errors.slice(0, 10),
      lastImportedAt: updatedSettings.lastImportedAt,
      titles: imported.map((item) => item.title).slice(0, 12),
      candidateCount: candidates.length,
      attemptedCount,
      skippedCount,
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

export async function checkExistingTemplates(urls: string[]) {
  const cleanUrls = urls.map((u) => String(u).trim()).filter(Boolean);
  if (cleanUrls.length === 0) return [];

  if (!hasDatabase()) {
    const memoryUrls = Array.from(memoryTemplates.values())
      .map((t) => t.sourceUrl || t.sourcePromptId || "")
      .filter(Boolean);
    return cleanUrls.filter((u) => memoryUrls.includes(u));
  }

  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    "SELECT source_url, source_prompt_id FROM prompt_templates WHERE source_url = ANY($1) OR source_prompt_id = ANY($1)",
    [cleanUrls]
  );
  const dbUrls = result.rows
    .map((row) => row.source_url || row.source_prompt_id || "")
    .filter(Boolean);
  return cleanUrls.filter((u) => dbUrls.includes(u));
}







