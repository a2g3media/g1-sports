/**
 * Soccer League Metadata - Single Source of Truth
 * 
 * Uses slug keys that match backend SOCCER_COMPETITIONS.
 * These keys are used in API routes: /api/soccer/standings/{key}
 */

export interface SoccerLeagueMeta {
  name: string;
  country: string;
  short: string;
  seasonLabel: string;
  accentColor: string;
  sportsRadarId: string; // For reference, but key is the primary identifier
}

const LEAGUE_META_MAP: Record<string, SoccerLeagueMeta> = {
  // Top 5 European Leagues (matching backend SOCCER_COMPETITIONS keys)
  "premier-league": {
    name: "Premier League",
    country: "England",
    short: "EPL",
    seasonLabel: "2025–26",
    accentColor: "#10b981",
    sportsRadarId: "sr:competition:17",
  },
  
  "la-liga": {
    name: "La Liga",
    country: "Spain",
    short: "LALIGA",
    seasonLabel: "2025–26",
    accentColor: "#10b981",
    sportsRadarId: "sr:competition:8",
  },
  
  "serie-a": {
    name: "Serie A",
    country: "Italy",
    short: "SERIEA",
    seasonLabel: "2025–26",
    accentColor: "#10b981",
    sportsRadarId: "sr:competition:23",
  },
  
  "bundesliga": {
    name: "Bundesliga",
    country: "Germany",
    short: "BUNDESLIGA",
    seasonLabel: "2025–26",
    accentColor: "#10b981",
    sportsRadarId: "sr:competition:35",
  },
  
  "ligue-1": {
    name: "Ligue 1",
    country: "France",
    short: "LIGUE1",
    seasonLabel: "2025–26",
    accentColor: "#10b981",
    sportsRadarId: "sr:competition:34",
  },
  
  // UEFA Club Competitions
  "champions-league": {
    name: "UEFA Champions League",
    country: "Europe",
    short: "UCL",
    seasonLabel: "2025–26",
    accentColor: "#06b6d4",
    sportsRadarId: "sr:competition:7",
  },
  
  "europa-league": {
    name: "UEFA Europa League",
    country: "Europe",
    short: "UEL",
    seasonLabel: "2025–26",
    accentColor: "#f97316",
    sportsRadarId: "sr:competition:679",
  },
  
  // Americas
  "mls": {
    name: "MLS",
    country: "USA",
    short: "MLS",
    seasonLabel: "2026",
    accentColor: "#10b981",
    sportsRadarId: "sr:competition:242",
  },
  
  "liga-mx": {
    name: "Liga MX",
    country: "Mexico",
    short: "LIGAMX",
    seasonLabel: "2025–26",
    accentColor: "#10b981",
    sportsRadarId: "sr:competition:352",
  },
};

const FALLBACK_META: SoccerLeagueMeta = {
  name: "Soccer League",
  country: "",
  short: "SOCCER",
  seasonLabel: "2025–26",
  accentColor: "#10b981",
  sportsRadarId: "",
};

/**
 * Get league metadata by competition key (slug format like "premier-league")
 */
export function getSoccerLeagueMeta(leagueKey: string | null | undefined): SoccerLeagueMeta {
  if (!leagueKey) return FALLBACK_META;
  return LEAGUE_META_MAP[leagueKey] || FALLBACK_META;
}

/**
 * Get all configured leagues (for directory page)
 * Returns array of { key, meta } where key is the slug used in URLs
 */
export function getAllSoccerLeagues(): Array<{ key: string; meta: SoccerLeagueMeta }> {
  return Object.entries(LEAGUE_META_MAP).map(([key, meta]) => ({ key, meta }));
}
