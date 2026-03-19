import { useState, useMemo, useEffect, useCallback } from "react";
import { useDocumentTitle } from "@/react-app/hooks/useDocumentTitle";
import { useNavigate, Link } from "react-router-dom";
import { 
  ArrowLeft, Bell, CheckCheck, Trash2, Settings,
  AlertTriangle, TrendingUp, Cloud,
  Activity, Target, ChevronRight, RefreshCw,
  Sparkles, Loader2, Calendar, Timer,
  UserX, Grid3X3, Zap, Bookmark, Clock, History
} from "lucide-react";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import type { AlertCategory, AlertSeverity } from "@/shared/types/alerts";

// =====================================================
// TYPES
// =====================================================

interface ScoutAlert {
  id: number;
  dataScope: string;
  userId: string;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body?: string;
  gameId?: string;
  teamKey?: string;
  playerKey?: string;
  sourceType?: string;
  sourceData?: Record<string, unknown>;
  deepLink?: string;
  dedupeKey: string;
  expiresAt?: string;
  readAt?: string;
  dismissedAt?: string;
  savedAt?: string;
  actionTaken?: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  isDismissed: boolean;
  isSaved: boolean;
}

interface ScoutAlertCounts {
  total: number;
  totalUnread: number;
  lineMovementUnread: number;
  injuryUnread: number;
  weatherUnread: number;
  gameStateUnread: number;
  scheduleUnread: number;
  criticalUnread: number;
  impactUnread: number;
  savedCount: number;
  todayCount: number;
}

type MainTab = "today" | "saved" | "history";

// =====================================================
// CINEMATIC BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-500/[0.02] rounded-full blur-[100px]" />
    </div>
  );
}

// =====================================================
// CATEGORY CONFIGURATION
// =====================================================

const CATEGORY_CONFIG: Record<AlertCategory, {
  icon: typeof Activity;
  color: string;
  glowColor: string;
  label: string;
}> = {
  LINE_MOVEMENT: {
    icon: TrendingUp,
    color: "text-blue-400",
    glowColor: "shadow-[0_0_20px_rgba(59,130,246,0.3)]",
    label: "Line Movement",
  },
  INJURY: {
    icon: UserX,
    color: "text-red-400",
    glowColor: "shadow-[0_0_20px_rgba(239,68,68,0.3)]",
    label: "Injury",
  },
  WEATHER: {
    icon: Cloud,
    color: "text-sky-400",
    glowColor: "shadow-[0_0_20px_rgba(56,189,248,0.3)]",
    label: "Weather",
  },
  GAME_STATE: {
    icon: Timer,
    color: "text-emerald-400",
    glowColor: "shadow-[0_0_20px_rgba(52,211,153,0.3)]",
    label: "Game State",
  },
  SCHEDULE: {
    icon: Calendar,
    color: "text-purple-400",
    glowColor: "shadow-[0_0_20px_rgba(168,85,247,0.3)]",
    label: "Schedule",
  },
};

const SEVERITY_STYLES: Record<AlertSeverity, { 
  border: string; 
  glow: string;
  pill: string;
  pillGlow: string;
}> = {
  CRITICAL: {
    border: "border-red-500/30",
    glow: "shadow-[0_0_30px_rgba(239,68,68,0.15)]",
    pill: "bg-gradient-to-r from-red-500 to-red-600 text-white",
    pillGlow: "shadow-[0_0_12px_rgba(239,68,68,0.5)]",
  },
  IMPACT: {
    border: "border-amber-500/30",
    glow: "shadow-[0_0_30px_rgba(245,158,11,0.15)]",
    pill: "bg-gradient-to-r from-amber-500 to-amber-600 text-white",
    pillGlow: "shadow-[0_0_12px_rgba(245,158,11,0.5)]",
  },
  NOTICE: {
    border: "border-blue-500/20",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.1)]",
    pill: "bg-gradient-to-r from-blue-500 to-blue-600 text-white",
    pillGlow: "shadow-[0_0_12px_rgba(59,130,246,0.4)]",
  },
  INFO: {
    border: "border-white/[0.08]",
    glow: "",
    pill: "bg-white/10 text-white/60",
    pillGlow: "",
  },
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

// =====================================================
// MAIN TAB COMPONENT
// =====================================================

interface MainTabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Activity;
  label: string;
  count?: number;
  accentColor?: string;
}

function MainTabButton({ active, onClick, icon: Icon, label, count, accentColor }: MainTabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-center gap-1.5 py-3 px-4 rounded-xl transition-all duration-300 min-w-[100px]",
        active
          ? cn(
              "bg-gradient-to-br from-white/[0.12] to-white/[0.04]",
              "border border-white/[0.15]",
              "shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
              accentColor || "shadow-[0_0_20px_rgba(59,130,246,0.2)]"
            )
          : "bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.06]"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn(
          "w-4 h-4",
          active ? "text-white" : "text-white/50"
        )} />
        <span className={cn(
          "text-sm font-bold",
          active ? "text-white" : "text-white/50"
        )}>
          {label}
        </span>
        {count !== undefined && count > 0 && (
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-black",
            active 
              ? "bg-white/20 text-white" 
              : "bg-white/[0.08] text-white/50"
          )}>
            {count}
          </span>
        )}
      </div>
    </button>
  );
}

// =====================================================
// ALERT CARD COMPONENT - CINEMATIC
// =====================================================

interface AlertCardProps {
  alert: ScoutAlert;
  onRead: () => void;
  onDismiss: () => void;
  onSave: () => void;
  onUnsave: () => void;
  onClick: () => void;
  index: number;
}

function AlertCard({ alert, onRead, onDismiss, onSave, onUnsave, onClick, index }: AlertCardProps) {
  const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.INFO;
  const category = CATEGORY_CONFIG[alert.category] || CATEGORY_CONFIG.GAME_STATE;
  const Icon = category.icon;
  const isUnread = !alert.readAt;
  const isSaved = alert.isSaved || Boolean(alert.savedAt);

  return (
    <div
      onClick={() => {
        if (isUnread) onRead();
        onClick();
      }}
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn(
        "relative flex gap-4 p-4 rounded-xl cursor-pointer transition-all duration-300 group",
        "animate-in fade-in slide-in-from-left-3",
        // Glass morphism
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
        "border backdrop-blur-xl",
        severity.border,
        severity.glow,
        // Hover effects
        "hover:-translate-y-0.5 hover:from-white/[0.12] hover:to-white/[0.04]",
        // Unread state
        isUnread && "ring-1 ring-primary/30"
      )}
    >
      {/* Unread indicator */}
      {isUnread && (
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b from-primary to-primary/50" />
      )}

      {/* Saved indicator */}
      {isSaved && (
        <div className="absolute right-3 top-3">
          <Bookmark className="w-4 h-4 text-amber-400 fill-amber-400" />
        </div>
      )}

      {/* Icon with glow */}
      <div className={cn(
        "shrink-0 w-12 h-12 rounded-xl flex items-center justify-center",
        "bg-gradient-to-br from-white/10 to-white/[0.02]",
        "border border-white/10",
        category.glowColor
      )}>
        <Icon className={cn("w-5 h-5", category.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
              severity.pill,
              severity.pillGlow
            )}>
              {alert.severity}
            </span>
            <span className="text-xs font-medium text-white/50">
              {category.label}
            </span>
          </div>
          <span className="text-xs text-white/30 shrink-0 font-medium pr-5">
            {formatTimeAgo(alert.createdAt)}
          </span>
        </div>
        
        <h4 className={cn(
          "font-semibold text-sm leading-snug mb-1.5",
          isUnread ? "text-white" : "text-white/70"
        )}>
          {alert.headline}
        </h4>
        
        {alert.body && (
          <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">
            {alert.body}
          </p>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-3 mt-3 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {alert.deepLink && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <Zap className="w-3 h-3" />
              Open
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              isSaved ? onUnsave() : onSave();
            }}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold transition-colors",
              isSaved 
                ? "text-amber-400 hover:text-amber-300" 
                : "text-white/40 hover:text-amber-400"
            )}
          >
            <Bookmark className={cn("w-3 h-3", isSaved && "fill-amber-400")} />
            {isSaved ? "Saved" : "Save"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="text-xs font-medium text-white/30 hover:text-red-400 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// EMPTY STATE - CINEMATIC
// =====================================================

function EmptyState({ tab }: { tab: MainTab }) {
  const messages: Record<MainTab, { title: string; description: string; icon: typeof Bell }> = {
    today: {
      title: "No alerts today",
      description: "Coach G will notify you about line movements, injuries, weather impacts, and game updates for items you follow.",
      icon: Clock,
    },
    saved: {
      title: "No saved alerts",
      description: "Bookmark important alerts to keep them here for quick reference. Click the bookmark icon on any alert to save it.",
      icon: Bookmark,
    },
    history: {
      title: "No alert history",
      description: "Your past alerts will appear here. Follow teams and games to start receiving notifications.",
      icon: History,
    },
  };

  const { title, description, icon: IconComponent } = messages[tab];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className={cn(
        "w-20 h-20 rounded-2xl flex items-center justify-center mb-5",
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
        "border border-white/[0.1]",
        "shadow-[0_0_40px_rgba(59,130,246,0.1)]"
      )}>
        <IconComponent className="w-9 h-9 text-white/20" />
      </div>
      <h3 className="font-bold text-lg text-white/80 mb-2">{title}</h3>
      <p className="text-white/40 text-sm max-w-sm mb-8 leading-relaxed">{description}</p>
      <Link to="/games">
        <Button className={cn(
          "gap-2 rounded-xl px-6",
          "bg-gradient-to-r from-primary to-primary/80",
          "shadow-[0_8px_24px_rgba(59,130,246,0.25)]",
          "hover:shadow-[0_12px_32px_rgba(59,130,246,0.35)]"
        )}>
          <Target className="w-4 h-4" />
          Browse Games to Follow
        </Button>
      </Link>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function AlertCenter() {
  useDocumentTitle('Alert Center');
  
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  const { isAtLeast, subscription } = useSubscription();
  const scope = isDemoMode ? "DEMO" : "PROD";
  const [mainTab, setMainTab] = useState<MainTab>("today");
  const isElite = isAtLeast('scout_elite');
  const isPro = isAtLeast('scout_pro');
  const isAnonymous = !subscription || subscription.tier === 'anonymous';
  
  // State
  const [alerts, setAlerts] = useState<ScoutAlert[]>([]);
  const [counts, setCounts] = useState<ScoutAlertCounts>({
    total: 0,
    totalUnread: 0,
    lineMovementUnread: 0,
    injuryUnread: 0,
    weatherUnread: 0,
    gameStateUnread: 0,
    scheduleUnread: 0,
    criticalUnread: 0,
    impactUnread: 0,
    savedCount: 0,
    todayCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const [alertsRes, countsRes] = await Promise.all([
        fetch(`/api/coach-alerts?scope=${scope}&limit=100`, { credentials: "include", headers }),
        fetch(`/api/coach-alerts/counts?scope=${scope}`, { credentials: "include", headers }),
      ]);

      if (!alertsRes.ok || !countsRes.ok) {
        if (alertsRes.status === 401) {
          setError("Please sign in to view alerts");
          return;
        }
        throw new Error("Failed to fetch alerts");
      }

      const alertsData = await alertsRes.json();
      const countsData = await countsRes.json();

      setAlerts(alertsData.alerts || []);
      setCounts(countsData);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
      setError("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [scope, isDemoMode]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Mark as read
  const markAsRead = useCallback(async (id: number) => {
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      await fetch(`/api/coach-alerts/${id}/read`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, readAt: new Date().toISOString(), isRead: true } : a));
      setCounts(prev => ({ ...prev, totalUnread: Math.max(0, prev.totalUnread - 1) }));
    } catch (err) {
      console.error("Failed to mark alert as read:", err);
    }
  }, [isDemoMode]);

  // Dismiss
  const dismiss = useCallback(async (id: number) => {
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const alert = alerts.find(a => a.id === id);
      await fetch(`/api/coach-alerts/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      setAlerts(prev => prev.filter(a => a.id !== id));
      setCounts(prev => ({
        ...prev,
        totalUnread: alert && !alert.readAt ? Math.max(0, prev.totalUnread - 1) : prev.totalUnread,
      }));
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
    }
  }, [alerts, isDemoMode]);

  // Save alert
  const saveAlert = useCallback(async (id: number) => {
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      await fetch(`/api/coach-alerts/${id}/save`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, savedAt: new Date().toISOString(), isSaved: true } : a));
      setCounts(prev => ({ ...prev, savedCount: prev.savedCount + 1 }));
    } catch (err) {
      console.error("Failed to save alert:", err);
    }
  }, [isDemoMode]);

  // Unsave alert
  const unsaveAlert = useCallback(async (id: number) => {
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      await fetch(`/api/coach-alerts/${id}/unsave`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, savedAt: undefined, isSaved: false } : a));
      setCounts(prev => ({ ...prev, savedCount: Math.max(0, prev.savedCount - 1) }));
    } catch (err) {
      console.error("Failed to unsave alert:", err);
    }
  }, [isDemoMode]);

  // Mark all read
  const markAllRead = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      await fetch(`/api/coach-alerts/mark-all-read?scope=${scope}`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      setAlerts(prev => prev.map(a => ({ ...a, readAt: a.readAt || new Date().toISOString(), isRead: true })));
      setCounts(prev => ({ ...prev, totalUnread: 0 }));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [scope, isDemoMode]);

  // Clear dismissed
  const clearDismissed = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      await fetch(`/api/coach-alerts/clear-dismissed?scope=${scope}`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      fetchAlerts();
    } catch (err) {
      console.error("Failed to clear dismissed:", err);
    }
  }, [scope, isDemoMode, fetchAlerts]);

  // Generate demo
  const generateDemo = useCallback(async () => {
    setGenerating(true);
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      await fetch("/api/coach-alerts/generate-demo", {
        method: "POST",
        credentials: "include",
        headers,
      });
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to generate demo alerts:", err);
    } finally {
      setGenerating(false);
    }
  }, [isDemoMode, fetchAlerts]);

  // Filter alerts based on main tab
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      switch (mainTab) {
        case "today":
          return isToday(alert.createdAt);
        case "saved":
          return alert.isSaved || Boolean(alert.savedAt);
        case "history":
          return !isToday(alert.createdAt);
        default:
          return true;
      }
    });
  }, [alerts, mainTab]);

  // Calculate tab counts
  const tabCounts = useMemo(() => {
    const todayAlerts = alerts.filter(a => isToday(a.createdAt));
    const savedAlerts = alerts.filter(a => a.isSaved || Boolean(a.savedAt));
    const historyAlerts = alerts.filter(a => !isToday(a.createdAt));
    
    return {
      today: todayAlerts.length,
      todayUnread: todayAlerts.filter(a => !a.readAt).length,
      saved: savedAlerts.length,
      history: historyAlerts.length,
    };
  }, [alerts]);

  const handleAlertClick = (alert: ScoutAlert) => {
    if (alert.deepLink) {
      navigate(alert.deepLink);
    } else if (alert.gameId) {
      navigate(`/game/${alert.gameId}`);
    }
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CinematicBackground />
        <RefreshCw className="w-8 h-8 animate-spin text-primary relative z-10" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CinematicBackground />
        <div className="text-center relative z-10">
          <div className={cn(
            "w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center",
            "bg-gradient-to-br from-red-500/20 to-red-500/5",
            "border border-red-500/20"
          )}>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-red-400 mb-4 font-medium">{error}</p>
          <Button onClick={() => navigate("/login")} className="rounded-xl">Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative -mx-4 -mt-6 px-4 pt-6 pb-24">
      <CinematicBackground />
      
      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]"
              >
                <ArrowLeft className="w-5 h-5 text-white/70" />
              </Button>
              <div>
                <h1 className="font-black text-xl text-white flex items-center gap-2">
                  Alert Center
                  {counts.totalUnread > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-gradient-to-r from-red-500 to-red-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.4)]">
                      {counts.totalUnread}
                    </span>
                  )}
                </h1>
                <p className="text-xs text-white/40 font-medium">Coach G intelligence notifications</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchAlerts}
                className="shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]"
              >
                <RefreshCw className="w-4 h-4 text-white/60" />
              </Button>
              {counts.totalUnread > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllRead}
                  className="gap-1.5 text-xs rounded-xl bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] text-white/70"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </Button>
              )}
              <Link to="/settings">
                <Button variant="ghost" size="icon" className="shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]">
                  <Settings className="w-4 h-4 text-white/60" />
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Command Center Link */}
          {!isAnonymous && (isElite || isPro) && (
            <Link 
              to="/elite/command-center"
              className={cn(
                "flex items-center justify-between p-3 rounded-xl transition-all mb-4",
                "bg-gradient-to-r from-amber-500/10 to-amber-500/5",
                "border border-amber-500/20",
                "hover:from-amber-500/15 hover:to-amber-500/10"
              )}
            >
              <div className="flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">Command Center</span>
                {!isElite && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">Elite</span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-amber-400/60" />
            </Link>
          )}
        </header>

        {/* Main Tabs - Today / Saved / History */}
        <div className="flex gap-2 mb-6">
          <MainTabButton
            active={mainTab === "today"}
            onClick={() => setMainTab("today")}
            icon={Clock}
            label="Today"
            count={tabCounts.todayUnread > 0 ? tabCounts.todayUnread : undefined}
            accentColor="shadow-[0_0_20px_rgba(59,130,246,0.2)]"
          />
          <MainTabButton
            active={mainTab === "saved"}
            onClick={() => setMainTab("saved")}
            icon={Bookmark}
            label="Saved"
            count={tabCounts.saved > 0 ? tabCounts.saved : undefined}
            accentColor="shadow-[0_0_20px_rgba(245,158,11,0.2)]"
          />
          <MainTabButton
            active={mainTab === "history"}
            onClick={() => setMainTab("history")}
            icon={History}
            label="History"
            count={tabCounts.history > 0 ? tabCounts.history : undefined}
            accentColor="shadow-[0_0_20px_rgba(168,85,247,0.2)]"
          />
        </div>

        {/* Tab Description */}
        <div className="mb-4">
          <p className="text-xs text-white/40 font-medium">
            {mainTab === "today" && "Alerts from today — stay on top of what's happening now"}
            {mainTab === "saved" && "Your bookmarked alerts — quick access to what matters most"}
            {mainTab === "history" && "Past alerts — review what you might have missed"}
          </p>
        </div>

        {/* Alerts List */}
        {filteredAlerts.length === 0 ? (
          <EmptyState tab={mainTab} />
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert, index) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                index={index}
                onRead={() => markAsRead(alert.id)}
                onDismiss={() => dismiss(alert.id)}
                onSave={() => saveAlert(alert.id)}
                onUnsave={() => unsaveAlert(alert.id)}
                onClick={() => handleAlertClick(alert)}
              />
            ))}
          </div>
        )}

        {/* Clear Dismissed Button */}
        {alerts.length > 0 && mainTab === "history" && (
          <div className="mt-8 pt-6 border-t border-white/[0.06]">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDismissed}
              className="w-full text-white/30 hover:text-red-400 hover:bg-red-500/10 gap-2 rounded-xl"
            >
              <Trash2 className="w-4 h-4" />
              Clear all old alerts
            </Button>
          </div>
        )}

        {/* Demo Mode: Generate Alerts FAB */}
        {isDemoMode && (
          <div className="fixed bottom-24 right-4 z-50">
            <Button
              onClick={generateDemo}
              disabled={generating}
              className={cn(
                "gap-2 shadow-lg rounded-full px-5",
                "bg-gradient-to-r from-primary to-primary/80",
                "shadow-[0_8px_24px_rgba(59,130,246,0.4)]"
              )}
              size="sm"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {generating ? "Generating..." : "Generate Demo Alerts"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
