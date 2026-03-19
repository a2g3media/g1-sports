/**
 * PerformanceTrackerPage - Betting performance analytics dashboard
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Trophy, 
  Flame, 
  BarChart3, 
  Clock, 
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
  RefreshCw,
  Filter
} from 'lucide-react';
import { ShareButton, type ShareData } from '@/react-app/components/ShareModal';
import { useBetPerformance, type SportStats, type MarketStats, type TicketWithLegs } from '../hooks/useBetPerformance';
import { cn } from '@/react-app/lib/utils';

// Sport icons mapping
const SPORT_ICONS: Record<string, string> = {
  NBA: '🏀',
  NFL: '🏈',
  MLB: '⚾',
  NHL: '🏒',
  NCAAB: '🏀',
  NCAAF: '🏈',
  Soccer: '⚽',
  MMA: '🥊',
  Unknown: '🎯',
};

// Market type display names
const MARKET_DISPLAY: Record<string, string> = {
  Spread: 'Spread',
  Moneyline: 'Moneyline',
  Total: 'Total (O/U)',
  'Player Prop': 'Player Props',
  'Game Prop': 'Game Props',
  Other: 'Other',
};

function StatCard({ 
  label, 
  value, 
  subtext, 
  icon: Icon, 
  trend,
  colorClass = 'text-foreground' 
}: { 
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  colorClass?: string;
}) {
  return (
    <div className="relative bg-card/60 backdrop-blur border border-border/50 rounded-xl p-4 overflow-hidden group hover:border-primary/30 transition-colors">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className={cn("text-2xl font-bold", colorClass)}>
          {value}
          {trend && (
            <span className="ml-2 inline-flex">
              {trend === 'up' && <ArrowUp className="w-4 h-4 text-emerald-500" />}
              {trend === 'down' && <ArrowDown className="w-4 h-4 text-red-500" />}
              {trend === 'neutral' && <Minus className="w-4 h-4 text-muted-foreground" />}
            </span>
          )}
        </div>
        {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
      </div>
    </div>
  );
}

function ProgressRing({ percentage, size = 80, strokeWidth = 6 }: { percentage: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  const color = percentage >= 55 ? 'stroke-emerald-500' : percentage >= 50 ? 'stroke-amber-500' : 'stroke-red-500';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="stroke-muted/30"
          strokeWidth={strokeWidth}
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={cn("transition-all duration-700 ease-out", color)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{percentage.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function BreakdownBar({ stats, type }: { stats: SportStats[] | MarketStats[]; type: 'sport' | 'market' }) {
  if (stats.length === 0) return null;

  const sortedStats = [...stats].sort((a, b) => b.total - a.total).slice(0, 5);

  return (
    <div className="space-y-3">
      {sortedStats.map((stat) => {
        const key = type === 'sport' ? (stat as SportStats).sport : (stat as MarketStats).market;
        const icon = type === 'sport' ? SPORT_ICONS[key] || '🎯' : null;
        const displayName = type === 'market' ? MARKET_DISPLAY[key] || key : key;
        const settledGames = stat.wins + stat.losses;
        
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {icon && <span>{icon}</span>}
                <span className="font-medium">{displayName}</span>
              </span>
              <span className="text-muted-foreground">
                {stat.wins}W - {stat.losses}L 
                {stat.pending > 0 && <span className="text-amber-500 ml-1">({stat.pending} pending)</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    stat.hitRate >= 55 ? 'bg-emerald-500' : stat.hitRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${Math.min(100, stat.hitRate)}%` }}
                />
              </div>
              <span className={cn(
                "text-xs font-medium w-12 text-right",
                stat.hitRate >= 55 ? 'text-emerald-500' : stat.hitRate >= 50 ? 'text-amber-500' : 'text-red-500'
              )}>
                {settledGames > 0 ? `${stat.hitRate.toFixed(1)}%` : '-'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: TicketWithLegs }) {
  const isWin = ticket.status === 'won';
  const isLoss = ticket.status === 'lost';
  const isPush = ticket.status === 'push';

  const statusColor = isWin ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' 
    : isLoss ? 'text-red-500 bg-red-500/10 border-red-500/30'
    : isPush ? 'text-amber-500 bg-amber-500/10 border-amber-500/30'
    : 'text-blue-500 bg-blue-500/10 border-blue-500/30';

  const statusLabel = isWin ? 'WON' : isLoss ? 'LOST' : isPush ? 'PUSH' : 'PENDING';

  return (
    <Link 
      to={`/bet/${ticket.id}/review`}
      className="block p-3 bg-card/40 border border-border/30 rounded-lg hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {ticket.title || `${ticket.ticket_type === 'parlay' ? 'Parlay' : 'Single'} - ${ticket.legs.length} Leg${ticket.legs.length > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
            {ticket.stake_amount && <span>${ticket.stake_amount.toFixed(2)} stake</span>}
            {ticket.to_win_amount && <span className="text-emerald-500">+${ticket.to_win_amount.toFixed(2)}</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {ticket.legs.slice(0, 3).map((leg, i) => (
              <span key={i} className="text-xs px-2 py-0.5 bg-muted/30 rounded">
                {leg.team_or_player}
              </span>
            ))}
            {ticket.legs.length > 3 && (
              <span className="text-xs px-2 py-0.5 bg-muted/30 rounded text-muted-foreground">
                +{ticket.legs.length - 3} more
              </span>
            )}
          </div>
        </div>
        <span className={cn("text-xs font-bold px-2 py-1 rounded border", statusColor)}>
          {statusLabel}
        </span>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <BarChart3 className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-bold mb-2">No Betting Data Yet</h2>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Start tracking your bets to see your win rate, ROI, and performance breakdowns by sport and market type.
      </p>
      <Link 
        to="/bet/new"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
      >
        <Target className="w-4 h-4" />
        Add Your First Bet
      </Link>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted/20 rounded-xl" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-64 bg-muted/20 rounded-xl" />
        <div className="h-64 bg-muted/20 rounded-xl" />
      </div>
    </div>
  );
}

export default function PerformanceTrackerPage() {
  const { data, tickets, isLoading, error, refresh, fetchTickets } = useBetPerformance();
  const [ticketFilter, setTicketFilter] = useState<'all' | 'won' | 'lost' | 'pending'>('all');

  const handleFilterChange = (filter: 'all' | 'won' | 'lost' | 'pending') => {
    setTicketFilter(filter);
    fetchTickets(filter, 10);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Performance Tracker</h1>
          </div>
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={refresh} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.overview.totalTickets === 0) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Performance Tracker</h1>
          </div>
          <EmptyState />
        </div>
      </div>
    );
  }

  const { overview, financial, streaks, recent, bySport, byMarket } = data;
  const settledTickets = overview.wonTickets + overview.lostTickets;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Performance Tracker</h1>
              <p className="text-sm text-muted-foreground">
                {overview.totalTickets} total tickets • {settledTickets} settled
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Share Button */}
              <ShareButton
                data={{
                  type: 'performance',
                  title: 'My GZ Sports Performance',
                  description: `${overview.ticketWinRate.toFixed(1)}% win rate across ${overview.totalTickets} tickets`,
                  winRate: overview.ticketWinRate,
                  totalTickets: overview.totalTickets,
                  roi: financial.roi,
                  currentStreak: streaks.currentStreak > 0 ? {
                    count: streaks.currentStreak,
                    type: streaks.currentStreakType as 'W' | 'L'
                  } : undefined,
                } as ShareData}
                variant="outline"
                className="border-border/50 hover:bg-muted/50"
              />
              <button 
                onClick={refresh}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Hero Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Win Rate"
            value={`${overview.ticketWinRate.toFixed(1)}%`}
            subtext={`${overview.wonTickets}W - ${overview.lostTickets}L`}
            icon={Target}
            trend={overview.ticketWinRate >= 52 ? 'up' : overview.ticketWinRate < 48 ? 'down' : 'neutral'}
            colorClass={overview.ticketWinRate >= 52 ? 'text-emerald-500' : overview.ticketWinRate < 48 ? 'text-red-500' : 'text-foreground'}
          />
          <StatCard
            label="ROI"
            value={`${financial.roi >= 0 ? '+' : ''}${financial.roi.toFixed(1)}%`}
            subtext={`$${financial.totalProfit >= 0 ? '+' : ''}${financial.totalProfit.toFixed(2)} profit`}
            icon={financial.roi >= 0 ? TrendingUp : TrendingDown}
            colorClass={financial.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}
          />
          <StatCard
            label="Leg Hit Rate"
            value={`${overview.legHitRate.toFixed(1)}%`}
            subtext={`${overview.wonLegs}/${overview.wonLegs + overview.lostLegs} legs hit`}
            icon={BarChart3}
            colorClass={overview.legHitRate >= 55 ? 'text-emerald-500' : overview.legHitRate < 50 ? 'text-red-500' : 'text-foreground'}
          />
          <StatCard
            label="Current Streak"
            value={streaks.currentStreak > 0 ? `${streaks.currentStreak}${streaks.currentStreakType}` : '-'}
            subtext={`Best: ${streaks.longestWinStreak}W streak`}
            icon={Flame}
            colorClass={streaks.currentStreakType === 'W' ? 'text-emerald-500' : streaks.currentStreakType === 'L' ? 'text-red-500' : 'text-foreground'}
          />
        </div>

        {/* Middle Section - Hit Rate Ring + Recent */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Hit Rate Ring */}
          <div className="bg-card/60 backdrop-blur border border-border/50 rounded-xl p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Overall Performance
            </h3>
            <div className="flex items-center justify-center py-4">
              <ProgressRing percentage={overview.ticketWinRate} size={120} strokeWidth={8} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 text-center">
              <div>
                <div className="text-lg font-bold text-emerald-500">{overview.wonTickets}</div>
                <div className="text-xs text-muted-foreground">Wins</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-500">{overview.lostTickets}</div>
                <div className="text-xs text-muted-foreground">Losses</div>
              </div>
              <div>
                <div className="text-lg font-bold text-amber-500">{overview.pushTickets}</div>
                <div className="text-xs text-muted-foreground">Pushes</div>
              </div>
            </div>
          </div>

          {/* Last 7 Days */}
          <div className="bg-card/60 backdrop-blur border border-border/50 rounded-xl p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Last 7 Days
            </h3>
            {recent.total > 0 ? (
              <>
                <div className="flex items-center justify-center py-4">
                  <ProgressRing percentage={recent.hitRate} size={100} strokeWidth={6} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-emerald-500">{recent.wins}</div>
                    <div className="text-xs text-muted-foreground">Wins</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-red-500">{recent.losses}</div>
                    <div className="text-xs text-muted-foreground">Losses</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Clock className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm">No activity this week</span>
              </div>
            )}
          </div>

          {/* Streaks Card */}
          <div className="bg-card/60 backdrop-blur border border-border/50 rounded-xl p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Flame className="w-4 h-4" />
              Streaks
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                <span className="text-sm text-muted-foreground">Current</span>
                <span className={cn(
                  "text-lg font-bold",
                  streaks.currentStreakType === 'W' ? 'text-emerald-500' : 
                  streaks.currentStreakType === 'L' ? 'text-red-500' : 'text-muted-foreground'
                )}>
                  {streaks.currentStreak > 0 ? `${streaks.currentStreak}${streaks.currentStreakType}` : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <span className="text-sm text-emerald-500">Best Win Streak</span>
                <span className="text-lg font-bold text-emerald-500">{streaks.longestWinStreak}W</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                <span className="text-sm text-red-500">Worst Loss Streak</span>
                <span className="text-lg font-bold text-red-500">{streaks.longestLossStreak}L</span>
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* By Sport */}
          <div className="bg-card/60 backdrop-blur border border-border/50 rounded-xl p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Performance by Sport</h3>
            {bySport.length > 0 ? (
              <BreakdownBar stats={bySport} type="sport" />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </div>

          {/* By Market Type */}
          <div className="bg-card/60 backdrop-blur border border-border/50 rounded-xl p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Performance by Market</h3>
            {byMarket.length > 0 ? (
              <BreakdownBar stats={byMarket} type="market" />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </div>
        </div>

        {/* Recent Tickets */}
        <div className="bg-card/60 backdrop-blur border border-border/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4" />
              Recent Tickets
            </h3>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={ticketFilter}
                onChange={(e) => handleFilterChange(e.target.value as typeof ticketFilter)}
                className="text-xs bg-muted/30 border border-border/50 rounded px-2 py-1"
              >
                <option value="all">All</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          
          {tickets.length > 0 ? (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No {ticketFilter !== 'all' ? ticketFilter : ''} tickets found
            </p>
          )}
          
          {tickets.length > 0 && (
            <Link 
              to="/bet/new"
              className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              View All Tickets
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
