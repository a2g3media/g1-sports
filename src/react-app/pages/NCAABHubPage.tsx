import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Trophy, Calendar, Users, Sparkles, ChevronLeft, ChevronRight, 
  Circle, MessageSquare, Target, Search, TrendingUp,
  Newspaper, ArrowRight, Flame, Star
} from "lucide-react";
import { PlayerSearch } from "@/react-app/components/PlayerSearch";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { getNcaabTournamentState } from "@/react-app/lib/ncaabTournamentSeason";
import { buildPlayerRoute, buildTeamRoute, logPlayerNavigation, logTeamNavigation } from "@/react-app/lib/navigationRoutes";

function getDateInEastern(dateInput: string | Date): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

// NCAAB CONFERENCES
// ============================================================
const CONFERENCES = [
  { id: "acc", name: "ACC", color: "#013CA6" },
  { id: "big-ten", name: "Big Ten", color: "#0088CE" },
  { id: "big-12", name: "Big 12", color: "#004B87" },
  { id: "sec", name: "SEC", color: "#004B8D" },
  { id: "pac-12", name: "Pac-12", color: "#004C54" },
  { id: "big-east", name: "Big East", color: "#005EB8" },
  { id: "aac", name: "AAC", color: "#C41230" },
  { id: "mwc", name: "Mountain West", color: "#00205B" },
  { id: "wcc", name: "WCC", color: "#002F6C" },
  { id: "a10", name: "Atlantic 10", color: "#002B5C" },
];

// ============================================================
// TOP 25 TEAMS (MOCK AP RANKINGS)
// ============================================================
const TOP_25_TEAMS = [
  { rank: 1, teamId: "purdue", name: "Purdue", conference: "Big Ten", record: "27-3", last10: "8-2", streak: "W4", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2509.png" },
  { rank: 2, teamId: "uconn", name: "UConn", conference: "Big East", record: "26-4", last10: "9-1", streak: "W6", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png" },
  { rank: 3, teamId: "houston", name: "Houston", conference: "Big 12", record: "25-4", last10: "8-2", streak: "W3", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/248.png" },
  { rank: 4, teamId: "duke", name: "Duke", conference: "ACC", record: "24-5", last10: "7-3", streak: "L1", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/150.png" },
  { rank: 5, teamId: "kansas", name: "Kansas", conference: "Big 12", record: "23-6", last10: "7-3", streak: "W2", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2305.png" },
  { rank: 6, teamId: "arizona", name: "Arizona", conference: "Big 12", record: "23-5", last10: "8-2", streak: "W5", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/12.png" },
  { rank: 7, teamId: "tennessee", name: "Tennessee", conference: "SEC", record: "22-6", last10: "6-4", streak: "W1", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2633.png" },
  { rank: 8, teamId: "kentucky", name: "Kentucky", conference: "SEC", record: "22-7", last10: "7-3", streak: "W2", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/96.png" },
  { rank: 9, teamId: "auburn", name: "Auburn", conference: "SEC", record: "22-6", last10: "8-2", streak: "W4", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2.png" },
  { rank: 10, teamId: "marquette", name: "Marquette", conference: "Big East", record: "22-7", last10: "6-4", streak: "L2", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/269.png" },
  { rank: 11, teamId: "creighton", name: "Creighton", conference: "Big East", record: "21-7", last10: "7-3", streak: "W3", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/156.png" },
  { rank: 12, teamId: "baylor", name: "Baylor", conference: "Big 12", record: "21-8", last10: "5-5", streak: "L1", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/239.png" },
  { rank: 13, teamId: "illinois", name: "Illinois", conference: "Big Ten", record: "21-8", last10: "6-4", streak: "W1", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/356.png" },
  { rank: 14, teamId: "iowa-state", name: "Iowa State", conference: "Big 12", record: "21-8", last10: "7-3", streak: "W2", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/66.png" },
  { rank: 15, teamId: "north-carolina", name: "North Carolina", conference: "ACC", record: "20-9", last10: "5-5", streak: "L2", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/153.png" },
  { rank: 16, teamId: "gonzaga", name: "Gonzaga", conference: "WCC", record: "22-5", last10: "9-1", streak: "W8", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2250.png" },
  { rank: 17, teamId: "alabama", name: "Alabama", conference: "SEC", record: "20-9", last10: "6-4", streak: "W1", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png" },
  { rank: 18, teamId: "wisconsin", name: "Wisconsin", conference: "Big Ten", record: "20-9", last10: "7-3", streak: "W3", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/275.png" },
  { rank: 19, teamId: "byu", name: "BYU", conference: "Big 12", record: "20-9", last10: "5-5", streak: "L1", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/252.png" },
  { rank: 20, teamId: "san-diego-state", name: "San Diego State", conference: "Mountain West", record: "21-7", last10: "8-2", streak: "W4", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/21.png" },
  { rank: 21, teamId: "texas-tech", name: "Texas Tech", conference: "Big 12", record: "19-10", last10: "6-4", streak: "W2", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2641.png" },
  { rank: 22, teamId: "clemson", name: "Clemson", conference: "ACC", record: "19-10", last10: "5-5", streak: "L1", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/228.png" },
  { rank: 23, teamId: "florida", name: "Florida", conference: "SEC", record: "19-10", last10: "6-4", streak: "W1", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/57.png" },
  { rank: 24, teamId: "utah-state", name: "Utah State", conference: "Mountain West", record: "21-7", last10: "7-3", streak: "W2", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/328.png" },
  { rank: 25, teamId: "texas-am", name: "Texas A&M", conference: "SEC", record: "18-11", last10: "5-5", streak: "L2", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/245.png" },
];

// ============================================================
// CONFERENCE STANDINGS (MOCK DATA)
// ============================================================
const CONFERENCE_STANDINGS: Record<string, Array<{teamId: string; name: string; logo: string; confRecord: string; overall: string; streak: string}>> = {
  "acc": [
    { teamId: "duke", name: "Duke", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/150.png", confRecord: "14-4", overall: "24-5", streak: "L1" },
    { teamId: "north-carolina", name: "North Carolina", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/153.png", confRecord: "13-5", overall: "20-9", streak: "L2" },
    { teamId: "clemson", name: "Clemson", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/228.png", confRecord: "12-6", overall: "19-10", streak: "L1" },
    { teamId: "virginia", name: "Virginia", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/258.png", confRecord: "11-7", overall: "18-11", streak: "W2" },
    { teamId: "wake-forest", name: "Wake Forest", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/154.png", confRecord: "10-8", overall: "17-12", streak: "W1" },
  ],
  "big-ten": [
    { teamId: "purdue", name: "Purdue", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2509.png", confRecord: "16-2", overall: "27-3", streak: "W4" },
    { teamId: "illinois", name: "Illinois", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/356.png", confRecord: "14-4", overall: "21-8", streak: "W1" },
    { teamId: "wisconsin", name: "Wisconsin", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/275.png", confRecord: "13-5", overall: "20-9", streak: "W3" },
    { teamId: "michigan-state", name: "Michigan State", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/127.png", confRecord: "12-6", overall: "18-11", streak: "L1" },
    { teamId: "ohio-state", name: "Ohio State", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/194.png", confRecord: "10-8", overall: "17-12", streak: "W1" },
  ],
  "big-12": [
    { teamId: "houston", name: "Houston", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/248.png", confRecord: "14-3", overall: "25-4", streak: "W3" },
    { teamId: "kansas", name: "Kansas", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2305.png", confRecord: "13-4", overall: "23-6", streak: "W2" },
    { teamId: "arizona", name: "Arizona", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/12.png", confRecord: "13-4", overall: "23-5", streak: "W5" },
    { teamId: "iowa-state", name: "Iowa State", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/66.png", confRecord: "12-5", overall: "21-8", streak: "W2" },
    { teamId: "baylor", name: "Baylor", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/239.png", confRecord: "11-6", overall: "21-8", streak: "L1" },
  ],
  "sec": [
    { teamId: "tennessee", name: "Tennessee", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2633.png", confRecord: "13-3", overall: "22-6", streak: "W1" },
    { teamId: "auburn", name: "Auburn", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2.png", confRecord: "13-3", overall: "22-6", streak: "W4" },
    { teamId: "kentucky", name: "Kentucky", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/96.png", confRecord: "12-4", overall: "22-7", streak: "W2" },
    { teamId: "alabama", name: "Alabama", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png", confRecord: "11-5", overall: "20-9", streak: "W1" },
    { teamId: "florida", name: "Florida", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/57.png", confRecord: "10-6", overall: "19-10", streak: "W1" },
  ],
  "big-east": [
    { teamId: "uconn", name: "UConn", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png", confRecord: "15-2", overall: "26-4", streak: "W6" },
    { teamId: "marquette", name: "Marquette", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/269.png", confRecord: "13-4", overall: "22-7", streak: "L2" },
    { teamId: "creighton", name: "Creighton", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/156.png", confRecord: "12-5", overall: "21-7", streak: "W3" },
    { teamId: "villanova", name: "Villanova", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/222.png", confRecord: "10-7", overall: "17-12", streak: "L1" },
    { teamId: "xavier", name: "Xavier", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2752.png", confRecord: "9-8", overall: "16-13", streak: "W1" },
  ],
};

// ============================================================
// LEAGUE LEADERS (MOCK DATA)
// ============================================================
const LEAGUE_LEADERS = {
  points: [
    { id: "player1", name: "Zach Edey", team: "Purdue", value: 23.8, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2509.png" },
    { id: "player2", name: "Hunter Dickinson", team: "Kansas", value: 22.4, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2305.png" },
    { id: "player3", name: "Johnell Davis", team: "Florida Atlantic", value: 21.8, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2226.png" },
    { id: "player4", name: "RJ Davis", team: "North Carolina", value: 21.2, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/153.png" },
    { id: "player5", name: "Mark Sears", team: "Alabama", value: 20.6, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png" },
  ],
  assists: [
    { id: "player6", name: "Tyler Kolek", team: "Marquette", value: 8.2, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/269.png" },
    { id: "player7", name: "Boo Buie", team: "Northwestern", value: 6.8, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/77.png" },
    { id: "player8", name: "Dug McDaniel", team: "Michigan", value: 6.5, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/130.png" },
    { id: "player9", name: "Trey Alexander", team: "Creighton", value: 6.3, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/156.png" },
    { id: "player10", name: "Tristen Newton", team: "UConn", value: 6.1, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png" },
  ],
  rebounds: [
    { id: "player11", name: "Zach Edey", team: "Purdue", value: 12.8, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2509.png" },
    { id: "player12", name: "Ryan Kalkbrenner", team: "Creighton", value: 11.2, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/156.png" },
    { id: "player13", name: "Jamarion Sharp", team: "Western Kentucky", value: 10.8, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/98.png" },
    { id: "player14", name: "Donovan Clingan", team: "UConn", value: 10.5, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png" },
    { id: "player15", name: "Ugonna Onyenso", team: "Kentucky", value: 10.1, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/96.png" },
  ],
  threePoint: [
    { id: "player16", name: "Dalton Knecht", team: "Tennessee", value: 3.8, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2633.png" },
    { id: "player17", name: "Terrence Shannon Jr.", team: "Illinois", value: 3.4, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/356.png" },
    { id: "player18", name: "Cam Spencer", team: "UConn", value: 3.2, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png" },
    { id: "player19", name: "Jayhawk McBride", team: "Kansas", value: 3.0, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2305.png" },
    { id: "player20", name: "Gradey Dick", team: "Toronto", value: 2.9, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2305.png" },
  ],
  blocks: [
    { id: "player21", name: "Zach Edey", team: "Purdue", value: 2.4, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/2509.png" },
    { id: "player22", name: "Donovan Clingan", team: "UConn", value: 2.3, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png" },
    { id: "player23", name: "Kyle Filipowski", team: "Duke", value: 1.9, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/150.png" },
    { id: "player24", name: "Ugonna Onyenso", team: "Kentucky", value: 1.8, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/96.png" },
    { id: "player25", name: "Kel'el Ware", team: "Indiana", value: 1.7, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/84.png" },
  ],
  steals: [
    { id: "player26", name: "Marcus Sasser", team: "Houston", value: 2.4, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/248.png" },
    { id: "player27", name: "Jarace Walker", team: "Houston", value: 2.2, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/248.png" },
    { id: "player28", name: "Stephon Castle", team: "UConn", value: 2.0, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png" },
    { id: "player29", name: "AJ Storr", team: "Wisconsin", value: 1.9, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/275.png" },
    { id: "player30", name: "DJ Horne", team: "Arizona", value: 1.8, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/12.png" },
  ],
};

// ============================================================
// BUBBLE WATCH TEAMS (MOCK)
// ============================================================
const BUBBLE_WATCH = {
  lastFourIn: [
    { teamId: "colorado", name: "Colorado", conference: "Big 12", record: "19-11", insight: "Signature wins keeping them in" },
    { teamId: "james-madison", name: "James Madison", conference: "Sun Belt", record: "24-6", insight: "Mid-major with strong resume" },
    { teamId: "virginia", name: "Virginia", conference: "ACC", record: "18-11", insight: "Brand name saving them" },
    { teamId: "nebraska", name: "Nebraska", conference: "Big Ten", record: "18-12", insight: "Quality losses in tough league" },
  ],
  firstFourOut: [
    { teamId: "saint-marys", name: "Saint Mary's", conference: "WCC", record: "20-10", insight: "Needs conference tournament run" },
    { teamId: "seton-hall", name: "Seton Hall", conference: "Big East", record: "17-12", insight: "Inconsistent down stretch" },
    { teamId: "oklahoma", name: "Oklahoma", conference: "Big 12", record: "17-13", insight: "Too many bad losses" },
    { teamId: "rutgers", name: "Rutgers", conference: "Big Ten", record: "16-14", insight: "Fading at wrong time" },
  ],
  nextFourOut: [
    { teamId: "pittsburgh", name: "Pittsburgh", conference: "ACC", record: "17-13", insight: "Resume too thin" },
    { teamId: "georgia", name: "Georgia", conference: "SEC", record: "16-14", insight: "Needs miracle finish" },
    { teamId: "cincinnati", name: "Cincinnati", conference: "Big 12", record: "16-14", insight: "Not enough quality wins" },
    { teamId: "wake-forest", name: "Wake Forest", conference: "ACC", record: "17-12", insight: "Trending wrong direction" },
  ],
};

// ============================================================
// STORYLINES
// ============================================================
const STORYLINES = [
  {
    id: "1",
    headline: "Zach Edey Dominance: NPOY Lock?",
    summary: "Purdue's 7'4\" center averaging historic numbers in Big Ten play",
    insight: "Edey props hitting at 75% rate. Back the over on rebounds.",
    hot: true,
  },
  {
    id: "2",
    headline: "UConn's Title Defense Rolling",
    summary: "Huskies on 6-game win streak, looking like favorites again",
    insight: "UConn ATS 8-2 last 10. Trust the defending champs.",
    hot: true,
  },
  {
    id: "3",
    headline: "Big Ten Tournament Preview",
    summary: "Most competitive conference race in years heads to Indianapolis",
    insight: "Look for underdog value in early rounds. Chaos incoming.",
    hot: false,
  },
  {
    id: "4",
    headline: "Duke Freshmen Stepping Up",
    summary: "Blue Devils' young core finding rhythm in ACC play",
    insight: "Duke moneyline value in road games. Experience showing.",
    hot: false,
  },
  {
    id: "5",
    headline: "Bubble Watch: Conference Tournaments Key",
    summary: "Several teams need strong finishes to secure NCAA bids",
    insight: "Bubble teams fight harder. Fade favorites in early rounds.",
    hot: false,
  },
];

// ============================================================
// COACH G INSIGHTS
// ============================================================
const COACH_G_INSIGHTS = [
  "Big Ten race tightening after Purdue loss.",
  "Kansas offense trending high in last five games.",
  "Duke strong ATS in conference play.",
  "Watch the under in SEC matchups - defense first.",
  "UConn back-to-back potential growing by the week.",
];

// ============================================================
// TYPES
// ============================================================
interface GameData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeCode: string;
  awayCode: string;
  homeScore: number;
  awayScore: number;
  homeRank?: number;
  awayRank?: number;
  homeLogo: string;
  awayLogo: string;
  status: "LIVE" | "SCHEDULED" | "FINAL";
  period?: string;
  clock?: string;
  startTime?: string;
  spread?: number;
  total?: number;
  moneyline?: { home: number; away: number };
  network?: string;
}

// Navigation tabs type
type NavTab = "top25" | "conferences" | "teams" | "rankings" | "leaders" | "tournament";
const NAV_TAB_LABELS: Record<NavTab, string> = {
  top25: "Top 25",
  conferences: "Conferences",
  teams: "Teams",
  rankings: "Rankings",
  leaders: "Leaders",
  tournament: "Tournament Central",
};

// ============================================================
// COMPONENT: NCAAB HUB PAGE
// ============================================================
export default function NCAABHubPage() {
  const navigate = useNavigate();
  const tournamentState = getNcaabTournamentState();
  const [games, setGames] = useState<GameData[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<NavTab>("top25");
  const [selectedConference, setSelectedConference] = useState("acc");
  const [leaderCategory, setLeaderCategory] = useState<keyof typeof LEAGUE_LEADERS>("points");
  const [teamSearch, setTeamSearch] = useState("");

  const handleTabChange = useCallback((tab: NavTab) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      document.getElementById("ncaab-dynamic-content")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  // Safe date formatter
  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "TBD";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "TBD";
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "TBD";
    }
  };

  // Fetch NCAAB games
  useEffect(() => {
    let cancelled = false;

    async function fetchGames() {
      try {
        const todayEt = getDateInEastern(new Date());
        const mapGame = (g: any): GameData => {
          const homeRank = TOP_25_TEAMS.find(t =>
            g.home_team_name?.toLowerCase().includes(t.name.toLowerCase())
          )?.rank;
          const awayRank = TOP_25_TEAMS.find(t =>
            g.away_team_name?.toLowerCase().includes(t.name.toLowerCase())
          )?.rank;

          const rawStatus = String(g.status || "").toUpperCase();
          const status: GameData["status"] =
            rawStatus === "IN_PROGRESS" || rawStatus === "INPROGRESS" || rawStatus === "LIVE"
              ? "LIVE"
              : rawStatus === "FINAL" || rawStatus === "COMPLETED" || rawStatus === "CLOSED"
              ? "FINAL"
              : "SCHEDULED";

          return {
            id: g.game_id,
            homeTeam: g.home_team_name || g.home_team_code || "TBD",
            awayTeam: g.away_team_name || g.away_team_code || "TBD",
            homeCode: g.home_team_code || g.home_team_name || "TBD",
            awayCode: g.away_team_code || g.away_team_name || "TBD",
            homeScore: g.home_score ?? 0,
            awayScore: g.away_score ?? 0,
            homeRank,
            awayRank,
            homeLogo: `https://a.espncdn.com/i/teamlogos/ncaa/500/${g.home_team_code || 'default'}.png`,
            awayLogo: `https://a.espncdn.com/i/teamlogos/ncaa/500/${g.away_team_code || 'default'}.png`,
            status,
            period: g.period_label,
            clock: g.clock,
            startTime: g.start_time,
            spread: g.spread,
            total: g.overUnder,
            moneyline: g.odds?.moneyline,
            network: g.network,
          };
        };

        const [todayResult, liveResult] = await Promise.allSettled([
          fetch(`/api/games?date=${todayEt}&sport=NCAAB`, { cache: "no-store" }),
          fetch("/api/games/live", { cache: "no-store" }),
        ]);

        const readGames = async (result: PromiseSettledResult<Response>) => {
          if (result.status !== "fulfilled" || !result.value.ok) return [] as any[];
          const payload = await result.value.json();
          return Array.isArray(payload?.games) ? payload.games : [];
        };

        const [todayGamesRaw, liveGamesRaw] = await Promise.all([
          readGames(todayResult),
          readGames(liveResult),
        ]);

        const merged = new Map<string, any>();
        for (const g of todayGamesRaw) {
          if (g?.game_id) merged.set(g.game_id, g);
        }
        for (const g of liveGamesRaw) {
          if (!g?.game_id) continue;
          const sport = String(g.sport || "").toUpperCase();
          const league = String(g.league || "").toUpperCase();
          const isNcaab = sport === "NCAAB" || sport === "NCAAM" || sport === "CBB" || (sport === "BASKETBALL" && league.includes("NCAA"));
          if (!isNcaab) continue;
          merged.set(g.game_id, { ...(merged.get(g.game_id) || {}), ...g });
        }

        const transformed = Array.from(merged.values()).map(mapGame);
        const filteredToToday = transformed.filter((g: GameData) => {
          if (!g.startTime) return g.status === "LIVE";
          return getDateInEastern(g.startTime) === todayEt;
        });

        if (!cancelled) {
          setGames(filteredToToday);
        }
      } catch (err) {
        console.error("[NCAABHubPage] Failed to fetch games:", err);
        if (!cancelled) {
          setGames([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    fetchGames();
    return () => {
      cancelled = true;
    };
  }, []);

  // Featured games for hero carousel
  const featuredGames = useMemo(() => {
    // Prioritize ranked matchups and live games
    return [...games]
      .sort((a, b) => {
        if (a.status === "LIVE" && b.status !== "LIVE") return -1;
        if (b.status === "LIVE" && a.status !== "LIVE") return 1;
        const aRanked = (a.homeRank || 99) + (a.awayRank || 99);
        const bRanked = (b.homeRank || 99) + (b.awayRank || 99);
        return aRanked - bRanked;
      })
      .slice(0, 5);
  }, [games]);

  // Auto-rotate hero carousel
  useEffect(() => {
    if (featuredGames.length === 0) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % featuredGames.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [featuredGames.length]);

  // Keep heroIndex in bounds
  useEffect(() => {
    if (featuredGames.length > 0 && heroIndex >= featuredGames.length) {
      setHeroIndex(0);
    }
  }, [featuredGames.length, heroIndex]);

  // Sorted games for Today's Games section
  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      // Live first
      if (a.status === "LIVE" && b.status !== "LIVE") return -1;
      if (b.status === "LIVE" && a.status !== "LIVE") return 1;
      // Upcoming second
      if (a.status === "SCHEDULED" && b.status === "FINAL") return -1;
      if (b.status === "SCHEDULED" && a.status === "FINAL") return 1;
      // Final last
      return 0;
    });
  }, [games]);

  // Hero navigation
  const prevHero = useCallback(() => {
    setHeroIndex((i) => (i - 1 + featuredGames.length) % featuredGames.length);
  }, [featuredGames.length]);

  const nextHero = useCallback(() => {
    setHeroIndex((i) => (i + 1) % featuredGames.length);
  }, [featuredGames.length]);

  const randomInsight = useMemo(() => COACH_G_INSIGHTS[Math.floor(Math.random() * COACH_G_INSIGHTS.length)], []);

  // Filtered teams for search
  const filteredTeams = useMemo(() => {
    if (!teamSearch) return TOP_25_TEAMS;
    const search = teamSearch.toLowerCase();
    return TOP_25_TEAMS.filter(
      t => t.name.toLowerCase().includes(search) || t.conference.toLowerCase().includes(search)
    );
  }, [teamSearch]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0d1420] to-[#0a0a0a]">
      {/* ============================================================ */}
      {/* SECTION 1: FEATURED GAMES ROTATOR */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-blue-600/10 pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header with Player Search */}
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                <span className="text-xl">🏀</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">NCAAB Command Center</h1>
                <p className="text-white/50 text-sm">College basketball intel</p>
              </div>
            </div>
            <PlayerSearch 
              sport="NCAAB" 
              placeholder="Search college players..." 
              className="w-full sm:w-72"
            />
          </div>

          {tournamentState.showTournamentTakeover && (
            <div className="mb-5 rounded-2xl border border-orange-400/35 bg-gradient-to-r from-orange-500/20 via-red-500/10 to-cyan-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-orange-200">Tournament Central Live</p>
                  <h2 className="text-xl font-bold text-white">March Madness + NIT are in motion</h2>
                  <p className="text-sm text-white/75">
                    Round: {tournamentState.currentRoundLabel}. Open the postseason command center for bracket, score pills, and Coach G signals.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate("/sports/ncaab/tournament/march-madness")}
                    className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400"
                  >
                    Open March Madness
                  </button>
                  <button
                    onClick={() => navigate("/sports/ncaab/tournament/nit")}
                    className="rounded-lg border border-cyan-300/40 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30"
                  >
                    Open NIT
                  </button>
                </div>
              </div>
            </div>
          )}
          {tournamentState.showArchiveEntry && (
            <div className="mb-5 rounded-2xl border border-white/15 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-white/50">{tournamentState.seasonYear} Postseason</p>
                  <h2 className="text-lg font-bold text-white">Tournament Archive Available</h2>
                  <p className="text-sm text-white/70">
                    Normal NCAAB hub is back. Review completed bracket and postseason highlights in Tournament Central.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/sports/ncaab/tournament")}
                  className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                >
                  Open Archive
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-orange-400 text-sm font-medium uppercase tracking-wider">Featured Games</span>
          </div>

          {loading ? (
            <div className="h-48 bg-white/5 rounded-2xl animate-pulse" />
          ) : featuredGames.length > 0 && featuredGames[heroIndex] ? (
            <div className="relative">
              {/* Hero Card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={heroIndex}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                  className="relative bg-gradient-to-br from-white/10 to-white/5 rounded-2xl p-6 border border-white/10 cursor-pointer hover:border-orange-500/30 transition-colors"
                  onClick={() => navigate(toGameDetailPath("ncaab", featuredGames[heroIndex].id))}
                >
                  {/* Status Badge */}
                  <div className="absolute top-4 right-4">
                    {featuredGames[heroIndex].status === "LIVE" ? (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 text-xs font-medium">
                        <Circle className="w-2 h-2 fill-current animate-pulse" />
                        LIVE
                      </span>
                    ) : featuredGames[heroIndex].status === "FINAL" ? (
                      <span className="px-3 py-1 bg-white/10 rounded-full text-white/60 text-xs font-medium">FINAL</span>
                    ) : (
                      <span className="px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-blue-400 text-xs font-medium">
                        {formatTime(featuredGames[heroIndex]?.startTime)}
                      </span>
                    )}
                  </div>

                  {/* Teams */}
                  <div className="flex items-center justify-between gap-4">
                    {/* Away Team */}
                    <div className="flex-1 text-center">
                      <TeamLogo
                        teamCode={featuredGames[heroIndex].awayCode}
                        sport="NCAAB"
                        size={80}
                        className="mx-auto mb-3"
                      />
                      <div className="flex items-center justify-center gap-2">
                        {featuredGames[heroIndex].awayRank && (
                          <span className="text-orange-400 text-sm font-bold">#{featuredGames[heroIndex].awayRank}</span>
                        )}
                        <span className="text-white font-semibold">{featuredGames[heroIndex].awayTeam}</span>
                      </div>
                      {featuredGames[heroIndex].status !== "SCHEDULED" && (
                        <div className="text-3xl font-bold text-white mt-2">{featuredGames[heroIndex].awayScore}</div>
                      )}
                    </div>

                    {/* VS / Score divider */}
                    <div className="flex flex-col items-center">
                      {featuredGames[heroIndex].status === "LIVE" && featuredGames[heroIndex].period && (
                        <span className="text-orange-400 text-sm font-medium mb-1">
                          {featuredGames[heroIndex].period} • {featuredGames[heroIndex].clock}
                        </span>
                      )}
                      <span className="text-white/40 text-xl font-bold">VS</span>
                      {featuredGames[heroIndex].network && (
                        <span className="text-white/40 text-xs mt-1">{featuredGames[heroIndex].network}</span>
                      )}
                    </div>

                    {/* Home Team */}
                    <div className="flex-1 text-center">
                      <TeamLogo
                        teamCode={featuredGames[heroIndex].homeCode}
                        sport="NCAAB"
                        size={80}
                        className="mx-auto mb-3"
                      />
                      <div className="flex items-center justify-center gap-2">
                        {featuredGames[heroIndex].homeRank && (
                          <span className="text-orange-400 text-sm font-bold">#{featuredGames[heroIndex].homeRank}</span>
                        )}
                        <span className="text-white font-semibold">{featuredGames[heroIndex].homeTeam}</span>
                      </div>
                      {featuredGames[heroIndex].status !== "SCHEDULED" && (
                        <div className="text-3xl font-bold text-white mt-2">{featuredGames[heroIndex].homeScore}</div>
                      )}
                    </div>
                  </div>

                  {/* Betting Info */}
                  {(featuredGames[heroIndex].spread || featuredGames[heroIndex].total) && (
                    <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-white/10">
                      {featuredGames[heroIndex].spread && (
                        <div className="text-center">
                          <span className="text-white/40 text-xs">SPREAD</span>
                          <div className="text-white font-medium">{featuredGames[heroIndex].spread > 0 ? "+" : ""}{featuredGames[heroIndex].spread}</div>
                        </div>
                      )}
                      {featuredGames[heroIndex].total && (
                        <div className="text-center">
                          <span className="text-white/40 text-xs">TOTAL</span>
                          <div className="text-white font-medium">O/U {featuredGames[heroIndex].total}</div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Navigation Arrows */}
              {featuredGames.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); prevHero(); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); nextHero(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-white" />
                  </button>
                </>
              )}

              {/* Dot Indicators */}
              <div className="flex items-center justify-center gap-2 mt-4">
                {featuredGames.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setHeroIndex(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === heroIndex ? "bg-orange-500" : "bg-white/30 hover:bg-white/50"
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-white/50">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No games scheduled today</p>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 2: COACH G NCAAB INTEL */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-gradient-to-br from-violet-500/10 to-purple-600/10 rounded-2xl p-6 border border-violet-500/20">
          <div className="flex items-start gap-4">
            <CoachGAvatar size="md" presence="monitoring" className="border-violet-400/40" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-white font-semibold">Coach G NCAAB Intel</h3>
                <Sparkles className="w-4 h-4 text-violet-400" />
              </div>
              <p className="text-white/80 text-sm leading-relaxed mb-4">"{randomInsight}"</p>
              
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => navigate("/scout?q=NCAAB coach picks today")}
                  className="px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-lg text-violet-300 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Target className="w-4 h-4" />
                  Coach Picks
                </button>
                <button 
                  onClick={() => setActiveTab("rankings")}
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-amber-300 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  Bubble Watch
                </button>
                <button 
                  onClick={() => navigate("/scout?q=best NCAAB value bets")}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Star className="w-4 h-4" />
                  Best Value Bets
                </button>
                <button 
                  onClick={() => navigate("/scout?q=college basketball")}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white/80 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Ask Coach G
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 3: CONTROL NAVIGATION BAR */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
          {([
            { id: "top25" as NavTab, label: "Top 25", icon: Trophy },
            { id: "conferences" as NavTab, label: "Conferences", icon: Users },
            { id: "teams" as NavTab, label: "Teams", icon: Search },
            { id: "rankings" as NavTab, label: "Rankings", icon: TrendingUp },
            { id: "leaders" as NavTab, label: "Leaders", icon: Star },
            { id: "tournament" as NavTab, label: "Tournament", icon: Sparkles },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-orange-500 text-white"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 4: TODAY'S GAMES */}
      {/* ============================================================ */}
      <section id="ncaab-tab-content" className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-400" />
            <h2 className="text-white font-semibold text-lg">Today's Games</h2>
            <span className="text-white/40 text-sm">({games.length})</span>
          </div>
          <button className="text-orange-400 text-sm hover:text-orange-300 transition-colors flex items-center gap-1">
            View All <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : sortedGames.length > 0 ? (
          <div className="space-y-3">
            {sortedGames.slice(0, 10).map((game) => (
              <div
                key={game.id}
                onClick={() => navigate(toGameDetailPath("ncaab", game.id))}
                className="bg-gradient-to-r from-white/5 to-white/[0.02] rounded-xl p-4 border border-white/10 hover:border-orange-500/30 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  {/* Teams */}
                  <div className="flex-1">
                    {/* Away Team */}
                    <div className="flex items-center gap-3 mb-2">
                      <TeamLogo
                        teamCode={game.awayCode}
                        sport="NCAAB"
                        size={32}
                        className="flex-shrink-0"
                      />
                      <div className="flex items-center gap-2">
                        {game.awayRank && <span className="text-orange-400 text-xs font-bold">#{game.awayRank}</span>}
                        <span className={`font-medium ${game.status === "FINAL" && game.awayScore > game.homeScore ? "text-white" : "text-white/80"}`}>
                          {game.awayTeam}
                        </span>
                      </div>
                      {game.status !== "SCHEDULED" && (
                        <span className={`ml-auto text-lg font-bold ${game.status === "FINAL" && game.awayScore > game.homeScore ? "text-white" : "text-white/60"}`}>
                          {game.awayScore}
                        </span>
                      )}
                    </div>
                    {/* Home Team */}
                    <div className="flex items-center gap-3">
                      <TeamLogo
                        teamCode={game.homeCode}
                        sport="NCAAB"
                        size={32}
                        className="flex-shrink-0"
                      />
                      <div className="flex items-center gap-2">
                        {game.homeRank && <span className="text-orange-400 text-xs font-bold">#{game.homeRank}</span>}
                        <span className={`font-medium ${game.status === "FINAL" && game.homeScore > game.awayScore ? "text-white" : "text-white/80"}`}>
                          {game.homeTeam}
                        </span>
                      </div>
                      {game.status !== "SCHEDULED" && (
                        <span className={`ml-auto text-lg font-bold ${game.status === "FINAL" && game.homeScore > game.awayScore ? "text-white" : "text-white/60"}`}>
                          {game.homeScore}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status & Odds */}
                  <div className="flex flex-col items-end gap-2 ml-4">
                    {game.status === "LIVE" ? (
                      <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 rounded text-red-400 text-xs font-medium">
                        <Circle className="w-1.5 h-1.5 fill-current animate-pulse" />
                        {game.period || "LIVE"}
                      </span>
                    ) : game.status === "FINAL" ? (
                      <span className="px-2 py-1 bg-white/10 rounded text-white/50 text-xs font-medium">FINAL</span>
                    ) : (
                      <span className="text-white/60 text-sm">
                        {formatTime(game.startTime)}
                      </span>
                    )}
                    
                    {/* Odds mini display */}
                    {(game.spread || game.total) && (
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        {game.spread && <span>SPR {game.spread > 0 ? "+" : ""}{game.spread}</span>}
                        {game.total && <span>O/U {game.total}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white/5 rounded-xl">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-white/30" />
            <p className="text-white/50">No NCAAB games scheduled today</p>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* DYNAMIC CONTENT PANEL (based on activeTab) */}
      {/* ============================================================ */}
      <section id="ncaab-dynamic-content" className="max-w-7xl mx-auto px-4 py-6">
        <div className="sticky top-16 z-20 mb-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/35 bg-black/55 px-3 py-1.5 backdrop-blur-md">
            <span className="text-[11px] uppercase tracking-[0.1em] text-white/60">Active</span>
            <span className="text-sm font-semibold text-orange-300">{NAV_TAB_LABELS[activeTab]}</span>
          </div>
        </div>
        {/* TOP 25 RANKINGS */}
        {activeTab === "top25" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h2 className="text-white font-semibold text-lg">AP Top 25 Rankings</h2>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-white/5 text-white/50 text-xs font-medium uppercase tracking-wider">
                <div className="col-span-1">Rank</div>
                <div className="col-span-4">Team</div>
                <div className="col-span-2">Record</div>
                <div className="col-span-2">Conf</div>
                <div className="col-span-2">Last 10</div>
                <div className="col-span-1">Streak</div>
              </div>
              {TOP_25_TEAMS.slice(0, 15).map((team) => (
                <div
                  key={team.teamId}
                  onClick={() => {
                    logTeamNavigation(team.teamId, "ncaab");
                    navigate(buildTeamRoute("ncaab", team.teamId));
                  }}
                  className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <div className="col-span-1 text-amber-400 font-bold">#{team.rank}</div>
                  <div className="col-span-4 flex items-center gap-2">
                    <img src={team.logo} alt={team.name} className="w-6 h-6 object-contain" />
                    <span className="text-white font-medium truncate">{team.name}</span>
                  </div>
                  <div className="col-span-2 text-white/70">{team.record}</div>
                  <div className="col-span-2 text-white/50 truncate">{team.conference}</div>
                  <div className="col-span-2 text-white/50">{team.last10}</div>
                  <div className={`col-span-1 font-medium ${team.streak.startsWith("W") ? "text-green-400" : "text-red-400"}`}>
                    {team.streak}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONFERENCES */}
        {activeTab === "conferences" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-blue-400" />
              <h2 className="text-white font-semibold text-lg">Conference Standings</h2>
            </div>
            
            {/* Conference Selector */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide mb-4 pb-2">
              {CONFERENCES.map((conf) => (
                <button
                  key={conf.id}
                  onClick={() => setSelectedConference(conf.id)}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all text-sm font-medium ${
                    selectedConference === conf.id
                      ? "bg-blue-500 text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {conf.name}
                </button>
              ))}
            </div>

            {/* Standings Table */}
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-white/5 text-white/50 text-xs font-medium uppercase tracking-wider">
                <div className="col-span-5">Team</div>
                <div className="col-span-3">Conf</div>
                <div className="col-span-2">Overall</div>
                <div className="col-span-2">Streak</div>
              </div>
              {(CONFERENCE_STANDINGS[selectedConference] || []).map((team, idx) => (
                <div
                  key={team.teamId}
                  onClick={() => {
                    logTeamNavigation(team.teamId, "ncaab");
                    navigate(buildTeamRoute("ncaab", team.teamId));
                  }}
                  className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <span className="text-white/40 w-4">{idx + 1}</span>
                    <img src={team.logo} alt={team.name} className="w-6 h-6 object-contain" />
                    <span className="text-white font-medium truncate">{team.name}</span>
                  </div>
                  <div className="col-span-3 text-white/70">{team.confRecord}</div>
                  <div className="col-span-2 text-white/50">{team.overall}</div>
                  <div className={`col-span-2 font-medium ${team.streak.startsWith("W") ? "text-green-400" : "text-red-400"}`}>
                    {team.streak}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TEAMS SEARCH */}
        {activeTab === "teams" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-cyan-400" />
              <h2 className="text-white font-semibold text-lg">Find Teams</h2>
            </div>
            
            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                placeholder="Search teams or conferences..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {/* Teams Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTeams.map((team) => (
                <div
                  key={team.teamId}
                  onClick={() => {
                    logTeamNavigation(team.teamId, "ncaab");
                    navigate(buildTeamRoute("ncaab", team.teamId));
                  }}
                  className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10 hover:border-cyan-500/30 cursor-pointer transition-all"
                >
                  <img src={team.logo} alt={team.name} className="w-10 h-10 object-contain" />
                  <div>
                    <div className="flex items-center gap-2">
                      {team.rank && <span className="text-amber-400 text-xs font-bold">#{team.rank}</span>}
                      <span className="text-white font-medium">{team.name}</span>
                    </div>
                    <div className="text-white/50 text-sm">{team.conference} • {team.record}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RANKINGS / BUBBLE WATCH */}
        {activeTab === "rankings" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              <h2 className="text-white font-semibold text-lg">Bubble Watch</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Last Four In */}
              <div className="bg-green-500/10 rounded-xl border border-green-500/20 p-4">
                <h3 className="text-green-400 font-semibold mb-3 flex items-center gap-2">
                  <Circle className="w-3 h-3 fill-green-500" />
                  Last Four In
                </h3>
                <div className="space-y-3">
                  {BUBBLE_WATCH.lastFourIn.map((team) => (
                    <div key={team.teamId} className="bg-black/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium">{team.name}</span>
                        <span className="text-white/60 text-sm">{team.record}</span>
                      </div>
                      <div className="text-white/40 text-xs mb-2">{team.conference}</div>
                      <div className="text-green-400 text-xs italic">"{team.insight}"</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* First Four Out */}
              <div className="bg-amber-500/10 rounded-xl border border-amber-500/20 p-4">
                <h3 className="text-amber-400 font-semibold mb-3 flex items-center gap-2">
                  <Circle className="w-3 h-3 fill-amber-500" />
                  First Four Out
                </h3>
                <div className="space-y-3">
                  {BUBBLE_WATCH.firstFourOut.map((team) => (
                    <div key={team.teamId} className="bg-black/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium">{team.name}</span>
                        <span className="text-white/60 text-sm">{team.record}</span>
                      </div>
                      <div className="text-white/40 text-xs mb-2">{team.conference}</div>
                      <div className="text-amber-400 text-xs italic">"{team.insight}"</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Four Out */}
              <div className="bg-red-500/10 rounded-xl border border-red-500/20 p-4">
                <h3 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                  <Circle className="w-3 h-3 fill-red-500" />
                  Next Four Out
                </h3>
                <div className="space-y-3">
                  {BUBBLE_WATCH.nextFourOut.map((team) => (
                    <div key={team.teamId} className="bg-black/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium">{team.name}</span>
                        <span className="text-white/60 text-sm">{team.record}</span>
                      </div>
                      <div className="text-white/40 text-xs mb-2">{team.conference}</div>
                      <div className="text-red-400 text-xs italic">"{team.insight}"</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LEAGUE LEADERS */}
        {activeTab === "leaders" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-amber-400" />
              <h2 className="text-white font-semibold text-lg">League Leaders</h2>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide mb-4 pb-2">
              {(["points", "assists", "rebounds", "threePoint", "blocks", "steals"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setLeaderCategory(cat)}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all text-sm font-medium ${
                    leaderCategory === cat
                      ? "bg-amber-500 text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {cat === "threePoint" ? "3PT Made" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {/* Leaders List */}
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              {LEAGUE_LEADERS[leaderCategory].map((player, idx) => (
                <div
                  key={player.id}
                  onClick={() => {
                    logPlayerNavigation(player.id, "ncaab");
                    navigate(buildPlayerRoute("ncaab", player.id));
                  }}
                  className="flex items-center gap-4 px-4 py-3 border-t border-white/5 first:border-t-0 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <span className={`w-6 text-center font-bold ${idx < 3 ? "text-amber-400" : "text-white/40"}`}>
                    {idx + 1}
                  </span>
                  <img src={player.logo} alt={player.team} className="w-8 h-8 object-contain" />
                  <div className="flex-1">
                    <div className="text-white font-medium">{player.name}</div>
                    <div className="text-white/50 text-sm">{player.team}</div>
                  </div>
                  <div className="text-amber-400 font-bold text-lg">{player.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "tournament" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-orange-400/30 bg-gradient-to-br from-orange-500/15 to-red-500/10 p-4">
              <p className="text-xs uppercase tracking-wider text-orange-200">Primary Tournament Experience</p>
              <h3 className="text-xl font-bold text-white">March Madness Command Center</h3>
              <p className="mt-1 text-sm text-white/75">
                Premium bracket centerpiece, live game pills, upset watch, Cinderella tracker, and Coach G tournament desk.
              </p>
              <button
                onClick={() => navigate("/sports/ncaab/tournament/march-madness")}
                className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400"
              >
                Open March Madness
              </button>
            </div>
            <div className="rounded-xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/10 to-transparent p-4">
              <p className="text-xs uppercase tracking-wider text-cyan-200">Secondary Tournament</p>
              <h3 className="text-lg font-bold text-white">NIT</h3>
              <p className="mt-1 text-sm text-white/70">
                Lighter postseason view with dedicated NIT bracket, today&apos;s games, and Coach G quick notes.
              </p>
              <button
                onClick={() => navigate("/sports/ncaab/tournament/nit")}
                className="mt-3 rounded-lg border border-cyan-300/40 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30"
              >
                Open NIT
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* SECTION: STORYLINES / HEADLINES */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 py-6 pb-24">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="w-5 h-5 text-cyan-400" />
          <h2 className="text-white font-semibold text-lg">NCAAB Headlines</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {STORYLINES.map((story) => (
            <div
              key={story.id}
              className="bg-gradient-to-br from-white/5 to-white/[0.02] rounded-xl p-4 border border-white/10 hover:border-cyan-500/30 cursor-pointer transition-all"
            >
              <div className="flex items-start gap-2 mb-2">
                {story.hot && <Flame className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />}
                <h4 className="text-white font-semibold">{story.headline}</h4>
              </div>
              <p className="text-white/60 text-sm mb-3">{story.summary}</p>
              <div className="flex items-start gap-2 p-2 bg-violet-500/10 rounded-lg">
                <CoachGAvatar size="xs" presence="monitoring" className="h-6 w-6 rounded-full border-0" />
                <p className="text-violet-300 text-xs italic">"{story.insight}"</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
