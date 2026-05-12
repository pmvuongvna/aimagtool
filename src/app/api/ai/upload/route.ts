import { NextRequest, NextResponse } from "next/server";
import { uploadFileToKie } from "@/lib/kie";
import { checkRateLimit } from "@/lib/rate-limit";

function extractUploadUrl(payload: Record<string, unknown>) {
  const data = (payload.data as Record<string, unknown>) || {};
  const candidates = [
    data.downloadUrl,
    data.download_url,
    data.url,
    data.file_url,
    data.fileUrl,
    (data.file as Record<string, unknown> | undefined)?.url,
    (data.result as Record<string, unknown> | undefined)?.url,
  ];
  for (const item of candidates) {
    if (typeof item === "string" && /^https?:\/\//.test(item)) return item;
  }
  return "";
}

export async function POST(request: NextRequest) {
  const { ok, retryAfter } = checkRateLimit(request);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
    );
  }

  try {
    const form = await request.formData();
    const fileLike = form.get("file");
    if (!fileLike || typeof fileLike === "string") {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }
    const file = fileLike;

    const payload = (await uploadFileToKie(file)) as Record<string, unknown>;
    const url = extractUploadUrl(payload);
    if (!url) {
      return NextResponse.json({ error: "Upload succeeded but no file URL found in response." }, { status: 500 });
    }

    return NextResponse.json({ url, payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
