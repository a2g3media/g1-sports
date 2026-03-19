import { useState, useEffect, useMemo } from "react";
import { 
  Skull, Users, ChevronDown, ChevronUp, Crown, Heart, 
  Calendar, Target, Flame 
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge } from "@/react-app/components/ui/team-badge";

interface EliminationRecord {
  userId: string;
  userName: string;
  avatar?: string;
  eliminatedWeek: string;
  pickedTeam: string;
  opponentTeam: string;
  finalScore?: string;
  isCurrentUser?: boolean;
}

interface WeekEliminations {
  period: string;
  eliminations: EliminationRecord[];
  survivorsRemaining: number;
  biggestUpset?: string;
}

interface EliminationTimelineProps {
  leagueId: number;
  isDemoMode?: boolean;
  className?: string;
}

export function EliminationTimeline({ leagueId, isDemoMode = false, className }: EliminationTimelineProps) {
  const [data, setData] = useState<WeekEliminations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"timeline" | "list">("timeline");

  useEffect(() => {
    if (isDemoMode) {
      loadDemoData();
    } else {
      fetchEliminationData();
    }
  }, [leagueId, isDemoMode]);

  const loadDemoData = () => {
    // Generate realistic elimination data across a season
    const teams = [
      "Chiefs", "Bills", "Ravens", "Dolphins", "Bengals", "Jaguars", "Browns", "Steelers",
      "Eagles", "Cowboys", "49ers", "Seahawks", "Lions", "Packers", "Vikings", "Bears",
      "Buccaneers", "Saints", "Falcons", "Panthers", "Cardinals", "Rams", "Chargers", "Raiders",
      "Broncos", "Patriots", "Jets", "Titans", "Colts", "Texans", "Giants", "Commanders"
    ];

    const names = [
      "Mike Thompson", "Sarah Chen", "Jake Miller", "Emma Wilson", "Chris Davis",
      "Aisha Johnson", "Ryan O'Brien", "Maria Garcia", "Tom Bradley", "Lisa Park",
      "David Kim", "Jennifer Lee", "Marcus Brown", "Anna White", "Kevin Zhang",
      "Rachel Green", "Brian Martinez", "Ashley Taylor", "Daniel Lee", "Nicole Adams",
      "Jason Wright", "Stephanie Clark", "Alex Turner", "Megan Hall", "Josh Wilson",
      "Katie Moore", "Tyler Scott", "Samantha King", "Michael Ross", "Lauren Hill",
      "Andrew Young", "Christina Lee", "Brandon Davis", "Amanda Chen", "Ryan Murphy",
      "Jessica Brown", "Matthew Garcia", "Heather Johnson", "Christopher Lee", "Michelle Wang"
    ];

    // Generate eliminations by week (decreasing each week)
    const weeks: WeekEliminations[] = [];
    const remainingNames = [...names];
    let survivors = 156;
    
    // Realistic elimination rates
    const eliminationCounts = [65, 32, 18, 12, 8, 6, 5, 4, 3, 2, 1, 0, 0, 0];
    
    for (let week = 1; week <= 14 && survivors > 1; week++) {
      const elimCount = Math.min(eliminationCounts[week - 1] || 0, remainingNames.length);
      
      if (elimCount === 0 && week > 10) {
        // Later weeks with no eliminations
        weeks.push({
          period: `Week ${week}`,
          eliminations: [],
          survivorsRemaining: survivors,
        });
        continue;
      }

      const eliminations: EliminationRecord[] = [];
      const teamsThisWeek = new Set<string>();
      
      // Pick random teams for eliminations (losses)
      const losingTeams: string[] = [];
      while (losingTeams.length < Math.ceil(elimCount / 3) && losingTeams.length < teams.length / 2) {
        const team = teams[Math.floor(Math.random() * teams.length)];
        if (!teamsThisWeek.has(team)) {
          teamsThisWeek.add(team);
          losingTeams.push(team);
        }
      }

      for (let i = 0; i < elimCount && remainingNames.length > 0; i++) {
        const nameIndex = Math.floor(Math.random() * remainingNames.length);
        const name = remainingNames.splice(nameIndex, 1)[0];
        const pickedTeam = losingTeams[i % losingTeams.length];
        const opponent = teams.filter(t => t !== pickedTeam)[Math.floor(Math.random() * (teams.length - 1))];
        
        const homeScore = Math.floor(Math.random() * 21) + 10;
        const awayScore = homeScore + Math.floor(Math.random() * 14) + 3; // Opponent wins
        
        eliminations.push({
          userId: `user-${week}-${i}`,
          userName: name,
          eliminatedWeek: `Week ${week}`,
          pickedTeam,
          opponentTeam: opponent,
          finalScore: `${homeScore}-${awayScore}`,
          isCurrentUser: name === "Mike Thompson",
        });
      }

      survivors -= eliminations.length;
      
      // Find biggest upset (most eliminations from one team)
      const teamCounts: Record<string, number> = {};
      eliminations.forEach(e => {
        teamCounts[e.pickedTeam] = (teamCounts[e.pickedTeam] || 0) + 1;
      });
      const biggestUpset = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0];

      weeks.push({
        period: `Week ${week}`,
        eliminations,
        survivorsRemaining: survivors,
        biggestUpset: biggestUpset && biggestUpset[1] >= 3 
          ? `${biggestUpset[0]} loss eliminated ${biggestUpset[1]} players` 
          : undefined,
      });
    }

    setData(weeks);
    setIsLoading(false);
    
    // Auto-expand most recent week with eliminations
    const lastWeekWithElims = weeks.filter(w => w.eliminations.length > 0).pop();
    if (lastWeekWithElims) {
      setExpandedWeeks(new Set([lastWeekWithElims.period]));
    }
  };

  const fetchEliminationData = async () => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/elimination-timeline`);
      if (response.ok) {
        const timelineData = await response.json();
        setData(timelineData.weeks || []);
      } else {
        loadDemoData();
      }
    } catch (err) {
      console.error("Failed to fetch elimination data:", err);
      loadDemoData();
    } finally {
      setIsLoading(false);
    }
  };

  const toggleWeek = (period: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(period)) {
        next.delete(period);
      } else {
        next.add(period);
      }
      return next;
    });
  };

  // Stats calculations
  const stats = useMemo(() => {
    const totalEliminated = data.reduce((sum, week) => sum + week.eliminations.length, 0);
    const currentSurvivors = data[data.length - 1]?.survivorsRemaining || 0;
    const bloodiestWeek = data.reduce((max, week) => 
      week.eliminations.length > (max?.eliminations.length || 0) ? week : max
    , data[0]);
    const weeksWithEliminations = data.filter(w => w.eliminations.length > 0).length;
    
    return {
      totalEliminated,
      currentSurvivors,
      bloodiestWeek,
      weeksWithEliminations,
    };
  }, [data]);

  // Flatten for list view
  const allEliminations = useMemo(() => {
    return data.flatMap(week => 
      week.eliminations.map(e => ({ ...e, period: week.period }))
    );
  }, [data]);

  if (isLoading || data.length === 0) {
    return null;
  }

  return (
    <div className={cn("card-premium overflow-hidden", className)}>
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
              <Skull className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <div className="font-semibold">Elimination Timeline</div>
              <div className="text-caption">
                {stats.totalEliminated} eliminated across {stats.weeksWithEliminations} weeks
              </div>
            </div>
          </div>
          
          {/* View Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/30">
            <button
              onClick={() => setViewMode("timeline")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                viewMode === "timeline" 
                  ? "bg-background shadow-sm text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Calendar className="h-3.5 w-3.5 inline mr-1" />
              Timeline
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                viewMode === "list" 
                  ? "bg-background shadow-sm text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="h-3.5 w-3.5 inline mr-1" />
              All
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-red-500/10 text-center">
            <div className="text-lg font-bold text-red-500">{stats.totalEliminated}</div>
            <div className="text-xs text-muted-foreground">Eliminated</div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-center">
            <div className="text-lg font-bold text-emerald-500">{stats.currentSurvivors}</div>
            <div className="text-xs text-muted-foreground">Survivors</div>
          </div>
          <div className="p-2 rounded-lg bg-amber-500/10 text-center">
            <div className="text-lg font-bold text-amber-500">
              {stats.bloodiestWeek?.eliminations.length || 0}
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.bloodiestWeek?.period.replace("Week ", "Wk ") || "N/A"}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {viewMode === "timeline" ? (
          // Timeline View - Week by Week
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-red-500/50 via-amber-500/30 to-emerald-500/50" />
            
            <div className="space-y-1 p-4">
              {data.map((week, weekIndex) => {
                const isExpanded = expandedWeeks.has(week.period);
                const hasEliminations = week.eliminations.length > 0;
                const isLastWeek = weekIndex === data.length - 1;
                
                return (
                  <div key={week.period} className="relative">
                    {/* Week Marker */}
                    <div className="flex items-center gap-3">
                      <div 
                        className={cn(
                          "relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                          hasEliminations 
                            ? "bg-red-500/20 border-2 border-red-500/50"
                            : isLastWeek && week.survivorsRemaining > 0
                              ? "bg-emerald-500/20 border-2 border-emerald-500/50"
                              : "bg-muted/50 border-2 border-border"
                        )}
                      >
                        {hasEliminations ? (
                          <Skull className="h-3.5 w-3.5 text-red-500" />
                        ) : isLastWeek && week.survivorsRemaining <= 5 ? (
                          <Crown className="h-3.5 w-3.5 text-amber-500" />
                        ) : (
                          <Heart className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </div>
                      
                      <button
                        onClick={() => hasEliminations && toggleWeek(week.period)}
                        disabled={!hasEliminations}
                        className={cn(
                          "flex-1 flex items-center justify-between p-2 rounded-lg transition-all text-left",
                          hasEliminations && "hover:bg-secondary/30 cursor-pointer"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{week.period}</span>
                          {hasEliminations ? (
                            <span className="text-sm text-red-400">
                              {week.eliminations.length} eliminated
                            </span>
                          ) : (
                            <span className="text-sm text-emerald-400">
                              No eliminations
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {week.survivorsRemaining} alive
                          </span>
                          {hasEliminations && (
                            isExpanded 
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                    </div>

                    {/* Upset Badge */}
                    {week.biggestUpset && !isExpanded && (
                      <div className="ml-11 mt-1 mb-2">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-500">
                          <Flame className="h-3 w-3" />
                          {week.biggestUpset}
                        </span>
                      </div>
                    )}

                    {/* Expanded Eliminations */}
                    {isExpanded && hasEliminations && (
                      <div className="ml-11 mt-2 mb-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                        {week.biggestUpset && (
                          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm flex items-center gap-2">
                            <Flame className="h-4 w-4 text-amber-500 shrink-0" />
                            <span className="text-amber-500 font-medium">{week.biggestUpset}</span>
                          </div>
                        )}
                        
                        {/* Group by team */}
                        {Object.entries(
                          week.eliminations.reduce((acc, elim) => {
                            if (!acc[elim.pickedTeam]) acc[elim.pickedTeam] = [];
                            acc[elim.pickedTeam].push(elim);
                            return acc;
                          }, {} as Record<string, EliminationRecord[]>)
                        ).map(([team, elims]) => (
                          <div key={team} className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <TeamBadge teamName={team} size="sm" status="final" survivorState="eliminated" />
                              <span className="text-sm text-muted-foreground">
                                {elims[0].finalScore} vs {elims[0].opponentTeam}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {elims.map(elim => (
                                <span
                                  key={elim.userId}
                                  className={cn(
                                    "inline-flex items-center px-2 py-1 rounded-md text-xs",
                                    elim.isCurrentUser
                                      ? "bg-primary/20 text-primary font-medium"
                                      : "bg-secondary/50 text-muted-foreground"
                                  )}
                                >
                                  <Skull className="h-3 w-3 mr-1 opacity-50" />
                                  {elim.userName}
                                  {elim.isCurrentUser && " (You)"}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // List View - All Players
          <div className="p-4">
            <div className="space-y-1">
              {allEliminations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Heart className="h-12 w-12 mx-auto mb-2 text-emerald-500/50" />
                  <p>No eliminations yet!</p>
                  <p className="text-sm">Everyone is still alive.</p>
                </div>
              ) : (
                allEliminations.map((elim, idx) => (
                  <div
                    key={`${elim.userId}-${idx}`}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg transition-colors",
                      elim.isCurrentUser 
                        ? "bg-primary/10 border border-primary/20" 
                        : "hover:bg-secondary/30"
                    )}
                  >
                    <div className="w-6 text-center text-xs text-muted-foreground">
                      {elim.period.replace("Week ", "W")}
                    </div>
                    <Skull className="h-4 w-4 text-red-500/60 shrink-0" />
                    <span className={cn(
                      "flex-1 truncate",
                      elim.isCurrentUser && "font-medium text-primary"
                    )}>
                      {elim.userName}
                      {elim.isCurrentUser && " (You)"}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <TeamBadge teamName={elim.pickedTeam} size="sm" status="final" survivorState="eliminated" />
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {elim.finalScore}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer - Survivors */}
      {stats.currentSurvivors > 0 && stats.currentSurvivors <= 10 && (
        <div className="p-4 border-t border-border/50 bg-gradient-to-r from-emerald-500/5 to-transparent">
          <div className="flex items-center gap-2 text-sm">
            {stats.currentSurvivors === 1 ? (
              <>
                <Crown className="h-5 w-5 text-amber-500" />
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  🎉 Champion crowned!
                </span>
              </>
            ) : (
              <>
                <Target className="h-5 w-5 text-emerald-500" />
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Final {stats.currentSurvivors} — who will survive?
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
