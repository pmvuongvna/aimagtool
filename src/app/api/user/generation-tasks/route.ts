import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { listGenerationTasks } from "@/lib/generation-tasks";
import { isProd } from "@/lib/env";
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user && isProd) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ tasks: await listGenerationTasks(user?.id || "demo-user") });
}
