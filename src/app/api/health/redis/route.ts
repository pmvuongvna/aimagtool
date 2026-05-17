import { NextResponse } from "next/server";
import net from "node:net";

export const runtime = "nodejs";

function parseRedisUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
  };
}

async function pingRedisTcp(host: string, port: number, timeoutMs = 3000) {
  return await new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

export async function GET() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return NextResponse.json({
      ok: false,
      configured: false,
      usedByApp: false,
      error: "REDIS_URL is missing.",
    });
  }

  try {
    const { host, port } = parseRedisUrl(redisUrl);
    const reachable = await pingRedisTcp(host, port);
    if (!reachable) {
      return NextResponse.json({
        ok: false,
        configured: true,
        usedByApp: false,
        error: "Cannot connect to Redis host/port.",
      });
    }
    return NextResponse.json({
      ok: true,
      configured: true,
      usedByApp: false,
      note: "Redis is reachable. Current codebase does not yet use Redis for queue/cache.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Redis check failed.";
    return NextResponse.json({ ok: false, configured: true, usedByApp: false, error: message });
  }
}

