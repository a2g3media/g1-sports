/**
 * useLiveGames Hook
 * Fetches live games from Sports Data Engine and transforms for Dashboard display
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Sport emoji mappings
const SPORT_EMOJIS: Record<string, string> = {
  NFL: '🏈',
  NCAAF: '🏈',
  NBA: '🏀',
  NCAAB: '🏀',
  MLB: '⚾',
  NHL: '🏒',
  SOCCER: '⚽',
  MMA: '🥊',
  GOLF: '⛳',
  TENNIS: '🎾',
};

// Team abbreviation mappings for common teams
const TEAM_ABBREVIATIONS: Record<string, string> = {
  // NFL
  'Kansas City Chiefs': 'KC', 'Buffalo Bills': 'BUF', 'Philadelphia Eagles': 'PHI',
  'San Francisco 49ers': 'SF', 'Dallas Cowboys': 'DAL', 'Miami Dolphins': 'MIA',
  'Baltimore Ravens': 'BAL', 'Detroit Lions': 'DET', 'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE', 'New York Giants': 'NYG', 'New York Jets': 'NYJ',
  'Los Angeles Rams': 'LAR', 'Los Angeles Chargers': 'LAC', 'Denver Broncos': 'DEN',
  'Seattle Seahawks': 'SEA', 'Green Bay Packers': 'GB', 'Minnesota Vikings': 'MIN',
  'Chicago Bears': 'CHI', 'New England Patriots': 'NE', 'Atlanta Falcons': 'ATL',
  'Tampa Bay Buccaneers': 'TB', 'New Orleans Saints': 'NO', 'Carolina Panthers': 'CAR',
  'Las Vegas Raiders': 'LV', 'Arizona Cardinals': 'ARI', 'Pittsburgh Steelers': 'PIT',
  'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX', 'Tennessee Titans': 'TEN',
  'Houston Texans': 'HOU', 'Washington Commanders': 'WAS',
  // NBA
  'Los Angeles Lakers': 'LAL', 'Boston Celtics': 'BOS', 'Golden State Warriors': 'GSW',
  'Milwaukee Bucks': 'MIL', 'Phoenix Suns': 'PHX', 'Denver Nuggets': 'DEN',
  'Memphis Grizzlies': 'MEM', 'Sacramento Kings': 'SAC', 'Brooklyn Nets': 'BKN',
  'New York Knicks': 'NYK', 'Philadelphia 76ers': 'PHI', 'Miami Heat': 'MIA',
  'Cleveland Cavaliers': 'CLE', 'Atlanta Hawks': 'ATL', 'Chicago Bulls': 'CHI',
  'Toronto Raptors': 'TOR', 'Dallas Mavericks': 'DAL', 'Houston Rockets': 'HOU',
  'Oklahoma City Thunder': 'OKC', 'Minnesota Timberwolves': 'MIN', 'Portland Trail Blazers': 'POR',
  'Utah Jazz': 'UTA', 'San Antonio Spurs': 'SAS', 'New Orleans Pelicans': 'NOP',
  'Los Angeles Clippers': 'LAC', 'Indiana Pacers': 'IND', 'Detroit Pistons': 'DET',
  'Charlotte Hornets': 'CHA', 'Orlando Magic': 'ORL', 'Washington Wizards': 'WAS',
  // MLB
  'New York Yankees': 'NYY', 'Los Angeles Dodgers': 'LAD', 'Boston Red Sox': 'BOS',
  'Atlanta Braves': 'ATL', 'Houston Astros': 'HOU', 'San Francisco Giants': 'SF',
  'Chicago Cubs': 'CHC', 'St. Louis Cardinals': 'STL', 'Philadelphia Phillies': 'PHI',
  'San Diego Padres': 'SD', 'Toronto Blue Jays': 'TOR', 'Seattle Mariners': 'SEA',
  'New York Mets': 'NYM', 'Texas Rangers': 'TEX', 'Baltimore Orioles': 'BAL',
  'Minnesota Twins': 'MIN', 'Tampa Bay Rays': 'TB', 'Cleveland Guardians': 'CLE',
  'Milwaukee Brewers': 'MIL', 'Arizona Diamondbacks': 'ARI', 'Cincinnati Reds': 'CIN',
  'Chicago White Sox': 'CWS', 'Detroit Tigers': 'DET', 'Los Angeles Angels': 'LAA',
  'Kansas City Royals': 'KC', 'Pittsburgh Pirates': 'PIT', 'Miami Marlins': 'MIA',
  'Oakland Athletics': 'OAK', 'Colorado Rockies': 'COL', 'Washington Nationals': 'WSH',
  // NHL
  'New York Rangers': 'NYR', 'Boston Bruins': 'BOS', 'Tampa Bay Lightning': 'TBL',
  'Colorado Avalanche': 'COL', 'Edmonton Oilers': 'EDM', 'Toronto Maple Leafs': 'TOR',
  'Vegas Golden Knights': 'VGK', 'Dallas Stars': 'DAL', 'Carolina Hurricanes': 'CAR',
  'Florida Panthers': 'FLA', 'New Jersey Devils': 'NJD', 'New York Islanders': 'NYI',
  'Pittsburgh Penguins': 'PIT', 'Detroit Red Wings': 'DET', 'Washington Capitals': 'WSH',
  'Minnesota Wild': 'MIN', 'Winnipeg Jets': 'WPG', 'Los Angeles Kings': 'LAK',
  'Seattle Kraken': 'SEA', 'Nashville Predators': 'NSH', 'Calgary Flames': 'CGY',
  'Vancouver Canucks': 'VAN', 'Ottawa Senators': 'OTT', 'Montreal Canadiens': 'MTL',
  'St. Louis Blues': 'STL', 'Philadelphia Flyers': 'PHI', 'Chicago Blackhawks': 'CHI',
  'Anaheim Ducks': 'ANA', 'Arizona Coyotes': 'ARI', 'Buffalo Sabres': 'BUF',
  'Columbus Blue Jackets': 'CBJ', 'San Jose Sharks': 'SJS',
};

function getTeamAbbreviation(teamName: string | null | undefined): string {
  if (!teamName) return 'TBD';
  // Check direct mapping
  if (TEAM_ABBREVIATIONS[teamName]) {
    return TEAM_ABBREVIATIONS[teamName];
  }
  // If team name is already short (3-4 chars), use it
  if (teamName.length <= 4) {
    return teamName.toUpperCase();
  }
  // Take first 3 letters as fallback
  return teamName.substring(0, 3).toUpperCase();
}

function getTeamShortName(teamName: string | null | undefined): string {
  // Get just the team nickname (last word usually)
  if (!teamName) return 'TBD';
  const parts = teamName.split(' ');
  return parts[parts.length - 1];
}

export interface LiveGame {
  id: string;
  league?: string | null;
  homeTeam: {
    name: string;
    abbreviation: string;
    score: number;
    logo: string;
  };
  awayTeam: {
    name: string;
    abbreviation: string;
    score: number;
    logo: string;
  };
  period: string;
  clock: string;
  sport: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL';
  momentum: 'home' | 'away' | null;
  hasCoachInsight: boolean;
  rankImpact: { outcome: string; newRank: number } | null;
  community: { homePercent: number; awayPercent: number };
  // TV broadcast channel
  channel?: string | null;
  // Start time for scheduled games
  startTime?: string;
  // Overtime indicator for FINAL games
  isOvertime?: boolean;
  // Odds data
  odds?: {
    spreadHome: number | null;
    total: number | null;
    moneylineHome: number | null;
    moneylineAway: number | null;
    movementSpread: number | null;
    movementTotal: number | null;
  };
  normalizedOdds?: {
    spread: number | null;
    total: number | null;
    homeML: number | null;
    awayML: number | null;
  } | null;
}

interface DbGame {
  game_id: string;
  sport: string;
  league: string;
  home_team_code: string;
  away_team_code: string;
  home_team_name: string;
  away_team_name: string;
  start_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  period_label: string | null;
  clock: string | null;
  broadcast?: string | null;
  is_overtime?: boolean;
  // Odds fields
  spread?: number | null;
  spreadAway?: number | null;
  overUnder?: number | null;
  moneylineHome?: number | null;
  moneylineAway?: number | null;
}

export function useLiveGames(refreshInterval = 30000) {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGames = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      // Fetch BOTH live and upcoming games in parallel
      const [liveRes, upcomingRes] = await Promise.all([
        fetch('/api/games?status=LIVE&limit=50'),
        fetch('/api/games?status=SCHEDULED&limit=50'),
      ]);
      
      if (!liveRes.ok || !upcomingRes.ok) {
        throw new Error('Failed to fetch games');
      }
      
      const liveData = await liveRes.json();
      const upcomingData = await upcomingRes.json();
      
      const liveGames: DbGame[] = liveData.games || [];
      const upcomingGames: DbGame[] = upcomingData.games || [];

      // Transform all games
      const transformedLive = liveGames.map((game) => transformGame(game));
      const transformedUpcoming = upcomingGames.map((game) => transformGame(game));
      
      // Sort upcoming by start time (earliest first)
      transformedUpcoming.sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
        return timeA - timeB;
      });
      
      // Combine: live games first, then fill with upcoming to ensure at least 3
      const MIN_GAMES_TO_SHOW = 3;
      let combined: LiveGame[] = [...transformedLive];
      
      // Fill remaining slots with upcoming games
      const upcomingNeeded = Math.max(0, MIN_GAMES_TO_SHOW - combined.length);
      if (upcomingNeeded > 0 || combined.length === 0) {
        // Always add some upcoming if no live, or fill to minimum
        const upcomingToAdd = combined.length === 0 
          ? transformedUpcoming.slice(0, MIN_GAMES_TO_SHOW)
          : transformedUpcoming.slice(0, upcomingNeeded);
        combined = [...combined, ...upcomingToAdd];
      }
      
      // Apply smart carousel sorting (respects live vs upcoming naturally)
      const sorted = sortGamesForCarousel(combined);

      setGames(sorted);
      setError(null);
      setLastFetchAt(new Date());
    } catch (err) {
      console.error('[useLiveGames] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch games');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  
  // Manual refresh function
  const refresh = useCallback(() => fetchGames(true), [fetchGames]);

  // Transform DB game to LiveGame format (synchronous - no additional API calls)
  function transformGame(game: DbGame): LiveGame {
    const homeScore = game.home_score ?? 0;
    const awayScore = game.away_score ?? 0;
    const rawSport = game.sport?.toUpperCase() || 'NFL';
    const sportKey =
      rawSport === 'CBB' || rawSport === 'NCAAM' ? 'NCAAB'
      : rawSport === 'CFB' || rawSport === 'NCAAFB' ? 'NCAAF'
      : rawSport === 'ICEHOCKEY' || rawSport === 'HOCKEY' ? 'NHL'
      : rawSport;
    const isScheduled = game.status === 'SCHEDULED';
    
    // Determine momentum based on recent scoring
    let momentum: 'home' | 'away' | null = null;
    if (game.status === 'IN_PROGRESS' || game.status === 'LIVE') {
      if (homeScore > awayScore) momentum = 'home';
      else if (awayScore > homeScore) momentum = 'away';
    }

    // Random community percentages (would come from real data in production)
    const homePercent = 45 + Math.floor(Math.random() * 20);
    const awayPercent = 100 - homePercent;

    return {
      id: game.game_id,
      league: game.league || null,
      homeTeam: {
        name: getTeamShortName(game.home_team_name),
        abbreviation: game.home_team_code || getTeamAbbreviation(game.home_team_name),
        score: homeScore,
        logo: SPORT_EMOJIS[sportKey] || '🏆',
      },
      awayTeam: {
        name: getTeamShortName(game.away_team_name),
        abbreviation: game.away_team_code || getTeamAbbreviation(game.away_team_name),
        score: awayScore,
        logo: SPORT_EMOJIS[sportKey] || '🏆',
      },
      period: game.period_label || (isScheduled ? '' : ''),
      clock: game.clock || (isScheduled ? formatStartTime(game.start_time) : ''),
      sport: sportKey,
      status: game.status === 'LIVE' ? 'IN_PROGRESS' : game.status as 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL',
      momentum,
      hasCoachInsight: Math.random() > 0.5, // Would come from AI analysis
      rankImpact: null, // Would be calculated based on user's picks
      community: { homePercent, awayPercent },
      channel: game.broadcast || null,
      startTime: isScheduled ? game.start_time : undefined,
      isOvertime: game.is_overtime || false,
      // Include odds from API response
      odds: (game.spread !== undefined || game.moneylineHome !== undefined) ? {
        spreadHome: game.spread ?? null,
        total: game.overUnder ?? null,
        moneylineHome: game.moneylineHome ?? null,
        moneylineAway: game.moneylineAway ?? null,
        movementSpread: null,
        movementTotal: null,
      } : undefined,
    };
  }

  // Initial fetch
  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Refresh interval with exponential backoff
  const errorCountRef = useRef(0);
  
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    const MAX_BACKOFF = 240000; // 4 minutes max
    
    const pollWithBackoff = async () => {
      if (!mounted) return;
      
      try {
        await fetchGames();
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, errorCountRef.current);
        const nextInterval = Math.min(refreshInterval * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    timeoutId = setTimeout(pollWithBackoff, refreshInterval);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [refreshInterval, fetchGames]);

  return { games, loading, error, refetch: fetchGames, refresh, lastFetchAt, refreshing };
}

function formatStartTime(startTime: string): string {
  try {
    const date = new Date(startTime);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  } catch {
    return '';
  }
}

// ============================================
// SMART CAROUSEL SORTING (Option D - Hybrid)
// ============================================

// National TV networks - games on these get priority
const NATIONAL_TV_NETWORKS = [
  'ABC', 'ESPN', 'ESPN2', 'FOX', 'NBC', 'CBS', 'TNT', 'TBS', 
  'NFL Network', 'NBA TV', 'MLB Network', 'NHL Network',
  'FS1', 'NBCSN', 'USA', 'PEACOCK'
];

// Sport priority order
const SPORT_PRIORITY: Record<string, number> = {
  'NBA': 1,
  'NFL': 2,
  'NCAAB': 3,
  'NHL': 4,
  'MLB': 5,
  'NCAAF': 6,
  'SOCCER': 7,
  'MMA': 8,
  'GOLF': 9,
  'TENNIS': 10,
};

function isNationallyTelevised(game: LiveGame): boolean {
  if (!game.channel) return false;
  const channel = game.channel.toUpperCase();
  return NATIONAL_TV_NETWORKS.some(network => 
    channel.includes(network.toUpperCase())
  );
}

export function getSportPriority(sport: string): number {
  return SPORT_PRIORITY[sport?.toUpperCase()] || 99;
}

/**
 * Smart sort: Nationally televised first, then sport priority, then one per sport
 * Returns sorted games optimized for carousel display
 */
export function sortGamesForCarousel(games: LiveGame[]): LiveGame[] {
  if (games.length === 0) return [];
  
  // Step 1: Separate nationally televised games
  const nationalGames = games.filter(g => isNationallyTelevised(g));
  const otherGames = games.filter(g => !isNationallyTelevised(g));
  
  // Step 2: Sort national games by sport priority
  nationalGames.sort((a, b) => 
    getSportPriority(a.sport) - getSportPriority(b.sport)
  );
  
  // Step 3: Sort other games by sport priority
  otherGames.sort((a, b) => 
    getSportPriority(a.sport) - getSportPriority(b.sport)
  );
  
  // Step 4: Build final list ensuring sport diversity
  const result: LiveGame[] = [];
  const sportsIncluded = new Set<string>();
  
  // Add all national TV games first
  for (const game of nationalGames) {
    result.push(game);
    sportsIncluded.add(game.sport.toUpperCase());
  }
  
  // Add one game per sport from remaining games (if sport not already included)
  for (const game of otherGames) {
    const sport = game.sport.toUpperCase();
    if (!sportsIncluded.has(sport)) {
      result.push(game);
      sportsIncluded.add(sport);
    }
  }
  
  // Fill remaining slots with other games (up to reasonable limit)
  const maxGames = 12;
  for (const game of otherGames) {
    if (result.length >= maxGames) break;
    if (!result.includes(game)) {
      result.push(game);
    }
  }

  // Rebalance the top cards so one sport doesn't dominate the first visible slots
  // when multiple sports are available.
  const uniqueSports = new Set(result.map(g => g.sport.toUpperCase()));
  if (uniqueSports.size <= 1) return result;

  const topWindow = Math.min(6, result.length);
  const maxPerSportInTopWindow = 2;
  const topRebalanced: LiveGame[] = [];
  const pool = [...result];
  const topSportCounts = new Map<string, number>();

  while (topRebalanced.length < topWindow && pool.length > 0) {
    let selectedIndex = -1;
    for (let i = 0; i < pool.length; i++) {
      const sport = pool[i].sport.toUpperCase();
      const count = topSportCounts.get(sport) || 0;
      if (count < maxPerSportInTopWindow) {
        selectedIndex = i;
        break;
      }
    }

    if (selectedIndex === -1) selectedIndex = 0;
    const [selected] = pool.splice(selectedIndex, 1);
    const selectedSport = selected.sport.toUpperCase();
    topSportCounts.set(selectedSport, (topSportCounts.get(selectedSport) || 0) + 1);
    topRebalanced.push(selected);
  }

  return [...topRebalanced, ...pool];
}

/**
 * Extended interface for LiveMode page
 * Provides pause/resume, odds mapping, and shared/types Game format
 */
import type { Game } from "@/shared/types";

interface UseLiveGamesFullOptions {
  enabled?: boolean;
  fetchOnMount?: boolean;
  includeOdds?: boolean;
  oddsScope?: string;
}

export function useLiveGamesFull(_options?: UseLiveGamesFullOptions) {
  const [games, setGames] = useState<Game[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const fetchGamesFull = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Fetch all games (live + scheduled)
      const [liveRes, scheduledRes] = await Promise.all([
        fetch('/api/games?status=LIVE&limit=50'),
        fetch('/api/games?status=SCHEDULED&limit=50'),
      ]);
      
      const liveData = liveRes.ok ? await liveRes.json() : { games: [] };
      const scheduledData = scheduledRes.ok ? await scheduledRes.json() : { games: [] };
      
      const allDbGames: DbGame[] = [...(liveData.games || []), ...(scheduledData.games || [])];
      
      // If no real games, use demo data
      if (allDbGames.length === 0) {
        setGames(DEMO_GAMES_FULL);
        setLastUpdatedAt(new Date());
        return;
      }
      
      // Transform to Game format
      const transformed: Game[] = allDbGames.map((g) => ({
        game_id: g.game_id,
        sport: g.sport?.toLowerCase() || 'nfl',
        league: g.league || g.sport?.toUpperCase() || 'NFL',
        away_team_code: g.away_team_code || getTeamAbbreviation(g.away_team_name),
        home_team_code: g.home_team_code || getTeamAbbreviation(g.home_team_name),
        away_team_name: g.away_team_name,
        home_team_name: g.home_team_name,
        away_score: g.away_score ?? 0,
        home_score: g.home_score ?? 0,
        start_time: g.start_time,
        last_updated_at: new Date().toISOString(),
        status: g.status === 'LIVE' ? 'IN_PROGRESS' : g.status as Game['status'],
        period: g.period_label ? parseInt(g.period_label) || undefined : undefined,
        period_label: g.period_label || undefined,
        clock: g.clock || undefined,
      }));
      
      setGames(transformed);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error('[useLiveGamesFull] Error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGamesFull();
  }, [fetchGamesFull]);

  // Polling with exponential backoff
  const fullErrorCountRef = useRef(0);
  
  useEffect(() => {
    if (isPaused) return;
    
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    const BASE_INTERVAL = 30000;
    const MAX_BACKOFF = 240000; // 4 minutes max
    
    const pollWithBackoff = async () => {
      if (!mounted) return;
      
      try {
        await fetchGamesFull();
        fullErrorCountRef.current = 0;
      } catch {
        fullErrorCountRef.current = Math.min(fullErrorCountRef.current + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, fullErrorCountRef.current);
        const nextInterval = Math.min(BASE_INTERVAL * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    timeoutId = setTimeout(pollWithBackoff, BASE_INTERVAL);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [fetchGamesFull, isPaused]);

  const liveGames = useMemo(() => 
    games.filter(g => g.status === 'IN_PROGRESS'), [games]
  );

  const oddsByGame = useMemo(() => {
    // Demo odds data as Map for LiveMode compatibility
    const map = new Map<string, { spread?: { home_line?: number; away_line?: number }; total?: { line?: number }; moneyline?: { home_price?: number; away_price?: number } }>();
    games.forEach(g => {
      map.set(g.game_id, {
        spread: { home_line: -3.5 + Math.random() * 7, away_line: 3.5 + Math.random() * 7 },
        total: { line: 42 + Math.random() * 10 },
        moneyline: { home_price: -150, away_price: 130 },
      });
    });
    return map;
  }, [games]);

  return {
    games,
    liveGames,
    hasLiveGames: liveGames.length > 0,
    oddsByGame,
    isRefreshing,
    lastUpdatedAt,
    refresh: fetchGamesFull,
    pause: () => setIsPaused(true),
    resume: () => setIsPaused(false),
    isPaused,
  };
}

// Demo games in Game format for LiveMode fallback
const DEMO_GAMES_FULL: Game[] = [
  {
    game_id: "demo_nfl_1",
    sport: "nfl",
    league: "NFL",
    away_team_code: "BUF",
    home_team_code: "KC",
    away_team_name: "Buffalo Bills",
    home_team_name: "Kansas City Chiefs",
    away_score: 21,
    home_score: 24,
    start_time: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
    status: "IN_PROGRESS",
    period: 4,
    period_label: "4th",
    clock: "4:32",
  },
  {
    game_id: "demo_nba_1",
    sport: "nba",
    league: "NBA",
    away_team_code: "BOS",
    home_team_code: "LAL",
    away_team_name: "Boston Celtics",
    home_team_name: "Los Angeles Lakers",
    away_score: 102,
    home_score: 98,
    start_time: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
    status: "IN_PROGRESS",
    period: 3,
    period_label: "3rd",
    clock: "2:15",
  },
  {
    game_id: "demo_nhl_1",
    sport: "nhl",
    league: "NHL",
    away_team_code: "BOS",
    home_team_code: "NYR",
    away_team_name: "Boston Bruins",
    home_team_name: "New York Rangers",
    away_score: 2,
    home_score: 3,
    start_time: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
    status: "IN_PROGRESS",
    period: 2,
    period_label: "2nd",
    clock: "8:45",
  },
  {
    game_id: "demo_mlb_1",
    sport: "mlb",
    league: "MLB",
    away_team_code: "SF",
    home_team_code: "LAD",
    away_team_name: "San Francisco Giants",
    home_team_name: "Los Angeles Dodgers",
    away_score: 4,
    home_score: 5,
    start_time: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
    status: "IN_PROGRESS",
    period: 7,
    period_label: "7th",
    clock: "2 Out",
  },
  {
    game_id: "demo_nfl_2",
    sport: "nfl",
    league: "NFL",
    away_team_code: "PHI",
    home_team_code: "DAL",
    away_team_name: "Philadelphia Eagles",
    home_team_name: "Dallas Cowboys",
    away_score: 0,
    home_score: 0,
    start_time: new Date(Date.now() + 3600000).toISOString(),
    last_updated_at: new Date().toISOString(),
    status: "SCHEDULED",
  },
];

// Demo games fallback
export const DEMO_LIVE_GAMES: LiveGame[] = [
  {
    id: "demo_nfl_live_1",
    homeTeam: { name: "Chiefs", abbreviation: "KC", score: 24, logo: "🏈" },
    awayTeam: { name: "Bills", abbreviation: "BUF", score: 21, logo: "🏈" },
    period: "4th",
    clock: "4:32",
    sport: "NFL",
    status: "IN_PROGRESS",
    momentum: "home",
    hasCoachInsight: true,
    rankImpact: { outcome: "Chiefs win", newRank: 2 },
    community: { homePercent: 68, awayPercent: 32 },
    odds: {
      spreadHome: -4.5,
      total: 52.5,
      moneylineHome: -185,
      moneylineAway: 155,
      movementSpread: -1.5,
      movementTotal: 2,
    },
  },
  {
    id: "demo_nba_live_2",
    homeTeam: { name: "Lakers", abbreviation: "LAL", score: 98, logo: "🏀" },
    awayTeam: { name: "Celtics", abbreviation: "BOS", score: 102, logo: "🏀" },
    period: "3rd",
    clock: "2:15",
    sport: "NBA",
    status: "IN_PROGRESS",
    momentum: "away",
    hasCoachInsight: true,
    rankImpact: { outcome: "Lakers comeback", newRank: 1 },
    community: { homePercent: 41, awayPercent: 59 },
    odds: {
      spreadHome: 2.5,
      total: 224.5,
      moneylineHome: 120,
      moneylineAway: -140,
      movementSpread: 0.5,
      movementTotal: -1.5,
    },
  },
  {
    id: "demo_nhl_live_3",
    homeTeam: { name: "Rangers", abbreviation: "NYR", score: 3, logo: "🏒" },
    awayTeam: { name: "Bruins", abbreviation: "BOS", score: 2, logo: "🏒" },
    period: "2nd",
    clock: "8:45",
    sport: "NHL",
    status: "IN_PROGRESS",
    momentum: "home",
    hasCoachInsight: false,
    rankImpact: null,
    community: { homePercent: 55, awayPercent: 45 },
    odds: {
      spreadHome: -1.5,
      total: 5.5,
      moneylineHome: -135,
      moneylineAway: 115,
      movementSpread: 0,
      movementTotal: 0,
    },
  },
];
