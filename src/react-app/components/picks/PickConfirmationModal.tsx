/**
 * Pick Confirmation Modal
 * 
 * Modal that shows pick details with locked odds and allows stake adjustment
 * before submitting to the tracker API.
 */

import { useState } from "react";
import { 
  Check, Lock, TrendingUp, TrendingDown, 
  Minus, Plus, Clock, AlertCircle, Loader2
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { Input } from "@/react-app/components/ui/input";
import { Textarea } from "@/react-app/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import type { Game, CreateTrackerPick, TrackerPickType, TrackerPickSide } from "@/shared/types";

// Pick market types
type PickMarket = "SPREAD" | "TOTAL" | "MONEYLINE";
type PickSide = "HOME" | "AWAY" | "OVER" | "UNDER";

interface PendingPick {
  gameId: string;
  market: PickMarket;
  side: PickSide;
  line: number | null;
  odds: number;
}

interface PickConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pick: PendingPick;
  game: Game;
  onSubmit: (data: CreateTrackerPick) => Promise<void>;
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatSpread(line: number): string {
  return line > 0 ? `+${line}` : `${line}`;
}

function calculatePotentialPayout(stake: number, americanOdds: number): number {
  if (americanOdds > 0) {
    return stake * (americanOdds / 100);
  } else {
    return stake * (100 / Math.abs(americanOdds));
  }
}

function getImpliedProbability(americanOdds: number): number {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

export function PickConfirmationModal({
  isOpen,
  onClose,
  pick,
  game,
  onSubmit,
}: PickConfirmationModalProps) {
  const [stakeUnits, setStakeUnits] = useState(1.0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gameTime = new Date(game.start_time);
  const potentialProfit = calculatePotentialPayout(stakeUnits, pick.odds);
  const impliedProb = getImpliedProbability(pick.odds);

  // Get pick description
  const getPickLabel = (): string => {
    switch (pick.market) {
      case "SPREAD":
        return pick.side === "HOME" 
          ? `${game.home_team_name} ${formatSpread(pick.line!)}`
          : `${game.away_team_name} ${formatSpread(pick.line!)}`;
      case "TOTAL":
        return `${pick.side === "OVER" ? "Over" : "Under"} ${pick.line}`;
      case "MONEYLINE":
        return `${pick.side === "HOME" ? game.home_team_name : game.away_team_name} ML`;
    }
  };

  const getMarketLabel = (): string => {
    switch (pick.market) {
      case "SPREAD": return "Point Spread";
      case "TOTAL": return "Game Total";
      case "MONEYLINE": return "Moneyline";
    }
  };

  const getSideIcon = () => {
    if (pick.market === "TOTAL") {
      return pick.side === "OVER" 
        ? <TrendingUp className="w-5 h-5 text-primary" />
        : <TrendingDown className="w-5 h-5 text-primary" />;
    }
    return null;
  };

  const handleStakeChange = (delta: number) => {
    const newValue = Math.max(0.5, Math.min(10, stakeUnits + delta));
    setStakeUnits(Math.round(newValue * 10) / 10);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Map to API format
      const pickData: CreateTrackerPick = {
        game_id: game.game_id,
        sport_key: game.sport.toLowerCase(),
        home_team: game.home_team_name,
        away_team: game.away_team_name,
        game_start_time: game.start_time,
        pick_type: pick.market as TrackerPickType,
        pick_side: pick.side as TrackerPickSide,
        line_value: pick.line,
        odds_american: pick.odds,
        stake_units: stakeUnits,
        notes: notes || null,
      };

      await onSubmit(pickData);
      
      // Reset form
      setStakeUnits(1.0);
      setNotes("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pick");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Confirm Your Pick
          </DialogTitle>
          <DialogDescription>
            Review and lock in your selection
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Game Info */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <Badge variant="outline" className="uppercase text-[10px]">
                {game.sport}
              </Badge>
              <span>•</span>
              <Clock className="w-3 h-3" />
              <span>
                {gameTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {' at '}
                {gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>

            {/* Matchup */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TeamBadge teamName={game.away_team_name} size="sm" />
                <span className="font-medium text-sm">{game.away_team_code}</span>
              </div>
              <span className="text-muted-foreground text-xs">@</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{game.home_team_code}</span>
                <TeamBadge teamName={game.home_team_name} size="sm" />
              </div>
            </div>
          </div>

          {/* Pick Details */}
          <div className="rounded-xl border-2 border-primary bg-primary/5 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {getSideIcon()}
                <div>
                  <p className="text-xs text-muted-foreground">{getMarketLabel()}</p>
                  <p className="font-bold text-lg">{getPickLabel()}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Locked Odds</p>
                <p className={cn(
                  "font-bold text-xl",
                  pick.odds > 0 ? "text-[hsl(var(--success))]" : ""
                )}>
                  {formatOdds(pick.odds)}
                </p>
              </div>
            </div>

            {/* Implied probability */}
            <div className="mt-3 pt-3 border-t border-primary/20">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Implied Probability</span>
                <span className="font-medium">{(impliedProb * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Stake Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Stake (Units)</label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleStakeChange(-0.5)}
                disabled={stakeUnits <= 0.5}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <div className="flex-1 relative">
                <Input
                  type="number"
                  value={stakeUnits}
                  onChange={(e) => setStakeUnits(Math.max(0.5, Math.min(10, parseFloat(e.target.value) || 0.5)))}
                  className="text-center text-xl font-bold"
                  step={0.5}
                  min={0.5}
                  max={10}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleStakeChange(0.5)}
                disabled={stakeUnits >= 10}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex justify-center gap-2">
              {[0.5, 1, 2, 3, 5].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={stakeUnits === preset ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 px-3"
                  onClick={() => setStakeUnits(preset)}
                >
                  {preset}u
                </Button>
              ))}
            </div>
          </div>

          {/* Potential Return */}
          <div className="rounded-xl bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Risk</span>
              <span className="font-medium">{stakeUnits.toFixed(1)} units</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-muted-foreground">To Win</span>
              <span className="font-bold text-[hsl(var(--success))]">
                +{potentialProfit.toFixed(2)} units
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add reasoning or context..."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Lock Pick
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
