import { useState, useEffect } from "react";
import { Users, TrendingDown, Trophy, Skull, ChevronDown, ChevronUp, Crown, Zap } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface WeekData {
  period_id: string;
  alive_start: number;
  eliminated: number;
  alive_end: number;
}

interface FieldCollapseProps {
  leagueId: number;
  isDemoMode?: boolean;
  className?: string;
}

export function SurvivorFieldCollapse({ leagueId, isDemoMode = false, className }: FieldCollapseProps) {
  const [data, setData] = useState<WeekData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [animatedBars, setAnimatedBars] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isDemoMode) {
      loadDemoData();
    } else {
      fetchFieldData();
    }
  }, [leagueId, isDemoMode]);

  // Trigger bar animations on mount/expand
  useEffect(() => {
    if (data.length > 0 && isExpanded) {
      const animateSequentially = () => {
        data.forEach((_, index) => {
          setTimeout(() => {
            setAnimatedBars(prev => new Set([...prev, index]));
          }, index * 100);
        });
      };
      setAnimatedBars(new Set());
      setTimeout(animateSequentially, 100);
    }
  }, [data.length, isExpanded]);

  const loadDemoData = () => {
    // Generate demo field collapse data for a 14-week season
    const totalEntrants = 156;
    const weeks: WeekData[] = [];
    let currentAlive = totalEntrants;

    // Simulate realistic elimination rates
    const eliminationRates = [0.42, 0.28, 0.22, 0.18, 0.15, 0.12, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02, 0.02];
    
    for (let i = 0; i < 14; i++) {
      const eliminated = Math.floor(currentAlive * eliminationRates[i]);
      const aliveEnd = currentAlive - eliminated;
      
      weeks.push({
        period_id: `Week ${i + 1}`,
        alive_start: currentAlive,
        eliminated,
        alive_end: aliveEnd,
      });
      
      currentAlive = aliveEnd;
      if (currentAlive <= 1) break;
    }

    setData(weeks);
    setIsLoading(false);
  };

  const fetchFieldData = async () => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/survivor-field`);
      if (response.ok) {
        const fieldData = await response.json();
        setData(fieldData.weeks || []);
      }
    } catch (err) {
      console.error("Failed to fetch field data:", err);
      // Fallback to demo data on error
      loadDemoData();
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || data.length === 0) {
    return null;
  }

  const totalEntrants = data[0]?.alive_start || 0;
  const currentSurvivors = data[data.length - 1]?.alive_end || 0;
  const totalEliminated = totalEntrants - currentSurvivors;
  const eliminationRate = totalEntrants > 0 ? ((totalEliminated / totalEntrants) * 100).toFixed(1) : 0;
  const currentWeek = data.length;

  // Get max for scaling bars
  const maxAlive = Math.max(...data.map(w => w.alive_start));

  return (
    <div className={cn("card-premium overflow-hidden", className)}>
      {/* Collapsed Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <TrendingDown className="h-5 w-5 text-amber-500" />
          </div>
          <div className="text-left">
            <div className="font-semibold">Field Collapse</div>
            <div className="text-caption">
              {currentSurvivors} of {totalEntrants} still alive ({eliminationRate}% eliminated)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mini sparkline preview when collapsed */}
          {!isExpanded && (
            <div className="hidden sm:flex items-end gap-0.5 h-6">
              {data.slice(-8).map((week, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-t bg-gradient-to-t from-amber-500/80 to-amber-400/60"
                  style={{ 
                    height: `${(week.alive_end / maxAlive) * 100}%`,
                    minHeight: 2
                  }}
                />
              ))}
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      <div className={cn(
        "overflow-hidden transition-all duration-300",
        isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="px-4 pb-4 space-y-4 border-t border-border/50">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-2 pt-4">
            <div className="text-center p-2 rounded-lg bg-secondary/30">
              <div className="text-lg font-bold text-primary">{totalEntrants}</div>
              <div className="text-xs text-muted-foreground">Started</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-secondary/30">
              <div className="text-lg font-bold text-emerald-500">{currentSurvivors}</div>
              <div className="text-xs text-muted-foreground">Alive</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-secondary/30">
              <div className="text-lg font-bold text-destructive">{totalEliminated}</div>
              <div className="text-xs text-muted-foreground">Eliminated</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-secondary/30">
              <div className="text-lg font-bold">{currentWeek}</div>
              <div className="text-xs text-muted-foreground">Weeks</div>
            </div>
          </div>

          {/* Visual Funnel Chart */}
          <div className="relative">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent rounded-xl pointer-events-none" />
            
            <div className="space-y-1.5 py-2">
              {data.map((week, index) => {
                const widthPercent = (week.alive_end / maxAlive) * 100;
                const prevWidthPercent = (week.alive_start / maxAlive) * 100;
                const isAnimated = animatedBars.has(index);
                const isLastWeek = index === data.length - 1;
                const hasEliminations = week.eliminated > 0;
                
                return (
                  <div key={week.period_id} className="relative group">
                    <div className="flex items-center gap-2">
                      {/* Week label */}
                      <div className="w-14 text-xs text-muted-foreground shrink-0 text-right pr-2">
                        {week.period_id.replace("Week ", "Wk ")}
                      </div>
                      
                      {/* Bar container */}
                      <div className="flex-1 h-7 relative">
                        {/* Eliminated portion (difference bar) */}
                        {hasEliminations && (
                          <div
                            className="absolute top-0 left-0 h-full bg-destructive/20 rounded-r transition-all duration-500"
                            style={{ 
                              width: isAnimated ? `${prevWidthPercent}%` : '0%',
                            }}
                          />
                        )}
                        
                        {/* Alive portion (main bar) */}
                        <div
                          className={cn(
                            "absolute top-0 left-0 h-full rounded transition-all duration-700 ease-out",
                            isLastWeek
                              ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-lg shadow-emerald-500/20"
                              : "bg-gradient-to-r from-amber-500/80 to-amber-400/60"
                          )}
                          style={{ 
                            width: isAnimated ? `${widthPercent}%` : '0%',
                            transitionDelay: `${index * 50}ms`
                          }}
                        >
                          {/* Survivor count inside bar */}
                          {widthPercent > 15 && (
                            <div className={cn(
                              "absolute inset-0 flex items-center px-2 text-xs font-semibold",
                              isLastWeek ? "text-emerald-950" : "text-amber-950"
                            )}>
                              <Users className="h-3 w-3 mr-1" />
                              {week.alive_end}
                            </div>
                          )}
                        </div>
                        
                        {/* Survivor count outside bar (if bar too small) */}
                        {widthPercent <= 15 && isAnimated && (
                          <div
                            className="absolute top-0 h-full flex items-center text-xs font-medium text-muted-foreground"
                            style={{ left: `${Math.max(widthPercent + 1, 3)}%` }}
                          >
                            {week.alive_end}
                          </div>
                        )}

                        {/* Trophy icon for final survivors */}
                        {isLastWeek && week.alive_end <= 3 && week.alive_end > 0 && (
                          <div 
                            className="absolute top-1/2 -translate-y-1/2 -right-7 text-amber-500"
                          >
                            <Trophy className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      
                      {/* Eliminated count */}
                      <div className={cn(
                        "w-10 text-xs text-right shrink-0 transition-opacity",
                        hasEliminations ? "opacity-100" : "opacity-30"
                      )}>
                        {hasEliminations && (
                          <span className="text-destructive flex items-center justify-end gap-0.5">
                            <Skull className="h-3 w-3" />
                            {week.eliminated}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-amber-500/80 to-amber-400/60" />
              <span>Survivors</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-destructive/30" />
              <span>Eliminated</span>
            </div>
          </div>

          {/* Milestone Callouts */}
          {currentSurvivors > 0 && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20">
              <div className="flex items-center gap-2">
                {currentSurvivors === 1 ? (
                  <>
                    <Crown className="h-5 w-5 text-amber-500" />
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      🎉 We have a champion!
                    </span>
                  </>
                ) : currentSurvivors <= 5 ? (
                  <>
                    <Zap className="h-5 w-5 text-amber-500" />
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      Final {currentSurvivors} standing — endgame territory!
                    </span>
                  </>
                ) : currentSurvivors <= 20 ? (
                  <>
                    <Trophy className="h-5 w-5 text-amber-500" />
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {currentSurvivors} elite survivors remain
                    </span>
                  </>
                ) : (
                  <>
                    <Users className="h-5 w-5 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {((currentSurvivors / totalEntrants) * 100).toFixed(0)}% of the field still competing
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
