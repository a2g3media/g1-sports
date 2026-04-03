import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Clock, ChevronRight, Eye, Flame, Tv } from "lucide-react";
import { getTeamColors } from "@/react-app/lib/teamColors";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { cn } from "@/react-app/lib/utils";
import { TeamLogo } from "@/react-app/components/TeamLogo";

interface HeroGame {
  id: string;
  homeTeam: { code: string; name: string; score: number; record?: string };
  awayTeam: { code: string; name: string; score: number; record?: string };
  status: "LIVE" | "SCHEDULED" | "FINAL";
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string;
  spread?: number;
  total?: number;
}

interface LiveHeroMorphProps {
  sportKey: string;
  games: HeroGame[];
  loading?: boolean;
  onActiveIndexChange?: (index: number) => void;
  buildGameUrl?: (gameId: string) => string;
}

const ROTATION_INTERVAL = 8000; // 8 seconds per game

export function LiveHeroMorph({ sportKey, games, loading, onActiveIndexChange, buildGameUrl }: LiveHeroMorphProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Notify parent of active index changes
  useEffect(() => {
    onActiveIndexChange?.(activeIndex);
  }, [activeIndex, onActiveIndexChange]);

  // Auto-rotate through games
  useEffect(() => {
    if (games.length <= 1 || isPaused) return;
    
    const interval = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % games.length);
    }, ROTATION_INTERVAL);
    
    return () => clearInterval(interval);
  }, [games.length, isPaused]);

  const activeGame = games[activeIndex];

  // Get team colors for gradient background
  const teamColors = useMemo(() => {
    if (!activeGame) return null;
    const homeColors = getTeamColors(sportKey.toUpperCase(), activeGame.homeTeam.code);
    const awayColors = getTeamColors(sportKey.toUpperCase(), activeGame.awayTeam.code);
    return { home: homeColors, away: awayColors };
  }, [activeGame, sportKey]);

  const formatStartTime = useCallback((isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", { 
      hour: "numeric", 
      minute: "2-digit",
      hour12: true 
    });
  }, []);

  if (loading) {
    return (
      <div className="relative h-[280px] rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 animate-pulse">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!activeGame) {
    return (
      <div className="relative h-[280px] rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          No games available
        </div>
      </div>
    );
  }

  const isLive = activeGame.status === "LIVE";
  const isFinal = activeGame.status === "FINAL";
  const matchUrl = buildGameUrl ? buildGameUrl(activeGame.id) : toGameDetailPath(sportKey, activeGame.id);

  return (
    <div 
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeGame.id}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative h-[280px] rounded-2xl overflow-hidden"
        >
          {/* Dynamic gradient background using team colors */}
          <div 
            className="absolute inset-0 transition-all duration-700"
            style={{
              background: teamColors ? `
                linear-gradient(135deg, 
                  ${teamColors.away.primary}25 0%, 
                  #0a0a0a 35%,
                  #0a0a0a 65%,
                  ${teamColors.home.primary}25 100%
                )
              ` : 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)'
            }}
          />
          
          {/* Subtle noise texture overlay */}
          <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />
          
          {/* Glow effects */}
          {isLive && (
            <>
              <div 
                className="absolute -left-20 top-1/2 -translate-y-1/2 w-60 h-60 rounded-full blur-[80px] opacity-30"
                style={{ backgroundColor: teamColors?.away.primary || '#3B82F6' }}
              />
              <div 
                className="absolute -right-20 top-1/2 -translate-y-1/2 w-60 h-60 rounded-full blur-[80px] opacity-30"
                style={{ backgroundColor: teamColors?.home.primary || '#3B82F6' }}
              />
            </>
          )}

          {/* Content */}
          <div className="relative h-full flex flex-col justify-between p-6">
            {/* Top bar - Status & Channel */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isLive ? (
                  <motion.div 
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.25)]"
                  >
                    <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Live</span>
                  </motion.div>
                ) : isFinal ? (
                  <div className="px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600/30">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Final</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold text-cyan-400">{formatStartTime(activeGame.startTime)}</span>
                  </div>
                )}
                
                {activeGame.channel && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/50">
                    <Tv className="w-3 h-3 text-slate-400" />
                    <span className="text-xs font-medium text-slate-400">{activeGame.channel}</span>
                  </div>
                )}
              </div>

              {/* Game clock for live games - moved to score area */}
            </div>

            {/* Center - Teams & Scores */}
            <div className="flex items-center justify-center gap-3 sm:gap-6 md:gap-12 lg:gap-16">
              {/* Away Team */}
              <TeamDisplay 
                team={activeGame.awayTeam}
                teamColors={teamColors?.away}
                sportKey={sportKey}
                isWinning={activeGame.awayTeam.score > activeGame.homeTeam.score}
                isLive={isLive}
              />

              {/* Score / VS */}
              <div className="flex flex-col items-center">
                {isLive || isFinal ? (
                  <div className="flex items-center gap-3 md:gap-5">
                    <motion.span
                      key={`away-score-${activeGame.awayTeam.score}`}
                      initial={{ scale: 1.2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={cn(
                        "text-4xl md:text-5xl lg:text-6xl font-black tabular-nums",
                        activeGame.awayTeam.score > activeGame.homeTeam.score ? "text-white" : "text-slate-500"
                      )}
                    >
                      {activeGame.awayTeam.score}
                    </motion.span>
                    <div className="flex flex-col items-center">
                      <span className="text-xl md:text-2xl text-slate-600 font-light">-</span>
                      {isLive && (
                        <span className="text-[10px] text-red-400/80 font-semibold uppercase tracking-wider">
                          {activeGame.period}
                        </span>
                      )}
                    </div>
                    <motion.span
                      key={`home-score-${activeGame.homeTeam.score}`}
                      initial={{ scale: 1.2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={cn(
                        "text-4xl md:text-5xl lg:text-6xl font-black tabular-nums",
                        activeGame.homeTeam.score > activeGame.awayTeam.score ? "text-white" : "text-slate-500"
                      )}
                    >
                      {activeGame.homeTeam.score}
                    </motion.span>
                  </div>
                ) : (
                  <div className="text-2xl md:text-3xl font-bold text-slate-500">VS</div>
                )}
                
                {/* Game clock for live */}
                {isLive && activeGame.clock && (
                  <motion.div
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="mt-2 text-sm md:text-base font-mono text-cyan-400 font-semibold"
                  >
                    {activeGame.clock}
                  </motion.div>
                )}
                
                {/* Betting line preview */}
                {activeGame.spread && (
                  <div className="mt-3 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400">
                    {activeGame.spread > 0 ? '+' : ''}{activeGame.spread}
                    {activeGame.total && <span className="ml-2 text-slate-500">O/U {activeGame.total}</span>}
                  </div>
                )}
              </div>

              {/* Home Team */}
              <TeamDisplay 
                team={activeGame.homeTeam}
                teamColors={teamColors?.home}
                sportKey={sportKey}
                isWinning={activeGame.homeTeam.score > activeGame.awayTeam.score}
                isLive={isLive}
              />
            </div>

            {/* Bottom - CTA & Navigation dots */}
            <div className="flex items-center justify-between">
              {/* Navigation dots - centered and more prominent */}
              {games.length > 1 && (
                <div className="flex items-center gap-1.5 p-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
                  {games.map((game, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveIndex(idx)}
                      aria-label={`View game ${idx + 1}: ${game.awayTeam?.code || 'Away'} vs ${game.homeTeam?.code || 'Home'}`}
                      className={cn(
                        "relative h-2.5 rounded-full transition-all duration-300 overflow-hidden min-w-[10px]",
                        idx === activeIndex 
                          ? "w-8 bg-cyan-500/30" 
                          : "w-2.5 bg-white/20 hover:bg-white/40"
                      )}
                    >
                      {/* Progress indicator for active dot */}
                      {idx === activeIndex && !isPaused && (
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-cyan-400 rounded-full"
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ 
                            duration: ROTATION_INTERVAL / 1000, 
                            ease: "linear",
                            repeat: Infinity
                          }}
                          key={`progress-${activeGame?.id}`}
                        />
                      )}
                      {/* Static fill when paused */}
                      {idx === activeIndex && isPaused && (
                        <div className="absolute inset-0 bg-cyan-400 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* CTA Button */}
              <Link
                to={matchUrl}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all",
                  "bg-white/10 hover:bg-white/20 text-white border border-white/10 hover:border-white/20",
                  "backdrop-blur-sm"
                )}
              >
                <Eye className="w-4 h-4" />
                <span>{isLive ? "Watch Live" : isFinal ? "View Recap" : "Preview"}</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default LiveHeroMorph;

// Team Display Component with logo support
interface TeamDisplayProps {
  team: HeroGame['homeTeam'];
  teamColors: { primary: string; secondary: string } | undefined;
  sportKey: string;
  isWinning: boolean;
  isLive: boolean;
}

function TeamDisplay({ team, teamColors, sportKey, isWinning, isLive }: TeamDisplayProps) {
  const primaryColor = teamColors?.primary || '#444';

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Team logo/avatar with glow effect */}
      <div className="relative">
        {isWinning && isLive && (
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -inset-2 rounded-full blur-xl"
            style={{ backgroundColor: primaryColor }}
          />
        )}
        <div
          className="relative w-[78px] h-[78px] sm:w-[92px] sm:h-[92px] md:w-[108px] md:h-[108px] rounded-full flex items-center justify-center"
          style={{
            boxShadow: isWinning && isLive ? `0 0 34px ${primaryColor}45` : 'none'
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-55 blur-[14px]"
            style={{ background: `radial-gradient(circle at 50% 50%, ${primaryColor}38 0%, transparent 72%)` }}
          />
          <TeamLogo
            teamCode={team.code}
            teamName={team.name}
            sport={sportKey.toUpperCase()}
            size={84}
            className="relative z-10 [filter:drop-shadow(0_18px_26px_rgba(0,0,0,0.72))_drop-shadow(0_0_1px_rgba(255,255,255,0.82))]"
            winnerGlow={isWinning && isLive}
          />
        </div>
        
        {/* Winning flame indicator */}
        {isWinning && isLive && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: primaryColor }}
          >
            <Flame className="w-3.5 h-3.5 text-white" />
          </motion.div>
        )}
      </div>
      
      {/* Team name */}
      <span className={cn(
        "text-xs sm:text-sm md:text-base font-semibold text-center max-w-[110px] sm:max-w-[130px] truncate",
        isWinning ? "text-white" : "text-slate-400"
      )}>
        {team.name}
      </span>
      
      {/* Record */}
      {team.record && (
        <span className="text-[10px] md:text-xs text-slate-500 font-medium">
          {team.record}
        </span>
      )}
    </div>
  );
}
