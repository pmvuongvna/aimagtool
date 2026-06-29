import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getAdminToken } from "@/lib/env";
import {
  createOrUpdateTemplate,
  getTemplateAdminSnapshot,
  runMeigenImport,
  recordPromptImportRun,
  updatePromptImportSettings,
  type PromptImportSettings,
  type PromptTemplateAdminInput,
} from "@/lib/template-importer";

async function isAdmin(request: NextRequest) {
  const token = request.headers.get("x-admin-token")?.trim();
  const adminToken = getAdminToken();
  if (token && token === adminToken) return true;

  try {
    const authUser = await getUserFromRequest(request);
    return authUser?.role === "admin";
  } catch (error) {
    console.error("Admin auth fallback failed", error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await getTemplateAdminSnapshot());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const details = error instanceof Error ? { name: error.name, stack: error.stack } : undefined;
    console.error("GET /api/admin/templates failed", error);
    return NextResponse.json({ error: message, details }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json()) as { importSettings?: Partial<PromptImportSettings> };
    const importSettings = await updatePromptImportSettings(body.importSettings || {});
    return NextResponse.json({ importSettings, snapshot: await getTemplateAdminSnapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const details = error instanceof Error ? { name: error.name, stack: error.stack } : undefined;
    console.error("PUT /api/admin/templates failed", error);
    return NextResponse.json({ error: message, details }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      action?: "import-now" | "create-manual" | "bulk-import";
      count?: number;
      manualTemplate?: PromptTemplateAdminInput;
      templates?: PromptTemplateAdminInput[];
      mode?: string;
    };

    if (body.action === "import-now") {
      const result = await runMeigenImport({ mode: "manual", count: body.count });
      return NextResponse.json({ result, snapshot: await getTemplateAdminSnapshot() });
    }

    if (body.action === "create-manual" && body.manualTemplate) {
      const item = await createOrUpdateTemplate({ ...body.manualTemplate, source: body.manualTemplate.source || "manual" });
      return NextResponse.json({ item, snapshot: await getTemplateAdminSnapshot() });
    }

    if (body.action === "bulk-import" && Array.isArray(body.templates)) {
      const imported = [] as Awaited<ReturnType<typeof createOrUpdateTemplate>>[];
      const errors: string[] = [];
      for (const entry of body.templates) {
        try {
          imported.push(await createOrUpdateTemplate({ ...entry, source: entry.source || "meigen" }));
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Unknown bulk import error");
        }
      }

      const run = await recordPromptImportRun({
        source: "meigen",
        mode: body.mode || "external",
        status: imported.length > 0 ? "success" : "failed",
        requestedCount: body.templates.length,
        importedCount: imported.length,
        message: imported.length > 0
          ? `Imported ${imported.length} prompt templates via external runner.`
          : `External runner did not import any MeiGen templates. ${errors[0] || "No valid templates were submitted."}`,
        details: {
          errors: errors.slice(0, 10),
          titles: imported.map((item) => item.title).slice(0, 12),
          candidateCount: body.templates.length,
          attemptedCount: body.templates.length,
          skippedCount: Math.max(0, body.templates.length - imported.length),
        },
      });

      return NextResponse.json({ result: { run, items: imported }, snapshot: await getTemplateAdminSnapshot() });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const details = error instanceof Error ? { name: error.name, stack: error.stack } : undefined;
    console.error("POST /api/admin/templates failed", error);
    return NextResponse.json({ error: message, details }, { status: 500 });
  }
}
