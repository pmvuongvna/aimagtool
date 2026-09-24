import { DEFAULT_PROMPT_TEMPLATES, TEMPLATE_CATEGORIES, type PromptTemplate, type TemplateMediaType } from "@/lib/template-catalog";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";
import { normalizeR2PublicImageUrl } from "@/lib/r2";
import { isUsablePromptText } from "@/lib/prompt-safety";

export type PublicPromptTemplate = PromptTemplate;

const globalTemplatesKey = "__aistudio_memory_templates__";
const memoryTemplatesMap = (() => {
  const g = globalThis as typeof globalThis & { [globalTemplatesKey]?: Map<string, PromptTemplate> };
  if (!g[globalTemplatesKey]) {
    g[globalTemplatesKey] = new Map<string, PromptTemplate>();
    for (const item of DEFAULT_PROMPT_TEMPLATES) {
      g[globalTemplatesKey].set(item.id, item);
    }
  }
  return g[globalTemplatesKey];
})();

function normalizeCategory(value: string) {
  return TEMPLATE_CATEGORIES.includes(value as (typeof TEMPLATE_CATEGORIES)[number])
    ? (value as (typeof TEMPLATE_CATEGORIES)[number])
    : "All";
}

function normalizeTagValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function classifyMeigenModel(rawValue: string) {
  const raw = normalizeTagValue(rawValue).toLowerCase();
  if (/(seedance|seedance mini|seedance 4k)/.test(raw)) return { model: "Seedance", mediaType: "image" as const };
  if (/(midjourney)/.test(raw)) return { model: "Midjourney", mediaType: "image" as const };
  if (/(seedream)/.test(raw)) return { model: "Seedream 5 Lite", mediaType: "image" as const };
  if (/(nanobanana)/.test(raw)) return { model: "Nanobanana Pro", mediaType: "image" as const };
  if (/(grok imagine|grok-image|\bgpt image\b|\bgptimage\b|\bgpt\b)/.test(raw)) return { model: "GPT Image 2", mediaType: "image" as const };
  if (/(grok-video|veo|kling|runway|luma)/.test(raw)) return { model: "Grok Imagine", mediaType: "video" as const };
  return null;
}

function inferMeigenMediaType(input: { title: string; prompt: string; model: string; tags: string[] }): TemplateMediaType {
  const text = `${input.title} ${input.prompt} ${input.model} ${input.tags.join(" ")}`.toLowerCase();
  const classified = classifyMeigenModel(input.model || text);

  if (/\b(image to video|text to video|video generation)\b/.test(text)) {
    return "video";
  }

  if (classified) {
    return classified.mediaType;
  }

  if (/\b(grok-video|veo|kling|runway|luma)\b/.test(text)) {
    return "video";
  }

  if (/\b(animation|animated|motion|clip|trailer|timelapse|loop|fps|camera movement|dolly|pan left|pan right|tracking shot)\b/.test(text)) {
    return "video";
  }

  return "image";
}

function inferMeigenModel(input: { title: string; prompt: string; model: string; tags: string[] }) {
  const raw = `${input.model} ${input.title} ${input.prompt} ${input.tags.join(" ")}`;
  return classifyMeigenModel(raw)?.model || "GPT Image 2";
}

function inferMeigenCategory(input: { title: string; prompt: string; model: string; mediaType: TemplateMediaType; tags: string[] }) {
  const lowerTags = input.tags.map((tag) => tag.toLowerCase());
  const joined = `${input.title} ${input.prompt} ${input.model} ${input.tags.join(" ")}`.toLowerCase();

  if (input.mediaType === "video") return "Videos";
  if (lowerTags.includes("brand") || lowerTags.includes("logo") || /(logo|branding|identity|brand|packaging)/.test(joined)) return "Brand & Logo";
  if (lowerTags.includes("product") || lowerTags.includes("ads") || /(product|perfume|bottle|watch|sneaker|commercial|advertising|cosmetic)/.test(joined)) return "Ads & Product";
  if (lowerTags.includes("portrait") || lowerTags.includes("portraits") || /(portrait|face|woman|man|girl|boy|model|editorial|lifestyle)/.test(joined)) return "Portraits";
  if (lowerTags.includes("wallpaper") || /(wallpaper|landscape|mountain|aurora|sky|scenery|background)/.test(joined)) return "Wallpaper";
  if (lowerTags.includes("illustration") || lowerTags.includes("3d") || /(3d|render|illustration|anime|concept art|fantasy|sci-fi|character)/.test(joined)) return "Illustration & 3D";
  if (lowerTags.includes("poster") || /(poster|visual|typography|cover|flyer|banner)/.test(joined)) return "Posters & Visuals";
  return "All";
}

function sanitizeMeigenTags(tags: string[], model: string, category: string) {
  const blocked = new Set([
    "ai image",
    "ai video",
    "video",
    "videos",
    "all",
    "ads & product",
    "brand & logo",
    "illustration & 3d",
    "posters & visuals",
    "portraits",
    "wallpaper",
    model.toLowerCase(),
    category.toLowerCase(),
  ]);

  return Array.from(
    new Set(
      tags
        .map((tag) => normalizeTagValue(tag))
        .filter(Boolean)
        .filter((tag) => !/^(1:1|16:9|9:16|4:3|3:4|2:3|3:2)$/i.test(tag))
        .filter((tag) => !blocked.has(tag.toLowerCase())),
    ),
  ).slice(0, 12);
}

function normalizeTemplate(row: Record<string, unknown>): PublicPromptTemplate {
  const source = String(row.source || "internal");
  const title = String(row.title || "Untitled");
  const prompt = String(row.prompt || "");
  const rawModel = String(row.model || "");
  const aspectRatio = String(row.aspect_ratio || "");
  const rawCategory = String(row.category || "All");
  const rawTags = Array.isArray(row.tags) ? row.tags.map((item) => String(item)) : [];
  const storedMediaType = row.media_type === "video" ? "video" : "image";
  const mediaType = source === "meigen"
    ? inferMeigenMediaType({ title, prompt, model: rawModel, tags: rawTags })
    : storedMediaType;
  const model = source === "meigen"
    ? inferMeigenModel({ title, prompt, model: rawModel, tags: rawTags })
    : rawModel;
  const category = source === "meigen"
    ? inferMeigenCategory({ title, prompt, model, mediaType, tags: rawTags })
    : normalizeCategory(rawCategory);
  const tags = source === "meigen"
    ? sanitizeMeigenTags(rawTags, model, category)
    : rawTags;

  return {
    id: String(row.id),
    source,
    sourcePromptId: row.source_prompt_id ? String(row.source_prompt_id) : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    title,
    prompt,
    thumbnailUrl: normalizeR2PublicImageUrl(String(row.thumbnail_url || "")),
    mediaType,
    model,
    aspectRatio,
    category,
    tags,
    authorName: row.author_name ? String(row.author_name) : undefined,
    published: Boolean(row.published),
    featured: Boolean(row.featured),
  };
}

async function seedTemplatesIfEmpty() {
  const pool = getPool();
  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM prompt_templates");
  if (Number(existing.rows[0]?.count || 0) > 0) return;

  for (const item of DEFAULT_PROMPT_TEMPLATES) {
    await pool.query(
      `INSERT INTO prompt_templates (
        id, source, source_prompt_id, source_url, title, prompt, thumbnail_url,
        media_type, model, aspect_ratio, category, tags, author_name,
        published, featured, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12::jsonb,$13,
        $14,$15,NOW(),NOW()
      )`,
      [
        item.id,
        item.source,
        item.sourcePromptId || null,
        item.sourceUrl || null,
        item.title,
        item.prompt,
        item.thumbnailUrl,
        item.mediaType,
        item.model,
        item.aspectRatio,
        item.category,
        JSON.stringify(item.tags),
        item.authorName || null,
        item.published,
        item.featured,
      ],
    );
  }
}

export type PublicTemplatePage = {
  items: PublicPromptTemplate[];
  total: number;
  page: number;
  pageSize: number;
  categoryCounts: Record<string, number>;
};

export async function getPublicTemplates(options?: {
  mediaType?: TemplateMediaType;
  category?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<PublicTemplatePage> {
  const mediaType = options?.mediaType;
  const category = options?.category && options.category !== "All" ? options.category : undefined;
  const query = options?.query?.trim().toLowerCase();
  const pageSize = Math.min(50, Math.max(1, Math.floor(options?.pageSize || 20)));
  const page = Math.max(1, Math.floor(options?.page || 1));
  const offset = (page - 1) * pageSize;
  const categoryCounts = Object.fromEntries(TEMPLATE_CATEGORIES.map((item) => [item, 0]));

  if (!hasDatabase()) {
    const baseItems = Array.from(memoryTemplatesMap.values()).filter((item) => {
      if (!item.published || (mediaType && item.mediaType !== mediaType)) return false;
      if (item.source === "meigen" && !isUsablePromptText(item.prompt)) return false;
      if (query) {
        const haystack = `${item.title} ${item.prompt} ${item.tags.join(" ")} ${item.model}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    categoryCounts.All = baseItems.length;
    for (const item of baseItems) {
      for (const itemCategory of TEMPLATE_CATEGORIES) {
        if (itemCategory !== "All" && (item.category === itemCategory || item.tags.includes(itemCategory))) {
          categoryCounts[itemCategory] += 1;
        }
      }
    }

    const filteredItems = category
      ? baseItems.filter((item) => item.category === category || item.tags.includes(category))
      : baseItems;
    return {
      items: filteredItems.slice(offset, offset + pageSize),
      total: filteredItems.length,
      page,
      pageSize,
      categoryCounts,
    };
  }

  await ensureSchema();
  await seedTemplatesIfEmpty();
  const pool = getPool();
  const clauses = ["published = TRUE"];
  const values: unknown[] = [];

  if (mediaType) {
    values.push(mediaType);
    clauses.push(`media_type = $${values.length}`);
  }
  if (query) {
    values.push(`%${query}%`);
    clauses.push(`(LOWER(title) LIKE $${values.length} OR LOWER(prompt) LIKE $${values.length} OR LOWER(model) LIKE $${values.length} OR LOWER(tags::text) LIKE $${values.length})`);
  }

  const countValues = [...values];
  const countExpressions = TEMPLATE_CATEGORIES.map((itemCategory) => {
    if (itemCategory === "All") return "COUNT(*)::int AS all_count";
    countValues.push(itemCategory);
    const placeholder = `$${countValues.length}`;
    return `COUNT(*) FILTER (WHERE category = ${placeholder} OR tags ? ${placeholder})::int AS "${itemCategory.replace(/"/g, '""')}"`;
  });
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total, ${countExpressions.join(", ")}
     FROM prompt_templates
     WHERE ${clauses.join(" AND ")}`,
    countValues,
  );
  const countRow = (countResult.rows[0] || {}) as Record<string, unknown>;
  categoryCounts.All = Number(countRow.all_count || 0);
  for (const itemCategory of TEMPLATE_CATEGORIES) {
    if (itemCategory !== "All") categoryCounts[itemCategory] = Number(countRow[itemCategory] || 0);
  }

  const itemClauses = [...clauses];
  const itemValues = [...values];
  if (category) {
    itemValues.push(category);
    const placeholder = `$${itemValues.length}`;
    itemClauses.push(`(category = ${placeholder} OR tags ? ${placeholder})`);
  }
  itemValues.push(pageSize);
  const limitPlaceholder = `$${itemValues.length}`;
  itemValues.push(offset);
  const offsetPlaceholder = `$${itemValues.length}`;
  const result = await pool.query(
    `SELECT id, source, source_prompt_id, source_url, title, prompt, thumbnail_url, media_type, model, aspect_ratio, category, tags, author_name, published, featured
     FROM prompt_templates
     WHERE ${itemClauses.join(" AND ")}
     ORDER BY updated_at DESC, created_at DESC, id DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    itemValues,
  );

  const selectedTotal = category ? categoryCounts[category] || 0 : categoryCounts.All;
  return {
    items: result.rows
      .map((row) => normalizeTemplate(row as Record<string, unknown>))
      .filter((item) => item.source !== "meigen" || isUsablePromptText(item.prompt)),
    total: selectedTotal,
    page,
    pageSize,
    categoryCounts,
  };
}
