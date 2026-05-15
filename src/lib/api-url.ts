export function apiPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!base) return normalizedPath;
  return `${base.replace(/\/+$/, "")}${normalizedPath}`;
}

export function apiFetch(input: string, init?: RequestInit) {
  return fetch(input, {
    credentials: "include",
    ...init,
  });
}
