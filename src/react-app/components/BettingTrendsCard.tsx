/**
 * Betting Trends Card - Shows public betting percentages and sharp action
 * 
 * Displays where money is going and identifies potential sharp moves
 */

import { memo } from 'react';
import { TrendingUp, TrendingDown, Users, Zap, AlertCircle } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

interface PublicBetting {
  spreadHome: number;
  spreadAway: number;
  totalOver: number;
  totalUnder: number;
  mlHome: number;
  mlAway: number;
}

interface SharpAction {
  indicator: 'home' | 'away' | 'over' | 'under' | 'none';
  confidence: 'low' | 'medium' | 'high';
  note: string;
}

interface Movement {
  direction: string;
  points: number;
}

interface BettingTrendsCardProps {
  publicBetting: PublicBetting;
  sharpAction: SharpAction;
  spreadMovement: Movement;
  totalMovement: Movement;
  homeTeam?: string;
  awayTeam?: string;
}

// Percentage bar component
const PercentageBar = memo(function PercentageBar({
  leftLabel,
  rightLabel,
  leftPct,
  rightPct,
  leftHighlight,
  rightHighlight
}: {
  leftLabel: string;
  rightLabel: string;
  leftPct: number;
  rightPct: number;
  leftHighlight?: boolean;
  rightHighlight?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className={cn(
          "font-medium",
          leftHighlight ? "text-emerald-400" : "text-white/70"
        )}>
          {leftLabel}
        </span>
        <span className={cn(
          "font-medium",
          rightHighlight ? "text-emerald-400" : "text-white/70"
        )}>
          {rightLabel}
        </span>
      </div>
      <div className="flex items-center gap-1 h-2">
        <div 
          className={cn(
            "h-full rounded-l-full transition-all",
            leftHighlight ? "bg-emerald-500" : "bg-primary/60"
          )}
          style={{ width: `${leftPct}%` }}
        />
        <div 
          className={cn(
            "h-full rounded-r-full transition-all",
            rightHighlight ? "bg-emerald-500" : "bg-white/20"
          )}
          style={{ width: `${rightPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-white/40">
        <span>{leftPct}%</span>
        <span>{rightPct}%</span>
      </div>
    </div>
  );
});

// Movement indicator
const MovementIndicator = memo(function MovementIndicator({
  label,
  direction,
  points
}: {
  label: string;
  direction: string;
  points: number;
}) {
  const isSignificant = points >= 1;
  const directionLabel = direction === 'toward_home' ? 'Home' :
                         direction === 'toward_away' ? 'Away' :
                         direction === 'over' ? 'Over' :
                         direction === 'under' ? 'Under' : 'None';
  
  return (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
      <div className="text-[10px] text-white/40 uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-center gap-2">
        {direction !== 'none' ? (
          <>
            {(direction === 'toward_home' || direction === 'over') ? (
              <TrendingUp className={cn(
                "w-4 h-4",
                isSignificant ? "text-emerald-400" : "text-white/50"
              )} />
            ) : (
              <TrendingDown className={cn(
                "w-4 h-4",
                isSignificant ? "text-red-400" : "text-white/50"
              )} />
            )}
            <span className={cn(
              "font-semibold",
              isSignificant ? "text-white" : "text-white/60"
            )}>
              {points.toFixed(1)} pts
            </span>
            <span className="text-xs text-white/40">→ {directionLabel}</span>
          </>
        ) : (
          <span className="text-white/40 text-sm">No movement</span>
        )}
      </div>
    </div>
  );
});

export const BettingTrendsCard = memo(function BettingTrendsCard({
  publicBetting,
  sharpAction,
  spreadMovement,
  totalMovement,
  homeTeam = 'Home',
  awayTeam = 'Away'
}: BettingTrendsCardProps) {
  // Calculate percentages - ensure they add up to 100
  const spreadHome = publicBetting.spreadHome;
  const spreadAway = 100 - spreadHome;
  const totalOver = publicBetting.totalOver;
  const totalUnder = 100 - totalOver;
  const mlHome = publicBetting.mlHome;
  const mlAway = 100 - mlHome;

  // Detect reverse line movement (sharp indicator)
  const isReverseSpread = (spreadHome > 60 && spreadMovement.direction === 'toward_away') ||
                          (spreadAway > 60 && spreadMovement.direction === 'toward_home');
  const isReverseTotal = (totalOver > 60 && totalMovement.direction === 'under') ||
                         (totalUnder > 60 && totalMovement.direction === 'over');

  return (
    <div className="space-y-6">
      {/* Sharp Action Alert */}
      {sharpAction.indicator !== 'none' && sharpAction.confidence !== 'low' && (
        <div className={cn(
          "p-4 rounded-xl border flex items-start gap-3",
          sharpAction.confidence === 'high'
            ? "bg-amber-500/10 border-amber-500/30"
            : "bg-primary/5 border-primary/20"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            sharpAction.confidence === 'high' ? "bg-amber-500/20" : "bg-primary/10"
          )}>
            <Zap className={cn(
              "w-4 h-4",
              sharpAction.confidence === 'high' ? "text-amber-400" : "text-primary"
            )} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-white">Sharp Action Detected</span>
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                sharpAction.confidence === 'high'
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-primary/20 text-primary"
              )}>
                {sharpAction.confidence.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-white/60">{sharpAction.note}</p>
          </div>
        </div>
      )}

      {/* Reverse Line Movement Alert */}
      {(isReverseSpread || isReverseTotal) && (
        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-white mb-1">Reverse Line Movement</div>
            <p className="text-sm text-white/60">
              {isReverseSpread && 'Line moving against public spread action. '}
              {isReverseTotal && 'Total moving against public betting.'}
            </p>
          </div>
        </div>
      )}

      {/* Line Movement Summary */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-white">Line Movement</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MovementIndicator
            label="Spread"
            direction={spreadMovement.direction}
            points={spreadMovement.points}
          />
          <MovementIndicator
            label="Total"
            direction={totalMovement.direction}
            points={totalMovement.points}
          />
        </div>
      </div>

      {/* Public Betting Percentages */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-white/50" />
          <h4 className="text-sm font-semibold text-white">Public Betting</h4>
          <span className="text-xs text-white/30 ml-auto">% of bets</span>
        </div>
        <div className="space-y-5">
          <PercentageBar
            leftLabel={`${homeTeam} (Spread)`}
            rightLabel={`${awayTeam}`}
            leftPct={spreadHome}
            rightPct={spreadAway}
            leftHighlight={spreadHome > 60}
            rightHighlight={spreadAway > 60}
          />
          <PercentageBar
            leftLabel="Over"
            rightLabel="Under"
            leftPct={totalOver}
            rightPct={totalUnder}
            leftHighlight={totalOver > 60}
            rightHighlight={totalUnder > 60}
          />
          <PercentageBar
            leftLabel={`${homeTeam} (ML)`}
            rightLabel={`${awayTeam}`}
            leftPct={mlHome}
            rightPct={mlAway}
            leftHighlight={mlHome > 60}
            rightHighlight={mlAway > 60}
          />
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-[10px] text-white/30 pt-2 border-t border-white/5">
        Public betting percentages are estimates based on available data. Not all sportsbooks report this information.
      </div>
    </div>
  );
});

export default BettingTrendsCard;
