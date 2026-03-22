/**
 * Coach G Deep Game Preview Service
 * 
 * Generates comprehensive AI-powered game previews by:
 * 1. Scraping multiple sports news sources (ESPN, CBS Sports, Action Network)
 * 2. Combining with internal data (odds, injuries, weather)
 * 3. Generating 500-800 word analysis in Coach G's voice
 */

import Firecrawl from "@mendable/firecrawl-js";
import OpenAI from "openai";
import { fetchGameWithFallback } from "./providers";
import { fetchSportsRadarOdds, fetchSportsRadarOddsForGame } from "./sportsRadarOddsService";

// ============ Types ============

export interface GamePreview {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  gameStartAt: string;
  preview: PreviewContent;
  sources: SourceInfo[];
  generatedAt: string;
  expiresAt: string;
  wordCount: number;
  cached: boolean;
}

export interface PreviewContent {
  headline: string;
  matchupStory: string;
  keyNumbers: string;
  playerSpotlight: string;
  conditionsAnalysis: string;
  bettingInsight: string;
  gsPick: string;
  riskAssessment: string;
  fullText: string;
  dataFreshness?: {
    status: "verified_live_roster" | "limited_roster_certainty";
    badge: "Verified live roster" | "Limited roster certainty";
    score: number;
    capturedAt: string | null;
    note: string;
  };
}

export interface SourceInfo {
  name: string;
  url: string;
  scrapedAt: string;
  contentLength: number;
}

interface ScrapedContent {
  source: string;
  url: string;
  content: string;
  scrapedAt: string;
}

interface PreviewOddsContext {
  source: string;
  confidence: "direct_event" | "team_match" | "none";
}

interface GameData {
  id: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startAt: string;
  venue?: string;
  broadcast?: string;
  homeScore?: number;
  awayScore?: number;
  status: string;
  odds?: {
    spread?: number;
    total?: number;
    homeML?: number;
    awayML?: number;
  };
}

interface PlayerNamingGuard {
  mode: "allowlist" | "no_names";
  snapshotContext: string;
  allowedNames: string[];
  freshness: {
    status: "verified_live_roster" | "limited_roster_certainty";
    badge: "Verified live roster" | "Limited roster certainty";
    score: number;
    capturedAt: string | null;
    note: string;
  };
}

interface GenerationGuardsResult {
  preview: PreviewContent;
  flags: string[];
}

function mapProviderGameToPreviewGame(game: any): GameData {
  return {
    id: String(game?.game_id || game?.id || ""),
    sport: String(game?.sport || "unknown"),
    homeTeam: String(game?.home_team_name || game?.home_team_code || game?.homeTeam || "HOME"),
    awayTeam: String(game?.away_team_name || game?.away_team_code || game?.awayTeam || "AWAY"),
    startAt: String(game?.start_time || game?.startTime || new Date().toISOString()),
    venue: game?.venue ? String(game.venue) : undefined,
    broadcast: game?.broadcast ? String(game.broadcast) : undefined,
    homeScore: typeof game?.home_score === "number" ? game.home_score : undefined,
    awayScore: typeof game?.away_score === "number" ? game.away_score : undefined,
    status: String(game?.status || "SCHEDULED"),
    odds: undefined,
  };
}

const PREVIEW_SPORTSRADAR_CONFIG: Record<string, { base: string; version: string; pathKey: string }> = {
  nba: { base: "https://api.sportradar.com/nba/production", version: "v8", pathKey: "nba" },
  nfl: { base: "https://api.sportradar.com/nfl/production", version: "v7", pathKey: "nfl" },
  mlb: { base: "https://api.sportradar.com/mlb/production", version: "v7", pathKey: "mlb" },
  nhl: { base: "https://api.sportradar.com/nhl/production", version: "v7", pathKey: "nhl" },
  ncaab: { base: "https://api.sportradar.com/ncaamb/production", version: "v8", pathKey: "ncaamb" },
  ncaaf: { base: "https://api.sportradar.com/ncaafb/production", version: "v7", pathKey: "ncaafb" },
};

function normalizePlayerName(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeNameToken(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsRoughlyMatch(a: string, b: string): boolean {
  const left = normalizeNameToken(a);
  const right = normalizeNameToken(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftLast = left.split(" ").pop() || "";
  const rightLast = right.split(" ").pop() || "";
  if (leftLast && rightLast && leftLast === rightLast) return true;
  return false;
}

function extractSportsRadarEventId(gameId: string): string | null {
  if (gameId.startsWith("sr:sport_event:")) {
    return gameId.replace("sr:sport_event:", "");
  }
  if (!gameId.startsWith("sr_")) return null;
  const parts = gameId.split("_");
  if (parts.length < 3) return null;
  return parts.slice(2).join("-");
}

function getSportsRadarConfigForPreview(gameId: string, sportHint: string): { config: { base: string; version: string; pathKey: string }; eventId: string } | null {
  const eventId = extractSportsRadarEventId(gameId);
  if (!eventId) return null;

  let sportKey = String(sportHint || "").toLowerCase();
  if (!sportKey && gameId.startsWith("sr_")) {
    const parts = gameId.split("_");
    sportKey = String(parts[1] || "").toLowerCase();
  }
  const config = PREVIEW_SPORTSRADAR_CONFIG[sportKey];
  if (!config) return null;
  return { config, eventId };
}

async function buildPlayerNamingGuard(
  apiKey: string | undefined,
  gameId: string,
  game: GameData
): Promise<PlayerNamingGuard> {
  const noNamesGuard: PlayerNamingGuard = {
    mode: "no_names",
    snapshotContext:
      "No authoritative live roster snapshot was available at generation time. Do not use named player takes. Use role-based language only (e.g., lead guard, rim protector).",
    allowedNames: [],
    freshness: {
      status: "limited_roster_certainty",
      badge: "Limited roster certainty",
      score: 35,
      capturedAt: null,
      note: "Live roster snapshot unavailable at generation time; named-player claims are disabled.",
    },
  };

  if (!apiKey) return noNamesGuard;

  const identity = getSportsRadarConfigForPreview(gameId, game.sport);
  if (!identity) return noNamesGuard;

  try {
    const url = `${identity.config.base}/${identity.config.version}/en/games/${identity.eventId}/summary.json?api_key=${apiKey}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return noNamesGuard;

    const payload = (await response.json()) as any;
    const gameNode = payload?.game || payload || {};
    const homeNode = gameNode?.home || {};
    const awayNode = gameNode?.away || {};
    const homePlayersRaw = Array.isArray(homeNode?.players) ? homeNode.players : [];
    const awayPlayersRaw = Array.isArray(awayNode?.players) ? awayNode.players : [];

    const classify = (players: any[]) => {
      const active: string[] = [];
      const unavailable: string[] = [];
      for (const player of players) {
        const name = normalizePlayerName(
          String(
            player?.full_name ||
              player?.name ||
              `${player?.first_name || ""} ${player?.last_name || ""}`.trim()
          )
        );
        if (!name) continue;

        const status = String(
          player?.status ||
            player?.injury?.status ||
            player?.injuries?.[0]?.status ||
            ""
        )
          .trim()
          .toLowerCase();

        const isUnavailable =
          status.includes("out") ||
          status.includes("inactive") ||
          status.includes("doubt") ||
          status.includes("question") ||
          status.includes("injur") ||
          status.includes("suspend");

        if (isUnavailable) unavailable.push(name);
        else active.push(name);
      }
      return { active: Array.from(new Set(active)), unavailable: Array.from(new Set(unavailable)) };
    };

    const home = classify(homePlayersRaw);
    const away = classify(awayPlayersRaw);
    const allowedNames = Array.from(new Set([...home.active, ...away.active])).slice(0, 30);

    if (allowedNames.length === 0) return noNamesGuard;

    const capturedAt = new Date().toISOString();
    const homeLabel = String(homeNode?.name || game.homeTeam || "Home team");
    const awayLabel = String(awayNode?.name || game.awayTeam || "Away team");
    const unavailableLine =
      home.unavailable.length || away.unavailable.length
        ? `Unavailable / questionable players: ${homeLabel}: ${home.unavailable.join(", ") || "None"} | ${awayLabel}: ${away.unavailable.join(", ") || "None"}`
        : "Unavailable / questionable players: None reported in the live summary snapshot.";

    return {
      mode: "allowlist",
      snapshotContext: [
        `Authoritative roster snapshot source: SportsRadar game summary (${capturedAt}).`,
        `${homeLabel} available rotation sample: ${home.active.slice(0, 12).join(", ") || "Unknown"}`,
        `${awayLabel} available rotation sample: ${away.active.slice(0, 12).join(", ") || "Unknown"}`,
        unavailableLine,
      ].join("\n"),
      allowedNames,
      freshness: {
        status: "verified_live_roster",
        badge: "Verified live roster",
        score: 96,
        capturedAt,
        note: "Player mentions are restricted to names present in the live SportsRadar roster snapshot.",
      },
    };
  } catch {
    return noNamesGuard;
  }
}

function formatSigned(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return `${value > 0 ? "+" : ""}${value}`;
}

function hasMeaningfulOdds(game: GameData): boolean {
  return Boolean(
    game.odds &&
      (typeof game.odds.spread === "number" ||
        typeof game.odds.total === "number" ||
        typeof game.odds.homeML === "number" ||
        typeof game.odds.awayML === "number")
  );
}

async function hydrateGameOdds(
  db: D1Database,
  gameId: string,
  game: GameData,
  apiKey?: string,
  oddsApiKey?: string
): Promise<PreviewOddsContext> {
  if (!apiKey || !game.sport || !game.homeTeam || !game.awayTeam) {
    return { source: "none", confidence: "none" };
  }

  const effectiveOddsKey = oddsApiKey || apiKey;
  try {
    const oddsMap = await fetchSportsRadarOdds(game.sport, apiKey, db, undefined, effectiveOddsKey);
    const sportLower = String(game.sport || "").toLowerCase();
    const homeLast = normalizeNameToken(game.homeTeam).split(" ").pop() || "";
    const awayLast = normalizeNameToken(game.awayTeam).split(" ").pop() || "";
    const candidateEventId =
      (extractSportsRadarEventId(gameId) ? `sr:sport_event:${extractSportsRadarEventId(gameId)}` : null) ||
      (extractSportsRadarEventId(game.id) ? `sr:sport_event:${extractSportsRadarEventId(game.id)}` : null);
    const candidateKeys = [
      candidateEventId,
      game.id,
      gameId,
      `${sportLower}|${awayLast}|${homeLast}`,
      `${sportLower}|${normalizeNameToken(game.awayTeam)}|${normalizeNameToken(game.homeTeam)}`,
    ].filter(Boolean) as string[];

    let found = null as Awaited<ReturnType<typeof fetchSportsRadarOddsForGame>>;
    for (const key of candidateKeys) {
      const hit = oddsMap.get(key);
      if (hit) {
        found = hit;
        break;
      }
    }

    if (!found) {
      for (const odds of oddsMap.values()) {
        if (
          teamsRoughlyMatch(String(odds.homeTeam || ""), game.homeTeam) &&
          teamsRoughlyMatch(String(odds.awayTeam || ""), game.awayTeam)
        ) {
          found = odds;
          break;
        }
      }
    }

    if (!found && candidateEventId) {
      found = await fetchSportsRadarOddsForGame(candidateEventId, effectiveOddsKey);
    }

    if (!found) {
      return { source: "none", confidence: "none" };
    }

    game.odds = {
      spread: typeof found.spreadHome === "number" ? found.spreadHome : found.spread,
      total: found.total,
      homeML: found.moneylineHome,
      awayML: found.moneylineAway,
    };

    return {
      source: candidateEventId && (found.gameId === candidateEventId) ? "SportsRadar direct event market" : "SportsRadar competition/team market",
      confidence: candidateEventId && (found.gameId === candidateEventId) ? "direct_event" : "team_match",
    };
  } catch {
    return { source: "none", confidence: "none" };
  }
}

function buildOddsContextText(game: GameData, oddsContext: PreviewOddsContext): string {
  if (!hasMeaningfulOdds(game)) {
    return "No authoritative odds snapshot could be resolved for this game at generation time.";
  }

  return [
    `Authoritative odds source: ${oddsContext.source || "SportsRadar"}`,
    `Spread (${game.homeTeam}): ${formatSigned(game.odds?.spread)}`,
    `Total: ${game.odds?.total ?? "N/A"}`,
    `Moneyline: ${game.homeTeam} ${formatSigned(game.odds?.homeML)} / ${game.awayTeam} ${formatSigned(game.odds?.awayML)}`,
  ].join("\n");
}

function parseDateFromText(value: string): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const isoLike = raw.match(/\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]) - 1;
    const day = Number(isoLike[3]);
    const parsed = new Date(Date.UTC(year, month, day, 12, 0, 0));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function filterScrapedContentByRecency(scraped: ScrapedContent[], game: GameData): ScrapedContent[] {
  const gameTime = new Date(game.startAt);
  const hasGameTime = !Number.isNaN(gameTime.getTime());
  const maxAgeMs = 45 * 24 * 60 * 60 * 1000;
  const homeToken = normalizeNameToken(game.homeTeam).split(" ").pop() || "";
  const awayToken = normalizeNameToken(game.awayTeam).split(" ").pop() || "";

  return scraped.filter((item) => {
    const urlDate = parseDateFromText(item.url);
    const bodyDate = parseDateFromText(item.content.slice(0, 500));
    const referenceDate = urlDate || bodyDate;
    if (referenceDate && hasGameTime) {
      const age = Math.abs(gameTime.getTime() - referenceDate.getTime());
      if (age > maxAgeMs) return false;
    }

    const lower = normalizeNameToken(item.content.slice(0, 2000));
    const mentionsHome = homeToken ? lower.includes(homeToken) : true;
    const mentionsAway = awayToken ? lower.includes(awayToken) : true;
    return mentionsHome || mentionsAway;
  });
}

function containsOddsUnavailableClaim(text: string): boolean {
  return /(odds?\s+(are\s+)?not\s+available|no\s+odds?\s+available|line[s]?\s+unavailable|market\s+not\s+available)/i.test(
    String(text || "")
  );
}

function extractCapitalizedNames(text: string): string[] {
  const matches = String(text || "").match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g) || [];
  const ignored = new Set([
    "The Matchup Story",
    "Key Numbers",
    "Player Spotlight",
    "Risk Assessment",
    "Betting Market Intel",
    "Action Network",
    "CBS Sports",
    "ESPN",
  ]);
  return Array.from(new Set(matches.filter((m) => !ignored.has(m))));
}

function applyGenerationGuards(preview: PreviewContent, game: GameData, namingGuard: PlayerNamingGuard): GenerationGuardsResult {
  const flags: string[] = [];
  const guarded = { ...preview };

  if (hasMeaningfulOdds(game)) {
    const bettingBlock = `${guarded.bettingInsight || ""}\n${guarded.fullText || ""}`;
    if (containsOddsUnavailableClaim(bettingBlock)) {
      guarded.bettingInsight = [
        `Market is active. Current spread is ${game.homeTeam} ${formatSigned(game.odds?.spread)}, total ${game.odds?.total ?? "N/A"}, and moneyline ${game.homeTeam} ${formatSigned(game.odds?.homeML)} / ${game.awayTeam} ${formatSigned(game.odds?.awayML)}.`,
        "Use this live market snapshot as authoritative over any older article references.",
      ].join(" ");
      flags.push("patched_odds_unavailable_claim");
    }
  }

  if (namingGuard.mode === "allowlist" && namingGuard.allowedNames.length > 0) {
    const allow = new Set(namingGuard.allowedNames.map((n) => normalizePlayerName(n).toLowerCase()));
    const text = `${guarded.playerSpotlight || ""}\n${guarded.fullText || ""}`;
    const possibleNames = extractCapitalizedNames(text);
    const invalid = possibleNames.filter((name) => {
      const normalized = normalizePlayerName(name).toLowerCase();
      if (allow.has(normalized)) return false;
      if (teamsRoughlyMatch(name, game.homeTeam) || teamsRoughlyMatch(name, game.awayTeam)) return false;
      return true;
    });
    if (invalid.length > 0) {
      guarded.playerSpotlight =
        "Live roster validation is active. Focus remains on currently active rotation roles, current availability, and matchup fit rather than uncertain named-player claims.";
      flags.push(`suppressed_invalid_player_names:${invalid.slice(0, 5).join(",")}`);
    }
  }

  return { preview: guarded, flags };
}

// ============ Scraping Functions ============

async function scrapeESPN(
  firecrawl: Firecrawl,
  homeTeam: string,
  awayTeam: string,
  sport: string
): Promise<ScrapedContent | null> {
  try {
    // Use Firecrawl search to find ESPN preview
    const searchQuery = `site:espn.com ${awayTeam} vs ${homeTeam} preview ${sport}`;
    
    const results = await firecrawl.search(searchQuery, {
      limit: 3,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 15000,
      },
    }) as any;

    if (results?.data?.web && results.data.web.length > 0) {
      const firstResult = results.data.web[0];
      return {
        source: "ESPN",
        url: firstResult.url || "https://espn.com",
        content: firstResult.markdown || firstResult.description || "",
        scrapedAt: new Date().toISOString(),
      };
    }
    
    return null;
  } catch (error) {
    console.error("[CoachGPreview] ESPN scrape failed:", error);
    return null;
  }
}

async function scrapeCBSSports(
  firecrawl: Firecrawl,
  homeTeam: string,
  awayTeam: string,
  sport: string
): Promise<ScrapedContent | null> {
  try {
    const searchQuery = `site:cbssports.com ${awayTeam} vs ${homeTeam} prediction picks ${sport}`;
    
    const results = await firecrawl.search(searchQuery, {
      limit: 3,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 15000,
      },
    }) as any;

    if (results?.data?.web && results.data.web.length > 0) {
      const firstResult = results.data.web[0];
      return {
        source: "CBS Sports",
        url: firstResult.url || "https://cbssports.com",
        content: firstResult.markdown || firstResult.description || "",
        scrapedAt: new Date().toISOString(),
      };
    }
    
    return null;
  } catch (error) {
    console.error("[CoachGPreview] CBS Sports scrape failed:", error);
    return null;
  }
}

async function scrapeActionNetwork(
  firecrawl: Firecrawl,
  homeTeam: string,
  awayTeam: string,
  _sport: string
): Promise<ScrapedContent | null> {
  try {
    const searchQuery = `site:actionnetwork.com ${awayTeam} ${homeTeam} betting preview odds`;
    
    const results = await firecrawl.search(searchQuery, {
      limit: 3,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 15000,
      },
    }) as any;

    if (results?.data?.web && results.data.web.length > 0) {
      const firstResult = results.data.web[0];
      return {
        source: "Action Network",
        url: firstResult.url || "https://actionnetwork.com",
        content: firstResult.markdown || firstResult.description || "",
        scrapedAt: new Date().toISOString(),
      };
    }
    
    return null;
  } catch (error) {
    console.error("[CoachGPreview] Action Network scrape failed:", error);
    return null;
  }
}

async function scrapeGeneral(
  firecrawl: Firecrawl,
  homeTeam: string,
  awayTeam: string,
  sport: string
): Promise<ScrapedContent | null> {
  try {
    // General web search for additional context
    const searchQuery = `${awayTeam} vs ${homeTeam} ${sport} game preview betting analysis injury report`;
    
    const results = await firecrawl.search(searchQuery, {
      limit: 5,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 15000,
      },
    }) as any;

    if (results?.data?.web && results.data.web.length > 0) {
      // Combine top results
      const combinedContent = results.data.web
        .slice(0, 3)
        .map((r: { url?: string; markdown?: string; description?: string }) => `Source: ${r.url}\n${r.markdown || r.description || ""}`)
        .join("\n\n---\n\n");
      
      return {
        source: "Web Search",
        url: "Multiple sources",
        content: combinedContent,
        scrapedAt: new Date().toISOString(),
      };
    }
    
    return null;
  } catch (error) {
    console.error("[CoachGPreview] General scrape failed:", error);
    return null;
  }
}

// ============ Preview Generation ============

const COACH_G_SYSTEM_PROMPT = `You are Coach G, the sharp-tongued, confident sports analyst for GZ Sports. You've been grinding tape, tracking line movements, and analyzing matchups for 20+ years. Your voice is:

- CONFIDENT but not arrogant - you've done the work
- DIRECT - no hedging or mealy-mouthed analysis
- SPECIFIC - you cite actual numbers and trends
- PERSONALITY - occasional wit, sports metaphors, strong opinions
- HONEST about uncertainty when it exists

You're writing a comprehensive game preview that's like premium handicapping content. This should feel like the user is getting insider analysis they'd pay good money for elsewhere.

CRITICAL: When citing information, attribute it naturally: "ESPN's BPI has this at...", "Per CBS Sports injury report...", "Action Network is tracking sharp money on..."

DO NOT:
- Use phrases like "As an AI" or "I don't have access to..."
- Hedge excessively with "might", "could", "possibly" 
- Use generic filler - every sentence should add value
- Give both sides equal weight if you have a clear lean

Your preview MUST include these sections (use these exact headers):

## The Matchup Story
Context: rivalry, playoff implications, rest days, travel, season narrative

## Key Numbers
ATS records, O/U trends, home/away splits, pace stats, relevant metrics

## Player Spotlight  
Who's hot, who's cold, injury impacts, matchup advantages

## Conditions & Situational Factors
Weather (outdoor), travel, back-to-back, motivation factors, trap game indicators

## Betting Market Intel
Where lines opened, current movement, sharp vs public money if available

## G's Edge Pick
Your confident call with specific spread/total recommendation and WHY

## Risk Assessment
What could go wrong with your pick, scenarios that bust it`;

async function generatePreviewWithAI(
  openai: OpenAI,
  game: GameData,
  scrapedContent: ScrapedContent[],
  internalData: string,
  namingGuard: PlayerNamingGuard
): Promise<PreviewContent> {
  const sourcesText = scrapedContent
    .filter(s => s.content && s.content.length > 100)
    .map(s => `=== ${s.source} ===\n${s.content.slice(0, 3000)}`)
    .join("\n\n");

  const userPrompt = `Generate a comprehensive game preview for:

**${game.awayTeam} @ ${game.homeTeam}**
Sport: ${game.sport}
Game Time: ${new Date(game.startAt).toLocaleString()}
${game.venue ? `Venue: ${game.venue}` : ""}
${game.broadcast ? `TV: ${game.broadcast}` : ""}

**Current Odds (if available):**
${hasMeaningfulOdds(game)
    ? `Spread: ${game.homeTeam} ${formatSigned(game.odds?.spread)}
Total: ${game.odds?.total ?? "N/A"}
Moneyline: ${game.homeTeam} ${formatSigned(game.odds?.homeML)} / ${game.awayTeam} ${formatSigned(game.odds?.awayML)}`
    : "No resolved odds in authoritative feed"}

**Internal Data:**
${internalData}

**Authoritative Live Roster & Availability Context (highest priority):**
${namingGuard.snapshotContext}

**Player naming policy (MANDATORY):**
${namingGuard.mode === "allowlist"
    ? `Only mention player names from this approved list: ${namingGuard.allowedNames.join(", ")}. If a player is not in this list, do not mention them by name.`
    : "Do not mention any player by name. Use role-based analysis only because no authoritative roster snapshot is available."}

**Scraped Intelligence from Multiple Sources:**
${sourcesText || "Limited external data available - rely on internal data and general knowledge"}

Write a 500-800 word preview following the format specified. Make it feel like premium handicapping content. Attribute specific stats/info to sources when you cite them. End with a clear, confident pick.

Hard safety check before final output:
- Do NOT include outdated or transferred players.
- If source conflicts exist, trust the authoritative live roster context over web snippets.
- If uncertain, explicitly say lineup uncertainty and avoid named-player claims.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: COACH_G_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 2000,
  });

  const fullText = response.choices[0]?.message?.content || "";
  
  // Parse sections from the response
  const sections = parsePreviewSections(fullText);
  
  return {
    headline: `${game.awayTeam} @ ${game.homeTeam} | Coach G's Deep Dive`,
    matchupStory: sections.matchupStory,
    keyNumbers: sections.keyNumbers,
    playerSpotlight: sections.playerSpotlight,
    conditionsAnalysis: sections.conditionsAnalysis,
    bettingInsight: sections.bettingInsight,
    gsPick: sections.gsPick,
    riskAssessment: sections.riskAssessment,
    fullText,
    dataFreshness: {
      status: namingGuard.freshness.status,
      badge: namingGuard.freshness.badge,
      score: namingGuard.freshness.score,
      capturedAt: namingGuard.freshness.capturedAt,
      note: namingGuard.freshness.note,
    },
  };
}

function parsePreviewSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {
    matchupStory: "",
    keyNumbers: "",
    playerSpotlight: "",
    conditionsAnalysis: "",
    bettingInsight: "",
    gsPick: "",
    riskAssessment: "",
  };

  // Extract sections based on headers
  const sectionPatterns: [keyof typeof sections, RegExp][] = [
    ["matchupStory", /##\s*The Matchup Story\s*\n([\s\S]*?)(?=##|$)/i],
    ["keyNumbers", /##\s*Key Numbers\s*\n([\s\S]*?)(?=##|$)/i],
    ["playerSpotlight", /##\s*Player Spotlight\s*\n([\s\S]*?)(?=##|$)/i],
    ["conditionsAnalysis", /##\s*Conditions\s*(?:&|and)?\s*Situational Factors?\s*\n([\s\S]*?)(?=##|$)/i],
    ["bettingInsight", /##\s*Betting Market Intel\s*\n([\s\S]*?)(?=##|$)/i],
    ["gsPick", /##\s*G'?s Edge Pick\s*\n([\s\S]*?)(?=##|$)/i],
    ["riskAssessment", /##\s*Risk Assessment\s*\n([\s\S]*?)(?=##|$)/i],
  ];

  for (const [key, pattern] of sectionPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      sections[key] = match[1].trim();
    }
  }

  return sections;
}

// ============ Cache Management ============

let ensureCoachGPreviewSchemaPromise: Promise<void> | null = null;

async function ensureCoachGPreviewSchema(db: D1Database): Promise<void> {
  if (ensureCoachGPreviewSchemaPromise) {
    await ensureCoachGPreviewSchemaPromise;
    return;
  }

  ensureCoachGPreviewSchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS coach_g_previews (
        game_id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        game_start_at TEXT NOT NULL,
        preview_content TEXT NOT NULL,
        sources_used TEXT NOT NULL DEFAULT '[]',
        scraped_data TEXT NOT NULL DEFAULT '[]',
        word_count INTEGER NOT NULL DEFAULT 0,
        generation_cost_cents INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        is_stale INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  })();

  try {
    await ensureCoachGPreviewSchemaPromise;
  } finally {
    ensureCoachGPreviewSchemaPromise = null;
  }
}

async function getCachedPreview(
  db: D1Database,
  gameId: string
): Promise<GamePreview | null> {
  await ensureCoachGPreviewSchema(db);
  const cached = await db.prepare(`
    SELECT * FROM coach_g_previews 
    WHERE game_id = ? AND expires_at > datetime('now') AND is_stale = 0
  `).bind(gameId).first();

  if (!cached) return null;

  try {
    const content = JSON.parse(cached.preview_content as string) as PreviewContent;
    const sources = JSON.parse(cached.sources_used as string || "[]") as SourceInfo[];

    return {
      gameId: cached.game_id as string,
      sport: cached.sport as string,
      homeTeam: cached.home_team as string,
      awayTeam: cached.away_team as string,
      gameStartAt: cached.game_start_at as string,
      preview: content,
      sources,
      generatedAt: cached.created_at as string,
      expiresAt: cached.expires_at as string,
      wordCount: cached.word_count as number,
      cached: true,
    };
  } catch {
    return null;
  }
}

async function cachePreview(
  db: D1Database,
  preview: GamePreview,
  scrapedData: ScrapedContent[],
  costCents: number
): Promise<void> {
  await ensureCoachGPreviewSchema(db);
  const now = new Date().toISOString();
  
  await db.prepare(`
    INSERT INTO coach_g_previews 
    (game_id, sport, home_team, away_team, game_start_at, preview_content, sources_used, scraped_data, word_count, generation_cost_cents, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET
      preview_content = excluded.preview_content,
      sources_used = excluded.sources_used,
      scraped_data = excluded.scraped_data,
      word_count = excluded.word_count,
      generation_cost_cents = excluded.generation_cost_cents,
      expires_at = excluded.expires_at,
      is_stale = 0,
      updated_at = excluded.updated_at
  `).bind(
    preview.gameId,
    preview.sport,
    preview.homeTeam,
    preview.awayTeam,
    preview.gameStartAt,
    JSON.stringify(preview.preview),
    JSON.stringify(preview.sources),
    JSON.stringify(scrapedData),
    preview.wordCount,
    costCents,
    preview.expiresAt,
    now,
    now
  ).run();
}

// ============ Main Service Function ============

export async function generateGamePreview(
  db: D1Database,
  env: { FIRECRAWL_API_KEY?: string; OPENAI_API_KEY?: string; SPORTSRADAR_API_KEY?: string; SPORTSRADAR_ODDS_KEY?: string },
  gameId: string,
  forceRefresh: boolean = false
): Promise<GamePreview> {
  await ensureCoachGPreviewSchema(db);
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = await getCachedPreview(db, gameId);
    if (cached) {
      console.log(`[CoachGPreview] Cache hit for game ${gameId}`);
      return cached;
    }
  }

  console.log(`[CoachGPreview] Generating preview for game ${gameId}`);

  // Provider-first resolution: do not block preview generation on legacy SDIO rows.
  let gameData: GameData | null = null;
  const providerResolved = await fetchGameWithFallback(gameId).catch(() => null);
  if (providerResolved?.data?.game) {
    gameData = mapProviderGameToPreviewGame(providerResolved.data.game);
  }

  // Guarded legacy fallback for environments where provider game resolution is unavailable.
  if (!gameData) {
    let dbGameId = gameId;
    let providerGameId: string | null = null;
    if (gameId.startsWith("sdio_")) {
      const parts = gameId.split("_");
      if (parts.length >= 3) providerGameId = parts.slice(2).join("_");
    }
    try {
      const game = providerGameId
        ? await db.prepare(`
            SELECT g.*,
                   o.spread_home as spread,
                   o.total,
                   o.moneyline_home as homeML,
                   o.moneyline_away as awayML
            FROM sdio_games g
            LEFT JOIN sdio_odds_current o ON g.id = o.game_id
            WHERE g.provider_game_id = ?
            LIMIT 1
          `).bind(providerGameId).first()
        : await db.prepare(`
            SELECT g.*,
                   o.spread_home as spread,
                   o.total,
                   o.moneyline_home as homeML,
                   o.moneyline_away as awayML
            FROM sdio_games g
            LEFT JOIN sdio_odds_current o ON g.id = o.game_id
            WHERE CAST(g.id AS TEXT) = ? OR g.provider_game_id = ?
            LIMIT 1
          `).bind(dbGameId, dbGameId).first();
      if (game) {
        gameData = {
          id: String((game as any).id || gameId),
          sport: String((game as any).sport || "unknown"),
          homeTeam: String((game as any).home_team_name || (game as any).home_team || "HOME"),
          awayTeam: String((game as any).away_team_name || (game as any).away_team || "AWAY"),
          startAt: String((game as any).start_time || new Date().toISOString()),
          venue: (game as any).venue ? String((game as any).venue) : undefined,
          broadcast: (game as any).channel ? String((game as any).channel) : undefined,
          status: String((game as any).status || "SCHEDULED"),
          odds: {
            spread: typeof (game as any).spread === "number" ? (game as any).spread : undefined,
            total: typeof (game as any).total === "number" ? (game as any).total : undefined,
            homeML: typeof (game as any).homeML === "number" ? (game as any).homeML : undefined,
            awayML: typeof (game as any).awayML === "number" ? (game as any).awayML : undefined,
          },
        };
      }
    } catch {
      // Optional legacy table fallback; provider resolution remains primary path.
    }
  }

  if (!gameData) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const oddsContext = await hydrateGameOdds(
    db,
    gameId,
    gameData,
    env.SPORTSRADAR_API_KEY,
    env.SPORTSRADAR_ODDS_KEY
  );

  // Initialize scraping
  const scrapedContent: ScrapedContent[] = [];
  const sources: SourceInfo[] = [];

  if (env.FIRECRAWL_API_KEY) {
    const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });

    // Scrape multiple sources in parallel
    const [espn, cbs, action, general] = await Promise.all([
      scrapeESPN(firecrawl, gameData.homeTeam, gameData.awayTeam, gameData.sport),
      scrapeCBSSports(firecrawl, gameData.homeTeam, gameData.awayTeam, gameData.sport),
      scrapeActionNetwork(firecrawl, gameData.homeTeam, gameData.awayTeam, gameData.sport),
      scrapeGeneral(firecrawl, gameData.homeTeam, gameData.awayTeam, gameData.sport),
    ]);

    if (espn) {
      scrapedContent.push(espn);
      sources.push({ name: "ESPN", url: espn.url, scrapedAt: espn.scrapedAt, contentLength: espn.content.length });
    }
    if (cbs) {
      scrapedContent.push(cbs);
      sources.push({ name: "CBS Sports", url: cbs.url, scrapedAt: cbs.scrapedAt, contentLength: cbs.content.length });
    }
    if (action) {
      scrapedContent.push(action);
      sources.push({ name: "Action Network", url: action.url, scrapedAt: action.scrapedAt, contentLength: action.content.length });
    }
    if (general) {
      scrapedContent.push(general);
      sources.push({ name: "Web Search", url: general.url, scrapedAt: general.scrapedAt, contentLength: general.content.length });
    }

    const filteredScraped = filterScrapedContentByRecency(scrapedContent, gameData);
    if (filteredScraped.length !== scrapedContent.length) {
      const dropped = scrapedContent.length - filteredScraped.length;
      console.log(`[CoachGPreview] Dropped ${dropped} stale/low-relevance scraped sources for ${gameId}`);
      scrapedContent.splice(0, scrapedContent.length, ...filteredScraped);
    }
    const allowedSources = new Set(scrapedContent.map((s) => `${s.source}|${s.url}`));
    const filteredSources = sources.filter((s) => allowedSources.has(`${s.name}|${s.url}`));
    sources.splice(0, sources.length, ...filteredSources);

    console.log(`[CoachGPreview] Scraped ${scrapedContent.length} sources for ${gameId}`);
  } else {
    console.warn("[CoachGPreview] No FIRECRAWL_API_KEY - skipping web scraping");
  }

  // Build internal data context using numeric database ID
  const internalData = await buildInternalDataContext(db, gameData.id, gameData, buildOddsContextText(gameData, oddsContext));
  const namingGuard = await buildPlayerNamingGuard(env.SPORTSRADAR_API_KEY, gameId, gameData);

  // Generate preview with OpenAI
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const rawPreviewContent = await generatePreviewWithAI(openai, gameData, scrapedContent, internalData, namingGuard);
  const guardedResult = applyGenerationGuards(rawPreviewContent, gameData, namingGuard);
  if (guardedResult.flags.length > 0) {
    console.log(`[CoachGPreview] Applied generation guards for ${gameId}: ${guardedResult.flags.join(", ")}`);
  }
  const previewContent = guardedResult.preview;

  // Keep previews fresh so roster/injury changes are reflected quickly.
  // Expiry is capped at 45 minutes or 2 hours before game time, whichever is sooner.
  const gameTime = new Date(gameData.startAt);
  const twoHoursBeforeGame = new Date(gameTime.getTime() - 2 * 60 * 60 * 1000);
  const fortyFiveMinutesFromNow = new Date(Date.now() + 45 * 60 * 1000);
  const expiresAt = twoHoursBeforeGame < fortyFiveMinutesFromNow ? twoHoursBeforeGame : fortyFiveMinutesFromNow;

  const wordCount = previewContent.fullText.split(/\s+/).length;

  const preview: GamePreview = {
    gameId,
    sport: gameData.sport,
    homeTeam: gameData.homeTeam,
    awayTeam: gameData.awayTeam,
    gameStartAt: gameData.startAt,
    preview: previewContent,
    sources,
    generatedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    wordCount,
    cached: false,
  };

  // Estimate cost: ~$0.02 for GPT-4o (2K tokens in, 1.5K out)
  // Plus Firecrawl: ~$0.01-0.02 per search
  const estimatedCostCents = 5; // Conservative estimate

  // Cache the preview
  await cachePreview(db, preview, scrapedContent, estimatedCostCents);

  console.log(`[CoachGPreview] Generated ${wordCount} word preview for ${gameId}`);

  return preview;
}

// ============ Internal Data Builder ============

async function buildInternalDataContext(
  db: D1Database,
  gameId: string,
  game: GameData,
  oddsContextText?: string
): Promise<string> {
  const lines: string[] = [];

  if (oddsContextText) {
    lines.push("Authoritative Odds Snapshot:");
    lines.push(oddsContextText);
  }

  // Recent head-to-head
  try {
    const { results: h2h } = await db.prepare(`
      SELECT
        COALESCE(home_team_name, home_team) AS home_team,
        COALESCE(away_team_name, away_team) AS away_team,
        score_home,
        score_away,
        start_time
      FROM sdio_games
      WHERE (
        (COALESCE(home_team_name, home_team) = ? AND COALESCE(away_team_name, away_team) = ?)
        OR
        (COALESCE(home_team_name, home_team) = ? AND COALESCE(away_team_name, away_team) = ?)
      )
        AND UPPER(COALESCE(status, '')) IN ('FINAL', 'CLOSED', 'COMPLETE')
        AND start_time < ?
      ORDER BY start_time DESC
      LIMIT 5
    `).bind(
      game.homeTeam, game.awayTeam,
      game.awayTeam, game.homeTeam,
      game.startAt
    ).all();

    if (h2h.length > 0) {
      lines.push("Recent Head-to-Head:");
      for (const g of h2h) {
        lines.push(`  ${g.away_team} ${g.score_away} @ ${g.home_team} ${g.score_home} (${new Date(g.start_time as string).toLocaleDateString()})`);
      }
    }
  } catch {
    // Non-blocking context enrichment.
  }

  // Team recent form (last 5 games each)
  for (const team of [game.homeTeam, game.awayTeam]) {
    try {
      const { results: recent } = await db.prepare(`
        SELECT
          COALESCE(home_team_name, home_team) AS home_team,
          COALESCE(away_team_name, away_team) AS away_team,
          score_home,
          score_away
        FROM sdio_games
        WHERE (COALESCE(home_team_name, home_team) = ? OR COALESCE(away_team_name, away_team) = ?)
          AND UPPER(COALESCE(status, '')) IN ('FINAL', 'CLOSED', 'COMPLETE')
          AND start_time < ?
        ORDER BY start_time DESC
        LIMIT 5
      `).bind(team, team, game.startAt).all();

      if (recent.length > 0) {
        let wins = 0, losses = 0;
        for (const g of recent) {
          const isHome = g.home_team === team;
          const teamScore = isHome ? g.score_home : g.score_away;
          const oppScore = isHome ? g.score_away : g.score_home;
          if ((teamScore as number) > (oppScore as number)) wins++;
          else losses++;
        }
        lines.push(`${team} Last 5: ${wins}-${losses}`);
      }
    } catch {
      // Non-blocking context enrichment.
    }
  }

  // Line movement history
  try {
    const { results: lineHistory } = await db.prepare(`
      SELECT spread_home, total, recorded_at
      FROM sdio_odds_history
      WHERE game_id = ?
      ORDER BY recorded_at ASC
      LIMIT 10
    `).bind(gameId).all();

    if (lineHistory.length > 1) {
      const opening = lineHistory[0];
      const current = lineHistory[lineHistory.length - 1];
      const spreadMove = ((current.spread_home as number) || 0) - ((opening.spread_home as number) || 0);
      const totalMove = ((current.total as number) || 0) - ((opening.total as number) || 0);
      
      if (spreadMove !== 0 || totalMove !== 0) {
        lines.push("Line Movement:");
        if (spreadMove !== 0) lines.push(`  Spread: ${spreadMove > 0 ? '+' : ''}${spreadMove.toFixed(1)} from open`);
        if (totalMove !== 0) lines.push(`  Total: ${totalMove > 0 ? '+' : ''}${totalMove.toFixed(1)} from open`);
      }
    }
  } catch {
    // Non-blocking context enrichment.
  }

  return lines.join("\n") || "Limited internal data available for this matchup.";
}

// ============ Utility: Mark Preview Stale ============

export async function markPreviewStale(db: D1Database, gameId: string): Promise<void> {
  await ensureCoachGPreviewSchema(db);
  await db.prepare(`
    UPDATE coach_g_previews SET is_stale = 1, updated_at = datetime('now')
    WHERE game_id = ?
  `).bind(gameId).run();
}

// ============ Utility: Cleanup Expired Previews ============

export async function cleanupExpiredPreviews(db: D1Database): Promise<number> {
  await ensureCoachGPreviewSchema(db);
  const result = await db.prepare(`
    DELETE FROM coach_g_previews WHERE expires_at < datetime('now', '-1 day')
  `).run();
  
  return result.meta.changes || 0;
}
