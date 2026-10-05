import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getPayOSConfig, hasPayOSConfig } from "@/lib/env";

const PAYOS_API_BASE = "https://api-merchant.payos.vn";

type PayOSResponse<T> = {
  code?: string;
  desc?: string;
  data?: T;
  signature?: string;
};

export type PayOSPaymentLink = {
  bin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  description: string;
  orderCode: number;
  currency: string;
  paymentLinkId: string;
  status: string;
  checkoutUrl: string;
  qrCode: string;
};

export type PayOSPaymentInfo = {
  id: string;
  orderCode: number;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  status: string;
  createdAt?: string;
  canceledAt?: string;
  cancellationReason?: string;
  transactions?: unknown[];
};

export type PayOSWebhookPayload = {
  code?: string;
  desc?: string;
  success?: boolean;
  data?: Record<string, unknown>;
  signature?: string;
};

function signatureValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
    }));
  }
  if (typeof value === "object") {
    return JSON.stringify(Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))));
  }
  return String(value);
}

function sortedDataString(data: Record<string, unknown>) {
  return Object.keys(data)
    .sort()
    .map((key) => `${key}=${signatureValue(data[key])}`)
    .join("&");
}

function hmac(data: Record<string, unknown>) {
  return createHmac("sha256", getPayOSConfig().checksumKey).update(sortedDataString(data)).digest("hex");
}

function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left.toLowerCase(), "utf8");
  const rightBuffer = Buffer.from(right.toLowerCase(), "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function payOSFetch<T>(path: string, init?: RequestInit) {
  if (!hasPayOSConfig()) throw new Error("payOS is not configured.");
  const config = getPayOSConfig();
  const response = await fetch(`${PAYOS_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-client-id": config.clientId,
      "x-api-key": config.apiKey,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as PayOSResponse<T>;
  if (!response.ok || payload.code !== "00" || !payload.data) {
    throw new Error(payload.desc || `payOS request failed with status ${response.status}.`);
  }
  return payload.data;
}

export async function createPayOSPaymentLink(input: {
  orderCode: number;
  amount: number;
  description: string;
  buyerName?: string;
  buyerEmail?: string;
  itemName: string;
  returnUrl: string;
  cancelUrl: string;
  expiredAt: number;
}) {
  const signatureData = {
    amount: input.amount,
    cancelUrl: input.cancelUrl,
    description: input.description,
    orderCode: input.orderCode,
    returnUrl: input.returnUrl,
  };
  return payOSFetch<PayOSPaymentLink>("/v2/payment-requests", {
    method: "POST",
    body: JSON.stringify({
      ...signatureData,
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      items: [{ name: input.itemName, quantity: 1, price: input.amount }],
      expiredAt: input.expiredAt,
      signature: hmac(signatureData),
    }),
  });
}

export function getPayOSPaymentRequest(id: string | number) {
  return payOSFetch<PayOSPaymentInfo>(`/v2/payment-requests/${encodeURIComponent(String(id))}`);
}

export function cancelPayOSPaymentRequest(id: string | number, reason: string) {
  return payOSFetch<PayOSPaymentInfo>(`/v2/payment-requests/${encodeURIComponent(String(id))}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancellationReason: reason }),
  });
}

export function verifyPayOSWebhook(payload: PayOSWebhookPayload) {
  if (!hasPayOSConfig() || !payload.data || !payload.signature) return false;
  return signaturesMatch(hmac(payload.data), payload.signature);
}

export async function confirmPayOSWebhook(webhookUrl?: string) {
  const url = webhookUrl || getPayOSConfig().webhookUrl;
  return payOSFetch<{ webhookUrl: string; accountNumber: string; accountName: string; name: string }>("/confirm-webhook", {
    method: "POST",
    body: JSON.stringify({ webhookUrl: url }),
  });
}
