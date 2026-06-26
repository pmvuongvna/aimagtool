import { NextRequest, NextResponse } from "next/server";
import { getAdminToken } from "@/lib/env";
import { runMeigenImport } from "@/lib/template-importer";

function isAuthorized(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const token = request.headers.get("x-admin-token") || bearer;
  return token === getAdminToken();
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runMeigenImport({ mode: "cron" });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { count?: number };
  const result = await runMeigenImport({ mode: "cron", count: body.count });
  return NextResponse.json(result);
}
