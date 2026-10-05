import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getAdminToken } from "@/lib/env";
import { confirmPayOSWebhook } from "@/lib/payos";
import { listAdminPayments, reconcilePendingPayments } from "@/lib/payments";

async function isAdmin(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (user?.role === "admin") return true;
  return request.headers.get("x-admin-token") === getAdminToken();
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ payments: await listAdminPayments() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load payments." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: "reconcile" | "confirm-webhook" };
    if (body.action === "confirm-webhook") {
      return NextResponse.json({ webhook: await confirmPayOSWebhook() });
    }
    return NextResponse.json({ outcomes: await reconcilePendingPayments() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment action failed." }, { status: 400 });
  }
}
