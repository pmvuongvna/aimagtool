import { NextRequest, NextResponse } from "next/server";
import { TEMPLATE_CATEGORIES } from "@/lib/template-catalog";
import { getPublicTemplates } from "@/lib/templates";

export async function GET(request: NextRequest) {
  const mediaTypeParam = request.nextUrl.searchParams.get("mediaType");
  const mediaType = mediaTypeParam === "video" ? "video" : mediaTypeParam === "image" ? "image" : undefined;
  const category = request.nextUrl.searchParams.get("category") || undefined;
  const query = request.nextUrl.searchParams.get("q") || undefined;

  const items = await getPublicTemplates({ mediaType, category, query });
  
  let diag: any[] = [];
  try {
    const { getPool, hasDatabase } = require("@/lib/db");
    if (hasDatabase()) {
      const pool = getPool();
      const diagRes = await pool.query("SELECT id, title, published, media_type, category FROM prompt_templates ORDER BY id DESC LIMIT 5");
      diag = diagRes.rows;
    } else {
      diag = [{ info: "No database connected" }];
    }
  } catch (err: any) {
    diag = [{ error: err.message }];
  }

  return NextResponse.json({
    categories: TEMPLATE_CATEGORIES,
    items,
    diag,
  });
}
