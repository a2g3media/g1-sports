/* COVERAGE LOCK: do not redesign/refactor; only completeness data updates. */
export type CanonicalPlayerRecord = {
  sport: string;
  canonicalPlayerId: string;
  espnPlayerId: string;
  displayName: string;
  normalizedName: string;
  aliases: string[];
  providerIds: Record<string, string>;
  teamIds: string[];
  position?: string | null;
  jersey?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export function normalizeCanonicalSport(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export function normalizeCanonicalEspnPlayerId(value: unknown): string {
  const id = String(value || "").trim();
  return /^\d{3,}$/.test(id) ? id : "";
}

export function normalizeCanonicalName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildCanonicalPlayerId(sport: unknown, espnPlayerId: unknown): string {
  const sp = normalizeCanonicalSport(sport);
  const pid = normalizeCanonicalEspnPlayerId(espnPlayerId);
  if (!sp || !pid) return "";
  return `${sp}:${pid}`;
}

export function normalizeCanonicalAliases(input: Array<unknown>): string[] {
  const dedup = new Set<string>();
  for (const value of input) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    dedup.add(raw);
  }
  return Array.from(dedup);
}
