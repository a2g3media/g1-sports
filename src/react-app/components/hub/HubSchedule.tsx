import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronRight,
  ChevronLeft,
  Clock, 
  Radio, 
  Trophy,
  CalendarDays,
  Loader2,
  EyeOff,
  Check
} from "lucide-react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { rankGamesForHub } from "@/react-app/lib/rankGamesForHub";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";
import { ApprovedScoreCard, ApprovedScoreCardGame } from "@/react-app/components/ApprovedScoreCard";
import { useGlobalAI } from "@/react-app/components/GlobalAIProvider";

// Date helper functions
function formatDateForDisplay(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.round((compareDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateParam(param: string | null): Date {
  if (!param) return new Date();
  const match = String(param).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day, 12, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isSameDay(date1: Date, date2: Date): boolean {
  // Compare using local date strings to handle timezone properly
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.toLocaleDateString() === d2.toLocaleDateString();
}

function getDateRange(): { min: Date; max: Date } {
  const today = new Date();
  const min = new Date(today);
  min.setDate(min.getDate() - 7);
  const max = new Date(today);
  max.setDate(max.getDate() + 7);
  return { min, max };
}

function extractTeamName(fullName: string | null): string {
  if (!fullName) return 'TBD';
  const parts = fullName.split(' ');
  return parts[parts.length - 1];
}

interface ScheduleGame {
  id: string;
  homeTeam: {
    code: string;
    name: string;
    score: number;
    record?: string;
  };
  awayTeam: {
    code: string;
    name: string;
    score: number;
    record?: string;
  };
  status: "LIVE" | "SCHEDULED" | "FINAL";
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string;
  spread?: number;
}

interface HubScheduleProps {
  sportKey: string;
  games?: any[]; // Optional - if provided, skip fetching
  loading?: boolean;
}

// Date Navigator Component
interface DateNavigatorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

function DateNavigator({ selectedDate, onDateChange }: DateNavigatorProps) {
  const { min, max } = getDateRange();
  const today = new Date();
  
  const canGoPrev = selectedDate > min;
  const canGoNext = selectedDate < max;
  const isToday = isSameDay(selectedDate, today);
  
  const handlePrev = () => {
    if (!canGoPrev) return;
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange(newDate);
  };
  
  const handleNext = () => {
    if (!canGoNext) return;
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange(newDate);
  };
  
  const handleToday = () => {
    onDateChange(new Date());
  };
  
  return (
    <div className="flex items-center justify-between gap-2 mb-4 px-1">
      <button
        onClick={handlePrev}
        disabled={!canGoPrev}
        className={`p-3 sm:p-2 rounded-xl border transition-all min-w-[44px] min-h-[44px] flex items-center justify-center ${
          canGoPrev 
            ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70 hover:text-white active:scale-95' 
            : 'bg-white/[0.02] border-white/5 text-white/20 cursor-not-allowed'
        }`}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      
      <div className="flex items-center gap-3">
        <button
          onClick={handleToday}
          className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
            isToday
              ? 'bg-[var(--sport-accent)]/20 text-[var(--sport-accent)] border border-[var(--sport-accent)]/30'
              : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
          }`}
        >
          {formatDateForDisplay(selectedDate)}
        </button>
        
        {!isToday && (
          <button
            onClick={handleToday}
            className="text-xs text-[var(--sport-accent)] hover:text-white transition-colors font-medium"
          >
            Jump to Today
          </button>
        )}
      </div>
      
      <button
        onClick={handleNext}
        disabled={!canGoNext}
        className={`p-3 sm:p-2 rounded-xl border transition-all min-w-[44px] min-h-[44px] flex items-center justify-center ${
          canGoNext 
            ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70 hover:text-white active:scale-95' 
            : 'bg-white/[0.02] border-white/5 text-white/20 cursor-not-allowed'
        }`}
        aria-label="Next day"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

// Transform ScheduleGame to ApprovedScoreCardGame for the premium card component
function transformToApprovedCard(game: ScheduleGame, sportKey: string): ApprovedScoreCardGame {
  // Generate consistent public betting percentages based on game id
  const gameIdHash = (game.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const homePercent = 45 + (gameIdHash % 20); // 45-64%
  const awayPercent = 100 - homePercent;
  
  return {
    id: game.id,
    gameId: game.id,
    sport: sportKey.toUpperCase(),
    homeTeam: {
      abbr: game.homeTeam.code,
      name: game.homeTeam.name,
    },
    awayTeam: {
      abbr: game.awayTeam.code,
      name: game.awayTeam.name,
    },
    homeScore: game.status === 'SCHEDULED' ? null : game.homeTeam.score,
    awayScore: game.status === 'SCHEDULED' ? null : game.awayTeam.score,
    status: game.status.toLowerCase() as 'live' | 'scheduled' | 'final',
    period: game.period,
    clock: game.clock,
    startTime: game.startTime,
    channel: game.channel,
    spread: game.spread,
    publicBetHome: homePercent,
    publicBetAway: awayPercent,
  };
}

export function HubSchedule({ sportKey, games: propGames, loading: propLoading }: HubScheduleProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { openChat } = useGlobalAI();
  const [fetchedGames, setFetchedGames] = useState<ScheduleGame[]>([]);
  const [dateSpecificGames, setDateSpecificGames] = useState<ScheduleGame[]>([]);
  const [fetchLoading, setFetchLoading] = useState(!propGames);
  const [dateLoading, setDateLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "live" | "upcoming" | "final">("all");
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  
  // Date state from URL param
  const selectedDate = useMemo(() => {
    return parseDateParam(searchParams.get('date'));
  }, [searchParams]);
  
  const isToday = useMemo(() => {
    const today = new Date();
    return isSameDay(selectedDate, today);
  }, [selectedDate]);
  
  const handleDateChange = (date: Date) => {
    const today = new Date();
    if (isSameDay(date, today)) {
      // Remove date param if selecting today
      searchParams.delete('date');
    } else {
      searchParams.set('date', formatDateParam(date));
    }
    setSearchParams(searchParams, { replace: true });
  };
  
  const { addGame, removeGame, isGameInWatchboard } = useWatchboards();

  // Fetch games for non-today dates
  useEffect(() => {
    if (isToday) {
      setDateSpecificGames([]); // Clear date-specific games when viewing today
      return;
    }

    let mounted = true;
    setDateLoading(true);

    async function fetchDateGames() {
      try {
        const dateParam = formatDateParam(selectedDate);
        const res = await fetch(`/api/games?sport=${sportKey.toUpperCase()}&date=${dateParam}`);
        if (res.ok && mounted) {
          const data = await res.json();
          const transformed = (data.games || []).map(transformGameData);
          setDateSpecificGames(transformed);
        }
      } catch (err) {
        console.error('[HubSchedule] Failed to fetch date games:', err);
      } finally {
        if (mounted) setDateLoading(false);
      }
    }

    fetchDateGames();
    
    return () => {
      mounted = false;
    };
  }, [sportKey, selectedDate, isToday]);

  // Only fetch if games not provided as prop (for today's games)
  useEffect(() => {
    if (propGames) return; // Skip fetch when games passed from parent

    async function fetchGames() {
      try {
        const res = await fetch(`/api/games?sport=${sportKey.toUpperCase()}`);
        if (res.ok) {
          const data = await res.json();
          const transformed = (data.games || []).map(transformGameData);
          setFetchedGames(transformed);
        }
      } catch (err) {
        console.error('[HubSchedule] Failed to fetch games:', err);
      } finally {
        setFetchLoading(false);
      }
    }

    fetchGames();
    
    // Polling with exponential backoff
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    let errorCount = 0;
    const BASE_INTERVAL = 30000;
    const MAX_BACKOFF = 240000;
    
    const pollWithBackoff = async () => {
      if (!mounted) return;
      
      try {
        const res = await fetch(`/api/games?sport=${sportKey.toUpperCase()}`);
        if (res.ok) {
          const data = await res.json();
          const transformed = (data.games || []).map(transformGameData);
          setFetchedGames(transformed);
          errorCount = 0;
        } else {
          errorCount = Math.min(errorCount + 1, 4);
        }
      } catch {
        errorCount = Math.min(errorCount + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, errorCount);
        const nextInterval = Math.min(BASE_INTERVAL * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    timeoutId = setTimeout(pollWithBackoff, BASE_INTERVAL);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [sportKey, propGames]);

  function transformGameData(g: any): ScheduleGame {
    return {
      id: g.game_id,
      homeTeam: {
        code: g.home_team_code || 'TBD',
        name: extractTeamName(g.home_team_name),
        score: g.home_score ?? 0,
        record: g.home_record,
      },
      awayTeam: {
        code: g.away_team_code || 'TBD',
        name: extractTeamName(g.away_team_name),
        score: g.away_score ?? 0,
        record: g.away_record,
      },
      status: g.status === 'LIVE' || g.status === 'IN_PROGRESS' ? 'LIVE' 
            : g.status === 'FINAL' || g.status === 'COMPLETED' ? 'FINAL' 
            : 'SCHEDULED',
      period: g.period_label,
      clock: g.clock,
      startTime: g.start_time,
      channel: g.broadcast,
      spread: g.spread,
    };
  }

  // Use prop games if provided, otherwise use fetched games
  // For non-today dates, use date-specific fetched games
  const games = useMemo(() => {
    // If viewing a different date, use the date-specific games
    if (!isToday && dateSpecificGames.length > 0) {
      return dateSpecificGames;
    }
    
    // For today, use prop games or fetched games
    if (propGames) {
      return propGames.map(transformGameData);
    }
    return fetchedGames;
  }, [propGames, fetchedGames, dateSpecificGames, isToday]);

  const loading = dateLoading || (propLoading ?? fetchLoading);

  // Filter games by selected date first
  // For non-today dates, games are already date-specific from the API
  // For today, filter the general games list
  const gamesForDate = useMemo(() => {
    // If we fetched date-specific games for a non-today date, use them directly
    if (!isToday && dateSpecificGames.length > 0) {
      return dateSpecificGames;
    }

    // For "Today", trust the provider payload directly.
    // The API already returns the current slate and can cross UTC boundaries.
    if (isToday) {
      return games;
    }
    
    // For today or when using prop/fetched games, filter by date
    const selectedDateStr = selectedDate.toLocaleDateString();
    
    return games.filter(g => {
      if (!g.startTime) return false;
      try {
        const gameDate = new Date(g.startTime);
        const gameDateStr = gameDate.toLocaleDateString();
        return gameDateStr === selectedDateStr;
      } catch {
        return false;
      }
    });
  }, [games, selectedDate, dateSpecificGames, isToday]);

  const filteredGames = useMemo(() => {
    const filtered = gamesForDate.filter(g => {
      if (filter === "all") return true;
      if (filter === "live") return g.status === "LIVE";
      if (filter === "upcoming") return g.status === "SCHEDULED";
      if (filter === "final") return g.status === "FINAL";
      return true;
    });
    // Apply smart ranking
    return rankGamesForHub(filtered, sportKey);
  }, [gamesForDate, filter, sportKey]);

  const liveCount = gamesForDate.filter(g => g.status === "LIVE").length;
  const upcomingCount = gamesForDate.filter(g => g.status === "SCHEDULED").length;
  const finalCount = gamesForDate.filter(g => g.status === "FINAL").length;

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--sport-accent)]" />
      </div>
    );
  }

  // Quick jump helpers
  const jumpToYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    handleDateChange(d);
  };
  const jumpToTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    handleDateChange(d);
  };

  if (gamesForDate.length === 0) {
    return (
      <div className="space-y-4">
        {/* Date Navigator */}
        <DateNavigator selectedDate={selectedDate} onDateChange={handleDateChange} />
        
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--sport-accent)]/5 via-transparent to-transparent p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-4 left-8 w-2 h-2 rounded-full bg-[var(--sport-accent)]/30" />
            <div className="absolute bottom-6 right-12 w-3 h-3 rounded-full bg-[var(--sport-accent)]/20" />
            <div className="absolute top-1/2 right-6 w-1.5 h-1.5 rounded-full bg-white/20" />
          </div>
          
          <div className="relative z-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-4">
              <CalendarDays className="h-8 w-8 text-[var(--sport-accent)]/50" />
            </div>
            
            <h3 className="text-lg font-semibold text-white/80 mb-2">
              No Games on {formatDateForDisplay(selectedDate)}
            </h3>
            <p className="text-white/40 text-sm max-w-xs mx-auto mb-5">
              {sportKey.toUpperCase() === 'NFL' || sportKey.toUpperCase() === 'NCAAF'
                ? "Offseason board is active. Use date controls for recent results and check back on game day for live action."
                : "No games scheduled for this date. Try another day."
              }
            </p>
            
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={jumpToYesterday}
                className="inline-flex items-center gap-1.5 px-4 py-3 sm:py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm font-medium hover:bg-white/10 hover:text-white/80 transition-colors min-h-[44px] active:scale-95"
              >
                Yesterday
              </button>
              <button
                onClick={() => handleDateChange(new Date())}
                className="inline-flex items-center gap-1.5 px-4 py-3 sm:py-2 rounded-lg bg-[var(--sport-accent)]/10 border border-[var(--sport-accent)]/30 text-[var(--sport-accent)] text-sm font-medium hover:bg-[var(--sport-accent)]/20 transition-colors min-h-[44px] active:scale-95"
              >
                Today
              </button>
              <button
                onClick={jumpToTomorrow}
                className="inline-flex items-center gap-1.5 px-4 py-3 sm:py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm font-medium hover:bg-white/10 hover:text-white/80 transition-colors min-h-[44px] active:scale-95"
              >
                Tomorrow
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date Navigator */}
      <DateNavigator selectedDate={selectedDate} onDateChange={handleDateChange} />
      
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <FilterTab 
          label="All" 
          count={gamesForDate.length} 
          active={filter === "all"} 
          onClick={() => setFilter("all")} 
        />
        {liveCount > 0 && (
          <FilterTab 
            label="Live" 
            count={liveCount} 
            active={filter === "live"} 
            onClick={() => setFilter("live")}
            isLive 
          />
        )}
        <FilterTab 
          label="Upcoming" 
          count={upcomingCount} 
          active={filter === "upcoming"} 
          onClick={() => setFilter("upcoming")} 
        />
        <FilterTab 
          label="Final" 
          count={finalCount} 
          active={filter === "final"} 
          onClick={() => setFilter("final")} 
        />
      </div>

      {/* Games List - Using Premium ApprovedScoreCard */}
      <div className="space-y-4">
        {filteredGames.map((game) => {
          const cardGame = transformToApprovedCard(game, sportKey);
          return (
            <ApprovedScoreCard
              key={game.id}
              game={cardGame}
              onClick={() => navigate(toGameDetailPath(sportKey, game.id))}
              onCoachClick={() => {
                const homeTeam = game.homeTeam.name;
                const awayTeam = game.awayTeam.name;
                openChat(`Tell me about the ${awayTeam} vs ${homeTeam} game`);
              }}
              onWatchClick={() => {
                if (isGameInWatchboard(game.id)) {
                  removeGame(game.id);
                  setToast({ message: "Removed from Watchboard", type: "info" });
                } else {
                  addGame(game.id, "hub_schedule");
                  setToast({ message: "Added to Watchboard", type: "success" });
                }
                setTimeout(() => setToast(null), 2000);
              }}
              isInWatchboard={isGameInWatchboard(game.id)}
            />
          );
        })}
      </div>

      {filteredGames.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-3">
            {filter === 'live' ? (
              <Radio className="h-5 w-5 text-white/30" />
            ) : filter === 'upcoming' ? (
              <Clock className="h-5 w-5 text-white/30" />
            ) : filter === 'final' ? (
              <Trophy className="h-5 w-5 text-white/30" />
            ) : (
              <CalendarDays className="h-5 w-5 text-white/30" />
            )}
          </div>
          <p className="text-white/60 text-sm font-medium mb-1">
            {filter === 'live' ? 'No Live Games Right Now' 
              : filter === 'upcoming' ? 'No Upcoming Games' 
              : filter === 'final' ? 'No Final Scores Yet'
              : 'No Games Found'}
          </p>
          <p className="text-white/30 text-xs">
            {filter === 'live' ? 'Live games will appear here when they tip off.' 
              : filter === 'upcoming' ? "Today's schedule is clear."
              : filter === 'final' ? "Completed games will appear here."
              : 'Try a different filter.'}
          </p>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="mt-4 text-xs text-[var(--sport-accent)] hover:text-white transition-colors"
            >
              View all games →
            </button>
          )}
        </div>
      )}

      {/* Footer link */}
      <div className="text-center pt-2">
        <Link 
          to={`/games?sport=${sportKey.toUpperCase()}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--sport-accent)] hover:text-white font-medium transition-colors"
        >
          View Full Schedule & Scores
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl backdrop-blur-md ${
              toast.type === 'success' 
                ? 'bg-emerald-500/90 text-white' 
                : 'bg-white/10 text-white/90 border border-white/20'
            }`}
          >
            {toast.type === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FilterTabProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  isLive?: boolean;
}

function FilterTab({ label, count, active, onClick, isLive }: FilterTabProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 sm:py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap min-h-[44px] active:scale-95 ${
        active 
          ? 'bg-[var(--sport-accent)]/20 text-[var(--sport-accent)] border border-[var(--sport-accent)]/30' 
          : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
      }`}
    >
      {isLive && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      )}
      {label}
      <span className={`text-xs font-semibold min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full ${
        active 
          ? 'bg-[var(--sport-accent)]/30 text-[var(--sport-accent)]' 
          : isLive 
            ? 'bg-red-500/20 text-red-400'
            : 'bg-white/10 text-white/70'
      }`}>
        {count}
      </span>
    </button>
  );
}

export default HubSchedule;
