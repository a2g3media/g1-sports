/**
 * MMA Fighter Page - Fighter Profile View
 * 
 * Shows detailed fighter profile including stats, record,
 * fight history, and Coach G insights.
 */

import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft, Target, Zap, MessageSquare, Flag,
  Activity, TrendingUp, Calendar
} from "lucide-react";

const COACH_G_AVATAR = "/assets/coachg/coach-g-avatar.png";

interface FightResult {
  opponent: string;
  event: string;
  date: string;
  result: "W" | "L" | "D" | "NC";
  method: string;
  round: number;
}

interface Fighter {
  id: string;
  name: string;
  nickname?: string;
  record: string;
  country: string;
  weightClass: string;
  rank?: number;
  espnId?: string;
  age?: number;
  height?: string;
  reach?: string;
  stance?: string;
  team?: string;
  stats?: {
    sigStrikesPerMin: number;
    sigStrikeAccuracy: number;
    sigStrikesAbsorbed: number;
    takedownAvg: number;
    takedownAccuracy: number;
    takedownDefense: number;
    subAvg: number;
    knockdownRatio: number;
  };
  fightHistory?: FightResult[];
  coachInsights?: string[];
  bettingProfile?: {
    favoriteRecord: string;
    underdogRecord: string;
    finishRate: number;
    avgFightTime: string;
    decisionRate: number;
  };
}

// Fighter database
const FIGHTERS: Record<string, Fighter> = {
  mcgregor: {
    id: "mcgregor",
    name: "Conor McGregor",
    nickname: "Notorious",
    record: "22-6-0",
    country: "Ireland",
    weightClass: "Lightweight",
    rank: 5,
    espnId: "3022677",
    age: 36,
    height: "5'9\"",
    reach: "74\"",
    stance: "Southpaw",
    team: "SBG Ireland",
    stats: {
      sigStrikesPerMin: 5.32,
      sigStrikeAccuracy: 49,
      sigStrikesAbsorbed: 4.30,
      takedownAvg: 0.52,
      takedownAccuracy: 55,
      takedownDefense: 65,
      subAvg: 0.3,
      knockdownRatio: 3.1,
    },
    fightHistory: [
      { opponent: "Dustin Poirier", event: "UFC 264", date: "Jul 2021", result: "L", method: "TKO (Doctor Stoppage)", round: 1 },
      { opponent: "Dustin Poirier", event: "UFC 257", date: "Jan 2021", result: "L", method: "TKO (Punches)", round: 2 },
      { opponent: "Donald Cerrone", event: "UFC 246", date: "Jan 2020", result: "W", method: "TKO (Head Kick + Punches)", round: 1 },
      { opponent: "Khabib Nurmagomedov", event: "UFC 229", date: "Oct 2018", result: "L", method: "Submission (Neck Crank)", round: 4 },
      { opponent: "Eddie Alvarez", event: "UFC 205", date: "Nov 2016", result: "W", method: "TKO (Punches)", round: 2 },
    ],
    coachInsights: [
      "McGregor's left hand remains one of MMA's most dangerous weapons",
      "Ring rust is the major question after extended layoff",
      "Historically struggles against elite grapplers",
      "First round knockout specialist - fades after round 2",
    ],
    bettingProfile: {
      favoriteRecord: "14-4",
      underdogRecord: "4-2",
      finishRate: 85,
      avgFightTime: "8:42",
      decisionRate: 15,
    },
  },
  chandler: {
    id: "chandler",
    name: "Michael Chandler",
    nickname: "Iron",
    record: "23-8-0",
    country: "USA",
    weightClass: "Lightweight",
    rank: 4,
    espnId: "2335668",
    age: 38,
    height: "5'8\"",
    reach: "69\"",
    stance: "Orthodox",
    team: "Sanford MMA",
    stats: {
      sigStrikesPerMin: 4.87,
      sigStrikeAccuracy: 51,
      sigStrikesAbsorbed: 5.21,
      takedownAvg: 2.1,
      takedownAccuracy: 47,
      takedownDefense: 88,
      subAvg: 0.0,
      knockdownRatio: 2.2,
    },
    fightHistory: [
      { opponent: "Dustin Poirier", event: "UFC 281", date: "Nov 2022", result: "L", method: "Submission (Rear Naked Choke)", round: 3 },
      { opponent: "Tony Ferguson", event: "UFC 274", date: "May 2022", result: "W", method: "KO (Front Kick)", round: 2 },
      { opponent: "Justin Gaethje", event: "UFC 268", date: "Nov 2021", result: "L", method: "TKO (Punches)", round: 1 },
      { opponent: "Charles Oliveira", event: "UFC 262", date: "May 2021", result: "L", method: "TKO (Punches)", round: 2 },
      { opponent: "Dan Hooker", event: "UFC 257", date: "Jan 2021", result: "W", method: "TKO (Punches)", round: 1 },
    ],
    coachInsights: [
      "Chandler's wrestling base makes him dangerous anywhere",
      "Improved striking has made him a more complete fighter",
      "Has been hurt in recent fights - chin may be compromised",
      "Explosion and pace in first two rounds is elite",
    ],
    bettingProfile: {
      favoriteRecord: "16-4",
      underdogRecord: "7-4",
      finishRate: 78,
      avgFightTime: "7:15",
      decisionRate: 22,
    },
  },
  pereira: {
    id: "pereira",
    name: "Alex Pereira",
    nickname: "Poatan",
    record: "11-2-0",
    country: "Brazil",
    weightClass: "Light Heavyweight",
    rank: 1,
    espnId: "4872076",
    age: 37,
    height: "6'4\"",
    reach: "79\"",
    stance: "Orthodox",
    team: "Glover Teixeira MMA",
    stats: {
      sigStrikesPerMin: 5.78,
      sigStrikeAccuracy: 56,
      sigStrikesAbsorbed: 4.89,
      takedownAvg: 0.0,
      takedownAccuracy: 0,
      takedownDefense: 78,
      subAvg: 0.0,
      knockdownRatio: 4.2,
    },
    fightHistory: [
      { opponent: "Jamahal Hill", event: "UFC 300", date: "Apr 2024", result: "W", method: "KO (Head Kick)", round: 1 },
      { opponent: "Jamahal Hill", event: "UFC 295", date: "Nov 2023", result: "W", method: "TKO (Punches)", round: 2 },
      { opponent: "Jan Blachowicz", event: "UFC 291", date: "Jul 2023", result: "W", method: "TKO (Punches)", round: 2 },
      { opponent: "Israel Adesanya", event: "UFC 287", date: "Apr 2023", result: "L", method: "KO (Punches)", round: 2 },
      { opponent: "Israel Adesanya", event: "UFC 281", date: "Nov 2022", result: "W", method: "TKO (Punches)", round: 5 },
    ],
    coachInsights: [
      "Kickboxing champion with devastating power in both hands",
      "Ground game remains his biggest weakness",
      "91% finish rate makes prop bets attractive",
      "Size and reach advantage at Light Heavyweight is massive",
    ],
    bettingProfile: {
      favoriteRecord: "9-1",
      underdogRecord: "2-1",
      finishRate: 91,
      avgFightTime: "6:30",
      decisionRate: 9,
    },
  },
  makhachev: {
    id: "makhachev",
    name: "Islam Makhachev",
    nickname: "N/A",
    record: "26-1-0",
    country: "Russia",
    weightClass: "Lightweight",
    rank: 1,
    espnId: "3068412",
    age: 32,
    height: "5'10\"",
    reach: "70\"",
    stance: "Southpaw",
    team: "AKA",
    stats: {
      sigStrikesPerMin: 3.21,
      sigStrikeAccuracy: 52,
      sigStrikesAbsorbed: 2.11,
      takedownAvg: 3.8,
      takedownAccuracy: 61,
      takedownDefense: 89,
      subAvg: 1.2,
      knockdownRatio: 0.5,
    },
    fightHistory: [
      { opponent: "Dustin Poirier", event: "UFC 302", date: "Jun 2024", result: "W", method: "Submission (D'Arce Choke)", round: 5 },
      { opponent: "Alexander Volkanovski", event: "UFC 294", date: "Oct 2023", result: "W", method: "KO (Head Kick)", round: 1 },
      { opponent: "Alexander Volkanovski", event: "UFC 284", date: "Feb 2023", result: "W", method: "Decision (Unanimous)", round: 5 },
      { opponent: "Charles Oliveira", event: "UFC 280", date: "Oct 2022", result: "W", method: "Submission (Arm Triangle)", round: 2 },
      { opponent: "Bobby Green", event: "UFC Fight Night", date: "Feb 2022", result: "W", method: "TKO (Punches)", round: 1 },
    ],
    coachInsights: [
      "Most dominant grappler in UFC - unstoppable on the ground",
      "Striking has improved dramatically under Javier Mendez",
      "Control time makes betting overs attractive",
      "Rarely takes damage - extremely durable champion",
    ],
    bettingProfile: {
      favoriteRecord: "22-0",
      underdogRecord: "4-1",
      finishRate: 62,
      avgFightTime: "11:20",
      decisionRate: 38,
    },
  },
  volkanovski: {
    id: "volkanovski",
    name: "Alexander Volkanovski",
    nickname: "The Great",
    record: "26-4-0",
    country: "Australia",
    weightClass: "Featherweight",
    rank: 1,
    espnId: "2934874",
    age: 35,
    height: "5'6\"",
    reach: "71\"",
    stance: "Orthodox",
    team: "City Kickboxing",
    stats: {
      sigStrikesPerMin: 6.23,
      sigStrikeAccuracy: 56,
      sigStrikesAbsorbed: 3.89,
      takedownAvg: 1.8,
      takedownAccuracy: 37,
      takedownDefense: 77,
      subAvg: 0.1,
      knockdownRatio: 0.4,
    },
    coachInsights: [
      "Elite cardio and volume striking make him hard to beat",
      "Moving up to Lightweight exposed size disadvantage",
      "Back at Featherweight he's nearly unbeatable",
      "Leg kicks accumulate damage over time",
    ],
    bettingProfile: {
      favoriteRecord: "20-2",
      underdogRecord: "6-2",
      finishRate: 42,
      avgFightTime: "14:30",
      decisionRate: 58,
    },
  },
  jones: {
    id: "jones",
    name: "Jon Jones",
    nickname: "Bones",
    record: "27-1-0",
    country: "USA",
    weightClass: "Heavyweight",
    rank: 1,
    espnId: "2504663",
    age: 37,
    height: "6'4\"",
    reach: "84.5\"",
    stance: "Orthodox",
    team: "Jackson Wink MMA",
    stats: {
      sigStrikesPerMin: 4.29,
      sigStrikeAccuracy: 57,
      sigStrikesAbsorbed: 2.10,
      takedownAvg: 1.9,
      takedownAccuracy: 45,
      takedownDefense: 94,
      subAvg: 0.5,
      knockdownRatio: 1.8,
    },
    coachInsights: [
      "GOAT candidate with unmatched fight IQ",
      "Reach advantage at Heavyweight is still elite",
      "Age and inactivity are the major questions",
      "Has never lost cleanly in his career",
    ],
    bettingProfile: {
      favoriteRecord: "23-0",
      underdogRecord: "4-1",
      finishRate: 56,
      avgFightTime: "13:45",
      decisionRate: 44,
    },
  },
};

function getFighterPhoto(fighter: Fighter): string {
  if (fighter.espnId) {
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/mma/players/full/${fighter.espnId}.png&w=350&h=254`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(fighter.name)}&background=1a1a1a&color=fff&size=256`;
}

export default function MMAFighterPage() {
  const { fighterId } = useParams<{ fighterId: string }>();
  const navigate = useNavigate();

  const fighter = useMemo(() => {
    return fighterId ? FIGHTERS[fighterId] : null;
  }, [fighterId]);

  if (!fighter) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">Fighter not found</p>
          <button
            onClick={() => navigate("/sports/mma")}
            className="mt-4 px-4 py-2 rounded-lg bg-red-500 text-white"
          >
            Back to MMA Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/sports/mma")}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="font-bold text-white">{fighter.name}</h1>
            <p className="text-sm text-zinc-400">{fighter.weightClass}</p>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/30 via-red-900/10 to-[#0a0a0a]" />
        
        <div className="relative px-4 pt-6 pb-6 flex flex-col items-center">
          <div className="relative mb-4">
            <div className="absolute -inset-3 bg-red-500/20 rounded-full blur-xl" />
            <img
              src={getFighterPhoto(fighter)}
              alt={fighter.name}
              className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-3 border-red-500/50 bg-zinc-800"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fighter.name)}&background=1a1a1a&color=fff&size=256`;
              }}
            />
            {fighter.rank && (
              <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold border-2 border-[#0a0a0a]">
                #{fighter.rank}
              </div>
            )}
          </div>

          <h2 className="text-2xl font-bold text-white text-center">{fighter.name}</h2>
          {fighter.nickname && fighter.nickname !== "N/A" && (
            <p className="text-red-400">"{fighter.nickname}"</p>
          )}
          <p className="text-xl text-zinc-300 font-mono mt-2">{fighter.record}</p>

          <div className="flex items-center gap-4 mt-3 text-sm text-zinc-400">
            <div className="flex items-center gap-1">
              <Flag className="w-4 h-4" />
              {fighter.country}
            </div>
            {fighter.age && <span>Age {fighter.age}</span>}
            {fighter.team && <span>{fighter.team}</span>}
          </div>

          {/* Physical stats */}
          {(fighter.height || fighter.reach || fighter.stance) && (
            <div className="flex gap-6 mt-4">
              {fighter.height && (
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{fighter.height}</p>
                  <p className="text-xs text-zinc-500">Height</p>
                </div>
              )}
              {fighter.reach && (
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{fighter.reach}</p>
                  <p className="text-xs text-zinc-500">Reach</p>
                </div>
              )}
              {fighter.stance && (
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{fighter.stance}</p>
                  <p className="text-xs text-zinc-500">Stance</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 max-w-4xl mx-auto">
        {/* Coach G Insights */}
        {fighter.coachInsights && fighter.coachInsights.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-transparent border border-violet-500/20">
            <div className="flex items-center gap-3 mb-3">
              <img
                src={COACH_G_AVATAR}
                alt="Coach G"
                className="w-10 h-10 rounded-full object-cover border-2 border-violet-500/30"
              />
              <div>
                <h3 className="font-bold text-white">Coach G's Fighter Analysis</h3>
                <p className="text-sm text-violet-400">Betting Intelligence</p>
              </div>
            </div>
            <div className="space-y-2">
              {fighter.coachInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-zinc-300">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Career Stats */}
        {fighter.stats && (
          <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Career Statistics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-white/5">
                <p className="text-xl font-bold text-cyan-400">{fighter.stats.sigStrikesPerMin}</p>
                <p className="text-xs text-zinc-500">Sig. Strikes/Min</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-white/5">
                <p className="text-xl font-bold text-cyan-400">{fighter.stats.sigStrikeAccuracy}%</p>
                <p className="text-xs text-zinc-500">Strike Accuracy</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-white/5">
                <p className="text-xl font-bold text-cyan-400">{fighter.stats.takedownAvg}</p>
                <p className="text-xs text-zinc-500">Takedowns/15m</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-white/5">
                <p className="text-xl font-bold text-cyan-400">{fighter.stats.takedownDefense}%</p>
                <p className="text-xs text-zinc-500">TD Defense</p>
              </div>
            </div>
          </div>
        )}

        {/* Betting Profile */}
        {fighter.bettingProfile && (
          <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              Betting Profile
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-sm text-zinc-400">As Favorite</p>
                <p className="text-lg font-bold text-emerald-400">{fighter.bettingProfile.favoriteRecord}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-sm text-zinc-400">As Underdog</p>
                <p className="text-lg font-bold text-amber-400">{fighter.bettingProfile.underdogRecord}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-sm text-zinc-400">Finish Rate</p>
                <p className="text-lg font-bold text-red-400">{fighter.bettingProfile.finishRate}%</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-sm text-zinc-400">Avg Fight Time</p>
                <p className="text-lg font-bold text-zinc-300">{fighter.bettingProfile.avgFightTime}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-sm text-zinc-400">Decision Rate</p>
                <p className="text-lg font-bold text-zinc-300">{fighter.bettingProfile.decisionRate}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Fight History */}
        {fighter.fightHistory && fighter.fightHistory.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-zinc-400" />
              Recent Fights
            </h3>
            <div className="space-y-3">
              {fighter.fightHistory.map((fight, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    fight.result === "W" ? "bg-emerald-500/20 text-emerald-400" :
                    fight.result === "L" ? "bg-red-500/20 text-red-400" :
                    "bg-zinc-500/20 text-zinc-400"
                  }`}>
                    {fight.result}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">vs. {fight.opponent}</p>
                    <p className="text-sm text-zinc-400">{fight.method} • R{fight.round}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-zinc-400">{fight.event}</p>
                    <p className="text-xs text-zinc-500">{fight.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/scout")}
            className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-colors text-left min-h-[64px]"
          >
            <MessageSquare className="w-5 h-5 text-violet-400 mb-2" />
            <p className="font-medium text-white">Ask Coach G</p>
            <p className="text-xs text-zinc-400">Get fight predictions</p>
          </button>
          <button
            onClick={() => navigate("/odds")}
            className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors text-left min-h-[64px]"
          >
            <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
            <p className="font-medium text-white">View Odds</p>
            <p className="text-xs text-zinc-400">Upcoming fights</p>
          </button>
        </div>
      </div>
    </div>
  );
}
