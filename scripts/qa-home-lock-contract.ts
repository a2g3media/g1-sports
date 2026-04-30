import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HOMEPAGE_ICON_ROW_STATIC,
  HOMEPAGE_MAX_GAMES,
  HOMEPAGE_NO_RUNTIME_ICON_SWAP,
  HOMEPAGE_STATIC_ICON_SOURCES,
  buildHomeCards,
  reconcileAcceptedHomeWatchboardPayload,
  resolveHomeTeamLogo,
  shouldDiscardStaleHomePayload,
  shouldDiscardStaleHomeWatchboardPayload,
  summarizeHomePayload,
} from "../src/react-app/lib/homeLockRules";

type TestGame = {
  id?: string;
  gameId?: string;
  eventId?: string;
  status: string;
  startTime: string;
  league?: string;
  homeTeam?: { abbreviation?: string; name?: string };
  awayTeam?: { abbreviation?: string; name?: string };
};

function isoOffset(hoursOffset: number): string {
  return new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
}

function runGamesTodaySelectorTests(): void {
  const liveAndToday: TestGame[] = [
    { id: "g1", gameId: "g1", eventId: "e1", status: "LIVE", startTime: isoOffset(-2) },
    { id: "g2", gameId: "g2", eventId: "e2", status: "IN_PROGRESS", startTime: isoOffset(-1) },
    { id: "g3", gameId: "g3", eventId: "e3", status: "ACTIVE", startTime: isoOffset(-3) },
    { id: "g4", gameId: "g4", eventId: "e4", status: "LIVE", startTime: isoOffset(-4) },
  ];
  const cardsA = buildHomeCards(liveAndToday, "NBA");
  assert.equal(cardsA.length, 3, "live/today selection should return exactly 3 cards");

  const fillFromUpcoming: TestGame[] = [
    { id: "u1", gameId: "u1", eventId: "ue1", status: "LIVE", startTime: isoOffset(-1) },
    { id: "u2", gameId: "u2", eventId: "ue2", status: "SCHEDULED", startTime: isoOffset(2) },
    { id: "u3", gameId: "u3", eventId: "ue3", status: "NOT_STARTED", startTime: isoOffset(4) },
  ];
  const cardsB = buildHomeCards(fillFromUpcoming, "NBA");
  assert.equal(cardsB.length, 3, "upcoming fallback should fill to 3");

  const fillFromFinals: TestGame[] = [
    { id: "f1", gameId: "f1", eventId: "fe1", status: "LIVE", startTime: isoOffset(-1) },
    { id: "f2", gameId: "f2", eventId: "fe2", status: "FINAL", startTime: isoOffset(-8) },
    { id: "f3", gameId: "f3", eventId: "fe3", status: "COMPLETED", startTime: isoOffset(-12) },
  ];
  const cardsC = buildHomeCards(fillFromFinals, "NBA");
  assert.equal(cardsC.length, 3, "finals fallback should fill to 3");

  const withDuplicates: TestGame[] = [
    { id: "d1", gameId: "dupe", eventId: "dedupe", status: "LIVE", startTime: isoOffset(-1) },
    { id: "d2", gameId: "dupe", eventId: "dedupe", status: "LIVE", startTime: isoOffset(-1) },
    { id: "d3", gameId: "unique-b", eventId: "eb", status: "SCHEDULED", startTime: isoOffset(2) },
    { id: "d4", gameId: "unique-c", eventId: "ec", status: "FINAL", startTime: isoOffset(-10) },
  ];
  const cardsD = buildHomeCards(withDuplicates, "NBA");
  const idSet = new Set(cardsD.map((game) => String(game.gameId || game.id || "")));
  assert.equal(cardsD.length, idSet.size, "dedupe should remove duplicate game ids");
  assert.ok(cardsD.length <= HOMEPAGE_MAX_GAMES, "selector should never return more than 3 cards");
}

function runLogoResolutionTests(): void {
  const soccerPreferred = resolveHomeTeamLogo({
    abbr: "FCN",
    teamName: "Nantes",
    sport: "SOCCER",
    mappedLogo: "https://img.example/mapped-fcn.png",
    inlineLogo: "https://img.example/inline-fcn.png",
  });
  assert.equal(soccerPreferred.logoSrc, "https://img.example/mapped-fcn.png", "soccer should prefer mapped/static logo");

  const soccerSyntheticFallback = resolveHomeTeamLogo({
    abbr: "ELC",
    teamName: "Elche",
    sport: "SOCCER",
    mappedLogo: "data:image/svg+xml;base64,FAKE",
    inlineLogo: "https://img.example/inline-elc.png",
  });
  assert.equal(soccerSyntheticFallback.logoSrc, "https://img.example/inline-elc.png", "soccer should avoid synthetic fallback when inline is present");

  const whiteSoxAlias = resolveHomeTeamLogo({
    abbr: "CHW",
    teamName: "White Sox",
    sport: "MLB",
    mappedLogo: "https://img.example/whitesox.png",
    inlineLogo: "",
  });
  assert.equal(whiteSoxAlias.logoSrc, "https://img.example/whitesox.png", "white sox aliases should resolve mapped logo");

  const nonTargetPriority = resolveHomeTeamLogo({
    abbr: "LAL",
    teamName: "Lakers",
    sport: "NBA",
    mappedLogo: "https://img.example/lal-mapped.png",
    inlineLogo: "https://img.example/lal-inline.png",
  });
  assert.equal(nonTargetPriority.logoSrc, "https://img.example/lal-inline.png", "non-target sports should keep existing inline-first precedence");
}

function runWatchboardStaleGuardTests(): void {
  const staleByVersion = shouldDiscardStaleHomeWatchboardPayload({
    fetchStartedAt: 1000,
    lastMutationAt: 1000,
    mutationVersionAtFetchStart: 3,
    mutationVersionNow: 4,
  });
  assert.equal(staleByVersion, true, "newer mutation version should discard stale payload");

  const staleByTimestamp = shouldDiscardStaleHomeWatchboardPayload({
    fetchStartedAt: 1500,
    lastMutationAt: 2000,
    mutationVersionAtFetchStart: 3,
    mutationVersionNow: 3,
  });
  assert.equal(staleByTimestamp, true, "payload older than last mutation timestamp should be discarded");

  const freshPayload = shouldDiscardStaleHomeWatchboardPayload({
    fetchStartedAt: 3000,
    lastMutationAt: 2000,
    mutationVersionAtFetchStart: 5,
    mutationVersionNow: 5,
  });
  assert.equal(freshPayload, false, "fresh payload should be accepted");

  const staleByNewAccepted = shouldDiscardStaleHomePayload({
    requestStartedAt: 1000,
    latestAcceptedAt: 2000,
    latestOptimisticMutationAt: 0,
    incomingSummary: summarizeHomePayload({ games: [{ id: "g1", status: "LIVE", startTime: isoOffset(-1) }] }),
    currentVisibleSummary: summarizeHomePayload({ games: [{ id: "g2", status: "LIVE", startTime: isoOffset(-2) }] }),
  });
  assert.equal(staleByNewAccepted.discard, true, "older request than latest accepted should be discarded");

  const staleByOptimistic = shouldDiscardStaleHomePayload({
    requestStartedAt: 1000,
    latestAcceptedAt: 900,
    latestOptimisticMutationAt: 1500,
    incomingSummary: summarizeHomePayload({ games: [{ id: "g1", status: "LIVE", startTime: isoOffset(-1) }] }),
    currentVisibleSummary: summarizeHomePayload({ games: [{ id: "g2", status: "LIVE", startTime: isoOffset(-2) }] }),
  });
  assert.equal(staleByOptimistic.discard, true, "older request than latest optimistic mutation should be discarded");

  const weakGamesPayload = shouldDiscardStaleHomePayload({
    requestStartedAt: 5000,
    latestAcceptedAt: 4000,
    latestOptimisticMutationAt: 0,
    incomingSummary: summarizeHomePayload({
      games: [{ id: "incoming-weak", status: "SCHEDULED", startTime: isoOffset(4), homeTeam: { abbreviation: "TBD" }, awayTeam: { abbreviation: "TBD" } }],
    }),
    currentVisibleSummary: summarizeHomePayload({
      games: [
        { id: "g1", status: "LIVE", startTime: isoOffset(-1), homeTeam: { abbreviation: "LAL" }, awayTeam: { abbreviation: "BOS" } },
        { id: "g2", status: "SCHEDULED", startTime: isoOffset(2), homeTeam: { abbreviation: "NYK" }, awayTeam: { abbreviation: "MIA" } },
        { id: "g3", status: "FINAL", startTime: isoOffset(-8), homeTeam: { abbreviation: "PHX" }, awayTeam: { abbreviation: "DEN" } },
      ],
    }),
  });
  assert.equal(weakGamesPayload.discard, true, "weaker game payload should be rejected");

  const weakWatchboardPayload = shouldDiscardStaleHomePayload({
    requestStartedAt: 6000,
    latestAcceptedAt: 5000,
    latestOptimisticMutationAt: 0,
    incomingSummary: summarizeHomePayload({
      watchboards: [
        { id: 1, gameIds: ["a"], games: [{ game_id: "a", status: "SCHEDULED", home_team_code: "TBD", away_team_code: "TBD" }] },
      ],
    }),
    currentVisibleSummary: summarizeHomePayload({
      watchboards: [
        { id: 1, gameIds: ["a"], games: [{ game_id: "a", status: "LIVE", home_team_code: "LAL", away_team_code: "BOS" }] },
      ],
    }),
  });
  assert.equal(weakWatchboardPayload.discard, true, "placeholder-heavy watchboard payload should be rejected");
}

function runIconRowLockTests(): void {
  assert.equal(HOMEPAGE_ICON_ROW_STATIC, true, "homepage icon row should be static");
  assert.equal(HOMEPAGE_NO_RUNTIME_ICON_SWAP, true, "runtime icon swap must stay disabled");

  const sportQuickAccessPath = resolve(process.cwd(), "src/react-app/components/SportQuickAccess.tsx");
  const content = readFileSync(sportQuickAccessPath, "utf8");
  assert.ok(content.includes("STATIC_HOME_SPORT_CHIPS"), "SportQuickAccess should use static chips list");
  assert.ok(content.includes("onError="), "SportQuickAccess should provide icon fallback via onError");
  assert.ok(content.includes("React.memo(SportQuickAccess)"), "SportQuickAccess should remain memoized");

  const sportAvatarsPath = resolve(process.cwd(), "src/react-app/lib/sportAvatars.ts");
  const sportAvatarsContent = readFileSync(sportAvatarsPath, "utf8");
  assert.ok(!sportAvatarsContent.includes("-photo.png"), "sport avatars should not reference missing photo.png assets");
  assert.ok(sportAvatarsContent.includes("-ai.svg"), "sport avatars should reference checked-in ai.svg assets");

  const projectRoot = process.cwd();
  for (const [sportKey, src] of Object.entries(HOMEPAGE_STATIC_ICON_SOURCES)) {
    const assetPath = String(src || "").split("?")[0];
    assert.ok(assetPath.startsWith("/assets/sports/"), `${sportKey} icon source should be under /assets/sports`);
    const absolute = resolve(projectRoot, "public", assetPath.replace(/^\/assets\//, "assets/"));
    assert.ok(existsSync(absolute), `${sportKey} icon source missing on disk: ${assetPath}`);
  }
}

function runWatchboardReconcileTests(): void {
  const currentVisible = [
    {
      id: 7,
      gameIds: ["g-1"],
      games: [
        {
          game_id: "g-1",
          status: "LIVE",
          home_team_code: "LAL",
          away_team_code: "BOS",
        },
      ],
    },
  ];
  const incomingWeak = [
    {
      id: 7,
      gameIds: ["g-1"],
      games: [
        {
          game_id: "g-1",
          status: "SCHEDULED",
          home_team_code: "TBD",
          away_team_code: "TBD",
        },
      ],
    },
  ];
  const reconciled = reconcileAcceptedHomeWatchboardPayload(incomingWeak, currentVisible);
  assert.equal(
    String(reconciled[0]?.games?.[0]?.home_team_code || ""),
    "LAL",
    "reconcile should preserve hydrated current watchboard game over weak incoming payload"
  );
}

function runLogoStabilityByAcceptanceTests(): void {
  const stable = summarizeHomePayload({
    games: [
      {
        id: "soccer-1",
        status: "LIVE",
        startTime: isoOffset(-1),
        homeTeam: { abbreviation: "FCN", name: "Nantes" },
        awayTeam: { abbreviation: "ELC", name: "Elche" },
      },
    ],
  });
  const weaker = summarizeHomePayload({
    games: [
      {
        id: "soccer-1",
        status: "LIVE",
        startTime: isoOffset(-1),
        homeTeam: { abbreviation: "TBD", name: "Nantes" },
        awayTeam: { abbreviation: "TBD", name: "Elche" },
      },
    ],
  });
  const decision = shouldDiscardStaleHomePayload({
    requestStartedAt: 9000,
    latestAcceptedAt: 8000,
    latestOptimisticMutationAt: 0,
    incomingSummary: weaker,
    currentVisibleSummary: stable,
  });
  assert.equal(decision.discard, true, "weaker incoming state should not wipe accepted stable logo-bearing card state");
}

function main(): void {
  try {
    runGamesTodaySelectorTests();
    runLogoResolutionTests();
    runWatchboardStaleGuardTests();
    runWatchboardReconcileTests();
    runLogoStabilityByAcceptanceTests();
    runIconRowLockTests();
    console.log("PASS qa-home-lock-contract");
  } catch (error) {
    console.error("FAIL qa-home-lock-contract");
    console.error(error);
    process.exit(1);
  }
}

main();
