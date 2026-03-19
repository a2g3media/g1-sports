import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, ChevronRight, Tv, TrendingUp, Clock, Flame } from "lucide-react";
import { getTeamLogoUrl } from "@/react-app/lib/teamLogos";
import { getSoccerTeamLogo } from "@/react-app/lib/espnSoccer";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { SPORT_CONFIGS, type SportConfig } from "./SportHubLayout";

/**
 * Get team logo URL - handles soccer specially using ESPN lookup
 */
function getHeroTeamLogo(sportKey: string, teamCode: string, teamName: string, teamId?: string): string | undefined {
  const sport = sportKey.toLowerCase();
  
  if (sport === 'soccer') {
    const soccerLogo = getSoccerTeamLogo({ id: teamId, name: teamName });
    return soccerLogo || undefined;
  }
  
  // Non-soccer sports use the standard team logos helper
  return getTeamLogoUrl(sportKey.toUpperCase(), teamCode) ?? undefined;
}

interface HeroGame {
  id: string;
  homeTeam: {
    id?: string;
    code: string;
    name: string;
    score: number;
    record?: string;
  };
  awayTeam: {
    id?: string;
    code: string;
    name: string;
    score: number;
    record?: string;
  };
  status: "LIVE" | "SCHEDULED" | "FINAL";
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string;
  spread?: number;
  total?: number;
}

interface HubHeroProps {
  sportKey: string;
  game: HeroGame | null;
  loading?: boolean;
}

export function HubHero({ sportKey, game, loading }: HubHeroProps) {
  const config = SPORT_CONFIGS[sportKey.toLowerCase()] || SPORT_CONFIGS.nba;
  const [clockTick, setClockTick] = useState(0);

  // Simulate clock tick for live games
  useEffect(() => {
    if (game?.status !== "LIVE") return;
    const interval = setInterval(() => setClockTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [game?.status]);

  if (loading) {
    return <HeroSkeleton config={config} />;
  }

  if (!game) {
    return <HeroEmpty config={config} sportKey={sportKey} />;
  }

  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";
  const homeWinning = (game.homeTeam.score || 0) > (game.awayTeam.score || 0);
  const awayWinning = (game.awayTeam.score || 0) > (game.homeTeam.score || 0);

  return (
    <div className="relative overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0">
        {/* Deep gradient base */}
        <div 
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, rgba(${config.accentRgb}, 0.08) 0%, rgba(0,0,0,0.95) 50%, rgba(${config.accentRgb}, 0.05) 100%)`
          }}
        />
        
        {/* Team logo watermarks */}
        <div className="absolute inset-0 flex">
          <div 
            className="w-1/2 flex items-center justify-center opacity-[0.03]"
            style={{
              background: `radial-gradient(circle at 30% 50%, rgba(255,255,255,0.05), transparent 60%)`
            }}
          >
            <img 
              src={getHeroTeamLogo(sportKey, game.awayTeam.code, game.awayTeam.name, game.awayTeam.id)}
              alt=""
              className="w-64 h-64 object-contain blur-sm"
            />
          </div>
          <div 
            className="w-1/2 flex items-center justify-center opacity-[0.03]"
            style={{
              background: `radial-gradient(circle at 70% 50%, rgba(255,255,255,0.05), transparent 60%)`
            }}
          >
            <img 
              src={getHeroTeamLogo(sportKey, game.homeTeam.code, game.homeTeam.name, game.homeTeam.id)}
              alt=""
              className="w-64 h-64 object-contain blur-sm"
            />
          </div>
        </div>

        {/* Animated glow pulse for live games */}
        {isLive && (
          <motion.div
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 50% 100%, rgba(${config.accentRgb}, 0.15), transparent 60%)`
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        {/* Status badge */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {isLive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 border border-red-500/30"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-sm font-bold text-red-400 uppercase tracking-wider">
                Live Now
              </span>
            </motion.div>
          )}
          
          {isFinal && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20">
              <span className="text-sm font-bold text-white/70 uppercase tracking-wider">
                Final
              </span>
            </div>
          )}

          {game.channel && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <Tv className="h-3.5 w-3.5 text-white/50" />
              <span className="text-xs font-semibold text-white/60">{game.channel}</span>
            </div>
          )}
        </div>

        {/* Main matchup display */}
        <div className="flex items-center justify-center gap-4 sm:gap-8 lg:gap-16">
          {/* Away team */}
          <TeamDisplay
            team={game.awayTeam}
            sportKey={sportKey}
            config={config}
            isWinning={awayWinning}
            isLive={isLive}
            side="away"
          />

          {/* Score / Time center */}
          <div className="flex flex-col items-center">
            {isLive || isFinal ? (
              <>
                {/* Score display */}
                <div className="flex items-center gap-3 sm:gap-6">
                  <motion.span
                    key={`away-${game.awayTeam.score}-${clockTick}`}
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-4xl sm:text-6xl lg:text-7xl font-black tabular-nums ${
                      awayWinning ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    {game.awayTeam.score}
                  </motion.span>
                  
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xl sm:text-2xl text-white/30 font-light">—</span>
                    {isLive && game.period && (
                      <div 
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                        style={{ 
                          backgroundColor: `rgba(${config.accentRgb}, 0.2)`,
                          color: config.accent
                        }}
                      >
                        {game.period}
                      </div>
                    )}
                  </div>
                  
                  <motion.span
                    key={`home-${game.homeTeam.score}-${clockTick}`}
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-4xl sm:text-6xl lg:text-7xl font-black tabular-nums ${
                      homeWinning ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    {game.homeTeam.score}
                  </motion.span>
                </div>

                {/* Clock */}
                {isLive && game.clock && (
                  <motion.div
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="mt-3 flex items-center gap-1.5 text-white/60"
                  >
                    <Clock className="h-4 w-4" />
                    <span className="text-lg sm:text-xl font-mono font-semibold">
                      {game.clock}
                    </span>
                  </motion.div>
                )}
              </>
            ) : (
              /* Scheduled game - show time */
              <div className="flex flex-col items-center">
                <div className="text-3xl sm:text-5xl font-black text-white/30">VS</div>
                {game.startTime && (
                  <div className="mt-3 text-lg sm:text-xl font-semibold text-white/60">
                    {formatGameTime(game.startTime)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Home team */}
          <TeamDisplay
            team={game.homeTeam}
            sportKey={sportKey}
            config={config}
            isWinning={homeWinning}
            isLive={isLive}
            side="home"
          />
        </div>

        {/* Odds bar */}
        {(game.spread || game.total) && (
          <div className="flex items-center justify-center gap-4 sm:gap-8 mt-8">
            {game.spread && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                <TrendingUp className="h-4 w-4 text-white/40" />
                <span className="text-sm text-white/50">Spread</span>
                <span className="text-sm font-bold text-white">
                  {game.spread > 0 ? '+' : ''}{game.spread}
                </span>
              </div>
            )}
            {game.total && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                <span className="text-sm text-white/50">O/U</span>
                <span className="text-sm font-bold text-white">{game.total}</span>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center justify-center mt-8">
          <Link
            to={toGameDetailPath(sportKey, game.id)}
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-all"
            style={{
              background: `linear-gradient(135deg, ${config.accent}, ${config.darkAccent})`,
              boxShadow: `0 4px 20px rgba(${config.accentRgb}, 0.3)`
            }}
          >
            {isLive ? (
              <>
                <Play className="h-4 w-4" />
                Watch Live
              </>
            ) : (
              <>
                Game Details
              </>
            )}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      {/* Bottom border glow */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(${config.accentRgb}, 0.5), transparent)`
        }}
      />
    </div>
  );
}

interface TeamDisplayProps {
  team: HeroGame['homeTeam'];
  sportKey: string;
  config: SportConfig;
  isWinning: boolean;
  isLive: boolean;
  side: 'home' | 'away';
}

function TeamDisplay({ team, sportKey, config, isWinning, isLive, side }: TeamDisplayProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = getHeroTeamLogo(sportKey, team.code, team.name, team.id);
  
  // Get initials for fallback
  const getInitials = (name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  
  const showLogo = logoUrl && !logoFailed;

  return (
    <div className={`flex flex-col items-center ${side === 'away' ? 'sm:items-end' : 'sm:items-start'}`}>
      {/* Logo with glow */}
      <div className="relative mb-3">
        {isWinning && isLive && (
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full blur-2xl"
            style={{ backgroundColor: config.accent }}
          />
        )}
        <div className="relative w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 flex items-center justify-center">
          {showLogo ? (
            <img
              src={logoUrl}
              alt={team.name}
              className="w-full h-full object-contain drop-shadow-lg"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center bg-white/5 border border-white/10">
              <span className="text-2xl sm:text-3xl font-black text-white/50">
                {getInitials(team.name)}
              </span>
            </div>
          )}
        </div>
        
        {/* Winning indicator */}
        {isWinning && isLive && (
          <div 
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: config.accent }}
          >
            <Flame className="h-3 w-3 text-white" />
          </div>
        )}
      </div>

      {/* Team info */}
      <div className={`text-center ${side === 'away' ? 'sm:text-right' : 'sm:text-left'}`}>
        <div className={`text-lg sm:text-xl lg:text-2xl font-black tracking-tight ${
          isWinning ? 'text-white' : 'text-white/70'
        }`}>
          {team.name}
        </div>
        {team.record && (
          <div className="text-xs sm:text-sm text-white/40 font-medium mt-0.5">
            {team.record}
          </div>
        )}
      </div>
    </div>
  );
}

function HeroSkeleton({ config }: { config: SportConfig }) {
  return (
    <div className="relative overflow-hidden py-16 sm:py-20">
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, rgba(${config.accentRgb}, 0.05) 0%, rgba(0,0,0,0.95) 100%)`
        }}
      />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-8 sm:gap-16">
          {/* Away skeleton */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-white/5 animate-pulse" />
            <div className="mt-3 w-20 h-5 rounded bg-white/10 animate-pulse" />
          </div>
          
          {/* Center */}
          <div className="flex flex-col items-center">
            <div className="flex gap-4">
              <div className="w-16 h-16 rounded bg-white/10 animate-pulse" />
              <div className="w-16 h-16 rounded bg-white/10 animate-pulse" />
            </div>
          </div>
          
          {/* Home skeleton */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-white/5 animate-pulse" />
            <div className="mt-3 w-20 h-5 rounded bg-white/10 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroEmpty({ config, sportKey }: { config: SportConfig; sportKey: string }) {
  return (
    <div className="relative overflow-hidden py-12 sm:py-16">
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, rgba(${config.accentRgb}, 0.05) 0%, rgba(0,0,0,0.95) 100%)`
        }}
      />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="text-6xl mb-4">{config.icon}</div>
        <h2 className="text-2xl sm:text-3xl font-black text-white/50 mb-2">
          No Games Right Now
        </h2>
        <p className="text-white/30 mb-6">
          Check back later for live {config.name} action
        </p>
        <Link
          to={`/games?sport=${sportKey.toUpperCase()}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/70 hover:text-white transition-all font-semibold"
        >
          View Schedule
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function formatGameTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const time = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    if (isToday) {
      return `Today ${time}`;
    }
    
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayName} ${time}`;
  } catch {
    return '';
  }
}

export default HubHero;
