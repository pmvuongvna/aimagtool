import { NextRequest, NextResponse } from "next/server";
import { getAdminToken } from "@/lib/env";
import { reconcilePendingPayments } from "@/lib/payments";

function isAuthorized(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return (request.headers.get("x-admin-token") || bearer) === getAdminToken();
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ outcomes: await reconcilePendingPayments() });
}
