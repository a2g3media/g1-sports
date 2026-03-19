import { useState, useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Medal,
  Target,
  Flame,
  Crown,
  Eye,
  EyeOff,
  User,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/react-app/components/ui/tabs";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  stats: {
    totalPicks: number;
    correctPicks: number;
    winPercentage: number;
    currentStreak: number;
    bestStreak: number;
    roi: number | null;
    unitsWon: number;
  };
  isCurrentUser?: boolean;
}

interface LeaderboardResult {
  entries: LeaderboardEntry[];
  currentUserEntry: LeaderboardEntry | null;
  totalParticipants: number;
  lastUpdated: string;
  period: "all_time" | "weekly" | "monthly";
}

type Period = "all_time" | "weekly" | "monthly";
type LeaderboardType = "global" | "league";

const SPORTS = [
  { key: "all", label: "All Sports" },
  { key: "americanfootball_nfl", label: "NFL" },
  { key: "basketball_nba", label: "NBA" },
  { key: "baseball_mlb", label: "MLB" },
  { key: "icehockey_nhl", label: "NHL" },
  { key: "soccer_epl", label: "Soccer" },
];

const RankBadge = memo(function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 shadow-lg shadow-yellow-500/30">
        <Crown className="h-5 w-5 text-white" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 shadow-lg shadow-slate-400/30">
        <Medal className="h-5 w-5 text-white" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 shadow-lg shadow-amber-600/30">
        <Medal className="h-5 w-5 text-white" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-muted-foreground font-semibold">
      {rank}
    </div>
  );
});

const LeaderboardRow = memo(function LeaderboardRow({
  entry,
  showDetails,
}: {
  entry: LeaderboardEntry;
  showDetails?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-muted/50",
        entry.isCurrentUser && "bg-primary/5 border border-primary/20 ring-1 ring-primary/10"
      )}
    >
      <RankBadge rank={entry.rank} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-medium truncate",
            entry.isCurrentUser && "text-primary"
          )}>
            {entry.displayName}
          </span>
          {entry.isCurrentUser && (
            <Badge variant="outline" className="text-xs">You</Badge>
          )}
        </div>

        {showDetails && (
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              {entry.stats.correctPicks}/{entry.stats.totalPicks} picks
            </span>
            {entry.stats.currentStreak > 0 && (
              <span className="flex items-center gap-1 text-orange-500">
                <Flame className="h-3 w-3" />
                {entry.stats.currentStreak} streak
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-right">
        <div>
          <div className="text-lg font-bold text-foreground">
            {entry.stats.winPercentage.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground">Win Rate</div>
        </div>

        {entry.stats.roi !== null && (
          <div className={cn(
            "text-right",
            entry.stats.roi > 0 ? "text-green-500" : entry.stats.roi < 0 ? "text-red-500" : "text-muted-foreground"
          )}>
            <div className="text-sm font-semibold">
              {entry.stats.roi > 0 ? "+" : ""}{entry.stats.roi.toFixed(1)}%
            </div>
            <div className="text-xs opacity-70">ROI</div>
          </div>
        )}
      </div>
    </div>
  );
});

const CurrentUserPinnedCard = memo(function CurrentUserPinnedCard({
  entry,
}: {
  entry: LeaderboardEntry;
}) {
  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">Your Ranking</span>
          <Badge variant="secondary" className="text-xs">
            #{entry.rank}
          </Badge>
        </div>

        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold text-primary">
              {entry.stats.winPercentage.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Win Rate</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {entry.stats.correctPicks}
            </div>
            <div className="text-xs text-muted-foreground">Correct</div>
          </div>
          <div>
            <div className={cn(
              "text-2xl font-bold",
              entry.stats.currentStreak > 0 ? "text-orange-500" : "text-muted-foreground"
            )}>
              {entry.stats.currentStreak}
            </div>
            <div className="text-xs text-muted-foreground">Streak</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {entry.stats.bestStreak}
            </div>
            <div className="text-xs text-muted-foreground">Best</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

interface LeaderboardProps {
  leagueId?: number;
  compact?: boolean;
  showFilters?: boolean;
}

export function Leaderboard({
  leagueId,
  compact = false,
  showFilters = true,
}: LeaderboardProps) {
  const [period, setPeriod] = useState<Period>("all_time");
  const [sportKey, setSportKey] = useState<string>("all");
  const [type, setType] = useState<LeaderboardType>(leagueId ? "league" : "global");

  const { data, isLoading, error } = useQuery<LeaderboardResult>({
    queryKey: ["leaderboard", type, leagueId, period, sportKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("period", period);
      if (sportKey && sportKey !== "all" && type === "global") params.set("sport", sportKey);

      const endpoint = type === "league" && leagueId
        ? `/api/leaderboard/league/${leagueId}?${params}`
        : `/api/leaderboard?${params}`;

      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    staleTime: 60000, // Cache for 1 minute
  });

  const showCurrentUserPinned = useMemo(() => {
    if (!data?.currentUserEntry) return false;
    // Show pinned card if user is outside top 10
    return data.currentUserEntry.rank > 10;
  }, [data]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Failed to load leaderboard</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(!compact && "shadow-lg")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            {type === "league" ? "League Leaderboard" : "Global Leaderboard"}
          </CardTitle>

          {showFilters && (
            <div className="flex items-center gap-2">
              {leagueId && (
                <Tabs value={type} onValueChange={(v) => setType(v as LeaderboardType)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="league" className="text-xs px-2">League</TabsTrigger>
                    <TabsTrigger value="global" className="text-xs px-2">Global</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_time">All Time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>

              {type === "global" && (
                <Select value={sportKey} onValueChange={setSportKey}>
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORTS.map((sport) => (
                      <SelectItem key={sport.key} value={sport.key}>
                        {sport.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        {data && (
          <p className="text-xs text-muted-foreground mt-1">
            {data.totalParticipants} participants • Updated {new Date(data.lastUpdated).toLocaleTimeString()}
          </p>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <LeaderboardSkeleton />
        ) : (
          <>
            {showCurrentUserPinned && data?.currentUserEntry && (
              <div className="mb-4">
                <CurrentUserPinnedCard entry={data.currentUserEntry} />
              </div>
            )}

            <div className={cn(
              "space-y-1",
              compact && "max-h-[400px] overflow-y-auto pr-1"
            )}>
              {data?.entries.map((entry) => (
                <LeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  showDetails={!compact}
                />
              ))}

              {data?.entries.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No rankings yet</p>
                  <p className="text-sm">Make some picks to appear on the leaderboard!</p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact weekly top performers widget
 */
export function WeeklyTopPerformers() {
  const { data, isLoading } = useQuery<{ topPerformers: LeaderboardEntry[] }>({
    queryKey: ["leaderboard", "weekly-top"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard/weekly-top?limit=3", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 300000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  if (!data?.topPerformers.length) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Flame className="h-3 w-3 text-orange-500" />
        This Week's Best
      </span>
      <div className="flex items-center gap-2">
        {data.topPerformers.map((entry, i) => (
          <Badge
            key={entry.userId}
            variant={i === 0 ? "default" : "secondary"}
            className={cn(
              "gap-1",
              i === 0 && "bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0"
            )}
          >
            {i === 0 && <Crown className="h-3 w-3" />}
            {entry.displayName.slice(0, 12)}
            <span className="opacity-70">{entry.stats.winPercentage.toFixed(0)}%</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

/**
 * Privacy toggle for leaderboard visibility (for Settings page)
 */
export function LeaderboardPrivacyToggle() {
  const { user, isDemoMode } = useDemoAuth();
  const { data, isLoading, refetch } = useQuery<{ visible: boolean }>({
    queryKey: ["leaderboard", "privacy"],
    queryFn: async () => {
      if (isDemoMode || !user?.id) {
        return { visible: false };
      }
      const res = await fetch("/api/leaderboard/privacy", {
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        return { visible: false };
      }
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    retry: false,
  });

  const [updating, setUpdating] = useState(false);

  const handleToggle = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/leaderboard/privacy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ visible: !data?.visible }),
      });
      if (res.ok) {
        refetch();
      }
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data?.visible ? (
              <div className="p-2 rounded-lg bg-green-500/10">
                <Eye className="h-5 w-5 text-green-500" />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-muted">
                <EyeOff className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div>
              <h3 className="font-medium">Leaderboard Visibility</h3>
              <p className="text-sm text-muted-foreground">
                {data?.visible
                  ? "Your stats appear on public leaderboards"
                  : "Your stats are hidden from public leaderboards"}
              </p>
            </div>
          </div>

          <Button
            variant={data?.visible ? "default" : "outline"}
            size="sm"
            onClick={handleToggle}
            disabled={isLoading || updating}
          >
            {data?.visible ? "Visible" : "Hidden"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default Leaderboard;
