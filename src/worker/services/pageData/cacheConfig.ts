import { makeCacheKey } from "../apiCacheService";

export const ACTIVE_SPORT_CACHE_KEY = makeCacheKey("page-data-warm", "active-sport-v1");

/** D1 TTL floors for usable player-profile snapshots (stable payloads). */
export const PLAYER_PAGE_DATA_D1_PRIMARY_TTL_SEC_MIN = 60 * 60;
export const PLAYER_PAGE_DATA_D1_BACKUP_TTL_SEC_MIN = 6 * 60 * 60;

export function normalizePlayerNameForWarm(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes(",")) {
    const [last, first] = raw
      .split(",")
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    const combined = [first, last].filter(Boolean).join(" ").trim();
    return combined || raw;
  }
  return raw;
}
