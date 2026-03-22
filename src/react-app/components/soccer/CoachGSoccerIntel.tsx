/**
 * CoachGSoccerIntel - Premium Coach G section with headline-style insights
 * Transfer Watch, Injury Update, Market Shift, Tactical Edge categories
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  TrendingUp, 
  AlertTriangle, 
  Target,
  Users,
  Zap,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from "lucide-react";

type InsightType = "transfer" | "injury" | "market" | "tactical" | "edge";

interface SoccerInsight {
  id: string;
  type: InsightType;
  headline: string;
  details: string;
  confidence: number;
  timestamp: string;
  source?: string;
}

const INSIGHT_STYLES: Record<InsightType, { icon: React.ReactNode; color: string; label: string }> = {
  transfer: {
    icon: <Users className="h-4 w-4" />,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    label: "Transfer Watch",
  },
  injury: {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    label: "Injury Update",
  },
  market: {
    icon: <TrendingUp className="h-4 w-4" />,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    label: "Market Shift",
  },
  tactical: {
    icon: <Target className="h-4 w-4" />,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    label: "Tactical Edge",
  },
  edge: {
    icon: <Zap className="h-4 w-4" />,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    label: "AI Edge",
  },
};

// Demo insights - in production these would come from API
const DEMO_INSIGHTS: SoccerInsight[] = [
  {
    id: "1",
    type: "transfer",
    headline: "Mbappé extension talks stall at Real Madrid",
    details: "Sources indicate contract negotiations have hit a roadblock over image rights. This could impact squad dynamics for UCL knockout rounds.",
    confidence: 78,
    timestamp: "2h ago",
    source: "Transfer Intel",
  },
  {
    id: "2",
    type: "injury",
    headline: "Haaland questionable for Manchester derby",
    details: "Erling Haaland missed training Thursday with minor knee discomfort. City medical staff evaluating day-to-day. Monitor closely before kickoff.",
    confidence: 65,
    timestamp: "4h ago",
    source: "Injury Report",
  },
  {
    id: "3",
    type: "market",
    headline: "Sharp money moving on Arsenal -1 vs Chelsea",
    details: "Line movement from -0.5 to -1 despite 68% public backing Chelsea. Professional action detected at multiple offshore books.",
    confidence: 82,
    timestamp: "1h ago",
  },
  {
    id: "4",
    type: "tactical",
    headline: "Liverpool's high press struggles vs low blocks",
    details: "Slot's 4-2-3-1 averaging just 1.2 xG against teams sitting deep. Consider unders in matches vs relegation-threatened sides.",
    confidence: 71,
    timestamp: "6h ago",
  },
  {
    id: "5",
    type: "edge",
    headline: "Barcelona corners value play detected",
    details: "Barça averaging 7.3 corners/game but o5.5 corners priced at -110. Historical data suggests 73% hit rate in home matches.",
    confidence: 85,
    timestamp: "30m ago",
  },
];

function InsightCard({ insight }: { insight: SoccerInsight }) {
  const [expanded, setExpanded] = useState(false);
  const style = INSIGHT_STYLES[insight.type];

  return (
    <div 
      className={`
        border rounded-lg overflow-hidden transition-all duration-200
        bg-zinc-900/50 border-zinc-800/50 hover:border-zinc-700/50
      `}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        {/* Type Badge */}
        <div className={`flex-shrink-0 p-2 rounded-lg border ${style.color}`}>
          {style.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Type Label + Time */}
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium ${style.color.split(' ')[0]}`}>
              {style.label}
            </span>
            <span className="text-xs text-zinc-600">•</span>
            <span className="text-xs text-zinc-500">{insight.timestamp}</span>
          </div>

          {/* Headline */}
          <h4 className="text-sm font-semibold text-white leading-snug">
            {insight.headline}
          </h4>

          {/* Confidence Bar */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden max-w-[100px]">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                style={{ width: `${insight.confidence}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500">{insight.confidence}% conf</span>
          </div>
        </div>

        {/* Expand Icon */}
        <div className="flex-shrink-0 text-zinc-500">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-zinc-800/50">
          <p className="text-sm text-zinc-400 leading-relaxed mt-3">
            {insight.details}
          </p>
          {insight.source && (
            <div className="flex items-center gap-1 mt-3 text-xs text-zinc-500">
              <ExternalLink className="h-3 w-3" />
              <span>Source: {insight.source}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CoachGSoccerIntel() {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link to="/scout" aria-label="Open Coach G">
          <img 
            src="/assets/coachg/coach-g-avatar.png"
            alt="Coach G"
            className="w-10 h-10 rounded-full border-2 border-cyan-500/30 transition-transform hover:scale-105"
          />
        </Link>
        <div>
          <h3 className="text-sm font-semibold text-white">Coach G</h3>
          <p className="text-xs text-zinc-500">Live Soccer Intelligence</p>
        </div>
        <div className="ml-auto flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs text-emerald-400 font-medium">LIVE</span>
        </div>
      </div>

      {/* Insights List */}
      <div className="space-y-2">
        {DEMO_INSIGHTS.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}

export default CoachGSoccerIntel;
