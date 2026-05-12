import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, clearSession, getAuthCookieName } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(getAuthCookieName())?.value;
  clearSession(token);
  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}
