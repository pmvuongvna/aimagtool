import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createPaymentOrder, listPaymentOrders } from "@/lib/payments";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ orders: await listPaymentOrders(user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load payment orders." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { packageId?: string };
    if (!body.packageId) return NextResponse.json({ error: "packageId is required." }, { status: 400 });
    const order = await createPaymentOrder({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      packageId: body.packageId,
      origin: request.headers.get("origin"),
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create payment order." }, { status: 400 });
  }
}
