import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAIGenerationTask } from "@/lib/ai/service";
import type { CreateTaskInput } from "@/lib/ai/types";
import { calculateTaskCost, chargeCredits, refundCredits } from "@/lib/credit";
import { getUserFromRequest } from "@/lib/auth";
import { isProd } from "@/lib/env";
import { randomUUID } from "node:crypto";
import { saveGenerationTask } from "@/lib/generation-tasks";

export async function POST(request: NextRequest) {
  const { ok, retryAfter } = checkRateLimit(request);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
    );
  }

  try {
    const body = (await request.json()) as CreateTaskInput;
    if (!body.serviceId) {
      return NextResponse.json({ error: "serviceId is required." }, { status: 400 });
    }
    const authUser = await getUserFromRequest(request);
    if (!authUser && isProd) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser?.id || request.headers.get("x-user-id") || "demo-user";
    const cost = await calculateTaskCost(body);
    const creditReferenceId = request.headers.get("x-idempotency-key")?.trim() || randomUUID();
    const creditMetadata = { serviceId: body.serviceId, requestId: creditReferenceId };
    const charged = await chargeCredits(userId, cost, creditReferenceId, creditMetadata);
    if (!charged.ok) {
      return NextResponse.json(
        { error: `Not enough credits. Required ${cost}, available ${charged.credits}.`, required: cost, available: charged.credits },
        { status: 402 },
      );
    }

    try {
      const payload = await createAIGenerationTask(body);
      if (payload.data?.taskId) await saveGenerationTask({ id: payload.data.taskId, userId, mediaType: body.serviceId.includes("video") || body.serviceId === "kling-motion-control" ? "video" : "image", prompt: body.prompt || "Reference assets", status: "pending", urls: [], createdAt: new Date().toISOString() });
      return NextResponse.json({ ...payload, creditCost: cost, remainingCredits: charged.credits });
    } catch (innerError) {
      const credits = await refundCredits(userId, cost, creditReferenceId, creditMetadata);
      const message = innerError instanceof Error ? innerError.message : "Unable to create task.";
      return NextResponse.json({ error: message, remainingCredits: credits }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create task.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

