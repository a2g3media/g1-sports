/**
 * MMA Fight Page - Individual Fight Detail View
 * 
 * Shows detailed breakdown of a specific fight including
 * fighter comparison, odds, and Coach G betting insights.
 */

import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Trophy, ChevronLeft, Target, Zap, MessageSquare, TrendingUp,
  Activity
} from "lucide-react";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { deriveUnifiedViewMode, UnifiedVideoPanel } from "@/react-app/components/game-state/StateModePanels";

interface Fighter {
  id: string;
  name: string;
  nickname?: string;
  record: string;
  country: string;
  weightClass: string;
  espnId?: string;
  stats?: {
    height: string;
    reach: string;
    stance: string;
    sigStrikesPerMin: number;
    takedownAvg: number;
    subAvg: number;
    knockdownRatio: number;
  };
}

interface Fight {
  id: string;
  eventId: string;
  eventName: string;
  fighterA: Fighter;
  fighterB: Fighter;
  weightClass: string;
  rounds: number;
  isMainEvent?: boolean;
  isCoMain?: boolean;
  isTitleFight?: boolean;
  odds?: { fighterA: string; fighterB: string };
  result?: { winner: string; method: string; round: number; time: string };
  coachInsights: string[];
  bettingAngles: { title: string; description: string; edge: string }[];
}

// Fighter database with extended stats
const FIGHTERS: Record<string, Fighter> = {
  mcgregor: { id: "mcgregor", name: "Conor McGregor", nickname: "Notorious", record: "22-6-0", country: "Ireland", weightClass: "Lightweight", espnId: "3022677", stats: { height: "5'9\"", reach: "74\"", stance: "Southpaw", sigStrikesPerMin: 5.32, takedownAvg: 0.52, subAvg: 0.3, knockdownRatio: 3.1 } },
  chandler: { id: "chandler", name: "Michael Chandler", nickname: "Iron", record: "23-8-0", country: "USA", weightClass: "Lightweight", espnId: "2335668", stats: { height: "5'8\"", reach: "69\"", stance: "Orthodox", sigStrikesPerMin: 4.87, takedownAvg: 2.1, subAvg: 0.0, knockdownRatio: 2.2 } },
  pereira: { id: "pereira", name: "Alex Pereira", nickname: "Poatan", record: "11-2-0", country: "Brazil", weightClass: "Light Heavyweight", espnId: "4872076", stats: { height: "6'4\"", reach: "79\"", stance: "Orthodox", sigStrikesPerMin: 5.78, takedownAvg: 0.0, subAvg: 0.0, knockdownRatio: 4.2 } },
  prochazka: { id: "prochazka", name: "Jiri Prochazka", nickname: "Denisa", record: "30-4-0", country: "Czech Republic", weightClass: "Light Heavyweight", espnId: "2563627", stats: { height: "6'3\"", reach: "80\"", stance: "Orthodox", sigStrikesPerMin: 6.21, takedownAvg: 0.3, subAvg: 0.5, knockdownRatio: 2.8 } },
  poirier: { id: "poirier", name: "Dustin Poirier", nickname: "The Diamond", record: "30-8-0", country: "USA", weightClass: "Lightweight", espnId: "2556298", stats: { height: "5'9\"", reach: "72\"", stance: "Southpaw", sigStrikesPerMin: 6.02, takedownAvg: 0.8, subAvg: 0.7, knockdownRatio: 2.0 } },
  gaethje: { id: "gaethje", name: "Justin Gaethje", nickname: "The Highlight", record: "25-5-0", country: "USA", weightClass: "Lightweight", espnId: "2560678", stats: { height: "5'11\"", reach: "70\"", stance: "Orthodox", sigStrikesPerMin: 7.54, takedownAvg: 0.2, subAvg: 0.0, knockdownRatio: 3.5 } },
  costa: { id: "costa", name: "Paulo Costa", nickname: "Borrachinha", record: "14-3-0", country: "Brazil", weightClass: "Middleweight", espnId: "3153313", stats: { height: "6'0\"", reach: "72\"", stance: "Orthodox", sigStrikesPerMin: 7.42, takedownAvg: 0.5, subAvg: 0.0, knockdownRatio: 2.1 } },
  strickland: { id: "strickland", name: "Sean Strickland", nickname: "Tarzan", record: "29-6-0", country: "USA", weightClass: "Middleweight", espnId: "2553735", stats: { height: "6'1\"", reach: "76\"", stance: "Orthodox", sigStrikesPerMin: 5.89, takedownAvg: 0.6, subAvg: 0.0, knockdownRatio: 0.5 } },
  moreno: { id: "moreno", name: "Brandon Moreno", nickname: "The Assassin Baby", record: "21-7-0", country: "Mexico", weightClass: "Flyweight", espnId: "3018825", stats: { height: "5'7\"", reach: "70\"", stance: "Orthodox", sigStrikesPerMin: 4.85, takedownAvg: 1.2, subAvg: 1.1, knockdownRatio: 0.8 } },
  royval: { id: "royval", name: "Brandon Royval", nickname: "Raw Dawg", record: "16-7-0", country: "USA", weightClass: "Flyweight", espnId: "4285672", stats: { height: "5'9\"", reach: "69\"", stance: "Orthodox", sigStrikesPerMin: 5.12, takedownAvg: 0.8, subAvg: 2.3, knockdownRatio: 0.6 } },
};

// Fights database
const FIGHTS: Record<string, Fight> = {
  "ufc303-main": {
    id: "ufc303-main",
    eventId: "ufc-303",
    eventName: "UFC 303",
    fighterA: FIGHTERS.mcgregor,
    fighterB: FIGHTERS.chandler,
    weightClass: "Lightweight",
    rounds: 5,
    isMainEvent: true,
    odds: { fighterA: "-170", fighterB: "+145" },
    coachInsights: [
      "McGregor's counter-striking makes him dangerous early but cardio is a question mark",
      "Chandler's wrestling is improved but he may prefer to stand and trade",
      "First round knockout is the most likely finish scenario",
      "Sharp money has moved toward Chandler as underdog value",
    ],
    bettingAngles: [
      { title: "First Round Finish", description: "Both fighters have high KO rates early", edge: "+150" },
      { title: "Fight Doesn't Go Distance", description: "85% of McGregor fights end before decision", edge: "-250" },
      { title: "Chandler by KO", description: "Value play if McGregor's chin has declined", edge: "+280" },
    ],
  },
  "ufc303-co": {
    id: "ufc303-co",
    eventId: "ufc-303",
    eventName: "UFC 303",
    fighterA: FIGHTERS.pereira,
    fighterB: FIGHTERS.prochazka,
    weightClass: "Light Heavyweight",
    rounds: 5,
    isCoMain: true,
    isTitleFight: true,
    odds: { fighterA: "-250", fighterB: "+200" },
    coachInsights: [
      "Pereira's power makes him favorite but Prochazka is unpredictable",
      "Prochazka's wild style could catch Pereira off guard",
      "Title fight experience favors Pereira heavily",
      "This fight is unlikely to see the scorecards",
    ],
    bettingAngles: [
      { title: "Pereira by KO", description: "91% finish rate with devastating power", edge: "-175" },
      { title: "Under 2.5 Rounds", description: "Neither fighter known for long fights", edge: "-130" },
      { title: "Prochazka Inside Distance", description: "Live underdog with finishing ability", edge: "+450" },
    ],
  },
  "ufc303-3": {
    id: "ufc303-3",
    eventId: "ufc-303",
    eventName: "UFC 303",
    fighterA: FIGHTERS.poirier,
    fighterB: FIGHTERS.gaethje,
    weightClass: "Lightweight",
    rounds: 3,
    odds: { fighterA: "+110", fighterB: "-130" },
    coachInsights: [
      "Rematch of 2018 classic - Poirier won by KO in R4",
      "Both fighters have evolved significantly since first meeting",
      "This fight is guaranteed action and unlikely to go to decision",
      "Gaethje's leg kicks could be the X-factor this time",
    ],
    bettingAngles: [
      { title: "Fight of the Night", description: "These two always deliver violence", edge: "+120" },
      { title: "Gaethje by TKO", description: "Leg kick accumulation strategy", edge: "+250" },
      { title: "Over 1.5 Rounds", description: "Both durable enough to survive early", edge: "-180" },
    ],
  },
  "ufc303-4": {
    id: "ufc303-4",
    eventId: "ufc-303",
    eventName: "UFC 303",
    fighterA: FIGHTERS.costa,
    fighterB: FIGHTERS.strickland,
    weightClass: "Middleweight",
    rounds: 3,
    odds: { fighterA: "+180", fighterB: "-220" },
    coachInsights: [
      "Strickland's volume should control this fight",
      "Costa needs early knockout to win - cardio fades",
      "Style matchup favors the technical Strickland",
      "Live betting opportunity if Costa lands early",
    ],
    bettingAngles: [
      { title: "Strickland by Decision", description: "His path to victory is points", edge: "+110" },
      { title: "Costa Round 1 KO", description: "Only realistic win condition", edge: "+500" },
      { title: "Goes to Decision", description: "If Costa doesn't finish early, Strickland cruises", edge: "-150" },
    ],
  },
  "ufc303-5": {
    id: "ufc303-5",
    eventId: "ufc-303",
    eventName: "UFC 303",
    fighterA: FIGHTERS.moreno,
    fighterB: FIGHTERS.royval,
    weightClass: "Flyweight",
    rounds: 3,
    odds: { fighterA: "-145", fighterB: "+120" },
    coachInsights: [
      "Moreno's championship experience is the edge",
      "Royval's unorthodox style can create chaos",
      "Submission attempts likely from both fighters",
      "Coin flip fight with slight edge to Moreno",
    ],
    bettingAngles: [
      { title: "Royval by Sub", description: "2.3 submission attempts per 15 minutes", edge: "+350" },
      { title: "Moreno by Decision", description: "More likely to outwork than finish", edge: "+200" },
      { title: "Over 2.5 Rounds", description: "Neither known for quick finishes", edge: "-160" },
    ],
  },
};

function getFighterPhoto(fighter: Fighter): string {
  if (fighter.espnId) {
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/mma/players/full/${fighter.espnId}.png&w=350&h=254`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(fighter.name)}&background=1a1a1a&color=fff&size=256`;
}

function StatComparison({ label, valueA, valueB, higherIsBetter = true }: { label: string; valueA: number; valueB: number; higherIsBetter?: boolean }) {
  const aWins = higherIsBetter ? valueA > valueB : valueA < valueB;
  const bWins = higherIsBetter ? valueB > valueA : valueB < valueA;
  
  return (
    <div className="flex items-center gap-4 py-2">
      <div className={`flex-1 text-right font-mono ${aWins ? 'text-emerald-400' : 'text-zinc-400'}`}>
        {valueA.toFixed(2)}
      </div>
      <div className="w-24 text-center text-xs text-zinc-500">{label}</div>
      <div className={`flex-1 text-left font-mono ${bWins ? 'text-emerald-400' : 'text-zinc-400'}`}>
        {valueB.toFixed(2)}
      </div>
    </div>
  );
}

export default function MMAFightPage() {
  const { fightId } = useParams<{ fightId: string }>();
  const navigate = useNavigate();

  const fight = useMemo(() => {
    return fightId ? FIGHTS[fightId] : null;
  }, [fightId]);
  const viewMode = deriveUnifiedViewMode(fight?.result ? "FINAL" : "SCHEDULED");

  if (!fight) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">Fight not found</p>
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
            onClick={() => navigate(`/sports/mma/event/${fight.eventId}`)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="font-bold text-white">{fight.eventName}</h1>
            <p className="text-sm text-zinc-400">{fight.weightClass} • {fight.rounds} Rounds</p>
          </div>
        </div>
      </div>

      {/* Hero - Fighter Matchup */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/30 via-red-900/10 to-[#0a0a0a]" />
        
        <div className="relative px-4 pt-6 pb-6">
          {/* Tags */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {fight.isMainEvent && (
              <span className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium">
                Main Event
              </span>
            )}
            {fight.isCoMain && (
              <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-medium">
                Co-Main
              </span>
            )}
            {fight.isTitleFight && (
              <span className="px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-sm font-medium flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Title Fight
              </span>
            )}
          </div>

          {/* Fighters */}
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <button
              onClick={() => navigate(`/sports/mma/fighter/${fight.fighterA.id}`)}
              className="flex flex-col items-center group"
            >
              <div className="relative">
                <div className="absolute -inset-2 bg-red-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <img
                  src={getFighterPhoto(fight.fighterA)}
                  alt={fight.fighterA.name}
                  className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-2 border-red-500/50 bg-zinc-800"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fight.fighterA.name)}&background=1a1a1a&color=fff&size=256`;
                  }}
                />
              </div>
              <h3 className="mt-3 text-lg font-bold text-white text-center">{fight.fighterA.name}</h3>
              {fight.fighterA.nickname && fight.fighterA.nickname !== "N/A" && (
                <p className="text-sm text-red-400">"{fight.fighterA.nickname}"</p>
              )}
              <p className="text-sm text-zinc-400">{fight.fighterA.record}</p>
              {fight.odds && (
                <span className={`mt-2 px-3 py-1 rounded text-sm font-mono ${
                  fight.odds.fighterA.startsWith('-') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {fight.odds.fighterA}
                </span>
              )}
            </button>

            <span className="text-2xl sm:text-3xl font-black text-red-500">VS</span>

            <button
              onClick={() => navigate(`/sports/mma/fighter/${fight.fighterB.id}`)}
              className="flex flex-col items-center group"
            >
              <div className="relative">
                <div className="absolute -inset-2 bg-red-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <img
                  src={getFighterPhoto(fight.fighterB)}
                  alt={fight.fighterB.name}
                  className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-2 border-red-500/50 bg-zinc-800"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fight.fighterB.name)}&background=1a1a1a&color=fff&size=256`;
                  }}
                />
              </div>
              <h3 className="mt-3 text-lg font-bold text-white text-center">{fight.fighterB.name}</h3>
              {fight.fighterB.nickname && fight.fighterB.nickname !== "N/A" && (
                <p className="text-sm text-red-400">"{fight.fighterB.nickname}"</p>
              )}
              <p className="text-sm text-zinc-400">{fight.fighterB.record}</p>
              {fight.odds && (
                <span className={`mt-2 px-3 py-1 rounded text-sm font-mono ${
                  fight.odds.fighterB.startsWith('-') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {fight.odds.fighterB}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 max-w-4xl mx-auto">
        {viewMode === "pregame" && (
          <div className="mb-6 rounded-xl border border-white/[0.08] bg-[#121821] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Pregame Fight Intelligence</p>
            <p className="mt-1 text-sm text-zinc-300">
              Matchup prep mode: striking efficiency, takedown pathways, and finish windows are the priority before cage lock.
            </p>
          </div>
        )}
        {viewMode === "final" && (
          <div className="mb-6 rounded-xl border border-violet-400/20 bg-[#121821] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Postfight Recap Mode</p>
            <p className="mt-1 text-sm text-zinc-300">
              Fight completed. Focus shifts to decisive exchanges, method of victory, and whether pre-fight signals held.
            </p>
          </div>
        )}

        {/* Coach G Insights */}
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-transparent border border-violet-500/20">
          <div className="flex items-center gap-3 mb-3">
            <CoachGAvatar size="sm" presence={viewMode === "final" ? "monitoring" : "alert"} className="border-violet-400/35" />
            <div>
              <h3 className="font-bold text-white">Coach G's Fight Breakdown</h3>
              <p className="text-sm text-violet-400">Fight Intelligence</p>
            </div>
          </div>
          <div className="space-y-2">
            {fight.coachInsights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                <p className="text-sm text-zinc-300">{insight}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stat Comparison */}
        {fight.fighterA.stats && fight.fighterB.stats && (
          <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Fighter Comparison
            </h3>
            
            {/* Physical */}
            <div className="mb-4">
              <p className="text-xs text-zinc-500 mb-2 text-center">Physical</p>
              <div className="flex items-center gap-4 py-2">
                <div className="flex-1 text-right text-zinc-400">{fight.fighterA.stats.height}</div>
                <div className="w-24 text-center text-xs text-zinc-500">Height</div>
                <div className="flex-1 text-left text-zinc-400">{fight.fighterB.stats.height}</div>
              </div>
              <div className="flex items-center gap-4 py-2">
                <div className="flex-1 text-right text-zinc-400">{fight.fighterA.stats.reach}</div>
                <div className="w-24 text-center text-xs text-zinc-500">Reach</div>
                <div className="flex-1 text-left text-zinc-400">{fight.fighterB.stats.reach}</div>
              </div>
              <div className="flex items-center gap-4 py-2">
                <div className="flex-1 text-right text-zinc-400">{fight.fighterA.stats.stance}</div>
                <div className="w-24 text-center text-xs text-zinc-500">Stance</div>
                <div className="flex-1 text-left text-zinc-400">{fight.fighterB.stats.stance}</div>
              </div>
            </div>

            {/* Performance */}
            <div>
              <p className="text-xs text-zinc-500 mb-2 text-center">Performance</p>
              <StatComparison 
                label="Sig. Strikes/Min" 
                valueA={fight.fighterA.stats.sigStrikesPerMin} 
                valueB={fight.fighterB.stats.sigStrikesPerMin} 
              />
              <StatComparison 
                label="Takedowns/15m" 
                valueA={fight.fighterA.stats.takedownAvg} 
                valueB={fight.fighterB.stats.takedownAvg} 
              />
              <StatComparison 
                label="Subs/15m" 
                valueA={fight.fighterA.stats.subAvg} 
                valueB={fight.fighterB.stats.subAvg} 
              />
              <StatComparison 
                label="Knockdown Ratio" 
                valueA={fight.fighterA.stats.knockdownRatio} 
                valueB={fight.fighterB.stats.knockdownRatio} 
              />
            </div>
          </div>
        )}

        {/* Betting Angles */}
        <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-400" />
            Betting Angles
          </h3>
          <div className="space-y-3">
            {fight.bettingAngles.map((angle, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-white">{angle.title}</h4>
                    <p className="text-sm text-zinc-400 mt-1">{angle.description}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-sm font-mono shrink-0 ${
                    angle.edge.startsWith('-') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {angle.edge}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {viewMode === "final" && (
          <div className="mb-6">
            <UnifiedVideoPanel
              title="Postgame Video"
              subtitle="Coach G recap clip for completed fight."
              fallbackText="Postfight Coach G recap video is not available yet."
              isPostgame
            />
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
            <p className="font-medium text-white">Compare Odds</p>
            <p className="text-xs text-zinc-400">Best sportsbook lines</p>
          </button>
        </div>
      </div>
    </div>
  );
}
