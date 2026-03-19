import { useState, useMemo } from "react";
import { Trophy, Check, Flame, Lock, Crown, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";

// Types
interface BracketTeam {
  seed: number;
  name: string;
  record?: string;
  logo?: string;
  eliminated?: boolean;
}

interface BracketMatchup {
  id: string;
  round: number;
  position: number;
  region?: string;
  team1: BracketTeam | null;
  team2: BracketTeam | null;
  winner: string | null;
  actualWinner?: string | null;
  gameTime?: string;
  isLocked: boolean;
  nextMatchupId?: string;
}

interface BracketPick {
  matchupId: string;
  winner: string;
  round: number;
}

interface BracketVisualizationProps {
  matchups: BracketMatchup[];
  picks: Map<string, BracketPick>;
  onPick: (matchup: BracketMatchup, winner: string) => void;
  bracketSize: number;
  regions?: string[];
  roundNames: string[];
  roundPoints: number[];
  viewMode?: "picks" | "results" | "compare";
  isLive?: boolean;
}

// Seed color styling
function getSeedStyle(seed: number) {
  if (seed <= 4) return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";
  if (seed <= 8) return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
  if (seed <= 12) return "bg-amber-500/20 text-amber-600 dark:text-amber-400";
  return "bg-red-500/20 text-red-600 dark:text-red-400";
}

export function BracketVisualization({
  matchups,
  picks,
  onPick,
  bracketSize,
  regions,
  roundNames,
  roundPoints,
  viewMode = "picks",
  isLive = false,
}: BracketVisualizationProps) {
  const [activeRegion, setActiveRegion] = useState<string>(regions?.[0] || "bracket");
  const [mobileRound, setMobileRound] = useState(1);

  const totalRounds = Math.log2(bracketSize);

  // Group matchups by round and region
  const { matchupsByRound, matchupsByRegion, finalFourMatchups, championshipMatchup } = useMemo(() => {
    const byRound: Record<number, BracketMatchup[]> = {};
    const byRegion: Record<string, BracketMatchup[]> = {};

    matchups.forEach(m => {
      if (!byRound[m.round]) byRound[m.round] = [];
      byRound[m.round].push(m);

      if (m.region) {
        if (!byRegion[m.region]) byRegion[m.region] = [];
        byRegion[m.region].push(m);
      }
    });

    const ff = byRound[totalRounds - 1] || [];
    const champ = byRound[totalRounds]?.[0];

    return {
      matchupsByRound: byRound,
      matchupsByRegion: byRegion,
      finalFourMatchups: ff,
      championshipMatchup: champ,
    };
  }, [matchups, totalRounds]);

  // Calculate stats
  const stats = useMemo(() => {
    const pickableMatchups = matchups.filter(m => m.team1 && m.team2 && !m.isLocked);
    const pickedMatchups = pickableMatchups.filter(m => picks.has(m.id));
    
    let upsets = 0;
    let correctPicks = 0;
    let pointsEarned = 0;
    let potentialPoints = 0;

    picks.forEach((pick, matchupId) => {
      const matchup = matchups.find(m => m.id === matchupId);
      if (!matchup?.team1 || !matchup?.team2) return;

      const winner = matchup.team1.name === pick.winner ? matchup.team1 : matchup.team2;
      const loser = matchup.team1.name === pick.winner ? matchup.team2 : matchup.team1;
      
      if (winner.seed > loser.seed) upsets++;
      
      if (matchup.actualWinner) {
        if (matchup.actualWinner === pick.winner) {
          correctPicks++;
          pointsEarned += roundPoints[matchup.round - 1] || 10;
        }
      } else {
        potentialPoints += roundPoints[matchup.round - 1] || 10;
      }
    });

    return {
      total: bracketSize - 1,
      picked: pickedMatchups.length,
      upsets,
      correctPicks,
      pointsEarned,
      potentialPoints,
    };
  }, [matchups, picks, bracketSize, roundPoints]);

  // Get champion pick
  const championPick = useMemo(() => {
    if (!championshipMatchup) return null;
    const pick = picks.get(championshipMatchup.id);
    if (!pick) return null;
    
    const team = championshipMatchup.team1?.name === pick.winner 
      ? championshipMatchup.team1 
      : championshipMatchup.team2;
    return team;
  }, [championshipMatchup, picks]);

  return (
    <div className="space-y-4">
      {/* Champion Banner */}
      {championPick && (
        <div className="bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/20 rounded-2xl border border-amber-500/30 p-4">
          <div className="flex items-center justify-center gap-3">
            <Crown className="h-6 w-6 text-amber-500 animate-pulse" />
            <div className="text-center">
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wider">
                Your Champion
              </div>
              <div className="text-xl font-bold flex items-center gap-2 mt-1">
                <span className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
                  "bg-amber-500 text-white"
                )}>
                  {championPick.seed}
                </span>
                {championPick.name}
              </div>
            </div>
            <Crown className="h-6 w-6 text-amber-500 animate-pulse" />
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <StatPill label="Picked" value={`${stats.picked}/${stats.total}`} />
        {stats.upsets > 0 && (
          <StatPill 
            label="Upsets" 
            value={stats.upsets} 
            icon={<Flame className="h-3.5 w-3.5" />}
            variant="orange"
          />
        )}
        {isLive && stats.correctPicks > 0 && (
          <StatPill 
            label="Correct" 
            value={stats.correctPicks} 
            icon={<Check className="h-3.5 w-3.5" />}
            variant="green"
          />
        )}
        {isLive && stats.pointsEarned > 0 && (
          <StatPill 
            label="Points" 
            value={stats.pointsEarned} 
            icon={<Zap className="h-3.5 w-3.5" />}
            variant="purple"
          />
        )}
      </div>

      {/* Desktop: Region Tabs */}
      {regions && (
        <div className="hidden lg:block">
          <Tabs value={activeRegion} onValueChange={setActiveRegion}>
            <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${regions.length + 1}, 1fr)` }}>
              {regions.map(region => (
                <TabsTrigger key={region} value={region} className="gap-1.5">
                  {region}
                  <span className="text-xs opacity-60">
                    {(matchupsByRegion[region] || []).filter(m => picks.has(m.id)).length}/
                    {(matchupsByRegion[region] || []).length}
                  </span>
                </TabsTrigger>
              ))}
              <TabsTrigger value="final-four" className="gap-1.5">
                <Trophy className="h-3.5 w-3.5" />
                Final Four
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Desktop: Bracket View */}
      <div className="hidden lg:block">
        {activeRegion !== "final-four" && regions ? (
          <RegionBracketView
            region={activeRegion}
            matchups={matchupsByRegion[activeRegion] || []}
            picks={picks}
            onPick={onPick}
            roundNames={roundNames}
            roundPoints={roundPoints}
            viewMode={viewMode}
          />
        ) : (
          <FinalFourView
            finalFourMatchups={finalFourMatchups}
            championshipMatchup={championshipMatchup}
            picks={picks}
            onPick={onPick}
            regions={regions}
            roundPoints={roundPoints}
            totalRounds={totalRounds}
            viewMode={viewMode}
          />
        )}
      </div>

      {/* Mobile: Round-by-round */}
      <div className="lg:hidden">
        <MobileRoundNav
          currentRound={mobileRound}
          totalRounds={totalRounds}
          roundNames={roundNames}
          roundPoints={roundPoints}
          onPrev={() => setMobileRound(Math.max(1, mobileRound - 1))}
          onNext={() => setMobileRound(Math.min(totalRounds, mobileRound + 1))}
        />

        <div className="space-y-3 mt-4">
          {(matchupsByRound[mobileRound] || []).map(matchup => (
            <MobileMatchupCard
              key={matchup.id}
              matchup={matchup}
              pick={picks.get(matchup.id)}
              onPick={onPick}
              viewMode={viewMode}
            />
          ))}

          {(!matchupsByRound[mobileRound] || matchupsByRound[mobileRound].length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Complete earlier rounds to reveal matchups</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Stat Pill Component
function StatPill({ 
  label, 
  value, 
  icon, 
  variant = "default" 
}: { 
  label: string; 
  value: string | number; 
  icon?: React.ReactNode;
  variant?: "default" | "orange" | "green" | "purple";
}) {
  const variants = {
    default: "bg-muted",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };

  return (
    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap", variants[variant])}>
      {icon}
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

// Region Bracket View - Full tournament tree
interface RegionBracketViewProps {
  region: string;
  matchups: BracketMatchup[];
  picks: Map<string, BracketPick>;
  onPick: (matchup: BracketMatchup, winner: string) => void;
  roundNames: string[];
  roundPoints: number[];
  viewMode: "picks" | "results" | "compare";
}

function RegionBracketView({ 
  region, 
  matchups, 
  picks, 
  onPick, 
  roundNames, 
  roundPoints,
  viewMode,
}: RegionBracketViewProps) {
  // Group by round
  const matchupsByRound: Record<number, BracketMatchup[]> = {};
  matchups.forEach(m => {
    if (!matchupsByRound[m.round]) matchupsByRound[m.round] = [];
    matchupsByRound[m.round].push(m);
  });

  const rounds = Object.keys(matchupsByRound).map(Number).sort((a, b) => a - b);
  const maxRound = Math.max(...rounds);

  return (
    <div className="relative overflow-x-auto pb-4">
      <div className="min-w-[900px]">
        {/* Region Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {region} Region
          </h2>
        </div>

        {/* Bracket Grid */}
        <div className="flex gap-2 justify-center">
          {rounds.map((round) => {
            const roundMatchups = matchupsByRound[round] || [];
            const spacing = Math.pow(2, round - 1);
            
            return (
              <div key={round} className="flex flex-col">
                {/* Round Header */}
                <div className="text-center mb-3 sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10">
                  <div className="font-semibold text-sm">{roundNames[round - 1]}</div>
                  <div className="text-xs text-primary font-medium">{roundPoints[round - 1]} pts</div>
                </div>

                {/* Matchups */}
                <div 
                  className="flex flex-col justify-around flex-1 gap-1"
                  style={{ minHeight: `${roundMatchups.length * 90 * spacing}px` }}
                >
                  {roundMatchups.map((matchup, idx) => (
                    <div 
                      key={matchup.id}
                      className="relative flex items-center"
                      style={{ 
                        paddingTop: idx === 0 ? `${(spacing - 1) * 45}px` : undefined,
                        paddingBottom: idx === roundMatchups.length - 1 ? `${(spacing - 1) * 45}px` : undefined,
                      }}
                    >
                      {/* Connector Line to Next Round */}
                      {round < maxRound && (
                        <div className="absolute right-0 top-1/2 w-4 h-px bg-border -translate-y-1/2" />
                      )}
                      
                      <BracketMatchupCard
                        matchup={matchup}
                        pick={picks.get(matchup.id)}
                        onPick={onPick}
                        viewMode={viewMode}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Final Four View
interface FinalFourViewProps {
  finalFourMatchups: BracketMatchup[];
  championshipMatchup?: BracketMatchup;
  picks: Map<string, BracketPick>;
  onPick: (matchup: BracketMatchup, winner: string) => void;
  regions?: string[] | null;
  roundPoints: number[];
  totalRounds: number;
  viewMode: "picks" | "results" | "compare";
}

function FinalFourView({
  finalFourMatchups,
  championshipMatchup,
  picks,
  onPick,
  regions,
  roundPoints,
  totalRounds,
  viewMode,
}: FinalFourViewProps) {
  return (
    <div className="py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Trophy className="h-6 w-6 text-amber-500" />
          <span className="bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">
            Final Four
          </span>
          <Trophy className="h-6 w-6 text-amber-500" />
        </h2>
      </div>

      <div className="flex flex-col items-center gap-8">
        {/* Semifinals Row */}
        <div className="flex items-center gap-16">
          {/* Left Semifinal */}
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs text-muted-foreground font-medium">
              {regions ? `${regions[0]} vs ${regions[1]}` : 'Semifinal 1'}
            </div>
            {finalFourMatchups[0] && (
              <BracketMatchupCard
                matchup={finalFourMatchups[0]}
                pick={picks.get(finalFourMatchups[0].id)}
                onPick={onPick}
                size="large"
                viewMode={viewMode}
              />
            )}
            <div className="text-xs text-primary font-medium">
              {roundPoints[totalRounds - 2]} pts
            </div>
          </div>

          {/* Connector */}
          <div className="flex flex-col items-center gap-4">
            <div className="h-24 w-px bg-gradient-to-b from-border via-amber-500/50 to-border" />
          </div>

          {/* Right Semifinal */}
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs text-muted-foreground font-medium">
              {regions ? `${regions[2]} vs ${regions[3]}` : 'Semifinal 2'}
            </div>
            {finalFourMatchups[1] && (
              <BracketMatchupCard
                matchup={finalFourMatchups[1]}
                pick={picks.get(finalFourMatchups[1].id)}
                onPick={onPick}
                size="large"
                viewMode={viewMode}
              />
            )}
            <div className="text-xs text-primary font-medium">
              {roundPoints[totalRounds - 2]} pts
            </div>
          </div>
        </div>

        {/* Championship */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-amber-500 font-bold flex items-center gap-1.5">
            <Crown className="h-4 w-4" />
            Championship
            <Crown className="h-4 w-4" />
          </div>
          {championshipMatchup && (
            <BracketMatchupCard
              matchup={championshipMatchup}
              pick={picks.get(championshipMatchup.id)}
              onPick={onPick}
              size="championship"
              viewMode={viewMode}
            />
          )}
          <div className="text-sm text-amber-500 font-bold">
            {roundPoints[totalRounds - 1]} pts
          </div>
        </div>
      </div>
    </div>
  );
}

// Bracket Matchup Card
interface BracketMatchupCardProps {
  matchup: BracketMatchup;
  pick?: BracketPick;
  onPick: (matchup: BracketMatchup, winner: string) => void;
  size?: "default" | "large" | "championship";
  viewMode: "picks" | "results" | "compare";
}

function BracketMatchupCard({ 
  matchup, 
  pick, 
  onPick, 
  size = "default",
  viewMode,
}: BracketMatchupCardProps) {
  const canPick = !!(matchup.team1 && matchup.team2 && !matchup.isLocked && viewMode === "picks");
  
  const isUpset = pick && matchup.team1 && matchup.team2 && (() => {
    const winner = matchup.team1.name === pick.winner ? matchup.team1 : matchup.team2;
    const loser = matchup.team1.name === pick.winner ? matchup.team2 : matchup.team1;
    return winner.seed > loser.seed;
  })();

  const isCorrect = viewMode !== "picks" && matchup.actualWinner && pick?.winner === matchup.actualWinner;
  const isIncorrect = viewMode !== "picks" && matchup.actualWinner && pick && pick.winner !== matchup.actualWinner;

  const sizes = {
    default: "w-52",
    large: "w-60",
    championship: "w-64",
  };

  return (
    <div className={cn(
      "rounded-xl border bg-card/50 backdrop-blur-sm transition-all relative overflow-hidden",
      sizes[size],
      canPick && "hover:shadow-lg hover:border-primary/50 hover:bg-card cursor-pointer",
      size === "championship" && "border-amber-500/50 bg-gradient-to-br from-amber-500/5 to-transparent shadow-amber-500/10",
      isUpset && "ring-2 ring-orange-500/50",
      isCorrect && "ring-2 ring-emerald-500/50 bg-emerald-500/5",
      isIncorrect && "ring-2 ring-red-500/50 bg-red-500/5",
    )}>
      {/* Upset indicator */}
      {isUpset && (
        <div className="absolute -top-1 -right-1 z-10">
          <Badge variant="secondary" className="bg-orange-500 text-white text-[10px] px-1.5 py-0 gap-0.5">
            <Flame className="h-2.5 w-2.5" />
            Upset
          </Badge>
        </div>
      )}

      {/* Team 1 */}
      <TeamSlotNew
        team={matchup.team1}
        isSelected={pick?.winner === matchup.team1?.name}
        canSelect={canPick}
        onSelect={() => matchup.team1 && onPick(matchup, matchup.team1.name)}
        position="top"
        isChampionship={size === "championship"}
        isCorrect={!!(isCorrect && pick?.winner === matchup.team1?.name)}
        isEliminated={!!(matchup.team1?.eliminated || (matchup.actualWinner && matchup.actualWinner !== matchup.team1?.name))}
      />

      <div className="h-px bg-border/50" />

      {/* Team 2 */}
      <TeamSlotNew
        team={matchup.team2}
        isSelected={pick?.winner === matchup.team2?.name}
        canSelect={canPick}
        onSelect={() => matchup.team2 && onPick(matchup, matchup.team2.name)}
        position="bottom"
        isChampionship={size === "championship"}
        isCorrect={!!(isCorrect && pick?.winner === matchup.team2?.name)}
        isEliminated={!!(matchup.team2?.eliminated || (matchup.actualWinner && matchup.actualWinner !== matchup.team2?.name))}
      />

      {/* Lock overlay */}
      {matchup.isLocked && viewMode === "picks" && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// Team Slot Component
interface TeamSlotNewProps {
  team: BracketTeam | null;
  isSelected: boolean;
  canSelect: boolean;
  onSelect: () => void;
  position: "top" | "bottom";
  isChampionship: boolean;
  isCorrect?: boolean;
  isEliminated?: boolean;
}

function TeamSlotNew({ 
  team, 
  isSelected, 
  canSelect, 
  onSelect, 
  position, 
  isChampionship,
  isCorrect,
  isEliminated,
}: TeamSlotNewProps) {
  if (!team) {
    return (
      <div className={cn(
        "flex items-center gap-2 p-2.5 text-muted-foreground",
        position === "top" ? "rounded-t-xl" : "rounded-b-xl"
      )}>
        <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center text-xs font-medium">
          ?
        </div>
        <span className="text-sm italic">TBD</span>
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      disabled={!canSelect}
      className={cn(
        "w-full flex items-center gap-2 p-2.5 transition-all group",
        position === "top" ? "rounded-t-xl" : "rounded-b-xl",
        canSelect && "hover:bg-primary/5 active:scale-[0.98]",
        !canSelect && "cursor-default",
        isSelected && !isChampionship && "bg-primary/10",
        isSelected && isChampionship && "bg-amber-500/15",
        isCorrect && "bg-emerald-500/10",
        isEliminated && "opacity-50",
      )}
    >
      {/* Seed badge */}
      <div className={cn(
        "w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 transition-all",
        getSeedStyle(team.seed),
        isSelected && !isChampionship && "bg-primary text-primary-foreground",
        isSelected && isChampionship && "bg-amber-500 text-white",
        isCorrect && "bg-emerald-500 text-white",
      )}>
        {team.seed}
      </div>

      {/* Team info */}
      <div className="flex-1 text-left min-w-0">
        <div className={cn(
          "text-sm font-medium truncate transition-all",
          isSelected && "font-semibold",
          isEliminated && "line-through text-muted-foreground",
        )}>
          {team.name}
        </div>
        {team.record && (
          <div className="text-[10px] text-muted-foreground">{team.record}</div>
        )}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
          isChampionship ? "bg-amber-500" : isCorrect ? "bg-emerald-500" : "bg-primary"
        )}>
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
    </button>
  );
}

// Mobile Round Navigation
function MobileRoundNav({
  currentRound,
  totalRounds,
  roundNames,
  roundPoints,
  onPrev,
  onNext,
}: {
  currentRound: number;
  totalRounds: number;
  roundNames: string[];
  roundPoints: number[];
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-3 bg-muted/30 rounded-xl border">
      <button
        onClick={onPrev}
        disabled={currentRound === 1}
        className="p-2 rounded-lg hover:bg-muted/50 disabled:opacity-30 transition-all"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="text-center">
        <div className="font-bold">{roundNames[currentRound - 1]}</div>
        <div className="text-xs text-primary font-medium">
          {roundPoints[currentRound - 1]} pts per pick
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={currentRound === totalRounds}
        className="p-2 rounded-lg hover:bg-muted/50 disabled:opacity-30 transition-all"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

// Mobile Matchup Card
function MobileMatchupCard({
  matchup,
  pick,
  onPick,
  viewMode,
}: {
  matchup: BracketMatchup;
  pick?: BracketPick;
  onPick: (matchup: BracketMatchup, winner: string) => void;
  viewMode: "picks" | "results" | "compare";
}) {
  const canPick = !!(matchup.team1 && matchup.team2 && !matchup.isLocked && viewMode === "picks");
  
  const isUpset = pick && matchup.team1 && matchup.team2 && (() => {
    const winner = matchup.team1.name === pick.winner ? matchup.team1 : matchup.team2;
    const loser = matchup.team1.name === pick.winner ? matchup.team2 : matchup.team1;
    return winner.seed > loser.seed;
  })();

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden",
      isUpset && "ring-2 ring-orange-500/50",
    )}>
      {/* Header */}
      {matchup.region && (
        <div className="px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground flex items-center justify-between">
          <span>{matchup.region} Region</span>
          {isUpset && (
            <Badge variant="secondary" className="bg-orange-500/20 text-orange-600 text-[10px] gap-0.5">
              <Flame className="h-3 w-3" />
              Upset
            </Badge>
          )}
        </div>
      )}

      {/* Teams */}
      <div className="divide-y divide-border/50">
        <MobileTeamRow
          team={matchup.team1}
          isSelected={pick?.winner === matchup.team1?.name}
          canSelect={canPick}
          onSelect={() => matchup.team1 && onPick(matchup, matchup.team1.name)}
        />
        <MobileTeamRow
          team={matchup.team2}
          isSelected={pick?.winner === matchup.team2?.name}
          canSelect={canPick}
          onSelect={() => matchup.team2 && onPick(matchup, matchup.team2.name)}
        />
      </div>
    </div>
  );
}

// Mobile Team Row
function MobileTeamRow({
  team,
  isSelected,
  canSelect,
  onSelect,
}: {
  team: BracketTeam | null;
  isSelected: boolean;
  canSelect: boolean;
  onSelect: () => void;
}) {
  if (!team) {
    return (
      <div className="flex items-center gap-3 p-4 text-muted-foreground">
        <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center text-sm font-medium">?</div>
        <span className="italic">To be determined</span>
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      disabled={!canSelect}
      className={cn(
        "w-full flex items-center gap-3 p-4 transition-all",
        canSelect && "active:bg-muted/50",
        !canSelect && "cursor-default",
        isSelected && "bg-primary/10",
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
        getSeedStyle(team.seed),
        isSelected && "bg-primary text-primary-foreground",
      )}>
        {team.seed}
      </div>
      
      <div className="flex-1 text-left min-w-0">
        <div className={cn("font-medium truncate", isSelected && "font-semibold")}>
          {team.name}
        </div>
        {team.record && (
          <div className="text-xs text-muted-foreground">{team.record}</div>
        )}
      </div>

      {isSelected && (
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Check className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </button>
  );
}

export default BracketVisualization;
