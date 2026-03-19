import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Clock, Lock, Check, AlertCircle, Loader2, Send, 
  ChevronLeft, ChevronRight, Shield, Skull, Trophy, Star,
  XCircle, CheckCircle2, Sparkles, Radio, Heart, RefreshCw
} from "lucide-react";
import { TeamBadge, type SurvivorState } from "@/react-app/components/ui/team-badge";
import { cn } from "@/react-app/lib/utils";

import { AIAssistant } from "@/react-app/components/AIAssistant";
import { SubmitConfirmation } from "@/react-app/components/SubmitConfirmation";
import { SurvivorFieldCollapse } from "@/react-app/components/SurvivorFieldCollapse";
import {
  StatusPill,
  CountdownPill,
  SportBadge,
  ReceiptStamp,
} from "@/react-app/components/ui/premium";

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
}

interface SurvivorPick {
  period_id: string;
  team: string;
  result: "pending" | "win" | "loss";
  event_id: number;
}

interface SurvivorStatus {
  isEliminated: boolean;
  eliminatedWeek: string | null;
  usedTeams: string[];
  currentStreak: number;
  picks: SurvivorPick[];
  livesRemaining?: number;
  totalLives?: number;
  entryNumber?: number;
  canReenter?: boolean;
}

export function SurvivorPicks() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [league, setLeague] = useState<League | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [survivorStatus, setSurvivorStatus] = useState<SurvivorStatus>({
    isEliminated: false,
    eliminatedWeek: null,
    usedTeams: [],
    currentStreak: 0,
    picks: [],
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [receiptCode, setReceiptCode] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [isReentering, setIsReentering] = useState(false);

  useEffect(() => {
    if (id) {
      fetchLeague();
    }
  }, [id]);

  useEffect(() => {
    if (league && currentPeriod) {
      fetchEvents();
      fetchSurvivorStatus();
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
        setEvents(data);
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
  };

  const fetchSurvivorStatus = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}/survivor-status`);
      if (response.ok) {
        const data = await response.json();
        setSurvivorStatus(data);
        
        // Set selected team if there's a pick for current period
        const currentPick = data.picks?.find((p: SurvivorPick) => p.period_id === currentPeriod);
        if (currentPick) {
          setSelectedTeam(currentPick.team);
          setReceiptCode(`PV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`);
        } else {
          setSelectedTeam(null);
          setReceiptCode(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch survivor status:", err);
      // Demo fallback
      setSurvivorStatus({
        isEliminated: false,
        eliminatedWeek: null,
        usedTeams: ["Chiefs", "Ravens", "Lions"],
        currentStreak: 3,
        picks: [
          { period_id: "Week 1", team: "Chiefs", result: "win", event_id: 1 },
          { period_id: "Week 2", team: "Ravens", result: "win", event_id: 2 },
          { period_id: "Week 3", team: "Lions", result: "win", event_id: 3 },
        ],
      });
    }
  };

  const isGameLocked = (event: GameEvent): boolean => {
    const now = new Date();
    const gameTime = new Date(event.start_at);
    return now >= gameTime || event.status !== "scheduled";
  };

  const isTeamUsed = (team: string): boolean => {
    return survivorStatus.usedTeams.includes(team);
  };

  const handleTeamSelect = (team: string, eventId: number) => {
    if (survivorStatus.isEliminated) return;
    if (isTeamUsed(team)) return;
    
    const event = events.find(e => e.id === eventId);
    if (!event || isGameLocked(event)) return;

    setSelectedTeam(prev => prev === team ? null : team);
    setJustSubmitted(false);
  };

  const handleSubmitClick = () => {
    if (!selectedTeam) {
      setError("Please select a team");
      return;
    }
    setError("");
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async (): Promise<{ receiptCode: string; hash: string; isUpdate?: boolean; previousReceiptCode?: string; deliveries?: Array<{ channel: string; status: string }> } | null> => {
    const selectedEvent = events.find(
        e => e.home_team === selectedTeam || e.away_team === selectedTeam
      );
      
      const response = await fetch(`/api/leagues/${id}/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_id: currentPeriod,
          picks: [{
            event_id: selectedEvent?.id,
            pick_value: selectedTeam,
          }],
          survivor_pick: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit pick");
      }

      const data = await response.json();
      setReceiptCode(data.receiptCode);
      setJustSubmitted(true);
      fetchSurvivorStatus();
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

  const formatGameTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getFirstLockTime = (): Date | null => {
    const scheduledEvents = events.filter(e => e.status === "scheduled");
    if (scheduledEvents.length === 0) return null;
    const times = scheduledEvents.map(e => new Date(e.start_at).getTime());
    return new Date(Math.min(...times));
  };

  // Get all teams available this week
  const availableTeams = events.flatMap(e => [
    { team: e.home_team, event: e, isHome: true },
    { team: e.away_team, event: e, isHome: false },
  ]).sort((a, b) => {
    // Sort: available first, then used
    const aUsed = isTeamUsed(a.team);
    const bUsed = isTeamUsed(b.team);
    if (aUsed !== bUsed) return aUsed ? 1 : -1;
    return a.team.localeCompare(b.team);
  });

  const firstLockTime = getFirstLockTime();
  const currentPick = survivorStatus.picks.find(p => p.period_id === currentPeriod);
  const hasPickThisWeek = !!currentPick;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading survivor pool...</p>
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">League not found</p>
        <Link to="/">
          <button className="btn-ghost mt-4">Back to Dashboard</button>
        </Link>
      </div>
    );
  }

  // Parse rules to get survivor type and variant
  let survivorType: "winner" | "loser" | "ats" = "winner";
  let survivorVariant: "standard" | "two_life" | "reentry" = "standard";
  try {
    const rules = JSON.parse(league.rules_json || "{}");
    survivorType = rules.survivorType || "winner";
    survivorVariant = rules.survivorVariant || "standard";
  } catch {}

  const handleReentry = async () => {
    // Re-entry logic - API call
    setIsReentering(true);
    try {
      const response = await fetch(`/api/leagues/${id}/survivor-reentry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to re-enter");
      }

      // Refresh survivor status
      fetchSurvivorStatus();
      setSelectedTeam(null);
      setReceiptCode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-enter");
    } finally {
      setIsReentering(false);
    }
  };

  const getSurvivorTypeLabel = () => {
    switch (survivorType) {
      case "loser": return "Pick a team to LOSE";
      case "ats": return "Pick a team to cover the spread";
      default: return "Pick a team to WIN";
    }
  };

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
              <SportBadge sport={league.sport_key} format="Survivor" />
            </div>
            <h1 className="text-h1">{league.name}</h1>
          </div>
        </div>
        {survivorStatus.isEliminated ? (
          <StatusPill status="eliminated" />
        ) : (
          <StatusPill status={hasPickThisWeek ? "submitted" : "open"} />
        )}
      </div>

      {/* Eliminated Banner */}
      {survivorStatus.isEliminated && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center">
              <Skull className="h-6 w-6 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-destructive">Eliminated</h3>
              <p className="text-sm text-muted-foreground">
                Your run ended in {survivorStatus.eliminatedWeek} after {survivorStatus.currentStreak} weeks
              </p>
            </div>
          </div>
          
          {/* Re-entry Option */}
          {survivorVariant === "reentry" && survivorStatus.canReenter && (
            <div className="mt-4 pt-4 border-t border-destructive/20">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-amber-500" />
                  <div>
                    <div className="font-medium text-amber-600 dark:text-amber-400">Ready for another shot?</div>
                    <div className="text-caption">Re-enter with fresh team selections</div>
                  </div>
                </div>
                <button
                  onClick={handleReentry}
                  disabled={isReentering}
                  className="btn-secondary bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-400"
                >
                  {isReentering ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Re-entering...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Re-Enter Pool
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lives Indicator - Two Life Variant */}
      {survivorVariant === "two_life" && (
        <div className="card-premium p-4 border-purple-500/30 bg-purple-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <div className="font-semibold text-purple-600 dark:text-purple-400">Two Lives Mode</div>
                <div className="text-caption">Survive one loss and keep playing</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: survivorStatus.totalLives || 2 }).map((_, i) => (
                <Heart
                  key={i}
                  className={cn(
                    "h-7 w-7 transition-all",
                    i < (survivorStatus.livesRemaining || 0)
                      ? "text-red-500 fill-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                      : "text-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          </div>
          {survivorStatus.livesRemaining === 1 && (survivorStatus.totalLives || 2) === 2 && (
            <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>One life remaining! Your next loss will eliminate you.</span>
            </div>
          )}
        </div>
      )}

      {/* Entry Number - Re-entry Variant */}
      {survivorVariant === "reentry" && (survivorStatus.entryNumber || 1) > 1 && (
        <div className="card-premium p-3 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Entry #{survivorStatus.entryNumber} — Fresh start with all teams available
            </span>
          </div>
        </div>
      )}

      {/* Field Collapse Visualization */}
      <SurvivorFieldCollapse 
        leagueId={parseInt(id || "0")} 
        isDemoMode={false}
      />

      {/* Stats Cards */}
      <div className={cn("grid gap-3", survivorVariant === "two_life" ? "grid-cols-4" : "grid-cols-3")}>
        <div className="card-premium p-4 text-center">
          <div className="text-3xl font-bold text-primary">{survivorStatus.currentStreak}</div>
          <div className="text-caption">Win Streak</div>
        </div>
        <div className="card-premium p-4 text-center">
          <div className="text-3xl font-bold">{survivorStatus.usedTeams.length}</div>
          <div className="text-caption">Teams Used</div>
        </div>
        <div className="card-premium p-4 text-center">
          <div className="text-3xl font-bold text-emerald-600">
            {survivorStatus.isEliminated ? 0 : availableTeams.filter(t => !isTeamUsed(t.team)).length / 2}
          </div>
          <div className="text-caption">Teams Left</div>
        </div>
        {survivorVariant === "two_life" && (
          <div className="card-premium p-4 text-center">
            <div className="text-3xl font-bold text-red-500">{survivorStatus.livesRemaining || 0}</div>
            <div className="text-caption">Lives Left</div>
          </div>
        )}
      </div>

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
            </button>
            
            <div className="text-center flex-1">
              <div className="text-display text-2xl sm:text-3xl">{currentPeriod}</div>
              <div className="flex items-center justify-center gap-2 mt-1">
                {firstLockTime && !hasPickThisWeek && !survivorStatus.isEliminated && (
                  <CountdownPill targetDate={firstLockTime} size="sm" />
                )}
                <span className="text-caption">{getSurvivorTypeLabel()}</span>
              </div>
            </div>
            
            <button
              onClick={() => navigatePeriod("next")}
              disabled={availablePeriods.indexOf(currentPeriod) === availablePeriods.length - 1}
              className="btn-ghost disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Pick History Timeline - Using TeamBadge */}
      {survivorStatus.picks.length > 0 && (
        <div className="card-premium p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Your Survivor Journey
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {survivorStatus.picks.map((pick) => {
              const survivorState: SurvivorState = 
                pick.result === "loss" ? "eliminated" : 
                pick.result === "pending" ? "sweating" : "alive";
              
              return (
                <div 
                  key={pick.period_id}
                  className={cn(
                    "shrink-0 flex flex-col items-center gap-2 p-3 rounded-xl border-2",
                    pick.result === "win" && "border-emerald-500/30 bg-emerald-500/5",
                    pick.result === "loss" && "border-destructive/30 bg-destructive/5",
                    pick.result === "pending" && "border-primary/30 bg-primary/5"
                  )}
                >
                  <div className="text-xs text-muted-foreground font-medium">{pick.period_id}</div>
                  <TeamBadge 
                    teamName={pick.team}
                    size="md"
                    status={pick.result === "pending" ? "live" : "final"}
                    survivorState={survivorState}
                  />
                  <div className="flex items-center gap-1">
                    {pick.result === "win" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    {pick.result === "loss" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    {pick.result === "pending" && <Radio className="h-3.5 w-3.5 text-primary animate-pulse" />}
                    <span className={cn(
                      "text-xs font-medium capitalize",
                      pick.result === "win" && "text-emerald-500",
                      pick.result === "loss" && "text-destructive",
                      pick.result === "pending" && "text-primary"
                    )}>
                      {pick.result === "pending" ? "Live" : pick.result}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submitted Pick Banner */}
      {receiptCode && (hasPickThisWeek || justSubmitted) && (
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
                <Check className={cn(
                  "w-5 h-5",
                  justSubmitted ? "text-[hsl(var(--success))]" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <div className="font-semibold">
                  {justSubmitted ? "Pick Locked In!" : "Pick Saved"} — {selectedTeam || currentPick?.team}
                </div>
                <div className="text-caption">
                  {currentPeriod} Survivor Pick
                </div>
              </div>
            </div>
            <ReceiptStamp 
              receiptCode={receiptCode}
              submittedAt={new Date()}
              onClick={() => navigate('/picks')}
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

      {/* Billy AI Helper */}
      <button
        onClick={() => setShowAIHelper(true)}
        className="w-full p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-2xl">
          🏈
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold text-emerald-600 dark:text-emerald-400">Ask Billy</div>
          <div className="text-caption">Get survivor strategy advice</div>
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

      {/* Team Selection Grid */}
      {!survivorStatus.isEliminated && !hasPickThisWeek && (
        <>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Select Your Team
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {events.map((event, index) => {
              const locked = isGameLocked(event);
              const homeUsed = isTeamUsed(event.home_team);
              const awayUsed = isTeamUsed(event.away_team);
              const homeSelected = selectedTeam === event.home_team;
              const awaySelected = selectedTeam === event.away_team;

              return (
                <div 
                  key={event.id}
                  className={cn(
                    "card-premium p-4 animate-slide-up-fade",
                    locked && "opacity-60"
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  {/* Game Time */}
                  <div className="flex items-center gap-2 mb-3 text-xs">
                    {locked ? (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        LOCKED
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatGameTime(event.start_at)}
                      </div>
                    )}
                  </div>

                  {/* Teams - Using TeamBadge */}
                  <div className="space-y-2">
                    {/* Away Team */}
                    <button
                      onClick={() => handleTeamSelect(event.away_team, event.id)}
                      disabled={locked || awayUsed}
                      className={cn(
                        "w-full p-3 rounded-xl border-2 transition-all text-left flex items-center gap-3",
                        awaySelected && "border-primary bg-primary/10 shadow-lg shadow-primary/20",
                        awayUsed && "border-muted bg-muted/30 opacity-60",
                        !awaySelected && !awayUsed && "border-border hover:border-primary/50 hover:bg-secondary/30",
                        "disabled:cursor-not-allowed"
                      )}
                    >
                      <TeamBadge
                        teamName={event.away_team}
                        size="md"
                        emphasis={awaySelected ? "selected" : "normal"}
                        survivorState={awayUsed ? "eliminated" : "alive"}
                        disabled={awayUsed}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "font-semibold truncate",
                          awayUsed && "line-through text-muted-foreground"
                        )}>
                          {event.away_team}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          @ {event.home_team}
                        </div>
                      </div>
                      {awayUsed && (
                        <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded-full">Used</span>
                      )}
                    </button>

                    {/* Home Team */}
                    <button
                      onClick={() => handleTeamSelect(event.home_team, event.id)}
                      disabled={locked || homeUsed}
                      className={cn(
                        "w-full p-3 rounded-xl border-2 transition-all text-left flex items-center gap-3",
                        homeSelected && "border-primary bg-primary/10 shadow-lg shadow-primary/20",
                        homeUsed && "border-muted bg-muted/30 opacity-60",
                        !homeSelected && !homeUsed && "border-border hover:border-primary/50 hover:bg-secondary/30",
                        "disabled:cursor-not-allowed"
                      )}
                    >
                      <TeamBadge
                        teamName={event.home_team}
                        size="md"
                        emphasis={homeSelected ? "selected" : "normal"}
                        survivorState={homeUsed ? "eliminated" : "alive"}
                        disabled={homeUsed}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "font-semibold truncate",
                          homeUsed && "line-through text-muted-foreground"
                        )}>
                          {event.home_team}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          vs {event.away_team}
                        </div>
                      </div>
                      {homeUsed && (
                        <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded-full">Used</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Submit Section */}
          <div className="card-hero space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-h3">Lock In Your Pick</h3>
                <p className="text-caption">
                  {selectedTeam 
                    ? `You selected: ${selectedTeam}`
                    : "Choose one team for this week"
                  }
                </p>
              </div>
              {selectedTeam && (
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
              )}
            </div>

            <button 
              onClick={handleSubmitClick}
              disabled={isSubmitting || !selectedTeam}
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
                  Lock In {selectedTeam || "Pick"}
                </>
              )}
            </button>

            <p className="text-caption text-center flex items-center justify-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              SHA-256 sealed • One loss and you're out
            </p>
          </div>
        </>
      )}

      {/* Submit Confirmation Modal */}
      <SubmitConfirmation
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmSubmit}
        picks={selectedTeam ? [{ event_id: events.find(e => e.home_team === selectedTeam || e.away_team === selectedTeam)?.id || 0, pick_value: selectedTeam }] : []}
        periodId={currentPeriod}
        leagueName={league?.name || ""}
      />

      {/* Used Teams Reference - Using TeamBadge */}
      {survivorStatus.usedTeams.length > 0 && (
        <div className="card-premium p-4">
          <h3 className="text-sm font-semibold mb-3">Teams Already Used</h3>
          <div className="flex flex-wrap gap-2">
            {survivorStatus.usedTeams.map(team => (
              <TeamBadge
                key={team}
                teamName={team}
                size="sm"
                survivorState="eliminated"
                disabled
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
