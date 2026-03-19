/**
 * SoccerDirectoryPage.tsx - League Selection Home
 * Premium league picker with spotlight hero that rotates through featured matches.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Trophy } from "lucide-react";
import { getAllSoccerLeagues, type SoccerLeagueMeta } from "@/react-app/lib/soccerLeagueMeta";
import TeamCrest from "@/react-app/components/soccer/TeamCrest";

// ============================================================================
// TYPES
// ============================================================================

interface FeaturedMatch {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeScore: number | null;
  awayScore: number | null;
  status: 'live' | 'scheduled' | 'finished';
  minute?: string;
  startTime?: string;
}

interface LeagueSpotlight {
  key: string;
  meta: SoccerLeagueMeta;
  featuredMatch: FeaturedMatch | null;
  isLive: boolean;
  nextKickoffTime: number | null; // timestamp for sorting
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatKickoffTime(isoDate: string | undefined): string {
  if (!isoDate) return "TBD";
  const date = new Date(isoDate);
  return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + 
         date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ============================================================================
// SPOTLIGHT HERO COMPONENT - Premium Broadcast Header
// ============================================================================

interface SpotlightHeroProps {
  spotlights: LeagueSpotlight[];
}

/** Spotlight team display with shared TeamCrest */
function SpotlightTeam({ teamId, teamName, teamLogo }: { 
  teamId?: string; 
  teamName: string; 
  teamLogo?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <TeamCrest 
        teamId={teamId} 
        teamName={teamName} 
        teamLogo={teamLogo}
        size="hero" 
      />
      <span className="text-sm sm:text-base font-bold text-white/90 text-center max-w-[120px] sm:max-w-[160px] leading-tight">
        {teamName}
      </span>
    </div>
  );
}

function SpotlightHero({ spotlights }: SpotlightHeroProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-rotate every 7 seconds
  useEffect(() => {
    if (spotlights.length <= 1) return;
    
    intervalRef.current = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % spotlights.length);
        setIsTransitioning(false);
      }, 350);
    }, 7000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [spotlights.length]);

  if (spotlights.length === 0) return null;

  const current = spotlights[currentIndex];
  const match = current.featuredMatch;

  const handleClick = () => {
    navigate(`/sports/soccer/league/${current.key}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
      <div
        onClick={handleClick}
        className="relative cursor-pointer group overflow-hidden rounded-2xl border border-white/[0.06] hover:border-emerald-500/20 transition-all duration-500"
        style={{
          background: 'linear-gradient(160deg, rgba(6,32,20,0.9) 0%, rgba(8,18,14,0.95) 40%, rgba(4,8,6,1) 100%)',
          boxShadow: '0 8px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.02)',
        }}
      >
        {/* Animated light sweep - 10s duration */}
        <div 
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background: 'linear-gradient(105deg, transparent 30%, rgba(16,185,129,0.06) 45%, rgba(255,255,255,0.03) 50%, rgba(16,185,129,0.06) 55%, transparent 70%)',
            animation: 'lightSweep 10s ease-in-out infinite',
          }}
        />
        
        {/* Radial glow behind center matchup */}
        <div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px] sm:w-[600px] sm:h-[400px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.08) 0%, transparent 60%)',
          }}
        />
        
        {/* Content */}
        <div className="relative px-5 py-8 sm:px-10 sm:py-10">
          {/* Top-left: Label + League name */}
          <div className={`absolute top-6 left-6 sm:top-8 sm:left-10 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            <span className="text-[10px] sm:text-xs font-bold tracking-[0.25em] text-emerald-500/70 uppercase">
              League Spotlight
            </span>
            <h2 className="text-base sm:text-lg font-semibold text-white/70 mt-0.5">
              {current.meta.name}
            </h2>
          </div>

          {/* Center: Matchup area */}
          <div className={`flex items-center justify-center gap-6 sm:gap-12 py-8 sm:py-10 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            {match ? (
              <>
                {/* Home team */}
                <SpotlightTeam teamId={match.homeTeamId} teamName={match.homeTeam} teamLogo={match.homeTeamLogo} />
                
                {/* Center: Score or VS */}
                <div className="flex flex-col items-center min-w-[100px] sm:min-w-[140px]">
                  {match.status === 'live' ? (
                    <>
                      <div className="flex items-center gap-3 sm:gap-5">
                        <span className="text-4xl sm:text-6xl font-black text-white tabular-nums tracking-tight">
                          {match.homeScore ?? 0}
                        </span>
                        <span className="text-2xl sm:text-3xl font-extralight text-white/30">–</span>
                        <span className="text-4xl sm:text-6xl font-black text-white tabular-nums tracking-tight">
                          {match.awayScore ?? 0}
                        </span>
                      </div>
                      {/* Minute + LIVE badge with scale pulse */}
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-sm sm:text-base font-semibold text-white/60">
                          {match.minute ? `${match.minute}'` : ''}
                        </span>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-500/20 border border-red-500/40 animate-pulse-scale">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          <span className="text-[10px] sm:text-xs font-black text-red-400 uppercase tracking-widest">Live</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl sm:text-5xl font-black text-white/25 tracking-wider">VS</span>
                      <span className="text-sm sm:text-base font-medium text-white/50 mt-2">
                        {formatKickoffTime(match.startTime)}
                      </span>
                    </>
                  )}
                </div>
                
                {/* Away team */}
                <SpotlightTeam teamId={match.awayTeamId} teamName={match.awayTeam} teamLogo={match.awayTeamLogo} />
              </>
            ) : (
              /* Empty/Fallback state */
              <div className="flex flex-col items-center py-6">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400/60" />
                </div>
                <span className="text-base sm:text-lg font-medium text-white/40">
                  Next matchday coming soon
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Hover arrow */}
        <div className="absolute right-5 sm:right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <ChevronRight className="h-6 w-6 text-emerald-400/50" />
        </div>
      </div>
      
      {/* CSS for animations */}
      <style>{`
        @keyframes lightSweep {
          0%, 100% { transform: translateX(-120%); }
          50% { transform: translateX(120%); }
        }
        @keyframes pulse-scale {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-pulse-scale {
          animation: pulse-scale 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function SpotlightSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
      <div 
        className="relative rounded-2xl border border-white/[0.06] overflow-hidden animate-pulse"
        style={{
          background: 'linear-gradient(160deg, rgba(6,32,20,0.9) 0%, rgba(8,18,14,0.95) 40%, rgba(4,8,6,1) 100%)',
        }}
      >
        <div className="px-5 py-8 sm:px-10 sm:py-10">
          {/* Top-left label area */}
          <div className="absolute top-6 left-6 sm:top-8 sm:left-10">
            <div className="h-2.5 w-28 bg-white/10 rounded mb-2" />
            <div className="h-5 w-36 bg-white/10 rounded" />
          </div>
          
          {/* Center matchup area */}
          <div className="flex items-center justify-center gap-6 sm:gap-12 py-8 sm:py-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white/5 rounded-full" />
              <div className="h-4 w-24 bg-white/10 rounded" />
            </div>
            <div className="flex flex-col items-center min-w-[100px]">
              <div className="h-12 sm:h-16 w-28 bg-white/10 rounded" />
              <div className="h-4 w-20 bg-white/10 rounded mt-3" />
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white/5 rounded-full" />
              <div className="h-4 w-24 bg-white/10 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CACHE & CONSTANTS
// ============================================================================

const SPOTLIGHT_CACHE_KEY = 'gz_soccer_spotlight_v2';
const CACHE_TTL_MS = 60 * 1000; // 1 minute
const SPOTLIGHT_REFRESH_MS = 30 * 1000; // refresh every 30 seconds
const PRIMARY_LEAGUE = 'premier-league';

// Priority order for spotlight rotation
const LEAGUE_PRIORITY = ['premier-league', 'champions-league', 'la-liga', 'serie-a', 'bundesliga', 'ligue-1', 'mls'];

interface CachedSpotlight {
  spotlights: LeagueSpotlight[];
  liveStatus: Record<string, boolean>;
  timestamp: number;
}

function loadCachedSpotlight(): CachedSpotlight | null {
  try {
    const raw = localStorage.getItem(SPOTLIGHT_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSpotlight;
    // Accept cache if less than 5 min old
    if (Array.isArray(cached.spotlights) && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached;
    }
  } catch {}
  return null;
}

function saveCachedSpotlight(spotlights: LeagueSpotlight[], liveStatus: Record<string, boolean>) {
  try {
    const data: CachedSpotlight = { spotlights, liveStatus, timestamp: Date.now() };
    localStorage.setItem(SPOTLIGHT_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

// Extract a spotlight from match data
function computeSpotlightFromMatches(
  key: string,
  meta: SoccerLeagueMeta,
  matches: any[]
): LeagueSpotlight | null {
  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const windowStart = now - fourteenDaysMs;
  const windowEnd = now + fourteenDaysMs;
  
  const normalizedMatches = matches
    .map((m) => {
      const matchTime = new Date(m.startTime).getTime();
      if (Number.isNaN(matchTime)) return null;
      const status: FeaturedMatch['status'] =
        m.status === 'inprogress' || m.status === 'live'
          ? 'live'
          : m.status === 'closed' || m.status === 'ended' || m.status === 'finished'
            ? 'finished'
            : 'scheduled';

      return {
        raw: m,
        matchTime,
        status,
      };
    })
    .filter((m): m is { raw: any; matchTime: number; status: FeaturedMatch['status'] } => Boolean(m));

  const hasActivityInWindow = normalizedMatches.some(
    (m) => m.matchTime >= windowStart && m.matchTime <= windowEnd
  );

  const liveMatches = normalizedMatches
    .filter((m) => m.status === 'live')
    .sort((a, b) => a.matchTime - b.matchTime);

  const scheduledMatches = normalizedMatches
    .filter((m) => m.status === 'scheduled' && m.matchTime >= now)
    .sort((a, b) => a.matchTime - b.matchTime);

  const recentFinalMatches = normalizedMatches
    .filter((m) => m.status === 'finished' && m.matchTime <= now && m.matchTime >= now - 12 * 60 * 60 * 1000)
    .sort((a, b) => b.matchTime - a.matchTime);

  const selected = liveMatches[0] || scheduledMatches[0] || recentFinalMatches[0];
  let featuredMatch: FeaturedMatch | null = null;
  let isLive = false;
  let nextKickoffTime: number | null = null;

  if (selected) {
    const m = selected.raw;
    featuredMatch = {
      eventId: m.eventId,
      homeTeam: m.homeTeam || m.homeTeamName || 'TBD',
      awayTeam: m.awayTeam || m.awayTeamName || 'TBD',
      homeTeamId: m.homeTeamId || m.homeId,
      awayTeamId: m.awayTeamId || m.awayId,
      homeTeamLogo: m.homeTeamLogo || m.homeLogo,
      awayTeamLogo: m.awayTeamLogo || m.awayLogo,
      homeScore: selected.status === 'scheduled' ? null : m.homeScore,
      awayScore: selected.status === 'scheduled' ? null : m.awayScore,
      status: selected.status,
      minute: m.matchTime || m.minute,
      startTime: m.startTime,
    };
    isLive = selected.status === 'live';
    nextKickoffTime = selected.matchTime;
  }
  
  if (!hasActivityInWindow) return null;
  return { key, meta, featuredMatch, isLive, nextKickoffTime };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SoccerDirectoryPage() {
  const leagues = getAllSoccerLeagues();
  
  // Initialize from cache for instant render (no blocking)
  const cached = loadCachedSpotlight();
  const [spotlights, setSpotlights] = useState<LeagueSpotlight[]>(cached?.spotlights || []);
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>(cached?.liveStatus || {});
  const [loading, setLoading] = useState(!cached); // Only show skeleton if no cache

  // Single fetch for spotlight - fetch ONE primary league, then others in background
  useEffect(() => {
    let cancelled = false;
    
    async function fetchPrimarySpotlight() {
      // Step 1: Fetch primary league ONLY for fast spotlight
      const primaryLeague = leagues.find(l => l.key === PRIMARY_LEAGUE);
      if (!primaryLeague) return;
      
      try {
        const res = await fetch(`/api/soccer/schedule/${PRIMARY_LEAGUE}?filter=all`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          const spotlight = computeSpotlightFromMatches(PRIMARY_LEAGUE, primaryLeague.meta, data.matches || []);
          
          if (spotlight) {
            setSpotlights([spotlight]);
            setLiveStatus(prev => ({ ...prev, [PRIMARY_LEAGUE]: spotlight.isLive }));
            setLoading(false);
            saveCachedSpotlight([spotlight], { [PRIMARY_LEAGUE]: spotlight.isLive });
          } else {
            setLoading(false);
          }
        }
      } catch {
        setLoading(false);
      }
    }
    
    async function fetchAllLeaguesInBackground() {
      // Step 2: Fetch remaining leagues in background (non-blocking)
      // This updates live badges on grid and adds more spotlights to rotation
      const results: LeagueSpotlight[] = [];
      const newLiveStatus: Record<string, boolean> = {};
      
      // Fetch in priority order
      const sortedLeagues = [...leagues].sort((a, b) => {
        const aIdx = LEAGUE_PRIORITY.indexOf(a.key);
        const bIdx = LEAGUE_PRIORITY.indexOf(b.key);
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
      });
      
      await Promise.all(sortedLeagues.map(async ({ key, meta }) => {
        try {
          const res = await fetch(`/api/soccer/schedule/${key}?filter=all`);
          if (!res.ok) return;
          const data = await res.json();
          const spotlight = computeSpotlightFromMatches(key, meta, data.matches || []);
          if (spotlight) {
            results.push(spotlight);
            newLiveStatus[key] = spotlight.isLive;
          }
        } catch {}
      }));
      
      if (cancelled || results.length === 0) return;
      
      // Sort: live first, then by kickoff, then alphabetically
      results.sort((a, b) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        if (a.nextKickoffTime && b.nextKickoffTime) return a.nextKickoffTime - b.nextKickoffTime;
        if (a.nextKickoffTime && !b.nextKickoffTime) return -1;
        if (!a.nextKickoffTime && b.nextKickoffTime) return 1;
        return a.meta.name.localeCompare(b.meta.name);
      });
      
      setSpotlights(results);
      setLiveStatus(newLiveStatus);
      saveCachedSpotlight(results, newLiveStatus);
    }
    
    // Execute: primary first (fast), then background fetch
    fetchPrimarySpotlight().then(() => {
      if (!cancelled) {
        // Small delay before background fetch to let UI settle
        setTimeout(() => fetchAllLeaguesInBackground(), 100);
      }
    });

    const interval = setInterval(() => {
      if (!cancelled) {
        fetchAllLeaguesInBackground();
      }
    }, SPOTLIGHT_REFRESH_MS);
    
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [leagues]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent">
        <div className="max-w-7xl mx-auto px-4 py-10 sm:py-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-emerald-400" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
              Soccer
            </h1>
          </div>
          <p className="text-lg text-white/60">
            Choose a league to enter the command center
          </p>
        </div>
      </div>

      {/* Spotlight Hero */}
      {loading ? (
        <SpotlightSkeleton />
      ) : (
        <SpotlightHero spotlights={spotlights} />
      )}

      {/* League Cards Grid */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map(({ key, meta }) => {
            // Use liveStatus map for fast lookup (populated by background fetch)
            const isLive = liveStatus[key] ?? false;
            
            return (
              <Link
                key={key}
                to={`/sports/soccer/league/${key}`}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 hover:border-emerald-500/30 transition-all duration-300 touch-manipulation active:scale-[0.98]"
              >
                {/* Live indicator badge */}
                {isLive && (
                  <div className="absolute top-4 right-4 z-10">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                      </span>
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
                    </div>
                  </div>
                )}
                
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 to-emerald-500/0 group-hover:from-emerald-500/5 group-hover:to-transparent transition-all duration-500" />
                
                <div className="relative p-6">
                  {/* League Name */}
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold mb-1 group-hover:text-emerald-400 transition-colors">
                      {meta.name}
                    </h2>
                    <span className="text-sm text-white/50">{meta.country}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                      <span>Open Command Center</span>
                      <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
