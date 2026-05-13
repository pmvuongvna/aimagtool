import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, loginUser, sanitizeUser, setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  const result = loginUser(email, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });

  const token = await createSessionToken(result.user);
  const response = NextResponse.json({ user: sanitizeUser(result.user) });
  setAuthCookie(response, token);
  return response;
}

