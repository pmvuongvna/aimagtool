import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { cancelPaymentOrder, reconcilePaymentOrder } from "@/lib/payments";

export async function GET(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { orderId } = await context.params;
    const order = await reconcilePaymentOrder(user.id, orderId);
    if (!order) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reconcile payment order." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { orderId } = await context.params;
    const order = await cancelPaymentOrder(user.id, orderId);
    if (!order) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to cancel payment order." }, { status: 400 });
  }
}
