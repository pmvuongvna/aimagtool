import { NextRequest, NextResponse } from "next/server";
import { calculateTaskCost, getCreditSettings, getUserCredits } from "@/lib/credit";
import type { CreateTaskInput } from "@/lib/ai/types";
import { getUserFromRequest, sanitizeUser } from "@/lib/auth";
import { isProd } from "@/lib/env";

export async function GET(request: NextRequest) {
  const authUser = await getUserFromRequest(request);
  if (!authUser && isProd) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authUser?.id || request.nextUrl.searchParams.get("userId") || request.headers.get("x-user-id") || "demo-user";
  const settings = await getCreditSettings();

  const previewCosts = {
    image1k: await calculateTaskCost({ serviceId: "gpt-image-2-text", prompt: "x", imageResolution: "1k" } as CreateTaskInput),
    image2k: await calculateTaskCost({ serviceId: "gpt-image-2-text", prompt: "x", imageResolution: "2k" } as CreateTaskInput),
    image4k: await calculateTaskCost({ serviceId: "gpt-image-2-text", prompt: "x", imageResolution: "4k" } as CreateTaskInput),
    video480p: await calculateTaskCost({ serviceId: "grok-text-video", prompt: "x", videoResolution: "480p", duration: 1 } as CreateTaskInput),
    video720p: await calculateTaskCost({ serviceId: "grok-text-video", prompt: "x", videoResolution: "720p", duration: 1 } as CreateTaskInput),
  };

  return NextResponse.json({
    user: authUser ? sanitizeUser(authUser) : null,
    userId,
    credits: await getUserCredits(userId),
    settings,
    previewCosts,
  });
}

