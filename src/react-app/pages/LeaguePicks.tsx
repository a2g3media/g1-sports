import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/react-app/components/ui/button";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { 
  ArrowLeft, Check, AlertCircle, Loader2, Send, 
  ChevronLeft, ChevronRight, Trophy, CreditCard, Shield, 
  FileCheck, Sparkles
} from "lucide-react";
import { POOL_FORMATS } from "@/react-app/data/sports";
import { PoolAccessGate } from "@/react-app/components/PoolAccessGate";

import { cn } from "@/react-app/lib/utils";
import { AIAssistant } from "@/react-app/components/AIAssistant";
import { SubmitConfirmation } from "@/react-app/components/SubmitConfirmation";
import { PaymentModal } from "@/react-app/components/PaymentModal";
import { formatCurrency } from "@/shared/escrow";
import {
  StatusPill,
  CountdownPill,
  SportBadge,
  ReceiptStamp,
} from "@/react-app/components/ui/premium";
import { GameRow, GameStatus } from "@/react-app/components/ui/game-row";

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
}

interface PaymentEligibility {
  isEligible: boolean;
  isPaymentRequired: boolean;
  requiredAmountCents: number;
  paidAmountCents: number;
  pendingAmountCents: number;
}

interface ReceiptInfo {
  receiptCode: string;
  submittedAt: Date;
}

export function LeaguePicks() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  
  const [league, setLeague] = useState<League | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [existingPicks, setExistingPicks] = useState<ExistingPick[]>([]);
  const [picks, setPicks] = useState<Map<number, Pick>>(new Map());
  const [tiebreaker, setTiebreaker] = useState("");
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [paymentEligibility, setPaymentEligibility] = useState<PaymentEligibility | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [receiptInfo, setReceiptInfo] = useState<ReceiptInfo | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const USE_PAGE_DATA_P0 = true;

  useEffect(() => {
    if (id) {
      if (USE_PAGE_DATA_P0) {
        fetchPageData();
      } else {
        fetchLeague();
        fetchPaymentEligibility();
      }
    }
  }, [id]);

  const headers: HeadersInit = isDemoMode ? { "X-Demo-Mode": "true" } : {};

  const fetchPaymentEligibility = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}/payments/eligibility`, { headers });
      if (response.ok) {
        const data = await response.json();
        setPaymentEligibility(data);
      }
    } catch (err) {
      console.error("Failed to fetch payment eligibility:", err);
    }
  };

  useEffect(() => {
    if (USE_PAGE_DATA_P0) return;
    if (league && currentPeriod) {
      fetchEvents();
      fetchPicks();
    }
  }, [league, currentPeriod]);

  const fetchPageData = async () => {
    const loadStartedAt = Date.now();
    let apiCalls = 0;
    try {
      apiCalls += 1;
      const response = await fetch(`/api/page-data/league-picks?leagueId=${encodeURIComponent(String(id || ""))}`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch league picks page-data");
      const payload = await response.json().catch(() => null) as any;
      const data = payload?.data || {};
      setLeague(data?.league || null);
      const periods = Array.isArray(data?.availablePeriods) ? data.availablePeriods : [];
      setAvailablePeriods(periods);
      const selectedPeriod = String(data?.currentPeriod || periods?.[0] || "");
      if (selectedPeriod) setCurrentPeriod(selectedPeriod);
      const eventsData = Array.isArray(data?.events) ? data.events : [];
      setEvents(eventsData);
      const resolvedPicks = Array.isArray(data?.picks) ? data.picks : [];
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
      setPaymentEligibility(data?.paymentEligibility || null);
      if (resolvedPicks.length > 0) {
        setReceiptInfo({
          receiptCode: `PV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          submittedAt: new Date(Date.now() - Math.random() * 86400000),
        });
      } else {
        setReceiptInfo(null);
      }
    } catch {
      setError("Failed to load league");
    } finally {
      void fetch("/api/page-data/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          route: "league-picks",
          loadMs: Math.max(0, Date.now() - loadStartedAt),
          apiCalls: Math.max(1, apiCalls),
          oddsAvailableAtFirstRender: false,
        }),
      }).catch(() => undefined);
      setIsLoading(false);
    }
  };

  const fetchLeague = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}`, { headers });
      if (!response.ok) throw new Error("Failed to fetch league");
      const data = await response.json();
      setLeague(data);
      
      // Fetch available periods
      const periodsRes = await fetch(`/api/leagues/${id}/periods`, { headers });
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
      const response = await fetch(`/api/leagues/${id}/events?period=${currentPeriod}`, { headers });
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
      const response = await fetch(`/api/leagues/${id}/picks?period=${currentPeriod}`, { headers });
      if (response.ok) {
        const data = await response.json();
        const resolvedPicks = Array.isArray(data) ? data : Array.isArray(data?.picks) ? data.picks : [];
        setExistingPicks(resolvedPicks);
        
        // Initialize picks map from existing picks
        const picksMap = new Map<number, Pick>();
        resolvedPicks.forEach((p: ExistingPick) => {
          picksMap.set(p.event_id, {
            event_id: p.event_id,
            pick_value: p.pick_value,
            confidence_rank: p.confidence_rank || undefined,
          });
        });
        setPicks(picksMap);
        
        // Set receipt info if picks exist
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
      } else {
        newPicks.set(eventId, {
          event_id: eventId,
          pick_value: pickValue,
          confidence_rank: existing?.confidence_rank,
        });
      }
      return newPicks;
    });
    
    // Clear just submitted state when making changes
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
    const response = await fetch(`/api/leagues/${id}/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { "X-Demo-Mode": "true" } : {}) },
        body: JSON.stringify({
          period_id: currentPeriod,
          picks: Array.from(picks.values()),
          tiebreaker_value: tiebreaker ? parseInt(tiebreaker) : null,
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

  const handleConfirmationClose = () => {
    setShowConfirmation(false);
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
    const liveGames = events.filter(e => e.status === "live" || e.status === "in_progress").length;
    
    return { totalGames, pickedGames, lockedGames, liveGames, allPicked: pickedGames === totalGames && totalGames > 0 };
  }, [events, picks]);

  const isConfidencePool = league?.format_key === "confidence";
  const firstLockTime = getFirstLockTime();
  
  // Determine overall status
  const getOverallStatus = (): "open" | "submitted" | "locked" | "live" | "final" => {
    if (stats.liveGames > 0) return "live";
    if (stats.lockedGames === events.length && events.length > 0) return "final";
    if (stats.lockedGames > 0 && stats.totalGames === 0) return "locked";
    if (existingPicks.length > 0 || justSubmitted) return "submitted";
    return "open";
  };

  // Map event status to GameRow status
  const getGameStatus = (event: GameEvent): GameStatus => {
    if (event.status === "live" || event.status === "in_progress") return "live";
    if (event.status === "final") return "final";
    if (event.status === "final_ot") return "final_ot";
    return "scheduled";
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

  // Check if payment is required but not completed
  const needsPayment = paymentEligibility?.isPaymentRequired && !paymentEligibility?.isEligible;
  const hasPendingPayment = paymentEligibility?.pendingAmountCents && paymentEligibility.pendingAmountCents > 0;

  // Payment Required Blocker
  if (needsPayment && !isLoading) {
    return (
      <div className="max-w-lg mx-auto py-12 animate-page-enter">
        <div className="card-hero text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
            <CreditCard className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-h1 mb-2">Payment Required</h2>
          <p className="text-muted-foreground mb-6">
            Pay your entry fee to unlock picks for this league
          </p>
          
          <div className="p-4 rounded-xl bg-secondary space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">League</span>
              <span className="font-medium">{league.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Entry Fee</span>
              <span className="font-mono font-semibold text-amber-600">
                {formatCurrency(paymentEligibility?.requiredAmountCents || 0)}
              </span>
            </div>
            {hasPendingPayment && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pending</span>
                <span className="font-mono text-blue-600">
                  {formatCurrency(paymentEligibility.pendingAmountCents)}
                </span>
              </div>
            )}
          </div>

          {hasPendingPayment ? (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-sm text-blue-700 dark:text-blue-300">
              Your payment is pending admin verification
            </div>
          ) : (
            <button 
              onClick={() => setShowPaymentModal(true)} 
              className="btn-cta w-full"
            >
              <CreditCard className="h-5 w-5" />
              Pay Entry Fee
            </button>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground mt-6 pt-6 border-t">
            <Shield className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-left">
              POOLVAULT tracks eligibility only. Payments are processed through 
              secure external providers or verified manually by league admins.
            </p>
          </div>
        </div>

        <div className="text-center mt-4">
          <Link to="/">
            <button className="btn-ghost">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>
          </Link>
        </div>

        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          leagueId={league.id}
          leagueName={league.name}
          entryFeeCents={paymentEligibility?.requiredAmountCents || 0}
          onPaymentComplete={() => {
            setShowPaymentModal(false);
            fetchPaymentEligibility();
          }}
        />
      </div>
    );
  }

  const overallStatus = getOverallStatus();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-page-enter">
      {/* Premium Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link to="/">
            <button className="btn-icon mt-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SportBadge sport={league.sport_key} format={format?.name || ""} />
            </div>
            <h1 className="text-h1">{league.name}</h1>
          </div>
        </div>
        <StatusPill status={overallStatus} />
      </div>

      {/* Period Navigation Card */}
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

      {/* Submitted Banner with Receipt Stamp */}
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

      {/* Billy AI Helper Button */}
      <button
        onClick={() => setShowAIHelper(true)}
        className="w-full p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-2xl">
          🏈
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold text-emerald-600 dark:text-emerald-400">Ask Billy</div>
          <div className="text-caption">Get help with rules and strategy</div>
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

      {/* Games List - Using new GameRow component */}
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
                  spread={event.spread}
                  winner={event.final_result || undefined}
                  selectedTeam={pick?.pick_value}
                  isLocked={locked}
                  onSelectTeam={(team) => handlePick(event.id, team)}
                />

                {/* Confidence Rank Input */}
                {isConfidencePool && pick && !locked && (
                  <div className="mt-2 ml-4 flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap">
                      Confidence Points
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
                    <span className="text-caption">/ {events.length}</span>
                  </div>
                )}

                {/* Locked Pick Display */}
                {locked && existingPick && (
                  <div className="mt-2 ml-4 flex items-center justify-between p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-[hsl(var(--success)/0.2)] flex items-center justify-center">
                        <Check className="h-3 w-3 text-[hsl(var(--success))]" />
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
        <div className="card-hero space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-h3">Ready to Submit?</h3>
              <p className="text-caption">
                {stats.allPicked 
                  ? "All games picked!"
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
          <PoolAccessGate action="submit" variant="inline">
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
          </PoolAccessGate>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      <SubmitConfirmation
        isOpen={showConfirmation}
        onClose={handleConfirmationClose}
        onConfirm={handleConfirmSubmit}
        picks={Array.from(picks.values())}
        periodId={currentPeriod}
        leagueName={league.name}
        tiebreaker={tiebreaker}
      />
    </div>
  );
}
