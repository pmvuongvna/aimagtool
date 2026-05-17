import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { addHistoryItem, getHistoryByUser, type MediaType } from "@/lib/history";
import { isProd } from "@/lib/env";

export async function GET(request: NextRequest) {
  const authUser = await getUserFromRequest(request);
  if (!authUser && isProd) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authUser?.id || request.nextUrl.searchParams.get("userId") || "demo-user";
  return NextResponse.json({ items: await getHistoryByUser(userId) });
}

export async function POST(request: NextRequest) {
  const authUser = await getUserFromRequest(request);
  if (!authUser && isProd) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { userId?: string; mediaType?: MediaType; urls?: string[]; prompt?: string };
  const userId = authUser?.id || body.userId || "demo-user";
  if (!body.mediaType || !Array.isArray(body.urls) || body.urls.length === 0) {
    return NextResponse.json({ error: "mediaType and urls are required." }, { status: 400 });
  }
  const item = await addHistoryItem({
    userId,
    mediaType: body.mediaType,
    urls: body.urls,
    prompt: body.prompt || "",
  });
  return NextResponse.json({ item });
}
