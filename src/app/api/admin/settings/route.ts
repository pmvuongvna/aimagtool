import { NextRequest, NextResponse } from "next/server";
import { getCreditSettings, setUserCredits, updateCreditSettings } from "@/lib/credit";
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

type CreditPackage = {
  id: string;
  name: string;
  credits: number;
  priceVnd: number;
  badge?: string;
  active: boolean;
};

type CreditSettingsPayload = {
  creditPackages?: CreditPackage[];
  imageCredits?: { "1k"?: number; "2k"?: number; "4k"?: number };
  videoCredits?: { "480p"?: number; "720p"?: number };
  grokVideoCreditsPerSecond?: { "480p"?: number; "720p"?: number };
  imageEditExtraCost?: number;
  defaultUserCredits?: number;
};

type BulkActionPayload = {
  action:
    | "set-zero"
    | "reset-default"
    | "add-default"
    | "set-package"
    | "promote-admin"
    | "demote-user";
  userIds: string[];
  packageId?: string;
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
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.created_at,
        COALESCE(c.credits, 0) AS credits
      FROM auth_users u
      LEFT JOIN user_credits c ON c.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 200
    `,
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: (row.role === "admin" ? "admin" : "user") as "user" | "admin",
    createdAt: new Date(String(row.created_at)).toISOString(),
    credits: Number(row.credits ?? 0),
  }));
}

async function setRoleForUsers(userIds: string[], role: "user" | "admin") {
  if (!userIds.length || !hasDatabase()) return;
  await ensureSchema();
  const pool = getPool();
  await pool.query("UPDATE auth_users SET role = $2 WHERE id = ANY($1::text[])", [userIds, role]);
}

async function setCreditsForMany(userIds: string[], creditsByUser: Map<string, number>) {
  if (!userIds.length || !hasDatabase()) return;
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const userId of userIds) {
      const credits = creditsByUser.get(userId);
      if (typeof credits !== "number" || Number.isNaN(credits)) continue;
      await client.query(
        `
          INSERT INTO user_credits (user_id, credits, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET credits = EXCLUDED.credits, updated_at = NOW()
        `,
        [userId, credits],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function getPackageCredits(packages: CreditPackage[] | undefined, packageId?: string) {
  if (!packageId) return null;
  const match = (packages || []).find((item) => item.id === packageId);
  return match ? Number(match.credits) : null;
}

async function runBulkAction(action: BulkActionPayload, settings: Awaited<ReturnType<typeof getCreditSettings>>) {
  const userIds = Array.from(new Set((action.userIds || []).filter(Boolean)));
  if (!userIds.length) return { affected: 0, message: "No users selected." };

  const users = await getAdminUsers();
  const selectedUsers = users.filter((item) => userIds.includes(item.id));
  if (!selectedUsers.length) return { affected: 0, message: "No matching users found." };

  if (action.action === "promote-admin") {
    await setRoleForUsers(selectedUsers.map((item) => item.id), "admin");
    return { affected: selectedUsers.length, message: `Promoted ${selectedUsers.length} user(s) to admin.` };
  }

  if (action.action === "demote-user") {
    await setRoleForUsers(selectedUsers.map((item) => item.id), "user");
    return { affected: selectedUsers.length, message: `Changed ${selectedUsers.length} user(s) back to user role.` };
  }

  const nextCredits = new Map<string, number>();
  const defaultCredits = Number(settings.defaultUserCredits || 0);
  const packageCredits = getPackageCredits(settings.creditPackages, action.packageId);

  for (const user of selectedUsers) {
    if (action.action === "set-zero") nextCredits.set(user.id, 0);
    if (action.action === "reset-default") nextCredits.set(user.id, defaultCredits);
    if (action.action === "add-default") nextCredits.set(user.id, Number(user.credits) + defaultCredits);
    if (action.action === "set-package" && packageCredits !== null) nextCredits.set(user.id, packageCredits);
  }

  if (action.action === "set-package" && packageCredits === null) {
    return { affected: 0, message: "Selected package was not found." };
  }

  await setCreditsForMany(selectedUsers.map((item) => item.id), nextCredits);

  const actionMessages: Record<Exclude<BulkActionPayload["action"], "promote-admin" | "demote-user">, string> = {
    "set-zero": `Set ${selectedUsers.length} user balance(s) to 0.`,
    "reset-default": `Reset ${selectedUsers.length} user balance(s) to the default pack.`,
    "add-default": `Added the default pack to ${selectedUsers.length} user balance(s).`,
    "set-package": `Applied the selected package to ${selectedUsers.length} user balance(s).`,
  };

  return { affected: selectedUsers.length, message: actionMessages[action.action] };
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await getCreditSettings(), users: await getAdminUsers() });
}

export async function PUT(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    settings?: CreditSettingsPayload;
    userCredit?: { userId: string; credits: number };
    bulkAction?: BulkActionPayload;
  };

  const settings = body.settings ? await updateCreditSettings(body.settings) : await getCreditSettings();
  const userCredits =
    body.userCredit && body.userCredit.userId
      ? await setUserCredits(body.userCredit.userId, body.userCredit.credits)
      : null;
  const bulkResult = body.bulkAction ? await runBulkAction(body.bulkAction, settings) : null;

  return NextResponse.json({
    settings,
    userCredits,
    bulkResult,
    users: await getAdminUsers(),
  });
}

