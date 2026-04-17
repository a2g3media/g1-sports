export type CanonicalMarketStatKey = "points" | "rebounds" | "assists";

const STAT_KEY_MAP: Record<string, CanonicalMarketStatKey> = {
  pts: "points",
  point: "points",
  points: "points",
  playerpoints: "points",
  reb: "rebounds",
  rebound: "rebounds",
  rebounds: "rebounds",
  playerrebounds: "rebounds",
  ast: "assists",
  assist: "assists",
  assists: "assists",
  playerassists: "assists",
};

export function normalizeMarketStatKey(value: unknown): CanonicalMarketStatKey | null {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
  return STAT_KEY_MAP[key] || null;
}

export function normalizeMarketPlayerId(value: unknown): string {
  const id = String(value || "").trim();
  return /^\d{3,}$/.test(id) ? id : "";
}
