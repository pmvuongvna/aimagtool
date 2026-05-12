import { NextRequest, NextResponse } from "next/server";
import { createUpscaleTask } from "@/lib/kie";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const { ok, retryAfter } = checkRateLimit(request);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
    );
  }

  try {
    const body = (await request.json()) as { imageUrl?: string; scale?: number };
    const imageUrl = body.imageUrl?.trim();
    const scale = body.scale === 4 ? 4 : 2;

    if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
      return NextResponse.json({ error: "imageUrl must be a valid http(s) URL." }, { status: 400 });
    }

    const payload = await createUpscaleTask(imageUrl, scale);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create upscale task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
