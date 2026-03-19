import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MessageCircle, 
  TrendingUp, 
  Zap, 
  Target, 
  ChevronRight,
  Sparkles,
  Trophy,
  AlertCircle,
  Loader2,
  X
} from "lucide-react";
import { Link } from "react-router-dom";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { CoachGExternalLinkIcon } from "@/react-app/components/CoachGExternalLinkIcon";

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  nba: [
    { 
      id: "best-bet", 
      label: "Best Bet Tonight", 
      prompt: "What's the best NBA bet tonight? Give me your top pick with reasoning.",
      icon: <Target className="h-4 w-4" />,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30"
    },
    { 
      id: "upset-alert", 
      label: "Upset Watch", 
      prompt: "Are there any NBA games tonight where an upset is likely? Analyze the underdogs.",
      icon: <AlertCircle className="h-4 w-4" />,
      color: "text-amber-400",
      bgColor: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30"
    },
    { 
      id: "player-props", 
      label: "Hot Props", 
      prompt: "What are the best NBA player props tonight? Give me 2-3 strong plays.",
      icon: <TrendingUp className="h-4 w-4" />,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/30"
    },
    { 
      id: "parlay-builder", 
      label: "Quick Parlay", 
      prompt: "Build me a 3-leg NBA parlay for tonight with good value.",
      icon: <Zap className="h-4 w-4" />,
      color: "text-purple-400",
      bgColor: "bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30"
    },
  ],
  nfl: [
    { 
      id: "best-bet", 
      label: "Best Bet Today", 
      prompt: "What's your best NFL bet this week? Give me your top pick.",
      icon: <Target className="h-4 w-4" />,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30"
    },
    { 
      id: "upset-alert", 
      label: "Upset Watch", 
      prompt: "Which NFL underdog has the best chance to pull off an upset?",
      icon: <AlertCircle className="h-4 w-4" />,
      color: "text-amber-400",
      bgColor: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30"
    },
    { 
      id: "totals", 
      label: "Over/Under Picks", 
      prompt: "What NFL totals (over/unders) do you like this week?",
      icon: <TrendingUp className="h-4 w-4" />,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/30"
    },
    { 
      id: "prime-time", 
      label: "Prime Time Pick", 
      prompt: "Give me your pick for the prime time NFL game.",
      icon: <Trophy className="h-4 w-4" />,
      color: "text-purple-400",
      bgColor: "bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30"
    },
  ],
  mlb: [
    { 
      id: "best-bet", 
      label: "Best Bet Tonight", 
      prompt: "What's the best MLB bet tonight? Give me your top pick.",
      icon: <Target className="h-4 w-4" />,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30"
    },
    { 
      id: "pitcher-matchup", 
      label: "Pitching Edge", 
      prompt: "Which MLB pitcher matchup creates the best betting opportunity tonight?",
      icon: <Sparkles className="h-4 w-4" />,
      color: "text-amber-400",
      bgColor: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30"
    },
    { 
      id: "run-line", 
      label: "Run Line Value", 
      prompt: "Are there any run line plays with good value tonight?",
      icon: <TrendingUp className="h-4 w-4" />,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/30"
    },
    { 
      id: "first-five", 
      label: "First 5 Innings", 
      prompt: "Give me your best first 5 innings (F5) bet tonight.",
      icon: <Zap className="h-4 w-4" />,
      color: "text-purple-400",
      bgColor: "bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30"
    },
  ],
  nhl: [
    { 
      id: "best-bet", 
      label: "Best Bet Tonight", 
      prompt: "What's the best NHL bet tonight?",
      icon: <Target className="h-4 w-4" />,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30"
    },
    { 
      id: "puck-line", 
      label: "Puck Line Value", 
      prompt: "Are there any puck line plays with good value tonight?",
      icon: <TrendingUp className="h-4 w-4" />,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/30"
    },
    { 
      id: "goalie-edge", 
      label: "Goalie Advantage", 
      prompt: "Which NHL goalie matchup creates the best betting edge tonight?",
      icon: <Sparkles className="h-4 w-4" />,
      color: "text-amber-400",
      bgColor: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30"
    },
    { 
      id: "totals", 
      label: "Over/Under Pick", 
      prompt: "What NHL totals look good tonight?",
      icon: <Zap className="h-4 w-4" />,
      color: "text-purple-400",
      bgColor: "bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30"
    },
  ],
};

// Default actions for sports without specific ones
const DEFAULT_ACTIONS: QuickAction[] = [
  { 
    id: "best-bet", 
    label: "Best Bet", 
    prompt: "What's the best bet for today? Give me your top pick.",
    icon: <Target className="h-4 w-4" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30"
  },
  { 
    id: "value-play", 
    label: "Value Play", 
    prompt: "Where do you see the best value in today's games?",
    icon: <TrendingUp className="h-4 w-4" />,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/30"
  },
  { 
    id: "upset-alert", 
    label: "Upset Watch", 
    prompt: "Are there any likely upsets today?",
    icon: <AlertCircle className="h-4 w-4" />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30"
  },
];

interface CoachCommandCardProps {
  sportKey: string;
}

export function CoachCommandCard({ sportKey }: CoachCommandCardProps) {
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = QUICK_ACTIONS[sportKey.toLowerCase()] || DEFAULT_ACTIONS;

  const handleActionClick = async (action: QuickAction) => {
    setSelectedAction(action);
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: action.prompt,
          context: {
            sport: sportKey.toUpperCase(),
            source: "coach_command_card",
            quickAction: action.id,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }

      const data = await res.json();
      setResponse(data.response || data.message || "No response available.");
    } catch (err) {
      console.error("[CoachCommandCard] Error:", err);
      setError("Couldn't get Coach G's take right now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedAction(null);
    setResponse(null);
    setError(null);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center gap-3">
        <CoachGAvatar size="sm" />
        <div>
          <h3 className="text-sm font-semibold text-white">Coach G Quick Actions</h3>
          <p className="text-xs text-white/40">Get instant insights with one tap</p>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <motion.button
              key={action.id}
              onClick={() => handleActionClick(action)}
              disabled={loading}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${action.bgColor} shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30`}
            >
              <span className={`${action.color} flex-shrink-0`}>{action.icon}</span>
              <span className="text-sm font-semibold text-white truncate">{action.label}</span>
              <ChevronRight className="h-3.5 w-3.5 text-white/30 ml-auto flex-shrink-0" />
            </motion.button>
          ))}
        </div>
      </div>

      {/* Response Panel */}
      <AnimatePresence>
        {(selectedAction && (loading || response || error)) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-white/10 bg-black/30"
          >
            <div className="p-4">
              {/* Response Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <motion.span 
                    className={selectedAction.color}
                    animate={{ scale: loading ? [1, 1.1, 1] : 1 }}
                    transition={{ duration: 1, repeat: loading ? Infinity : 0 }}
                  >
                    {selectedAction.icon}
                  </motion.span>
                  <span className="text-sm font-medium text-white/80">{selectedAction.label}</span>
                </div>
                <motion.button 
                  onClick={handleClose}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white/50 hover:text-white transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>

              {/* Loading State */}
              {loading && (
                <div className="flex items-center gap-3 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--sport-accent)]" />
                  <span className="text-sm text-white/50">Coach G is analyzing...</span>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Response */}
              {response && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                    {response}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <Link
                      to={`/scout?q=${encodeURIComponent(selectedAction.prompt)}`}
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--sport-accent)] hover:text-white font-medium transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Continue conversation
                      <CoachGExternalLinkIcon />
                    </Link>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="p-3 border-t border-white/5 bg-white/[0.02]">
        <Link
          to="/scout"
          className="flex items-center justify-center gap-2 text-sm text-white/50 hover:text-[var(--sport-accent)] transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Open full chat with Coach G
          <CoachGExternalLinkIcon />
        </Link>
      </div>
    </div>
  );
}

export default CoachCommandCard;
