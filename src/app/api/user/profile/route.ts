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
    gpt25Flare: settings.gpt25FlareCredits,
    nanoBanana21: settings.nanoBanana21Credits,
    gpt25Sunburst: settings.gpt25SunburstCredits,
    imageEditExtraCost: settings.imageEditExtraCost,
    image1k: settings.imageCredits["1k"],
    image2k: settings.imageCredits["2k"],
    image4k: settings.imageCredits["4k"],
    imageEdit1k: await calculateTaskCost({ serviceId: "qwen3-pro-image", prompt: "x", imageResolution: "1k", inputUrl: "https://example.com/a.jpg" } as CreateTaskInput),
    imageEdit2k: await calculateTaskCost({ serviceId: "qwen3-pro-image", prompt: "x", imageResolution: "2k", inputUrl: "https://example.com/a.jpg" } as CreateTaskInput),
    imageEdit4k: await calculateTaskCost({ serviceId: "qwen3-pro-image", prompt: "x", imageResolution: "4k", inputUrl: "https://example.com/a.jpg" } as CreateTaskInput),
    qwen21Text1k: await calculateTaskCost({ serviceId: "qwen2-1-text", prompt: "x", imageResolution: "1k" } as CreateTaskInput),
    qwen21Text2k: await calculateTaskCost({ serviceId: "qwen2-1-text", prompt: "x", imageResolution: "2k" } as CreateTaskInput),
    qwen21Image1k: await calculateTaskCost({ serviceId: "qwen2-1-image", prompt: "x", imageResolution: "1k", inputUrl: "https://example.com/a.jpg" } as CreateTaskInput),
    qwen21Image2k: await calculateTaskCost({ serviceId: "qwen2-1-image", prompt: "x", imageResolution: "2k", inputUrl: "https://example.com/a.jpg" } as CreateTaskInput),
    seedream5FlashText1k: await calculateTaskCost({ serviceId: "seedream-5-flash-text", prompt: "x", imageSize: "1k" } as CreateTaskInput),
    seedream5FlashText15k: await calculateTaskCost({ serviceId: "seedream-5-flash-text", prompt: "x", imageSize: "1.5k" } as CreateTaskInput),
    seedream5FlashText2k: await calculateTaskCost({ serviceId: "seedream-5-flash-text", prompt: "x", imageSize: "2k" } as CreateTaskInput),
    seedream5FlashImage1k: await calculateTaskCost({ serviceId: "seedream-5-flash-image", prompt: "x", imageSize: "1k", inputUrl: "https://example.com/a.jpg" } as CreateTaskInput),
    seedream5FlashImage15k: await calculateTaskCost({ serviceId: "seedream-5-flash-image", prompt: "x", imageSize: "1.5k", inputUrl: "https://example.com/a.jpg" } as CreateTaskInput),
    seedream5FlashImage2k: await calculateTaskCost({ serviceId: "seedream-5-flash-image", prompt: "x", imageSize: "2k", inputUrl: "https://example.com/a.jpg" } as CreateTaskInput),
    grok480p: await calculateTaskCost({ serviceId: "grok-text-video", prompt: "x", videoResolution: "480p", duration: 1 } as CreateTaskInput),
    grok720p: await calculateTaskCost({ serviceId: "grok-text-video", prompt: "x", videoResolution: "720p", duration: 1 } as CreateTaskInput),
    seedance480p: await calculateTaskCost({ serviceId: "seedance-2-text-video", prompt: "x", videoResolution: "480p", duration: 15 } as CreateTaskInput),
    seedance720p: await calculateTaskCost({ serviceId: "seedance-2-text-video", prompt: "x", videoResolution: "720p", duration: 15 } as CreateTaskInput),
    seedance1080p: await calculateTaskCost({ serviceId: "seedance-2-text-video", prompt: "x", videoResolution: "1080p", duration: 15 } as CreateTaskInput),
    seedance4k: await calculateTaskCost({ serviceId: "seedance-2-text-video", prompt: "x", videoResolution: "4k", duration: 15 } as CreateTaskInput),
    seedance25_480p: await calculateTaskCost({ serviceId: "seedance-2-5-video", prompt: "x", videoResolution: "480p", duration: 5 } as CreateTaskInput),
    seedance25_720p: await calculateTaskCost({ serviceId: "seedance-2-5-video", prompt: "x", videoResolution: "720p", duration: 5 } as CreateTaskInput),
    seedance25_1080p: await calculateTaskCost({ serviceId: "seedance-2-5-video", prompt: "x", videoResolution: "1080p", duration: 5 } as CreateTaskInput),
    kling720p: await calculateTaskCost({ serviceId: "kling-motion-control", prompt: "x", klingMotionMode: "720p", inputUrl: "https://example.com/a.jpg", referenceVideoUrl: "https://example.com/b.mp4" } as CreateTaskInput),
    kling1080p: await calculateTaskCost({ serviceId: "kling-motion-control", prompt: "x", klingMotionMode: "1080p", inputUrl: "https://example.com/a.jpg", referenceVideoUrl: "https://example.com/b.mp4" } as CreateTaskInput),
  };

  return NextResponse.json({
    user: authUser ? sanitizeUser(authUser) : null,
    userId,
    credits: await getUserCredits(userId),
    settings,
    previewCosts,
  });
}
