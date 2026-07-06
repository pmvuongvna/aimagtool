import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const APP_BASE_URL = process.env.APP_BASE_URL?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim();
const IMPORT_COUNT_ENV = Number(process.env.IMPORT_COUNT || "0");
const R2_ENDPOINT = process.env.R2_ENDPOINT?.trim();
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME?.trim();
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID?.trim();
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY?.trim();
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL?.trim();

if (!APP_BASE_URL) {
  throw new Error("APP_BASE_URL is required");
}
if (!ADMIN_TOKEN) {
  throw new Error("ADMIN_TOKEN is required");
}

const DEFAULT_LISTING_URLS = [
  "https://www.meigen.ai/sitemap.xml",
  "https://www.meigen.ai/",
  "https://www.meigen.ai/?model=gptimage",
  "https://www.meigen.ai/?model=seedream",
  "https://www.meigen.ai/?model=seedance",
  "https://www.meigen.ai/?model=midjourney",
  "https://www.meigen.ai/?category=videos",
];

const MAX_FILE_SIZE = 12 * 1024 * 1024;
let r2Client = null;

function sanitize(value = "") {
  return String(value).replace(/\s+/g, " ").replace(/&quot;/g, '"').trim();
}

function normalizeCandidateThumbnailUrl(value) {
  const url = sanitize(value || "");
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

function hasR2Config() {
  return Boolean(R2_ENDPOINT && R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_BASE_URL);
}

function getR2Client() {
  if (r2Client) return r2Client;
  const endpointUrl = new URL(R2_ENDPOINT);
  endpointUrl.pathname = "";
  endpointUrl.search = "";
  endpointUrl.hash = "";
  r2Client = new S3Client({
    region: "auto",
    endpoint: endpointUrl.toString(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return r2Client;
}

function normalizePublicUrl(baseUrl, key) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedKey = key.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${normalizedBase}/${normalizedKey}`;
}

function inferExtension(contentType, sourceUrl) {
  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.includes("png")) return "png";
  if (normalizedType.includes("webp")) return "webp";
  if (normalizedType.includes("gif")) return "gif";
  if (normalizedType.includes("svg")) return "svg";
  if (normalizedType.includes("avif")) return "avif";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return "jpg";
  try {
    const pathname = new URL(sourceUrl).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (match?.[1]) return match[1].toLowerCase();
  } catch {}
  return "jpg";
}

async function mirrorImageToR2(sourceUrl, cacheKey) {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  if (!hasR2Config()) return sourceUrl;
  if (sourceUrl.startsWith(R2_PUBLIC_BASE_URL)) return sourceUrl;

  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; EscanorExternalImporter/1.0)",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "cache-control": "no-cache",
      referer: "https://www.meigen.ai/",
    },
  });

  if (!response.ok) {
    throw new Error(`Remote image fetch failed: ${response.status} ${sourceUrl}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Remote asset is not an image: ${contentType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`Remote image is empty: ${sourceUrl}`);
  if (buffer.length > MAX_FILE_SIZE) throw new Error(`Remote image exceeds ${MAX_FILE_SIZE} bytes: ${sourceUrl}`);

  const extension = inferExtension(contentType, sourceUrl);
  const digest = createHash("sha1").update(cacheKey || sourceUrl).digest("hex");
  const key = `templates/meigen/${digest}.${extension}`;

  await getR2Client().send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return normalizePublicUrl(R2_PUBLIC_BASE_URL, key);
}
function buildJinaVariants(url) {
  const target = new URL(url);
  return Array.from(new Set([
    `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`,
    `https://r.jina.ai/http://${target.host}${target.pathname}${target.search}`,
    `https://r.jina.ai/http://www.meigen.ai${target.pathname}${target.search}`,
  ]));
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; EscanorExternalImporter/1.0)",
      ...headers,
    },
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function fetchMarkdown(url) {
  const failures = [];
  for (const proxyUrl of buildJinaVariants(url)) {
    const result = await fetchText(proxyUrl, {
      accept: "text/plain,text/markdown;q=0.9,*/*;q=0.8",
      "cache-control": "no-cache",
    });
    if (result.status >= 200 && result.status < 300) return result.body;
    failures.push(`${proxyUrl} -> ${result.status}`);
  }
  throw new Error(`Unable to fetch ${url}. ${failures.join(" | ")}`);
}

function extractMarkdownSection(markdown, startMarker, endMarkers) {
  const startIndex = markdown.indexOf(startMarker);
  if (startIndex === -1) return "";
  const rest = markdown.slice(startIndex + startMarker.length);
  let endIndex = rest.length;
  for (const marker of endMarkers) {
    const index = rest.indexOf(marker);
    if (index !== -1 && index < endIndex) endIndex = index;
  }
  return rest.slice(0, endIndex).trim();
}

function extractListingCandidates(markdown) {
  const candidates = [];
  if (markdown.includes("sitemap.xml") || /https:\/\/www\.meigen\.ai\/prompt\/[a-zA-Z0-9_-]+/.test(markdown)) {
    const urls = [...markdown.matchAll(/https:\/\/www\.meigen\.ai\/prompt\/[a-zA-Z0-9_-]+/g)].map((m) => m[0]);
    for (const u of urls) {
      candidates.push({
        title: "MeiGen Prompt",
        detailUrl: u,
      });
    }
    return candidates;
  }
  const compactRegex = /\[!\[Image\s+\d+:\s*AI art:\s*([\s\S]*?)\]\((https?:\/\/[^\s)]+)\)([\s\S]{0,220}?)\]\((https?:\/\/www\.meigen\.ai\/prompt\/[^\s)]+)\)/g;
  let match;
  while ((match = compactRegex.exec(markdown))) {
    const descriptor = sanitize(match[1] || "");
    const thumbnailUrl = normalizeCandidateThumbnailUrl(match[2] || "");
    const trailing = sanitize(match[3] || "");
    const detailUrl = sanitize(match[4] || "");
    if (!descriptor || !detailUrl || descriptor.length < 8) continue;
    if (descriptor.startsWith("{")) continue;
    const parts = descriptor.split("|").map((item) => sanitize(item)).filter(Boolean);
    candidates.push({
      title: parts[0]?.replace(/^AI art:\s*/i, "").trim() || descriptor,
      thumbnailUrl,
      detailUrl,
      model: parts[1] || "",
      authorName: parts.find((item) => item.startsWith("@"))?.replace(/^@/, "") || trailing.match(/@([A-Za-z0-9_.-]+)/)?.[1] || "",
    });
  }

  const blockRegex = /\*\s+!\[Image\s+\d+:\s*AI art:\s*([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s+###\s+([^\n]+)\s+[\s\S]*?By\s+([^\n]+?)\s+[\s\S]*?Model:\s*([^\n]+)\s+[\s\S]*?\[View prompt details\]\((https?:\/\/www\.meigen\.ai\/prompt\/[^\s)]+)\)/g;
  while ((match = blockRegex.exec(markdown))) {
    const authorLine = sanitize(match[4] || "");
    candidates.push({
      title: sanitize(match[3] || match[1] || ""),
      thumbnailUrl: normalizeCandidateThumbnailUrl(match[2] || ""),
      detailUrl: sanitize(match[6] || ""),
      model: sanitize(match[5] || ""),
      authorName: authorLine.match(/@([A-Za-z0-9_.-]+)/)?.[1] || authorLine,
    });
  }

  const deduped = new Map();
  for (const item of candidates) {
    if (!item.detailUrl || !item.title) continue;
    if (!deduped.has(item.detailUrl)) deduped.set(item.detailUrl, item);
  }
  return [...deduped.values()];
}

function extractPromptFromMarkdown(markdown) {
  return sanitize(extractMarkdownSection(markdown, "\nPrompt\n", ["\nShow more", "\n### More like this", "\nUse as Prompt", "\nUse as Ref", "\n## "]));
}

function extractModelFromMarkdown(markdown) {
  const match = markdown.match(/\n(GPT Image(?: [0-9.]+)?|Nanobanana Pro|Seedance(?: mini\/4K)?|Midjourney|other|grok-image)\n\s*\n1 Copy Prompt/i);
  return sanitize(match?.[1] || "");
}

function extractThumbnailFromMarkdown(markdown) {
  const mediaSection = extractMarkdownSection(markdown, "\n## Media Preview\n", ["\nUse as Prompt", "\n### More like this", "\n## "]);
  const mediaMatch = mediaSection.match(/\((https:\/\/images\.meigen\.ai\/[^\s)]+)\)/);
  if (mediaMatch?.[1]) return normalizeCandidateThumbnailUrl(mediaMatch[1]);
  const fallbackMatch = markdown.match(/\((https:\/\/images\.meigen\.ai\/cdn-cgi\/image\/[^\s)]+)\)/);
  return normalizeCandidateThumbnailUrl(fallbackMatch?.[1] || "");
}

function classifyModel(rawValue) {
  const raw = sanitize(rawValue).toLowerCase();
  if (/(seedance|seedance mini|seedance 4k)/.test(raw)) return { model: "Seedance", mediaType: "video" };
  if (/(grok imagine|grok-video|veo|kling|runway|luma)/.test(raw)) return { model: "Grok Imagine", mediaType: "video" };
  if (/(seedream)/.test(raw)) return { model: "Seedream 5 Lite", mediaType: "image" };
  if (/(midjourney)/.test(raw)) return { model: "Midjourney", mediaType: "image" };
  if (/(nanobanana)/.test(raw)) return { model: "Nanobanana Pro", mediaType: "image" };
  if (/(gpt image|gptimage|grok-image|\bgpt\b)/.test(raw)) return { model: "GPT Image 2", mediaType: "image" };
  return null;
}

function inferMediaType({ title, prompt, model, detailUrl }) {
  const text = `${title} ${prompt} ${model} ${detailUrl}`.toLowerCase();
  const classified = classifyModel(model || text);
  if (classified) return classified.mediaType;
  return /(video|motion|clip|trailer|timelapse|loop|animation|animate|fps|camera movement|dolly zoom|tracking shot|pan left|pan right)/.test(text) ? "video" : "image";
}

function inferAspectRatio(text, fallback) {
  return text.match(/\b(1:1|16:9|9:16|4:3|3:4|2:3|3:2)\b/)?.[1] || fallback;
}

function inferCategory({ title, prompt, model, mediaType }) {
  const joined = `${title} ${prompt} ${model}`.toLowerCase();
  if (mediaType === "video") return "Videos";
  if (/(logo|branding|identity|brand|wordmark|packaging)/.test(joined)) return "Brand & Logo";
  if (/(product|perfume|bottle|watch|sneaker|commercial|ad campaign|advertising|cosmetic)/.test(joined)) return "Ads & Product";
  if (/(portrait|face|woman|man|girl|boy|model|editorial|lifestyle)/.test(joined)) return "Portraits";
  if (/(wallpaper|landscape|mountain|aurora|sky|scenery|background)/.test(joined)) return "Wallpaper";
  if (/(3d|render|illustration|anime|concept art|fantasy|sci-fi|character)/.test(joined)) return "Illustration & 3D";
  if (/(poster|visual|typography|cover|flyer|banner)/.test(joined)) return "Posters & Visuals";
  return "All";
}

function normalizeTags(tags) {
  return [...new Set(tags.map((item) => sanitize(item)).filter(Boolean))].slice(0, 12);
}

function extractRelatedPromptCandidates(markdown, currentUrl) {
  const found = [];
  const regex = /\[([^\]]{3,180})\]\((https:\/\/www\.meigen\.ai\/prompt\/[0-9]+)\)/g;
  let match;
  while ((match = regex.exec(markdown))) {
    const title = sanitize(match[1] || "").replace(/^view prompt details$/i, "").trim();
    const detailUrl = sanitize(match[2] || "");
    if (!detailUrl || detailUrl === currentUrl) continue;
    found.push({
      title: title || "Untitled prompt",
      detailUrl,
    });
  }
  const deduped = new Map();
  for (const item of found) {
    if (!item.detailUrl) continue;
    if (!deduped.has(item.detailUrl)) deduped.set(item.detailUrl, item);
  }
  return [...deduped.values()];
}

async function extractTemplate(candidate) {
  const markdown = await fetchMarkdown(candidate.detailUrl);
  const prompt = extractPromptFromMarkdown(markdown);
  const relatedCandidates = extractRelatedPromptCandidates(markdown, candidate.detailUrl);
  if (!prompt || prompt.length < 24) {
    return { item: null, relatedCandidates };
  }
  const model = candidate.model || extractModelFromMarkdown(markdown) || "GPT Image 2";
  const originalThumbnailUrl = candidate.thumbnailUrl || extractThumbnailFromMarkdown(markdown);
  if (!originalThumbnailUrl) {
    return { item: null, relatedCandidates };
  }
  const thumbnailUrl = await mirrorImageToR2(originalThumbnailUrl, `${candidate.detailUrl}|${originalThumbnailUrl}`);
  const mediaType = inferMediaType({ title: candidate.title, prompt, model, detailUrl: candidate.detailUrl });
  const canonicalModel = classifyModel(model)?.model || (mediaType === "video" ? "Grok Imagine" : "GPT Image 2");
  const category = inferCategory({ title: candidate.title, prompt, model: canonicalModel, mediaType });
  const aspectRatio = inferAspectRatio(`${candidate.title} ${prompt}`, mediaType === "video" ? "16:9" : "1:1");
  return {
    item: {
      title: candidate.title,
      prompt,
      thumbnailUrl,
      mediaType,
      model: canonicalModel,
      aspectRatio,
      category,
      tags: normalizeTags([category, canonicalModel, mediaType === "video" ? "AI Video" : "AI Image"]),
      authorName: candidate.authorName || "MeiGen",
      published: true,
      featured: false,
      source: "meigen",
      sourcePromptId: candidate.detailUrl,
      sourceUrl: candidate.detailUrl,
    },
    relatedCandidates,
  };
}

async function getImportCount() {
  if (IMPORT_COUNT_ENV > 0) return Math.max(1, Math.min(50, Math.floor(IMPORT_COUNT_ENV)));
  const res = await fetch(`${APP_BASE_URL}/api/admin/templates`, {
    headers: { "x-admin-token": ADMIN_TOKEN },
  });
  if (!res.ok) return 12;
  const payload = await res.json();
  return Math.max(1, Math.min(50, Math.floor(payload?.importSettings?.importCount || 12)));
}

async function parseResponseBody(response) {
  const raw = await response.text();
  if (!raw) return { raw: "", parsed: null };
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch {
    return { raw, parsed: null };
  }
}

async function debugAdminEndpoint() {
  const res = await fetch(`${APP_BASE_URL}/api/admin/templates`, {
    headers: {
      "x-admin-token": ADMIN_TOKEN,
      accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
    },
  });
  const payload = await parseResponseBody(res);
  return {
    status: res.status,
    bodyPreview: (payload.raw || "<empty body>").slice(0, 600),
  };
}

async function checkExistingTemplatesRemote(urls) {
  if (!urls || urls.length === 0) return [];
  try {
    const res = await fetch(`${APP_BASE_URL}/api/admin/templates`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": ADMIN_TOKEN,
      },
      body: JSON.stringify({
        action: "check-existing",
        urls,
      }),
    });
    if (!res.ok) return [];
    const payload = await res.json();
    return payload.existing || [];
  } catch (error) {
    console.error("Failed to check existing templates remotely", error);
    return [];
  }
}

async function main() {
  const requestedCount = await getImportCount();
  const listingPages = await Promise.all(DEFAULT_LISTING_URLS.map((url) => fetchMarkdown(url).catch(() => "")));
  const candidates = listingPages.flatMap((page) => page ? extractListingCandidates(page) : []);
  const deduped = [...new Map(candidates.map((item) => [item.detailUrl, item])).values()];
  const templates = [];
  const errors = [];
  let attemptedCount = 0;
  let skippedCount = 0;

  const candidateUrls = deduped.map((item) => item.detailUrl).filter(Boolean);
  const existingUrls = await checkExistingTemplatesRemote(candidateUrls);
  const existingSet = new Set(existingUrls);

  const queue = deduped.filter((item) => !existingSet.has(item.detailUrl));
  const seen = new Set(deduped.map((item) => item.detailUrl));
  const maxAttempts = Math.max(requestedCount * 12, 120);

  while (queue.length > 0 && templates.length < requestedCount && attemptedCount < maxAttempts) {
    const candidate = queue.shift();
    if (!candidate) break;
    attemptedCount += 1;
    try {
      const result = await extractTemplate(candidate);
      for (const related of result.relatedCandidates || []) {
        if (!related.detailUrl || seen.has(related.detailUrl)) continue;
        seen.add(related.detailUrl);
        queue.push(related);
      }
      if (!result.item) {
        skippedCount += 1;
        continue;
      }
      templates.push(result.item);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const preflight = await debugAdminEndpoint();
  console.log(JSON.stringify({
    preflight,
    requestedCount,
    discovered: deduped.length,
    prepared: templates.length,
    attemptedCount,
    skippedCount,
    firstError: errors[0] || null,
  }, null, 2));

  const res = await fetch(`${APP_BASE_URL}/api/admin/templates`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": ADMIN_TOKEN,
    },
    body: JSON.stringify({
      action: "bulk-import",
      mode: "github-action",
      templates,
    }),
  });

  const payload = await parseResponseBody(res);
  if (!res.ok) {
    throw new Error(`Bulk import API failed: ${res.status} ${payload.raw || "<empty body>"}`);
  }

  console.log(JSON.stringify({
    requestedCount,
    discovered: deduped.length,
    prepared: templates.length,
    attemptedCount,
    skippedCount,
    apiStatus: res.status,
    firstError: errors[0] || null,
    run: payload?.parsed?.result?.run || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});


