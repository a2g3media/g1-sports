import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Trophy, Loader2 } from "lucide-react";
import { buildSoccerTeamUrl } from "@/react-app/hooks/useSoccerBackNavigation";

interface TeamStanding {
  rank: number;
  teamId: string;
  teamName: string;
  teamLogo?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form?: string[]; // Last 5 results: W, D, L
}

interface Competition {
  key: string;
  id: string;
  name: string;
  country: string;
  type: string;
}

// Popular leagues shown first
const FEATURED_LEAGUES = [
  "premier-league",
  "la-liga",
  "serie-a",
  "bundesliga",
  "ligue-1",
  "mls",
  "champions-league",
];

export function SoccerHubStandings() {
  const [selectedLeague, setSelectedLeague] = useState("premier-league");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [competitionName, setCompetitionName] = useState("Premier League");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available competitions
  useEffect(() => {
    fetch("/api/soccer/competitions")
      .then(res => res.json())
      .then(data => {
        const allComps = [...(data.leagues || []), ...(data.cups || []), ...(data.international || [])];
        // Sort: featured first, then alphabetically
        allComps.sort((a, b) => {
          const aFeatured = FEATURED_LEAGUES.indexOf(a.key);
          const bFeatured = FEATURED_LEAGUES.indexOf(b.key);
          if (aFeatured !== -1 && bFeatured !== -1) return aFeatured - bFeatured;
          if (aFeatured !== -1) return -1;
          if (bFeatured !== -1) return 1;
          return a.name.localeCompare(b.name);
        });
        setCompetitions(allComps);
      })
      .catch(console.error);
  }, []);

  // Fetch standings for selected league
  useEffect(() => {
    const fetchStandings = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/soccer/standings/${selectedLeague}`);
        if (!res.ok) throw new Error("Failed to fetch standings");
        
        const data = await res.json();
        
        if (data.competition) {
          setCompetitionName(data.competition.name || selectedLeague);
        }
        
        // Transform API response to our format
        const transformed: TeamStanding[] = (data.standings || []).map((team: any) => ({
          rank: team.rank || 0,
          teamId: team.teamId || "",
          teamName: team.teamName || "Unknown",
          teamLogo: team.teamLogo,
          played: team.played || 0,
          wins: team.wins || 0,
          draws: team.draws || 0,
          losses: team.losses || 0,
          goalsFor: team.goalsFor || 0,
          goalsAgainst: team.goalsAgainst || 0,
          goalDifference: team.goalDifference || 0,
          points: team.points || 0,
          form: team.form || [],
        }));
        
        setStandings(transformed);
      } catch (err) {
        console.error("[SoccerHubStandings] Error:", err);
        setError("Unable to load standings");
      } finally {
        setLoading(false);
      }
    };
    
    fetchStandings();
  }, [selectedLeague]);

  const selectedComp = competitions.find(c => c.key === selectedLeague);

  return (
    <div className="space-y-4">
      {/* League Selector */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-white text-sm">{competitionName}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">
                {selectedComp?.country || "Select League"}
              </div>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {/* Dropdown */}
        <AnimatePresence>
          {dropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-50 w-full mt-2 rounded-xl border border-white/10 bg-[#0f0f0f] shadow-2xl overflow-hidden max-h-80 overflow-y-auto"
            >
              {/* Featured Leagues */}
              <div className="px-3 py-2 border-b border-white/5">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Top Leagues</span>
              </div>
              {competitions.filter(c => FEATURED_LEAGUES.includes(c.key)).map(comp => (
                <LeagueOption 
                  key={comp.key}
                  comp={comp}
                  selected={selectedLeague === comp.key}
                  onClick={() => {
                    setSelectedLeague(comp.key);
                    setDropdownOpen(false);
                  }}
                />
              ))}
              
              {/* All Leagues */}
              <div className="px-3 py-2 border-y border-white/5 bg-white/[0.02]">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">All Competitions</span>
              </div>
              {competitions.filter(c => !FEATURED_LEAGUES.includes(c.key)).map(comp => (
                <LeagueOption 
                  key={comp.key}
                  comp={comp}
                  selected={selectedLeague === comp.key}
                  onClick={() => {
                    setSelectedLeague(comp.key);
                    setDropdownOpen(false);
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Standings Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <StandingsTable standings={standings} />
      )}
    </div>
  );
}

interface LeagueOptionProps {
  comp: Competition;
  selected: boolean;
  onClick: () => void;
}

function LeagueOption({ comp, selected, onClick }: LeagueOptionProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        selected ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-white/5 text-white/70 hover:text-white'
      }`}
    >
      <span className="text-sm font-medium">{comp.name}</span>
      <span className="text-[10px] text-white/30 ml-auto">{comp.country}</span>
    </button>
  );
}

interface StandingsTableProps {
  standings: TeamStanding[];
}

function StandingsTable({ standings }: StandingsTableProps) {
  if (standings.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <p className="text-white/40 text-sm">No standings available for this competition</p>
        <p className="text-white/20 text-xs mt-1">The season may not have started yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] overflow-x-auto">
        <div className="flex items-center min-w-[600px]">
          <div className="w-10 text-center text-[10px] text-white/30 uppercase">#</div>
          <div className="flex-1 text-[10px] text-white/30 uppercase">Team</div>
          <div className="w-8 text-center text-[10px] text-white/30 uppercase">P</div>
          <div className="w-8 text-center text-[10px] text-white/30 uppercase hidden sm:block">W</div>
          <div className="w-8 text-center text-[10px] text-white/30 uppercase hidden sm:block">D</div>
          <div className="w-8 text-center text-[10px] text-white/30 uppercase hidden sm:block">L</div>
          <div className="w-10 text-center text-[10px] text-white/30 uppercase hidden md:block">GF</div>
          <div className="w-10 text-center text-[10px] text-white/30 uppercase hidden md:block">GA</div>
          <div className="w-10 text-center text-[10px] text-white/30 uppercase">GD</div>
          <div className="w-10 text-center text-[10px] text-white/30 uppercase font-bold">Pts</div>
          <div className="w-24 text-center text-[10px] text-white/30 uppercase hidden lg:block">Form</div>
        </div>
      </div>

      {/* Rows - Show ALL teams */}
      <div className="divide-y divide-white/5 overflow-x-auto max-h-[600px] overflow-y-auto">
        {standings.map((team, index) => (
          <TeamRow key={team.teamId || index} team={team} index={index} />
        ))}
      </div>
    </div>
  );
}

function TeamRow({ team, index }: { team: TeamStanding; index: number }) {
  const isChampionsLeague = team.rank <= 4;
  const isEuropaLeague = team.rank === 5 || team.rank === 6;
  const isRelegation = team.rank >= 18;

  // Position indicator color
  const positionColor = isChampionsLeague 
    ? "bg-blue-500" 
    : isEuropaLeague 
      ? "bg-orange-500"
      : isRelegation 
        ? "bg-red-500" 
        : "bg-transparent";

  return (
    <Link
      to={buildSoccerTeamUrl(team.teamId)}
      className="block"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.02 }}
        className="flex items-center px-4 py-3 hover:bg-white/[0.04] transition-colors min-w-[600px] group cursor-pointer"
      >
      {/* Rank */}
      <div className="w-10 flex items-center justify-center gap-1">
        <div className={`w-1 h-4 rounded-full ${positionColor}`} />
        <span className={`text-sm font-bold ${
          team.rank === 1 ? 'text-amber-400' : 'text-white/70'
        }`}>
          {team.rank}
        </span>
      </div>

      {/* Team */}
      <div className="flex-1 flex items-center gap-2.5 min-w-0">
        {team.teamLogo ? (
          <img 
            src={team.teamLogo} 
            alt={team.teamName}
            className="w-6 h-6 object-contain flex-shrink-0"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] text-white/40">{team.teamName.charAt(0)}</span>
          </div>
        )}
        <span className="text-sm font-medium text-white truncate group-hover:text-emerald-400 transition-colors">
          {team.teamName}
        </span>
      </div>

      {/* Stats */}
      <div className="w-8 text-center text-sm text-white/60">{team.played}</div>
      <div className="w-8 text-center text-sm text-white/60 hidden sm:block">{team.wins}</div>
      <div className="w-8 text-center text-sm text-white/60 hidden sm:block">{team.draws}</div>
      <div className="w-8 text-center text-sm text-white/60 hidden sm:block">{team.losses}</div>
      <div className="w-10 text-center text-sm text-white/60 hidden md:block">{team.goalsFor}</div>
      <div className="w-10 text-center text-sm text-white/60 hidden md:block">{team.goalsAgainst}</div>
      <div className={`w-10 text-center text-sm font-medium ${
        team.goalDifference > 0 ? 'text-emerald-400' : team.goalDifference < 0 ? 'text-red-400' : 'text-white/40'
      }`}>
        {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
      </div>
      <div className="w-10 text-center text-sm font-bold text-white">{team.points}</div>

      {/* Form */}
      <div className="w-24 hidden lg:flex items-center justify-center gap-1">
        {team.form && team.form.length > 0 ? (
          team.form.slice(-5).map((result, i) => (
            <FormIndicator key={i} result={result} />
          ))
        ) : (
          <span className="text-white/20 text-xs">-</span>
        )}
      </div>
    </motion.div>
    </Link>
  );
}

function FormIndicator({ result }: { result: string }) {
  const colors = {
    W: "bg-emerald-500",
    D: "bg-amber-500",
    L: "bg-red-500",
  };
  
  const color = colors[result as keyof typeof colors] || "bg-white/20";
  
  return (
    <div 
      className={`w-4 h-4 rounded-full ${color} flex items-center justify-center`}
      title={result === 'W' ? 'Win' : result === 'D' ? 'Draw' : 'Loss'}
    >
      <span className="text-[8px] font-bold text-white">{result}</span>
    </div>
  );
}

export default SoccerHubStandings;
