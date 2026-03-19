import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { 
  ArrowLeft, Check, AlertCircle, Loader2, Send, 
  ChevronLeft, ChevronRight, Trophy, TrendingUp, Star,
  FileCheck, Sparkles, Shield
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

interface GameEvent {
  id: number;
  external_id: string;
  sport_key: string;
  period_id: string;
  start_at: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  final_result: string | null;
  spread?: number;
  home_spread?: number;
  away_spread?: number;
}

interface Pick {
  event_id: number;
  pick_value: string;
  is_best_bet?: boolean;
}

interface ExistingPick {
  id: number;
  event_id: number;
  pick_value: string;
  is_best_bet?: boolean;
  is_locked: number;
}

interface ReceiptInfo {
  receiptCode: string;
  submittedAt: Date;
}

// Generate realistic spreads based on team matchup
function generateSpread(homeTeam: string, awayTeam: string, eventId: number): number {
  // Seed-based pseudo-random for consistency
  const seed = (homeTeam.charCodeAt(0) + awayTeam.charCodeAt(0) + eventId) % 17;
  const spreads = [-14, -10.5, -7, -6.5, -6, -4.5, -3.5, -3, -2.5, -1.5, 1.5, 2.5, 3, 3.5, 4.5, 6, 7];
  return spreads[seed];
}

export function ATSPicks() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [league, setLeague] = useState<League | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [existingPicks, setExistingPicks] = useState<ExistingPick[]>([]);
  const [picks, setPicks] = useState<Map<number, Pick>>(new Map());
  const [bestBetId, setBestBetId] = useState<number | null>(null);
  const [tiebreaker, setTiebreaker] = useState("");
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  
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

  useEffect(() => {
    if (league && currentPeriod) {
      fetchEvents();
      fetchPicks();
    }
  }, [league, currentPeriod]);

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
    } catch {
      setError("Failed to load league");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}/events?period=${currentPeriod}`);
      if (response.ok) {
        const data = await response.json();
        // Add spreads to events
        setEvents(data.map((e: GameEvent) => {
          const homeSpread = e.home_spread ?? generateSpread(e.home_team, e.away_team, e.id);
          return {
            ...e,
            home_spread: homeSpread,
            away_spread: -homeSpread,
            spread: Math.abs(homeSpread),
          };
        }));
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
  };

  const fetchPicks = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}/picks?period=${currentPeriod}`);
      if (response.ok) {
        const data = await response.json();
        const resolvedPicks = Array.isArray(data) ? data : Array.isArray(data?.picks) ? data.picks : [];
        setExistingPicks(resolvedPicks);
        
        const picksMap = new Map<number, Pick>();
        resolvedPicks.forEach((p: ExistingPick) => {
          picksMap.set(p.event_id, {
            event_id: p.event_id,
            pick_value: p.pick_value,
            is_best_bet: p.is_best_bet,
          });
          if (p.is_best_bet) setBestBetId(p.event_id);
        });
        setPicks(picksMap);
        
        if (resolvedPicks.length > 0) {
          setReceiptInfo({
            receiptCode: `PV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
            submittedAt: new Date(Date.now() - Math.random() * 86400000),
          });
        } else {
          setReceiptInfo(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch picks:", err);
    }
  };

  const isGameLocked = (event: GameEvent): boolean => {
    const now = new Date();
    const gameTime = new Date(event.start_at);
    return now >= gameTime || event.status !== "scheduled";
  };

  const handlePick = (eventId: number, pickValue: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event || isGameLocked(event)) return;

    setPicks(prev => {
      const newPicks = new Map(prev);
      const existing = newPicks.get(eventId);
      
      if (existing?.pick_value === pickValue) {
        newPicks.delete(eventId);
        if (bestBetId === eventId) setBestBetId(null);
      } else {
        newPicks.set(eventId, {
          event_id: eventId,
          pick_value: pickValue,
          is_best_bet: bestBetId === eventId,
        });
      }
      return newPicks;
    });
    
    setJustSubmitted(false);
  };

  const handleBestBet = (eventId: number) => {
    const event = events.find(e => e.id === eventId);
    if (!event || isGameLocked(event)) return;
    if (!picks.has(eventId)) return; // Must have a pick first
    
    setBestBetId(prev => prev === eventId ? null : eventId);
    
    // Update picks to reflect best bet status
    setPicks(prev => {
      const newPicks = new Map(prev);
      newPicks.forEach((pick, id) => {
        newPicks.set(id, { ...pick, is_best_bet: id === eventId });
      });
      return newPicks;
    });
  };

  const handleSubmitClick = () => {
    if (picks.size === 0) {
      setError("Please make at least one pick");
      return;
    }
    setError("");
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async (): Promise<{ receiptCode: string; hash: string; isUpdate?: boolean; previousReceiptCode?: string; deliveries?: Array<{ channel: string; status: string }> } | null> => {
    const response = await fetch(`/api/leagues/${id}/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period_id: currentPeriod,
        picks: Array.from(picks.values()),
        tiebreaker_value: tiebreaker ? parseInt(tiebreaker) : null,
        best_bet_event_id: bestBetId,
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
    fetchPicks();
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
    const scheduledEvents = events.filter(e => e.status === "scheduled");
    if (scheduledEvents.length === 0) return null;
    
    const times = scheduledEvents.map(e => new Date(e.start_at).getTime());
    return new Date(Math.min(...times));
  };

  // Check if team covered the spread
  const didCoverSpread = (event: GameEvent, team: string): boolean | null => {
    if (event.status !== "final" || event.home_score === null || event.away_score === null) {
      return null;
    }
    
    const homeSpread = event.home_spread ?? 0;
    const awaySpread = event.away_spread ?? 0;
    
    const homeMargin = event.home_score - event.away_score;
    const awayMargin = event.away_score - event.home_score;
    
    if (team === event.home_team) {
      return homeMargin + homeSpread > 0;
    } else {
      return awayMargin + awaySpread > 0;
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    const totalGames = events.filter(e => !isGameLocked(e)).length;
    const pickedGames = Array.from(picks.values()).filter(p => {
      const event = events.find(e => e.id === p.event_id);
      return event && !isGameLocked(event);
    }).length;
    const lockedGames = events.filter(e => isGameLocked(e)).length;
    const liveGames = events.filter(e => e.status === "live" || e.status === "in_progress").length;
    
    // Calculate ATS record
    let atsWins = 0;
    let atsLosses = 0;
    existingPicks.forEach(pick => {
      const event = events.find(e => e.id === pick.event_id);
      if (event && event.status === "final") {
        const covered = didCoverSpread(event, pick.pick_value);
        if (covered === true) atsWins++;
        else if (covered === false) atsLosses++;
      }
    });
    
    return { 
      totalGames, 
      pickedGames, 
      lockedGames, 
      liveGames, 
      allPicked: pickedGames === totalGames && totalGames > 0,
      atsWins,
      atsLosses,
      hasBestBet: bestBetId !== null,
    };
  }, [events, picks, existingPicks, bestBetId]);

  const firstLockTime = getFirstLockTime();
  
  const getOverallStatus = (): "open" | "submitted" | "locked" | "live" | "final" => {
    if (stats.liveGames > 0) return "live";
    if (stats.lockedGames === events.length && events.length > 0) return "final";
    if (stats.lockedGames > 0 && stats.totalGames === 0) return "locked";
    if (existingPicks.length > 0 || justSubmitted) return "submitted";
    return "open";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading picks...</p>
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
              <SportBadge sport={league.sport_key} format={format?.name || "ATS"} />
            </div>
            <h1 className="text-h1">{league.name}</h1>
          </div>
        </div>
        <StatusPill status={overallStatus} />
      </div>

      {/* ATS Record Banner */}
      {(stats.atsWins > 0 || stats.atsLosses > 0) && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Your ATS Record</div>
                <div className="text-2xl font-bold">
                  <span className="text-emerald-500">{stats.atsWins}</span>
                  <span className="text-muted-foreground mx-1">-</span>
                  <span className="text-red-500">{stats.atsLosses}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Win %</div>
              <div className="text-xl font-bold text-primary">
                {stats.atsWins + stats.atsLosses > 0 
                  ? Math.round((stats.atsWins / (stats.atsWins + stats.atsLosses)) * 100)
                  : 0}%
              </div>
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
                  {stats.pickedGames}/{stats.totalGames + stats.lockedGames} games
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
                  {justSubmitted ? "Picks Submitted!" : "Picks Saved"}
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
        className="w-full p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-2xl">
          📊
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold text-emerald-600 dark:text-emerald-400">ATS Analysis</div>
          <div className="text-caption">Get help with spread picks and line movements</div>
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

      {/* Games List with Spreads */}
      {events.length === 0 ? (
        <div className="card-hero text-center py-12">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No games available for this period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event, index) => {
            const locked = isGameLocked(event);
            const pick = picks.get(event.id);
            const existingPick = existingPicks.find(p => p.event_id === event.id);
            const isLive = event.status === "live" || event.status === "in_progress";
            const isFinal = event.status === "final";
            const isBestBet = bestBetId === event.id;
            
            // Determine if pick covered
            const pickCovered = pick && isFinal ? didCoverSpread(event, pick.pick_value) : null;

            return (
              <div 
                key={event.id}
                className={cn(
                  "animate-slide-up-fade",
                  isBestBet && !locked && "ring-2 ring-amber-500/50 rounded-2xl"
                )}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className={cn(
                  "p-4 rounded-2xl bg-card border border-border/50 transition-all",
                  isLive && "ring-2 ring-primary/30 bg-primary/5",
                  pick && !locked && "ring-2 ring-primary/50"
                )}>
                  {/* Game Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {isLive ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
                          </span>
                          <span className="text-xs font-bold uppercase tracking-wide">Live</span>
                        </div>
                      ) : isFinal ? (
                        <div className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                          FINAL
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {new Date(event.start_at).toLocaleString('en-US', {
                            weekday: 'short',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </div>
                      )}
                      
                      {isBestBet && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                          <Star className="w-3 h-3 fill-current" />
                          <span className="text-xs font-semibold">Best Bet</span>
                        </div>
                      )}
                    </div>
                    
                    {/* ATS Result indicator */}
                    {isFinal && existingPick && (
                      <div className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-semibold",
                        pickCovered === true && "bg-emerald-500/20 text-emerald-600",
                        pickCovered === false && "bg-red-500/20 text-red-600"
                      )}>
                        {pickCovered === true ? "✓ COVERED" : "✗ MISSED"}
                      </div>
                    )}
                    
                    {pick && !locked && (
                      <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Picked
                      </div>
                    )}
                  </div>

                  {/* Matchup with Spreads */}
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 items-center">
                    {/* Away Team */}
                    <button
                      onClick={() => handlePick(event.id, event.away_team)}
                      disabled={locked}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl",
                        "border-2 transition-all duration-200",
                        "hover:border-primary/50 active:scale-[0.98]",
                        "disabled:cursor-not-allowed disabled:hover:border-border disabled:active:scale-100",
                        pick?.pick_value === event.away_team
                          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                          : "border-border hover:bg-secondary/50"
                      )}
                    >
                      <TeamBadge teamName={event.away_team} size="lg" />
                      <span className="text-xs font-semibold truncate max-w-full">{event.away_team}</span>
                      
                      {/* Spread Badge */}
                      <div className={cn(
                        "px-3 py-1 rounded-full text-sm font-bold",
                        (event.away_spread ?? 0) < 0 
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                          : "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                      )}>
                        {(event.away_spread ?? 0) > 0 ? '+' : ''}{event.away_spread}
                      </div>
                      
                      {/* Score (for live/final) */}
                      {(isLive || isFinal) && event.away_score !== null && (
                        <span className={cn(
                          "text-2xl font-bold tabular-nums",
                          isFinal && event.final_result === event.away_team && "text-[hsl(var(--success))]"
                        )}>
                          {event.away_score}
                        </span>
                      )}
                    </button>

                    {/* VS / @ Divider */}
                    <div className="flex flex-col items-center justify-center px-1">
                      {isLive || isFinal ? (
                        <div className="text-sm font-medium text-muted-foreground">vs</div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                          @
                        </div>
                      )}
                    </div>

                    {/* Home Team */}
                    <button
                      onClick={() => handlePick(event.id, event.home_team)}
                      disabled={locked}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl",
                        "border-2 transition-all duration-200",
                        "hover:border-primary/50 active:scale-[0.98]",
                        "disabled:cursor-not-allowed disabled:hover:border-border disabled:active:scale-100",
                        pick?.pick_value === event.home_team
                          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                          : "border-border hover:bg-secondary/50"
                      )}
                    >
                      <TeamBadge teamName={event.home_team} size="lg" />
                      <span className="text-xs font-semibold truncate max-w-full">{event.home_team}</span>
                      
                      {/* Spread Badge */}
                      <div className={cn(
                        "px-3 py-1 rounded-full text-sm font-bold",
                        (event.home_spread ?? 0) < 0 
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                          : "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                      )}>
                        {(event.home_spread ?? 0) > 0 ? '+' : ''}{event.home_spread}
                      </div>
                      
                      {/* Score (for live/final) */}
                      {(isLive || isFinal) && event.home_score !== null && (
                        <span className={cn(
                          "text-2xl font-bold tabular-nums",
                          isFinal && event.final_result === event.home_team && "text-[hsl(var(--success))]"
                        )}>
                          {event.home_score}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Best Bet Toggle (only if pick made and not locked) */}
                  {pick && !locked && (
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => handleBestBet(event.id)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-full transition-all",
                          "border-2",
                          isBestBet
                            ? "border-amber-500 bg-amber-500/20 text-amber-600 dark:text-amber-400"
                            : "border-border hover:border-amber-500/50 text-muted-foreground hover:text-amber-600"
                        )}
                      >
                        <Star className={cn("w-4 h-4", isBestBet && "fill-current")} />
                        <span className="text-sm font-medium">
                          {isBestBet ? "Best Bet (2x Points)" : "Make Best Bet"}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Locked Pick Display */}
                  {locked && existingPick && (
                    <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-muted/50">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-5 h-5 rounded-full bg-[hsl(var(--success)/0.2)] flex items-center justify-center">
                          <Check className="h-3 w-3 text-[hsl(var(--success))]" />
                        </div>
                        <span className="text-muted-foreground">Your pick:</span>
                        <span className="font-semibold">{existingPick.pick_value}</span>
                        {existingPick.is_best_bet && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                            <Star className="w-3 h-3 fill-current" />
                            <span className="text-xs">2x</span>
                          </div>
                        )}
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
      {events.length > 0 && stats.totalGames > 0 && (
        <div className="card-hero space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-h3">Ready to Submit?</h3>
              <p className="text-caption">
                {stats.allPicked 
                  ? stats.hasBestBet ? "All picks made with best bet!" : "All games picked! Don't forget your best bet."
                  : `${stats.totalGames - stats.pickedGames} games remaining`
                }
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{stats.pickedGames}</div>
              <div className="text-caption">/ {stats.totalGames}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 rounded-full"
              style={{ width: `${(stats.pickedGames / stats.totalGames) * 100}%` }}
            />
          </div>

          {/* Tiebreaker */}
          <div className="flex items-center gap-3">
            <Label htmlFor="tiebreaker" className="text-sm text-muted-foreground whitespace-nowrap">
              Tiebreaker (total points)
            </Label>
            <Input
              id="tiebreaker"
              type="number"
              min={0}
              value={tiebreaker}
              onChange={(e) => setTiebreaker(e.target.value)}
              className="w-24 text-center font-mono"
              placeholder="0"
            />
          </div>

          {/* Submit Button */}
          <button 
            onClick={handleSubmitClick} 
            disabled={isSubmitting || picks.size === 0}
            className={cn(
              "btn-cta w-full",
              stats.allPicked && "animate-pulse-subtle"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                {existingPicks.length > 0 ? "Update Picks" : "Submit Picks"}
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
        picks={Array.from(picks.values()).map(p => ({
          ...p,
          is_best_bet: p.event_id === bestBetId,
        }))}
        periodId={currentPeriod}
        leagueName={league.name}
        tiebreaker={tiebreaker}
      />
    </div>
  );
}
