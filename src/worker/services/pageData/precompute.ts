type WarmFetchResult = {
  ok: boolean;
  status: number;
  body: any;
};

type WarmFetchFn = (pathWithQuery: string) => Promise<WarmFetchResult>;

const TOP_SPORTS = ["NBA", "NFL", "MLB", "NHL", "NCAAB", "SOCCER"] as const;

function todayEtYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeGameId(value: unknown): string {
  return String(value || "").trim();
}

export type PageDataWarmSummary = {
  startedAt: string;
  date: string;
  forceFresh: boolean;
  requests: number;
  successes: number;
  failures: number;
  warmedGameDetailCount: number;
};

export async function runPageDataWarmCycle(params: {
  fetchFn: WarmFetchFn;
  forceFresh?: boolean;
  date?: string;
}): Promise<PageDataWarmSummary> {
  const startedAt = new Date().toISOString();
  const forceFresh = params.forceFresh === true;
  const date = (params.date || "").trim() || todayEtYmd();
  const freshSuffix = forceFresh ? "&fresh=1" : "";

  const requests: string[] = [
    `/api/page-data/games?date=${encodeURIComponent(date)}&sport=ALL&tab=scores${freshSuffix}`,
    `/api/page-data/odds?date=${encodeURIComponent(date)}&sport=ALL${freshSuffix}`,
    ...TOP_SPORTS.map(
      (sport) => `/api/page-data/sport-hub?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}${freshSuffix}`
    ),
  ];

  const settled = await Promise.allSettled(requests.map((path) => params.fetchFn(path)));
  let successes = 0;
  let failures = 0;
  let gamesPayload: any = null;

  settled.forEach((res, idx) => {
    if (res.status !== "fulfilled" || !res.value.ok) {
      failures += 1;
      return;
    }
    successes += 1;
    if (idx === 0) gamesPayload = res.value.body;
  });

  // Warm a bounded set of game-detail snapshots from today's games slate.
  const gameRows = Array.isArray(gamesPayload?.games) ? gamesPayload.games : [];
  const gameIds = gameRows
    .map((g: any) => normalizeGameId(g?.game_id || g?.id))
    .filter(Boolean)
    .slice(0, 12);

  const detailRequests = gameIds.map((gameId) => {
    const sport = String(
      gameRows.find((g: any) => normalizeGameId(g?.game_id || g?.id) === gameId)?.sport || ""
    )
      .trim()
      .toUpperCase();
    const sportPart = sport ? `&sport=${encodeURIComponent(sport)}` : "";
    return `/api/page-data/game-detail?gameId=${encodeURIComponent(gameId)}${sportPart}${freshSuffix}`;
  });

  const detailSettled = await Promise.allSettled(detailRequests.map((path) => params.fetchFn(path)));
  let warmedGameDetailCount = 0;
  for (const result of detailSettled) {
    if (result.status === "fulfilled" && result.value.ok) {
      warmedGameDetailCount += 1;
      successes += 1;
    } else {
      failures += 1;
    }
  }

  return {
    startedAt,
    date,
    forceFresh,
    requests: requests.length + detailRequests.length,
    successes,
    failures,
    warmedGameDetailCount,
  };
}

