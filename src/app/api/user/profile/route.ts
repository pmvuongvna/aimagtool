import { NextRequest, NextResponse } from "next/server";
import { calculateTaskCost, getCreditSettings, getUserCredits } from "@/lib/credit";
import type { CreateTaskInput } from "@/lib/ai/types";
import { getUserFromRequest, sanitizeUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const authUser = getUserFromRequest(request);
  const userId = authUser?.id || request.nextUrl.searchParams.get("userId") || request.headers.get("x-user-id") || "demo-user";
  const settings = getCreditSettings();

  const previewCosts = {
    image1k: calculateTaskCost({ serviceId: "gpt-image-2-text", prompt: "x", imageResolution: "1k" } as CreateTaskInput),
    image2k: calculateTaskCost({ serviceId: "gpt-image-2-text", prompt: "x", imageResolution: "2k" } as CreateTaskInput),
    image4k: calculateTaskCost({ serviceId: "gpt-image-2-text", prompt: "x", imageResolution: "4k" } as CreateTaskInput),
    video480p: calculateTaskCost({ serviceId: "grok-text-video", prompt: "x", videoResolution: "480p", duration: 1 } as CreateTaskInput),
    video720p: calculateTaskCost({ serviceId: "grok-text-video", prompt: "x", videoResolution: "720p", duration: 1 } as CreateTaskInput),
  };

  return NextResponse.json({
    user: authUser ? sanitizeUser(authUser) : null,
    userId,
    credits: getUserCredits(userId),
    settings,
    previewCosts,
  });
}
