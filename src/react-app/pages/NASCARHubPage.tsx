import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Trophy, Calendar, Users, Sparkles, ChevronLeft, ChevronRight, 
  MessageSquare, Target, Flag, MapPin, Clock, Newspaper, ArrowRight, 
  Flame, TrendingUp, Zap, Activity
} from "lucide-react";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { extractProviderWinnerName, normalizeProviderRaceResults, normalizeNascarNameToken } from "@/react-app/lib/nascarResults";

// NASCAR TEAMS / MANUFACTURERS
// ============================================================
const MANUFACTURERS: Record<string, { color: string; bgColor: string }> = {
  "Chevrolet": { color: "#FFD700", bgColor: "from-yellow-500/20" },
  "Ford": { color: "#0066CC", bgColor: "from-blue-500/20" },
  "Toyota": { color: "#EB0A1E", bgColor: "from-red-500/20" },
};

// ============================================================
// NASCAR DRIVER DATABASE (current Cup Series)
// ============================================================
const NASCAR_DRIVERS: Record<string, { name: string; number: string; team: string; manufacturer: string }> = {
  "larson": { name: "Kyle Larson", number: "5", team: "Hendrick Motorsports", manufacturer: "Chevrolet" },
  "byron": { name: "William Byron", number: "24", team: "Hendrick Motorsports", manufacturer: "Chevrolet" },
  "elliott": { name: "Chase Elliott", number: "9", team: "Hendrick Motorsports", manufacturer: "Chevrolet" },
  "bowman": { name: "Alex Bowman", number: "48", team: "Hendrick Motorsports", manufacturer: "Chevrolet" },
  "hamlin": { name: "Denny Hamlin", number: "11", team: "Joe Gibbs Racing", manufacturer: "Toyota" },
  "truex": { name: "Martin Truex Jr.", number: "19", team: "Joe Gibbs Racing", manufacturer: "Toyota" },
  "bell": { name: "Christopher Bell", number: "20", team: "Joe Gibbs Racing", manufacturer: "Toyota" },
  "gibbs": { name: "Ty Gibbs", number: "54", team: "Joe Gibbs Racing", manufacturer: "Toyota" },
  "logano": { name: "Joey Logano", number: "22", team: "Team Penske", manufacturer: "Ford" },
  "blaney": { name: "Ryan Blaney", number: "12", team: "Team Penske", manufacturer: "Ford" },
  "cindric": { name: "Austin Cindric", number: "2", team: "Team Penske", manufacturer: "Ford" },
  "harvick": { name: "Kevin Harvick", number: "4", team: "Stewart-Haas Racing", manufacturer: "Ford" },
  "briscoe": { name: "Chase Briscoe", number: "14", team: "Stewart-Haas Racing", manufacturer: "Ford" },
  "busch": { name: "Kyle Busch", number: "8", team: "Richard Childress Racing", manufacturer: "Chevrolet" },
  "dillon": { name: "Austin Dillon", number: "3", team: "Richard Childress Racing", manufacturer: "Chevrolet" },
  "reddick": { name: "Tyler Reddick", number: "45", team: "23XI Racing", manufacturer: "Toyota" },
  "wallace": { name: "Bubba Wallace", number: "23", team: "23XI Racing", manufacturer: "Toyota" },
  "chastain": { name: "Ross Chastain", number: "1", team: "Trackhouse Racing", manufacturer: "Chevrolet" },
  "suarez": { name: "Daniel Suárez", number: "99", team: "Trackhouse Racing", manufacturer: "Chevrolet" },
  "keselowski": { name: "Brad Keselowski", number: "6", team: "RFK Racing", manufacturer: "Ford" },
};

// ============================================================
// NASCAR TRACKS DATABASE
// ============================================================
const NASCAR_TRACKS: Record<string, { name: string; location: string; type: string; length: string; laps: number }> = {
  "daytona": { name: "Daytona International Speedway", location: "Daytona Beach, FL", type: "Superspeedway", length: "2.5 mi", laps: 200 },
  "atlanta": { name: "Atlanta Motor Speedway", location: "Hampton, GA", type: "Superspeedway", length: "1.54 mi", laps: 260 },
  "lasvegas": { name: "Las Vegas Motor Speedway", location: "Las Vegas, NV", type: "Intermediate", length: "1.5 mi", laps: 267 },
  "phoenix": { name: "Phoenix Raceway", location: "Avondale, AZ", type: "Short Track", length: "1.0 mi", laps: 312 },
  "bristol": { name: "Bristol Motor Speedway", location: "Bristol, TN", type: "Short Track", length: "0.533 mi", laps: 500 },
  "cota": { name: "Circuit of the Americas", location: "Austin, TX", type: "Road Course", length: "3.41 mi", laps: 68 },
  "talladega": { name: "Talladega Superspeedway", location: "Lincoln, AL", type: "Superspeedway", length: "2.66 mi", laps: 188 },
  "dover": { name: "Dover Motor Speedway", location: "Dover, DE", type: "Short Track", length: "1.0 mi", laps: 400 },
  "kansas": { name: "Kansas Speedway", location: "Kansas City, KS", type: "Intermediate", length: "1.5 mi", laps: 267 },
  "charlotte": { name: "Charlotte Motor Speedway", location: "Concord, NC", type: "Intermediate", length: "1.5 mi", laps: 400 },
  "sonoma": { name: "Sonoma Raceway", location: "Sonoma, CA", type: "Road Course", length: "1.99 mi", laps: 110 },
  "nashville": { name: "Nashville Superspeedway", location: "Lebanon, TN", type: "Intermediate", length: "1.33 mi", laps: 300 },
  "michigan": { name: "Michigan International Speedway", location: "Brooklyn, MI", type: "Intermediate", length: "2.0 mi", laps: 200 },
  "indianapolis": { name: "Indianapolis Motor Speedway", location: "Indianapolis, IN", type: "Road Course", length: "2.439 mi", laps: 82 },
  "watkinsglen": { name: "Watkins Glen International", location: "Watkins Glen, NY", type: "Road Course", length: "2.45 mi", laps: 90 },
  "darlington": { name: "Darlington Raceway", location: "Darlington, SC", type: "Intermediate", length: "1.366 mi", laps: 367 },
  "martinsville": { name: "Martinsville Speedway", location: "Martinsville, VA", type: "Short Track", length: "0.526 mi", laps: 500 },
  "homestead": { name: "Homestead-Miami Speedway", location: "Homestead, FL", type: "Intermediate", length: "1.5 mi", laps: 267 },
};

const NASCAR_SEASON_YEAR = new Date().getFullYear();
const seasonDate = (monthDay: string) => `${NASCAR_SEASON_YEAR}-${monthDay}`;

// ============================================================
// MOCK DATA - NASCAR RACE SCHEDULE
// ============================================================
const RACE_SCHEDULE = [
  { id: "daytona500", name: "Daytona 500", track: "daytona", date: seasonDate("02-16"), time: "2:30 PM ET", status: "completed", winner: "larson" },
  { id: "atlanta1", name: "Ambetter Health 400", track: "atlanta", date: seasonDate("02-23"), time: "3:00 PM ET", status: "completed", winner: "byron" },
  { id: "phoenix1", name: "Shriners Children's 500", track: "phoenix", date: seasonDate("03-09"), time: "3:30 PM ET", status: "completed", winner: "bell" },
  { id: "lasvegas1", name: "Pennzoil 400", track: "lasvegas", date: seasonDate("03-15"), time: "3:30 PM ET", status: "completed", winner: "hamlin" },
  { id: "cota1", name: "EchoPark Automotive Grand Prix", track: "cota", date: seasonDate("03-23"), time: "3:30 PM ET", status: "completed", winner: "chastain" },
  { id: "martinsville1", name: "STP 500", track: "martinsville", date: seasonDate("03-30"), time: "2:00 PM ET", status: "upcoming" },
  { id: "talladega1", name: "GEICO 500", track: "talladega", date: seasonDate("04-06"), time: "3:00 PM ET", status: "upcoming" },
  { id: "bristol1", name: "Food City 500", track: "bristol", date: seasonDate("04-12"), time: "3:30 PM ET", status: "upcoming" },
  { id: "dover1", name: "Würth 400", track: "dover", date: seasonDate("04-13"), time: "2:00 PM ET", status: "upcoming" },
  { id: "kansas1", name: "AdventHealth 400", track: "kansas", date: seasonDate("04-20"), time: "3:00 PM ET", status: "upcoming" },
  { id: "darlington1", name: "Goodyear 400", track: "darlington", date: seasonDate("04-27"), time: "3:00 PM ET", status: "upcoming" },
  { id: "charlotte1", name: "Coca-Cola 600", track: "charlotte", date: seasonDate("05-25"), time: "6:00 PM ET", status: "upcoming" },
];

type RaceScheduleItem = {
  id: string;
  name: string;
  track: string;
  date: string;
  time: string;
  status: "completed" | "upcoming" | "live";
  winner?: string;
  track_name?: string;
  raceResults?: Array<{
    position: number;
    driverName: string;
    points: number | null;
    status?: string;
  }>;
};

type NascarStandingsApiRow = {
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
  standings: NascarStandingsApiRow[];
  coverage?: Record<string, boolean>;
  fallback_reason?: string | null;
};

type HubStandingRow = {
  rank: number;
  driverId: string | null;
  driverName: string;
  wins: number | null;
  top5: number | null;
  top10: number | null;
  points: number | null;
};

type HubLeaderRow = {
  driverId: string | null;
  driverName: string;
  value: number | null;
};

type LiveSnapshotRace = {
  game_id: string;
  status: string;
  start_time: string;
  venue: string;
  away_team_name: string;
  home_team_name: string;
  winner_name: string | null;
  race_results: Array<{
    position: number;
    driver_name: string;
    points: number | null;
    status?: string;
  }>;
};

function resolveDriverIdFromName(name: string): string | null {
  const target = normalizeNascarNameToken(name);
  if (!target) return null;
  const targetLast = target.split(" ").pop() || "";
  const match = Object.entries(NASCAR_DRIVERS).find(([, driver]) => {
    const full = normalizeNascarNameToken(driver.name);
    if (full === target) return true;
    const fullLast = full.split(" ").pop() || "";
    return Boolean(targetLast && fullLast && targetLast === fullLast);
  });
  return match?.[0] || null;
}

function getEtDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value || "0");
  const month = Number(parts.find((p) => p.type === "month")?.value || "0");
  const day = Number(parts.find((p) => p.type === "day")?.value || "0");
  return year * 10000 + month * 100 + day;
}

function getLocalDayNumber(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return year * 10000 + month * 100 + day;
}

function getReferenceDayNumber(now: Date): number {
  return Math.max(getEtDayNumber(now), getLocalDayNumber(now));
}

function parseDayNumber(input: string | undefined): number | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  m = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if (m) return Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]);
  m = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+.*)?$/);
  if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  if (/^\d{10}$/.test(trimmed)) return getEtDayNumber(new Date(Number(trimmed) * 1000));
  if (/^\d{13}$/.test(trimmed)) return getEtDayNumber(new Date(Number(trimmed)));
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return null;
  return getEtDayNumber(dt);
}

function parseStartDate(input: string | undefined): Date | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;
  const isoLike = new Date(trimmed.replace(" ", "T"));
  if (!Number.isNaN(isoLike.getTime())) return isoLike;
  return null;
}

function toRaceStatus(
  status: string | undefined,
  startTime?: string,
  dateHint?: string,
  homeScore?: number | null,
  awayScore?: number | null
): "completed" | "upcoming" | "live" {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "FINAL") return "completed";
  if (normalized === "IN_PROGRESS" || normalized === "LIVE") return "live";
  const hasScoreData = Number.isFinite(Number(homeScore)) || Number.isFinite(Number(awayScore));
  if (hasScoreData && normalized !== "SCHEDULED" && normalized !== "NOT_STARTED") return "completed";

  const eventDay = parseDayNumber(startTime) ?? parseDayNumber(dateHint);
  const todayDay = getReferenceDayNumber(new Date());
  if (eventDay != null && eventDay < todayDay) return "completed";

  // Provider feeds can lag status flips; if same-day start time is well in the past, treat as completed.
  if (startTime && eventDay != null && eventDay === todayDay) {
    const parsedStart = parseStartDate(startTime);
    if (parsedStart) {
      const startMs = parsedStart.getTime();
      const hoursSinceStart = (Date.now() - startMs) / (1000 * 60 * 60);
      if (hoursSinceStart >= 8) return "completed";
    }
  }
  return "upcoming";
}

function formatRaceTime(startTime: string | undefined): string {
  if (!startTime) return "TBD";
  const date = parseStartDate(startTime);
  if (!date) return "TBD";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  }) + " ET";
}

function formatRaceDate(startTime: string | undefined): string {
  if (!startTime) return seasonDate("01-01");
  const date = parseStartDate(startTime);
  if (!date) return seasonDate("01-01");
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/New_York",
  });
}

function parseYmdForDisplay(dateText: string): Date {
  const match = String(dateText || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(`${dateText}T12:00:00`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, month, day, 12, 0, 0, 0);
}

function deriveFallbackRaceStatus(date: string): "completed" | "upcoming" {
  const eventDay = parseDayNumber(date);
  if (eventDay == null) return "upcoming";
  return eventDay < getReferenceDayNumber(new Date()) ? "completed" : "upcoming";
}

function resolveTrackFromVenue(venue: string | undefined): { key: string; name?: string } {
  const normalized = String(venue || "").toLowerCase().trim();
  if (!normalized) return { key: "daytona" };
  const found = Object.entries(NASCAR_TRACKS).find(([, track]) =>
    normalized.includes(track.name.toLowerCase().split(" ")[0])
    || track.name.toLowerCase().includes(normalized)
  );
  if (found) return { key: found[0] };
  return { key: "daytona", name: venue };
}

function mapApiGameToRace(game: any): RaceScheduleItem {
  const id = String(game?.id || game?.game_id || "");
  const venue = String(game?.venue || "").trim();
  const { key, name } = resolveTrackFromVenue(venue);
  const away = String(game?.away_team_name || game?.away_team_code || "Away");
  const home = String(game?.home_team_name || game?.home_team_code || "Home");
  const raceName = venue || `${away} vs ${home}`;
  const parsedHomeScore = Number(game?.home_score);
  const parsedAwayScore = Number(game?.away_score);
  const homeScore = Number.isFinite(parsedHomeScore) ? parsedHomeScore : null;
  const awayScore = Number.isFinite(parsedAwayScore) ? parsedAwayScore : null;
  const status = toRaceStatus(
    game?.status,
    game?.start_time,
    game?.scheduled || game?.date || game?.startDate,
    homeScore,
    awayScore
  );
  const date = formatRaceDate(game?.start_time);
  const time = formatRaceTime(game?.start_time);
  const raceResults = normalizeProviderRaceResults(game?.race_results);

  let winner: string | undefined;
  if (status === "completed") {
    const raceResults = normalizeProviderRaceResults(game?.race_results);
    const winnerName = extractProviderWinnerName(game, raceResults);
    winner = resolveDriverIdFromName(winnerName) || undefined;
  }

  return {
    id,
    name: raceName,
    track: key,
    track_name: name,
    date,
    time,
    status,
    winner,
    raceResults: raceResults.length > 0 ? raceResults : undefined,
  };
}

function makeRaceMergeKey(race: RaceScheduleItem): string {
  const id = String(race.id || "").trim();
  if (id) return `id:${id}`;
  return `td:${race.track}:${race.date}`;
}

function mergeLiveRaceWithFallback(liveRace: RaceScheduleItem, fallbackRace?: RaceScheduleItem): RaceScheduleItem {
  if (!fallbackRace) return liveRace;
  const keepLiveWinner = liveRace.status !== "completed" || Boolean(liveRace.winner);
  return {
    ...fallbackRace,
    ...liveRace,
    winner: keepLiveWinner ? liveRace.winner : fallbackRace.winner,
  };
}

// ============================================================
// MOCK DATA - DRIVER STANDINGS
// ============================================================
const DRIVER_STANDINGS = [
  { id: "larson", wins: 2, top5: 5, top10: 6, points: 312, behind: "-" },
  { id: "byron", wins: 1, top5: 4, top10: 5, points: 285, behind: "-27" },
  { id: "hamlin", wins: 1, top5: 4, top10: 6, points: 278, behind: "-34" },
  { id: "bell", wins: 1, top5: 3, top10: 5, points: 265, behind: "-47" },
  { id: "elliott", wins: 0, top5: 3, top10: 5, points: 248, behind: "-64" },
  { id: "chastain", wins: 1, top5: 2, top10: 4, points: 235, behind: "-77" },
  { id: "blaney", wins: 0, top5: 3, top10: 4, points: 228, behind: "-84" },
  { id: "logano", wins: 0, top5: 2, top10: 4, points: 218, behind: "-94" },
  { id: "reddick", wins: 0, top5: 2, top10: 3, points: 205, behind: "-107" },
  { id: "truex", wins: 0, top5: 2, top10: 3, points: 198, behind: "-114" },
  { id: "busch", wins: 0, top5: 1, top10: 4, points: 192, behind: "-120" },
  { id: "briscoe", wins: 0, top5: 1, top10: 3, points: 178, behind: "-134" },
  { id: "suarez", wins: 0, top5: 1, top10: 3, points: 172, behind: "-140" },
  { id: "keselowski", wins: 0, top5: 1, top10: 2, points: 165, behind: "-147" },
  { id: "wallace", wins: 0, top5: 0, top10: 2, points: 148, behind: "-164" },
];

// ============================================================
// MOCK DATA - RACE LEADERS
// ============================================================
const RACE_LEADERS = {
  wins: [
    { id: "larson", value: 2 },
    { id: "byron", value: 1 },
    { id: "hamlin", value: 1 },
    { id: "bell", value: 1 },
    { id: "chastain", value: 1 },
  ],
  top5: [
    { id: "larson", value: 5 },
    { id: "byron", value: 4 },
    { id: "hamlin", value: 4 },
    { id: "elliott", value: 3 },
    { id: "blaney", value: 3 },
  ],
  top10: [
    { id: "larson", value: 6 },
    { id: "hamlin", value: 6 },
    { id: "byron", value: 5 },
    { id: "bell", value: 5 },
    { id: "elliott", value: 5 },
  ],
  lapsLed: [
    { id: "larson", value: 412 },
    { id: "byron", value: 285 },
    { id: "hamlin", value: 198 },
    { id: "bell", value: 156 },
    { id: "logano", value: 124 },
  ],
  avgFinish: [
    { id: "larson", value: 4.2 },
    { id: "byron", value: 6.8 },
    { id: "hamlin", value: 7.1 },
    { id: "bell", value: 8.4 },
    { id: "elliott", value: 9.2 },
  ],
};

// ============================================================
// MOCK DATA - STORYLINES
// ============================================================
const STORYLINES = [
  {
    id: "1",
    headline: "Larson's Hot Start: Two Wins in Six Races",
    summary: "Kyle Larson capturing early season momentum with dominant performances",
    coachNote: "Hendrick cars showing championship pace. Larson top-5 props looking solid.",
    hot: true,
  },
  {
    id: "2",
    headline: "Toyota's Superspeedway Struggles",
    summary: "Joe Gibbs Racing searching for answers at restrictor plate tracks",
    coachNote: "Fade Toyota drivers at Talladega. They've been running mid-pack.",
    hot: false,
  },
  {
    id: "3",
    headline: "Rookie Watch: Ty Gibbs Making Moves",
    summary: "Second-year driver showing improved consistency this season",
    coachNote: "Gibbs top-10 props at plus money are sneaky value.",
    hot: true,
  },
  {
    id: "4",
    headline: "Short Track Season Approaching",
    summary: "Martinsville and Bristol on deck favor different skill sets",
    coachNote: "Watch for Hamlin and Truex at Martinsville - masters of the paperclip.",
    hot: false,
  },
  {
    id: "5",
    headline: "Playoff Picture Taking Shape",
    summary: "Six race winners already locked in with 20 races remaining",
    coachNote: "Winless drivers getting desperate - expect more aggressive racing.",
    hot: false,
  },
];

// ============================================================
// COACH G NASCAR INSIGHTS
// ============================================================
const COACH_G_INSIGHTS = [
  "Hendrick looking fast this weekend. Back the Chevy boys.",
  "Track position is everything at short tracks. Watch qualifying.",
  "Toyota teams struggling on restarts - fade them in H2H matchups.",
  "Larson dominating intermediate tracks. Points or positions, he's the play.",
  "Weather forecast could shake up the field. Stay flexible.",
];

function pickDeterministicInsight(items: string[]): string {
  if (items.length === 0) return "";
  const daySeed = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return items[daySeed % items.length];
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function NASCARHubPage() {
  const navigate = useNavigate();
  const [heroIndex, setHeroIndex] = useState(0);
  const [leaderTab, setLeaderTab] = useState<keyof typeof RACE_LEADERS>("wins");
  const [liveSchedule, setLiveSchedule] = useState<RaceScheduleItem[] | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveSnapshotRace | null>(null);
  const [liveFeedSource, setLiveFeedSource] = useState<string>("unknown");
  const [liveFeedTimestamp, setLiveFeedTimestamp] = useState<string | null>(null);
  const [liveStandings, setLiveStandings] = useState<NascarStandingsPayload | null>(null);
  const fallbackSchedule = useMemo(
    () =>
      (RACE_SCHEDULE as RaceScheduleItem[]).map((race) => {
        const status = deriveFallbackRaceStatus(race.date);
        return {
          ...race,
          status,
          winner: status === "completed" ? race.winner : undefined,
        };
      }),
    []
  );
  const raceSchedule: RaceScheduleItem[] = useMemo(() => {
    if (!liveSchedule || liveSchedule.length === 0) return fallbackSchedule;
    const fallbackByKey = new Map(fallbackSchedule.map((race) => [makeRaceMergeKey(race), race]));
    const merged: RaceScheduleItem[] = [];
    const usedFallbackKeys = new Set<string>();

    for (const liveRace of liveSchedule) {
      const liveKey = makeRaceMergeKey(liveRace);
      const fallbackMatch = fallbackByKey.get(liveKey);
      if (fallbackMatch) usedFallbackKeys.add(liveKey);
      merged.push(mergeLiveRaceWithFallback(liveRace, fallbackMatch));
    }

    for (const fallbackRace of fallbackSchedule) {
      const key = makeRaceMergeKey(fallbackRace);
      if (!usedFallbackKeys.has(key)) merged.push(fallbackRace);
    }

    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [fallbackSchedule, liveSchedule]);

  useEffect(() => {
    let active = true;
    const loadSchedule = async () => {
      try {
        if (document.hidden) return;
        const res = await fetch("/api/games?sport=nascar", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const games = Array.isArray(data?.games) ? data.games : [];
        if (!active || games.length === 0) return;
        const mapped = games
          .map(mapApiGameToRace)
          .filter((race) => race.id.length > 0)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const incompleteFinals = mapped.filter((race) => race.status === "completed" && !race.winner);
        if (incompleteFinals.length > 0) {
          console.warn("[NASCAR][validation] Completed races missing winner in hub payload", {
            count: incompleteFinals.length,
            raceIds: incompleteFinals.map((race) => race.id),
          });
        }
        if (mapped.length > 0) {
          setLiveSchedule(mapped);
          setLiveFeedSource(String(data?.provider || "unknown"));
          setLiveFeedTimestamp(new Date().toISOString());
        }
      } catch {
        // Keep static season data if live fetch fails.
      }
    };
    void loadSchedule();
    const pollId = window.setInterval(() => {
      void loadSchedule();
    }, 180000);
    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;
    let currentDelayMs = 30000;
    const loadLiveSnapshot = async () => {
      try {
        if (document.hidden) return true;
        const res = await fetch("/api/games/nascar/live-snapshot", { cache: "no-store" });
        if (!res.ok) return false;
        const data = await res.json();
        if (!active) return false;
        setLiveSnapshot(data?.live || null);
        setLiveFeedSource(String(data?.source || "unknown"));
        setLiveFeedTimestamp(typeof data?.generated_at === "string" ? data.generated_at : new Date().toISOString());
        return true;
      } catch {
        // Keep previous live snapshot state.
        return false;
      }
    };
    const scheduleNext = (wasSuccessful: boolean) => {
      if (!active) return;
      currentDelayMs = wasSuccessful ? 30000 : Math.min(currentDelayMs * 2, 180000);
      timeoutId = window.setTimeout(async () => {
        const ok = await loadLiveSnapshot();
        scheduleNext(ok);
      }, currentDelayMs);
    };
    void loadLiveSnapshot().then((ok) => scheduleNext(ok));
    return () => {
      active = false;
      if (timeoutId != null) window.clearTimeout(timeoutId);
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
          coverage: data?.coverage || undefined,
          fallback_reason: data?.fallback_reason || null,
        });
      } catch {
        // Keep static standings fallback.
      }
    };
    void loadStandings();
    return () => {
      active = false;
    };
  }, []);

  // Get completed races (most recent first)
  const completedRaces = useMemo(() => {
    return raceSchedule.filter(r => r.status === "completed").reverse();
  }, [raceSchedule]);

  // Featured races for carousel
  const snapshotLiveRaceItem = useMemo<RaceScheduleItem | null>(() => {
    if (!liveSnapshot) return null;
    const venueName = String(liveSnapshot.venue || "").trim();
    const fallbackName = `${liveSnapshot.away_team_name || "Away"} vs ${liveSnapshot.home_team_name || "Home"}`;
    const date = formatRaceDate(liveSnapshot.start_time);
    const time = formatRaceTime(liveSnapshot.start_time);
    const trackInfo = resolveTrackFromVenue(venueName);
    const winnerId = resolveDriverIdFromName(String(liveSnapshot.winner_name || ""));
    return {
      id: liveSnapshot.game_id,
      name: venueName || fallbackName,
      track: trackInfo.key,
      track_name: trackInfo.name,
      date,
      time,
      status: "live",
      winner: winnerId || undefined,
      raceResults: (liveSnapshot.race_results || []).map((row) => ({
        position: row.position,
        driverName: row.driver_name,
        points: row.points,
        status: row.status,
      })),
    };
  }, [liveSnapshot]);

  const featuredRaces = useMemo(() => {
    if (snapshotLiveRaceItem) return [snapshotLiveRaceItem];
    const live = raceSchedule.filter(r => r.status === "live").slice(0, 1);
    if (live.length > 0) return live;
    const upcoming = raceSchedule.filter(r => r.status === "upcoming").slice(0, 3);
    return upcoming.length > 0 ? upcoming : completedRaces.slice(0, 3);
  }, [completedRaces, raceSchedule, snapshotLiveRaceItem]);
  const liveRace = useMemo(
    () => snapshotLiveRaceItem || raceSchedule.find((race) => race.status === "live") || null,
    [raceSchedule, snapshotLiveRaceItem]
  );
  const liveTopRows = useMemo(() => {
    if (!liveRace?.raceResults?.length) return [];
    return [...liveRace.raceResults]
      .filter((row) => Number.isFinite(Number(row.position)))
      .sort((a, b) => Number(a.position) - Number(b.position))
      .slice(0, 5);
  }, [liveRace?.raceResults]);

  const standingsRows: HubStandingRow[] = useMemo(() => {
    if (liveStandings?.standings && liveStandings.standings.length > 0) {
      return liveStandings.standings.slice(0, 15).map((row) => ({
        rank: row.rank,
        driverId: resolveDriverIdFromName(row.driver_name),
        driverName: row.driver_name,
        wins: row.wins,
        top5: row.top5,
        top10: row.top10,
        points: row.points,
      }));
    }

    return DRIVER_STANDINGS.slice(0, 15).map((row, idx) => ({
      rank: idx + 1,
      driverId: row.id,
      driverName: NASCAR_DRIVERS[row.id]?.name || row.id,
      wins: row.wins,
      top5: row.top5,
      top10: row.top10,
      points: row.points,
    }));
  }, [liveStandings]);

  const leaderRows: HubLeaderRow[] = useMemo(() => {
    const coverage = liveStandings?.coverage || {};
    const byMetric = {
      wins: { key: "wins", covered: true },
      top5: { key: "top5", covered: Boolean(coverage.top5) },
      top10: { key: "top10", covered: Boolean(coverage.top10) },
      lapsLed: { key: "laps_led", covered: Boolean(coverage.laps_led) },
      avgFinish: { key: "avg_finish", covered: Boolean(coverage.avg_finish) },
    } as const;

    const selected = byMetric[leaderTab];

    if (liveStandings?.standings?.length && selected.covered) {
      const rows = [...liveStandings.standings]
        .filter((row) => {
          const value = (row as any)[selected.key];
          return value != null && Number.isFinite(Number(value));
        })
        .sort((a, b) => {
          const left = Number((a as any)[selected.key] ?? 0);
          const right = Number((b as any)[selected.key] ?? 0);
          return leaderTab === "avgFinish" ? left - right : right - left;
        })
        .slice(0, 5)
        .map((row) => ({
          driverId: resolveDriverIdFromName(row.driver_name),
          driverName: row.driver_name,
          value: Number((row as any)[selected.key]),
        }));

      if (rows.length > 0) return rows;
    }

    return RACE_LEADERS[leaderTab].map((leader) => {
      const driver = NASCAR_DRIVERS[leader.id];
      return {
        driverId: leader.id,
        driverName: driver?.name || leader.id,
        value: Number(leader.value),
      };
    });
  }, [leaderTab, liveStandings]);

  const leaderTabLabelMap: Record<keyof typeof RACE_LEADERS, string> = {
    wins: "Wins",
    top5: "Top 5",
    top10: "Top 10",
    lapsLed: "Laps Led",
    avgFinish: "Avg Finish",
  };

  // Random Coach G insight
  const randomInsight = useMemo(() => pickDeterministicInsight(COACH_G_INSIGHTS), []);

  // Hero navigation
  const prevHero = () => setHeroIndex((i) => (i - 1 + featuredRaces.length) % featuredRaces.length);
  const nextHero = () => setHeroIndex((i) => (i + 1) % featuredRaces.length);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0d1117] to-[#0a0a0a]">
      {/* ============================================================ */}
      {/* SECTION 1: FEATURED RACE HERO */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-red-500/5" />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <span className="text-xl">🏁</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">NASCAR Command Center</h1>
                <p className="text-white/50 text-sm">Race weekend intel & betting insights</p>
              </div>
            </div>
          </div>

          {featuredRaces.length > 0 ? (
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={heroIndex}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                >
                  <FeaturedRaceCard 
                    race={featuredRaces[heroIndex]} 
                    onOpen={() => navigate(`/sports/nascar/race/${featuredRaces[heroIndex].id}`)} 
                  />
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              {featuredRaces.length > 1 && (
                <>
                  <button 
                    onClick={prevHero} 
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={nextHero} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="flex justify-center gap-2 mt-4">
                    {featuredRaces.map((_, i) => (
                      <button 
                        key={i} 
                        onClick={() => setHeroIndex(i)} 
                        className={`w-2 h-2 rounded-full transition-all ${i === heroIndex ? "bg-amber-400 w-6" : "bg-white/30"}`} 
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="h-48 rounded-2xl border border-white/10 bg-white/[0.02] flex items-center justify-center">
              <p className="text-white/40">No upcoming races</p>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-8">
        {liveRace && (
          <section>
            <SectionHeader
              icon={<Activity className="h-5 w-5 text-red-300" />}
              title="Live Race Now"
              subtitle="Real-time running order from provider feed"
            />
            <div className="rounded-2xl border border-red-500/25 bg-gradient-to-br from-red-500/10 to-transparent p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wide">Now Live</p>
                  <p className="text-lg font-bold text-white">{liveRace.name}</p>
                  <p className="text-sm text-white/50">{liveRace.track_name || NASCAR_TRACKS[liveRace.track]?.name}</p>
                </div>
                <div className="text-right text-xs text-white/50">
                  <p>Feed: {liveFeedSource.toUpperCase()}</p>
                  <p>Updated: {liveFeedTimestamp ? new Date(liveFeedTimestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"}</p>
                </div>
              </div>

              {liveTopRows.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                        <th className="text-left py-3 px-4">Pos</th>
                        <th className="text-left px-4">Driver</th>
                        <th className="text-center px-4">Pts</th>
                        <th className="text-center px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveTopRows.map((row) => (
                        <tr key={`${row.position}-${row.driverName}`} className="border-t border-white/5">
                          <td className="py-3 px-4 font-bold text-white">{row.position}</td>
                          <td className="px-4 text-white">{row.driverName}</td>
                          <td className="text-center px-4 text-white/70">{row.points ?? "-"}</td>
                          <td className="text-center px-4 text-white/60">{row.status || "Running"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
                  Live race is active, but running-order rows are still syncing from the provider payload.
                </div>
              )}

              <div className="mt-4">
                <button
                  onClick={() => navigate(`/sports/nascar/race/${liveRace.id}`)}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  Open Live Race Detail
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* SECTION 2: COACH G NASCAR INTEL */}
        {/* ============================================================ */}
        <section>
          <SectionHeader 
            icon={<Sparkles className="h-5 w-5 text-violet-400" />} 
            title="Coach G NASCAR Intel" 
            subtitle="Race weekend insights" 
          />
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent p-5">
            <div className="flex items-start gap-4">
              <CoachGAvatar size="md" presence="monitoring" className="border-violet-400/35" />
              <div className="flex-1">
                <p className="text-white text-lg font-medium mb-3">"{randomInsight}"</p>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => navigate("/scout?q=NASCAR race predictions this weekend")} 
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/30 transition-colors flex items-center gap-2"
                  >
                    <Target className="h-4 w-4" />
                    Race Predictions
                  </button>
                  <button 
                    onClick={() => navigate("/scout?q=NASCAR track trends and history")} 
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Track Trends
                  </button>
                  <button 
                    onClick={() => navigate("/scout?q=best NASCAR bets this week")} 
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    Best Bets
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
        {/* SECTION 3: RACE SCHEDULE */}
        {/* ============================================================ */}
        <section>
          <SectionHeader 
            icon={<Calendar className="h-5 w-5 text-cyan-400" />} 
            title="Race Schedule" 
            subtitle={`${NASCAR_SEASON_YEAR} NASCAR Cup Series`} 
          />
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
            <div className="divide-y divide-white/5">
              {raceSchedule.slice(0, 8).map((race) => (
                <RaceScheduleRow 
                  key={race.id} 
                  race={race} 
                  onClick={() => navigate(`/sports/nascar/race/${race.id}`)} 
                />
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 4: DRIVER STANDINGS */}
        {/* ============================================================ */}
        <section>
          <SectionHeader 
            icon={<Trophy className="h-5 w-5 text-amber-400" />} 
            title="Driver Standings" 
            subtitle={`${NASCAR_SEASON_YEAR} Cup Series Points`} 
          />
          {liveStandings?.fallback_reason && (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              {liveStandings.fallback_reason}
            </div>
          )}
          {liveStandings?.coverage && (!liveStandings.coverage.top5 || !liveStandings.coverage.top10 || !liveStandings.coverage.points) && (
            <div className="mb-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-300">
              NASCAR standings live feed is connected. Top-5, Top-10, and points fields are still syncing from provider coverage.
            </div>
          )}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                    <th className="text-left py-3 px-4">Rank</th>
                    <th className="text-left px-2">Driver</th>
                    <th className="text-center px-2">Wins</th>
                    <th className="text-center px-2">Top 5</th>
                    <th className="text-center px-2">Top 10</th>
                    <th className="text-center px-2">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {standingsRows.map((row, i) => {
                    const driver = row.driverId ? NASCAR_DRIVERS[row.driverId] : undefined;
                    const mfr = MANUFACTURERS[driver?.manufacturer || ""];
                    const rowClickable = Boolean(row.driverId);
                    return (
                      <tr 
                        key={`${row.driverId || row.driverName}-${row.rank}`}
                        onClick={() => {
                          if (row.driverId) navigate(`/sports/nascar/driver/${row.driverId}`);
                        }}
                        className={`border-t border-white/5 transition-colors ${rowClickable ? "hover:bg-white/5 cursor-pointer" : ""}`}
                      >
                        <td className="py-3 px-4">
                          <span className={`font-bold ${i < 3 ? "text-amber-400" : "text-white/60"}`}>
                            {row.rank}
                          </span>
                        </td>
                        <td className="px-2">
                          <div className="flex items-center gap-3">
                            <div 
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br ${mfr?.bgColor || "from-white/20"} to-transparent border border-white/10`}
                            >
                              {driver?.number ? `#${driver.number}` : "--"}
                            </div>
                            <div>
                              <p className="font-medium text-white">{driver?.name || row.driverName}</p>
                              <p className="text-xs text-white/40">{driver?.team || "Live provider driver"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center">
                          <span className={(row.wins || 0) > 0 ? "text-emerald-400 font-bold" : "text-white/60"}>
                            {row.wins ?? "-"}
                          </span>
                        </td>
                        <td className="text-center text-white/70">{row.top5 ?? "-"}</td>
                        <td className="text-center text-white/70">{row.top10 ?? "-"}</td>
                        <td className="text-center font-bold text-amber-400">{row.points ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 5: RACE LEADERS */}
        {/* ============================================================ */}
        <section>
          <SectionHeader 
            icon={<Users className="h-5 w-5 text-cyan-400" />} 
            title="Race Leaders" 
            subtitle="Season statistics" 
          />
          {liveStandings?.coverage && !liveStandings.coverage[leaderTab === "lapsLed" ? "laps_led" : leaderTab === "avgFinish" ? "avg_finish" : leaderTab] && (
            <div className="mb-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-300">
              {leaderTabLabelMap[leaderTab]} metric is syncing from NASCAR provider coverage. Showing fallback leaderboard until live metric is available.
            </div>
          )}
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {[
                { key: "wins", label: "Wins" },
                { key: "top5", label: "Top 5" },
                { key: "top10", label: "Top 10" },
                { key: "lapsLed", label: "Laps Led" },
                { key: "avgFinish", label: "Avg Finish" },
              ].map((tab) => (
                <button 
                  key={tab.key} 
                  onClick={() => setLeaderTab(tab.key as keyof typeof RACE_LEADERS)} 
                  className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                    leaderTab === tab.key 
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" 
                      : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Leaders Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {leaderRows.map((leader, i) => {
                const driver = leader.driverId ? NASCAR_DRIVERS[leader.driverId] : undefined;
                const mfr = MANUFACTURERS[driver?.manufacturer || ""];
                return (
                  <div 
                    key={`${leader.driverId || leader.driverName}-${leaderTab}-${i}`}
                    onClick={() => {
                      if (leader.driverId) navigate(`/sports/nascar/driver/${leader.driverId}`);
                    }}
                    className={`rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 transition-colors ${leader.driverId ? "hover:bg-white/[0.08] cursor-pointer" : ""}`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-amber-500 text-black" : "bg-white/10 text-white/70"}`}>
                        {i + 1}
                      </div>
                      <div 
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br ${mfr?.bgColor || "from-white/20"} to-transparent border border-white/10`}
                      >
                        {driver?.number ? `#${driver.number}` : "--"}
                      </div>
                    </div>
                    <p className="font-medium text-white truncate">{driver?.name || leader.driverName}</p>
                    <p className="text-xs text-white/40 truncate mb-2">{driver?.team || "Live provider driver"}</p>
                    <p className="text-2xl font-bold text-amber-400">
                      {leader.value == null ? "-" : leaderTab === "avgFinish" ? leader.value.toFixed(1) : leader.value}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 6: RECENT RACE RESULTS */}
        {/* ============================================================ */}
        <section>
          <SectionHeader 
            icon={<Flag className="h-5 w-5 text-emerald-400" />} 
            title="Recent Results" 
            subtitle="Latest race winners" 
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completedRaces.slice(0, 6).map((race) => {
              const track = NASCAR_TRACKS[race.track];
              const winner = NASCAR_DRIVERS[race.winner || ""];
              const mfr = MANUFACTURERS[winner?.manufacturer || ""];
              return (
                <div 
                  key={race.id}
                  onClick={() => navigate(`/sports/nascar/race/${race.id}`)}
                  className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 hover:bg-white/[0.08] cursor-pointer transition-colors group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-white group-hover:text-amber-400 transition-colors">
                        {race.name}
                      </h3>
                      <p className="text-sm text-white/40">{track?.name}</p>
                    </div>
                    <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                      FINAL
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                    {winner ? (
                      <>
                        <div 
                          className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br ${mfr?.bgColor || "from-white/20"} to-transparent border border-white/10`}
                        >
                          #{winner.number}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-emerald-400">Winner</p>
                          <p className="font-medium text-white">{winner.name}</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-white/50">Final result posted. Winner syncing from live feed.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 7: STORYLINES */}
        {/* ============================================================ */}
        <section>
          <SectionHeader 
            icon={<Newspaper className="h-5 w-5 text-amber-400" />} 
            title="NASCAR Storylines" 
            subtitle="What's trending in racing" 
          />
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

function FeaturedRaceCard({ race, onOpen }: { race: RaceScheduleItem; onOpen: () => void }) {
  const track = NASCAR_TRACKS[race.track];
  const isCompleted = race.status === "completed";
  const isLive = race.status === "live";
  const winner = isCompleted && race.winner ? NASCAR_DRIVERS[race.winner] : null;
  const raceDate = new Date(`${race.date}T12:00:00`);
  const raceDateLabel = Number.isNaN(raceDate.getTime())
    ? race.date
    : raceDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-white/[0.05] to-transparent p-6 backdrop-blur-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {isCompleted ? (
              <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                COMPLETED
              </span>
            ) : isLive ? (
              <span className="px-2 py-1 rounded-md bg-red-500/20 text-red-300 text-xs font-medium animate-pulse">
                LIVE NOW
              </span>
            ) : (
              <span className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-400 text-xs font-medium animate-pulse">
                NEXT RACE
              </span>
            )}
            <span className="text-white/40 text-sm">{track?.type}</span>
          </div>
          
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">{race.name}</h2>
          
          <div className="flex flex-wrap items-center gap-4 text-white/60 text-sm mb-4">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {race.track_name || track?.name}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {raceDateLabel} • {race.time}
            </span>
            <span className="flex items-center gap-1.5">
              <Flag className="h-4 w-4" />
              {track?.laps} laps • {track?.length}
            </span>
          </div>

          {winner && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <Trophy className="h-5 w-5 text-amber-400" />
              <span className="text-emerald-400 font-medium">Winner: {winner.name}</span>
              <span className="text-white/40">#{winner.number} • {winner.team}</span>
            </div>
          )}

          <button 
            onClick={onOpen}
            className="flex items-center gap-2 px-6 py-3 min-h-[48px] rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors"
          >
            View Race
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Track visualization */}
        <div className="w-32 h-32 lg:w-40 lg:h-40 rounded-2xl bg-gradient-to-br from-amber-500/20 to-transparent border border-amber-500/30 flex items-center justify-center">
          <span className="text-6xl lg:text-7xl">🏁</span>
        </div>
      </div>
    </div>
  );
}

function RaceScheduleRow({ race, onClick }: { race: RaceScheduleItem; onClick: () => void }) {
  const track = NASCAR_TRACKS[race.track];
  const isCompleted = race.status === "completed";
  const isLive = race.status === "live";
  const winner = isCompleted && race.winner ? NASCAR_DRIVERS[race.winner] : null;
  const raceDate = parseYmdForDisplay(race.date);

  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between gap-4 p-4 hover:bg-white/5 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-12 text-center">
          <p className="text-xs text-white/40 uppercase">
            {raceDate.toLocaleDateString("en-US", { month: "short" })}
          </p>
          <p className="text-lg font-bold text-white">
            {raceDate.getDate()}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white truncate">{race.name}</h3>
          <p className="text-sm text-white/40 truncate">{race.track_name || track?.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isCompleted && winner ? (
          <div className="text-right">
            <p className="text-xs text-emerald-400">Winner</p>
            <p className="text-sm font-medium text-white">{winner.name}</p>
          </div>
        ) : (
          <span className="text-sm text-white/40">{race.time}</span>
        )}
        <span className={`px-2 py-1 rounded-md text-xs font-medium ${
          isCompleted
            ? "bg-emerald-500/20 text-emerald-400" 
            : isLive
              ? "bg-red-500/20 text-red-300"
              : "bg-amber-500/20 text-amber-400"
        }`}>
          {isCompleted ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
        </span>
        <ArrowRight className="h-4 w-4 text-white/30" />
      </div>
    </div>
  );
}

function StorylineCard({ story }: { story: typeof STORYLINES[0] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 hover:bg-white/[0.08] transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-white">{story.headline}</h3>
        {story.hot && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs">
            <Flame className="h-3 w-3" />
            Hot
          </span>
        )}
      </div>
      <p className="text-sm text-white/50 mb-3">{story.summary}</p>
      {story.coachNote && (
        <div className="flex items-start gap-2 pt-3 border-t border-white/5">
          <CoachGAvatar size="xs" presence="monitoring" className="h-6 w-6 rounded-full border-0" />
          <p className="text-xs text-violet-300 italic">"{story.coachNote}"</p>
        </div>
      )}
    </div>
  );
}
