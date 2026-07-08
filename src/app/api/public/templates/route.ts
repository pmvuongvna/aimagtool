import { NextRequest, NextResponse } from "next/server";
import { TEMPLATE_CATEGORIES } from "@/lib/template-catalog";
import { getPublicTemplates } from "@/lib/templates";
import { getPool, hasDatabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  const mediaTypeParam = request.nextUrl.searchParams.get("mediaType");
  const mediaType = mediaTypeParam === "video" ? "video" : mediaTypeParam === "image" ? "image" : undefined;
  const category = request.nextUrl.searchParams.get("category") || undefined;
  const query = request.nextUrl.searchParams.get("q") || undefined;

  const items = await getPublicTemplates({ mediaType, category, query });
  
  let diag: any[] = [];
  try {
    const globalTemplatesKey = "__aistudio_memory_templates__";
    const g = globalThis as typeof globalThis & { [globalTemplatesKey]?: Map<string, any> };
    const list = g[globalTemplatesKey] ? Array.from(g[globalTemplatesKey].values()) : [];
    diag = list.map((item) => ({
      id: item.id,
      title: item.title,
      published: item.published,
      mediaType: item.mediaType,
      category: item.category,
    }));
  } catch (err: any) {
    diag = [{ error: err.message }];
  }

  return NextResponse.json({
    categories: TEMPLATE_CATEGORIES,
    items,
    diag,
  });
}
