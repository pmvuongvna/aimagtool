const APP_BASE_URL = process.env.APP_BASE_URL?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim();
const IMPORT_COUNT_ENV = Number(process.env.IMPORT_COUNT || "0");

if (!APP_BASE_URL) {
  throw new Error("APP_BASE_URL is required");
}
if (!ADMIN_TOKEN) {
  throw new Error("ADMIN_TOKEN is required");
}

const DEFAULT_LISTING_URLS = [
  "https://www.meigen.ai/",
  "https://www.meigen.ai/?model=gptimage",
  "https://www.meigen.ai/?category=videos",
];

function sanitize(value = "") {
  return String(value).replace(/\s+/g, " ").replace(/&quot;/g, '"').trim();
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
  const compactRegex = /\[!\[Image\s+\d+:\s*AI art:\s*([\s\S]*?)\]\((https?:\/\/[^\s)]+)\)([\s\S]{0,220}?)\]\((https?:\/\/www\.meigen\.ai\/prompt\/[^\s)]+)\)/g;
  let match;
  while ((match = compactRegex.exec(markdown))) {
    const descriptor = sanitize(match[1] || "");
    const thumbnailUrl = sanitize(match[2] || "");
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
      thumbnailUrl: sanitize(match[2] || ""),
      detailUrl: sanitize(match[6] || ""),
      model: sanitize(match[5] || ""),
      authorName: authorLine.match(/@([A-Za-z0-9_.-]+)/)?.[1] || authorLine,
    });
  }

  const deduped = new Map();
  for (const item of candidates) {
    if (!item.detailUrl || !item.thumbnailUrl || !item.title) continue;
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
  if (mediaMatch?.[1]) return mediaMatch[1];
  const fallbackMatch = markdown.match(/\((https:\/\/images\.meigen\.ai\/cdn-cgi\/image\/[^\s)]+)\)/);
  return fallbackMatch?.[1] || "";
}

function inferMediaType({ title, prompt, model, detailUrl }) {
  const text = `${title} ${prompt} ${model} ${detailUrl}`.toLowerCase();
  return /(video|motion|camera|shot|scene|clip|trailer|seedance|veo|grok-video)/.test(text) ? "video" : "image";
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

async function extractTemplate(candidate) {
  const markdown = await fetchMarkdown(candidate.detailUrl);
  const prompt = extractPromptFromMarkdown(markdown);
  if (!prompt || prompt.length < 24) return null;
  const model = candidate.model || extractModelFromMarkdown(markdown) || "GPT Image 2";
  const thumbnailUrl = candidate.thumbnailUrl || extractThumbnailFromMarkdown(markdown);
  const mediaType = inferMediaType({ title: candidate.title, prompt, model, detailUrl: candidate.detailUrl });
  const category = inferCategory({ title: candidate.title, prompt, model, mediaType });
  const aspectRatio = inferAspectRatio(`${candidate.title} ${prompt}`, mediaType === "video" ? "16:9" : "1:1");
  return {
    title: candidate.title,
    prompt,
    thumbnailUrl,
    mediaType,
    model: /seedream/i.test(model) ? "Seedream 5 Lite" : /grok|video|seedance/i.test(model) ? "Grok Imagine" : "GPT Image 2",
    aspectRatio,
    category,
    tags: normalizeTags([category, mediaType === "video" ? "Videos" : model]),
    authorName: candidate.authorName || "MeiGen",
    published: true,
    featured: false,
    source: "meigen",
    sourcePromptId: candidate.detailUrl,
    sourceUrl: candidate.detailUrl,
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

async function main() {
  const requestedCount = await getImportCount();
  const listingPages = await Promise.all(DEFAULT_LISTING_URLS.map((url) => fetchMarkdown(url).catch(() => "")));
  const candidates = listingPages.flatMap((page) => page ? extractListingCandidates(page) : []);
  const deduped = [...new Map(candidates.map((item) => [item.detailUrl, item])).values()];
  const templates = [];
  const errors = [];

  for (const candidate of deduped.slice(0, Math.max(requestedCount * 4, 20))) {
    if (templates.length >= requestedCount) break;
    try {
      const item = await extractTemplate(candidate);
      if (item) templates.push(item);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

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
    apiStatus: res.status,
    firstError: errors[0] || null,
    run: payload?.parsed?.result?.run || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
