/**
 * Team Colors Database
 * Maps team identifiers to primary/secondary colors for all major sports
 * Used for dynamic theming in team profiles, standings, and game cards
 */

export interface TeamColors {
  primary: string;
  secondary: string;
  accent?: string;
}

// Default colors when team not found
export const DEFAULT_TEAM_COLORS: TeamColors = {
  primary: '#3B82F6',
  secondary: '#1E40AF'
};

// ============================================
// NBA TEAM COLORS (30 teams)
// ============================================
const NBA_COLORS: Record<string, TeamColors> = {
  // Atlantic Division
  'BOS': { primary: '#007A33', secondary: '#BA9653' }, // Celtics
  'BKN': { primary: '#000000', secondary: '#FFFFFF' }, // Nets
  'NYK': { primary: '#006BB6', secondary: '#F58426' }, // Knicks
  'PHI': { primary: '#006BB6', secondary: '#ED174C' }, // 76ers
  'TOR': { primary: '#CE1141', secondary: '#000000' }, // Raptors
  
  // Central Division
  'CHI': { primary: '#CE1141', secondary: '#000000' }, // Bulls
  'CLE': { primary: '#860038', secondary: '#FDBB30' }, // Cavaliers
  'DET': { primary: '#C8102E', secondary: '#1D42BA' }, // Pistons
  'IND': { primary: '#002D62', secondary: '#FDBB30' }, // Pacers
  'MIL': { primary: '#00471B', secondary: '#EEE1C6' }, // Bucks
  
  // Southeast Division
  'ATL': { primary: '#E03A3E', secondary: '#C1D32F' }, // Hawks
  'CHA': { primary: '#1D1160', secondary: '#00788C' }, // Hornets
  'MIA': { primary: '#98002E', secondary: '#F9A01B' }, // Heat
  'ORL': { primary: '#0077C0', secondary: '#C4CED4' }, // Magic
  'WAS': { primary: '#002B5C', secondary: '#E31837' }, // Wizards
  
  // Northwest Division
  'DEN': { primary: '#0E2240', secondary: '#FEC524' }, // Nuggets
  'MIN': { primary: '#0C2340', secondary: '#236192' }, // Timberwolves
  'OKC': { primary: '#007AC1', secondary: '#EF3B24' }, // Thunder
  'POR': { primary: '#E03A3E', secondary: '#000000' }, // Trail Blazers
  'UTA': { primary: '#002B5C', secondary: '#00471B' }, // Jazz
  
  // Pacific Division
  'GSW': { primary: '#1D428A', secondary: '#FFC72C' }, // Warriors
  'LAC': { primary: '#C8102E', secondary: '#1D428A' }, // Clippers
  'LAL': { primary: '#552583', secondary: '#FDB927' }, // Lakers
  'PHX': { primary: '#1D1160', secondary: '#E56020' }, // Suns
  'SAC': { primary: '#5A2D81', secondary: '#63727A' }, // Kings
  
  // Southwest Division
  'DAL': { primary: '#00538C', secondary: '#002B5E' }, // Mavericks
  'HOU': { primary: '#CE1141', secondary: '#000000' }, // Rockets
  'MEM': { primary: '#5D76A9', secondary: '#12173F' }, // Grizzlies
  'NOP': { primary: '#0C2340', secondary: '#C8102E' }, // Pelicans
  'SAS': { primary: '#C4CED4', secondary: '#000000' }, // Spurs
};

// ============================================
// NFL TEAM COLORS (32 teams)
// ============================================
const NFL_COLORS: Record<string, TeamColors> = {
  // AFC East
  'BUF': { primary: '#00338D', secondary: '#C60C30' }, // Bills
  'MIA': { primary: '#008E97', secondary: '#FC4C02' }, // Dolphins
  'NE': { primary: '#002244', secondary: '#C60C30' }, // Patriots
  'NYJ': { primary: '#125740', secondary: '#000000' }, // Jets
  
  // AFC North
  'BAL': { primary: '#241773', secondary: '#000000' }, // Ravens
  'CIN': { primary: '#FB4F14', secondary: '#000000' }, // Bengals
  'CLE': { primary: '#311D00', secondary: '#FF3C00' }, // Browns
  'PIT': { primary: '#FFB612', secondary: '#101820' }, // Steelers
  
  // AFC South
  'HOU': { primary: '#03202F', secondary: '#A71930' }, // Texans
  'IND': { primary: '#002C5F', secondary: '#A2AAAD' }, // Colts
  'JAX': { primary: '#006778', secondary: '#9F792C' }, // Jaguars
  'TEN': { primary: '#0C2340', secondary: '#4B92DB' }, // Titans
  
  // AFC West
  'DEN': { primary: '#FB4F14', secondary: '#002244' }, // Broncos
  'KC': { primary: '#E31837', secondary: '#FFB81C' }, // Chiefs
  'LV': { primary: '#000000', secondary: '#A5ACAF' }, // Raiders
  'LAC': { primary: '#0080C6', secondary: '#FFC20E' }, // Chargers
  
  // NFC East
  'DAL': { primary: '#003594', secondary: '#869397' }, // Cowboys
  'NYG': { primary: '#0B2265', secondary: '#A71930' }, // Giants
  'PHI': { primary: '#004C54', secondary: '#A5ACAF' }, // Eagles
  'WAS': { primary: '#5A1414', secondary: '#FFB612' }, // Commanders
  
  // NFC North
  'CHI': { primary: '#0B162A', secondary: '#C83803' }, // Bears
  'DET': { primary: '#0076B6', secondary: '#B0B7BC' }, // Lions
  'GB': { primary: '#203731', secondary: '#FFB612' }, // Packers
  'MIN': { primary: '#4F2683', secondary: '#FFC62F' }, // Vikings
  
  // NFC South
  'ATL': { primary: '#A71930', secondary: '#000000' }, // Falcons
  'CAR': { primary: '#0085CA', secondary: '#101820' }, // Panthers
  'NO': { primary: '#D3BC8D', secondary: '#101820' }, // Saints
  'TB': { primary: '#D50A0A', secondary: '#FF7900' }, // Buccaneers
  
  // NFC West
  'ARI': { primary: '#97233F', secondary: '#000000' }, // Cardinals
  'LAR': { primary: '#003594', secondary: '#FFA300' }, // Rams
  'SF': { primary: '#AA0000', secondary: '#B3995D' }, // 49ers
  'SEA': { primary: '#002244', secondary: '#69BE28' }, // Seahawks
};

// ============================================
// MLB TEAM COLORS (30 teams)
// ============================================
const MLB_COLORS: Record<string, TeamColors> = {
  // AL East
  'BAL': { primary: '#DF4601', secondary: '#000000' }, // Orioles
  'BOS': { primary: '#BD3039', secondary: '#0C2340' }, // Red Sox
  'NYY': { primary: '#003087', secondary: '#E4002C' }, // Yankees
  'TB': { primary: '#092C5C', secondary: '#8FBCE6' }, // Rays
  'TOR': { primary: '#134A8E', secondary: '#E8291C' }, // Blue Jays
  
  // AL Central
  'CWS': { primary: '#27251F', secondary: '#C4CED4' }, // White Sox
  'CLE': { primary: '#00385D', secondary: '#E50022' }, // Guardians
  'DET': { primary: '#0C2340', secondary: '#FA4616' }, // Tigers
  'KC': { primary: '#004687', secondary: '#BD9B60' }, // Royals
  'MIN': { primary: '#002B5C', secondary: '#D31145' }, // Twins
  
  // AL West
  'HOU': { primary: '#002D62', secondary: '#EB6E1F' }, // Astros
  'LAA': { primary: '#BA0021', secondary: '#003263' }, // Angels
  'OAK': { primary: '#003831', secondary: '#EFB21E' }, // Athletics
  'SEA': { primary: '#0C2C56', secondary: '#005C5C' }, // Mariners
  'TEX': { primary: '#003278', secondary: '#C0111F' }, // Rangers
  
  // NL East
  'ATL': { primary: '#CE1141', secondary: '#13274F' }, // Braves
  'MIA': { primary: '#00A3E0', secondary: '#EF3340' }, // Marlins
  'NYM': { primary: '#002D72', secondary: '#FF5910' }, // Mets
  'PHI': { primary: '#E81828', secondary: '#002D72' }, // Phillies
  'WSH': { primary: '#AB0003', secondary: '#14225A' }, // Nationals
  
  // NL Central
  'CHC': { primary: '#0E3386', secondary: '#CC3433' }, // Cubs
  'CIN': { primary: '#C6011F', secondary: '#000000' }, // Reds
  'MIL': { primary: '#12284B', secondary: '#B6922E' }, // Brewers
  'PIT': { primary: '#27251F', secondary: '#FDB827' }, // Pirates
  'STL': { primary: '#C41E3A', secondary: '#0C2340' }, // Cardinals
  
  // NL West
  'ARI': { primary: '#A71930', secondary: '#E3D4AD' }, // Diamondbacks
  'COL': { primary: '#33006F', secondary: '#C4CED4' }, // Rockies
  'LAD': { primary: '#005A9C', secondary: '#EF3E42' }, // Dodgers
  'SD': { primary: '#2F241D', secondary: '#FFC425' }, // Padres
  'SF': { primary: '#FD5A1E', secondary: '#27251F' }, // Giants
};

// ============================================
// NHL TEAM COLORS (32 teams)
// ============================================
const NHL_COLORS: Record<string, TeamColors> = {
  // Atlantic Division
  'BOS': { primary: '#FFB81C', secondary: '#000000' }, // Bruins
  'BUF': { primary: '#002654', secondary: '#FCB514' }, // Sabres
  'DET': { primary: '#CE1126', secondary: '#FFFFFF' }, // Red Wings
  'FLA': { primary: '#041E42', secondary: '#C8102E' }, // Panthers
  'MTL': { primary: '#AF1E2D', secondary: '#192168' }, // Canadiens
  'OTT': { primary: '#C52032', secondary: '#C2912C' }, // Senators
  'TB': { primary: '#002868', secondary: '#FFFFFF' }, // Lightning
  'TOR': { primary: '#00205B', secondary: '#FFFFFF' }, // Maple Leafs
  
  // Metropolitan Division
  'CAR': { primary: '#CC0000', secondary: '#000000' }, // Hurricanes
  'CBJ': { primary: '#002654', secondary: '#CE1126' }, // Blue Jackets
  'NJ': { primary: '#CE1126', secondary: '#000000' }, // Devils
  'NYI': { primary: '#00539B', secondary: '#F47D30' }, // Islanders
  'NYR': { primary: '#0038A8', secondary: '#CE1126' }, // Rangers
  'PHI': { primary: '#F74902', secondary: '#000000' }, // Flyers
  'PIT': { primary: '#FCB514', secondary: '#000000' }, // Penguins
  'WSH': { primary: '#C8102E', secondary: '#041E42' }, // Capitals
  
  // Central Division
  'ARI': { primary: '#8C2633', secondary: '#E2D6B5' }, // Coyotes (Utah)
  'CHI': { primary: '#CF0A2C', secondary: '#000000' }, // Blackhawks
  'COL': { primary: '#6F263D', secondary: '#236192' }, // Avalanche
  'DAL': { primary: '#006847', secondary: '#8F8F8C' }, // Stars
  'MIN': { primary: '#154734', secondary: '#A6192E' }, // Wild
  'NSH': { primary: '#FFB81C', secondary: '#041E42' }, // Predators
  'STL': { primary: '#002F87', secondary: '#FCB514' }, // Blues
  'WPG': { primary: '#041E42', secondary: '#004C97' }, // Jets
  
  // Pacific Division
  'ANA': { primary: '#F47A38', secondary: '#B9975B' }, // Ducks
  'CGY': { primary: '#C8102E', secondary: '#F1BE48' }, // Flames
  'EDM': { primary: '#041E42', secondary: '#FF4C00' }, // Oilers
  'LA': { primary: '#111111', secondary: '#A2AAAD' }, // Kings
  'SJ': { primary: '#006D75', secondary: '#EA7200' }, // Sharks
  'SEA': { primary: '#001628', secondary: '#99D9D9' }, // Kraken
  'VAN': { primary: '#00205B', secondary: '#00843D' }, // Canucks
  'VGK': { primary: '#B4975A', secondary: '#333F42' }, // Golden Knights
};

// ============================================
// NCAAB TEAM COLORS (Major programs)
// ============================================
const NCAAB_COLORS: Record<string, TeamColors> = {
  'DUKE': { primary: '#003087', secondary: '#FFFFFF' },
  'UNC': { primary: '#7BAFD4', secondary: '#13294B' },
  'UK': { primary: '#0033A0', secondary: '#FFFFFF' }, // Kentucky
  'KU': { primary: '#0051BA', secondary: '#E8000D' }, // Kansas
  'GONZ': { primary: '#002967', secondary: '#C8102E' },
  'ARIZ': { primary: '#CC0033', secondary: '#003366' },
  'UCLA': { primary: '#2D68C4', secondary: '#F2A900' },
  'VILL': { primary: '#00205B', secondary: '#13B5EA' },
  'MICH': { primary: '#00274C', secondary: '#FFCB05' },
  'MSU': { primary: '#18453B', secondary: '#FFFFFF' }, // Michigan State
  'OSU': { primary: '#BB0000', secondary: '#666666' }, // Ohio State
  'IU': { primary: '#990000', secondary: '#EEEDEB' }, // Indiana
  'TENN': { primary: '#FF8200', secondary: '#FFFFFF' },
  'AUB': { primary: '#0C2340', secondary: '#E87722' },
  'ALA': { primary: '#9E1B32', secondary: '#828A8F' },
  'PUR': { primary: '#CEB888', secondary: '#000000' }, // Purdue
  'CONN': { primary: '#002868', secondary: '#FFFFFF' }, // UConn
  'HOUS': { primary: '#C8102E', secondary: '#FFFFFF' },
  'CREI': { primary: '#005CA9', secondary: '#FFFFFF' },
  'BAY': { primary: '#154734', secondary: '#FFB81C' }, // Baylor
  'TEX': { primary: '#BF5700', secondary: '#FFFFFF' },
  'ISU': { primary: '#C8102E', secondary: '#F1BE48' }, // Iowa State
  'MARQ': { primary: '#003366', secondary: '#FFCC00' },
  'ARK': { primary: '#9D2235', secondary: '#FFFFFF' },
  'FLA': { primary: '#0021A5', secondary: '#FA4616' },
  'LSU': { primary: '#461D7C', secondary: '#FDD023' },
};

// ============================================
// NCAAF TEAM COLORS (Major programs)
// ============================================
const NCAAF_COLORS: Record<string, TeamColors> = {
  'ALA': { primary: '#9E1B32', secondary: '#828A8F' }, // Alabama
  'OSU': { primary: '#BB0000', secondary: '#666666' }, // Ohio State
  'UGA': { primary: '#BA0C2F', secondary: '#000000' }, // Georgia
  'MICH': { primary: '#00274C', secondary: '#FFCB05' },
  'TEX': { primary: '#BF5700', secondary: '#FFFFFF' },
  'OU': { primary: '#841617', secondary: '#FDF9D8' }, // Oklahoma
  'CLEM': { primary: '#F56600', secondary: '#522D80' }, // Clemson
  'LSU': { primary: '#461D7C', secondary: '#FDD023' },
  'USC': { primary: '#990000', secondary: '#FFC72C' },
  'ND': { primary: '#0C2340', secondary: '#C99700' }, // Notre Dame
  'PSU': { primary: '#041E42', secondary: '#FFFFFF' }, // Penn State
  'FSU': { primary: '#782F40', secondary: '#CEB888' }, // Florida State
  'ORE': { primary: '#154733', secondary: '#FEE123' }, // Oregon
  'WASH': { primary: '#4B2E83', secondary: '#B7A57A' },
  'TENN': { primary: '#FF8200', secondary: '#FFFFFF' },
  'AUB': { primary: '#0C2340', secondary: '#E87722' },
  'FLA': { primary: '#0021A5', secondary: '#FA4616' },
  'MIAMI': { primary: '#F47321', secondary: '#005030' },
  'NCST': { primary: '#CC0000', secondary: '#000000' }, // NC State
  'WISC': { primary: '#C5050C', secondary: '#FFFFFF' },
  'IOWA': { primary: '#FFCD00', secondary: '#000000' },
  'MSU': { primary: '#18453B', secondary: '#FFFFFF' }, // Michigan State
  'NEB': { primary: '#E41C38', secondary: '#FFFFFF' },
  'ARK': { primary: '#9D2235', secondary: '#FFFFFF' },
  'UTAH': { primary: '#CC0000', secondary: '#000000' },
  'COLO': { primary: '#CFB87C', secondary: '#000000' },
};

// ============================================
// LOOKUP FUNCTIONS
// ============================================

/**
 * Get team colors by sport and team identifier (abbreviation or alias)
 */
export function getTeamColors(sport: string, teamId: string): TeamColors {
  const normalizedSport = sport.toUpperCase();
  const normalizedTeam = teamId.toUpperCase();
  
  let colors: TeamColors | undefined;
  
  switch (normalizedSport) {
    case 'NBA':
      colors = NBA_COLORS[normalizedTeam];
      break;
    case 'NFL':
      colors = NFL_COLORS[normalizedTeam];
      break;
    case 'MLB':
      colors = MLB_COLORS[normalizedTeam];
      break;
    case 'NHL':
      colors = NHL_COLORS[normalizedTeam];
      break;
    case 'NCAAB':
      colors = NCAAB_COLORS[normalizedTeam];
      break;
    case 'NCAAF':
      colors = NCAAF_COLORS[normalizedTeam];
      break;
  }
  
  return colors || DEFAULT_TEAM_COLORS;
}

/**
 * Get all team colors for a sport (useful for standings pages)
 */
export function getAllTeamColors(sport: string): Record<string, TeamColors> {
  const normalizedSport = sport.toUpperCase();
  
  switch (normalizedSport) {
    case 'NBA':
      return NBA_COLORS;
    case 'NFL':
      return NFL_COLORS;
    case 'MLB':
      return MLB_COLORS;
    case 'NHL':
      return NHL_COLORS;
    case 'NCAAB':
      return NCAAB_COLORS;
    case 'NCAAF':
      return NCAAF_COLORS;
    default:
      return {};
  }
}

/**
 * Get a gradient CSS string from team colors
 */
export function getTeamGradient(colors: TeamColors, angle: number = 135): string {
  return `linear-gradient(${angle}deg, ${colors.primary}40 0%, ${colors.primary}10 30%, transparent 60%)`;
}

/**
 * Get contrasting text color for a background
 */
export function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
