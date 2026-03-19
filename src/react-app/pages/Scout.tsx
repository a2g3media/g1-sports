/**
 * Coach G Page - Premium Sports Intelligence
 * Mentor-like AI presence, calm and strategic, no hype
 */

import { useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Send, TrendingUp, Clock, Zap, ChevronRight, MessageCircle, Bell } from "lucide-react";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { cn } from "@/react-app/lib/utils";
import { useGlobalAI } from "@/react-app/components/GlobalAIProvider";

// Prompts without emojis - Coach G style
const SUGGESTED_PROMPTS = [
  { text: "What's moving tonight?" },
  { text: "Any sharp action today?" },
  { text: "Where's the public heavy?" },
  { text: "Key injuries affecting lines?" },
  { text: "Weather impact today?" },
  { text: "Line movement breakdown" },
];

// Recent insights with Coach G conviction language (no percentages)
const RECENT_INSIGHTS = [
  {
    id: 1,
    title: "Lakers vs Warriors",
    summary: "Line moved. Sharp side confirmed.",
    time: "2h ago",
    type: "preview" as const,
    sport: "NBA",
    signal: "edge" as const,
  },
  {
    id: 2,
    title: "NFL Week 15 Trends",
    summary: "Home dogs in divisional games. Market's leaning.",
    time: "5h ago",
    type: "trend" as const,
    sport: "NFL",
    signal: "watch" as const,
  },
  {
    id: 3,
    title: "Injury Impact",
    summary: "Starting QB questionable. Risk concentrated.",
    time: "6h ago",
    type: "alert" as const,
    sport: "NFL",
    signal: "edge" as const,
  },
];

// Signal indicator (replaces confidence %)
function SignalIndicator({ signal }: { signal: "edge" | "watch" | "noise" }) {
  const config = {
    edge: { color: "bg-emerald-400", label: "Clear Edge" },
    watch: { color: "bg-amber-400", label: "Watch" },
    noise: { color: "bg-white/30", label: "Noise" },
  };
  
  const { color, label } = config[signal];
  
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", color)} />
      <span className="text-[10px] text-white/40 font-medium">{label}</span>
    </div>
  );
}

// Insight card component
const InsightCard = memo(function InsightCard({
  insight,
  onClick,
}: {
  insight: typeof RECENT_INSIGHTS[0];
  onClick: () => void;
}) {
  const typeConfig = {
    preview: { 
      icon: Sparkles, 
      color: "text-primary", 
      bg: "bg-primary/10", 
      glow: "shadow-primary/10" 
    },
    trend: { 
      icon: TrendingUp, 
      color: "text-emerald-400", 
      bg: "bg-emerald-500/10", 
      glow: "shadow-emerald-500/10" 
    },
    alert: { 
      icon: Zap, 
      color: "text-amber-400", 
      bg: "bg-amber-500/10", 
      glow: "shadow-amber-500/10" 
    },
  };
  
  const { icon: Icon, color, bg, glow } = typeConfig[insight.type];
  
  return (
    <button
      onClick={onClick}
      className="group w-full text-left"
    >
      <div className={cn(
        "relative rounded-xl overflow-hidden transition-all duration-300",
        "hover:scale-[1.01]",
        "shadow-lg", glow
      )}>
        {/* Background */}
        <div className="absolute inset-0 bg-[hsl(220,18%,11%)]" />
        <div className="absolute inset-0 bg-white/[0.02]" />
        
        {/* Content */}
        <div className="relative p-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              bg
            )}>
              <Icon className={cn("h-5 w-5", color)} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-semibold text-white truncate group-hover:text-primary transition-colors">
                  {insight.title}
                </h3>
                <ChevronRight className="h-4 w-4 text-white/30 shrink-0 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-sm text-white/50 line-clamp-2">{insight.summary}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-wide">
                    {insight.sport}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-white/40">
                    <Clock className="h-3 w-3" />
                    {insight.time}
                  </div>
                </div>
                <SignalIndicator signal={insight.signal} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
});

// Quick action button
const QuickActionButton = memo(function QuickActionButton({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02]"
    >
      <div className="absolute inset-0 bg-[hsl(220,18%,11%)]" />
      <div className="absolute inset-0 bg-white/[0.02]" />
      
      <div className="relative p-4 flex flex-col items-center gap-2">
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center",
          color.includes("amber") ? "bg-amber-500/10" : "bg-primary/10"
        )}>
          <Icon className={cn("h-5 w-5", color)} />
        </div>
        <span className="text-sm font-medium text-white group-hover:text-primary transition-colors">
          {label}
        </span>
      </div>
    </button>
  );
});

export default function Scout() {
  const navigate = useNavigate();
  const { triggerAutoOpenScout } = useGlobalAI();
  const [inputValue, setInputValue] = useState("");

  const handleAsk = () => {
    if (inputValue.trim()) {
      triggerAutoOpenScout();
      setInputValue("");
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInputValue(prompt);
    triggerAutoOpenScout();
  };

  return (
    <div className="min-h-screen pb-24 -mx-4 -mt-4">
      {/* Cinematic background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,7%)] via-[hsl(220,20%,5%)] to-[hsl(220,25%,4%)]" />
        {/* Blue glow for Coach G */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 blur-[120px] rounded-full" />
      </div>
      
      <div className="relative z-10 max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center pt-8 pb-6">
          <div className="relative inline-flex items-center justify-center mb-5">
            <CoachGAvatar size="xl" presence="monitoring" />
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-2">Coach G</h1>
          <p className="text-white/50 max-w-sm mx-auto">
            Your personal sports intelligence assistant powered by real-time data
          </p>
        </div>

        {/* Ask Coach G Input */}
        <div className="relative rounded-2xl overflow-hidden mb-6">
          {/* Glass background */}
          <div className="absolute inset-0 bg-[hsl(220,18%,11%)]" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <div className="absolute inset-0 bg-white/[0.02]" />
          {/* Border glow */}
          <div className="absolute inset-0 rounded-2xl ring-1 ring-primary/20" />
          
          <div className="relative p-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <MessageCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                  placeholder="Ask Coach G..."
                  className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                />
              </div>
              <button 
                onClick={handleAsk}
                disabled={!inputValue.trim()}
                className={cn(
                  "px-5 rounded-xl font-semibold transition-all flex items-center gap-2",
                  inputValue.trim()
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90"
                    : "bg-white/10 text-white/30 cursor-not-allowed"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            
            {/* Suggested Prompts - no emojis */}
            <div className="flex flex-wrap gap-2 mt-4">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handlePromptClick(prompt.text)}
                  className="group text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                >
                  {prompt.text}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Insights */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">Recent Insights</h2>
            </div>
            <button className="text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              View all
            </button>
          </div>
          
          <div className="space-y-3">
            {RECENT_INSIGHTS.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onClick={() => triggerAutoOpenScout()}
              />
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Quick Actions</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <QuickActionButton
              icon={Bell}
              label="My Alerts"
              color="text-amber-400"
              onClick={() => navigate("/alerts")}
            />
            <QuickActionButton
              icon={Sparkles}
              label="Coach G Settings"
              color="text-primary"
              onClick={() => navigate("/settings")}
            />
          </div>
        </div>
        
        {/* Coach G hint */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/30">
            Watching the market. Speaking when it matters.
          </p>
        </div>
      </div>
    </div>
  );
}
