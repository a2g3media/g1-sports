import type { MutableRefObject } from "react";
import { prefetchFullPlayerProfileSnapshot } from "@/react-app/lib/playerProfileSnapshotPrewarm";

export type PropsFeedRow = {
  player_name: string;
  player_id?: string;
  sport: string;
};

function normalizePlayerName(name: string): string {
  if (name.includes(", ")) {
    const [last, first] = name.split(", ");
    return `${first} ${last}`;
  }
  return name;
}

function canonicalPlayerIdOrEmpty(value: string | undefined | null): string {
  const id = String(value || "").trim();
  return /^\d{4,}$/.test(id) ? id : "";
}

/** Dedupe key: prefer sport + numeric id when present. */
function playerDedupeKey(sport: string, name: string, id: string): string {
  const s = String(sport || "").trim().toUpperCase();
  if (id) return `${s}|||${id}`;
  return `${s}|||${normalizePlayerName(name).toLowerCase()}`;
}

/**
 * Dedupe feed rows into unique (sport, display name, optional id).
 */
export function dedupePlayersFromPropsFeed(rows: PropsFeedRow[]): Map<
  string,
  { sport: string; name: string; id: string }
> {
  const out = new Map<string, { sport: string; name: string; id: string }>();
  for (const row of rows) {
    const sport = String(row.sport || "").trim().toUpperCase();
    const name = normalizePlayerName(String(row.player_name || "").trim());
    if (!sport || !name) continue;
    const id = canonicalPlayerIdOrEmpty(row.player_id);
    const key = playerDedupeKey(sport, name, id);
    let rowId = id;
    const existing = out.get(key);
    if (!existing) {
      out.set(key, { sport, name, id: rowId });
    } else if (!existing.id && rowId) {
      existing.id = rowId;
    }
  }
  return out;
}

export function groupPlayerNamesBySport(rows: PropsFeedRow[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const sport = String(row.sport || "").trim().toUpperCase();
    const name = normalizePlayerName(String(row.player_name || "").trim());
    if (!sport || !name) continue;
    if (!map.has(sport)) map.set(sport, new Set());
    map.get(sport)!.add(name);
  }
  return new Map(Array.from(map.entries()).map(([s, set]) => [s, Array.from(set)]));
}

/**
 * Fire worker warm-hints immediately: one request per sport (uncapped list).
 * Does not await completion — pairs with client-side prefetch gate.
 */
export function dispatchWorkerPrewarmForPropsFeed(rows: PropsFeedRow[]): void {
  const grouped = groupPlayerNamesBySport(rows);
  for (const [sport, playerNames] of grouped) {
    if (playerNames.length === 0) continue;
    void fetch("/api/page-data/warm-hint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        eventType: "players",
        priority: "high",
        navigationIntent: true,
        uiVisibleAll: true,
        sport,
        playerNames,
        maxPlayers: Math.max(playerNames.length, 8000),
      }),
    }).catch(() => undefined);
  }
}

/**
 * Client-side gate: warm every unique player in the feed with x-page-data-warm before navigation.
 * Skips keys already in `warmedKeysRef` (incremental load more).
 * Requires numeric `player_id` on rows — no name-based resolution.
 */
export async function prewarmPropsFeedSnapshots(
  rows: PropsFeedRow[],
  opts?: {
    concurrency?: number;
    warmedKeysRef?: MutableRefObject<Set<string>>;
    signal?: AbortSignal;
  }
): Promise<{ attempted: number; warmed: number; skipped: number; failed: number }> {
  const conc = Math.max(6, Math.min(20, opts?.concurrency ?? 16));
  const deduped = dedupePlayersFromPropsFeed(rows);
  const targets = Array.from(deduped.entries()).map(([key, v]) => ({ key, ...v }));
  const warmedRef = opts?.warmedKeysRef?.current;

  const work: Array<{ key: string; sport: string; id: string }> = [];
  let skipped = 0;
  for (const t of targets) {
    if (warmedRef?.has(t.key)) {
      skipped += 1;
      continue;
    }
    if (!t.id) {
      skipped += 1;
      continue;
    }
    work.push({ key: t.key, sport: t.sport, id: t.id });
  }

  const attempted = work.length;
  let warmed = 0;
  let failed = 0;

  const runWorker = async () => {
    while (work.length > 0) {
      if (opts?.signal?.aborted) return;
      const my = work.shift();
      if (!my) break;
      try {
        await prefetchFullPlayerProfileSnapshot({
          sport: my.sport,
          playerId: my.id,
          timeoutMs: 28_000,
        });
        warmed += 1;
        warmedRef?.add(my.key);
      } catch {
        failed += 1;
      }
    }
  };

  const n = Math.min(conc, Math.max(1, attempted));
  await Promise.all(Array.from({ length: n }, () => runWorker()));

  return {
    attempted,
    warmed,
    skipped,
    failed,
  };
}
