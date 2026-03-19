/**
 * Team Info Service
 * 
 * Provides full team names and records lookup for all sports.
 * Caches data for 15 minutes to reduce API calls.
 */

import { getRealDate } from './dateUtils';

export interface TeamInfo {
  id: string;
  abbr: string;
  fullName: string;
  city?: string;
  name?: string;
  record: string;
  wins: number;
  losses: number;
  otLosses?: number; // NHL
  confRecord?: string;
  logo?: string;
  conference?: string; // NCAAB/NCAAF conference name
  apRank?: number | null; // AP Top 25 ranking (null if unranked)
}

export type LeagueKey = 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF' | 'NCAAB' | 'SOCCER';

// Cache structure
interface TeamCache {
  data: Map<string, TeamInfo>;
  timestamp: number;
}

const teamCache = new Map<LeagueKey, TeamCache>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ============ FULL TEAM NAME DATABASE ============

const NFL_TEAMS: Record<string, { city: string; name: string; fullName: string }> = {
  ARI: { city: 'Arizona', name: 'Cardinals', fullName: 'Arizona Cardinals' },
  ATL: { city: 'Atlanta', name: 'Falcons', fullName: 'Atlanta Falcons' },
  BAL: { city: 'Baltimore', name: 'Ravens', fullName: 'Baltimore Ravens' },
  BUF: { city: 'Buffalo', name: 'Bills', fullName: 'Buffalo Bills' },
  CAR: { city: 'Carolina', name: 'Panthers', fullName: 'Carolina Panthers' },
  CHI: { city: 'Chicago', name: 'Bears', fullName: 'Chicago Bears' },
  CIN: { city: 'Cincinnati', name: 'Bengals', fullName: 'Cincinnati Bengals' },
  CLE: { city: 'Cleveland', name: 'Browns', fullName: 'Cleveland Browns' },
  DAL: { city: 'Dallas', name: 'Cowboys', fullName: 'Dallas Cowboys' },
  DEN: { city: 'Denver', name: 'Broncos', fullName: 'Denver Broncos' },
  DET: { city: 'Detroit', name: 'Lions', fullName: 'Detroit Lions' },
  GB: { city: 'Green Bay', name: 'Packers', fullName: 'Green Bay Packers' },
  HOU: { city: 'Houston', name: 'Texans', fullName: 'Houston Texans' },
  IND: { city: 'Indianapolis', name: 'Colts', fullName: 'Indianapolis Colts' },
  JAX: { city: 'Jacksonville', name: 'Jaguars', fullName: 'Jacksonville Jaguars' },
  KC: { city: 'Kansas City', name: 'Chiefs', fullName: 'Kansas City Chiefs' },
  LV: { city: 'Las Vegas', name: 'Raiders', fullName: 'Las Vegas Raiders' },
  LAC: { city: 'Los Angeles', name: 'Chargers', fullName: 'Los Angeles Chargers' },
  LAR: { city: 'Los Angeles', name: 'Rams', fullName: 'Los Angeles Rams' },
  MIA: { city: 'Miami', name: 'Dolphins', fullName: 'Miami Dolphins' },
  MIN: { city: 'Minnesota', name: 'Vikings', fullName: 'Minnesota Vikings' },
  NE: { city: 'New England', name: 'Patriots', fullName: 'New England Patriots' },
  NO: { city: 'New Orleans', name: 'Saints', fullName: 'New Orleans Saints' },
  NYG: { city: 'New York', name: 'Giants', fullName: 'New York Giants' },
  NYJ: { city: 'New York', name: 'Jets', fullName: 'New York Jets' },
  PHI: { city: 'Philadelphia', name: 'Eagles', fullName: 'Philadelphia Eagles' },
  PIT: { city: 'Pittsburgh', name: 'Steelers', fullName: 'Pittsburgh Steelers' },
  SF: { city: 'San Francisco', name: '49ers', fullName: 'San Francisco 49ers' },
  SEA: { city: 'Seattle', name: 'Seahawks', fullName: 'Seattle Seahawks' },
  TB: { city: 'Tampa Bay', name: 'Buccaneers', fullName: 'Tampa Bay Buccaneers' },
  TEN: { city: 'Tennessee', name: 'Titans', fullName: 'Tennessee Titans' },
  WSH: { city: 'Washington', name: 'Commanders', fullName: 'Washington Commanders' },
};

const NBA_TEAMS: Record<string, { city: string; name: string; fullName: string }> = {
  ATL: { city: 'Atlanta', name: 'Hawks', fullName: 'Atlanta Hawks' },
  BOS: { city: 'Boston', name: 'Celtics', fullName: 'Boston Celtics' },
  BKN: { city: 'Brooklyn', name: 'Nets', fullName: 'Brooklyn Nets' },
  CHA: { city: 'Charlotte', name: 'Hornets', fullName: 'Charlotte Hornets' },
  CHI: { city: 'Chicago', name: 'Bulls', fullName: 'Chicago Bulls' },
  CLE: { city: 'Cleveland', name: 'Cavaliers', fullName: 'Cleveland Cavaliers' },
  DAL: { city: 'Dallas', name: 'Mavericks', fullName: 'Dallas Mavericks' },
  DEN: { city: 'Denver', name: 'Nuggets', fullName: 'Denver Nuggets' },
  DET: { city: 'Detroit', name: 'Pistons', fullName: 'Detroit Pistons' },
  GSW: { city: 'Golden State', name: 'Warriors', fullName: 'Golden State Warriors' },
  GS: { city: 'Golden State', name: 'Warriors', fullName: 'Golden State Warriors' },
  HOU: { city: 'Houston', name: 'Rockets', fullName: 'Houston Rockets' },
  IND: { city: 'Indiana', name: 'Pacers', fullName: 'Indiana Pacers' },
  LAC: { city: 'Los Angeles', name: 'Clippers', fullName: 'Los Angeles Clippers' },
  LAL: { city: 'Los Angeles', name: 'Lakers', fullName: 'Los Angeles Lakers' },
  MEM: { city: 'Memphis', name: 'Grizzlies', fullName: 'Memphis Grizzlies' },
  MIA: { city: 'Miami', name: 'Heat', fullName: 'Miami Heat' },
  MIL: { city: 'Milwaukee', name: 'Bucks', fullName: 'Milwaukee Bucks' },
  MIN: { city: 'Minnesota', name: 'Timberwolves', fullName: 'Minnesota Timberwolves' },
  NOP: { city: 'New Orleans', name: 'Pelicans', fullName: 'New Orleans Pelicans' },
  NYK: { city: 'New York', name: 'Knicks', fullName: 'New York Knicks' },
  OKC: { city: 'Oklahoma City', name: 'Thunder', fullName: 'Oklahoma City Thunder' },
  ORL: { city: 'Orlando', name: 'Magic', fullName: 'Orlando Magic' },
  PHI: { city: 'Philadelphia', name: '76ers', fullName: 'Philadelphia 76ers' },
  PHX: { city: 'Phoenix', name: 'Suns', fullName: 'Phoenix Suns' },
  POR: { city: 'Portland', name: 'Trail Blazers', fullName: 'Portland Trail Blazers' },
  SAC: { city: 'Sacramento', name: 'Kings', fullName: 'Sacramento Kings' },
  SAS: { city: 'San Antonio', name: 'Spurs', fullName: 'San Antonio Spurs' },
  SA: { city: 'San Antonio', name: 'Spurs', fullName: 'San Antonio Spurs' },
  TOR: { city: 'Toronto', name: 'Raptors', fullName: 'Toronto Raptors' },
  UTA: { city: 'Utah', name: 'Jazz', fullName: 'Utah Jazz' },
  WAS: { city: 'Washington', name: 'Wizards', fullName: 'Washington Wizards' },
};

const NHL_TEAMS: Record<string, { city: string; name: string; fullName: string }> = {
  ANA: { city: 'Anaheim', name: 'Ducks', fullName: 'Anaheim Ducks' },
  ARI: { city: 'Arizona', name: 'Coyotes', fullName: 'Arizona Coyotes' },
  BOS: { city: 'Boston', name: 'Bruins', fullName: 'Boston Bruins' },
  BUF: { city: 'Buffalo', name: 'Sabres', fullName: 'Buffalo Sabres' },
  CGY: { city: 'Calgary', name: 'Flames', fullName: 'Calgary Flames' },
  CAR: { city: 'Carolina', name: 'Hurricanes', fullName: 'Carolina Hurricanes' },
  CHI: { city: 'Chicago', name: 'Blackhawks', fullName: 'Chicago Blackhawks' },
  COL: { city: 'Colorado', name: 'Avalanche', fullName: 'Colorado Avalanche' },
  CBJ: { city: 'Columbus', name: 'Blue Jackets', fullName: 'Columbus Blue Jackets' },
  DAL: { city: 'Dallas', name: 'Stars', fullName: 'Dallas Stars' },
  DET: { city: 'Detroit', name: 'Red Wings', fullName: 'Detroit Red Wings' },
  EDM: { city: 'Edmonton', name: 'Oilers', fullName: 'Edmonton Oilers' },
  FLA: { city: 'Florida', name: 'Panthers', fullName: 'Florida Panthers' },
  LA: { city: 'Los Angeles', name: 'Kings', fullName: 'Los Angeles Kings' },
  MIN: { city: 'Minnesota', name: 'Wild', fullName: 'Minnesota Wild' },
  MTL: { city: 'Montreal', name: 'Canadiens', fullName: 'Montreal Canadiens' },
  NSH: { city: 'Nashville', name: 'Predators', fullName: 'Nashville Predators' },
  NJ: { city: 'New Jersey', name: 'Devils', fullName: 'New Jersey Devils' },
  NYI: { city: 'New York', name: 'Islanders', fullName: 'New York Islanders' },
  NYR: { city: 'New York', name: 'Rangers', fullName: 'New York Rangers' },
  OTT: { city: 'Ottawa', name: 'Senators', fullName: 'Ottawa Senators' },
  PHI: { city: 'Philadelphia', name: 'Flyers', fullName: 'Philadelphia Flyers' },
  PIT: { city: 'Pittsburgh', name: 'Penguins', fullName: 'Pittsburgh Penguins' },
  SJ: { city: 'San Jose', name: 'Sharks', fullName: 'San Jose Sharks' },
  SEA: { city: 'Seattle', name: 'Kraken', fullName: 'Seattle Kraken' },
  STL: { city: 'St. Louis', name: 'Blues', fullName: 'St. Louis Blues' },
  TB: { city: 'Tampa Bay', name: 'Lightning', fullName: 'Tampa Bay Lightning' },
  TOR: { city: 'Toronto', name: 'Maple Leafs', fullName: 'Toronto Maple Leafs' },
  VAN: { city: 'Vancouver', name: 'Canucks', fullName: 'Vancouver Canucks' },
  VGK: { city: 'Vegas', name: 'Golden Knights', fullName: 'Vegas Golden Knights' },
  WSH: { city: 'Washington', name: 'Capitals', fullName: 'Washington Capitals' },
  WPG: { city: 'Winnipeg', name: 'Jets', fullName: 'Winnipeg Jets' },
};

const MLB_TEAMS: Record<string, { city: string; name: string; fullName: string }> = {
  ARI: { city: 'Arizona', name: 'Diamondbacks', fullName: 'Arizona Diamondbacks' },
  ATL: { city: 'Atlanta', name: 'Braves', fullName: 'Atlanta Braves' },
  BAL: { city: 'Baltimore', name: 'Orioles', fullName: 'Baltimore Orioles' },
  BOS: { city: 'Boston', name: 'Red Sox', fullName: 'Boston Red Sox' },
  CHC: { city: 'Chicago', name: 'Cubs', fullName: 'Chicago Cubs' },
  CWS: { city: 'Chicago', name: 'White Sox', fullName: 'Chicago White Sox' },
  CIN: { city: 'Cincinnati', name: 'Reds', fullName: 'Cincinnati Reds' },
  CLE: { city: 'Cleveland', name: 'Guardians', fullName: 'Cleveland Guardians' },
  COL: { city: 'Colorado', name: 'Rockies', fullName: 'Colorado Rockies' },
  DET: { city: 'Detroit', name: 'Tigers', fullName: 'Detroit Tigers' },
  HOU: { city: 'Houston', name: 'Astros', fullName: 'Houston Astros' },
  KC: { city: 'Kansas City', name: 'Royals', fullName: 'Kansas City Royals' },
  LAA: { city: 'Los Angeles', name: 'Angels', fullName: 'Los Angeles Angels' },
  LAD: { city: 'Los Angeles', name: 'Dodgers', fullName: 'Los Angeles Dodgers' },
  MIA: { city: 'Miami', name: 'Marlins', fullName: 'Miami Marlins' },
  MIL: { city: 'Milwaukee', name: 'Brewers', fullName: 'Milwaukee Brewers' },
  MIN: { city: 'Minnesota', name: 'Twins', fullName: 'Minnesota Twins' },
  NYM: { city: 'New York', name: 'Mets', fullName: 'New York Mets' },
  NYY: { city: 'New York', name: 'Yankees', fullName: 'New York Yankees' },
  OAK: { city: 'Oakland', name: 'Athletics', fullName: 'Oakland Athletics' },
  PHI: { city: 'Philadelphia', name: 'Phillies', fullName: 'Philadelphia Phillies' },
  PIT: { city: 'Pittsburgh', name: 'Pirates', fullName: 'Pittsburgh Pirates' },
  SD: { city: 'San Diego', name: 'Padres', fullName: 'San Diego Padres' },
  SF: { city: 'San Francisco', name: 'Giants', fullName: 'San Francisco Giants' },
  SEA: { city: 'Seattle', name: 'Mariners', fullName: 'Seattle Mariners' },
  STL: { city: 'St. Louis', name: 'Cardinals', fullName: 'St. Louis Cardinals' },
  TB: { city: 'Tampa Bay', name: 'Rays', fullName: 'Tampa Bay Rays' },
  TEX: { city: 'Texas', name: 'Rangers', fullName: 'Texas Rangers' },
  TOR: { city: 'Toronto', name: 'Blue Jays', fullName: 'Toronto Blue Jays' },
  WAS: { city: 'Washington', name: 'Nationals', fullName: 'Washington Nationals' },
};

// NCAAB/NCAAF teams - most popular programs
const NCAA_TEAMS: Record<string, { school: string; mascot: string; fullName: string }> = {
  DUKE: { school: 'Duke', mascot: 'Blue Devils', fullName: 'Duke Blue Devils' },
  UNC: { school: 'North Carolina', mascot: 'Tar Heels', fullName: 'North Carolina Tar Heels' },
  UK: { school: 'Kentucky', mascot: 'Wildcats', fullName: 'Kentucky Wildcats' },
  KU: { school: 'Kansas', mascot: 'Jayhawks', fullName: 'Kansas Jayhawks' },
  UCLA: { school: 'UCLA', mascot: 'Bruins', fullName: 'UCLA Bruins' },
  UConn: { school: 'UConn', mascot: 'Huskies', fullName: 'UConn Huskies' },
  UCONN: { school: 'UConn', mascot: 'Huskies', fullName: 'UConn Huskies' },
  GONZ: { school: 'Gonzaga', mascot: 'Bulldogs', fullName: 'Gonzaga Bulldogs' },
  NOVA: { school: 'Villanova', mascot: 'Wildcats', fullName: 'Villanova Wildcats' },
  MICH: { school: 'Michigan', mascot: 'Wolverines', fullName: 'Michigan Wolverines' },
  MSU: { school: 'Michigan State', mascot: 'Spartans', fullName: 'Michigan State Spartans' },
  OSU: { school: 'Ohio State', mascot: 'Buckeyes', fullName: 'Ohio State Buckeyes' },
  PSU: { school: 'Penn State', mascot: 'Nittany Lions', fullName: 'Penn State Nittany Lions' },
  ALA: { school: 'Alabama', mascot: 'Crimson Tide', fullName: 'Alabama Crimson Tide' },
  BAMA: { school: 'Alabama', mascot: 'Crimson Tide', fullName: 'Alabama Crimson Tide' },
  UGA: { school: 'Georgia', mascot: 'Bulldogs', fullName: 'Georgia Bulldogs' },
  TEX: { school: 'Texas', mascot: 'Longhorns', fullName: 'Texas Longhorns' },
  TENN: { school: 'Tennessee', mascot: 'Volunteers', fullName: 'Tennessee Volunteers' },
  AUB: { school: 'Auburn', mascot: 'Tigers', fullName: 'Auburn Tigers' },
  ARK: { school: 'Arkansas', mascot: 'Razorbacks', fullName: 'Arkansas Razorbacks' },
  LSU: { school: 'LSU', mascot: 'Tigers', fullName: 'LSU Tigers' },
  FLA: { school: 'Florida', mascot: 'Gators', fullName: 'Florida Gators' },
  PUR: { school: 'Purdue', mascot: 'Boilermakers', fullName: 'Purdue Boilermakers' },
  HOU: { school: 'Houston', mascot: 'Cougars', fullName: 'Houston Cougars' },
  BAY: { school: 'Baylor', mascot: 'Bears', fullName: 'Baylor Bears' },
  AZ: { school: 'Arizona', mascot: 'Wildcats', fullName: 'Arizona Wildcats' },
  ARIZ: { school: 'Arizona', mascot: 'Wildcats', fullName: 'Arizona Wildcats' },
  SDSU: { school: 'San Diego State', mascot: 'Aztecs', fullName: 'San Diego State Aztecs' },
  CREIGH: { school: 'Creighton', mascot: 'Bluejays', fullName: 'Creighton Bluejays' },
  MARQ: { school: 'Marquette', mascot: 'Golden Eagles', fullName: 'Marquette Golden Eagles' },
  IOWA: { school: 'Iowa', mascot: 'Hawkeyes', fullName: 'Iowa Hawkeyes' },
  ISU: { school: 'Iowa State', mascot: 'Cyclones', fullName: 'Iowa State Cyclones' },
  ND: { school: 'Notre Dame', mascot: 'Fighting Irish', fullName: 'Notre Dame Fighting Irish' },
  CLEM: { school: 'Clemson', mascot: 'Tigers', fullName: 'Clemson Tigers' },
  USC: { school: 'USC', mascot: 'Trojans', fullName: 'USC Trojans' },
  ORE: { school: 'Oregon', mascot: 'Ducks', fullName: 'Oregon Ducks' },
  WASH: { school: 'Washington', mascot: 'Huskies', fullName: 'Washington Huskies' },
  WVU: { school: 'West Virginia', mascot: 'Mountaineers', fullName: 'West Virginia Mountaineers' },
  MISS: { school: 'Ole Miss', mascot: 'Rebels', fullName: 'Ole Miss Rebels' },
  OKLA: { school: 'Oklahoma', mascot: 'Sooners', fullName: 'Oklahoma Sooners' },
  NEB: { school: 'Nebraska', mascot: 'Cornhuskers', fullName: 'Nebraska Cornhuskers' },
  WISC: { school: 'Wisconsin', mascot: 'Badgers', fullName: 'Wisconsin Badgers' },
  ILL: { school: 'Illinois', mascot: 'Fighting Illini', fullName: 'Illinois Fighting Illini' },
  IND: { school: 'Indiana', mascot: 'Hoosiers', fullName: 'Indiana Hoosiers' },
  MINN: { school: 'Minnesota', mascot: 'Golden Gophers', fullName: 'Minnesota Golden Gophers' },
  NW: { school: 'Northwestern', mascot: 'Wildcats', fullName: 'Northwestern Wildcats' },
  RUT: { school: 'Rutgers', mascot: 'Scarlet Knights', fullName: 'Rutgers Scarlet Knights' },
  MD: { school: 'Maryland', mascot: 'Terrapins', fullName: 'Maryland Terrapins' },
  UVA: { school: 'Virginia', mascot: 'Cavaliers', fullName: 'Virginia Cavaliers' },
  VT: { school: 'Virginia Tech', mascot: 'Hokies', fullName: 'Virginia Tech Hokies' },
  LOU: { school: 'Louisville', mascot: 'Cardinals', fullName: 'Louisville Cardinals' },
  SYR: { school: 'Syracuse', mascot: 'Orange', fullName: 'Syracuse Orange' },
  PITT: { school: 'Pittsburgh', mascot: 'Panthers', fullName: 'Pittsburgh Panthers' },
  BC: { school: 'Boston College', mascot: 'Eagles', fullName: 'Boston College Eagles' },
  WAKE: { school: 'Wake Forest', mascot: 'Demon Deacons', fullName: 'Wake Forest Demon Deacons' },
  NCST: { school: 'NC State', mascot: 'Wolfpack', fullName: 'NC State Wolfpack' },
  MIZ: { school: 'Missouri', mascot: 'Tigers', fullName: 'Missouri Tigers' },
  TAMU: { school: 'Texas A&M', mascot: 'Aggies', fullName: 'Texas A&M Aggies' },
  VANDY: { school: 'Vanderbilt', mascot: 'Commodores', fullName: 'Vanderbilt Commodores' },
  SC: { school: 'South Carolina', mascot: 'Gamecocks', fullName: 'South Carolina Gamecocks' },
  SMU: { school: 'SMU', mascot: 'Mustangs', fullName: 'SMU Mustangs' },
  TCU: { school: 'TCU', mascot: 'Horned Frogs', fullName: 'TCU Horned Frogs' },
  TTU: { school: 'Texas Tech', mascot: 'Red Raiders', fullName: 'Texas Tech Red Raiders' },
  KSU: { school: 'Kansas State', mascot: 'Wildcats', fullName: 'Kansas State Wildcats' },
  OKST: { school: 'Oklahoma State', mascot: 'Cowboys', fullName: 'Oklahoma State Cowboys' },
  BYU: { school: 'BYU', mascot: 'Cougars', fullName: 'BYU Cougars' },
  UCF: { school: 'UCF', mascot: 'Knights', fullName: 'UCF Knights' },
  CIN: { school: 'Cincinnati', mascot: 'Bearcats', fullName: 'Cincinnati Bearcats' },
  USF: { school: 'South Florida', mascot: 'Bulls', fullName: 'South Florida Bulls' },
  TUL: { school: 'Tulane', mascot: 'Green Wave', fullName: 'Tulane Green Wave' },
  MEMPH: { school: 'Memphis', mascot: 'Tigers', fullName: 'Memphis Tigers' },
  STJO: { school: "St. John's", mascot: 'Red Storm', fullName: "St. John's Red Storm" },
  PROV: { school: 'Providence', mascot: 'Friars', fullName: 'Providence Friars' },
  BUT: { school: 'Butler', mascot: 'Bulldogs', fullName: 'Butler Bulldogs' },
  XAVR: { school: 'Xavier', mascot: 'Musketeers', fullName: 'Xavier Musketeers' },
  SETON: { school: 'Seton Hall', mascot: 'Pirates', fullName: 'Seton Hall Pirates' },
  GTOWN: { school: 'Georgetown', mascot: 'Hoyas', fullName: 'Georgetown Hoyas' },
  DEP: { school: 'DePaul', mascot: 'Blue Demons', fullName: 'DePaul Blue Demons' },
};

// ============ LOOKUP FUNCTIONS ============

// ============ ABBREVIATION ALIASES ============
// Maps alternative abbreviations to canonical ones used in our databases
const ABBR_ALIASES: Record<string, string> = {
  // NBA - map variants TO the canonical keys in NBA_TEAMS
  PHO: 'PHX',    // Phoenix Suns (SDIO uses PHO, our DB uses PHX)
  NO: 'NOP',     // New Orleans Pelicans (some APIs use NO, our DB uses NOP)
  SAN: 'SAS',    // San Antonio Spurs (some APIs use SAN, our DB uses SAS)
  NY: 'NYK',     // New York Knicks
  CHO: 'CHA',    // Charlotte Hornets (some APIs use CHO, our DB uses CHA)
  // NFL
  JAC: 'JAX',    // Jacksonville Jaguars
  LVR: 'LV',     // Las Vegas Raiders
  WAS: 'WSH',    // Washington Commanders (our DB uses WSH)
  // MLB
  CHW: 'CWS',    // Chicago White Sox
  AZ: 'ARI',     // Arizona (variant)
  ATH: 'OAK',    // Oakland Athletics
  // NHL - map variants TO the canonical keys in NHL_TEAMS
  LAK: 'LA',     // Los Angeles Kings (some APIs use LAK, our DB uses LA)
  NJD: 'NJ',     // New Jersey Devils
  SJS: 'SJ',     // San Jose Sharks
  TBL: 'TB',     // Tampa Bay Lightning
  VEG: 'VGK',    // Vegas Golden Knights
  MON: 'MTL',    // Montreal Canadiens (SDIO uses MON, our DB uses MTL)
  NAS: 'NSH',    // Nashville Predators (SDIO uses NAS, our DB uses NSH)
  UTA: 'UTAH',   // Utah Hockey Club - add to NHL_TEAMS if needed
  // NCAA
  CONN: 'UCONN', // Connecticut
};

/**
 * Resolve abbreviation alias to canonical form
 */
function resolveAbbrAlias(abbr: string): string {
  const upper = abbr.toUpperCase();
  return ABBR_ALIASES[upper] || upper;
}

/**
 * Get full team name from abbreviation
 */
export function getFullTeamName(abbr: string, league: LeagueKey): string {
  const upperAbbr = resolveAbbrAlias(abbr.toUpperCase());
  
  switch (league) {
    case 'NFL':
      return NFL_TEAMS[upperAbbr]?.fullName || abbr;
    case 'NBA':
      return NBA_TEAMS[upperAbbr]?.fullName || abbr;
    case 'NHL':
      return NHL_TEAMS[upperAbbr]?.fullName || abbr;
    case 'MLB':
      return MLB_TEAMS[upperAbbr]?.fullName || abbr;
    case 'NCAAF':
    case 'NCAAB':
      return NCAA_TEAMS[upperAbbr]?.fullName || abbr;
    default:
      return abbr;
  }
}

/**
 * Check if a team name is likely an abbreviation
 */
export function isAbbreviation(name: string): boolean {
  return name.length <= 4 && name === name.toUpperCase();
}

/**
 * Resolve team display name - converts abbreviations to full names
 */
export function resolveTeamDisplayName(name: string, league: LeagueKey): string {
  if (isAbbreviation(name)) {
    const fullName = getFullTeamName(name, league);
    // If we got back the same abbreviation, it wasn't found
    if (fullName !== name) {
      return fullName;
    }
  }
  return name;
}

// ============ RECORDS FROM API ============

let apiKey: string | undefined;
let warnedSportsRadarMigration = false;

export function initTeamInfoService(key: string): void {
  // Legacy compatibility: keep accepting key but do not depend on a legacy provider.
  apiKey = key;
}

/**
 * Format record string based on league
 */
function formatRecord(wins: number, losses: number, otLosses?: number, league?: LeagueKey): string {
  if (league === 'NHL' && otLosses !== undefined) {
    return `${wins}–${losses}–${otLosses}`;
  }
  return `${wins}–${losses}`;
}

/**
 * Fetch team standings/records.
 * Legacy provider network fetch has been removed; this currently returns an
 * empty map until a SportsRadar standings source is wired in.
 */
async function fetchTeamRecords(league: LeagueKey): Promise<Map<string, TeamInfo>> {
  const teams = new Map<string, TeamInfo>();
  void league;
  void apiKey;
  void getRealDate;
  if (!warnedSportsRadarMigration) {
    warnedSportsRadarMigration = true;
    console.warn('[TeamInfo] Standings source is in SportsRadar migration mode; returning empty records for now.');
  }
  return teams;
}

/**
 * Get team info for a league (with caching)
 */
export async function getTeamInfoForLeague(league: LeagueKey): Promise<Map<string, TeamInfo>> {
  const cached = teamCache.get(league);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const teams = await fetchTeamRecords(league);
  teamCache.set(league, { data: teams, timestamp: Date.now() });
  
  return teams;
}

/**
 * Get single team info
 */
export async function getTeamInfo(abbr: string, league: LeagueKey): Promise<TeamInfo | null> {
  const teams = await getTeamInfoForLeague(league);
  return teams.get(abbr.toUpperCase()) || null;
}

/**
 * Get team summary (full name + record) as simple objects for API response
 */
export async function getTeamSummary(league: LeagueKey): Promise<Array<{
  abbr: string;
  fullName: string;
  record: string;
  wins: number;
  losses: number;
  confRecord?: string;
  conference?: string;
  apRank?: number | null;
}>> {
  const teams = await getTeamInfoForLeague(league);
  
  return Array.from(teams.values()).map(t => ({
    abbr: t.abbr,
    fullName: t.fullName,
    record: t.record,
    wins: t.wins,
    losses: t.losses,
    confRecord: t.confRecord,
    conference: t.conference,
    apRank: t.apRank,
  }));
}

/**
 * Build a quick lookup map from abbreviation to display info
 * Includes reverse aliases so PHO and PHX both find Phoenix Suns
 */
export async function buildTeamLookup(league: LeagueKey): Promise<Record<string, { fullName: string; record: string }>> {
  const teams = await getTeamInfoForLeague(league);
  const lookup: Record<string, { fullName: string; record: string }> = {};
  
  // Build reverse alias map: canonical -> all aliases that point to it
  const reverseAliases: Record<string, string[]> = {};
  for (const [alias, canonical] of Object.entries(ABBR_ALIASES)) {
    if (!reverseAliases[canonical]) {
      reverseAliases[canonical] = [];
    }
    reverseAliases[canonical].push(alias);
  }
  
  for (const [abbr, info] of teams) {
    const entry = { fullName: info.fullName, record: info.record };
    lookup[abbr] = entry;
    
    // Also add all aliases that point to this canonical abbr
    const aliases = reverseAliases[abbr] || [];
    for (const alias of aliases) {
      lookup[alias] = entry;
    }
  }
  
  return lookup;
}
