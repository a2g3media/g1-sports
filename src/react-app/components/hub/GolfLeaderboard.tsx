import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Flag, Loader2, User, Crown, ChevronDown, ChevronUp } from "lucide-react";

interface GolfPlayer {
  playerId: string;
  rank: number;
  name: string;
  country: string;
  countryFlag: string;
  score: number;
  today: number;
  thru: string;
  strokes: number;
  movement: "up" | "down" | "same";
  movementAmount?: number;
  isAmateur?: boolean;
  photoUrl?: string;
}

interface GolfLeaderboardProps {
  tournamentId?: string;
  tournamentName?: string;
  courseName?: string;
  round?: number;
  players?: GolfPlayer[];
  loading?: boolean;
}

// Country code to flag emoji mapping
const COUNTRY_FLAGS: Record<string, string> = {
  USA: "🇺🇸", US: "🇺🇸",
  ESP: "🇪🇸", SPAIN: "🇪🇸",
  NIR: "🇬🇧", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", GBR: "🇬🇧",
  NOR: "🇳🇴", NORWAY: "🇳🇴",
  JPN: "🇯🇵", JAPAN: "🇯🇵",
  KOR: "🇰🇷", KOREA: "🇰🇷",
  AUS: "🇦🇺", AUSTRALIA: "🇦🇺",
  CAN: "🇨🇦", CANADA: "🇨🇦",
  RSA: "🇿🇦", ZAF: "🇿🇦",
  IRL: "🇮🇪", IRELAND: "🇮🇪",
  SWE: "🇸🇪", SWEDEN: "🇸🇪",
  GER: "🇩🇪", DEU: "🇩🇪",
  FRA: "🇫🇷", FRANCE: "🇫🇷",
  ITA: "🇮🇹", ITALY: "🇮🇹",
  MEX: "🇲🇽", MEXICO: "🇲🇽",
  ARG: "🇦🇷", ARGENTINA: "🇦🇷",
  COL: "🇨🇴", COLOMBIA: "🇨🇴",
  CHI: "🇨🇱", CHILE: "🇨🇱",
  CHN: "🇨🇳", CHINA: "🇨🇳",
  THA: "🇹🇭", THAILAND: "🇹🇭",
  IND: "🇮🇳", INDIA: "🇮🇳",
  NZL: "🇳🇿",
  BEL: "🇧🇪",
  AUT: "🇦🇹",
  DEN: "🇩🇰", DNK: "🇩🇰",
  FIN: "🇫🇮",
  NED: "🇳🇱", NLD: "🇳🇱",
  POL: "🇵🇱",
  POR: "🇵🇹", PRT: "🇵🇹",
};

// Known golfer photo URLs (TheSportsDB)
const GOLFER_PHOTOS: Record<string, string> = {
  "scottie scheffler": "https://www.thesportsdb.com/images/media/player/thumb/scottie_scheffler.jpg",
  "rory mcilroy": "https://www.thesportsdb.com/images/media/player/thumb/rory_mcilroy.jpg",
  "jon rahm": "https://www.thesportsdb.com/images/media/player/thumb/jon_rahm.jpg",
  "viktor hovland": "https://www.thesportsdb.com/images/media/player/thumb/viktor_hovland.jpg",
  "xander schauffele": "https://www.thesportsdb.com/images/media/player/thumb/xander_schauffele.jpg",
  "collin morikawa": "https://www.thesportsdb.com/images/media/player/thumb/collin_morikawa.jpg",
  "patrick cantlay": "https://www.thesportsdb.com/images/media/player/thumb/patrick_cantlay.jpg",
  "max homa": "https://www.thesportsdb.com/images/media/player/thumb/max_homa.jpg",
  "jordan spieth": "https://www.thesportsdb.com/images/media/player/thumb/jordan_spieth.jpg",
  "brooks koepka": "https://www.thesportsdb.com/images/media/player/thumb/brooks_koepka.jpg",
  "dustin johnson": "https://www.thesportsdb.com/images/media/player/thumb/dustin_johnson.jpg",
  "tiger woods": "https://www.thesportsdb.com/images/media/player/thumb/tiger_woods.jpg",
  "bryson dechambeau": "https://www.thesportsdb.com/images/media/player/thumb/bryson_dechambeau.jpg",
  "justin thomas": "https://www.thesportsdb.com/images/media/player/thumb/justin_thomas.jpg",
  "hideki matsuyama": "https://www.thesportsdb.com/images/media/player/thumb/hideki_matsuyama.jpg",
  "tommy fleetwood": "https://www.thesportsdb.com/images/media/player/thumb/tommy_fleetwood.jpg",
  "shane lowry": "https://www.thesportsdb.com/images/media/player/thumb/shane_lowry.jpg",
  "cameron smith": "https://www.thesportsdb.com/images/media/player/thumb/cameron_smith.jpg",
  "wyndham clark": "https://www.thesportsdb.com/images/media/player/thumb/wyndham_clark.jpg",
  "ludvig aberg": "https://www.thesportsdb.com/images/media/player/thumb/ludvig_aberg.jpg",
};

function getCountryFlag(country: string): string {
  if (!country) return "🏳️";
  const upper = country.toUpperCase();
  return COUNTRY_FLAGS[upper] || "🏳️";
}

function getGolferPhoto(name: string): string | null {
  const normalized = name.toLowerCase().trim();
  return GOLFER_PHOTOS[normalized] || null;
}

export function GolfLeaderboard({ 
  tournamentId,
  tournamentName: _tournamentName = "Tournament",
  courseName: _courseName = "",
  round: _round = 1,
  players: externalPlayers,
  loading: externalLoading = false,
}: GolfLeaderboardProps) {
  const [players, setPlayers] = useState<GolfPlayer[]>(externalPlayers || []);
  const [loading, setLoading] = useState(externalLoading);
  const [error, setError] = useState<string | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    if (externalPlayers && externalPlayers.length > 0) return;
    
    async function fetchLeaderboard() {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/golf/leaderboard/${tournamentId}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch leaderboard');
        }
        
        const data = await response.json();
        
        const transformedPlayers: GolfPlayer[] = (data.leaderboard || []).map((p: any) => ({
          playerId: String(p.position),
          rank: p.position,
          name: p.name,
          country: p.country || '',
          countryFlag: getCountryFlag(p.country),
          score: p.score ?? 0,
          today: p.today ?? 0,
          thru: p.thru !== null ? (p.thru === 18 ? 'F' : String(p.thru)) : '-',
          strokes: p.strokes ?? 0,
          movement: "same" as const,
          isAmateur: p.status === 'amateur',
          photoUrl: getGolferPhoto(p.name),
        }));
        
        setPlayers(transformedPlayers);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    
    fetchLeaderboard();
  }, [tournamentId, externalPlayers]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/20 via-black/50 to-transparent p-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 animate-pulse" />
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Loading Leaderboard</p>
            <p className="text-white/40 text-sm">Fetching live scores...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/20 via-black/50 to-transparent p-8">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <Flag className="w-6 h-6 text-red-400" />
          </div>
          <h3 className="text-white font-bold">Unable to Load Leaderboard</h3>
          <p className="text-white/40 text-sm max-w-md">{error}</p>
          <p className="text-white/30 text-xs">Leaderboard data may not be available until the tournament begins</p>
        </div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.02] to-transparent p-10">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
            <Flag className="w-8 h-8 text-white/20" />
          </div>
          <h3 className="text-lg font-bold text-white">Leaderboard Coming Soon</h3>
          <p className="text-white/40 text-sm max-w-sm">
            Live scores will appear here once the tournament begins.
          </p>
        </div>
      </div>
    );
  }

  const leader = players[0];
  const top10 = players.slice(0, 10);
  const displayedPlayers = showAll ? players : top10;

  return (
    <div className="space-y-4">
      {/* Leader Spotlight */}
      <LeaderSpotlight player={leader} />

      {/* Top 3 Podium */}
      <Top3Podium players={players.slice(0, 3)} />

      {/* Full Leaderboard */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[36px_1fr_56px_56px_48px] sm:grid-cols-[48px_1fr_70px_70px_70px_60px] gap-2 px-3 sm:px-4 py-3 bg-white/[0.03] border-b border-white/5 text-[10px] sm:text-xs font-bold text-white/40 uppercase tracking-wider">
          <div className="text-center">Pos</div>
          <div>Player</div>
          <div className="text-center">Total</div>
          <div className="text-center">Today</div>
          <div className="text-center hidden sm:block">Thru</div>
          <div className="text-center">Thru</div>
        </div>

        {/* Player Rows */}
        <div className="divide-y divide-white/5">
          {displayedPlayers.map((player, idx) => (
            <PlayerRow 
              key={`${player.playerId}-${idx}`} 
              player={player} 
              index={idx}
              isExpanded={expandedPlayer === player.playerId}
              onToggle={() => setExpandedPlayer(expandedPlayer === player.playerId ? null : player.playerId)}
            />
          ))}
        </div>

        {/* Show More */}
        {players.length > 10 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-4 text-center text-sm font-semibold text-emerald-400 hover:bg-white/[0.02] transition-colors flex items-center justify-center gap-2"
          >
            {showAll ? (
              <>Show Top 10 <ChevronUp className="w-4 h-4" /></>
            ) : (
              <>Show All {players.length} Players <ChevronDown className="w-4 h-4" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Leader Spotlight Component
function LeaderSpotlight({ player }: { player: GolfPlayer }) {
  const photoUrl = getGolferPhoto(player.name);

  return (
    <div className="relative rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-amber-900/20 to-transparent overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/20 rounded-full blur-[50px]" />
      
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Photo or Initial */}
          <div className="relative">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 overflow-hidden shadow-xl shadow-amber-500/30">
              {photoUrl ? (
                <img 
                  src={photoUrl} 
                  alt={player.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-3xl font-black text-black/80">
                    {player.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
              )}
            </div>
            {/* Crown badge */}
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
              <Crown className="w-4 h-4 text-black" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-400 text-[10px] font-bold uppercase">
                Leader
              </span>
              <span className="text-lg">{player.countryFlag}</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white truncate">{player.name}</h3>
            <p className="text-white/50 text-sm">{player.country}</p>
          </div>

          {/* Score */}
          <div className="text-right">
            <p className={`text-4xl sm:text-5xl font-black ${
              player.score < 0 ? 'text-red-400' : player.score > 0 ? 'text-sky-400' : 'text-white'
            }`}>
              {player.score > 0 ? `+${player.score}` : player.score === 0 ? 'E' : player.score}
            </p>
            <p className="text-white/40 text-sm mt-1">
              Today: <span className={player.today < 0 ? 'text-red-400' : player.today > 0 ? 'text-sky-400' : 'text-white'}>
                {player.today > 0 ? `+${player.today}` : player.today === 0 ? 'E' : player.today}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Top 3 Podium
function Top3Podium({ players }: { players: GolfPlayer[] }) {
  if (players.length < 3) return null;

  const podiumOrder = [players[1], players[0], players[2]]; // Silver, Gold, Bronze
  const colors = [
    { bg: 'from-slate-400/20', border: 'border-slate-400/30', text: 'text-slate-300', label: '2nd' },
    { bg: 'from-amber-400/20', border: 'border-amber-400/30', text: 'text-amber-400', label: '1st' },
    { bg: 'from-orange-600/20', border: 'border-orange-600/30', text: 'text-orange-400', label: '3rd' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {podiumOrder.map((player, idx) => {
        const color = colors[idx];
        const photoUrl = getGolferPhoto(player.name);
        const isCenter = idx === 1;

        return (
          <div
            key={player.playerId}
            className={`rounded-xl border ${color.border} bg-gradient-to-br ${color.bg} to-transparent p-3 sm:p-4 ${
              isCenter ? 'sm:-mt-2' : ''
            }`}
          >
            <div className="text-center">
              {/* Photo */}
              <div className={`mx-auto ${isCenter ? 'w-14 h-14 sm:w-16 sm:h-16' : 'w-12 h-12 sm:w-14 sm:h-14'} rounded-xl bg-white/10 overflow-hidden mb-2`}>
                {photoUrl ? (
                  <img 
                    src={photoUrl} 
                    alt={player.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-6 h-6 text-white/30" />
                  </div>
                )}
              </div>

              {/* Position */}
              <span className={`text-xs font-bold ${color.text}`}>{color.label}</span>
              
              {/* Name */}
              <p className="text-white font-semibold text-xs sm:text-sm truncate mt-1">{player.name}</p>
              
              {/* Score */}
              <p className={`text-lg sm:text-xl font-black mt-1 ${
                player.score < 0 ? 'text-red-400' : player.score > 0 ? 'text-sky-400' : 'text-white'
              }`}>
                {player.score > 0 ? `+${player.score}` : player.score === 0 ? 'E' : player.score}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Player Row
interface PlayerRowProps {
  player: GolfPlayer;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function PlayerRow({ player, index, isExpanded, onToggle }: PlayerRowProps) {
  const isTop3 = player.rank <= 3;
  const isLeader = player.rank === 1;
  const photoUrl = getGolferPhoto(player.name);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
    >
      <button
        onClick={onToggle}
        className={`w-full grid grid-cols-[36px_1fr_56px_56px_48px] sm:grid-cols-[48px_1fr_70px_70px_70px_60px] gap-2 px-3 sm:px-4 py-3 items-center hover:bg-white/[0.03] transition-colors text-left ${
          isLeader ? 'bg-amber-500/5' : ''
        }`}
      >
        {/* Position */}
        <div className="flex justify-center">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
            isLeader 
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-500/20' 
              : isTop3
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/50'
          }`}>
            {player.rank}
          </span>
        </div>

        {/* Player Name & Photo */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Photo/Flag */}
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white/10 overflow-hidden flex-shrink-0">
            {photoUrl ? (
              <img 
                src={photoUrl} 
                alt={player.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`w-full h-full flex items-center justify-center text-lg ${photoUrl ? 'hidden' : ''}`}>
              {player.countryFlag}
            </div>
          </div>
          
          <div className="min-w-0">
            <p className={`font-semibold truncate text-sm ${isLeader ? 'text-amber-400' : 'text-white'}`}>
              {player.name}
              {player.isAmateur && <span className="text-white/30 text-xs ml-1">(a)</span>}
            </p>
            <p className="text-[10px] text-white/30 truncate hidden sm:block">{player.country}</p>
          </div>
        </div>

        {/* Total Score */}
        <div className="text-center">
          <span className={`text-sm font-bold ${
            player.score < 0 ? 'text-red-400' : player.score > 0 ? 'text-sky-400' : 'text-white'
          }`}>
            {player.score > 0 ? `+${player.score}` : player.score === 0 ? 'E' : player.score}
          </span>
        </div>

        {/* Today's Score */}
        <div className="text-center">
          <span className={`text-sm font-medium ${
            player.today < 0 ? 'text-red-400' : player.today > 0 ? 'text-sky-400' : 'text-white/50'
          }`}>
            {player.today > 0 ? `+${player.today}` : player.today === 0 ? 'E' : player.today}
          </span>
        </div>

        {/* Thru (mobile) */}
        <div className="text-center sm:hidden">
          <span className={`text-xs ${player.thru === 'F' ? 'text-emerald-400 font-semibold' : 'text-white/50'}`}>
            {player.thru}
          </span>
        </div>

        {/* Thru (desktop) */}
        <div className="hidden sm:block text-center">
          <span className={`text-sm ${player.thru === 'F' ? 'text-emerald-400 font-semibold' : 'text-white/50'}`}>
            {player.thru}
          </span>
        </div>

        {/* Movement (desktop only) */}
        <div className="hidden sm:flex justify-center">
          <MovementBadge movement={player.movement} amount={player.movementAmount} />
        </div>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="px-4 pb-4 bg-white/[0.02]"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/5">
            <div className="text-center p-3 rounded-xl bg-white/5">
              <p className="text-white/40 text-xs uppercase mb-1">Strokes</p>
              <p className="text-white font-bold text-lg">{player.strokes || '-'}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <p className="text-white/40 text-xs uppercase mb-1">Today</p>
              <p className={`font-bold text-lg ${player.today < 0 ? 'text-red-400' : player.today > 0 ? 'text-sky-400' : 'text-white'}`}>
                {player.today > 0 ? `+${player.today}` : player.today === 0 ? 'E' : player.today}
              </p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <p className="text-white/40 text-xs uppercase mb-1">Holes</p>
              <p className="text-white font-bold text-lg">{player.thru}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <p className="text-white/40 text-xs uppercase mb-1">Position</p>
              <p className="text-amber-400 font-bold text-lg">#{player.rank}</p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// Movement Badge
function MovementBadge({ movement, amount }: { movement: "up" | "down" | "same"; amount?: number }) {
  if (movement === "up") {
    return (
      <div className="flex items-center gap-0.5 text-emerald-400 text-xs font-medium">
        <TrendingUp className="w-3.5 h-3.5" />
        {amount && <span>+{amount}</span>}
      </div>
    );
  }
  if (movement === "down") {
    return (
      <div className="flex items-center gap-0.5 text-red-400 text-xs font-medium">
        <TrendingDown className="w-3.5 h-3.5" />
        {amount && <span>-{amount}</span>}
      </div>
    );
  }
  return <Minus className="w-3.5 h-3.5 text-white/20" />;
}

export default GolfLeaderboard;
