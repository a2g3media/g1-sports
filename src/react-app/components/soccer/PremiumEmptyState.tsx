/**
 * PremiumEmptyState - Styled empty state cards for Soccer Hub
 * 
 * Replaces plain text empty blocks with premium styled cards
 * Includes icons, messages, and action buttons
 */

import {
  Calendar,
  Trophy,
  Zap,
  Users,
  Bell,
  Brain,
} from "lucide-react";

type EmptyStateType = 
  | "no-matches"
  | "no-signals"
  | "no-standings"
  | "no-leaders"
  | "no-insights";

interface PremiumEmptyStateProps {
  type: EmptyStateType;
  competitionName?: string;
  onChangeDate?: () => void;
  onChangeCompetition?: () => void;
}

interface EmptyStateConfig {
  icon: typeof Calendar;
  iconColor: string;
  glowColor: string;
  title: string;
  subtitle: string;
  actions?: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant: "primary" | "secondary";
  }[];
}

const EMPTY_STATE_CONFIGS: Record<EmptyStateType, EmptyStateConfig> = {
  "no-matches": {
    icon: Calendar,
    iconColor: "text-white/40",
    glowColor: "bg-emerald-500/20",
    title: "No Matches Today",
    subtitle: "No fixtures scheduled for today in this competition",
    actions: [
      { label: "Change Date", variant: "secondary" },
      { label: "Switch Competition", variant: "secondary" },
      { label: "Follow Teams for Alerts", variant: "primary" },
    ],
  },
  "no-signals": {
    icon: Zap,
    iconColor: "text-amber-400/50",
    glowColor: "bg-amber-500/20",
    title: "No Market Signals Yet",
    subtitle: "Check closer to kickoff for line movements and sharp action",
    actions: [
      { label: "Set Alert", variant: "primary" },
    ],
  },
  "no-standings": {
    icon: Trophy,
    iconColor: "text-emerald-400/50",
    glowColor: "bg-emerald-500/20",
    title: "Standings Unavailable",
    subtitle: "League table data is not available for this competition",
    actions: [
      { label: "Switch Competition", variant: "secondary" },
    ],
  },
  "no-leaders": {
    icon: Users,
    iconColor: "text-cyan-400/50",
    glowColor: "bg-cyan-500/20",
    title: "No Leader Data",
    subtitle: "Top scorer and assist data not available yet",
  },
  "no-insights": {
    icon: Brain,
    iconColor: "text-cyan-400/50",
    glowColor: "bg-cyan-500/20",
    title: "Coach G Is Analyzing",
    subtitle: "Insights will appear as match data becomes available",
    actions: [
      { label: "Open Coach G Console", variant: "primary" },
    ],
  },
};

export default function PremiumEmptyState({
  type,
  onChangeDate,
  onChangeCompetition,
}: PremiumEmptyStateProps) {
  const config = EMPTY_STATE_CONFIGS[type];
  const Icon = config.icon;

  // Map action handlers
  const getActionHandler = (action: NonNullable<typeof config.actions>[number]) => {
    if (action.label === "Change Date" && onChangeDate) return onChangeDate;
    if (action.label === "Switch Competition" && onChangeCompetition) return onChangeCompetition;
    return action.onClick;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent">
      {/* Background glow */}
      <div className={`absolute top-0 right-0 w-48 h-48 ${config.glowColor} blur-3xl opacity-30`} />
      
      <div className="relative flex flex-col items-center justify-center py-10 px-6 text-center">
        {/* Icon */}
        <div className="relative mb-4">
          <div className={`absolute inset-0 ${config.glowColor} blur-2xl rounded-full`} />
          <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
            <Icon className={`h-6 w-6 ${config.iconColor}`} />
          </div>
        </div>

        {/* Text */}
        <h4 className="text-base font-bold text-white mb-1">{config.title}</h4>
        <p className="text-sm text-white/40 max-w-xs">{config.subtitle}</p>

        {/* Actions */}
        {config.actions && config.actions.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
            {config.actions.map((action, idx) => {
              const handler = getActionHandler(action);
              const baseClasses = "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all";
              
              if (action.variant === "primary") {
                return (
                  <button
                    key={idx}
                    onClick={handler}
                    className={`${baseClasses} bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30`}
                  >
                    {action.label === "Set Alert" && <Bell className="h-4 w-4" />}
                    {action.label === "Follow Teams for Alerts" && <Bell className="h-4 w-4" />}
                    {action.label === "Open Coach G Console" && <Brain className="h-4 w-4" />}
                    <span>{action.label}</span>
                  </button>
                );
              }
              
              return (
                <button
                  key={idx}
                  onClick={handler}
                  className={`${baseClasses} bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white`}
                >
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPACT EMPTY STATE (for inline use in modules)
// ============================================================================

interface CompactEmptyStateProps {
  icon: typeof Calendar;
  message: string;
  submessage?: string;
}

export function CompactEmptyState({ icon: Icon, message, submessage }: CompactEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Icon className="h-8 w-8 text-white/20 mb-3" />
      <p className="text-sm text-white/40">{message}</p>
      {submessage && (
        <p className="text-xs text-white/25 mt-1">{submessage}</p>
      )}
    </div>
  );
}
