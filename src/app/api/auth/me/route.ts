import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, sanitizeUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: sanitizeUser(user) });
}
