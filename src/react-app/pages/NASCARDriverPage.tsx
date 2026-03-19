import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Trophy, ChevronLeft, Flag, TrendingUp, Target, Zap, MessageSquare,
  Calendar, Award, Car, Gauge, Timer, ArrowRight
} from "lucide-react";
import { extractProviderWinnerName, normalizeNascarNameToken, normalizeProviderRaceResults } from "@/react-app/lib/nascarResults";

// ============================================================
// COACH G AVATAR
// ============================================================
const COACH_G_AVATAR = "/assets/coachg/coach-g-avatar.png";

// ============================================================
// NASCAR MANUFACTURERS
// ============================================================
const MANUFACTURERS: Record<string, { color: string; bgColor: string; logo: string }> = {
  "Chevrolet": { color: "#FFD700", bgColor: "from-yellow-500/20", logo: "🏎️" },
  "Ford": { color: "#0066CC", bgColor: "from-blue-500/20", logo: "🏎️" },
  "Toyota": { color: "#EB0A1E", bgColor: "from-red-500/20", logo: "🏎️" },
};

// ============================================================
// NASCAR DRIVER DATABASE
// ============================================================
const NASCAR_DRIVERS: Record<string, { 
  name: string; 
  number: string; 
  team: string; 
  manufacturer: string;
  hometown?: string;
  age?: number;
  rookie?: boolean;
}> = {
  "larson": { name: "Kyle Larson", number: "5", team: "Hendrick Motorsports", manufacturer: "Chevrolet", hometown: "Elk Grove, CA", age: 31 },
  "byron": { name: "William Byron", number: "24", team: "Hendrick Motorsports", manufacturer: "Chevrolet", hometown: "Charlotte, NC", age: 26 },
  "elliott": { name: "Chase Elliott", number: "9", team: "Hendrick Motorsports", manufacturer: "Chevrolet", hometown: "Dawsonville, GA", age: 28 },
  "bowman": { name: "Alex Bowman", number: "48", team: "Hendrick Motorsports", manufacturer: "Chevrolet", hometown: "Tucson, AZ", age: 30 },
  "hamlin": { name: "Denny Hamlin", number: "11", team: "Joe Gibbs Racing", manufacturer: "Toyota", hometown: "Chesterfield, VA", age: 44 },
  "truex": { name: "Martin Truex Jr.", number: "19", team: "Joe Gibbs Racing", manufacturer: "Toyota", hometown: "Mayetta, NJ", age: 44 },
  "bell": { name: "Christopher Bell", number: "20", team: "Joe Gibbs Racing", manufacturer: "Toyota", hometown: "Norman, OK", age: 29 },
  "gibbs": { name: "Ty Gibbs", number: "54", team: "Joe Gibbs Racing", manufacturer: "Toyota", hometown: "Charlotte, NC", age: 22, rookie: true },
  "logano": { name: "Joey Logano", number: "22", team: "Team Penske", manufacturer: "Ford", hometown: "Middletown, CT", age: 34 },
  "blaney": { name: "Ryan Blaney", number: "12", team: "Team Penske", manufacturer: "Ford", hometown: "Hartford, OH", age: 30 },
  "cindric": { name: "Austin Cindric", number: "2", team: "Team Penske", manufacturer: "Ford", hometown: "Columbus, OH", age: 26 },
  "harvick": { name: "Kevin Harvick", number: "4", team: "Stewart-Haas Racing", manufacturer: "Ford", hometown: "Bakersfield, CA", age: 49 },
  "briscoe": { name: "Chase Briscoe", number: "14", team: "Stewart-Haas Racing", manufacturer: "Ford", hometown: "Mitchell, IN", age: 29 },
  "busch": { name: "Kyle Busch", number: "8", team: "Richard Childress Racing", manufacturer: "Chevrolet", hometown: "Las Vegas, NV", age: 39 },
  "dillon": { name: "Austin Dillon", number: "3", team: "Richard Childress Racing", manufacturer: "Chevrolet", hometown: "Lewisville, NC", age: 34 },
  "reddick": { name: "Tyler Reddick", number: "45", team: "23XI Racing", manufacturer: "Toyota", hometown: "Corning, CA", age: 28 },
  "wallace": { name: "Bubba Wallace", number: "23", team: "23XI Racing", manufacturer: "Toyota", hometown: "Mobile, AL", age: 30 },
  "chastain": { name: "Ross Chastain", number: "1", team: "Trackhouse Racing", manufacturer: "Chevrolet", hometown: "Alva, FL", age: 31 },
  "suarez": { name: "Daniel Suárez", number: "99", team: "Trackhouse Racing", manufacturer: "Chevrolet", hometown: "Monterrey, Mexico", age: 32 },
  "keselowski": { name: "Brad Keselowski", number: "6", team: "RFK Racing", manufacturer: "Ford", hometown: "Rochester Hills, MI", age: 40 },
};

// ============================================================
// DRIVER STANDINGS & STATS
// ============================================================
const DRIVER_STANDINGS: Record<string, { 
  rank: number; 
  wins: number; 
  top5: number; 
  top10: number; 
  points: number; 
  behind: string;
  lapsLed: number;
  avgStart: number;
  avgFinish: number;
  dnf: number;
}> = {
  "larson": { rank: 1, wins: 2, top5: 5, top10: 6, points: 312, behind: "-", lapsLed: 412, avgStart: 4.2, avgFinish: 4.2, dnf: 0 },
  "byron": { rank: 2, wins: 1, top5: 4, top10: 5, points: 285, behind: "-27", lapsLed: 285, avgStart: 5.1, avgFinish: 6.8, dnf: 0 },
  "hamlin": { rank: 3, wins: 1, top5: 4, top10: 6, points: 278, behind: "-34", lapsLed: 198, avgStart: 6.3, avgFinish: 7.1, dnf: 0 },
  "bell": { rank: 4, wins: 1, top5: 3, top10: 5, points: 265, behind: "-47", lapsLed: 156, avgStart: 7.2, avgFinish: 8.4, dnf: 0 },
  "elliott": { rank: 5, wins: 0, top5: 3, top10: 5, points: 248, behind: "-64", lapsLed: 89, avgStart: 8.4, avgFinish: 9.2, dnf: 1 },
  "chastain": { rank: 6, wins: 1, top5: 2, top10: 4, points: 235, behind: "-77", lapsLed: 124, avgStart: 9.1, avgFinish: 10.5, dnf: 0 },
  "blaney": { rank: 7, wins: 0, top5: 3, top10: 4, points: 228, behind: "-84", lapsLed: 78, avgStart: 6.8, avgFinish: 9.8, dnf: 1 },
  "logano": { rank: 8, wins: 0, top5: 2, top10: 4, points: 218, behind: "-94", lapsLed: 124, avgStart: 10.2, avgFinish: 11.4, dnf: 0 },
  "reddick": { rank: 9, wins: 0, top5: 2, top10: 3, points: 205, behind: "-107", lapsLed: 45, avgStart: 11.5, avgFinish: 12.8, dnf: 1 },
  "truex": { rank: 10, wins: 0, top5: 2, top10: 3, points: 198, behind: "-114", lapsLed: 56, avgStart: 8.9, avgFinish: 11.2, dnf: 1 },
  "busch": { rank: 11, wins: 0, top5: 1, top10: 4, points: 192, behind: "-120", lapsLed: 34, avgStart: 12.3, avgFinish: 13.5, dnf: 0 },
  "briscoe": { rank: 12, wins: 0, top5: 1, top10: 3, points: 178, behind: "-134", lapsLed: 12, avgStart: 14.2, avgFinish: 15.1, dnf: 1 },
  "suarez": { rank: 13, wins: 0, top5: 1, top10: 3, points: 172, behind: "-140", lapsLed: 28, avgStart: 13.8, avgFinish: 14.6, dnf: 0 },
  "keselowski": { rank: 14, wins: 0, top5: 1, top10: 2, points: 165, behind: "-147", lapsLed: 18, avgStart: 15.4, avgFinish: 16.2, dnf: 1 },
  "wallace": { rank: 15, wins: 0, top5: 0, top10: 2, points: 148, behind: "-164", lapsLed: 8, avgStart: 16.8, avgFinish: 18.4, dnf: 2 },
  "gibbs": { rank: 16, wins: 0, top5: 1, top10: 2, points: 142, behind: "-170", lapsLed: 22, avgStart: 14.5, avgFinish: 15.8, dnf: 1 },
  "cindric": { rank: 17, wins: 0, top5: 0, top10: 2, points: 138, behind: "-174", lapsLed: 5, avgStart: 17.2, avgFinish: 17.9, dnf: 0 },
  "bowman": { rank: 18, wins: 0, top5: 1, top10: 2, points: 132, behind: "-180", lapsLed: 15, avgStart: 11.8, avgFinish: 14.2, dnf: 2 },
  "dillon": { rank: 19, wins: 0, top5: 0, top10: 1, points: 125, behind: "-187", lapsLed: 3, avgStart: 18.5, avgFinish: 19.2, dnf: 1 },
  "harvick": { rank: 20, wins: 0, top5: 0, top10: 1, points: 118, behind: "-194", lapsLed: 10, avgStart: 19.2, avgFinish: 20.5, dnf: 2 },
};

const NASCAR_SEASON_YEAR = new Date().getFullYear();
const seasonDate = (monthDay: string) => `${NASCAR_SEASON_YEAR}-${monthDay}`;

// ============================================================
// RACE SCHEDULE WITH RESULTS
// ============================================================
const RACE_SCHEDULE = [
  { id: "daytona500", name: "Daytona 500", track: "Daytona", date: seasonDate("02-16"), status: "completed", winner: "larson" },
  { id: "atlanta1", name: "Ambetter Health 400", track: "Atlanta", date: seasonDate("02-23"), status: "completed", winner: "byron" },
  { id: "phoenix1", name: "Shriners Children's 500", track: "Phoenix", date: seasonDate("03-09"), status: "completed", winner: "bell" },
  { id: "lasvegas1", name: "Pennzoil 400", track: "Las Vegas", date: seasonDate("03-15"), status: "completed", winner: "hamlin" },
  { id: "cota1", name: "EchoPark Automotive Grand Prix", track: "COTA", date: seasonDate("03-23"), status: "completed", winner: "chastain" },
  { id: "martinsville1", name: "STP 500", track: "Martinsville", date: seasonDate("03-30"), status: "upcoming" },
  { id: "talladega1", name: "GEICO 500", track: "Talladega", date: seasonDate("04-06"), status: "upcoming" },
  { id: "bristol1", name: "Food City 500", track: "Bristol", date: seasonDate("04-12"), status: "upcoming" },
];

function deriveFallbackRaceStatus(date: string): "completed" | "upcoming" {
  const normalized = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "upcoming";
  const [yy, mm, dd] = normalized.split("-").map((v) => Number(v));
  const eventDay = yy * 10000 + mm * 100 + dd;
  const todayEtParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const todayEtYear = Number(todayEtParts.find((p) => p.type === "year")?.value || "0");
  const todayEtMonth = Number(todayEtParts.find((p) => p.type === "month")?.value || "0");
  const todayEtDay = Number(todayEtParts.find((p) => p.type === "day")?.value || "0");
  const currentEtDay = todayEtYear * 10000 + todayEtMonth * 100 + todayEtDay;
  const now = new Date();
  const currentLocalDay = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const referenceDay = Math.max(currentEtDay, currentLocalDay);
  return eventDay < referenceDay ? "completed" : "upcoming";
}

function parseDateForDisplay(value: string): Date {
  const trimmed = String(value || "").trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]) - 1;
    const day = Number(ymd[3]);
    return new Date(year, month, day, 12, 0, 0, 0);
  }
  return new Date(trimmed);
}

// ============================================================
// LIVE DATA HELPERS
// ============================================================
type LiveNascarGame = {
  id?: string;
  game_id?: string;
  start_time?: string;
  status?: string;
  home_team_name?: string;
  away_team_name?: string;
  home_team_code?: string;
  away_team_code?: string;
  home_score?: number | null;
  away_score?: number | null;
  venue?: string;
  race_results?: Array<{
    position?: number | string;
    driver_name?: string;
    name?: string;
    status?: string;
  }>;
};

type DriverRaceResult = {
  raceId: string;
  raceName: string;
  track: string;
  date: string;
  position: number | null;
  lapsLed: number | null;
};

function makeDriverRaceKey(row: DriverRaceResult): string {
  const id = String(row.raceId || "").trim();
  if (id) return id;
  return `${row.track}:${row.date}`;
}

type NascarStandingRow = {
  rank: number;
  driver_name: string;
  starts: number;
  wins: number;
  best_finish: number | null;
  last_result: string | null;
  top5: number | null;
  top10: number | null;
  points: number | null;
  avg_finish: number | null;
  laps_led: number | null;
};

type NascarStandingsPayload = {
  standings: NascarStandingRow[];
  coverage?: Record<string, boolean>;
  fallback_reason?: string | null;
};

function doesDriverMatchGame(driverName: string, game: LiveNascarGame): boolean {
  const normalizedDriver = normalizeNascarNameToken(driverName);
  const raceResults = normalizeProviderRaceResults(game.race_results);
  const hasRaceResultEntry = raceResults.some((row) => {
    const rowName = normalizeNascarNameToken(String(row?.driverName || ""));
    if (!rowName) return false;
    if (rowName === normalizedDriver) return true;
    const targetLast = normalizedDriver.split(" ").pop() || "";
    const rowLast = rowName.split(" ").pop() || "";
    return Boolean(targetLast && rowLast && targetLast === rowLast);
  });
  if (hasRaceResultEntry) return true;

  const driverLast = normalizedDriver.split(" ").pop() || "";
  const home = normalizeNascarNameToken(game.home_team_name || game.home_team_code || "");
  const away = normalizeNascarNameToken(game.away_team_name || game.away_team_code || "");
  if (!home && !away) return false;
  return (
    home === normalizedDriver
    || away === normalizedDriver
    || (driverLast.length > 2 && (home.includes(driverLast) || away.includes(driverLast)))
  );
}

function deriveWinnerName(game: LiveNascarGame): string | null {
  const winner = extractProviderWinnerName(game, normalizeProviderRaceResults(game.race_results));
  return winner || null;
}

// ============================================================
// COACH G DRIVER INSIGHTS
// ============================================================
function getCoachGInsight(driverId: string): string {
  const insights: Record<string, string[]> = {
    "larson": [
      "Larson is the hottest driver right now. Back him on intermediates.",
      "Track position king this season. His restarts are elite.",
      "Two wins already - playoff lock. Look for top-5 props.",
    ],
    "byron": [
      "Byron quietly building a championship run. Consistent as they come.",
      "Strong on 1.5-mile tracks. Atlanta win wasn't a fluke.",
      "Hendrick equipment is dialed in. Top-10 props are solid.",
    ],
    "hamlin": [
      "Hamlin still chasing that elusive championship. Motivated.",
      "Master of Martinsville - lock him in for short tracks.",
      "Experience matters in the playoffs. He'll be there.",
    ],
    "bell": [
      "Bell's breakout is happening. JGR has him set up right.",
      "Road course specialist with raw speed everywhere.",
      "Young gun making veteran moves. Back him H2H vs peers.",
    ],
    "chastain": [
      "Chastain's aggression works until it doesn't. High risk, high reward.",
      "Wall-riding wizard. Unpredictable but always in the mix.",
      "Fade him on superspeedways, back him on road courses.",
    ],
  };
  const driverInsights = insights[driverId] || [
    "Solid driver who can surprise on any given Sunday.",
    "Watch for track-specific performances to find value.",
    "Study recent results before making prop plays.",
  ];
  const seed = driverId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return driverInsights[seed % driverInsights.length];
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function NASCARDriverPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const [liveGames, setLiveGames] = useState<LiveNascarGame[]>([]);
  const [liveSyncChecked, setLiveSyncChecked] = useState(false);
  const [liveStandings, setLiveStandings] = useState<NascarStandingsPayload | null>(null);

  const driver = driverId ? NASCAR_DRIVERS[driverId] : null;
  const mfr = driver ? MANUFACTURERS[driver.manufacturer] : null;
  const coachInsight = driverId ? getCoachGInsight(driverId) : "";

  useEffect(() => {
    let active = true;
    const loadLiveGames = async () => {
      try {
        const res = await fetch("/api/games?sport=nascar", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setLiveGames(Array.isArray(data?.games) ? data.games : []);
      } catch {
        // Keep static fallback below.
      } finally {
        if (active) setLiveSyncChecked(true);
      }
    };
    void loadLiveGames();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadStandings = async () => {
      try {
        const res = await fetch("/api/games/nascar/standings", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setLiveStandings({
          standings: Array.isArray(data?.standings) ? data.standings : [],
          coverage: data?.coverage,
          fallback_reason: data?.fallback_reason || null,
        });
      } catch {
        // No-op: page will surface N/A for unavailable metrics.
      }
    };
    void loadStandings();
    return () => {
      active = false;
    };
  }, []);

  const normalizedFallbackSchedule = useMemo(
    () =>
      RACE_SCHEDULE.map((race) => {
        const status = deriveFallbackRaceStatus(race.date);
        return {
          ...race,
          status,
          winner: status === "completed" ? race.winner : undefined,
        };
      }),
    []
  );

  const raceResults: DriverRaceResult[] = useMemo(() => {
    if (!driver) return [];

    const fallbackRows = normalizedFallbackSchedule.slice(0, 6).map((race) => ({
      raceId: race.id,
      raceName: race.name,
      track: race.track,
      date: race.date,
      position: race.winner === driverId ? 1 : null,
      lapsLed: null,
    }));

    if (liveGames.length > 0) {
      const liveRows = liveGames
        .filter((game) => doesDriverMatchGame(driver.name, game))
        .map((game) => {
          const raceId = String(game.id || game.game_id || "");
          const raceName = String(game.venue || `${game.away_team_name || game.away_team_code || "Away"} vs ${game.home_team_name || game.home_team_code || "Home"}`);
          const date = String(game.start_time || "");
          const status = String(game.status || "").toUpperCase();
          const raceResults = normalizeProviderRaceResults(game.race_results);
          const raceResultRow = raceResults.find((row) => {
            const rowName = normalizeNascarNameToken(String(row?.driverName || ""));
            if (!rowName) return false;
            if (rowName === normalizeNascarNameToken(driver.name)) return true;
            const rowLast = rowName.split(" ").pop() || "";
            const targetLast = normalizeNascarNameToken(driver.name).split(" ").pop() || "";
            return Boolean(rowLast && targetLast && rowLast === targetLast);
          });
          let position = Number(raceResultRow?.position);
          if (!Number.isFinite(position)) {
            const winnerName = status === "FINAL" ? deriveWinnerName(game) : null;
            position = winnerName && normalizeNascarNameToken(winnerName) === normalizeNascarNameToken(driver.name) ? 1 : NaN;
          }
          return {
            raceId,
            raceName,
            track: String(game.venue || "Track TBD"),
            date,
            position: Number.isFinite(position) ? position : null,
            lapsLed: null,
          };
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (liveRows.length > 0) {
        const fallbackByKey = new Map(fallbackRows.map((row) => [makeDriverRaceKey(row), row]));
        const mergedRows = liveRows.map((row) => {
          if (row.position != null) return row;
          const fallback = fallbackByKey.get(makeDriverRaceKey(row));
          return fallback?.position != null ? { ...row, position: fallback.position } : row;
        });
        const hasVerifiedFinish = mergedRows.some((row) => row.position != null);
        if (hasVerifiedFinish) return mergedRows;
        console.warn("[NASCAR][validation] Driver live payload has no verified finishes; using fallback rows", {
          driverId,
          driverName: driver.name,
          liveRows: liveRows.length,
        });
      }
    }

    return fallbackRows;
  }, [driver, driverId, liveGames, normalizedFallbackSchedule]);

  const liveStarts = raceResults.length;
  const liveWins = raceResults.filter((r) => r.position === 1).length;
  const hasLiveDriverData = liveGames.length > 0 && liveStarts > 0;
  const standingRow = useMemo(() => {
    if (!driver || !liveStandings?.standings?.length) return null;
    const normalizedDriver = normalizeNascarNameToken(driver.name);
    const lastName = normalizedDriver.split(" ").pop() || "";
    return liveStandings.standings.find((row) => {
      const normalizedRow = normalizeNascarNameToken(row.driver_name);
      return normalizedRow === normalizedDriver || (lastName.length > 2 && normalizedRow.includes(lastName));
    }) || null;
  }, [driver, liveStandings]);

  if (!driver) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-4">Driver not found</p>
          <button
            onClick={() => navigate("/sports/nascar")}
            className="px-4 py-2 rounded-lg bg-amber-500 text-black font-medium"
          >
            Back to NASCAR Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0d1117] to-[#0a0a0a]">
      {/* ============================================================ */}
      {/* HERO SECTION */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${mfr?.bgColor || "from-white/10"} via-transparent to-transparent opacity-50`} />
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Back Button */}
          <button
            onClick={() => navigate("/sports/nascar")}
            className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors min-h-[44px]"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>NASCAR Hub</span>
          </button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col lg:flex-row gap-8 items-start"
          >
            {/* Driver Card */}
            <div className="flex-shrink-0">
              <div className={`w-32 h-32 lg:w-40 lg:h-40 rounded-2xl bg-gradient-to-br ${mfr?.bgColor || "from-white/20"} to-transparent border border-white/20 flex items-center justify-center shadow-2xl`}>
                <span className="text-5xl lg:text-6xl font-black text-white">#{driver.number}</span>
              </div>
            </div>

            {/* Driver Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {standingRow && standingRow.rank <= 3 && (
                  <span className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-400 text-xs font-bold">
                    #{standingRow.rank} LIVE RANK
                  </span>
                )}
                {driver.rookie && (
                  <span className="px-2 py-1 rounded-md bg-cyan-500/20 text-cyan-400 text-xs font-bold">
                    ROOKIE
                  </span>
                )}
                {standingRow && standingRow.wins > 0 && (
                  <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1">
                    <Trophy className="h-3 w-3" />
                    {standingRow.wins} {standingRow.wins === 1 ? "WIN" : "WINS"}
                  </span>
                )}
              </div>

              <h1 className="text-3xl lg:text-4xl font-black text-white mb-2">{driver.name}</h1>
              
              <div className="flex flex-wrap items-center gap-4 text-white/60 mb-6">
                <span className="flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  {driver.team}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-lg">{mfr?.logo}</span>
                  {driver.manufacturer}
                </span>
                {driver.hometown && (
                  <span className="flex items-center gap-2">
                    📍 {driver.hometown}
                  </span>
                )}
                {driver.age && (
                  <span className="text-white/40">Age {driver.age}</span>
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-4 max-w-xl">
                <div className="text-center p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-2xl font-bold text-amber-400">{standingRow?.points ?? "N/A"}</p>
                  <p className="text-xs text-white/40">Points</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-2xl font-bold text-emerald-400">{standingRow?.wins ?? "N/A"}</p>
                  <p className="text-xs text-white/40">Wins</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-2xl font-bold text-cyan-400">{standingRow?.top5 ?? "N/A"}</p>
                  <p className="text-xs text-white/40">Top 5</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-2xl font-bold text-white">{standingRow?.top10 ?? "N/A"}</p>
                  <p className="text-xs text-white/40">Top 10</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-8">
        {liveSyncChecked && !hasLiveDriverData && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            NASCAR live driver splits are still syncing from provider feeds. Showing best available fallback context.
          </div>
        )}
        {liveStandings?.fallback_reason && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            {liveStandings.fallback_reason}
          </div>
        )}
        {/* ============================================================ */}
        {/* COACH G INTEL */}
        {/* ============================================================ */}
        <section>
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent p-5">
            <div className="flex items-start gap-4">
              <img
                src={COACH_G_AVATAR}
                alt="Coach G"
                className="w-14 h-14 rounded-xl object-cover border-2 border-violet-500/30"
              />
              <div className="flex-1">
                <p className="text-white text-lg font-medium mb-3">"{coachInsight}"</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate(`/scout?q=${driver.name} betting props`)}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/30 transition-colors flex items-center gap-2"
                  >
                    <Target className="h-4 w-4" />
                    Betting Props
                  </button>
                  <button
                    onClick={() => navigate(`/scout?q=${driver.name} next race prediction`)}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Next Race
                  </button>
                  <button
                    onClick={() => navigate("/scout")}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Ask Coach G
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SEASON STATS */}
        {/* ============================================================ */}
        <section>
          <SectionHeader
            icon={<Gauge className="h-5 w-5 text-cyan-400" />}
            title={`${NASCAR_SEASON_YEAR} Season Stats`}
            subtitle="Performance metrics"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Starts" value={String(liveStarts || 0)} accent="amber" />
            <StatCard label="Wins" value={String(liveWins || 0)} accent="emerald" />
            <StatCard label="Last Finish" value={raceResults[0]?.position ? String(raceResults[0].position) : "N/A"} accent="cyan" />
            <StatCard label="Laps Led" value="N/A" accent="violet" />
            <StatCard label="DNFs" value="N/A" accent="white" />
            <StatCard label="Points Back" value={standingRow ? "Live feed" : "N/A"} accent="white" />
          </div>
        </section>

        {/* ============================================================ */}
        {/* RACE RESULTS */}
        {/* ============================================================ */}
        <section>
          <SectionHeader
            icon={<Flag className="h-5 w-5 text-amber-400" />}
            title={`${NASCAR_SEASON_YEAR} Race Results`}
            subtitle="Season performance"
          />
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                    <th className="text-left py-3 px-4">Race</th>
                    <th className="text-left px-4">Track</th>
                    <th className="text-center px-4">Finish</th>
                    <th className="text-center px-4">Laps Led</th>
                  </tr>
                </thead>
                <tbody>
                  {raceResults.map((result) => {
                    const isWin = result.position === 1;
                    const resultDate = result.date ? parseDateForDisplay(result.date) : null;
                    return (
                      <tr
                        key={result.raceId}
                        onClick={() => navigate(`/sports/nascar/race/${result.raceId}`)}
                        className="border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-white">{result.raceName}</p>
                          <p className="text-xs text-white/40">
                            {resultDate && !Number.isNaN(resultDate.getTime()) && resultDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </td>
                        <td className="px-4 text-white/60">{result.track}</td>
                        <td className="text-center">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold ${
                              isWin
                                ? "bg-amber-500 text-black"
                                : (result.position || 999) <= 5
                                ? "bg-emerald-500/20 text-emerald-400"
                                : (result.position || 999) <= 10
                                ? "bg-cyan-500/20 text-cyan-400"
                                : "bg-white/10 text-white/60"
                            }`}
                          >
                            {result.position ?? "-"}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className={(result.lapsLed || 0) > 20 ? "text-violet-400 font-medium" : "text-white/60"}>
                            {result.lapsLed ?? "-"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* UPCOMING RACES */}
        {/* ============================================================ */}
        <section>
          <SectionHeader
            icon={<Calendar className="h-5 w-5 text-cyan-400" />}
            title="Upcoming Races"
            subtitle="Schedule ahead"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {normalizedFallbackSchedule.filter((r) => r.status === "upcoming")
              .slice(0, 4)
              .map((race) => (
                (() => {
                  const raceDate = parseDateForDisplay(race.date);
                  return (
                <div
                  key={race.id}
                  onClick={() => navigate(`/sports/nascar/race/${race.id}`)}
                  className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 hover:bg-white/[0.08] cursor-pointer transition-colors group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-white group-hover:text-amber-400 transition-colors">
                        {race.name}
                      </h3>
                      <p className="text-sm text-white/40">{race.track}</p>
                    </div>
                    <span className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-400 text-xs font-medium">
                      {raceDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-xs text-white/40">View race odds →</span>
                    <ArrowRight className="h-4 w-4 text-white/30 group-hover:text-amber-400 transition-colors" />
                  </div>
                </div>
                  );
                })()
              ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* LIVE SNAPSHOT */}
        {/* ============================================================ */}
        <section>
          <SectionHeader
            icon={<Award className="h-5 w-5 text-amber-400" />}
            title="Live Snapshot"
            subtitle="Current provider metrics"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-4 text-center">
              <Trophy className="h-8 w-8 text-amber-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{standingRow?.wins ?? "N/A"}</p>
              <p className="text-xs text-white/40">Wins</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-center">
              <Flag className="h-8 w-8 text-cyan-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{standingRow?.starts ?? "N/A"}</p>
              <p className="text-xs text-white/40">Starts</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-center">
              <Zap className="h-8 w-8 text-violet-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{standingRow?.best_finish ?? "N/A"}</p>
              <p className="text-xs text-white/40">Best Finish</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-center">
              <Timer className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{standingRow?.last_result ?? "N/A"}</p>
              <p className="text-xs text-white/40">Last Result</p>
            </div>
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
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-sm text-white/40">{subtitle}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  const accentColors: Record<string, string> = {
    amber: "text-amber-400",
    cyan: "text-cyan-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
    red: "text-red-400",
    white: "text-white",
  };

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-center">
      <p className={`text-2xl font-bold ${accentColors[accent] || "text-white"}`}>{value}</p>
      <p className="text-xs text-white/40 mt-1">{label}</p>
    </div>
  );
}
