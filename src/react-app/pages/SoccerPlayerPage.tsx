/**
 * SoccerPlayerPage - Player Profile Page
 * 
 * Route: /sports/soccer/player/:playerId
 * 
 * Features:
 * - Player info (position, nationality, age, height)
 * - Current team with link
 * - Season stats (goals, assists, appearances)
 * - Recent matches with links
 * - Competition context with link
 */

import { useParams, Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { 
  User, Calendar, Target, TrendingUp, 
  Loader2, ChevronRight, Activity, Trophy
} from "lucide-react";
import SoccerPageHeader, { buildPlayerBreadcrumbs } from "@/react-app/components/soccer/SoccerPageHeader";
import { useSoccerBackNavigation, buildSoccerTeamUrl, buildSoccerMatchUrl } from "@/react-app/hooks/useSoccerBackNavigation";
import { fetchPlayerPhoto } from "@/react-app/lib/espnSoccer";
import TeamCrest from "@/react-app/components/soccer/TeamCrest";

// ============================================================================
// TYPES
// ============================================================================

interface PlayerData {
  id: string;
  name: string;
  nationality: string;
  dateOfBirth: string | null;
  height: number | null;
  weight: number | null;
  position: string;
  jerseyNumber: number | null;
  team: {
    id: string;
    name: string;
  } | null;
  competition: {
    id: string;
    name: string;
  } | null;
}

interface SeasonStats {
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number;
}

interface RecentMatch {
  eventId: string;
  date: string;
  competition: string;
  opponent: string;
  opponentId: string;
  result: string; // "W 3-1", "D 1-1", "L 0-2"
  goals: number;
  assists: number;
  minutesPlayed: number;
}

// ============================================================================
// PLAYER PHOTO COMPONENT
// ============================================================================

function PlayerPhoto({ 
  photoUrl, 
  name, 
  jerseyNumber 
}: { 
  photoUrl: string | null; 
  name: string; 
  jerseyNumber: number | null;
}) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Reset error state when URL changes
  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
  }, [photoUrl]);

  const showFallback = !photoUrl || imgError;

  return (
    <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-white/20 flex items-center justify-center overflow-hidden">
      {!showFallback && (
        <img 
          src={photoUrl}
          alt={name}
          className={`w-full h-full object-cover transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />
      )}
      {(showFallback || !imgLoaded) && (
        <div className={`absolute inset-0 flex items-center justify-center ${!showFallback && imgLoaded ? 'hidden' : ''}`}>
          {jerseyNumber ? (
            <span className="text-4xl font-bold text-white/60">#{jerseyNumber}</span>
          ) : (
            <User className="w-16 h-16 text-white/30" />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SoccerPlayerPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const [searchParams] = useSearchParams();
  const fromTeamId = searchParams.get("fromTeamId");
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [stats, setStats] = useState<SeasonStats | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerPhotoUrl, setPlayerPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    async function fetchPlayer() {
      if (!playerId) return;

      setLoading(true);
      setError(null);

      try {
        // Add 10 second timeout to fail fast instead of hanging
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const res = await fetch(`/api/soccer/player/${playerId}`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          if (mounted) {
            setError('Unable to load player profile');
            setPlayer(null);
            setStats(null);
            setRecentMatches([]);
          }
          return;
        }

        const data = await res.json();
        
        if (!mounted) return; // Don't update state if unmounted
        
        // Check if player was actually found - API returns found:false for unknown players
        if (!data.found) {
          setError('Player not found in our database');
          setPlayer(null);
          setStats(null);
          setRecentMatches([]);
          return;
        }
        
        setPlayer(data.player);
        setStats(data.stats || null);
        setRecentMatches(data.recentMatches || []);
        // Use API's photoUrl if available
        if (data.player?.photoUrl) {
          setPlayerPhotoUrl(data.player.photoUrl);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          if (mounted) {
            setError('Request timed out - player data is taking too long to load');
            setPlayer(null);
            setStats(null);
            setRecentMatches([]);
          }
          return;
        }
        
        console.error('Player fetch error:', err);
        if (mounted) {
          setError('Unable to load player profile');
          setPlayer(null);
          setStats(null);
          setRecentMatches([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchPlayer();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [playerId]);

  // Fetch player photo from ESPN (fallback if API didn't provide one)
  useEffect(() => {
    if (player?.name && !playerPhotoUrl) {
      fetchPlayerPhoto(player.name).then(url => {
        if (url) setPlayerPhotoUrl(url);
      });
    }
  }, [player?.name, playerPhotoUrl]);

  // Smart back navigation - uses fromTeamId param or player's team
  const teamIdForNav = fromTeamId || player?.team?.id;
  const { goBack } = useSoccerBackNavigation({
    pageType: "player",
    teamId: teamIdForNav || undefined,
  });

  // Calculate age from DOB
  const getAge = (dob: string | null): number | null => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <p className="text-white/60">Loading player...</p>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <SoccerPageHeader
          breadcrumbs={[{ label: 'Player' }]}
          title="Player Not Found"
          onBack={goBack}
        />
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-center py-20">
            <User className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">{error || 'Unable to load player profile'}</p>
            <button
              onClick={goBack}
              className="mt-4 px-4 py-2 text-sm text-emerald-400 hover:underline"
            >
              ← Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const age = getAge(player.dateOfBirth);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SoccerPageHeader
        breadcrumbs={buildPlayerBreadcrumbs(
          player.name,
          player.team ? { id: player.team.id, name: player.team.name } : undefined
        )}
        title={player.name}
        subtitle={[
          player.position,
          player.team?.name,
        ].filter(Boolean).join(' • ')}
        onBack={goBack}
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Player Hero Card */}
        <section className="rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden">
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center gap-6">
              {/* Player Photo */}
              <PlayerPhoto 
                photoUrl={playerPhotoUrl}
                name={player.name}
                jerseyNumber={player.jerseyNumber}
              />

              <div className="flex-1 text-center md:text-left space-y-3">
                <h1 className="text-3xl md:text-4xl font-bold">{player.name}</h1>
                
                <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm">
                  {/* Position */}
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-medium capitalize">
                    {player.position}
                  </div>
                  
                  {/* Team Link */}
                  {player.team && (
                    <Link
                      to={buildSoccerTeamUrl(player.team.id)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors flex items-center gap-1.5"
                    >
                      <TeamCrest teamId={player.team.id} teamName={player.team.name} size="sm" className="w-5 h-5" />
                      {player.team.name}
                    </Link>
                  )}
                  
                  {/* Competition Link */}
                  {player.competition && (
                    <Link
                      to={`/sports/soccer/league/${player.competition.id}`}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors flex items-center gap-1.5"
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      {player.competition.name}
                    </Link>
                  )}
                </div>

                {/* Bio Details */}
                <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-white/60">
                  {player.nationality && (
                    <span>{player.nationality}</span>
                  )}
                  {age && (
                    <span>{age} years old</span>
                  )}
                  {player.height && (
                    <span>{player.height} cm</span>
                  )}
                  {player.weight && (
                    <span>{player.weight} kg</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Season Stats */}
        {stats && (
          <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Appearances', value: stats.appearances, icon: Calendar },
              { label: 'Goals', value: stats.goals, icon: Target, highlight: true },
              { label: 'Assists', value: stats.assists, icon: TrendingUp, highlight: true },
              { label: 'Minutes', value: stats.minutesPlayed, icon: Activity },
              { label: 'Yellow', value: stats.yellowCards, color: 'amber' },
              { label: 'Red', value: stats.redCards, color: 'red' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-center"
              >
                <p className={`text-2xl font-bold ${
                  stat.highlight ? 'text-emerald-400' : 
                  stat.color === 'amber' ? 'text-amber-400' :
                  stat.color === 'red' ? 'text-red-400' : ''
                }`}>
                  {stat.value}
                </p>
                <p className="text-xs text-white/50 mt-1">{stat.label}</p>
              </div>
            ))}
          </section>
        )}

        {/* Recent Matches */}
        <section className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Recent Matches</h2>
          </div>
          
          <div className="divide-y divide-white/5">
            {recentMatches.length > 0 ? (
              recentMatches.map((match) => (
                <Link
                  key={match.eventId}
                  to={buildSoccerMatchUrl(match.eventId, {
                    fromTeamId: teamIdForNav || undefined,
                    from: "soccer-player",
                  })}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
                >
                  <div className="w-16 text-xs text-white/40 text-center">
                    {new Date(match.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white/60">vs</span>
                      <Link
                        to={buildSoccerTeamUrl(match.opponentId)}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-white hover:text-emerald-400 transition-colors truncate"
                      >
                        {match.opponent}
                      </Link>
                    </div>
                    <div className="text-xs text-white/40 truncate">{match.competition}</div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-bold ${
                    match.result.startsWith('W') ? 'bg-emerald-500/20 text-emerald-400' :
                    match.result.startsWith('D') ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {match.result}
                  </div>
                  <div className="text-right text-sm">
                    {match.goals > 0 && <span className="text-emerald-400">{match.goals}G</span>}
                    {match.goals > 0 && match.assists > 0 && <span className="text-white/30 mx-1">•</span>}
                    {match.assists > 0 && <span className="text-cyan-400">{match.assists}A</span>}
                    {match.goals === 0 && match.assists === 0 && (
                      <span className="text-white/30">{match.minutesPlayed}'</span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40" />
                </Link>
              ))
            ) : (
              <div className="px-4 py-12 text-center text-white/40">
                <Activity className="w-12 h-12 mx-auto mb-3 text-white/20" />
                <p className="text-sm">No recent matches</p>
                <p className="text-xs text-white/30 mt-1">Match history will appear as the season progresses</p>
              </div>
            )}
          </div>
        </section>

        {/* Quick Links */}
        <section className="rounded-2xl bg-white/[0.02] border border-white/10 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={goBack}
              className="px-3 py-2 text-sm text-white/60 bg-white/[0.05] rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              ← Go Back
            </button>
            {player.team && (
              <Link
                to={buildSoccerTeamUrl(player.team.id)}
                className="px-3 py-2 text-sm text-white/60 bg-white/[0.05] rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                View {player.team.name}
              </Link>
            )}
            <Link
              to="/sports/soccer"
              className="px-3 py-2 text-sm text-white/60 bg-white/[0.05] rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              All Soccer
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
