import { NextRequest, NextResponse } from "next/server";
import { getCreditSettings, getUserCredits, setUserCredits, updateCreditSettings } from "@/lib/credit";
import { getUserFromRequest } from "@/lib/auth";
import { getAdminToken } from "@/lib/env";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";

type AdminUserItem = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  credits: number;
};

async function isAdmin(request: NextRequest) {
  const authUser = await getUserFromRequest(request);
  if (authUser?.role === "admin") return true;
  const token = request.headers.get("x-admin-token");
  return token === getAdminToken();
}

async function getAdminUsers(): Promise<AdminUserItem[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    "SELECT id, name, email, role, created_at FROM auth_users ORDER BY created_at DESC LIMIT 200",
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: (row.role === "admin" ? "admin" : "user") as "user" | "admin",
    createdAt: new Date(String(row.created_at)).toISOString(),
    credits: 0,
  }));
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await getAdminUsers();
  for (const user of users) user.credits = await getUserCredits(user.id);
  return NextResponse.json({ settings: await getCreditSettings(), users });
}

export async function PUT(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    settings?: {
      creditPackages?: Array<{ id: string; name: string; credits: number; priceVnd: number; badge?: string; active: boolean }>;
      imageCredits?: { "1k"?: number; "2k"?: number; "4k"?: number };
      videoCredits?: { "480p"?: number; "720p"?: number };
      grokVideoCreditsPerSecond?: { "480p"?: number; "720p"?: number };
      imageEditExtraCost?: number;
      defaultUserCredits?: number;
    };
    userCredit?: { userId: string; credits: number };
  };

  const settings = body.settings ? await updateCreditSettings(body.settings) : await getCreditSettings();
  const userCredits =
    body.userCredit && body.userCredit.userId ? await setUserCredits(body.userCredit.userId, body.userCredit.credits) : null;

  const users = await getAdminUsers();
  for (const user of users) user.credits = await getUserCredits(user.id);
  return NextResponse.json({ settings, userCredits, users });
}
