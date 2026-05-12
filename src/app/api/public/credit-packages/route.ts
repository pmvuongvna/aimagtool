import { NextResponse } from "next/server";
import { getCreditSettings } from "@/lib/credit";

export async function GET() {
  const settings = getCreditSettings();
  const packages = settings.creditPackages.filter((item) => item.active);
  return NextResponse.json({ packages });
}

