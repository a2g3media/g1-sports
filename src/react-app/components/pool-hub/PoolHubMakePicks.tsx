import { useState, useEffect, useMemo } from "react";
import { 
  Target, Clock, Lock, CheckCircle2, Send, AlertCircle,
  ChevronLeft, ChevronRight, FileCheck, Loader2, Sparkles
} from "lucide-react";
import { CountdownPill, ReceiptStamp } from "@/react-app/components/ui/premium";
import { cn } from "@/react-app/lib/utils";
import { AIAssistant } from "@/react-app/components/AIAssistant";
import { SubmitConfirmation } from "@/react-app/components/SubmitConfirmation";
import { GameRow, GameStatus, GameRowSkeleton } from "@/react-app/components/ui/game-row";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { 
  DemoLeague,
  getDemoEventsForLeague, 
  getDemoPicksForLeague,
  getDemoPeriodsForLeague,
  getDemoCurrentPeriod,
} from "@/react-app/data/demo-leagues";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  entry_fee_cents: number;
  member_count: number;
}

interface TimeContext {
  periodLabel: string;
  periodNumber: number | string;
  status: "open" | "locked" | "live" | "final";
  lockTime: Date;
  timeUntilLock: number;
}

interface PoolHubMakePicksProps {
  league: League;
  timeContext: TimeContext | null;
}

interface GameEvent {
  id: number;
  sport_key: string;
  period_id: string;
  home_team: string;
  away_team: string;
  start_at: string;
  status: "scheduled" | "live" | "final";
  home_score?: number;
  away_score?: number;
  winner?: string;
  clock?: string;
  quarter?: string;
}

interface Pick {
  event_id: number;
  pick_value: string;
  confidence_rank?: number;
}

interface ExistingPick {
  id: number;
  event_id: number;
  pick_value: string;
  confidence_rank: number | null;
  is_locked: number;
  entry_id?: number | null;
}

interface EntryOption {
  id: number;
  entryNumber: number;
  entryName: string;
  isPrimary: boolean;
}

interface ReceiptInfo {
  receiptCode: string;
  submittedAt: Date;
}

interface RuleEnginePayload {
  ui?: {
    inline_messages?: string[];
    overlay_rules?: string[];
  };
}

export function PoolHubMakePicks({ league, timeContext }: PoolHubMakePicksProps) {
  const { isDemoMode } = useDemoAuth();
  
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [existingPicks, setExistingPicks] = useState<ExistingPick[]>([]);
  const [picks, setPicks] = useState<Map<number, Pick>>(new Map());
  const [tiebreaker, setTiebreaker] = useState("");
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [receiptInfo, setReceiptInfo] = useState<ReceiptInfo | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [rulePayload, setRulePayload] = useState<RuleEnginePayload | null>(null);
  
  // Load data on mount
  useEffect(() => {
    if (isDemoMode) {
      loadDemoData();
    } else {
      loadRealData();
    }
  }, [league.id, isDemoMode]);
  
  // Reload events when period changes
  useEffect(() => {
    if (currentPeriod && !isDemoMode) {
      fetchEvents();
      fetchPicks();
      fetchRuleEngine(currentPeriod);
    }
  }, [currentPeriod, activeEntryId, isDemoMode]);
  
  const loadDemoData = () => {
    const demoLeague = league as DemoLeague;
    
    const periods = getDemoPeriodsForLeague(league.id);
    setAvailablePeriods(periods);
    setCurrentPeriod(getDemoCurrentPeriod(league.id));
    
    // Load events
    const demoEvents = getDemoEventsForLeague(league.id);
    setEvents(demoEvents);
    
    // Load existing picks
    const demoPicks = getDemoPicksForLeague(league.id);
    setExistingPicks(demoPicks);
    
    // Initialize picks map
    const picksMap = new Map<number, Pick>();
    demoPicks.forEach(p => {
      picksMap.set(p.event_id, {
        event_id: p.event_id,
        pick_value: p.pick_value,
        confidence_rank: p.confidence_rank || undefined,
      });
    });
    setPicks(picksMap);
    
    // Set receipt info if picks exist and state indicates submitted
    if (demoPicks.length > 0 && (demoLeague.state === "submitted" || demoLeague.state === "locked" || demoLeague.state === "live" || demoLeague.state === "final")) {
      setReceiptInfo({
        receiptCode: `PV-DM${league.id}X-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        submittedAt: new Date(Date.now() - Math.random() * 86400000),
      });
    }
    
    setIsLoading(false);
  };
  
  const loadRealData = async () => {
    try {
      const [periodsRes, entriesRes] = await Promise.all([
        fetch(`/api/leagues/${league.id}/periods`),
        fetch(`/api/leagues/${league.id}/my-entries`),
      ]);
      if (periodsRes.ok) {
        const periodsData = await periodsRes.json();
        setAvailablePeriods(periodsData.periods);
        if (periodsData.periods.length > 0) {
          setCurrentPeriod(periodsData.currentPeriod || periodsData.periods[0]);
        }
      }
      if (entriesRes.ok) {
        const entriesData = await entriesRes.json();
        const nextEntries = Array.isArray(entriesData?.entries) ? entriesData.entries : [];
        setEntries(nextEntries);
        const defaultEntry = nextEntries.find((entry: EntryOption) => entry.isPrimary) || nextEntries[0];
        if (defaultEntry) {
          setActiveEntryId(defaultEntry.id);
        }
      }
    } catch (err) {
      console.error("Failed to load periods:", err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchEvents = async () => {
    try {
      const response = await fetch(`/api/leagues/${league.id}/events?period=${currentPeriod}`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
  };
  
  const fetchPicks = async () => {
    try {
      const params = new URLSearchParams({ period: currentPeriod });
      if (activeEntryId) {
        params.set("entry_id", String(activeEntryId));
      }
      const response = await fetch(`/api/leagues/${league.id}/picks?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        const resolvedPicks = Array.isArray(data) ? data : Array.isArray(data?.picks) ? data.picks : [];
        if (data?.entry?.id && Number.isFinite(Number(data.entry.id))) {
          setActiveEntryId(Number(data.entry.id));
        }
        setExistingPicks(resolvedPicks);
        
        const picksMap = new Map<number, Pick>();
        resolvedPicks.forEach((p: ExistingPick) => {
          picksMap.set(p.event_id, {
            event_id: p.event_id,
            pick_value: p.pick_value,
            confidence_rank: p.confidence_rank || undefined,
          });
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

  const fetchRuleEngine = async (period: string) => {
    try {
      const response = await fetch(`/api/leagues/${league.id}/rules-engine?period=${encodeURIComponent(period)}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const data = await response.json();
      setRulePayload(data);
    } catch {
      // Non-blocking: picks flow should continue even if rule hints fail.
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
      } else {
        newPicks.set(eventId, {
          event_id: eventId,
          pick_value: pickValue,
          confidence_rank: existing?.confidence_rank,
        });
      }
      return newPicks;
    });
    
    setJustSubmitted(false);
  };
  
  const handleConfidenceChange = (eventId: number, rank: number) => {
    const event = events.find(e => e.id === eventId);
    if (!event || isGameLocked(event)) return;
    
    setPicks(prev => {
      const newPicks = new Map(prev);
      const existing = newPicks.get(eventId);
      if (existing) {
        newPicks.set(eventId, { ...existing, confidence_rank: rank });
      }
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
    setIsSubmitting(true);
    
    // Demo mode: simulate successful submission
    if (isDemoMode) {
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const demoReceiptCode = `PV-DM${league.id}X-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const demoHash = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      setReceiptInfo({
        receiptCode: demoReceiptCode,
        submittedAt: new Date(),
      });
      setJustSubmitted(true);
      setIsSubmitting(false);
      
      return { 
        receiptCode: demoReceiptCode, 
        hash: demoHash,
        deliveries: [{ channel: 'email', status: 'pending' }],
      };
    }
    
    try {
      const response = await fetch(`/api/leagues/${league.id}/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_id: currentPeriod,
          picks: Array.from(picks.values()),
          tiebreaker_value: tiebreaker ? parseInt(tiebreaker) : null,
          entry_id: activeEntryId || undefined,
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
    } finally {
      setIsSubmitting(false);
    }
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
  
  // Calculate stats
  const stats = useMemo(() => {
    const totalGames = events.filter(e => !isGameLocked(e)).length;
    const pickedGames = Array.from(picks.values()).filter(p => {
      const event = events.find(e => e.id === p.event_id);
      return event && !isGameLocked(event);
    }).length;
    const lockedGames = events.filter(e => isGameLocked(e)).length;
    const liveGames = events.filter(e => e.status === "live").length;
    
    return { 
      totalGames, 
      pickedGames, 
      lockedGames, 
      liveGames, 
      allPicked: pickedGames === totalGames && totalGames > 0 
    };
  }, [events, picks]);
  
  const isConfidencePool = league.format_key === "confidence";
  const firstLockTime = getFirstLockTime();
  const isLocked = timeContext?.status === "locked" || timeContext?.status === "live" || timeContext?.status === "final";
  const inlineRuleMessages = rulePayload?.ui?.inline_messages ?? [];
  
  // Map event status to GameRow status
  const getGameStatus = (event: GameEvent): GameStatus => {
    if (event.status === "live") return "live";
    if (event.status === "final") return "final";
    return "scheduled";
  };
  
  if (isLoading) {
    return (
      <div className="space-y-4 animate-page-enter">
        {[1, 2, 3].map(i => (
          <GameRowSkeleton key={i} />
        ))}
      </div>
    );
  }
  
  return (
    <div className="space-y-6 animate-page-enter">
      {entries.length > 1 && (
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <p className="text-xs text-muted-foreground mb-2">My Entries</p>
          <div className="flex flex-wrap gap-2">
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  if (entry.id === activeEntryId) return;
                  setActiveEntryId(entry.id);
                  setJustSubmitted(false);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                  entry.id === activeEntryId
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted",
                )}
              >
                {entry.entryName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Period Navigator */}
      {availablePeriods.length > 1 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
          <button
            onClick={() => navigatePeriod("prev")}
            disabled={availablePeriods.indexOf(currentPeriod) === 0}
            className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="text-center">
            <div className="font-semibold">{currentPeriod}</div>
            {firstLockTime && !isLocked && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <Clock className="w-3 h-3" />
                <CountdownPill targetDate={firstLockTime} size="sm" />
              </div>
            )}
          </div>
          
          <button
            onClick={() => navigatePeriod("next")}
            disabled={availablePeriods.indexOf(currentPeriod) === availablePeriods.length - 1}
            className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
      
      {/* Lock Status Banner */}
      {timeContext && (
        <div className={cn(
          "rounded-xl p-4 flex items-center justify-between",
          isLocked 
            ? "bg-muted/50 border border-border" 
            : "bg-primary/5 border border-primary/20"
        )}>
          <div className="flex items-center gap-3">
            {isLocked ? (
              <Lock className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Target className="w-5 h-5 text-primary" />
            )}
            <div>
              <p className={cn(
                "font-medium",
                isLocked ? "text-muted-foreground" : "text-foreground"
              )}>
                {isLocked 
                  ? `${timeContext.periodLabel} ${timeContext.periodNumber} is locked`
                  : `${stats.pickedGames}/${stats.totalGames} games picked`
                }
              </p>
              {!isLocked && stats.totalGames > 0 && (
                <p className="text-sm text-muted-foreground">
                  {stats.allPicked ? "All games picked!" : `${stats.totalGames - stats.pickedGames} remaining`}
                </p>
              )}
            </div>
          </div>
          {!isLocked && timeContext.lockTime && (
            <CountdownPill targetDate={timeContext.lockTime} size="md" />
          )}
        </div>
      )}

      {inlineRuleMessages.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground mb-2">Rule tips</p>
          <div className="space-y-1">
            {inlineRuleMessages.slice(0, 3).map((msg) => (
              <p key={msg} className="text-sm">
                {msg}
              </p>
            ))}
          </div>
        </div>
      )}
      
      {/* Submitted Banner with Receipt */}
      {receiptInfo && (existingPicks.length > 0 || justSubmitted) && (
        <div className={cn(
          "p-4 rounded-xl border-2 border-dashed",
          justSubmitted 
            ? "bg-[hsl(var(--success)/0.1)] border-[hsl(var(--success)/0.3)] animate-stamp-drop" 
            : "bg-secondary/50 border-border"
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
                <div className="text-xs text-muted-foreground">
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
            />
          </div>
        </div>
      )}
      
      {/* Error Message */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {/* Ask Billy AI Button */}
      <button
        onClick={() => setShowAIHelper(true)}
        className="w-full p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-xl">
          🏈
        </div>
        <div className="flex-1 text-left">
          <div className="font-medium text-emerald-600 dark:text-emerald-400 text-sm">Ask Billy</div>
          <div className="text-xs text-muted-foreground">Get help with rules and strategy</div>
        </div>
        <Sparkles className="w-4 h-4 text-emerald-500" />
      </button>
      
      {showAIHelper && (
        <AIAssistant 
          leagueId={league.id} 
          defaultPersona="billy" 
          isOpen={showAIHelper}
          onClose={() => setShowAIHelper(false)}
        />
      )}
      
      {/* Games List */}
      {events.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-card border border-border/50">
          <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No games available for this period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event, index) => {
            const locked = isGameLocked(event);
            const pick = picks.get(event.id);
            const existingPick = existingPicks.find(p => p.event_id === event.id);
            
            return (
              <div 
                key={event.id}
                className="animate-slide-up-fade"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <GameRow
                  gameId={event.id}
                  awayTeam={event.away_team}
                  homeTeam={event.home_team}
                  awayScore={event.away_score}
                  homeScore={event.home_score}
                  status={getGameStatus(event)}
                  startTime={event.start_at}
                  gameClock={event.clock ? `${event.quarter} ${event.clock}` : undefined}
                  winner={event.winner}
                  selectedTeam={pick?.pick_value}
                  isLocked={locked}
                  onSelectTeam={(team) => handlePick(event.id, team)}
                />
                
                {/* Confidence Rank Input */}
                {isConfidencePool && pick && !locked && (
                  <div className="mt-2 ml-4 flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap">
                      Confidence
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={events.length}
                      value={pick.confidence_rank || ""}
                      onChange={(e) => handleConfidenceChange(event.id, parseInt(e.target.value) || 0)}
                      className="w-20 text-center font-mono"
                      placeholder="#"
                    />
                    <span className="text-xs text-muted-foreground">/ {events.length}</span>
                  </div>
                )}
                
                {/* Locked Pick Display */}
                {locked && existingPick && (
                  <div className="mt-2 ml-4 flex items-center justify-between p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-[hsl(var(--success)/0.2)] flex items-center justify-center">
                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" />
                      </div>
                      <span className="text-muted-foreground">Your pick:</span>
                      <span className="font-semibold">{existingPick.pick_value}</span>
                    </div>
                    {existingPick.confidence_rank && (
                      <div className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {existingPick.confidence_rank} pts
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Submit Section */}
      {events.length > 0 && stats.totalGames > 0 && (
        <div className="p-6 rounded-2xl bg-card border border-border/50 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Ready to Submit?</h3>
              <p className="text-sm text-muted-foreground">
                {stats.allPicked 
                  ? "All games picked!"
                  : `${stats.totalGames - stats.pickedGames} games remaining`
                }
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{stats.pickedGames}</div>
              <div className="text-xs text-muted-foreground">/ {stats.totalGames}</div>
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
              "w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
              "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              stats.allPicked && "animate-pulse"
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
        </div>
      )}
      
      {/* Submit Confirmation Modal */}
      <SubmitConfirmation
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmSubmit}
        picks={Array.from(picks.values())}
        periodId={currentPeriod}
        leagueName={league.name}
        tiebreaker={tiebreaker}
      />
    </div>
  );
}
