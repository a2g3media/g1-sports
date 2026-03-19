/**
 * Team Colors Database
 * Primary and secondary colors for all major sports teams
 * Used by TeamBadge for authentic team styling
 */

export interface TeamColors {
  primary: string;    // Main team color (hex)
  secondary: string;  // Accent color (hex)
  text?: string;      // Override text color if needed
}

// NFL Team Colors
export const NFL_COLORS: Record<string, TeamColors> = {
  // AFC East
  "Buffalo Bills": { primary: "#00338D", secondary: "#C60C30" },
  "Miami Dolphins": { primary: "#008E97", secondary: "#FC4C02" },
  "New England Patriots": { primary: "#002244", secondary: "#C60C30" },
  "New York Jets": { primary: "#125740", secondary: "#000000" },
  
  // AFC North
  "Baltimore Ravens": { primary: "#241773", secondary: "#9E7C0C" },
  "Cincinnati Bengals": { primary: "#FB4F14", secondary: "#000000" },
  "Cleveland Browns": { primary: "#311D00", secondary: "#FF3C00" },
  "Pittsburgh Steelers": { primary: "#FFB612", secondary: "#101820", text: "#101820" },
  
  // AFC South
  "Houston Texans": { primary: "#03202F", secondary: "#A71930" },
  "Indianapolis Colts": { primary: "#002C5F", secondary: "#A2AAAD" },
  "Jacksonville Jaguars": { primary: "#006778", secondary: "#D7A22A" },
  "Tennessee Titans": { primary: "#0C2340", secondary: "#4B92DB" },
  
  // AFC West
  "Denver Broncos": { primary: "#FB4F14", secondary: "#002244" },
  "Kansas City Chiefs": { primary: "#E31837", secondary: "#FFB81C" },
  "Las Vegas Raiders": { primary: "#000000", secondary: "#A5ACAF" },
  "Los Angeles Chargers": { primary: "#0080C6", secondary: "#FFC20E" },
  
  // NFC East
  "Dallas Cowboys": { primary: "#003594", secondary: "#869397" },
  "New York Giants": { primary: "#0B2265", secondary: "#A71930" },
  "Philadelphia Eagles": { primary: "#004C54", secondary: "#A5ACAF" },
  "Washington Commanders": { primary: "#5A1414", secondary: "#FFB612" },
  
  // NFC North
  "Chicago Bears": { primary: "#0B162A", secondary: "#C83803" },
  "Detroit Lions": { primary: "#0076B6", secondary: "#B0B7BC" },
  "Green Bay Packers": { primary: "#203731", secondary: "#FFB612" },
  "Minnesota Vikings": { primary: "#4F2683", secondary: "#FFC62F" },
  
  // NFC South
  "Atlanta Falcons": { primary: "#A71930", secondary: "#000000" },
  "Carolina Panthers": { primary: "#0085CA", secondary: "#101820" },
  "New Orleans Saints": { primary: "#D3BC8D", secondary: "#101820", text: "#101820" },
  "Tampa Bay Buccaneers": { primary: "#D50A0A", secondary: "#34302B" },
  
  // NFC West
  "Arizona Cardinals": { primary: "#97233F", secondary: "#000000" },
  "Los Angeles Rams": { primary: "#003594", secondary: "#FFA300" },
  "San Francisco 49ers": { primary: "#AA0000", secondary: "#B3995D" },
  "Seattle Seahawks": { primary: "#002244", secondary: "#69BE28" },
};

// NBA Team Colors
export const NBA_COLORS: Record<string, TeamColors> = {
  "Atlanta Hawks": { primary: "#E03A3E", secondary: "#C1D32F" },
  "Boston Celtics": { primary: "#007A33", secondary: "#BA9653" },
  "Brooklyn Nets": { primary: "#000000", secondary: "#FFFFFF" },
  "Charlotte Hornets": { primary: "#1D1160", secondary: "#00788C" },
  "Chicago Bulls": { primary: "#CE1141", secondary: "#000000" },
  "Cleveland Cavaliers": { primary: "#860038", secondary: "#FDBB30" },
  "Dallas Mavericks": { primary: "#00538C", secondary: "#002B5E" },
  "Denver Nuggets": { primary: "#0E2240", secondary: "#FEC524" },
  "Detroit Pistons": { primary: "#C8102E", secondary: "#1D42BA" },
  "Golden State Warriors": { primary: "#1D428A", secondary: "#FFC72C" },
  "Houston Rockets": { primary: "#CE1141", secondary: "#000000" },
  "Indiana Pacers": { primary: "#002D62", secondary: "#FDBB30" },
  "LA Clippers": { primary: "#C8102E", secondary: "#1D428A" },
  "Los Angeles Lakers": { primary: "#552583", secondary: "#FDB927" },
  "Memphis Grizzlies": { primary: "#5D76A9", secondary: "#12173F" },
  "Miami Heat": { primary: "#98002E", secondary: "#F9A01B" },
  "Milwaukee Bucks": { primary: "#00471B", secondary: "#EEE1C6" },
  "Minnesota Timberwolves": { primary: "#0C2340", secondary: "#236192" },
  "New Orleans Pelicans": { primary: "#0C2340", secondary: "#C8102E" },
  "New York Knicks": { primary: "#006BB6", secondary: "#F58426" },
  "Oklahoma City Thunder": { primary: "#007AC1", secondary: "#EF3B24" },
  "Orlando Magic": { primary: "#0077C0", secondary: "#C4CED4" },
  "Philadelphia 76ers": { primary: "#006BB6", secondary: "#ED174C" },
  "Phoenix Suns": { primary: "#1D1160", secondary: "#E56020" },
  "Portland Trail Blazers": { primary: "#E03A3E", secondary: "#000000" },
  "Sacramento Kings": { primary: "#5A2D81", secondary: "#63727A" },
  "San Antonio Spurs": { primary: "#C4CED4", secondary: "#000000", text: "#000000" },
  "Toronto Raptors": { primary: "#CE1141", secondary: "#000000" },
  "Utah Jazz": { primary: "#002B5C", secondary: "#00471B" },
  "Washington Wizards": { primary: "#002B5C", secondary: "#E31837" },
};

// MLB Team Colors
export const MLB_COLORS: Record<string, TeamColors> = {
  "Arizona Diamondbacks": { primary: "#A71930", secondary: "#E3D4AD" },
  "Atlanta Braves": { primary: "#CE1141", secondary: "#13274F" },
  "Baltimore Orioles": { primary: "#DF4601", secondary: "#000000" },
  "Boston Red Sox": { primary: "#BD3039", secondary: "#0C2340" },
  "Chicago Cubs": { primary: "#0E3386", secondary: "#CC3433" },
  "Chicago White Sox": { primary: "#27251F", secondary: "#C4CED4" },
  "Cincinnati Reds": { primary: "#C6011F", secondary: "#000000" },
  "Cleveland Guardians": { primary: "#00385D", secondary: "#E50022" },
  "Colorado Rockies": { primary: "#333366", secondary: "#C4CED4" },
  "Detroit Tigers": { primary: "#0C2340", secondary: "#FA4616" },
  "Houston Astros": { primary: "#002D62", secondary: "#EB6E1F" },
  "Kansas City Royals": { primary: "#004687", secondary: "#BD9B60" },
  "Los Angeles Angels": { primary: "#BA0021", secondary: "#003263" },
  "Los Angeles Dodgers": { primary: "#005A9C", secondary: "#EF3E42" },
  "Miami Marlins": { primary: "#00A3E0", secondary: "#EF3340" },
  "Milwaukee Brewers": { primary: "#12284B", secondary: "#B6922E" },
  "Minnesota Twins": { primary: "#002B5C", secondary: "#D31145" },
  "New York Mets": { primary: "#002D72", secondary: "#FF5910" },
  "New York Yankees": { primary: "#003087", secondary: "#E4002C" },
  "Oakland Athletics": { primary: "#003831", secondary: "#EFB21E" },
  "Philadelphia Phillies": { primary: "#E81828", secondary: "#002D72" },
  "Pittsburgh Pirates": { primary: "#27251F", secondary: "#FDB827" },
  "San Diego Padres": { primary: "#2F241D", secondary: "#FFC425" },
  "San Francisco Giants": { primary: "#FD5A1E", secondary: "#27251F" },
  "Seattle Mariners": { primary: "#0C2C56", secondary: "#005C5C" },
  "St. Louis Cardinals": { primary: "#C41E3A", secondary: "#0C2340" },
  "Tampa Bay Rays": { primary: "#092C5C", secondary: "#8FBCE6" },
  "Texas Rangers": { primary: "#003278", secondary: "#C0111F" },
  "Toronto Blue Jays": { primary: "#134A8E", secondary: "#E8291C" },
  "Washington Nationals": { primary: "#AB0003", secondary: "#14225A" },
};

// NHL Team Colors
export const NHL_COLORS: Record<string, TeamColors> = {
  "Anaheim Ducks": { primary: "#F47A38", secondary: "#B9975B" },
  "Arizona Coyotes": { primary: "#8C2633", secondary: "#E2D6B5" },
  "Boston Bruins": { primary: "#FFB81C", secondary: "#000000", text: "#000000" },
  "Buffalo Sabres": { primary: "#002654", secondary: "#FCB514" },
  "Calgary Flames": { primary: "#C8102E", secondary: "#F1BE48" },
  "Carolina Hurricanes": { primary: "#CC0000", secondary: "#000000" },
  "Chicago Blackhawks": { primary: "#CF0A2C", secondary: "#000000" },
  "Colorado Avalanche": { primary: "#6F263D", secondary: "#236192" },
  "Columbus Blue Jackets": { primary: "#002654", secondary: "#CE1126" },
  "Dallas Stars": { primary: "#006847", secondary: "#8F8F8C" },
  "Detroit Red Wings": { primary: "#CE1126", secondary: "#FFFFFF" },
  "Edmonton Oilers": { primary: "#041E42", secondary: "#FF4C00" },
  "Florida Panthers": { primary: "#041E42", secondary: "#C8102E" },
  "Los Angeles Kings": { primary: "#111111", secondary: "#A2AAAD" },
  "Minnesota Wild": { primary: "#154734", secondary: "#A6192E" },
  "Montreal Canadiens": { primary: "#AF1E2D", secondary: "#192168" },
  "Nashville Predators": { primary: "#FFB81C", secondary: "#041E42", text: "#041E42" },
  "New Jersey Devils": { primary: "#CE1126", secondary: "#000000" },
  "New York Islanders": { primary: "#00539B", secondary: "#F47D30" },
  "New York Rangers": { primary: "#0038A8", secondary: "#CE1126" },
  "Ottawa Senators": { primary: "#C52032", secondary: "#C2912C" },
  "Philadelphia Flyers": { primary: "#F74902", secondary: "#000000" },
  "Pittsburgh Penguins": { primary: "#000000", secondary: "#FCB514" },
  "San Jose Sharks": { primary: "#006D75", secondary: "#EA7200" },
  "Seattle Kraken": { primary: "#001628", secondary: "#99D9D9" },
  "St. Louis Blues": { primary: "#002F87", secondary: "#FCB514" },
  "Tampa Bay Lightning": { primary: "#002868", secondary: "#FFFFFF" },
  "Toronto Maple Leafs": { primary: "#00205B", secondary: "#FFFFFF" },
  "Vancouver Canucks": { primary: "#00205B", secondary: "#00843D" },
  "Vegas Golden Knights": { primary: "#B4975A", secondary: "#333F42", text: "#333F42" },
  "Washington Capitals": { primary: "#041E42", secondary: "#C8102E" },
  "Winnipeg Jets": { primary: "#041E42", secondary: "#004C97" },
};

// Combined lookup for all sports
const ALL_TEAM_COLORS: Record<string, TeamColors> = {
  ...NFL_COLORS,
  ...NBA_COLORS,
  ...MLB_COLORS,
  ...NHL_COLORS,
};

/**
 * Get team colors by full team name
 */
export function getTeamColors(teamName: string): TeamColors | null {
  return ALL_TEAM_COLORS[teamName] || null;
}

/**
 * Get CSS gradient for team (diagonal from primary to secondary)
 */
export function getTeamGradient(teamName: string): string | null {
  const colors = getTeamColors(teamName);
  if (!colors) return null;
  
  return `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 50%, ${colors.secondary} 100%)`;
}

/**
 * Get a subtle version of team colors for backgrounds
 */
export function getTeamColorsSubtle(teamName: string, opacity: number = 0.15): { bg: string; border: string } | null {
  const colors = getTeamColors(teamName);
  if (!colors) return null;
  
  // Convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  
  return {
    bg: hexToRgba(colors.primary, opacity),
    border: hexToRgba(colors.primary, opacity * 2),
  };
}
