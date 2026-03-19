import { useState } from 'react';
import { X, Trash2, ChevronDown, ChevronUp, Calculator, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { useParlayBuilder, ParlayLeg } from '@/react-app/context/ParlayBuilderContext';
import { cn } from '@/react-app/lib/utils';

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function LegCard({ leg, onRemove }: { leg: ParlayLeg; onRemove: () => void }) {
  return (
    <div className="relative group rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 hover:bg-white/[0.05] transition-all">
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500"
      >
        <X className="w-3 h-3" />
      </button>
      
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
              leg.selection === 'over' 
                ? "bg-emerald-500/20 text-emerald-400" 
                : "bg-rose-500/20 text-rose-400"
            )}>
              {leg.selection}
            </span>
            <span className="text-sm font-semibold text-white truncate">{leg.line}</span>
          </div>
          <div className="text-xs text-white/60 mt-0.5 truncate">{leg.playerName}</div>
          <div className="text-[10px] text-white/30 truncate">{leg.propType}</div>
        </div>
        
        <div className="text-right shrink-0">
          <div className={cn(
            "text-sm font-mono font-bold",
            leg.odds > 0 ? "text-emerald-400" : "text-white"
          )}>
            {formatOdds(leg.odds)}
          </div>
        </div>
      </div>
      
      {leg.gameInfo && (
        <div className="text-[9px] text-white/20 mt-1.5 pt-1.5 border-t border-white/[0.04] truncate">
          {leg.gameInfo}
        </div>
      )}
    </div>
  );
}

export function ParlaySlip() {
  const { 
    legs, 
    removeLeg, 
    clearParlay, 
    totalOdds, 
    decimalOdds, 
    impliedProbability,
    calculatePayout,
    isOpen,
    setIsOpen 
  } = useParlayBuilder();
  
  const [stake, setStake] = useState<string>('10');
  const [isMinimized, setIsMinimized] = useState(false);
  
  const stakeNum = parseFloat(stake) || 0;
  const potentialPayout = calculatePayout(stakeNum);
  const profit = potentialPayout - stakeNum;
  
  // Don't render if no legs
  if (legs.length === 0) return null;
  
  // Quick stake buttons
  const quickStakes = [10, 25, 50, 100];
  
  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)]",
      "transform transition-all duration-300",
      isOpen ? "translate-y-0 opacity-100" : "translate-y-[120%] opacity-0 pointer-events-none"
    )}>
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-rose-500/20 rounded-2xl blur-xl" />
      
      <div className="relative rounded-2xl bg-[#0c0c0c]/95 backdrop-blur-xl border border-amber-500/20 shadow-2xl overflow-hidden">
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-white/[0.06] cursor-pointer"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Prop Parlay</h3>
              <p className="text-[10px] text-amber-400/80">{legs.length} leg{legs.length !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {legs.length > 0 && (
              <div className="text-right mr-2">
                <div className={cn(
                  "text-lg font-mono font-bold",
                  totalOdds > 0 ? "text-emerald-400" : "text-amber-400"
                )}>
                  {formatOdds(totalOdds)}
                </div>
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); clearParlay(); }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-rose-400 transition-colors"
              title="Clear all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {isMinimized ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
          </div>
        </div>
        
        {/* Body - collapsible */}
        <div className={cn(
          "transition-all duration-300 overflow-hidden",
          isMinimized ? "max-h-0" : "max-h-[500px]"
        )}>
          {/* Legs */}
          <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
            {legs.map(leg => (
              <LegCard 
                key={leg.id} 
                leg={leg} 
                onRemove={() => removeLeg(leg.id)} 
              />
            ))}
          </div>
          
          {/* Stats row */}
          <div className="px-3 pb-2">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="text-center flex-1">
                <div className="text-[9px] text-white/30 uppercase tracking-wider">Combined</div>
                <div className={cn(
                  "text-base font-mono font-bold",
                  totalOdds > 0 ? "text-emerald-400" : "text-amber-400"
                )}>
                  {formatOdds(totalOdds)}
                </div>
              </div>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div className="text-center flex-1">
                <div className="text-[9px] text-white/30 uppercase tracking-wider">Decimal</div>
                <div className="text-base font-mono font-bold text-white">
                  {decimalOdds.toFixed(2)}x
                </div>
              </div>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div className="text-center flex-1">
                <div className="text-[9px] text-white/30 uppercase tracking-wider">Prob</div>
                <div className="text-base font-mono font-bold text-cyan-400">
                  {impliedProbability.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
          
          {/* Warning for 5+ legs */}
          {legs.length >= 5 && (
            <div className="mx-3 mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-[10px] text-amber-300/80">
                {legs.length}+ leg parlays are high risk. Implied probability: {impliedProbability.toFixed(1)}%
              </p>
            </div>
          )}
          
          {/* Stake input */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="w-4 h-4 text-white/30" />
              <span className="text-xs text-white/50">Stake Calculator</span>
            </div>
            
            {/* Quick stakes */}
            <div className="flex gap-1.5 mb-2">
              {quickStakes.map(amount => (
                <button
                  key={amount}
                  onClick={() => setStake(amount.toString())}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    stake === amount.toString()
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-white/5 text-white/50 hover:bg-white/10 border border-transparent"
                  )}
                >
                  ${amount}
                </button>
              ))}
            </div>
            
            {/* Custom stake */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Custom stake"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-white text-sm font-mono focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
          </div>
          
          {/* Payout display */}
          <div className="px-3 pb-3">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Potential Payout</div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono">
                    ${potentialPayout.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Profit</div>
                  <div className="flex items-center gap-1 text-emerald-400">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-lg font-bold font-mono">+${profit.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Action button */}
          <div className="px-3 pb-3">
            <button className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all">
              Copy to Sportsbook
            </button>
            <p className="text-[9px] text-white/20 text-center mt-2">
              For entertainment purposes only. Gamble responsibly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Floating trigger button when slip is closed
export function ParlayFloatingButton() {
  const { legs, totalOdds, isOpen, setIsOpen } = useParlayBuilder();
  
  if (legs.length === 0 || isOpen) return null;
  
  return (
    <button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105 active:scale-95 transition-all"
    >
      <Zap className="w-5 h-5" />
      <span>{legs.length} Prop{legs.length !== 1 ? 's' : ''}</span>
      <span className="px-2 py-0.5 rounded-full bg-black/20 text-sm font-mono">
        {totalOdds > 0 ? '+' : ''}{totalOdds}
      </span>
    </button>
  );
}
