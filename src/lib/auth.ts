import { NextRequest, NextResponse } from "next/server";
import { getUserCredits } from "@/lib/credit";

export type AuthRole = "user" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  createdAt: string;
};

type Session = {
  token: string;
  userId: string;
  createdAt: string;
};

type AuthState = {
  usersById: Map<string, AuthUser>;
  userIdByEmail: Map<string, string>;
  sessions: Map<string, Session>;
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
  const sessions = new Map<string, Session>();

  const admin: AuthUser = {
    id: "admin-user",
    name: "Admin",
    email: "admin@aistudio.local",
    passwordHash: pseudoHashPassword("admin123"),
    role: "admin",
    createdAt: new Date().toISOString(),
  };
  usersById.set(admin.id, admin);
  userIdByEmail.set(normalizeEmail(admin.email), admin.id);
  getUserCredits(admin.id);

  return { usersById, userIdByEmail, sessions };
}

function getState(): AuthState {
  const g = globalThis as typeof globalThis & { [globalKey]?: AuthState };
  if (!g[globalKey]) g[globalKey] = createState();
  return g[globalKey] as AuthState;
}

export function registerUser(name: string, email: string, password: string) {
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
  getUserCredits(id);
  return { ok: true as const, user };
}

export function loginUser(email: string, password: string) {
  const state = getState();
  const normalizedEmail = normalizeEmail(email);
  const userId = state.userIdByEmail.get(normalizedEmail);
  if (!userId) return { ok: false as const, error: "Invalid email or password." };
  const user = state.usersById.get(userId);
  if (!user) return { ok: false as const, error: "Invalid email or password." };
  if (user.passwordHash !== pseudoHashPassword(password)) {
    return { ok: false as const, error: "Invalid email or password." };
  }
  return { ok: true as const, user };
}

export function createSession(userId: string) {
  const state = getState();
  const token = createId("session");
  const session: Session = { token, userId, createdAt: new Date().toISOString() };
  state.sessions.set(token, session);
  return session;
}

export function getUserBySessionToken(token?: string | null) {
  if (!token) return null;
  const state = getState();
  const session = state.sessions.get(token);
  if (!session) return null;
  return state.usersById.get(session.userId) ?? null;
}

export function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value ?? null;
  return getUserBySessionToken(token);
}

export function clearSession(token?: string | null) {
  if (!token) return;
  getState().sessions.delete(token);
}

export function sanitizeUser(user: AuthUser) {
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
