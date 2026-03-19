import { useState, useMemo } from "react";
import { Trophy, TrendingUp, TrendingDown, Minus, Medal, Skull } from "lucide-react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { getDemoStandingsForLeague, getDemoPeriodsForLeague } from "@/react-app/data/demo-leagues";
import { cn } from "@/react-app/lib/utils";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  member_count: number;
}

interface PoolHubStandingsProps {
  league: League;
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function PoolHubStandings({ league }: PoolHubStandingsProps) {
  const { isDemoMode } = useDemoAuth();
  const [selectedWeek, setSelectedWeek] = useState<"all" | string>("all");
  
  const isSurvivor = league.format_key === "survivor" || 
                     league.format_key === "survivor_reentry";
  
  // Get standings - use demo data in demo mode
  const standings = useMemo(() => {
    if (isDemoMode) {
      const demoStandings = getDemoStandingsForLeague(league.id);
      return demoStandings.map(s => ({
        id: s.user_id,
        rank: s.rank,
        name: s.display_name,
        points: s.total_points,
        weeklyPoints: Math.floor(s.total_points / 10),
        delta: s.previous_rank ? s.previous_rank - s.rank : 0,
        isYou: s.is_current_user || false,
        isEliminated: s.is_eliminated || false,
        initials: s.display_name.split(' ').map(n => n[0]).join(''),
      }));
    }
    
    // Default mock data
    return [
      { id: 1, rank: 1, name: "Mike S.", points: 156, weeklyPoints: 12, delta: 0, isYou: false, isEliminated: false, initials: "MS" },
      { id: 2, rank: 2, name: "Sarah K.", points: 148, weeklyPoints: 14, delta: 2, isYou: false, isEliminated: false, initials: "SK" },
      { id: 3, rank: 3, name: "You", points: 142, weeklyPoints: 10, delta: -1, isYou: true, isEliminated: false, initials: "YO" },
      { id: 4, rank: 4, name: "John D.", points: 138, weeklyPoints: 11, delta: 1, isYou: false, isEliminated: false, initials: "JD" },
      { id: 5, rank: 5, name: "Emma R.", points: 134, weeklyPoints: 9, delta: -2, isYou: false, isEliminated: false, initials: "ER" },
      { id: 6, rank: 6, name: "Alex M.", points: 128, weeklyPoints: 8, delta: 0, isYou: false, isEliminated: false, initials: "AM" },
      { id: 7, rank: 7, name: "Chris P.", points: 122, weeklyPoints: 7, delta: 1, isYou: false, isEliminated: false, initials: "CP" },
      { id: 8, rank: 8, name: "Taylor W.", points: 115, weeklyPoints: 6, delta: -1, isYou: false, isEliminated: false, initials: "TW" },
    ];
  }, [league.id, isDemoMode]);
  
  // Available periods - use demo data in demo mode
  const periods = useMemo(() => {
    if (isDemoMode) {
      return getDemoPeriodsForLeague(league.id);
    }
    return Array.from({ length: 14 }, (_, i) => `Week ${i + 1}`);
  }, [league.id, isDemoMode]);
  
  // Current user stats
  const currentUser = standings.find(s => s.isYou);
  const leader = standings[0];

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Period Selector */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
        <button
          onClick={() => setSelectedWeek("all")}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
            selectedWeek === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80"
          )}
        >
          {isSurvivor ? "Active" : "Season"}
        </button>
        {periods.map(period => (
          <button
            key={period}
            onClick={() => setSelectedWeek(period)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
              selectedWeek === period
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            {period}
          </button>
        ))}
      </div>
      
      {/* Standings Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground">Rank</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground">Player</th>
                <th className="text-right p-4 text-xs font-medium text-muted-foreground">
                  {selectedWeek === "all" ? (isSurvivor ? "Status" : "Total") : selectedWeek}
                </th>
                <th className="text-right p-4 text-xs font-medium text-muted-foreground">Change</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((player) => (
                <tr 
                  key={player.id}
                  className={cn(
                    "border-b border-border/30 last:border-0 transition-colors",
                    player.isYou && "bg-primary/5",
                    player.isEliminated && "opacity-50"
                  )}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {player.isEliminated ? (
                        <Skull className="w-5 h-5 text-red-500" />
                      ) : player.rank === 1 ? (
                        <Medal className="w-5 h-5 text-amber-500" />
                      ) : player.rank === 2 ? (
                        <Medal className="w-5 h-5 text-slate-400" />
                      ) : player.rank === 3 ? (
                        <Medal className="w-5 h-5 text-amber-700" />
                      ) : (
                        <span className="w-5 text-center text-sm text-muted-foreground">
                          {player.rank}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium",
                        player.isYou 
                          ? "bg-primary text-primary-foreground" 
                          : player.isEliminated
                          ? "bg-red-500/10 text-red-500"
                          : "bg-muted"
                      )}>
                        {player.initials || player.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className={cn(
                        "font-medium",
                        player.isYou && "text-primary",
                        player.isEliminated && "line-through"
                      )}>
                        {player.name}
                        {player.isYou && (
                          <span className="ml-2 text-xs bg-primary/10 px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                        {player.isEliminated && (
                          <span className="ml-2 text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full">
                            OUT
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    {isSurvivor && selectedWeek === "all" ? (
                      <span className={cn(
                        "text-sm font-medium px-2 py-1 rounded",
                        player.isEliminated 
                          ? "bg-red-500/10 text-red-500" 
                          : "bg-green-500/10 text-green-500"
                      )}>
                        {player.isEliminated ? "Eliminated" : "Alive"}
                      </span>
                    ) : (
                      <span className="text-lg font-bold">
                        {selectedWeek === "all" ? player.points : player.weeklyPoints}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {player.isEliminated ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : player.delta > 0 ? (
                        <>
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          <span className="text-green-500 text-sm font-medium">
                            +{player.delta}
                          </span>
                        </>
                      ) : player.delta < 0 ? (
                        <>
                          <TrendingDown className="w-4 h-4 text-red-500" />
                          <span className="text-red-500 text-sm font-medium">
                            {player.delta}
                          </span>
                        </>
                      ) : (
                        <Minus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Your Stats Summary */}
      {currentUser && (
        <div className="card-elevated p-5">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Your Performance
          </h3>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className={cn(
                "text-2xl font-bold",
                currentUser.isEliminated && "text-red-500"
              )}>
                {currentUser.isEliminated ? "OUT" : `${currentUser.rank}${getOrdinal(currentUser.rank)}`}
              </div>
              <div className="text-xs text-muted-foreground">
                {isSurvivor ? "Status" : "Current Rank"}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">{currentUser.points}</div>
              <div className="text-xs text-muted-foreground">Total Points</div>
            </div>
            <div>
              <div className={cn(
                "text-2xl font-bold",
                currentUser.rank === 1 ? "text-amber-500" : "text-red-500"
              )}>
                {currentUser.rank === 1 ? "Leader!" : `-${leader.points - currentUser.points}`}
              </div>
              <div className="text-xs text-muted-foreground">
                {currentUser.rank === 1 ? "You're #1" : "Behind Leader"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
