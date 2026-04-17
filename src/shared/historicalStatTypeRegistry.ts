export type HistoricalSportKey =
  | "NBA"
  | "NFL"
  | "MLB"
  | "NHL"
  | "SOCCER"
  | "NCAAB"
  | "NCAAF"
  | "GOLF"
  | "MMA"
  | "BOXING"
  | "TENNIS"
  | "NASCAR";

export type HistoricalStatType =
  | "points"
  | "assists"
  | "rebounds"
  | "pra"
  | "three_pointers"
  | "steals"
  | "blocks"
  | "turnovers"
  | "passing_yards"
  | "passing_tds"
  | "rushing_yards"
  | "receiving_yards"
  | "receptions"
  | "hits"
  | "runs"
  | "rbis"
  | "home_runs"
  | "strikeouts"
  | "goals"
  | "shots_on_goal"
  | "saves"
  | "goals_against"
  | "wins"
  | "shots"
  | "strokes"
  | "birdies"
  | "bogeys"
  | "finish_position"
  | "knockouts"
  | "rounds"
  | "takedowns"
  | "fight_time"
  | "aces"
  | "double_faults"
  | "first_serve_pct"
  | "laps_led"
  | "top_3_finish"
  | "top_5_finish"
  | "top_10_finish";

const BASE_PATTERNS: Array<{ test: RegExp; stat: HistoricalStatType }> = [
  { test: /\bpra\b|pts\+reb\+ast|points\s*\+\s*rebounds\s*\+\s*assists|points rebounds assists/, stat: "pra" },
  { test: /\bpoint(s)?\b|^pts$/, stat: "points" },
  { test: /\brebound(s)?\b|^reb$/, stat: "rebounds" },
  { test: /\bassist(s)?\b|^ast$/, stat: "assists" },
  { test: /3[-\s]?point|three[-\s]?pointer/, stat: "three_pointers" },
  { test: /\bsteal(s)?\b/, stat: "steals" },
  { test: /\bblock(s)?\b/, stat: "blocks" },
  { test: /\bturnover(s)?\b/, stat: "turnovers" },
  { test: /\bpassing\s+yard(s)?\b/, stat: "passing_yards" },
  { test: /\bpassing\s+td(s)?\b|\bpass\s+td(s)?\b/, stat: "passing_tds" },
  { test: /\brushing\s+yard(s)?\b/, stat: "rushing_yards" },
  { test: /\breceiving\s+yard(s)?\b/, stat: "receiving_yards" },
  { test: /\breception(s)?\b/, stat: "receptions" },
  { test: /\bhit(s)?\b/, stat: "hits" },
  { test: /\brbi(s)?\b/, stat: "rbis" },
  { test: /\bhome\s*run(s)?\b/, stat: "home_runs" },
  { test: /\brun(s)?\b/, stat: "runs" },
  { test: /\bstrikeout(s)?\b|\bks?\b/, stat: "strikeouts" },
  { test: /\bshot(s)?\s+on\s+goal\b|\bsog\b/, stat: "shots_on_goal" },
  { test: /\bgoal(s)?\b(?!\s+on)/, stat: "goals" },
  { test: /\bsave(s)?\b/, stat: "saves" },
  { test: /\bgoals?\s+against\b|\bga\b/, stat: "goals_against" },
  { test: /\bwin(s)?\b/, stat: "wins" },
  { test: /\bshots?\b/, stat: "shots" },
  { test: /\bstroke(s)?\b/, stat: "strokes" },
  { test: /\bbirdie(s)?\b/, stat: "birdies" },
  { test: /\bbogey(s)?\b/, stat: "bogeys" },
  { test: /\bfinish(\s+position)?\b/, stat: "finish_position" },
  { test: /\bko\b|knockout(s)?/, stat: "knockouts" },
  { test: /\bround(s)?\b/, stat: "rounds" },
  { test: /\btakedown(s)?\b/, stat: "takedowns" },
  { test: /\bfight\s*time\b/, stat: "fight_time" },
  { test: /\bace(s)?\b/, stat: "aces" },
  { test: /\bdouble\s*fault(s)?\b/, stat: "double_faults" },
  { test: /\bfirst\s*serve(\s*%)?/, stat: "first_serve_pct" },
  { test: /\blaps?\s+led\b/, stat: "laps_led" },
  { test: /\btop\s*3\b/, stat: "top_3_finish" },
  { test: /\btop\s*5\b/, stat: "top_5_finish" },
  { test: /\btop\s*10\b/, stat: "top_10_finish" },
];

export function normalizeHistoricalSport(value: unknown): HistoricalSportKey | null {
  const upper = String(value || "").trim().toUpperCase();
  if (!upper) return null;
  if (upper === "CBB") return "NCAAB";
  if (upper === "CFB") return "NCAAF";
  if (upper === "UFC") return "MMA";
  const supported: Set<string> = new Set([
    "NBA",
    "NFL",
    "MLB",
    "NHL",
    "SOCCER",
    "NCAAB",
    "NCAAF",
    "GOLF",
    "MMA",
    "BOXING",
    "TENNIS",
    "NASCAR",
  ]);
  return supported.has(upper) ? (upper as HistoricalSportKey) : null;
}

export function normalizeHistoricalStatType(params: {
  sport: string;
  marketType?: unknown;
  statType?: unknown;
}): HistoricalStatType | null {
  const sport = normalizeHistoricalSport(params.sport);
  if (!sport) return null;
  const merged = `${String(params.statType || "").trim()} ${String(params.marketType || "").trim()}`
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!merged) return null;
  for (const rule of BASE_PATTERNS) {
    if (rule.test.test(merged)) return rule.stat;
  }
  return null;
}
