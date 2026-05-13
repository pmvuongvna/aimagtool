import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, registerUser, sanitizeUser, setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string; email?: string; password?: string };
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
  if (!email.includes("@")) return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

  const result = registerUser(name, email, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  const token = await createSessionToken(result.user);
  const response = NextResponse.json({ user: sanitizeUser(result.user) });
  setAuthCookie(response, token);
  return response;
}

