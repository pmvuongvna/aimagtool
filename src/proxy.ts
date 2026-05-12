import { NextRequest, NextResponse } from "next/server";
import { getAuthCookieName, getUserBySessionToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(getAuthCookieName())?.value;
  const user = getUserBySessionToken(token);

  if (pathname.startsWith("/user")) {
    if (!user) return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/admin")) {
    if (!user) return NextResponse.redirect(new URL("/login", request.url));
    if (user.role !== "admin") return NextResponse.redirect(new URL("/user", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/user/:path*", "/admin/:path*"],
};
