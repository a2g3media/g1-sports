type LineQuality = "verified" | "estimated" | "unavailable";

export type EdgeSignal = "strong_over" | "lean_over" | "no_edge" | "lean_under" | "strong_under";

export type EdgeComponentBreakdown = {
  recentForm: number;
  seasonAverage: number;
  matchupAdjustment: number;
  verifiedHitRate: number;
  estimatedSupport: number;
};

export type EdgeRow = {
  statType: string;
  displayLine: number | null;
  lineQuality: LineQuality;
  projectedValue: number | null;
  edgeValue: number | null;
  confidence: number;
  signal: EdgeSignal;
  basisLabel: "verified_basis" | "estimated_basis";
  components: EdgeComponentBreakdown;
};

function normalizeStatType(sport: string, value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "shots_on_goal") return "shots";
  if (raw === "home_runs") return "homeRuns";
  if (sport === "NHL" && raw === "sog") return "shots";
  return raw;
}

function readFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function signalFromEdge(edgeValue: number): EdgeSignal {
  if (edgeValue >= 1.5) return "strong_over";
  if (edgeValue >= 0.5) return "lean_over";
  if (edgeValue <= -1.5) return "strong_under";
  if (edgeValue <= -0.5) return "lean_under";
  return "no_edge";
}

function buildRecentFormByStat(recentPerformance: any[]): Record<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const row of recentPerformance || []) {
    const stats = row?.stats && typeof row.stats === "object" ? row.stats : {};
    for (const [rawKey, rawValue] of Object.entries(stats)) {
      const n = readFinite(rawValue);
      if (n === null) continue;
      const key = String(rawKey || "").trim().toLowerCase();
      if (!key) continue;
      const existing = sums.get(key) || { total: 0, count: 0 };
      existing.total += n;
      existing.count += 1;
      sums.set(key, existing);
    }
  }
  const out: Record<string, number> = {};
  for (const [key, value] of sums.entries()) {
    if (value.count > 0) out[key] = Number((value.total / value.count).toFixed(2));
  }
  return out;
}

function mapStatToRecentKeys(sport: string, statType: string): string[] {
  const stat = statType.toLowerCase();
  if (sport === "MLB") {
    if (stat === "hits") return ["h", "hits"];
    if (stat === "runs") return ["r", "runs"];
    if (stat === "rbis") return ["rbi", "rbis"];
    if (stat === "homeruns" || stat === "home_runs") return ["hr", "homeruns", "home_runs"];
    if (stat === "strikeouts") return ["k", "so", "strikeouts"];
  }
  if (sport === "NHL") {
    if (stat === "goals") return ["g", "goals"];
    if (stat === "assists") return ["a", "assists"];
    if (stat === "points") return ["pts", "points"];
    if (stat === "shots") return ["sog", "shots", "s"];
    if (stat === "saves") return ["sv", "saves"];
  }
  if (stat === "points") return ["pts", "points"];
  if (stat === "rebounds") return ["reb", "rebounds", "trb"];
  if (stat === "assists") return ["ast", "assists", "a"];
  return [stat];
}

function mapStatToSeasonKeys(statType: string): string[] {
  const stat = statType.toLowerCase();
  if (stat === "points") return ["PTS", "points"];
  if (stat === "rebounds") return ["REB", "rebounds", "TRB"];
  if (stat === "assists") return ["AST", "assists", "A"];
  if (stat === "goals") return ["G", "goals"];
  if (stat === "shots") return ["SOG", "shots", "S"];
  if (stat === "saves") return ["SV", "saves"];
  if (stat === "homeruns" || stat === "home_runs") return ["HR", "homeRuns", "home_runs"];
  if (stat === "rbis") return ["RBI", "rbis", "rbi"];
  if (stat === "strikeouts") return ["SO", "K", "strikeouts"];
  if (stat === "hits") return ["H", "hits"];
  if (stat === "runs") return ["R", "runs"];
  return [statType];
}

function readFirstFromRecord(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const n = readFinite((record as any)[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

export function buildEdgeRows(params: {
  sport: string;
  currentProps: any[];
  recentPerformance: any[];
  seasonAverages: Record<string, unknown>;
  propHitRates: Record<string, { rate?: number; total?: number }>;
  lineQualityHints?: Record<string, LineQuality>;
  matchupAdjustment?: number;
}): EdgeRow[] {
  const sport = String(params.sport || "").trim().toUpperCase();
  const recentFormMap = buildRecentFormByStat(params.recentPerformance || []);
  const lineQualityHints = params.lineQualityHints || {};
  const out: EdgeRow[] = [];
  const seen = new Set<string>();
  for (const row of params.currentProps || []) {
    const statType = normalizeStatType(sport, row?.prop_type || row?.stat_type || row?.market_type);
    if (!statType || seen.has(statType)) continue;
    const line = readFinite(row?.line_value);
    if (line === null) continue;
    seen.add(statType);

    const recentKeys = mapStatToRecentKeys(sport, statType);
    const seasonKeys = mapStatToSeasonKeys(statType);
    const recentForm = readFirstFromRecord(recentFormMap as Record<string, unknown>, recentKeys) ?? line;
    const seasonAverage = readFirstFromRecord(params.seasonAverages || {}, seasonKeys) ?? recentForm;
    const matchupAdjustment = Number(params.matchupAdjustment || 0);
    const hitRate = Number(params.propHitRates?.[statType]?.rate ?? params.propHitRates?.[statType.toUpperCase()]?.rate ?? 0);
    const verifiedHitRate = Number.isFinite(hitRate) ? hitRate : 0;
    const estimatedSupport = lineQualityHints[statType] === "estimated" ? 0.2 : 0;
    const projectedValue = Number((recentForm * 0.55 + seasonAverage * 0.35 + matchupAdjustment * 0.1).toFixed(2));
    const edgeValue = Number((projectedValue - line).toFixed(2));
    const lineQuality: LineQuality = lineQualityHints[statType] || (verifiedHitRate > 0 ? "verified" : "estimated");
    const confidenceBase = Math.abs(edgeValue) * 18 + verifiedHitRate * 40 + (lineQuality === "verified" ? 20 : 8);
    const confidence = clamp(Number(confidenceBase.toFixed(0)), 5, 95);
    out.push({
      statType,
      displayLine: line,
      lineQuality,
      projectedValue,
      edgeValue,
      confidence,
      signal: signalFromEdge(edgeValue),
      basisLabel: lineQuality === "verified" ? "verified_basis" : "estimated_basis",
      components: {
        recentForm: Number(recentForm.toFixed(2)),
        seasonAverage: Number(seasonAverage.toFixed(2)),
        matchupAdjustment: Number(matchupAdjustment.toFixed(2)),
        verifiedHitRate: Number(verifiedHitRate.toFixed(2)),
        estimatedSupport: Number(estimatedSupport.toFixed(2)),
      },
    });
  }
  return out.sort((a, b) => Math.abs(Number(b.edgeValue || 0)) - Math.abs(Number(a.edgeValue || 0)));
}

export function summarizeEdgeCoverageBySport(params: {
  rows: Array<{ sport: string; edgeRows: EdgeRow[] }>;
}): Record<string, { playersChecked: number; playersWithEdges: number; edgeEnabledPct: number }> {
  const bySport = new Map<string, { checked: number; withEdges: number }>();
  for (const row of params.rows || []) {
    const sport = String(row.sport || "").trim().toUpperCase();
    if (!sport) continue;
    const existing = bySport.get(sport) || { checked: 0, withEdges: 0 };
    existing.checked += 1;
    if ((row.edgeRows || []).length > 0) existing.withEdges += 1;
    bySport.set(sport, existing);
  }
  const out: Record<string, { playersChecked: number; playersWithEdges: number; edgeEnabledPct: number }> = {};
  for (const [sport, value] of bySport.entries()) {
    out[sport] = {
      playersChecked: value.checked,
      playersWithEdges: value.withEdges,
      edgeEnabledPct: value.checked > 0 ? Number(((value.withEdges / value.checked) * 100).toFixed(2)) : 0,
    };
  }
  return out;
}

