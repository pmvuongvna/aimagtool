function resolveClientApiBase() {
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host === "escanor.app" || host === "www.escanor.app") {
      return "https://api.escanor.app";
    }
  }

  return "";
}

export function apiPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = resolveClientApiBase();
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}

export function apiFetch(input: string, init?: RequestInit) {
  return fetch(input, {
    credentials: "include",
    ...init,
  });
}
