import { NextResponse } from "next/server";
import { clearAuthCookie, clearSession } from "@/lib/auth";

export async function POST() {
  clearSession();
  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}
