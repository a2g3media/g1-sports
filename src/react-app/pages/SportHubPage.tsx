import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { SportHubLayout, HubSection, SPORT_CONFIGS } from "@/react-app/components/hub/SportHubLayout";
import { LiveHeroMorph } from "@/react-app/components/hub/LiveHeroMorph";
import { StickyMiniScorebar } from "@/react-app/components/hub/StickyMiniScorebar";
import { LeaguePulseStrip } from "@/react-app/components/hub/LeaguePulseStrip";
import { CoachCommandCard } from "@/react-app/components/hub/CoachCommandCard";
import { SportHubPageSkeleton } from "@/react-app/components/hub/SportHubSkeleton";

import { HubStandings } from "@/react-app/components/hub/HubStandings";
import { SoccerHubStandings } from "@/react-app/components/hub/SoccerHubStandings";
import { SoccerHubLeaders } from "@/react-app/components/hub/SoccerHubLeaders";
import { HubLeaders } from "@/react-app/components/hub/HubLeaders";
import { HubSchedule } from "@/react-app/components/hub/HubSchedule";
import { Trophy, Users, Calendar, Sparkles } from "lucide-react";

interface GameData {
  id: string;
  homeTeam: { code: string; name: string; score: number; record?: string };
  awayTeam: { code: string; name: string; score: number; record?: string };
  status: "LIVE" | "SCHEDULED" | "FINAL";
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string;
  spread?: number;
  total?: number;
}

function getDateInEastern(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Map URL slugs to API sport keys
const SPORT_KEY_MAP: Record<string, string> = {
  nba: 'NBA',
  nfl: 'NFL',
  mlb: 'MLB',
  nhl: 'NHL',
  ncaaf: 'NCAAF',
  ncaab: 'NCAAB',
  golf: 'GOLF',
  nascar: 'NASCAR',
  mma: 'MMA',
  soccer: 'SOCCER',
  tennis: 'TENNIS',
  boxing: 'BOXING',
};

// Sports that support standings
const STANDINGS_SPORTS = ['nba', 'nfl', 'mlb', 'nhl', 'soccer'];

// Sports that support league leaders
const LEADERS_SPORTS = ['nba', 'nfl', 'mlb', 'nhl', 'soccer', 'golf', 'mma'];

export function SportHubPage() {
  const { sportKey } = useParams<{ sportKey: string }>();
  // Single source of truth for all games
  const [allGames, setAllGames] = useState<any[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Only true on first load
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const hasFetchedRef = useRef(false);

  const normalizedKey = sportKey?.toLowerCase() || '';
  const apiSportKey = SPORT_KEY_MAP[normalizedKey];
  const sportConfig = SPORT_CONFIGS[normalizedKey];

  // Scroll detection for sticky bar
  useEffect(() => {
    const handleScroll = () => {
      setShowStickyBar(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Redirect to directory if invalid sport
  if (!sportConfig || !apiSportKey) {
    return <Navigate to="/sports" replace />;
  }

  // SINGLE fetch for ALL games - stale-while-revalidate pattern
  useEffect(() => {
    let isMounted = true;

    async function fetchAllGames() {
      try {
        const res = await fetch(`/api/games?sport=${apiSportKey}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          setAllGames(data.games || []);
          hasFetchedRef.current = true;
        }
      } catch (err) {
        console.error('[SportHubPage] Failed to fetch games:', err);
      } finally {
        // Only clear initial load after first successful fetch
        if (isMounted && hasFetchedRef.current) {
          setIsInitialLoad(false);
        }
      }
    }

    fetchAllGames();
    const interval = setInterval(fetchAllGames, 30000);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiSportKey]);

  // Keep hub schedule aligned to "today ET" and always include live games.
  const todayEt = useMemo(() => getDateInEastern(new Date()), []);
  const todayGames = useMemo(() => {
    return allGames.filter((g) => {
      const status = String(g?.status || '').toUpperCase();
      if (status === 'LIVE' || status === 'IN_PROGRESS') return true;
      const rawStart = g?.start_time;
      if (!rawStart) return false;
      const start = new Date(rawStart);
      if (Number.isNaN(start.getTime())) return false;
      return getDateInEastern(start) === todayEt;
    });
  }, [allGames, todayEt]);

  // Derive hero games from today's games (live first, then scheduled, up to 5)
  const heroGames = useMemo(() => {
    const liveGames = todayGames.filter(g => 
      g.status === 'LIVE' || g.status === 'IN_PROGRESS'
    );
    const scheduledGames = todayGames.filter(g => g.status === 'SCHEDULED');
    const finalGames = todayGames.filter(g => g.status === 'FINAL' || g.status === 'COMPLETED');
    
    // Prefer live/upcoming; if none exist, still show finals so the hub never appears empty.
    const featuredPool = (liveGames.length > 0 || scheduledGames.length > 0)
      ? [...liveGames, ...scheduledGames]
      : finalGames;
    const featured = featuredPool.slice(0, 5);
    return featured.map(transformGame);
  }, [todayGames]);

  // Navigate between hero games from sticky bar
  const handlePrevGame = useCallback(() => {
    setActiveHeroIndex(prev => (prev - 1 + heroGames.length) % heroGames.length);
  }, [heroGames.length]);

  const handleNextGame = useCallback(() => {
    setActiveHeroIndex(prev => (prev + 1) % heroGames.length);
  }, [heroGames.length]);

  function transformGame(g: any): GameData {
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
      total: g.overUnder,
    };
  }

  const hasStandings = STANDINGS_SPORTS.includes(normalizedKey);
  const hasLeaders = LEADERS_SPORTS.includes(normalizedKey);
  const activeHeroGame = heroGames[activeHeroIndex] || null;

  // Show skeleton only on initial load - keeps existing data visible during refresh
  if (isInitialLoad) {
    return <SportHubPageSkeleton />;
  }

  return (
    <>
      {/* Sticky Mini Scorebar */}
      <StickyMiniScorebar 
        sportKey={normalizedKey}
        game={activeHeroGame}
        isVisible={showStickyBar && heroGames.length > 0}
        onPrev={handlePrevGame}
        onNext={handleNextGame}
        hasMultiple={heroGames.length > 1}
      />
      
      <SportHubLayout 
        sportKey={normalizedKey}
        heroSlot={
          <LiveHeroMorph 
            sportKey={normalizedKey} 
            games={heroGames} 
            loading={false}
            onActiveIndexChange={setActiveHeroIndex}
          />
        }
      >
        {/* League Pulse Strip - Quick insights (uses allGames, no fetch) */}
        <div className="mb-6 -mt-2">
          <LeaguePulseStrip sportKey={normalizedKey} games={todayGames} />
        </div>

        {/* Coach G Quick Actions */}
        <HubSection
          id="coach-actions"
          title="Ask Coach G"
          subtitle="Quick insights with one tap"
          icon={<Sparkles className="h-5 w-5 text-[var(--sport-accent)]" />}
        >
          <CoachCommandCard sportKey={normalizedKey} />
        </HubSection>

        {/* Today's Games - (uses allGames, no fetch) */}
        <HubSection
          id="scores"
          title="Today's Games"
          subtitle={`Full ${sportConfig.name} schedule`}
          icon={<Calendar className="h-5 w-5 text-[var(--sport-accent)]" />}
        >
          <HubSchedule sportKey={normalizedKey} games={todayGames} loading={false} />
        </HubSection>

        {/* Standings - only for team sports */}
        {hasStandings && (
          <HubSection
            id="standings"
            title={getStandingsTitle(normalizedKey)}
            subtitle={getStandingsSubtitle(normalizedKey)}
            icon={<Trophy className="h-5 w-5 text-[var(--sport-accent)]" />}
          >
            {normalizedKey === 'soccer' ? (
              <SoccerHubStandings />
            ) : (
              <HubStandings sportKey={normalizedKey} />
            )}
          </HubSection>
        )}

        {/* Leaders - only for supported sports */}
        {hasLeaders && (
          <HubSection
            id="leaders"
            title={normalizedKey === 'soccer' ? "Top Performers" : "League Leaders"}
            subtitle={normalizedKey === 'soccer' ? "Top scorers and assist leaders" : "Top performers this season"}
            icon={<Users className="h-5 w-5 text-[var(--sport-accent)]" />}
          >
            {normalizedKey === 'soccer' ? (
              <SoccerHubLeaders />
            ) : (
              <HubLeaders sportKey={normalizedKey} />
            )}
          </HubSection>
        )}

{/* Coach G Intelligence removed - deduplicated with Coach G Quick Actions above */}
      </SportHubLayout>
    </>
  );
}

function getStandingsTitle(sport: string): string {
  switch (sport) {
    case 'nba': return 'Conference Standings';
    case 'nfl': return 'Division Standings';
    case 'mlb': return 'Division Standings';
    case 'nhl': return 'Conference Standings';
    case 'soccer': return 'League Tables';
    default: return 'Standings';
  }
}

function getStandingsSubtitle(sport: string): string {
  switch (sport) {
    case 'nba': return 'Eastern & Western Conference';
    case 'nfl': return 'AFC & NFC Divisions';
    case 'mlb': return 'AL & NL Divisions';
    case 'nhl': return 'Eastern & Western Conference';
    case 'soccer': return 'Select a league to view standings';
    default: return 'Current standings';
  }
}

function extractTeamName(fullName: string | null): string {
  if (!fullName) return 'TBD';
  const parts = fullName.split(' ');
  return parts[parts.length - 1];
}

export default SportHubPage;
