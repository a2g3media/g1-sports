/**
 * Game Context Engine
 * 
 * Universal intelligence layer that generates contextual signals for any game.
 * This is NOT just stats - it's what the game MEANS right now.
 * 
 * Supported sports: NBA, MLB, NHL, NCAAB, Soccer (safe mode), NFL (extensible)
 */

export interface GameContextSignal {
  type: string;
  label: string;
  value: string;
  edge?: 'home' | 'away' | 'neutral';
  importance: 'high' | 'medium' | 'low';
  icon?: string;
}

export interface GameContext {
  gameId: string;
  sport: string;
  signals: GameContextSignal[];
  coachGNote: string;
  headline: string;
  lastUpdated: string;
}

export interface GameData {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode?: string;
  awayTeamCode?: string;
  status: string;
  startTime?: string;
  homeScore?: number;
  awayScore?: number;
  // Schedule context
  homeRestDays?: number;
  awayRestDays?: number;
  homeBackToBack?: boolean;
  awayBackToBack?: boolean;
  // Form context
  homeRecentForm?: string; // e.g., "W-W-L-W-L"
  awayRecentForm?: string;
  homeLast10?: string; // e.g., "7-3"
  awayLast10?: string;
  // Head-to-head
  h2hRecord?: string; // e.g., "Lakers 4-1 last 5"
  lastMeetingResult?: string;
  // Injury context
  homeKeyInjuries?: string[];
  awayKeyInjuries?: string[];
  // Sport-specific data
  probablePitchers?: { home: string; away: string }; // MLB
  startingGoalies?: { home: string; away: string }; // NHL
  weather?: { temp?: number; wind?: string; condition?: string }; // MLB outdoor
  parkFactor?: string; // MLB
  tempo?: { home: string; away: string }; // Basketball
  // Betting context
  spread?: number;
  total?: number;
  moneyline?: { home: number; away: number };
  publicBettingPct?: { home: number; away: number };
  lineMovement?: string;
  // Rankings (NCAAB)
  homeRanking?: number;
  awayRanking?: number;
  conference?: string;
}

// ============================================
// CORE CONTEXT GENERATION
// ============================================

export function generateGameContext(game: GameData): GameContext {
  const sport = game.sport.toUpperCase();
  
  let signals: GameContextSignal[] = [];
  
  // Generate sport-specific signals
  switch (sport) {
    case 'NBA':
      signals = generateNBAContext(game);
      break;
    case 'MLB':
      signals = generateMLBContext(game);
      break;
    case 'NHL':
      signals = generateNHLContext(game);
      break;
    case 'NCAAB':
    case 'CBB':
      signals = generateNCAABContext(game);
      break;
    case 'SOCCER':
    case 'FOOTBALL':
      signals = generateSoccerContext(game);
      break;
    case 'NFL':
    case 'NCAAF':
      signals = generateNFLContext(game);
      break;
    default:
      signals = generateGenericContext(game);
  }
  
  // Sort by importance
  signals.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.importance] - order[b.importance];
  });
  
  // Take top 6 signals
  signals = signals.slice(0, 6);
  
  // Generate Coach G note
  const coachGNote = generateCoachGNote(game, signals);
  
  // Generate headline
  const headline = generateHeadline(game, signals);
  
  return {
    gameId: game.gameId,
    sport: game.sport,
    signals,
    coachGNote,
    headline,
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================
// NBA CONTEXT
// ============================================

function generateNBAContext(game: GameData): GameContextSignal[] {
  const signals: GameContextSignal[] = [];
  
  // Rest advantage
  if (game.homeRestDays !== undefined && game.awayRestDays !== undefined) {
    const restDiff = game.homeRestDays - game.awayRestDays;
    if (Math.abs(restDiff) >= 1) {
      const advantageTeam = restDiff > 0 ? game.homeTeam : game.awayTeam;
      const days = Math.abs(restDiff);
      signals.push({
        type: 'rest_advantage',
        label: 'Rest Advantage',
        value: `${advantageTeam} +${days} day${days > 1 ? 's' : ''}`,
        edge: restDiff > 0 ? 'home' : 'away',
        importance: days >= 2 ? 'high' : 'medium',
        icon: '😴',
      });
    }
  }
  
  // Back-to-back
  if (game.homeBackToBack || game.awayBackToBack) {
    const b2bTeam = game.homeBackToBack ? game.homeTeam : game.awayTeam;
    const fadeTeam = game.homeBackToBack ? 'home' : 'away';
    signals.push({
      type: 'back_to_back',
      label: 'Back-to-Back',
      value: b2bTeam,
      edge: fadeTeam === 'home' ? 'away' : 'home', // Opposite team has edge
      importance: 'high',
      icon: '⚠️',
    });
  }
  
  // Recent form
  if (game.homeLast10 && game.awayLast10) {
    const homeWins = parseInt(game.homeLast10.split('-')[0]) || 0;
    const awayWins = parseInt(game.awayLast10.split('-')[0]) || 0;
    
    if (Math.abs(homeWins - awayWins) >= 3) {
      const hotTeam = homeWins > awayWins ? game.homeTeam : game.awayTeam;
      const hotRecord = homeWins > awayWins ? game.homeLast10 : game.awayLast10;
      signals.push({
        type: 'recent_form',
        label: 'Hot Streak',
        value: `${hotTeam} ${hotRecord} L10`,
        edge: homeWins > awayWins ? 'home' : 'away',
        importance: 'medium',
        icon: '🔥',
      });
    }
  }
  
  // Head-to-head
  if (game.h2hRecord) {
    signals.push({
      type: 'head_to_head',
      label: 'Head-to-Head',
      value: game.h2hRecord,
      importance: 'medium',
      icon: '🤝',
    });
  }
  
  // Pace/tempo matchup
  if (game.tempo?.home && game.tempo?.away) {
    const homePace = game.tempo.home.toLowerCase();
    const awayPace = game.tempo.away.toLowerCase();
    
    if (homePace.includes('fast') && awayPace.includes('fast')) {
      signals.push({
        type: 'pace_matchup',
        label: 'Pace Matchup',
        value: 'High-scoring profile',
        importance: 'medium',
        icon: '⚡',
      });
    } else if (homePace.includes('slow') && awayPace.includes('slow')) {
      signals.push({
        type: 'pace_matchup',
        label: 'Pace Matchup',
        value: 'Grind-it-out profile',
        importance: 'medium',
        icon: '🐢',
      });
    }
  }
  
  // Key injuries
  const allInjuries = [
    ...(game.homeKeyInjuries || []).map(p => `${p} (${game.homeTeamCode || game.homeTeam})`),
    ...(game.awayKeyInjuries || []).map(p => `${p} (${game.awayTeamCode || game.awayTeam})`),
  ];
  
  if (allInjuries.length > 0) {
    signals.push({
      type: 'injury_impact',
      label: 'Injury Impact',
      value: allInjuries.slice(0, 2).join(', ') + (allInjuries.length > 2 ? ` +${allInjuries.length - 2} more` : ''),
      importance: 'high',
      icon: '🏥',
    });
  }
  
  // Line movement
  if (game.lineMovement) {
    signals.push({
      type: 'line_movement',
      label: 'Line Movement',
      value: game.lineMovement,
      importance: 'medium',
      icon: '📈',
    });
  }
  
  return signals;
}

// ============================================
// MLB CONTEXT
// ============================================

function generateMLBContext(game: GameData): GameContextSignal[] {
  const signals: GameContextSignal[] = [];
  
  // Baseline: Home field advantage (always show)
  signals.push({
    type: 'home_field',
    label: 'Home Field',
    value: `${game.homeTeam} at home`,
    edge: 'home',
    importance: 'low',
    icon: '🏟️',
  });
  
  // Probable pitchers
  if (game.probablePitchers?.home && game.probablePitchers?.away) {
    signals.push({
      type: 'probable_pitchers',
      label: 'Pitching Matchup',
      value: `${game.probablePitchers.away} vs ${game.probablePitchers.home}`,
      importance: 'high',
      icon: '⚾',
    });
  }
  
  // Weather (outdoor games)
  if (game.weather?.wind) {
    const windInfo = game.weather.wind.toLowerCase();
    if (windInfo.includes('out')) {
      signals.push({
        type: 'weather_wind',
        label: 'Weather',
        value: `Wind blowing out${game.weather.temp ? ` • ${game.weather.temp}°F` : ''}`,
        importance: 'high',
        icon: '💨',
      });
    } else if (windInfo.includes('in')) {
      signals.push({
        type: 'weather_wind',
        label: 'Weather',
        value: `Wind blowing in${game.weather.temp ? ` • ${game.weather.temp}°F` : ''}`,
        importance: 'medium',
        icon: '💨',
      });
    }
  }
  
  // Park factor
  if (game.parkFactor) {
    signals.push({
      type: 'park_factor',
      label: 'Park Factor',
      value: game.parkFactor,
      importance: 'medium',
      icon: '🏟️',
    });
  }
  
  // Recent form (last 10)
  if (game.homeLast10 && game.awayLast10) {
    const homeWins = parseInt(game.homeLast10.split('-')[0]) || 0;
    const awayWins = parseInt(game.awayLast10.split('-')[0]) || 0;
    
    if (Math.abs(homeWins - awayWins) >= 3) {
      const hotTeam = homeWins > awayWins ? game.homeTeam : game.awayTeam;
      signals.push({
        type: 'recent_form',
        label: 'Series Momentum',
        value: `${hotTeam} hot - ${homeWins > awayWins ? game.homeLast10 : game.awayLast10} L10`,
        edge: homeWins > awayWins ? 'home' : 'away',
        importance: 'medium',
        icon: '🔥',
      });
    }
  }
  
  // Rest days / travel
  if (game.homeRestDays !== undefined && game.awayRestDays !== undefined) {
    if (game.awayRestDays === 0) {
      signals.push({
        type: 'travel_fatigue',
        label: 'Travel Factor',
        value: `${game.awayTeam} on road trip`,
        edge: 'home',
        importance: 'low',
        icon: '✈️',
      });
    }
  }
  
  // Head-to-head season series
  if (game.h2hRecord) {
    signals.push({
      type: 'head_to_head',
      label: 'Season Series',
      value: game.h2hRecord,
      importance: 'medium',
      icon: '📊',
    });
  }
  
  // Key injuries
  if (game.homeKeyInjuries?.length || game.awayKeyInjuries?.length) {
    const injuries = [
      ...(game.homeKeyInjuries || []),
      ...(game.awayKeyInjuries || []),
    ].slice(0, 2);
    
    signals.push({
      type: 'injury_impact',
      label: 'Injury Report',
      value: injuries.join(', '),
      importance: 'medium',
      icon: '🏥',
    });
  }
  
  return signals;
}

// ============================================
// NHL CONTEXT
// ============================================

function generateNHLContext(game: GameData): GameContextSignal[] {
  const signals: GameContextSignal[] = [];
  
  // Goalie matchup
  if (game.startingGoalies?.home && game.startingGoalies?.away) {
    signals.push({
      type: 'goalie_matchup',
      label: 'Goalie Matchup',
      value: `${game.startingGoalies.away} vs ${game.startingGoalies.home}`,
      importance: 'high',
      icon: '🥅',
    });
  }
  
  // Back-to-back
  if (game.homeBackToBack || game.awayBackToBack) {
    const b2bTeam = game.homeBackToBack ? game.homeTeam : game.awayTeam;
    signals.push({
      type: 'back_to_back',
      label: 'Back-to-Back',
      value: b2bTeam,
      edge: game.homeBackToBack ? 'away' : 'home',
      importance: 'high',
      icon: '⚠️',
    });
  }
  
  // Rest/travel
  if (game.homeRestDays !== undefined && game.awayRestDays !== undefined) {
    const restDiff = game.homeRestDays - game.awayRestDays;
    if (Math.abs(restDiff) >= 2) {
      const restedTeam = restDiff > 0 ? game.homeTeam : game.awayTeam;
      signals.push({
        type: 'rest_advantage',
        label: 'Rest Edge',
        value: `${restedTeam} well-rested`,
        edge: restDiff > 0 ? 'home' : 'away',
        importance: 'medium',
        icon: '😴',
      });
    }
  }
  
  // Recent form
  if (game.homeLast10 && game.awayLast10) {
    const homeWins = parseInt(game.homeLast10.split('-')[0]) || 0;
    const awayWins = parseInt(game.awayLast10.split('-')[0]) || 0;
    
    if (Math.abs(homeWins - awayWins) >= 3) {
      const hotTeam = homeWins > awayWins ? game.homeTeam : game.awayTeam;
      signals.push({
        type: 'recent_form',
        label: 'Recent Form',
        value: `${hotTeam} ${homeWins > awayWins ? game.homeLast10 : game.awayLast10} L10`,
        edge: homeWins > awayWins ? 'home' : 'away',
        importance: 'medium',
        icon: '🔥',
      });
    }
  }
  
  // Head-to-head
  if (game.h2hRecord) {
    signals.push({
      type: 'head_to_head',
      label: 'Head-to-Head',
      value: game.h2hRecord,
      importance: 'medium',
      icon: '🤝',
    });
  }
  
  // Injuries
  if (game.homeKeyInjuries?.length || game.awayKeyInjuries?.length) {
    const injuries = [
      ...(game.homeKeyInjuries || []),
      ...(game.awayKeyInjuries || []),
    ].slice(0, 2);
    
    signals.push({
      type: 'injury_impact',
      label: 'Key Injuries',
      value: injuries.join(', '),
      importance: 'medium',
      icon: '🏥',
    });
  }
  
  return signals;
}

// ============================================
// NCAAB CONTEXT
// ============================================

function generateNCAABContext(game: GameData): GameContextSignal[] {
  const signals: GameContextSignal[] = [];
  
  // Rankings
  if (game.homeRanking || game.awayRanking) {
    if (game.homeRanking && game.awayRanking) {
      signals.push({
        type: 'rankings',
        label: 'Rankings',
        value: `#${game.awayRanking} vs #${game.homeRanking}`,
        importance: 'high',
        icon: '🏆',
      });
    } else if (game.homeRanking) {
      signals.push({
        type: 'rankings',
        label: 'Ranked Matchup',
        value: `#${game.homeRanking} ${game.homeTeam} hosting`,
        edge: 'home',
        importance: 'high',
        icon: '🏆',
      });
    } else if (game.awayRanking) {
      signals.push({
        type: 'rankings',
        label: 'Ranked Matchup',
        value: `#${game.awayRanking} ${game.awayTeam} on road`,
        edge: 'away',
        importance: 'high',
        icon: '🏆',
      });
    }
  }
  
  // Conference game
  if (game.conference) {
    signals.push({
      type: 'conference',
      label: 'Conference',
      value: game.conference,
      importance: 'medium',
      icon: '🏀',
    });
  }
  
  // Home court advantage (college is huge)
  signals.push({
    type: 'home_court',
    label: 'Home Court',
    value: `${game.homeTeam} at home`,
    edge: 'home',
    importance: 'medium',
    icon: '🏠',
  });
  
  // Tempo matchup
  if (game.tempo?.home && game.tempo?.away) {
    const tempoDesc = game.tempo.home.toLowerCase().includes('fast') ? 'Up-tempo matchup' : 'Half-court battle';
    signals.push({
      type: 'tempo_matchup',
      label: 'Tempo',
      value: tempoDesc,
      importance: 'medium',
      icon: '⚡',
    });
  }
  
  // Recent form
  if (game.homeLast10 && game.awayLast10) {
    const homeWins = parseInt(game.homeLast10.split('-')[0]) || 0;
    const awayWins = parseInt(game.awayLast10.split('-')[0]) || 0;
    
    if (Math.abs(homeWins - awayWins) >= 2) {
      const hotTeam = homeWins > awayWins ? game.homeTeam : game.awayTeam;
      signals.push({
        type: 'recent_form',
        label: 'Recent Form',
        value: `${hotTeam} ${homeWins > awayWins ? game.homeLast10 : game.awayLast10} L10`,
        edge: homeWins > awayWins ? 'home' : 'away',
        importance: 'medium',
        icon: '🔥',
      });
    }
  }
  
  // Rest (back-to-back less common but still relevant)
  if (game.homeRestDays !== undefined && game.awayRestDays !== undefined) {
    const restDiff = game.homeRestDays - game.awayRestDays;
    if (Math.abs(restDiff) >= 2) {
      const restedTeam = restDiff > 0 ? game.homeTeam : game.awayTeam;
      signals.push({
        type: 'rest_advantage',
        label: 'Rest Edge',
        value: `${restedTeam} +${Math.abs(restDiff)} days rest`,
        edge: restDiff > 0 ? 'home' : 'away',
        importance: 'low',
        icon: '😴',
      });
    }
  }
  
  return signals;
}

// ============================================
// SOCCER CONTEXT (Safe Mode)
// ============================================

function generateSoccerContext(game: GameData): GameContextSignal[] {
  const signals: GameContextSignal[] = [];
  
  // Baseline: Home pitch advantage (always show)
  signals.push({
    type: 'home_pitch',
    label: 'Home Ground',
    value: `${game.homeTeam} at home`,
    edge: 'home',
    importance: 'low',
    icon: '🏠',
  });
  
  // Fixture congestion
  if (game.homeRestDays !== undefined && game.awayRestDays !== undefined) {
    if (game.homeRestDays <= 3 || game.awayRestDays <= 3) {
      const tiredTeam = game.homeRestDays < game.awayRestDays ? game.homeTeam : game.awayTeam;
      signals.push({
        type: 'fixture_congestion',
        label: 'Fixture Congestion',
        value: `${tiredTeam} short turnaround`,
        edge: game.homeRestDays < game.awayRestDays ? 'away' : 'home',
        importance: 'medium',
        icon: '📅',
      });
    }
  }
  
  // Home form
  if (game.homeLast10) {
    signals.push({
      type: 'home_form',
      label: 'Home Form',
      value: `${game.homeTeam} ${game.homeLast10}`,
      importance: 'medium',
      icon: '🏠',
    });
  }
  
  // Head-to-head
  if (game.h2hRecord) {
    signals.push({
      type: 'head_to_head',
      label: 'Head-to-Head',
      value: game.h2hRecord,
      importance: 'medium',
      icon: '🤝',
    });
  }
  
  // Key injuries/suspensions
  if (game.homeKeyInjuries?.length || game.awayKeyInjuries?.length) {
    const missing = [
      ...(game.homeKeyInjuries || []),
      ...(game.awayKeyInjuries || []),
    ].slice(0, 2);
    
    signals.push({
      type: 'missing_players',
      label: 'Missing Players',
      value: missing.join(', '),
      importance: 'high',
      icon: '🚫',
    });
  }
  
  // Recent form
  if (game.awayLast10) {
    signals.push({
      type: 'away_form',
      label: 'Away Form',
      value: `${game.awayTeam} ${game.awayLast10}`,
      importance: 'low',
      icon: '✈️',
    });
  }
  
  return signals;
}

// ============================================
// NFL CONTEXT
// ============================================

function generateNFLContext(game: GameData): GameContextSignal[] {
  const signals: GameContextSignal[] = [];
  
  // Rest advantage
  if (game.homeRestDays !== undefined && game.awayRestDays !== undefined) {
    const restDiff = game.homeRestDays - game.awayRestDays;
    if (Math.abs(restDiff) >= 3) {
      const restedTeam = restDiff > 0 ? game.homeTeam : game.awayTeam;
      signals.push({
        type: 'rest_advantage',
        label: 'Rest Edge',
        value: `${restedTeam} extra rest`,
        edge: restDiff > 0 ? 'home' : 'away',
        importance: 'high',
        icon: '😴',
      });
    }
  }
  
  // Home field
  signals.push({
    type: 'home_field',
    label: 'Home Field',
    value: `${game.homeTeam} at home`,
    edge: 'home',
    importance: 'medium',
    icon: '🏠',
  });
  
  // Weather (outdoor games)
  if (game.weather) {
    const conditions = [];
    if (game.weather.temp && game.weather.temp < 35) {
      conditions.push(`${game.weather.temp}°F`);
    }
    if (game.weather.wind) {
      conditions.push(game.weather.wind);
    }
    if (conditions.length > 0) {
      signals.push({
        type: 'weather',
        label: 'Weather',
        value: conditions.join(' • '),
        importance: 'medium',
        icon: '🌦️',
      });
    }
  }
  
  // Recent form
  if (game.homeLast10 && game.awayLast10) {
    const homeWins = parseInt(game.homeLast10.split('-')[0]) || 0;
    const awayWins = parseInt(game.awayLast10.split('-')[0]) || 0;
    
    if (Math.abs(homeWins - awayWins) >= 2) {
      const hotTeam = homeWins > awayWins ? game.homeTeam : game.awayTeam;
      signals.push({
        type: 'recent_form',
        label: 'Momentum',
        value: `${hotTeam} ${homeWins > awayWins ? game.homeLast10 : game.awayLast10} recent`,
        edge: homeWins > awayWins ? 'home' : 'away',
        importance: 'medium',
        icon: '🔥',
      });
    }
  }
  
  // Key injuries
  if (game.homeKeyInjuries?.length || game.awayKeyInjuries?.length) {
    const injuries = [
      ...(game.homeKeyInjuries || []),
      ...(game.awayKeyInjuries || []),
    ].slice(0, 2);
    
    signals.push({
      type: 'injury_impact',
      label: 'Key Injuries',
      value: injuries.join(', '),
      importance: 'high',
      icon: '🏥',
    });
  }
  
  // Head-to-head
  if (game.h2hRecord) {
    signals.push({
      type: 'head_to_head',
      label: 'Series',
      value: game.h2hRecord,
      importance: 'low',
      icon: '🤝',
    });
  }
  
  return signals;
}

// ============================================
// GENERIC CONTEXT (Fallback)
// ============================================

function generateGenericContext(game: GameData): GameContextSignal[] {
  const signals: GameContextSignal[] = [];
  
  // Home advantage
  signals.push({
    type: 'home_advantage',
    label: 'Home Team',
    value: game.homeTeam,
    edge: 'home',
    importance: 'medium',
    icon: '🏠',
  });
  
  // Recent form if available
  if (game.homeLast10) {
    signals.push({
      type: 'home_form',
      label: 'Home Form',
      value: game.homeLast10,
      importance: 'medium',
      icon: '📊',
    });
  }
  
  if (game.awayLast10) {
    signals.push({
      type: 'away_form',
      label: 'Away Form',
      value: game.awayLast10,
      importance: 'medium',
      icon: '📊',
    });
  }
  
  // Head-to-head
  if (game.h2hRecord) {
    signals.push({
      type: 'head_to_head',
      label: 'Head-to-Head',
      value: game.h2hRecord,
      importance: 'medium',
      icon: '🤝',
    });
  }
  
  return signals;
}

// ============================================
// COACH G NOTE GENERATION
// ============================================

function generateCoachGNote(game: GameData, signals: GameContextSignal[]): string {
  const highPrioritySignals = signals.filter(s => s.importance === 'high');
  
  // Find the most impactful signal
  const primarySignal = highPrioritySignals[0] || signals[0];
  
  if (!primarySignal) {
    return `Standard matchup between ${game.awayTeam} and ${game.homeTeam}.`;
  }
  
  // Build contextual note based on primary signal
  switch (primarySignal.type) {
    case 'back_to_back':
      return `${primarySignal.value} on a back-to-back is a potential fade spot. Fatigue typically shows in second half performance.`;
    
    case 'rest_advantage':
      return `Rest edge matters here. ${primarySignal.value} - watch for early energy advantages.`;
    
    case 'goalie_matchup':
      return `Goaltending will be key tonight. ${primarySignal.value} - consider the under if both are sharp.`;
    
    case 'probable_pitchers':
      return `Pitching matchup favors tracking the total. ${primarySignal.value}.`;
    
    case 'weather_wind':
      return `${primarySignal.value} - this is an over consideration for the total.`;
    
    case 'rankings':
      return `Ranked matchup alert. ${primarySignal.value} - tournament positioning could be at stake.`;
    
    case 'injury_impact':
      return `Key personnel out: ${primarySignal.value}. Factor this into any spread analysis.`;
    
    case 'pace_matchup':
    case 'tempo_matchup':
      return `${primarySignal.value}. This matchup profile should inform your total expectations.`;
    
    case 'recent_form':
      return `Momentum matters: ${primarySignal.value}. Confidence is high on one side.`;
    
    case 'fixture_congestion':
      return `${primarySignal.value}. Rotation and fatigue could be factors.`;
    
    default:
      return `${game.awayTeam} at ${game.homeTeam}. Key factor: ${primarySignal.label} - ${primarySignal.value}.`;
  }
}

// ============================================
// HEADLINE GENERATION
// ============================================

function generateHeadline(game: GameData, signals: GameContextSignal[]): string {
  const highPrioritySignals = signals.filter(s => s.importance === 'high');
  
  if (highPrioritySignals.length === 0) {
    return `${game.awayTeam} @ ${game.homeTeam}`;
  }
  
  const primary = highPrioritySignals[0];
  
  switch (primary.type) {
    case 'back_to_back':
      return `B2B Fade Spot: ${primary.value}`;
    case 'rest_advantage':
      return `Rest Edge: ${primary.value}`;
    case 'goalie_matchup':
      return `Goalie Battle Tonight`;
    case 'probable_pitchers':
      return `Aces Duel`;
    case 'weather_wind':
      return `Weather Alert: ${primary.value}`;
    case 'rankings':
      return `Top 25 Showdown`;
    case 'injury_impact':
      return `Injury Impact Game`;
    default:
      return `${game.awayTeam} @ ${game.homeTeam}`;
  }
}

// ============================================
// MOCK DATA GENERATOR (for testing/fallback)
// ============================================

export function generateMockContext(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string
): GameContext {
  // Create mock game data with reasonable defaults
  const mockGame: GameData = {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    status: 'SCHEDULED',
    homeRestDays: Math.floor(Math.random() * 4) + 1,
    awayRestDays: Math.floor(Math.random() * 4) + 1,
    homeBackToBack: Math.random() > 0.8,
    awayBackToBack: Math.random() > 0.8,
    homeLast10: `${Math.floor(Math.random() * 6) + 3}-${Math.floor(Math.random() * 5) + 2}`,
    awayLast10: `${Math.floor(Math.random() * 6) + 3}-${Math.floor(Math.random() * 5) + 2}`,
    h2hRecord: `${homeTeam} ${Math.floor(Math.random() * 4) + 1}-${Math.floor(Math.random() * 3)} last 5`,
  };
  
  return generateGameContext(mockGame);
}
