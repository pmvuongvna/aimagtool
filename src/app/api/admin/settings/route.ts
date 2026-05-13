import { NextRequest, NextResponse } from "next/server";
import { getCreditSettings, setUserCredits, updateCreditSettings } from "@/lib/credit";
import { getUserFromRequest } from "@/lib/auth";
import { getAdminToken } from "@/lib/env";

async function isAdmin(request: NextRequest) {
  const authUser = await getUserFromRequest(request);
  if (authUser?.role === "admin") return true;
  const token = request.headers.get("x-admin-token");
  return token === getAdminToken();
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: getCreditSettings() });
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

  const settings = body.settings ? updateCreditSettings(body.settings) : getCreditSettings();
  const userCredits =
    body.userCredit && body.userCredit.userId ? setUserCredits(body.userCredit.userId, body.userCredit.credits) : null;

  return NextResponse.json({ settings, userCredits });
}
