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

export function allowDemoAuth() {
  if (isProd) return false;
  return process.env.ALLOW_DEMO_AUTH !== "false";
}
