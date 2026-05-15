import { NextRequest, NextResponse } from "next/server";
import { getAuthCookieName, getUserBySessionToken } from "@/lib/auth";

function getAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return ["https://escanor.app", "http://localhost:3000"];
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

function applyCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get("origin");
  if (!origin) return response;
  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.includes(origin)) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-user-id, x-admin-token");
  response.headers.set("Vary", "Origin");
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      return applyCors(request, new NextResponse(null, { status: 204 }));
    }
    return applyCors(request, NextResponse.next());
  }

  const token = request.cookies.get(getAuthCookieName())?.value;
  const user = await getUserBySessionToken(token);

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
  matcher: ["/api/:path*", "/user/:path*", "/admin/:path*"],
};
