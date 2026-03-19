const DISALLOWED_PATTERNS: RegExp[] = [
  /\bbet this team\b/gi,
  /\btake this parlay\b/gi,
  /\bthis is a lock bet\b/gi,
  /\block bet\b/gi,
  /\block\b/gi,
  /\bmust bet\b/gi,
  /\bhammer\b/gi,
];

const SOFT_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bbet on\b/gi, replacement: "consider" },
  { pattern: /\btake\b/gi, replacement: "watch" },
  { pattern: /\bwager on\b/gi, replacement: "track" },
];

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function sanitizeCoachGText(input: string): string {
  let cleaned = input || "";
  for (const pattern of DISALLOWED_PATTERNS) {
    cleaned = cleaned.replace(pattern, "high-conviction spot");
  }
  for (const rule of SOFT_REPLACEMENTS) {
    cleaned = cleaned.replace(rule.pattern, rule.replacement);
  }
  return collapseWhitespace(cleaned);
}

export function sanitizeCoachGList(items: string[] | undefined, limit: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => sanitizeCoachGText(String(item)))
    .filter((item) => item.length > 0)
    .slice(0, limit);
}

export function enforceInformationalClosing(input: string): string {
  const cleaned = sanitizeCoachGText(input);
  if (/informational analysis only/i.test(cleaned)) return cleaned;
  return `${cleaned} This is informational analysis only for the G1 community.`;
}

export interface CoachGAlertCopyInput {
  title: string;
  body: string | null;
}

export interface CoachGAlertCopyOutput {
  title: string;
  body: string | null;
}

export function normalizeCoachGAlertCopy(input: CoachGAlertCopyInput): CoachGAlertCopyOutput {
  const rawTitle = sanitizeCoachGText(input.title || "");
  const title = rawTitle.toLowerCase().startsWith("coach g")
    ? rawTitle
    : sanitizeCoachGText(`Coach G Insight: ${rawTitle}`);

  if (!input.body) {
    return { title, body: null };
  }
  const bodyBase = sanitizeCoachGText(input.body);
  const body = /informational only/i.test(bodyBase)
    ? bodyBase
    : sanitizeCoachGText(`${bodyBase} Informational only for the G1 community.`);
  return { title, body };
}
