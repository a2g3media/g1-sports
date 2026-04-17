import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Trophy, Calendar, Users, Sparkles, ChevronLeft, ChevronRight, 
  Circle, MessageSquare, Target, Shield,
  Newspaper, ArrowRight, Flame
} from "lucide-react";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import { PlayerSearch } from "@/react-app/components/PlayerSearch";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import {
  buildTeamRoute,
  logPlayerNavigation,
  logTeamNavigation,
} from "@/react-app/lib/navigationRoutes";
import { navigateToPlayerProfile } from "@/react-app/lib/playerProfileNavigation";
import { resolvePlayerIdForNavigation } from "@/react-app/lib/resolvePlayerIdForNavigation";

// ============================================================
// NHL TEAM DATA
// ============================================================
const NHL_TEAMS: Record<string, { name: string; city: string; conference: string; division: string }> = {
  BOS: { name: "Bruins", city: "Boston", conference: "Eastern", division: "Atlantic" },
  BUF: { name: "Sabres", city: "Buffalo", conference: "Eastern", division: "Atlantic" },
  DET: { name: "Red Wings", city: "Detroit", conference: "Eastern", division: "Atlantic" },
  FLA: { name: "Panthers", city: "Florida", conference: "Eastern", division: "Atlantic" },
  MTL: { name: "Canadiens", city: "Montreal", conference: "Eastern", division: "Atlantic" },
  OTT: { name: "Senators", city: "Ottawa", conference: "Eastern", division: "Atlantic" },
  TBL: { name: "Lightning", city: "Tampa Bay", conference: "Eastern", division: "Atlantic" },
  TOR: { name: "Maple Leafs", city: "Toronto", conference: "Eastern", division: "Atlantic" },
  CAR: { name: "Hurricanes", city: "Carolina", conference: "Eastern", division: "Metropolitan" },
  CBJ: { name: "Blue Jackets", city: "Columbus", conference: "Eastern", division: "Metropolitan" },
  NJD: { name: "Devils", city: "New Jersey", conference: "Eastern", division: "Metropolitan" },
  NYI: { name: "Islanders", city: "New York", conference: "Eastern", division: "Metropolitan" },
  NYR: { name: "Rangers", city: "New York", conference: "Eastern", division: "Metropolitan" },
  PHI: { name: "Flyers", city: "Philadelphia", conference: "Eastern", division: "Metropolitan" },
  PIT: { name: "Penguins", city: "Pittsburgh", conference: "Eastern", division: "Metropolitan" },
  WSH: { name: "Capitals", city: "Washington", conference: "Eastern", division: "Metropolitan" },
  ARI: { name: "Coyotes", city: "Utah", conference: "Western", division: "Central" },
  CHI: { name: "Blackhawks", city: "Chicago", conference: "Western", division: "Central" },
  COL: { name: "Avalanche", city: "Colorado", conference: "Western", division: "Central" },
  DAL: { name: "Stars", city: "Dallas", conference: "Western", division: "Central" },
  MIN: { name: "Wild", city: "Minnesota", conference: "Western", division: "Central" },
  NSH: { name: "Predators", city: "Nashville", conference: "Western", division: "Central" },
  STL: { name: "Blues", city: "St. Louis", conference: "Western", division: "Central" },
  WPG: { name: "Jets", city: "Winnipeg", conference: "Western", division: "Central" },
  ANA: { name: "Ducks", city: "Anaheim", conference: "Western", division: "Pacific" },
  CGY: { name: "Flames", city: "Calgary", conference: "Western", division: "Pacific" },
  EDM: { name: "Oilers", city: "Edmonton", conference: "Western", division: "Pacific" },
  LAK: { name: "Kings", city: "Los Angeles", conference: "Western", division: "Pacific" },
  SJS: { name: "Sharks", city: "San Jose", conference: "Western", division: "Pacific" },
  SEA: { name: "Kraken", city: "Seattle", conference: "Western", division: "Pacific" },
  VAN: { name: "Canucks", city: "Vancouver", conference: "Western", division: "Pacific" },
  VGK: { name: "Golden Knights", city: "Vegas", conference: "Western", division: "Pacific" },
};

// ============================================================
// MOCK DATA - LEAGUE LEADERS
// ============================================================
const SKATER_LEADERS = {
  goals: [
    { id: "ovechkin", name: "Alex Ovechkin", team: "WSH", value: 52, gamesPlayed: 82 },
    { id: "matthews", name: "Auston Matthews", team: "TOR", value: 50, gamesPlayed: 74 },
    { id: "draisaitl", name: "Leon Draisaitl", team: "EDM", value: 48, gamesPlayed: 82 },
    { id: "kucherov", name: "Nikita Kucherov", team: "TBL", value: 44, gamesPlayed: 81 },
    { id: "robertson", name: "Jason Robertson", team: "DAL", value: 42, gamesPlayed: 80 },
  ],
  assists: [
    { id: "mcdavid", name: "Connor McDavid", team: "EDM", value: 100, gamesPlayed: 76 },
    { id: "kucherov", name: "Nikita Kucherov", team: "TBL", value: 82, gamesPlayed: 81 },
    { id: "draisaitl", name: "Leon Draisaitl", team: "EDM", value: 76, gamesPlayed: 82 },
    { id: "panarin", name: "Artemi Panarin", team: "NYR", value: 72, gamesPlayed: 82 },
    { id: "marner", name: "Mitch Marner", team: "TOR", value: 70, gamesPlayed: 78 },
  ],
  points: [
    { id: "mcdavid", name: "Connor McDavid", team: "EDM", value: 152, gamesPlayed: 76 },
    { id: "kucherov", name: "Nikita Kucherov", team: "TBL", value: 126, gamesPlayed: 81 },
    { id: "draisaitl", name: "Leon Draisaitl", team: "EDM", value: 124, gamesPlayed: 82 },
    { id: "mackinnon", name: "Nathan MacKinnon", team: "COL", value: 118, gamesPlayed: 80 },
    { id: "pastrnak", name: "David Pastrňák", team: "BOS", value: 110, gamesPlayed: 82 },
  ],
  plusMinus: [
    { id: "makar", name: "Cale Makar", team: "COL", value: 42, gamesPlayed: 78 },
    { id: "fox", name: "Adam Fox", team: "NYR", value: 38, gamesPlayed: 82 },
    { id: "mcdavid", name: "Connor McDavid", team: "EDM", value: 35, gamesPlayed: 76 },
    { id: "hedman", name: "Victor Hedman", team: "TBL", value: 32, gamesPlayed: 80 },
    { id: "mackinnon", name: "Nathan MacKinnon", team: "COL", value: 30, gamesPlayed: 80 },
  ],
  ppGoals: [
    { id: "ovechkin", name: "Alex Ovechkin", team: "WSH", value: 18, gamesPlayed: 82 },
    { id: "matthews", name: "Auston Matthews", team: "TOR", value: 16, gamesPlayed: 74 },
    { id: "draisaitl", name: "Leon Draisaitl", team: "EDM", value: 15, gamesPlayed: 82 },
    { id: "stamkos", name: "Steven Stamkos", team: "NSH", value: 14, gamesPlayed: 78 },
    { id: "pastrnak", name: "David Pastrňák", team: "BOS", value: 13, gamesPlayed: 82 },
  ],
};

const GOALIE_LEADERS = {
  savePct: [
    { id: "shesterkin", name: "Igor Shesterkin", team: "NYR", value: 0.926, gamesPlayed: 58 },
    { id: "demko", name: "Thatcher Demko", team: "VAN", value: 0.918, gamesPlayed: 52 },
    { id: "sorokin", name: "Ilya Sorokin", team: "NYI", value: 0.916, gamesPlayed: 55 },
    { id: "vasilevskiy", name: "Andrei Vasilevskiy", team: "TBL", value: 0.914, gamesPlayed: 60 },
    { id: "oettinger", name: "Jake Oettinger", team: "DAL", value: 0.912, gamesPlayed: 54 },
  ],
  gaa: [
    { id: "shesterkin", name: "Igor Shesterkin", team: "NYR", value: 2.18, gamesPlayed: 58 },
    { id: "demko", name: "Thatcher Demko", team: "VAN", value: 2.45, gamesPlayed: 52 },
    { id: "oettinger", name: "Jake Oettinger", team: "DAL", value: 2.52, gamesPlayed: 54 },
    { id: "sorokin", name: "Ilya Sorokin", team: "NYI", value: 2.58, gamesPlayed: 55 },
    { id: "vasilevskiy", name: "Andrei Vasilevskiy", team: "TBL", value: 2.65, gamesPlayed: 60 },
  ],
  wins: [
    { id: "vasilevskiy", name: "Andrei Vasilevskiy", team: "TBL", value: 38, gamesPlayed: 60 },
    { id: "shesterkin", name: "Igor Shesterkin", team: "NYR", value: 36, gamesPlayed: 58 },
    { id: "oettinger", name: "Jake Oettinger", team: "DAL", value: 32, gamesPlayed: 54 },
    { id: "demko", name: "Thatcher Demko", team: "VAN", value: 30, gamesPlayed: 52 },
    { id: "hellebuyck", name: "Connor Hellebuyck", team: "WPG", value: 28, gamesPlayed: 56 },
  ],
  shutouts: [
    { id: "shesterkin", name: "Igor Shesterkin", team: "NYR", value: 6, gamesPlayed: 58 },
    { id: "vasilevskiy", name: "Andrei Vasilevskiy", team: "TBL", value: 5, gamesPlayed: 60 },
    { id: "sorokin", name: "Ilya Sorokin", team: "NYI", value: 5, gamesPlayed: 55 },
    { id: "demko", name: "Thatcher Demko", team: "VAN", value: 4, gamesPlayed: 52 },
    { id: "oettinger", name: "Jake Oettinger", team: "DAL", value: 4, gamesPlayed: 54 },
  ],
};

// ============================================================
// MOCK DATA - STANDINGS
// ============================================================
const MOCK_STANDINGS = [
  { team: "NYR", wins: 52, losses: 22, otl: 8, points: 112, gf: 268, ga: 218, streak: "W3" },
  { team: "CAR", wins: 50, losses: 24, otl: 8, points: 108, gf: 258, ga: 210, streak: "W2" },
  { team: "FLA", wins: 48, losses: 26, otl: 8, points: 104, gf: 252, ga: 225, streak: "L1" },
  { team: "BOS", wins: 47, losses: 27, otl: 8, points: 102, gf: 248, ga: 220, streak: "W1" },
  { team: "TOR", wins: 46, losses: 28, otl: 8, points: 100, gf: 280, ga: 242, streak: "W2" },
  { team: "TBL", wins: 45, losses: 29, otl: 8, points: 98, gf: 272, ga: 238, streak: "L2" },
  { team: "NJD", wins: 44, losses: 30, otl: 8, points: 96, gf: 245, ga: 235, streak: "W1" },
  { team: "PIT", wins: 42, losses: 32, otl: 8, points: 92, gf: 238, ga: 245, streak: "L1" },
  { team: "EDM", wins: 54, losses: 20, otl: 8, points: 116, gf: 298, ga: 228, streak: "W5" },
  { team: "COL", wins: 50, losses: 24, otl: 8, points: 108, gf: 275, ga: 230, streak: "W3" },
  { team: "VGK", wins: 49, losses: 25, otl: 8, points: 106, gf: 262, ga: 225, streak: "W1" },
  { team: "DAL", wins: 48, losses: 26, otl: 8, points: 104, gf: 255, ga: 218, streak: "L1" },
  { team: "WPG", wins: 47, losses: 27, otl: 8, points: 102, gf: 265, ga: 238, streak: "W2" },
  { team: "VAN", wins: 45, losses: 29, otl: 8, points: 98, gf: 248, ga: 232, streak: "L2" },
  { team: "LAK", wins: 43, losses: 31, otl: 8, points: 94, gf: 238, ga: 235, streak: "W1" },
  { team: "MIN", wins: 40, losses: 34, otl: 8, points: 88, gf: 228, ga: 248, streak: "L3" },
];

// ============================================================
// MOCK DATA - STORYLINES
// ============================================================
const STORYLINES = [
  {
    id: "1",
    headline: "Oilers on Fire: 5-Game Win Streak",
    summary: "McDavid and Draisaitl combine for 28 points in dominant stretch",
    coachNote: "Edmonton offense trending high. Watch the over in their games.",
    hot: true,
  },
  {
    id: "2",
    headline: "Shesterkin for Vezina?",
    summary: "Rangers goalie posts .940 save percentage in January",
    coachNote: "NYR under looking strong with Shesterkin in net.",
    hot: false,
  },
  {
    id: "3",
    headline: "Trade Deadline Rumors Heating Up",
    summary: "Multiple contenders eyeing depth pieces before March deadline",
    coachNote: "Watch for lineup changes affecting team dynamics.",
    hot: true,
  },
  {
    id: "4",
    headline: "Matthews Chasing 60-Goal Season",
    summary: "Leafs star on pace for historic goal-scoring campaign",
    coachNote: "Anytime goal scorer props on Matthews worth a look.",
    hot: false,
  },
  {
    id: "5",
    headline: "Western Conference Race Tightens",
    summary: "Just 4 points separate 3rd and 8th place in the West",
    coachNote: "Playoff desperation = unpredictable results. Tread carefully.",
    hot: false,
  },
];

// ============================================================
// STARTING GOALIES DATABASE (for matchup display)
// ============================================================
const STARTING_GOALIES: Record<string, { name: string; savePct: number; gaa: number; wins: number; espnId?: string }> = {
  // Eastern Conference
  BOS: { name: "J. Swayman", savePct: 0.921, gaa: 2.18, wins: 28, espnId: "4697676" },
  BUF: { name: "U. Luukkonen", savePct: 0.908, gaa: 2.85, wins: 22, espnId: "4587885" },
  DET: { name: "A. Lyon", savePct: 0.912, gaa: 2.55, wins: 24, espnId: "3042210" },
  FLA: { name: "S. Bobrovsky", savePct: 0.915, gaa: 2.45, wins: 32, espnId: "5168" },
  MTL: { name: "S. Montembeault", savePct: 0.906, gaa: 2.92, wins: 18, espnId: "3900188" },
  OTT: { name: "L. Ullmark", savePct: 0.918, gaa: 2.35, wins: 26, espnId: "3069406" },
  TBL: { name: "A. Vasilevskiy", savePct: 0.920, gaa: 2.28, wins: 34, espnId: "3519915" },
  TOR: { name: "J. Woll", savePct: 0.914, gaa: 2.48, wins: 25, espnId: "4233557" },
  CAR: { name: "F. Andersen", savePct: 0.917, gaa: 2.32, wins: 30, espnId: "3020035" },
  CBJ: { name: "E. Merzlikins", savePct: 0.898, gaa: 3.15, wins: 15, espnId: "4024009" },
  NJD: { name: "J. Markstrom", savePct: 0.912, gaa: 2.52, wins: 27, espnId: "5047" },
  NYI: { name: "I. Sorokin", savePct: 0.919, gaa: 2.38, wins: 28, espnId: "4352807" },
  NYR: { name: "I. Shesterkin", savePct: 0.935, gaa: 1.95, wins: 36, espnId: "4233698" },
  PHI: { name: "S. Ersson", savePct: 0.908, gaa: 2.78, wins: 20, espnId: "4867389" },
  PIT: { name: "A. Nedeljkovic", savePct: 0.905, gaa: 2.88, wins: 22, espnId: "3900189" },
  WSH: { name: "C. Lindgren", savePct: 0.910, gaa: 2.62, wins: 24, espnId: "4233539" },
  // Western Conference
  ARI: { name: "C. Vejmelka", savePct: 0.902, gaa: 3.05, wins: 16 },
  CHI: { name: "P. Mrazek", savePct: 0.904, gaa: 3.12, wins: 14, espnId: "5168" },
  COL: { name: "A. Georgiev", savePct: 0.910, gaa: 2.68, wins: 28, espnId: "3942954" },
  DAL: { name: "J. Oettinger", savePct: 0.916, gaa: 2.42, wins: 32, espnId: "4392456" },
  MIN: { name: "F. Gustavsson", savePct: 0.914, gaa: 2.52, wins: 26, espnId: "4024012" },
  NSH: { name: "J. Saros", savePct: 0.918, gaa: 2.35, wins: 30, espnId: "3900186" },
  STL: { name: "J. Binnington", savePct: 0.908, gaa: 2.82, wins: 24, espnId: "2518503" },
  WPG: { name: "C. Hellebuyck", savePct: 0.928, gaa: 2.08, wins: 38, espnId: "3025672" },
  ANA: { name: "L. Dostal", savePct: 0.912, gaa: 2.65, wins: 22, espnId: "4352808" },
  CGY: { name: "D. Wolf", savePct: 0.915, gaa: 2.48, wins: 25, espnId: "4874712" },
  EDM: { name: "S. Skinner", savePct: 0.908, gaa: 2.78, wins: 28, espnId: "4587784" },
  LAK: { name: "D. Kuemper", savePct: 0.910, gaa: 2.58, wins: 26, espnId: "5084" },
  SJS: { name: "M. Blackwood", savePct: 0.898, gaa: 3.22, wins: 12, espnId: "3900185" },
  SEA: { name: "J. Daccord", savePct: 0.916, gaa: 2.38, wins: 28, espnId: "4233540" },
  VAN: { name: "T. Demko", savePct: 0.918, gaa: 2.32, wins: 30, espnId: "3900184" },
  VGK: { name: "A. Hill", savePct: 0.912, gaa: 2.55, wins: 32, espnId: "3900187" },
};

// ============================================================
// COACH G NHL INSIGHTS
// ============================================================
const COACH_G_INSIGHTS = [
  "Edmonton offense trending high. Watch the over.",
  "Kings penalty kill struggling tonight.",
  "Shesterkin owns the Rangers crease - back the under.",
  "McDavid against tired defense? Points incoming.",
  "Bruins on back-to-back - fade the road favorite.",
];

// ============================================================
// TYPES
// ============================================================
interface GameData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "LIVE" | "SCHEDULED" | "FINAL";
  period?: string;
  clock?: string;
  startTime?: string;
  homeGoalie?: string;
  awayGoalie?: string;
  spread?: number;
  total?: number;
  moneyline?: { home: number; away: number };
}

interface StandingsTeam {
  team: string;
  teamName: string;
  conference: string;
  division: string;
  wins: number;
  losses: number;
  otl: number;
  points: number;
  gf: number;
  ga: number;
  streak: string;
}

interface LeaderPlayer {
  id: string;
  name: string;
  team: string;
  value: number;
  gamesPlayed: number;
}

interface SkaterLeadersData {
  goals: LeaderPlayer[];
  assists: LeaderPlayer[];
  points: LeaderPlayer[];
  plusMinus: LeaderPlayer[];
  ppGoals: LeaderPlayer[];
}

interface GoalieLeadersData {
  savePct: LeaderPlayer[];
  gaa: LeaderPlayer[];
  wins: LeaderPlayer[];
  shutouts: LeaderPlayer[];
}

// ============================================================
// COMPONENT: NHL HUB PAGE
// ============================================================
export function NHLHubPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameData[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [standingsConference, setStandingsConference] = useState<"Eastern" | "Western">("Eastern");
  const [skaterTab, setSkaterTab] = useState<keyof SkaterLeadersData>("goals");
  const [goalieTab, setGoalieTab] = useState<keyof GoalieLeadersData>("savePct");
  
  // Real data state
  const [standings, setStandings] = useState<StandingsTeam[]>([]);
  const [skaterLeaders, setSkaterLeaders] = useState<SkaterLeadersData | null>(null);
  const [goalieLeaders, setGoalieLeaders] = useState<GoalieLeadersData | null>(null);
  const [_dataLoading, setDataLoading] = useState(true);

  // Fetch NHL games
  useEffect(() => {
    async function fetchGames() {
      try {
        const res = await fetch("/api/games?sport=NHL");
        if (res.ok) {
          const data = await res.json();
          const transformed = (data.games || []).map((g: any) => ({
            id: g.game_id,
            homeTeam: g.home_team_code || "TBD",
            awayTeam: g.away_team_code || "TBD",
            homeScore: g.home_score ?? 0,
            awayScore: g.away_score ?? 0,
            status: g.status === "IN_PROGRESS" ? "LIVE" : g.status === "FINAL" || g.status === "COMPLETED" ? "FINAL" : "SCHEDULED",
            period: g.period_label,
            clock: g.clock,
            startTime: g.start_time,
            spread: g.spread,
            total: g.overUnder,
            moneyline: g.odds?.moneyline,
          }));
          setGames(transformed);
        }
      } catch (err) {
        console.error("[NHLHubPage] Failed to fetch games:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchGames();
    const interval = setInterval(fetchGames, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch standings and leaders from SportsRadar
  useEffect(() => {
    async function fetchNHLData() {
      setDataLoading(true);
      try {
        // Fetch all data in parallel
        const [standingsRes, skatersRes, goaliesRes] = await Promise.all([
          fetch("/api/nhl/standings"),
          fetch("/api/nhl/leaders/skaters"),
          fetch("/api/nhl/leaders/goalies"),
        ]);

        if (standingsRes.ok) {
          const standingsData = await standingsRes.json();
          if (standingsData.standings?.length > 0) {
            setStandings(standingsData.standings);
          }
        }

        if (skatersRes.ok) {
          const skatersData = await skatersRes.json();
          if (skatersData.leaders) {
            setSkaterLeaders(skatersData.leaders);
          }
        }

        if (goaliesRes.ok) {
          const goaliesData = await goaliesRes.json();
          if (goaliesData.leaders) {
            setGoalieLeaders(goaliesData.leaders);
          }
        }
      } catch (err) {
        console.error("[NHLHubPage] Failed to fetch NHL data:", err);
      } finally {
        setDataLoading(false);
      }
    }
    fetchNHLData();
  }, []);

  // Featured games for rotator
  const featuredGames = useMemo(() => {
    const live = games.filter((g) => g.status === "LIVE");
    const scheduled = games.filter((g) => g.status === "SCHEDULED");
    return [...live, ...scheduled].slice(0, 5);
  }, [games]);

  // Games board sorted
  const sortedGames = useMemo(() => {
    const live = games.filter((g) => g.status === "LIVE");
    const scheduled = games.filter((g) => g.status === "SCHEDULED");
    const final = games.filter((g) => g.status === "FINAL");
    return [...live, ...scheduled, ...final];
  }, [games]);

  // Standings filtered by conference - use real data or fallback to mock
  const filteredStandings = useMemo(() => {
    // Use real standings if available
    if (standings.length > 0) {
      return standings
        .filter((s) => s.conference === standingsConference)
        .sort((a, b) => b.points - a.points);
    }
    // Fallback to mock data
    return MOCK_STANDINGS.filter((s) => NHL_TEAMS[s.team]?.conference === standingsConference)
      .sort((a, b) => b.points - a.points);
  }, [standingsConference, standings]);

  // Hero navigation
  const prevHero = useCallback(() => {
    setHeroIndex((i) => (i - 1 + featuredGames.length) % featuredGames.length);
  }, [featuredGames.length]);

  const nextHero = useCallback(() => {
    setHeroIndex((i) => (i + 1) % featuredGames.length);
  }, [featuredGames.length]);

  const randomInsight = useMemo(() => COACH_G_INSIGHTS[Math.floor(Math.random() * COACH_G_INSIGHTS.length)], []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0d1117] to-[#0a0a0a]">
      {/* ============================================================ */}
      {/* 1. FEATURED GAMES ROTATOR */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5" />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <span className="text-xl">🏒</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">NHL Command Center</h1>
                <p className="text-white/50 text-sm">Live games, stats & intel</p>
              </div>
            </div>
            {/* Player Search */}
            <PlayerSearch 
              sport="NHL" 
              placeholder="Search NHL players..." 
              className="w-full sm:w-72"
            />
          </div>

          {loading ? (
            <div className="h-48 rounded-2xl bg-white/5 animate-pulse" />
          ) : featuredGames.length > 0 ? (
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={heroIndex}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-6 backdrop-blur-sm"
                >
                  <FeaturedGameCard game={featuredGames[heroIndex]} onOpen={() => navigate(toGameDetailPath("nhl", featuredGames[heroIndex].id))} />
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              {featuredGames.length > 1 && (
                <>
                  <button onClick={prevHero} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={nextHero} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="flex justify-center gap-2 mt-4">
                    {featuredGames.map((_, i) => (
                      <button key={i} onClick={() => setHeroIndex(i)} className={`w-2 h-2 rounded-full transition-all ${i === heroIndex ? "bg-cyan-400 w-6" : "bg-white/30"}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="h-48 rounded-2xl border border-white/10 bg-white/[0.02] flex items-center justify-center">
              <p className="text-white/40">No games scheduled today</p>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-8">
        {/* ============================================================ */}
        {/* 2. COACH G NHL INTEL */}
        {/* ============================================================ */}
        <section>
          <SectionHeader icon={<Sparkles className="h-5 w-5 text-violet-400" />} title="Coach G NHL Intel" subtitle="Hockey-specific insights" />
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent p-5">
            <div className="flex items-start gap-4">
              <CoachGAvatar size="md" presence="monitoring" className="border-violet-400/35" />
              <div className="flex-1">
                <p className="text-white text-lg font-medium mb-3">"{randomInsight}"</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => navigate("/scout?q=NHL picks today")} className="px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/30 transition-colors flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Coach Picks
                  </button>
                  <button onClick={() => navigate("/scout?q=best NHL value bets")} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors">
                    Best Value Bets
                  </button>
                  <button onClick={() => navigate("/scout?q=NHL goalie matchups tonight")} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Goalie Matchups
                  </button>
                  <button onClick={() => navigate("/scout")} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Ask Coach G
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 3. TODAY'S GAMES BOARD */}
        {/* ============================================================ */}
        <section>
          <SectionHeader icon={<Calendar className="h-5 w-5 text-cyan-400" />} title="Today's Games" subtitle={`${sortedGames.length} games`} />
          {loading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : sortedGames.length > 0 ? (
            <div className="grid gap-3">
              {sortedGames.map((game) => (
                <GameBoardCard key={game.id} game={game} onClick={() => navigate(toGameDetailPath("nhl", game.id))} />
              ))}
            </div>
          ) : (
            <div className="h-32 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-center">
              <p className="text-white/40">No games today</p>
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/* 4. STANDINGS */}
        {/* ============================================================ */}
        <section>
          <SectionHeader icon={<Trophy className="h-5 w-5 text-amber-400" />} title="Standings" subtitle="Conference standings" />
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
            {/* Conference Toggle */}
            <div className="flex border-b border-white/10">
              {(["Eastern", "Western"] as const).map((conf) => (
                <button key={conf} onClick={() => setStandingsConference(conf)} className={`flex-1 py-3 text-sm font-bold transition-colors ${standingsConference === conf ? "bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-400" : "text-white/50 hover:text-white/70"}`}>
                  {conf} Conference
                </button>
              ))}
            </div>

            {/* Standings Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-xs uppercase">
                    <th className="text-left py-3 px-4">Team</th>
                    <th className="text-center px-2">W</th>
                    <th className="text-center px-2">L</th>
                    <th className="text-center px-2">OTL</th>
                    <th className="text-center px-2">PTS</th>
                    <th className="text-center px-2 hidden sm:table-cell">GF</th>
                    <th className="text-center px-2 hidden sm:table-cell">GA</th>
                    <th className="text-center px-2">STK</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStandings.map((row, i) => (
                    <tr
                      key={row.team}
                      onClick={() => {
                        logTeamNavigation(row.team, "nhl");
                        navigate(buildTeamRoute("nhl", row.team));
                      }}
                      className="border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 flex items-center gap-3">
                        <span className="w-5 text-center text-white/40 text-xs">{i + 1}</span>
                        <TeamLogo teamCode={row.team} sport="NHL" size={24} />
                        <span className="font-medium text-white">{NHL_TEAMS[row.team]?.name || row.team}</span>
                      </td>
                      <td className="text-center text-white">{row.wins}</td>
                      <td className="text-center text-white/60">{row.losses}</td>
                      <td className="text-center text-white/60">{row.otl}</td>
                      <td className="text-center font-bold text-cyan-400">{row.points}</td>
                      <td className="text-center text-white/60 hidden sm:table-cell">{row.gf}</td>
                      <td className="text-center text-white/60 hidden sm:table-cell">{row.ga}</td>
                      <td className="text-center">
                        <span className={`text-xs font-medium ${row.streak.startsWith("W") ? "text-emerald-400" : "text-red-400"}`}>{row.streak}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 5. LEAGUE LEADERS (SKATERS) */}
        {/* ============================================================ */}
        <section>
          <SectionHeader icon={<Users className="h-5 w-5 text-cyan-400" />} title="League Leaders" subtitle="Top skaters this season" />
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {[
                { key: "goals", label: "Goals" },
                { key: "assists", label: "Assists" },
                { key: "points", label: "Points" },
                { key: "plusMinus", label: "+/-" },
                { key: "ppGoals", label: "PP Goals" },
              ].map((tab) => (
                <button key={tab.key} onClick={() => setSkaterTab(tab.key as keyof typeof SKATER_LEADERS)} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${skaterTab === tab.key ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Leaders Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(skaterLeaders?.[skaterTab] || SKATER_LEADERS[skaterTab]).map((player, i) => (
                (() => {
                  const pid = resolvePlayerIdForNavigation(player.id, player.name, "nhl") || "";
                  return (
                <LeaderCard
                  key={player.id}
                  player={player}
                  rank={i + 1}
                  statLabel={skaterTab === "plusMinus" ? "+/-" : skaterTab === "ppGoals" ? "PP" : skaterTab}
                  onClick={pid
                    ? () => {
                        logPlayerNavigation(pid, "nhl");
                        void navigateToPlayerProfile(navigate, "nhl", pid, {
                          displayName: player.name,
                          source: "NHLHubSkaterLeaderCard",
                        });
                      }
                    : undefined}
                />
                  );
                })()
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 6. GOALIE LEADERS */}
        {/* ============================================================ */}
        <section>
          <SectionHeader icon={<Shield className="h-5 w-5 text-emerald-400" />} title="Goalie Leaders" subtitle="Top netminders" />
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {[
                { key: "savePct", label: "SV%" },
                { key: "gaa", label: "GAA" },
                { key: "wins", label: "Wins" },
                { key: "shutouts", label: "SO" },
              ].map((tab) => (
                <button key={tab.key} onClick={() => setGoalieTab(tab.key as keyof typeof GOALIE_LEADERS)} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${goalieTab === tab.key ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Leaders Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(goalieLeaders?.[goalieTab] || GOALIE_LEADERS[goalieTab]).map((player, i) => (
                (() => {
                  const pid = resolvePlayerIdForNavigation(player.id, player.name, "nhl") || "";
                  return (
                <GoalieCard
                  key={player.id}
                  player={player}
                  rank={i + 1}
                  statKey={goalieTab}
                  onClick={pid
                    ? () => {
                        logPlayerNavigation(pid, "nhl");
                        void navigateToPlayerProfile(navigate, "nhl", pid, {
                          displayName: player.name,
                          source: "NHLHubGoalieLeaderCard",
                        });
                      }
                    : undefined}
                />
                  );
                })()
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 7. STORYLINES / HEADLINES */}
        {/* ============================================================ */}
        <section>
          <SectionHeader icon={<Newspaper className="h-5 w-5 text-amber-400" />} title="NHL Storylines" subtitle="What's trending in hockey" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STORYLINES.slice(0, 5).map((story) => (
              <StorylineCard key={story.id} story={story} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">{icon}</div>
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-white/40 text-sm">{subtitle}</p>
      </div>
    </div>
  );
}

function FeaturedGameCard({ game, onOpen }: { game: GameData; onOpen: () => void }) {
  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";
  const isScheduled = game.status === "SCHEDULED";
  
  // Get goalie data for each team
  const awayGoalie = STARTING_GOALIES[game.awayTeam];
  const homeGoalie = STARTING_GOALIES[game.homeTeam];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Away Team */}
        <div className="flex-1 flex items-center gap-4 justify-end">
          <div className="text-right">
            <p className="text-white/50 text-sm">{NHL_TEAMS[game.awayTeam]?.city || "Away"}</p>
            <p className="text-white text-xl font-bold">{NHL_TEAMS[game.awayTeam]?.name || game.awayTeam}</p>
          </div>
          <TeamLogo teamCode={game.awayTeam} sport="NHL" size={64} />
        </div>

        {/* Score / Time */}
        <div className="text-center min-w-[120px]">
          {isLive ? (
            <>
              <div className="flex items-center justify-center gap-1 mb-2">
                <Circle className="h-2 w-2 fill-red-500 text-red-500 animate-pulse" />
                <span className="text-red-400 text-xs font-bold uppercase">Live</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {game.awayScore} - {game.homeScore}
              </div>
              <p className="text-white/50 text-sm mt-1">{game.period} • {game.clock}</p>
            </>
          ) : isFinal ? (
            <>
              <p className="text-white/40 text-xs font-bold uppercase mb-2">Final</p>
              <div className="text-3xl font-bold text-white">
                {game.awayScore} - {game.homeScore}
              </div>
            </>
          ) : (
            <>
              <p className="text-white/40 text-xs uppercase mb-2">Today</p>
              <div className="text-2xl font-bold text-white">{formatTime(game.startTime)}</div>
            </>
          )}
        </div>

        {/* Home Team */}
        <div className="flex-1 flex items-center gap-4">
          <TeamLogo teamCode={game.homeTeam} sport="NHL" size={64} />
          <div>
            <p className="text-white/50 text-sm">{NHL_TEAMS[game.homeTeam]?.city || "Home"}</p>
            <p className="text-white text-xl font-bold">{NHL_TEAMS[game.homeTeam]?.name || game.homeTeam}</p>
          </div>
        </div>

        {/* CTA */}
        <button onClick={onOpen} className="px-6 py-3 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold hover:bg-cyan-500/30 transition-colors flex items-center gap-2">
          Open Game
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Goalie Matchup Section */}
      {isScheduled && awayGoalie && homeGoalie && (
        <div className="border-t border-white/10 pt-4 mt-2">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider">🥅 Goalie Matchup</span>
          </div>
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            {/* Away Goalie */}
            <div className="flex items-center gap-3">
              {awayGoalie.espnId && (
                <img 
                  src={`https://a.espncdn.com/combiner/i?img=/i/headshots/nhl/players/full/${awayGoalie.espnId}.png&w=80&h=58&cb=1`}
                  alt={awayGoalie.name}
                  className="w-10 h-10 rounded-full object-cover bg-white/10"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="text-right sm:text-left">
                <p className="text-white font-semibold text-sm">{awayGoalie.name}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-cyan-400">{(awayGoalie.savePct * 100).toFixed(1)}%</span>
                  <span className="text-white/40">•</span>
                  <span className="text-amber-400">{awayGoalie.gaa.toFixed(2)} GAA</span>
                  <span className="text-white/40">•</span>
                  <span className="text-emerald-400">{awayGoalie.wins}W</span>
                </div>
              </div>
            </div>

            <span className="text-white/30 font-bold">VS</span>

            {/* Home Goalie */}
            <div className="flex items-center gap-3">
              <div className="text-left sm:text-right">
                <p className="text-white font-semibold text-sm">{homeGoalie.name}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-cyan-400">{(homeGoalie.savePct * 100).toFixed(1)}%</span>
                  <span className="text-white/40">•</span>
                  <span className="text-amber-400">{homeGoalie.gaa.toFixed(2)} GAA</span>
                  <span className="text-white/40">•</span>
                  <span className="text-emerald-400">{homeGoalie.wins}W</span>
                </div>
              </div>
              {homeGoalie.espnId && (
                <img 
                  src={`https://a.espncdn.com/combiner/i?img=/i/headshots/nhl/players/full/${homeGoalie.espnId}.png&w=80&h=58&cb=1`}
                  alt={homeGoalie.name}
                  className="w-10 h-10 rounded-full object-cover bg-white/10"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GameBoardCard({ game, onClick }: { game: GameData; onClick: () => void }) {
  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";

  return (
    <div onClick={onClick} className={`rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.01] ${isLive ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}>
      <div className="flex items-center justify-between">
        {/* Teams */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <TeamLogo teamCode={game.awayTeam} sport="NHL" size={24} />
            <span className="text-white font-medium">{NHL_TEAMS[game.awayTeam]?.name || game.awayTeam}</span>
            {(isLive || isFinal) && <span className="text-white font-bold ml-auto">{game.awayScore}</span>}
          </div>
          <div className="flex items-center gap-3">
            <TeamLogo teamCode={game.homeTeam} sport="NHL" size={24} />
            <span className="text-white font-medium">{NHL_TEAMS[game.homeTeam]?.name || game.homeTeam}</span>
            {(isLive || isFinal) && <span className="text-white font-bold ml-auto">{game.homeScore}</span>}
          </div>
        </div>

        {/* Status / Odds */}
        <div className="flex items-center gap-6 ml-4">
          {/* Status */}
          <div className="text-center min-w-[60px]">
            {isLive ? (
              <div className="flex flex-col items-center">
                <span className="text-red-400 text-xs font-bold flex items-center gap-1">
                  <Circle className="h-1.5 w-1.5 fill-red-500" />
                  LIVE
                </span>
                <span className="text-white/50 text-xs">{game.period}</span>
              </div>
            ) : isFinal ? (
              <span className="text-white/40 text-xs font-bold">FINAL</span>
            ) : (
              <span className="text-white text-sm font-medium">{formatTime(game.startTime)}</span>
            )}
          </div>

          {/* Odds */}
          {!isFinal && (
            <div className="hidden sm:flex gap-4 text-xs">
              {game.spread !== undefined && (
                <div className="text-center">
                  <p className="text-white/30 uppercase">Spread</p>
                  <p className="text-white font-medium">{game.spread > 0 ? "+" : ""}{game.spread}</p>
                </div>
              )}
              {game.total !== undefined && (
                <div className="text-center">
                  <p className="text-white/30 uppercase">Total</p>
                  <p className="text-white font-medium">{game.total}</p>
                </div>
              )}
              {game.moneyline && (
                <div className="text-center">
                  <p className="text-white/30 uppercase">ML</p>
                  <p className="text-white font-medium">{game.moneyline.home > 0 ? "+" : ""}{game.moneyline.home}</p>
                </div>
              )}
            </div>
          )}

          <ArrowRight className="h-4 w-4 text-white/30" />
        </div>
      </div>
    </div>
  );
}

function LeaderCard({ player, rank, statLabel, onClick }: { player: { name: string; team: string; value: number; gamesPlayed: number }; rank: number; statLabel: string; onClick?: () => void }) {
  const isFirst = rank === 1;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 transition-all ${
        onClick ? "cursor-pointer hover:scale-[1.02]" : "cursor-not-allowed opacity-70"
      } ${isFirst ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent" : "border-white/10 bg-white/[0.02]"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${isFirst ? "bg-gradient-to-br from-amber-400 to-amber-600 text-black" : "bg-white/10 text-white/50"}`}>{rank}</div>
        <TeamLogo teamCode={player.team} sport="NHL" size={24} />
      </div>
      <p className="text-white font-semibold truncate">{player.name}</p>
      <p className="text-white/40 text-xs">{NHL_TEAMS[player.team]?.name || player.team}</p>
      <div className={`text-2xl font-bold mt-2 ${isFirst ? "text-amber-400" : "text-white"}`}>
        {statLabel === "+/-" && player.value > 0 ? "+" : ""}{player.value}
      </div>
      <p className="text-white/30 text-xs">{player.gamesPlayed} GP</p>
    </div>
  );
}

function GoalieCard({ player, rank, statKey, onClick }: { player: { name: string; team: string; value: number; gamesPlayed: number }; rank: number; statKey: string; onClick?: () => void }) {
  const isFirst = rank === 1;

  const formatValue = () => {
    if (statKey === "savePct") return player.value.toFixed(3);
    if (statKey === "gaa") return player.value.toFixed(2);
    return player.value;
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 transition-all ${
        onClick ? "cursor-pointer hover:scale-[1.02]" : "cursor-not-allowed opacity-70"
      } ${isFirst ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent" : "border-white/10 bg-white/[0.02]"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${isFirst ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-black" : "bg-white/10 text-white/50"}`}>{rank}</div>
        <Shield className={`h-5 w-5 ${isFirst ? "text-emerald-400" : "text-white/30"}`} />
      </div>
      <p className="text-white font-semibold truncate">{player.name}</p>
      <p className="text-white/40 text-xs">{NHL_TEAMS[player.team]?.name || player.team}</p>
      <div className={`text-2xl font-bold mt-2 ${isFirst ? "text-emerald-400" : "text-white"}`}>{formatValue()}</div>
      <p className="text-white/30 text-xs">{player.gamesPlayed} GP</p>
    </div>
  );
}

function StorylineCard({ story }: { story: (typeof STORYLINES)[0] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-4 hover:border-white/20 transition-all">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-white font-semibold">{story.headline}</h3>
        {story.hot && (
          <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/20 px-2 py-1 rounded-full">
            <Flame className="h-3 w-3" />
            Hot
          </span>
        )}
      </div>
      <p className="text-white/50 text-sm mb-3">{story.summary}</p>
      {story.coachNote && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
          <CoachGAvatar size="xs" presence="monitoring" className="h-5 w-5 rounded-full border-0" />
          <p className="text-violet-300 text-xs">"{story.coachNote}"</p>
        </div>
      )}
    </div>
  );
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "TBD";
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default NHLHubPage;
