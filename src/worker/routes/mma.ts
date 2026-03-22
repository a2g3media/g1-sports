import { Hono } from "hono";

const mmaRouter = new Hono<{ Bindings: Env }>();

const DEFAULT_NEXT_LOOKAHEAD_DAYS = 10;
const DEFAULT_SCHEDULE_DAYS = 7;
const MAX_SCHEDULE_DAYS = 10;

const NEXT_CACHE_TTL_MS = 90 * 1000;
const SCHEDULE_CACHE_TTL_MS = 3 * 60 * 1000;
const EVENT_CACHE_TTL_MS = 90 * 1000;

const NEXT_STALE_WINDOW_MS = 8 * 60 * 1000;
const SCHEDULE_STALE_WINDOW_MS = 12 * 60 * 1000;
const EVENT_STALE_WINDOW_MS = 8 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  fetchedAt: number;
  expiresAt: number;
};

const mmaCache = new Map<string, CacheEntry<unknown>>();

function getApiKey(env: Env): string | null {
  const key = env.SPORTSRADAR_API_KEY;
  if (typeof key !== "string") return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<{ timedOut: boolean; value: T | null }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const result = (await Promise.race([promise, timeoutPromise])) as T | null;
  if (timer) clearTimeout(timer);
  if (result === null) return { timedOut: true, value: null };
  return { timedOut: false, value: result };
}

function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const asInt = Number.parseInt(headerValue, 10);
  if (Number.isFinite(asInt) && asInt > 0) return asInt;
  const at = Date.parse(headerValue);
  if (!Number.isFinite(at)) return null;
  const seconds = Math.ceil((at - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

function parseDaysQuery(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_SCHEDULE_DAYS);
}

function getCacheEntry<T>(
  key: string,
  staleWindowMs: number
): { value: T; stale: boolean } | null {
  const cached = mmaCache.get(key) as CacheEntry<T> | undefined;
  if (!cached) return null;
  const now = Date.now();
  if (now <= cached.expiresAt) return { value: cached.value, stale: false };
  if (now <= cached.expiresAt + staleWindowMs) return { value: cached.value, stale: true };
  return null;
}

function setCacheEntry<T>(key: string, value: T, ttlMs: number): void {
  const now = Date.now();
  mmaCache.set(key, {
    value,
    fetchedAt: now,
    expiresAt: now + ttlMs,
  });
}

function numericIdFromUrn(value: unknown): string {
  const raw = String(value || "");
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : raw;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const clean = String(name || "").trim();
  if (!clean) return { firstName: "Unknown", lastName: "Fighter" };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

async function fetchSportsRadarMma(path: string, apiKey: string): Promise<{
  ok: boolean;
  status: number;
  data: any | null;
  error: string | null;
  retry_after_seconds?: number;
}> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const candidates = [
    `https://api.sportradar.com/mma/production/v2/en/${cleanPath}.json?api_key=${apiKey}`,
    `https://api.sportradar.com/mma/production/v2/en/${cleanPath}?api_key=${apiKey}`,
    `https://api.sportradar.com/mma/trial/v2/en/${cleanPath}.json?api_key=${apiKey}`,
    `https://api.sportradar.com/mma/trial/v2/en/${cleanPath}?api_key=${apiKey}`,
  ];
  const retries = 2;

  let lastStatus = 500;
  let lastError = "Unknown SportsRadar MMA error";
  let lastRetryAfterSeconds: number | undefined;

  for (const url of candidates) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const resp = await fetch(url);
        const retryAfterSeconds = parseRetryAfterSeconds(resp.headers.get("retry-after")) || undefined;

        if (resp.status === 429 || resp.status >= 500) {
          lastStatus = resp.status;
          lastRetryAfterSeconds = retryAfterSeconds;
          lastError = resp.status === 429
            ? "Rate limited - try again later"
            : `SportsRadar MMA API HTTP ${resp.status}`;
          if (attempt < retries) {
            const backoffMs = retryAfterSeconds
              ? Math.min(retryAfterSeconds * 1000, 5000)
              : 200 * 2 ** attempt + Math.floor(Math.random() * 125);
            await sleep(backoffMs);
            continue;
          }
          break;
        }

        if (resp.ok) {
          const data = await resp.json().catch(() => null);
          return { ok: true, status: resp.status, data, error: null };
        }

        lastStatus = resp.status;
        lastError = `SportsRadar MMA API HTTP ${resp.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < retries) {
          const backoffMs = 200 * 2 ** attempt + Math.floor(Math.random() * 125);
          await sleep(backoffMs);
          continue;
        }
      }
    }
  }

  return {
    ok: false,
    status: lastStatus,
    data: null,
    error: lastError,
    retry_after_seconds: lastRetryAfterSeconds,
  };
}

type MmaSummary = {
  sport_event?: {
    id?: string;
    start_time?: string;
    competitors?: Array<{ id?: string; name?: string }>;
    sport_event_context?: { competition?: { name?: string }; stage?: { type?: string } };
    venue?: {
      name?: string;
      city_name?: string;
      state?: string;
      country_name?: string;
    };
  };
  sport_event_status?: {
    status?: string;
    match_status?: string;
    weight_class?: string;
    method?: string;
    winner_id?: string;
    final_round?: number;
  };
  statistics?: {
    totals?: {
      competitors?: Array<{
        id?: string;
        name?: string;
        statistics?: Record<string, unknown>;
      }>;
    };
  };
};

function toEventListItem(summary: MmaSummary) {
  const event = summary.sport_event || {};
  const status = summary.sport_event_status || {};
  const competitors = Array.isArray(event.competitors) ? event.competitors : [];
  const name =
    competitors.length >= 2
      ? `${competitors[0]?.name || "Fighter A"} vs ${competitors[1]?.name || "Fighter B"}`
      : event.sport_event_context?.competition?.name || "UFC Event";
  const eventId = numericIdFromUrn(event.id);

  return {
    eventId,
    name,
    shortName: event.sport_event_context?.stage?.type || "MMA Bout",
    dateTime: event.start_time || new Date().toISOString(),
    status: status.status || status.match_status || "scheduled",
    fightsCount: 1,
    gameId: event.id || eventId,
    source: "sportradar",
  };
}

mmaRouter.get("/next", async (c) => {
  const cacheKey = "next";
  const cached = getCacheEntry<ReturnType<typeof toEventListItem>>(cacheKey, NEXT_STALE_WINDOW_MS);
  if (cached && !cached.stale) {
    return c.json(cached.value);
  }

  const apiKey = getApiKey(c.env);
  if (!apiKey) {
    return c.json(
      {
        error: "No API key configured",
        error_code: "SPORTSRADAR_API_KEY_MISSING",
        source: "sportradar",
      },
      503
    );
  }

  const now = new Date();
  for (let i = 0; i < DEFAULT_NEXT_LOOKAHEAD_DAYS; i += 1) {
    const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().slice(0, 10);
    const response = await fetchSportsRadarMma(`schedules/${dateKey}/summaries`, apiKey);
    if (!response.ok) {
      if (response.status === 429) {
        if (cached) {
          return c.json({
            ...cached.value,
            source_stale: true,
            retry_after_seconds: response.retry_after_seconds ?? 30,
          });
        }
        return c.json(
          {
            error: response.error,
            source: "sportradar",
            retry_after_seconds: response.retry_after_seconds ?? 30,
          },
          429
        );
      }
      continue;
    }

    const summaries = Array.isArray(response.data?.summaries) ? response.data.summaries : [];
    const upcoming = summaries
      .map((s: MmaSummary) => toEventListItem(s))
      .filter((e: any) => new Date(e.dateTime).getTime() >= now.getTime())
      .sort((a: any, b: any) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    if (upcoming.length > 0) {
      setCacheEntry(cacheKey, upcoming[0], NEXT_CACHE_TTL_MS);
      return c.json(upcoming[0]);
    }
  }

  if (cached) {
    return c.json({
      ...cached.value,
      source_stale: true,
      retry_after_seconds: 60,
    });
  }

  return c.json({ error: "No upcoming UFC events found", source: "sportradar" }, 404);
});

mmaRouter.get("/schedule", async (c) => {
  const days = parseDaysQuery(c.req.query("days"), DEFAULT_SCHEDULE_DAYS);
  const cacheKey = `schedule:days=${days}`;
  const cached = getCacheEntry<
    { events: Array<ReturnType<typeof toEventListItem>>; count: number; source: string; days: number }
  >(cacheKey, SCHEDULE_STALE_WINDOW_MS);
  if (cached && !cached.stale) {
    return c.json(cached.value);
  }

  const apiKey = getApiKey(c.env);
  if (!apiKey) {
    return c.json(
      {
        error: "No API key configured",
        error_code: "SPORTSRADAR_API_KEY_MISSING",
        events: [],
        count: 0,
        source: "sportradar",
      },
      503
    );
  }

  const now = new Date();
  const output: Array<{
    eventId: string;
    name: string;
    shortName: string;
    dateTime: string;
    status: string;
    fightsCount: number;
    gameId: string;
    source: string;
  }> = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().slice(0, 10);
    const response = await fetchSportsRadarMma(`schedules/${dateKey}/summaries`, apiKey);

    if (!response.ok) {
      if (response.status === 429) {
        if (cached) {
          return c.json({
            ...cached.value,
            source_stale: true,
            retry_after_seconds: response.retry_after_seconds ?? 30,
          });
        }
        return c.json(
          {
            error: response.error,
            events: [],
            count: 0,
            source: "sportradar",
            retry_after_seconds: response.retry_after_seconds ?? 30,
          },
          429
        );
      }
      continue;
    }

    const summaries = Array.isArray(response.data?.summaries) ? response.data.summaries : [];
    output.push(...summaries.map((s: MmaSummary) => toEventListItem(s)));
  }

  const unique = new Map<string, (typeof output)[number]>();
  for (const item of output) {
    const key = `${item.eventId}_${item.dateTime}`;
    if (!unique.has(key)) unique.set(key, item);
  }

  const events = Array.from(unique.values())
    .filter((e) => new Date(e.dateTime).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  const payload = {
    events: events.slice(0, 20),
    count: events.length,
    source: "sportradar",
    days,
  };
  setCacheEntry(cacheKey, payload, SCHEDULE_CACHE_TTL_MS);
  return c.json(payload);
});

mmaRouter.get("/event/:eventId", async (c) => {
  const requestedId = c.req.param("eventId");
  const normalizedNumeric = numericIdFromUrn(requestedId);
  if (!normalizedNumeric || normalizedNumeric.length < 6) {
    return c.json(
      {
        error: "Invalid event id",
        source: "sportradar",
      },
      400
    );
  }
  const requestedUrn = requestedId.startsWith("sr:sport_event:")
    ? requestedId
    : `sr:sport_event:${requestedId}`;
  const cacheKey = `event:${requestedUrn}`;
  const cached = getCacheEntry<any>(cacheKey, EVENT_STALE_WINDOW_MS);
  if (cached && !cached.stale) {
    return c.json(cached.value);
  }

  const apiKey = getApiKey(c.env);
  if (!apiKey) {
    return c.json(
      {
        error: "No API key configured",
        error_code: "SPORTSRADAR_API_KEY_MISSING",
        source: "sportradar",
      },
      503
    );
  }

  try {
    const timed = await withTimeout(
      fetchSportsRadarMma(
        `sport_events/${encodeURIComponent(requestedUrn)}/summary`,
        apiKey
      ),
      6500
    );
    if (timed.timedOut) {
      if (cached) {
        return c.json({
          ...cached.value,
          source_stale: true,
          retry_after_seconds: 15,
        });
      }
      return c.json({
        event: {
          eventId: numericIdFromUrn(requestedUrn),
          name: "MMA Bout",
          shortName: "MMA",
          dateTime: new Date().toISOString(),
          status: "scheduled",
          venue: null,
          city: null,
          state: null,
          country: null,
          active: true,
        },
        fights: [],
        fightCount: 0,
        source: "sportradar",
        source_degraded: true,
        retry_after_seconds: 15,
      });
    }
    const result = timed.value!;
    if (!result.ok) {
      const status = result.status === 429 ? 429 : result.status || 502;
      if (cached) {
        return c.json({
          ...cached.value,
          source_stale: true,
          retry_after_seconds: result.retry_after_seconds ?? 30,
        });
      }
      return c.json(
        {
          error: result.error || "MMA event unavailable",
          source: "sportradar",
          retry_after_seconds: result.retry_after_seconds ?? 30,
        },
        status
      );
    }

    const summary = (result.data || {}) as MmaSummary;
    const event = summary.sport_event || {};
    const status = summary.sport_event_status || {};
    const competitors = Array.isArray(event.competitors) ? event.competitors : [];
    const compA = competitors[0] || {};
    const compB = competitors[1] || {};
    const nameA = splitName(String(compA.name || "Fighter A"));
    const nameB = splitName(String(compB.name || "Fighter B"));

    const fightId = numericIdFromUrn(event.id || requestedUrn);
    const fights = [
      {
        fightId,
        order: 1,
        weightClass: status.weight_class || "TBD",
        cardSegment: "Main Card",
        status: status.status || status.match_status || "scheduled",
        rounds: status.final_round || 3,
        resultClock: null,
        resultRound: status.final_round || null,
        resultType: status.method || null,
        fighters: [
          {
            fighterId: numericIdFromUrn(compA.id),
            firstName: nameA.firstName,
            lastName: nameA.lastName,
            nickname: undefined,
            moneyline: undefined,
            winner: status.winner_id ? String(status.winner_id) === String(compA.id) : undefined,
            active: true,
            preMatchWins: undefined,
            preMatchLosses: undefined,
            preMatchDraws: undefined,
          },
          {
            fighterId: numericIdFromUrn(compB.id),
            firstName: nameB.firstName,
            lastName: nameB.lastName,
            nickname: undefined,
            moneyline: undefined,
            winner: status.winner_id ? String(status.winner_id) === String(compB.id) : undefined,
            active: true,
            preMatchWins: undefined,
            preMatchLosses: undefined,
            preMatchDraws: undefined,
          },
        ],
      },
    ];

    const payload = {
      event: {
        eventId: numericIdFromUrn(event.id || requestedUrn),
        name:
          competitors.length >= 2
            ? `${compA.name || "Fighter A"} vs ${compB.name || "Fighter B"}`
            : "MMA Bout",
        shortName: event.sport_event_context?.stage?.type || "MMA",
        dateTime: event.start_time || new Date().toISOString(),
        day: undefined,
        status: status.status || status.match_status || "scheduled",
        venue: event.venue?.name || null,
        city: event.venue?.city_name || null,
        state: event.venue?.state || null,
        country: event.venue?.country_name || null,
        active: true,
      },
      fights,
      fightCount: fights.length,
      source: "sportradar",
    };
    setCacheEntry(cacheKey, payload, EVENT_CACHE_TTL_MS);
    return c.json(payload);
  } catch (err) {
    if (cached) {
      return c.json({
        ...cached.value,
        source_stale: true,
        retry_after_seconds: 30,
      });
    }
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export default mmaRouter;
