/**
 * Coach G / scout flow rail — typed chips only (numeric ESPN player ids, canonical team ids).
 * Shared by PlayerProfilePage and TeamProfilePage.
 */

import { fetchJsonCached } from "@/react-app/lib/fetchCache";
import {
  buildPlayerRoute,
  buildTeamRoute,
  canonicalPlayerIdQueryParam,
  normalizeSportKeyForRoute,
} from "@/react-app/lib/navigationRoutes";
import { resolveCanonicalPlayerIdFromPayload } from "@/shared/espnAthleteIdLookup";

/** Bump when rail contract changes — v1 entries may be pre-validation garbage. */
export const SCOUT_FLOW_STORAGE_KEY = "scout-flow:recent:v2";

const LEGACY_SCOUT_FLOW_STORAGE_KEY = "scout-flow:recent:v1";

export type ScoutRecentEntry = {
  type: "player" | "team";
  label: string;
  subtitle?: string;
  sport: string;
  path: string;
  ts: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelyUuid(s: string): boolean {
  return UUID_RE.test(String(s || "").trim());
}

/** Labels that must never appear on chips (internal placeholders, not user-facing). */
export function isGarbageScoutLabel(label: unknown): boolean {
  const t = String(label ?? "").trim();
  if (!t) return true;
  if (isLikelyUuid(t)) return true;
  if (/^player[-_]\d+$/i.test(t)) return true;
  if (/^Player\s+\d{4,}$/i.test(t)) return true;
  if (/^\d{5,}$/.test(t)) return true;
  if (/^espn[-_]?id[:=]?\s*\d+$/i.test(t)) return true;
  return false;
}

export function parsePlayerProfilePath(path: unknown): { sportKey: string; playerId: string } | null {
  const p = String(path ?? "").trim().split("?")[0];
  const m = p.match(/^\/props\/player\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  const sportKey = decodeURIComponent(m[1]);
  const rawId = decodeURIComponent(m[2]);
  const playerId = canonicalPlayerIdQueryParam(rawId);
  if (!playerId) return null;
  return { sportKey, playerId };
}

export function parseTeamProfilePath(path: unknown): { sportKey: string; teamId: string } | null {
  const p = String(path ?? "").trim().split("?")[0];
  const m = p.match(/^\/sports\/([^/]+)\/team\/([^/]+)$/);
  if (!m) return null;
  const sportKey = decodeURIComponent(m[1]);
  const teamId = decodeURIComponent(m[2]).trim();
  if (!teamId || isLikelyUuid(teamId)) return null;
  return { sportKey, teamId };
}

function sportKeysMatch(a: string, b: string): boolean {
  return (
    normalizeSportKeyForRoute(a).toLowerCase() === normalizeSportKeyForRoute(b).toLowerCase()
  );
}

/**
 * Normalize and validate a stored recent entry. Returns null if it should not be shown or persisted.
 */
export function validateScoutRecentEntry(row: unknown): ScoutRecentEntry | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<ScoutRecentEntry>;
  const sport = String(r.sport || "")
    .trim()
    .toUpperCase();
  if (!sport) return null;
  const type = r.type === "team" ? "team" : "player";

  if (type === "player") {
    const parsed = parsePlayerProfilePath(r.path);
    if (!parsed) return null;
    if (!sportKeysMatch(parsed.sportKey, sport)) return null;
    if (isGarbageScoutLabel(r.label)) return null;
    const label = String(r.label || "").trim();
    const rawPath = String(r.path || "");
    const queryPart = rawPath.includes("?") ? rawPath.slice(rawPath.indexOf("?") + 1) : "";
    const existingHint = String(new URLSearchParams(queryPart).get("playerName") || "").trim();
    const playerNameHint = existingHint || label;
    const basePath = buildPlayerRoute(sport, parsed.playerId);
    const hintedPath =
      playerNameHint && !isGarbageScoutLabel(playerNameHint)
        ? `${basePath}?playerName=${encodeURIComponent(playerNameHint)}`
        : basePath;
    return {
      type: "player",
      label,
      subtitle: r.subtitle ? String(r.subtitle).trim() : undefined,
      sport,
      path: hintedPath,
      ts: typeof r.ts === "number" && Number.isFinite(r.ts) ? r.ts : Date.now(),
    };
  }

  const parsed = parseTeamProfilePath(r.path);
  if (!parsed) return null;
  if (!sportKeysMatch(parsed.sportKey, sport)) return null;
  const label = String(r.label || "").trim();
  if (!label || isGarbageScoutLabel(label)) return null;
  return {
    type: "team",
    label,
    subtitle: r.subtitle ? String(r.subtitle).trim() : undefined,
    sport,
    path: buildTeamRoute(sport, parsed.teamId),
    ts: typeof r.ts === "number" && Number.isFinite(r.ts) ? r.ts : Date.now(),
  };
}

export function sanitizeScoutRecentList(
  raw: unknown,
  onDrop?: (reason: string, row: unknown) => void
): ScoutRecentEntry[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: ScoutRecentEntry[] = [];
  const seen = new Set<string>();
  for (const row of arr) {
    const v = validateScoutRecentEntry(row);
    if (!v) {
      onDrop?.("invalid entry", row);
      continue;
    }
    const key = `${v.type}:${v.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, 24);
}

export function readAndRepairScoutRecentStorage(
  onDrop?: (reason: string, row: unknown) => void
): ScoutRecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = window.localStorage.getItem(SCOUT_FLOW_STORAGE_KEY);
    let migratedFromLegacy = false;
    if (!raw) {
      const legacy = window.localStorage.getItem(LEGACY_SCOUT_FLOW_STORAGE_KEY);
      if (legacy) {
        raw = legacy;
        migratedFromLegacy = true;
        try {
          window.localStorage.removeItem(LEGACY_SCOUT_FLOW_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    }
    const parsed = raw ? JSON.parse(raw) : [];
    const before = Array.isArray(parsed) ? parsed.length : 0;
    const cleaned = sanitizeScoutRecentList(parsed, onDrop);
    if (cleaned.length !== before || migratedFromLegacy) {
      window.localStorage.setItem(SCOUT_FLOW_STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

export type ScoutFlowPlayerRow = {
  name: string;
  team: string;
  sport: string;
  playerId: string;
};

export type ScoutFlowTeamRow = {
  id: string;
  alias: string;
  name: string;
};

/** Props board + standings — same sources as TeamProfilePage scout rail. */
export async function fetchScoutFlowPlayersAndTeams(sportUpper: string): Promise<{
  players: ScoutFlowPlayerRow[];
  teams: ScoutFlowTeamRow[];
}> {
  const sport = String(sportUpper || "")
    .trim()
    .toUpperCase();
  const playersRes = await fetchJsonCached<{
    props?: Array<{ player_name?: string; player_id?: string; team?: string; sport?: string }>;
  }>(`/api/sports-data/props/today?sport=${encodeURIComponent(sport)}&limit=220&offset=0`, {
    cacheKey: `scout-flow:players:${sport}:v3`,
    ttlMs: 45_000,
    timeoutMs: 4_500,
    init: { credentials: "include" },
  }).catch(() => ({ props: [] }));

  const standingsRes = await fetchJsonCached<{
    teams?: Array<{ id?: string; alias?: string; name?: string }>;
  }>(`/api/teams/${encodeURIComponent(sport)}/standings`, {
    cacheKey: `scout-flow:teams:${sport}:v3`,
    ttlMs: 90_000,
    timeoutMs: 4_500,
    init: { credentials: "include" },
  }).catch(() => ({ teams: [] }));

  const playerMap = new Map<string, ScoutFlowPlayerRow>();
  for (const row of Array.isArray(playersRes?.props) ? playersRes.props : []) {
    const name = String(row?.player_name || "").trim();
    const pid = resolveCanonicalPlayerIdFromPayload(row?.player_id, name, sport.toLowerCase()) || "";
    if (!name || !pid || isGarbageScoutLabel(name)) continue;
    const mapKey = name.toLowerCase();
    const entry: ScoutFlowPlayerRow = {
      name,
      team: String(row?.team || "").trim(),
      sport: String(row?.sport || sport).toUpperCase(),
      playerId: pid,
    };
    if (!playerMap.has(mapKey)) {
      playerMap.set(mapKey, entry);
    }
  }

  const teams: ScoutFlowTeamRow[] = (Array.isArray(standingsRes?.teams) ? standingsRes.teams : [])
    .map((row) => ({
      id: String(row?.id || "").trim(),
      alias: String(row?.alias || "")
        .trim()
        .toUpperCase(),
      name: String(row?.name || "").trim(),
    }))
    .filter((row) => row.id && row.alias && !isLikelyUuid(row.id));

  return {
    players: Array.from(playerMap.values()).slice(0, 150),
    teams: teams.slice(0, 40),
  };
}

export function navigateToScoutRecentPlayer(path: string, navigate: (to: string) => void): void {
  const p = parsePlayerProfilePath(path);
  if (!p) {
    console.warn("[scoutFlowRail] skip navigate: bad player path", { path });
    return;
  }
  navigate(path);
}

export function navigateToScoutRecentTeam(path: string, navigate: (to: string) => void): void {
  const p = parseTeamProfilePath(path);
  if (!p) {
    console.warn("[scoutFlowRail] skip navigate: bad team path", { path });
    return;
  }
  navigate(buildTeamRoute(p.sportKey, p.teamId));
}
