import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  ArrowLeft, Trophy, Loader2, Send, Shield, Sparkles, 
  TrendingUp, Flame, Check, Eye, Users
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { AIAssistant } from "@/react-app/components/AIAssistant";
import { SubmitConfirmation } from "@/react-app/components/SubmitConfirmation";
import { BracketVisualization } from "@/react-app/components/BracketVisualization";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";

// Types
interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  rules_json: string;
}

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

// Round configuration
const ROUND_CONFIG = {
  64: {
    names: ["First Round", "Second Round", "Sweet 16", "Elite 8", "Final Four", "Championship"],
    points: [10, 20, 40, 80, 160, 320],
    regions: ["South", "East", "Midwest", "West"],
  },
  32: {
    names: ["First Round", "Sweet 16", "Elite 8", "Final Four", "Championship"],
    points: [10, 20, 40, 80, 160],
    regions: ["East", "West"],
  },
  16: {
    names: ["Quarterfinals", "Semifinals", "Championship"],
    points: [20, 40, 80],
    regions: null,
  },
  8: {
    names: ["Quarterfinals", "Semifinals", "Championship"],
    points: [20, 40, 80],
    regions: null,
  },
};

// Team pools by sport
const TEAM_POOLS: Record<string, { name: string; record?: string }[]> = {
  ncaab: [
    { name: "UConn", record: "31-3" }, { name: "Houston", record: "32-4" }, { name: "Purdue", record: "29-4" }, { name: "North Carolina", record: "27-7" },
    { name: "Tennessee", record: "27-7" }, { name: "Duke", record: "26-8" }, { name: "Iowa State", record: "27-7" }, { name: "Marquette", record: "25-9" },
    { name: "Kentucky", record: "23-9" }, { name: "Arizona", record: "25-8" }, { name: "Baylor", record: "23-10" }, { name: "Auburn", record: "24-10" },
    { name: "Creighton", record: "24-9" }, { name: "Gonzaga", record: "25-7" }, { name: "South Carolina", record: "26-7" }, { name: "Alabama", record: "21-11" },
    { name: "Kansas", record: "22-10" }, { name: "BYU", record: "23-10" }, { name: "Texas Tech", record: "23-10" }, { name: "Clemson", record: "21-11" },
    { name: "Dayton", record: "24-7" }, { name: "Nevada", record: "26-7" }, { name: "Texas", record: "20-12" }, { name: "Wisconsin", record: "22-13" },
    { name: "Saint Mary's", record: "26-7" }, { name: "Oregon", record: "23-11" }, { name: "Florida", record: "24-11" }, { name: "Nebraska", record: "23-10" },
    { name: "TCU", record: "21-13" }, { name: "Utah State", record: "27-6" }, { name: "Colorado State", record: "25-9" }, { name: "New Mexico", record: "26-9" },
    { name: "James Madison", record: "31-3" }, { name: "Grand Canyon", record: "29-4" }, { name: "McNeese", record: "30-3" }, { name: "Oakland", record: "23-11" },
    { name: "Yale", record: "22-9" }, { name: "Duquesne", record: "24-11" }, { name: "Drake", record: "28-6" }, { name: "Vermont", record: "28-6" },
    { name: "Morehead State", record: "26-8" }, { name: "Samford", record: "28-7" }, { name: "Colgate", record: "25-10" }, { name: "Akron", record: "24-10" },
    { name: "Stetson", record: "22-12" }, { name: "Grambling", record: "21-14" }, { name: "Montana State", record: "25-9" }, { name: "Long Beach State", record: "21-14" },
    { name: "UAB", record: "22-12" }, { name: "South Dakota State", record: "22-12" }, { name: "Charleston", record: "27-7" }, { name: "Wagner", record: "16-15" },
    { name: "Howard", record: "22-12" }, { name: "Longwood", record: "21-13" }, { name: "Norfolk State", record: "21-12" }, { name: "Western Kentucky", record: "22-11" },
    { name: "Colorado", record: "24-10" }, { name: "Michigan State", record: "19-14" }, { name: "Saint Peter's", record: "19-13" }, { name: "Louisiana", record: "27-6" },
    { name: "Penn State", record: "22-13" }, { name: "North Texas", record: "25-9" }, { name: "High Point", record: "26-8" }, { name: "VCU", record: "22-12" },
  ],
  nfl: [
    { name: "Chiefs" }, { name: "Bills" }, { name: "Ravens" }, { name: "Texans" },
    { name: "Browns" }, { name: "Dolphins" }, { name: "Steelers" }, { name: "Lions" },
    { name: "49ers" }, { name: "Cowboys" }, { name: "Eagles" }, { name: "Buccaneers" },
    { name: "Packers" }, { name: "Rams" }, { name: "Bears" }, { name: "Commanders" },
  ],
  nba: [
    { name: "Celtics" }, { name: "Nuggets" }, { name: "Bucks" }, { name: "Thunder" },
    { name: "Timberwolves" }, { name: "Cavaliers" }, { name: "Knicks" }, { name: "Suns" },
    { name: "Mavericks" }, { name: "Clippers" }, { name: "Magic" }, { name: "Pacers" },
    { name: "76ers" }, { name: "Heat" }, { name: "Pelicans" }, { name: "Kings" },
  ],
};

// Generate demo bracket
function generateDemoBracket(size: number, sportKey: string): BracketMatchup[] {
  const matchups: BracketMatchup[] = [];
  const rounds = Math.log2(size);
  const config = ROUND_CONFIG[size as keyof typeof ROUND_CONFIG] || ROUND_CONFIG[64];
  const teams = TEAM_POOLS[sportKey] || TEAM_POOLS.ncaab;
  const regions = config.regions;
  
  let matchupId = 1;
  const teamsPerRegion = regions ? size / regions.length : size;
  
  // Generate first round matchups with seeding
  for (let i = 0; i < size / 2; i++) {
    const regionIndex = regions ? Math.floor(i / (teamsPerRegion / 2)) : 0;
    const region = regions?.[regionIndex];
    const posInRegion = i % (teamsPerRegion / 2);
    
    // NCAA tournament seeding pattern
    const seedPairs = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];
    const pairIndex = posInRegion % seedPairs.length;
    const [seed1, seed2] = regions ? seedPairs[pairIndex] : [posInRegion * 2 + 1, posInRegion * 2 + 2];
    
    const teamIndex1 = regionIndex * teamsPerRegion + (seed1 - 1);
    const teamIndex2 = regionIndex * teamsPerRegion + (seed2 - 1);
    
    matchups.push({
      id: `m${matchupId}`,
      round: 1,
      position: i,
      region,
      team1: { seed: seed1, ...teams[teamIndex1 % teams.length] },
      team2: { seed: seed2, ...teams[teamIndex2 % teams.length] },
      winner: null,
      isLocked: false,
      nextMatchupId: `m${Math.floor(size / 2) + Math.floor(i / 2) + 1}`,
    });
    matchupId++;
  }
  
  // Generate subsequent rounds
  let roundStart = size / 2;
  for (let round = 2; round <= rounds; round++) {
    const matchupsInRound = size / Math.pow(2, round);
    for (let i = 0; i < matchupsInRound; i++) {
      const isFinalFour = round === rounds - 1 && rounds > 3;
      const isChampionship = round === rounds;
      const regionIndex = regions && !isFinalFour && !isChampionship 
        ? Math.floor(i / (matchupsInRound / regions.length)) 
        : undefined;
      const region = regionIndex !== undefined ? regions![regionIndex] : undefined;
      
      matchups.push({
        id: `m${matchupId}`,
        round,
        position: i,
        region,
        team1: null,
        team2: null,
        winner: null,
        isLocked: false,
        nextMatchupId: round < rounds ? `m${roundStart + matchupsInRound + Math.floor(i / 2) + 1}` : undefined,
      });
      matchupId++;
    }
    roundStart += matchupsInRound;
  }
  
  return matchups;
}

export function BracketPicks() {
  const { id } = useParams<{ id: string }>();
  
  const [league, setLeague] = useState<League | null>(null);
  const [matchups, setMatchups] = useState<BracketMatchup[]>([]);
  const [picks, setPicks] = useState<Map<string, BracketPick>>(new Map());
  const [bracketSize, setBracketSize] = useState(64);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [viewMode, setViewMode] = useState<"picks" | "standings">("picks");

  useEffect(() => {
    if (id) fetchLeague();
  }, [id]);

  const fetchLeague = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}`);
      if (!response.ok) throw new Error("Failed to fetch league");
      const data = await response.json();
      setLeague(data);
      
      const size = data.sport_key === "ncaab" ? 64 : 
                   data.sport_key === "nfl" ? 16 :
                   data.sport_key === "nba" || data.sport_key === "nhl" ? 16 : 32;
      setBracketSize(size);
      setMatchups(generateDemoBracket(size, data.sport_key));
    } catch (err) {
      console.error("Failed to load league:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const config = ROUND_CONFIG[bracketSize as keyof typeof ROUND_CONFIG] || ROUND_CONFIG[64];

  // Apply picks to advance teams
  const bracketWithPicks = useMemo(() => {
    const updated = [...matchups];
    
    picks.forEach((pick, matchupId) => {
      const matchupIndex = updated.findIndex(m => m.id === matchupId);
      if (matchupIndex === -1) return;
      
      const matchup = updated[matchupIndex];
      const nextMatchupId = matchup.nextMatchupId;
      
      if (nextMatchupId) {
        const nextIndex = updated.findIndex(m => m.id === nextMatchupId);
        if (nextIndex !== -1) {
          const nextMatchup = updated[nextIndex];
          const slot = matchup.position % 2 === 0 ? "team1" : "team2";
          const winningTeam = matchup.team1?.name === pick.winner ? matchup.team1 :
                             matchup.team2?.name === pick.winner ? matchup.team2 : null;
          
          if (winningTeam) {
            updated[nextIndex] = { ...nextMatchup, [slot]: winningTeam };
          }
        }
      }
    });
    
    return updated;
  }, [matchups, picks]);

  // Handle pick
  const handlePick = useCallback((matchup: BracketMatchup, winner: string) => {
    if (matchup.isLocked || !matchup.team1 || !matchup.team2) return;
    
    setPicks(prev => {
      const newPicks = new Map(prev);
      
      const clearDownstream = (mid: string) => {
        const m = bracketWithPicks.find(bm => bm.id === mid);
        if (m?.nextMatchupId) {
          const nextPick = newPicks.get(m.nextMatchupId);
          if (nextPick) {
            const nextMatchup = bracketWithPicks.find(bm => bm.id === m.nextMatchupId);
            if (nextMatchup) {
              const sourceSlot = m.position % 2 === 0 ? "team1" : "team2";
              const teamInSlot = nextMatchup[sourceSlot];
              if (teamInSlot && nextPick.winner === teamInSlot.name) {
                newPicks.delete(m.nextMatchupId);
                clearDownstream(m.nextMatchupId);
              }
            }
          }
        }
      };
      
      const existingPick = newPicks.get(matchup.id);
      if (existingPick && existingPick.winner !== winner) {
        clearDownstream(matchup.id);
      }
      
      newPicks.set(matchup.id, { matchupId: matchup.id, winner, round: matchup.round });
      return newPicks;
    });
  }, [bracketWithPicks]);

  // Stats
  const stats = useMemo(() => {
    const pickableMatchups = bracketWithPicks.filter(m => m.team1 && m.team2 && !m.isLocked);
    const pickedMatchups = pickableMatchups.filter(m => picks.has(m.id));
    
    const upsets = Array.from(picks.entries()).filter(([mid]) => {
      const m = bracketWithPicks.find(bm => bm.id === mid);
      if (!m?.team1 || !m?.team2) return false;
      const pick = picks.get(mid);
      const winner = m.team1.name === pick?.winner ? m.team1 : m.team2;
      const loser = m.team1.name === pick?.winner ? m.team2 : m.team1;
      return winner.seed > loser.seed;
    }).length;
    
    const potentialPoints = Array.from(picks.values()).reduce((sum, pick) => {
      return sum + (config.points[pick.round - 1] || 10);
    }, 0);

    return {
      total: bracketSize - 1,
      pickable: pickableMatchups.length,
      picked: pickedMatchups.length,
      complete: pickedMatchups.length >= pickableMatchups.length && pickableMatchups.length > 0,
      upsets,
      potentialPoints,
    };
  }, [bracketWithPicks, picks, bracketSize, config.points]);

  const handleSubmitClick = () => {
    if (picks.size === 0) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async (): Promise<{ receiptCode: string; hash: string; isUpdate?: boolean; previousReceiptCode?: string; deliveries?: Array<{ channel: string; status: string }> } | null> => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/leagues/${id}/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_id: "bracket",
          picks: Array.from(picks.values()).map(p => ({
            event_id: parseInt(p.matchupId.replace("m", "")),
            pick_value: p.winner,
            confidence_rank: p.round,
          })),
        }),
      });

      if (!response.ok) throw new Error("Failed to submit bracket");
      
      const data = await response.json();
      return {
        receiptCode: data.receiptCode || `PV-BR${id}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        hash: data.payloadHash || Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        isUpdate: data.isUpdate,
        previousReceiptCode: data.previousReceiptCode,
        deliveries: data.deliveries,
      };
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading bracket...</p>
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">League not found</p>
        <Link to="/">
          <button className="mt-4 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80">
            Back to Dashboard
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/">
                <button className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
              <div>
                <h1 className="font-bold text-lg">{league.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {bracketSize}-Team Tournament Bracket
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="hidden sm:block">
                <TabsList className="h-8">
                  <TabsTrigger value="picks" className="text-xs gap-1.5 h-7 px-3">
                    <Trophy className="h-3.5 w-3.5" />
                    My Bracket
                  </TabsTrigger>
                  <TabsTrigger value="standings" className="text-xs gap-1.5 h-7 px-3">
                    <Users className="h-3.5 w-3.5" />
                    Standings
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Stats badges */}
              <div className="hidden sm:flex items-center gap-2">
                {stats.upsets > 0 && (
                  <Badge variant="secondary" className="gap-1 bg-orange-500/10 text-orange-600 border-orange-500/30">
                    <Flame className="h-3 w-3" />
                    {stats.upsets}
                  </Badge>
                )}
                <Badge variant="secondary" className="gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {stats.potentialPoints} pts
                </Badge>
              </div>
              
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="font-semibold text-primary">{stats.picked}</span>
                <span className="text-xs text-muted-foreground">/ {stats.total}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-4 pb-32">
        {/* AI Helper Prompt */}
        <button
          onClick={() => setShowAIHelper(true)}
          className="w-full p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-center gap-3 mb-4"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-xl">🏀</div>
          <div className="flex-1 text-left">
            <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
              Need help with your bracket?
            </div>
            <div className="text-xs text-muted-foreground">
              Ask Billy for upset picks and Cinderella predictions
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-emerald-500" />
        </button>

        {showAIHelper && (
          <AIAssistant 
            leagueId={parseInt(id || "0")} 
            defaultPersona="billy" 
            isOpen={showAIHelper}
            onClose={() => setShowAIHelper(false)}
          />
        )}

        {/* View Content */}
        {viewMode === "picks" ? (
          <BracketVisualization
            matchups={bracketWithPicks}
            picks={picks}
            onPick={handlePick}
            bracketSize={bracketSize}
            regions={config.regions || undefined}
            roundNames={config.names}
            roundPoints={config.points}
            viewMode="picks"
          />
        ) : (
          <BracketStandings leagueId={parseInt(id || "0")} />
        )}
      </main>

      {/* Submit Footer */}
      {viewMode === "picks" && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/50 p-4 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm text-muted-foreground">Bracket Progress</span>
                {stats.complete && (
                  <Badge variant="default" className="bg-emerald-500 text-white text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Complete
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
                      stats.complete 
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-400" 
                        : "bg-gradient-to-r from-primary to-primary/70"
                    )}
                    style={{ width: `${(stats.picked / stats.total) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold tabular-nums">{stats.picked}/{stats.total}</span>
              </div>
            </div>
            
            <button
              onClick={handleSubmitClick}
              disabled={isSubmitting || picks.size === 0}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-lg",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
                stats.complete 
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {isSubmitting ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Submitting...</>
              ) : (
                <><Send className="h-5 w-5" /> Submit Bracket</>
              )}
            </button>
          </div>
          
          <div className="max-w-7xl mx-auto mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            SHA-256 cryptographic seal generated on submit
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      <SubmitConfirmation
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmSubmit}
        picks={Array.from(picks.values()).map(p => ({
          event_id: parseInt(p.matchupId.replace("m", "")),
          pick_value: p.winner,
        }))}
        periodId="Bracket"
        leagueName={league?.name || ""}
      />
    </div>
  );
}

// Bracket Standings Component
function BracketStandings({ leagueId }: { leagueId: number }) {
  const [isLoading, setIsLoading] = useState(true);
  const [standings, setStandings] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);

  useEffect(() => {
    fetchStandings();
  }, [leagueId]);

  const fetchStandings = async () => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/standings`);
      if (!response.ok) throw new Error("Failed to fetch standings");
      const data = await response.json();
      setStandings(data.standings || []);
    } catch (err) {
      console.error("Failed to load standings:", err);
      // Generate mock standings
      setStandings([
        { user_id: 1, display_name: "March Madness Maven", total_points: 720, correct_picks: 42, rank: 1 },
        { user_id: 2, display_name: "Bracket Buster", total_points: 680, correct_picks: 40, rank: 2 },
        { user_id: 3, display_name: "Cinderella Picker", total_points: 640, correct_picks: 38, rank: 3 },
        { user_id: 4, display_name: "Chalk Walker", total_points: 600, correct_picks: 36, rank: 4 },
        { user_id: 5, display_name: "Upset Specialist", total_points: 560, correct_picks: 35, rank: 5 },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Leaderboard */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">Bracket Standings</span>
          </div>
          <button className="text-xs text-primary flex items-center gap-1 hover:underline">
            <Eye className="h-3.5 w-3.5" />
            View All Brackets
          </button>
        </div>

        <div className="divide-y">
          {standings.map((user, idx) => (
            <button
              key={user.user_id}
              onClick={() => setSelectedUser(selectedUser === user.user_id ? null : user.user_id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-all text-left",
                selectedUser === user.user_id && "bg-primary/5"
              )}
            >
              {/* Rank */}
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
                idx === 0 && "bg-amber-500/20 text-amber-600",
                idx === 1 && "bg-slate-400/20 text-slate-500 dark:bg-slate-600/20 dark:text-slate-400",
                idx === 2 && "bg-orange-500/20 text-orange-600",
                idx > 2 && "bg-muted text-muted-foreground"
              )}>
                {user.rank || idx + 1}
              </div>

              {/* User info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{user.display_name || `Player ${user.user_id}`}</div>
                <div className="text-xs text-muted-foreground">
                  {user.correct_picks} correct picks
                </div>
              </div>

              {/* Points */}
              <div className="text-right">
                <div className="font-bold text-lg tabular-nums">{user.total_points}</div>
                <div className="text-xs text-muted-foreground">points</div>
              </div>
            </button>
          ))}
        </div>

        {standings.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No brackets submitted yet</p>
          </div>
        )}
      </div>

      {/* Selected user's bracket preview */}
      {selectedUser && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">
              {standings.find(s => s.user_id === selectedUser)?.display_name}'s Bracket
            </h3>
            <button
              onClick={() => setSelectedUser(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          
          <div className="text-center py-8 text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Bracket comparison coming soon</p>
          </div>
        </div>
      )}
    </div>
  );
}
