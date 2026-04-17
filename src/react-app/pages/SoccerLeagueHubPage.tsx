/**
 * SoccerLeagueHubPage - Matches NBA hub structure exactly
 * 
 * Route: /sports/soccer/league/:leagueId
 * Uses same SportHubLayout and Hub* components as NBA
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import { SportHubLayout, HubSection } from "@/react-app/components/hub/SportHubLayout";
import { LiveHeroMorph } from "@/react-app/components/hub/LiveHeroMorph";
import { LeaguePulseStrip } from "@/react-app/components/hub/LeaguePulseStrip";
import { Trophy, Users, Calendar, Pin, PinOff, Sparkles } from "lucide-react";
import { getSoccerLeagueMeta } from "@/react-app/lib/soccerLeagueMeta";
import { buildSoccerTeamUrl, buildSoccerMatchUrl, buildSoccerPlayerUrl } from "@/react-app/hooks/useSoccerBackNavigation";
import { fetchPlayerPhotos } from "@/react-app/lib/espnSoccer";
import { fetchJsonCached } from "@/react-app/lib/fetchCache";
import TeamCrest from "@/react-app/components/soccer/TeamCrest";
import { CoachGPanel } from "@/react-app/components/soccer/CoachGPanel";
import { CoachCommandCard } from "@/react-app/components/hub/CoachCommandCard";
import { PlayerSearch } from "@/react-app/components/PlayerSearch";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";
import { AnimatePresence, motion } from "framer-motion";
import AddToWatchboardModal from "@/react-app/components/AddToWatchboardModal";

interface HeroGame {
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

interface StandingsTeam {
  id: string;
  name: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

interface LeaderPlayer {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  stat: number;
}

interface MatchFixture {
  eventId: string;
  date: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  minute?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SoccerLeagueHubPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const leagueMeta = getSoccerLeagueMeta(leagueId);
  const [featuredGames, setFeaturedGames] = useState<HeroGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [standings, setStandings] = useState<StandingsTeam[]>([]);
  const [goalScorers, setGoalScorers] = useState<LeaderPlayer[]>([]);
  const [assists, setAssists] = useState<LeaderPlayer[]>([]);
  const [todayMatches, setTodayMatches] = useState<MatchFixture[]>([]);

  // Fetch league data - useEffect MUST come before any conditional returns (React hooks rules)
  useEffect(() => {
    async function fetchLeagueData() {
      if (!leagueId) return;
      
      setLoading(true);
      try {
        // Fetch schedule to find hero game and today's matches
        // Backend expects: /api/soccer/schedule/:competitionKey
        // Fetch all matches (not just upcoming) so Recent filter works
        const scheduleData = await fetchJsonCached<any>(`/api/soccer/schedule/${leagueId}?filter=all`, {
          cacheKey: `soccer-league-schedule:${leagueId}:all`,
          ttlMs: 30_000,
          timeoutMs: 4_500,
          init: { credentials: "include" },
        }).catch(() => null);
        if (scheduleData) {
          const matches = scheduleData.matches || [];
          const liveStatuses = new Set(['inprogress', 'live', 'halftime']);
          const finalStatuses = new Set(['closed', 'ended', 'finished', 'ft', 'full_time', 'complete', 'completed']);
          
          // Transform to our MatchFixture format
          const fixtures: MatchFixture[] = matches.map((m: any) => ({
            eventId: m.eventId,
            date: m.startTime,
            homeTeam: { id: m.homeTeamId || '', name: m.homeTeam || m.homeTeamName || 'TBD' },
            awayTeam: { id: m.awayTeamId || '', name: m.awayTeam || m.awayTeamName || 'TBD' },
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            status: liveStatuses.has(String(m.status || '').toLowerCase()) ? 'live' 
                  : finalStatuses.has(String(m.status || '').toLowerCase()) ? 'finished'
                  : 'scheduled',
            minute: m.matchTime || m.minute,
          }));
          
          // Sort fixtures by date for proper selection
          const sortedFixtures = [...fixtures].sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          
          // Find hero game: prioritize LIVE, then TODAY's matches, then NEXT upcoming
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const todayEnd = new Date(todayStart);
          todayEnd.setDate(todayEnd.getDate() + 1);
          
          // Build featured games list: all live games, then today's scheduled, then next few upcoming
          const liveMatches = sortedFixtures.filter((f) => f.status === 'live');
          
          const todayScheduledMatches = sortedFixtures.filter((f) => {
            if (f.status !== 'scheduled') return false;
            const matchDate = new Date(f.date);
            return matchDate >= now && matchDate < todayEnd;
          });
          
          // Next 3 upcoming games after today
          const upcomingMatches = sortedFixtures.filter((f) => {
            if (f.status !== 'scheduled') return false;
            return new Date(f.date) >= todayEnd;
          }).slice(0, 3);
          
          // Today's finals (most recent)
          const todayFinalMatches = sortedFixtures.filter((f) => {
            if (f.status !== 'finished') return false;
            const matchDate = new Date(f.date);
            return matchDate >= todayStart && matchDate < todayEnd;
          }).slice(-3);
          
          // Combine: Live first, then today scheduled, then today finals, then upcoming
          // Limit to 5 total for carousel
          const featuredList = [
            ...liveMatches,
            ...todayScheduledMatches,
            ...todayFinalMatches,
            ...upcomingMatches
          ].slice(0, 5);
          
          // Transform to HeroGame format
          const heroGames: HeroGame[] = featuredList.map((match) => ({
            id: match.eventId,
            homeTeam: {
              id: match.homeTeam.id,
              code: match.homeTeam.name.substring(0, 3).toUpperCase(),
              name: match.homeTeam.name,
              score: match.homeScore ?? 0,
            },
            awayTeam: {
              id: match.awayTeam.id,
              code: match.awayTeam.name.substring(0, 3).toUpperCase(),
              name: match.awayTeam.name,
              score: match.awayScore ?? 0,
            },
            status: match.status === 'live' ? 'LIVE' 
                  : match.status === 'finished' ? 'FINAL' 
                  : 'SCHEDULED',
            period: match.minute ? `${match.minute}'` : undefined,
            startTime: match.date,
          }));
          
          setFeaturedGames(heroGames);
          
          // Keep match list fresh: recent finals + upcoming week.
          const pastCutoff = new Date();
          pastCutoff.setHours(pastCutoff.getHours() - 24);
          const futureCutoff = new Date();
          futureCutoff.setDate(futureCutoff.getDate() + 7);
          
          const relevantMatches = fixtures.filter(f => {
            const matchDate = new Date(f.date);
            return matchDate >= pastCutoff && matchDate <= futureCutoff;
          });
          
          // Sort by date (live first, then by time)
          relevantMatches.sort((a, b) => {
            // Live matches first
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            // Then by date
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          });
          
          setTodayMatches(relevantMatches);
        }

        // Fetch standings - backend expects: /api/soccer/standings/:competitionKey
        const standingsData = await fetchJsonCached<any>(`/api/soccer/standings/${leagueId}`, {
          cacheKey: `soccer-league-standings:${leagueId}`,
          ttlMs: 30_000,
          timeoutMs: 4_500,
          init: { credentials: "include" },
        }).catch(() => null);
        if (standingsData) {
          // Transform standings to our format
          const transformedStandings: StandingsTeam[] = (standingsData.standings || []).map((t: any) => ({
            id: t.id || t.teamId || '',
            name: t.name || t.teamName || '',
            rank: t.rank || t.position || 0,
            played: t.played || t.gamesPlayed || 0,
            wins: t.wins || t.win || 0,
            draws: t.draws || t.draw || 0,
            losses: t.losses || t.loss || 0,
            goalsFor: t.goalsFor || t.goalsScored || 0,
            goalsAgainst: t.goalsAgainst || t.goalsConceded || 0,
            goalDifference: t.goalDifference || t.gd || 0,
            points: t.points || 0,
          }));
          setStandings(transformedStandings);
        }

        // Fetch leaders - use ESPN for Premier League (testing), SportsRadar for others
        const leadersEndpoint = leagueId === 'premier-league' 
          ? `/api/soccer/espn-leaders/${leagueId}`
          : `/api/soccer/leaders/${leagueId}`;
        console.log('[SoccerLeagueHub] Fetching leaders from:', leadersEndpoint);
        const leadersData = await fetchJsonCached<any>(leadersEndpoint, {
          cacheKey: `soccer-league-leaders:${leagueId}:${leadersEndpoint.includes('espn-leaders') ? 'espn' : 'sr'}`,
          ttlMs: 30_000,
          timeoutMs: 4_500,
          init: { credentials: "include" },
        }).catch(() => null);
        if (leadersData) {
          // Transform scorers
          const scorers: LeaderPlayer[] = (leadersData.topScorers || []).map((p: any) => ({
            id: p.playerId || p.id || '',
            name: p.name || p.playerName || '',
            teamId: p.teamId || '',
            teamName: p.teamName || p.team || '',
            stat: p.goals || p.stat || p.value || 0,
          }));
          // Transform assists
          const assistPlayers: LeaderPlayer[] = (leadersData.topAssists || []).map((p: any) => ({
            id: p.playerId || p.id || '',
            name: p.name || p.playerName || '',
            teamId: p.teamId || '',
            teamName: p.teamName || p.team || '',
            stat: p.assists || p.stat || p.value || 0,
          }));
          setGoalScorers(scorers);
          setAssists(assistPlayers);
        }
      } catch (err) {
        console.error('[SoccerLeagueHub] Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchLeagueData();
    const interval = setInterval(fetchLeagueData, 30000);
    return () => clearInterval(interval);
  }, [leagueId]);

  // Redirect check AFTER all hooks (React rules of hooks)
  if (!leagueId) {
    return <Navigate to="/sports/soccer" replace />;
  }
  
  const pulseGames = useMemo(
    () =>
      todayMatches.map((match) => ({
        status:
          match.status === "live"
            ? "LIVE"
            : match.status === "finished"
              ? "FINAL"
              : "SCHEDULED",
        home_score: match.homeScore ?? 0,
        away_score: match.awayScore ?? 0,
        period_label: match.minute,
        start_time: match.date,
      })),
    [todayMatches]
  );

  return (
    <>
      <SportHubLayout 
        sportKey="soccer"
        heroSlot={
          <section className="relative overflow-hidden border-b border-white/5">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-slate-900/45" />
            <div className="max-w-7xl mx-auto px-4 py-8">
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/35 flex items-center justify-center">
                    <span className="text-xl">⚽</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">{leagueMeta.name} Command Center</h1>
                    <p className="text-white/50 text-sm">{leagueMeta.country} • {leagueMeta.seasonLabel}</p>
                  </div>
                </div>
                <PlayerSearch
                  sport="Soccer"
                  placeholder="Search soccer players..."
                  className="w-full sm:w-72"
                />
              </div>
              <LiveHeroMorph
                sportKey="soccer"
                games={featuredGames}
                loading={loading}
                buildGameUrl={(gameId) => buildSoccerMatchUrl(gameId, { fromLeagueId: leagueId, from: "soccer-league" })}
              />
              <div className="mt-4">
                <CoachGPanel leagueId={leagueId} />
              </div>
            </div>
          </section>
        }
      >
        <div className="mb-6 -mt-1 rounded-2xl border border-white/8 bg-[rgba(15,23,42,0.55)] p-2">
          <LeaguePulseStrip sportKey="soccer" games={pulseGames} />
        </div>

        <HubSection
          id="coach-actions"
          title="Ask Coach G"
          subtitle="Quick insights with one tap"
          icon={<Sparkles className="h-5 w-5 text-emerald-400" />}
        >
          <CoachCommandCard sportKey="soccer" />
        </HubSection>

        {/* Standings Preview */}

        <HubSection
          id="standings"
          title="Standings"
          subtitle="League table"
          icon={<Trophy className="h-5 w-5 text-emerald-400" />}
        >
          <StandingsPreview 
            standings={standings} 
            leagueId={leagueId}
            loading={loading}
          />
        </HubSection>

        {/* Leaders Preview */}
        <HubSection
          id="leaders"
          title="Top Performers"
          subtitle="League leaders"
          icon={<Users className="h-5 w-5 text-emerald-400" />}
        >
          <LeadersPreview 
            goalScorers={goalScorers}
            assists={assists}
            loading={loading}
          />
        </HubSection>

        {/* Schedule / Fixtures */}
        <HubSection
          id="scores"
          title="Today's Games"
          subtitle={`${leagueMeta.name} schedule and recent results`}
          icon={<Calendar className="h-5 w-5 text-emerald-400" />}
        >
          <TodaysMatches 
            matches={todayMatches}
            leagueId={leagueId}
            loading={loading}
          />
        </HubSection>
      </SportHubLayout>
    </>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StandingsPreview({ standings, leagueId, loading }: { 
  standings: StandingsTeam[];
  leagueId: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 bg-white/5 rounded" />
        ))}
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className="text-center py-8 text-white/40">
        No standings data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="text-white/50 text-xs uppercase tracking-wider sticky top-0 bg-[#0a0a0a]">
          <tr className="border-b border-white/10">
            <th className="text-left py-3 px-2">#</th>
            <th className="text-left py-3 px-2">Team</th>
            <th className="text-center py-3 px-2">P</th>
            <th className="text-center py-3 px-2">W</th>
            <th className="text-center py-3 px-2">D</th>
            <th className="text-center py-3 px-2">L</th>
            <th className="text-center py-3 px-2">GD</th>
            <th className="text-center py-3 px-2">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team) => (
            <tr
              key={team.id}
              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
            >
              <td className="py-3 px-2 text-white/60">{team.rank}</td>
              <td className="py-3 px-2">
                <a
                  href={buildSoccerTeamUrl(team.id, { fromLeagueId: leagueId })}
                  className="flex items-center gap-2 font-medium hover:text-emerald-400 transition-colors"
                >
                  <TeamCrest teamId={team.id} teamName={team.name} size="sm" />
                  <span>{team.name}</span>
                </a>
              </td>
              <td className="py-3 px-2 text-center text-white/60">{team.played}</td>
              <td className="py-3 px-2 text-center text-white/60">{team.wins}</td>
              <td className="py-3 px-2 text-center text-white/60">{team.draws}</td>
              <td className="py-3 px-2 text-center text-white/60">{team.losses}</td>
              <td className="py-3 px-2 text-center text-white/60">
                {team.goalDifference > 0 ? '+' : ''}{team.goalDifference}
              </td>
              <td className="py-3 px-2 text-center font-semibold">{team.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadersPreview({ goalScorers, assists, loading }: {
  goalScorers: LeaderPlayer[];
  assists: LeaderPlayer[];
  loading: boolean;
}) {
  const [category, setCategory] = useState<'goals' | 'assists'>('goals');
  const [playerPhotos, setPlayerPhotos] = useState<Map<string, string>>(new Map());
  const leaders = category === 'goals' ? goalScorers : assists;
  
  // Load player photos asynchronously from TheSportsDB
  useEffect(() => {
    const allPlayers = [...goalScorers, ...assists];
    if (allPlayers.length === 0) return;
    
    const playerNames = [...new Set(allPlayers.map(p => p.name))];
    fetchPlayerPhotos(playerNames)
      .then(photoMap => setPlayerPhotos(photoMap))
      .catch(err => console.error('Failed to load player photos:', err));
  }, [goalScorers, assists]);
  
  const getPlayerPhoto = (name: string): string => {
    return playerPhotos.get(name) || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1e293b"/><text x="20" y="26" text-anchor="middle" fill="#94a3b8" font-size="16" font-family="system-ui">${name.charAt(0)}</text></svg>`)}`;
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-white/5 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Category tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setCategory('goals')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            category === 'goals'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          Goals
        </button>
        <button
          onClick={() => setCategory('assists')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            category === 'assists'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          Assists
        </button>
      </div>

      {leaders.length === 0 ? (
        <div className="text-center py-8 text-white/40">
          No {category} data available
        </div>
      ) : (
        <div className="space-y-2">
          {leaders.slice(0, 5).map((player, idx) => (
            <Link
              key={player.id}
              to={buildSoccerPlayerUrl(player.id, { fromTeamId: player.teamId })}
              className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/10 hover:border-emerald-500/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="text-white/40 font-medium w-6">{idx + 1}</div>
                <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                  <img 
                    src={getPlayerPhoto(player.name)} 
                    alt={player.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { 
                      e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1e293b"/><text x="20" y="26" text-anchor="middle" fill="#94a3b8" font-size="16" font-family="system-ui">${player.name.charAt(0)}</text></svg>`)}`; 
                    }}
                  />
                </div>
                <div>
                  <div className="font-medium group-hover:text-emerald-400 transition-colors">
                    {player.name}
                  </div>
                  <div className="text-xs text-white/50 flex items-center gap-1.5">
                    <TeamCrest teamId={player.teamId} teamName={player.teamName} size="sm" className="w-4 h-4" />
                    <span>{player.teamName}</span>
                  </div>
                </div>
              </div>
              <div className="text-xl font-bold text-emerald-400">
                {player.stat}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TodaysMatches({ matches, leagueId, loading }: {
  matches: MatchFixture[];
  leagueId: string;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming' | 'final'>('live');
  const { removeGame, isGameInWatchboard } = useWatchboards();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  
  // Modal state for watchboard selection
  const [watchboardModal, setWatchboardModal] = useState<{ open: boolean; gameId: string; gameSummary: string }>({ 
    open: false, gameId: '', gameSummary: '' 
  });
  
  const handleWatchToggle = async (e: React.MouseEvent, gameId: string, gameSummary: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isWatching = isGameInWatchboard(gameId);
    
    if (isWatching) {
      const success = await removeGame(gameId);
      if (success) {
        setToast({ message: "Removed from Watchboard", type: "info" });
        setTimeout(() => setToast(null), 2500);
      }
    } else {
      // Open modal for board selection
      setWatchboardModal({ open: true, gameId, gameSummary });
    }
  };

  const filteredMatches = matches.filter(m => {
    if (filter === 'all') return true;
    if (filter === 'live') return m.status === 'live';
    if (filter === 'upcoming') return m.status === 'scheduled';
    if (filter === 'final') return m.status === 'finished';
    return true;
  });

  // Keep the default experience fresh: prefer live, then upcoming.
  useEffect(() => {
    if (filter !== 'live') return;
    const hasLive = matches.some((m) => m.status === 'live');
    if (hasLive) return;
    const hasUpcoming = matches.some((m) => m.status === 'scheduled');
    setFilter(hasUpcoming ? 'upcoming' : 'all');
  }, [filter, matches]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-white/5 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-4 inline-flex gap-2 overflow-x-auto rounded-xl border border-white/10 bg-[#121821] p-1">
        {[
          { key: 'all' as const, label: 'All' },
          { key: 'live' as const, label: 'Live' },
          { key: 'upcoming' as const, label: 'Upcoming' },
          { key: 'final' as const, label: 'Results' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all ${
              filter === key
                ? 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                : 'text-white/60 hover:bg-white/8'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredMatches.length === 0 ? (
        <div className="text-center py-8 text-white/40">
          No {filter === 'all' ? '' : filter + ' '}matches found
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMatches.map((match) => {
            const isWatching = isGameInWatchboard(match.eventId);
            return (
            <a
              key={match.eventId}
              href={buildSoccerMatchUrl(match.eventId, { fromLeagueId: leagueId, from: "soccer-league" })}
              className="group relative block rounded-xl border border-white/10 bg-[#121821] p-4 transition-all hover:border-emerald-500/30"
            >
              {/* Quick-add watchboard button */}
              <button
                onClick={(e) => handleWatchToggle(e, match.eventId, `${match.homeTeam.name} vs ${match.awayTeam.name}`)}
                className={`absolute right-2 top-2 z-10 rounded-lg p-1.5 transition-all ${
                  isWatching 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
                }`}
                title={isWatching ? "Remove from Watchboard" : "Add to Watchboard"}
              >
                {isWatching ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </button>
              
              {/* Match date - shown above teams */}
              <div className="text-[10px] text-white/40 uppercase tracking-wide mb-2">
                {new Date(match.date).toLocaleDateString([], { 
                  weekday: 'short',
                  month: 'short', 
                  day: 'numeric'
                })}
              </div>
              
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 flex items-center justify-end gap-2">
                  <div className="font-medium text-right">{match.homeTeam.name}</div>
                  <TeamCrest teamId={match.homeTeam.id} teamName={match.homeTeam.name} size="sm" />
                </div>
                
                <div className="text-center px-4 min-w-[80px]">
                  {match.status === 'live' && match.minute ? (
                    <div className="text-emerald-400 font-bold">{match.minute}'</div>
                  ) : match.status === 'finished' ? (
                    <div className="text-white/40 text-sm">FT</div>
                  ) : (
                    <div className="text-white/40 text-sm">
                      {new Date(match.date).toLocaleTimeString([], { 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })}
                    </div>
                  )}
                  
                  {(match.status === 'live' || match.status === 'finished') && (
                    <div className="text-2xl font-bold mt-1">
                      {match.homeScore} - {match.awayScore}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 flex items-center gap-2">
                  <TeamCrest teamId={match.awayTeam.id} teamName={match.awayTeam.name} size="sm" />
                  <div className="font-medium">{match.awayTeam.name}</div>
                </div>
              </div>
            </a>
          );
          })}
        </div>
      )}
      
      {/* Add to Watchboard Modal */}
      <AddToWatchboardModal
        isOpen={watchboardModal.open}
        onClose={() => setWatchboardModal({ open: false, gameId: '', gameSummary: '' })}
        gameId={watchboardModal.gameId}
        gameSummary={watchboardModal.gameSummary}
        onSuccess={(boardName) => {
          setToast({ message: `Added to ${boardName}`, type: 'success' });
          setTimeout(() => setToast(null), 2500);
        }}
        onError={(error) => {
          setToast({ message: error, type: 'info' });
          setTimeout(() => setToast(null), 2500);
        }}
      />
      
      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium z-50 ${
              toast.type === 'success' 
                ? 'bg-emerald-500/90 text-white' 
                : 'bg-white/10 text-white/80'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
