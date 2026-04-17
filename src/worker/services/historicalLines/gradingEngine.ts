import type { D1Database } from "@cloudflare/workers-types";

type VerifiedRow = {
  sport: string;
  league: string | null;
  game_id: string;
  player_internal_id: string;
  stat_type: string;
  verified_line_value: number;
};

type GradeResult = "over" | "under" | "push" | "no_action";

function toYmd(value: unknown): string {
  const d = new Date(String(value || ""));
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  if (!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return Number.POSITIVE_INFINITY;
  return Math.abs(da.getTime() - db.getTime()) / (24 * 60 * 60 * 1000);
}

function normalizeToken(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeWords(value: unknown): string[] {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function pickStatValue(statType: string, stats: Record<string, unknown>): number | null {
  const type = String(statType || "").toLowerCase();
  const keyCandidates: string[] =
    type === "points" ? ["PTS", "Points"] :
    type === "rebounds" ? ["REB", "Rebounds", "TRB"] :
    type === "assists" ? ["AST", "Assists", "A"] :
    type === "shots_on_goal" ? ["SOG", "S", "shots", "Shots"] :
    type === "goals" ? ["G", "goals"] :
    type === "saves" ? ["SV", "saves"] :
    type === "hits" ? ["H", "hits"] :
    type === "runs" ? ["R", "runs"] :
    type === "rbis" ? ["RBI", "rbi", "rbis"] :
    type === "home_runs" ? ["HR", "homeRuns", "home_runs"] :
    type === "strikeouts" ? ["K", "SO", "strikeouts"] :
    [type];

  for (const key of keyCandidates) {
    const n = Number((stats as any)?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function computeGrade(actual: number | null, line: number): GradeResult {
  if (actual === null || !Number.isFinite(actual) || !Number.isFinite(line)) return "no_action";
  if (Math.abs(actual - line) < 0.0001) return "push";
  return actual > line ? "over" : "under";
}

async function resolveActualStatValue(db: D1Database, row: VerifiedRow): Promise<number | null> {
  const player = await db
    .prepare(
      `SELECT espn_player_id
       FROM canonical_players
       WHERE sport = ? AND canonical_player_id = ?
       LIMIT 1`
    )
    .bind(String(row.sport || "").toUpperCase(), row.player_internal_id)
    .first<{ espn_player_id: string | null }>();
  const espnId = String(player?.espn_player_id || "").trim();
  if (!espnId) return null;

  const doc = await db
    .prepare(
      `SELECT document_json
       FROM player_documents
       WHERE sport = ? AND player_id = ?
       LIMIT 1`
    )
    .bind(String(row.sport || "").toUpperCase(), espnId)
    .first<{ document_json: string }>();
  if (!doc?.document_json) return null;

  let parsed: any = null;
  try {
    parsed = JSON.parse(String(doc.document_json || "{}"));
  } catch {
    return null;
  }

  const recent = Array.isArray(parsed?.data?.profile?.recentPerformance)
    ? parsed.data.profile.recentPerformance
    : Array.isArray(parsed?.recentPerformance)
      ? parsed.recentPerformance
      : [];
  if (recent.length === 0) return null;

  const canonicalGame = await db
    .prepare(
      `SELECT provider_game_id, start_time
       FROM canonical_games
       WHERE id = ?
       LIMIT 1`
    )
    .bind(row.game_id)
    .first<{ provider_game_id: string | null; start_time: string | null }>();

  const sdioGame = canonicalGame?.provider_game_id
    ? await db
        .prepare(
          `SELECT home_team_name, away_team_name, start_time
           FROM sdio_games
           WHERE sport = ? AND provider_game_id = ?
           LIMIT 1`
        )
        .bind(String(row.sport || "").toUpperCase(), canonicalGame.provider_game_id)
        .first<{ home_team_name: string | null; away_team_name: string | null; start_time: string | null }>()
    : null;

  const gameDate = toYmd(sdioGame?.start_time || canonicalGame?.start_time || "");
  const oppTokens = new Set<string>();
  for (const candidate of [sdioGame?.home_team_name, sdioGame?.away_team_name]) {
    const token = normalizeToken(candidate);
    if (token) oppTokens.add(token);
    for (const word of normalizeWords(candidate)) {
      if (word.length >= 3) oppTokens.add(normalizeToken(word));
    }
  }

  let bestValue: number | null = null;
  let bestScore = -1;
  for (const rowStat of recent) {
    const stats = rowStat?.stats && typeof rowStat.stats === "object" ? rowStat.stats : {};
    const val = pickStatValue(row.stat_type, stats as Record<string, unknown>);
    if (val === null) continue;
    const rowDate = toYmd(rowStat?.date);
    const rowOppTokens = new Set<string>();
    rowOppTokens.add(normalizeToken(rowStat?.opponent));
    for (const w of normalizeWords(rowStat?.opponent)) {
      if (w.length >= 3) rowOppTokens.add(normalizeToken(w));
    }
    let score = 0;
    if (gameDate && rowDate) {
      const diff = dayDiff(gameDate, rowDate);
      if (diff === 0) score += 3;
      else if (diff <= 1) score += 2;
    }
    const oppOverlap = Array.from(rowOppTokens).some((token) => token && oppTokens.has(token));
    if (oppOverlap) score += 3;
    if (score > bestScore) {
      bestScore = score;
      bestValue = val;
    }
  }
  return bestScore >= 3 ? bestValue : null;
}

export async function gradeVerifiedHistoricalLines(params: {
  db: D1Database;
  sport?: string;
  gameId?: string;
}): Promise<{ processed: number; graded: number; noAction: number }> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const gameId = String(params.gameId || "").trim();
  const where: string[] = [];
  const binds: unknown[] = [];
  if (sport) {
    where.push("sport = ?");
    binds.push(sport);
  }
  if (gameId) {
    where.push("game_id = ?");
    binds.push(gameId);
  }
  const query = `
    SELECT sport, league, game_id, player_internal_id, stat_type, verified_line_value
    FROM historical_verified_lines_strict
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
  `;
  const rows = await params.db.prepare(query).bind(...binds).all<VerifiedRow>();
  const list = rows.results || [];
  let graded = 0;
  let noAction = 0;

  for (const row of list) {
    const actual = await resolveActualStatValue(params.db, row);
    const grade = computeGrade(actual, Number(row.verified_line_value));
    if (grade === "no_action") noAction += 1;
    else graded += 1;
    await params.db
      .prepare(
        `INSERT INTO historical_line_grades (
          sport, league, game_id, player_internal_id, stat_type,
          verified_line_value, actual_stat_value, grade_result, graded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
        ON CONFLICT(sport, game_id, player_internal_id, stat_type) DO UPDATE SET
          league = excluded.league,
          verified_line_value = excluded.verified_line_value,
          actual_stat_value = excluded.actual_stat_value,
          grade_result = excluded.grade_result,
          graded_at = datetime('now'),
          updated_at = datetime('now')`
      )
      .bind(
        row.sport,
        row.league,
        row.game_id,
        row.player_internal_id,
        String(row.stat_type || "").toLowerCase(),
        Number(row.verified_line_value),
        actual,
        grade
      )
      .run();
  }

  return {
    processed: list.length,
    graded,
    noAction,
  };
}
