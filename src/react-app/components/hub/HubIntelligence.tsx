import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Zap,
  ChevronRight,
  Sparkles,
  BarChart3,
  Clock
} from "lucide-react";
import { Link } from "react-router-dom";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";

// Coach G insight types
type InsightType = "edge" | "alert" | "trend" | "fade";

interface CoachGInsight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  confidence: number; // 0-100
  sport: string;
  gameId?: string;
  teams?: { home: string; away: string };
  metric?: { label: string; value: string; change?: number };
  timestamp: string;
}

// Mock data - would come from AI analysis in production
const MOCK_INSIGHTS: CoachGInsight[] = [
  {
    id: "1",
    type: "edge",
    title: "Sharp Money Alert: Lakers -3.5",
    description: "Line moved from -2 to -3.5 despite 68% public on Celtics. Reverse line movement signals sharp action on LAL.",
    confidence: 82,
    sport: "NBA",
    teams: { home: "Lakers", away: "Celtics" },
    metric: { label: "Line Movement", value: "-1.5 pts", change: -1.5 },
    timestamp: "2 min ago",
  },
  {
    id: "2",
    type: "trend",
    title: "Thunder 8-2 ATS Last 10",
    description: "OKC covering at elite rate with SGA averaging 31.2 PPG in that stretch. Public still fading them.",
    confidence: 76,
    sport: "NBA",
    teams: { home: "Thunder", away: "Mavericks" },
    metric: { label: "ATS Record", value: "8-2", change: 80 },
    timestamp: "15 min ago",
  },
  {
    id: "3",
    type: "alert",
    title: "Injury Impact: Giannis Questionable",
    description: "Antetokounmpo listed questionable with knee soreness. Line hasn't moved yet — potential value brewing.",
    confidence: 71,
    sport: "NBA",
    teams: { home: "Bucks", away: "Heat" },
    metric: { label: "Status", value: "GTD" },
    timestamp: "32 min ago",
  },
  {
    id: "4",
    type: "fade",
    title: "Public Fade: 76ers Getting 72%",
    description: "Heavy public action on Philly, but they're 3-7 ATS as favorites this month. Consider the contrarian play.",
    confidence: 68,
    sport: "NBA",
    teams: { home: "76ers", away: "Bulls" },
    metric: { label: "Public %", value: "72%", change: -3 },
    timestamp: "45 min ago",
  },
];

const INSIGHT_STYLES: Record<InsightType, { 
  icon: typeof TrendingUp; 
  gradient: string; 
  badge: string;
  badgeText: string;
}> = {
  edge: {
    icon: Zap,
    gradient: "from-emerald-500 to-green-600",
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    badgeText: "Edge",
  },
  alert: {
    icon: AlertTriangle,
    gradient: "from-amber-500 to-orange-600",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    badgeText: "Alert",
  },
  trend: {
    icon: TrendingUp,
    gradient: "from-blue-500 to-cyan-600",
    badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    badgeText: "Trend",
  },
  fade: {
    icon: TrendingDown,
    gradient: "from-purple-500 to-violet-600",
    badge: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    badgeText: "Fade",
  },
};

interface HubIntelligenceProps {
  sportKey: string;
  insights?: CoachGInsight[];
}

export function HubIntelligence({ sportKey, insights = MOCK_INSIGHTS }: HubIntelligenceProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filteredInsights = insights.filter(i => i.sport.toLowerCase() === sportKey.toLowerCase());
  const displayInsights = filteredInsights.length > 0 ? filteredInsights : insights.slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Coach G Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-5"
      >
        {/* Animated background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[var(--sport-accent)]/10 to-transparent blur-3xl" />
          <motion.div 
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-transparent blur-3xl"
          />
        </div>

        <div className="relative flex items-start gap-4">
          {/* Coach G Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg">
              <CoachGAvatar size="sm" presence="monitoring" className="h-full w-full rounded-xl" />
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0a0a0a] flex items-center justify-center">
              <Sparkles className="w-2 h-2 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-white">Coach G</h3>
              <span className="px-2 py-0.5 rounded-full bg-[var(--sport-accent)]/20 text-[var(--sport-accent)] text-[10px] font-bold uppercase tracking-wider">
                AI Analyst
              </span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              Scanning {sportKey.toUpperCase()} lines, injury reports, and sharp action. 
              <span className="text-white/70"> {displayInsights.length} insights</span> ready for review.
            </p>
          </div>

          {/* Quick stats */}
          <div className="hidden sm:flex items-center gap-4">
            <div className="text-center">
              <div className="text-xl font-black text-white">{displayInsights.filter(i => i.type === 'edge').length}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Edges</div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <div className="text-xl font-black text-amber-400">{displayInsights.filter(i => i.type === 'alert').length}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Alerts</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AnimatePresence mode="popLayout">
          {displayInsights.map((insight, index) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              index={index}
              expanded={expandedId === insight.id}
              onToggle={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* View All CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex justify-center pt-2"
      >
        <Link
          to="/coach"
          className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-semibold text-white/70 hover:text-white"
        >
          <Brain className="h-4 w-4" />
          Open Coach G Console
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </motion.div>
    </div>
  );
}

interface InsightCardProps {
  insight: CoachGInsight;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

function InsightCard({ insight, index, expanded, onToggle }: InsightCardProps) {
  const style = INSIGHT_STYLES[insight.type];
  const Icon = style.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="group relative"
    >
      <div 
        onClick={onToggle}
        className={`relative overflow-hidden rounded-xl border transition-all duration-300 cursor-pointer ${
          expanded 
            ? 'border-white/20 bg-white/[0.06]' 
            : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
        }`}
      >
        {/* Top gradient bar */}
        <div className={`h-1 w-full bg-gradient-to-r ${style.gradient}`} />

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${style.gradient} shadow-lg`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style.badge}`}>
                  {style.badgeText}
                </span>
              </div>
            </div>

            {/* Confidence meter */}
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-xs font-bold text-white/70">{insight.confidence}%</div>
                <div className="text-[9px] text-white/30 uppercase">Conf</div>
              </div>
              <div className="w-10 h-10 relative">
                <svg className="w-full h-full -rotate-90">
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="url(#confidence-gradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${insight.confidence} 100`}
                  />
                  <defs>
                    <linearGradient id="confidence-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#3B82F6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>

          {/* Title */}
          <h4 className="text-sm font-bold text-white mb-1.5 leading-tight">
            {insight.title}
          </h4>

          {/* Teams badge */}
          {insight.teams && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-white/40">{insight.teams.away}</span>
              <span className="text-[10px] text-white/20">@</span>
              <span className="text-xs text-white/60 font-medium">{insight.teams.home}</span>
            </div>
          )}

          {/* Expandable description */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="text-xs text-white/50 leading-relaxed mb-3">
                  {insight.description}
                </p>

                {/* Metric display */}
                {insight.metric && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/30 border border-white/5">
                    <BarChart3 className="h-4 w-4 text-white/30" />
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wider">{insight.metric.label}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{insight.metric.value}</span>
                        {insight.metric.change !== undefined && (
                          <span className={`text-xs font-semibold ${insight.metric.change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {insight.metric.change > 0 ? '+' : ''}{insight.metric.change}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-white/30">
              <Clock className="h-3 w-3" />
              <span className="text-[10px]">{insight.timestamp}</span>
            </div>
            <button className="flex items-center gap-1 text-[10px] font-semibold text-[var(--sport-accent)] hover:text-white transition-colors">
              {expanded ? 'Less' : 'Details'}
              <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default HubIntelligence;
