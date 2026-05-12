import { NextResponse } from "next/server";
import { getTaskDetails } from "@/lib/kie";

export async function GET(_: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await context.params;
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required." }, { status: 400 });
    }

    const payload = await getTaskDetails(taskId);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Unable to fetch task details." }, { status: 500 });
  }
}
