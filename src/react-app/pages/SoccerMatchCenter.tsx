/**
 * Soccer Match Center - Premium War Room
 * 
 * A broadcast-style match detail page that feels like a live control center.
 * All betting/odds are confined to the "Matchups" tab - the rest is sports-first.
 * 
 * Tabs:
 * 1. Overview - Broadcast desk style with momentum, key stats, Coach G Brief
 * 2. Timeline - Grouped by half, jump to latest, live updates
 * 3. Lineups - Formation view with 11 on pitch
 * 4. Stats - Team comparison with expandable advanced section
 * 5. H2H - Last 5 meetings with trend tags
 * 6. Matchups - Market signals, lines, props, probabilities (betting lives here)
 * 7. Pools - Pool picks module for users in pools
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import SoccerPageHeader, { buildMatchBreadcrumbs } from "@/react-app/components/soccer/SoccerPageHeader";
import { useSoccerBackNavigation, buildSoccerTeamUrl, buildSoccerPlayerUrl } from "@/react-app/hooks/useSoccerBackNavigation";
import { fetchPlayerPhotos } from "@/react-app/lib/espnSoccer";
import TeamCrest from "@/react-app/components/soccer/TeamCrest";
import {
  Clock,
  MapPin,
  Users,
  Activity,
  Target,
  Zap,
  Shield,

  AlertCircle,
  ArrowRightLeft,
  Circle,
  User,
  RefreshCw,
  History,
  Trophy,
  Calendar,
  TrendingUp,
  TrendingDown,

  Lock,
  Heart,
  Eye,
  Share2,
  Ticket,
  ChevronRight,
  Play,
  Radio,
  BarChart3,
  Swords,
  Layers,
} from "lucide-react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import AddToWatchboardModal from "@/react-app/components/AddToWatchboardModal";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { cn } from "@/react-app/lib/utils";
import {
  deriveUnifiedFinalOutcomes,
  deriveUnifiedViewMode,
  UnifiedCoachGLivePanel,
  UnifiedFinalHeroPanel,
  UnifiedLiveSignalStrip,
  UnifiedVideoPanel,
} from "@/react-app/components/game-state/StateModePanels";

// ============================================================================
// TYPES
// ============================================================================

interface Team {
  id: string;
  name: string;
  abbreviation?: string;
  country?: string;
}

interface Match {
  eventId: string;
  startTime: string | null;
  status: string;
  venue?: string;
  attendance?: number;
  referee?: string;
  competition?: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  halfTimeScore?: string | null;
  clock?: string | null;
  period?: string | null;
}

interface Player {
  playerId: string;
  name: string;
  jerseyNumber?: number;
  position?: string;
  starter: boolean;
  captain: boolean;
  substituted: boolean;
  substitutedIn?: number | null;
  substitutedOut?: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed?: number | null;
}

interface TimelineEvent {
  id: string;
  type: string;
  time: number;
  period?: string;
  team?: string;
  teamQualifier?: string;
  player?: string;
  playerId?: string;
  assistPlayer?: string;
  assistPlayerId?: string;
  goalType?: string;
  homeScore?: number;
  awayScore?: number;
  cardType?: string;
  playerIn?: string;
  playerOut?: string;
}

interface MatchData {
  match: Match | null;
  lineups: { home: Player[]; away: Player[] };
  statistics: { home: Record<string, any>; away: Record<string, any> } | null;
  timeline: TimelineEvent[];
  errors: string[];
}

type TabKey = "overview" | "timeline" | "lineups" | "stats" | "h2h" | "matchups" | "pools";

interface H2HMeeting {
  eventId: string;
  date: string;
  competition: string;
  venue?: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeScore: number | null;
  awayScore: number | null;
  winner: 'home' | 'away' | 'draw' | null;
}

interface H2HData {
  team1: { id: string; name: string } | null;
  team2: { id: string; name: string } | null;
  totals: {
    team1Wins: number;
    team2Wins: number;
    draws: number;
    team1Goals: number;
    team2Goals: number;
  };
  meetings: H2HMeeting[];
}

// ============================================================================
// HELPERS
// ============================================================================

// Team crest now uses TeamCrest component directly

// ============================================================================
// PREMIUM GATE COMPONENT
// ============================================================================

interface PremiumGateProps {
  feature: string;
  currentTier: string;
}

function PremiumGate({ feature, currentTier }: PremiumGateProps) {
  const tierLabels: Record<string, string> = {
    anonymous: 'Guest',
    free: 'Free',
    pool_access: 'Pool Access',
    scout_pro: 'Scout Pro',
    scout_elite: 'Scout Elite',
  };
  
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-8 sm:p-12">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-emerald-500/10 to-transparent rounded-full blur-3xl" />
      </div>
      
      <div className="relative text-center max-w-md mx-auto">
        {/* Lock Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-6">
          <Lock className="h-8 w-8 text-amber-400" />
        </div>
        
        {/* Title */}
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
          Unlock {feature}
        </h3>
        
        {/* Description */}
        <p className="text-white/60 mb-6 text-sm sm:text-base">
          Get access to real-time odds, market signals, sharp money indicators, and expert betting intelligence with Scout Pro.
        </p>
        
        {/* Current tier indicator */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-white/50 mb-6">
          <span>Current plan:</span>
          <span className="font-medium text-white/70">{tierLabels[currentTier] || currentTier}</span>
        </div>
        
        {/* Feature list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left mb-8">
          {[
            "Live odds comparison",
            "Sharp money alerts",
            "Market signal detection",
            "Win probability models",
            "Player prop insights",
            "Line movement tracking"
          ].map((feat, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-white/60">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {feat}
            </div>
          ))}
        </div>
        
        {/* CTA Button */}
        <Link 
          to="/pricing"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold transition-all shadow-lg shadow-amber-500/25"
        >
          <Zap className="h-5 w-5" />
          Upgrade to Pro
        </Link>
        
        <p className="text-xs text-white/40 mt-4">
          Starting at $9.99/month • Cancel anytime
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SoccerMatchCenter() {
  const { matchId } = useParams<{ matchId: string }>();
  const [searchParams] = useSearchParams();
  const fromTeamId = searchParams.get("fromTeamId");
  const fromLeagueId = searchParams.get("fromLeagueId");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [data, setData] = useState<MatchData | null>(null);
  const [h2hData, setH2HData] = useState<H2HData | null>(null);
  const [h2hLoading, setH2HLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playerPhotos, setPlayerPhotos] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recommendedPollInterval, setRecommendedPollInterval] = useState(60000);
  const [newEventCount, setNewEventCount] = useState(0);
  const refreshCountRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const previousTimelineLength = useRef(0);
  
  // Toast state for user feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Watchboard modal state
  const [showWatchboardModal, setShowWatchboardModal] = useState(false);

  // Watchboard hooks
  const { isGameInWatchboard, removeGame, followPlayer, isPlayerFollowed, unfollowPlayerByName } = useWatchboards();
  const { subscription, isAtLeast, features } = useSubscription();
  
  // Check if user has premium access for Matchups tab
  const hasPremiumAccess = isAtLeast('scout_pro') || features?.hasAdvancedFilters;
  
  // Check if user is in a pool for this match (placeholder - would need real pool check)
  const isInPool = false; // TODO: wire to real pool system
  
  // Smart back navigation - uses fromTeamId/fromLeagueId from URL params
  const { goBack } = useSoccerBackNavigation({
    pageType: "match",
    teamId: fromTeamId || undefined,
    leagueId: fromLeagueId || undefined,
  });

  const fetchMatch = useCallback(async (isManual = false) => {
    if (!matchId) return;
    
    if (isManual) {
      setIsRefreshing(true);
    }
    
    try {
      const res = await fetch(`/api/soccer/match/${matchId}`);
      if (!res.ok) {
        throw new Error(`Failed to load match: ${res.status}`);
      }
      const json = await res.json();
      
      // Track new timeline events
      if (data?.timeline) {
        const newLength = json.timeline?.length || 0;
        const oldLength = previousTimelineLength.current;
        if (newLength > oldLength && refreshCountRef.current > 0) {
          setNewEventCount(newLength - oldLength);
          // Auto-scroll to latest if timeline tab is active
          if (activeTab === 'timeline' && timelineRef.current) {
            setTimeout(() => {
              timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
            }, 100);
          }
          // Clear the badge after 5 seconds
          setTimeout(() => setNewEventCount(0), 5000);
        }
        previousTimelineLength.current = newLength;
      }
      
      setData(json);
      setLastUpdated(new Date());
      setRecommendedPollInterval(json.recommendedPollInterval || 60000);
      refreshCountRef.current++;
    } catch (err) {
      if (refreshCountRef.current === 0) {
        // Only show error on initial load
        setError(err instanceof Error ? err.message : "Failed to load match");
      }
    } finally {
      setLoading(false);
      if (isManual) {
        setIsRefreshing(false);
      }
    }
  }, [matchId, data?.timeline, activeTab]);

  useEffect(() => {
    fetchMatch();
    
    // Use API's recommended poll interval (15s for live, 60s otherwise)
    const interval = setInterval(() => fetchMatch(), recommendedPollInterval);
    return () => clearInterval(interval);
  }, [fetchMatch, recommendedPollInterval]);

  const match = data?.match;
  const isLive = match?.status === "live" || match?.status === "inprogress";
  const isFinished = match?.status === "closed" || match?.status === "complete";
  const viewMode = deriveUnifiedViewMode(match?.status);
  const finalOutcomes = deriveUnifiedFinalOutcomes({
    homeTeam: match?.homeTeam.name || "HOME",
    awayTeam: match?.awayTeam.name || "AWAY",
    homeScore: match?.homeScore,
    awayScore: match?.awayScore,
  });
  const liveNotes = [
    {
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      note: data?.timeline?.[data.timeline.length - 1]?.player
        ? `${data.timeline[data.timeline.length - 1]?.player} involved in latest chance.`
        : "Monitoring attacking momentum and pace.",
    },
    {
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      note: "Watch transition speed and midfield control swings.",
    },
    {
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      note: "Live pressure profile is updating with each timeline event.",
    },
  ];

  // Fetch H2H data when tab is clicked
  useEffect(() => {
    if (activeTab !== "h2h" || !match) return;
    if (h2hData) return; // Already loaded

    const fetchH2H = async () => {
      setH2HLoading(true);
      try {
        const res = await fetch(`/api/soccer/h2h/${match.homeTeam.id}/${match.awayTeam.id}`);
        if (!res.ok) throw new Error('Failed to load H2H data');
        const json = await res.json();
        setH2HData(json);
      } catch (err) {
        console.error('H2H fetch error:', err);
      } finally {
        setH2HLoading(false);
      }
    };

    fetchH2H();
  }, [activeTab, match, h2hData]);

  // Fetch player photos for timeline events
  useEffect(() => {
    if (!data?.timeline || data.timeline.length === 0) return;
    
    // Extract unique player names from timeline events
    const playerNames = new Set<string>();
    for (const event of data.timeline) {
      if (event.player && event.player !== "Unknown Player" && event.player !== "Unknown") {
        playerNames.add(event.player);
      }
      if (event.assistPlayer) {
        playerNames.add(event.assistPlayer);
      }
    }
    
    if (playerNames.size === 0) return;
    
    // Fetch photos for new players not in cache
    const newNames = Array.from(playerNames).filter(name => !playerPhotos.has(name));
    if (newNames.length === 0) return;
    
    fetchPlayerPhotos(newNames).then(photos => {
      setPlayerPhotos(prev => {
        const updated = new Map(prev);
        for (const [name, url] of photos) {
          updated.set(name, url);
        }
        return updated;
      });
    }).catch(console.error);
  }, [data?.timeline]);

  // Watch toggle handler - opens modal for adding, direct removal
  const isWatching = match ? isGameInWatchboard(match.eventId) : false;
  const handleWatchToggle = async () => {
    if (!match) return;
    
    if (isWatching) {
      // Direct removal
      try {
        await removeGame(match.eventId);
        setToast({ message: 'Removed from Watchboard', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      } catch (err) {
        console.error('[Watch Toggle] Error:', err);
        setToast({ message: 'Failed to remove', type: 'error' });
        setTimeout(() => setToast(null), 3000);
      }
    } else {
      // Open modal for board selection
      setShowWatchboardModal(true);
    }
  };

  // Follow toggle handler (follows home team)
  const isFollowing = match ? isPlayerFollowed(match.homeTeam.name, 'soccer') : false;
  const handleFollowToggle = async () => {
    if (!match) return;
    if (isFollowing) {
      await unfollowPlayerByName(match.homeTeam.name, 'soccer');
    } else {
      await followPlayer({
        player_name: match.homeTeam.name,
        player_id: match.homeTeam.id,
        sport: 'soccer',
        team: match.homeTeam.name,
      });
    }
  };

  // Share handler
  const handleShare = async () => {
    if (!match) return;
    const url = window.location.href;
    const title = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
    
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(url);
      // Could show toast here
    }
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <Radio className="h-4 w-4" /> },
    { key: "timeline", label: "Timeline", icon: <Clock className="h-4 w-4" /> },
    { key: "lineups", label: "Lineups", icon: <Users className="h-4 w-4" /> },
    { key: "stats", label: "Stats", icon: <BarChart3 className="h-4 w-4" /> },
    { key: "h2h", label: "H2H", icon: <Swords className="h-4 w-4" /> },
    { key: "matchups", label: "Matchups", icon: <Layers className="h-4 w-4" /> },
    { key: "pools", label: "Pools", icon: <Trophy className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>
      
      {/* Add to Watchboard Modal */}
      <AddToWatchboardModal
        isOpen={showWatchboardModal}
        onClose={() => setShowWatchboardModal(false)}
        gameId={match?.eventId || ''}
        gameSummary={match ? `${match.homeTeam.name} vs ${match.awayTeam.name}` : undefined}
        onSuccess={(boardName) => {
          setToast({ message: `Added to ${boardName}`, type: 'success' });
          setTimeout(() => setToast(null), 3000);
        }}
        onError={(error) => {
          setToast({ message: error, type: 'error' });
          setTimeout(() => setToast(null), 3000);
        }}
      />

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl shadow-lg ${
              toast.type === 'success' 
                ? 'bg-emerald-500/90 text-white' 
                : 'bg-red-500/90 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <Eye className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span className="font-medium text-sm">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Breadcrumb Header */}
      {match && (
        <SoccerPageHeader
          breadcrumbs={buildMatchBreadcrumbs(
            match.homeTeam.name,
            match.awayTeam.name,
            match.competition ? { id: match.competition.toLowerCase().replace(/\s+/g, '-'), name: match.competition } : undefined,
            undefined,
            fromLeagueId,
            fromTeamId
          )}
          title={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
          subtitle={[
            match.competition,
            match.startTime ? new Date(match.startTime).toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            }) : null
          ].filter(Boolean).join(' • ')}
          onBack={goBack}
        />
      )}

      <div className="relative max-w-5xl mx-auto px-4 py-4 sm:py-6">
        {loading && !data ? (
          <MatchSkeleton />
        ) : error ? (
          <>
            <SoccerPageHeader
              breadcrumbs={[{ label: "Match" }]}
              title="Match Not Found"
              onBack={goBack}
            />
            <div className="p-8 rounded-2xl bg-red-500/10 border border-red-500/30 text-center mt-6">
              <AlertCircle className="h-8 w-8 mx-auto mb-3 text-red-400" />
              <p className="text-red-400 font-medium">{error}</p>
            </div>
          </>
        ) : match ? (
          <>
            {/* Premium Match Header */}
            <PremiumMatchHeader 
              match={match} 
              isLive={isLive}
              isFinished={isFinished}
              isWatching={isWatching}
              onWatchToggle={handleWatchToggle}
              onShare={handleShare}
              isInPool={isInPool}
              lastUpdated={lastUpdated}
              isRefreshing={isRefreshing}
              onRefresh={() => fetchMatch(true)}
              isFollowing={isFollowing}
              onFollowToggle={handleFollowToggle}
              fromLeagueId={fromLeagueId}
            />

            {viewMode === "live" && (
              <div className="mt-4 space-y-4">
                <UnifiedLiveSignalStrip
                  cards={[
                    {
                      title: "Line Movement",
                      value: "Live soccer market shifts are active",
                      chip: "LIVE SHIFT",
                      tone: "red",
                    },
                    {
                      title: "Prop Heat",
                      value: "Shots, corners, and card props in focus",
                      chip: "HEAT MAP",
                      tone: "green",
                    },
                    {
                      title: "Pace / Momentum",
                      value: data?.timeline?.length ? "Timeline velocity elevated" : "Momentum balanced",
                      chip: "FLOW SIGNAL",
                      tone: "amber",
                    },
                  ]}
                />
                <UnifiedCoachGLivePanel
                  pregameRead={`${match.homeTeam.name} vs ${match.awayTeam.name} pregame context remains available during live mode.`}
                  liveNotes={liveNotes}
                />
                <UnifiedVideoPanel
                  title="Live Video / Clip Area"
                  subtitle="Live Coach G soccer clip appears here when available."
                  fallbackText="Live Coach G clip not available yet. Monitoring for next update."
                />
              </div>
            )}

            {viewMode === "final" && (
              <div className="mt-4 space-y-4">
                <UnifiedFinalHeroPanel
                  sport="SOCCER"
                  homeTeam={match.homeTeam.abbreviation || match.homeTeam.name}
                  awayTeam={match.awayTeam.abbreviation || match.awayTeam.name}
                  homeScore={match.homeScore}
                  awayScore={match.awayScore}
                  spreadResult={finalOutcomes.spreadResult}
                  totalResult={finalOutcomes.totalResult}
                  coverResult={finalOutcomes.coverResult}
                  overUnderResult={finalOutcomes.overUnderResult}
                />
                <div className="rounded-xl border border-violet-400/20 bg-[#121821] p-4 md:p-5">
                  <h3 className="text-sm font-semibold text-[#E5E7EB]">Coach G Postgame Take</h3>
                  <p className="mt-2 text-sm text-[#9CA3AF]">
                    Final phase control, transition quality, and chance conversion decided this match.
                  </p>
                </div>
                <UnifiedVideoPanel
                  title="Postgame Video"
                  subtitle="Coach G recap clip for completed matchup."
                  fallbackText="Postgame Coach G recap video is not available yet."
                  isPostgame
                />
              </div>
            )}

            {/* Premium Tab Navigation - Mobile-optimized horizontal scroll */}
            <div className="mt-4 mb-4 sm:mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="flex items-center gap-1 p-1.5 bg-black/40 backdrop-blur-sm rounded-xl border border-white/10 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative flex items-center justify-center gap-1.5 min-w-[44px] sm:min-w-0 px-3 sm:px-4 py-3 sm:py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap snap-start ${
                      activeTab === tab.key
                        ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/25"
                        : "text-white/60 hover:text-white active:bg-white/10"
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden xs:inline sm:inline">{tab.label}</span>
                    {tab.key === 'timeline' && newEventCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-5 h-5 px-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full animate-pulse">
                        {newEventCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "overview" && (
                  <OverviewTab 
                    match={match} 
                    timeline={data?.timeline || []} 
                    statistics={data?.statistics}
                    isLive={isLive}
                    playerPhotos={playerPhotos}
                  />
                )}
                {activeTab === "timeline" && (
                  <TimelineTab 
                    timeline={data?.timeline || []} 
                    homeTeam={match.homeTeam}
                    awayTeam={match.awayTeam}
                    isLive={isLive}
                    timelineRef={timelineRef}
                  />
                )}
                {activeTab === "lineups" && (
                  <LineupsTab 
                    lineups={data?.lineups || { home: [], away: [] }}
                    homeTeam={match.homeTeam}
                    awayTeam={match.awayTeam}
                    isPlayerFollowed={isPlayerFollowed}
                    onFollowToggle={(player, team) => {
                      const isFollowing = isPlayerFollowed(player.name, "soccer");
                      if (isFollowing) {
                        unfollowPlayerByName(player.name, "soccer");
                      } else {
                        followPlayer({
                          player_name: player.name,
                          player_id: player.playerId,
                          sport: "soccer",
                          team: team.name,
                          team_abbr: team.abbreviation,
                          position: player.position,
                        });
                      }
                    }}
                  />
                )}
                {activeTab === "stats" && (
                  <StatsTab 
                    statistics={data?.statistics}
                    homeTeam={match.homeTeam}
                    awayTeam={match.awayTeam}
                  />
                )}
                {activeTab === "h2h" && (
                  <H2HTab 
                    h2hData={h2hData}
                    loading={h2hLoading}
                    homeTeam={match.homeTeam}
                    awayTeam={match.awayTeam}
                  />
                )}
                {activeTab === "matchups" && (
                  hasPremiumAccess ? (
                    <MatchupsTab 
                      match={match}
                      homeTeam={match.homeTeam}
                      awayTeam={match.awayTeam}
                    />
                  ) : (
                    <PremiumGate 
                      feature="Market Insights & Betting Intelligence"
                      currentTier={subscription?.tier || 'anonymous'}
                    />
                  )
                )}
                {activeTab === "pools" && (
                  <PoolsTab 
                    match={match}
                    isInPool={isInPool}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================================
// PREMIUM MATCH HEADER
// ============================================================================

interface PremiumMatchHeaderProps {
  match: Match;
  isLive: boolean;
  isFinished: boolean;
  isWatching: boolean;
  onWatchToggle: () => void;
  onShare: () => void;
  isInPool: boolean;
  lastUpdated: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  isFollowing: boolean;
  onFollowToggle: () => void;
  fromLeagueId: string | null;
}

function PremiumMatchHeader({ 
  match, 
  isLive, 
  isFinished,
  isWatching,
  onWatchToggle,
  onShare,
  isInPool,
  lastUpdated,
  isRefreshing,
  onRefresh,
  isFollowing,
  onFollowToggle,
  fromLeagueId
}: PremiumMatchHeaderProps) {
  const formatTime = (time: string | null) => {
    if (!time) return "TBD";
    return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (time: string | null) => {
    if (!time) return "";
    return new Date(time).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };

  const formatUpdated = (date: Date | null) => {
    if (!date) return "";
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const getStatusDisplay = () => {
    if (isLive) {
      return (
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <span className="text-emerald-400 font-bold text-lg">{match.clock || "LIVE"}</span>
        </div>
      );
    }
    
    if (isFinished) {
      return <span className="text-white/60 font-semibold text-lg">FT</span>;
    }

    return (
      <div className="text-center">
        <p className="text-white/40 text-xs">{formatDate(match.startTime)}</p>
        <p className="text-white font-bold text-lg">{formatTime(match.startTime)}</p>
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-sm overflow-hidden">
      {/* Competition & Venue Bar */}
      <div className="px-4 py-2 bg-black/30 border-b border-white/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-white/50 text-xs sm:text-sm">
          {match.competition && (
            <Link 
              to={`/sports/soccer/league/${match.competition.toLowerCase().replace(/\s+/g, '-')}`}
              className="font-medium text-white/70 hover:text-emerald-400 transition-colors"
            >
              {match.competition}
            </Link>
          )}
          {match.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="hidden sm:inline">{match.venue}</span>
            </span>
          )}
        </div>
        
        {/* Updated timestamp */}
        {lastUpdated && (
          <div className="flex items-center gap-1 text-white/40 text-xs">
            <RefreshCw className="h-3 w-3" />
            <span>Updated {formatUpdated(lastUpdated)}</span>
          </div>
        )}
      </div>

      {/* Main Scoreboard */}
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Home Team */}
          <Link 
            to={buildSoccerTeamUrl(match.homeTeam.id, { fromLeagueId: fromLeagueId || undefined })}
            className="flex-1 flex flex-col items-center text-center group"
          >
            <TeamCrest 
              teamId={match.homeTeam.id} 
              teamName={match.homeTeam.name} 
              size="lg"
              className="mb-2 sm:mb-3 transition-transform group-hover:scale-105"
            />
            <h2 className="text-sm sm:text-lg font-bold text-white leading-tight group-hover:text-emerald-400 transition-colors">{match.homeTeam.name}</h2>
            <p className="text-[10px] sm:text-xs text-white/40 uppercase tracking-wide mt-0.5">Home</p>
            <span className="text-[9px] sm:text-[10px] text-emerald-400/70 group-hover:text-emerald-400 transition-colors mt-1">View Team →</span>
          </Link>

          {/* Score / Status */}
          <div className="text-center px-2 sm:px-6 shrink-0">
            {match.homeScore !== null && match.awayScore !== null ? (
              <div className="flex items-center gap-2 sm:gap-4 mb-2">
                <span className="text-4xl sm:text-5xl font-black text-white tabular-nums">{match.homeScore}</span>
                <span className="text-xl sm:text-2xl text-white/30">-</span>
                <span className="text-4xl sm:text-5xl font-black text-white tabular-nums">{match.awayScore}</span>
              </div>
            ) : (
              <div className="mb-2">
                <span className="text-xl sm:text-2xl text-white/30">vs</span>
              </div>
            )}
            {getStatusDisplay()}
            {match.halfTimeScore && (
              <p className="text-xs text-white/40 mt-2">HT: {match.halfTimeScore}</p>
            )}
          </div>

          {/* Away Team */}
          <Link 
            to={buildSoccerTeamUrl(match.awayTeam.id, { fromLeagueId: fromLeagueId || undefined })}
            className="flex-1 flex flex-col items-center text-center group"
          >
            <TeamCrest 
              teamId={match.awayTeam.id} 
              teamName={match.awayTeam.name} 
              size="lg"
              className="mb-2 sm:mb-3 transition-transform group-hover:scale-105"
            />
            <h2 className="text-sm sm:text-lg font-bold text-white leading-tight group-hover:text-cyan-400 transition-colors">{match.awayTeam.name}</h2>
            <p className="text-[10px] sm:text-xs text-white/40 uppercase tracking-wide mt-0.5">Away</p>
            <span className="text-[9px] sm:text-[10px] text-cyan-400/70 group-hover:text-cyan-400 transition-colors mt-1">View Team →</span>
          </Link>
        </div>

        {/* Action Buttons - Mobile: icon-only row, Desktop: full labels */}
        <div className="flex items-center justify-center gap-2 mt-4 sm:mt-5 pt-4 border-t border-white/10">
          {/* Refresh Button - Live matches only */}
          {isLive && (
            <button 
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-1.5 h-11 w-11 sm:w-auto sm:px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 transition-all text-sm disabled:opacity-50"
              title={isRefreshing ? "Updating..." : "Refresh"}
            >
              <RefreshCw className={`h-5 w-5 sm:h-4 sm:w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Updating..." : "Refresh"}</span>
            </button>
          )}
          
          {/* Follow Button */}
          <button 
            onClick={onFollowToggle}
            className={`flex items-center justify-center gap-1.5 h-11 w-11 sm:w-auto sm:px-4 rounded-xl border transition-all text-sm ${
              isFollowing 
                ? "bg-pink-500/20 border-pink-500/50 text-pink-400" 
                : "bg-white/5 hover:bg-white/10 active:bg-white/20 border-white/10 text-white/70 hover:text-white"
            }`}
            title={isFollowing ? "Following" : "Follow"}
          >
            <Heart className={`h-5 w-5 sm:h-4 sm:w-4 ${isFollowing ? 'fill-current' : ''}`} />
            <span className="hidden sm:inline">{isFollowing ? "Following" : "Follow"}</span>
          </button>

          {/* Watch/Scout Button */}
          <button 
            onClick={onWatchToggle}
            className={`flex items-center justify-center gap-1.5 h-11 w-11 sm:w-auto sm:px-4 rounded-xl border transition-all text-sm ${
              isWatching 
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400" 
                : "bg-white/5 hover:bg-white/10 active:bg-white/20 border-white/10 text-white/70 hover:text-white"
            }`}
            title={isWatching ? "Watching" : "Watch"}
          >
            <Eye className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">{isWatching ? "Watching" : "Watch"}</span>
          </button>

          {/* Share Button */}
          <button 
            onClick={onShare}
            className="flex items-center justify-center gap-1.5 h-11 w-11 sm:w-auto sm:px-4 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-white/70 hover:text-white transition-all text-sm"
            title="Share"
          >
            <Share2 className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Pool Picks Button - only show if in pool */}
          {isInPool && (
            <button className="flex items-center gap-1.5 h-11 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium transition-all active:scale-95 sm:hover:shadow-lg sm:hover:shadow-amber-500/25 text-sm">
              <Ticket className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="sr-only sm:not-sr-only">Enter Pool Picks</span>
            </button>
          )}
        </div>

        {/* Match info strip */}
        {(match.referee || match.attendance) && (
          <div className="flex items-center justify-center gap-4 sm:gap-6 mt-4 pt-3 border-t border-white/5">
            {match.referee && (
              <div className="flex items-center gap-2 text-white/40 text-xs sm:text-sm">
                <User className="h-3.5 w-3.5" />
                <span>{match.referee}</span>
              </div>
            )}
            {match.attendance && (
              <div className="flex items-center gap-2 text-white/40 text-xs sm:text-sm">
                <Users className="h-3.5 w-3.5" />
                <span>{match.attendance.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// OVERVIEW TAB - Broadcast Desk Style
// ============================================================================

interface OverviewTabProps {
  match: Match;
  timeline: TimelineEvent[];
  statistics: { home: Record<string, any>; away: Record<string, any> } | null;
  isLive: boolean;
  playerPhotos?: Map<string, string>;
}

function OverviewTab({ match, timeline, statistics, isLive, playerPhotos }: OverviewTabProps) {
  // Filter key events (goals, red cards, penalties, VAR)
  const keyEvents = timeline.filter(
    (e) => e.type === "score_change" || e.type === "goal" || e.type === "red_card" || 
           e.type === "penalty_awarded" || e.type === "yellow_card"
  ).slice(-8); // Show up to 8 recent events

  // Quick stats for broadcast overview
  const quickStats = [
    { 
      label: "Possession", 
      home: statistics?.home?.ball_possession ?? statistics?.home?.possession ?? "-",
      away: statistics?.away?.ball_possession ?? statistics?.away?.possession ?? "-",
      suffix: "%",
      icon: <Activity className="h-3 w-3" />
    },
    { 
      label: "Shots", 
      home: statistics?.home?.shots_total ?? statistics?.home?.total_shots ?? "-",
      away: statistics?.away?.shots_total ?? statistics?.away?.total_shots ?? "-",
      icon: <Target className="h-3 w-3" />
    },
    { 
      label: "On Target", 
      home: statistics?.home?.shots_on_target ?? statistics?.home?.shots_on_goal ?? "-",
      away: statistics?.away?.shots_on_target ?? statistics?.away?.shots_on_goal ?? "-",
      icon: <Zap className="h-3 w-3" />
    },
    { 
      label: "Corners", 
      home: statistics?.home?.corner_kicks ?? statistics?.home?.corners ?? "-",
      away: statistics?.away?.corner_kicks ?? statistics?.away?.corners ?? "-",
      icon: <ArrowRightLeft className="h-3 w-3" />
    },
    { 
      label: "Fouls", 
      home: statistics?.home?.fouls ?? "-",
      away: statistics?.away?.fouls ?? "-",
      icon: <AlertCircle className="h-3 w-3" />
    },
  ];

  // Enhanced momentum with attacking pressure
  const getMomentum = () => {
    const homePoss = parseInt(String(statistics?.home?.ball_possession || statistics?.home?.possession || "50"));
    const awayPoss = parseInt(String(statistics?.away?.ball_possession || statistics?.away?.possession || "50"));
    
    // Calculate attacking intensity based on shots
    const homeShots = parseInt(String(statistics?.home?.shots_total || statistics?.home?.total_shots || "0"));
    const awayShots = parseInt(String(statistics?.away?.shots_total || statistics?.away?.total_shots || "0"));
    const totalShots = homeShots + awayShots || 1;
    const homePressure = (homeShots / totalShots) * 100;
    const awayPressure = (awayShots / totalShots) * 100;
    
    return { 
      possession: { home: homePoss, away: awayPoss },
      pressure: { home: homePressure, away: awayPressure }
    };
  };

  const momentum = statistics ? getMomentum() : { 
    possession: { home: 50, away: 50 },
    pressure: { home: 50, away: 50 }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Coach G Match Brief - Broadcast Desk Style */}
      <div className="relative p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-purple-600/20 via-purple-500/10 to-cyan-500/20 border border-purple-500/30 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-cyan-500/10 animate-pulse" />
        
        <div className="relative flex items-start gap-3 sm:gap-4">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-purple-500/40 to-cyan-500/40 flex items-center justify-center shrink-0 ring-2 ring-purple-400/30">
            <CoachGAvatar size="sm" presence={isLive ? "alert" : "monitoring"} className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h4 className="font-black text-white text-sm sm:text-base">Coach G</h4>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-wide">
                Match Brief
              </span>
            </div>
            <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-medium">
              {isLive ? (
                `${match.homeTeam.name} controlling ${momentum.possession.home}% possession with ${momentum.pressure.home.toFixed(0)}% attacking pressure. ${
                  momentum.pressure.home > 60 
                    ? `Dominant display - ${match.awayTeam.name} struggling to create chances.`
                    : momentum.pressure.away > 60
                    ? `${match.awayTeam.name} dangerous on the counter despite lower possession.`
                    : `Evenly matched contest - tactical discipline will be crucial.`
                }`
              ) : (
                `Key tactical matchup between ${match.homeTeam.name} and ${match.awayTeam.name}. Watch how both teams set up defensively in the opening 15 minutes - that'll tell you everything about their game plan.`
              )}
            </p>
            {isLive && (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-purple-300">
                <Radio className="h-3 w-3 animate-pulse" />
                <span className="font-medium">Live Analysis Active</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dual Momentum Bars - Broadcast Style */}
      {statistics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Possession Flow */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
            <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              Ball Control
            </h3>
            <div className="relative h-2.5 rounded-full bg-white/10 overflow-hidden mb-2">
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 ease-out"
                style={{ width: `${momentum.possession.home}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-emerald-400 font-bold">{momentum.possession.home}%</span>
              <span className="text-cyan-400 font-bold">{momentum.possession.away}%</span>
            </div>
          </div>

          {/* Attacking Pressure */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
            <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Attack Pressure
            </h3>
            <div className="relative h-2.5 rounded-full bg-white/10 overflow-hidden mb-2">
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-700 ease-out"
                style={{ width: `${momentum.pressure.home}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-amber-400 font-bold">{momentum.pressure.home.toFixed(0)}%</span>
              <span className="text-orange-400 font-bold">{momentum.pressure.away.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Key Stats Grid - Broadcast Dashboard */}
      {statistics && (
        <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
          <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
            Quick Stats
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {quickStats.map((stat) => (
              <div key={stat.label} className="p-3 rounded-lg bg-black/20 border border-white/5 hover:border-white/10 transition-colors">
                <div className="flex items-center justify-center gap-1 mb-1.5 text-white/40">
                  {stat.icon}
                </div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm sm:text-base font-black text-emerald-400">{stat.home}{stat.suffix || ""}</span>
                  <span className="text-sm sm:text-base font-black text-cyan-400">{stat.away}{stat.suffix || ""}</span>
                </div>
                <p className="text-[10px] sm:text-xs text-white/50 text-center truncate font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goal Scorers - Prominent Display */}
      {(() => {
        const goals = timeline.filter(e => e.type === "score_change" || e.type === "goal");
        const redCards = timeline.filter(e => e.type === "red_card");
        
        return (goals.length > 0 || redCards.length > 0) && (
          <div className="grid gap-3 sm:gap-4">
            {/* Goals Section */}
            {goals.length > 0 && (
              <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30">
                <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="text-lg">⚽</span>
                  Goal Scorers ({goals.length})
                </h3>
                <div className="space-y-2">
                  {goals.map((goal, idx) => {
                    const isHome = goal.teamQualifier === "home";
                    return (
                      <div key={goal.id || idx} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-emerald-500/20 hover:bg-black/30 transition-colors">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-500/30 shrink-0">
                            <span className="text-sm font-black text-emerald-300">{goal.time}'</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold truncate ${isHome ? 'text-emerald-400' : 'text-cyan-400'}`}>
                              {goal.player || "Unknown Player"}
                            </p>
                            {goal.assistPlayer && (
                              <p className="text-xs text-white/50 truncate">
                                Assist: {goal.assistPlayer}
                              </p>
                            )}
                            {goal.goalType && (
                              <p className="text-[10px] text-white/40 uppercase tracking-wide">
                                {goal.goalType.replace(/_/g, ' ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-xs text-white/50 mb-0.5">{isHome ? match.homeTeam.name : match.awayTeam.name}</p>
                          {goal.homeScore !== undefined && goal.awayScore !== undefined && (
                            <p className="text-sm font-black text-white">
                              {goal.homeScore}-{goal.awayScore}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Red Cards Section */}
            {redCards.length > 0 && (
              <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-red-500/20 to-red-500/5 border border-red-500/30">
                <h3 className="text-xs sm:text-sm font-bold text-red-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Red Cards ({redCards.length})
                </h3>
                <div className="space-y-2">
                  {redCards.map((card, idx) => {
                    const isHome = card.teamQualifier === "home";
                    return (
                      <div key={card.id || idx} className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-red-500/20 hover:bg-black/30 transition-colors">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-red-500/30 shrink-0">
                          <span className="text-sm font-black text-red-300">{card.time}'</span>
                        </div>
                        <div className="h-8 w-5 bg-red-500 rounded-sm shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold truncate ${isHome ? 'text-red-400' : 'text-red-300'}`}>
                            {card.player || "Unknown Player"}
                          </p>
                          <p className="text-xs text-white/50 truncate">
                            {isHome ? match.homeTeam.name : match.awayTeam.name}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Key Moments - All Events */}
      <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-xs sm:text-sm font-bold text-white/80 uppercase tracking-wide flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Match Highlights
          </h3>
          {keyEvents.length > 0 && (
            <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold">
              {keyEvents.length} Events
            </span>
          )}
        </div>
        
        {keyEvents.length === 0 ? (
          <div className="text-center py-8">
            <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
              <Clock className="h-6 w-6 text-white/30" />
            </div>
            <p className="text-white/40 text-sm">No key moments yet</p>
            <p className="text-white/30 text-xs mt-1">Events will appear here as the match unfolds</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-2.5">
            {keyEvents.map((event, idx) => (
              <KeyEventCard key={event.id || idx} event={event} match={match} playerPhotos={playerPhotos} />
            ))}
          </div>
        )}
      </div>

      {/* What to Watch Next - Tactical Preview */}
      {isLive && (
        <div className="relative p-4 sm:p-5 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-red-500/10 border border-amber-500/30 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-orange-500/10" />
          
          <div className="relative">
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide mb-2 flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-400" />
              Tactical Watch Points
            </h3>
            <div className="space-y-2">
              <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                {momentum.possession.home > 60 
                  ? `${match.homeTeam.name} dominating possession (${momentum.possession.home}%) - watch for ${match.awayTeam.name} dropping deeper and looking for counter-attacks through the wings.`
                  : momentum.possession.away > 60
                  ? `${match.awayTeam.name} controlling the ball (${momentum.possession.away}%) - ${match.homeTeam.name} sitting compact, dangerous on the break.`
                  : momentum.pressure.home > 65
                  ? `${match.homeTeam.name} applying heavy pressure - set pieces and defensive errors could be decisive.`
                  : momentum.pressure.away > 65
                  ? `${match.awayTeam.name} creating the better chances despite even possession - clinical finishing will decide this.`
                  : `Tactical stalemate - next goal crucial. Both teams organized defensively. Watch for substitutions around the 60-minute mark.`
                }
              </p>
              {match.clock && parseInt(match.clock) > 70 && (
                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[10px] sm:text-xs text-amber-300 font-bold">
                    Final 20 minutes - Expect tactical changes and increased tempo
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pre-Match Preview */}
      {!isLive && !match.homeScore && (
        <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
          <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide mb-2 flex items-center gap-2">
            <Eye className="h-4 w-4 text-cyan-400" />
            Pre-Match Focus
          </h3>
          <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
            Watch the first 15 minutes closely - team shape and pressing intensity will reveal both managers' tactical approach. 
            Key battles: midfield control and defensive set-piece organization.
          </p>
        </div>
      )}
    </div>
  );
}

function KeyEventCard({ event, match, playerPhotos }: { event: TimelineEvent; match: Match; playerPhotos?: Map<string, string> }) {
  const isGoal = event.type === "score_change" || event.type === "goal";
  const isRedCard = event.type === "red_card";
  const isHome = event.teamQualifier === "home";
  const playerPhoto = playerPhotos?.get(event.player || "");

  return (
    <div className={`flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-lg ${
      isGoal ? "bg-emerald-500/10 border border-emerald-500/20" : 
      isRedCard ? "bg-red-500/10 border border-red-500/20" :
      "bg-white/5"
    }`}>
      {/* Minute */}
      <div className="w-10 sm:w-12 text-center shrink-0">
        <span className={`text-base sm:text-lg font-bold ${isGoal ? "text-emerald-400" : isRedCard ? "text-red-400" : "text-white"}`}>
          {event.time}'
        </span>
      </div>

      {/* Player Photo or Icon */}
      <div className={`relative h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center shrink-0 ${
        !playerPhoto && (isGoal ? "bg-emerald-500/20" : isRedCard ? "bg-red-500/20" : "bg-white/10")
      }`}>
        {playerPhoto ? (
          <img 
            src={playerPhoto} 
            alt={event.player || ""} 
            className="h-full w-full rounded-full object-cover border-2 border-white/20"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`${playerPhoto ? 'hidden' : ''} h-full w-full rounded-full flex items-center justify-center ${
          isGoal ? "bg-emerald-500/20" : isRedCard ? "bg-red-500/20" : "bg-white/10"
        }`}>
          {isGoal ? (
            <span className="text-base sm:text-lg">⚽</span>
          ) : isRedCard ? (
            <div className="h-4 w-3 sm:h-5 sm:w-4 bg-red-500 rounded-sm" />
          ) : (
            <Circle className="h-4 w-4 text-white/50" />
          )}
        </div>
        {/* Event type badge overlay */}
        {playerPhoto && (isGoal || isRedCard) && (
          <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center ${
            isGoal ? "bg-emerald-500" : "bg-red-500"
          }`}>
            {isGoal ? (
              <span className="text-[8px]">⚽</span>
            ) : (
              <div className="h-2 w-1.5 bg-white rounded-[1px]" />
            )}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm sm:text-base truncate">{event.player || "Unknown"}</p>
        <p className="text-[10px] sm:text-xs text-white/50 truncate">
          {isHome ? match.homeTeam.name : match.awayTeam.name}
          {event.assistPlayer && ` • ${event.assistPlayer}`}
        </p>
      </div>

      {/* Score after goal */}
      {isGoal && event.homeScore !== undefined && event.awayScore !== undefined && (
        <div className="text-right shrink-0">
          <span className="text-base sm:text-lg font-bold text-white">
            {event.homeScore} - {event.awayScore}
          </span>
        </div>
      )}
    </div>
  );
}

function StatBar({ label, home, away, suffix = "" }: { 
  label: string; 
  home: string | number; 
  away: string | number;
  suffix?: string;
}) {
  const homeVal = typeof home === "number" ? home : parseInt(String(home)) || 0;
  const awayVal = typeof away === "number" ? away : parseInt(String(away)) || 0;
  const total = homeVal + awayVal || 1;
  const homePercent = (homeVal / total) * 100;

  return (
    <div>
      <div className="flex justify-between text-xs sm:text-sm mb-1.5">
        <span className="font-bold text-white">{home}{suffix}</span>
        <span className="text-white/50">{label}</span>
        <span className="font-bold text-white">{away}{suffix}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 flex overflow-hidden">
        <div 
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${homePercent}%` }}
        />
        <div 
          className="h-full bg-cyan-500 transition-all duration-500"
          style={{ width: `${100 - homePercent}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// TIMELINE TAB
// ============================================================================

interface TimelineTabProps {
  timeline: TimelineEvent[];
  homeTeam: Team;
  awayTeam: Team;
  isLive: boolean;
  timelineRef?: React.RefObject<HTMLDivElement | null>;
}

function TimelineTab({ timeline, homeTeam, awayTeam, isLive, timelineRef }: TimelineTabProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const endRef = timelineRef || internalRef;

  const scrollToLatest = () => {
    if (endRef.current) {
      endRef.current.scrollTo({ top: endRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  if (timeline.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <Clock className="h-8 w-8 mx-auto mb-3 text-white/30" />
        <p className="text-white/50">No events recorded yet</p>
        <p className="text-xs text-white/30 mt-1">Events will appear here as the match progresses</p>
      </div>
    );
  }

  // Group by period
  const periods = timeline.reduce((acc, event) => {
    const period = event.period || (event.time <= 45 ? "1st Half" : "2nd Half");
    if (!acc[period]) acc[period] = [];
    acc[period].push(event);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);

  // Order periods correctly
  const periodOrder = ["1st Half", "2nd Half", "1st extra", "2nd extra", "Penalties"];
  const sortedPeriods = Object.entries(periods).sort(([a], [b]) => {
    const aIdx = periodOrder.findIndex(p => a.toLowerCase().includes(p.toLowerCase()));
    const bIdx = periodOrder.findIndex(p => b.toLowerCase().includes(p.toLowerCase()));
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return (
    <div ref={endRef} className="space-y-4 sm:space-y-6 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      {/* Jump to latest button for live matches */}
      {isLive && (
        <div className="sticky top-0 z-10 pb-3">
          <button
            onClick={scrollToLatest}
            className="w-full py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2 backdrop-blur-sm"
          >
            <Play className="h-4 w-4" />
            Jump to Latest
          </button>
        </div>
      )}

      {sortedPeriods.map(([period, events]) => (
        <div key={period}>
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-bold text-white/40 uppercase tracking-wider px-2">{period}</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          
          <div className="space-y-2">
            {events.map((event, idx) => (
              <TimelineEventCard 
                key={event.id || idx} 
                event={event}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineEventCard({ event, homeTeam, awayTeam }: { 
  event: TimelineEvent; 
  homeTeam: Team;
  awayTeam: Team;
}) {
  const isHome = event.teamQualifier === "home";
  const team = isHome ? homeTeam : awayTeam;

  const getEventDetails = () => {
    switch (event.type) {
      case "score_change":
      case "goal":
        return {
          icon: <span className="text-base sm:text-lg">⚽</span>,
          bg: "bg-emerald-500/20",
          border: "border-emerald-500/30",
          title: "GOAL",
          color: "text-emerald-400"
        };
      case "yellow_card":
        return {
          icon: <div className="h-4 w-2.5 sm:h-5 sm:w-3 bg-yellow-400 rounded-sm" />,
          bg: "bg-yellow-500/10",
          border: "border-yellow-500/20",
          title: "Yellow Card",
          color: "text-yellow-400"
        };
      case "red_card":
        return {
          icon: <div className="h-4 w-2.5 sm:h-5 sm:w-3 bg-red-500 rounded-sm" />,
          bg: "bg-red-500/10",
          border: "border-red-500/20",
          title: "Red Card",
          color: "text-red-400"
        };
      case "substitution":
        return {
          icon: <ArrowRightLeft className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />,
          bg: "bg-blue-500/10",
          border: "border-blue-500/20",
          title: "Substitution",
          color: "text-blue-400"
        };
      case "penalty_awarded":
        return {
          icon: <Target className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />,
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
          title: "Penalty",
          color: "text-amber-400"
        };
      default:
        return {
          icon: <Circle className="h-3 w-3 sm:h-4 sm:w-4 text-white/30" />,
          bg: "bg-white/5",
          border: "border-white/10",
          title: event.type.replace(/_/g, " "),
          color: "text-white/60"
        };
    }
  };

  const details = getEventDetails();

  return (
    <div className={`flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl ${details.bg} border ${details.border}`}>
      {/* Minute */}
      <div className="w-10 sm:w-12 text-center pt-1 shrink-0">
        <span className={`text-lg sm:text-xl font-black ${details.color}`}>{event.time}'</span>
      </div>

      {/* Icon */}
      <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl ${details.bg} flex items-center justify-center shrink-0`}>
        {details.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-wide ${details.color} mb-0.5 sm:mb-1`}>
          {details.title}
        </p>
        <p className="text-white font-medium text-sm sm:text-base truncate">
          {event.player || "Unknown"}
        </p>
        <p className="text-xs sm:text-sm text-white/50 truncate">
          {team.name}
          {event.assistPlayer && (
            <span className="text-white/40"> • Assist: {event.assistPlayer}</span>
          )}
        </p>
        {event.type === "substitution" && (
          <p className="text-xs sm:text-sm text-white/40 mt-1">
            <span className="text-emerald-400">↑ {event.playerIn}</span>
            {" "}
            <span className="text-red-400">↓ {event.playerOut}</span>
          </p>
        )}
      </div>

      {/* Score (for goals) */}
      {(event.type === "score_change" || event.type === "goal") && 
       event.homeScore !== undefined && event.awayScore !== undefined && (
        <div className="text-right shrink-0">
          <p className="text-xl sm:text-2xl font-black text-white">
            {event.homeScore} - {event.awayScore}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LINEUPS TAB
// ============================================================================

interface LineupsTabProps {
  lineups: { home: Player[]; away: Player[] };
  homeTeam: Team;
  awayTeam: Team;
  isPlayerFollowed: (playerName: string, sport: string) => boolean;
  onFollowToggle: (player: Player, team: Team) => void;
}

// Position mapping for formation layout
// Positions are normalized to x,y coordinates on a 0-100 scale
// Home team plays bottom half (y: 50-95), Away team plays top half (y: 5-50)
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
  // Goalkeepers
  'GK': { x: 50, y: 90 },
  'G': { x: 50, y: 90 },
  'goalkeeper': { x: 50, y: 90 },
  
  // Defenders (4 positions spread across)
  'LB': { x: 15, y: 75 },
  'RB': { x: 85, y: 75 },
  'CB': { x: 40, y: 78 },
  'LCB': { x: 35, y: 78 },
  'RCB': { x: 65, y: 78 },
  'D': { x: 50, y: 75 },
  'defender': { x: 50, y: 75 },
  'LWB': { x: 12, y: 68 },
  'RWB': { x: 88, y: 68 },
  
  // Midfielders
  'CDM': { x: 50, y: 62 },
  'LDM': { x: 35, y: 62 },
  'RDM': { x: 65, y: 62 },
  'CM': { x: 50, y: 55 },
  'LCM': { x: 35, y: 55 },
  'RCM': { x: 65, y: 55 },
  'LM': { x: 12, y: 55 },
  'RM': { x: 88, y: 55 },
  'CAM': { x: 50, y: 48 },
  'LAM': { x: 35, y: 48 },
  'RAM': { x: 65, y: 48 },
  'M': { x: 50, y: 55 },
  'midfielder': { x: 50, y: 55 },
  
  // Forwards/Attackers
  'LW': { x: 18, y: 38 },
  'RW': { x: 82, y: 38 },
  'CF': { x: 50, y: 32 },
  'ST': { x: 50, y: 30 },
  'LST': { x: 38, y: 30 },
  'RST': { x: 62, y: 30 },
  'LF': { x: 35, y: 35 },
  'RF': { x: 65, y: 35 },
  'F': { x: 50, y: 32 },
  'forward': { x: 50, y: 32 },
  'A': { x: 50, y: 32 },
  'attacker': { x: 50, y: 32 },
};

// Get position coordinates with smart collision avoidance
function getPlayerPosition(player: Player, index: number, team: 'home' | 'away', samePosPlayers: number): { x: number; y: number } {
  const pos = player.position?.toUpperCase() || 'M';
  
  // Try exact match first, then abbreviations
  let coords = POSITION_COORDS[pos] || 
               POSITION_COORDS[pos.charAt(0)] ||
               POSITION_COORDS['M']; // Default to midfielder
  
  // Handle multiple players at same position
  const offsetX = samePosPlayers > 1 ? (index % samePosPlayers - (samePosPlayers - 1) / 2) * 20 : 0;
  
  let x = coords.x + offsetX;
  let y = coords.y;
  
  // Flip for away team (mirror across center)
  if (team === 'away') {
    y = 100 - y;
  }
  
  return { x: Math.max(8, Math.min(92, x)), y };
}

// Group players by position category
function groupByPosition(players: Player[]): Map<string, Player[]> {
  const groups = new Map<string, Player[]>();
  players.forEach(p => {
    const pos = p.position?.toUpperCase() || 'M';
    const key = pos.charAt(0); // G, D, M, F/A
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  });
  return groups;
}

interface FormationViewProps {
  homeStarters: Player[];
  awayStarters: Player[];
  homeTeam: Team;
  awayTeam: Team;
}

function FormationView({ homeStarters, awayStarters, homeTeam, awayTeam }: FormationViewProps) {
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const [playerPhotos, setPlayerPhotos] = useState<Map<string, string>>(new Map());

  // Fetch player photos
  useEffect(() => {
    const allPlayers = [...homeStarters, ...awayStarters];
    if (allPlayers.length === 0) return;
    
    const playerNames = allPlayers.map(p => p.name);
    fetchPlayerPhotos(playerNames)
      .then(photoMap => setPlayerPhotos(photoMap))
      .catch(err => console.error('Failed to load player photos:', err));
  }, [homeStarters, awayStarters]);

  // Group players by position for collision handling
  const homeGroups = groupByPosition(homeStarters);
  const awayGroups = groupByPosition(awayStarters);
  
  const PLACEHOLDER_PHOTO = 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254';

  const renderPlayer = (player: Player, team: 'home' | 'away', indexInPos: number, totalInPos: number) => {
    const { x, y } = getPlayerPosition(player, indexInPos, team, totalInPos);
    const isHovered = hoveredPlayer === player.playerId;
    const teamColor = team === 'home' ? '#34d399' : '#22d3ee';
    // Get last name (or full name if single word)
    const displayName = player.name.split(' ').pop() || player.name;
    const photoUrl = playerPhotos.get(player.name) || PLACEHOLDER_PHOTO;
    const hasPhoto = photoUrl !== PLACEHOLDER_PHOTO;
    const radius = isHovered ? 4 : 3;
    const clipId = `player-clip-${player.playerId}`;
    
    return (
      <g 
        key={player.playerId}
        className="cursor-pointer transition-all duration-200"
        onMouseEnter={() => setHoveredPlayer(player.playerId)}
        onMouseLeave={() => setHoveredPlayer(null)}
        style={{ transform: `translate(${x}%, ${y}%)` }}
      >
        {/* Define clip path for circular image */}
        <defs>
          <clipPath id={clipId}>
            <circle cx="0" cy="0" r={radius} />
          </clipPath>
        </defs>
        
        {/* Player photo circle or colored fallback */}
        {hasPhoto ? (
          <>
            {/* Photo with circular clip */}
            <image
              href={photoUrl}
              x={-radius}
              y={-radius}
              width={radius * 2}
              height={radius * 2}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
              style={{ 
                filter: isHovered ? 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' : undefined 
              }}
            />
            {/* Border ring */}
            <circle
              cx="0"
              cy="0"
              r={radius}
              fill="none"
              stroke={teamColor}
              strokeWidth="0.5"
              style={{ 
                filter: isHovered ? `drop-shadow(0 0 3px ${teamColor})` : undefined 
              }}
            />
          </>
        ) : (
          /* Colored dot fallback when no photo */
          <circle
            cx="0"
            cy="0"
            r={radius}
            style={{ 
              fill: teamColor,
              filter: isHovered ? `drop-shadow(0 0 8px ${teamColor})` : undefined
            }}
          />
        )}
        {/* Player name label (always visible) */}
        <text
          x="0"
          y={team === 'home' ? '6' : '-5'}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white select-none font-medium"
          style={{ 
            fontSize: '2.8px',
            textShadow: '0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)'
          }}
        >
          {displayName}
        </text>
        {/* Full name + jersey on hover */}
        {isHovered && (
          <g>
            <rect
              x="-18"
              y={team === 'home' ? '10' : '-16'}
              width="36"
              height="7"
              rx="1"
              className="fill-black/90"
            />
            <text
              x="0"
              y={team === 'home' ? '14' : '-12'}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-white select-none"
              style={{ fontSize: '2.5px' }}
            >
              {player.jerseyNumber ? `#${player.jerseyNumber} ` : ''}{player.name}
            </text>
          </g>
        )}
        {/* Captain badge */}
        {player.captain && (
          <circle
            cx="3.5"
            cy="-2"
            r="1.5"
            className="fill-amber-400"
          />
        )}
        {/* Stats badges */}
        {player.goals > 0 && (
          <circle
            cx="-3.5"
            cy="-2"
            r="1.5"
            className="fill-white"
          />
        )}
      </g>
    );
  };

  return (
    <div className="relative aspect-[3/2] rounded-xl overflow-hidden bg-gradient-to-b from-emerald-900/40 to-emerald-800/30 border border-emerald-500/20">
      {/* Pitch SVG */}
      <svg viewBox="0 0 100 66" className="absolute inset-0 w-full h-full">
        {/* Pitch background */}
        <rect x="0" y="0" width="100" height="66" fill="#064e3b" />
        
        {/* Pitch lines */}
        <g stroke="#34d399" strokeWidth="0.3" fill="none" opacity="0.6">
          {/* Outer boundary */}
          <rect x="2" y="2" width="96" height="62" />
          {/* Halfway line */}
          <line x1="2" y1="33" x2="98" y2="33" />
          {/* Center circle */}
          <circle cx="50" cy="33" r="8" />
          <circle cx="50" cy="33" r="0.5" fill="#34d399" />
          
          {/* Top penalty area */}
          <rect x="30" y="2" width="40" height="12" />
          <rect x="38" y="2" width="24" height="5" />
          <circle cx="50" cy="10" r="0.5" fill="#34d399" />
          
          {/* Bottom penalty area */}
          <rect x="30" y="52" width="40" height="12" />
          <rect x="38" y="59" width="24" height="5" />
          <circle cx="50" cy="56" r="0.5" fill="#34d399" />
          
          {/* Goals */}
          <rect x="44" y="0" width="12" height="2" strokeWidth="0.4" />
          <rect x="44" y="64" width="12" height="2" strokeWidth="0.4" />
          
          {/* Corner arcs */}
          <path d="M 2 5 A 3 3 0 0 0 5 2" />
          <path d="M 98 5 A 3 3 0 0 1 95 2" />
          <path d="M 2 61 A 3 3 0 0 1 5 64" />
          <path d="M 98 61 A 3 3 0 0 0 95 64" />
        </g>
        
        {/* Team labels */}
        <text x="50" y="60" textAnchor="middle" className="fill-emerald-400/60" style={{ fontSize: '3px', fontWeight: 'bold' }}>
          {homeTeam.name.toUpperCase()}
        </text>
        <text x="50" y="6" textAnchor="middle" className="fill-cyan-400/60" style={{ fontSize: '3px', fontWeight: 'bold' }}>
          {awayTeam.name.toUpperCase()}
        </text>
      </svg>
      
      {/* Players layer */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        {/* Home team players */}
        {Array.from(homeGroups.entries()).map(([, players]) => 
          players.map((player, idx) => renderPlayer(player, 'home', idx, players.length))
        )}
        
        {/* Away team players */}
        {Array.from(awayGroups.entries()).map(([, players]) => 
          players.map((player, idx) => renderPlayer(player, 'away', idx, players.length))
        )}
      </svg>
      
      {/* Legend */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-4 text-[10px] text-white/50">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>{homeTeam.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-cyan-400" />
          <span>{awayTeam.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-amber-400" />
          <span>Captain</span>
        </div>
      </div>
    </div>
  );
}

function LineupsTab({ lineups, homeTeam, awayTeam, isPlayerFollowed, onFollowToggle }: LineupsTabProps) {
  const [showBench, setShowBench] = useState(false);
  const [viewMode, setViewMode] = useState<'formation' | 'list'>('formation');
  const [playerPhotos, setPlayerPhotos] = useState<Map<string, string>>(new Map());

  const homeStarters = lineups.home.filter((p) => p.starter);
  const homeBench = lineups.home.filter((p) => !p.starter);
  const awayStarters = lineups.away.filter((p) => p.starter);
  const awayBench = lineups.away.filter((p) => !p.starter);

  // Fetch player photos when lineups load
  useEffect(() => {
    const allPlayers = [...lineups.home, ...lineups.away];
    if (allPlayers.length === 0) return;

    const playerNames = allPlayers.map(p => p.name);
    fetchPlayerPhotos(playerNames).then(photos => {
      setPlayerPhotos(photos);
    });
  }, [lineups]);

  const getPlayerPhoto = useCallback((name: string): string | undefined => {
    return playerPhotos.get(name);
  }, [playerPhotos]);

  if (lineups.home.length === 0 && lineups.away.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <Users className="h-8 w-8 mx-auto mb-3 text-white/30" />
        <p className="text-white/50">Lineups not yet available</p>
        <p className="text-xs text-white/30 mt-1">Lineups typically appear 1 hour before kickoff</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-center gap-1 p-1 bg-white/5 rounded-lg w-fit mx-auto">
        <button
          onClick={() => setViewMode('formation')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            viewMode === 'formation' 
              ? 'bg-emerald-500 text-white' 
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <Layers className="h-3.5 w-3.5 inline mr-1.5" />
          Formation
        </button>
        <button
          onClick={() => setViewMode('list')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            viewMode === 'list' 
              ? 'bg-emerald-500 text-white' 
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <Users className="h-3.5 w-3.5 inline mr-1.5" />
          List
        </button>
      </div>

      {/* Formation View */}
      {viewMode === 'formation' && homeStarters.length > 0 && (
        <FormationView
          homeStarters={homeStarters}
          awayStarters={awayStarters}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
        />
      )}

      {/* Starting XI - List View */}
      {viewMode === 'list' && (
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        {/* Home */}
        <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <span className="text-lg sm:text-xl">⚽</span>
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">{homeTeam.name}</h3>
              <p className="text-[10px] sm:text-xs text-emerald-400">Starting XI</p>
            </div>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            {homeStarters.map((player) => (
              <PlayerRow key={player.playerId} player={player} teamColor="emerald" team={homeTeam} isFollowed={isPlayerFollowed(player.name, "soccer")} onFollowToggle={onFollowToggle} photoUrl={getPlayerPhoto(player.name)} />
            ))}
          </div>
        </div>

        {/* Away */}
        <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/20">
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <span className="text-lg sm:text-xl">⚽</span>
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">{awayTeam.name}</h3>
              <p className="text-[10px] sm:text-xs text-cyan-400">Starting XI</p>
            </div>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            {awayStarters.map((player) => (
              <PlayerRow key={player.playerId} player={player} teamColor="cyan" team={awayTeam} isFollowed={isPlayerFollowed(player.name, "soccer")} onFollowToggle={onFollowToggle} photoUrl={getPlayerPhoto(player.name)} />
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Bench Toggle */}
      {(homeBench.length > 0 || awayBench.length > 0) && (
        <button
          onClick={() => setShowBench(!showBench)}
          className="w-full py-2.5 sm:py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-sm"
        >
          <Users className="h-4 w-4" />
          {showBench ? "Hide Substitutes" : `Show Substitutes (${homeBench.length + awayBench.length})`}
          <ChevronRight className={`h-4 w-4 transition-transform ${showBench ? 'rotate-90' : ''}`} />
        </button>
      )}

      {/* Bench */}
      <AnimatePresence>
        {showBench && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="grid md:grid-cols-2 gap-4 sm:gap-6"
          >
            {/* Home Bench */}
            <div className="p-4 sm:p-5 rounded-xl bg-white/5 border border-white/10">
              <h4 className="text-xs sm:text-sm font-bold text-white/60 mb-2 sm:mb-3">Substitutes</h4>
              <div className="space-y-1.5 sm:space-y-2">
                {homeBench.map((player) => (
                  <PlayerRow key={player.playerId} player={player} teamColor="white" team={homeTeam} isFollowed={isPlayerFollowed(player.name, "soccer")} onFollowToggle={onFollowToggle} photoUrl={getPlayerPhoto(player.name)} />
                ))}
              </div>
            </div>

            {/* Away Bench */}
            <div className="p-4 sm:p-5 rounded-xl bg-white/5 border border-white/10">
              <h4 className="text-xs sm:text-sm font-bold text-white/60 mb-2 sm:mb-3">Substitutes</h4>
              <div className="space-y-1.5 sm:space-y-2">
                {awayBench.map((player) => (
                  <PlayerRow key={player.playerId} player={player} teamColor="white" team={awayTeam} isFollowed={isPlayerFollowed(player.name, "soccer")} onFollowToggle={onFollowToggle} photoUrl={getPlayerPhoto(player.name)} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface PlayerRowProps {
  player: Player;
  teamColor: string;
  team: Team;
  isFollowed: boolean;
  onFollowToggle: (player: Player, team: Team) => void;
  photoUrl?: string;
}

function PlayerRow({ player, teamColor, team, isFollowed, onFollowToggle, photoUrl }: PlayerRowProps) {
  const colorClasses: Record<string, string> = {
    emerald: "ring-emerald-500/50",
    cyan: "ring-cyan-500/50",
    white: "ring-white/20"
  };

  return (
    <Link
      to={buildSoccerPlayerUrl(player.playerId, { fromTeamId: team.id })}
      className="flex items-center gap-2 sm:gap-3 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
    >
      {/* Player Photo or Jersey Number */}
      <div className="relative flex-shrink-0">
        {photoUrl ? (
          <img 
            src={photoUrl} 
            alt={player.name}
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover ring-2 ${colorClasses[teamColor]} bg-black/30`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`${photoUrl ? 'hidden' : ''} w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-white/10 to-white/5 ring-2 ${colorClasses[teamColor]} flex items-center justify-center text-xs sm:text-sm font-bold text-white/60`}>
          {player.jerseyNumber || player.name.charAt(0)}
        </div>
      </div>

      {/* Name & Position */}
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-medium text-white truncate group-hover:text-emerald-400 transition-colors">
          {player.name}
          {player.captain && <span className="ml-1 text-amber-400">(C)</span>}
        </p>
        <p className="text-[10px] sm:text-xs text-white/40">{player.position || "Player"}</p>
      </div>

      {/* Stats badges */}
      <div className="flex items-center gap-1">
        {player.goals > 0 && (
          <span className="px-1 sm:px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] sm:text-xs font-bold text-emerald-400">
            ⚽ {player.goals}
          </span>
        )}
        {player.assists > 0 && (
          <span className="px-1 sm:px-1.5 py-0.5 rounded bg-cyan-500/20 text-[10px] sm:text-xs font-bold text-cyan-400">
            🎯 {player.assists}
          </span>
        )}
        {player.yellowCards > 0 && (
          <div className="h-3.5 w-2.5 sm:h-4 sm:w-3 bg-yellow-400 rounded-sm" />
        )}
        {player.redCards > 0 && (
          <div className="h-3.5 w-2.5 sm:h-4 sm:w-3 bg-red-500 rounded-sm" />
        )}
        {player.substituted && (
          <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-400" />
        )}
      </div>

      {/* Follow Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFollowToggle(player, team);
        }}
        className={`p-1.5 sm:p-2 rounded-lg transition-all ${
          isFollowed
            ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
            : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
        }`}
        title={isFollowed ? "Unfollow player" : "Follow player"}
      >
        <Heart className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isFollowed ? "fill-current" : ""}`} />
      </button>
    </Link>
  );
}

// ============================================================================
// STATS TAB
// ============================================================================

interface StatsTabProps {
  statistics: { home: Record<string, any>; away: Record<string, any> } | null;
  homeTeam: Team;
  awayTeam: Team;
}

function StatsTab({ statistics, homeTeam, awayTeam }: StatsTabProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!statistics || (Object.keys(statistics.home).length === 0 && Object.keys(statistics.away).length === 0)) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <Target className="h-8 w-8 mx-auto mb-3 text-white/30" />
        <p className="text-white/50">Statistics not yet available</p>
        <p className="text-xs text-white/30 mt-1">Stats will be updated during the match</p>
      </div>
    );
  }

  // Helper to get stat value with fallbacks
  const getStat = (team: Record<string, any>, key: string) => {
    const variations = [
      key,
      key.replace(/_/g, ""),
      key.replace(/_/g, " "),
      key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    ];
    
    for (const k of variations) {
      if (team[k] !== undefined) return team[k];
    }
    return "-";
  };

  // Define stat categories with icons and colors
  const attackingStats: Array<{ key: string; label: string; icon: React.ReactElement; color: string; suffix?: string }> = [
    { key: "shots_total", label: "Total Shots", icon: <Target className="h-3.5 w-3.5" />, color: "emerald" },
    { key: "shots_on_target", label: "Shots on Target", icon: <Zap className="h-3.5 w-3.5" />, color: "amber" },
    { key: "shots_off_target", label: "Off Target", icon: <Circle className="h-3.5 w-3.5" />, color: "slate" },
  ];

  const possessionStats: Array<{ key: string; label: string; icon: React.ReactElement; color: string; suffix?: string }> = [
    { key: "ball_possession", label: "Possession", suffix: "%", icon: <Activity className="h-3.5 w-3.5" />, color: "cyan" },
    { key: "passes_total", label: "Total Passes", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, color: "blue" },
    { key: "pass_accuracy", label: "Pass Accuracy", suffix: "%", icon: <Target className="h-3.5 w-3.5" />, color: "green" },
  ];

  const defendingStats: Array<{ key: string; label: string; icon: React.ReactElement; color: string; suffix?: string }> = [
    { key: "tackles", label: "Tackles", icon: <Shield className="h-3.5 w-3.5" />, color: "purple" },
    { key: "interceptions", label: "Interceptions", icon: <Zap className="h-3.5 w-3.5" />, color: "indigo" },
    { key: "clearances", label: "Clearances", icon: <AlertCircle className="h-3.5 w-3.5" />, color: "slate" },
  ];

  const disciplineStats: Array<{ key: string; label: string; icon: React.ReactElement; color: string; suffix?: string }> = [
    { key: "fouls", label: "Fouls", icon: <AlertCircle className="h-3.5 w-3.5" />, color: "orange" },
    { key: "yellow_cards", label: "Yellow Cards", icon: <Circle className="h-3.5 w-3.5" />, color: "yellow" },
    { key: "red_cards", label: "Red Cards", icon: <Circle className="h-3.5 w-3.5" />, color: "red" },
    { key: "offsides", label: "Offsides", icon: <Circle className="h-3.5 w-3.5" />, color: "slate" },
  ];

  const setPlayStats: Array<{ key: string; label: string; icon: React.ReactElement; color: string; suffix?: string }> = [
    { key: "corner_kicks", label: "Corners", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, color: "teal" },
  ];

  // Calculate match leaders
  const getMatchLeaders = () => {
    const leaders = [];
    
    const homeShots = parseInt(String(getStat(statistics.home, "shots_total"))) || 0;
    const awayShots = parseInt(String(getStat(statistics.away, "shots_total"))) || 0;
    if (homeShots > awayShots) {
      leaders.push({ stat: "Most Shots", team: homeTeam.name, value: homeShots, color: "emerald" });
    } else if (awayShots > homeShots) {
      leaders.push({ stat: "Most Shots", team: awayTeam.name, value: awayShots, color: "cyan" });
    }

    const homePoss = parseInt(String(getStat(statistics.home, "ball_possession"))) || 0;
    const awayPoss = parseInt(String(getStat(statistics.away, "ball_possession"))) || 0;
    if (homePoss > awayPoss) {
      leaders.push({ stat: "Possession", team: homeTeam.name, value: `${homePoss}%`, color: "emerald" });
    } else if (awayPoss > homePoss) {
      leaders.push({ stat: "Possession", team: awayTeam.name, value: `${awayPoss}%`, color: "cyan" });
    }

    const homeAccuracy = parseInt(String(getStat(statistics.home, "pass_accuracy"))) || 0;
    const awayAccuracy = parseInt(String(getStat(statistics.away, "pass_accuracy"))) || 0;
    if (homeAccuracy > awayAccuracy && homeAccuracy > 0) {
      leaders.push({ stat: "Pass Accuracy", team: homeTeam.name, value: `${homeAccuracy}%`, color: "emerald" });
    } else if (awayAccuracy > homeAccuracy && awayAccuracy > 0) {
      leaders.push({ stat: "Pass Accuracy", team: awayTeam.name, value: `${awayAccuracy}%`, color: "cyan" });
    }

    return leaders;
  };

  const matchLeaders = getMatchLeaders();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Match Leaders */}
      {matchLeaders.length > 0 && (
        <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
          <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            Match Leaders
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {matchLeaders.map((leader, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-black/20 border border-white/10">
                <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">{leader.stat}</p>
                <p className={`text-sm sm:text-base font-bold text-${leader.color}-400 truncate`}>
                  {leader.team}
                </p>
                <p className="text-lg sm:text-xl font-black text-white mt-0.5">{leader.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attacking Stats */}
      <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
        <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-emerald-400" />
          Attacking
        </h3>
        <div className="space-y-3">
          {attackingStats.map((stat) => {
            const home = getStat(statistics.home, stat.key);
            const away = getStat(statistics.away, stat.key);
            if (home === "-" && away === "-") return null;
            return (
              <StatBar
                key={stat.key}
                label={stat.label}
                home={home}
                away={away}
                suffix={stat.suffix}
              />
            );
          })}
        </div>
      </div>

      {/* Possession Stats */}
      <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
        <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-cyan-400" />
          Possession
        </h3>
        <div className="space-y-3">
          {possessionStats.map((stat) => {
            const home = getStat(statistics.home, stat.key);
            const away = getStat(statistics.away, stat.key);
            if (home === "-" && away === "-") return null;
            return (
              <StatBar
                key={stat.key}
                label={stat.label}
                home={home}
                away={away}
                suffix={stat.suffix}
              />
            );
          })}
        </div>
      </div>

      {/* Set Plays */}
      <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
        <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
          <ArrowRightLeft className="h-3.5 w-3.5 text-teal-400" />
          Set Pieces
        </h3>
        <div className="space-y-3">
          {setPlayStats.map((stat) => {
            const home = getStat(statistics.home, stat.key);
            const away = getStat(statistics.away, stat.key);
            if (home === "-" && away === "-") return null;
            return (
              <StatBar
                key={stat.key}
                label={stat.label}
                home={home}
                away={away}
                suffix={stat.suffix}
              />
            );
          })}
        </div>
      </div>

      {/* Advanced Stats Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
      >
        <BarChart3 className="h-4 w-4" />
        {showAdvanced ? "Hide Advanced Stats" : "Show Advanced Stats"}
        <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`} />
      </button>

      {/* Advanced Stats - Defending & Discipline */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Defending */}
            <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-purple-400" />
                Defending
              </h3>
              <div className="space-y-3">
                {defendingStats.map((stat) => {
                  const home = getStat(statistics.home, stat.key);
                  const away = getStat(statistics.away, stat.key);
                  if (home === "-" && away === "-") return null;
                  return (
                    <StatBar
                      key={stat.key}
                      label={stat.label}
                      home={home}
                      away={away}
                      suffix={stat.suffix}
                    />
                  );
                })}
              </div>
            </div>

            {/* Discipline */}
            <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-orange-400" />
                Discipline
              </h3>
              <div className="space-y-3">
                {disciplineStats.map((stat) => {
                  const home = getStat(statistics.home, stat.key);
                  const away = getStat(statistics.away, stat.key);
                  if (home === "-" && away === "-") return null;
                  return (
                    <StatBar
                      key={stat.key}
                      label={stat.label}
                      home={home}
                      away={away}
                      suffix={stat.suffix}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// H2H TAB
// ============================================================================

interface H2HTabProps {
  h2hData: H2HData | null;
  loading: boolean;
  homeTeam: Team;
  awayTeam: Team;
}

// Home/Away split stats for H2H
interface VenueSplit {
  asHome: { wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
  asAway: { wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
}

function H2HTab({ h2hData, loading, homeTeam, awayTeam }: H2HTabProps) {
  const [showAllMeetings, setShowAllMeetings] = useState(false);
  
  if (loading) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <RefreshCw className="h-8 w-8 mx-auto mb-3 text-white/30 animate-spin" />
        <p className="text-white/50">Loading head-to-head history...</p>
      </div>
    );
  }

  if (!h2hData || h2hData.meetings.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <History className="h-8 w-8 mx-auto mb-3 text-white/30" />
        <p className="text-white/50">No previous meetings found</p>
        <p className="text-xs text-white/30 mt-1">These teams haven't played each other recently</p>
      </div>
    );
  }

  const { totals, meetings } = h2hData;
  const totalGames = totals.team1Wins + totals.team2Wins + totals.draws;
  const totalGoals = totals.team1Goals + totals.team2Goals;
  const avgGoalsPerMatch = totalGames > 0 ? totalGoals / totalGames : 0;

  // Calculate home/away splits for each team
  const calculateVenueSplits = (): { home: VenueSplit; away: VenueSplit } => {
    const homeSplit: VenueSplit = {
      asHome: { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 },
      asAway: { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
    };
    const awaySplit: VenueSplit = {
      asHome: { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 },
      asAway: { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
    };

    meetings.forEach(m => {
      const homeGoals = m.homeScore ?? 0;
      const awayGoals = m.awayScore ?? 0;
      
      // Current home team stats
      if (m.homeTeam.id === homeTeam.id) {
        // Home team was at home in this match
        homeSplit.asHome.goalsFor += homeGoals;
        homeSplit.asHome.goalsAgainst += awayGoals;
        if (m.winner === 'home') homeSplit.asHome.wins++;
        else if (m.winner === 'away') homeSplit.asHome.losses++;
        else homeSplit.asHome.draws++;
      } else if (m.awayTeam.id === homeTeam.id) {
        // Home team was away in this match
        homeSplit.asAway.goalsFor += awayGoals;
        homeSplit.asAway.goalsAgainst += homeGoals;
        if (m.winner === 'away') homeSplit.asAway.wins++;
        else if (m.winner === 'home') homeSplit.asAway.losses++;
        else homeSplit.asAway.draws++;
      }
      
      // Current away team stats
      if (m.homeTeam.id === awayTeam.id) {
        // Away team was at home in this match
        awaySplit.asHome.goalsFor += homeGoals;
        awaySplit.asHome.goalsAgainst += awayGoals;
        if (m.winner === 'home') awaySplit.asHome.wins++;
        else if (m.winner === 'away') awaySplit.asHome.losses++;
        else awaySplit.asHome.draws++;
      } else if (m.awayTeam.id === awayTeam.id) {
        // Away team was away in this match
        awaySplit.asAway.goalsFor += awayGoals;
        awaySplit.asAway.goalsAgainst += homeGoals;
        if (m.winner === 'away') awaySplit.asAway.wins++;
        else if (m.winner === 'home') awaySplit.asAway.losses++;
        else awaySplit.asAway.draws++;
      }
    });

    return { home: homeSplit, away: awaySplit };
  };

  const venueSplits = calculateVenueSplits();

  // Generate trend tags with enhanced analysis
  const getTrendTags = (): { text: string; type: 'positive' | 'negative' | 'neutral' | 'insight' }[] => {
    const tags: { text: string; type: 'positive' | 'negative' | 'neutral' | 'insight' }[] = [];
    
    // Dominance trends
    if (totals.team1Wins > totals.team2Wins + totals.draws) {
      tags.push({ text: `${homeTeam.name} dominant`, type: 'positive' });
    } else if (totals.team2Wins > totals.team1Wins + totals.draws) {
      tags.push({ text: `${awayTeam.name} dominant`, type: 'negative' });
    } else if (totals.draws >= Math.max(totals.team1Wins, totals.team2Wins)) {
      tags.push({ text: "Draw-heavy fixture", type: 'neutral' });
    }
    
    // Goal scoring trends
    if (avgGoalsPerMatch >= 3.0) {
      tags.push({ text: `High-scoring (${avgGoalsPerMatch.toFixed(1)} avg)`, type: 'insight' });
    } else if (avgGoalsPerMatch <= 1.5 && totalGames >= 3) {
      tags.push({ text: `Low-scoring (${avgGoalsPerMatch.toFixed(1)} avg)`, type: 'insight' });
    }
    
    // BTTS trend
    const bttsCount = meetings.filter(m => (m.homeScore ?? 0) > 0 && (m.awayScore ?? 0) > 0).length;
    const bttsRate = totalGames > 0 ? bttsCount / totalGames : 0;
    if (bttsRate >= 0.7 && totalGames >= 3) {
      tags.push({ text: `BTTS hits ${Math.round(bttsRate * 100)}%`, type: 'insight' });
    }
    
    // Home venue advantage
    const homeHomeWins = venueSplits.home.asHome.wins;
    const homeHomePlayed = venueSplits.home.asHome.wins + venueSplits.home.asHome.draws + venueSplits.home.asHome.losses;
    if (homeHomePlayed >= 2 && homeHomeWins >= homeHomePlayed * 0.6) {
      tags.push({ text: `${homeTeam.name} strong at home`, type: 'positive' });
    }
    
    // Away team performs away
    const awayAwayWins = venueSplits.away.asAway.wins;
    const awayAwayPlayed = venueSplits.away.asAway.wins + venueSplits.away.asAway.draws + venueSplits.away.asAway.losses;
    if (awayAwayPlayed >= 2 && awayAwayWins >= awayAwayPlayed * 0.5) {
      tags.push({ text: `${awayTeam.name} travels well`, type: 'negative' });
    }
    
    // Unbeaten streak
    const lastFive = meetings.slice(0, 5);
    const homeUnbeaten = lastFive.every(m => {
      const isHomeTeamHome = m.homeTeam.id === homeTeam.id;
      if (isHomeTeamHome) return m.winner === 'home' || m.winner === 'draw';
      return m.winner === 'away' || m.winner === 'draw';
    });
    if (homeUnbeaten && lastFive.length >= 3) {
      tags.push({ text: `${homeTeam.name} unbeaten (${lastFive.length})`, type: 'positive' });
    }
    
    // Recent form - last 3 matches momentum
    const last3 = meetings.slice(0, 3);
    if (last3.length === 3) {
      const homeWinsLast3 = last3.filter(m => {
        const isHome = m.homeTeam.id === homeTeam.id;
        return (isHome && m.winner === 'home') || (!isHome && m.winner === 'away');
      }).length;
      if (homeWinsLast3 === 3) {
        tags.push({ text: "3-match win streak", type: 'positive' });
      }
    }

    return tags;
  };

  const trendTags = getTrendTags();

  // Render split stat card
  const SplitStatCard = ({ label, split, teamColor }: { 
    label: string; 
    split: VenueSplit['asHome']; 
    teamColor: 'emerald' | 'cyan';
  }) => {
    const played = split.wins + split.draws + split.losses;
    if (played === 0) return null;
    
    const winRate = played > 0 ? (split.wins / played) * 100 : 0;
    const gd = split.goalsFor - split.goalsAgainst;
    
    return (
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-medium ${teamColor === 'emerald' ? 'text-emerald-400' : 'text-cyan-400'}`}>
            {label}
          </span>
          <span className="text-[10px] text-white/40">{played} matches</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-emerald-400 font-bold">{split.wins}W</span>
            <span className="text-white/40">-</span>
            <span className="text-white/50">{split.draws}D</span>
            <span className="text-white/40">-</span>
            <span className="text-red-400">{split.losses}L</span>
          </div>
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div 
              className={`h-full ${teamColor === 'emerald' ? 'bg-emerald-500' : 'bg-cyan-500'}`}
              style={{ width: `${winRate}%` }}
            />
          </div>
          <span className={`text-xs font-mono ${gd > 0 ? 'text-emerald-400' : gd < 0 ? 'text-red-400' : 'text-white/50'}`}>
            {gd > 0 ? '+' : ''}{gd}
          </span>
        </div>
      </div>
    );
  };

  const displayedMeetings = showAllMeetings ? meetings : meetings.slice(0, 5);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary Card */}
      <div className="p-4 sm:p-6 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10">
        <h3 className="text-xs sm:text-sm font-medium text-white/60 mb-3 sm:mb-4 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          Head-to-Head Record
        </h3>
        
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          {/* Home Team Wins */}
          <div className="text-center p-3 sm:p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-2xl sm:text-3xl font-black text-emerald-400">{totals.team1Wins}</p>
            <p className="text-[10px] sm:text-xs text-white/50 mt-1 truncate">{homeTeam.name}</p>
          </div>
          
          {/* Draws */}
          <div className="text-center p-3 sm:p-4 rounded-lg bg-white/5 border border-white/10">
            <p className="text-2xl sm:text-3xl font-black text-white/60">{totals.draws}</p>
            <p className="text-[10px] sm:text-xs text-white/50 mt-1">Draws</p>
          </div>
          
          {/* Away Team Wins */}
          <div className="text-center p-3 sm:p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <p className="text-2xl sm:text-3xl font-black text-cyan-400">{totals.team2Wins}</p>
            <p className="text-[10px] sm:text-xs text-white/50 mt-1 truncate">{awayTeam.name}</p>
          </div>
        </div>

        {/* Win Percentage Bar */}
        {totalGames > 0 && (
          <div className="space-y-2">
            <div className="h-2 sm:h-3 rounded-full bg-white/10 overflow-hidden flex">
              <div 
                className="bg-emerald-500 transition-all duration-500"
                style={{ width: `${(totals.team1Wins / totalGames) * 100}%` }}
              />
              <div 
                className="bg-white/30 transition-all duration-500"
                style={{ width: `${(totals.draws / totalGames) * 100}%` }}
              />
              <div 
                className="bg-cyan-500 transition-all duration-500"
                style={{ width: `${(totals.team2Wins / totalGames) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] sm:text-xs text-white/40">
              <span>{totalGames} matches</span>
              <span>Goals: {totals.team1Goals} - {totals.team2Goals}</span>
            </div>
          </div>
        )}
      </div>

      {/* Home/Away Split */}
      <div className="p-4 sm:p-6 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-xs sm:text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4" />
          Venue Split in H2H
        </h3>
        
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Home Team Splits */}
          <div className="space-y-2">
            <p className="text-xs text-emerald-400/80 font-medium mb-2">{homeTeam.name}</p>
            <SplitStatCard 
              label="At Home" 
              split={venueSplits.home.asHome} 
              teamColor="emerald"
            />
            <SplitStatCard 
              label="Away" 
              split={venueSplits.home.asAway} 
              teamColor="emerald"
            />
          </div>
          
          {/* Away Team Splits */}
          <div className="space-y-2">
            <p className="text-xs text-cyan-400/80 font-medium mb-2">{awayTeam.name}</p>
            <SplitStatCard 
              label="At Home" 
              split={venueSplits.away.asHome} 
              teamColor="cyan"
            />
            <SplitStatCard 
              label="Away" 
              split={venueSplits.away.asAway} 
              teamColor="cyan"
            />
          </div>
        </div>
      </div>

      {/* Trend Tags */}
      {trendTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trendTags.map((tag, idx) => {
            const colorMap = {
              positive: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
              negative: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
              neutral: 'bg-white/10 border-white/20 text-white/60',
              insight: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
            };
            const iconMap = {
              positive: <TrendingUp className="h-3 w-3" />,
              negative: <TrendingDown className="h-3 w-3" />,
              neutral: <Activity className="h-3 w-3" />,
              insight: <Zap className="h-3 w-3" />,
            };
            return (
              <span 
                key={idx} 
                className={`px-3 py-1.5 rounded-full border text-xs font-medium flex items-center gap-1.5 ${colorMap[tag.type]}`}
              >
                {iconMap[tag.type]}
                {tag.text}
              </span>
            );
          })}
        </div>
      )}

      {/* Recent Meetings */}
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-medium text-white/60 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {showAllMeetings ? 'All Meetings' : 'Last 5 Meetings'}
          </h3>
          {meetings.length > 5 && (
            <button
              onClick={() => setShowAllMeetings(!showAllMeetings)}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              {showAllMeetings ? 'Show Less' : `View All (${meetings.length})`}
              <ChevronRight className={`h-3 w-3 transition-transform ${showAllMeetings ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
        
        <AnimatePresence mode="popLayout">
          {displayedMeetings.map((meeting, idx) => {
            const isHomeTeamWin = (meeting.winner === 'home' && meeting.homeTeam.id === homeTeam.id) ||
                                  (meeting.winner === 'away' && meeting.awayTeam.id === homeTeam.id);
            const isDraw = meeting.winner === 'draw';
            
            // Determine which team was home/away in this meeting
            const currentHomeWasHome = meeting.homeTeam.id === homeTeam.id;
            
            return (
              <motion.div
                key={meeting.eventId || idx}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: Math.min(idx * 0.03, 0.15) }}
                className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] sm:text-xs text-white/40">
                      {meeting.date ? new Date(meeting.date).toLocaleDateString([], { 
                        year: 'numeric', month: 'short', day: 'numeric' 
                      }) : 'Unknown date'}
                    </span>
                    {/* Venue indicator */}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      currentHomeWasHome 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {currentHomeWasHome ? `${homeTeam.name} at home` : `${awayTeam.name} at home`}
                    </span>
                  </div>
                  <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-white/10 text-white/50 truncate max-w-[100px] sm:max-w-[120px]">
                    {meeting.competition}
                  </span>
                </div>
                
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  <div className={`flex-1 text-right text-xs sm:text-sm truncate ${
                    meeting.winner === 'home' ? 'text-white font-bold' : 'text-white/60'
                  }`}>
                    {meeting.homeTeam.name}
                  </div>
                  
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg shrink-0" style={{
                    background: isDraw ? 'rgba(255,255,255,0.1)' 
                      : isHomeTeamWin ? 'rgba(16,185,129,0.15)' 
                      : 'rgba(6,182,212,0.15)'
                  }}>
                    <span className={`text-base sm:text-lg font-black ${meeting.winner === 'home' ? 'text-white' : 'text-white/60'}`}>
                      {meeting.homeScore ?? '-'}
                    </span>
                    <span className="text-white/30">-</span>
                    <span className={`text-base sm:text-lg font-black ${meeting.winner === 'away' ? 'text-white' : 'text-white/60'}`}>
                      {meeting.awayScore ?? '-'}
                    </span>
                  </div>
                  
                  <div className={`flex-1 text-left text-xs sm:text-sm truncate ${
                    meeting.winner === 'away' ? 'text-white font-bold' : 'text-white/60'
                  }`}>
                    {meeting.awayTeam.name}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// MATCHUPS TAB - All betting lives here
// ============================================================================

interface MatchupsTabProps {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
}

interface MarketOdd {
  label: string;
  odds: number;
  probability: number;
  trend?: 'up' | 'down' | 'stable';
  movement?: number; // cents moved
}

interface MarketGroup {
  name: string;
  icon: React.ReactNode;
  description: string;
  markets: MarketOdd[];
}

interface MarketSignal {
  type: 'sharp' | 'steam' | 'reverse' | 'public';
  label: string;
  value: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 1-5
}

interface PropMarket {
  playerName: string;
  team: 'home' | 'away';
  propType: string;
  line: number;
  overOdds: number;
  underOdds: number;
}

// Generate deterministic values based on team names
function getMatchSeed(homeTeam: string, awayTeam: string) {
  const seed = (homeTeam + awayTeam).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };
}

// Generate market signals
function generateMarketSignals(homeTeam: string, awayTeam: string): MarketSignal[] {
  const rand = getMatchSeed(homeTeam, awayTeam);
  
  const signals: MarketSignal[] = [];
  
  // Sharp money signal
  const sharpPct = (rand(100) * 5 - 2.5).toFixed(1);
  const sharpTeam = rand(101) > 0.5 ? homeTeam : awayTeam;
  signals.push({
    type: 'sharp',
    label: 'Sharp Money',
    value: `${+sharpPct > 0 ? '+' : ''}${sharpPct}% ${sharpTeam}`,
    direction: +sharpPct > 1 ? 'bullish' : +sharpPct < -1 ? 'bearish' : 'neutral',
    confidence: Math.min(5, Math.ceil(Math.abs(+sharpPct)))
  });
  
  // Steam move
  if (rand(102) > 0.6) {
    const steamOdds = (rand(103) * 0.15 + 0.05).toFixed(2);
    signals.push({
      type: 'steam',
      label: 'Steam Move',
      value: `Over 2.5 dropped ${steamOdds}`,
      direction: 'bullish',
      confidence: 4
    });
  }
  
  // Reverse line movement
  if (rand(104) > 0.7) {
    const rlmTeam = rand(105) > 0.5 ? homeTeam : awayTeam;
    signals.push({
      type: 'reverse',
      label: 'Reverse Line',
      value: `${rlmTeam} getting 72% but line moved toward them`,
      direction: 'bearish',
      confidence: 3
    });
  }
  
  // Public percentage
  const publicPct = Math.round(50 + (rand(106) - 0.5) * 40);
  const publicSide = rand(107) > 0.5 ? 'Over 2.5' : `${homeTeam}`;
  signals.push({
    type: 'public',
    label: 'Public %',
    value: `${publicPct}% on ${publicSide}`,
    direction: publicPct > 65 ? 'bearish' : 'neutral',
    confidence: 2
  });
  
  return signals;
}

// Generate match odds
function generateMatchOdds(homeTeam: string, awayTeam: string): MarketGroup[] {
  const rand = getMatchSeed(homeTeam, awayTeam);
  const calcProb = (odds: number) => Math.round((1 / odds) * 100);

  const homeWinBase = 1.5 + rand(1) * 2.5;
  const drawBase = 2.8 + rand(2) * 1.5;
  const awayWinBase = 2.0 + rand(3) * 3.0;

  return [
    {
      name: "Match Result (1X2)",
      icon: <Trophy className="h-4 w-4 text-amber-400" />,
      description: "Full-time result",
      markets: [
        { label: homeTeam, odds: +homeWinBase.toFixed(2), probability: calcProb(homeWinBase), trend: rand(10) > 0.6 ? 'up' : rand(10) > 0.3 ? 'down' : 'stable', movement: rand(50) > 0.7 ? Math.round((rand(51) - 0.5) * 20) : undefined },
        { label: "Draw", odds: +drawBase.toFixed(2), probability: calcProb(drawBase), trend: 'stable' },
        { label: awayTeam, odds: +awayWinBase.toFixed(2), probability: calcProb(awayWinBase), trend: rand(11) > 0.5 ? 'down' : 'stable', movement: rand(52) > 0.7 ? Math.round((rand(53) - 0.5) * 20) : undefined },
      ]
    },
    {
      name: "Over/Under Goals",
      icon: <Target className="h-4 w-4 text-cyan-400" />,
      description: "Total goals in match",
      markets: [
        { label: "Over 1.5", odds: +(1.25 + rand(30) * 0.3).toFixed(2), probability: calcProb(1.25 + rand(30) * 0.3), trend: 'stable' },
        { label: "Under 1.5", odds: +(3.2 + rand(31) * 0.8).toFixed(2), probability: calcProb(3.2 + rand(31) * 0.8), trend: 'stable' },
        { label: "Over 2.5", odds: +(1.7 + rand(4) * 0.6).toFixed(2), probability: calcProb(1.7 + rand(4) * 0.6), trend: rand(12) > 0.5 ? 'up' : 'stable', movement: rand(54) > 0.6 ? Math.round(rand(55) * 15) : undefined },
        { label: "Under 2.5", odds: +(1.9 + rand(5) * 0.5).toFixed(2), probability: calcProb(1.9 + rand(5) * 0.5), trend: 'stable' },
        { label: "Over 3.5", odds: +(2.5 + rand(32) * 1.0).toFixed(2), probability: calcProb(2.5 + rand(32) * 1.0), trend: 'stable' },
        { label: "Under 3.5", odds: +(1.35 + rand(33) * 0.25).toFixed(2), probability: calcProb(1.35 + rand(33) * 0.25), trend: 'stable' },
      ]
    },
    {
      name: "Both Teams to Score",
      icon: <Zap className="h-4 w-4 text-emerald-400" />,
      description: "BTTS market",
      markets: [
        { label: "Yes", odds: +(1.6 + rand(8) * 0.5).toFixed(2), probability: calcProb(1.6 + rand(8) * 0.5), trend: rand(14) > 0.5 ? 'up' : 'stable' },
        { label: "No", odds: +(2.0 + rand(9) * 0.6).toFixed(2), probability: calcProb(2.0 + rand(9) * 0.6), trend: 'stable' },
      ]
    },
    {
      name: "Double Chance",
      icon: <Shield className="h-4 w-4 text-purple-400" />,
      description: "Two outcomes covered",
      markets: [
        { label: `${homeTeam} or Draw`, odds: +(1.2 + rand(20) * 0.4).toFixed(2), probability: calcProb(1.2 + rand(20) * 0.4), trend: 'stable' },
        { label: `${awayTeam} or Draw`, odds: +(1.3 + rand(21) * 0.5).toFixed(2), probability: calcProb(1.3 + rand(21) * 0.5), trend: 'stable' },
        { label: `${homeTeam} or ${awayTeam}`, odds: +(1.15 + rand(22) * 0.3).toFixed(2), probability: calcProb(1.15 + rand(22) * 0.3), trend: 'stable' },
      ]
    },
    {
      name: "Asian Handicap",
      icon: <ArrowRightLeft className="h-4 w-4 text-pink-400" />,
      description: "Spread betting",
      markets: [
        { label: `${homeTeam} -0.5`, odds: +(1.8 + rand(40) * 0.6).toFixed(2), probability: calcProb(1.8 + rand(40) * 0.6), trend: rand(41) > 0.6 ? 'up' : 'stable' },
        { label: `${awayTeam} +0.5`, odds: +(1.9 + rand(42) * 0.5).toFixed(2), probability: calcProb(1.9 + rand(42) * 0.5), trend: 'stable' },
        { label: `${homeTeam} -1.0`, odds: +(2.4 + rand(43) * 1.0).toFixed(2), probability: calcProb(2.4 + rand(43) * 1.0), trend: 'stable' },
        { label: `${awayTeam} +1.0`, odds: +(1.5 + rand(44) * 0.4).toFixed(2), probability: calcProb(1.5 + rand(44) * 0.4), trend: 'stable' },
        { label: `${homeTeam} -1.5`, odds: +(3.2 + rand(45) * 1.5).toFixed(2), probability: calcProb(3.2 + rand(45) * 1.5), trend: 'stable' },
        { label: `${awayTeam} +1.5`, odds: +(1.25 + rand(46) * 0.2).toFixed(2), probability: calcProb(1.25 + rand(46) * 0.2), trend: 'stable' },
      ]
    },
    {
      name: "Correct Score",
      icon: <BarChart3 className="h-4 w-4 text-orange-400" />,
      description: "Exact final score",
      markets: [
        { label: "1-0", odds: +(5 + rand(60) * 3).toFixed(2), probability: calcProb(5 + rand(60) * 3), trend: 'stable' },
        { label: "2-0", odds: +(7 + rand(61) * 4).toFixed(2), probability: calcProb(7 + rand(61) * 4), trend: 'stable' },
        { label: "2-1", odds: +(6 + rand(62) * 3).toFixed(2), probability: calcProb(6 + rand(62) * 3), trend: 'stable' },
        { label: "1-1", odds: +(5 + rand(63) * 2).toFixed(2), probability: calcProb(5 + rand(63) * 2), trend: 'stable' },
        { label: "0-0", odds: +(8 + rand(64) * 4).toFixed(2), probability: calcProb(8 + rand(64) * 4), trend: 'stable' },
        { label: "0-1", odds: +(6 + rand(65) * 4).toFixed(2), probability: calcProb(6 + rand(65) * 4), trend: 'stable' },
        { label: "0-2", odds: +(9 + rand(66) * 5).toFixed(2), probability: calcProb(9 + rand(66) * 5), trend: 'stable' },
        { label: "1-2", odds: +(8 + rand(67) * 4).toFixed(2), probability: calcProb(8 + rand(67) * 4), trend: 'stable' },
        { label: "2-2", odds: +(10 + rand(68) * 5).toFixed(2), probability: calcProb(10 + rand(68) * 5), trend: 'stable' },
      ]
    },
  ];
}

// Generate player props
function generatePlayerProps(homeTeam: string, awayTeam: string): PropMarket[] {
  const rand = getMatchSeed(homeTeam, awayTeam);
  
  // Generate fictional star players
  const homePlayers = ['Silva', 'Rodriguez', 'Martinez'];
  const awayPlayers = ['Johnson', 'Williams', 'Brown'];
  
  const props: PropMarket[] = [];
  
  homePlayers.forEach((player, i) => {
    if (rand(200 + i) > 0.4) {
      props.push({
        playerName: player,
        team: 'home',
        propType: 'Shots on Target',
        line: Math.round(1 + rand(210 + i) * 2) + 0.5,
        overOdds: +(1.7 + rand(220 + i) * 0.5).toFixed(2),
        underOdds: +(1.9 + rand(230 + i) * 0.4).toFixed(2),
      });
    }
    if (rand(240 + i) > 0.6) {
      props.push({
        playerName: player,
        team: 'home',
        propType: 'Anytime Goalscorer',
        line: 0.5,
        overOdds: +(2.5 + rand(250 + i) * 2).toFixed(2),
        underOdds: +(1.3 + rand(260 + i) * 0.3).toFixed(2),
      });
    }
  });
  
  awayPlayers.forEach((player, i) => {
    if (rand(300 + i) > 0.4) {
      props.push({
        playerName: player,
        team: 'away',
        propType: 'Shots on Target',
        line: Math.round(1 + rand(310 + i) * 2) + 0.5,
        overOdds: +(1.7 + rand(320 + i) * 0.5).toFixed(2),
        underOdds: +(1.9 + rand(330 + i) * 0.4).toFixed(2),
      });
    }
    if (rand(340 + i) > 0.6) {
      props.push({
        playerName: player,
        team: 'away',
        propType: 'Anytime Goalscorer',
        line: 0.5,
        overOdds: +(2.5 + rand(350 + i) * 2).toFixed(2),
        underOdds: +(1.3 + rand(360 + i) * 0.3).toFixed(2),
      });
    }
  });
  
  return props;
}

function MatchupsTab({ match, homeTeam, awayTeam }: MatchupsTabProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(["Market Signals", "Probabilities"]);
  const isMatchFinished = match.status === "closed" || match.status === "complete";
  const isMatchLive = match.status === "live" || match.status === "inprogress";
  
  const marketSignals = generateMarketSignals(homeTeam.name, awayTeam.name);
  const marketGroups = generateMatchOdds(homeTeam.name, awayTeam.name);
  const playerProps = generatePlayerProps(homeTeam.name, awayTeam.name);
  
  // Calculate win probabilities from 1X2 odds
  const match1X2 = marketGroups.find(g => g.name === "Match Result (1X2)");
  const probabilities = match1X2 ? {
    home: match1X2.markets[0].probability,
    draw: match1X2.markets[1].probability,
    away: match1X2.markets[2].probability,
  } : { home: 33, draw: 34, away: 33 };
  // Normalize to 100%
  const totalProb = probabilities.home + probabilities.draw + probabilities.away;
  const normalizedProbs = {
    home: Math.round((probabilities.home / totalProb) * 100),
    draw: Math.round((probabilities.draw / totalProb) * 100),
    away: Math.round((probabilities.away / totalProb) * 100),
  };

  const toggleSection = (name: string) => {
    setExpandedSections(prev => 
      prev.includes(name) 
        ? prev.filter(s => s !== name)
        : [...prev, name]
    );
  };

  // For finished matches, show different UI
  if (isMatchFinished) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <Lock className="h-8 w-8 mx-auto mb-3 text-white/30" />
        <p className="text-white/50">Markets closed</p>
        <p className="text-xs text-white/30 mt-1">This match has finished</p>
        {match.homeScore !== null && match.awayScore !== null && (
          <div className="mt-4 inline-block px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-emerald-400 font-bold">
              Final: {homeTeam.name} {match.homeScore} - {match.awayScore} {awayTeam.name}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Live Indicator */}
      {isMatchLive && (
        <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <p className="text-emerald-400 text-xs sm:text-sm font-medium">Live in-play markets • Odds updating</p>
        </div>
      )}

      {/* SECTION 1: Market Signals */}
      <CollapsibleSection
        title="Market Signals"
        icon={<Activity className="h-4 w-4 text-amber-400" />}
        badge={marketSignals.length.toString()}
        badgeColor="amber"
        expanded={expandedSections.includes("Market Signals")}
        onToggle={() => toggleSection("Market Signals")}
      >
        <div className="space-y-2">
          {marketSignals.map((signal, idx) => (
            <SignalCard key={idx} signal={signal} />
          ))}
        </div>
      </CollapsibleSection>

      {/* SECTION 2: Probabilities */}
      <CollapsibleSection
        title="Win Probabilities"
        icon={<BarChart3 className="h-4 w-4 text-cyan-400" />}
        expanded={expandedSections.includes("Probabilities")}
        onToggle={() => toggleSection("Probabilities")}
      >
        <div className="space-y-4">
          {/* Visual probability bar */}
          <div className="h-8 rounded-full overflow-hidden flex">
            <div 
              className="bg-gradient-to-r from-emerald-500 to-emerald-400 flex items-center justify-center text-xs font-bold text-white"
              style={{ width: `${normalizedProbs.home}%` }}
            >
              {normalizedProbs.home}%
            </div>
            <div 
              className="bg-gradient-to-r from-white/20 to-white/30 flex items-center justify-center text-xs font-bold text-white"
              style={{ width: `${normalizedProbs.draw}%` }}
            >
              {normalizedProbs.draw}%
            </div>
            <div 
              className="bg-gradient-to-r from-cyan-400 to-cyan-500 flex items-center justify-center text-xs font-bold text-white"
              style={{ width: `${normalizedProbs.away}%` }}
            >
              {normalizedProbs.away}%
            </div>
          </div>
          
          {/* Labels */}
          <div className="flex justify-between text-xs">
            <div className="text-center">
              <p className="text-emerald-400 font-bold">{homeTeam.name}</p>
              <p className="text-white/40">Win</p>
            </div>
            <div className="text-center">
              <p className="text-white/60 font-bold">Draw</p>
            </div>
            <div className="text-center">
              <p className="text-cyan-400 font-bold">{awayTeam.name}</p>
              <p className="text-white/40">Win</p>
            </div>
          </div>
          
          {/* Implied odds */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
            <div className="text-center p-2 rounded-lg bg-emerald-500/10">
              <p className="text-lg font-bold text-white">{match1X2?.markets[0].odds.toFixed(2)}</p>
              <p className="text-[10px] text-white/40">implied odds</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5">
              <p className="text-lg font-bold text-white">{match1X2?.markets[1].odds.toFixed(2)}</p>
              <p className="text-[10px] text-white/40">implied odds</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-cyan-500/10">
              <p className="text-lg font-bold text-white">{match1X2?.markets[2].odds.toFixed(2)}</p>
              <p className="text-[10px] text-white/40">implied odds</p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* SECTION 3: Lines (Market Groups) */}
      <CollapsibleSection
        title="Lines"
        icon={<Layers className="h-4 w-4 text-purple-400" />}
        badge={`${marketGroups.length} markets`}
        badgeColor="purple"
        expanded={expandedSections.includes("Lines")}
        onToggle={() => toggleSection("Lines")}
      >
        <div className="space-y-4">
          {marketGroups.map((group) => (
            <div key={group.name} className="space-y-2">
              <div className="flex items-center gap-2">
                {group.icon}
                <span className="text-sm font-medium text-white">{group.name}</span>
                <span className="text-xs text-white/40">{group.description}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.markets.map((market, idx) => (
                  <OddsButton key={idx} market={market} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* SECTION 4: Player Props */}
      <CollapsibleSection
        title="Player Props"
        icon={<User className="h-4 w-4 text-pink-400" />}
        badge={playerProps.length > 0 ? playerProps.length.toString() : undefined}
        badgeColor="pink"
        expanded={expandedSections.includes("Props")}
        onToggle={() => toggleSection("Props")}
      >
        {playerProps.length > 0 ? (
          <div className="space-y-2">
            {playerProps.map((prop, idx) => (
              <PropCard key={idx} prop={prop} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/50 text-center py-4">
            Player props not yet available for this match
          </p>
        )}
      </CollapsibleSection>

      {/* Disclaimer */}
      <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
        <p className="text-[10px] sm:text-xs text-amber-400/70 text-center">
          Odds shown for reference only. Always verify with your sportsbook before placing bets.
        </p>
      </div>
    </div>
  );
}

// Collapsible section wrapper - Mobile-optimized touch targets
function CollapsibleSection({ 
  title, 
  icon, 
  badge, 
  badgeColor = "white",
  expanded, 
  onToggle, 
  children 
}: { 
  title: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: 'amber' | 'purple' | 'pink' | 'cyan' | 'white';
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const badgeColors = {
    amber: 'bg-amber-500/20 text-amber-400',
    purple: 'bg-purple-500/20 text-purple-400',
    pink: 'bg-pink-500/20 text-pink-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
    white: 'bg-white/10 text-white/60',
  };

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 min-h-[56px] hover:bg-white/5 active:bg-white/10 transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="shrink-0">{icon}</span>
          <span className="font-bold text-white text-sm sm:text-base">{title}</span>
          {badge && (
            <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${badgeColors[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>
        <ChevronRight className={`h-5 w-5 sm:h-4 sm:w-4 text-white/40 transition-transform duration-200 shrink-0 ${expanded ? 'rotate-90' : ''}`} />
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 sm:px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Market signal card
function SignalCard({ signal }: { signal: MarketSignal }) {
  const bgColors = {
    sharp: 'bg-emerald-500/10 border-emerald-500/20',
    steam: 'bg-cyan-500/10 border-cyan-500/20',
    reverse: 'bg-amber-500/10 border-amber-500/20',
    public: 'bg-purple-500/10 border-purple-500/20',
  };
  
  const iconColors = {
    sharp: 'text-emerald-400',
    steam: 'text-cyan-400',
    reverse: 'text-amber-400',
    public: 'text-purple-400',
  };
  
  const icons = {
    sharp: <TrendingUp className={`h-5 w-5 sm:h-4 sm:w-4 ${iconColors[signal.type]}`} />,
    steam: <Zap className={`h-5 w-5 sm:h-4 sm:w-4 ${iconColors[signal.type]}`} />,
    reverse: <ArrowRightLeft className={`h-5 w-5 sm:h-4 sm:w-4 ${iconColors[signal.type]}`} />,
    public: <Users className={`h-5 w-5 sm:h-4 sm:w-4 ${iconColors[signal.type]}`} />,
  };

  return (
    <div className={`p-3 sm:p-4 rounded-xl border ${bgColors[signal.type]} flex items-center gap-3`}>
      <div className="shrink-0 p-2 sm:p-0 rounded-lg sm:rounded-none bg-white/5 sm:bg-transparent">{icons[signal.type]}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] sm:text-xs font-medium ${iconColors[signal.type]}`}>{signal.label}</p>
        <p className="text-sm sm:text-base text-white truncate">{signal.value}</p>
      </div>
      <div className="flex gap-1 sm:gap-0.5 shrink-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div 
            key={i} 
            className={`w-2 h-4 sm:w-1.5 sm:h-3 rounded-sm ${i < signal.confidence ? iconColors[signal.type].replace('text-', 'bg-') : 'bg-white/10'}`}
          />
        ))}
      </div>
    </div>
  );
}

// Odds button with movement indicator
function OddsButton({ market }: { market: MarketOdd }) {
  const getTrendIcon = () => {
    if (market.trend === 'up') return <TrendingUp className="h-3 w-3 text-emerald-400" />;
    if (market.trend === 'down') return <TrendingDown className="h-3 w-3 text-red-400" />;
    return null;
  };

  return (
    <button className="group relative min-h-[64px] p-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 hover:border-emerald-500/30 transition-all text-left touch-manipulation active:scale-[0.98]">
      {market.trend && market.trend !== 'stable' && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {getTrendIcon()}
          {market.movement !== undefined && (
            <span className={`text-[10px] font-medium ${market.movement > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {market.movement > 0 ? '+' : ''}{market.movement}¢
            </span>
          )}
        </div>
      )}
      
      <p className="text-[10px] sm:text-xs text-white/60 mb-1 truncate pr-10">{market.label}</p>
      <p className="text-lg sm:text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
        {market.odds.toFixed(2)}
      </p>
      <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">{market.probability}% implied</p>
    </button>
  );
}

// Player prop card - Mobile-optimized
function PropCard({ prop, homeTeam, awayTeam }: { prop: PropMarket; homeTeam: string; awayTeam: string }) {
  const teamName = prop.team === 'home' ? homeTeam : awayTeam;
  const teamColor = prop.team === 'home' ? 'emerald' : 'cyan';
  
  return (
    <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-${teamColor}-500/20 flex items-center justify-center shrink-0`}>
          <User className={`h-4 w-4 sm:h-3.5 sm:w-3.5 text-${teamColor}-400`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-base font-medium text-white truncate">{prop.playerName}</p>
          <p className="text-[10px] sm:text-xs text-white/40">{teamName} • {prop.propType}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button className="flex-1 text-center min-h-[52px] p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 cursor-pointer transition-colors touch-manipulation active:scale-[0.98]">
          <p className="text-[10px] sm:text-xs text-white/60">Over {prop.line}</p>
          <p className="text-base sm:text-lg font-bold text-emerald-400">{prop.overOdds}</p>
        </button>
        <button className="flex-1 text-center min-h-[52px] p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 cursor-pointer transition-colors touch-manipulation active:scale-[0.98]">
          <p className="text-[10px] sm:text-xs text-white/60">Under {prop.line}</p>
          <p className="text-base sm:text-lg font-bold text-red-400">{prop.underOdds}</p>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// POOLS TAB
// ============================================================================

interface PoolsTabProps {
  match: Match;
  isInPool: boolean;
}

interface UserPool {
  id: number;
  name: string;
  memberCount: number;
  userRank: number;
  userPoints: number;
  hasPicked: boolean;
  pickValue?: string;
}

interface PoolStanding {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  points: number;
  record: string;
  isCurrentUser: boolean;
}

type PickMarket = "1X2" | "OU" | "BTTS";
type PickSelection = "home" | "draw" | "away" | "over" | "under" | "btts_yes" | "btts_no";

function PoolsTab({ match, isInPool }: PoolsTabProps) {
  const { user } = useDemoAuth();
  const [selectedPool, setSelectedPool] = useState<UserPool | null>(null);
  const [activeMarket, setActiveMarket] = useState<PickMarket>("1X2");
  const [selectedPick, setSelectedPick] = useState<PickSelection | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  
  // Mock user pools that include this match
  const [userPools] = useState<UserPool[]>(isInPool ? [
    { id: 1, name: "Premier League Predictor", memberCount: 24, userRank: 3, userPoints: 156, hasPicked: false },
    { id: 2, name: "Friends FC Pool", memberCount: 8, userRank: 1, userPoints: 89, hasPicked: true, pickValue: "home" },
  ] : []);
  
  // Mock standings for selected pool
  const [standings] = useState<PoolStanding[]>([
    { rank: 1, userId: "1", displayName: "Marco P.", points: 178, record: "12-3-2", isCurrentUser: false },
    { rank: 2, userId: "2", displayName: "Sarah K.", points: 165, record: "11-4-2", isCurrentUser: false },
    { rank: 3, userId: user?.id?.toString() || "3", displayName: user?.google_user_data?.name || "You", points: 156, record: "10-5-2", isCurrentUser: true },
    { rank: 4, userId: "4", displayName: "James R.", points: 142, record: "9-6-2", isCurrentUser: false },
    { rank: 5, userId: "5", displayName: "Emma L.", points: 138, record: "9-5-3", isCurrentUser: false },
  ]);

  // Auto-select first pool
  useEffect(() => {
    if (userPools.length > 0 && !selectedPool) {
      setSelectedPool(userPools[0]);
    }
  }, [userPools, selectedPool]);

  // Countdown timer to kickoff
  useEffect(() => {
    if (!match.startTime) return;
    
    const targetDate = new Date(match.startTime);
    
    const updateCountdown = () => {
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();
      
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setCountdown({ days, hours, minutes, seconds });
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [match.startTime]);

  const isLocked = match.status !== "not_started" && match.status !== "scheduled";
  const timeUntilKickoff = match.startTime ? new Date(match.startTime).getTime() - Date.now() : 0;
  const isUrgent = timeUntilKickoff > 0 && timeUntilKickoff < 30 * 60 * 1000; // < 30 min

  const handleSubmitPick = async () => {
    if (!selectedPick || !selectedPool) return;
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(r => setTimeout(r, 800));
    setIsSubmitting(false);
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 3000);
  };

  const getPickLabel = (pick: PickSelection): string => {
    switch (pick) {
      case "home": return match.homeTeam.name;
      case "draw": return "Draw";
      case "away": return match.awayTeam.name;
      case "over": return "Over 2.5";
      case "under": return "Under 2.5";
      case "btts_yes": return "Both Teams Score";
      case "btts_no": return "Not Both Score";
      default: return "";
    }
  };

  // Not in any pools - show join CTA
  if (!isInPool) {
    return (
      <div className="space-y-6">
        {/* Empty State */}
        <div className="p-8 rounded-2xl bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20 text-center">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-8 w-8 text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Join a Pool</h3>
          <p className="text-white/50 mb-1">Compete with friends on this match</p>
          <p className="text-xs text-white/30 mb-6">Make picks, track standings, win bragging rights</p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/pools"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-amber-500/25 transition-all active:scale-[0.98]"
            >
              <Trophy className="h-4 w-4" />
              Browse Pools
            </Link>
            <Link
              to="/leagues/create"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-medium text-sm hover:bg-white/10 transition-all active:scale-[0.98]"
            >
              <Users className="h-4 w-4" />
              Create Pool
            </Link>
          </div>
        </div>

        {/* Quick Match Info */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 text-sm text-white/50">
            <Clock className="h-4 w-4" />
            <span>
              {match.startTime 
                ? `Kickoff: ${new Date(match.startTime).toLocaleString(undefined, { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit' 
                  })}`
                : "Kickoff time TBD"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // User is in pools
  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* Lock Timer */}
      <div className={cn(
        "p-4 sm:p-5 rounded-xl border transition-all",
        isLocked 
          ? "bg-red-500/10 border-red-500/30" 
          : isUrgent 
            ? "bg-gradient-to-r from-amber-500/10 to-red-500/10 border-amber-500/30 animate-pulse"
            : "bg-white/5 border-white/10"
      )}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isLocked ? (
              <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Lock className="h-5 w-5 text-red-400" />
              </div>
            ) : (
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center",
                isUrgent ? "bg-amber-500/20" : "bg-white/10"
              )}>
                <Clock className={cn("h-5 w-5", isUrgent ? "text-amber-400" : "text-white/60")} />
              </div>
            )}
            <div>
              <p className="font-semibold text-white">
                {isLocked ? "Picks Locked" : "Picks Lock at Kickoff"}
              </p>
              <p className="text-xs text-white/50">
                {isLocked 
                  ? "Match has started - picks can no longer be changed"
                  : match.startTime 
                    ? new Date(match.startTime).toLocaleString(undefined, { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric', 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })
                    : "Kickoff time TBD"}
              </p>
            </div>
          </div>
          
          {!isLocked && timeUntilKickoff > 0 && (
            <div className="text-right flex items-center gap-1 sm:gap-2">
              {countdown.days > 0 && (
                <div className="text-center">
                  <span className="block text-lg sm:text-2xl font-bold text-amber-400 tabular-nums">
                    {countdown.days}
                  </span>
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">day</span>
                </div>
              )}
              <span className="text-white/30 text-lg">:</span>
              <div className="text-center">
                <span className="block text-lg sm:text-2xl font-bold text-amber-400 tabular-nums">
                  {String(countdown.hours).padStart(2, '0')}
                </span>
                <span className="text-[10px] text-white/40 uppercase tracking-wider">hr</span>
              </div>
              <span className="text-white/30 text-lg">:</span>
              <div className="text-center">
                <span className="block text-lg sm:text-2xl font-bold text-amber-400 tabular-nums">
                  {String(countdown.minutes).padStart(2, '0')}
                </span>
                <span className="text-[10px] text-white/40 uppercase tracking-wider">min</span>
              </div>
              <span className="text-white/30 text-lg">:</span>
              <div className="text-center">
                <span className={cn(
                  "block text-lg sm:text-2xl font-bold tabular-nums",
                  isUrgent ? "text-red-400" : "text-amber-400"
                )}>
                  {String(countdown.seconds).padStart(2, '0')}
                </span>
                <span className="text-[10px] text-white/40 uppercase tracking-wider">sec</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pool Selector */}
      {userPools.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {userPools.map(pool => (
            <button
              key={pool.id}
              onClick={() => setSelectedPool(pool)}
              className={cn(
                "flex-shrink-0 px-4 py-2 rounded-xl border transition-all text-sm font-medium whitespace-nowrap",
                selectedPool?.id === pool.id
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
              )}
            >
              <span className="flex items-center gap-2">
                {pool.name}
                {pool.hasPicked && (
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Pick Module */}
      <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-amber-500/20 flex items-center justify-between">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Ticket className="h-4 w-4 text-amber-400" />
            {selectedPool?.hasPicked ? "Your Pick" : "Make Your Pick"}
          </h3>
          {selectedPool?.hasPicked && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Submitted
            </span>
          )}
        </div>

        {/* Market Tabs */}
        <div className="flex border-b border-amber-500/10">
          {(["1X2", "OU", "BTTS"] as PickMarket[]).map(market => (
            <button
              key={market}
              onClick={() => {
                setActiveMarket(market);
                setSelectedPick(null);
              }}
              disabled={isLocked}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-all",
                activeMarket === market
                  ? "text-amber-400 border-b-2 border-amber-400 bg-amber-500/5"
                  : "text-white/50 hover:text-white/70",
                isLocked && "opacity-50 cursor-not-allowed"
              )}
            >
              {market === "1X2" ? "Match Result" : market === "OU" ? "Over/Under" : "Both Score"}
            </button>
          ))}
        </div>

        {/* Pick Options */}
        <div className="p-4">
          {activeMarket === "1X2" && (
            <div className="grid grid-cols-3 gap-3">
              {(["home", "draw", "away"] as PickSelection[]).map(pick => {
                const isSelected = selectedPick === pick || selectedPool?.pickValue === pick;
                const label = pick === "home" ? match.homeTeam.name : pick === "away" ? match.awayTeam.name : "Draw";
                const abbr = pick === "home" ? (match.homeTeam.abbreviation || "1") : pick === "away" ? (match.awayTeam.abbreviation || "2") : "X";
                // Simulated odds
                const odds = pick === "home" ? "+135" : pick === "draw" ? "+240" : "+180";
                
                return (
                  <button
                    key={pick}
                    onClick={() => !isLocked && setSelectedPick(pick)}
                    disabled={isLocked}
                    className={cn(
                      "relative p-4 rounded-xl border-2 transition-all min-h-[88px] flex flex-col items-center justify-center gap-1",
                      isSelected
                        ? "border-amber-400 bg-amber-500/20 shadow-lg shadow-amber-500/20"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                      isLocked && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className="text-xs text-white/40 uppercase tracking-wider">{abbr}</span>
                    <span className={cn(
                      "font-semibold text-sm text-center line-clamp-2",
                      isSelected ? "text-amber-400" : "text-white"
                    )}>
                      {label}
                    </span>
                    <span className={cn(
                      "text-xs font-medium",
                      isSelected ? "text-amber-300" : "text-emerald-400"
                    )}>
                      {odds}
                    </span>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center"
                      >
                        <Activity className="h-3 w-3 text-black" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {activeMarket === "OU" && (
            <div className="grid grid-cols-2 gap-3">
              {(["over", "under"] as PickSelection[]).map(pick => {
                const isSelected = selectedPick === pick;
                const label = pick === "over" ? "Over 2.5" : "Under 2.5";
                const odds = pick === "over" ? "-115" : "-105";
                
                return (
                  <button
                    key={pick}
                    onClick={() => !isLocked && setSelectedPick(pick)}
                    disabled={isLocked}
                    className={cn(
                      "relative p-5 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2",
                      isSelected
                        ? "border-amber-400 bg-amber-500/20 shadow-lg shadow-amber-500/20"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                      isLocked && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className={cn(
                      "font-bold text-lg",
                      isSelected ? "text-amber-400" : "text-white"
                    )}>
                      {label}
                    </span>
                    <span className={cn(
                      "text-sm font-medium",
                      isSelected ? "text-amber-300" : "text-emerald-400"
                    )}>
                      {odds}
                    </span>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center"
                      >
                        <Activity className="h-3 w-3 text-black" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {activeMarket === "BTTS" && (
            <div className="grid grid-cols-2 gap-3">
              {(["btts_yes", "btts_no"] as PickSelection[]).map(pick => {
                const isSelected = selectedPick === pick;
                const label = pick === "btts_yes" ? "Yes" : "No";
                const sublabel = pick === "btts_yes" ? "Both teams to score" : "One or both clean sheet";
                const odds = pick === "btts_yes" ? "-130" : "+100";
                
                return (
                  <button
                    key={pick}
                    onClick={() => !isLocked && setSelectedPick(pick)}
                    disabled={isLocked}
                    className={cn(
                      "relative p-5 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1",
                      isSelected
                        ? "border-amber-400 bg-amber-500/20 shadow-lg shadow-amber-500/20"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                      isLocked && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className={cn(
                      "font-bold text-lg",
                      isSelected ? "text-amber-400" : "text-white"
                    )}>
                      {label}
                    </span>
                    <span className="text-xs text-white/40 text-center">{sublabel}</span>
                    <span className={cn(
                      "text-sm font-medium mt-1",
                      isSelected ? "text-amber-300" : "text-emerald-400"
                    )}>
                      {odds}
                    </span>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center"
                      >
                        <Activity className="h-3 w-3 text-black" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Submit Button */}
        {!isLocked && !selectedPool?.hasPicked && (
          <div className="p-4 pt-0">
            <button
              onClick={handleSubmitPick}
              disabled={!selectedPick || isSubmitting}
              className={cn(
                "w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2",
                selectedPick
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98]"
                  : "bg-white/5 text-white/30 cursor-not-allowed"
              )}
            >
              {isSubmitting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </motion.div>
                  Submitting...
                </>
              ) : justSubmitted ? (
                <>
                  <Activity className="h-4 w-4" />
                  Pick Submitted!
                </>
              ) : (
                <>
                  <Ticket className="h-4 w-4" />
                  {selectedPick ? `Lock In: ${getPickLabel(selectedPick)}` : "Select a Pick"}
                </>
              )}
            </button>
          </div>
        )}

        {/* Already Picked State */}
        {selectedPool?.hasPicked && selectedPool.pickValue && (
          <div className="p-4 pt-0">
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <Activity className="h-4 w-4 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-400">Pick Locked In</p>
                <p className="text-xs text-white/50">
                  {getPickLabel(selectedPool.pickValue as PickSelection)}
                </p>
              </div>
              {!isLocked && (
                <button className="text-xs text-white/40 hover:text-white/60 transition-colors">
                  Change
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pool Standings */}
      <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            {selectedPool?.name || "Pool"} Standings
          </h3>
          <Link 
            to={`/league/${selectedPool?.id}`}
            className="text-xs text-white/40 hover:text-white/60 transition-colors flex items-center gap-1"
          >
            View Full
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        
        <div className="divide-y divide-white/5">
          {standings.map(standing => (
            <div 
              key={standing.userId}
              className={cn(
                "flex items-center gap-3 p-3 transition-colors",
                standing.isCurrentUser && "bg-amber-500/5"
              )}
            >
              {/* Rank */}
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                standing.rank === 1 ? "bg-amber-500/20 text-amber-400" :
                standing.rank === 2 ? "bg-gray-400/20 text-gray-300" :
                standing.rank === 3 ? "bg-orange-700/20 text-orange-400" :
                "bg-white/5 text-white/50"
              )}>
                {standing.rank}
              </div>
              
              {/* User Info */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "font-medium text-sm truncate",
                  standing.isCurrentUser ? "text-amber-400" : "text-white"
                )}>
                  {standing.displayName}
                  {standing.isCurrentUser && <span className="text-white/40 ml-1">(You)</span>}
                </p>
                <p className="text-xs text-white/40">{standing.record}</p>
              </div>
              
              {/* Points */}
              <div className="text-right">
                <p className={cn(
                  "font-bold",
                  standing.isCurrentUser ? "text-amber-400" : "text-white"
                )}>
                  {standing.points}
                </p>
                <p className="text-xs text-white/40">pts</p>
              </div>
            </div>
          ))}
        </div>
        
        {/* Your Position Banner */}
        {selectedPool && (
          <div className="p-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-t border-amber-500/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Your Position</span>
              <span className="font-bold text-amber-400">
                #{selectedPool.userRank} of {selectedPool.memberCount}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SKELETON
// ============================================================================

function MatchSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="h-10 bg-black/30" />
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 flex flex-col items-center">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-white/10" />
              <div className="h-4 w-24 bg-white/10 rounded mt-3" />
            </div>
            <div className="text-center px-4 sm:px-8">
              <div className="h-10 sm:h-12 w-24 sm:w-32 bg-white/10 rounded mb-2" />
              <div className="h-4 w-12 sm:w-16 bg-white/10 rounded mx-auto" />
            </div>
            <div className="flex-1 flex flex-col items-center">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-white/10" />
              <div className="h-4 w-24 bg-white/10 rounded mt-3" />
            </div>
          </div>
          <div className="flex justify-center gap-3 mt-5 pt-4 border-t border-white/10">
            <div className="h-9 w-20 bg-white/10 rounded-lg" />
            <div className="h-9 w-20 bg-white/10 rounded-lg" />
            <div className="h-9 w-20 bg-white/10 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-10 w-12 sm:w-20 bg-white/10 rounded-lg" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-4">
        <div className="h-24 sm:h-32 rounded-xl bg-white/5" />
        <div className="h-36 sm:h-48 rounded-xl bg-white/5" />
      </div>
    </div>
  );
}
