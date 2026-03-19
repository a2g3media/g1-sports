import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, AlertTriangle, TrendingUp, Users, Zap, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { ThresholdWhatJustChanged } from "@/react-app/components/ThresholdWhatJustChanged";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { cn } from "@/react-app/lib/utils";
import { AIAssistant } from "@/react-app/components/AIAssistant";
import { getDemoGames } from "@/react-app/data/demo-games";
import { LiveSweatTab } from "./LiveSweatTab";
import type { Game } from "@/shared/types";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
}

interface TimeContext {
  periodLabel: string;
  periodNumber: number | string;
  status: "open" | "locked" | "live" | "final";
  lockTime: Date;
  timeUntilLock: number;
}

interface PoolHubLiveImpactProps {
  league: League;
  timeContext: TimeContext | null;
}

// Map sport_key from league format to demo-games sport
function mapSportKey(sportKey: string): string {
  const mapping: Record<string, string> = {
    americanfootball_nfl: "nfl",
    basketball_nba: "nba",
    icehockey_nhl: "nhl",
    americanfootball_ncaaf: "ncaaf",
    basketball_ncaab: "ncaab",
    baseball_mlb: "mlb",
    soccer_epl: "soccer",
  };
  return mapping[sportKey] || sportKey.split("_")[1] || sportKey;
}

// Simulated pool exposure for demo (would come from real data in production)
function getPoolExposure(gameId: string): number {
  // Seeded random based on game ID
  const hash = gameId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 10 + (hash % 35);
}

export function PoolHubLiveImpact({ league, timeContext }: PoolHubLiveImpactProps) {
  const navigate = useNavigate();
  useDemoAuth(); // Hook for context
  const isSurvivor = league.format_key === "survivor" || 
                     league.format_key === "survivor_reentry" || 
                     league.format_key === "survivor_two_life";
  
  // For Survivor pools, show the LiveSweatTab directly
  if (isSurvivor) {
    return (
      <div className="space-y-6 animate-page-enter">
        <LiveSweatTab league={league} timeContext={timeContext} />
        <AIAssistant defaultPersona="big_g" leagueId={league.id} />
      </div>
    );
  }
  
  const sport = mapSportKey(league.sport_key);
  
  // Get games from unified demo-games system
  const { liveGames, completedGames, upcomingGames } = useMemo(() => {
    const allGames = getDemoGames();
    const sportGames = allGames.filter(g => g.sport === sport);
    
    return {
      liveGames: sportGames.filter(g => g.status === "IN_PROGRESS"),
      completedGames: sportGames.filter(g => g.status === "FINAL"),
      upcomingGames: sportGames.filter(g => g.status === "SCHEDULED").slice(0, 3),
    };
  }, [sport]);
  
  // Pool impact metrics (simulated)
  const poolImpact = useMemo(() => {
    const hasLive = liveGames.length > 0;
    return {
      eliminationRisk: isSurvivor && hasLive ? 12 : 0,
      leaderRisk: hasLive ? 8 : 0,
      bigMoverPotential: hasLive ? 15 : 0,
    };
  }, [isSurvivor, liveGames.length]);

  // Show content if we have any games
  const hasContent = liveGames.length > 0 || completedGames.length > 0 || upcomingGames.length > 0;

  if (!hasContent) {
    return (
      <div className="space-y-6 animate-page-enter">
        <div className="card-elevated p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Radio className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No Games Today</h2>
          <p className="text-muted-foreground">
            Live updates and pool impact will appear here when games are scheduled.
          </p>
        </div>
        
        <AIAssistant defaultPersona="big_g" leagueId={league.id} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-page-enter">
      {/* What Just Changed Panel */}
      <ThresholdWhatJustChanged 
        maxItems={3}
        className="mb-6"
      />
      
      {/* Pool Impact Blocks - only show when games are live */}
      {liveGames.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {isSurvivor && poolImpact.eliminationRisk > 0 && (
            <div className="card-elevated p-4 text-center border-l-4 border-red-500">
              <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-red-500">{poolImpact.eliminationRisk}%</div>
              <div className="text-xs text-muted-foreground">Elimination Risk</div>
            </div>
          )}
          
          <div className="card-elevated p-4 text-center border-l-4 border-amber-500">
            <TrendingUp className="w-5 h-5 text-amber-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-amber-500">{poolImpact.leaderRisk}%</div>
            <div className="text-xs text-muted-foreground">Leader at Risk</div>
          </div>
          
          <div className="card-elevated p-4 text-center border-l-4 border-green-500">
            <Zap className="w-5 h-5 text-green-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-500">{poolImpact.bigMoverPotential}%</div>
            <div className="text-xs text-muted-foreground">Big Mover Potential</div>
          </div>
        </div>
      )}
      
      {/* Live Games */}
      {liveGames.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-[hsl(var(--live))]" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-[hsl(var(--live))] animate-ping" />
            </div>
            Live Games
            <span className="text-xs">({liveGames.length})</span>
          </h3>
          
          {liveGames.map(game => (
            <LiveGameCard 
              key={game.game_id} 
              game={game} 
              showExposure 
              onClick={() => navigate(`/live?game=${game.game_id}`)}
            />
          ))}
        </div>
      )}
      
      {/* Upcoming Games - show if no live games */}
      {liveGames.length === 0 && upcomingGames.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Upcoming Games
          </h3>
          
          {upcomingGames.map(game => (
            <UpcomingGameCard 
              key={game.game_id} 
              game={game}
              onClick={() => navigate(`/live?game=${game.game_id}`)}
            />
          ))}
        </div>
      )}
      
      {/* Completed Games */}
      {completedGames.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Completed
            <span className="text-xs">({completedGames.length})</span>
          </h3>
          
          {completedGames.slice(0, 3).map(game => (
            <CompletedGameCard 
              key={game.game_id} 
              game={game}
              onClick={() => navigate(`/live?game=${game.game_id}`)}
            />
          ))}
        </div>
      )}
      
      {/* Full Live View Link - available for all sports */}
      {(liveGames.length > 0 || upcomingGames.length > 0) && (
        <div className="text-center pt-4">
          <button 
            onClick={() => navigate('/live')}
            className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
          >
            Open Full Live View
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      
      {/* AI Assistant */}
      <AIAssistant defaultPersona="big_g" leagueId={league.id} />
    </div>
  );
}

// Live game card component
function LiveGameCard({ game, showExposure, onClick }: { game: Game; showExposure?: boolean; onClick?: () => void }) {
  const exposure = getPoolExposure(game.game_id);
  const isAwayWinning = (game.away_score ?? 0) > (game.home_score ?? 0);
  const isHomeWinning = (game.home_score ?? 0) > (game.away_score ?? 0);
  
  return (
    <button 
      onClick={onClick}
      className="card-elevated p-4 w-full text-left hover:ring-2 hover:ring-primary/30 hover:border-primary/50 transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <TeamBadge teamName={game.away_team_name} size="md" status="live" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className={cn(
                "font-medium text-sm",
                isAwayWinning && "font-bold"
              )}>{game.away_team_name}</span>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                isAwayWinning && "text-foreground",
                !isAwayWinning && "text-muted-foreground"
              )}>{game.away_score ?? 0}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={cn(
                "font-medium text-sm",
                isHomeWinning && "font-bold"
              )}>{game.home_team_name}</span>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                isHomeWinning && "text-foreground",
                !isHomeWinning && "text-muted-foreground"
              )}>{game.home_score ?? 0}</span>
            </div>
          </div>
          <TeamBadge teamName={game.home_team_name} size="md" status="live" />
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-[hsl(var(--live))/0.1] text-[hsl(var(--live))] font-medium">
            {game.period_label} {game.clock && `• ${game.clock}`}
          </span>
        </div>
        {showExposure && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{exposure}% pool exposure</span>
          </div>
        )}
      </div>
    </button>
  );
}

// Upcoming game card
function UpcomingGameCard({ game, onClick }: { game: Game; onClick?: () => void }) {
  const startTime = new Date(game.start_time);
  
  return (
    <button 
      onClick={onClick}
      className="card-elevated p-4 opacity-80 w-full text-left hover:opacity-100 hover:ring-2 hover:ring-primary/30 hover:border-primary/50 transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <TeamBadge teamName={game.away_team_name} size="md" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{game.away_team_name}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="font-medium text-sm">{game.home_team_name}</span>
            </div>
          </div>
          <TeamBadge teamName={game.home_team_name} size="md" />
        </div>
      </div>
      
      <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
        {game.broadcast && (
          <span className="text-xs text-muted-foreground">{game.broadcast}</span>
        )}
      </div>
    </button>
  );
}

// Completed game card
function CompletedGameCard({ game, onClick }: { game: Game; onClick?: () => void }) {
  const awayWon = (game.away_score ?? 0) > (game.home_score ?? 0);
  const homeWon = (game.home_score ?? 0) > (game.away_score ?? 0);
  
  return (
    <button 
      onClick={onClick}
      className="card-elevated p-4 opacity-80 w-full text-left hover:opacity-100 hover:ring-2 hover:ring-primary/30 hover:border-primary/50 transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <TeamBadge teamName={game.away_team_name} size="md" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className={cn(
                "font-medium text-sm",
                awayWon && "text-green-500 font-bold"
              )}>{game.away_team_name}</span>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                !awayWon && "text-muted-foreground"
              )}>{game.away_score ?? 0}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={cn(
                "font-medium text-sm",
                homeWon && "text-green-500 font-bold"
              )}>{game.home_team_name}</span>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                !homeWon && "text-muted-foreground"
              )}>{game.home_score ?? 0}</span>
            </div>
          </div>
          <TeamBadge teamName={game.home_team_name} size="md" />
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-border/50">
        <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">
          Final
        </span>
      </div>
    </button>
  );
}
