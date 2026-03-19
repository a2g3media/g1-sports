/**
 * PlayerProfilePage - The Hub of All Hubs for Player Intel
 * 
 * Route: /props/player/:sport/:playerName
 * Comprehensive player data: stats, game logs, props, matchup intel, Coach G analysis
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, TrendingUp, TrendingDown, Target, Calendar, 
  BarChart3, User, Sparkles, Send, Shield, Activity, Heart,
  ChevronDown, ChevronUp, AlertCircle, Plus, Bell, Flame, Zap, Clock
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";

// ============================================
// TYPES
// ============================================

interface PlayerInfo {
  espnId: string;
  displayName: string;
  position: string;
  jersey: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  headshotUrl: string;
  birthDate?: string;
  height?: string;
  weight?: string;
  experience?: string;
  college?: string;
  sport: string;
}

interface GameLogEntry {
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  result: 'W' | 'L' | 'T';
  score: string;
  stats: Record<string, string | number>;
  minutes?: string;
}

interface PropHitRate {
  hits: number;
  total: number;
  rate: number;
}

interface MatchupData {
  opponent: {
    name: string;
    abbr: string;
    logo?: string;
  };
  gameTime?: string;
  venue?: string;
  defensiveRankings?: {
    overall?: number;
    vsPosition?: number;
    ptsAllowed?: number;
    last5PtsAllowed?: number;
  };
}

interface HealthData {
  status: 'healthy' | 'questionable' | 'doubtful' | 'out' | 'injury_reserve' | 'unknown';
  injury?: string;
  injuryDate?: string;
  expectedReturn?: string;
  minutesTrend: {
    last5Avg: number;
    seasonAvg: number;
    trend: 'up' | 'down' | 'stable';
    last5: number[];
  };
}

interface PlayerProfileData {
  player: PlayerInfo;
  gameLog: GameLogEntry[];
  seasonAverages: Record<string, number>;
  currentProps: any[];
  propHitRates: Record<string, PropHitRate>;
  matchup: MatchupData | null;
  health?: HealthData;
  lastUpdated: string;
}

// ============================================
// CONSTANTS
// ============================================

const STAT_LABELS: Record<string, string> = {
  PTS: 'Points',
  REB: 'Rebounds',
  AST: 'Assists',
  STL: 'Steals',
  BLK: 'Blocks',
  '3PM': '3PT Made',
  FG: 'Field Goals',
  FGP: 'FG%',
  MIN: 'Minutes',
  TO: 'Turnovers',
  // NFL
  'PASS YDS': 'Pass Yards',
  'PASS TD': 'Pass TDs',
  'RUSH YDS': 'Rush Yards',
  'REC YDS': 'Rec Yards',
  REC: 'Receptions',
  // MLB
  H: 'Hits',
  R: 'Runs',
  RBI: 'RBIs',
  HR: 'Home Runs',
  SO: 'Strikeouts',
  AVG: 'Batting Avg',
  // NHL
  G: 'Goals',
  A: 'Assists',
  SOG: 'Shots',
  '+/-': 'Plus/Minus',
};

const PRIMARY_STATS: Record<string, string[]> = {
  NBA: ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM'],
  NCAAB: ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM'],
  NFL: ['PASS YDS', 'PASS TD', 'RUSH YDS', 'REC YDS', 'REC'],
  MLB: ['H', 'R', 'RBI', 'HR', 'AVG'],
  NHL: ['G', 'A', 'SOG', '+/-'],
};

const PROP_TYPE_LABELS: Record<string, string> = {
  POINTS: 'Points',
  REBOUNDS: 'Rebounds',
  ASSISTS: 'Assists',
  STEALS: 'Steals',
  BLOCKS: 'Blocks',
  THREES: '3-Pointers',
  PRA: 'PTS+REB+AST',
  PASSING_YARDS: 'Pass Yards',
  RUSHING_YARDS: 'Rush Yards',
  RECEIVING_YARDS: 'Rec Yards',
};

// ============================================
// COMPONENTS
// ============================================

function CinematicBackground({ teamColor }: { teamColor?: string }) {
  const color = teamColor || '3B82F6';
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,6%)] via-[hsl(220,20%,8%)] to-[hsl(220,25%,4%)]" />
      <div 
        className="absolute top-0 left-0 w-full h-[400px] opacity-20"
        style={{ background: `linear-gradient(180deg, #${color}40, transparent)` }}
      />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-500/[0.02] rounded-full blur-[100px]" />
    </div>
  );
}

function PlayerHero({ 
  player, 
  isFollowing = false,
  onFollowClick,
  isLoading = false
}: { 
  player: PlayerInfo;
  isFollowing?: boolean;
  onFollowClick?: () => void;
  isLoading?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  
  return (
    <div className="relative overflow-hidden">
      {/* Dramatic team color gradient background */}
      <div 
        className="absolute inset-0"
        style={{ 
          background: `linear-gradient(135deg, #${player.teamColor}30 0%, transparent 50%, #${player.teamColor}10 100%)` 
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
      
      {/* Glowing accent orb */}
      <div 
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[100px] opacity-30"
        style={{ backgroundColor: `#${player.teamColor}` }}
      />
      
      <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-6 p-6 sm:p-8">
        {/* Large Player Photo with glow */}
        <div className="relative group">
          {/* Glow effect behind photo */}
          <div 
            className="absolute inset-0 rounded-2xl blur-xl opacity-50 scale-110"
            style={{ backgroundColor: `#${player.teamColor}` }}
          />
          <div 
            className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20"
          >
            {!imgError ? (
              <img 
                src={player.headshotUrl}
                alt={player.displayName}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                <span className="text-6xl font-bold text-white/30">
                  {player.displayName.charAt(0)}
                </span>
              </div>
            )}
          </div>
          {/* Jersey number badge - larger and more prominent */}
          {player.jersey && (
            <div 
              className="absolute -bottom-3 -right-3 w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-xl border-2 border-black/20"
              style={{ backgroundColor: `#${player.teamColor}` }}
            >
              {player.jersey}
            </div>
          )}
        </div>
        
        {/* Player Info - Larger and more dramatic */}
        <div className="flex-1 text-center sm:text-left">
          {/* Position tag */}
          {player.position && (
            <span className="inline-block px-2.5 py-1 rounded-md bg-white/[0.08] text-white/60 text-xs font-semibold tracking-wide uppercase mb-2">
              {player.position}
            </span>
          )}
          
          {/* Name - Much larger */}
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-2">
            {player.displayName}
          </h1>
          
          {/* Team with colored accent */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: `#${player.teamColor}` }}
              />
              <span className="text-lg font-semibold text-white/90">
                {player.teamName}
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-md bg-white/[0.06] text-white/50 text-sm font-medium">
              {player.sport}
            </span>
          </div>
          
          {/* Bio details - cleaner layout */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-sm text-white/40 mb-4">
            {player.height && <span>{player.height}</span>}
            {player.weight && <span>{player.weight}</span>}
            {player.experience && <span>{player.experience} experience</span>}
            {player.college && <span className="text-white/30">{player.college}</span>}
          </div>
          
          {/* Follow Player Button */}
          <button
            onClick={onFollowClick}
            disabled={isLoading}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all",
              isLoading && "opacity-60 cursor-not-allowed",
              isFollowing 
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                : "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]"
            )}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isFollowing ? 'Unfollowing...' : 'Following...'}
              </>
            ) : isFollowing ? (
              <>
                <Bell className="w-4 h-4" />
                Following
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Follow Player
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtext, trend, isPrimary = false, accentColor }: { 
  label: string; 
  value: string | number; 
  subtext?: string;
  trend?: 'up' | 'down' | null;
  isPrimary?: boolean;
  accentColor?: string;
}) {
  return (
    <div className={cn(
      "relative rounded-xl border overflow-hidden transition-all hover:scale-[1.02]",
      isPrimary 
        ? "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border-white/[0.08] p-5"
        : "bg-white/[0.03] border-white/[0.04] p-4"
    )}>
      {/* Accent glow for primary stats */}
      {isPrimary && accentColor && (
        <div 
          className="absolute top-0 left-0 w-full h-1"
          style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
        />
      )}
      
      <div className={cn(
        "font-medium uppercase tracking-wider mb-1",
        isPrimary ? "text-xs text-white/50" : "text-[10px] text-white/40"
      )}>
        {label}
      </div>
      <div className="flex items-end gap-2">
        <span className={cn(
          "font-black text-white",
          isPrimary ? "text-4xl" : "text-2xl"
        )}>
          {value}
        </span>
        {trend && (
          <div className={cn(
            "flex items-center gap-0.5 mb-1 px-1.5 py-0.5 rounded-full text-xs font-semibold",
            trend === 'up' 
              ? "bg-emerald-500/20 text-emerald-400" 
              : "bg-red-500/20 text-red-400"
          )}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          </div>
        )}
      </div>
      {subtext && (
        <div className="text-xs text-white/30 mt-1">{subtext}</div>
      )}
    </div>
  );
}

// Big hero stat for the most important number
function HeroStat({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="relative flex-1 min-w-[100px] p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden group hover:bg-white/[0.05] transition-all">
      {/* Background glow */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `radial-gradient(circle at center, ${color}15, transparent 70%)` }}
      />
      
      <div className="relative flex items-center gap-3">
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium">{label}</div>
          <div className="text-2xl font-black text-white">{value}</div>
        </div>
      </div>
    </div>
  );
}

// Calculate streak for a stat (consecutive games above or below average)
function calculateStreak(games: GameLogEntry[], statKey: string, average: number): { type: 'hot' | 'cold' | null; count: number } {
  if (games.length === 0 || average === 0) return { type: null, count: 0 };
  
  let streakType: 'hot' | 'cold' | null = null;
  let count = 0;
  
  for (const game of games) {
    const val = parseFloat(String(game.stats[statKey] || 0));
    const isAbove = val > average * 1.05; // 5% above is "hot"
    const isBelow = val < average * 0.85; // 15% below is "cold"
    
    if (streakType === null) {
      if (isAbove) {
        streakType = 'hot';
        count = 1;
      } else if (isBelow) {
        streakType = 'cold';
        count = 1;
      }
    } else if (streakType === 'hot' && isAbove) {
      count++;
    } else if (streakType === 'cold' && isBelow) {
      count++;
    } else {
      break;
    }
  }
  
  // Only return streak if 3+ games
  if (count >= 3) {
    return { type: streakType, count };
  }
  return { type: null, count: 0 };
}

// Stat cell with visual indicator
function StatCell({ value, average, statKey }: { value: string | number | undefined; average: number; statKey: string }) {
  if (value === undefined) {
    return <span className="text-white/30">-</span>;
  }
  
  const numValue = parseFloat(String(value));
  const isPercentage = statKey.includes('%') || statKey === 'FGP' || statKey === 'AVG';
  
  // Don't compare percentages or if no average
  if (isPercentage || !average || isNaN(numValue)) {
    return <span className="text-white font-medium">{value}</span>;
  }
  
  const diff = numValue - average;
  const percentDiff = average > 0 ? (diff / average) * 100 : 0;
  
  // Thresholds: >15% above = green, <15% below = red
  const isAbove = percentDiff > 15;
  const isBelow = percentDiff < -15;
  
  return (
    <div className="flex items-center justify-center gap-1">
      <span className={cn(
        "font-medium tabular-nums",
        isAbove && "text-emerald-400",
        isBelow && "text-red-400",
        !isAbove && !isBelow && "text-white"
      )}>
        {value}
      </span>
      {isAbove && <TrendingUp className="w-3 h-3 text-emerald-400" />}
      {isBelow && <TrendingDown className="w-3 h-3 text-red-400" />}
    </div>
  );
}

function GameLogTable({ games, sport, seasonAverages }: { games: GameLogEntry[]; sport: string; seasonAverages: Record<string, number> }) {
  const [expanded, setExpanded] = useState(false);
  const displayGames = expanded ? games : games.slice(0, 5);
  
  // Get primary stat keys for this sport
  const statKeys = PRIMARY_STATS[sport] || PRIMARY_STATS.NBA;
  
  // Find stats that exist in the data
  const availableStats = statKeys.filter(key => 
    games.some(g => g.stats[key] !== undefined)
  ).slice(0, 5);
  
  // Calculate streaks for primary stats
  const streaks = useMemo(() => {
    const result: Record<string, { type: 'hot' | 'cold' | null; count: number }> = {};
    for (const stat of availableStats) {
      const avg = seasonAverages[stat] || 0;
      result[stat] = calculateStreak(games, stat, avg);
    }
    return result;
  }, [games, availableStats, seasonAverages]);
  
  // Find the primary streak to display (first one with 3+ games)
  const primaryStreak = useMemo(() => {
    for (const stat of availableStats) {
      if (streaks[stat]?.type && streaks[stat].count >= 3) {
        return { stat, ...streaks[stat] };
      }
    }
    return null;
  }, [streaks, availableStats]);
  
  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-white">Last {games.length} Games</h3>
        </div>
        
        {/* Streak Badge */}
        {primaryStreak && (
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
            primaryStreak.type === 'hot' 
              ? "bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 border border-orange-500/30"
              : "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/30"
          )}>
            {primaryStreak.type === 'hot' ? (
              <>
                <Flame className="w-3.5 h-3.5" />
                {primaryStreak.count}-Game Hot Streak
              </>
            ) : (
              <>
                <TrendingDown className="w-3.5 h-3.5" />
                {primaryStreak.count}-Game Cold Streak
              </>
            )}
            <span className="text-white/50">({STAT_LABELS[primaryStreak.stat] || primaryStreak.stat})</span>
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="px-4 py-2 border-b border-white/[0.02] flex items-center gap-4 text-[10px] text-white/40">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          <span>15%+ above avg</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-red-400" />
          <span>15%+ below avg</span>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="px-4 py-2 text-left text-white/40 font-medium">Date</th>
              <th className="px-4 py-2 text-left text-white/40 font-medium">OPP</th>
              <th className="px-4 py-2 text-center text-white/40 font-medium">W/L</th>
              {availableStats.map(stat => (
                <th key={stat} className="px-3 py-2 text-center text-white/40 font-medium">
                  <div className="flex flex-col items-center">
                    <span>{STAT_LABELS[stat] || stat}</span>
                    {seasonAverages[stat] !== undefined && (
                      <span className="text-[9px] text-white/25 font-normal">
                        avg {seasonAverages[stat]?.toFixed(1)}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayGames.map((game, i) => (
              <tr 
                key={i} 
                className={cn(
                  "border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors",
                  i === 0 && "bg-amber-500/[0.03]" // Highlight most recent
                )}
              >
                <td className="px-4 py-3 text-white/60">
                  {game.date ? new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                </td>
                <td className="px-4 py-3">
                  <span className="text-white/50">{game.homeAway === 'away' ? '@' : 'vs'}</span>
                  <span className="text-white ml-1">{game.opponent}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    game.result === 'W' ? "bg-emerald-500/20 text-emerald-400" :
                    game.result === 'L' ? "bg-red-500/20 text-red-400" :
                    "bg-white/10 text-white/50"
                  )}>
                    {game.result}
                  </span>
                </td>
                {availableStats.map(stat => (
                  <td key={stat} className="px-3 py-3 text-center">
                    <StatCell 
                      value={game.stats[stat]} 
                      average={seasonAverages[stat] || 0}
                      statKey={stat}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {games.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 text-center text-sm text-white/50 hover:text-white/70 hover:bg-white/[0.02] transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? (
            <>Show less <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>Show all {games.length} games <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      )}
    </div>
  );
}

// ============================================
// MATCHUP SECTION
// ============================================

function MatchupSection({ matchup }: { matchup: MatchupData }) {
  const gameTime = matchup.gameTime ? new Date(matchup.gameTime) : null;
  const isToday = gameTime && gameTime.toDateString() === new Date().toDateString();
  
  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" />
          <h3 className="font-semibold text-white">Next Matchup</h3>
        </div>
        {isToday && (
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-full">
            TODAY
          </span>
        )}
      </div>
      
      <div className="p-4">
        {/* Opponent Card */}
        <div className="flex items-center gap-4 mb-4">
          {matchup.opponent.logo ? (
            <img 
              src={matchup.opponent.logo} 
              alt={matchup.opponent.name}
              className="w-14 h-14 object-contain"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-white/[0.05] flex items-center justify-center">
              <span className="text-xl font-bold text-white/40">
                {matchup.opponent.abbr.slice(0, 2)}
              </span>
            </div>
          )}
          <div className="flex-1">
            <div className="text-lg font-semibold text-white">
              vs {matchup.opponent.name}
            </div>
            {gameTime && (
              <div className="flex items-center gap-3 text-sm text-white/50 mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {gameTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )}
            {matchup.venue && (
              <div className="text-xs text-white/30 mt-1">{matchup.venue}</div>
            )}
          </div>
        </div>
        
        {/* Defensive Rankings */}
        {matchup.defensiveRankings && (
          <div className="grid grid-cols-2 gap-3">
            {matchup.defensiveRankings.overall !== undefined && (
              <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <div className="text-xs text-white/40 mb-1">DEF Rank</div>
                <div className="flex items-baseline gap-1">
                  <span className={cn(
                    "text-2xl font-bold",
                    matchup.defensiveRankings.overall <= 10 ? "text-red-400" :
                    matchup.defensiveRankings.overall >= 20 ? "text-emerald-400" :
                    "text-white"
                  )}>
                    #{matchup.defensiveRankings.overall}
                  </span>
                  <span className="text-xs text-white/30">
                    {matchup.defensiveRankings.overall <= 10 ? '(tough)' : 
                     matchup.defensiveRankings.overall >= 20 ? '(favorable)' : ''}
                  </span>
                </div>
              </div>
            )}
            
            {matchup.defensiveRankings.ptsAllowed !== undefined && (
              <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <div className="text-xs text-white/40 mb-1">Opp PPG Allowed</div>
                <div className="text-2xl font-bold text-white">
                  {matchup.defensiveRankings.ptsAllowed.toFixed(1)}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Favorable/Tough indicator */}
        {matchup.defensiveRankings?.overall !== undefined && (
          <div className={cn(
            "mt-3 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2",
            matchup.defensiveRankings.overall >= 20 
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : matchup.defensiveRankings.overall <= 10
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-white/[0.03] text-white/60 border border-white/[0.04]"
          )}>
            {matchup.defensiveRankings.overall >= 20 ? (
              <>
                <TrendingUp className="w-4 h-4" />
                Favorable matchup — Weak defense
              </>
            ) : matchup.defensiveRankings.overall <= 10 ? (
              <>
                <Shield className="w-4 h-4" />
                Tough matchup — Elite defense
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                Neutral matchup
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// HEALTH SECTION
// ============================================

const HEALTH_STATUS_CONFIG: Record<HealthData['status'], {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  healthy: { label: 'Healthy', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  questionable: { label: 'Questionable', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  doubtful: { label: 'Doubtful', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
  out: { label: 'Out', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  injury_reserve: { label: 'Injury Reserve', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  unknown: { label: 'Unknown', color: 'text-white/50', bgColor: 'bg-white/5', borderColor: 'border-white/10' },
};

function HealthSection({ health }: { health: HealthData }) {
  const statusConfig = HEALTH_STATUS_CONFIG[health.status];
  const { minutesTrend } = health;
  
  const trendDiff = minutesTrend.last5Avg - minutesTrend.seasonAvg;
  const trendPercent = minutesTrend.seasonAvg > 0 
    ? Math.round((trendDiff / minutesTrend.seasonAvg) * 100) 
    : 0;
  
  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
        <Heart className="w-4 h-4 text-rose-400" />
        <h3 className="font-semibold text-white">Health & Minutes</h3>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Health Status */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border",
          statusConfig.bgColor, statusConfig.borderColor
        )}>
          <div>
            <div className="text-xs text-white/40 mb-1">Status</div>
            <div className={cn("text-lg font-semibold", statusConfig.color)}>
              {statusConfig.label}
            </div>
          </div>
          {health.status !== 'healthy' && health.status !== 'unknown' && (
            <AlertCircle className={cn("w-6 h-6", statusConfig.color)} />
          )}
        </div>
        
        {/* Injury Details */}
        {health.injury && (
          <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
            <div className="text-xs text-white/40 mb-1">Injury</div>
            <div className="text-sm text-white">{health.injury}</div>
            {health.expectedReturn && (
              <div className="text-xs text-white/50 mt-1">
                Expected return: {health.expectedReturn}
              </div>
            )}
          </div>
        )}
        
        {/* Minutes Trend */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">Minutes Trend</div>
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
              minutesTrend.trend === 'up' ? "bg-emerald-500/20 text-emerald-400" :
              minutesTrend.trend === 'down' ? "bg-red-500/20 text-red-400" :
              "bg-white/10 text-white/50"
            )}>
              {minutesTrend.trend === 'up' ? (
                <><TrendingUp className="w-3 h-3" /> Increasing</>
              ) : minutesTrend.trend === 'down' ? (
                <><TrendingDown className="w-3 h-3" /> Decreasing</>
              ) : (
                <>Stable</>
              )}
            </div>
          </div>
          
          {/* Minutes Bar Chart */}
          {minutesTrend.last5.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-1 h-16">
                {minutesTrend.last5.map((mins, i) => {
                  const maxMins = Math.max(...minutesTrend.last5, minutesTrend.seasonAvg);
                  const height = maxMins > 0 ? (mins / maxMins) * 100 : 0;
                  const isAboveAvg = mins > minutesTrend.seasonAvg;
                  
                  return (
                    <div 
                      key={i}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <span className="text-[10px] text-white/40">
                        {mins.toFixed(0)}
                      </span>
                      <div 
                        className={cn(
                          "w-full rounded-t transition-all",
                          isAboveAvg ? "bg-emerald-500/60" : "bg-white/20",
                          i === 0 && "ring-1 ring-amber-400/50"
                        )}
                        style={{ height: `${height}%`, minHeight: '4px' }}
                      />
                    </div>
                  );
                })}
              </div>
              
              {/* Season Average Line Label */}
              <div className="flex items-center justify-between text-[10px] text-white/30">
                <span>Last 5 games →</span>
                <span>Season avg: {minutesTrend.seasonAvg.toFixed(1)} min</span>
              </div>
            </div>
          )}
          
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 rounded-lg bg-white/[0.03]">
              <div className="text-xs text-white/40">Last 5 Avg</div>
              <div className="text-lg font-semibold text-white">
                {minutesTrend.last5Avg.toFixed(1)}
                <span className="text-xs text-white/40 ml-1">min</span>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/[0.03]">
              <div className="text-xs text-white/40">vs Season</div>
              <div className={cn(
                "text-lg font-semibold",
                trendDiff > 1 ? "text-emerald-400" :
                trendDiff < -1 ? "text-red-400" :
                "text-white"
              )}>
                {trendDiff > 0 ? '+' : ''}{trendDiff.toFixed(1)}
                <span className="text-xs text-white/40 ml-1">
                  ({trendPercent > 0 ? '+' : ''}{trendPercent}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropHitRatesPanel({ 
  hitRates, 
  props 
}: { 
  hitRates: Record<string, PropHitRate>; 
  props: any[];
}) {
  if (Object.keys(hitRates).length === 0 && props.length === 0) {
    return null;
  }
  
  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
        <Target className="w-4 h-4 text-blue-400" />
        <h3 className="font-semibold text-white">Today's Props & Hit Rates</h3>
      </div>
      
      <div className="p-4 space-y-3">
        {Object.entries(hitRates).map(([propType, data]) => {
          const prop = props.find(p => p.prop_type === propType);
          const hitPercent = Math.round(data.rate * 100);
          
          return (
            <div 
              key={propType}
              className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]"
            >
              <div>
                <div className="text-white font-medium">
                  {PROP_TYPE_LABELS[propType] || propType}
                </div>
                {prop && (
                  <div className="text-sm text-white/50">
                    Line: {prop.line_value}
                  </div>
                )}
              </div>
              
              <div className="text-right">
                <div className={cn(
                  "text-lg font-bold",
                  hitPercent >= 70 ? "text-emerald-400" :
                  hitPercent >= 50 ? "text-amber-400" :
                  "text-red-400"
                )}>
                  {hitPercent}%
                </div>
                <div className="text-xs text-white/40">
                  {data.hits}/{data.total} games
                </div>
              </div>
            </div>
          );
        })}
        
        {Object.keys(hitRates).length === 0 && props.length > 0 && (
          <div className="text-sm text-white/50 text-center py-2">
            Hit rates calculated from recent game log
          </div>
        )}
      </div>
    </div>
  );
}

function CoachGAnalysis({ 
  player, 
  gameLog, 
  seasonAverages,
  props 
}: { 
  player: PlayerInfo;
  gameLog: GameLogEntry[];
  seasonAverages: Record<string, number>;
  props: any[];
}) {
  const { user } = useDemoAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialAnalysis, setHasInitialAnalysis] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);
  
  // Generate initial analysis on mount
  useEffect(() => {
    if (hasInitialAnalysis || chatHistory.length > 0) return;
    
    const generateInitialAnalysis = async () => {
      setIsLoading(true);
      
      try {
        // Build player context
        const last5Stats = gameLog.slice(0, 5).map(g => {
          const pts = g.stats['PTS'] || g.stats['Points'] || 0;
          const reb = g.stats['REB'] || g.stats['Rebounds'] || 0;
          const ast = g.stats['AST'] || g.stats['Assists'] || 0;
          return `${g.date ? new Date(g.date).toLocaleDateString() : 'Recent'} vs ${g.opponent}: ${pts} pts, ${reb} reb, ${ast} ast (${g.result})`;
        }).join('\n');
        
        const propsContext = props.slice(0, 5).map(p => 
          `${PROP_TYPE_LABELS[p.prop_type] || p.prop_type}: ${p.line_value}`
        ).join(', ');
        
        const contextMessage = `[Player Profile Analysis Request]
Player: ${player.displayName} (${player.teamName} - ${player.position})
Sport: ${player.sport}

Last 5 Games:
${last5Stats || 'No recent game data'}

Season Averages: ${Object.entries(seasonAverages).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Not available'}

Current Props Lines: ${propsContext || 'None available'}

Provide a concise analysis of this player's recent form, any trends you notice, and whether their current prop lines look favorable based on the data. Keep it to 2-3 sentences.`;

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': user?.id?.toString() || ''
          },
          credentials: 'include',
          body: JSON.stringify({
            persona: 'coach',
            message: contextMessage,
            pageContext: 'player-profile',
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          setChatHistory([{ 
            role: 'assistant', 
            content: data.structured?.answerSummary || data.response 
          }]);
        }
      } catch (err) {
        console.error('Failed to generate analysis:', err);
      } finally {
        setIsLoading(false);
        setHasInitialAnalysis(true);
      }
    };
    
    // Small delay before generating
    const timer = setTimeout(generateInitialAnalysis, 500);
    return () => clearTimeout(timer);
  }, [player, gameLog, props, seasonAverages, user?.id, hasInitialAnalysis, chatHistory.length]);
  
  const suggestedQuestions = [
    `How does ${player.displayName} perform against tough defenses?`,
    `Should I take the over on his points prop?`,
    `What's his ceiling in this matchup?`,
    `Any injury concerns?`
  ];
  
  const askCoachG = async () => {
    if (!message.trim() || isLoading) return;
    
    const userMessage = message.trim();
    setMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    
    try {
      const last5Stats = gameLog.slice(0, 5).map(g => {
        const pts = g.stats['PTS'] || g.stats['Points'] || 0;
        return `vs ${g.opponent}: ${pts} pts (${g.result})`;
      }).join(', ');
      
      const contextMessage = `[Context: Viewing ${player.displayName}'s profile (${player.teamName} - ${player.sport}). Recent: ${last5Stats}]

User question: ${userMessage}`;
      
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user?.id?.toString() || ''
        },
        credentials: 'include',
        body: JSON.stringify({
          persona: 'coach',
          message: contextMessage,
          pageContext: 'player-profile',
          conversationHistory: chatHistory.slice(-6)
        })
      });
      
      if (!response.ok) throw new Error('Failed to get response');
      
      const data = await response.json();
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: data.structured?.answerSummary || data.response 
      }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: "Having trouble connecting. Try again in a moment." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="bg-gradient-to-br from-blue-500/[0.08] to-purple-500/[0.05] rounded-xl border border-blue-500/20 overflow-hidden">
      {/* Header */}
      <div 
        className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <img 
            src="/assets/coachg/coach-g-avatar.png"
            alt="Coach G"
            className="w-10 h-10 rounded-full"
          />
          <div>
            <h3 className="font-semibold text-white flex items-center gap-1.5">
              Coach G Analysis
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </h3>
            <p className="text-xs text-white/50">Player intelligence & insights</p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-white/40" /> : <ChevronDown className="w-5 h-5 text-white/40" />}
      </div>
      
      {isOpen && (
        <>
          {/* Chat Messages */}
          <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
            {chatHistory.length === 0 && !isLoading ? (
              <div className="text-center py-4">
                <p className="text-sm text-white/50 mb-3">
                  Ask me anything about {player.displayName}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestedQuestions.slice(0, 2).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setMessage(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/60 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {chatHistory.map((msg, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "flex",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-[85%] px-3 py-2 rounded-2xl text-sm",
                      msg.role === 'user'
                        ? "bg-blue-500 text-white rounded-br-md"
                        : "bg-white/[0.06] text-white/90 rounded-bl-md"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
          
          {/* Input */}
          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && askCoachG()}
                placeholder={`Ask about ${player.displayName}...`}
                className="flex-1 bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-blue-500/30"
                disabled={isLoading}
              />
              <button
                onClick={askCoachG}
                disabled={!message.trim() || isLoading}
                className="px-4 py-2.5 rounded-xl bg-blue-500 text-white disabled:opacity-50 hover:bg-blue-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero skeleton */}
      <div className="flex gap-6 p-6">
        <div className="w-32 h-32 rounded-2xl bg-white/10" />
        <div className="flex-1 space-y-3">
          <div className="h-8 w-48 bg-white/10 rounded" />
          <div className="h-5 w-32 bg-white/10 rounded" />
          <div className="h-4 w-64 bg-white/10 rounded" />
        </div>
      </div>
      
      {/* Stats grid skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-white/[0.03] rounded-xl" />
        ))}
      </div>
      
      {/* Table skeleton */}
      <div className="h-64 bg-white/[0.02] rounded-xl" />
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PlayerProfilePage() {
  const { sport, playerName } = useParams<{ sport: string; playerName: string }>();
  const navigate = useNavigate();
  
  const [data, setData] = useState<PlayerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  
  // Watchboard hook for follow functionality
  const { 
    isPlayerFollowed, 
    followPlayer, 
    unfollowPlayerByName
  } = useWatchboards();
  
  useEffect(() => {
    if (!sport || !playerName) return;
    
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/player/${sport}/${encodeURIComponent(playerName)}`, {
          credentials: 'include',
        });
        
        if (!res.ok) {
          if (res.status === 404) {
            const errData = await res.json();
            // Use fallback data if provided
            if (errData.fallback) {
              setData({
                player: {
                  ...errData.fallback,
                  espnId: '',
                  position: '',
                  jersey: '',
                  teamAbbr: '',
                  teamColor: '3B82F6',
                },
                gameLog: [],
                seasonAverages: {},
                currentProps: [],
                propHitRates: {},
                matchup: null,
                lastUpdated: new Date().toISOString(),
              });
              return;
            }
            throw new Error('Player not found');
          }
          throw new Error('Failed to load player data');
        }
        
        const profileData = await res.json();
        setData(profileData);
      } catch (err: any) {
        console.error('Failed to fetch player profile:', err);
        setError(err.message || 'Failed to load player profile');
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
  }, [sport, playerName]);
  
  // Check if current player is followed
  const isFollowing = useMemo(() => {
    if (!sport || !playerName) return false;
    // Decode the URL-encoded player name for comparison
    const decodedName = decodeURIComponent(playerName);
    return isPlayerFollowed(decodedName, sport.toUpperCase());
  }, [sport, playerName, isPlayerFollowed]);
  
  // Handle follow/unfollow toggle
  const handleFollowClick = useCallback(async () => {
    if (!data?.player || !sport || followLoading) return;
    
    setFollowLoading(true);
    try {
      if (isFollowing) {
        // Unfollow
        await unfollowPlayerByName(data.player.displayName, sport.toUpperCase());
      } else {
        // Follow - include player details
        await followPlayer({
          player_name: data.player.displayName,
          player_id: data.player.espnId || undefined,
          sport: sport.toUpperCase(),
          team: data.player.teamName || undefined,
          team_abbr: data.player.teamAbbr || undefined,
          position: data.player.position || undefined,
          headshot_url: data.player.headshotUrl || undefined,
        });
      }
    } catch (err) {
      console.error('Failed to toggle follow:', err);
    } finally {
      setFollowLoading(false);
    }
  }, [data?.player, sport, isFollowing, followLoading, followPlayer, unfollowPlayerByName]);
  
  // Calculate season averages to display
  const displayAverages = useMemo(() => {
    if (!data?.seasonAverages) return [];
    
    const sportKeys = PRIMARY_STATS[sport?.toUpperCase() || 'NBA'] || PRIMARY_STATS.NBA;
    const avgEntries: Array<{ key: string; value: number }> = [];
    
    for (const key of sportKeys) {
      const val = data.seasonAverages[key];
      if (val !== undefined && !isNaN(val)) {
        avgEntries.push({ key, value: val });
      }
    }
    
    // If no matching keys, show first 6 available
    if (avgEntries.length === 0) {
      Object.entries(data.seasonAverages).slice(0, 6).forEach(([key, value]) => {
        if (!isNaN(value)) {
          avgEntries.push({ key, value });
        }
      });
    }
    
    return avgEntries.slice(0, 6);
  }, [data?.seasonAverages, sport]);
  
  return (
    <div className="relative min-h-screen">
      <CinematicBackground teamColor={data?.player?.teamColor} />
      
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6 space-y-6 pb-24">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Props</span>
        </button>
        
        {/* Loading State */}
        {loading && <LoadingSkeleton />}
        
        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-white mb-2">{error}</p>
            <button
              onClick={() => navigate('/props')}
              className="text-sm text-amber-400 hover:underline"
            >
              Back to Player Props
            </button>
          </div>
        )}
        
        {/* Player Profile */}
        {data && !loading && (
          <>
            {/* Hero Section */}
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] overflow-hidden">
              <PlayerHero 
                player={data.player} 
                isFollowing={isFollowing}
                onFollowClick={handleFollowClick}
                isLoading={followLoading}
              />
            </div>
            
            {/* Primary Stats Row - Big numbers */}
            {displayAverages.length >= 3 && (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                <HeroStat
                  label={STAT_LABELS[displayAverages[0]?.key] || displayAverages[0]?.key || 'PTS'}
                  value={displayAverages[0]?.value?.toFixed(1) || '0.0'}
                  icon={Flame}
                  color="#F59E0B"
                />
                <HeroStat
                  label={STAT_LABELS[displayAverages[1]?.key] || displayAverages[1]?.key || 'REB'}
                  value={displayAverages[1]?.value?.toFixed(1) || '0.0'}
                  icon={Target}
                  color="#3B82F6"
                />
                <HeroStat
                  label={STAT_LABELS[displayAverages[2]?.key] || displayAverages[2]?.key || 'AST'}
                  value={displayAverages[2]?.value?.toFixed(1) || '0.0'}
                  icon={Zap}
                  color="#10B981"
                />
              </div>
            )}
            
            {/* Season Averages Grid */}
            {displayAverages.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <h2 className="font-semibold text-white">Season Averages</h2>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {displayAverages.map(({ key, value }) => (
                    <StatCard 
                      key={key}
                      label={STAT_LABELS[key] || key}
                      value={typeof value === 'number' ? value.toFixed(1) : value}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Coach G Analysis - Prominent placement */}
            <CoachGAnalysis 
              player={data.player}
              gameLog={data.gameLog}
              seasonAverages={data.seasonAverages}
              props={data.currentProps}
            />
            
            {/* Matchup & Health Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Next Matchup */}
              {data.matchup && (
                <MatchupSection matchup={data.matchup} />
              )}
              
              {/* Health & Minutes */}
              {data.health && (
                <HealthSection health={data.health} />
              )}
            </div>
            
            {/* Props & Hit Rates */}
            <PropHitRatesPanel 
              hitRates={data.propHitRates}
              props={data.currentProps}
            />
            
            {/* Game Log */}
            {data.gameLog.length > 0 && (
              <GameLogTable 
                games={data.gameLog} 
                sport={data.player.sport} 
                seasonAverages={data.seasonAverages}
              />
            )}
            
            {/* Empty state for no data */}
            {data.gameLog.length === 0 && Object.keys(data.seasonAverages).length === 0 && (
              <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-8 text-center">
                <User className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/50 mb-1">Limited data available</p>
                <p className="text-sm text-white/30">
                  Game logs and stats may not be available for this player yet
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
