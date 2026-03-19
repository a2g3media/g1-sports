import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, TrendingUp, TrendingDown, Trophy, MapPin, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { getTeamColors } from "@/react-app/lib/teamColors";

interface TeamStanding {
  rank: number;
  teamId: string;
  teamCode: string;
  teamName: string;
  city: string;
  wins: number;
  losses: number;
  pct: number;
  gb: string;
  streak: { type: "W" | "L"; count: number };
  last10: { wins: number; losses: number };
  homeRecord?: string;
  awayRecord?: string;
  confRecord?: string;
}

interface ConferenceData {
  name: string;
  teams: TeamStanding[];
}

// Sport-specific conference/division labels
const SPORT_LABELS: Record<string, { conf1: string; conf2: string; conf1Short: string; conf2Short: string }> = {
  nba: { conf1: "Eastern Conference", conf2: "Western Conference", conf1Short: "Eastern", conf2Short: "Western" },
  nfl: { conf1: "AFC", conf2: "NFC", conf1Short: "AFC", conf2Short: "NFC" },
  mlb: { conf1: "American League", conf2: "National League", conf1Short: "AL", conf2Short: "NL" },
  nhl: { conf1: "Eastern Conference", conf2: "Western Conference", conf1Short: "Eastern", conf2Short: "Western" },
  ncaab: { conf1: "Top 25", conf2: "Conference", conf1Short: "Top 25", conf2Short: "Conf" },
  ncaaf: { conf1: "Top 25", conf2: "Conference", conf1Short: "Top 25", conf2Short: "Conf" },
};

interface HubStandingsProps {
  sportKey: string;
}

const NBA_TEAM_CODE_BY_NAME: Record<string, string> = {
  "atlanta hawks": "ATL",
  "boston celtics": "BOS",
  "brooklyn nets": "BKN",
  "charlotte hornets": "CHA",
  "chicago bulls": "CHI",
  "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL",
  "denver nuggets": "DEN",
  "detroit pistons": "DET",
  "golden state warriors": "GSW",
  "houston rockets": "HOU",
  "indiana pacers": "IND",
  "la clippers": "LAC",
  "los angeles clippers": "LAC",
  "los angeles lakers": "LAL",
  "memphis grizzlies": "MEM",
  "miami heat": "MIA",
  "milwaukee bucks": "MIL",
  "minnesota timberwolves": "MIN",
  "new orleans pelicans": "NOP",
  "new york knicks": "NYK",
  "oklahoma city thunder": "OKC",
  "orlando magic": "ORL",
  "philadelphia 76ers": "PHI",
  "phoenix suns": "PHX",
  "portland trail blazers": "POR",
  "sacramento kings": "SAC",
  "san antonio spurs": "SAS",
  "toronto raptors": "TOR",
  "utah jazz": "UTA",
  "washington wizards": "WAS",
};

function deriveTeamCode(team: Record<string, unknown>, sportKey: string): string {
  const alias = typeof team.alias === "string" ? team.alias : "";
  const abbreviation = typeof team.abbreviation === "string" ? team.abbreviation : "";
  const directCode = (alias || abbreviation).toString().trim();
  if (directCode) return directCode.toUpperCase();

  if (sportKey.toLowerCase() === "nba") {
    const market = typeof team.market === "string" ? team.market : "";
    const name = typeof team.name === "string" ? team.name : "";
    const fullName = `${market} ${name}`.trim().toLowerCase();
    const mapped = NBA_TEAM_CODE_BY_NAME[fullName];
    if (mapped) return mapped;
  }

  return "???";
}

export function HubStandings({ sportKey }: HubStandingsProps) {
  const [activeConf, setActiveConf] = useState<"east" | "west">("east");
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [standings, setStandings] = useState<{ east: ConferenceData; west: ConferenceData } | null>(null);

  // Sport-specific labels
  const labels = SPORT_LABELS[sportKey] || SPORT_LABELS.nba;

  useEffect(() => {
    const fetchStandings = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/teams/${sportKey.toUpperCase()}/standings`);
        if (!res.ok) {
          throw new Error('Failed to fetch standings');
        }
        const data = await res.json();
        
        // API returns flat teams array with conferenceName field
        const allTeams = data.teams || [];
        
        // Helper to filter teams by conference patterns
        const isEasternConf = (confName: string) => {
          const lower = confName?.toLowerCase() || '';
          return lower.includes('east') || lower.includes('american') || lower.includes('afc');
        };
        
        const isWesternConf = (confName: string) => {
          const lower = confName?.toLowerCase() || '';
          return lower.includes('west') || lower.includes('national') || lower.includes('nfc');
        };
        
        // Partition teams by conference
        const eastTeams = allTeams.filter((t: any) => isEasternConf(t.conferenceName));
        const westTeams = allTeams.filter((t: any) => isWesternConf(t.conferenceName));

        const transformTeams = (teams: any[], confName: string): ConferenceData => {
          if (!teams.length) {
            return { name: confName, teams: [] };
          }

          // Sort by wins descending, then win percentage
          const sorted = [...teams].sort((a: any, b: any) => {
            const aWins = a.wins || 0;
            const bWins = b.wins || 0;
            if (bWins !== aWins) return bWins - aWins;
            const aPct = a.winPct || (aWins / Math.max(1, aWins + (a.losses || 0)));
            const bPct = b.winPct || (bWins / Math.max(1, bWins + (b.losses || 0)));
            return bPct - aPct;
          });

          // Take top 8
          const topTeams = sorted.slice(0, 8);

          // Calculate games behind leader
          const leaderWins = topTeams[0]?.wins || 0;
          const leaderLosses = topTeams[0]?.losses || 0;

          return {
            name: confName,
            teams: topTeams.map((team: any, index: number) => {
              const wins = team.wins || 0;
              const losses = team.losses || 0;
              const totalGames = wins + losses;
              const pct = totalGames > 0 ? wins / totalGames : 0;
              
              // GB calculation
              const gbNum = ((leaderWins - wins) + (losses - leaderLosses)) / 2;
              const gb = index === 0 ? "-" : gbNum.toFixed(1);

              // Parse streak from "W5" or "L3" format
              const streakMatch = team.streak?.match(/^([WL])(\d+)$/);
              const streak = streakMatch 
                ? { type: streakMatch[1] as 'W' | 'L', count: parseInt(streakMatch[2]) }
                : { type: 'W' as 'W' | 'L', count: 0 };

              // Parse last 10 from "7-3" format
              const last10Match = team.lastTen?.match(/^(\d+)-(\d+)$/);
              const last10 = last10Match 
                ? { wins: parseInt(last10Match[1]), losses: parseInt(last10Match[2]) }
                : { wins: Math.round(pct * 10), losses: 10 - Math.round(pct * 10) };

              return {
                rank: team.rank || index + 1,
                teamId: team.id || team.alias?.toLowerCase() || `team-${index}`,
                teamCode: deriveTeamCode(team, sportKey),
                teamName: team.name || 'Unknown',
                city: team.market || team.city || '',
                wins,
                losses,
                pct,
                gb: team.gamesBack?.toString() || gb,
                streak,
                last10,
                confRecord: team.confWins !== undefined ? `${team.confWins}-${team.confLosses}` : undefined,
              };
            }),
          };
        };

        setStandings({
          east: transformTeams(eastTeams, labels.conf1),
          west: transformTeams(westTeams, labels.conf2),
        });
      } catch (err) {
        console.error('[HubStandings] Error fetching standings:', err);
        setError('Unable to load standings');
      } finally {
        setLoading(false);
      }
    };

    fetchStandings();
  }, [sportKey, labels.conf1, labels.conf2]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !standings) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">{error || 'Standings unavailable'}</p>
      </div>
    );
  }

  const eastData = standings.east;
  const westData = standings.west;

  return (
    <div className="space-y-4">
      {/* Conference Toggle */}
      <div className="flex items-center justify-center gap-2">
        <ConferenceTab 
          label={labels.conf1Short} 
          active={activeConf === "east"} 
          onClick={() => setActiveConf("east")}
          color="blue"
        />
        <ConferenceTab 
          label={labels.conf2Short} 
          active={activeConf === "west"} 
          onClick={() => setActiveConf("west")}
          color="red"
        />
      </div>

      {/* Standings Table */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeConf}
          initial={{ opacity: 0, x: activeConf === "east" ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: activeConf === "east" ? 20 : -20 }}
          transition={{ duration: 0.2 }}
        >
          <StandingsCard 
            conference={activeConf === "east" ? eastData : westData}
            sportKey={sportKey}
            hoveredTeam={hoveredTeam}
            setHoveredTeam={setHoveredTeam}
          />
        </motion.div>
      </AnimatePresence>

      {/* Conference Leaders - Top 4 teams per conference */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MiniStandingsCard conference={eastData} label={labels.conf1Short} sportKey={sportKey} />
        <MiniStandingsCard conference={westData} label={labels.conf2Short} sportKey={sportKey} />
      </div>
    </div>
  );
}

interface ConferenceTabProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color: "blue" | "red";
}

function ConferenceTab({ label, active, onClick, color }: ConferenceTabProps) {
  const colors = {
    blue: {
      active: "bg-blue-500/20 border-blue-500/50 text-blue-400",
      inactive: "bg-white/5 border-white/10 text-white/50 hover:bg-white/10",
    },
    red: {
      active: "bg-red-500/20 border-red-500/50 text-red-400",
      inactive: "bg-white/5 border-white/10 text-white/50 hover:bg-white/10",
    },
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl border font-bold text-sm transition-all min-w-[80px] min-h-[44px] active:scale-95 ${
        active ? colors[color].active : colors[color].inactive
      }`}
    >
      {label}
    </button>
  );
}

interface StandingsCardProps {
  conference: ConferenceData;
  sportKey: string;
  hoveredTeam: string | null;
  setHoveredTeam: (id: string | null) => void;
}

function StandingsCard({ conference, sportKey, hoveredTeam, setHoveredTeam }: StandingsCardProps) {
  if (conference.teams.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-8 text-center">
        <p className="text-muted-foreground text-sm">No standings data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[var(--sport-accent)]" />
            <span className="font-bold text-white text-sm">{conference.name}</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-white/40 uppercase tracking-wider">
            <span className="w-10 text-center">W-L</span>
            <span className="w-10 text-center hidden sm:block">PCT</span>
            <span className="w-8 text-center">GB</span>
            <span className="w-12 text-center">STRK</span>
            <span className="w-14 text-center hidden sm:block">L10</span>
          </div>
        </div>
      </div>

      {/* Teams */}
      <div className="divide-y divide-white/5">
        {conference.teams.map((team, index) => (
          <div key={team.teamId}>
            {/* Playoff cutoff line after #6 */}
            {index === 6 && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/5 border-y border-emerald-500/20">
                <div className="h-px flex-1 bg-emerald-500/30" />
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Playoff Cutoff</span>
                <div className="h-px flex-1 bg-emerald-500/30" />
              </div>
            )}
            {/* Play-in cutoff line after #10 (if showing more than 8 teams) */}
            {index === 10 && conference.teams.length > 10 && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/5 border-y border-blue-500/20">
                <div className="h-px flex-1 bg-blue-500/30" />
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Play-In Cutoff</span>
                <div className="h-px flex-1 bg-blue-500/30" />
              </div>
            )}
            <TeamRow 
              team={team}
              index={index}
              sportKey={sportKey}
              isHovered={hoveredTeam === team.teamId}
              onHover={() => setHoveredTeam(team.teamId)}
              onLeave={() => setHoveredTeam(null)}
            />
          </div>
        ))}
      </div>

    </div>
  );
}

interface TeamRowProps {
  team: TeamStanding;
  index: number;
  sportKey: string;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}

function TeamRow({ team, index, sportKey, isHovered, onHover, onLeave }: TeamRowProps) {
  const isPlayoffSpot = team.rank <= 6;
  const isPlayIn = team.rank === 7 || team.rank === 8;
  const teamColors = getTeamColors(sportKey, team.teamCode);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Link
        to={`/sports/${sportKey}/team/${team.teamId}`}
        className={`relative flex items-center justify-between px-3 sm:px-4 py-3 sm:py-3 transition-all group ${
          isHovered ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
        }`}
        style={{
          borderLeft: isHovered ? `3px solid ${teamColors.primary}` : '3px solid transparent',
        }}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
      >
        {/* Rank + Team */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Rank badge */}
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
            team.rank === 1 
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black' 
              : isPlayoffSpot 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : isPlayIn
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-white/10 text-white/50'
          }`}>
            {team.rank}
          </div>

          {/* Team logo + name */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <img 
              src={`https://a.espncdn.com/i/teamlogos/${sportKey}/500/${team.teamCode.toLowerCase()}.png`}
              alt={team.teamName}
              className="w-6 h-6 sm:w-8 sm:h-8 object-contain flex-shrink-0"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
            <div className="min-w-0">
              <div className="font-semibold text-white text-xs sm:text-sm truncate group-hover:text-[var(--sport-accent)] transition-colors">
                {team.teamName}
              </div>
              <div className="text-[10px] text-white/30 items-center gap-1 hidden sm:flex">
                <MapPin className="h-2.5 w-2.5" />
                {team.city}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          {/* W-L */}
          <div className="w-10 text-center font-mono">
            <span className="text-white/90">{team.wins}</span>
            <span className="text-white/30">-</span>
            <span className="text-white/60">{team.losses}</span>
          </div>

          {/* PCT - hidden on mobile */}
          <div className="w-10 text-center hidden sm:block">
            <span className="text-white/60 text-xs">{team.pct.toFixed(3).slice(1)}</span>
          </div>

          {/* GB */}
          <div className="w-8 text-center">
            <span className={`text-xs font-medium ${
              team.gb === "-" ? 'text-amber-400' : 'text-white/50'
            }`}>
              {team.gb}
            </span>
          </div>

          {/* Streak */}
          <div className="w-12 flex justify-center">
            <StreakBadge streak={team.streak} />
          </div>

          {/* Last 10 - hidden on mobile */}
          <div className="w-14 hidden sm:flex items-center justify-center gap-1">
            <span className="text-emerald-400 text-xs font-medium">{team.last10.wins}</span>
            <span className="text-white/20">-</span>
            <span className="text-red-400/70 text-xs">{team.last10.losses}</span>
          </div>

          {/* Arrow */}
          <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-[var(--sport-accent)] transition-colors" />
        </div>
      </Link>
    </motion.div>
  );
}

function StreakBadge({ streak }: { streak: { type: "W" | "L"; count: number } }) {
  const isWin = streak.type === "W";
  
  if (streak.count === 0) {
    return <span className="text-xs text-white/30">-</span>;
  }
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
      isWin 
        ? 'bg-emerald-500/20 text-emerald-400' 
        : 'bg-red-500/20 text-red-400'
    }`}>
      {isWin ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
      )}
      {streak.type}{streak.count}
    </div>
  );
}

interface MiniStandingsCardProps {
  conference: ConferenceData;
  label: string;
  sportKey: string;
}

function MiniStandingsCard({ conference, label, sportKey }: MiniStandingsCardProps) {
  const topTeams = conference.teams.slice(0, 4);
  
  if (topTeams.length === 0) {
    return null;
  }
  
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-white">{label} Leaders</span>
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
          label.toLowerCase().includes("east") || label.toLowerCase().includes("al") || label.toLowerCase().includes("afc")
            ? 'bg-blue-500/20 text-blue-400' 
            : 'bg-red-500/20 text-red-400'
        }`}>
          Top 4
        </span>
      </div>
      
      <div className="space-y-2">
        {topTeams.map((team) => (
          <Link
            key={team.teamId}
            to={`/sports/${sportKey}/team/${team.teamId}`}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                team.rank === 1 
                  ? 'bg-amber-500/30 text-amber-400' 
                  : 'bg-white/10 text-white/50'
              }`}>
                {team.rank}
              </span>
              <img 
                src={`https://a.espncdn.com/i/teamlogos/${sportKey}/500/${team.teamCode.toLowerCase()}.png`}
                alt={team.teamName}
                className="w-5 h-5 object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <span className="text-sm text-white/80 group-hover:text-white transition-colors">
                {team.teamCode}
              </span>
            </div>
            <span className="text-xs text-white/50 font-mono">
              {team.wins}-{team.losses}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default HubStandings;
