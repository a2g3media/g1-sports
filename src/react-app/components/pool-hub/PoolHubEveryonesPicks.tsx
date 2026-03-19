import { useState, useMemo, useEffect } from "react";
import { Users, Search, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { Input } from "@/react-app/components/ui/input";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { 
  DemoLeague,
  DemoMember,
  DEMO_MEMBERS,
  getDemoEventsForLeague,
  DemoEvent
} from "@/react-app/data/demo-leagues";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  member_count: number;
}

interface PoolHubEveryonesPicksProps {
  league: League;
}

interface MemberPick {
  memberId: number;
  memberName: string;
  memberInitials: string;
  eventId: number;
  pickValue: string;
  confidenceRank?: number;
  isCorrect?: boolean;
  isYou?: boolean;
}

interface GamePicksSummary {
  event: DemoEvent;
  picks: MemberPick[];
  awayCount: number;
  homeCount: number;
  awayPercentage: number;
  homePercentage: number;
}

// Generate picks for all members for a league
function generateMemberPicks(league: League, events: DemoEvent[], members: DemoMember[]): MemberPick[] {
  const picks: MemberPick[] = [];
  const demoLeague = league as DemoLeague;
  const isConfidence = league.format_key === "confidence";
  
  // Only show picks if the league is not in open/preview state
  if (demoLeague.state === "open" || demoLeague.state === "preview") {
    return [];
  }
  
  members.forEach((member, memberIndex) => {
    events.forEach((event, eventIndex) => {
      // Generate a deterministic pick based on member and event IDs
      const seed = member.id * 1000 + event.id;
      const pickHome = (seed % 3) !== 0; // ~67% pick home, variety
      const pickValue = pickHome ? event.home_team : event.away_team;
      
      // Determine if pick is correct (for final games)
      let isCorrect: boolean | undefined;
      if (event.status === "final" && event.winner) {
        isCorrect = pickValue === event.winner;
      }
      
      picks.push({
        memberId: member.id,
        memberName: member.name,
        memberInitials: member.avatar_initials,
        eventId: event.id,
        pickValue,
        confidenceRank: isConfidence ? events.length - eventIndex : undefined,
        isCorrect,
        isYou: memberIndex === 3, // 4th member is "you"
      });
    });
  });
  
  return picks;
}

export function PoolHubEveryonesPicks({ league }: PoolHubEveryonesPicksProps) {
  const { isDemoMode } = useDemoAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTeam, setFilterTeam] = useState<string | null>(null);
  const [expandedGames, setExpandedGames] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"by-game" | "by-member">("by-game");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [memberPicks, setMemberPicks] = useState<MemberPick[]>([]);
  
  const demoLeague = league as DemoLeague;
  const picksLocked = demoLeague.state !== "open" && demoLeague.state !== "preview";
  
  // Load data
  useEffect(() => {
    if (isDemoMode) {
      const demoEvents = getDemoEventsForLeague(league.id);
      setEvents(demoEvents);
      
      // Use subset of demo members based on league member count
      const numMembers = Math.min(league.member_count, DEMO_MEMBERS.length);
      const members = DEMO_MEMBERS.slice(0, numMembers);
      
      const picks = generateMemberPicks(league, demoEvents, members);
      setMemberPicks(picks);
    }
  }, [league.id, isDemoMode]);
  
  // Group picks by game
  const gamePicksSummaries = useMemo((): GamePicksSummary[] => {
    return events.map(event => {
      const eventPicks = memberPicks.filter(p => p.eventId === event.id);
      const awayPicks = eventPicks.filter(p => p.pickValue === event.away_team);
      const homePicks = eventPicks.filter(p => p.pickValue === event.home_team);
      const total = eventPicks.length || 1;
      
      return {
        event,
        picks: eventPicks,
        awayCount: awayPicks.length,
        homeCount: homePicks.length,
        awayPercentage: Math.round((awayPicks.length / total) * 100),
        homePercentage: Math.round((homePicks.length / total) * 100),
      };
    });
  }, [events, memberPicks]);
  
  // Overall exposure by team
  const overallExposure = useMemo(() => {
    const teamCounts: Record<string, number> = {};
    memberPicks.forEach(pick => {
      teamCounts[pick.pickValue] = (teamCounts[pick.pickValue] || 0) + 1;
    });
    
    const total = memberPicks.length || 1;
    return Object.entries(teamCounts)
      .map(([team, count]) => ({
        team,
        count,
        percentage: Math.round((count / total) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8); // Top 8 teams
  }, [memberPicks]);
  
  // Get unique members
  const members = useMemo(() => {
    const uniqueMembers = new Map<number, { id: number; name: string; initials: string; isYou: boolean }>();
    memberPicks.forEach(pick => {
      if (!uniqueMembers.has(pick.memberId)) {
        uniqueMembers.set(pick.memberId, {
          id: pick.memberId,
          name: pick.memberName,
          initials: pick.memberInitials,
          isYou: pick.isYou || false,
        });
      }
    });
    return Array.from(uniqueMembers.values());
  }, [memberPicks]);
  
  // Filter members by search
  const filteredMembers = useMemo(() => {
    if (!searchQuery) return members;
    return members.filter(m => 
      m.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [members, searchQuery]);
  
  const toggleGameExpanded = (eventId: number) => {
    setExpandedGames(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };
  
  // If picks aren't locked yet
  if (!picksLocked) {
    return (
      <div className="space-y-6 animate-page-enter">
        <div className="text-center py-16 rounded-2xl bg-card border border-border/50">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <EyeOff className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Picks Not Yet Visible</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Everyone's picks will be revealed once the first game locks. 
            This prevents members from seeing each other's picks before making their own.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-page-enter">
      {/* View Toggle */}
      <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setViewMode("by-game")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all",
            viewMode === "by-game" 
              ? "bg-background shadow-sm text-foreground" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          By Game
        </button>
        <button
          onClick={() => setViewMode("by-member")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all",
            viewMode === "by-member" 
              ? "bg-background shadow-sm text-foreground" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          By Member
        </button>
      </div>
      
      {/* Overall Exposure Summary */}
      <div className="p-4 rounded-xl bg-card border border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Most Popular Picks
        </h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {overallExposure.slice(0, 4).map(({ team, count, percentage }) => (
            <button
              key={team}
              onClick={() => setFilterTeam(filterTeam === team ? null : team)}
              className={cn(
                "p-3 rounded-lg transition-all text-center",
                filterTeam === team 
                  ? "bg-primary/10 ring-1 ring-primary" 
                  : "bg-muted/50 hover:bg-muted"
              )}
            >
              <TeamBadge teamName={team} size="sm" className="mx-auto mb-1" />
              <div className="text-xs font-medium truncate">{team}</div>
              <div className={cn(
                "text-lg font-bold",
                percentage >= 40 ? "text-red-500" :
                percentage >= 25 ? "text-amber-500" :
                "text-emerald-500"
              )}>
                {percentage}%
              </div>
              <div className="text-[10px] text-muted-foreground">{count} picks</div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Filter indicator */}
      {filterTeam && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing picks for:</span>
          <button
            onClick={() => setFilterTeam(null)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
          >
            <TeamBadge teamName={filterTeam} size="sm" />
            <span>{filterTeam}</span>
            <span className="ml-1 opacity-70">×</span>
          </button>
        </div>
      )}
      
      {viewMode === "by-game" ? (
        /* BY GAME VIEW */
        <div className="space-y-3">
          {gamePicksSummaries.map(({ event, picks, awayCount, homeCount, awayPercentage, homePercentage }) => {
            const isExpanded = expandedGames.has(event.id);
            const isFinal = event.status === "final";
            const isLive = event.status === "live";
            
            // Filter picks if team filter is active
            const filteredPicks = filterTeam 
              ? picks.filter(p => p.pickValue === filterTeam)
              : picks;
            
            if (filterTeam && filteredPicks.length === 0) return null;
            
            return (
              <div 
                key={event.id}
                className={cn(
                  "rounded-xl border overflow-hidden transition-all",
                  isLive ? "border-primary/30 bg-primary/5" : "border-border/50 bg-card"
                )}
              >
                {/* Game Header with Exposure Bar */}
                <button
                  onClick={() => toggleGameExpanded(event.id)}
                  className="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Away Team */}
                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div>
                        <div className={cn(
                          "text-sm font-semibold",
                          isFinal && event.winner === event.away_team && "text-[hsl(var(--success))]"
                        )}>
                          {event.away_team}
                        </div>
                        <div className="text-xs text-muted-foreground">{awayCount} picks</div>
                      </div>
                      <TeamBadge teamName={event.away_team} size="sm" />
                    </div>
                  </div>
                  
                  {/* Exposure Bar */}
                  <div className="w-32 sm:w-40">
                    <div className="h-6 rounded-full bg-muted overflow-hidden flex">
                      <div 
                        className={cn(
                          "h-full transition-all flex items-center justify-start pl-2",
                          isFinal && event.winner === event.away_team 
                            ? "bg-[hsl(var(--success))]" 
                            : "bg-blue-500"
                        )}
                        style={{ width: `${awayPercentage}%` }}
                      >
                        {awayPercentage >= 20 && (
                          <span className="text-[10px] font-bold text-white">{awayPercentage}%</span>
                        )}
                      </div>
                      <div 
                        className={cn(
                          "h-full transition-all flex items-center justify-end pr-2",
                          isFinal && event.winner === event.home_team 
                            ? "bg-[hsl(var(--success))]" 
                            : "bg-orange-500"
                        )}
                        style={{ width: `${homePercentage}%` }}
                      >
                        {homePercentage >= 20 && (
                          <span className="text-[10px] font-bold text-white">{homePercentage}%</span>
                        )}
                      </div>
                    </div>
                    {isLive && (
                      <div className="text-center mt-1">
                        <span className="text-[10px] font-semibold text-primary uppercase">Live</span>
                      </div>
                    )}
                    {isFinal && (
                      <div className="text-center mt-1">
                        <span className="text-[10px] font-medium text-muted-foreground">Final</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Home Team */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <TeamBadge teamName={event.home_team} size="sm" />
                      <div>
                        <div className={cn(
                          "text-sm font-semibold",
                          isFinal && event.winner === event.home_team && "text-[hsl(var(--success))]"
                        )}>
                          {event.home_team}
                        </div>
                        <div className="text-xs text-muted-foreground">{homeCount} picks</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Expand Icon */}
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </button>
                
                {/* Expanded: Show who picked what */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-border/50">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Away Pickers */}
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                          <TeamBadge teamName={event.away_team} size="sm" />
                          <span>picked {event.away_team}</span>
                        </div>
                        <div className="space-y-1">
                          {filteredPicks
                            .filter(p => p.pickValue === event.away_team)
                            .map(pick => (
                              <div 
                                key={pick.memberId}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded-lg text-sm",
                                  pick.isYou ? "bg-primary/10" : "bg-muted/30"
                                )}
                              >
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium",
                                  pick.isYou ? "bg-primary text-primary-foreground" : "bg-muted"
                                )}>
                                  {pick.memberInitials}
                                </div>
                                <span className={cn(pick.isYou && "font-medium")}>
                                  {pick.isYou ? "You" : pick.memberName}
                                </span>
                                {pick.isCorrect !== undefined && (
                                  <div className={cn(
                                    "ml-auto w-5 h-5 rounded-full flex items-center justify-center",
                                    pick.isCorrect 
                                      ? "bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]" 
                                      : "bg-destructive/20 text-destructive"
                                  )}>
                                    {pick.isCorrect ? "✓" : "✗"}
                                  </div>
                                )}
                              </div>
                            ))}
                          {filteredPicks.filter(p => p.pickValue === event.away_team).length === 0 && (
                            <div className="text-xs text-muted-foreground italic p-2">No picks</div>
                          )}
                        </div>
                      </div>
                      
                      {/* Home Pickers */}
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                          <TeamBadge teamName={event.home_team} size="sm" />
                          <span>picked {event.home_team}</span>
                        </div>
                        <div className="space-y-1">
                          {filteredPicks
                            .filter(p => p.pickValue === event.home_team)
                            .map(pick => (
                              <div 
                                key={pick.memberId}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded-lg text-sm",
                                  pick.isYou ? "bg-primary/10" : "bg-muted/30"
                                )}
                              >
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium",
                                  pick.isYou ? "bg-primary text-primary-foreground" : "bg-muted"
                                )}>
                                  {pick.memberInitials}
                                </div>
                                <span className={cn(pick.isYou && "font-medium")}>
                                  {pick.isYou ? "You" : pick.memberName}
                                </span>
                                {pick.isCorrect !== undefined && (
                                  <div className={cn(
                                    "ml-auto w-5 h-5 rounded-full flex items-center justify-center",
                                    pick.isCorrect 
                                      ? "bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]" 
                                      : "bg-destructive/20 text-destructive"
                                  )}>
                                    {pick.isCorrect ? "✓" : "✗"}
                                  </div>
                                )}
                              </div>
                            ))}
                          {filteredPicks.filter(p => p.pickValue === event.home_team).length === 0 && (
                            <div className="text-xs text-muted-foreground italic p-2">No picks</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* BY MEMBER VIEW */
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {/* Members List */}
          <div className="space-y-2">
            {filteredMembers.map(member => {
              const memberPicksList = memberPicks.filter(p => p.memberId === member.id);
              const correctCount = memberPicksList.filter(p => p.isCorrect === true).length;
              const incorrectCount = memberPicksList.filter(p => p.isCorrect === false).length;
              const pendingCount = memberPicksList.filter(p => p.isCorrect === undefined).length;
              
              // Filter by team if active
              const displayPicks = filterTeam 
                ? memberPicksList.filter(p => p.pickValue === filterTeam)
                : memberPicksList;
              
              if (filterTeam && displayPicks.length === 0) return null;
              
              return (
                <div 
                  key={member.id}
                  className={cn(
                    "p-4 rounded-xl border",
                    member.isYou ? "border-primary/30 bg-primary/5" : "border-border/50 bg-card"
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold",
                      member.isYou ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      {member.initials}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold flex items-center gap-2">
                        {member.isYou ? "You" : member.name}
                        {member.isYou && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">You</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {correctCount > 0 && (
                          <span className="text-[hsl(var(--success))]">{correctCount}W</span>
                        )}
                        {incorrectCount > 0 && (
                          <span className="text-destructive">{incorrectCount}L</span>
                        )}
                        {pendingCount > 0 && (
                          <span>{pendingCount} pending</span>
                        )}
                      </div>
                    </div>
                    {correctCount + incorrectCount > 0 && (
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {Math.round((correctCount / (correctCount + incorrectCount)) * 100)}%
                        </div>
                        <div className="text-xs text-muted-foreground">win rate</div>
                      </div>
                    )}
                  </div>
                  
                  {/* Member's picks */}
                  <div className="flex flex-wrap gap-1.5">
                    {displayPicks.slice(0, 8).map(pick => {
                      return (
                        <div 
                          key={pick.eventId}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs",
                            pick.isCorrect === true && "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]",
                            pick.isCorrect === false && "bg-destructive/10 text-destructive",
                            pick.isCorrect === undefined && "bg-muted"
                          )}
                        >
                          <TeamBadge teamName={pick.pickValue} size="sm" />
                          <span className="font-medium">{pick.pickValue}</span>
                          {pick.confidenceRank && (
                            <span className="text-[10px] opacity-70">#{pick.confidenceRank}</span>
                          )}
                        </div>
                      );
                    })}
                    {displayPicks.length > 8 && (
                      <div className="px-2 py-1 rounded-lg bg-muted text-xs text-muted-foreground">
                        +{displayPicks.length - 8} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {filteredMembers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No members match your search</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
