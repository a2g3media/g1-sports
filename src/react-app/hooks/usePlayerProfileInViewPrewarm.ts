import { useEffect, useRef } from "react";
import { resolveCanonicalPlayerIdFromPayload } from "@/shared/espnAthleteIdLookup";
import { normalizeSportKeyForRoute } from "@/react-app/lib/navigationRoutes";
import { prefetchFullPlayerProfileSnapshot } from "@/react-app/lib/playerProfileSnapshotPrewarm";

/**
 * When the element scrolls into view, triggers a full warm snapshot prefetch once.
 * Complements hover-based prefetch on dense lists (props page also batch-prefetches visible rows).
 */
export function usePlayerProfileInViewPrewarm(opts: {
  sport: string;
  playerId: unknown;
  /** Used when `playerId` is missing or non-canonical (same rules as profile navigation). */
  displayName?: string;
  enabled?: boolean;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (opts.enabled === false) return;
    const sk = normalizeSportKeyForRoute(String(opts.sport || ""));
    const id = resolveCanonicalPlayerIdFromPayload(opts.playerId, opts.displayName, sk);
    const el = ref.current;
    if (!el || !id) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void prefetchFullPlayerProfileSnapshot({
            sport: opts.sport,
            playerId: id,
            timeoutMs: 22_000,
          });
          io.disconnect();
        }
      },
      { rootMargin: opts.rootMargin ?? "100px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [opts.sport, opts.playerId, opts.displayName, opts.enabled, opts.rootMargin]);
  return ref;
}
