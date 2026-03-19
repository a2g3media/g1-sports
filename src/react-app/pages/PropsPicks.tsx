import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/react-app/components/ui/button";
import { 
  ArrowLeft, Check, AlertCircle, Loader2, Send, 
  ChevronLeft, ChevronRight, Trophy, Target, User,
  FileCheck, Sparkles, Shield, TrendingUp, TrendingDown,
  Zap, Star, BarChart3
} from "lucide-react";
import { POOL_FORMATS } from "@/react-app/data/sports";

import { cn } from "@/react-app/lib/utils";
import { AIAssistant } from "@/react-app/components/AIAssistant";
import { SubmitConfirmation } from "@/react-app/components/SubmitConfirmation";
import {
  StatusPill,
  CountdownPill,
  SportBadge,
  ReceiptStamp,
} from "@/react-app/components/ui/premium";
import { TeamBadge } from "@/react-app/components/ui/team-badge";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  rules_json: string;
}

interface PropBet {
  id: number;
  category: "player" | "game" | "special";
  type: string;
  player_name?: string;
  team?: string;
  description: string;
  line: number;
  over_odds: number;
  under_odds: number;
  points: number;
  status: "open" | "locked" | "won" | "lost" | "push";
  result_value?: number;
  lock_time: string;
  game_info?: string;
}

interface PropPick {
  prop_id: number;
  selection: "over" | "under" | "yes" | "no";
}

interface ReceiptInfo {
  receiptCode: string;
  submittedAt: Date;
}

// Generate demo props based on sport
function generateDemoProps(sportKey: string, _periodId: string, leagueId: number): PropBet[] {
  const now = Date.now();
  
  // NFL Props
  const nflPlayerProps: Partial<PropBet>[] = [
    { player_name: "Patrick Mahomes", team: "Chiefs", type: "Passing Yards", line: 275.5, points: 1 },
    { player_name: "Josh Allen", team: "Bills", type: "Passing TDs", line: 1.5, points: 1 },
    { player_name: "Travis Kelce", team: "Chiefs", type: "Receiving Yards", line: 65.5, points: 1 },
    { player_name: "Derrick Henry", team: "Ravens", type: "Rushing Yards", line: 95.5, points: 1 },
    { player_name: "Tyreek Hill", team: "Dolphins", type: "Receptions", line: 6.5, points: 1 },
    { player_name: "Davante Adams", team: "Raiders", type: "Receiving Yards", line: 75.5, points: 1 },
    { player_name: "Lamar Jackson", team: "Ravens", type: "Rushing Yards", line: 55.5, points: 1 },
    { player_name: "Jalen Hurts", team: "Eagles", type: "Passing + Rushing Yards", line: 285.5, points: 2 },
    { player_name: "Saquon Barkley", team: "Eagles", type: "Total Touches", line: 22.5, points: 1 },
    { player_name: "CeeDee Lamb", team: "Cowboys", type: "Longest Reception", line: 25.5, points: 2 },
  ];

  const nflGameProps: Partial<PropBet>[] = [
    { description: "Chiefs vs Bills - Total Points", line: 48.5, points: 1, game_info: "Chiefs @ Bills" },
    { description: "Ravens vs Steelers - Total Points", line: 43.5, points: 1, game_info: "Ravens @ Steelers" },
    { description: "Eagles vs Cowboys - First Score (TD or FG)", line: 0, points: 2, game_info: "Eagles @ Cowboys" },
    { description: "49ers vs Seahawks - First Half Total", line: 23.5, points: 1, game_info: "49ers @ Seahawks" },
    { description: "Dolphins vs Jets - Total TDs", line: 5.5, points: 1, game_info: "Dolphins @ Jets" },
  ];

  const nflSpecialProps: Partial<PropBet>[] = [
    { description: "Any Player Scores 2+ TDs", line: 0, points: 3 },
    { description: "Defensive/ST Touchdown Scored", line: 0, points: 3 },
    { description: "Game Goes to Overtime", line: 0, points: 5 },
    { description: "Any Player 100+ Rushing Yards", line: 0, points: 2 },
    { description: "Combined Points Over 60", line: 60, points: 2 },
  ];

  // NBA Props
  const nbaPlayerProps: Partial<PropBet>[] = [
    { player_name: "LeBron James", team: "Lakers", type: "Points", line: 25.5, points: 1 },
    { player_name: "Stephen Curry", team: "Warriors", type: "3-Pointers Made", line: 4.5, points: 1 },
    { player_name: "Jayson Tatum", team: "Celtics", type: "Points + Rebounds", line: 35.5, points: 1 },
    { player_name: "Nikola Jokic", team: "Nuggets", type: "Assists", line: 8.5, points: 1 },
    { player_name: "Giannis Antetokounmpo", team: "Bucks", type: "Rebounds", line: 11.5, points: 1 },
    { player_name: "Luka Doncic", team: "Mavericks", type: "Points + Assists", line: 42.5, points: 1 },
    { player_name: "Anthony Edwards", team: "Timberwolves", type: "Points", line: 24.5, points: 1 },
    { player_name: "Kevin Durant", team: "Suns", type: "Points", line: 28.5, points: 1 },
  ];

  const nbaGameProps: Partial<PropBet>[] = [
    { description: "Lakers vs Celtics - Total Points", line: 225.5, points: 1, game_info: "Lakers @ Celtics" },
    { description: "Warriors vs Suns - 1st Quarter Total", line: 58.5, points: 1, game_info: "Warriors @ Suns" },
    { description: "Bucks vs Heat - Largest Lead", line: 15.5, points: 2, game_info: "Bucks @ Heat" },
  ];

  const props: PropBet[] = [];
  let id = 1;

  const playerPropsSource = sportKey === "nba" || sportKey === "ncaab" ? nbaPlayerProps : nflPlayerProps;
  const gamePropsSource = sportKey === "nba" || sportKey === "ncaab" ? nbaGameProps : nflGameProps;
  const specialPropsSource = nflSpecialProps;

  // Add player props
  playerPropsSource.forEach((p, index) => {
    const isLocked = index < 3 && leagueId % 3 === 0;
    const isFinal = index < 2 && leagueId % 5 === 0;
    const lockOffset = (index + 1) * 1800000;
    
    props.push({
      id,
      category: "player",
      type: p.type || "",
      player_name: p.player_name,
      team: p.team,
      description: `${p.player_name} ${p.type}`,
      line: p.line || 0,
      over_odds: -110 + (index % 3) * 5,
      under_odds: -110 - (index % 3) * 5,
      points: p.points || 1,
      status: isFinal ? (index % 2 === 0 ? "won" : "lost") : isLocked ? "locked" : "open",
      result_value: isFinal ? (p.line || 0) + (index % 2 === 0 ? 10 : -10) : undefined,
      lock_time: new Date(now + (isLocked || isFinal ? -lockOffset : lockOffset)).toISOString(),
      game_info: `${p.team} Game`,
    });
    id++;
  });

  // Add game props
  gamePropsSource.forEach((p, index) => {
    const isLocked = index === 0 && leagueId % 4 === 0;
    const isFinal = index === 0 && leagueId % 6 === 0;
    const lockOffset = (index + 1) * 3600000;

    props.push({
      id,
      category: "game",
      type: "Game Total",
      description: p.description || "",
      line: p.line || 0,
      over_odds: -110,
      under_odds: -110,
      points: p.points || 1,
      status: isFinal ? (index % 2 === 0 ? "won" : "lost") : isLocked ? "locked" : "open",
      result_value: isFinal ? (p.line || 0) + (index % 2 === 0 ? 5 : -5) : undefined,
      lock_time: new Date(now + (isLocked || isFinal ? -lockOffset : lockOffset)).toISOString(),
      game_info: p.game_info,
    });
    id++;
  });

  // Add special props (only for NFL-like sports)
  if (sportKey === "nfl" || sportKey === "ncaaf") {
    specialPropsSource.forEach((p) => {
      props.push({
        id,
        category: "special",
        type: "Special",
        description: p.description || "",
        line: p.line || 0,
        over_odds: -110,
        under_odds: -110,
        points: p.points || 2,
        status: "open",
        lock_time: new Date(now + 7200000).toISOString(),
        game_info: "All Games",
      });
      id++;
    });
  }

  return props;
}

export function PropsPicks() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [league, setLeague] = useState<League | null>(null);
  const [props, setProps] = useState<PropBet[]>([]);
  const [existingPicks] = useState<PropPick[]>([]);
  const [picks, setPicks] = useState<Map<number, PropPick>>(new Map());
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "player" | "game" | "special">("all");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [receiptInfo, setReceiptInfo] = useState<ReceiptInfo | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    if (id) {
      fetchLeague();
    }
  }, [id]);

  const fetchLeague = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}`);
      if (!response.ok) throw new Error("Failed to fetch league");
      const data = await response.json();
      setLeague(data);
      
      const periodsRes = await fetch(`/api/leagues/${id}/periods`);
      if (periodsRes.ok) {
        const periodsData = await periodsRes.json();
        setAvailablePeriods(periodsData.periods);
        if (periodsData.periods.length > 0) {
          setCurrentPeriod(periodsData.currentPeriod || periodsData.periods[0]);
        }
      }
      
      // For now, use demo props since we don't have a props API yet
      const demoProps = generateDemoProps(data.sport_key, "Week 14", parseInt(id || "0"));
      setProps(demoProps);
    } catch {
      setError("Failed to load league");
    } finally {
      setIsLoading(false);
    }
  };

  const isPropLocked = (prop: PropBet): boolean => {
    return prop.status !== "open";
  };

  const handlePick = (propId: number, selection: "over" | "under" | "yes" | "no") => {
    const prop = props.find(p => p.id === propId);
    if (!prop || isPropLocked(prop)) return;

    setPicks(prev => {
      const newPicks = new Map(prev);
      const existing = newPicks.get(propId);
      
      if (existing?.selection === selection) {
        newPicks.delete(propId);
      } else {
        newPicks.set(propId, {
          prop_id: propId,
          selection,
        });
      }
      return newPicks;
    });
    
    setJustSubmitted(false);
  };

  const handleSubmitClick = () => {
    if (picks.size === 0) {
      setError("Please make at least one prop pick");
      return;
    }
    setError("");
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async (): Promise<{ receiptCode: string; hash: string; isUpdate?: boolean; previousReceiptCode?: string; deliveries?: Array<{ channel: string; status: string }> } | null> => {
    const response = await fetch(`/api/leagues/${id}/props/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period_id: currentPeriod,
        picks: Array.from(picks.values()),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to submit picks");
    }

    const data = await response.json();
    setReceiptInfo({
      receiptCode: data.receiptCode,
      submittedAt: new Date(),
    });
    setJustSubmitted(true);
    return { 
      receiptCode: data.receiptCode, 
      hash: data.payloadHash || data.receiptCode,
      isUpdate: data.isUpdate,
      previousReceiptCode: data.previousReceiptCode,
      deliveries: data.deliveries,
    };
  };

  const navigatePeriod = (direction: "prev" | "next") => {
    const currentIndex = availablePeriods.indexOf(currentPeriod);
    if (direction === "prev" && currentIndex > 0) {
      setCurrentPeriod(availablePeriods[currentIndex - 1]);
      setJustSubmitted(false);
    } else if (direction === "next" && currentIndex < availablePeriods.length - 1) {
      setCurrentPeriod(availablePeriods[currentIndex + 1]);
      setJustSubmitted(false);
    }
  };

  const getFirstLockTime = (): Date | null => {
    const openProps = props.filter(p => p.status === "open");
    if (openProps.length === 0) return null;
    
    const times = openProps.map(p => new Date(p.lock_time).getTime());
    return new Date(Math.min(...times));
  };

  // Filter props by category
  const filteredProps = useMemo(() => {
    if (categoryFilter === "all") return props;
    return props.filter(p => p.category === categoryFilter);
  }, [props, categoryFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const openProps = props.filter(p => p.status === "open").length;
    const pickedProps = picks.size;
    const lockedProps = props.filter(p => p.status === "locked").length;
    
    let wonCount = 0;
    let lostCount = 0;
    let totalPoints = 0;
    
    existingPicks.forEach(pick => {
      const prop = props.find(p => p.id === pick.prop_id);
      if (prop) {
        if (prop.status === "won") {
          wonCount++;
          totalPoints += prop.points;
        } else if (prop.status === "lost") {
          lostCount++;
        }
      }
    });
    
    const potentialPoints = Array.from(picks.values()).reduce((sum, pick) => {
      const prop = props.find(p => p.id === pick.prop_id);
      return sum + (prop?.points || 0);
    }, 0);
    
    return { 
      openProps, 
      pickedProps, 
      lockedProps,
      wonCount,
      lostCount,
      totalPoints,
      potentialPoints,
      categoryBreakdown: {
        player: props.filter(p => p.category === "player").length,
        game: props.filter(p => p.category === "game").length,
        special: props.filter(p => p.category === "special").length,
      }
    };
  }, [props, picks, existingPicks]);

  const firstLockTime = getFirstLockTime();
  
  const getOverallStatus = (): "open" | "submitted" | "locked" | "live" | "final" => {
    const liveProps = props.filter(p => p.status === "locked").length;
    const finalProps = props.filter(p => p.status === "won" || p.status === "lost" || p.status === "push").length;
    
    if (finalProps === props.length && props.length > 0) return "final";
    if (liveProps > 0 && liveProps + finalProps < props.length) return "live";
    if (liveProps + finalProps === props.length && props.length > 0) return "locked";
    if (existingPicks.length > 0 || justSubmitted) return "submitted";
    return "open";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading props...</p>
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">League not found</p>
        <Link to="/">
          <Button variant="outline" className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const format = POOL_FORMATS.find(f => f.key === league.format_key);
  const overallStatus = getOverallStatus();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link to="/">
            <button className="btn-icon mt-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SportBadge sport={league.sport_key} format={format?.name || "Props"} />
            </div>
            <h1 className="text-h1">{league.name}</h1>
          </div>
        </div>
        <StatusPill status={overallStatus} />
      </div>

      {/* Props Record Banner */}
      {(stats.wonCount > 0 || stats.lostCount > 0) && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Props Record</div>
                <div className="text-2xl font-bold">
                  <span className="text-emerald-500">{stats.wonCount}</span>
                  <span className="text-muted-foreground mx-1">-</span>
                  <span className="text-red-500">{stats.lostCount}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Points Earned</div>
              <div className="text-xl font-bold text-primary">{stats.totalPoints}</div>
            </div>
          </div>
        </div>
      )}

      {/* Period Navigation */}
      {availablePeriods.length > 0 && (
        <div className="card-premium p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigatePeriod("prev")}
              disabled={availablePeriods.indexOf(currentPeriod) === 0}
              className="btn-ghost disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            
            <div className="text-center flex-1">
              <div className="text-display text-2xl sm:text-3xl">{currentPeriod}</div>
              <div className="flex items-center justify-center gap-2 mt-1">
                {firstLockTime && overallStatus === "open" && (
                  <CountdownPill targetDate={firstLockTime} size="sm" />
                )}
                <span className="text-caption">
                  {props.length} props available
                </span>
              </div>
            </div>
            
            <button
              onClick={() => navigatePeriod("next")}
              disabled={availablePeriods.indexOf(currentPeriod) === availablePeriods.length - 1}
              className="btn-ghost disabled:opacity-30"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Submitted Banner */}
      {receiptInfo && (overallStatus === "submitted" || justSubmitted) && (
        <div className={cn(
          "p-4 rounded-2xl border-2 border-dashed",
          justSubmitted 
            ? "bg-[hsl(var(--success)/0.1)] border-[hsl(var(--success)/0.3)] animate-stamp-drop" 
            : "bg-secondary border-border"
        )}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                justSubmitted ? "bg-[hsl(var(--success)/0.2)]" : "bg-secondary"
              )}>
                <FileCheck className={cn(
                  "w-5 h-5",
                  justSubmitted ? "text-[hsl(var(--success))]" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <div className="font-semibold">
                  {justSubmitted ? "Props Submitted!" : "Props Saved"}
                </div>
                <div className="text-caption">
                  {receiptInfo.submittedAt.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
            <ReceiptStamp 
              receiptCode={receiptInfo.receiptCode}
              submittedAt={receiptInfo.submittedAt}
              onClick={() => navigate('/picks')}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center gap-3 text-destructive animate-slide-up-fade">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* AI Helper Button */}
      <button
        onClick={() => setShowAIHelper(true)}
        className="w-full p-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 transition-all flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-2xl">
          🎯
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold text-purple-600 dark:text-purple-400">Props Insights</div>
          <div className="text-caption">Get player stats and prop analysis</div>
        </div>
        <Sparkles className="w-5 h-5 text-purple-500" />
      </button>

      {showAIHelper && (
        <AIAssistant 
          leagueId={parseInt(id || "0")} 
          defaultPersona="billy" 
          isOpen={showAIHelper}
          onClose={() => setShowAIHelper(false)}
        />
      )}

      {/* Category Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setCategoryFilter("all")}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
            categoryFilter === "all" 
              ? "bg-primary text-primary-foreground" 
              : "bg-secondary hover:bg-secondary/80"
          )}
        >
          <BarChart3 className="w-4 h-4" />
          All ({props.length})
        </button>
        <button
          onClick={() => setCategoryFilter("player")}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
            categoryFilter === "player" 
              ? "bg-blue-500 text-white" 
              : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
          )}
        >
          <User className="w-4 h-4" />
          Player ({stats.categoryBreakdown.player})
        </button>
        <button
          onClick={() => setCategoryFilter("game")}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
            categoryFilter === "game" 
              ? "bg-emerald-500 text-white" 
              : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
          )}
        >
          <Trophy className="w-4 h-4" />
          Game ({stats.categoryBreakdown.game})
        </button>
        {stats.categoryBreakdown.special > 0 && (
          <button
            onClick={() => setCategoryFilter("special")}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
              categoryFilter === "special" 
                ? "bg-amber-500 text-white" 
                : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
            )}
          >
            <Star className="w-4 h-4" />
            Special ({stats.categoryBreakdown.special})
          </button>
        )}
      </div>

      {/* Props List */}
      {filteredProps.length === 0 ? (
        <div className="card-hero text-center py-12">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No props available for this category</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProps.map((prop, index) => {
            const locked = isPropLocked(prop);
            const pick = picks.get(prop.id);
            const existingPick = existingPicks.find(p => p.prop_id === prop.id);
            const isWon = prop.status === "won";
            const isLost = prop.status === "lost";
            const isPush = prop.status === "push";
            const isFinal = isWon || isLost || isPush;

            return (
              <div 
                key={prop.id}
                className="animate-slide-up-fade"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className={cn(
                  "p-4 rounded-2xl bg-card border border-border/50 transition-all",
                  isWon && "ring-2 ring-emerald-500/30 bg-emerald-500/5",
                  isLost && "ring-2 ring-red-500/30 bg-red-500/5",
                  pick && !locked && "ring-2 ring-primary/50"
                )}>
                  {/* Prop Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {/* Category Badge */}
                        <div className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          prop.category === "player" && "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                          prop.category === "game" && "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                          prop.category === "special" && "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        )}>
                          {prop.category === "player" ? "Player" : prop.category === "game" ? "Game" : "Special"}
                        </div>
                        
                        {/* Points Badge */}
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                          <Zap className="w-3 h-3" />
                          {prop.points} pt{prop.points !== 1 ? "s" : ""}
                        </div>
                      </div>
                      
                      {/* Prop Description */}
                      <div className="flex items-center gap-2">
                        {prop.player_name && prop.team && (
                          <TeamBadge teamName={prop.team} size="sm" />
                        )}
                        <div>
                          {prop.player_name && (
                            <div className="font-semibold">{prop.player_name}</div>
                          )}
                          <div className={cn("text-sm", prop.player_name ? "text-muted-foreground" : "font-semibold")}>
                            {prop.player_name ? prop.type : prop.description}
                          </div>
                        </div>
                      </div>
                      
                      {/* Game Info */}
                      {prop.game_info && (
                        <div className="text-caption mt-1">{prop.game_info}</div>
                      )}
                    </div>
                    
                    {/* Result Badge */}
                    {isFinal && (
                      <div className={cn(
                        "px-3 py-1 rounded-full text-sm font-semibold",
                        isWon && "bg-emerald-500/20 text-emerald-600",
                        isLost && "bg-red-500/20 text-red-600",
                        isPush && "bg-gray-500/20 text-gray-600"
                      )}>
                        {isWon ? "✓ WON" : isLost ? "✗ LOST" : "PUSH"}
                      </div>
                    )}
                    
                    {!locked && !isFinal && (
                      <div className="text-xs text-muted-foreground">
                        {new Date(prop.lock_time).toLocaleString('en-US', {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    )}
                  </div>

                  {/* Line Display */}
                  <div className="flex items-center justify-center gap-4 mb-4 p-3 rounded-xl bg-secondary/50">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary">{prop.line}</div>
                      {isFinal && prop.result_value !== undefined && (
                        <div className="text-sm text-muted-foreground">
                          Actual: <span className="font-semibold">{prop.result_value}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Over/Under Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Over Button */}
                    <button
                      onClick={() => handlePick(prop.id, "over")}
                      disabled={locked}
                      className={cn(
                        "relative flex flex-col items-center gap-1 p-4 rounded-xl",
                        "border-2 transition-all duration-200",
                        "hover:border-emerald-500/50 active:scale-[0.98]",
                        "disabled:cursor-not-allowed disabled:hover:border-border disabled:active:scale-100",
                        pick?.selection === "over"
                          ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20"
                          : "border-border hover:bg-emerald-500/5"
                      )}
                    >
                      <TrendingUp className={cn(
                        "w-6 h-6",
                        pick?.selection === "over" ? "text-emerald-500" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "font-bold text-lg",
                        pick?.selection === "over" ? "text-emerald-500" : ""
                      )}>OVER</span>
                      <span className="text-sm text-muted-foreground">{prop.over_odds}</span>
                    </button>

                    {/* Under Button */}
                    <button
                      onClick={() => handlePick(prop.id, "under")}
                      disabled={locked}
                      className={cn(
                        "relative flex flex-col items-center gap-1 p-4 rounded-xl",
                        "border-2 transition-all duration-200",
                        "hover:border-red-500/50 active:scale-[0.98]",
                        "disabled:cursor-not-allowed disabled:hover:border-border disabled:active:scale-100",
                        pick?.selection === "under"
                          ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20"
                          : "border-border hover:bg-red-500/5"
                      )}
                    >
                      <TrendingDown className={cn(
                        "w-6 h-6",
                        pick?.selection === "under" ? "text-red-500" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "font-bold text-lg",
                        pick?.selection === "under" ? "text-red-500" : ""
                      )}>UNDER</span>
                      <span className="text-sm text-muted-foreground">{prop.under_odds}</span>
                    </button>
                  </div>

                  {/* Locked Pick Display */}
                  {locked && existingPick && (
                    <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-muted/50">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-5 h-5 rounded-full bg-[hsl(var(--success)/0.2)] flex items-center justify-center">
                          <Check className="h-3 w-3 text-[hsl(var(--success))]" />
                        </div>
                        <span className="text-muted-foreground">Your pick:</span>
                        <span className={cn(
                          "font-semibold uppercase",
                          existingPick.selection === "over" ? "text-emerald-500" : "text-red-500"
                        )}>
                          {existingPick.selection}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Section */}
      {props.length > 0 && stats.openProps > 0 && (
        <div className="card-hero space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-h3">Ready to Submit?</h3>
              <p className="text-caption">
                {stats.pickedProps} props selected • {stats.potentialPoints} potential points
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{stats.pickedProps}</div>
              <div className="text-caption">picked</div>
            </div>
          </div>

          {/* Submit Button */}
          <button 
            onClick={handleSubmitClick} 
            disabled={isSubmitting || picks.size === 0}
            className="btn-cta w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                {existingPicks.length > 0 ? "Update Props" : "Submit Props"}
              </>
            )}
          </button>

          <p className="text-caption text-center flex items-center justify-center gap-1">
            <Shield className="h-3.5 w-3.5" />
            SHA-256 hashed receipt generated on submit
          </p>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      <SubmitConfirmation
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmSubmit}
        picks={Array.from(picks.values()).map(p => {
          const prop = props.find(pr => pr.id === p.prop_id);
          return {
            event_id: p.prop_id,
            pick_value: `${prop?.description || `Prop #${p.prop_id}`}: ${p.selection.toUpperCase()}`,
          };
        })}
        periodId={currentPeriod}
        leagueName={league.name}
      />
    </div>
  );
}
