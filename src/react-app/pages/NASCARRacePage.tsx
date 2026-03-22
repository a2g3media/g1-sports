import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Trophy, ChevronLeft, Flag, TrendingUp, Target, Zap, MessageSquare,
  MapPin, Clock, Gauge, Award, ArrowRight, Cloud, Thermometer
} from "lucide-react";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { deriveUnifiedViewMode, UnifiedLiveSignalStrip, UnifiedVideoPanel } from "@/react-app/components/game-state/StateModePanels";
import { extractProviderWinnerName, hasVerifiedNascarRaceResults, normalizeNascarNameToken, normalizeProviderRaceResults } from "@/react-app/lib/nascarResults";

// ============================================================
// NASCAR MANUFACTURERS
// ============================================================
const MANUFACTURERS: Record<string, { color: string; bgColor: string }> = {
  "Chevrolet": { color: "#FFD700", bgColor: "from-yellow-500/20" },
  "Ford": { color: "#0066CC", bgColor: "from-blue-500/20" },
  "Toyota": { color: "#EB0A1E", bgColor: "from-red-500/20" },
};

// ============================================================
// NASCAR DRIVER DATABASE
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
const NASCAR_TRACKS: Record<string, { 
  name: string; 
  location: string; 
  type: string; 
  length: string; 
  laps: number;
  banking?: string;
  surface?: string;
  recordHolder?: string;
  recordTime?: string;
}> = {
  "daytona": { name: "Daytona International Speedway", location: "Daytona Beach, FL", type: "Superspeedway", length: "2.5 mi", laps: 200, banking: "31°", surface: "Asphalt", recordHolder: "Bill Elliott", recordTime: "210.364 mph" },
  "atlanta": { name: "Atlanta Motor Speedway", location: "Hampton, GA", type: "Superspeedway", length: "1.54 mi", laps: 260, banking: "28°", surface: "Asphalt" },
  "lasvegas": { name: "Las Vegas Motor Speedway", location: "Las Vegas, NV", type: "Intermediate", length: "1.5 mi", laps: 267, banking: "20°", surface: "Asphalt" },
  "phoenix": { name: "Phoenix Raceway", location: "Avondale, AZ", type: "Short Track", length: "1.0 mi", laps: 312, banking: "10-11°", surface: "Asphalt" },
  "bristol": { name: "Bristol Motor Speedway", location: "Bristol, TN", type: "Short Track", length: "0.533 mi", laps: 500, banking: "24-30°", surface: "Concrete" },
  "cota": { name: "Circuit of the Americas", location: "Austin, TX", type: "Road Course", length: "3.41 mi", laps: 68, surface: "Asphalt" },
  "talladega": { name: "Talladega Superspeedway", location: "Lincoln, AL", type: "Superspeedway", length: "2.66 mi", laps: 188, banking: "33°", surface: "Asphalt" },
  "dover": { name: "Dover Motor Speedway", location: "Dover, DE", type: "Short Track", length: "1.0 mi", laps: 400, banking: "24°", surface: "Concrete" },
  "kansas": { name: "Kansas Speedway", location: "Kansas City, KS", type: "Intermediate", length: "1.5 mi", laps: 267, banking: "15-17°", surface: "Asphalt" },
  "charlotte": { name: "Charlotte Motor Speedway", location: "Concord, NC", type: "Intermediate", length: "1.5 mi", laps: 400, banking: "24°", surface: "Asphalt" },
  "sonoma": { name: "Sonoma Raceway", location: "Sonoma, CA", type: "Road Course", length: "1.99 mi", laps: 110, surface: "Asphalt" },
  "nashville": { name: "Nashville Superspeedway", location: "Lebanon, TN", type: "Intermediate", length: "1.33 mi", laps: 300, banking: "14°", surface: "Concrete" },
  "michigan": { name: "Michigan International Speedway", location: "Brooklyn, MI", type: "Intermediate", length: "2.0 mi", laps: 200, banking: "18°", surface: "Asphalt" },
  "indianapolis": { name: "Indianapolis Motor Speedway", location: "Indianapolis, IN", type: "Road Course", length: "2.439 mi", laps: 82, surface: "Asphalt" },
  "watkinsglen": { name: "Watkins Glen International", location: "Watkins Glen, NY", type: "Road Course", length: "2.45 mi", laps: 90, surface: "Asphalt" },
  "darlington": { name: "Darlington Raceway", location: "Darlington, SC", type: "Intermediate", length: "1.366 mi", laps: 367, banking: "23-25°", surface: "Asphalt" },
  "martinsville": { name: "Martinsville Speedway", location: "Martinsville, VA", type: "Short Track", length: "0.526 mi", laps: 500, banking: "12°", surface: "Asphalt" },
  "homestead": { name: "Homestead-Miami Speedway", location: "Homestead, FL", type: "Intermediate", length: "1.5 mi", laps: 267, banking: "18-20°", surface: "Asphalt" },
};

const NASCAR_SEASON_YEAR = new Date().getFullYear();
const seasonDate = (monthDay: string) => `${NASCAR_SEASON_YEAR}-${monthDay}`;

type RaceDetailItem = {
  id?: string;
  name: string;
  track: string;
  date: string;
  time: string;
  status: "completed" | "upcoming" | "live";
  winner?: string;
  tv?: string;
  purse?: string;
  trackLabel?: string;
  homeName?: string;
  awayName?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  raceResults?: Array<{
    position: number;
    driverName: string;
    driverId?: string;
    points?: number | null;
    status?: string;
  }>;
};

type LiveRaceMeta = {
  provider: string;
  timestamp: string | null;
  stats: Array<{
    category?: string;
    label?: string;
    awayValue?: string | number;
    homeValue?: string | number;
  }>;
};

type NascarLiveSnapshotRace = {
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

function mapGameStatusToRaceStatus(
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

  // Guard against stale upstream status when same-day start time is already well past.
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

function resolveTrackFromVenue(venue: string | undefined): { key: string; label?: string } {
  const normalized = String(venue || "").toLowerCase().trim();
  if (!normalized) return { key: "daytona" };
  const found = Object.entries(NASCAR_TRACKS).find(([, track]) =>
    normalized.includes(track.name.toLowerCase().split(" ")[0])
    || track.name.toLowerCase().includes(normalized)
  );
  if (found) return { key: found[0] };
  return { key: "daytona", label: venue };
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

function formatRaceTime(startTime: string | undefined): string {
  if (!startTime) return "TBD";
  const date = parseStartDate(startTime);
  if (!date) return "TBD";
  return `${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  })} ET`;
}

function parseYmdForDisplay(dateText: string): Date {
  const match = String(dateText || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(`${dateText}T12:00:00`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, month, day, 12, 0, 0, 0);
}

function resolveDriverIdFromName(name: string): string | undefined {
  const target = normalizeNascarNameToken(name);
  if (!target) return undefined;
  const targetLast = target.split(" ").pop() || "";
  const match = Object.entries(NASCAR_DRIVERS).find(([, driver]) => {
    const full = normalizeNascarNameToken(driver.name);
    if (full === target) return true;
    const fullLast = full.split(" ").pop() || "";
    return Boolean(targetLast && fullLast && targetLast === fullLast);
  });
  return match?.[0];
}

function deriveFallbackRaceStatus(date: string): "completed" | "upcoming" {
  const eventDay = parseDayNumber(date);
  if (eventDay == null) return "upcoming";
  return eventDay < getReferenceDayNumber(new Date()) ? "completed" : "upcoming";
}

// ============================================================
// RACE SCHEDULE
// ============================================================
const RACE_SCHEDULE: Record<string, { 
  name: string; 
  track: string; 
  date: string; 
  time: string; 
  status: "completed" | "upcoming" | "live";
  winner?: string;
  tv?: string;
  purse?: string;
}> = {
  "daytona500": { name: "Daytona 500", track: "daytona", date: seasonDate("02-16"), time: "2:30 PM ET", status: "completed", winner: "larson", tv: "FOX", purse: "$23.6M" },
  "atlanta1": { name: "Ambetter Health 400", track: "atlanta", date: seasonDate("02-23"), time: "3:00 PM ET", status: "completed", winner: "byron", tv: "FOX", purse: "$8.4M" },
  "phoenix1": { name: "Shriners Children's 500", track: "phoenix", date: seasonDate("03-09"), time: "3:30 PM ET", status: "completed", winner: "bell", tv: "FOX", purse: "$8.1M" },
  "lasvegas1": { name: "Pennzoil 400", track: "lasvegas", date: seasonDate("03-15"), time: "3:30 PM ET", status: "completed", winner: "hamlin", tv: "FOX", purse: "$8.2M" },
  "cota1": { name: "EchoPark Automotive Grand Prix", track: "cota", date: seasonDate("03-23"), time: "3:30 PM ET", status: "completed", winner: "chastain", tv: "FOX", purse: "$7.8M" },
  "martinsville1": { name: "STP 500", track: "martinsville", date: seasonDate("03-30"), time: "2:00 PM ET", status: "upcoming", tv: "FS1", purse: "$7.5M" },
  "talladega1": { name: "GEICO 500", track: "talladega", date: seasonDate("04-06"), time: "3:00 PM ET", status: "upcoming", tv: "FOX", purse: "$8.0M" },
  "bristol1": { name: "Food City 500", track: "bristol", date: seasonDate("04-12"), time: "3:30 PM ET", status: "upcoming", tv: "FOX", purse: "$8.0M" },
  "dover1": { name: "Würth 400", track: "dover", date: seasonDate("04-13"), time: "2:00 PM ET", status: "upcoming", tv: "FS1", purse: "$7.6M" },
  "kansas1": { name: "AdventHealth 400", track: "kansas", date: seasonDate("04-20"), time: "3:00 PM ET", status: "upcoming", tv: "FOX", purse: "$7.8M" },
  "darlington1": { name: "Goodyear 400", track: "darlington", date: seasonDate("04-27"), time: "3:00 PM ET", status: "upcoming", tv: "FS1", purse: "$7.7M" },
  "charlotte1": { name: "Coca-Cola 600", track: "charlotte", date: seasonDate("05-25"), time: "6:00 PM ET", status: "upcoming", tv: "FOX", purse: "$9.2M" },
};

const FALLBACK_RESULTS_BY_RACE: Record<string, Array<{ position: number; driverName: string; status?: string }>> = {
  lasvegas1: [
    { position: 1, driverName: "Denny Hamlin", status: "Completed" },
    { position: 2, driverName: "Chase Elliott", status: "Completed" },
    { position: 3, driverName: "William Byron", status: "Completed" },
    { position: 4, driverName: "Christopher Bell", status: "Completed" },
    { position: 5, driverName: "Ty Gibbs", status: "Completed" },
    { position: 6, driverName: "Chris Buescher", status: "Completed" },
    { position: 7, driverName: "Kyle Larson", status: "Completed" },
    { position: 8, driverName: "Chase Briscoe", status: "Completed" },
    { position: 9, driverName: "Bubba Wallace", status: "Completed" },
    { position: 10, driverName: "Brad Keselowski", status: "Completed" },
  ],
};

// ============================================================
// MOCK BETTING ODDS
// ============================================================
function generateBettingOdds() {
  const favorites = ["larson", "byron", "hamlin", "bell", "elliott"];
  return favorites.map((id, i) => ({
    driverId: id,
    odds: i === 0 ? "+350" : `+${450 + i * 100}`,
    movement: i % 2 === 0 ? "up" : "down",
  }));
}

// ============================================================
// COACH G RACE INSIGHTS
// ============================================================
function getCoachGRaceInsight(trackType: string): string {
  const insights: Record<string, string[]> = {
    "Superspeedway": [
      "Pack racing means anything can happen. Fade the favorites or take longshots.",
      "Manufacturer alliances matter here. Watch for Chevy trains.",
      "Big one alert - consider DNF prop bets on aggressive drivers.",
    ],
    "Short Track": [
      "Track position is everything. Quality starting spot = top-5 finish.",
      "Tempers flare at short tracks. Watch for feuds to play out.",
      "Restarts are chaotic - back drivers who excel at the green flag.",
    ],
    "Intermediate": [
      "Speed wins on the mile-and-a-halfs. Hendrick and Penske territory.",
      "Pit strategy can shake things up. Watch for fuel-mileage plays.",
      "Long green flag runs favor the fast cars. Back the speedsters.",
    ],
    "Road Course": [
      "Road ringers can compete here. Don't sleep on the underdogs.",
      "Tire management is key. Look for patient, technical drivers.",
      "First-lap chaos is common. Position props can be valuable.",
    ],
  };
  const trackInsights = insights[trackType] || insights["Intermediate"];
  if (!trackInsights.length) return "Track data is syncing. Check back closer to green flag.";
  const seed = trackType.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return trackInsights[seed % trackInsights.length];
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function NASCARRacePage() {
  const { raceId } = useParams<{ raceId: string }>();
  const navigate = useNavigate();
  const [liveRace, setLiveRace] = useState<RaceDetailItem | null>(null);
  const [liveMeta, setLiveMeta] = useState<LiveRaceMeta | null>(null);

  useEffect(() => {
    let active = true;
    const loadLiveRace = async () => {
      if (!raceId) return;
      try {
        if (document.hidden) return;
        const res = await fetch(`/api/games/${encodeURIComponent(raceId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const game = data?.game;
        if (!game || !active) return;

        const away = String(game?.away_team_name || game?.away_team_code || "Away");
        const home = String(game?.home_team_name || game?.home_team_code || "Home");
        const venue = String(game?.venue || "").trim();
        const { key, label } = resolveTrackFromVenue(venue);
        const parsedHomeScore = Number(game?.home_score);
        const parsedAwayScore = Number(game?.away_score);
        const homeScore = Number.isFinite(parsedHomeScore) ? parsedHomeScore : null;
        const awayScore = Number.isFinite(parsedAwayScore) ? parsedAwayScore : null;
        const status = mapGameStatusToRaceStatus(
          game?.status,
          game?.start_time,
          game?.scheduled || game?.date || game?.startDate,
          homeScore,
          awayScore
        );

        const raceResults = normalizeProviderRaceResults((game as any)?.race_results).map((row) => ({
          ...row,
          driverId: resolveDriverIdFromName(row.driverName),
          status: row.status || "Completed",
        }));
        if (status === "completed" && !hasVerifiedNascarRaceResults(raceResults)) {
          console.warn("[NASCAR][validation] Completed race missing verified results payload", {
            raceId: String(game?.id || game?.game_id || raceId),
            hasWinnerName: Boolean(game?.winner_name || game?.winner),
            raceResultsCount: raceResults.length,
          });
        }

        let winner: string | undefined;
        if (status === "completed") {
          const winnerName = extractProviderWinnerName(game, raceResults);
          winner = resolveDriverIdFromName(winnerName);
        }

        setLiveRace({
          id: String(game?.id || game?.game_id || raceId),
          name: venue || `${away} vs ${home}`,
          track: key,
          trackLabel: label,
          date: formatRaceDate(game?.start_time),
          time: formatRaceTime(game?.start_time),
          status,
          winner,
          tv: game?.broadcast || undefined,
          homeName: home,
          awayName: away,
          homeScore,
          awayScore,
          raceResults: raceResults.length > 0 ? raceResults : undefined,
        });
        if (active) {
          setLiveMeta({
            provider: String(data?.provider || "unknown"),
            timestamp: typeof data?.timestamp === "string" ? data.timestamp : null,
            stats: Array.isArray(data?.stats) ? data.stats : [],
          });
        }
      } catch {
        // Keep mock fallback when live fetch is unavailable.
        if (active) setLiveMeta(null);
      }
    };
    void loadLiveRace();
    const pollId = window.setInterval(() => {
      void loadLiveRace();
    }, 180000);
    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, [raceId]);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;
    let currentDelayMs = 30000;
    const loadLiveSnapshot = async () => {
      if (!raceId) return;
      try {
        if (document.hidden) return true;
        const res = await fetch(`/api/games/nascar/live-snapshot?gameId=${encodeURIComponent(raceId)}`, {
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = await res.json();
        const target = (data?.target || null) as NascarLiveSnapshotRace | null;
        if (!active || !target) return false;

        const venue = String(target.venue || "").trim();
        const away = String(target.away_team_name || "Away");
        const home = String(target.home_team_name || "Home");
        const { key, label } = resolveTrackFromVenue(venue);
        const status = mapGameStatusToRaceStatus(target.status, target.start_time, target.start_time);
        const raceResults = (Array.isArray(target.race_results) ? target.race_results : []).map((row) => ({
          position: Number(row.position),
          driverName: String(row.driver_name || "").trim(),
          points: Number.isFinite(Number(row.points)) ? Number(row.points) : null,
          status: row.status || "Running",
          driverId: resolveDriverIdFromName(String(row.driver_name || "")),
        })).filter((row) => Number.isFinite(row.position) && row.driverName.length > 0);
        const winner = resolveDriverIdFromName(String(target.winner_name || ""));

        setLiveRace((prev) => ({
          id: String(target.game_id || prev?.id || raceId),
          name: venue || prev?.name || `${away} vs ${home}`,
          track: key || prev?.track || "daytona",
          trackLabel: label || prev?.trackLabel,
          date: formatRaceDate(target.start_time) || prev?.date || seasonDate("01-01"),
          time: formatRaceTime(target.start_time) || prev?.time || "TBD",
          status,
          winner: winner || prev?.winner,
          tv: prev?.tv,
          homeName: home || prev?.homeName,
          awayName: away || prev?.awayName,
          homeScore: prev?.homeScore ?? null,
          awayScore: prev?.awayScore ?? null,
          raceResults: raceResults.length > 0 ? raceResults : prev?.raceResults,
        }));

        setLiveMeta((prev) => ({
          provider: String(data?.source || prev?.provider || "unknown"),
          timestamp: typeof data?.generated_at === "string" ? data.generated_at : prev?.timestamp || null,
          stats: prev?.stats || [],
        }));
        return true;
      } catch {
        // Keep existing race state when snapshot polling fails.
        return false;
      }
    };
    const scheduleNext = (wasSuccessful: boolean) => {
      if (!active) return;
      currentDelayMs = wasSuccessful ? 30000 : Math.min(currentDelayMs * 2, 180000);
      timeoutId = window.setTimeout(async () => {
        const ok = await loadLiveSnapshot();
        scheduleNext(Boolean(ok));
      }, currentDelayMs);
    };
    void loadLiveSnapshot().then((ok) => scheduleNext(Boolean(ok)));
    return () => {
      active = false;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [raceId]);

  const normalizedFallbackSchedule = useMemo(() => {
    const normalized: Record<string, RaceDetailItem> = {};
    for (const [id, race] of Object.entries(RACE_SCHEDULE)) {
      const status = deriveFallbackRaceStatus(race.date);
      normalized[id] = {
        ...race,
        id,
        status,
        winner: status === "completed" ? race.winner : undefined,
      };
    }
    return normalized;
  }, []);

  const fallbackRace = raceId ? normalizedFallbackSchedule[raceId] || null : null;
  const race = useMemo(() => {
    if (!fallbackRace && !liveRace) return null;
    if (!fallbackRace) return liveRace;
    if (!liveRace) return fallbackRace;
    const normalizedLiveResults = (liveRace.raceResults || []).map((row) => ({
      position: Number(row.position),
      driverName: String(row.driverName || ""),
      points: row.points ?? null,
      status: row.status,
    }));
    const verifiedResults = hasVerifiedNascarRaceResults(normalizedLiveResults) ? liveRace.raceResults : undefined;
    const verifiedWinner = liveRace.winner
      || (verifiedResults ? resolveDriverIdFromName(verifiedResults.find((row) => row.position === 1)?.driverName || "") : undefined);
    return {
      ...fallbackRace,
      ...liveRace,
      winner: verifiedWinner || fallbackRace.winner,
      raceResults: verifiedResults,
    };
  }, [fallbackRace, liveRace]);
  const track = race ? NASCAR_TRACKS[race.track] : null;
  const isCompleted = race?.status === "completed";
  const isLive = race?.status === "live";
  const winner = isCompleted && race.winner ? NASCAR_DRIVERS[race.winner] : null;
  const winnerNameDisplay = winner?.name || race?.raceResults?.find((row) => row.position === 1)?.driverName;
  const fallbackResults = useMemo(() => {
    if (!race || !isCompleted) return [];
    const mapped = FALLBACK_RESULTS_BY_RACE[raceId || race.id || ""] || [];
    if (mapped.length > 0) {
      return mapped.map((row) => ({
        position: row.position,
        driverName: row.driverName,
        driverId: resolveDriverIdFromName(row.driverName),
        points: null,
        status: row.status || "Completed",
      }));
    }
    if (race.winner) {
      const fallbackWinner = NASCAR_DRIVERS[race.winner];
      if (fallbackWinner) {
        return [{
          position: 1,
          driverName: fallbackWinner.name,
          driverId: race.winner,
          points: null,
          status: "Completed",
        }];
      }
    }
    return [];
  }, [race, isCompleted, raceId]);
  const results = isCompleted && race?.raceResults && race.raceResults.length > 0 ? race.raceResults : fallbackResults;
  const bettingOdds = !isCompleted ? generateBettingOdds() : [];
  const coachInsight = track ? getCoachGRaceInsight(track.type) : "";
  const liveRunningOrder = useMemo(() => {
    if (!isLive || !race?.raceResults || race.raceResults.length === 0) return [];
    return [...race.raceResults]
      .filter((row) => Number.isFinite(Number(row.position)))
      .sort((a, b) => Number(a.position) - Number(b.position))
      .slice(0, 10);
  }, [isLive, race?.raceResults]);
  const liveLeader = liveRunningOrder.find((row) => row.position === 1) || null;
  const liveUpdatedLabel = useMemo(() => {
    if (!liveMeta?.timestamp) return "—";
    const ts = new Date(liveMeta.timestamp);
    if (Number.isNaN(ts.getTime())) return "—";
    return ts.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [liveMeta?.timestamp]);
  const viewMode = deriveUnifiedViewMode(
    race?.status === "live" ? "LIVE" : race?.status === "completed" ? "FINAL" : "SCHEDULED"
  );

  if (!race || !track) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-4">Race not found</p>
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
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-red-500/5" />
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
          >
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Race Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-3 py-1 rounded-md text-xs font-bold ${
                    isCompleted
                      ? "bg-emerald-500/20 text-emerald-400"
                      : isLive
                        ? "bg-red-500/20 text-red-300 animate-pulse"
                        : "bg-amber-500/20 text-amber-400 animate-pulse"
                  }`}>
                    {isCompleted ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
                  </span>
                  <span className="px-3 py-1 rounded-md bg-white/10 text-white/60 text-xs font-medium">
                    {track.type}
                  </span>
                  {race.tv && (
                    <span className="px-3 py-1 rounded-md bg-cyan-500/20 text-cyan-400 text-xs font-medium">
                      📺 {race.tv}
                    </span>
                  )}
                </div>

                <h1 className="text-3xl lg:text-4xl font-black text-white mb-3">{race.name}</h1>

                <div className="flex flex-wrap items-center gap-4 text-white/60 mb-6">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {race.trackLabel || track.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {new Date(`${race.date}T12:00:00`).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })} • {race.time}
                  </span>
                  <span className="flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    {track.laps} laps • {track.length}
                  </span>
                </div>

                {/* Winner Display */}
                {winnerNameDisplay && (
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500/30 to-transparent border border-amber-500/30 flex items-center justify-center">
                      <Trophy className="h-7 w-7 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-emerald-400 text-sm font-medium">Race Winner</p>
                      {winner && race.winner ? (
                        <>
                          <p 
                            className="text-xl font-bold text-white cursor-pointer hover:text-amber-400 transition-colors"
                            onClick={() => navigate(`/sports/nascar/driver/${race.winner}`)}
                          >
                            {winner.name}
                          </p>
                          <p className="text-white/40 text-sm">#{winner.number} • {winner.team}</p>
                        </>
                      ) : (
                        <p className="text-xl font-bold text-white">{winnerNameDisplay}</p>
                      )}
                    </div>
                  </div>
                )}
                {isCompleted && !winner && (
                  <div className="mb-6 rounded-xl border border-white/15 bg-white/[0.04] p-4 text-sm text-white/70">
                    Final race status is confirmed. Official winner data is syncing from provider feeds.
                  </div>
                )}

                {/* Track Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                    <p className="text-lg font-bold text-amber-400">{track.length}</p>
                    <p className="text-xs text-white/40">Track Length</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                    <p className="text-lg font-bold text-cyan-400">{track.laps}</p>
                    <p className="text-xs text-white/40">Laps</p>
                  </div>
                  {track.banking && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                      <p className="text-lg font-bold text-violet-400">{track.banking}</p>
                      <p className="text-xs text-white/40">Banking</p>
                    </div>
                  )}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                    <p className="text-lg font-bold text-emerald-400">{track.surface}</p>
                    <p className="text-xs text-white/40">Surface</p>
                  </div>
                </div>
              </div>

              {/* Track Visualization */}
              <div className="flex-shrink-0 flex flex-col items-center gap-4">
                <div className="w-40 h-40 rounded-2xl bg-gradient-to-br from-amber-500/20 to-transparent border border-amber-500/30 flex items-center justify-center">
                  <span className="text-7xl">🏁</span>
                </div>
                <div className="text-center">
                  <p className="text-white/40 text-sm">{track.location}</p>
                  {race.purse && (
                    <p className="text-emerald-400 font-bold">{race.purse} Purse</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-8">
        {viewMode === "live" && (
          <UnifiedLiveSignalStrip
            cards={[
              { title: "Line Movement", value: "Outright winner market tightening", chip: "LIVE SHIFT", tone: "red" },
              { title: "Prop Heat", value: "Top-5 and stage props actively rotating", chip: "HEAT MAP", tone: "green" },
              { title: "Pace / Momentum", value: "Restart windows driving race flow", chip: "FLOW SIGNAL", tone: "amber" },
            ]}
          />
        )}

        {isLive && (
          <section>
            <SectionHeader
              icon={<Gauge className="h-5 w-5 text-red-300" />}
              title="Live Racing Stats"
              subtitle="Running order and provider sync"
            />
            <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-transparent p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                  <p className="text-xs text-white/40">Feed</p>
                  <p className="text-sm font-bold text-white">{String(liveMeta?.provider || "unknown").toUpperCase()}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                  <p className="text-xs text-white/40">Last Update</p>
                  <p className="text-sm font-bold text-cyan-300">{liveUpdatedLabel}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                  <p className="text-xs text-white/40">Current Leader</p>
                  <p className="text-sm font-bold text-amber-300">{liveLeader?.driverName || "Syncing..."}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                  <p className="text-xs text-white/40">Rows Tracked</p>
                  <p className="text-sm font-bold text-white">{liveRunningOrder.length}</p>
                </div>
              </div>

              {liveRunningOrder.length > 0 ? (
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
                      {liveRunningOrder.map((row) => (
                        <tr key={`${row.position}-${row.driverName}`} className="border-t border-white/5">
                          <td className="py-3 px-4 font-bold text-white">{row.position}</td>
                          <td className="px-4 text-white">{row.driverName}</td>
                          <td className="px-4 text-center text-white/70">{row.points ?? "-"}</td>
                          <td className="px-4 text-center text-white/60">{row.status || "Running"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
                  Live running-order rows are not yet available from the provider payload for this event.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* COACH G INTEL */}
        {/* ============================================================ */}
        <section>
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent p-5">
            <div className="flex items-start gap-4">
              <CoachGAvatar size="md" presence={viewMode === "live" ? "alert" : "monitoring"} className="border-violet-400/35" />
              <div className="flex-1">
                <p className="text-white text-lg font-medium mb-3">"{coachInsight}"</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate(`/scout?q=${race.name} betting predictions`)}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/30 transition-colors flex items-center gap-2"
                  >
                    <Target className="h-4 w-4" />
                    Race Predictions
                  </button>
                  <button
                    onClick={() => navigate(`/scout?q=Best bets for ${track.name}`)}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Track History
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

        {viewMode === "final" && (
          <UnifiedVideoPanel
            title="Postgame Video"
            subtitle="Coach G recap clip for completed race."
            fallbackText="Post-race Coach G recap video is not available yet."
            isPostgame
          />
        )}

        {/* ============================================================ */}
        {/* RACE RESULTS (if completed) */}
        {/* ============================================================ */}
        {isCompleted && results.length > 0 && (
          <section>
            <SectionHeader
              icon={<Trophy className="h-5 w-5 text-amber-400" />}
              title="Race Results"
              subtitle="Final standings"
            />
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                      <th className="text-left py-3 px-4">Pos</th>
                      <th className="text-left px-4">Driver</th>
                      <th className="text-left px-4">Team</th>
                      <th className="text-center px-4">Pts</th>
                      <th className="text-center px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 15).map((result) => {
                      const driver = result.driverId ? NASCAR_DRIVERS[result.driverId] : undefined;
                      const mfr = MANUFACTURERS[driver?.manufacturer || ""];
                      return (
                        <tr
                          key={`${result.position}-${result.driverId || result.driverName}`}
                          onClick={() => {
                            if (result.driverId) navigate(`/sports/nascar/driver/${result.driverId}`);
                          }}
                          className={`border-t border-white/5 transition-colors ${result.driverId ? "hover:bg-white/5 cursor-pointer" : ""}`}
                        >
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold ${
                              result.position === 1
                                ? "bg-amber-500 text-black"
                                : result.position <= 3
                                ? "bg-white/20 text-white"
                                : result.position <= 10
                                ? "bg-white/10 text-white/70"
                                : "text-white/50"
                            }`}>
                              {result.position}
                            </span>
                          </td>
                          <td className="px-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br ${mfr?.bgColor || "from-white/20"} to-transparent border border-white/10`}>
                                {driver?.number ? `#${driver.number}` : "--"}
                              </div>
                              <span className="font-medium text-white">{driver?.name || result.driverName}</span>
                            </div>
                          </td>
                          <td className="px-4 text-white/60">{driver?.team || "Live provider"}</td>
                          <td className="text-center">
                            <span className={Number(result.points || 0) > 40 ? "text-violet-400 font-medium" : "text-white/50"}>
                              {result.points ?? "-"}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={(result.status || "").toUpperCase().includes("DNF") ? "text-red-400" : "text-emerald-400"}>
                              {result.status || "Completed"}
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
        )}

        {/* ============================================================ */}
        {/* BETTING ODDS (if upcoming) */}
        {/* ============================================================ */}
        {!isCompleted && bettingOdds.length > 0 && (
          <section>
            <SectionHeader
              icon={<Zap className="h-5 w-5 text-amber-400" />}
              title="Race Winner Odds"
              subtitle="Current betting lines"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {bettingOdds.map((bet, i) => {
                const driver = NASCAR_DRIVERS[bet.driverId];
                const mfr = MANUFACTURERS[driver?.manufacturer || ""];
                return (
                  <div
                    key={bet.driverId}
                    onClick={() => navigate(`/sports/nascar/driver/${bet.driverId}`)}
                    className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 hover:bg-white/[0.08] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br ${mfr?.bgColor || "from-white/20"} to-transparent border border-white/10`}>
                        #{driver?.number}
                      </div>
                      {i === 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs font-bold">
                          FAVORITE
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-white truncate">{driver?.name}</p>
                    <p className="text-xs text-white/40 mb-2">{driver?.team}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-emerald-400">{bet.odds}</span>
                      <span className={`text-xs ${bet.movement === "up" ? "text-emerald-400" : "text-red-400"}`}>
                        {bet.movement === "up" ? "↑" : "↓"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-center text-white/30 text-xs mt-4">Odds for illustration only</p>
          </section>
        )}

        {/* ============================================================ */}
        {/* WEATHER CONDITIONS (upcoming only) */}
        {/* ============================================================ */}
        {!isCompleted && (
          <section>
            <SectionHeader
              icon={<Cloud className="h-5 w-5 text-cyan-400" />}
              title="Race Day Conditions"
              subtitle="Weather forecast"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-center">
                <Thermometer className="h-6 w-6 text-amber-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">72°F</p>
                <p className="text-xs text-white/40">Temperature</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-center">
                <Cloud className="h-6 w-6 text-cyan-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">Partly Cloudy</p>
                <p className="text-xs text-white/40">Conditions</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-center">
                <Gauge className="h-6 w-6 text-violet-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">8 mph</p>
                <p className="text-xs text-white/40">Wind</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-center">
                <span className="text-2xl mb-2 block">💧</span>
                <p className="text-2xl font-bold text-white">10%</p>
                <p className="text-xs text-white/40">Rain Chance</p>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* TRACK HISTORY */}
        {/* ============================================================ */}
        <section>
          <SectionHeader
            icon={<Award className="h-5 w-5 text-amber-400" />}
            title="Track History"
            subtitle="Past winners at this track"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { year: String(NASCAR_SEASON_YEAR - 1), winner: "larson", lapsLed: 78 },
              { year: String(NASCAR_SEASON_YEAR - 2), winner: "hamlin", lapsLed: 45 },
              { year: String(NASCAR_SEASON_YEAR - 3), winner: "byron", lapsLed: 62 },
            ].map((past) => {
              const pastWinner = NASCAR_DRIVERS[past.winner];
              const mfr = MANUFACTURERS[pastWinner?.manufacturer || ""];
              return (
                <div
                  key={past.year}
                  className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl font-bold text-white/30">{past.year}</span>
                    <Trophy className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br ${mfr?.bgColor || "from-white/20"} to-transparent border border-white/10`}>
                      #{pastWinner?.number}
                    </div>
                    <div>
                      <p className="font-medium text-white">{pastWinner?.name}</p>
                      <p className="text-xs text-white/40">{past.lapsLed} laps led</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ============================================================ */}
        {/* RELATED RACES */}
        {/* ============================================================ */}
        <section>
          <SectionHeader
            icon={<Flag className="h-5 w-5 text-cyan-400" />}
            title="More Races"
            subtitle="Explore the schedule"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(normalizedFallbackSchedule)
              .filter(([id]) => id !== raceId)
              .slice(0, 3)
              .map(([id, r]) => {
                const t = NASCAR_TRACKS[r.track];
                const raceDate = parseYmdForDisplay(r.date);
                return (
                  <div
                    key={id}
                    onClick={() => navigate(`/sports/nascar/race/${id}`)}
                    className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 hover:bg-white/[0.08] cursor-pointer transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-white group-hover:text-amber-400 transition-colors">
                          {r.name}
                        </h3>
                        <p className="text-sm text-white/40">{t?.name}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                        r.status === "completed"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {r.status === "completed" ? "FINAL" : "UPCOMING"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-xs text-white/40">
                        {raceDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <ArrowRight className="h-4 w-4 text-white/30 group-hover:text-amber-400 transition-colors" />
                    </div>
                  </div>
                );
              })}
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
