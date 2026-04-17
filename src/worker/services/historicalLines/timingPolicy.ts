export type HistoricalTimingPolicy = {
  sport: string;
  strictPregameOnly: boolean;
  expandedEnabled: boolean;
  expandedWindowMinutes: number;
  displayFallbackWindowMinutes: number;
  preferredSnapshotRule: "latest_pregame" | "closest_to_start";
  staleToleranceMinutes: number;
  notes?: string;
};

const DEFAULT_POLICY: HistoricalTimingPolicy = {
  sport: "DEFAULT",
  strictPregameOnly: true,
  expandedEnabled: true,
  expandedWindowMinutes: 20,
  displayFallbackWindowMinutes: 180,
  preferredSnapshotRule: "latest_pregame",
  staleToleranceMinutes: 180,
  notes: "Default policy used when sport is unmapped.",
};

const POLICY_BY_SPORT: Record<string, HistoricalTimingPolicy> = {
  NBA: {
    sport: "NBA",
    strictPregameOnly: true,
    expandedEnabled: true,
    expandedWindowMinutes: 15,
    displayFallbackWindowMinutes: 180,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 120,
  },
  NFL: {
    sport: "NFL",
    strictPregameOnly: true,
    expandedEnabled: true,
    expandedWindowMinutes: 20,
    displayFallbackWindowMinutes: 240,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 180,
  },
  MLB: {
    sport: "MLB",
    strictPregameOnly: true,
    expandedEnabled: true,
    expandedWindowMinutes: 60,
    displayFallbackWindowMinutes: 360,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 240,
  },
  NHL: {
    sport: "NHL",
    strictPregameOnly: true,
    expandedEnabled: true,
    expandedWindowMinutes: 45,
    displayFallbackWindowMinutes: 240,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 180,
  },
  SOCCER: {
    sport: "SOCCER",
    strictPregameOnly: true,
    expandedEnabled: true,
    expandedWindowMinutes: 30,
    displayFallbackWindowMinutes: 240,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 180,
  },
  NCAAB: {
    sport: "NCAAB",
    strictPregameOnly: true,
    expandedEnabled: true,
    expandedWindowMinutes: 20,
    displayFallbackWindowMinutes: 180,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 180,
  },
  NCAAF: {
    sport: "NCAAF",
    strictPregameOnly: true,
    expandedEnabled: true,
    expandedWindowMinutes: 20,
    displayFallbackWindowMinutes: 240,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 180,
  },
  GOLF: {
    sport: "GOLF",
    strictPregameOnly: true,
    expandedEnabled: false,
    expandedWindowMinutes: 0,
    displayFallbackWindowMinutes: 0,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 0,
    notes: "Scaffolded policy; disabled until live validation.",
  },
  MMA: {
    sport: "MMA",
    strictPregameOnly: true,
    expandedEnabled: false,
    expandedWindowMinutes: 0,
    displayFallbackWindowMinutes: 0,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 0,
    notes: "Scaffolded policy; disabled until live validation.",
  },
  BOXING: {
    sport: "BOXING",
    strictPregameOnly: true,
    expandedEnabled: false,
    expandedWindowMinutes: 0,
    displayFallbackWindowMinutes: 0,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 0,
    notes: "Scaffolded policy; disabled until live validation.",
  },
  TENNIS: {
    sport: "TENNIS",
    strictPregameOnly: true,
    expandedEnabled: false,
    expandedWindowMinutes: 0,
    displayFallbackWindowMinutes: 0,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 0,
    notes: "Scaffolded policy; disabled until live validation.",
  },
  NASCAR: {
    sport: "NASCAR",
    strictPregameOnly: true,
    expandedEnabled: false,
    expandedWindowMinutes: 0,
    displayFallbackWindowMinutes: 0,
    preferredSnapshotRule: "closest_to_start",
    staleToleranceMinutes: 0,
    notes: "Scaffolded policy; disabled until live validation.",
  },
};

export function getHistoricalTimingPolicy(sportInput: string): HistoricalTimingPolicy {
  const sport = String(sportInput || "").trim().toUpperCase();
  return POLICY_BY_SPORT[sport] || { ...DEFAULT_POLICY, sport: sport || DEFAULT_POLICY.sport };
}

