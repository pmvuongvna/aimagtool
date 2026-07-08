import { NextRequest, NextResponse } from "next/server";
import { TEMPLATE_CATEGORIES } from "@/lib/template-catalog";
import { getPublicTemplates } from "@/lib/templates";

export async function GET(request: NextRequest) {
  const mediaTypeParam = request.nextUrl.searchParams.get("mediaType");
  const mediaType = mediaTypeParam === "video" ? "video" : mediaTypeParam === "image" ? "image" : undefined;
  const category = request.nextUrl.searchParams.get("category") || undefined;
  const query = request.nextUrl.searchParams.get("q") || undefined;

  const items = await getPublicTemplates({ mediaType, category, query });
  return NextResponse.json({
    categories: TEMPLATE_CATEGORIES,
    items,
  });
}
