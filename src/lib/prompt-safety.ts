export type RankedPromptCandidate = {
  value?: string | null;
  priority?: number;
};

export function normalizePromptText(value: string) {
  return value.replace(/\s+/g, " ").replace(/&quot;/g, '"').trim();
}

export function looksLikeExecutablePrompt(value: string) {
  const normalized = normalizePromptText(value);
  if (!normalized) return false;

  const directSignals = [
    /^\(?\s*(?:async\s+)?function\b/i,
    /\bself\.__next_f\.push\b/i,
    /<\/?(?:script|style)\b/i,
    /\bdocument\.documentElement\b/i,
    /\bnavigator\.(?:language|languages)\b/i,
    /\b(?:localStorage|sessionStorage)\./i,
  ];
  if (directSignals.some((pattern) => pattern.test(normalized))) return true;

  const codeSignals = [
    /\b(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=/,
    /\b(?:document|window|navigator)\./,
    /\b(?:try|catch)\s*[{(]/,
    /\b(?:replaceAll|toLowerCase|indexOf)\s*\(/,
    /=>/,
  ].filter((pattern) => pattern.test(normalized)).length;

  return codeSignals >= 2;
}

export function isUsablePromptText(value: string) {
  const normalized = normalizePromptText(value);
  if (normalized.length < 24 || normalized.length > 8000) return false;
  if (looksLikeExecutablePrompt(normalized)) return false;
  if (/(^https?:\/\/)|(^\/)|(^[A-Z0-9_-]{18,}$)/i.test(normalized)) return false;
  if (/^(?:home|search|history|favorites|tags|related creations)$/i.test(normalized)) return false;
  if (
    normalized.includes('"$L')
    || normalized.includes('["$')
    || /\b(?:className|aria-hidden|webpackChunk|__NEXT_DATA__)\b/.test(normalized)
  ) {
    return false;
  }
  return true;
}

export function selectBestPrompt(candidates: RankedPromptCandidate[]) {
  return candidates
    .map((candidate, index) => {
      const value = normalizePromptText(candidate.value || "");
      if (!isUsablePromptText(value)) return null;
      const wordCount = value.split(/\s+/).length;
      const lengthScore = Math.min(value.length, 1200) / 12;
      const longTextPenalty = Math.max(0, value.length - 2500) / 8;
      return {
        value,
        score: (candidate.priority || 0) + Math.min(wordCount, 120) + lengthScore - longTextPenalty - index / 1000,
      };
    })
    .filter((candidate): candidate is { value: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score)[0]?.value || "";
}
