import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getAdminCredentials, getSessionSecret, allowDemoAuth } from "@/lib/env";

export type AuthRole = "user" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  createdAt: string;
};

type AuthState = {
  usersById: Map<string, AuthUser>;
  userIdByEmail: Map<string, string>;
};

type SessionPayload = JWTPayload & {
  uid: string;
  role: AuthRole;
  email: string;
  name: string;
};

const AUTH_COOKIE = "aistudio_session";
const globalKey = "__aistudio_auth_state__";

function pseudoHashPassword(password: string) {
  return `pw:${password}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createState(): AuthState {
  const usersById = new Map<string, AuthUser>();
  const userIdByEmail = new Map<string, string>();

  if (allowDemoAuth()) {
    const adminCreds = getAdminCredentials();
    const admin: AuthUser = {
      id: "admin-user",
      name: "Admin",
      email: adminCreds.email,
      passwordHash: pseudoHashPassword(adminCreds.password),
      role: "admin",
      createdAt: new Date().toISOString(),
    };
    usersById.set(admin.id, admin);
    userIdByEmail.set(normalizeEmail(admin.email), admin.id);
  }

  return { usersById, userIdByEmail };
}

function getState(): AuthState {
  const g = globalThis as typeof globalThis & { [globalKey]?: AuthState };
  if (!g[globalKey]) g[globalKey] = createState();
  return g[globalKey] as AuthState;
}

function getSecretKey() {
  return new TextEncoder().encode(getSessionSecret());
}

async function signSessionToken(user: Pick<AuthUser, "id" | "role" | "email" | "name">) {
  return new SignJWT({ uid: user.id, role: user.role, email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function verifySessionToken(token?: string | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const p = payload as SessionPayload;
    if (!p.uid || !p.role || !p.email || !p.name) return null;
    return {
      id: String(p.uid),
      name: String(p.name),
      email: String(p.email),
      role: p.role,
      createdAt: new Date((p.iat || 0) * 1000).toISOString(),
    } satisfies Omit<AuthUser, "passwordHash">;
  } catch {
    return null;
  }
}

export function registerUser(name: string, email: string, password: string) {
  if (!allowDemoAuth()) {
    return { ok: false as const, error: "Registration requires database setup in production." };
  }

  const state = getState();
  const normalizedEmail = normalizeEmail(email);
  if (state.userIdByEmail.has(normalizedEmail)) {
    return { ok: false as const, error: "Email already exists." };
  }

  const id = createId("user");
  const user: AuthUser = {
    id,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: pseudoHashPassword(password),
    role: "user",
    createdAt: new Date().toISOString(),
  };

  state.usersById.set(id, user);
  state.userIdByEmail.set(normalizedEmail, id);
  return { ok: true as const, user };
}

export function loginUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const adminCreds = getAdminCredentials();

  if (normalizedEmail === adminCreds.email && password === adminCreds.password) {
    return {
      ok: true as const,
      user: {
        id: "admin-user",
        name: "Admin",
        email: adminCreds.email,
        passwordHash: "",
        role: "admin" as const,
        createdAt: new Date().toISOString(),
      },
    };
  }

  if (!allowDemoAuth()) return { ok: false as const, error: "Invalid email or password." };

  const state = getState();
  const userId = state.userIdByEmail.get(normalizedEmail);
  if (!userId) return { ok: false as const, error: "Invalid email or password." };
  const user = state.usersById.get(userId);
  if (!user) return { ok: false as const, error: "Invalid email or password." };
  if (user.passwordHash !== pseudoHashPassword(password)) {
    return { ok: false as const, error: "Invalid email or password." };
  }
  return { ok: true as const, user };
}

export async function createSessionToken(user: Pick<AuthUser, "id" | "role" | "email" | "name">) {
  return signSessionToken(user);
}

export async function getUserBySessionToken(token?: string | null) {
  return verifySessionToken(token);
}

export async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value ?? null;
  return getUserBySessionToken(token);
}

export function clearSession(_token?: string | null) {
  return;
}

export function sanitizeUser(user: Pick<AuthUser, "id" | "name" | "email" | "role" | "createdAt">) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function getAuthCookieName() {
  return AUTH_COOKIE;
}
