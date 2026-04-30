/**
 * Team Logos Utility
 * Provides logo URLs for NBA, NFL, MLB, NHL, and Soccer teams using ESPN's CDN
 */
import { getEspnTeamLogo } from '@/react-app/lib/espnSoccer';

// ESPN CDN base URLs for team logos
const ESPN_NBA_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nba/500';
const ESPN_NFL_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nfl/500';
const ESPN_MLB_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/mlb/500';
const ESPN_NHL_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nhl/500';
const ESPN_SOCCER_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/soccer/500';
const ESPN_NCAAB_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/ncaa/500';

// NBA team abbreviation to ESPN logo mapping
// ESPN uses lowercase abbreviations in their URLs
const NBA_LOGO_MAP: Record<string, string> = {
  // Eastern Conference - Atlantic
  'BOS': 'bos',    // Boston Celtics
  'BKN': 'bkn',    // Brooklyn Nets
  'NYK': 'ny',     // New York Knicks
  'PHI': 'phi',    // Philadelphia 76ers
  'TOR': 'tor',    // Toronto Raptors
  
  // Eastern Conference - Central
  'CHI': 'chi',    // Chicago Bulls
  'CLE': 'cle',    // Cleveland Cavaliers
  'DET': 'det',    // Detroit Pistons
  'IND': 'ind',    // Indiana Pacers
  'MIL': 'mil',    // Milwaukee Bucks
  
  // Eastern Conference - Southeast
  'ATL': 'atl',    // Atlanta Hawks
  'CHA': 'cha',    // Charlotte Hornets
  'MIA': 'mia',    // Miami Heat
  'ORL': 'orl',    // Orlando Magic
  'WAS': 'wsh',    // Washington Wizards
  
  // Western Conference - Northwest
  'DEN': 'den',    // Denver Nuggets
  'MIN': 'min',    // Minnesota Timberwolves
  'OKC': 'okc',    // Oklahoma City Thunder
  'POR': 'por',    // Portland Trail Blazers
  'UTA': 'utah',   // Utah Jazz
  
  // Western Conference - Pacific
  'GSW': 'gs',     // Golden State Warriors
  'LAC': 'lac',    // LA Clippers
  'LAL': 'lal',    // Los Angeles Lakers
  'PHX': 'phx',    // Phoenix Suns
  'SAC': 'sac',    // Sacramento Kings
  
  // Western Conference - Southwest
  'DAL': 'dal',    // Dallas Mavericks
  'HOU': 'hou',    // Houston Rockets
  'MEM': 'mem',    // Memphis Grizzlies
  'NOP': 'no',     // New Orleans Pelicans
  'SAS': 'sa',     // San Antonio Spurs
};

// Alternative abbreviations that map to standard ones
const NBA_ABBR_ALIASES: Record<string, string> = {
  'PHO': 'PHX',    // Phoenix alternate
  'NO': 'NOP',     // New Orleans alternate
  'NY': 'NYK',     // New York alternate
  'GS': 'GSW',     // Golden State alternate
  'SA': 'SAS',     // San Antonio alternate
  'UTAH': 'UTA',   // Utah alternate
  'WSH': 'WAS',    // Washington alternate
};

// NFL team abbreviation to ESPN logo mapping
const NFL_LOGO_MAP: Record<string, string> = {
  // AFC East
  'BUF': 'buf',    // Buffalo Bills
  'MIA': 'mia',    // Miami Dolphins
  'NE': 'ne',      // New England Patriots
  'NYJ': 'nyj',    // New York Jets
  // AFC North
  'BAL': 'bal',    // Baltimore Ravens
  'CIN': 'cin',    // Cincinnati Bengals
  'CLE': 'cle',    // Cleveland Browns
  'PIT': 'pit',    // Pittsburgh Steelers
  // AFC South
  'HOU': 'hou',    // Houston Texans
  'IND': 'ind',    // Indianapolis Colts
  'JAX': 'jax',    // Jacksonville Jaguars
  'TEN': 'ten',    // Tennessee Titans
  // AFC West
  'DEN': 'den',    // Denver Broncos
  'KC': 'kc',      // Kansas City Chiefs
  'LV': 'lv',      // Las Vegas Raiders
  'LAC': 'lac',    // Los Angeles Chargers
  // NFC East
  'DAL': 'dal',    // Dallas Cowboys
  'NYG': 'nyg',    // New York Giants
  'PHI': 'phi',    // Philadelphia Eagles
  'WAS': 'wsh',    // Washington Commanders
  // NFC North
  'CHI': 'chi',    // Chicago Bears
  'DET': 'det',    // Detroit Lions
  'GB': 'gb',      // Green Bay Packers
  'MIN': 'min',    // Minnesota Vikings
  // NFC South
  'ATL': 'atl',    // Atlanta Falcons
  'CAR': 'car',    // Carolina Panthers
  'NO': 'no',      // New Orleans Saints
  'TB': 'tb',      // Tampa Bay Buccaneers
  // NFC West
  'ARI': 'ari',    // Arizona Cardinals
  'LAR': 'lar',    // Los Angeles Rams
  'SF': 'sf',      // San Francisco 49ers
  'SEA': 'sea',    // Seattle Seahawks
};

// MLB team abbreviation to ESPN logo mapping
const MLB_LOGO_MAP: Record<string, string> = {
  // AL East
  'BAL': 'bal',    // Baltimore Orioles
  'BOS': 'bos',    // Boston Red Sox
  'NYY': 'nyy',    // New York Yankees
  'TB': 'tb',      // Tampa Bay Rays
  'TOR': 'tor',    // Toronto Blue Jays
  // AL Central
  'CLE': 'cle',    // Cleveland Guardians
  'CWS': 'chw',    // Chicago White Sox
  'DET': 'det',    // Detroit Tigers
  'KC': 'kc',      // Kansas City Royals
  'MIN': 'min',    // Minnesota Twins
  // AL West
  'HOU': 'hou',    // Houston Astros
  'LAA': 'laa',    // Los Angeles Angels
  'OAK': 'oak',    // Oakland Athletics
  'ATH': 'ath',    // Athletics (current branding/code)
  'SEA': 'sea',    // Seattle Mariners
  'TEX': 'tex',    // Texas Rangers
  // NL East
  'ATL': 'atl',    // Atlanta Braves
  'MIA': 'mia',    // Miami Marlins
  'NYM': 'nym',    // New York Mets
  'PHI': 'phi',    // Philadelphia Phillies
  'WSH': 'wsh',    // Washington Nationals
  // NL Central
  'CHC': 'chc',    // Chicago Cubs
  'CIN': 'cin',    // Cincinnati Reds
  'MIL': 'mil',    // Milwaukee Brewers
  'PIT': 'pit',    // Pittsburgh Pirates
  'STL': 'stl',    // St. Louis Cardinals
  // NL West
  'ARI': 'ari',    // Arizona Diamondbacks
  'AZ': 'ari',     // Arizona Diamondbacks (feed alias)
  'COL': 'col',    // Colorado Rockies
  'LAD': 'lad',    // Los Angeles Dodgers
  'SD': 'sd',      // San Diego Padres
  'SF': 'sf',      // San Francisco Giants
};

// NHL team abbreviation to ESPN logo mapping
// Uses lowercase abbreviations for ESPN CDN: https://a.espncdn.com/i/teamlogos/nhl/500/{abbr}.png
const NHL_LOGO_MAP: Record<string, string> = {
  // Atlantic Division
  'BOS': 'bos',    // Boston Bruins
  'BUF': 'buf',    // Buffalo Sabres
  'DET': 'det',    // Detroit Red Wings
  'FLA': 'fla',    // Florida Panthers
  'MTL': 'mtl',    // Montreal Canadiens
  'MON': 'mtl',    // Montreal (alternate)
  'OTT': 'ott',    // Ottawa Senators
  'TB': 'tb',      // Tampa Bay Lightning
  'TBL': 'tb',     // Tampa Bay (alternate)
  'TOR': 'tor',    // Toronto Maple Leafs
  // Metropolitan Division
  'CAR': 'car',    // Carolina Hurricanes
  'CBJ': 'cbj',    // Columbus Blue Jackets
  'CLB': 'cbj',    // Columbus (alternate)
  'NJ': 'nj',      // New Jersey Devils
  'NJD': 'nj',     // New Jersey (alternate)
  'NYI': 'nyi',    // New York Islanders
  'NYR': 'nyr',    // New York Rangers
  'PHI': 'phi',    // Philadelphia Flyers
  'PIT': 'pit',    // Pittsburgh Penguins
  'WSH': 'wsh',    // Washington Capitals
  'WAS': 'wsh',    // Washington (alternate)
  // Central Division
  'ARI': 'ari',    // Arizona Coyotes (legacy)
  'UTAH': 'utah',  // Utah Hockey Club
  'UTA': 'utah',   // Utah (alternate)
  'CHI': 'chi',    // Chicago Blackhawks
  'COL': 'col',    // Colorado Avalanche
  'DAL': 'dal',    // Dallas Stars
  'MIN': 'min',    // Minnesota Wild
  'NSH': 'nsh',    // Nashville Predators
  'NAS': 'nsh',    // Nashville (alternate)
  'STL': 'stl',    // St. Louis Blues
  'WPG': 'wpg',    // Winnipeg Jets
  'WIN': 'wpg',    // Winnipeg (alternate)
  // Pacific Division
  'ANA': 'ana',    // Anaheim Ducks
  'CGY': 'cgy',    // Calgary Flames
  'CAL': 'cgy',    // Calgary (alternate)
  'EDM': 'edm',    // Edmonton Oilers
  'LA': 'la',      // Los Angeles Kings
  'LAK': 'la',     // LA Kings (alternate)
  'SJ': 'sj',      // San Jose Sharks
  'SJS': 'sj',     // San Jose (alternate)
  'SEA': 'sea',    // Seattle Kraken
  'VAN': 'van',    // Vancouver Canucks
  'VGK': 'vgk',    // Vegas Golden Knights
  'VEG': 'vgk',    // Vegas (alternate)
};

// EPL team abbreviation to ESPN ID mapping
const EPL_LOGO_MAP: Record<string, string> = {
  'ARS': '359',    // Arsenal
  'AST': '362',    // Aston Villa
  'AVL': '362',    // Aston Villa (feed alias)
  'BHA': '331',    // Brighton & Hove Albion
  'BRI': '331',    // Brighton & Hove Albion (SportsRadar alias)
  'BOR': '349',    // AFC Bournemouth
  'BOU': '349',    // AFC Bournemouth (feed alias)
  'BRE': '337',    // Brentford
  'BUR': '379',    // Burnley
  'CFC': '363',    // Chelsea
  'CHE': '363',    // Chelsea (alt)
  'CRY': '384',    // Crystal Palace
  'EVE': '368',    // Everton
  'FUL': '370',    // Fulham
  'IPS': '373',    // Ipswich Town
  'LEE': '357',    // Leeds United
  'LEI': '375',    // Leicester City
  'LIV': '364',    // Liverpool
  'MNC': '382',    // Manchester City
  'MCI': '382',    // Manchester City (alt)
  'MUN': '360',    // Manchester United
  'MAN': '360',    // Manchester United (alt)
  'NEW': '361',    // Newcastle United
  'NOT': '393',    // Nottingham Forest
  'NFO': '393',    // Nottingham Forest (feed alias)
  'SOU': '376',    // Southampton
  'SUN': '366',    // Sunderland (feed alias)
  'TOT': '367',    // Tottenham Hotspur
  'WHU': '399',    // West Ham United
  'WOL': '380',    // Wolverhampton Wanderers
};

// MLS team abbreviation to ESPN ID mapping
// Full 30-team MLS roster with provider/feed abbreviation variants
// IDs sourced from ESPN API: site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams
const MLS_LOGO_MAP: Record<string, string> = {
  // Eastern Conference
  'ATL': '18418',    // Atlanta United FC
  'CLT': '21300',    // Charlotte FC
  'CHI': '182',      // Chicago Fire FC
  'CIN': '18267',    // FC Cincinnati
  'FCC': '18267',    // FC Cincinnati (feed alias)
  'CLB': '183',      // Columbus Crew
  'DCU': '193',      // D.C. United
  'DC': '193',       // D.C. United (alt)
  'MIA': '20232',    // Inter Miami CF
  'MIM': '20232',    // Inter Miami CF (feed alias)
  'MTL': '9720',     // CF Montréal
  'NAS': '18986',    // Nashville SC
  'NSH': '18986',    // Nashville SC (ESPN code)
  'NER': '189',      // New England Revolution
  'NE': '189',       // New England Revolution (ESPN code)
  'NYC': '17606',    // New York City FC
  'NYR': '190',      // New York Red Bulls
  'NY': '190',       // New York Red Bulls (ESPN code)
  'NYRB': '190',     // New York Red Bulls (alt)
  'ORL': '12011',    // Orlando City SC
  'PHI': '10739',    // Philadelphia Union
  'TOR': '7318',     // Toronto FC
  
  // Western Conference
  'AUS': '20906',    // Austin FC (feed alias)
  'ATX': '20906',    // Austin FC (ESPN code)
  'COL': '184',      // Colorado Rapids
  'DAL': '185',      // FC Dallas
  'HOU': '6077',     // Houston Dynamo FC
  'LAG': '187',      // LA Galaxy
  'LA': '187',       // LA Galaxy (ESPN code)
  'LAF': '18966',    // Los Angeles FC
  'LAFC': '18966',   // Los Angeles FC (alt)
  'MIN': '17362',    // Minnesota United FC
  'POR': '9723',     // Portland Timbers
  'RSL': '4771',     // Real Salt Lake
  'SDG': '22529',    // San Diego FC
  'SD': '22529',     // San Diego FC (ESPN code)
  'SDFC': '22529',   // San Diego FC (alt)
  'SJE': '191',      // San Jose Earthquakes
  'SJ': '191',       // San Jose Earthquakes (ESPN code)
  'SEA': '9726',     // Seattle Sounders FC
  'SKC': '186',      // Sporting Kansas City
  'STL': '21812',    // St. Louis City SC
  'STLC': '21812',   // St. Louis City SC (alt)
  'VAN': '9727',     // Vancouver Whitecaps FC
  'VWH': '9727',     // Vancouver Whitecaps FC (feed alias)
};

// UCL team abbreviation to ESPN ID mapping (major clubs)
const UCL_LOGO_MAP: Record<string, string> = {
  'BAR': '83',     // Barcelona
  'BAY': '132',    // Bayern Munich
  'RMA': '86',     // Real Madrid
  'PSG': '160',    // Paris Saint-Germain
  'JUV': '111',    // Juventus
  'ACM': '103',    // AC Milan
  'INT': '110',    // Inter Milan
  'ATM': '1068',   // Atlético Madrid
  'DOR': '124',    // Borussia Dortmund
  'AJA': '139',    // Ajax
  'POR': '134',    // Porto
  'BEN': '204',    // Benfica
};

// La Liga team abbreviation to ESPN ID mapping
const LA_LIGA_LOGO_MAP: Record<string, string> = {
  'RMA': '86',     // Real Madrid
  'BAR': '83',     // Barcelona
  'ATM': '1068',   // Atletico Madrid
  'ATH': '93',     // Athletic Club
  'BET': '244',    // Real Betis
  'SEV': '243',    // Sevilla
  'VAL': '94',     // Valencia
  'VIL': '102',    // Villarreal
  'RSO': '89',     // Real Sociedad
  'GIR': '9812',   // Girona
  'OSA': '97',     // Osasuna
  'ALA': '96',     // Alaves
  'ALV': '96',     // Alaves alias
  'CEL': '85',     // Celta Vigo
  'ESP': '88',     // Espanyol
  'GET': '2922',   // Getafe
  'LEG': '17500',  // Leganes
  'MLL': '84',     // Mallorca
  'MAL': '84',     // Mallorca (SportsRadar alias)
  'RAY': '275',    // Rayo Vallecano
  'RBB': '244',    // Real Betis (SportsRadar alias)
  'VCF': '94',     // Valencia CF (SportsRadar alias)
  'LEV': '1538',   // Levante
  'ELC': '3751',   // Elche
};

// Ligue 1 team abbreviation to ESPN ID mapping
const LIGUE_1_LOGO_MAP: Record<string, string> = {
  'PSG': '160',    // Paris Saint-Germain
  'FCN': '165',    // Nantes
  'NAN': '165',    // Nantes (feed alias)
  'OLM': '158',    // Marseille
  'ASM': '148',    // Monaco
  'LIL': '159',    // Lille
  'LILL': '159',   // Lille (feed alias)
  'LYO': '163',    // Lyon
  'NIC': '161',    // Nice
  'REN': '167',    // Rennes
  'STR': '162',    // Strasbourg
  'MONT': '166',   // Montpellier
  'TOU': '168',    // Toulouse
  'REI': '169',    // Reims
  'BRE': '3058',   // Brest
  'HAC': '170',    // Le Havre
  'ANG': '3096',   // Angers
  'AUX': '171',    // Auxerre
  'STE': '172',    // Saint-Etienne
};

const SOCCER_LEAGUE_CODE_MAPS: Record<string, Record<string, string>> = {
  EPL: EPL_LOGO_MAP,
  MLS: MLS_LOGO_MAP,
  UCL: UCL_LOGO_MAP,
  LA_LIGA: LA_LIGA_LOGO_MAP,
  LIGUE_1: LIGUE_1_LOGO_MAP,
};

const SOCCER_TEAM_LEAGUE_ALIASES: Record<string, string> = {
  'EPL:BRI': 'BHA',
  'EPL:CFC': 'CHE',
  'LA_LIGA:RBB': 'BET',
  'LA_LIGA:VCF': 'VAL',
  'LA_LIGA:MAL': 'MLL',
  'LA_LIGA:ALV': 'ALA',
};

const SOCCER_CODE_ALIAS_MAP: Record<string, string> = {
  BRI: 'BHA',
  CFC: 'CHE',
  RBB: 'BET',
  VCF: 'VAL',
  MAL: 'MLL',
  ALV: 'ALA',
  ATMADRID: 'ATM',
};

const EPL_NAME_TO_CODE: Record<string, string> = {
  ARSENAL: 'ARS',
  ASTONVILLA: 'AVL',
  BRIGHTONHOVEALBION: 'BHA',
  BRIGHTON: 'BHA',
  CHELSEAFC: 'CHE',
  CHELSEA: 'CHE',
  LIVERPOOL: 'LIV',
  MANCHESTERCITY: 'MCI',
  MANCHESTERUNITED: 'MUN',
  NEWCASTLEUNITED: 'NEW',
  TOTTENHAMHOTSPUR: 'TOT',
  WESTHAMUNITED: 'WHU',
  WOLVERHAMPTONWANDERERS: 'WOL',
};

const LA_LIGA_NAME_TO_CODE: Record<string, string> = {
  GIRONAFC: 'GIR',
  GIRONA: 'GIR',
  REALBETISSEVILLE: 'BET',
  REALBETIS: 'BET',
  CAOSASUNA: 'OSA',
  OSASUNA: 'OSA',
  RCDMALLORCA: 'MLL',
  MALLORCA: 'MLL',
  VALENCIACF: 'VAL',
  VALENCIA: 'VAL',
  ATHLETICBILBAO: 'ATH',
  ATHLETICCLUB: 'ATH',
  DEPORTIVOALAVES: 'ALA',
  ALAVES: 'ALA',
  REALMADRID: 'RMA',
  BARCELONA: 'BAR',
  REALSOCIEDAD: 'RSO',
  ELCHE: 'ELC',
  ELCHECF: 'ELC',
};

const LIGUE_1_NAME_TO_CODE: Record<string, string> = {
  PARISSAINTGERMAIN: 'PSG',
  PSG: 'PSG',
  NANTES: 'FCN',
  FCNANTES: 'FCN',
};

const MLS_NAME_TO_CODE: Record<string, string> = {
  INTERMIAMICF: 'MIA',
  LOSANGELESFC: 'LAF',
  LAGALAXY: 'LAG',
  NEWYORKCITYFC: 'NYC',
  NEWYORKREDBULLS: 'NYRB',
  ATLANTAUNITEDFC: 'ATL',
  SEATTLESOUNDERSFC: 'SEA',
  PORTLANDTIMBERS: 'POR',
};

const UCL_NAME_TO_CODE: Record<string, string> = {
  REALMADRID: 'RMA',
  BARCELONA: 'BAR',
  BAYERNMUNICH: 'BAY',
  PARISSAINTGERMAIN: 'PSG',
  JUVENTUS: 'JUV',
  INTERMILAN: 'INT',
  ACMILAN: 'ACM',
  BORUSSIADORTMUND: 'DOR',
  BENFICA: 'BEN',
  PORTO: 'POR',
};

const SOCCER_LEAGUE_NAME_MAPS: Record<string, Record<string, string>> = {
  EPL: EPL_NAME_TO_CODE,
  LA_LIGA: LA_LIGA_NAME_TO_CODE,
  MLS: MLS_NAME_TO_CODE,
  UCL: UCL_NAME_TO_CODE,
  LIGUE_1: LIGUE_1_NAME_TO_CODE,
};

const SOCCER_GLOBAL_NAME_TO_CODE: Record<string, string> = {
  ...EPL_NAME_TO_CODE,
  ...LA_LIGA_NAME_TO_CODE,
  ...LIGUE_1_NAME_TO_CODE,
  ...MLS_NAME_TO_CODE,
  ...UCL_NAME_TO_CODE,
};

type SoccerLogoContext = {
  teamName?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeCode?: string;
  awayCode?: string;
};

function normalizeSoccerToken(value: string | null | undefined): string {
  return String(value || '')
    .toUpperCase()
    .trim()
    .replace(/[_\s]+/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeSoccerLeagueKey(league?: string | null): string {
  const raw = normalizeSoccerToken(league || '');
  if (!raw) return 'SOCCER';
  if (raw === 'EPL' || raw === 'PREMIERLEAGUE') return 'EPL';
  if (raw === 'MLS' || raw === 'MAJORLEAGUESOCCER') return 'MLS';
  if (raw === 'UCL' || raw === 'UEFACHAMPIONSLEAGUE' || raw === 'CHAMPIONSLEAGUE') return 'UCL';
  if (raw === 'LALIGA' || raw === 'LALIGAEA' || raw === 'LALIGAEASPORTS' || raw === 'LALIGA1') return 'LA_LIGA';
  if (raw === 'LIGUE1' || raw === 'LIGUEONE' || raw === 'LIGUEUN') return 'LIGUE_1';
  return raw;
}

function makeSoccerLeagueFallbackCrest(label: string, primary: string, accent: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>
  <defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0%' stop-color='${primary}'/><stop offset='100%' stop-color='${accent}'/></linearGradient></defs>
  <rect x='8' y='8' width='144' height='144' rx='28' fill='url(#g)'/>
  <circle cx='80' cy='80' r='44' fill='rgba(10,18,30,0.30)'/>
  <path d='M80 42l17 10v20l-17 10-17-10V52z' fill='rgba(255,255,255,0.95)'/>
  <text x='80' y='122' text-anchor='middle' font-family='Inter,Arial,sans-serif' font-size='20' font-weight='700' fill='white'>${label}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SOCCER_LEAGUE_FALLBACK_CRESTS: Record<string, string> = {
  EPL: makeSoccerLeagueFallbackCrest('EPL', '#0E2A6B', '#21A1FF'),
  LA_LIGA: makeSoccerLeagueFallbackCrest('LAL', '#7A1BC9', '#FD3A84'),
  LIGUE_1: makeSoccerLeagueFallbackCrest('L1', '#102A56', '#4D79FF'),
  MLS: makeSoccerLeagueFallbackCrest('MLS', '#C62828', '#1976D2'),
  UCL: makeSoccerLeagueFallbackCrest('UCL', '#0B3CB2', '#26C6DA'),
  SOCCER: makeSoccerLeagueFallbackCrest('SOC', '#13365D', '#2AB3A4'),
};

const SOCCER_LOGO_MISS_LOG_KEY = '__GZ_SOCCER_LOGO_MISS_LOGGED__';

function logSoccerLogoMissOnce(league: string | null | undefined, context?: SoccerLogoContext): void {
  if (typeof window === 'undefined') return;
  const normalizedLeague = normalizeSoccerLeagueKey(league);
  const homeTeam = String(context?.homeTeam || '').trim();
  const awayTeam = String(context?.awayTeam || '').trim();
  const homeCode = String(context?.homeCode || '').trim();
  const awayCode = String(context?.awayCode || '').trim();
  const key = `${normalizedLeague}:${homeCode}:${awayCode}:${homeTeam}:${awayTeam}`;
  const bucket = ((window as any)[SOCCER_LOGO_MISS_LOG_KEY] ||= new Set<string>()) as Set<string>;
  if (bucket.has(key)) return;
  bucket.add(key);
  console.log('[SOCCER LOGO MISS]', {
    league: league || null,
    homeTeam,
    awayTeam,
    homeCode,
    awayCode,
    normalizedLeague,
  });
}

// NCAAB team abbreviation to ESPN ID mapping
// ESPN uses numeric IDs for college teams
// Comprehensive mapping including feed abbreviation aliases
const NCAAB_LOGO_MAP: Record<string, string> = {
  // === POWER CONFERENCES ===
  
  // ACC
  'DUKE': '150', 'NCAR': '153', 'UNC': '153', 'NC': '153',
  'NCST': '152', 'VIR': '258', 'UVA': '258', 'VTECH': '259', 'VT': '259',
  'CLMSN': '228', 'CLEM': '228', 'FLST': '52', 'FSU': '52',
  'LOU': '97', 'SYRA': '183', 'SYR': '183', 'ND': '87',
  'MIA': '2390', 'WAKE': '154', 'GTECH': '59', 'GT': '59',
  'BOSCOL': '103', 'BC': '103', 'PITT': '221', 'CAH': '25', 'CAL': '25',
  'STAN': '24', 'SMU': '2567',
  
  // Big Ten (feeds may use MINNST, etc.)
  'MICH': '130', 'MICHST': '127', 'MSU': '127', 'OHST': '194', 'OSU': '194',
  'INDIAN': '84', 'IND': '84', 'IU': '84', 'IOWAST': '66', 'ISU': '66', 'IOWA': '2294',
  'WISC': '275', 'WIS': '275', 'ILL': '356', 'MINNST': '135', 'MINN': '135',
  'NEBR': '158', 'NEB': '158', 'NWEST': '77', 'NW': '77',
  'MARY': '120', 'MD': '120', 'PENNST': '213', 'PSU': '213',
  'RUTGER': '164', 'RUT': '164', 'PURDU': '2509', 'PUR': '2509',
  'UCLA': '26', 'USC': '30', 'WASH': '264', 'WASHST': '265', 'WAZZU': '265',
  'ORE': '2483', 'OREGST': '204', 'ORST': '204',
  
  // Big 12
  'KAN': '2305', 'KU': '2305', 'KANST': '2306', 'KSU': '2306',
  'BAYL': '239', 'BAY': '239', 'TXTECH': '2641', 'TTU': '2641',
  'TX': '251', 'TEX': '251', 'TCU': '2628', 'OKL': '201', 'OU': '201',
  'WVIR': '277', 'WVU': '277', 'OKST': '197',
  'UCF': '2116', 'CIN': '2132', 'HOU': '248',
  'BYU': '252', 'COL': '38', 'COLO': '38',
  'ARZ': '12', 'ARIZ': '12', 'ARZST': '9', 'ASU': '9',
  'UTAH': '254',
  
  // SEC (feeds may use MSPST for Mississippi State)
  'UK': '96', 'KY': '96', 'TENN': '2633',
  'AUBRN': '2', 'AUB': '2', 'ALA': '333', 'BAMA': '333',
  'ARK': '8', 'ARKST': '2032', 'GA': '61', 'UGA': '61', 'FL': '57', 'FLA': '57',
  'LSU': '99', 'MISS': '145', 'MSPST': '344', 'MSST': '344',
  'SC': '2579', 'TXAM': '245', 'TAMU': '2348', 'VAND': '238', 'VAN': '238',
  'MISSR': '142', 'MIZZ': '142', 'MO': '142',
  
  // Big East
  'VILL': '222', 'NOVA': '222', 'UCONN': '41', 'CONN': '41',
  'XAV': '2752', 'XAVI': '2752', 'CREIGH': '156', 'CRE': '156',
  'MARQU': '269', 'MARQ': '269', 'MAR': '269',
  'SETON': '2550', 'HALL': '2550', 'SH': '2550',
  'PROV': '2507', 'GEORGE': '46', 'GTWN': '46',
  'STJOHN': '2599', 'SJU': '2599', 'BUTL': '2086', 'BUT': '2086',
  'DEPAUL': '305', 'DEPA': '305',
  
  // === MID-MAJOR CONFERENCES ===
  
  // WCC
  'GNZG': '2250', 'GONZ': '2250', 'STMRY': '2608', 'SMC': '2608',
  'PEPP': '2492', 'SD': '301', 'USD': '301', 'SF': '2539', 'USF': '2539',
  'SANCLR': '2541', 'SCU': '2541', 'LOYMRY': '2350', 'LMU': '2350',
  'PORT': '2501', 'PACFC': '279', 'PAC': '279',
  
  // Atlantic 10
  'DAY': '2168', 'VCU': '2670', 'RICH': '257', 'STBON': '179',
  'SLU': '139', 'GMU': '2244', 'RI': '227', 'URI': '227', 'RHOD': '227',
  'UMASS': '113', 'MASS': '113', 'LASAL': '2325', 'LAS': '2325',
  'GW': '45', 'DUQ': '149', 'STJOE': '2603', 'SJO': '2603',
  'LOYCH': '2348', 'LOY': '2348', 'FORDM': '2230', 'FORD': '2230',
  'DAVID': '2166',
  
  // Mountain West
  'COLST': '36', 'CSU': '36', 'SDST': '21', 'NMX': '167', 'UNM': '167',
  'UNLV': '2439', 'UTAHST': '328', 'USU': '328', 'BOISE': '68', 'BSU': '68',
  'FREST': '278', 'FRES': '278', 'SJST': '23', 'SJSU': '23',
  'NEVADA': '2440', 'NEV': '2440', 'HAWAII': '62', 'HAW': '62',
  'AIRF': '2005', 'AFA': '2005', 'WYOM': '2704', 'WYO': '2704',
  'NMXST': '166',
  
  // AAC
  'MEM': '235', 'TULN': '2655', 'TUL': '202', 'TEMPL': '218', 'TEM': '218',
  'ECAR': '151', 'ECU': '151', 'NAVY': '2426', 'FAU': '2226',
  'UAB': '5', 'CHARLT': '2429', 'CHAR': '2429', 'RICE': '242',
  'NTX': '249', 'UTSA': '2636', 'WICHST': '2724',
  
  // Missouri Valley
  'BRADLY': '2065', 'ILLST': '2287', 'INDST': '282', 'SILL': '79',
  'MSRST': '2623', 'NIOWA': '2460', 'VALP': '2674', 'EVANS': '339',
  'MURST': '93', 'BELM': '2057',
  
  // Colonial Athletic Association
  'DREXEL': '2182', 'DREX': '2182', 'HOFST': '2275', 'NEAST': '111',
  'ELON': '2210', 'DEL': '48', 'TOWS': '119', 'CHAR2': '2429',
  'WILL': '2737', 'STBR': '2619', 'MONM': '2405',
  
  // MAAC
  'RIDER': '227', 'RID': '2538', 'NIAGRA': '2430', 'NIA': '2430',
  'CANS': '2097', 'CAN': '2097', 'MANH': '2377', 'MAN': '2377',
  'FAIR': '2217', 'QUIN': '2514', 'QU': '2514',
  'SIENA': '2561', 'SIE': '2561', 'MARIST': '2383',
  'IONA': '2287', 'MSTM': '2363', 'STPETE': '2612',
  
  // Ivy League
  'HARVRD': '108', 'HARV': '108', 'YALE': '43', 'PRIN': '163', 'PRINC': '163',
  'PENN': '219', 'BROWN': '225', 'DART': '159',
  'CORNEL': '172', 'CORN': '172', 'COLMB': '171', 'CLMB': '171',
  
  // Patriot League
  'ARMY': '349', 'BUCK': '2083', 'COLG': '2142', 'HOLY': '107',
  'LAFAY': '322', 'LEHI': '2329', 'AMERCN': '44', 'BOSTU': '104',
  'LOYMD': '2352',
  
  // Big Sky
  'EWASH': '331', 'IDHST': '304', 'MONT': '149', 'MONST': '147',
  'NARZ': '2464', 'NCOL': '2458', 'PORTST': '2502',
  'SACST': '16', 'SUTAH': '253', 'WEBST': '2692',
  'IDAHO': '70',
  
  // Summit League
  'DEN': '2172', 'ORAL': '198', 'OAK': '2473',
  'SDAK': '233', 'SDKST': '2571', 'NDAK': '2449', 'NDKST': '2449',
  'UMKC': '140', 'GB': '2739',
  
  // Southland / WAC
  'SFAUS': '2617', 'SMHO': '2534', 'MCNST': '2377', 'NICHLS': '2447',
  'SELOU': '2545', 'NWST': '2466', 'INCAR': '2916', 'LAMAR': '2320',
  'LAMON': '2433', 'NO': '2443', 'TARL': '2627', 'GCAN': '2253',
  
  // SWAC / MEAC (HBCUs)
  'ALAAM': '2010', 'ALAST': '2011', 'ALCST': '2016', 'ARPB': '2029',
  'BCOOK': '2065', 'COPPST': '2154', 'DELST': '48', 'FLAM': '50',
  'GRMBST': '2755', 'HAMP': '2261', 'HOWRD': '47', 'JACKST': '99',
  'MORGST': '2400', 'NCAT': '2448', 'NCC': '2448', 'NORFST': '2450',
  'PVAM': '2504', 'SCARST': '2569', 'SOUTH': '2582', 'TXS': '2640',
  'MSVLST': '2400',
  
  // America East / Northeast
  'ALBNY': '399', 'BING': '2066', 'BUF': '2084', 'MAINE': '311',
  'MASLOW': '2349', 'NHAMP': '2415', 'NJIT': '2885', 'VERM': '261',
  'UMBC': '2378', 'NKENT': '94',
  
  // Horizon / Big South / OVC
  'CLVST': '325', 'DET': '2174', 'ILLCHI': '82', 'WRGHT': '2750',
  'IPFW': '2870', 'MHST': '2130', 'EKENT': '2198', 'JAX': '294',
  'LIBRTY': '2335', 'HPNT': '2272', 'LONGWD': '2344', 'WINTH': '2747',
  'AUSP': '2046', 'JAXST': '55', 'TENST': '2634',
  'TENTCH': '2635',
  
  // Sun Belt / Conference USA
  'APPST': '2026', 'APPLST': '2026', 'COAST': '324',
  'GAST': '290', 'GAS': '290', 'SALA': '6', 'TROY': '2653',
  'ARLR': '2031', 'TXST': '326', 'LOULAF': '309',
  'MARSH': '276', 'MIAOH': '193', 'MTNST': '2393',
  'OLD': '295', 'WKENT': '98', 'CHAT': '236',
  'FLGC': '526', 'FLINT': '2229', 'JAC': '2335', 'KENEST': '338',
  'JMAD': '256', 'NFL': '2450',
  
  // A-Sun / Big West / Horizon
  'BELLA': '91', 'LIPSC': '288', 'QUEEN': '2515', 'STETSN': '56',
  'NFLA': '2450', 'JAX2': '294', 'CAMP': '2097',
  'ABCHR': '2000', 'CARK': '2110', 'LBST': '299',
  'UCIRV': '300', 'UCRVS': '27', 'UCDV': '302', 'USCB': '2540',
  'UCSD': '28', 'CSUFL': '2239', 'CSUNR': '2463',
  
  // WAC / Independents
  'CHIST': '2130', 'SCUP': '2569', 'SEA': '2547', 'UTAHV': '3084',
  'UTRGV': '292', 'TXA': '250', 'UTEP': '2638', 'TXAMC': '357',
  'DXST': '254', 'NAL': '2453', 'UWG': '2755',
  
  // Southern / Atlantic Sun
  'FURMAN': '231', 'WOFF': '2747', 'SAMF': '2534', 'CITA': '2643',
  'MERC': '2382', 'CHSOU': '232', 'VAMIL': '2678',
  'WCAR': '2717',
  
  // MAC Conference
  'CMICH': '2117', 'EMICH': '2199', 'WMICH': '2711',
  'AKRON': '2006', 'BOWLGR': '189', 'KENT': '2309', 'NILL': '2459',
  'OHIO': '195', 'TOLEDO': '2649', 'BALLST': '2050',
  
  // Northeast / NEC
  'CENCON': '2116', 'FAIRDK': '2218', 'LIUB': '2344',
  'WAG': '2681', 'STFPA': '2598', 'SFP': '2598',
  'ROBMS': '2523', 'SACRED': '2529',
  'STNH': '2629', 'STMN': '2612', 'USI': '2565', 'MRCY': '2382',
  
  // C-USA / Sun Belt extras
  'LOUTCH': '2348', 'SOUMIS': '2572',
  
  // SoCon / OVC extras  
  'ETNST': '2193', 'RADF': '2515', 'PRESB': '2506',
  
  // UNC System schools
  'NCASHE': '2427', 'NCG': '2434', 'NCW': '350',
  
  // Missouri Valley / Horizon extras
  'EILL': '2197', 'SIUE': '2565', 'SEMST': '2546',
  
  // Additional missing codes
  'NHVN': '2430', 'LEMYN': '2329', 'HOUBAP': '2277',
  'WBD': '270', 'YNGST': '2754',
  'COR': '172',      // Cornell
  'SDSU': '21',      // San Diego State
  'UVM': '261',      // Vermont
  'WICH': '2724',    // Wichita State

  // SportsRadar alias coverage (current NCAAB slate)
  'AAMU': '2010',   // Alabama A&M
  'AKR': '2006',    // Akron
  'CBU': '2856',    // California Baptist
  'CSF': '2239',    // Cal State Fullerton
  'CSN': '2463',    // Cal State Northridge
  'DAV': '2166',    // Davidson
  'DSU': '2169',    // Delaware State
  'FAMU': '50',     // Florida A&M
  'HOW': '47',      // Howard
  'JOES': '2603',   // Saint Joseph's
  'KENN': '338',    // Kennesaw State
  'LT': '2348',     // Louisiana Tech
  'MOSU': '2623',   // Missouri State
  'NCCU': '2428',   // North Carolina Central
  'OKLA': '201',    // Oklahoma
  'PV': '2504',     // Prairie View A&M
  'SBON': '179',    // St. Bonaventure
  'SCST': '2569',   // South Carolina State
  'SHSU': '2534',   // Sam Houston
  'SOU': '2582',    // Southern
  'TLSA': '202',    // Tulsa
  'TOL': '2649',    // Toledo
  'UCI': '300',     // UC Irvine
  'UNT': '249',     // North Texas
  'UTA': '250',     // UT Arlington
  'UTU': '3101',    // Utah Tech
  'UVU': '3084',    // Utah Valley
};

/**
 * Get the logo URL for an NBA team
 * @param abbr Team abbreviation (e.g., 'LAL', 'BOS', 'GSW')
 * @returns Logo URL or null if not found
 */
export function getNBALogoUrl(abbr: string): string | null {
  if (!abbr) return null;
  
  // Normalize abbreviation
  const normalized = abbr.toUpperCase();
  
  // Check for alias
  const standardAbbr = NBA_ABBR_ALIASES[normalized] || normalized;
  
  // Get ESPN logo code
  const espnCode = NBA_LOGO_MAP[standardAbbr];
  
  if (!espnCode) return null;
  
  return `${ESPN_NBA_LOGO_BASE}/${espnCode}.png`;
}

/**
 * Get the logo URL for an NFL team
 */
export function getNFLLogoUrl(abbr: string): string | null {
  if (!abbr) return null;
  const normalized = abbr.toUpperCase();
  const espnCode = NFL_LOGO_MAP[normalized];
  if (!espnCode) return null;
  return `${ESPN_NFL_LOGO_BASE}/${espnCode}.png`;
}

/**
 * Get the logo URL for an MLB team
 */
export function getMLBLogoUrl(abbr: string): string | null {
  if (!abbr) return null;
  const normalized = abbr.toUpperCase();
  const espnCode = MLB_LOGO_MAP[normalized];
  if (!espnCode) return null;
  return `${ESPN_MLB_LOGO_BASE}/${espnCode}.png`;
}

/**
 * Get the logo URL for an NHL team
 */
export function getNHLLogoUrl(abbr: string): string | null {
  if (!abbr) return null;
  const normalized = abbr.toUpperCase();
  const espnCode = NHL_LOGO_MAP[normalized];
  if (!espnCode) return null;
  return `${ESPN_NHL_LOGO_BASE}/${espnCode}.png`;
}

/**
 * Get the logo URL for a soccer team
 * @param abbr Team abbreviation
 * @param league League code (EPL, MLS, UCL)
 * @returns Logo URL or null if not found
 */
export function getSoccerLogoUrl(abbr: string, league?: string | null, context?: SoccerLogoContext): string | null {
  const normalizedLeague = normalizeSoccerLeagueKey(league);
  const normalizedCode = normalizeSoccerToken(abbr);
  const normalizedName = normalizeSoccerToken(context?.teamName);

  const leagueMap = SOCCER_LEAGUE_CODE_MAPS[normalizedLeague] || null;
  const leagueNames = SOCCER_LEAGUE_NAME_MAPS[normalizedLeague] || null;

  const fromExplicitAlias = SOCCER_TEAM_LEAGUE_ALIASES[`${normalizedLeague}:${normalizedCode}`];
  const fromCodeAlias = SOCCER_CODE_ALIAS_MAP[normalizedCode];
  const fromLeagueName = leagueNames?.[normalizedName || ''];
  const fromGlobalName = SOCCER_GLOBAL_NAME_TO_CODE[normalizedName || ''];
  const candidateCode =
    fromExplicitAlias
    || (normalizedCode && leagueMap?.[normalizedCode] ? normalizedCode : '')
    || (fromCodeAlias && leagueMap?.[fromCodeAlias] ? fromCodeAlias : '')
    || fromLeagueName
    || fromGlobalName
    || fromCodeAlias
    || normalizedCode;

  if (/^\d+$/.test(candidateCode)) {
    return `${ESPN_SOCCER_LOGO_BASE}/${candidateCode}.png`;
  }

  const espnId =
    (leagueMap && leagueMap[candidateCode])
    || EPL_LOGO_MAP[candidateCode]
    || MLS_LOGO_MAP[candidateCode]
    || UCL_LOGO_MAP[candidateCode]
    || LA_LIGA_LOGO_MAP[candidateCode];

  if (espnId) {
    return `${ESPN_SOCCER_LOGO_BASE}/${espnId}.png`;
  }

  // Global soccer fallback: resolve by team name via ESPN lookup so we are
  // not limited to hardcoded league maps only.
  const espnNameFallback = getEspnTeamLogo(undefined, context?.teamName || abbr);
  if (espnNameFallback && !espnNameFallback.includes('default-team-logo')) {
    return espnNameFallback;
  }

  logSoccerLogoMissOnce(league, context);
  return SOCCER_LEAGUE_FALLBACK_CRESTS[normalizedLeague] || SOCCER_LEAGUE_FALLBACK_CRESTS.SOCCER;
}

/**
 * Get the logo URL for an NCAAB team
 */
export function getNCAABLogoUrl(abbr: string): string | null {
  if (!abbr) return null;
  const normalized = abbr.toUpperCase().trim();
  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  const espnId = NCAAB_LOGO_MAP[normalized] || NCAAB_LOGO_MAP[compact];
  if (!espnId) return null;
  return `${ESPN_NCAAB_LOGO_BASE}/${espnId}.png`;
}

/**
 * Country code (ISO3 or common) to ISO2 for flag CDN (flagcdn.com)
 * Used for World Baseball Classic and World Cup (FIFA).
 */
const COUNTRY_TO_ISO2: Record<string, string> = {
  USA: 'us', US: 'us', UNITED_STATES: 'us',
  JPN: 'jp', JP: 'jp', JAPAN: 'jp',
  MEX: 'mx', MX: 'mx', MEXICO: 'mx',
  CUB: 'cu', CU: 'cu', CUBA: 'cu',
  DOM: 'do', DO: 'do', DOMINICAN_REPUBLIC: 'do',
  PUR: 'pr', PR: 'pr', PUERTO_RICO: 'pr',
  KOR: 'kr', KR: 'kr', KOREA: 'kr', SOUTH_KOREA: 'kr',
  VEN: 've', VE: 've', VENEZUELA: 've',
  COL: 'co', CO: 'co', COLOMBIA: 'co',
  CAN: 'ca', CA: 'ca', CANADA: 'ca',
  BRA: 'br', BR: 'br', BRAZIL: 'br',
  ARG: 'ar', AR: 'ar', ARGENTINA: 'ar',
  ESP: 'es', ES: 'es', SPAIN: 'es',
  FRA: 'fr', FR: 'fr', FRANCE: 'fr',
  GER: 'de', DE: 'de', GERMANY: 'de',
  ENG: 'gb', GB: 'gb', ENGLAND: 'gb',
  ITA: 'it', IT: 'it', ITALY: 'it',
  NED: 'nl', NL: 'nl', NETHERLANDS: 'nl',
  POR: 'pt', PT: 'pt', PORTUGAL: 'pt',
  URU: 'uy', UY: 'uy', URUGUAY: 'uy',
  CHI: 'cl', CL: 'cl', CHILE: 'cl',
  ECU: 'ec', EC: 'ec', ECUADOR: 'ec',
  PER: 'pe', PE: 'pe', PERU: 'pe',
  PAN: 'pa', PA: 'pa', PANAMA: 'pa',
  NIC: 'ni', NI: 'ni', NICARAGUA: 'ni',
  HON: 'hn', HN: 'hn', HONDURAS: 'hn',
  GUA: 'gt', GT: 'gt', GUATEMALA: 'gt',
  TAI: 'tw', TW: 'tw', CHINESE_TAIPEI: 'tw', TPE: 'tw',
  CHN: 'cn', CN: 'cn', CHINA: 'cn',
  AUS: 'au', AU: 'au', AUSTRALIA: 'au',
  ISR: 'il', IL: 'il', ISRAEL: 'il',
  IRE: 'ie', IE: 'ie', IRELAND: 'ie',
  CZE: 'cz', CZ: 'cz', CZECH_REPUBLIC: 'cz',
  CRO: 'hr', HR: 'hr', CROATIA: 'hr',
  BEL: 'be', BE: 'be', BELGIUM: 'be',
  SUI: 'ch', CH: 'ch', SWITZERLAND: 'ch',
  WAL: 'gb-wls', WALES: 'gb-wls',
  SCO: 'gb-sct', SCOTLAND: 'gb-sct',
  IRN: 'ir', IR: 'ir', IRAN: 'ir',
  KSA: 'sa', SA: 'sa', SAUDI_ARABIA: 'sa',
  MAR: 'ma', MA: 'ma', MOROCCO: 'ma',
  TUN: 'tn', TN: 'tn', TUNISIA: 'tn',
  SEN: 'sn', SN: 'sn', SENEGAL: 'sn',
  NGA: 'ng', NG: 'ng', NIGERIA: 'ng',
  GHA: 'gh', GH: 'gh', GHANA: 'gh',
  EGY: 'eg', EG: 'eg', EGYPT: 'eg',
  RSA: 'za', ZA: 'za', SOUTH_AFRICA: 'za',
  CRC: 'cr', CR: 'cr', COSTA_RICA: 'cr',
  JAM: 'jm', JM: 'jm', JAMAICA: 'jm',
  TTO: 'tt', TT: 'tt', TRINIDAD_AND_TOBAGO: 'tt',
  GBR: 'gb', UK: 'gb', UNITED_KINGDOM: 'gb',
  WLS: 'gb-wls', SCT: 'gb-sct', NIR: 'gb-nir', NORTH_IRELAND: 'gb-nir',
};

const FLAG_CDN_BASE = 'https://flagcdn.com/w80';

/**
 * Get country flag image URL for international competitions (WBC, World Cup).
 * Uses flagcdn.com; countryCode can be ISO3 (USA, JPN) or common abbreviation.
 */
export function getCountryFlagUrl(countryCode: string): string | null {
  if (!countryCode || typeof countryCode !== 'string') return null;
  const key = countryCode.toUpperCase().trim().replace(/\s+/g, '_');
  const iso2 = COUNTRY_TO_ISO2[key] || COUNTRY_TO_ISO2[key.slice(0, 3)];
  if (!iso2) return null;
  return `${FLAG_CDN_BASE}/${iso2}.png`;
}

/**
 * Check if this context should use country flags (WBC, World Cup).
 */
function isInternationalCompetition(sport: string, league?: string | null): boolean {
  const s = sport?.toUpperCase() || '';
  const l = (league ?? '').toUpperCase();
  if (s === 'WBC' || l === 'WBC' || l === 'WORLD_BASEBALL_CLASSIC' || l === 'WORLD BASEBALL CLASSIC') return true;
  if (s === 'WORLD_CUP' || s === 'FIFA' || l === 'WORLD_CUP' || l === 'FIFA_WORLD_CUP' || l === 'FIFA WORLD CUP') return true;
  return false;
}

/**
 * Check if a sport has logo support
 */
export function hasLogoSupport(sport: string): boolean {
  const normalizedSport = sport.toUpperCase();
  return ['NBA', 'NFL', 'MLB', 'NHL', 'SOCCER', 'NCAAB', 'CBB'].includes(normalizedSport);
}

/**
 * Get logo URL for any supported sport
 * @param abbr Team abbreviation or country code (e.g. USA, JPN for WBC/World Cup)
 * @param sport Sport code (NBA, NFL, MLB, NHL, SOCCER, NCAAB, WBC, WORLD_CUP, etc.)
 * @param league Optional league code (EPL, MLS, UCL, WBC, WORLD_CUP)
 */
export function getTeamLogoUrl(
  abbr: string,
  sport: string,
  league?: string | null,
  options?: { teamName?: string; soccerContext?: SoccerLogoContext }
): string | null {
  const normalizedSport = sport.toUpperCase();

  // World Baseball Classic or World Cup: use country flag
  if (isInternationalCompetition(sport, league)) {
    const flagUrl = getCountryFlagUrl(abbr);
    if (flagUrl) return flagUrl;
  }

  if (normalizedSport === 'NBA') {
    return getNBALogoUrl(abbr);
  }

  if (normalizedSport === 'NFL' || normalizedSport === 'NCAAF') {
    return getNFLLogoUrl(abbr);
  }

  if (normalizedSport === 'MLB') {
    return getMLBLogoUrl(abbr);
  }

  if (normalizedSport === 'NHL') {
    return getNHLLogoUrl(abbr);
  }

  if (normalizedSport === 'SOCCER') {
    return getSoccerLogoUrl(abbr, league, {
      teamName: options?.teamName,
      ...(options?.soccerContext || {}),
    });
  }

  if (normalizedSport === 'NCAAB' || normalizedSport === 'CBB') {
    return getNCAABLogoUrl(abbr);
  }

  return null;
}

/**
 * Get team or country logo URL. For MLB/SOCCER, if no club logo is found,
 * tries country flag (so WBC/World Cup show flags even when league is not set).
 */
export function getTeamOrCountryLogoUrl(
  abbr: string,
  sport: string,
  league?: string | null,
  options?: { teamName?: string; soccerContext?: SoccerLogoContext }
): string | null {
  const url = getTeamLogoUrl(abbr, sport, league, options);
  if (url) return url;
  if (sport?.toUpperCase() === 'MLB' || sport?.toUpperCase() === 'SOCCER') {
    if (sport?.toUpperCase() === 'SOCCER') {
      return SOCCER_LEAGUE_FALLBACK_CRESTS[normalizeSoccerLeagueKey(league)] || SOCCER_LEAGUE_FALLBACK_CRESTS.SOCCER;
    }
    return getCountryFlagUrl(abbr);
  }
  return null;
}

export default {
  getNBALogoUrl,
  getNFLLogoUrl,
  getMLBLogoUrl,
  getNHLLogoUrl,
  getSoccerLogoUrl,
  getNCAABLogoUrl,
  getCountryFlagUrl,
  hasLogoSupport,
  getTeamLogoUrl,
  getTeamOrCountryLogoUrl,
};
