import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getAdminToken } from "@/lib/env";
import {
  createOrUpdateTemplate,
  getTemplateAdminSnapshot,
  runMeigenImport,
  updatePromptImportSettings,
  type PromptImportSettings,
  type PromptTemplateAdminInput,
} from "@/lib/template-importer";

async function isAdmin(request: NextRequest) {
  const authUser = await getUserFromRequest(request);
  if (authUser?.role === "admin") return true;
  const token = request.headers.get("x-admin-token");
  return token === getAdminToken();
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getTemplateAdminSnapshot());
}

export async function PUT(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { importSettings?: Partial<PromptImportSettings> };
  const importSettings = await updatePromptImportSettings(body.importSettings || {});
  return NextResponse.json({ importSettings, snapshot: await getTemplateAdminSnapshot() });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    action?: "import-now" | "create-manual";
    count?: number;
    manualTemplate?: PromptTemplateAdminInput;
  };

  if (body.action === "import-now") {
    const result = await runMeigenImport({ mode: "manual", count: body.count });
    return NextResponse.json({ result, snapshot: await getTemplateAdminSnapshot() });
  }

  if (body.action === "create-manual" && body.manualTemplate) {
    const item = await createOrUpdateTemplate({ ...body.manualTemplate, source: body.manualTemplate.source || "manual" });
    return NextResponse.json({ item, snapshot: await getTemplateAdminSnapshot() });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
