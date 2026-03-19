import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Radio, ChevronRight, ChevronLeft } from "lucide-react";
import { getTeamColors } from "@/react-app/lib/teamColors";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { cn } from "@/react-app/lib/utils";

interface HeroGame {
  id: string;
  homeTeam: { code: string; name: string; score: number; record?: string };
  awayTeam: { code: string; name: string; score: number; record?: string };
  status: "LIVE" | "SCHEDULED" | "FINAL";
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string;
}

interface StickyMiniScorebarProps {
  sportKey: string;
  game: HeroGame | null;
  isVisible: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  hasMultiple?: boolean;
}

export function StickyMiniScorebar({ 
  sportKey, 
  game, 
  isVisible,
  onPrev,
  onNext,
  hasMultiple = false
}: StickyMiniScorebarProps) {
  if (!game) return null;

  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";
  const matchUrl = toGameDetailPath(sportKey, game.id);
  
  const homeColors = getTeamColors(sportKey.toUpperCase(), game.homeTeam.code);
  const awayColors = getTeamColors(sportKey.toUpperCase(), game.awayTeam.code);

  const formatStartTime = (isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", { 
      hour: "numeric", 
      minute: "2-digit",
      hour12: true 
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed top-0 left-0 right-0 z-50"
        >
          {/* Gradient background with team colors */}
          <div 
            className="relative overflow-hidden border-b border-white/5"
            style={{
              background: `linear-gradient(90deg, 
                ${awayColors.primary}15 0%, 
                rgba(10,10,10,0.98) 30%,
                rgba(10,10,10,0.98) 70%,
                ${homeColors.primary}15 100%
              )`
            }}
          >
            {/* Blur backdrop */}
            <div className="absolute inset-0 backdrop-blur-xl" />
            
            <div className="relative max-w-7xl mx-auto px-4">
              <div className="flex items-center justify-between h-14 gap-4">
                {/* Navigation arrows (mobile: hidden) */}
                {hasMultiple && (
                  <button
                    onClick={onPrev}
                    className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                  </button>
                )}

                {/* Game content */}
                <Link 
                  to={matchUrl}
                  className="flex-1 flex items-center justify-center gap-3 sm:gap-6 hover:opacity-90 transition-opacity"
                >
                  {/* Away team */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div 
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold"
                      style={{ 
                        background: `${awayColors.primary}30`,
                        borderColor: `${awayColors.primary}40`,
                        borderWidth: '1px'
                      }}
                    >
                      <span className="text-white">{game.awayTeam.code}</span>
                    </div>
                    <span className={cn(
                      "text-xl sm:text-2xl font-bold tabular-nums",
                      (isLive || isFinal) && game.awayTeam.score > game.homeTeam.score 
                        ? "text-white" 
                        : "text-slate-400"
                    )}>
                      {isLive || isFinal ? game.awayTeam.score : '-'}
                    </span>
                  </div>

                  {/* Status badge */}
                  <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]">
                    {isLive ? (
                      <>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30">
                          <Radio className="w-2.5 h-2.5 text-red-400 animate-pulse" />
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
                        </div>
                        {(game.period || game.clock) && (
                          <span className="text-[10px] text-cyan-400 font-mono mt-0.5">
                            {game.period} {game.clock && `• ${game.clock}`}
                          </span>
                        )}
                      </>
                    ) : isFinal ? (
                      <span className="text-xs font-semibold text-slate-500 uppercase">Final</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">
                        {formatStartTime(game.startTime)}
                      </span>
                    )}
                  </div>

                  {/* Home team */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className={cn(
                      "text-xl sm:text-2xl font-bold tabular-nums",
                      (isLive || isFinal) && game.homeTeam.score > game.awayTeam.score 
                        ? "text-white" 
                        : "text-slate-400"
                    )}>
                      {isLive || isFinal ? game.homeTeam.score : '-'}
                    </span>
                    <div 
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold"
                      style={{ 
                        background: `${homeColors.primary}30`,
                        borderColor: `${homeColors.primary}40`,
                        borderWidth: '1px'
                      }}
                    >
                      <span className="text-white">{game.homeTeam.code}</span>
                    </div>
                  </div>
                </Link>

                {/* Navigation arrows */}
                {hasMultiple && (
                  <button
                    onClick={onNext}
                    className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                )}

                {/* View details button (desktop only) */}
                <Link
                  to={matchUrl}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-300 transition-all"
                >
                  <span>Details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default StickyMiniScorebar;
