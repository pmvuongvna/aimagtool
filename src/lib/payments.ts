import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { applyCreditMutationWithClient, getCreditSettings } from "@/lib/credit";
import { ensureSchema, getPool, hasDatabase } from "@/lib/db";
import { cancelPayOSPaymentRequest, createPayOSPaymentLink, getPayOSPaymentRequest, type PayOSPaymentInfo, type PayOSWebhookPayload, verifyPayOSWebhook } from "@/lib/payos";

export type PaymentStatus = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED" | "FAILED" | "MANUAL_REVIEW" | "REFUNDED";

export type PaymentOrder = {
  id: string;
  orderCode: number;
  userId: string;
  provider: string;
  providerPaymentId: string;
  providerReference: string;
  packageId: string;
  packageName: string;
  credits: number;
  amountVnd: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl: string;
  qrCode: string;
  description: string;
  expiresAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreditLedgerEntry = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  referenceType: string;
  referenceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

function requireDatabase() {
  if (!hasDatabase()) throw new Error("Payments require a configured PostgreSQL database.");
}

function asIso(value: unknown) {
  return value ? new Date(String(value)).toISOString() : null;
}

function mapOrder(row: Record<string, unknown>): PaymentOrder {
  return {
    id: String(row.id),
    orderCode: Number(row.order_code),
    userId: String(row.user_id),
    provider: String(row.provider || "payos"),
    providerPaymentId: String(row.provider_payment_id || ""),
    providerReference: String(row.provider_reference || ""),
    packageId: String(row.package_id),
    packageName: String(row.package_name),
    credits: Number(row.credits || 0),
    amountVnd: Number(row.amount_vnd || 0),
    currency: String(row.currency || "VND"),
    status: String(row.status || "PENDING") as PaymentStatus,
    checkoutUrl: String(row.checkout_url || ""),
    qrCode: String(row.qr_code || ""),
    description: String(row.description || ""),
    expiresAt: asIso(row.expires_at),
    paidAt: asIso(row.paid_at),
    cancelledAt: asIso(row.cancelled_at),
    createdAt: asIso(row.created_at) || new Date().toISOString(),
    updatedAt: asIso(row.updated_at) || new Date().toISOString(),
  };
}

async function findOrderForUpdate(client: import("pg").PoolClient, identifier: string | number) {
  const byOrderCode = /^\d+$/.test(String(identifier));
  const result = await client.query(
    `SELECT * FROM payment_orders WHERE ${byOrderCode ? "order_code = $1" : "id = $1"} LIMIT 1 FOR UPDATE`,
    [byOrderCode ? Number(identifier) : String(identifier)],
  );
  return (result.rows[0] as Record<string, unknown> | undefined) || null;
}

async function applyProviderState(identifier: string | number, info: PayOSPaymentInfo, source: "webhook" | "reconcile") {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const row = await findOrderForUpdate(client, identifier);
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    const order = mapOrder(row);
    if (order.status === "PAID" || order.status === "REFUNDED") {
      await client.query("COMMIT");
      return order;
    }

    const paidAmount = Number(info.amountPaid || info.amount || 0);
    if (String(info.status).toUpperCase() === "PAID") {
      if (paidAmount !== order.amountVnd) {
        const reviewed = await client.query(
          "UPDATE payment_orders SET status = 'MANUAL_REVIEW', provider_payment_id = COALESCE($2, provider_payment_id), updated_at = NOW() WHERE id = $1 RETURNING *",
          [order.id, info.id || null],
        );
        await client.query("COMMIT");
        return mapOrder(reviewed.rows[0]);
      }
      await applyCreditMutationWithClient(client, {
        userId: order.userId,
        delta: order.credits,
        reason: "credit_purchase",
        referenceType: "payment_order",
        referenceId: order.id,
        metadata: { provider: "payos", orderCode: order.orderCode, packageId: order.packageId, source },
      });
      const paid = await client.query(
        `UPDATE payment_orders SET status = 'PAID', provider_payment_id = COALESCE($2, provider_payment_id),
         provider_reference = COALESCE($3, provider_reference), paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [order.id, info.id || null, (info.transactions as Array<Record<string, unknown>> | undefined)?.[0]?.reference || null],
      );
      await client.query("COMMIT");
      return mapOrder(paid.rows[0]);
    }

    const providerStatus = String(info.status || "").toUpperCase();
    if (providerStatus === "CANCELLED" || providerStatus === "EXPIRED") {
      const nextStatus = providerStatus as "CANCELLED" | "EXPIRED";
      const cancelled = await client.query(
        `UPDATE payment_orders SET status = $2, cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END,
         provider_payment_id = COALESCE($3, provider_payment_id), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [order.id, nextStatus, info.id || null],
      );
      await client.query("COMMIT");
      return mapOrder(cancelled.rows[0]);
    }

    await client.query("COMMIT");
    return order;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function resolveReturnBase(origin?: string | null) {
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "escanor.app" || url.hostname === "www.escanor.app") {
        return url.origin;
      }
    } catch {}
  }
  return (process.env.PUBLIC_APP_URL || "https://escanor.app").trim().replace(/\/+$/, "");
}

export async function createPaymentOrder(input: { userId: string; userName?: string; userEmail?: string; packageId: string; origin?: string | null }) {
  requireDatabase();
  await ensureSchema();
  const settings = await getCreditSettings();
  const selectedPackage = settings.creditPackages.find((item) => item.id === input.packageId && item.active);
  if (!selectedPackage || selectedPackage.priceVnd <= 0 || selectedPackage.credits <= 0) throw new Error("Credit package is unavailable.");

  const client = await getPool().connect();
  let order: PaymentOrder;
  try {
    await client.query("BEGIN");
    const sequence = await client.query("SELECT nextval('payment_order_code_seq') AS order_code");
    const orderCode = Number(sequence.rows[0].order_code);
    const id = `pay-${randomUUID()}`;
    const description = `ESC ${orderCode}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const created = await client.query(
      `INSERT INTO payment_orders
       (id, order_code, user_id, package_id, package_name, credits, amount_vnd, status, description, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9) RETURNING *`,
      [id, orderCode, input.userId, selectedPackage.id, selectedPackage.name, selectedPackage.credits, selectedPackage.priceVnd, description, expiresAt],
    );
    order = mapOrder(created.rows[0]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const returnBase = resolveReturnBase(input.origin);
  try {
    const paymentLink = await createPayOSPaymentLink({
      orderCode: order.orderCode,
      amount: order.amountVnd,
      description: order.description,
      buyerName: input.userName,
      buyerEmail: input.userEmail,
      itemName: `${order.packageName} - ${order.credits} credits`,
      returnUrl: `${returnBase}/user/credits?payment=return`,
      cancelUrl: `${returnBase}/user/credits?payment=cancel`,
      expiredAt: Math.floor(new Date(order.expiresAt || Date.now() + 15 * 60_000).getTime() / 1000),
    });
    const updated = await getPool().query(
      `UPDATE payment_orders SET provider_payment_id = $2, checkout_url = $3, qr_code = $4, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [order.id, paymentLink.paymentLinkId, paymentLink.checkoutUrl, paymentLink.qrCode],
    );
    return mapOrder(updated.rows[0]);
  } catch (error) {
    await getPool().query("UPDATE payment_orders SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [order.id]);
    throw error;
  }
}

export async function listPaymentOrders(userId: string, limit = 30) {
  requireDatabase();
  await ensureSchema();
  const result = await getPool().query(
    "SELECT * FROM payment_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, Math.max(1, Math.min(100, limit))],
  );
  return result.rows.map((row) => mapOrder(row));
}

export async function getPaymentOrder(userId: string, identifier: string) {
  requireDatabase();
  await ensureSchema();
  const byOrderCode = /^\d+$/.test(identifier);
  const result = await getPool().query(
    `SELECT * FROM payment_orders WHERE user_id = $1 AND ${byOrderCode ? "order_code = $2" : "id = $2"} LIMIT 1`,
    [userId, byOrderCode ? Number(identifier) : identifier],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

export async function reconcilePaymentOrder(userId: string, identifier: string) {
  const order = await getPaymentOrder(userId, identifier);
  if (!order || !["PENDING", "MANUAL_REVIEW"].includes(order.status)) return order;
  const info = await getPayOSPaymentRequest(order.providerPaymentId || order.orderCode);
  return applyProviderState(order.id, info, "reconcile");
}

export async function cancelPaymentOrder(userId: string, identifier: string) {
  const order = await getPaymentOrder(userId, identifier);
  if (!order) return null;
  if (order.status !== "PENDING") return order;
  const info = await cancelPayOSPaymentRequest(order.providerPaymentId || order.orderCode, "Customer cancelled checkout");
  return applyProviderState(order.id, info, "reconcile");
}

export async function processPayOSWebhook(payload: PayOSWebhookPayload) {
  requireDatabase();
  await ensureSchema();
  const signatureValid = verifyPayOSWebhook(payload);
  if (!signatureValid) throw new Error("Invalid payOS webhook signature.");
  const data = payload.data || {};
  const orderCode = Number(data.orderCode || 0);
  const eventKey = `payos:${String(data.reference || createHash("sha256").update(JSON.stringify(payload)).digest("hex"))}`;
  let eventId = `evt-${randomUUID()}`;
  const inserted = await getPool().query(
    `INSERT INTO payment_events (id, event_key, order_code, event_type, signature_valid, payload)
     VALUES ($1,$2,$3,'payment_webhook',TRUE,$4::jsonb)
     ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [eventId, eventKey, orderCode || null, JSON.stringify(payload)],
  );
  if ((inserted.rowCount || 0) === 0) {
    const existing = await getPool().query(
      "SELECT id, processed_at FROM payment_events WHERE event_key = $1 LIMIT 1",
      [eventKey],
    );
    if (existing.rows[0]?.processed_at) return { duplicate: true, order: null };
    eventId = String(existing.rows[0]?.id || eventId);
  }

  const orderResult = await getPool().query("SELECT id FROM payment_orders WHERE order_code = $1 LIMIT 1", [orderCode]);
  if ((orderResult.rowCount || 0) === 0) {
    await getPool().query("UPDATE payment_events SET processed_at = NOW(), error = 'order_not_found' WHERE id = $1", [eventId]);
    return { duplicate: false, order: null };
  }
  const status = payload.success === true && String(data.code || "00") === "00" ? "PAID" : String(data.status || "PENDING").toUpperCase();
  const info: PayOSPaymentInfo = {
    id: String(data.paymentLinkId || ""),
    orderCode,
    amount: Number(data.amount || 0),
    amountPaid: Number(data.amount || 0),
    amountRemaining: 0,
    status,
    transactions: [{ reference: String(data.reference || "") }],
  };
  try {
    const order = await applyProviderState(String(orderResult.rows[0].id), info, "webhook");
    await getPool().query(
      "UPDATE payment_events SET payment_order_id = $2, processed_at = NOW(), error = $3 WHERE id = $1",
      [eventId, order?.id || null, order?.status === "MANUAL_REVIEW" ? "amount_mismatch" : null],
    );
    return { duplicate: false, order };
  } catch (error) {
    await getPool().query("UPDATE payment_events SET error = $2 WHERE id = $1", [eventId, error instanceof Error ? error.message : "processing_failed"]);
    throw error;
  }
}

export async function listCreditLedger(userId: string, limit = 50) {
  requireDatabase();
  await ensureSchema();
  const result = await getPool().query(
    "SELECT * FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, Math.max(1, Math.min(100, limit))],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    delta: Number(row.delta || 0),
    balanceAfter: Number(row.balance_after || 0),
    reason: String(row.reason || ""),
    referenceType: String(row.reference_type || ""),
    referenceId: String(row.reference_id || ""),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: asIso(row.created_at) || new Date().toISOString(),
  })) satisfies CreditLedgerEntry[];
}

export async function listAdminPayments(limit = 100) {
  requireDatabase();
  await ensureSchema();
  const result = await getPool().query(
    `SELECT p.*, u.name AS user_name, u.email AS user_email
     FROM payment_orders p LEFT JOIN auth_users u ON u.id = p.user_id
     ORDER BY p.created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(300, limit))],
  );
  return result.rows.map((row) => ({ ...mapOrder(row), userName: String(row.user_name || "User"), userEmail: String(row.user_email || "") }));
}

export async function reconcilePendingPayments(limit = 50) {
  requireDatabase();
  await ensureSchema();
  const result = await getPool().query(
    "SELECT user_id, id FROM payment_orders WHERE status IN ('PENDING','MANUAL_REVIEW') AND created_at > NOW() - INTERVAL '2 days' ORDER BY created_at ASC LIMIT $1",
    [Math.max(1, Math.min(100, limit))],
  );
  const outcomes: Array<{ id: string; status: string; error?: string }> = [];
  for (const row of result.rows) {
    try {
      const order = await reconcilePaymentOrder(String(row.user_id), String(row.id));
      outcomes.push({ id: String(row.id), status: order?.status || "NOT_FOUND" });
    } catch (error) {
      outcomes.push({ id: String(row.id), status: "ERROR", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  return outcomes;
}
