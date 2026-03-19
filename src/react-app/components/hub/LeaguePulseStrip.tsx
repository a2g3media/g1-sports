import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, Flame, TrendingUp, Clock, Zap, 
  Trophy, AlertTriangle, Target, ChevronRight 
} from "lucide-react";

interface PulseChip {
  id: string;
  icon: "live" | "streak" | "blowout" | "close" | "trending" | "clock" | "alert" | "target";
  label: string;
  value: string | number;
  color: "cyan" | "amber" | "emerald" | "red" | "purple" | "blue";
  priority: number;
}

interface LeaguePulseStripProps {
  sportKey: string;
  games?: any[];
}

const ICON_MAP = {
  live: Activity,
  streak: Flame,
  blowout: Zap,
  close: Target,
  trending: TrendingUp,
  clock: Clock,
  alert: AlertTriangle,
  target: Trophy,
};

const COLOR_MAP = {
  cyan: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 text-cyan-400",
  amber: "from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400",
  emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400",
  red: "from-red-500/20 to-red-500/5 border-red-500/30 text-red-400",
  purple: "from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-400",
  blue: "from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400",
};

const GLOW_MAP = {
  cyan: "shadow-[0_0_20px_rgba(6,182,212,0.3)]",
  amber: "shadow-[0_0_20px_rgba(245,158,11,0.3)]",
  emerald: "shadow-[0_0_20px_rgba(16,185,129,0.3)]",
  red: "shadow-[0_0_20px_rgba(239,68,68,0.3)]",
  purple: "shadow-[0_0_20px_rgba(168,85,247,0.3)]",
  blue: "shadow-[0_0_20px_rgba(59,130,246,0.3)]",
};

export function LeaguePulseStrip({ sportKey, games }: LeaguePulseStripProps) {
  const [chips, setChips] = useState<PulseChip[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll state
  useEffect(() => {
    const checkScroll = () => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
      }
    };
    
    checkScroll();
    const el = scrollRef.current;
    el?.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    
    return () => {
      el?.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [chips]);

  // Generate pulse chips from games data
  useEffect(() => {
    async function generatePulseChips() {
      try {
        // Fetch games if not provided
        let gameData = games;
        if (!gameData) {
          const res = await fetch(`/api/games?sport=${sportKey.toUpperCase()}&limit=50`);
          if (res.ok) {
            const data = await res.json();
            gameData = data.games || [];
          }
        }

        if (!gameData || gameData.length === 0) {
          setChips([]);
          setLoading(false);
          return;
        }

        const pulseChips: PulseChip[] = [];

        // Count live games
        const liveGames = gameData.filter((g: any) => 
          g.status === 'LIVE' || g.status === 'IN_PROGRESS'
        );
        if (liveGames.length > 0) {
          pulseChips.push({
            id: 'live-count',
            icon: 'live',
            label: liveGames.length === 1 ? 'Game Live' : 'Games Live',
            value: liveGames.length,
            color: 'red',
            priority: 1,
          });
        }

        // Count close games (within 10 points for basketball, 3 for others)
        const closeThreshold = ['nba', 'ncaab'].includes(sportKey) ? 10 : 3;
        const closeGames = liveGames.filter((g: any) => {
          const diff = Math.abs((g.home_score || 0) - (g.away_score || 0));
          return diff <= closeThreshold;
        });
        if (closeGames.length > 0) {
          pulseChips.push({
            id: 'close-games',
            icon: 'close',
            label: closeGames.length === 1 ? 'Close Game' : 'Close Games',
            value: closeGames.length,
            color: 'amber',
            priority: 2,
          });
        }

        // Count blowouts (>20 for basketball, >14 for football, >5 for others)
        const blowoutThreshold = ['nba', 'ncaab'].includes(sportKey) ? 20 
          : ['nfl', 'ncaaf'].includes(sportKey) ? 14 : 5;
        const blowouts = liveGames.filter((g: any) => {
          const diff = Math.abs((g.home_score || 0) - (g.away_score || 0));
          return diff >= blowoutThreshold;
        });
        if (blowouts.length > 0) {
          pulseChips.push({
            id: 'blowouts',
            icon: 'blowout',
            label: blowouts.length === 1 ? 'Blowout' : 'Blowouts',
            value: blowouts.length,
            color: 'purple',
            priority: 4,
          });
        }

        // Games starting soon (next 2 hours)
        const now = new Date();
        const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const upcomingGames = gameData.filter((g: any) => {
          if (g.status !== 'SCHEDULED') return false;
          const startTime = new Date(g.start_time);
          return startTime >= now && startTime <= twoHoursLater;
        });
        if (upcomingGames.length > 0) {
          pulseChips.push({
            id: 'starting-soon',
            icon: 'clock',
            label: 'Starting Soon',
            value: upcomingGames.length,
            color: 'cyan',
            priority: 3,
          });
        }

        // Today's completed games
        const finalGames = gameData.filter((g: any) => 
          g.status === 'FINAL' || g.status === 'COMPLETED'
        );
        if (finalGames.length > 0) {
          pulseChips.push({
            id: 'completed',
            icon: 'target',
            label: 'Completed',
            value: finalGames.length,
            color: 'emerald',
            priority: 5,
          });
        }

        // Find any overtime games
        const otGames = liveGames.filter((g: any) => {
          const period = g.period_label?.toLowerCase() || '';
          return period.includes('ot') || period.includes('overtime');
        });
        if (otGames.length > 0) {
          pulseChips.push({
            id: 'overtime',
            icon: 'alert',
            label: 'In Overtime',
            value: otGames.length,
            color: 'red',
            priority: 1,
          });
        }

        // High-scoring games (track if any game has high combined score)
        const highScoringThreshold = ['nba', 'ncaab'].includes(sportKey) ? 200 
          : ['nfl', 'ncaaf'].includes(sportKey) ? 50 : 8;
        const highScoring = liveGames.filter((g: any) => {
          const total = (g.home_score || 0) + (g.away_score || 0);
          return total >= highScoringThreshold;
        });
        if (highScoring.length > 0) {
          pulseChips.push({
            id: 'high-scoring',
            icon: 'trending',
            label: 'High Scoring',
            value: highScoring.length,
            color: 'blue',
            priority: 3,
          });
        }

        // Sort by priority and limit to 6
        pulseChips.sort((a, b) => a.priority - b.priority);
        setChips(pulseChips.slice(0, 6));
      } catch (err) {
        console.error('[LeaguePulseStrip] Error generating chips:', err);
      } finally {
        setLoading(false);
      }
    }

    generatePulseChips();
    
    // Polling with exponential backoff
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    let errorCount = 0;
    const BASE_INTERVAL = 30000;
    const MAX_BACKOFF = 240000;
    
    const pollWithBackoff = async () => {
      if (!mounted) return;
      
      try {
        await generatePulseChips();
        errorCount = 0;
      } catch {
        errorCount = Math.min(errorCount + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, errorCount);
        const nextInterval = Math.min(BASE_INTERVAL * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    timeoutId = setTimeout(pollWithBackoff, BASE_INTERVAL);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [sportKey, games]);

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="flex gap-3 px-4 py-3 overflow-hidden">
        {[1, 2, 3, 4].map((i) => (
          <div 
            key={i}
            className="h-10 w-32 rounded-full bg-white/5 animate-pulse flex-shrink-0"
          />
        ))}
      </div>
    );
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* Scrollable strip */}
      <div 
        ref={scrollRef}
        className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <AnimatePresence mode="popLayout">
          {chips.map((chip, index) => {
            const Icon = ICON_MAP[chip.icon];
            return (
              <motion.div
                key={chip.id}
                initial={{ opacity: 0, scale: 0.8, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                whileHover={{ scale: 1.05, y: -2 }}
                className={`
                  flex items-center gap-2.5 px-4 py-2.5 rounded-full flex-shrink-0
                  bg-gradient-to-r ${COLOR_MAP[chip.color]}
                  border backdrop-blur-sm
                  ${chip.icon === 'live' || chip.icon === 'alert' ? GLOW_MAP[chip.color] : ''}
                  cursor-default relative overflow-hidden
                `}
              >
                {/* Subtle shimmer effect */}
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12"
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
                />
                <Icon className={`h-4 w-4 relative ${chip.icon === 'live' ? 'animate-pulse' : ''}`} />
                <span className="font-bold text-sm relative">{chip.value}</span>
                <span className="text-xs text-white/70 whitespace-nowrap relative">{chip.label}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Right fade gradient + scroll hint */}
      {canScrollRight && (
        <div 
          className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-end pointer-events-none"
          style={{
            background: 'linear-gradient(to right, transparent, rgba(10,10,10,0.9))'
          }}
        >
          <motion.button
            onClick={scrollRight}
            className="mr-2 p-2.5 sm:p-1.5 rounded-full bg-white/10 pointer-events-auto hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4 text-white/60" />
          </motion.button>
        </div>
      )}
    </div>
  );
}

export default LeaguePulseStrip;
