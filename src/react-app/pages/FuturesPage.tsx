/**
 * Futures Command Center
 * Championship odds, MVP markets, and season-long betting markets
 * Premium design with hot movements and featured picks
 */

import { useState, useEffect } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { 
  Trophy, Crown, Users, TrendingUp, Star, ChevronRight, Loader2, RefreshCw,
  Flame, Target, ArrowUpRight, ArrowDownRight, Zap, Eye, Plus
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { TeamLogo } from "@/react-app/components/TeamLogo";

// Coach G avatar
const COACH_G_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%231d4ed8'/%3E%3Cstop offset='1' stop-color='%237c3aed'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' rx='40' fill='url(%23g)'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-size='30' font-family='Arial,sans-serif' fill='white'%3ECG%3C/text%3E%3C/svg%3E";

// Sport configurations for futures
const SPORTS = [
  { key: 'nba', name: 'NBA', gradient: 'from-orange-500 to-red-600', glow: 'shadow-orange-500/30', icon: '🏀' },
  { key: 'nfl', name: 'NFL', gradient: 'from-green-500 to-emerald-700', glow: 'shadow-green-500/30', icon: '🏈' },
  { key: 'mlb', name: 'MLB', gradient: 'from-red-500 to-rose-700', glow: 'shadow-red-500/30', icon: '⚾' },
  { key: 'nhl', name: 'NHL', gradient: 'from-blue-500 to-indigo-700', glow: 'shadow-blue-500/30', icon: '🏒' },
];

// Market type configurations
const MARKET_TYPES = [
  { key: 'championship', name: 'Championship', icon: Trophy, description: 'Win the title', color: 'amber' },
  { key: 'mvp', name: 'MVP', icon: Crown, description: 'Most Valuable Player', color: 'purple' },
  { key: 'conference', name: 'Conference', icon: Users, description: 'Conference winners', color: 'cyan' },
  { key: 'win_total', name: 'Win Totals', icon: TrendingUp, description: 'Season over/under', color: 'emerald' },
];

// Team code mappings for logos
const TEAM_CODES: Record<string, string> = {
  'Boston Celtics': 'BOS', 'Denver Nuggets': 'DEN', 'Oklahoma City Thunder': 'OKC',
  'Milwaukee Bucks': 'MIL', 'Phoenix Suns': 'PHX', 'Los Angeles Lakers': 'LAL',
  'Golden State Warriors': 'GSW', 'Philadelphia 76ers': 'PHI', 'Miami Heat': 'MIA',
  'Dallas Mavericks': 'DAL', 'Kansas City Chiefs': 'KC', 'San Francisco 49ers': 'SF',
  'Philadelphia Eagles': 'PHI', 'Detroit Lions': 'DET', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Dallas Cowboys': 'DAL', 'Cincinnati Bengals': 'CIN',
  'Los Angeles Dodgers': 'LAD', 'Atlanta Braves': 'ATL', 'Houston Astros': 'HOU',
  'New York Yankees': 'NYY', 'Philadelphia Phillies': 'PHI', 'Edmonton Oilers': 'EDM',
  'Florida Panthers': 'FLA', 'Colorado Avalanche': 'COL', 'Dallas Stars': 'DAL',
  'New York Rangers': 'NYR',
};

interface FutureOdds {
  id: string;
  name: string;
  odds: number;
  change?: number;
  logo?: string;
  rank?: number;
  teamCode?: string;
}

interface FuturesMarket {
  sport: string;
  marketType: string;
  title: string;
  outcomes: FutureOdds[];
  lastUpdated?: string;
}

export function FuturesPage() {
  const { user } = useDemoAuth();
  const [activeSport, setActiveSport] = useState('nba');
  const [activeMarket, setActiveMarket] = useState('championship');
  const [futures, setFutures] = useState<FuturesMarket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackedFutures, setTrackedFutures] = useState<Set<string>>(new Set());

  const currentSport = SPORTS.find(s => s.key === activeSport)!;

  const fetchFutures = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/futures/${activeSport}/${activeMarket}`, {
        headers: user ? { 'x-user-id': user.id.toString() } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch futures');
      const data = await response.json();
      setFutures(data);
    } catch {
      setError('Unable to load futures data');
      setFutures(getMockFutures(activeSport, activeMarket));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFutures();
  }, [activeSport, activeMarket]);

  const formatOdds = (odds: number) => {
    if (odds >= 0) return `+${odds}`;
    return odds.toString();
  };

  const getImpliedProbability = (odds: number) => {
    if (odds > 0) {
      return (100 / (odds + 100) * 100).toFixed(1);
    } else {
      return (Math.abs(odds) / (Math.abs(odds) + 100) * 100).toFixed(1);
    }
  };

  const toggleTrack = (id: string) => {
    setTrackedFutures(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Get hot movers (biggest line changes)
  const hotMovers = futures?.outcomes
    .filter(o => o.change && o.change !== 0)
    .sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
    .slice(0, 3) || [];

  // Get favorites (top 3)
  const favorites = futures?.outcomes.slice(0, 3) || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-purple-500/10" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        
        <div className="relative max-w-7xl mx-auto px-4 py-6 sm:py-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20">
              <Trophy className="w-6 h-6 text-amber-400" />
            </div>
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Futures Command Center</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">
            Championship & Season Markets
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base max-w-xl">
            Track championship odds, MVP races, and season-long futures across all major sports.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {/* Sport Selector - Premium Pill Design */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 mb-4">
          {SPORTS.map((sport) => (
            <button
              key={sport.key}
              onClick={() => setActiveSport(sport.key)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 rounded-full font-semibold whitespace-nowrap transition-all min-h-[48px] active:scale-95",
                activeSport === sport.key
                  ? `bg-gradient-to-r ${sport.gradient} text-white shadow-lg ${sport.glow}`
                  : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-white border border-white/5"
              )}
            >
              <span className="text-xl">{sport.icon}</span>
              <span>{sport.name}</span>
            </button>
          ))}
        </div>

        {/* Market Type Tabs - Glass Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {MARKET_TYPES.map((market) => {
            const Icon = market.icon;
            const isActive = activeMarket === market.key;
            return (
              <button
                key={market.key}
                onClick={() => setActiveMarket(market.key)}
                className={cn(
                  "relative p-4 rounded-xl border transition-all text-left group min-h-[80px] active:scale-[0.98]",
                  isActive
                    ? `bg-gradient-to-br from-${market.color}-500/15 to-${market.color}-600/5 border-${market.color}-500/30 shadow-lg shadow-${market.color}-500/10`
                    : "bg-zinc-900/50 border-white/5 hover:border-white/10 hover:bg-zinc-800/50"
                )}
              >
                <div className={cn(
                  "flex items-center gap-2 mb-1.5",
                  isActive ? `text-${market.color}-400` : "text-zinc-400 group-hover:text-zinc-300"
                )}>
                  <Icon className="w-5 h-5" />
                  <span className="font-bold text-sm">{market.name}</span>
                </div>
                <p className="text-xs text-zinc-500">{market.description}</p>
                {isActive && (
                  <div className={`absolute top-3 right-3 w-2 h-2 rounded-full bg-${market.color}-400 animate-pulse`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="p-4 rounded-full bg-amber-500/10">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            </div>
            <p className="text-zinc-500 text-sm">Loading {currentSport.name} futures...</p>
          </div>
        ) : error && !futures ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 mb-4">{error}</p>
            <Button onClick={fetchFutures} variant="outline" className="min-h-[44px]">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : futures ? (
          <div className="space-y-6">
            {/* Featured Section - Top 3 Favorites */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-amber-400" fill="currentColor" />
                <h2 className="text-lg font-bold text-white">Top Favorites</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {favorites.map((outcome, index) => (
                  <FeaturedCard
                    key={outcome.id}
                    outcome={outcome}
                    rank={index + 1}
                    formatOdds={formatOdds}
                    getImpliedProbability={getImpliedProbability}
                    sport={activeSport}
                    isTracked={trackedFutures.has(outcome.id)}
                    onToggleTrack={() => toggleTrack(outcome.id)}
                  />
                ))}
              </div>
            </section>

            {/* Hot Movers Section */}
            {hotMovers.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-5 h-5 text-orange-400" />
                  <h2 className="text-lg font-bold text-white">Hot Line Movement</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {hotMovers.map((outcome) => (
                    <HotMoverCard
                      key={outcome.id}
                      outcome={outcome}
                      formatOdds={formatOdds}
                      sport={activeSport}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Coach G Intel */}
            <section className="p-4 rounded-xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent border border-violet-500/20">
              <div className="flex items-start gap-3">
                <img 
                  src={COACH_G_AVATAR} 
                  alt="Coach G" 
                  className="w-12 h-12 rounded-full border-2 border-violet-500/30 object-cover cursor-pointer transition-transform hover:scale-105"
                  onClick={() => window.location.assign('/scout')}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white">Coach G's Take</span>
                    <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 text-xs font-medium">AI Intel</span>
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed">
                    {getCoachGInsight(activeSport, activeMarket, favorites[0]?.name)}
                  </p>
                </div>
              </div>
            </section>

            {/* Full List Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{futures.title}</h2>
                {futures.lastUpdated && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Updated {new Date(futures.lastUpdated).toLocaleString()}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchFutures}
                className="text-zinc-400 hover:text-white min-h-[44px] min-w-[44px]"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* Futures Grid */}
            <div className="grid gap-2">
              {futures.outcomes.map((outcome, index) => (
                <FuturesCard
                  key={outcome.id}
                  outcome={outcome}
                  rank={index + 1}
                  formatOdds={formatOdds}
                  getImpliedProbability={getImpliedProbability}
                  sport={activeSport}
                  isTracked={trackedFutures.has(outcome.id)}
                  onToggleTrack={() => toggleTrack(outcome.id)}
                />
              ))}
            </div>

            {futures.outcomes.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No futures available for this market
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Featured card for top 3
function FeaturedCard({
  outcome,
  rank,
  formatOdds,
  getImpliedProbability,
  sport,
  isTracked,
  onToggleTrack,
}: {
  outcome: FutureOdds;
  rank: number;
  formatOdds: (odds: number) => string;
  getImpliedProbability: (odds: number) => string;
  sport: string;
  isTracked: boolean;
  onToggleTrack: () => void;
}) {
  const medalColors = ['from-amber-400 to-yellow-600', 'from-zinc-300 to-zinc-500', 'from-amber-600 to-amber-800'];
  const medalBg = ['bg-amber-500/10', 'bg-zinc-400/10', 'bg-amber-700/10'];
  const teamCode = TEAM_CODES[outcome.name] || outcome.name.split(' ').pop()?.substring(0, 3).toUpperCase() || 'UNK';

  return (
    <div className={cn(
      "relative p-4 rounded-xl border transition-all hover:scale-[1.02]",
      rank === 1 
        ? "bg-gradient-to-br from-amber-500/15 via-yellow-500/10 to-transparent border-amber-500/30"
        : "bg-zinc-900/60 border-white/5 hover:border-white/10"
    )}>
      {/* Rank Badge */}
      <div className={cn(
        "absolute -top-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
        `bg-gradient-to-br ${medalColors[rank - 1]} text-white shadow-lg`
      )}>
        {rank}
      </div>

      <div className="flex items-center gap-3 mb-3 pt-2">
        <div className={cn("p-2 rounded-lg", medalBg[rank - 1])}>
          <TeamLogo teamCode={teamCode} size={40} sport={sport} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white truncate">{outcome.name}</h3>
          <p className="text-xs text-zinc-500">{getImpliedProbability(outcome.odds)}% implied</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className={cn(
          "text-2xl font-bold",
          rank === 1 ? "text-amber-400" : "text-white"
        )}>
          {formatOdds(outcome.odds)}
        </div>

        <button
          onClick={onToggleTrack}
          className={cn(
            "p-2 rounded-lg transition-all min-h-[40px] min-w-[40px] flex items-center justify-center active:scale-95",
            isTracked
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
              : "bg-zinc-800 text-zinc-400 hover:text-white border border-white/5"
          )}
        >
          {isTracked ? <Eye className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      {outcome.change !== undefined && outcome.change !== 0 && (
        <div className={cn(
          "absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold",
          outcome.change < 0 
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-red-500/20 text-red-400"
        )}>
          {outcome.change < 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
          {Math.abs(outcome.change)}
        </div>
      )}
    </div>
  );
}

// Hot mover card
function HotMoverCard({
  outcome,
  formatOdds,
  sport,
}: {
  outcome: FutureOdds;
  formatOdds: (odds: number) => string;
  sport: string;
}) {
  const isShortening = outcome.change && outcome.change < 0;
  const teamCode = TEAM_CODES[outcome.name] || outcome.name.split(' ').pop()?.substring(0, 3).toUpperCase() || 'UNK';

  return (
    <div className={cn(
      "p-4 rounded-xl border transition-all",
      isShortening 
        ? "bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20"
        : "bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2 rounded-lg",
          isShortening ? "bg-emerald-500/10" : "bg-red-500/10"
        )}>
          <TeamLogo teamCode={teamCode} size={24} sport={sport} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-sm truncate">{outcome.name}</h3>
          <p className="text-xs text-zinc-500">{formatOdds(outcome.odds)}</p>
        </div>
        <div className={cn(
          "flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-sm",
          isShortening 
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-red-500/20 text-red-400"
        )}>
          {isShortening ? <Zap className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
          {Math.abs(outcome.change || 0)}
        </div>
      </div>
    </div>
  );
}

function FuturesCard({
  outcome,
  rank,
  formatOdds,
  getImpliedProbability,
  sport,
  isTracked,
  onToggleTrack,
}: {
  outcome: FutureOdds;
  rank: number;
  formatOdds: (odds: number) => string;
  getImpliedProbability: (odds: number) => string;
  sport: string;
  isTracked: boolean;
  onToggleTrack: () => void;
}) {
  const isTopThree = rank <= 3;
  const medalColors = ['text-amber-400', 'text-zinc-300', 'text-amber-700'];
  const teamCode = TEAM_CODES[outcome.name] || outcome.name.split(' ').pop()?.substring(0, 3).toUpperCase() || 'UNK';

  return (
    <div
      className={cn(
        "relative group p-3 sm:p-4 rounded-xl border transition-all hover:scale-[1.005] active:scale-[0.995]",
        isTopThree
          ? "bg-gradient-to-r from-zinc-800/80 to-zinc-900/50 border-amber-500/20"
          : "bg-zinc-900/50 border-white/5 hover:border-white/10"
      )}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Rank */}
        <div className={cn(
          "w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
          isTopThree
            ? `bg-gradient-to-br ${rank === 1 ? 'from-amber-500/20 to-amber-600/10' : rank === 2 ? 'from-zinc-400/20 to-zinc-500/10' : 'from-amber-700/20 to-amber-800/10'} ${medalColors[rank - 1]}`
            : "bg-zinc-800 text-zinc-500"
        )}>
          {isTopThree ? (
            <Star className="w-4 h-4" fill="currentColor" />
          ) : (
            rank
          )}
        </div>

        {/* Team Logo */}
        <div className="shrink-0">
          <TeamLogo teamCode={teamCode} size={24} sport={sport} />
        </div>

        {/* Team/Player Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate text-sm sm:text-base">{outcome.name}</h3>
          <p className="text-xs text-zinc-500 hidden sm:block">
            {getImpliedProbability(outcome.odds)}% implied probability
          </p>
        </div>

        {/* Odds */}
        <div className="text-right shrink-0">
          <div className={cn(
            "text-base sm:text-lg font-bold",
            outcome.odds < 200 ? "text-amber-400" : outcome.odds < 1000 ? "text-white" : "text-zinc-400"
          )}>
            {formatOdds(outcome.odds)}
          </div>
          <div className="text-xs text-zinc-500 sm:hidden">
            {getImpliedProbability(outcome.odds)}%
          </div>
        </div>

        {/* Movement */}
        {outcome.change !== undefined && outcome.change !== 0 && (
          <div className={cn(
            "px-2 py-1 rounded text-xs font-semibold shrink-0 hidden sm:flex items-center gap-1",
            outcome.change > 0 
              ? "bg-red-500/10 text-red-400"
              : "bg-emerald-500/10 text-emerald-400"
          )}>
            {outcome.change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(outcome.change)}
          </div>
        )}

        {/* Track Button */}
        <button
          onClick={onToggleTrack}
          className={cn(
            "p-2 rounded-lg transition-all shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center active:scale-95",
            isTracked
              ? "bg-cyan-500/20 text-cyan-400"
              : "bg-zinc-800 text-zinc-500 group-hover:text-zinc-300"
          )}
        >
          {isTracked ? <Eye className="w-4 h-4" /> : <Target className="w-4 h-4" />}
        </button>

        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0 hidden sm:block" />
      </div>
    </div>
  );
}

// Coach G insights for futures
function getCoachGInsight(sport: string, market: string, favorite: string | undefined): string {
  const insights: Record<string, Record<string, string>> = {
    nba: {
      championship: `The ${favorite || 'Celtics'} are the clear favorite, but championship futures are about finding value. Look at teams with injury bounce-back potential or young cores making leaps. Conference finals appearances often provide 3-4x returns.`,
      mvp: `MVP races tighten in February. Early-season favorites often fade as voter fatigue sets in. Watch for narrative shifts - returning from injury, new team success, or historic stat lines drive late-season momentum.`,
      conference: `Conference futures often offer better value than championship bets. The path matters - look at bracket positioning and potential matchups. Home court in the playoffs is crucial.`,
      win_total: `Win totals are my favorite market. Teams with new coaches typically see 4-6 win swings. Watch for schedule strength - back-to-backs and road trip stretches impact totals significantly.`,
    },
    nfl: {
      championship: `Super Bowl futures are volatile. Injuries, especially at QB, can swing lines 1000+ points. The ${favorite || 'Chiefs'} dynasty makes them perpetual favorites, but value lives in the 15-25:1 range.`,
      mvp: `NFL MVP is a quarterback award - only 4 non-QBs have won since 2000. Look for QBs on playoff teams with gaudy stats. Week 1-8 performance matters most for narrative building.`,
      conference: `AFC/NFC futures let you bet on paths to the Super Bowl. The AFC is loaded with QB talent - value often hides in the NFC where one elite team can dominate weaker competition.`,
      win_total: `NFL win totals are sharp markets. Key factors: QB health, offensive line changes, and strength of schedule. Division games are coin flips - focus on out-of-division matchups for edges.`,
    },
    mlb: {
      championship: `World Series futures require patience. The ${favorite || 'Dodgers'} spending spree makes them favorites, but October baseball is chaos. Wild card teams have won 4 of last 10 titles.`,
      mvp: `Two MVPs (AL and NL) means more opportunities. Ohtani's two-way value is unprecedented. Watch for players on contenders with monster first halves - All-Star break narratives matter.`,
      conference: `Pennant races offer value over World Series bets. Pitching depth wins in October - look at teams with 3+ reliable starters and deep bullpens for playoff runs.`,
      win_total: `162 games create consistency. Division strength matters enormously. Teams projected for 85-90 wins in weak divisions often exceed expectations with easier schedules.`,
    },
    nhl: {
      championship: `Stanley Cup futures reward depth. The ${favorite || 'Oilers'} have star power, but 4 rounds of playoff hockey grinds down top-heavy teams. Goaltending runs decide championships.`,
      mvp: `Hart Trophy (MVP) correlates heavily with team success. Connor McDavid is the best player, but voters reward winning. Look for players on surprising teams exceeding expectations.`,
      conference: `Conference futures in hockey offer solid value. The grind of 7-game series favors experienced teams. Look for strong goaltending and defensive depth over pure offensive firepower.`,
      win_total: `NHL point totals are underrated markets. New coaches, goaltender changes, and schedule quirks create edges. Watch for teams with soft early schedules for fast starts.`,
    },
  };

  return insights[sport]?.[market] || `The ${favorite || 'favorite'} leads this market, but futures are about finding value. Look for teams or players with upside that the market hasn't fully priced in yet.`;
}

// Mock data fallback (unchanged but with added teamCode field)
function getMockFutures(sport: string, marketType: string): FuturesMarket {
  const mockData: Record<string, Record<string, FuturesMarket>> = {
    nba: {
      championship: {
        sport: 'nba',
        marketType: 'championship',
        title: 'NBA Championship 2025-26',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Boston Celtics', odds: 350, change: -50 },
          { id: '2', name: 'Denver Nuggets', odds: 450, change: 25 },
          { id: '3', name: 'Oklahoma City Thunder', odds: 500, change: -100 },
          { id: '4', name: 'Milwaukee Bucks', odds: 800, change: 0 },
          { id: '5', name: 'Phoenix Suns', odds: 1000, change: 50 },
          { id: '6', name: 'Los Angeles Lakers', odds: 1200, change: -100 },
          { id: '7', name: 'Golden State Warriors', odds: 1400, change: 100 },
          { id: '8', name: 'Philadelphia 76ers', odds: 1500, change: 0 },
          { id: '9', name: 'Miami Heat', odds: 2000, change: -200 },
          { id: '10', name: 'Dallas Mavericks', odds: 2200, change: 100 },
        ],
      },
      mvp: {
        sport: 'nba',
        marketType: 'mvp',
        title: 'NBA MVP 2025-26',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Luka Dončić', odds: 300, change: -50 },
          { id: '2', name: 'Nikola Jokić', odds: 350, change: 0 },
          { id: '3', name: 'Giannis Antetokounmpo', odds: 400, change: 25 },
          { id: '4', name: 'Jayson Tatum', odds: 600, change: -100 },
          { id: '5', name: 'Shai Gilgeous-Alexander', odds: 700, change: -150 },
          { id: '6', name: 'Anthony Edwards', odds: 1200, change: -200 },
          { id: '7', name: 'Joel Embiid', odds: 1500, change: 300 },
          { id: '8', name: 'Kevin Durant', odds: 2000, change: 0 },
        ],
      },
      conference: {
        sport: 'nba',
        marketType: 'conference',
        title: 'NBA Conference Winners 2025-26',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Boston Celtics (East)', odds: 175, change: -25 },
          { id: '2', name: 'Milwaukee Bucks (East)', odds: 400, change: 50 },
          { id: '3', name: 'Philadelphia 76ers (East)', odds: 600, change: 0 },
          { id: '4', name: 'Denver Nuggets (West)', odds: 250, change: 0 },
          { id: '5', name: 'Oklahoma City Thunder (West)', odds: 300, change: -75 },
          { id: '6', name: 'Phoenix Suns (West)', odds: 500, change: 25 },
        ],
      },
      win_total: {
        sport: 'nba',
        marketType: 'win_total',
        title: 'NBA Regular Season Win Totals 2025-26',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Boston Celtics O/U 56.5', odds: -110, change: 0 },
          { id: '2', name: 'Denver Nuggets O/U 53.5', odds: -110, change: 0 },
          { id: '3', name: 'Milwaukee Bucks O/U 52.5', odds: -110, change: 0 },
          { id: '4', name: 'Oklahoma City Thunder O/U 51.5', odds: -115, change: 0 },
          { id: '5', name: 'Phoenix Suns O/U 50.5', odds: -110, change: 0 },
        ],
      },
    },
    nfl: {
      championship: {
        sport: 'nfl',
        marketType: 'championship',
        title: 'Super Bowl LX Winner',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Kansas City Chiefs', odds: 500, change: -50 },
          { id: '2', name: 'San Francisco 49ers', odds: 600, change: 0 },
          { id: '3', name: 'Philadelphia Eagles', odds: 800, change: -100 },
          { id: '4', name: 'Detroit Lions', odds: 900, change: -150 },
          { id: '5', name: 'Baltimore Ravens', odds: 1000, change: 50 },
          { id: '6', name: 'Buffalo Bills', odds: 1200, change: 0 },
          { id: '7', name: 'Dallas Cowboys', odds: 1500, change: 200 },
          { id: '8', name: 'Cincinnati Bengals', odds: 1800, change: -100 },
        ],
      },
      mvp: {
        sport: 'nfl',
        marketType: 'mvp',
        title: 'NFL MVP 2025',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Patrick Mahomes', odds: 400, change: 0 },
          { id: '2', name: 'Josh Allen', odds: 500, change: -50 },
          { id: '3', name: 'Lamar Jackson', odds: 600, change: 0 },
          { id: '4', name: 'Jalen Hurts', odds: 800, change: -100 },
          { id: '5', name: 'Joe Burrow', odds: 1000, change: 0 },
        ],
      },
      conference: {
        sport: 'nfl',
        marketType: 'conference',
        title: 'NFL Conference Winners 2025',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Kansas City Chiefs (AFC)', odds: 300, change: 0 },
          { id: '2', name: 'Buffalo Bills (AFC)', odds: 450, change: -50 },
          { id: '3', name: 'San Francisco 49ers (NFC)', odds: 275, change: 0 },
          { id: '4', name: 'Philadelphia Eagles (NFC)', odds: 400, change: -75 },
        ],
      },
      win_total: {
        sport: 'nfl',
        marketType: 'win_total',
        title: 'NFL Regular Season Win Totals 2025',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Kansas City Chiefs O/U 11.5', odds: -110, change: 0 },
          { id: '2', name: 'San Francisco 49ers O/U 11.5', odds: -115, change: 0 },
          { id: '3', name: 'Buffalo Bills O/U 10.5', odds: -110, change: 0 },
          { id: '4', name: 'Philadelphia Eagles O/U 10.5', odds: -120, change: 0 },
        ],
      },
    },
    mlb: {
      championship: {
        sport: 'mlb',
        marketType: 'championship',
        title: 'World Series 2026 Winner',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Los Angeles Dodgers', odds: 350, change: -75 },
          { id: '2', name: 'Atlanta Braves', odds: 500, change: 0 },
          { id: '3', name: 'Houston Astros', odds: 700, change: 50 },
          { id: '4', name: 'New York Yankees', odds: 800, change: -100 },
          { id: '5', name: 'Philadelphia Phillies', odds: 900, change: 0 },
        ],
      },
      mvp: {
        sport: 'mlb',
        marketType: 'mvp',
        title: 'MLB MVP 2026',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Shohei Ohtani (NL)', odds: 200, change: -50 },
          { id: '2', name: 'Ronald Acuña Jr. (NL)', odds: 350, change: 0 },
          { id: '3', name: 'Mookie Betts (NL)', odds: 600, change: 0 },
          { id: '4', name: 'Aaron Judge (AL)', odds: 700, change: 100 },
        ],
      },
      conference: {
        sport: 'mlb',
        marketType: 'conference',
        title: 'MLB League Pennant 2026',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Los Angeles Dodgers (NL)', odds: 200, change: -50 },
          { id: '2', name: 'Atlanta Braves (NL)', odds: 350, change: 0 },
          { id: '3', name: 'Houston Astros (AL)', odds: 400, change: 25 },
          { id: '4', name: 'New York Yankees (AL)', odds: 450, change: -75 },
        ],
      },
      win_total: {
        sport: 'mlb',
        marketType: 'win_total',
        title: 'MLB Season Win Totals 2026',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Los Angeles Dodgers O/U 98.5', odds: -110, change: 0 },
          { id: '2', name: 'Atlanta Braves O/U 95.5', odds: -110, change: 0 },
          { id: '3', name: 'Houston Astros O/U 92.5', odds: -115, change: 0 },
        ],
      },
    },
    nhl: {
      championship: {
        sport: 'nhl',
        marketType: 'championship',
        title: 'Stanley Cup 2025-26 Winner',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Edmonton Oilers', odds: 600, change: -100 },
          { id: '2', name: 'Florida Panthers', odds: 700, change: 0 },
          { id: '3', name: 'Colorado Avalanche', odds: 800, change: -50 },
          { id: '4', name: 'Dallas Stars', odds: 900, change: 0 },
          { id: '5', name: 'New York Rangers', odds: 1000, change: 100 },
        ],
      },
      mvp: {
        sport: 'nhl',
        marketType: 'mvp',
        title: 'Hart Trophy (NHL MVP) 2025-26',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Connor McDavid', odds: 200, change: 0 },
          { id: '2', name: 'Nathan MacKinnon', odds: 400, change: -50 },
          { id: '3', name: 'Auston Matthews', odds: 600, change: 50 },
          { id: '4', name: 'Leon Draisaitl', odds: 800, change: 0 },
        ],
      },
      conference: {
        sport: 'nhl',
        marketType: 'conference',
        title: 'NHL Conference Winners 2025-26',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Edmonton Oilers (West)', odds: 350, change: -75 },
          { id: '2', name: 'Colorado Avalanche (West)', odds: 400, change: 0 },
          { id: '3', name: 'Florida Panthers (East)', odds: 400, change: 0 },
          { id: '4', name: 'New York Rangers (East)', odds: 500, change: 75 },
        ],
      },
      win_total: {
        sport: 'nhl',
        marketType: 'win_total',
        title: 'NHL Point Totals 2025-26',
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: '1', name: 'Edmonton Oilers O/U 108.5 pts', odds: -110, change: 0 },
          { id: '2', name: 'Colorado Avalanche O/U 106.5 pts', odds: -110, change: 0 },
          { id: '3', name: 'Florida Panthers O/U 105.5 pts', odds: -115, change: 0 },
        ],
      },
    },
  };

  return mockData[sport]?.[marketType] || {
    sport,
    marketType,
    title: `${sport.toUpperCase()} ${marketType.replace('_', ' ')}`,
    outcomes: [],
    lastUpdated: new Date().toISOString(),
  };
}

export default FuturesPage;
