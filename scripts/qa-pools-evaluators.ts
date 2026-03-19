import {
  getEvaluator,
  getPoolTypeFromFormat,
  type LiveEventData,
  type PoolContext,
  type PoolEntryAction,
  type PlayerStatus,
} from "../src/worker/services/poolEvaluators";

type CaseDef = {
  id: string;
  poolType: string;
  action: PoolEntryAction;
  event: LiveEventData;
  context?: Partial<PoolContext>;
  expectStatus: PlayerStatus;
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const baseEvent: LiveEventData = {
  eventId: "evt-1",
  eventType: "GAME",
  sportKey: "ncaab",
  status: "LIVE",
  homeTeam: "Houston Cougars",
  awayTeam: "Longwood Lancers",
  homeScore: 45,
  awayScore: 38,
  period: "2H",
  clock: "08:12",
  liveData: { points: 18, hr: 1 },
};

const baseAction: PoolEntryAction = {
  userId: "u1",
  displayName: "User 1",
  eventId: "evt-1",
  actionType: "pick",
  selectionId: "HOU",
  selectionLabel: "Houston",
  isLocked: true,
};

const baseContext: PoolContext = {
  poolId: 1,
  poolType: "pickem",
  formatKey: "pickem",
  sportKey: "ncaab",
  periodId: "Round of 64",
  rulesJson: {},
};

const cases: CaseDef[] = [
  {
    id: "pickem-live-winning",
    poolType: "pickem",
    action: baseAction,
    event: { ...baseEvent, status: "LIVE" },
    expectStatus: "WINNING",
  },
  {
    id: "pickem-final-safe",
    poolType: "pickem",
    action: baseAction,
    event: { ...baseEvent, status: "FINAL" },
    expectStatus: "SAFE",
  },
  {
    id: "survivor-tie-safe-default",
    poolType: "survivor",
    action: { ...baseAction, selectionId: "home", selectionLabel: "home" },
    event: { ...baseEvent, status: "FINAL", homeScore: 21, awayScore: 21 },
    context: { rulesJson: { tiesEliminate: false } },
    expectStatus: "SAFE",
  },
  {
    id: "survivor-tie-eliminated-rule",
    poolType: "survivor",
    action: { ...baseAction, selectionId: "home", selectionLabel: "home" },
    event: { ...baseEvent, status: "FINAL", homeScore: 21, awayScore: 21 },
    context: { rulesJson: { tiesEliminate: true } },
    expectStatus: "ELIMINATED",
  },
  {
    id: "confidence-live-at-risk",
    poolType: "confidence",
    action: { ...baseAction, confidenceRank: 14, selectionId: "LONG", selectionLabel: "Longwood" },
    event: { ...baseEvent, status: "LIVE" },
    expectStatus: "AT_RISK",
  },
  {
    id: "upset-favorite-invalid",
    poolType: "upset",
    action: { ...baseAction, metadata: { odds: -180 } },
    event: { ...baseEvent, status: "FINAL" },
    expectStatus: "ELIMINATED",
  },
  {
    id: "upset-underdog-safe",
    poolType: "upset",
    action: {
      ...baseAction,
      selectionId: "LONG",
      selectionLabel: "Longwood",
      metadata: { odds: +350 },
    },
    event: { ...baseEvent, status: "FINAL", homeScore: 71, awayScore: 74 },
    expectStatus: "SAFE",
  },
  {
    id: "stat-live-winning-threshold-met",
    poolType: "stat",
    action: {
      ...baseAction,
      metadata: { metricKey: "points", targetValue: 12 },
    },
    event: { ...baseEvent, status: "LIVE", liveData: { points: 13 } },
    expectStatus: "WINNING",
  },
  {
    id: "stat-final-eliminated-threshold-miss",
    poolType: "stat",
    action: {
      ...baseAction,
      metadata: { metricKey: "points", targetValue: 25 },
    },
    event: { ...baseEvent, status: "FINAL", liveData: { points: 21 } },
    expectStatus: "ELIMINATED",
  },
  {
    id: "streak-final-safe",
    poolType: "streak",
    action: baseAction,
    event: { ...baseEvent, status: "FINAL" },
    expectStatus: "SAFE",
  },
  {
    id: "special-scheduled-pending",
    poolType: "special",
    action: baseAction,
    event: { ...baseEvent, status: "SCHEDULED" },
    expectStatus: "PENDING",
  },
  {
    id: "bracket-live-at-risk",
    poolType: "bracket",
    action: { ...baseAction, metadata: { round: "Sweet 16" } },
    event: { ...baseEvent, status: "LIVE", homeScore: 41, awayScore: 44 },
    expectStatus: "AT_RISK",
  },
  {
    id: "squares-final-safe",
    poolType: "squares",
    action: {
      ...baseAction,
      selectionId: "sq-1",
      selectionLabel: "Square 7/4",
      metadata: { homeDigit: 7, awayDigit: 4 },
    },
    event: { ...baseEvent, status: "FINAL", homeScore: 77, awayScore: 64 },
    expectStatus: "SAFE",
  },
  {
    id: "props-live-winning",
    poolType: "props",
    action: {
      ...baseAction,
      selectionId: "over",
      selectionLabel: "Player points over 18.5",
      metadata: { metricKey: "points", operator: "over", line: 18.5 },
    },
    event: { ...baseEvent, status: "LIVE", liveData: { points: 22 } },
    expectStatus: "WINNING",
  },
  {
    id: "bundle-eliminated-any-child-fail",
    poolType: "bundle",
    action: {
      ...baseAction,
      metadata: { childStatuses: ["SAFE", "ELIMINATED", "PENDING"] },
    },
    event: { ...baseEvent, status: "LIVE" },
    context: { rulesJson: { require_all_children_safe: true } },
    expectStatus: "ELIMINATED",
  },
];

async function main() {
  console.log("=== Pools Evaluator QA Gates ===");

  // Gate: format normalization paths should resolve to expected canonical types.
  const formatChecks: Array<[string, string]> = [
    ["pickem", "pickem"],
    ["pick-em", "pickem"],
    ["survivor", "survivor"],
    ["confidence", "confidence"],
    ["bracket", "bracket"],
    ["squares", "squares"],
    ["props", "props"],
    ["upset", "upset"],
    ["stat", "stat"],
    ["special", "special"],
    ["bundle_pool", "special"],
  ];
  for (const [formatKey, expected] of formatChecks) {
    const resolved = getPoolTypeFromFormat(formatKey);
    assert(resolved === expected, `format mapping failed: ${formatKey} -> ${resolved} (expected ${expected})`);
  }

  let pass = 0;
  for (const t of cases) {
    const evaluator = getEvaluator(t.poolType);
    assert(Boolean(evaluator), `missing evaluator for ${t.poolType}`);
    const context: PoolContext = {
      ...baseContext,
      poolType: t.poolType,
      formatKey: t.poolType,
      ...(t.context || {}),
    };
    const status = evaluator!.evaluatePlayerStatus(t.action, t.event, context);
    assert(status === t.expectStatus, `${t.id} -> ${status} (expected ${t.expectStatus})`);
    pass += 1;
    console.log(`PASS ${t.id}: ${status}`);
  }

  console.log(`Evaluator QA gates passed: ${pass}/${cases.length}`);
}

main().catch((err) => {
  console.error("Evaluator QA gates failed:", err);
  process.exit(1);
});
