import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";

// Quick navigation chips that route to different parts of the app
const QUICK_CHIPS = [
  { label: "Tonight's games", route: "/games", query: "tonight" },
  { label: "Sharp bets today", route: "/games?tab=odds", query: "sharp" },
  { label: "My pools", route: "/pools", query: "pools" },
  { label: "NBA insights", route: "/sports/nba", query: "nba" },
  { label: "Best props", route: "/games?tab=props", query: "props" },
];

// Sample daily insights that Coach G would generate
const DAILY_INSIGHTS = [
  "Sharp action building on Celtics tonight. Watch the total in the Lakers game.",
  "Public heavy on favorites today. Three contrarian spots worth watching.",
  "Line movement alert: Bucks spread down 2 points since open. Sharp money detected.",
  "Weather factor in tonight's MLB slate. Wind favoring unders at Wrigley.",
];

interface CoachGCommandCenterProps {
  className?: string;
}

export function CoachGCommandCenter({ className }: CoachGCommandCenterProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [liveInsight, setLiveInsight] = useState<string | null>(null);
  
  // Rotate through insights (in production, this would come from AI)
  const fallbackInsight = DAILY_INSIGHTS[Math.floor(Date.now() / 86400000) % DAILY_INSIGHTS.length];
  const dailyInsight = liveInsight || fallbackInsight;

  useEffect(() => {
    let active = true;
    fetch("/api/coachg/daily-brief", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (typeof data?.summary === "string" && data.summary.trim().length > 0) {
          setLiveInsight(data.summary.trim());
        }
      })
      .catch(() => {
        // Keep fallback insight.
      });
    return () => {
      active = false;
    };
  }, []);
  
  // Handle search/navigation queries
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const q = query.toLowerCase().trim();
    
    // Route based on query intent
    if (q.includes("game") || q.includes("tonight") || q.includes("live")) {
      navigate("/games");
    } else if (q.includes("sharp") || q.includes("money")) {
      navigate("/games?tab=odds");
    } else if (q.includes("pool")) {
      navigate("/pools");
    } else if (q.includes("nba") || q.includes("basketball")) {
      navigate("/sports/nba");
    } else if (q.includes("nfl") || q.includes("football")) {
      navigate("/sports/nfl");
    } else if (q.includes("mlb") || q.includes("baseball")) {
      navigate("/sports/mlb");
    } else if (q.includes("nhl") || q.includes("hockey")) {
      navigate("/sports/nhl");
    } else if (q.includes("prop")) {
      navigate("/games?tab=props");
    } else if (q.includes("watchboard") || q.includes("watch")) {
      navigate("/watchboard");
    } else {
      // Default: open Coach G chat with the query
      navigate(`/coach?q=${encodeURIComponent(query)}`);
    }
    
    setQuery("");
  }, [query, navigate]);
  
  const handleChipClick = useCallback((route: string) => {
    navigate(route);
  }, [navigate]);
  
  return (
    <div className={cn("w-full", className)}>
      {/* Main Card */}
      <div className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95",
        "border border-primary/20",
        "backdrop-blur-xl",
        "shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_60px_rgba(59,130,246,0.08)]",
        "transition-all duration-300",
        isFocused && "border-primary/40 shadow-[0_12px_48px_rgba(0,0,0,0.5),0_0_80px_rgba(59,130,246,0.15)]"
      )}>
        {/* Ambient glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 bg-primary/10 rounded-full blur-[100px] opacity-60" />
        <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-emerald-500/8 rounded-full blur-[80px] opacity-40" />
        
        {/* Shimmer effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-[shimmer_3s_ease-in-out_infinite]" 
            style={{ transform: 'translateX(-100%)', animation: 'shimmer 3s ease-in-out infinite' }} 
          />
        </div>
        
        <div className="relative p-5 sm:p-6">
          {/* Header Row */}
          <div className="flex items-center gap-3 mb-4">
            {/* Coach G Avatar */}
            <div className="relative shrink-0">
              <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-primary/30 via-primary/20 to-emerald-500/20 blur-md opacity-60 animate-pulse" />
              <CoachGAvatar size="lg" presence="monitoring" className="relative" />
            </div>
            
            {/* Title */}
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Coach G
              </h2>
              <p className="text-[11px] sm:text-xs text-primary/70 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                AI Sports Intelligence
              </p>
            </div>
          </div>
          
          {/* Daily Insight */}
          <div className="mb-5">
            <p className="text-[15px] sm:text-base text-white/85 leading-relaxed font-medium">
              "{dailyInsight}"
            </p>
          </div>
          
          {/* Search Input */}
          <form onSubmit={handleSubmit} className="mb-4">
            <div className={cn(
              "relative flex items-center rounded-xl",
              "bg-white/[0.04] border",
              "transition-all duration-200",
              isFocused 
                ? "border-primary/40 bg-white/[0.06] shadow-[0_0_20px_rgba(59,130,246,0.15)]" 
                : "border-white/10 hover:border-white/15"
            )}>
              <Search className="absolute left-4 w-4 h-4 text-white/30" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Ask Coach G anything about games, odds, teams, or pools"
                className={cn(
                  "w-full h-12 sm:h-14 pl-11 pr-4",
                  "bg-transparent text-white/90 text-sm sm:text-base",
                  "placeholder:text-white/30",
                  "focus:outline-none"
                )}
              />
              {query && (
                <button
                  type="submit"
                  className="absolute right-2 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-semibold transition-colors"
                >
                  Ask
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </form>
          
          {/* Quick Chips */}
          <div className="flex flex-wrap gap-2">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => handleChipClick(chip.route)}
                className={cn(
                  "px-3 sm:px-4 py-2 rounded-full",
                  "text-xs sm:text-[13px] font-medium",
                  "bg-white/[0.04] border border-white/10",
                  "text-white/60 hover:text-white/90",
                  "hover:bg-primary/15 hover:border-primary/30",
                  "transition-all duration-200",
                  "active:scale-95"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
