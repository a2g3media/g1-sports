import { useState, useEffect, useMemo, useCallback, useRef, TouchEvent } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Radio, Trophy, Target, Check, X, Clock, 
  Loader2, RefreshCw, ChevronRight, Zap, TrendingUp, TrendingDown,
  Users, AlertCircle, Flame, Bell, BellOff, Share2,
  ChevronUp, ChevronDown as ChevronDownIcon, MessageCircle, Eye, Volume2, VolumeX
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { SPORTS, POOL_FORMATS } from "@/react-app/data/sports";
import { ThresholdWhatJustChanged } from "@/react-app/components/ThresholdWhatJustChanged";

interface LeagueInfo {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  rules_json: string;
}

interface GameEvent {
  id: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: "scheduled" | "live" | "final" | "final_ot";
  start_at: string;
  winner?: string;
  quarter?: string;
  time_remaining?: string;
}

interface Pick {
  event_id: number;
  pick_value: string;
  confidence_rank?: number;
  is_correct?: boolean;
  points_earned?: number;
}

interface Standing {
  user_id: string;
  display_name: string;
  rank: number;
  total_points: number;
  current_streak: number;
  streak_type: "win" | "loss" | "none";
  is_current_user?: boolean;
  avatar_url?: string;
}

interface FriendActivity {
  userId: string;
  name: string;
  avatar?: string;
  pickTeam: string;
  eventId: number;
  isWinning: boolean;
}

export function GameDay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<"live" | "all" | "standings">("live");
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showScoreTicker, setShowScoreTicker] = useState(true);
  const [friendActivity] = useState<FriendActivity[]>([]);
  
  // Pull to refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);
  
  // Swipe state for tabs
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (id) {
      fetchData();
      // Auto-refresh every 30 seconds during live games
      const interval = setInterval(() => {
        if (events.some(e => e.status === "live")) {
          fetchData(true);
        }
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [id]);

  const fetchData = async (silent = false) => {
    const loadStartedAt = Date.now();
    let apiCalls = 0;
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    
    try {
      apiCalls += 1;
      const res = await fetch(`/api/page-data/league-gameday?leagueId=${encodeURIComponent(String(id || ""))}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch game day page-data");
      const payload = await res.json().catch(() => null) as any;
      const data = payload?.data || {};
      setLeague(data?.league || null);
      setCurrentPeriod(String(data?.currentPeriod || "Week 1"));
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setPicks(Array.isArray(data?.picks) ? data.picks : []);
      setStandings(Array.isArray(data?.standings) ? data.standings : []);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      void fetch("/api/page-data/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          route: "league-gameday",
          loadMs: Math.max(0, Date.now() - loadStartedAt),
          apiCalls: Math.max(1, apiCalls),
          oddsAvailableAtFirstRender: false,
        }),
      }).catch(() => undefined);
      setIsLoading(false);
      setIsRefreshing(false);
      setPullDistance(0);
      setIsPulling(false);
    }
  };

  const handleRefresh = useCallback(() => {
    fetchData(true);
  }, [id]);

  // Pull to refresh handlers
  const handleTouchStart = (e: TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    const deltaY = e.touches[0].clientY - touchStartY.current;
    const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
    
    // Horizontal swipe for tabs
    if (deltaX > Math.abs(deltaY) && deltaX > 10) {
      setSwipeOffset(e.touches[0].clientX - touchStartX.current);
      return;
    }
    
    // Vertical pull to refresh
    if (deltaY > 0 && containerRef.current?.scrollTop === 0) {
      setIsPulling(true);
      setPullDistance(Math.min(deltaY * 0.5, 100));
    }
  };

  const handleTouchEnd = () => {
    // Handle horizontal swipe
    if (Math.abs(swipeOffset) > 80) {
      const tabs = ["live", "all", "standings"] as const;
      const currentIndex = tabs.indexOf(activeTab);
      if (swipeOffset > 0 && currentIndex > 0) {
        setActiveTab(tabs[currentIndex - 1]);
      } else if (swipeOffset < 0 && currentIndex < tabs.length - 1) {
        setActiveTab(tabs[currentIndex + 1]);
      }
    }
    setSwipeOffset(0);
    
    // Handle pull to refresh
    if (pullDistance > 60) {
      fetchData(true);
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  };

  // Stats calculations
  const stats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let pending = 0;
    let live = 0;
    let pointsToday = 0;
    let potentialPoints = 0;

    picks.forEach(pick => {
      const event = events.find(e => e.id === pick.event_id);
      if (!event) return;
      
      if (event.status === "live") {
        live++;
        // Check if currently winning
        const isWinning = (pick.pick_value === event.home_team && (event.home_score ?? 0) > (event.away_score ?? 0)) ||
                          (pick.pick_value === event.away_team && (event.away_score ?? 0) > (event.home_score ?? 0));
        if (isWinning) {
          potentialPoints += pick.confidence_rank || 1;
        }
      } else if (event.status === "final" || event.status === "final_ot") {
        if (event.winner === pick.pick_value) {
          correct++;
          pointsToday += pick.points_earned || pick.confidence_rank || 1;
        } else {
          wrong++;
        }
      } else {
        pending++;
        potentialPoints += pick.confidence_rank || 1;
      }
    });

    const myStanding = standings.find(s => s.is_current_user);
    const myRank = myStanding?.rank || 0;

    return { correct, wrong, pending, live, pointsToday, potentialPoints, myRank };
  }, [events, picks, standings]);

  const getSportIcon = (sportKey: string) => {
    const sport = SPORTS.find(s => s.key === sportKey);
    const Icon = sport?.icon;
    return Icon ? <Icon className="h-5 w-5" /> : <span>🏆</span>;
  };

  const getFormatName = (formatKey: string) => {
    return POOL_FORMATS.find(f => f.key === formatKey)?.name || formatKey;
  };

  const getPickForEvent = (eventId: number) => {
    return picks.find(p => p.event_id === eventId);
  };

  // Group events by status
  const groupedEvents = useMemo(() => {
    const live = events.filter(e => e.status === "live").map(e => ({
      ...e,
      quarter: e.quarter || (Math.random() > 0.5 ? "Q3" : "Q4"),
      time_remaining: e.time_remaining || `${Math.floor(Math.random() * 12)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`
    }));
    const upcoming = events.filter(e => e.status === "scheduled").sort((a, b) => 
      new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
    const final = events.filter(e => e.status === "final" || e.status === "final_ot");
    return { live, upcoming, final };
  }, [events]);

  const hasLiveGames = groupedEvents.live.length > 0;
  const myStanding = standings.find(s => s.is_current_user);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center animate-pulse">
            <Radio className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">LIVE</span>
          </div>
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">League not found</p>
          <Link to="/" className="text-primary hover:underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-black text-white overflow-auto pb-24"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
      <div 
        className={cn(
          "absolute top-0 left-0 right-0 flex items-center justify-center transition-all duration-200 z-50",
          isPulling ? "opacity-100" : "opacity-0"
        )}
        style={{ 
          height: pullDistance, 
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)'
        }}
      >
        <RefreshCw className={cn(
          "h-6 w-6 transition-transform",
          pullDistance > 60 ? "text-primary rotate-180" : "text-white/50"
        )} />
      </div>

      {/* Floating Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/90 border-b border-white/10">
        {/* Score Ticker for Live Games */}
        {hasLiveGames && showScoreTicker && (
          <div className="bg-gradient-to-r from-red-600/20 via-red-500/10 to-red-600/20 border-b border-red-500/30">
            <div className="flex items-center gap-4 px-4 py-2 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="relative">
                  <Radio className="h-3 w-3 text-red-500" />
                  <div className="absolute inset-0 animate-ping">
                    <Radio className="h-3 w-3 text-red-500" />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Live</span>
              </div>
              {groupedEvents.live.map(game => {
                const pick = getPickForEvent(game.id);
                const pickedHome = pick?.pick_value === game.home_team;
                const pickedAway = pick?.pick_value === game.away_team;
                const homeWinning = (game.home_score ?? 0) > (game.away_score ?? 0);
                const awayWinning = (game.away_score ?? 0) > (game.home_score ?? 0);
                const myPickWinning = (pickedHome && homeWinning) || (pickedAway && awayWinning);
                
                return (
                  <button
                    key={game.id}
                    onClick={() => setSelectedGame(selectedGame === game.id ? null : game.id)}
                    className={cn(
                      "shrink-0 px-3 py-1.5 rounded-lg transition-all",
                      selectedGame === game.id ? "bg-white/20" : "bg-white/5",
                      myPickWinning && "ring-1 ring-emerald-500/50"
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn(
                        "font-medium",
                        awayWinning && "text-emerald-400",
                        pickedAway && "underline"
                      )}>
                        {game.away_team.slice(0, 3).toUpperCase()}
                      </span>
                      <span className="font-bold tabular-nums">{game.away_score}</span>
                      <span className="text-white/30">-</span>
                      <span className="font-bold tabular-nums">{game.home_score}</span>
                      <span className={cn(
                        "font-medium",
                        homeWinning && "text-emerald-400",
                        pickedHome && "underline"
                      )}>
                        {game.home_team.slice(0, 3).toUpperCase()}
                      </span>
                    </div>
                  </button>
                );
              })}
              <button 
                onClick={() => setShowScoreTicker(false)}
                className="shrink-0 p-1 text-white/30 hover:text-white/60"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate(-1)}
                className="p-2 -ml-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors active:scale-95"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  {getSportIcon(league.sport_key)}
                  <h1 className="font-bold text-base truncate max-w-[180px]">
                    {league.name}
                  </h1>
                </div>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">
                  {currentPeriod} • {getFormatName(league.format_key)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {/* Sound toggle */}
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={cn(
                  "p-2 rounded-xl transition-colors",
                  soundEnabled ? "bg-white/10 text-white" : "bg-white/5 text-white/30"
                )}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              
              {/* Notifications toggle */}
              <button 
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={cn(
                  "p-2 rounded-xl transition-colors",
                  notificationsEnabled ? "bg-primary/20 text-primary" : "bg-white/5 text-white/30"
                )}
              >
                {notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </button>
              
              {/* Share */}
              <button 
                onClick={() => navigator.share?.({ title: league.name, url: window.location.href })}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              >
                <Share2 className="h-4 w-4" />
              </button>
              
              {/* Refresh */}
              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Stats Panel */}
      <div className="px-4 py-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-transparent border border-white/10 p-4">
          {/* Background decoration */}
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/20 blur-3xl" />
          
          <div className="relative">
            {/* Your rank banner */}
            {myStanding && (
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold",
                    myStanding.rank === 1 && "bg-yellow-500 text-yellow-950",
                    myStanding.rank === 2 && "bg-gray-300 text-gray-700",
                    myStanding.rank === 3 && "bg-amber-600 text-white",
                    myStanding.rank > 3 && "bg-white/10 text-white"
                  )}>
                    {myStanding.rank === 1 ? <Trophy className="h-6 w-6" /> : `#${myStanding.rank}`}
                  </div>
                  <div>
                    <div className="text-xs text-white/50">Your Rank</div>
                    <div className="font-bold text-xl">{myStanding.total_points} pts</div>
                  </div>
                </div>
                {myStanding.current_streak > 1 && (
                  <div className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold",
                    myStanding.streak_type === "win" 
                      ? "bg-emerald-500/20 text-emerald-400" 
                      : "bg-red-500/20 text-red-400"
                  )}>
                    <Flame className="h-4 w-4" />
                    {myStanding.current_streak}{myStanding.streak_type === "win" ? "W" : "L"}
                  </div>
                )}
              </div>
            )}
            
            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-1">
                  <Check className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400">{stats.correct}</div>
                <div className="text-[10px] text-white/40 uppercase">Correct</div>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center mx-auto mb-1">
                  <X className="h-5 w-5 text-red-400" />
                </div>
                <div className="text-2xl font-bold text-red-400">{stats.wrong}</div>
                <div className="text-[10px] text-white/40 uppercase">Wrong</div>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center mx-auto mb-1">
                  <Radio className="h-5 w-5 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-amber-400">{stats.live}</div>
                <div className="text-[10px] text-white/40 uppercase">Live</div>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-1">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div className="text-2xl font-bold text-primary">{stats.pointsToday}</div>
                <div className="text-[10px] text-white/40 uppercase">Points</div>
              </div>
            </div>
            
            {/* Potential points */}
            {(stats.pending > 0 || stats.live > 0) && (
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-center gap-2 text-sm text-white/50">
                <Zap className="h-4 w-4 text-amber-400" />
                <span>{stats.potentialPoints} potential points remaining</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="px-4 mb-4">
        <div 
          className="flex gap-1 p-1 bg-white/5 rounded-xl relative overflow-hidden"
          style={{ transform: `translateX(${swipeOffset * 0.1}px)` }}
        >
          {/* Active indicator */}
          <div 
            className="absolute top-1 bottom-1 bg-white/10 rounded-lg transition-all duration-300"
            style={{
              left: activeTab === "live" ? "4px" : activeTab === "all" ? "calc(33.33% + 2px)" : "calc(66.66%)",
              width: "calc(33.33% - 4px)"
            }}
          />
          
          <button
            onClick={() => setActiveTab("live")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all relative z-10 flex items-center justify-center gap-2",
              activeTab === "live" ? "text-white" : "text-white/40"
            )}
          >
            {hasLiveGames && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
            Live
            {hasLiveGames && <span className="text-xs text-red-400">({groupedEvents.live.length})</span>}
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all relative z-10",
              activeTab === "all" ? "text-white" : "text-white/40"
            )}
          >
            All Games
          </button>
          <button
            onClick={() => setActiveTab("standings")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all relative z-10",
              activeTab === "standings" ? "text-white" : "text-white/40"
            )}
          >
            Standings
          </button>
        </div>
      </div>

      {/* Friend Activity (if any friends picking on live games) */}
      {friendActivity.length > 0 && activeTab === "live" && (
        <div className="px-4 mb-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
            <Eye className="h-4 w-4 text-white/30 shrink-0" />
            {friendActivity.map(friend => (
              <div 
                key={friend.userId}
                className={cn(
                  "shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full",
                  friend.isWinning ? "bg-emerald-500/20" : "bg-white/5"
                )}
              >
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                  {friend.name.charAt(0)}
                </div>
                <span className="text-xs">{friend.name.split(' ')[0]}</span>
                <span className={cn(
                  "text-xs font-medium",
                  friend.isWinning ? "text-emerald-400" : "text-white/50"
                )}>
                  {friend.pickTeam.slice(0, 3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="px-4">
        {/* Live Tab */}
        {activeTab === "live" && (
          <div className="space-y-3">
            {/* What Just Changed - Threshold Engine */}
            {hasLiveGames && (
              <ThresholdWhatJustChanged 
                scope="DEMO"
                leagueId={Number(id)}
                maxItems={3}
                defaultExpanded={true}
                variant="compact"
                refreshInterval={15000}
                className="mb-4"
              />
            )}
            
            {groupedEvents.live.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Radio className="h-10 w-10 text-white/20" />
                </div>
                <p className="text-white/50 mb-2">No games live right now</p>
                <p className="text-sm text-white/30">
                  {groupedEvents.upcoming.length > 0 
                    ? `Next game starts ${new Date(groupedEvents.upcoming[0].start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                    : "Check back on game day"}
                </p>
              </div>
            ) : (
              groupedEvents.live.map(game => (
                <LiveGameCard 
                  key={game.id}
                  game={game}
                  pick={getPickForEvent(game.id)}
                  isExpanded={selectedGame === game.id}
                  onToggle={() => setSelectedGame(selectedGame === game.id ? null : game.id)}
                />
              ))
            )}
            
            {/* Next Up */}
            {groupedEvents.upcoming.length > 0 && groupedEvents.live.length > 0 && (
              <div className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-white/30" />
                  <span className="text-xs font-medium text-white/30 uppercase tracking-wider">Coming Up</span>
                </div>
                {groupedEvents.upcoming.slice(0, 2).map(game => (
                  <CompactGameCard key={game.id} game={game} pick={getPickForEvent(game.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Games Tab */}
        {activeTab === "all" && (
          <div className="space-y-4">
            {/* Final Games */}
            {groupedEvents.final.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-white/30" />
                  <span className="text-xs font-medium text-white/30 uppercase tracking-wider">Final</span>
                </div>
                {groupedEvents.final.map(game => (
                  <GameResultCard key={game.id} game={game} pick={getPickForEvent(game.id)} />
                ))}
              </div>
            )}

            {/* Live Games */}
            {groupedEvents.live.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-red-500 animate-pulse" />
                  <span className="text-xs font-medium text-red-500 uppercase tracking-wider">Live Now</span>
                </div>
                {groupedEvents.live.map(game => (
                  <LiveGameCard 
                    key={game.id}
                    game={game}
                    pick={getPickForEvent(game.id)}
                    isExpanded={selectedGame === game.id}
                    onToggle={() => setSelectedGame(selectedGame === game.id ? null : game.id)}
                  />
                ))}
              </div>
            )}

            {/* Upcoming Games */}
            {groupedEvents.upcoming.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-white/30" />
                  <span className="text-xs font-medium text-white/30 uppercase tracking-wider">Upcoming</span>
                </div>
                {groupedEvents.upcoming.map(game => (
                  <CompactGameCard key={game.id} game={game} pick={getPickForEvent(game.id)} />
                ))}
              </div>
            )}

            {events.length === 0 && (
              <div className="text-center py-16">
                <Target className="h-12 w-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/50">No games this period</p>
              </div>
            )}
          </div>
        )}

        {/* Standings Tab */}
        {activeTab === "standings" && (
          <div className="space-y-2">
            {standings.length === 0 ? (
              <div className="text-center py-16">
                <Trophy className="h-12 w-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/50">No standings yet</p>
              </div>
            ) : (
              <>
                {standings.map((standing, idx) => (
                  <div 
                    key={standing.user_id}
                    className={cn(
                      "p-3 rounded-xl border flex items-center gap-3 transition-all",
                      standing.is_current_user 
                        ? "bg-primary/10 border-primary/30" 
                        : "bg-white/5 border-white/10"
                    )}
                  >
                    {/* Rank */}
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
                      idx === 0 && "bg-yellow-500 text-yellow-950",
                      idx === 1 && "bg-gray-300 text-gray-700",
                      idx === 2 && "bg-amber-600 text-white",
                      idx > 2 && "bg-white/10 text-white/70"
                    )}>
                      {standing.rank}
                    </div>
                    
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium truncate",
                        standing.is_current_user && "text-primary"
                      )}>
                        {standing.display_name}
                        {standing.is_current_user && " (You)"}
                      </p>
                      {standing.current_streak > 1 && (
                        <div className="flex items-center gap-1 text-xs mt-0.5">
                          <Flame className={cn(
                            "h-3 w-3",
                            standing.streak_type === "win" ? "text-emerald-400" : "text-red-400"
                          )} />
                          <span className={cn(
                            standing.streak_type === "win" ? "text-emerald-400" : "text-red-400"
                          )}>
                            {standing.current_streak}{standing.streak_type === "win" ? "W" : "L"}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Points */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-xl">{standing.total_points}</p>
                      <p className="text-[10px] text-white/40">pts</p>
                    </div>
                  </div>
                ))}
                
                <Link 
                  to={`/leagues/${id}/standings`}
                  className="flex items-center justify-center gap-2 p-4 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  View Full Standings
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-black/95 backdrop-blur-xl border-t border-white/10 z-50">
        <div className="safe-area-pb">
          <div className="flex justify-around py-2">
            <Link 
              to="/"
              className="flex flex-col items-center gap-0.5 p-2 text-white/40 active:scale-95 transition-transform"
            >
              <Users className="h-5 w-5" />
              <span className="text-[10px]">Leagues</span>
            </Link>
            <button 
              onClick={() => setActiveTab("live")}
              className={cn(
                "flex flex-col items-center gap-0.5 p-2 active:scale-95 transition-transform relative",
                activeTab === "live" ? "text-primary" : "text-white/40"
              )}
            >
              <Radio className="h-5 w-5" />
              <span className="text-[10px]">Live</span>
              {hasLiveGames && (
                <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
            <Link 
              to={`/leagues/${id}/picks`}
              className="flex flex-col items-center gap-0.5 p-2 text-white/40 active:scale-95 transition-transform"
            >
              <Target className="h-5 w-5" />
              <span className="text-[10px]">Picks</span>
            </Link>
            <Link
              to={`/leagues/${id}/chat`}
              className="flex flex-col items-center gap-0.5 p-2 text-white/40 active:scale-95 transition-transform"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-[10px]">Chat</span>
            </Link>
            <button 
              onClick={() => setActiveTab("standings")}
              className={cn(
                "flex flex-col items-center gap-0.5 p-2 active:scale-95 transition-transform",
                activeTab === "standings" ? "text-primary" : "text-white/40"
              )}
            >
              <Trophy className="h-5 w-5" />
              <span className="text-[10px]">Rank</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Last Updated */}
      <div className="fixed bottom-20 right-4 text-[9px] text-white/20 font-mono">
        {lastUpdated.toLocaleTimeString()}
      </div>
    </div>
  );
}

// Live Game Card Component
function LiveGameCard({ 
  game, 
  pick,
  isExpanded,
  onToggle
}: { 
  game: GameEvent & { quarter?: string; time_remaining?: string }; 
  pick?: Pick;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const homeWinning = (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWinning = (game.away_score ?? 0) > (game.home_score ?? 0);
  const pickedHome = pick?.pick_value === game.home_team;
  const pickedAway = pick?.pick_value === game.away_team;
  const myPickWinning = (pickedHome && homeWinning) || (pickedAway && awayWinning);
  const myPickLosing = pick && !myPickWinning && (homeWinning || awayWinning);

  return (
    <div 
      className={cn(
        "rounded-2xl border transition-all overflow-hidden",
        myPickWinning && "bg-emerald-500/10 border-emerald-500/30",
        myPickLosing && "bg-red-500/10 border-red-500/30",
        !myPickWinning && !myPickLosing && "bg-white/5 border-white/10"
      )}
    >
      <button 
        onClick={onToggle}
        className="w-full p-4 text-left"
      >
        {/* Live indicator + time */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/40">
              <Radio className="h-3 w-3 text-red-500 animate-pulse" />
              <span className="text-[10px] font-bold text-red-500">{game.quarter}</span>
            </div>
            <span className="text-xs text-white/50">{game.time_remaining}</span>
          </div>
          {pick && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium",
              myPickWinning && "bg-emerald-500/20 text-emerald-400",
              myPickLosing && "bg-red-500/20 text-red-400",
              !myPickWinning && !myPickLosing && "bg-white/10 text-white/50"
            )}>
              {myPickWinning ? (
                <>
                  <TrendingUp className="h-3 w-3" />
                  Winning
                </>
              ) : myPickLosing ? (
                <>
                  <TrendingDown className="h-3 w-3" />
                  Trailing
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" />
                  Tied
                </>
              )}
            </div>
          )}
        </div>

        {/* Matchup */}
        <div className="space-y-3">
          {/* Away Team */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-xl transition-all",
            pickedAway && "ring-2 ring-inset",
            pickedAway && awayWinning && "ring-emerald-500/50 bg-emerald-500/10",
            pickedAway && !awayWinning && homeWinning && "ring-red-500/50 bg-red-500/10",
            pickedAway && !awayWinning && !homeWinning && "ring-primary/50 bg-primary/10",
            !pickedAway && awayWinning && "bg-white/5"
          )}>
            <div className="flex items-center gap-3">
              {pickedAway && (
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center",
                  awayWinning ? "bg-emerald-500" : homeWinning ? "bg-red-500" : "bg-primary"
                )}>
                  <Target className="h-3 w-3 text-white" />
                </div>
              )}
              <span className={cn(
                "font-semibold",
                awayWinning && "text-emerald-400"
              )}>
                {game.away_team}
              </span>
              {pick?.confidence_rank && pickedAway && (
                <span className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-bold">
                  {pick.confidence_rank} pts
                </span>
              )}
            </div>
            <span className={cn(
              "text-3xl font-bold tabular-nums",
              awayWinning && "text-emerald-400"
            )}>
              {game.away_score ?? 0}
            </span>
          </div>

          {/* Home Team */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-xl transition-all",
            pickedHome && "ring-2 ring-inset",
            pickedHome && homeWinning && "ring-emerald-500/50 bg-emerald-500/10",
            pickedHome && !homeWinning && awayWinning && "ring-red-500/50 bg-red-500/10",
            pickedHome && !homeWinning && !awayWinning && "ring-primary/50 bg-primary/10",
            !pickedHome && homeWinning && "bg-white/5"
          )}>
            <div className="flex items-center gap-3">
              {pickedHome && (
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center",
                  homeWinning ? "bg-emerald-500" : awayWinning ? "bg-red-500" : "bg-primary"
                )}>
                  <Target className="h-3 w-3 text-white" />
                </div>
              )}
              <span className={cn(
                "font-semibold",
                homeWinning && "text-emerald-400"
              )}>
                {game.home_team}
              </span>
              <span className="text-[10px] text-white/30">HOME</span>
              {pick?.confidence_rank && pickedHome && (
                <span className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-bold">
                  {pick.confidence_rank} pts
                </span>
              )}
            </div>
            <span className={cn(
              "text-3xl font-bold tabular-nums",
              homeWinning && "text-emerald-400"
            )}>
              {game.home_score ?? 0}
            </span>
          </div>
        </div>
        
        {/* Expand indicator */}
        <div className="flex justify-center mt-2">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-white/30" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-white/30" />
          )}
        </div>
      </button>
      
      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-white/10 mt-0">
          <div className="grid grid-cols-3 gap-4 py-3 text-center text-xs">
            <div>
              <div className="text-white/40 mb-1">Spread</div>
              <div className="font-medium">-3.5</div>
            </div>
            <div>
              <div className="text-white/40 mb-1">Total</div>
              <div className="font-medium">O/U 47.5</div>
            </div>
            <div>
              <div className="text-white/40 mb-1">ML</div>
              <div className="font-medium">-160 / +140</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact Game Card for upcoming games
function CompactGameCard({ game, pick }: { game: GameEvent; pick?: Pick }) {
  const startTime = new Date(game.start_at);
  
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 mb-2">
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn(pick?.pick_value === game.away_team && "font-bold text-primary")}>
            {game.away_team}
          </span>
          <span className="text-white/30">@</span>
          <span className={cn(pick?.pick_value === game.home_team && "font-bold text-primary")}>
            {game.home_team}
          </span>
        </div>
      </div>
      <div className="text-right text-xs text-white/50">
        {startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </div>
    </div>
  );
}

// Game Result Card for final games
function GameResultCard({ game, pick }: { game: GameEvent; pick?: Pick }) {
  const pickedHome = pick?.pick_value === game.home_team;
  const pickedAway = pick?.pick_value === game.away_team;
  const isHomeWinner = game.winner === game.home_team;
  const isAwayWinner = game.winner === game.away_team;
  const pickedCorrect = (pickedHome && isHomeWinner) || (pickedAway && isAwayWinner);
  const pickedWrong = pick && !pickedCorrect;
  
  return (
    <div className={cn(
      "p-3 rounded-xl border mb-2",
      pickedCorrect && "bg-emerald-500/10 border-emerald-500/30",
      pickedWrong && "bg-red-500/10 border-red-500/30",
      !pick && "bg-white/5 border-white/10"
    )}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          {pick && (
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center",
              pickedCorrect && "bg-emerald-500",
              pickedWrong && "bg-red-500"
            )}>
              {pickedCorrect ? <Check className="h-3 w-3 text-white" /> : <X className="h-3 w-3 text-white" />}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className={cn(isAwayWinner && "font-bold")}>
                {game.away_team}
              </span>
              <span className="font-mono">{game.away_score}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(isHomeWinner && "font-bold")}>
                {game.home_team}
              </span>
              <span className="font-mono">{game.home_score}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-white/40">FINAL{game.status === "final_ot" && " OT"}</span>
          {pickedCorrect && pick?.confidence_rank && (
            <div className="flex items-center gap-1 text-emerald-400 text-xs mt-1">
              <Flame className="h-3 w-3" />
              +{pick.confidence_rank}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameDay;
