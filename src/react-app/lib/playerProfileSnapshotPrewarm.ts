import { fetchJsonCached } from "@/react-app/lib/fetchCache";
import { buildPlayerProfileSnapshotCacheKey } from "@/react-app/lib/pageDataKeys";

/** @deprecated Document-first reads; kept for any legacy callers. Prefetch does not trigger provider builds. */
export const PAGE_DATA_WARM_HEADER = "x-page-data-warm";

const PREFETCH_COOLDOWN_MS = 30_000;
const PREFETCH_FAILURE_COOLDOWN_MS = 45_000;
const RECENT_INTERACTION_WINDOW_MS = 1_200;
const AUTO_PREFETCH_WINDOW_MS = 20_000;
const AUTO_PREFETCH_BUDGET_PER_WINDOW = 0;

const prefetchInflight = new Map<string, Promise<unknown>>();
const prefetchCooldownUntil = new Map<string, number>();
const autoPrefetchWindowBySport = new Map<string, { startedAt: number; consumed: number }>();

let userInteractionTrackingReady = false;
let lastUserInteractionAt = 0;

function markUserInteraction(): void {
  lastUserInteractionAt = Date.now();
}

function ensureUserInteractionTracking(): void {
  if (userInteractionTrackingReady) return;
  if (typeof window === "undefined") return;
  userInteractionTrackingReady = true;
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener("pointerdown", markUserInteraction, opts);
  window.addEventListener("pointermove", markUserInteraction, opts);
  window.addEventListener("keydown", markUserInteraction, opts);
  window.addEventListener("touchstart", markUserInteraction, opts);
  window.addEventListener("focus", markUserInteraction, opts);
}

function canonicalIdOrEmpty(id: unknown): string {
  const s = String(id ?? "").trim();
  return /^\d{4,}$/.test(s) ? s : "";
}

/**
 * Read-only prefetch (hover / search). Same URL + cache key as PlayerProfilePage (`sport` + `playerId`).
 */
export function prefetchFullPlayerProfileSnapshot(params: {
  sport: string;
  playerId: string | undefined | null;
  timeoutMs?: number;
}): Promise<unknown> {
  ensureUserInteractionTracking();
  const sportUpper = String(params.sport || "").trim().toUpperCase();
  const pid = canonicalIdOrEmpty(params.playerId);
  if (!sportUpper || !pid) return Promise.resolve(null);
  const now = Date.now();
  const requestKey = `${sportUpper}:${pid}`;
  const blockedUntil = prefetchCooldownUntil.get(requestKey) || 0;
  if (blockedUntil > now) return Promise.resolve(null);
  const existing = prefetchInflight.get(requestKey);
  if (existing) return existing;

  const hasRecentInteraction = now - lastUserInteractionAt <= RECENT_INTERACTION_WINDOW_MS;
  if (!hasRecentInteraction) {
    const bucket = autoPrefetchWindowBySport.get(sportUpper);
    const withinWindow = bucket && now - bucket.startedAt <= AUTO_PREFETCH_WINDOW_MS;
    const activeBucket = withinWindow
      ? bucket!
      : { startedAt: now, consumed: 0 };
    if (activeBucket.consumed >= AUTO_PREFETCH_BUDGET_PER_WINDOW) {
      return Promise.resolve(null);
    }
    activeBucket.consumed += 1;
    autoPrefetchWindowBySport.set(sportUpper, activeBucket);
  }

  const url = `/api/page-data/player-profile?sport=${encodeURIComponent(sportUpper)}&playerId=${encodeURIComponent(pid)}`;
  const cacheKey = buildPlayerProfileSnapshotCacheKey({
    sport: sportUpper,
    playerId: pid,
    playerNameHint: "-",
  });

  const doFetch = () => fetchJsonCached(url, {
    cacheKey,
    ttlMs: 45_000,
    timeoutMs: params.timeoutMs ?? 8_000,
    init: {
      credentials: "include",
    },
  });
  const fetchPromise = (hasRecentInteraction
    ? doFetch()
    : new Promise<unknown>((resolve) => {
        if (typeof window === "undefined" || typeof window.requestIdleCallback !== "function") {
          resolve(null);
          return;
        }
        window.requestIdleCallback(async (deadline) => {
          // Fail closed for background warmers: no retries/no bubbling.
          if (typeof document !== "undefined" && document.visibilityState !== "visible") {
            resolve(null);
            return;
          }
          if (deadline.timeRemaining() < 8) {
            resolve(null);
            return;
          }
          try {
            resolve(await doFetch());
          } catch {
            resolve(null);
          }
        }, { timeout: 1200 });
      })
  )
    .catch(() => null)
    .finally(() => {
      prefetchInflight.delete(requestKey);
    });
  prefetchInflight.set(requestKey, fetchPromise);
  fetchPromise.then((payload: any) => {
    const degraded = Boolean(payload?.degraded || payload?.status === "degraded" || payload?.pending_refresh);
    prefetchCooldownUntil.set(
      requestKey,
      Date.now() + (degraded ? PREFETCH_FAILURE_COOLDOWN_MS : PREFETCH_COOLDOWN_MS)
    );
  }).catch(() => {
    prefetchCooldownUntil.set(requestKey, Date.now() + PREFETCH_FAILURE_COOLDOWN_MS);
  });
  return fetchPromise;
}
