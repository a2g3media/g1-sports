import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Clock, MapPin, Tv, 
  TrendingUp, Users, AlertCircle, Cloud, ExternalLink
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { OddsSnapshot, OddsMovementBadge } from "@/react-app/components/OddsSnapshot";
import { useOddsSummary } from "@/react-app/hooks/useOdds";
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
import { FollowButton } from "@/react-app/components/FollowButton";

import type { Game, GameOddsSummary } from "@/shared/types";

/**
 * GameIntelligence - Single Game Deep Dive
 * 
 * Full research view for a single game with:
 * - OddsSnapshot (open vs current)
 * - Line movement analysis
 * - Injury reports
 * - Weather impact
 * - Pool exposure
 */

interface GameData {
  id: string;
  awayTeam: string;
  homeTeam: string;
  gameTime: Date;
  venue?: string;
  broadcast?: string;
  weather?: { temp: number; condition: string; wind?: string };
  lineMovement?: LineMovementData;
  injuries?: InjuryReport[];
  poolImpact?: { poolCount: number; exposurePercent: number };
  liveGame?: Game;
}

// Demo game data lookup
function getDemoGameData(gameId: string): GameData | null {
  const liveGames: Game[] = [];
  
  const demoGames: Record<string, GameData> = {
    "nfl-1": {
      id: "nfl-1",
      awayTeam: "Kansas City Chiefs",
      homeTeam: "Buffalo Bills",
      gameTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
      venue: "Highmark Stadium",
      broadcast: "CBS",
      weather: { temp: 28, condition: "Snow", wind: "15 mph NW" },
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
      },
      injuries: [
        { player: "Chris Jones", team: "Kansas City Chiefs", position: "DT", status: "questionable", injury: "Knee", impact: "high", note: "Limited practice Thursday. Game-time decision likely.", updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        { player: "Isiah Pacheco", team: "Kansas City Chiefs", position: "RB", status: "out", injury: "Fibula", impact: "medium", note: "Placed on IR. Expected to return late season.", updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      ],
      poolImpact: { poolCount: 12, exposurePercent: 34 },
      liveGame: liveGames.find(g => g.away_team_name.includes("Chiefs")),
    },
    "nfl-2": {
      id: "nfl-2",
      awayTeam: "Philadelphia Eagles",
      homeTeam: "Dallas Cowboys",
      gameTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
      venue: "AT&T Stadium",
      broadcast: "FOX",
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
      },
      poolImpact: { poolCount: 18, exposurePercent: 62 },
      liveGame: liveGames.find(g => g.away_team_name.includes("Eagles")),
    },
    "nfl-3": {
      id: "nfl-3",
      awayTeam: "San Francisco 49ers",
      homeTeam: "Seattle Seahawks",
      gameTime: new Date(Date.now() + 9 * 60 * 60 * 1000),
      venue: "Lumen Field",
      broadcast: "NBC",
      lineMovement: {
        direction: "stable",
        magnitude: 0.5,
        openingLine: -7,
        currentLine: -6.5,
        reasons: [],
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000)
      },
      poolImpact: { poolCount: 8, exposurePercent: 78 },
      liveGame: liveGames.find(g => g.away_team_name.includes("49ers")),
    },
    "nba-1": {
      id: "nba-1",
      awayTeam: "Boston Celtics",
      homeTeam: "Milwaukee Bucks",
      gameTime: new Date(Date.now() + 7 * 60 * 60 * 1000),
      venue: "Fiserv Forum",
      broadcast: "ESPN",
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
      },
      injuries: [
        { player: "Giannis Antetokounmpo", team: "Milwaukee Bucks", position: "PF", status: "questionable", injury: "Knee soreness", impact: "high", note: "Participated in shootaround. Game-time decision expected.", updatedAt: new Date(Date.now() - 45 * 60 * 1000) },
        { player: "Khris Middleton", team: "Milwaukee Bucks", position: "SF", status: "out", injury: "Ankle", impact: "high", note: "Sidelined indefinitely. No timetable for return.", updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
      ],
      liveGame: liveGames.find(g => g.away_team_name.includes("Celtics")),
    },
    "nba-2": {
      id: "nba-2",
      awayTeam: "Los Angeles Lakers",
      homeTeam: "Golden State Warriors",
      gameTime: new Date(Date.now() + 10 * 60 * 60 * 1000),
      venue: "Chase Center",
      broadcast: "TNT",
      liveGame: liveGames.find(g => g.away_team_name.includes("Lakers")),
    },
  };
  
  return demoGames[gameId] || null;
}

// Generate demo odds summary from game data
function generateDemoOddsSummary(gameId: string): GameOddsSummary | null {
  const demoOdds: Record<string, GameOddsSummary> = {
    "nfl-1": {
      game_id: "nfl-1",
      data_scope: "DEMO",
      spread: { home_line: -2.5, home_price: -110, away_line: 2.5, away_price: -110 },
      total: { line: 47.5, over_price: -110, under_price: -110 },
      moneyline: { home_price: -135, away_price: 115, draw_price: null },
      opening_spread: -1,
      opening_total: 49,
      opening_home_ml: -115,
      spread_moved: true,
      total_moved: true,
      favorite_flipped: false,
      books_count: 5,
      last_updated_at: new Date().toISOString(),
    },
    "nfl-2": {
      game_id: "nfl-2",
      data_scope: "DEMO",
      spread: { home_line: 3, home_price: -105, away_line: -3, away_price: -115 },
      total: { line: 44, over_price: -110, under_price: -110 },
      moneyline: { home_price: 130, away_price: -150, draw_price: null },
      opening_spread: 2.5,
      opening_total: 45.5,
      opening_home_ml: 125,
      spread_moved: true,
      total_moved: true,
      favorite_flipped: false,
      books_count: 5,
      last_updated_at: new Date().toISOString(),
    },
    "nfl-3": {
      game_id: "nfl-3",
      data_scope: "DEMO",
      spread: { home_line: 6.5, home_price: -110, away_line: -6.5, away_price: -110 },
      total: { line: 49.5, over_price: -110, under_price: -110 },
      moneyline: { home_price: 210, away_price: -260, draw_price: null },
      opening_spread: 7,
      opening_total: 48,
      opening_home_ml: 225,
      spread_moved: false,
      total_moved: true,
      favorite_flipped: false,
      books_count: 5,
      last_updated_at: new Date().toISOString(),
    },
    "nba-1": {
      game_id: "nba-1",
      data_scope: "DEMO",
      spread: { home_line: 2.5, home_price: -110, away_line: -2.5, away_price: -110 },
      total: { line: 228.5, over_price: -110, under_price: -110 },
      moneyline: { home_price: 115, away_price: -135, draw_price: null },
      opening_spread: 3.5,
      opening_total: 226,
      opening_home_ml: 135,
      spread_moved: true,
      total_moved: true,
      favorite_flipped: false,
      books_count: 5,
      last_updated_at: new Date().toISOString(),
    },
    "nba-2": {
      game_id: "nba-2",
      data_scope: "DEMO",
      spread: { home_line: -4, home_price: -110, away_line: 4, away_price: -110 },
      total: { line: 232, over_price: -110, under_price: -110 },
      moneyline: { home_price: -175, away_price: 150, draw_price: null },
      opening_spread: -4,
      opening_total: 232,
      opening_home_ml: -175,
      spread_moved: false,
      total_moved: false,
      favorite_flipped: false,
      books_count: 5,
      last_updated_at: new Date().toISOString(),
    },
  };
  
  return demoOdds[gameId] || null;
}

// Format game time
function formatGameTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

function formatGameDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric' 
  });
}

// Live Score Banner
function LiveScoreBanner({ game }: { game: Game }) {
  const isAwayWinning = (game.away_score ?? 0) > (game.home_score ?? 0);
  const isHomeWinning = (game.home_score ?? 0) > (game.away_score ?? 0);
  
  return (
    <div className="rounded-2xl bg-[hsl(var(--live))]/5 border border-[hsl(var(--live))]/20 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-[hsl(var(--live))]" />
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-[hsl(var(--live))] animate-ping opacity-75" />
          </div>
          <span className="text-sm font-bold text-[hsl(var(--live))] uppercase tracking-wider">Live</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {game.period_label} {game.clock && `· ${game.clock}`}
        </span>
      </div>
      
      <div className="flex items-center justify-center gap-8">
        <div className="flex items-center gap-4">
          <TeamBadge teamName={game.away_team_name} size="lg" />
          <span className={cn(
            "text-4xl font-bold tabular-nums",
            isAwayWinning && "text-[hsl(var(--live))]"
          )}>
            {game.away_score ?? 0}
          </span>
        </div>
        <span className="text-2xl text-muted-foreground">-</span>
        <div className="flex items-center gap-4">
          <span className={cn(
            "text-4xl font-bold tabular-nums",
            isHomeWinning && "text-[hsl(var(--live))]"
          )}>
            {game.home_score ?? 0}
          </span>
          <TeamBadge teamName={game.home_team_name} size="lg" />
        </div>
      </div>
    </div>
  );
}

export function GameIntelligence() {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [, setRefreshTrigger] = useState(0);
  
  // Get game data
  const gameData = useMemo(() => gameId ? getDemoGameData(gameId) : null, [gameId]);
  
  // Get demo odds (will integrate with API later)
  const demoOddsSummary = useMemo(() => gameId ? generateDemoOddsSummary(gameId) : null, [gameId]);
  
  // Try API call, fallback to demo
  const { summary: apiSummary, refetch } = useOddsSummary(gameId ?? null, { scope: "PROD" });
  const oddsSummary = apiSummary || demoOddsSummary;
  
  // Auto-refresh for live games
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, []);
  
  if (!gameData) {
    return (
      <div className="min-h-screen bg-background p-6">
        <button 
          onClick={() => navigate('/intel')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Study Mode
        </button>
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-h2 mb-2">Game not found</h2>
          <p className="text-muted-foreground">This game doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }
  
  const isLive = gameData.liveGame?.status === "IN_PROGRESS";
  const hasInjuries = gameData.injuries && gameData.injuries.length > 0;
  const hasWeather = gameData.weather && (gameData.weather.condition !== "Clear" || gameData.weather.temp < 40);
  const hasLineMovement = gameData.lineMovement && gameData.lineMovement.magnitude > 0;
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => navigate('/intel')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Study Mode</span>
            </button>
            <div className="flex items-center gap-2">
              {oddsSummary && <OddsMovementBadge summary={oddsSummary} />}
              {gameId && (
                <FollowButton 
                  itemType="GAME" 
                  itemId={gameId} 
                  sportType={gameId.split("-")[0]}
                  variant="compact"
                />
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 animate-page-enter">
        {/* Live Score Banner */}
        {isLive && gameData.liveGame && (
          <LiveScoreBanner game={gameData.liveGame} />
        )}
        
        {/* Matchup Header */}
        {!isLive && (
          <div className="text-center py-8">
            <div className="flex items-center justify-center gap-8 mb-4">
              <div className="flex flex-col items-center gap-2">
                <TeamBadge teamName={gameData.awayTeam} size="xl" />
                <span className="font-semibold">{gameData.awayTeam}</span>
              </div>
              <div className="text-3xl font-light text-muted-foreground">@</div>
              <div className="flex flex-col items-center gap-2">
                <TeamBadge teamName={gameData.homeTeam} size="xl" />
                <span className="font-semibold">{gameData.homeTeam}</span>
              </div>
            </div>
            
            {/* Game Info */}
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {formatGameDate(gameData.gameTime)} · {formatGameTime(gameData.gameTime)}
              </span>
              {gameData.venue && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {gameData.venue}
                </span>
              )}
              {gameData.broadcast && (
                <span className="flex items-center gap-1.5">
                  <Tv className="w-4 h-4" />
                  {gameData.broadcast}
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Odds Snapshot - Main Feature */}
        <div className="card-premium p-6">
          <OddsSnapshot 
            summary={oddsSummary}
            homeTeam={gameData.homeTeam}
            awayTeam={gameData.awayTeam}
            variant="full"
            onRefresh={refetch}
          />
          
          {/* Link to OddsExplorer */}
          <div className="mt-4 pt-4 border-t border-border/50 flex justify-end">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/odds/${gameId}`)}
              className="gap-2"
            >
              Compare All Sportsbooks
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        
        {/* Context Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Line Movement */}
          {hasLineMovement && gameData.lineMovement && (
            <div className="card-premium p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Line Movement
                </h3>
              </div>
              <LineMovementIndicator 
                movement={gameData.lineMovement}
                variant="detailed"
                showTooltip={false}
              />
              {gameData.lineMovement.reasons.length > 0 && (
                <div className="mt-4 space-y-2">
                  {gameData.lineMovement.reasons.map((reason, idx) => (
                    <p key={idx} className="text-sm text-muted-foreground">
                      {reason.description}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Weather Impact */}
          {hasWeather && gameData.weather && (
            <div className="card-premium p-5">
              <div className="flex items-center gap-2 mb-4">
                <Cloud className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Weather Impact
                </h3>
              </div>
              <WeatherBadge 
                weather={parseSimpleWeather(gameData.weather)} 
                showTooltip={false}
              />
              <p className="mt-3 text-sm text-muted-foreground">
                {gameData.weather.temp}°F · {gameData.weather.condition}
                {gameData.weather.wind && ` · ${gameData.weather.wind}`}
              </p>
            </div>
          )}
          
          {/* Injuries */}
          {hasInjuries && gameData.injuries && (
            <div className="card-premium p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Injury Report
                </h3>
              </div>
              <InjuryBadge injuries={gameData.injuries} />
              <div className="mt-3 space-y-2">
                {gameData.injuries.slice(0, 3).map((injury, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="font-medium">{injury.player}</span>
                    <span className="text-muted-foreground"> ({injury.position}) - {injury.status}</span>
                    {injury.note && (
                      <p className="text-xs text-muted-foreground mt-0.5">{injury.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Pool Exposure */}
          {gameData.poolImpact && (
            <div className="card-premium p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Pool Exposure
                </h3>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{gameData.poolImpact.exposurePercent}%</span>
                <span className="text-muted-foreground">exposure</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                This game affects {gameData.poolImpact.poolCount} of your active pools.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
