import { NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/lib/db";

export async function GET() {
  try {
    if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is missing." }, { status: 500 });
    const pool = getPool();
    const result = await pool.query("SELECT NOW() as now");
    return NextResponse.json({ ok: true, now: result.rows[0]?.now || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DB health check failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

