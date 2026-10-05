import { NextRequest, NextResponse } from "next/server";
import { processPayOSWebhook } from "@/lib/payments";
import type { PayOSWebhookPayload } from "@/lib/payos";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as PayOSWebhookPayload;
    const result = await processPayOSWebhook(payload);
    return NextResponse.json({ success: true, duplicate: result.duplicate });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Invalid webhook." }, { status: 400 });
  }
}
