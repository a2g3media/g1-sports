import { useParams, Link, useSearchParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { Shield, Calendar, Users, Activity, Brain, MapPin, Trophy, Loader2, ChevronRight, AlertTriangle } from "lucide-react";
import SoccerPageHeader, { buildTeamBreadcrumbs } from "@/react-app/components/soccer/SoccerPageHeader";
import { useSoccerBackNavigation, buildSoccerMatchUrl, buildSoccerPlayerUrl } from "@/react-app/hooks/useSoccerBackNavigation";
import { getEspnPlayerPhoto, fetchPlayerPhotos } from "@/react-app/lib/espnSoccer";
import { fetchJsonCached } from "@/react-app/lib/fetchCache";
import TeamCrest from "@/react-app/components/soccer/TeamCrest";
import FavoriteEntityButton from "@/react-app/components/FavoriteEntityButton";

import { CoachGPanel } from "@/react-app/components/soccer/CoachGPanel";
import { SectionErrorBoundary } from "@/react-app/components/ErrorBoundary";

interface TeamData {
  id: string;
  name: string;
  abbreviation: string;
  country: string;
  countryCode: string;
  foundedYear: number | null;
  venue: { id: string; name: string; city: string; capacity: number } | null;
  manager: { id: string; name: string; nationality: string } | null;
  jerseys: { type: string; base: string; number: string; sleeve: string }[];
}

interface Player {
  id?: string | null;
  playerId?: string | null;
  espnId?: string | null;
  providerPlayerId?: string | null;
  srPlayerId?: string | null;
  name: string;
  jerseyNumber: number | null;
  position: string;
  nationality: string;
  dateOfBirth: string | null;
  height: number | null;
  weight: number | null;
}

interface MatchResult {
  eventId: string;
  date: string;
  competition: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeScore: number | null;
  awayScore: number | null;
  isHome: boolean;
  result: 'W' | 'D' | 'L' | null;
}

interface Fixture {
  eventId: string;
  date: string;
  competition: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  isHome: boolean;
}

interface LeagueStanding {
  leagueName: string;
  leagueId: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string | null;
}

interface SeasonStats {
  goalsScored: number;
  goalsConceded: number;
  cleanSheets: number;
  matchesPlayed: number;
}

interface TeamProfileResponse {
  team: TeamData | null;
  players: Player[];
  recentResults: MatchResult[];
  upcomingFixtures: Fixture[];
  leagueStanding: LeagueStanding | null;
  seasonStats: SeasonStats | null;
  errors: string[];
}

// Position ordering for squad display
const POSITION_ORDER: Record<string, number> = {
  'goalkeeper': 1, 'goalie': 1, 'gk': 1,
  'defender': 2, 'defence': 2, 'def': 2,
  'midfielder': 3, 'midfield': 3, 'mid': 3,
  'forward': 4, 'striker': 4, 'attack': 4, 'attacker': 4,
};

function getPositionOrder(position: string): number {
  const lower = position.toLowerCase();
  for (const [key, order] of Object.entries(POSITION_ORDER)) {
    if (lower.includes(key)) return order;
  }
  return 5;
}

// Schedule match type for full season data
interface ScheduleMatch {
  eventId: string;
  date: string;
  competition: string;
  round: string | null;
  venue: string | null;
  homeTeam: { id: string; name: string; abbreviation: string };
  awayTeam: { id: string; name: string; abbreviation: string };
  isHome: boolean;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  matchStatus: string | null;
  result?: 'W' | 'D' | 'L' | null;
  isLive?: boolean;
}

type ScheduleFilter = 'all' | 'results' | 'upcoming';

// Error fallback component
function TeamPageErrorFallback() {
  const { teamId } = useParams<{ teamId: string }>();
  const { goBack } = useSoccerBackNavigation({ pageType: "team" });
  
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SoccerPageHeader
        breadcrumbs={[{ label: "Team" }]}
        title="Unable to Load Team"
        onBack={goBack}
      />
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-12 text-center">
          <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-white/50 mb-6">
            We couldn't load the team page. The data might be temporarily unavailable.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
            >
              Try Again
            </button>
            <Link
              to="/sports/soccer"
              className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
            >
              Back to Soccer
            </Link>
          </div>
          {teamId && (
            <p className="text-xs text-white/30 mt-6">Team ID: {teamId}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SoccerTeamPageContent() {
  const { teamId } = useParams<{ teamId: string }>();
  const [searchParams] = useSearchParams();
  const fromLeagueId = searchParams.get("fromLeagueId");
  const [data, setData] = useState<TeamProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Full season schedule state
  const [scheduleResults, setScheduleResults] = useState<ScheduleMatch[]>([]);
  const [scheduleUpcoming, setScheduleUpcoming] = useState<ScheduleMatch[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  
  // Player photos state (async loaded from ESPN)
  const [playerPhotos, setPlayerPhotos] = useState<Map<string, string>>(new Map());
  
  // Back navigation - use fromLeagueId from URL or league from loaded data
  const leagueIdForNav = fromLeagueId || data?.leagueStanding?.leagueId;
  const { goBack } = useSoccerBackNavigation({
    pageType: "team",
    leagueId: leagueIdForNav || undefined,
  });

  useEffect(() => {
    if (!teamId) return;
    
    async function fetchTeamProfile() {
      setLoading(true);
      setError(null);
      
      try {
        const result = await fetchJsonCached<TeamProfileResponse>(`/api/soccer/team/${teamId}`, {
          cacheKey: `soccer-team-profile:${teamId}`,
          ttlMs: 45_000,
          timeoutMs: 4_000,
          init: { credentials: "include" },
        });
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load team');
      } finally {
        setLoading(false);
      }
    }
    
    fetchTeamProfile();
  }, [teamId]);

  // Fetch full season schedule separately
  useEffect(() => {
    if (!teamId) return;
    
    async function fetchFullSchedule() {
      setScheduleLoading(true);
      try {
        const result = await fetchJsonCached<{ results?: ScheduleMatch[]; upcoming?: ScheduleMatch[] }>(
          `/api/soccer/team/${teamId}/schedule`,
          {
            cacheKey: `soccer-team-schedule:${teamId}`,
            ttlMs: 45_000,
            timeoutMs: 4_000,
            init: { credentials: "include" },
          }
        );
        setScheduleResults(result.results || []);
        setScheduleUpcoming(result.upcoming || []);
      } catch (err) {
        console.error('Failed to load full schedule:', err);
      } finally {
        setScheduleLoading(false);
      }
    }
    
    fetchFullSchedule();
  }, [teamId]);

  // Load player photos asynchronously from ESPN
  useEffect(() => {
    const players = data?.players || [];
    if (players.length === 0) return;
    
    const playerNames = players.map(p => p.name);
    
    // Fetch photos in background
    fetchPlayerPhotos(playerNames)
      .then(photoMap => {
        setPlayerPhotos(photoMap);
      })
      .catch(err => {
        console.error('Failed to load player photos:', err);
      });
  }, [data?.players]);
  
  // Helper to get player photo with fallback
  const getPlayerPhoto = useCallback((playerName: string): string => {
    return playerPhotos.get(playerName) || getEspnPlayerPhoto(playerName);
  }, [playerPhotos]);

  // Use league standing data if available, otherwise calculate from recent results
  const standing = data?.leagueStanding;
  const seasonStats = data?.seasonStats;
  
  const stats = standing ? {
    wins: standing.wins,
    draws: standing.draws,
    losses: standing.losses,
    goalsScored: standing.goalsFor,
    goalsConceded: standing.goalsAgainst,
    cleanSheets: seasonStats?.cleanSheets ?? 0,
    points: standing.points,
    position: standing.position,
    leagueName: standing.leagueName,
    played: standing.played,
    goalDifference: standing.goalDifference
  } : seasonStats ? {
    wins: data.recentResults.filter(r => r.result === 'W').length,
    draws: data.recentResults.filter(r => r.result === 'D').length,
    losses: data.recentResults.filter(r => r.result === 'L').length,
    goalsScored: seasonStats.goalsScored,
    goalsConceded: seasonStats.goalsConceded,
    cleanSheets: seasonStats.cleanSheets,
    points: null,
    position: null,
    leagueName: null,
    played: seasonStats.matchesPlayed,
    goalDifference: seasonStats.goalsScored - seasonStats.goalsConceded
  } : null;

  // Recent form (last 5 results)
  const recentForm = data?.recentResults?.slice(0, 5) || [];

  // Group players by position
  const sortedPlayers = [...(data?.players || [])].sort((a, b) => {
    const orderA = getPositionOrder(a.position);
    const orderB = getPositionOrder(b.position);
    if (orderA !== orderB) return orderA - orderB;
    return (a.jerseyNumber || 99) - (b.jerseyNumber || 99);
  });

  const resolveSoccerPlayerRouteId = useCallback((player: Player): string | null => {
    const candidates = [
      player.id,
      player.playerId,
      player.espnId,
      player.providerPlayerId,
      player.srPlayerId,
    ];
    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (!value) continue;
      return value;
    }
    return null;
  }, []);
  useEffect(() => {
    if (!teamId || !data) return;
    const normalizedRosterCount = Array.isArray(data.players) ? data.players.length : 0;
    const rows = sortedPlayers;
    const clickableRows = rows.filter((p) => Boolean(resolveSoccerPlayerRouteId(p))).length;
    console.log('[Soccer Team][roster-render]', {
      requestedSport: 'soccer',
      requestedTeamId: teamId,
      source: (data as any)?.source || null,
      rawProviderRosterCount: normalizedRosterCount,
      normalizedRosterCount,
      finalRenderedRosterCount: rows.length,
      clickableRows,
    });
  }, [teamId, data, sortedPlayers, resolveSoccerPlayerRouteId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <p className="text-white/60">Loading team profile...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.team) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <SoccerPageHeader
          breadcrumbs={[{ label: "Team" }]}
          title="Team Not Found"
          onBack={goBack}
        />
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-center py-20">
            <Shield className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">{error || 'Unable to load team profile'}</p>
          </div>
        </div>
      </div>
    );
  }

  const team = data.team;

  // Build subtitle - league link is in breadcrumbs, just show position here
  const positionSuffix = standing?.position === 1 ? 'st' : standing?.position === 2 ? 'nd' : standing?.position === 3 ? 'rd' : 'th';
  const headerSubtitle = standing 
    ? `${standing.position}${positionSuffix} in ${standing.leagueName}`
    : team.country || undefined;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Breadcrumb Header */}
      <SoccerPageHeader
        breadcrumbs={buildTeamBreadcrumbs(
          team.name,
          standing ? { id: standing.leagueId, name: standing.leagueName } : undefined
        )}
        title={team.name}
        subtitle={headerSubtitle}
        onBack={goBack}
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* 1) Team Hero Section */}
        <SectionErrorBoundary fallback={<div className="text-center text-white/40 py-8">Unable to load team header</div>}>
          <section className="relative rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden">
            {/* Banner Background - use team jersey color if available */}
            <div 
              className="absolute inset-0 bg-gradient-to-r from-emerald-900/20 to-cyan-900/20"
              style={team.jerseys?.[0]?.base ? {
                background: `linear-gradient(135deg, ${team.jerseys[0].base}33 0%, ${team.jerseys[0].base}11 100%)`
              } : undefined}
            />
            
            <div className="relative p-6 md:p-10">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                {/* Team Crest - Hero size, no circular container */}
                <TeamCrest 
                  teamId={teamId} 
                  teamName={team.name} 
                  size="hero"
                />

                <div className="flex-1 text-center md:text-left space-y-3">
                  {/* Team Name */}
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                    {team.name}
                  </h1>

                  {/* Country & Venue */}
                  <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 text-sm text-white/60">
                    <span className="flex items-center gap-1.5">
                      <span>{team.country}</span>
                    </span>
                    {team.venue && (
                      <>
                        <span className="text-white/20">•</span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {team.venue.name}
                          {team.venue.capacity > 0 && (
                            <span className="text-white/40">({team.venue.capacity.toLocaleString()})</span>
                          )}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Manager */}
                  {team.manager && (
                    <p className="text-emerald-400 font-medium text-sm">
                      Manager: {team.manager.name}
                    </p>
                  )}

                  {/* League Position & Record */}
                  {stats && (
                    <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm">
                      {stats.position && stats.leagueName && (
                        <div className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
                          <span className="text-emerald-400 font-semibold">
                            #{stats.position}
                          </span>
                          <span className="text-white/60 ml-1.5">{stats.leagueName}</span>
                        </div>
                      )}
                      <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                        <span className="text-white/50">Record:</span>{" "}
                        <span className="font-semibold">
                          {stats.wins}W - {stats.draws}D - {stats.losses}L
                        </span>
                      </div>
                      {stats.points !== null && (
                        <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                          <span className="font-bold text-white">{stats.points}</span>
                          <span className="text-white/50 ml-1">pts</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recent Form */}
                  {recentForm.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs text-white/40 mb-2">Recent Form</p>
                      <div className="flex justify-center md:justify-start gap-1.5">
                        {recentForm.map((match) => (
                          <div
                            key={match.eventId}
                            className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold ${
                              match.result === 'W' 
                                ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50' 
                                : match.result === 'D'
                                ? 'bg-amber-500/30 text-amber-400 border border-amber-500/50'
                                : match.result === 'L'
                                ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                                : 'bg-white/10 text-white/40 border border-white/20'
                            }`}
                            title={`vs ${match.isHome ? match.awayTeam.name : match.homeTeam.name}`}
                          >
                            {match.result || '?'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="pt-2 flex justify-center md:justify-start">
                    <FavoriteEntityButton
                      type="team"
                      entityId={team.id || teamId || team.name}
                      sport="soccer"
                      league={standing?.leagueName || "soccer"}
                      metadata={{
                        team_name: team.name,
                        team_code: team.abbreviation || null,
                        sport: "soccer",
                        country: team.country || null,
                      }}
                      label="Favorite Team"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </SectionErrorBoundary>

        {/* Coach G Intelligence Panel - Below hero */}
        <CoachGPanel teamId={teamId} />

        {/* 2) Quick Stats Bar */}
        {stats && (
          <SectionErrorBoundary fallback={<div className="text-center text-white/40 py-4">Stats unavailable</div>}>
            <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Played", value: stats.played },
                { label: "Goals Scored", value: stats.goalsScored },
                { label: "Goals Conceded", value: stats.goalsConceded },
                { label: "Goal Difference", value: stats.goalDifference, showSign: true },
                { label: "Clean Sheets", value: stats.cleanSheets },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-center"
                >
                  <p className={`text-2xl md:text-3xl font-bold ${
                    stat.showSign && stat.value > 0 ? 'text-emerald-400' : 
                    stat.showSign && stat.value < 0 ? 'text-red-400' : ''
                  }`}>
                    {stat.showSign && stat.value > 0 ? '+' : ''}{stat.value}
                  </p>
                  <p className="text-xs text-white/50 mt-1">{stat.label}</p>
                </div>
              ))}
            </section>
          </SectionErrorBoundary>
        )}

        {/* 3) Full Season Schedule Section */}
        <SectionErrorBoundary fallback={<div className="text-center text-white/40 py-4">Schedule unavailable</div>}>
          <section className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-white/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-semibold">Full Season Schedule</h2>
                </div>
                
                {/* Filter Tabs */}
                <div className="flex gap-1 bg-white/[0.05] rounded-lg p-1">
                  {(['all', 'results', 'upcoming'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setScheduleFilter(filter)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                        scheduleFilter === filter
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
                      }`}
                    >
                      {filter === 'all' ? 'All' : filter === 'results' ? `Results (${scheduleResults.length})` : `Upcoming (${scheduleUpcoming.length})`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div>
              {scheduleLoading ? (
                <div className="p-8 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              ) : (scheduleResults.length === 0 && scheduleUpcoming.length === 0) ? (
                <div className="p-8 text-center text-white/40 text-sm">
                  Season schedule unavailable.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {/* Results Section */}
                  {(scheduleFilter === 'all' || scheduleFilter === 'results') && scheduleResults.length > 0 && (
                    <>
                      {scheduleFilter === 'all' && (
                        <div className="px-4 py-2 bg-white/[0.02] sticky top-0">
                          <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Results</span>
                        </div>
                      )}
                      {scheduleResults.map((match) => {
                        const opponent = match.isHome ? match.awayTeam : match.homeTeam;
                        return (
                          <Link
                            key={match.eventId}
                            to={buildSoccerMatchUrl(match.eventId, { fromTeamId: teamId, from: "soccer-team" })}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
                          >
                            {/* Date */}
                            <div className="w-16 shrink-0 text-center">
                              <div className="text-xs text-white/40">{new Date(match.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                            </div>
                            
                            {/* Home/Away Badge */}
                            <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              match.isHome ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {match.isHome ? 'H' : 'A'}
                            </div>
                            
                            {/* Opponent */}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white/90 truncate">{opponent.name}</div>
                              <div className="text-xs text-white/40 truncate">{match.competition}</div>
                            </div>
                            
                            {/* Score */}
                            <div className="text-sm font-mono text-white/80 shrink-0">
                              {match.homeScore} - {match.awayScore}
                            </div>
                            
                            {/* Result Badge */}
                            <div className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0 ${
                              match.result === 'W' 
                                ? 'bg-emerald-500/30 text-emerald-400' 
                                : match.result === 'D'
                                ? 'bg-amber-500/30 text-amber-400'
                                : 'bg-red-500/30 text-red-400'
                            }`}>
                              {match.result}
                            </div>
                            
                            {/* Arrow */}
                            <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 shrink-0" />
                          </Link>
                        );
                      })}
                    </>
                  )}
                  
                  {/* Upcoming Section */}
                  {(scheduleFilter === 'all' || scheduleFilter === 'upcoming') && scheduleUpcoming.length > 0 && (
                    <>
                      {scheduleFilter === 'all' && (
                        <div className="px-4 py-2 bg-white/[0.02] sticky top-0">
                          <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Upcoming</span>
                        </div>
                      )}
                      {scheduleUpcoming.map((match) => {
                        const opponent = match.isHome ? match.awayTeam : match.homeTeam;
                        return (
                          <Link
                            key={match.eventId}
                            to={buildSoccerMatchUrl(match.eventId, { fromTeamId: teamId, from: "soccer-team" })}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
                          >
                            {/* Date */}
                            <div className="w-16 shrink-0 text-center">
                              <div className="text-xs text-white/40">{new Date(match.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              <div className="text-[10px] text-white/30">{new Date(match.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                            </div>
                            
                            {/* Home/Away Badge */}
                            <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              match.isHome ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {match.isHome ? 'H' : 'A'}
                            </div>
                            
                            {/* Opponent */}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white/90 truncate">{opponent.name}</div>
                              <div className="text-xs text-white/40 truncate">{match.competition}</div>
                            </div>
                            
                            {/* Live indicator or scheduled */}
                            {match.isLive ? (
                              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/20 shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-xs font-medium text-red-400">LIVE</span>
                              </div>
                            ) : (
                              <div className="text-xs text-white/30 shrink-0">Scheduled</div>
                            )}
                            
                            {/* Arrow */}
                            <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 shrink-0" />
                          </Link>
                        );
                      })}
                    </>
                  )}
                  
                  {/* Empty states for filtered views */}
                  {scheduleFilter === 'results' && scheduleResults.length === 0 && (
                    <div className="p-8 text-center text-white/40 text-sm">No results yet this season.</div>
                  )}
                  {scheduleFilter === 'upcoming' && scheduleUpcoming.length === 0 && (
                    <div className="p-8 text-center text-white/40 text-sm">No upcoming fixtures scheduled.</div>
                  )}
                </div>
              )}
            </div>
          </section>
        </SectionErrorBoundary>

        {/* 4) Squad Section */}
        <SectionErrorBoundary fallback={<div className="text-center text-white/40 py-4">Squad unavailable</div>}>
          <section className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">Squad</h2>
              </div>
              <span className="text-xs text-white/40">{sortedPlayers.length} players</span>
            </div>
            
            <div className="p-4 md:p-6">
              {sortedPlayers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sortedPlayers.map((player) => (
                    (() => {
                      const resolvedPlayerId = resolveSoccerPlayerRouteId(player);
                      const playerRoute = resolvedPlayerId
                        ? buildSoccerPlayerUrl(encodeURIComponent(resolvedPlayerId), { fromTeamId: teamId })
                        : null;
                      const cardClasses = [
                        "p-3 rounded-lg border flex items-center gap-3 transition-colors group",
                        resolvedPlayerId
                          ? "bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-emerald-500/30"
                          : "bg-white/[0.02] border-white/10 opacity-85",
                      ].join(" ");
                      const cardContent = (
                        <>
                          {/* Player Photo - HD ESPN headshot */}
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/10 to-white/5 overflow-hidden relative flex-shrink-0 ring-1 ring-white/10">
                            <img 
                              src={getPlayerPhoto(player.name)} 
                              alt={player.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => { 
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="hidden absolute inset-0 flex items-center justify-center text-sm font-bold text-white/60 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 group-hover:from-emerald-500/30 group-hover:to-cyan-500/30 transition-colors">
                              {player.jerseyNumber || player.name.charAt(0)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white/90 truncate group-hover:text-emerald-400 transition-colors">{player.name}</p>
                            <p className="text-xs text-white/40 capitalize flex items-center gap-1">
                              {player.jerseyNumber && <span className="text-white/30">#{player.jerseyNumber}</span>}
                              {player.jerseyNumber && <span className="text-white/20">·</span>}
                              {player.position}
                            </p>
                          </div>
                          {player.nationality && (
                            <span className="text-xs text-white/30">{player.nationality}</span>
                          )}
                          <ChevronRight className={`w-4 h-4 transition-colors ${resolvedPlayerId ? "text-white/20 group-hover:text-emerald-400/60" : "text-white/15"}`} />
                        </>
                      );
                      if (playerRoute) {
                        return (
                          <Link
                            key={`${player.name}:${resolvedPlayerId}`}
                            to={playerRoute}
                            className={cardClasses}
                            data-soccer-player-row="true"
                            data-clickable="true"
                          >
                            {cardContent}
                          </Link>
                        );
                      }
                      return (
                        <div
                          key={`${player.name}:no-id`}
                          className={cardClasses}
                          aria-disabled="true"
                          data-soccer-player-row="true"
                          data-clickable="false"
                        >
                          {cardContent}
                        </div>
                      );
                    })()
                  ))}
                </div>
              ) : (
                <p className="text-center text-white/30 text-sm py-8">Roster not available yet.</p>
              )}
            </div>
          </section>
        </SectionErrorBoundary>

        {/* 5) Injuries & Transfers Section - Placeholder since API doesn't provide this */}
        <SectionErrorBoundary fallback={null}>
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current Injuries */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <Activity className="w-5 h-5 text-red-400" />
                <h2 className="text-lg font-semibold">Injuries</h2>
              </div>
              <div className="p-4">
                <p className="text-center text-white/30 text-sm py-4">
                  Injury data not available via API
                </p>
              </div>
            </div>

            {/* Team Stats/Info */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-semibold">Team Info</h2>
              </div>
              <div className="p-4 space-y-3">
                {team.foundedYear && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Founded</span>
                    <span>{team.foundedYear}</span>
                  </div>
                )}
                {team.venue && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Stadium</span>
                    <span>{team.venue.name}</span>
                  </div>
                )}
                {team.venue?.city && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">City</span>
                    <span>{team.venue.city}</span>
                  </div>
                )}
                {team.venue?.capacity && team.venue.capacity > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Capacity</span>
                    <span>{team.venue.capacity.toLocaleString()}</span>
                  </div>
                )}
                {team.manager && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Manager</span>
                    <span>{team.manager.name}</span>
                  </div>
                )}
                {team.country && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Country</span>
                    <span>{team.country}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </SectionErrorBoundary>

        {/* 6) Coach G Team Intelligence Section */}
        <SectionErrorBoundary fallback={null}>
          <section className="rounded-2xl bg-gradient-to-br from-emerald-900/10 to-cyan-900/10 border border-emerald-500/20 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-white/10 flex items-center gap-3">
              <Brain className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold">Coach G — Team Report</h2>
            </div>
            
            <div className="p-4 md:p-6 space-y-4">
              {/* Tactical Identity */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                <h3 className="text-sm font-medium text-emerald-400 mb-2">Form Analysis</h3>
                <p className="text-white/70 text-sm">
                  {stats ? (
                    <>
                      {team.name} has a {((stats.wins / Math.max(data.recentResults.length, 1)) * 100).toFixed(0)}% win rate 
                      from their last {data.recentResults.length} matches.
                      {stats.goalsScored > stats.goalsConceded 
                        ? ` Positive goal difference of +${stats.goalsScored - stats.goalsConceded} shows offensive strength.`
                        : stats.goalsScored < stats.goalsConceded
                        ? ` Negative goal difference of ${stats.goalsScored - stats.goalsConceded} suggests defensive concerns.`
                        : ' Balanced attack and defense with level goal difference.'}
                    </>
                  ) : (
                    'Insufficient data for form analysis.'
                  )}
                </p>
              </div>

              {/* Scoring Patterns */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                <h3 className="text-sm font-medium text-cyan-400 mb-2">Scoring Patterns</h3>
                <p className="text-white/70 text-sm">
                  {stats && data.recentResults.length > 0 ? (
                    <>
                      Averaging {(stats.goalsScored / data.recentResults.length).toFixed(1)} goals 
                      and conceding {(stats.goalsConceded / data.recentResults.length).toFixed(1)} per match.
                      {stats.cleanSheets > 0 && ` Kept ${stats.cleanSheets} clean sheets in recent matches.`}
                    </>
                  ) : (
                    'Insufficient data for scoring analysis.'
                  )}
                </p>
              </div>

              {/* Squad Depth */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                <h3 className="text-sm font-medium text-amber-400 mb-2">Squad Overview</h3>
                <p className="text-white/70 text-sm">
                  {sortedPlayers.length > 0 ? (
                    <>
                      {sortedPlayers.length}-player squad. 
                      {sortedPlayers.filter(p => p.position.toLowerCase().includes('goalkeeper')).length} goalkeepers, 
                      {sortedPlayers.filter(p => p.position.toLowerCase().includes('defender')).length} defenders, 
                      {sortedPlayers.filter(p => p.position.toLowerCase().includes('midfielder')).length} midfielders, 
                      {sortedPlayers.filter(p => p.position.toLowerCase().includes('forward') || p.position.toLowerCase().includes('striker')).length} forwards.
                    </>
                  ) : (
                    'Squad data not available.'
                  )}
                </p>
              </div>
            </div>
          </section>
        </SectionErrorBoundary>

        {/* Bottom Spacing */}
        <div className="h-8" />
      </div>
    </div>
  );
}

// Main export with error boundary wrapper
export default function SoccerTeamPage() {
  return (
    <SectionErrorBoundary fallback={<TeamPageErrorFallback />}>
      <SoccerTeamPageContent />
    </SectionErrorBoundary>
  );
}
