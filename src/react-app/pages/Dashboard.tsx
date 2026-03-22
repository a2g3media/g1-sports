import { useState, useEffect, useCallback, memo, useRef, useMemo } from "react";
import { useDocumentTitle } from "@/react-app/hooks/useDocumentTitle";
import { Link, useNavigate } from "react-router-dom";
import { ROUTES } from "@/react-app/config/routes";
import { Trophy, ChevronRight, Users, Flame, ChevronUp, ChevronDown, TrendingUp, TrendingDown, Star, Sparkles } from "lucide-react";
import { getSport } from "@/react-app/data/sports";
import { ErrorState } from "@/react-app/components/ui/states";
import { cn } from "@/react-app/lib/utils";
import { type LiveGame, getSportPriority } from "@/react-app/hooks/useLiveGames";
import { DataHubProvider, useDataHub } from "@/react-app/hooks/useDataHub";
import { ApprovedScoreCard, transformLiveGameToCard } from "@/react-app/components/ApprovedScoreCard";
import { WatchboardPreviewHub } from "@/react-app/components/WatchboardPreview";
import { SportQuickAccess } from "@/react-app/components/SportQuickAccess";
import { CoachGCommandCenter } from "@/react-app/components/CoachGCommandCenter";
import { AIIntelligenceFeed } from "@/react-app/components/AIIntelligenceFeed";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import { PlayerPhoto } from "@/react-app/components/PlayerPhoto";
import { useFavorites } from "@/react-app/hooks/useFavorites";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Component, type ReactNode, type ErrorInfo } from "react";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { useFeatureFlags } from "@/react-app/hooks/useFeatureFlags";

// Error boundary wrapper for isolating component crashes
class ComponentErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; name: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode; name: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[${this.props.name}] Error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {this.props.name} failed to load: {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

// Safe wrapper for watchboard component
function SafeWatchboardPreview() {
  return (
    <ComponentErrorBoundary name="WatchboardPreview">
      <WatchboardPreviewHub />
    </ComponentErrorBoundary>
  );
}

function FavoritesRail() {
  const { fetchDashboard } = useFavorites();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Array<Record<string, unknown>>>([]);
  const [players, setPlayers] = useState<Array<Record<string, unknown>>>([]);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchDashboard();
        if (!mounted || !data) return;
        const nextTeams = Array.isArray(data.teams) ? (data.teams as Array<Record<string, unknown>>) : [];
        const nextPlayers = Array.isArray(data.players) ? (data.players as Array<Record<string, unknown>>) : [];
        const nextLive = Array.isArray(data.live_priority) ? data.live_priority.length : 0;
        setTeams(nextTeams.slice(0, 4));
        setPlayers(nextPlayers.slice(0, 4));
        setLiveCount(nextLive);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchDashboard]);

  const hasAny = teams.length > 0 || players.length > 0;
  if (!loading && !hasAny) return null;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Star className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold">My Favorites</h3>
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
              <Sparkles className="h-3 w-3" /> LIVE {liveCount}
            </span>
          )}
        </div>
        <Link to="/favorites" className="text-[11px] text-white/60 hover:text-white inline-flex items-center gap-1">
          Open <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="text-xs text-white/45">Loading favorites...</div>
      ) : (
        <div className="space-y-2">
          {teams.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {teams.map((team) => {
                const code = String(team.team_code || "").toUpperCase();
                const name = String(team.team_name || team.entity_id || "Team");
                const sport = String(team.sport || "nba");
                return (
                  <Link
                    key={`team-${String(team.id || team.entity_id)}`}
                    to="/favorites"
                    className="min-w-[150px] rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <TeamLogo teamCode={code} sport={sport} size={20} className="rounded-full" />
                      <span className="text-xs font-semibold text-white truncate">{name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {players.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {players.map((player) => {
                const name = String(player.player_name || player.entity_id || "Player");
                const sport = String(player.sport || "nba");
                return (
                  <Link
                    key={`player-${String(player.id || player.entity_id)}`}
                    to="/favorites"
                    className="min-w-[170px] rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <PlayerPhoto playerName={name} sport={sport} size={20} className="border border-white/10" />
                      <span className="text-xs font-semibold text-white truncate">{name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  member_count: number;
  state?: string;
}

// ============================================
// GLOBAL STYLES
// ============================================
const globalStyles = `
  @keyframes livePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
  }
  
  @keyframes liveBadgeGlow {
    0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.25), 0 0 8px rgba(239, 68, 68, 0.12); }
    50% { box-shadow: 0 0 6px rgba(239, 68, 68, 0.35), 0 0 12px rgba(239, 68, 68, 0.2); }
  }
  
  @keyframes scorePop {
    0% { transform: scale(1); }
    50% { transform: scale(1.08); text-shadow: 0 0 20px currentColor; }
    100% { transform: scale(1); }
  }
  
  @keyframes scoreFlicker {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; text-shadow: 0 0 10px currentColor; }
  }
  
  @keyframes scoreShimmer {
    0% { background-position: -100% 0; }
    100% { background-position: 200% 0; }
  }
  
  @keyframes barFill {
    0% { transform: scaleX(0); transform-origin: left; }
    100% { transform: scaleX(1); transform-origin: left; }
  }
  
  .animate-score-shimmer {
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
    background-size: 200% 100%;
    animation: scoreShimmer 2s ease-in-out infinite;
  }
  
  .animate-bar-fill {
    animation: barFill 0.35s ease-out forwards;
  }
  
  @keyframes rankGlowSweep {
    0% { transform: translateX(-100%); opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 1; }
    100% { transform: translateX(100%); opacity: 0; }
  }
  
  @keyframes scoutShimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  
  @keyframes electricPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.3), inset 0 0 20px rgba(59, 130, 246, 0.05); }
    50% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.5), inset 0 0 30px rgba(59, 130, 246, 0.1); }
  }
  
  @keyframes progressGlow {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  
  @keyframes momentumPulse {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  
  @keyframes projectionGlow {
    0%, 100% { text-shadow: 0 0 8px rgba(52, 211, 153, 0.3); }
    50% { text-shadow: 0 0 16px rgba(52, 211, 153, 0.6); }
  }
  
  @keyframes countPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  
  @keyframes sportWordFade {
    0% { opacity: 0.3; transform: translateY(2px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes carouselFadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  
  @keyframes carouselFadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
  
  .animate-live-pulse {
    animation: livePulse 1.2s ease-in-out infinite;
  }
  
  .animate-live-badge-glow {
    animation: liveBadgeGlow 1.5s ease-in-out infinite;
  }
  
  .animate-score-pop {
    animation: scorePop 0.4s ease-out;
  }
  
  .animate-score-flicker {
    animation: scoreFlicker 0.3s ease-in-out;
  }
  
  .animate-rank-glow-sweep {
    animation: rankGlowSweep 1.5s ease-in-out forwards;
  }
  
  .animate-scout-shimmer {
    animation: scoutShimmer 3s ease-in-out infinite;
  }
  
  .animate-electric-pulse {
    animation: electricPulse 2s ease-in-out infinite;
  }
  
  .animate-progress-glow {
    animation: progressGlow 2s ease-in-out infinite;
  }
  
  .animate-momentum-pulse {
    animation: momentumPulse 1s ease-in-out infinite;
  }
  
  .animate-projection-glow {
    animation: projectionGlow 2s ease-in-out infinite;
  }
  
  .animate-count-pulse {
    animation: countPulse 2s ease-in-out infinite;
  }
  
  .animate-sport-word-fade {
    animation: sportWordFade 280ms ease-out;
  }
  
  .animate-carousel-fade-in {
    animation: carouselFadeIn 320ms ease-out forwards;
  }
  
  .animate-carousel-fade-out {
    animation: carouselFadeOut 320ms ease-out forwards;
  }
  
  @keyframes rivalPulse {
    0%, 100% { box-shadow: 0 0 30px rgba(245,158,11,0.15), 0 8px 24px rgba(0,0,0,0.3); }
    50% { box-shadow: 0 0 40px rgba(245,158,11,0.25), 0 8px 28px rgba(0,0,0,0.35); }
  }
  
  @keyframes rivalGlow {
    0% { transform: translateX(-100%); opacity: 0; }
    50% { opacity: 0.5; }
    100% { transform: translateX(100%); opacity: 0; }
  }
  
  .animate-rival-pulse {
    animation: rivalPulse 2.5s ease-in-out infinite;
  }
  
  .animate-rival-glow {
    animation: rivalGlow 3s ease-in-out infinite;
  }
  
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;

// ============================================
// CINEMATIC BACKGROUND (premium trading terminal feel on desktop)
// ============================================
function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <style>{globalStyles}</style>
      {/* Darker gradient on desktop for premium terminal feel */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 lg:from-[hsl(220,20%,4%)] lg:via-[hsl(220,18%,6%)] lg:to-[hsl(220,20%,3%)] xl:from-[hsl(220,22%,3%)] xl:via-[hsl(220,20%,5%)] xl:to-[hsl(220,22%,2%)]" />
      {/* Enhanced vignette for cinematic depth - stronger on desktop */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)] lg:bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.75)_100%)] xl:bg-[radial-gradient(ellipse_at_center,transparent_15%,rgba(0,0,0,0.8)_100%)]" />
      {/* Noise texture - subtle grain on desktop at 5% opacity */}
      <div 
        className="absolute inset-0 opacity-[0.02] lg:opacity-[0.008] xl:opacity-[0.05]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Ambient glow orbs - reduced 40% on desktop */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/[0.02] lg:bg-primary/[0.01] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/[0.015] lg:bg-emerald-500/[0.006] rounded-full blur-[100px]" />
    </div>
  );
}

// ============================================
// FEATURED GAME CARD - Using ApprovedScoreCard
// ============================================
const FeaturedGameCard = memo(function FeaturedGameCard({ 
  game,
  onClick 
}: { 
  game: LiveGame;
  onClick: (game: LiveGame) => void;
}) {
  // Transform LiveGame to ApprovedScoreCard format
  const cardGame = transformLiveGameToCard(game);
  
  return (
    <div 
      className="flex-shrink-0 w-[272px] sm:w-[286px] md:w-full cursor-pointer"
      onClick={() => onClick(game)}
    >
      <ApprovedScoreCard 
        game={cardGame}
        onClick={() => onClick(game)}
      />
    </div>
  );
});



// ============================================
// FEATURED GAMES CAROUSEL
// ============================================
function FeaturedGamesCarousel({ 
  games, 
  onGameClick,
  onActiveSportChange,
  title = "Live Now",
}: { 
  games: LiveGame[]; 
  onGameClick: (game: LiveGame) => void;
  onActiveSportChange?: (sportKey: string | null) => void;
  title?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSportIndex, setActiveSportIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [outgoingGames, setOutgoingGames] = useState<LiveGame[] | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const transitionTimeoutRef = useRef<number | null>(null);
  // Lock homepage rotation order to a predictable sequence.
  const rotationSportOrder = useMemo(
    () => ['NBA', 'MLB', 'NHL', 'NCAAB', 'SOCCER'],
    []
  );
  const normalizeSportKey = useCallback((sport: string, league?: string | null): string => {
    const upper = String(sport || "UNKNOWN").toUpperCase();
    const leagueUpper = String(league || "").toUpperCase();
    if (upper === "CBB" || upper === "NCAAM" || upper === "NCAA_MEN_BASKETBALL") return "NCAAB";
    if (upper === "CFB" || upper === "NCAAFB" || upper === "NCAA_FOOTBALL") return "NCAAF";
    if (upper === "ICEHOCKEY" || upper === "HOCKEY") return "NHL";
    if (upper === "BASEBALL") return "MLB";
    if (upper === "BASKETBALL") {
      if (leagueUpper.includes("NCAA") || leagueUpper.includes("NCAAB") || leagueUpper.includes("CBB")) return "NCAAB";
      return "NBA";
    }
    return upper;
  }, []);
  const getQuickAccessOrder = useCallback(
    (sport: string): number => {
      const idx = rotationSportOrder.indexOf(normalizeSportKey(sport));
      return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
    },
    [normalizeSportKey, rotationSportOrder]
  );
  
  const sportGroups = useMemo(() => {
    const grouped = new Map<string, LiveGame[]>();
    for (const game of games) {
      const key = normalizeSportKey(game.sport, game.league);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(game);
    }

    const groups = Array.from(grouped.entries()).map(([sport, sportGames]) => {
      const sortedGames = [...sportGames].sort((a, b) => {
        const rank = (status: LiveGame["status"]) =>
          status === "IN_PROGRESS" ? 0 : status === "FINAL" ? 1 : 2;
        const rankDiff = rank(a.status) - rank(b.status);
        if (rankDiff !== 0) return rankDiff;
        if (a.status === "FINAL" && b.status === "FINAL") {
          const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
          const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
          return bTime - aTime;
        }
        const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });

      const liveCount = sortedGames.filter((g) => g.status === "IN_PROGRESS").length;
      const earliestStart = sortedGames.reduce((earliest, game) => {
        const next = game.startTime ? new Date(game.startTime).getTime() : Number.POSITIVE_INFINITY;
        return Math.min(earliest, next);
      }, Number.POSITIVE_INFINITY);

      return {
        sport,
        games: sortedGames,
        hasLive: liveCount > 0,
        liveCount,
        earliestStart,
      };
    });

    groups.sort((a, b) => {
      const orderDiff = getQuickAccessOrder(a.sport) - getQuickAccessOrder(b.sport);
      if (orderDiff !== 0) return orderDiff;
      // For sports outside the fixed sequence, keep deterministic fallback ordering.
      const priorityDiff = getSportPriority(a.sport) - getSportPriority(b.sport);
      if (priorityDiff !== 0) return priorityDiff;
      if (a.earliestStart !== b.earliestStart) return a.earliestStart - b.earliestStart;
      return a.sport.localeCompare(b.sport);
    });

    return groups;
  }, [games, getQuickAccessOrder, normalizeSportKey]);

  const activeGroup = sportGroups[activeSportIndex] || null;
  const visibleGames = (activeGroup?.games || games).slice(0, 3);
  const isLive = activeGroup ? activeGroup.hasLive : games.some(g => g.status === 'IN_PROGRESS');

  const rotateToSportIndex = useCallback((nextIndex: number) => {
    if (nextIndex === activeSportIndex) return;

    if (prefersReducedMotion) {
      setActiveSportIndex(nextIndex);
      setOutgoingGames(null);
      setIsTransitioning(false);
      return;
    }

    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    setOutgoingGames(visibleGames);
    setActiveSportIndex(nextIndex);
    setIsTransitioning(true);

    transitionTimeoutRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
      setOutgoingGames(null);
      transitionTimeoutRef.current = null;
    }, 340);
  }, [activeSportIndex, prefersReducedMotion, visibleGames]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReducedMotion(media.matches);
    onChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (activeSportIndex < sportGroups.length) return;
    setActiveSportIndex(0);
  }, [activeSportIndex, sportGroups.length]);

  useEffect(() => {
    if (!onActiveSportChange) return;
    if (isTransitioning) return;
    if (!activeGroup?.sport) {
      onActiveSportChange(null);
      return;
    }
    onActiveSportChange(normalizeSportKey(activeGroup.sport).toLowerCase());
  }, [activeGroup?.sport, isTransitioning, normalizeSportKey, onActiveSportChange]);

  useEffect(() => {
    if (sportGroups.length <= 1) return;

    const interval = window.setInterval(() => {
      const nextIndex = (activeSportIndex + 1) % sportGroups.length;
      rotateToSportIndex(nextIndex);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeSportIndex, rotateToSportIndex, sportGroups.length]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);
  
  return (
    <section className="mb-4 lg:mb-6">
      {/* Tighter vertical spacing - header to cards */}
      <div className="flex items-center justify-between mb-2 lg:mb-2.5 px-1">
        <div className="flex items-center gap-2 lg:gap-3 xl:gap-3.5">
          {isLive ? (
            <span className="relative flex h-2.5 w-2.5 lg:h-3 lg:w-3 xl:h-3.5 xl:w-3.5">
              <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-red-500" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 lg:h-3 lg:w-3 xl:h-3.5 xl:w-3.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
            </span>
          ) : (
            <span className="relative flex h-2.5 w-2.5 lg:h-3 lg:w-3 xl:h-3.5 xl:w-3.5">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 lg:h-3 lg:w-3 xl:h-3.5 xl:w-3.5 bg-primary shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
            </span>
          )}
          {/* Dynamic header - LIVE NOW or UPCOMING GAMES */}
          <h2 className="text-sm lg:text-base xl:text-lg font-black text-white/80 lg:text-white/90 uppercase tracking-wider lg:tracking-[0.15em] xl:tracking-[0.18em]">
            {title}
          </h2>
          {activeGroup && (
            <span className={cn(
              "text-[11px] lg:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border",
              activeGroup.hasLive
                ? "text-red-300 border-red-500/30 bg-red-500/10"
                : "text-slate-300 border-slate-600/40 bg-slate-700/30"
            )}>
              <span
                key={`${activeGroup.sport}-${activeSportIndex}`}
                className={cn(!prefersReducedMotion && "animate-sport-word-fade")}
              >
                {activeGroup.sport}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center">
          <Link 
            to={ROUTES.SCORES_LIVE} 
            className="text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
          >
            All Live
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
      
      {/* Mobile: horizontal scroll / Tablet+Desktop: 3-column grid with breathing room */}
      {/* Subtle radial glow behind card row on desktop */}
      <div
        className="relative overflow-visible"
      >
        <div className="hidden xl:block absolute inset-x-0 -top-8 bottom-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_60%,rgba(59,130,246,0.04),transparent_70%)] pointer-events-none" />
        <div className="relative">
          {outgoingGames && isTransitioning && !prefersReducedMotion && (
            <div
              className={cn(
                "absolute inset-0 z-20 pointer-events-none animate-carousel-fade-out",
                "flex gap-2.5 sm:gap-3 overflow-x-hidden pb-2",
                "md:grid md:grid-cols-2 md:overflow-visible md:gap-3.5",
                "lg:grid-cols-3 lg:gap-4 xl:gap-4.5"
              )}
              aria-hidden="true"
            >
              <div className="flex-shrink-0 w-0 md:hidden" />
              {outgoingGames.map((game, idx) => (
                <FeaturedGameCard
                  key={`outgoing-${game.id}-${idx}`}
                  game={game}
                  onClick={onGameClick}
                />
              ))}
              <div className="flex-shrink-0 w-0 md:hidden" />
            </div>
          )}

          <div 
            ref={scrollRef}
            aria-live="polite"
            aria-label={activeGroup ? `Games Today ${activeGroup.sport} ${activeGroup.hasLive ? "live" : "scheduled"}` : "Games Today"}
            className={cn(
              "relative z-10",
              isTransitioning && !prefersReducedMotion && "animate-carousel-fade-in",
              // Mobile: horizontal scroll with proper edge-to-edge handling
              "flex gap-2.5 sm:gap-3 overflow-x-auto scrollbar-hide pb-2",
              // Tablet (768px+): 2-col grid
              "md:grid md:grid-cols-2 md:overflow-visible md:gap-3.5",
              // Desktop (1024px+): 3-col grid
              "lg:grid-cols-3 lg:gap-4 xl:gap-4.5"
            )}
            style={{ 
              // Use scroll-padding to ensure cards don't clip at edges on mobile
              scrollPaddingLeft: '0px',
              scrollPaddingRight: '0px',
            }}
          >
            {/* Add left spacer for mobile scroll */}
            <div className="flex-shrink-0 w-0 md:hidden" aria-hidden="true" />
            {visibleGames.map((game) => (
              <FeaturedGameCard
                key={game.id}
                game={game}
                onClick={onGameClick}
              />
            ))}
            {/* Add right spacer for mobile scroll */}
            <div className="flex-shrink-0 w-0 md:hidden" aria-hidden="true" />
          </div>
        </div>
      </div>
      {sportGroups.length > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1.5">
          {sportGroups.map((group, idx) => (
            <button
              key={group.sport}
              type="button"
              aria-label={`Show ${group.sport} games`}
              onClick={() => rotateToSportIndex(idx)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === activeSportIndex ? "w-6 bg-primary" : "w-2 bg-white/30 hover:bg-white/50"
              )}
            />
          ))}
        </div>
      )}
      

    </section>
  );
}

// ============================================
// SECTION HEADER
// ============================================
function SectionHeader({ 
  title, 
  linkTo, 
  linkText = "See all",
  count,
  variant = "default"
}: { 
  title: string; 
  linkTo?: string;
  linkText?: string;
  count?: number;
  variant?: "default" | "secondary";
}) {
  const isSecondary = variant === "secondary";
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <div className="flex items-center gap-2">
        <h2 className={cn(
          "text-[10px] font-bold uppercase tracking-wider",
          isSecondary ? "text-white/25" : "text-white/40"
        )}>{title}</h2>
        {count !== undefined && (
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded",
            isSecondary ? "text-white/15 bg-white/[0.02]" : "text-white/20 bg-white/[0.04]"
          )}>{count}</span>
        )}
      </div>
      {linkTo && (
        <Link 
          to={linkTo} 
          className={cn(
            "text-[10px] font-semibold transition-colors flex items-center gap-0.5",
            isSecondary ? "text-primary/35 hover:text-primary/50" : "text-primary/50 hover:text-primary/70"
          )}
        >
          {linkText}
          <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ============================================
// MOCK POOL STATS (for demo)
// ============================================
const MOCK_POOL_STATS = {
  rank: 3,
  totalPlayers: 12,
  movement: 2,
  streak: 4,
  pointsToNext: 8,
  leadOverNext: 12,
  projectedFinish: 2,
  progressToNext: 65,
};

// ============================================
// RANK HERO - Enhanced with Progress & Projections
// ============================================
function RankHeroSection({ 
  rank, 
  totalPlayers, 
  movement, 
  streak,
  pointsToNext,
  leadOverNext,
  projectedFinish,
  progressToNext,
  onClick
}: { 
  rank: number; 
  totalPlayers: number; 
  movement: number;
  streak: number;
  pointsToNext: number;
  leadOverNext: number;
  projectedFinish: number;
  progressToNext: number;
  onClick: () => void;
}) {
  const isUp = movement > 0;
  const isDown = movement < 0;
  const isImproving = isUp;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full lg:max-w-[900px] xl:max-w-[960px] lg:mx-auto relative overflow-hidden rounded-3xl",
        "py-8 px-6",
        "bg-gradient-to-b from-white/[0.10] via-white/[0.05] to-white/[0.02]",
        "border border-white/[0.10]",
        "backdrop-blur-2xl",
        "shadow-[0_20px_60px_rgba(0,0,0,0.5)]",
        "hover:shadow-[0_28px_80px_rgba(0,0,0,0.6)]",
        "hover:border-white/15",
        "hover:-translate-y-0.5",
        "transition-all duration-300 ease-out",
        "group"
      )}
    >
      {isImproving && (
        <>
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 bg-gradient-to-b from-emerald-500/20 via-emerald-500/10 to-transparent rounded-full blur-[60px] opacity-60" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent animate-rank-glow-sweep" />
          </div>
        </>
      )}
      
      {!isImproving && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 bg-gradient-to-b from-primary/20 via-primary/10 to-transparent rounded-full blur-[60px] opacity-50" />
      )}
      
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 text-center mb-2">
          Your Rank
        </p>
        
        <div className="relative flex justify-center mb-4">
          <span className={cn(
            "text-8xl font-black tracking-tighter",
            "bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent",
            "drop-shadow-[0_4px_20px_rgba(255,255,255,0.2)]"
          )}>
            #{rank}
          </span>
          
          {movement !== 0 && (
            <div className={cn(
              "absolute -top-1 -right-4 flex items-center gap-1 px-2 py-1 rounded-lg",
              "text-sm font-black backdrop-blur-sm",
              isUp && "bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 shadow-[0_0_15px_rgba(52,211,153,0.25)]",
              isDown && "bg-red-500/25 text-red-300 border border-red-400/30 shadow-[0_0_15px_rgba(248,113,113,0.25)]"
            )}>
              {isUp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isUp ? `+${movement}` : movement}</span>
            </div>
          )}
        </div>
        
        <p className="text-sm text-white/30 text-center mb-4">of {totalPlayers} players</p>
        
        <div className="mb-5 px-4 relative">
          <div className="flex justify-between text-[10px] text-white/30 mb-1.5">
            <span>Progress to #{rank - 1}</span>
            <span className="font-bold text-primary/70">{progressToNext}%</span>
          </div>
          <div className="relative">
            <div 
              className="absolute -bottom-3 left-0 h-4 rounded-full blur-md opacity-40 bg-gradient-to-r from-primary/60 to-primary transition-all duration-500"
              style={{ width: `${progressToNext}%` }}
            />
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative z-10">
              <div 
                className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full animate-progress-glow transition-all duration-500"
                style={{ width: `${progressToNext}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* Stats row - horizontal scroll on mobile to prevent cramping */}
        <div className="flex items-center justify-start sm:justify-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide -mx-2 px-2 pb-1">
          <div className="flex-shrink-0 min-w-[72px] px-2.5 sm:px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
            <p className="text-lg sm:text-xl font-black text-cyan-400">{pointsToNext}</p>
            <p className="text-[8px] sm:text-[9px] text-white/30 uppercase tracking-wider whitespace-nowrap">pts to next</p>
          </div>
          
          <div className="flex-shrink-0 min-w-[72px] px-2.5 sm:px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
            <p className="text-lg sm:text-xl font-black text-emerald-400">{leadOverNext}</p>
            <p className="text-[8px] sm:text-[9px] text-white/30 uppercase tracking-wider">lead</p>
          </div>
          
          <div className="flex-shrink-0 min-w-[72px] px-2.5 sm:px-3 py-2.5 rounded-xl bg-primary/[0.08] border border-primary/15 text-center">
            <p className="text-lg sm:text-xl font-black text-primary">#{projectedFinish}</p>
            <p className="text-[8px] sm:text-[9px] text-primary/50 uppercase tracking-wider">projected</p>
          </div>
          
          {streak > 0 && (
            <div className="flex-shrink-0 min-w-[64px] px-2.5 sm:px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <div className="flex items-center gap-1 justify-center">
                <Flame className="w-4 h-4 text-amber-400" />
                <p className="text-lg sm:text-xl font-black text-amber-400">{streak}</p>
              </div>
              <p className="text-[8px] sm:text-[9px] text-amber-400/50 uppercase tracking-wider">streak</p>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================
// POOL CARD - Enhanced with Live Indicators
// ============================================
const PoolCard = memo(function PoolCard({ 
  league, 
  stats,
  onClick,
  index
}: { 
  league: League; 
  stats: { rank: number; lastWeekRank: number; gapToNext: number; liveGames: number; movement: number; progress: number; totalPlayers: number; projectedMovement: string };
  onClick: () => void;
  index: number;
}) {
  const sport = getSport(league.sport_key);
  const hasLiveGames = stats.liveGames > 0;
  const isUp = stats.movement > 0;
  const isDown = stats.movement < 0;
  
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn(
        "w-full relative overflow-hidden rounded-xl p-4 sm:p-3.5 min-h-[72px]",
        "animate-in fade-in slide-in-from-left-2 duration-300",
        "bg-gradient-to-br from-white/[0.05] to-white/[0.02]",
        "border border-white/[0.06]",
        "backdrop-blur-lg",
        "shadow-[0_6px_20px_rgba(0,0,0,0.3)]",
        "hover:bg-gradient-to-br hover:from-white/[0.08] hover:to-white/[0.03]",
        "hover:border-white/10",
        "hover:shadow-[0_10px_28px_rgba(0,0,0,0.4)]",
        "active:scale-[0.98]",
        "transition-all duration-200 ease-out",
        "group text-left"
      )}
    >
      {hasLiveGames && (
        <div className="absolute top-0 left-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl" />
      )}
      
      <div className="relative flex items-center gap-3">
        <div className="relative w-11 h-11 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.05]">
          {sport ? (
            <sport.icon className={cn("w-5 h-5 sm:w-4.5 sm:h-4.5", hasLiveGames ? "text-red-400/80" : "text-white/40")} />
          ) : (
            <Trophy className={cn("w-4.5 h-4.5", hasLiveGames ? "text-red-400/80" : "text-white/40")} />
          )}
          {hasLiveGames && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-red-500" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white/85 truncate">{league.name}</h3>
            {hasLiveGames && (
              <span className="text-[9px] font-bold text-red-400 px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/20 whitespace-nowrap">
                {stats.liveGames} live
              </span>
            )}
          </div>
          
          {stats.projectedMovement && (
            <p className="text-[11px] text-emerald-400/70 font-medium mt-0.5 truncate">
              {stats.projectedMovement}
            </p>
          )}
          
          <div className="flex items-center gap-2 mt-1 text-[10px] text-white/30">
            <span className="flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" />
              {league.member_count}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-lg font-bold text-white/85">#{stats.rank}</p>
            <div className={cn(
              "text-[10px] font-semibold flex items-center justify-end gap-0.5",
              isUp && "text-emerald-400",
              isDown && "text-red-400",
              !isUp && !isDown && "text-white/20"
            )}>
              {isUp && <TrendingUp className="w-2.5 h-2.5" />}
              {isDown && <TrendingDown className="w-2.5 h-2.5" />}
              <span>{isUp ? `+${stats.movement}` : isDown ? stats.movement : "—"}</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition-colors" />
        </div>
      </div>
    </button>
  );
});

// ============================================
// RIVAL ALERT - Competition Updates
// ============================================
const RivalAlert = memo(function RivalAlert({
  rivalName,
  action,
  poolName,
  timeAgo,
  onClick
}: {
  rivalName: string;
  action: string;
  poolName: string;
  timeAgo: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full relative overflow-hidden rounded-xl p-4 sm:p-3 min-h-[64px]",
        "bg-gradient-to-r from-amber-500/[0.08] to-amber-500/[0.02]",
        "border border-amber-500/15",
        "hover:border-amber-500/25",
        "active:scale-[0.98]",
        "transition-all duration-200",
        "group text-left"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 sm:w-4 sm:h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-xs text-white/70">
            <span className="font-semibold text-amber-400">{rivalName}</span>{" "}
            {action} in <span className="font-medium text-white/80">{poolName}</span>
          </p>
          <p className="text-[11px] sm:text-[10px] text-white/30 mt-0.5">{timeAgo}</p>
        </div>
        <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 text-amber-400/40 group-hover:text-amber-400/70 transition-colors shrink-0" />
      </div>
    </button>
  );
});

// ============================================
// LOADING SKELETON
// ============================================
function HomeSkeleton() {
  return (
    <div className="relative min-h-screen -mx-4 -mt-2 px-4 pt-2 pb-8 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 lg:pt-2 lg:pb-10">
      <CinematicBackground />
      <div className="relative z-10 max-w-[1180px] mx-auto space-y-6">
        {/* Header with loading indicator */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
            </div>
            <span className="text-sm font-semibold text-white/60 uppercase tracking-wider">Loading Games...</span>
          </div>
        </div>
        
        {/* Carousel skeleton - more visible */}
        <div className="flex gap-3 overflow-hidden animate-pulse">
          <div className="h-44 w-[300px] flex-shrink-0 rounded-2xl bg-white/[0.06] border border-white/[0.08]" />
          <div className="h-44 w-[300px] flex-shrink-0 rounded-2xl bg-white/[0.05] border border-white/[0.06]" />
          <div className="h-44 w-[300px] flex-shrink-0 rounded-2xl bg-white/[0.04] border border-white/[0.05]" />
        </div>
        
        {/* Coach G skeleton */}
        <div className="h-56 w-full rounded-3xl bg-white/[0.05] border border-white/[0.06] animate-pulse" />
        
        {/* Rank section skeleton */}
        <div className="h-32 w-full rounded-2xl bg-white/[0.04] border border-white/[0.05] animate-pulse" />
        
        {/* Additional sections */}
        <div className="space-y-3 animate-pulse">
          <div className="h-20 w-full rounded-xl bg-white/[0.04] border border-white/[0.05]" />
          <div className="h-20 w-full rounded-xl bg-white/[0.03] border border-white/[0.04]" />
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN DASHBOARD (Inner component that uses DataHub)
// ============================================
function DashboardInner() {
  try {
    useDocumentTitle('GZ Sports');
  } catch (e) {
    console.error('[Dashboard] useDocumentTitle error:', e);
  }
  
  const navigate = useNavigate();
  const { flags } = useFeatureFlags();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeCarouselSport, setActiveCarouselSport] = useState<string | null>(null);
  const [skeletonExpired, setSkeletonExpired] = useState(false);
  
  // Get games from consolidated DataHub
  const { games: liveGames, gamesLoading, gamesError: error } = useDataHub();
  const displayGames: LiveGame[] = liveGames || [];
  
  // Smart title based on game status
  const carouselTitle = "Games Today";

  // Fetch leagues in background
  useEffect(() => {
    fetch("/api/leagues")
      .then(res => res.ok ? res.json() : [])
      .then(data => setLeagues(data))
      .catch(() => setLeagues([]));
  }, []);

  // Prevent indefinite skeleton lock if upstream feeds are slow.
  useEffect(() => {
    const timer = window.setTimeout(() => setSkeletonExpired(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  
  const handleNavigateToGame = useCallback((game: LiveGame) => {
    const sport = String(game.sport || "").toLowerCase();
    const candidates = [
      (game as any).game_id,
      game.id,
      (game as any).provider_game_id,
      (game as any).event_id,
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);

    const gameId = candidates.find((id) => !id.startsWith("gen_") && !id.startsWith("demo_")) || "";
    if (!gameId) {
      navigate(sport ? `/games?sport=${sport.toUpperCase()}` : "/games");
      return;
    }

    navigate(toGameDetailPath(sport, gameId));
  }, [navigate]);

  if (gamesLoading && !skeletonExpired && displayGames.length === 0) {
    return <HomeSkeleton />;
  }

  if (error && displayGames.length === 0 && leagues.length === 0) {
    return (
      <ErrorState
        title="Couldn't load home"
        message={error}
        onRetry={() => window.location.reload()}
        size="lg"
      />
    );
  }

  const hasLeagues = leagues.length > 0;

  return (
    <div className="relative min-h-screen -mx-4 -mt-2 px-4 pt-2 pb-8 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 lg:pt-2 lg:pb-10">
      <CinematicBackground />
      
      <div className="relative z-10 max-w-[1180px] mx-auto space-y-6 lg:space-y-8">
        {/* 1. COACH G COMMAND CENTER - AI Navigator Hero */}
        <CoachGCommandCenter />
        
        {/* 2. SPORTS NAVIGATION */}
        <SportQuickAccess activeSportKey={activeCarouselSport} />
        
        {/* 2.5 FAVORITES RAIL */}
        {flags.HOME_FAVORITES_RAIL_ENABLED && <FavoritesRail />}
        
        {/* 3. COACH G INTELLIGENCE + GAMES TODAY */}
        <section className="space-y-3">
          {displayGames.length > 0 ? (
            <>
              <FeaturedGamesCarousel
                games={displayGames}
                onGameClick={handleNavigateToGame}
                onActiveSportChange={setActiveCarouselSport}
                title={carouselTitle}
              />
              <AIIntelligenceFeed games={displayGames} />
            </>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-sm font-black text-white/60 uppercase tracking-wider">
                  Games Today
                </h2>
                <Link 
                  to={ROUTES.SCORES} 
                  className="text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
                >
                  View Schedule
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-8 text-center">
                <p className="text-white/40 text-sm">No games scheduled right now. Check back later.</p>
              </div>
            </section>
          )}
        </section>
        
        {/* 5. YOUR WATCHBOARDS */}
        <SafeWatchboardPreview />
        
        {/* 6. POOL COMMAND CENTER - Always visible with demo data */}
        <>
          {/* Rank Hero */}
          <section>
            <SectionHeader title="Pool Command Center" linkTo="/pools" linkText="View All" />
            <RankHeroSection 
              {...MOCK_POOL_STATS}
              onClick={() => navigate('/pools')}
            />
          </section>
          
          {/* Your Pools */}
          <section>
            <SectionHeader title="Your Pools" linkTo="/pools" count={hasLeagues ? leagues.length : 2} />
            <div className="space-y-2">
              {hasLeagues ? (
                leagues.slice(0, 3).map((league, index) => (
                  <PoolCard
                    key={league.id}
                    league={league}
                    stats={{
                      rank: Math.floor(Math.random() * 5) + 1,
                      lastWeekRank: Math.floor(Math.random() * 8) + 1,
                      gapToNext: Math.floor(Math.random() * 15) + 3,
                      liveGames: Math.random() > 0.5 ? Math.floor(Math.random() * 3) + 1 : 0,
                      movement: Math.floor(Math.random() * 5) - 2,
                      progress: Math.floor(Math.random() * 80) + 20,
                      totalPlayers: league.member_count || 12,
                      projectedMovement: Math.random() > 0.5 ? "+2 projected by end of week" : "",
                    }}
                    onClick={() => navigate(`/pools/${league.id}`)}
                    index={index}
                  />
                ))
              ) : (
                <>
                  <PoolCard
                    league={{ id: 1, name: "Office NFL Pool", sport: "nfl", member_count: 12, code: "DEMO1" } as any}
                    stats={{
                      rank: 3,
                      lastWeekRank: 5,
                      gapToNext: 8,
                      liveGames: 2,
                      movement: 2,
                      progress: 65,
                      totalPlayers: 12,
                      projectedMovement: "+2 projected by end of week",
                    }}
                    onClick={() => navigate('/pools')}
                    index={0}
                  />
                  <PoolCard
                    league={{ id: 2, name: "Fantasy Basketball", sport: "nba", member_count: 8, code: "DEMO2" } as any}
                    stats={{
                      rank: 1,
                      lastWeekRank: 2,
                      gapToNext: 0,
                      liveGames: 1,
                      movement: 1,
                      progress: 88,
                      totalPlayers: 8,
                      projectedMovement: "",
                    }}
                    onClick={() => navigate('/pools')}
                    index={1}
                  />
                </>
              )}
            </div>
          </section>
          
          {/* Rival Alerts */}
          <section>
            <SectionHeader title="Rival Activity" />
            <div className="space-y-2">
              <RivalAlert
                rivalName="Mike S."
                action="moved up 2 spots"
                poolName="Office NFL Pool"
                timeAgo="2 hours ago"
                onClick={() => navigate('/pools')}
              />
              <RivalAlert
                rivalName="Sarah K."
                action="is now 3 pts ahead"
                poolName="Fantasy Football"
                timeAgo="5 hours ago"
                onClick={() => navigate('/pools')}
              />
            </div>
          </section>
          
          {/* Join/Create CTA */}
          {!hasLeagues && (
            <section>
              {/* CTA buttons - 44px+ touch targets */}
              <div className="flex gap-2 sm:gap-3">
                <Link to={ROUTES.JOIN_LEAGUE} className="flex-1">
                  <button className="w-full text-sm sm:text-xs px-4 py-3.5 sm:py-3 min-h-[44px] rounded-xl font-semibold bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white/80 border border-white/[0.08] transition-all active:scale-[0.98]">
                    Join a Pool
                  </button>
                </Link>
                <Link to={ROUTES.CREATE_LEAGUE} className="flex-1">
                  <button className="w-full text-sm sm:text-xs px-4 py-3.5 sm:py-3 min-h-[44px] rounded-xl font-semibold bg-primary hover:bg-primary/90 text-white transition-all active:scale-[0.98]">
                    Create Pool
                  </button>
                </Link>
              </div>
            </section>
          )}
        </>
      </div>
    </div>
  );
}

// ============================================
// MAIN DASHBOARD (Wrapper with DataHubProvider)
// ============================================
export function Dashboard() {
  const { user, isDemoMode } = useDemoAuth();
  
  return (
    <DataHubProvider
      userId={user?.id?.toString() || null}
      isDemoMode={isDemoMode}
      pollInterval={30000}
    >
      <DashboardInner />
    </DataHubProvider>
  );
}
