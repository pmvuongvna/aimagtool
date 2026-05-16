export const SUPPORTED_LOCALES = ["en", "vi"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function toLocale(value?: string | null): Locale {
  if (!value) return "en";
  const normalized = value.toLowerCase();
  return isLocale(normalized) ? normalized : "en";
}
