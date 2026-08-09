import { NextRequest, NextResponse } from "next/server";
import { TEMPLATE_CATEGORIES } from "@/lib/template-catalog";
import { getPublicTemplates } from "@/lib/templates";

export async function GET(request: NextRequest) {
  const mediaTypeParam = request.nextUrl.searchParams.get("mediaType");
  const mediaType = mediaTypeParam === "video" ? "video" : mediaTypeParam === "image" ? "image" : undefined;
  const category = request.nextUrl.searchParams.get("category") || undefined;
  const query = request.nextUrl.searchParams.get("q") || undefined;
  const page = Number(request.nextUrl.searchParams.get("page") || "1");
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") || "20");

  const result = await getPublicTemplates({ mediaType, category, query, page, pageSize });

  return NextResponse.json({
    categories: TEMPLATE_CATEGORIES,
    ...result,
  });
}