export const isProd = process.env.NODE_ENV === "production";

function required(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getKieApiKey() {
  return required("KIE_API_KEY");
}

export function getSessionSecret() {
  const value = process.env.AUTH_SESSION_SECRET?.trim();
  if (value) return value;
  if (isProd) throw new Error("Missing required environment variable: AUTH_SESSION_SECRET");
  return "dev-only-session-secret-change-me";
}

export function getAdminToken() {
  const value = process.env.ADMIN_TOKEN?.trim();
  if (value) return value;
  if (isProd) throw new Error("Missing required environment variable: ADMIN_TOKEN");
  return "dev-admin-token";
}

export function getAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || "admin@aistudio.local").trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || "admin123").trim();
  return { email, password };
}

export function hasPayOSConfig() {
  return Boolean(
    process.env.PAYOS_CLIENT_ID?.trim()
    && process.env.PAYOS_API_KEY?.trim()
    && process.env.PAYOS_CHECKSUM_KEY?.trim(),
  );
}

export function getPayOSConfig() {
  return {
    clientId: required("PAYOS_CLIENT_ID"),
    apiKey: required("PAYOS_API_KEY"),
    checksumKey: required("PAYOS_CHECKSUM_KEY"),
    publicAppUrl: (process.env.PUBLIC_APP_URL || "https://escanor.app").trim().replace(/\/+$/, ""),
    webhookUrl: (process.env.PAYOS_WEBHOOK_URL || "https://api.escanor.app/api/payments/payos/webhook").trim(),
  };
}

export function allowDemoAuth() {
  if (isProd) return false;
  return process.env.ALLOW_DEMO_AUTH !== "false";
}

export function hasR2Config() {
  return Boolean(
    process.env.R2_ENDPOINT?.trim()
    && process.env.R2_BUCKET_NAME?.trim()
    && process.env.R2_ACCESS_KEY_ID?.trim()
    && process.env.R2_SECRET_ACCESS_KEY?.trim()
    && process.env.R2_PUBLIC_BASE_URL?.trim(),
  );
}

export function getR2Config() {
  return {
    accountId: required("R2_ACCOUNT_ID"),
    endpoint: required("R2_ENDPOINT"),
    bucketName: required("R2_BUCKET_NAME"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    publicBaseUrl: required("R2_PUBLIC_BASE_URL"),
  };
}

export function hasGitHubImportConfig() {
  return Boolean(
    process.env.GITHUB_IMPORT_TOKEN?.trim()
    && process.env.GITHUB_IMPORT_OWNER?.trim()
    && process.env.GITHUB_IMPORT_REPO?.trim(),
  );
}

export function getGitHubImportConfig() {
  return {
    token: required("GITHUB_IMPORT_TOKEN"),
    owner: required("GITHUB_IMPORT_OWNER"),
    repo: required("GITHUB_IMPORT_REPO"),
    workflowFile: (process.env.GITHUB_IMPORT_WORKFLOW_FILE || "meigen-import.yml").trim(),
    ref: (process.env.GITHUB_IMPORT_REF || "master").trim(),
  };
}
