/**
 * Coach G AI Action Engine
 * 
 * Transforms Coach G from a chat assistant into an intelligent control layer
 * that can detect command intents and trigger actions across the app.
 */

// ============ Intent Types ============

export type ActionIntent = 
  | 'watch_game'
  | 'follow_team'
  | 'follow_player'
  | 'open_odds'
  | 'open_game'
  | 'build_parlay'
  | 'show_sharp_radar'
  | 'show_value_bets'
  | 'track_player'
  | 'none';

export interface DetectedAction {
  intent: ActionIntent;
  confidence: number;
  entities: {
    team?: string;
    player?: string;
    game?: string;
    sport?: string;
  };
  suggestedRoute?: string;
  confirmationMessage?: string;
}

export interface ActionButton {
  label: string;
  action: ActionIntent;
  route?: string;
  data?: Record<string, string>;
  variant: 'primary' | 'secondary' | 'outline';
}

// ============ Team & Player Mappings ============

const TEAM_ALIASES: Record<string, { name: string; sport: string; code: string }> = {
  // NBA
  'lakers': { name: 'Los Angeles Lakers', sport: 'nba', code: 'LAL' },
  'la lakers': { name: 'Los Angeles Lakers', sport: 'nba', code: 'LAL' },
  'celtics': { name: 'Boston Celtics', sport: 'nba', code: 'BOS' },
  'boston': { name: 'Boston Celtics', sport: 'nba', code: 'BOS' },
  'warriors': { name: 'Golden State Warriors', sport: 'nba', code: 'GSW' },
  'golden state': { name: 'Golden State Warriors', sport: 'nba', code: 'GSW' },
  'nets': { name: 'Brooklyn Nets', sport: 'nba', code: 'BKN' },
  'brooklyn': { name: 'Brooklyn Nets', sport: 'nba', code: 'BKN' },
  'knicks': { name: 'New York Knicks', sport: 'nba', code: 'NYK' },
  'heat': { name: 'Miami Heat', sport: 'nba', code: 'MIA' },
  'miami': { name: 'Miami Heat', sport: 'nba', code: 'MIA' },
  'bulls': { name: 'Chicago Bulls', sport: 'nba', code: 'CHI' },
  'chicago bulls': { name: 'Chicago Bulls', sport: 'nba', code: 'CHI' },
  'suns': { name: 'Phoenix Suns', sport: 'nba', code: 'PHX' },
  'phoenix': { name: 'Phoenix Suns', sport: 'nba', code: 'PHX' },
  'mavs': { name: 'Dallas Mavericks', sport: 'nba', code: 'DAL' },
  'mavericks': { name: 'Dallas Mavericks', sport: 'nba', code: 'DAL' },
  'dallas': { name: 'Dallas Mavericks', sport: 'nba', code: 'DAL' },
  'bucks': { name: 'Milwaukee Bucks', sport: 'nba', code: 'MIL' },
  'milwaukee': { name: 'Milwaukee Bucks', sport: 'nba', code: 'MIL' },
  '76ers': { name: 'Philadelphia 76ers', sport: 'nba', code: 'PHI' },
  'sixers': { name: 'Philadelphia 76ers', sport: 'nba', code: 'PHI' },
  'clippers': { name: 'Los Angeles Clippers', sport: 'nba', code: 'LAC' },
  'nuggets': { name: 'Denver Nuggets', sport: 'nba', code: 'DEN' },
  'denver': { name: 'Denver Nuggets', sport: 'nba', code: 'DEN' },
  
  // NFL
  'chiefs': { name: 'Kansas City Chiefs', sport: 'nfl', code: 'KC' },
  'kansas city': { name: 'Kansas City Chiefs', sport: 'nfl', code: 'KC' },
  'eagles': { name: 'Philadelphia Eagles', sport: 'nfl', code: 'PHI' },
  'bills': { name: 'Buffalo Bills', sport: 'nfl', code: 'BUF' },
  'buffalo': { name: 'Buffalo Bills', sport: 'nfl', code: 'BUF' },
  'cowboys': { name: 'Dallas Cowboys', sport: 'nfl', code: 'DAL' },
  '49ers': { name: 'San Francisco 49ers', sport: 'nfl', code: 'SF' },
  'niners': { name: 'San Francisco 49ers', sport: 'nfl', code: 'SF' },
  'san francisco': { name: 'San Francisco 49ers', sport: 'nfl', code: 'SF' },
  'ravens': { name: 'Baltimore Ravens', sport: 'nfl', code: 'BAL' },
  'baltimore': { name: 'Baltimore Ravens', sport: 'nfl', code: 'BAL' },
  'bengals': { name: 'Cincinnati Bengals', sport: 'nfl', code: 'CIN' },
  'cincinnati': { name: 'Cincinnati Bengals', sport: 'nfl', code: 'CIN' },
  'dolphins': { name: 'Miami Dolphins', sport: 'nfl', code: 'MIA' },
  'lions': { name: 'Detroit Lions', sport: 'nfl', code: 'DET' },
  'detroit': { name: 'Detroit Lions', sport: 'nfl', code: 'DET' },
  'packers': { name: 'Green Bay Packers', sport: 'nfl', code: 'GB' },
  'green bay': { name: 'Green Bay Packers', sport: 'nfl', code: 'GB' },
  
  // NHL
  'oilers': { name: 'Edmonton Oilers', sport: 'nhl', code: 'EDM' },
  'edmonton': { name: 'Edmonton Oilers', sport: 'nhl', code: 'EDM' },
  'avalanche': { name: 'Colorado Avalanche', sport: 'nhl', code: 'COL' },
  'colorado': { name: 'Colorado Avalanche', sport: 'nhl', code: 'COL' },
  'bruins': { name: 'Boston Bruins', sport: 'nhl', code: 'BOS' },
  'maple leafs': { name: 'Toronto Maple Leafs', sport: 'nhl', code: 'TOR' },
  'leafs': { name: 'Toronto Maple Leafs', sport: 'nhl', code: 'TOR' },
  'toronto': { name: 'Toronto Maple Leafs', sport: 'nhl', code: 'TOR' },
  'rangers': { name: 'New York Rangers', sport: 'nhl', code: 'NYR' },
  'penguins': { name: 'Pittsburgh Penguins', sport: 'nhl', code: 'PIT' },
  'pittsburgh': { name: 'Pittsburgh Penguins', sport: 'nhl', code: 'PIT' },
  'blackhawks': { name: 'Chicago Blackhawks', sport: 'nhl', code: 'CHI' },
  'red wings': { name: 'Detroit Red Wings', sport: 'nhl', code: 'DET' },
  'lightning': { name: 'Tampa Bay Lightning', sport: 'nhl', code: 'TBL' },
  'tampa': { name: 'Tampa Bay Lightning', sport: 'nhl', code: 'TBL' },
  'panthers': { name: 'Florida Panthers', sport: 'nhl', code: 'FLA' },
  'florida': { name: 'Florida Panthers', sport: 'nhl', code: 'FLA' },
  
  // MLB
  'yankees': { name: 'New York Yankees', sport: 'mlb', code: 'NYY' },
  'dodgers': { name: 'Los Angeles Dodgers', sport: 'mlb', code: 'LAD' },
  'la dodgers': { name: 'Los Angeles Dodgers', sport: 'mlb', code: 'LAD' },
  'red sox': { name: 'Boston Red Sox', sport: 'mlb', code: 'BOS' },
  'astros': { name: 'Houston Astros', sport: 'mlb', code: 'HOU' },
  'houston': { name: 'Houston Astros', sport: 'mlb', code: 'HOU' },
  'braves': { name: 'Atlanta Braves', sport: 'mlb', code: 'ATL' },
  'atlanta': { name: 'Atlanta Braves', sport: 'mlb', code: 'ATL' },
  'cubs': { name: 'Chicago Cubs', sport: 'mlb', code: 'CHC' },
  'mets': { name: 'New York Mets', sport: 'mlb', code: 'NYM' },
  'phillies': { name: 'Philadelphia Phillies', sport: 'mlb', code: 'PHI' },
  'cardinals': { name: 'St. Louis Cardinals', sport: 'mlb', code: 'STL' },
  'giants': { name: 'San Francisco Giants', sport: 'mlb', code: 'SF' },
  'padres': { name: 'San Diego Padres', sport: 'mlb', code: 'SD' },
};

const PLAYER_ALIASES: Record<string, { name: string; sport: string; team: string }> = {
  'lebron': { name: 'LeBron James', sport: 'nba', team: 'LAL' },
  'lebron james': { name: 'LeBron James', sport: 'nba', team: 'LAL' },
  'curry': { name: 'Stephen Curry', sport: 'nba', team: 'GSW' },
  'steph curry': { name: 'Stephen Curry', sport: 'nba', team: 'GSW' },
  'stephen curry': { name: 'Stephen Curry', sport: 'nba', team: 'GSW' },
  'giannis': { name: 'Giannis Antetokounmpo', sport: 'nba', team: 'MIL' },
  'luka': { name: 'Luka Dončić', sport: 'nba', team: 'DAL' },
  'luka doncic': { name: 'Luka Dončić', sport: 'nba', team: 'DAL' },
  'durant': { name: 'Kevin Durant', sport: 'nba', team: 'PHX' },
  'kd': { name: 'Kevin Durant', sport: 'nba', team: 'PHX' },
  'jokic': { name: 'Nikola Jokić', sport: 'nba', team: 'DEN' },
  'nikola jokic': { name: 'Nikola Jokić', sport: 'nba', team: 'DEN' },
  'tatum': { name: 'Jayson Tatum', sport: 'nba', team: 'BOS' },
  'jayson tatum': { name: 'Jayson Tatum', sport: 'nba', team: 'BOS' },
  'embiid': { name: 'Joel Embiid', sport: 'nba', team: 'PHI' },
  
  // NFL
  'mahomes': { name: 'Patrick Mahomes', sport: 'nfl', team: 'KC' },
  'patrick mahomes': { name: 'Patrick Mahomes', sport: 'nfl', team: 'KC' },
  'josh allen': { name: 'Josh Allen', sport: 'nfl', team: 'BUF' },
  'allen': { name: 'Josh Allen', sport: 'nfl', team: 'BUF' },
  'hurts': { name: 'Jalen Hurts', sport: 'nfl', team: 'PHI' },
  'jalen hurts': { name: 'Jalen Hurts', sport: 'nfl', team: 'PHI' },
  'lamar': { name: 'Lamar Jackson', sport: 'nfl', team: 'BAL' },
  'lamar jackson': { name: 'Lamar Jackson', sport: 'nfl', team: 'BAL' },
  'burrow': { name: 'Joe Burrow', sport: 'nfl', team: 'CIN' },
  'joe burrow': { name: 'Joe Burrow', sport: 'nfl', team: 'CIN' },
  
  // NHL
  'mcdavid': { name: 'Connor McDavid', sport: 'nhl', team: 'EDM' },
  'connor mcdavid': { name: 'Connor McDavid', sport: 'nhl', team: 'EDM' },
  'mackinnon': { name: 'Nathan MacKinnon', sport: 'nhl', team: 'COL' },
  'draisaitl': { name: 'Leon Draisaitl', sport: 'nhl', team: 'EDM' },
  'matthews': { name: 'Auston Matthews', sport: 'nhl', team: 'TOR' },
  'auston matthews': { name: 'Auston Matthews', sport: 'nhl', team: 'TOR' },
  'crosby': { name: 'Sidney Crosby', sport: 'nhl', team: 'PIT' },
  'sidney crosby': { name: 'Sidney Crosby', sport: 'nhl', team: 'PIT' },
  'ovechkin': { name: 'Alex Ovechkin', sport: 'nhl', team: 'WSH' },
  
  // MLB
  'ohtani': { name: 'Shohei Ohtani', sport: 'mlb', team: 'LAD' },
  'shohei ohtani': { name: 'Shohei Ohtani', sport: 'mlb', team: 'LAD' },
  'judge': { name: 'Aaron Judge', sport: 'mlb', team: 'NYY' },
  'aaron judge': { name: 'Aaron Judge', sport: 'mlb', team: 'NYY' },
  'trout': { name: 'Mike Trout', sport: 'mlb', team: 'LAA' },
  'mike trout': { name: 'Mike Trout', sport: 'mlb', team: 'LAA' },
};

// ============ Intent Detection Patterns ============

const INTENT_PATTERNS: Array<{
  intent: ActionIntent;
  patterns: RegExp[];
  priority: number;
}> = [
  {
    intent: 'watch_game',
    patterns: [
      /add\s+(.+?)\s+(?:to\s+)?(?:my\s+)?watchboard/i,
      /watch\s+(?:the\s+)?(.+?)\s+game/i,
      /track\s+(?:the\s+)?(.+?)\s+game/i,
      /put\s+(.+?)\s+on\s+(?:my\s+)?watchboard/i,
      /watchboard\s+(.+)/i,
    ],
    priority: 1,
  },
  {
    intent: 'follow_team',
    patterns: [
      /follow\s+(?:the\s+)?(.+?)(?:\s+team)?$/i,
      /track\s+(?:the\s+)?(.+?)(?:\s+team)?$/i,
      /add\s+(.+?)\s+to\s+(?:my\s+)?(?:favorites|teams)/i,
    ],
    priority: 2,
  },
  {
    intent: 'follow_player',
    patterns: [
      /follow\s+(.+?)(?:\s+stats)?$/i,
      /track\s+(.+?)$/i,
      /add\s+(.+?)\s+to\s+(?:my\s+)?(?:tracked\s+)?players/i,
    ],
    priority: 3,
  },
  {
    intent: 'track_player',
    patterns: [
      /track\s+(.+?)(?:'s)?\s+(?:stats|props|performance)/i,
      /(.+?)\s+props/i,
      /watch\s+(.+?)(?:'s)?\s+(?:stats|numbers)/i,
    ],
    priority: 3,
  },
  {
    intent: 'open_odds',
    patterns: [
      /(?:show|see|view|check)\s+(?:me\s+)?odds/i,
      /odds\s+(?:for|on)\s+(.+)/i,
      /what(?:'s|\s+are)\s+the\s+odds/i,
      /betting\s+lines/i,
    ],
    priority: 4,
  },
  {
    intent: 'open_game',
    patterns: [
      /open\s+(?:the\s+)?(.+?)\s+game/i,
      /(?:show|see|view)\s+(?:me\s+)?(?:the\s+)?(.+?)\s+(?:game|match|matchup)/i,
      /go\s+to\s+(?:the\s+)?(.+?)\s+game/i,
    ],
    priority: 4,
  },
  {
    intent: 'build_parlay',
    patterns: [
      /build\s+(?:me\s+)?(?:a\s+)?parlay/i,
      /create\s+(?:a\s+)?parlay/i,
      /make\s+(?:me\s+)?(?:a\s+)?parlay/i,
      /parlay\s+builder/i,
      /suggest\s+(?:a\s+)?parlay/i,
    ],
    priority: 5,
  },
  {
    intent: 'show_sharp_radar',
    patterns: [
      /sharp\s+(?:money|action|bets?|radar)/i,
      /(?:show|where(?:'s)?)\s+(?:the\s+)?sharp/i,
      /professional\s+(?:money|action|bets?)/i,
      /where\s+(?:are\s+)?(?:the\s+)?sharps/i,
      /sharp\s+side/i,
    ],
    priority: 6,
  },
  {
    intent: 'show_value_bets',
    patterns: [
      /value\s+bets?/i,
      /best\s+value/i,
      /(?:show|find)\s+(?:me\s+)?value/i,
      /good\s+value/i,
      /undervalued/i,
    ],
    priority: 6,
  },
];

// ============ Intent Detection Function ============

export function detectIntent(message: string): DetectedAction {
  const lowerMessage = message.toLowerCase().trim();
  
  // Check each intent pattern
  for (const { intent, patterns, priority } of INTENT_PATTERNS.sort((a, b) => a.priority - b.priority)) {
    for (const pattern of patterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        const entities = extractEntities(lowerMessage, intent, match);
        const { route, confirmation } = getActionDetails(intent, entities);
        
        return {
          intent,
          confidence: 0.8 + (1 - priority * 0.05), // Higher priority = higher confidence
          entities,
          suggestedRoute: route,
          confirmationMessage: confirmation,
        };
      }
    }
  }
  
  // Check for entity mentions without explicit commands
  const teamMatch = findTeamInMessage(lowerMessage);
  const playerMatch = findPlayerInMessage(lowerMessage);
  
  if (teamMatch || playerMatch) {
    return {
      intent: 'none',
      confidence: 0.5,
      entities: {
        team: teamMatch?.name,
        player: playerMatch?.name,
        sport: teamMatch?.sport || playerMatch?.sport,
      },
      suggestedRoute: undefined,
      confirmationMessage: undefined,
    };
  }
  
  return {
    intent: 'none',
    confidence: 0,
    entities: {},
  };
}

// ============ Entity Extraction ============

function extractEntities(
  message: string, 
  intent: ActionIntent, 
  match: RegExpMatchArray
): DetectedAction['entities'] {
  const entities: DetectedAction['entities'] = {};
  
  // Extract captured group from pattern match
  const captured = match[1]?.trim();
  
  // Try to identify team or player from captured text
  if (captured) {
    const teamMatch = findTeamInMessage(captured);
    const playerMatch = findPlayerInMessage(captured);
    
    if (intent === 'follow_player' || intent === 'track_player') {
      if (playerMatch) {
        entities.player = playerMatch.name;
        entities.sport = playerMatch.sport;
        entities.team = playerMatch.team;
      } else {
        entities.player = captured;
      }
    } else if (intent === 'follow_team' || intent === 'watch_game') {
      if (teamMatch) {
        entities.team = teamMatch.name;
        entities.sport = teamMatch.sport;
      } else {
        entities.team = captured;
      }
    } else {
      // For other intents, try both
      if (teamMatch) {
        entities.team = teamMatch.name;
        entities.sport = teamMatch.sport;
      }
      if (playerMatch) {
        entities.player = playerMatch.name;
        entities.sport = playerMatch.sport;
      }
      if (!teamMatch && !playerMatch) {
        entities.game = captured;
      }
    }
  }
  
  // Also scan full message for additional context
  const fullTeamMatch = findTeamInMessage(message);
  const fullPlayerMatch = findPlayerInMessage(message);
  
  if (!entities.team && fullTeamMatch) {
    entities.team = fullTeamMatch.name;
    entities.sport = entities.sport || fullTeamMatch.sport;
  }
  if (!entities.player && fullPlayerMatch) {
    entities.player = fullPlayerMatch.name;
    entities.sport = entities.sport || fullPlayerMatch.sport;
  }
  
  return entities;
}

function findTeamInMessage(message: string): { name: string; sport: string; code: string } | null {
  const lower = message.toLowerCase();
  
  // Sort by length descending to match longer names first (e.g., "la lakers" before "lakers")
  const sortedAliases = Object.entries(TEAM_ALIASES).sort((a, b) => b[0].length - a[0].length);
  
  for (const [alias, info] of sortedAliases) {
    if (lower.includes(alias)) {
      return info;
    }
  }
  return null;
}

function findPlayerInMessage(message: string): { name: string; sport: string; team: string } | null {
  const lower = message.toLowerCase();
  
  // Sort by length descending
  const sortedAliases = Object.entries(PLAYER_ALIASES).sort((a, b) => b[0].length - a[0].length);
  
  for (const [alias, info] of sortedAliases) {
    if (lower.includes(alias)) {
      return info;
    }
  }
  return null;
}

// ============ Action Details ============

function getActionDetails(
  intent: ActionIntent,
  entities: DetectedAction['entities']
): { route?: string; confirmation?: string } {
  switch (intent) {
    case 'watch_game':
      return {
        route: '/watchboard',
        confirmation: entities.team 
          ? `${entities.team} added to your watchboard.`
          : 'Game added to your watchboard.',
      };
      
    case 'follow_team':
      return {
        route: entities.sport ? `/sports/${entities.sport}` : undefined,
        confirmation: entities.team
          ? `Now following ${entities.team}.`
          : 'Team added to your follows.',
      };
      
    case 'follow_player':
    case 'track_player':
      return {
        route: entities.sport && entities.player 
          ? `/sports/${entities.sport}/player/${encodeURIComponent(entities.player)}`
          : undefined,
        confirmation: entities.player
          ? `${entities.player} added to your tracked players.`
          : 'Player tracking enabled.',
      };
      
    case 'open_odds':
      return {
        route: '/odds',
        confirmation: undefined,
      };
      
    case 'open_game':
      return {
        route: entities.sport ? `/sports/${entities.sport}` : '/games',
        confirmation: undefined,
      };
      
    case 'build_parlay':
      return {
        route: '/bet-builder',
        confirmation: 'Opening Bet Builder with suggested picks.',
      };
      
    case 'show_sharp_radar':
      return {
        route: '/odds#sharp-radar',
        confirmation: undefined,
      };
      
    case 'show_value_bets':
      return {
        route: '/odds#value-bets',
        confirmation: undefined,
      };
      
    default:
      return {};
  }
}

// ============ Generate Action Buttons ============

export function generateActionButtons(
  response: string,
  detectedAction: DetectedAction
): ActionButton[] {
  const buttons: ActionButton[] = [];
  const { entities } = detectedAction;
  
  // If there's a detected intent with high confidence, show the primary action
  if (detectedAction.intent !== 'none' && detectedAction.confidence > 0.6) {
    const primaryButton = getPrimaryButton(detectedAction);
    if (primaryButton) {
      buttons.push(primaryButton);
    }
  }
  
  // Add contextual buttons based on entities mentioned
  if (entities.team) {
    // If a team is mentioned, offer relevant actions
    if (!buttons.some(b => b.action === 'watch_game')) {
      buttons.push({
        label: 'Add to Watchboard',
        action: 'watch_game',
        data: { team: entities.team, sport: entities.sport || '' },
        variant: 'secondary',
      });
    }
    
    buttons.push({
      label: 'See Odds',
      action: 'open_odds',
      route: '/odds',
      data: { team: entities.team },
      variant: 'outline',
    });
  }
  
  if (entities.player) {
    if (!buttons.some(b => b.action === 'track_player' || b.action === 'follow_player')) {
      buttons.push({
        label: 'Track Player',
        action: 'track_player',
        route: entities.sport 
          ? `/sports/${entities.sport}/player/${encodeURIComponent(entities.player)}`
          : undefined,
        data: { player: entities.player, sport: entities.sport || '' },
        variant: 'secondary',
      });
    }
  }
  
  // Check response content for additional button suggestions
  const responseLower = response.toLowerCase();
  
  if (responseLower.includes('best game') || responseLower.includes('prime time') || responseLower.includes('featured')) {
    if (!buttons.some(b => b.action === 'watch_game')) {
      buttons.push({
        label: 'Watch Game',
        action: 'watch_game',
        variant: 'secondary',
      });
    }
  }
  
  if (responseLower.includes('sharp') || responseLower.includes('professional')) {
    if (!buttons.some(b => b.action === 'show_sharp_radar')) {
      buttons.push({
        label: 'Sharp Radar',
        action: 'show_sharp_radar',
        route: '/odds#sharp-radar',
        variant: 'outline',
      });
    }
  }
  
  if (responseLower.includes('parlay') || responseLower.includes('combo')) {
    if (!buttons.some(b => b.action === 'build_parlay')) {
      buttons.push({
        label: 'Build Parlay',
        action: 'build_parlay',
        route: '/bet-builder',
        variant: 'outline',
      });
    }
  }
  
  // Limit to 3 buttons max
  return buttons.slice(0, 3);
}

function getPrimaryButton(action: DetectedAction): ActionButton | null {
  const { intent, entities, suggestedRoute } = action;
  
  switch (intent) {
    case 'watch_game':
      return {
        label: entities.team ? `Watch ${entities.team}` : 'Add to Watchboard',
        action: intent,
        route: suggestedRoute,
        data: { team: entities.team || '', sport: entities.sport || '' },
        variant: 'primary',
      };
      
    case 'follow_team':
      return {
        label: entities.team ? `Follow ${entities.team}` : 'Follow Team',
        action: intent,
        route: suggestedRoute,
        data: { team: entities.team || '', sport: entities.sport || '' },
        variant: 'primary',
      };
      
    case 'follow_player':
    case 'track_player':
      return {
        label: entities.player ? `Track ${entities.player}` : 'Track Player',
        action: intent,
        route: suggestedRoute,
        data: { player: entities.player || '', sport: entities.sport || '' },
        variant: 'primary',
      };
      
    case 'build_parlay':
      return {
        label: 'Open Bet Builder',
        action: intent,
        route: suggestedRoute,
        variant: 'primary',
      };
      
    case 'show_sharp_radar':
      return {
        label: 'Sharp Radar',
        action: intent,
        route: suggestedRoute,
        variant: 'primary',
      };
      
    case 'show_value_bets':
      return {
        label: 'Value Bets',
        action: intent,
        route: suggestedRoute,
        variant: 'primary',
      };
      
    case 'open_odds':
      return {
        label: 'View Odds',
        action: intent,
        route: suggestedRoute,
        variant: 'primary',
      };
      
    case 'open_game':
      return {
        label: entities.team ? `Open ${entities.team} Game` : 'View Game',
        action: intent,
        route: suggestedRoute,
        variant: 'primary',
      };
      
    default:
      return null;
  }
}

// ============ Execute Action ============

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  navigateTo?: string;
}

export async function executeAction(
  action: ActionButton,
  _userId?: string,
  addToWatchboard?: (gameId: string) => Promise<void>,
  _trackPlayer?: (playerId: string, playerName: string) => Promise<void>
): Promise<ActionExecutionResult> {
  switch (action.action) {
    case 'watch_game':
      if (addToWatchboard && action.data?.team) {
        // For now, return navigation - actual watchboard add needs game ID
        return {
          success: true,
          message: `${action.data.team} games will be shown on your watchboard.`,
          navigateTo: '/watchboard',
        };
      }
      return {
        success: true,
        message: 'Opening watchboard.',
        navigateTo: '/watchboard',
      };
      
    case 'follow_player':
    case 'track_player':
      if (_trackPlayer && action.data?.player) {
        // For now, navigate to player page
        return {
          success: true,
          message: `${action.data.player} tracking enabled.`,
          navigateTo: action.route,
        };
      }
      return {
        success: true,
        message: 'Opening player page.',
        navigateTo: action.route || '/games',
      };
      
    case 'build_parlay':
      return {
        success: true,
        message: 'Opening Bet Builder.',
        navigateTo: '/bet-builder',
      };
      
    case 'show_sharp_radar':
      return {
        success: true,
        message: 'Showing sharp money indicators.',
        navigateTo: '/odds',
      };
      
    case 'show_value_bets':
      return {
        success: true,
        message: 'Showing value bets.',
        navigateTo: '/odds',
      };
      
    case 'open_odds':
      return {
        success: true,
        message: 'Opening odds page.',
        navigateTo: '/odds',
      };
      
    case 'open_game':
      return {
        success: true,
        message: 'Opening game.',
        navigateTo: action.route || '/games',
      };
      
    case 'follow_team':
      return {
        success: true,
        message: action.data?.team ? `Following ${action.data.team}.` : 'Team followed.',
        navigateTo: action.route,
      };
      
    default:
      return {
        success: false,
        message: 'Unknown action.',
      };
  }
}
