import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Target, Zap, TrendingUp, Calendar,
  Clock, Activity, MessageCircle, Newspaper, 
  BarChart3, ChevronRight, Users
} from "lucide-react";
import { getTeamLogoUrl } from "@/react-app/lib/teamLogos";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";

// ============================================================
// TYPES
// ============================================================
interface PlayerData {
  id: string;
  name: string;
  number: string;
  position: string;
  team: string;
  teamCode: string;
  teamId?: string;
  height: string;
  weight: string;
  experience?: string;
  status: 'active' | 'injured' | 'questionable' | 'out';
  photoUrl: string;
  sport: string;
}

interface SeasonStat {
  label: string;
  value: string | number;
  highlight?: boolean;
}

interface RecentGame {
  opponent: string;
  opponentCode: string;
  date: string;
  result: 'W' | 'L';
  statLine: string;
  matchId?: string;
}

interface GameLogEntry {
  date: string;
  opponent: string;
  opponentCode: string;
  stats: Record<string, string | number>;
  matchId?: string;
}

interface NextGame {
  opponent: string;
  opponentCode: string;
  date: string;
  time: string;
  matchId?: string;
}

interface PropLine {
  type: string;
  line: number;
  overOdds: number;
  underOdds: number;
  trend?: string;
}

interface NewsItem {
  headline: string;
  summary: string;
  coachGNote?: string;
  date: string;
}

// API Response types
interface APIPlayerResponse {
  player: {
    espnId: string;
    displayName: string;
    position: string;
    jersey: string;
    teamName: string;
    teamAbbr: string;
    teamColor: string;
    headshotUrl: string;
    birthDate?: string;
    height?: string;
    weight?: string;
    experience?: string;
    sport: string;
  };
  gameLog: Array<{
    date: string;
    opponent: string;
    homeAway: 'home' | 'away';
    result: 'W' | 'L' | 'T';
    score: string;
    stats: Record<string, string | number>;
    minutes?: string;
  }>;
  seasonAverages: Record<string, number>;
  matchup: {
    opponent: { name: string; abbr: string; logo?: string };
    gameTime?: string;
    venue?: string;
    defensiveRankings?: { overall?: number; ptsAllowed?: number };
  } | null;
  health: {
    status: 'healthy' | 'questionable' | 'doubtful' | 'out' | 'injury_reserve' | 'unknown';
    injury?: string;
    minutesTrend: { last5Avg: number; seasonAvg: number; trend: 'up' | 'down' | 'stable' };
  };
  liveProps?: Array<{
    type: string;
    line: number;
    overOdds: number;
    underOdds: number;
    sportsbook: string;
  }>;
  news?: Array<{
    headline: string;
    description: string;
    published: string;
    link?: string;
  }>;
}

// ============================================================
// SPORT CONFIGURATION
// ============================================================
const SPORT_CONFIG: Record<string, {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  gradient: string;
  statLabels: string[];
  gameLogColumns: string[];
}> = {
  nba: {
    name: 'NBA',
    primaryColor: 'cyan',
    secondaryColor: 'blue',
    gradient: 'from-cyan-900/40 via-slate-900 to-slate-950',
    statLabels: ['PPG', 'RPG', 'APG', 'FG%', 'MPG'],
    gameLogColumns: ['Date', 'Opp', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK'],
  },
  mlb: {
    name: 'MLB',
    primaryColor: 'red',
    secondaryColor: 'amber',
    gradient: 'from-red-900/40 via-slate-900 to-slate-950',
    statLabels: ['AVG', 'HR', 'RBI', 'OPS', 'R'],
    gameLogColumns: ['Date', 'Opp', 'AB', 'H', 'HR', 'RBI', 'R', 'BB'],
  },
  nhl: {
    name: 'NHL',
    primaryColor: 'cyan',
    secondaryColor: 'blue',
    gradient: 'from-cyan-900/40 via-slate-900 to-slate-950',
    statLabels: ['G', 'A', 'PTS', '+/-', 'TOI'],
    gameLogColumns: ['Date', 'Opp', 'G', 'A', 'PTS', '+/-', 'SOG', 'TOI'],
  },
  ncaab: {
    name: 'NCAAB',
    primaryColor: 'orange',
    secondaryColor: 'amber',
    gradient: 'from-orange-900/40 via-slate-900 to-slate-950',
    statLabels: ['PPG', 'RPG', 'APG', '3P%', 'MPG'],
    gameLogColumns: ['Date', 'Opp', 'MIN', 'PTS', 'REB', 'AST', '3PM', 'FG%'],
  },
};

// ============================================================
// ESPN PLAYER ID MAPPINGS
// ============================================================
const ESPN_PLAYER_IDS: Record<string, Record<string, string>> = {
  nba: {
    "LeBron James": "1966",
    "Stephen Curry": "3975",
    "Kevin Durant": "3202",
    "Giannis Antetokounmpo": "3032977",
    "Luka Doncic": "3945274",
    "Jayson Tatum": "4065648",
    "Nikola Jokic": "3112335",
    "Joel Embiid": "3059318",
    "Anthony Davis": "6583",
    "Kawhi Leonard": "6450",
    "Damian Lillard": "6606",
    "Devin Booker": "3136193",
    "Ja Morant": "4279888",
    "Trae Young": "4277905",
    "Donovan Mitchell": "3908809",
    "Jimmy Butler": "6430",
    "Kyrie Irving": "6442",
    "Jaylen Brown": "3917376",
    "Anthony Edwards": "4594268",
    "Shai Gilgeous-Alexander": "4278073",
  },
  mlb: {
    "Shohei Ohtani": "39832",
    "Mike Trout": "30836",
    "Mookie Betts": "33912",
    "Aaron Judge": "33192",
    "Ronald Acuna Jr.": "36185",
    "Freddie Freeman": "31097",
    "Corey Seager": "32691",
    "Juan Soto": "36196",
    "Fernando Tatis Jr.": "38727",
    "Bryce Harper": "30951",
    "Trea Turner": "32678",
    "Marcus Semien": "31027",
    "Jose Ramirez": "32801",
    "Matt Olson": "33835",
    "Vladimir Guerrero Jr.": "39141",
  },
  nhl: {
    "Connor McDavid": "3895074",
    "Leon Draisaitl": "3114727",
    "Nathan MacKinnon": "3041969",
    "Auston Matthews": "4024123",
    "Nikita Kucherov": "3622140",
    "David Pastrnak": "3899937",
    "Cale Makar": "4361515",
    "Kirill Kaprizov": "4024851",
    "Sidney Crosby": "3114",
    "Alex Ovechkin": "3101",
    "Connor Hellebuyck": "3042066",
    "Igor Shesterkin": "4565243",
  },
  ncaab: {
    // Top college players change each year
  },
};

function getPlayerPhotoUrl(name: string, sport: string): string {
  const sportIds = ESPN_PLAYER_IDS[sport.toLowerCase()];
  const espnId = sportIds?.[name];
  if (espnId) {
    const sportPath = sport.toLowerCase() === 'ncaab' ? 'mens-college-basketball' : sport.toLowerCase();
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${espnId}.png&w=350&h=254`;
  }
  return "";
}

// ============================================================
// MOCK DATA GENERATORS
// ============================================================
function getMockPlayerData(playerId: string, sport: string): PlayerData {
  const nameParts = playerId.split('-');
  const name = nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  
  return {
    id: playerId,
    name,
    number: String(Math.floor(Math.random() * 99) + 1),
    position: getRandomPosition(sport),
    team: getRandomTeam(sport),
    teamCode: getRandomTeamCode(sport),
    height: "6'4\"",
    weight: "220 lbs",
    experience: "5th Season",
    status: 'active',
    photoUrl: getPlayerPhotoUrl(name, sport),
    sport,
  };
}

function getRandomPosition(sport: string): string {
  const positions: Record<string, string[]> = {
    nba: ['PG', 'SG', 'SF', 'PF', 'C'],
    mlb: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
    nhl: ['C', 'LW', 'RW', 'D', 'G'],
    ncaab: ['PG', 'SG', 'SF', 'PF', 'C'],
  };
  const sportPositions = positions[sport.toLowerCase()] || positions.nba;
  return sportPositions[Math.floor(Math.random() * sportPositions.length)];
}

function getRandomTeam(sport: string): string {
  const teams: Record<string, string[]> = {
    nba: ['Los Angeles Lakers', 'Boston Celtics', 'Golden State Warriors', 'Miami Heat'],
    mlb: ['Los Angeles Dodgers', 'New York Yankees', 'Houston Astros', 'Atlanta Braves'],
    nhl: ['Edmonton Oilers', 'Toronto Maple Leafs', 'Colorado Avalanche', 'Vegas Golden Knights'],
    ncaab: ['Duke Blue Devils', 'Kentucky Wildcats', 'Kansas Jayhawks', 'UCLA Bruins'],
  };
  const sportTeams = teams[sport.toLowerCase()] || teams.nba;
  return sportTeams[Math.floor(Math.random() * sportTeams.length)];
}

function getRandomTeamCode(sport: string): string {
  const codes: Record<string, string[]> = {
    nba: ['LAL', 'BOS', 'GSW', 'MIA'],
    mlb: ['LAD', 'NYY', 'HOU', 'ATL'],
    nhl: ['EDM', 'TOR', 'COL', 'VGK'],
    ncaab: ['DUKE', 'UK', 'KAN', 'UCLA'],
  };
  const sportCodes = codes[sport.toLowerCase()] || codes.nba;
  return sportCodes[Math.floor(Math.random() * sportCodes.length)];
}

function getMockSeasonStats(sport: string): SeasonStat[] {
  const statsByport: Record<string, SeasonStat[]> = {
    nba: [
      { label: 'PPG', value: '27.4', highlight: true },
      { label: 'RPG', value: '8.2', highlight: true },
      { label: 'APG', value: '7.1', highlight: true },
      { label: 'FG%', value: '52.3%' },
      { label: 'MPG', value: '35.2' },
    ],
    mlb: [
      { label: 'AVG', value: '.312', highlight: true },
      { label: 'HR', value: '38', highlight: true },
      { label: 'RBI', value: '102', highlight: true },
      { label: 'OPS', value: '.987' },
      { label: 'R', value: '98' },
    ],
    nhl: [
      { label: 'Goals', value: '48', highlight: true },
      { label: 'Assists', value: '72', highlight: true },
      { label: 'Points', value: '120', highlight: true },
      { label: '+/-', value: '+32' },
      { label: 'TOI', value: '22:14' },
    ],
    ncaab: [
      { label: 'PPG', value: '21.4', highlight: true },
      { label: 'RPG', value: '6.8', highlight: true },
      { label: 'APG', value: '4.2', highlight: true },
      { label: '3P%', value: '38.5%' },
      { label: 'MPG', value: '32.1' },
    ],
  };
  return statsByport[sport.toLowerCase()] || statsByport.nba;
}

function getMockRecentGames(sport: string): RecentGame[] {
  const opponents = ['BOS', 'NYK', 'MIA', 'PHI', 'CHI'];
  return opponents.map((opp, i) => ({
    opponent: opp,
    opponentCode: opp,
    date: `Jan ${20 - i}`,
    result: i % 2 === 0 ? 'W' : 'L',
    statLine: sport === 'nba' ? `${28 - i} PTS` : sport === 'mlb' ? `${3 - (i % 3)}-${4}` : `${2 - (i % 2)}G`,
  }));
}

function getMockGameLog(sport: string): GameLogEntry[] {
  const config = SPORT_CONFIG[sport.toLowerCase()];
  const opponents = ['BOS', 'NYK', 'MIA', 'PHI', 'CHI', 'LAL', 'GSW', 'DEN'];
  
  return opponents.map((opp, i) => {
    const stats: Record<string, string | number> = {};
    config.gameLogColumns.slice(2).forEach((col, j) => {
      if (col === 'MIN' || col === 'TOI') stats[col] = '32:' + String(i + 10).padStart(2, '0');
      else if (col === 'FG%') stats[col] = `${45 + i}%`;
      else stats[col] = 10 + i + j;
    });
    return {
      date: `Jan ${25 - i}`,
      opponent: opp,
      opponentCode: opp,
      stats,
    };
  });
}

function getMockProps(sport: string): PropLine[] {
  if (sport === 'nba') {
    return [
      { type: 'Points', line: 27.5, overOdds: -110, underOdds: -110, trend: 'Hit 4/5 recent' },
      { type: 'Rebounds', line: 8.5, overOdds: -115, underOdds: -105, trend: 'Over trending' },
      { type: 'Assists', line: 7.5, overOdds: +100, underOdds: -120, trend: 'Steady' },
    ];
  }
  if (sport === 'mlb') {
    return [
      { type: 'Hits', line: 1.5, overOdds: +120, underOdds: -140, trend: 'Hit 3/5 recent' },
      { type: 'Total Bases', line: 2.5, overOdds: -105, underOdds: -115, trend: 'Over trending' },
      { type: 'RBI', line: 0.5, overOdds: -135, underOdds: +115, trend: 'Consistent' },
    ];
  }
  if (sport === 'nhl') {
    return [
      { type: 'Points', line: 1.5, overOdds: +105, underOdds: -125, trend: 'Hot streak' },
      { type: 'Shots on Goal', line: 4.5, overOdds: -110, underOdds: -110, trend: 'Over trending' },
    ];
  }
  return [];
}

function getMockNews(): NewsItem[] {
  return [
    {
      headline: "Player questionable with minor ankle soreness",
      summary: "Expected to be a game-time decision for tonight's matchup.",
      coachGNote: "Based on practice reports, likely to play tonight.",
      date: "2 hours ago",
    },
    {
      headline: "Continuing hot streak with third straight 30+ point game",
      summary: "Has been the primary scoring option with teammate out.",
      date: "Yesterday",
    },
  ];
}

function getMockNextGame(_sport: string): NextGame {
  return {
    opponent: 'Warriors',
    opponentCode: 'GSW',
    date: 'Tonight',
    time: '7:30 PM ET',
  };
}

// ============================================================
// HELPER FUNCTIONS FOR API DATA
// ============================================================
function mapHealthStatus(status?: string): 'active' | 'injured' | 'questionable' | 'out' {
  if (!status) return 'active';
  if (status === 'out' || status === 'injury_reserve') return 'out';
  if (status === 'doubtful') return 'injured';
  if (status === 'questionable') return 'questionable';
  return 'active';
}

function mapSeasonStatsToDisplay(stats: Record<string, number>, sportKey: string): SeasonStat[] {
  const result: SeasonStat[] = [];
  
  // Map ESPN stat labels to display labels (check multiple possible keys)
  const statMappings: Record<string, Record<string, string>> = {
    nba: { 'PTS': 'PPG', 'REB': 'RPG', 'AST': 'APG', 'FG%': 'FG%', 'MIN': 'MPG', 'GP': 'GP' },
    mlb: { 
      'AVG': 'AVG', 'HR': 'HR', 'RBI': 'RBI', 'OPS': 'OPS', 'R': 'R', 
      'H': 'H', 'AB': 'AB', 'OBP': 'OBP', 'SLG': 'SLG', 'BB': 'BB', 'SO': 'K',
      // Pitching
      'W': 'W', 'L': 'L', 'ERA': 'ERA', 'IP': 'IP', 'K': 'K', 'WHIP': 'WHIP'
    },
    nhl: { 'G': 'G', 'A': 'A', 'PTS': 'PTS', '+/-': '+/-', 'TOI': 'TOI' },
    ncaab: { 'PTS': 'PPG', 'REB': 'RPG', 'AST': 'APG', '3P%': '3P%', 'MIN': 'MPG', 'FG%': 'FG%' },
  };
  
  // Priority order for display (first 5 stats) - check multiple possible keys
  const priorityOrder: Record<string, string[][]> = {
    nba: [['PTS'], ['REB'], ['AST'], ['FG%'], ['MIN']],
    mlb: [['AVG'], ['HR'], ['RBI'], ['OPS', 'OBP'], ['R', 'H']],
    nhl: [['G'], ['A'], ['PTS'], ['+/-'], ['TOI']],
    ncaab: [['PTS'], ['REB'], ['AST'], ['3P%', 'FG%'], ['MIN']],
  };
  
  const mapping = statMappings[sportKey] || statMappings.nba;
  const order = priorityOrder[sportKey] || priorityOrder.nba;
  
  // Add stats in priority order, checking alternative keys
  for (const keys of order) {
    let found = false;
    for (const key of keys) {
      const val = stats[key];
      if (val !== undefined) {
        const displayLabel = mapping[key] || key;
        let formattedVal: string;
        
        if (typeof val === 'number') {
          // Format based on stat type
          if (key === 'AVG' || key === 'OBP' || key === 'SLG') {
            // Batting averages are typically displayed as .xxx
            formattedVal = val < 1 ? `.${Math.round(val * 1000)}` : val.toFixed(3);
          } else if (key.includes('%')) {
            formattedVal = `${val.toFixed(1)}%`;
          } else if (key === 'ERA' || key === 'WHIP') {
            formattedVal = val.toFixed(2);
          } else if (Number.isInteger(val)) {
            formattedVal = val.toString();
          } else {
            formattedVal = val.toFixed(1);
          }
        } else {
          formattedVal = String(val);
        }
        
        result.push({
          label: displayLabel,
          value: formattedVal,
          highlight: result.length < 3,
        });
        found = true;
        break;
      }
    }
    if (!found && result.length >= 3) continue; // Skip missing stats after we have 3
  }
  
  // If no real stats found, return mock data
  if (result.length === 0) {
    return getMockSeasonStats(sportKey);
  }
  
  return result;
}

function extractTeamCode(teamName: string): string {
  // Common team name to code mappings
  const codes: Record<string, string> = {
    'lakers': 'LAL', 'celtics': 'BOS', 'warriors': 'GSW', 'heat': 'MIA',
    'knicks': 'NYK', 'bulls': 'CHI', 'nets': 'BKN', '76ers': 'PHI',
    'bucks': 'MIL', 'suns': 'PHX', 'nuggets': 'DEN', 'mavericks': 'DAL',
    'yankees': 'NYY', 'dodgers': 'LAD', 'red sox': 'BOS', 'cubs': 'CHC',
    'oilers': 'EDM', 'maple leafs': 'TOR', 'bruins': 'BOS', 'rangers': 'NYR',
  };
  const lower = teamName.toLowerCase();
  for (const [name, code] of Object.entries(codes)) {
    if (lower.includes(name)) return code;
  }
  return teamName.slice(0, 3).toUpperCase();
}

function formatGameDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatMatchupDate(dateStr: string): string {
  if (!dateStr) return 'TBD';
  try {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Tonight';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatMatchupTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch {
    return '';
  }
}

function formatStatLine(stats: Record<string, string | number>, sport: string): string {
  if (sport === 'nba' || sport === 'ncaab') {
    const pts = stats['PTS'] ?? stats['Points'] ?? stats['points'] ?? 0;
    return `${pts} PTS`;
  }
  if (sport === 'mlb') {
    const h = stats['H'] ?? stats['Hits'] ?? stats['hits'] ?? '-';
    const ab = stats['AB'] ?? stats['AtBats'] ?? stats['atBats'] ?? '-';
    const hr = stats['HR'] ?? stats['HomeRuns'] ?? stats['homeRuns'];
    const rbi = stats['RBI'] ?? stats['RBIs'] ?? stats['rbis'];
    
    // If we have hits/at-bats, show that
    if (h !== '-' && ab !== '-') {
      let line = `${h}-${ab}`;
      if (hr && Number(hr) > 0) line += `, ${hr} HR`;
      else if (rbi && Number(rbi) > 0) line += `, ${rbi} RBI`;
      return line;
    }
    // For pitchers, try IP/K
    const ip = stats['IP'] ?? stats['InningsPitched'];
    const k = stats['K'] ?? stats['SO'] ?? stats['Strikeouts'];
    if (ip) {
      return `${ip} IP${k ? `, ${k} K` : ''}`;
    }
    return '-';
  }
  if (sport === 'nhl') {
    const g = stats['G'] ?? stats['Goals'] ?? stats['goals'] ?? 0;
    const a = stats['A'] ?? stats['Assists'] ?? stats['assists'] ?? 0;
    if (Number(g) + Number(a) > 0) return `${g}G ${a}A`;
    const sog = stats['SOG'] ?? stats['ShotsOnGoal'] ?? stats['shots'];
    if (sog) return `${sog} SOG`;
    return '0 PTS';
  }
  return '-';
}

// Get ordered stats for game log based on sport
function getGameLogStats(stats: Record<string, string | number>, sport: string): (string | number)[] {
  const columns: Record<string, string[]> = {
    nba: ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK'],
    mlb: ['AB', 'H', 'HR', 'RBI', 'R', 'BB'],
    nhl: ['G', 'A', 'PTS', '+/-', 'SOG', 'TOI'],
    ncaab: ['MIN', 'PTS', 'REB', 'AST', '3PM', 'FG%'],
  };
  
  const sportCols = columns[sport.toLowerCase()] || columns.nba;
  return sportCols.map(col => stats[col] ?? '-');
}

// ============================================================
// COACH G AVATAR
// ============================================================
const COACH_G_AVATAR = "/assets/coachg/coach-g-avatar.png";

// ============================================================
// COMPONENTS
// ============================================================

function StatCard({ label, value, highlight = false, sport: _sport }: {
  label: string;
  value: string | number;
  highlight?: boolean;
  sport: string;
}) {
  // Sport-specific config available for future use
  
  return (
    <div className={`rounded-xl p-4 border ${highlight 
      ? 'bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border-cyan-500/30' 
      : 'bg-white/5 border-white/10'}`}>
      <div className="text-xs text-white/50 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-black ${highlight ? 'text-cyan-300' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

function RecentGameCard({ game, sport }: { game: RecentGame; sport: string }) {
  const logoUrl = getTeamLogoUrl(game.opponentCode, sport.toUpperCase());
  
  return (
    <div className="flex-shrink-0 w-20 rounded-xl bg-white/5 border border-white/10 p-3 text-center">
      <div className="text-xs text-white/40 mb-1">{game.date}</div>
      <div className="w-8 h-8 mx-auto mb-1 bg-white/10 rounded-lg overflow-hidden">
        {logoUrl ? (
          <img src={logoUrl} alt={game.opponent} className="w-full h-full object-contain p-1" />
        ) : (
          <span className="text-xs text-white/50">{game.opponent}</span>
        )}
      </div>
      <div className={`text-xs font-bold mb-1 ${game.result === 'W' ? 'text-green-400' : 'text-red-400'}`}>
        {game.result}
      </div>
      <div className="text-sm font-bold text-white">{game.statLine}</div>
    </div>
  );
}

function CoachGIntelCard({ playerName, sport: _sport }: { playerName: string; sport: string }) {
  const navigate = useNavigate();
  const insights = [
    "Usage rate rising with teammate injury",
    "Scoring trending over last 5 games",
    "Favorable matchup tonight vs weak defense",
  ];
  
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-600/10 border border-violet-500/20 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-violet-500/20 border-2 border-violet-400/50">
          <img src={COACH_G_AVATAR} alt="Coach G" className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="text-violet-300 font-bold">Coach G Player Intel</div>
          <div className="text-xs text-white/50">AI-powered insights</div>
        </div>
      </div>
      
      <div className="space-y-2 mb-4">
        {insights.map((insight, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-white/80">
            <Zap className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
            <span>{insight}</span>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate(`/coach?q=${encodeURIComponent(`Tell me about ${playerName}`)}`)}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-sm font-medium transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Ask Coach G
        </button>
        <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm font-medium transition-colors">
          <BarChart3 className="w-4 h-4" />
          View Props
        </button>
      </div>
    </div>
  );
}

function PropLineCard({ prop }: { prop: PropLine }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-white/70">{prop.type}</span>
        <span className="text-amber-400 font-bold">{prop.line}</span>
      </div>
      <div className="flex gap-2 mb-2">
        <button className="flex-1 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors">
          Over {prop.overOdds > 0 ? '+' : ''}{prop.overOdds}
        </button>
        <button className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors">
          Under {prop.underOdds > 0 ? '+' : ''}{prop.underOdds}
        </button>
      </div>
      {prop.trend && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          <TrendingUp className="w-3 h-3 text-cyan-400" />
          {prop.trend}
        </div>
      )}
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Newspaper className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium mb-1">{item.headline}</div>
          <div className="text-sm text-white/60 mb-2">{item.summary}</div>
          {item.coachGNote && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <img src={COACH_G_AVATAR} alt="Coach G" className="w-5 h-5 rounded-full" />
              <div className="text-xs text-violet-300">{item.coachGNote}</div>
            </div>
          )}
          <div className="text-xs text-white/40 mt-2">{item.date}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function UniversalPlayerPage() {
  const { sportKey, playerId } = useParams<{ sportKey: string; playerId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [seasonStats, setSeasonStats] = useState<SeasonStat[]>([]);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);
  const [props, setProps] = useState<PropLine[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [nextGame, setNextGame] = useState<NextGame | null>(null);
  
  const sportLower = sportKey?.toLowerCase() || 'nba';
  const config = SPORT_CONFIG[sportLower] || SPORT_CONFIG.nba;

  useEffect(() => {
    if (!playerId || !sportKey) return;
    
    const fetchPlayerData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Convert slug to player name for API
        const playerName = playerId.split('-').map(p => 
          p.charAt(0).toUpperCase() + p.slice(1)
        ).join(' ');
        
        const res = await fetch(`/api/player/${sportLower.toUpperCase()}/${encodeURIComponent(playerName)}`);
        
        if (!res.ok) {
          // Try fallback with raw playerId
          const fallbackRes = await fetch(`/api/player/${sportLower.toUpperCase()}/${encodeURIComponent(playerId)}`);
          if (!fallbackRes.ok) {
            throw new Error('Player not found');
          }
          const data = await fallbackRes.json() as APIPlayerResponse;
          processPlayerData(data);
          return;
        }
        
        const data = await res.json() as APIPlayerResponse;
        processPlayerData(data);
        
      } catch (err) {
        console.error('Error fetching player:', err);
        setError('Unable to load player data');
        // Fall back to mock data
        const playerData = getMockPlayerData(playerId, sportLower);
        setPlayer(playerData);
        setSeasonStats(getMockSeasonStats(sportLower));
        setRecentGames(getMockRecentGames(sportLower));
        setGameLog(getMockGameLog(sportLower));
        setProps(getMockProps(sportLower));
        setNews(getMockNews());
        setNextGame(getMockNextGame(sportLower));
      } finally {
        setLoading(false);
      }
    };
    
    const processPlayerData = (data: APIPlayerResponse) => {
      const p = data.player;
      
      // Map API response to PlayerData
      setPlayer({
        id: p.espnId,
        name: p.displayName,
        number: p.jersey || '00',
        position: p.position || '',
        team: p.teamName || '',
        teamCode: p.teamAbbr || '',
        height: p.height || '',
        weight: p.weight || '',
        experience: p.experience,
        status: mapHealthStatus(data.health?.status),
        photoUrl: p.headshotUrl || '',
        sport: sportLower,
      });
      
      // Map season averages to stat cards
      const stats = data.seasonAverages || {};
      setSeasonStats(mapSeasonStatsToDisplay(stats, sportLower));
      
      // Map game log to recent games
      if (data.gameLog && data.gameLog.length > 0) {
        setRecentGames(data.gameLog.slice(0, 5).map(g => ({
          opponent: g.opponent,
          opponentCode: extractTeamCode(g.opponent),
          date: formatGameDate(g.date),
          result: g.result as 'W' | 'L',
          statLine: formatStatLine(g.stats, sportLower),
        })));
        
        setGameLog(data.gameLog.slice(0, 8).map(g => ({
          date: formatGameDate(g.date),
          opponent: g.opponent,
          opponentCode: extractTeamCode(g.opponent),
          stats: g.stats,
        })));
      } else {
        setRecentGames(getMockRecentGames(sportLower));
        setGameLog(getMockGameLog(sportLower));
      }
      
      // Set next game from matchup data
      if (data.matchup) {
        setNextGame({
          opponent: data.matchup.opponent.name,
          opponentCode: data.matchup.opponent.abbr,
          date: data.matchup.gameTime ? formatMatchupDate(data.matchup.gameTime) : 'TBD',
          time: data.matchup.gameTime ? formatMatchupTime(data.matchup.gameTime) : '',
        });
      } else {
        setNextGame(null);
      }
      
      // Props and news - use API data if available, otherwise mock
      if (data.liveProps && data.liveProps.length > 0) {
        setProps(data.liveProps.map(p => ({
          type: p.type,
          line: p.line,
          overOdds: p.overOdds,
          underOdds: p.underOdds,
          trend: 'Hit 4/5 recent',
        })));
      } else {
        setProps(getMockProps(sportLower));
      }
      
      if (data.news && data.news.length > 0) {
        setNews(data.news.map(n => ({
          headline: n.headline,
          summary: n.description,
          date: new Date(n.published).toLocaleDateString(),
        })));
      } else {
        setNews(getMockNews());
      }
    };
    
    fetchPlayerData();
  }, [playerId, sportKey, sportLower]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white/60">Player not found</div>
      </div>
    );
  }

  const teamLogoUrl = getTeamLogoUrl(player.teamCode, sportLower.toUpperCase());

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate(`/sports/${sportLower}`)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </button>
          <Link 
            to={`/sports/${sportLower}/team/${player.teamCode}`}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            {teamLogoUrl && (
              <img src={teamLogoUrl} alt={player.team} className="w-8 h-8" />
            )}
            <span className="text-white/80 font-medium">{player.team}</span>
            <ChevronRight className="w-4 h-4 text-white/40" />
          </Link>
        </div>
      </div>

      {/* SECTION 1: Player Hero */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden bg-gradient-to-br ${config.gradient}`}
      >
        <div className="relative max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
            {/* Player Photo */}
            <div className="relative">
              <div className="w-40 h-40 md:w-56 md:h-56 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 overflow-hidden shadow-2xl">
                {player.photoUrl ? (
                  <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Users className="w-20 h-20 text-white/20" />
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-xl bg-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/50">
                <span className="text-white font-black text-lg">#{player.number}</span>
              </div>
              {player.status !== 'active' && (
                <div className={`absolute -top-2 -left-2 px-2 py-1 rounded-lg text-xs font-bold ${
                  player.status === 'injured' ? 'bg-red-500 text-white' :
                  player.status === 'questionable' ? 'bg-amber-500 text-black' :
                  'bg-gray-500 text-white'
                }`}>
                  {player.status.toUpperCase()}
                </div>
              )}
            </div>

            {/* Player Info */}
            <div className="text-center md:text-left flex-1">
              <div className="flex items-center gap-2 justify-center md:justify-start mb-2 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-sm font-bold">
                  {player.position}
                </span>
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white/60 text-sm">
                  {config.name}
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-2">{player.name}</h1>
              <Link 
                to={`/sports/${sportLower}/team/${player.teamCode}`}
                className="text-white/60 text-lg hover:text-white/80 transition-colors inline-flex items-center gap-2"
              >
                {player.team}
                <ChevronRight className="w-4 h-4" />
              </Link>
              
              {/* Next Game */}
              {nextGame && (
                <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <div className="text-sm">
                    <span className="text-white/50">Next: </span>
                    <span className="text-white font-medium">vs {nextGame.opponent}</span>
                    <span className="text-white/50"> • {nextGame.date} {nextGame.time}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* SECTION 2: Coach G Intel */}
        <CoachGIntelCard playerName={player.name} sport={sportLower} />

        {/* SECTION 3: Season Snapshot */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-xl font-black text-white">Season Snapshot</h2>
            <span className="px-2 py-1 rounded bg-white/10 text-white/50 text-xs">2025-26</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {seasonStats.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} highlight={stat.highlight} sport={sportLower} />
            ))}
          </div>
        </div>

        {/* SECTION 4: Recent Form */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-600/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <h2 className="text-xl font-black text-white">Recent Form</h2>
            <span className="text-sm text-white/50">Last 5 Games</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
            {recentGames.map((game, i) => (
              <RecentGameCard key={i} game={game} sport={sportLower} />
            ))}
          </div>
        </div>

        {/* SECTION 5: Game Log */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/30 to-green-600/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="text-xl font-black text-white">Game Log</h2>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-white/10">
                    {config.gameLogColumns.map((col) => (
                      <th key={col} className="px-4 py-3 text-left text-xs text-white/50 uppercase tracking-wider font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gameLog.slice(0, 5).map((entry, i) => {
                    const orderedStats = getGameLogStats(entry.stats, sportLower);
                    return (
                      <tr 
                        key={i} 
                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => entry.matchId && navigate(toGameDetailPath(sportLower, entry.matchId))}
                      >
                        <td className="px-4 py-3 text-sm text-white/70">{entry.date}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getTeamLogoUrl(entry.opponentCode, sportLower.toUpperCase()) && (
                              <img 
                                src={getTeamLogoUrl(entry.opponentCode, sportLower.toUpperCase())!} 
                                alt={entry.opponent} 
                                className="w-5 h-5"
                              />
                            )}
                            <span className="text-sm text-white">{entry.opponent}</span>
                          </div>
                        </td>
                        {orderedStats.map((val, j) => (
                          <td key={j} className="px-4 py-3 text-sm text-white/80">{val}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* SECTION 6: Player News */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-600/20 flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-amber-400" />
            </div>
            <h2 className="text-xl font-black text-white">Player News</h2>
          </div>
          <div className="space-y-3">
            {news.map((item, i) => (
              <NewsCard key={i} item={item} />
            ))}
          </div>
        </div>

        {/* SECTION 7: Props / Betting Intel */}
        {props.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-xl font-black text-white">Props & Betting Intel</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {props.map((prop, i) => (
                <PropLineCard key={i} prop={prop} />
              ))}
            </div>
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-600/10 border border-violet-500/20">
              <div className="flex items-start gap-3">
                <img src={COACH_G_AVATAR} alt="Coach G" className="w-8 h-8 rounded-full" />
                <div>
                  <div className="text-sm text-violet-300 font-medium mb-1">Coach G Edge</div>
                  <div className="text-sm text-white/70">
                    Player has hit the points line in 4 of last 5 games. Favorable matchup tonight against a defense allowing 118 PPG.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
