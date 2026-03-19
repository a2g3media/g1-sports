import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Trophy, Loader2, Target, Footprints } from "lucide-react";

interface PlayerLeader {
  rank: number;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamAbbr?: string;
  nationality?: string;
  goals: number;
  assists: number;
  matches: number;
  minutesPlayed?: number;
  penalties?: number;
  goalsPerMatch?: number;
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

type LeaderTab = "scorers" | "assists";

export function SoccerHubLeaders() {
  const [selectedLeague, setSelectedLeague] = useState("premier-league");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [topScorers, setTopScorers] = useState<PlayerLeader[]>([]);
  const [topAssists, setTopAssists] = useState<PlayerLeader[]>([]);
  const [competitionName, setCompetitionName] = useState("Premier League");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeaderTab>("scorers");

  // Fetch available competitions
  useEffect(() => {
    fetch("/api/soccer/competitions")
      .then(res => res.json())
      .then(data => {
        const allComps = [...(data.leagues || []), ...(data.cups || []), ...(data.international || [])];
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

  // Fetch leaders for selected league
  useEffect(() => {
    const fetchLeaders = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/soccer/leaders/${selectedLeague}`);
        if (!res.ok) throw new Error("Failed to fetch leaders");
        
        const data = await res.json();
        
        if (data.competition) {
          setCompetitionName(data.competition.name || selectedLeague);
        }
        
        setTopScorers(data.topScorers || []);
        setTopAssists(data.topAssists || []);
      } catch (err) {
        console.error("[SoccerHubLeaders] Error:", err);
        setError("Unable to load leaders");
      } finally {
        setLoading(false);
      }
    };
    
    fetchLeaders();
  }, [selectedLeague]);

  const selectedComp = competitions.find(c => c.key === selectedLeague);
  const activeLeaders = activeTab === "scorers" ? topScorers : topAssists;

  return (
    <div className="space-y-4">
      {/* League Selector */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-amber-400" />
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

      {/* Scorers / Assists Tabs */}
      <div className="flex gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/5">
        <TabButton 
          active={activeTab === "scorers"}
          onClick={() => setActiveTab("scorers")}
          icon={<Target className="h-3.5 w-3.5" />}
          label="Top Scorers"
          count={topScorers.length}
        />
        <TabButton 
          active={activeTab === "assists"}
          onClick={() => setActiveTab("assists")}
          icon={<Footprints className="h-3.5 w-3.5" />}
          label="Top Assists"
          count={topAssists.length}
        />
      </div>

      {/* Leaders Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <LeadersTable leaders={activeLeaders} type={activeTab} />
      )}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}

function TabButton({ active, onClick, icon, label, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/10' 
          : 'text-white/50 hover:text-white/70 hover:bg-white/[0.03]'
      }`}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
          active ? 'bg-amber-500/30' : 'bg-white/10'
        }`}>
          {count}
        </span>
      )}
    </button>
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
        selected ? 'bg-amber-500/10 text-amber-400' : 'hover:bg-white/5 text-white/70 hover:text-white'
      }`}
    >
      <span className="text-sm font-medium">{comp.name}</span>
      <span className="text-[10px] text-white/30 ml-auto">{comp.country}</span>
    </button>
  );
}

interface LeadersTableProps {
  leaders: PlayerLeader[];
  type: LeaderTab;
}

function LeadersTable({ leaders, type }: LeadersTableProps) {
  if (leaders.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <p className="text-white/40 text-sm">No {type === "scorers" ? "scoring" : "assist"} leaders available</p>
        <p className="text-white/20 text-xs mt-1">The season may not have started yet</p>
      </div>
    );
  }

  const statLabel = type === "scorers" ? "Goals" : "Assists";
  const statKey = type === "scorers" ? "goals" : "assists";

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center">
          <div className="w-10 text-center text-[10px] text-white/30 uppercase">#</div>
          <div className="flex-1 text-[10px] text-white/30 uppercase">Player</div>
          <div className="w-24 text-[10px] text-white/30 uppercase hidden sm:block">Team</div>
          <div className="w-16 text-center text-[10px] text-white/30 uppercase font-bold">{statLabel}</div>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/5">
        {leaders.slice(0, 15).map((player, index) => (
          <PlayerRow 
            key={player.playerId || index} 
            player={player} 
            index={index}
            statKey={statKey}
          />
        ))}
      </div>
    </div>
  );
}

interface PlayerRowProps {
  player: PlayerLeader;
  index: number;
  statKey: "goals" | "assists";
}

function PlayerRow({ player, index, statKey }: PlayerRowProps) {
  const isTop3 = player.rank <= 3;
  const statValue = player[statKey];

  // Medal colors for top 3
  const medalColor = player.rank === 1 
    ? "text-amber-400" 
    : player.rank === 2 
      ? "text-gray-300" 
      : player.rank === 3 
        ? "text-amber-600" 
        : "text-white/50";

  // Format player name (handle "Last, First" format)
  const formatName = (name: string) => {
    if (name.includes(", ")) {
      const [last, first] = name.split(", ");
      return `${first} ${last}`;
    }
    return name;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center px-4 py-3 hover:bg-white/[0.04] transition-colors group"
    >
      {/* Rank */}
      <div className="w-10 flex items-center justify-center">
        {isTop3 ? (
          <div className={`text-lg font-bold ${medalColor}`}>
            {player.rank === 1 ? "🥇" : player.rank === 2 ? "🥈" : "🥉"}
          </div>
        ) : (
          <span className="text-sm font-medium text-white/50">{player.rank}</span>
        )}
      </div>

      {/* Player */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Player avatar placeholder */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
            <span className="text-[10px] font-bold text-white/40">
              {formatName(player.playerName).split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <div className={`text-sm font-semibold truncate ${isTop3 ? 'text-white' : 'text-white/80'} group-hover:text-amber-400 transition-colors`}>
              {formatName(player.playerName)}
            </div>
            <div className="text-[10px] text-white/30 sm:hidden truncate">
              {player.teamName}
            </div>
          </div>
        </div>
      </div>

      {/* Team */}
      <div className="w-24 hidden sm:flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
          <span className="text-[8px] font-bold text-white/40">{player.teamAbbr || player.teamName?.slice(0, 3).toUpperCase()}</span>
        </div>
        <span className="text-xs text-white/50 truncate">{player.teamName}</span>
      </div>

      {/* Stat */}
      <div className="w-16 flex items-center justify-center">
        <div className={`px-3 py-1.5 rounded-lg font-bold text-sm ${
          isTop3 
            ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-400' 
            : 'bg-white/[0.05] text-white/70'
        }`}>
          {statValue}
        </div>
      </div>
    </motion.div>
  );
}

export default SoccerHubLeaders;
