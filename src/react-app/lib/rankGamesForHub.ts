/**
 * Smart game ranking algorithm for sport hubs
 * Prioritizes games by excitement and importance
 */

interface RankableGame {
  id: string;
  status: 'LIVE' | 'SCHEDULED' | 'FINAL';
  homeTeam: { score: number };
  awayTeam: { score: number };
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string;
}

interface RankingWeights {
  live: number;
  overtime: number;
  closeGame: number;
  nationalTv: number;
  startingSoon: number;
  final: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  live: 1000,        // Live games always on top
  overtime: 500,     // OT games are extra exciting
  closeGame: 300,    // Tight scores = more exciting
  nationalTv: 100,   // Featured broadcasts
  startingSoon: 50,  // Games about to start
  final: -200,       // Push finished games down
};

// Close game thresholds by sport
const CLOSE_THRESHOLDS: Record<string, number> = {
  nba: 10,
  ncaab: 10,
  nfl: 7,
  ncaaf: 7,
  mlb: 2,
  nhl: 1,
  soccer: 1,
};

// National TV networks
const NATIONAL_TV = ['ESPN', 'ABC', 'TNT', 'FOX', 'CBS', 'NBC', 'FS1', 'ESPN2', 'NBCSN', 'TBS', 'USA'];

/**
 * Calculate importance score for a single game
 */
function calculateGameScore(game: RankableGame, sport: string, weights = DEFAULT_WEIGHTS): number {
  let score = 0;
  
  // Status-based scoring
  if (game.status === 'LIVE') {
    score += weights.live;
    
    // Check for overtime
    const period = game.period?.toLowerCase() || '';
    if (period.includes('ot') || period.includes('overtime') || 
        period.includes('extra') || period.includes('shootout')) {
      score += weights.overtime;
    }
    
    // Check for close game
    const scoreDiff = Math.abs(game.homeTeam.score - game.awayTeam.score);
    const threshold = CLOSE_THRESHOLDS[sport.toLowerCase()] || 5;
    if (scoreDiff <= threshold) {
      // Closer games get higher scores
      const closenessBonus = (threshold - scoreDiff + 1) / threshold;
      score += weights.closeGame * closenessBonus;
    }
    
    // Late game bonus (4th quarter, 9th inning, etc.)
    if (isLateGame(game.period, sport)) {
      score += 150; // Extra excitement for late close games
    }
  } else if (game.status === 'FINAL') {
    score += weights.final;
  } else if (game.status === 'SCHEDULED') {
    // Starting soon bonus
    if (game.startTime) {
      const minutesUntilStart = getMinutesUntilStart(game.startTime);
      if (minutesUntilStart >= 0 && minutesUntilStart <= 30) {
        score += weights.startingSoon * (1 - minutesUntilStart / 30);
      }
    }
  }
  
  // National TV bonus
  if (game.channel && NATIONAL_TV.some(net => game.channel?.toUpperCase().includes(net))) {
    score += weights.nationalTv;
  }
  
  return score;
}

/**
 * Check if game is in late stages
 */
function isLateGame(period: string | undefined, sport: string): boolean {
  if (!period) return false;
  const p = period.toLowerCase();
  
  switch (sport.toLowerCase()) {
    case 'nba':
    case 'ncaab':
      return p.includes('4th') || p.includes('4q') || p.includes('ot');
    case 'nfl':
    case 'ncaaf':
      return p.includes('4th') || p.includes('4q') || p.includes('ot');
    case 'nhl':
      return p.includes('3rd') || p.includes('3p') || p.includes('ot');
    case 'mlb':
      // 7th inning or later
      const inning = parseInt(p.replace(/\D/g, ''));
      return inning >= 7;
    case 'soccer':
      // Second half (45+ minutes)
      const minute = parseInt(p.replace(/\D/g, ''));
      return minute >= 45;
    default:
      return false;
  }
}

/**
 * Get minutes until game starts
 */
function getMinutesUntilStart(startTime: string): number {
  try {
    const start = new Date(startTime);
    const now = new Date();
    return (start.getTime() - now.getTime()) / (1000 * 60);
  } catch {
    return Infinity;
  }
}

/**
 * Sort games by importance score
 */
export function rankGamesForHub<T extends RankableGame>(
  games: T[],
  sport: string,
  weights?: Partial<RankingWeights>
): T[] {
  const mergedWeights = { ...DEFAULT_WEIGHTS, ...weights };
  
  // Create array with scores
  const gamesWithScores = games.map(game => ({
    game,
    score: calculateGameScore(game, sport, mergedWeights),
  }));
  
  // Sort by score descending, then by start time for ties
  gamesWithScores.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie-breaker: earlier start time first
    const aTime = a.game.startTime ? new Date(a.game.startTime).getTime() : Infinity;
    const bTime = b.game.startTime ? new Date(b.game.startTime).getTime() : Infinity;
    return aTime - bTime;
  });
  
  return gamesWithScores.map(g => g.game);
}

/**
 * Get the single most important game (for hero display)
 */
export function getHeroGame<T extends RankableGame>(
  games: T[],
  sport: string
): T | null {
  if (games.length === 0) return null;
  const ranked = rankGamesForHub(games, sport);
  return ranked[0];
}

/**
 * Get top N games for featured section
 */
export function getFeaturedGames<T extends RankableGame>(
  games: T[],
  sport: string,
  count: number = 3
): T[] {
  const ranked = rankGamesForHub(games, sport);
  return ranked.slice(0, count);
}

export default rankGamesForHub;
