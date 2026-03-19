import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Clock,
  ChevronRight, Calendar, Radio
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { getSport } from "@/react-app/data/sports";
import { ThresholdWhatJustChanged } from "@/react-app/components/ThresholdWhatJustChanged";
import { 
  LineMovementIndicator, 
  type LineMovementData
} from "@/react-app/components/LineMovementIndicator";
import { 
  InjuryBadge, 
  type InjuryReport 
} from "@/react-app/components/InjuryNewsSummary";
import { 
  WeatherBadge, 
  parseSimpleWeather
} from "@/react-app/components/WeatherSummary";
import { AIAssistant } from "@/react-app/components/AIAssistant";

import type { Game } from "@/shared/types";

/**
 * IntelligenceHome - Pre-Game Study Mode
 * 
 * The calm research view for serious bettors and pool players.
 * Shows schedule, odds, line movement, and contextual info.
 * Now with live score integration when games are in progress.
 */

interface GameOdds {
  spread: number;
  spreadJuice: number;
  total: number;
  totalJuice: number;
  moneylineHome: number;
  moneylineAway: number;
  openingSpread?: number;
  openingTotal?: number;
}

interface GameInfo {
  id: string;
  awayTeam: string;
  homeTeam: string;
  gameTime: Date;
  venue?: string;
  weather?: { temp: number; condition: string; wind?: string };
  odds: GameOdds;
  lineMovement?: LineMovementData;
  injuries?: InjuryReport[];
  poolImpact?: { poolCount: number; exposurePercent: number };
  // Live score data (from demo-games integration)
  liveGame?: Game;
}

interface DaySchedule {
  date: Date;
  sport: string;
  games: GameInfo[];
}

// Match game info to live game by team names
function findLiveGame(awayTeam: string, homeTeam: string, liveGames: Game[]): Game | undefined {
  return liveGames.find(g => 
    (g.away_team_name.includes(awayTeam.split(' ').pop()!) || awayTeam.includes(g.away_team_name)) &&
    (g.home_team_name.includes(homeTeam.split(' ').pop()!) || homeTeam.includes(g.home_team_name))
  );
}

// Demo data for development
function generateDemoSchedule(liveGames: Game[]): DaySchedule[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  
  // Get live games for KC vs BUF if available
  const kcBufLive = findLiveGame("Kansas City Chiefs", "Buffalo Bills", liveGames);
  const phiDalLive = findLiveGame("Philadelphia Eagles", "Dallas Cowboys", liveGames);
  const sfSeaLive = findLiveGame("San Francisco 49ers", "Seattle Seahawks", liveGames);
  const bosMilLive = findLiveGame("Boston Celtics", "Milwaukee Bucks", liveGames);
  const lalGswLive = findLiveGame("Los Angeles Lakers", "Golden State Warriors", liveGames);
  
  return [
    {
      date: today,
      sport: "nfl",
      games: [
        {
          id: "nfl-1",
          awayTeam: "Kansas City Chiefs",
          homeTeam: "Buffalo Bills",
          gameTime: new Date(today.getTime() + 13 * 60 * 60 * 1000),
          venue: "Highmark Stadium",
          weather: { temp: 28, condition: "Snow", wind: "15 mph NW" },
          odds: {
            spread: -2.5,
            spreadJuice: -110,
            total: 47.5,
            totalJuice: -110,
            moneylineHome: -135,
            moneylineAway: +115,
            openingSpread: -1,
            openingTotal: 49,
          },
          lineMovement: {
            direction: "toward_home",
            magnitude: 1.5,
            openingLine: -1,
            currentLine: -2.5,
            openingTotal: 49,
            currentTotal: 47.5,
            reasons: [
              { type: "sharp_money", description: "Professional money moved early on BUF. 68% of bets on KC but 71% of dollars on BUF.", impact: "high" },
              { type: "weather", description: "Snow forecast with 15+ mph winds typically suppresses scoring and favors home team.", impact: "medium" },
              { type: "injury", description: "Chris Jones (DT) questionable - BUF rushing attack could exploit interior.", impact: "medium" }
            ],
            timestamp: new Date(Date.now() - 45 * 60 * 1000)
          } as LineMovementData,
          injuries: [
            { 
              player: "Chris Jones", 
              team: "Kansas City Chiefs", 
              position: "DT",
              status: "questionable", 
              injury: "Knee",
              impact: "high",
              note: "Limited practice Thursday. Game-time decision likely.",
              updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
            },
            { 
              player: "Isiah Pacheco", 
              team: "Kansas City Chiefs", 
              position: "RB",
              status: "out", 
              injury: "Fibula",
              impact: "medium",
              note: "Placed on IR. Expected to return late season.",
              updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          ] as InjuryReport[],
          poolImpact: { poolCount: 12, exposurePercent: 34 },
          liveGame: kcBufLive,
        },
        {
          id: "nfl-2",
          awayTeam: "Philadelphia Eagles",
          homeTeam: "Dallas Cowboys",
          gameTime: new Date(today.getTime() + 16.5 * 60 * 60 * 1000),
          venue: "AT&T Stadium",
          odds: {
            spread: 3,
            spreadJuice: -105,
            total: 44,
            totalJuice: -110,
            moneylineHome: +130,
            moneylineAway: -150,
            openingSpread: 2.5,
            openingTotal: 45.5,
          },
          lineMovement: {
            direction: "toward_away",
            magnitude: 0.5,
            openingLine: 2.5,
            currentLine: 3,
            openingTotal: 45.5,
            currentTotal: 44,
            reasons: [
              { type: "public_money", description: "82% of spread bets on PHI creating value on DAL side.", impact: "medium" },
              { type: "reverse_line", description: "Line moving against public action suggests sharp money on DAL.", impact: "low" }
            ],
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
          } as LineMovementData,
          poolImpact: { poolCount: 18, exposurePercent: 62 },
          liveGame: phiDalLive,
        },
        {
          id: "nfl-3",
          awayTeam: "San Francisco 49ers",
          homeTeam: "Seattle Seahawks",
          gameTime: new Date(today.getTime() + 20.5 * 60 * 60 * 1000),
          venue: "Lumen Field",
          odds: {
            spread: -6.5,
            spreadJuice: -110,
            total: 49.5,
            totalJuice: -110,
            moneylineHome: +210,
            moneylineAway: -260,
            openingSpread: -7,
            openingTotal: 48,
          },
          lineMovement: {
            direction: "stable",
            magnitude: 0.5,
            openingLine: -7,
            currentLine: -6.5,
            reasons: [],
            timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000)
          } as LineMovementData,
          poolImpact: { poolCount: 8, exposurePercent: 78 },
          liveGame: sfSeaLive,
        }
      ]
    },
    {
      date: today,
      sport: "nba",
      games: [
        {
          id: "nba-1",
          awayTeam: "Boston Celtics",
          homeTeam: "Milwaukee Bucks",
          gameTime: new Date(today.getTime() + 19 * 60 * 60 * 1000),
          venue: "Fiserv Forum",
          odds: {
            spread: 2.5,
            spreadJuice: -110,
            total: 228.5,
            totalJuice: -110,
            moneylineHome: +115,
            moneylineAway: -135,
            openingSpread: 3.5,
            openingTotal: 226,
          },
          lineMovement: {
            direction: "toward_away",
            magnitude: 1,
            openingLine: 3.5,
            currentLine: 2.5,
            openingTotal: 226,
            currentTotal: 228.5,
            reasons: [
              { type: "injury", description: "Giannis Antetokounmpo listed questionable with knee soreness. Game-time decision expected.", impact: "high" },
              { type: "sharp_money", description: "Early sharp action took BOS before public caught on to injury news.", impact: "medium" }
            ],
            timestamp: new Date(Date.now() - 30 * 60 * 1000)
          } as LineMovementData,
          injuries: [
            { 
              player: "Giannis Antetokounmpo", 
              team: "Milwaukee Bucks", 
              position: "PF",
              status: "questionable", 
              injury: "Knee soreness",
              impact: "high",
              note: "Participated in shootaround. Game-time decision expected.",
              updatedAt: new Date(Date.now() - 45 * 60 * 1000)
            },
            { 
              player: "Khris Middleton", 
              team: "Milwaukee Bucks", 
              position: "SF",
              status: "out", 
              injury: "Ankle",
              impact: "high",
              note: "Sidelined indefinitely. No timetable for return.",
              updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
            }
          ] as InjuryReport[],
          liveGame: bosMilLive,
        },
        {
          id: "nba-2",
          awayTeam: "Los Angeles Lakers",
          homeTeam: "Golden State Warriors",
          gameTime: new Date(today.getTime() + 22 * 60 * 60 * 1000),
          venue: "Chase Center",
          odds: {
            spread: -4,
            spreadJuice: -110,
            total: 232,
            totalJuice: -110,
            moneylineHome: -175,
            moneylineAway: +150,
          },
          liveGame: lalGswLive,
        }
      ]
    },
    {
      date: tomorrow,
      sport: "nfl",
      games: [
        {
          id: "nfl-4",
          awayTeam: "Detroit Lions",
          homeTeam: "Green Bay Packers",
          gameTime: new Date(tomorrow.getTime() + 20.5 * 60 * 60 * 1000),
          venue: "Lambeau Field",
          weather: { temp: 22, condition: "Clear", wind: "8 mph W" },
          odds: {
            spread: -3,
            spreadJuice: -110,
            total: 51.5,
            totalJuice: -110,
            moneylineHome: -155,
            moneylineAway: +135,
          },
        }
      ]
    }
  ];
}

// Format spread for display
function formatSpread(spread: number): string {
  if (spread > 0) return `+${spread}`;
  if (spread < 0) return `${spread}`;
  return "PK";
}

// Format moneyline for display
function formatMoneyline(ml: number): string {
  return ml > 0 ? `+${ml}` : `${ml}`;
}

// Format game time
function formatGameTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

// Format date header
function formatDateHeader(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  
  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// Live Score Header Component
function LiveScoreHeader({ game }: { game: Game }) {
  const isAwayWinning = (game.away_score ?? 0) > (game.home_score ?? 0);
  const isHomeWinning = (game.home_score ?? 0) > (game.away_score ?? 0);
  
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-[hsl(var(--live))]/5 border border-[hsl(var(--live))]/20 mb-4">
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--live))]" />
          <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[hsl(var(--live))] animate-ping opacity-75" />
        </div>
        <div className="text-xs font-bold text-[hsl(var(--live))] uppercase tracking-wider">
          Live
        </div>
        {game.period_label && (
          <span className="text-xs text-muted-foreground">
            {game.period_label} {game.clock && `· ${game.clock}`}
          </span>
        )}
      </div>
      
      {/* Score */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <TeamBadge teamName={game.away_team_name} size="sm" />
          <span className={cn(
            "text-lg font-bold tabular-nums",
            isAwayWinning && "text-[hsl(var(--live))]"
          )}>
            {game.away_score ?? 0}
          </span>
        </div>
        <span className="text-muted-foreground text-sm">-</span>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-lg font-bold tabular-nums",
            isHomeWinning && "text-[hsl(var(--live))]"
          )}>
            {game.home_score ?? 0}
          </span>
          <TeamBadge teamName={game.home_team_name} size="sm" />
        </div>
      </div>
    </div>
  );
}

// Game Card Component
function GameCard({ game, onClick }: { game: GameInfo; onClick?: () => void }) {
  const hasLineMovement = game.lineMovement && game.lineMovement.magnitude > 0;
  const hasInjuries = game.injuries && game.injuries.length > 0;
  const hasWeather = game.weather && (game.weather.condition !== "Clear" || game.weather.temp < 40);
  const hasPoolImpact = game.poolImpact && game.poolImpact.poolCount > 0;
  const isLive = game.liveGame?.status === "IN_PROGRESS";
  
  const spreadMoved = game.odds.openingSpread !== undefined && 
    Math.abs(game.odds.spread - game.odds.openingSpread) >= 0.5;
  const totalMoved = game.odds.openingTotal !== undefined &&
    Math.abs(game.odds.total - game.odds.openingTotal) >= 0.5;
  
  return (
    <div 
      onClick={onClick}
      className={cn(
        "card-premium p-4 hover:shadow-lg transition-all duration-200 group cursor-pointer",
        isLive && "ring-2 ring-[hsl(var(--live))]/30"
      )}
    >
      {/* Live Score Header - Shows when game is in progress */}
      {isLive && game.liveGame && (
        <LiveScoreHeader game={game.liveGame} />
      )}
      
      {/* Game Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-caption">
          {!isLive && (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>{formatGameTime(game.gameTime)}</span>
            </>
          )}
          {game.venue && (
            <>
              {!isLive && <span className="text-muted-foreground/50">•</span>}
              <span className="text-muted-foreground/70">{game.venue}</span>
            </>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      
      {/* Matchup - Hide if live (already shown in header) */}
      {!isLive && (
        <div className="space-y-3 mb-4">
          {/* Away Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TeamBadge teamName={game.awayTeam} size="md" />
              <span className="font-medium">{game.awayTeam}</span>
            </div>
            <div className="flex items-center gap-4 text-sm tabular-nums">
              <span className={cn(
                "font-semibold",
                spreadMoved && game.odds.spread > (game.odds.openingSpread || 0) && "text-green-600 dark:text-green-400"
              )}>
                {formatSpread(-game.odds.spread)}
              </span>
              <span className="text-muted-foreground w-16 text-right">
                {formatMoneyline(game.odds.moneylineAway)}
              </span>
            </div>
          </div>
          
          {/* Home Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TeamBadge teamName={game.homeTeam} size="md" />
              <span className="font-medium">{game.homeTeam}</span>
            </div>
            <div className="flex items-center gap-4 text-sm tabular-nums">
              <span className={cn(
                "font-semibold",
                spreadMoved && game.odds.spread < (game.odds.openingSpread || 0) && "text-green-600 dark:text-green-400"
              )}>
                {formatSpread(game.odds.spread)}
              </span>
              <span className="text-muted-foreground w-16 text-right">
                {formatMoneyline(game.odds.moneylineHome)}
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Compact Matchup for Live Games - Show odds only */}
      {isLive && (
        <div className="flex items-center justify-between text-sm mb-4 py-2 px-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">Spread:</span>
            <span className="font-semibold">{formatSpread(game.odds.spread)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">Total:</span>
            <span className={cn(
              "font-semibold tabular-nums",
              totalMoved && "text-amber-600 dark:text-amber-400"
            )}>
              {game.odds.total}
            </span>
          </div>
        </div>
      )}
      
      {/* Total - Only show for non-live games */}
      {!isLive && (
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50 mb-4">
          <span className="text-sm text-muted-foreground">Total</span>
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-semibold tabular-nums",
              totalMoved && "text-amber-600 dark:text-amber-400"
            )}>
              {game.odds.total}
            </span>
            {totalMoved && game.odds.openingTotal && (
              <span className="text-xs text-muted-foreground">
                (opened {game.odds.openingTotal})
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Context Indicators */}
      {(hasLineMovement || hasInjuries || hasWeather || hasPoolImpact) && (
        <div className="flex flex-wrap gap-2">
          {/* Line Movement */}
          {hasLineMovement && game.lineMovement && (
            <LineMovementIndicator 
              movement={game.lineMovement}
              variant="badge"
              showTooltip={true}
            />
          )}
          
          {/* Weather */}
          {hasWeather && game.weather && (
            <WeatherBadge 
              weather={parseSimpleWeather(game.weather)} 
              showTooltip={true}
            />
          )}
          
          {/* Injuries */}
          {hasInjuries && game.injuries && (
            <InjuryBadge injuries={game.injuries} />
          )}
          
          {/* Pool Impact */}
          {hasPoolImpact && game.poolImpact && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <span>{game.poolImpact.exposurePercent}% pool exposure</span>
            </div>
          )}
        </div>
      )}
      
      {/* Line Movement Summary - Shows primary reason below indicators */}
      {hasLineMovement && game.lineMovement?.reasons && game.lineMovement.reasons.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          {game.lineMovement.reasons[0].description.split('.')[0]}.
        </p>
      )}
    </div>
  );
}

export function IntelligenceHome() {
  const navigate = useNavigate();
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [, setRefreshTrigger] = useState(0);
  
  // Get live games from unified system - using empty array since demo data removed
  const liveGames: Game[] = useMemo(() => [], []);
  
  // Generate schedule with live game data
  const schedule = useMemo(() => generateDemoSchedule(liveGames), [liveGames]);
  
  // Auto-refresh to pick up live score changes
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, []);
  
  // Count live games
  const liveGameCount = liveGames.length;
  
  // Group games by date and sport
  const groupedSchedule = useMemo(() => {
    const groups: { dateKey: string; date: Date; sportGroups: { sport: string; games: GameInfo[] }[] }[] = [];
    
    const dateMap = new Map<string, Map<string, GameInfo[]>>();
    
    schedule.forEach(day => {
      const dateKey = day.date.toISOString().split('T')[0];
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, new Map());
      }
      const sportMap = dateMap.get(dateKey)!;
      if (!sportMap.has(day.sport)) {
        sportMap.set(day.sport, []);
      }
      sportMap.get(day.sport)!.push(...day.games);
    });
    
    dateMap.forEach((sportMap, dateKey) => {
      const sportGroups: { sport: string; games: GameInfo[] }[] = [];
      sportMap.forEach((games, sport) => {
        if (!selectedSport || selectedSport === sport) {
          sportGroups.push({ sport, games });
        }
      });
      if (sportGroups.length > 0) {
        groups.push({
          dateKey,
          date: new Date(dateKey),
          sportGroups
        });
      }
    });
    
    return groups.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [schedule, selectedSport]);
  
  const availableSports = useMemo(() => {
    const sports = new Set<string>();
    schedule.forEach(day => sports.add(day.sport));
    return Array.from(sports);
  }, [schedule]);
  
  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">Study Mode</h1>
          <p className="text-muted-foreground">Research and prepare before games begin</p>
        </div>
        {liveGameCount > 0 && (
          <button 
            onClick={() => navigate('/live')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[hsl(var(--live))]/10 text-[hsl(var(--live))] font-medium hover:bg-[hsl(var(--live))]/20 transition-colors"
          >
            <div className="relative">
              <Radio className="w-4 h-4" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[hsl(var(--live))] animate-pulse" />
            </div>
            <span>{liveGameCount} Live</span>
          </button>
        )}
      </div>
      
      {/* What Just Changed Panel - Threshold Engine Powered */}
      <ThresholdWhatJustChanged 
        scope="DEMO"
        maxItems={3}
        defaultExpanded={true}
        refreshInterval={30000}
      />
      
      {/* Sport Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setSelectedSport(null)}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
            !selectedSport 
              ? "bg-primary text-primary-foreground" 
              : "bg-secondary hover:bg-secondary/80"
          )}
        >
          All Sports
        </button>
        {availableSports.map(sportKey => {
          const sport = getSport(sportKey);
          if (!sport) return null;
          return (
            <button
              key={sportKey}
              onClick={() => setSelectedSport(sportKey)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                selectedSport === sportKey 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-secondary hover:bg-secondary/80"
              )}
            >
              <sport.icon className="w-4 h-4" />
              {sport.abbr}
            </button>
          );
        })}
      </div>
      
      {/* Schedule */}
      <div className="space-y-8">
        {groupedSchedule.map(dateGroup => (
          <div key={dateGroup.dateKey} className="space-y-4">
            {/* Date Header */}
            <h2 className="text-h2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10">
              {formatDateHeader(dateGroup.date)}
            </h2>
            
            {/* Sport Groups */}
            {dateGroup.sportGroups.map(sportGroup => {
              const sport = getSport(sportGroup.sport);
              const liveCount = sportGroup.games.filter(g => g.liveGame?.status === "IN_PROGRESS").length;
              return (
                <div key={sportGroup.sport} className="space-y-3">
                  {/* Sport Header */}
                  <div className="flex items-center gap-2 text-caption">
                    {sport && <sport.icon className="w-4 h-4" />}
                    <span className="uppercase tracking-wider">{sport?.name || sportGroup.sport}</span>
                    <span className="text-muted-foreground/50">•</span>
                    <span className="text-muted-foreground">{sportGroup.games.length} games</span>
                    {liveCount > 0 && (
                      <>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="flex items-center gap-1 text-[hsl(var(--live))]">
                          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--live))] animate-pulse" />
                          {liveCount} live
                        </span>
                      </>
                    )}
                  </div>
                  
                  {/* Games Grid */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {sportGroup.games.map(game => (
                      <GameCard 
                        key={game.id} 
                        game={game} 
                        onClick={() => navigate(`/intel/game/${game.id}`)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      
      {/* Empty State */}
      {groupedSchedule.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-h3 mb-2">No games scheduled</h3>
          <p className="text-muted-foreground">Check back later for upcoming matchups</p>
        </div>
      )}
      
      {/* AI Assistant - Contextual for Study Mode */}
      <AIAssistant defaultPersona="billy" />
    </div>
  );
}
