/**
 * CoachGPanel - Prominent Coach G Intelligence panel for soccer pages
 * Appears directly below hero sections with expand/collapse on mobile
 */

import { useState, useEffect } from "react";
import { Brain, ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CoachGExternalLinkIcon } from "@/react-app/components/CoachGExternalLinkIcon";

type GamePhase = "pregame" | "live" | "postgame";

interface Insight {
  id: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  confidence: number;
}

interface CoachGPanelProps {
  leagueId?: string;
  teamId?: string;
  matchId?: string;
}

const DEMO_INSIGHTS = {
  pregame: [
    {
      id: "1",
      icon: <TrendingUp className="h-4 w-4" />,
      title: "Sharp money on Arsenal -1",
      detail: "Line moved from -0.5 to -1 despite 68% public backing Chelsea",
      confidence: 82,
    },
    {
      id: "2",
      icon: <AlertTriangle className="h-4 w-4" />,
      title: "Haaland questionable",
      detail: "Monitor injury report - could impact total",
      confidence: 65,
    },
    {
      id: "3",
      icon: <Target className="h-4 w-4" />,
      title: "Liverpool struggle vs low blocks",
      detail: "Consider unders vs relegation sides",
      confidence: 71,
    },
  ],
  live: [
    {
      id: "1",
      icon: <TrendingUp className="h-4 w-4" />,
      title: "Man City momentum shift",
      detail: "3 corners in 5 mins - o2.5 goals live bet value",
      confidence: 78,
    },
    {
      id: "2",
      icon: <AlertTriangle className="h-4 w-4" />,
      title: "Red card impact detected",
      detail: "Arsenal down to 10 - live total dropping",
      confidence: 85,
    },
  ],
  postgame: [
    {
      id: "1",
      icon: <Target className="h-4 w-4" />,
      title: "Tactical breakdown",
      detail: "Barcelona's high press forced 3 turnovers leading to goals",
      confidence: 88,
    },
    {
      id: "2",
      icon: <TrendingUp className="h-4 w-4" />,
      title: "Key stat: xG differential",
      detail: "PSG outperformed xG by 1.8 - regression likely next match",
      confidence: 73,
    },
  ],
};

export function CoachGPanel({ leagueId, teamId, matchId }: CoachGPanelProps) {
  void leagueId;
  void teamId;
  void matchId;
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<GamePhase>("pregame");
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  // Auto-expand on desktop, collapsed on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const defaultExpanded = !isMobile;
  
  // Fetch analysis from API when phase changes or matchId is available
  useEffect(() => {
    if (matchId) {
      setLoading(true);
      const endpoint = phase === 'postgame' 
        ? `/api/soccer-analysis/${matchId}/postgame`
        : `/api/soccer-analysis/${matchId}/pregame`;
      
      fetch(endpoint)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.analysis) {
            setAnalysisData(data.analysis);
          }
        })
        .catch(err => console.error('Failed to fetch analysis:', err))
        .finally(() => setLoading(false));
    }
  }, [matchId, phase]);
  
  // Use API data if available, otherwise fallback to demo data
  const insights = analysisData?.analysis?.insights || DEMO_INSIGHTS[phase];

  return (
    <div className="w-full rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/10 to-cyan-900/10 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Coach G Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-emerald-500/30 shadow-lg">
              <img 
                src="/assets/coachg/coach-g-avatar.png"
                alt="Coach G"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Live indicator */}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0a0a0a]">
              <span className="relative flex h-full w-full">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500"></span>
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base md:text-lg font-bold text-white">Coach G Intelligence</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                AI
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              {insights.length} insights • Click to {expanded || defaultExpanded ? 'collapse' : 'expand'}
            </p>
          </div>
        </div>

        {/* Expand/collapse icon - only show on mobile */}
        <div className="md:hidden text-white/40">
          {expanded || defaultExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>

      {/* Content - Expandable */}
      <AnimatePresence initial={false}>
        {(expanded || defaultExpanded) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/10 p-4 md:p-5 space-y-4">
              {/* Phase Tabs */}
              <div className="flex gap-2">
                {(['pregame', 'live', 'postgame'] as GamePhase[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPhase(p)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                      phase === p
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Insights */}
              <div className="space-y-2">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"></div>
                  </div>
                ) : (
                  insights.map((insight: Insight, idx: number) => (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-3 rounded-lg bg-white/[0.03] border border-white/10 hover:border-emerald-500/30 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                        {insight.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-white leading-tight">
                            {insight.title}
                          </h4>
                          <span className="flex-shrink-0 text-xs text-emerald-400 font-medium">
                            {insight.confidence}%
                          </span>
                        </div>
                        <p className="text-xs text-white/50 leading-relaxed">
                          {insight.detail}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                  ))
                )}
              </div>

              {/* Footer CTA */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-xs text-white/40">
                  Updated 2 min ago
                </span>
                <button
                  onClick={() => navigate("/scout")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-semibold transition-all"
                >
                  <Brain className="h-3.5 w-3.5" />
                  Ask Coach G
                  <CoachGExternalLinkIcon />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CoachGPanel;
