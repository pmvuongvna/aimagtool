import { DEFAULT_PROMPT_TEMPLATES, TEMPLATE_CATEGORIES, type PromptTemplate, type TemplateMediaType } from "@/lib/template-catalog";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";
import { normalizeR2PublicImageUrl } from "@/lib/r2";

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

function normalizeTemplate(row: Record<string, unknown>): PublicPromptTemplate {
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
    category: TEMPLATE_CATEGORIES.includes(String(row.category || "All") as (typeof TEMPLATE_CATEGORIES)[number])
      ? (String(row.category || "All") as (typeof TEMPLATE_CATEGORIES)[number])
      : "All",
    tags: Array.isArray(row.tags) ? row.tags.map((item) => String(item)) : [],
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

export async function getPublicTemplates(options?: { mediaType?: TemplateMediaType; category?: string; query?: string }) {
  const mediaType = options?.mediaType;
  const category = options?.category && options.category !== "All" ? options.category : undefined;
  const query = options?.query?.trim().toLowerCase();

  if (!hasDatabase()) {
    return Array.from(memoryTemplatesMap.values()).filter((item) => {
      if (mediaType && item.mediaType !== mediaType) return false;
      if (category && item.category !== category && !item.tags.includes(category)) return false;
      if (query) {
        const haystack = `${item.title} ${item.prompt} ${item.tags.join(" ")} ${item.model}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return item.published;
    });
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

  if (category) {
    values.push(category);
    clauses.push(`(category = $${values.length} OR tags ? $${values.length})`);
  }

  if (query) {
    values.push(`%${query}%`);
    clauses.push(`(LOWER(title) LIKE $${values.length} OR LOWER(prompt) LIKE $${values.length} OR LOWER(model) LIKE $${values.length})`);
  }

  const result = await pool.query(
    `SELECT id, source, source_prompt_id, source_url, title, prompt, thumbnail_url, media_type, model, aspect_ratio, category, tags, author_name, published, featured
     FROM prompt_templates
     WHERE ${clauses.join(" AND ")}
     ORDER BY updated_at DESC, created_at DESC, id DESC
     LIMIT 120`,
    values,
  );

  return result.rows.map((row) => normalizeTemplate(row as Record<string, unknown>));
}
