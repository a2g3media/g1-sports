import { useEffect, useState, useCallback, createContext, useContext, ReactNode, useRef } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useNavigate } from "react-router-dom";
import { cn } from "@/react-app/lib/utils";
import { 
  Ticket, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Trophy, 
  AlertTriangle,
  Play,
  Target,
  X
} from "lucide-react";

// Alert types from backend
type AlertType = 
  | 'ticket_settled'
  | 'parlay_last_leg'
  | 'cover_flip_clutch'
  | 'game_final'
  | 'cover_flip'
  | 'major_run'
  | 'overtime'
  | 'lead_change'
  | 'game_start';

interface BannerAlert {
  id: number;
  alert_type: AlertType;
  priority: number;
  title: string;
  message: string;
  deep_link: string | null;
  ticket_id: number | null;
  event_id: string | null;
  created_at: string;
}

interface AlertBannerContextType {
  showBanner: (alert: BannerAlert) => void;
  dismissBanner: () => void;
  currentBanner: BannerAlert | null;
}

const AlertBannerContext = createContext<AlertBannerContextType | null>(null);

export function useAlertBanner() {
  const context = useContext(AlertBannerContext);
  if (!context) {
    throw new Error("useAlertBanner must be used within AlertBannerProvider");
  }
  return context;
}

// Icon and color configs by alert type
const ALERT_CONFIG: Record<AlertType, { icon: typeof Ticket; color: string; bgGlow: string }> = {
  ticket_settled: { 
    icon: Trophy, 
    color: "text-amber-400",
    bgGlow: "from-amber-500/20 via-amber-500/10 to-transparent"
  },
  parlay_last_leg: { 
    icon: Target, 
    color: "text-purple-400",
    bgGlow: "from-purple-500/20 via-purple-500/10 to-transparent"
  },
  cover_flip_clutch: { 
    icon: AlertTriangle, 
    color: "text-red-400",
    bgGlow: "from-red-500/20 via-red-500/10 to-transparent"
  },
  game_final: { 
    icon: Trophy, 
    color: "text-emerald-400",
    bgGlow: "from-emerald-500/20 via-emerald-500/10 to-transparent"
  },
  cover_flip: { 
    icon: TrendingUp, 
    color: "text-blue-400",
    bgGlow: "from-blue-500/20 via-blue-500/10 to-transparent"
  },
  major_run: { 
    icon: TrendingUp, 
    color: "text-orange-400",
    bgGlow: "from-orange-500/20 via-orange-500/10 to-transparent"
  },
  overtime: { 
    icon: Clock, 
    color: "text-yellow-400",
    bgGlow: "from-yellow-500/20 via-yellow-500/10 to-transparent"
  },
  lead_change: { 
    icon: TrendingDown, 
    color: "text-cyan-400",
    bgGlow: "from-cyan-500/20 via-cyan-500/10 to-transparent"
  },
  game_start: { 
    icon: Play, 
    color: "text-green-400",
    bgGlow: "from-green-500/20 via-green-500/10 to-transparent"
  },
};

// Single banner display component
function BannerDisplay({ 
  alert, 
  onDismiss, 
  onClick 
}: { 
  alert: BannerAlert; 
  onDismiss: () => void;
  onClick: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const config = ALERT_CONFIG[alert.alert_type] || ALERT_CONFIG.game_start;
  const Icon = config.icon;

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setIsVisible(true), 50);
    
    // Auto-dismiss after 8 seconds for non-critical, 12 for critical
    const autoDismissDelay = alert.priority === 1 ? 12000 : 8000;
    const dismissTimer = setTimeout(() => {
      handleDismiss();
    }, autoDismissDelay);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [alert.priority]);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 300);
  }, [onDismiss]);

  const handleClick = useCallback(() => {
    handleDismiss();
    onClick();
  }, [handleDismiss, onClick]);

  // Priority-based border color
  const borderColor = alert.priority === 1 
    ? "border-red-500/50" 
    : alert.priority === 2 
    ? "border-amber-500/40" 
    : "border-blue-500/30";

  return (
    <div 
      className={cn(
        "fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none",
        "pt-2 px-4"
      )}
    >
      <div
        onClick={handleClick}
        className={cn(
          "relative max-w-lg w-full pointer-events-auto cursor-pointer",
          "bg-gradient-to-b from-[hsl(220,20%,12%)] to-[hsl(220,20%,8%)]",
          "border rounded-xl shadow-2xl shadow-black/40",
          borderColor,
          "transform transition-all duration-300 ease-out",
          isVisible && !isExiting 
            ? "translate-y-0 opacity-100" 
            : "-translate-y-full opacity-0",
          "hover:scale-[1.01] hover:shadow-2xl"
        )}
      >
        {/* Glow effect */}
        <div className={cn(
          "absolute inset-0 rounded-xl bg-gradient-to-b opacity-50",
          config.bgGlow
        )} />
        
        {/* Pulse animation for critical alerts */}
        {alert.priority === 1 && (
          <div className="absolute inset-0 rounded-xl border-2 border-red-500/30 animate-pulse" />
        )}

        <div className="relative p-4 flex items-start gap-3">
          {/* Icon */}
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
            "bg-white/5 border border-white/10",
            config.color
          )}>
            <Icon className="w-5 h-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-white truncate">
                {alert.title}
              </h4>
              {alert.priority === 1 && (
                <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-red-500/20 text-red-400 rounded">
                  Critical
                </span>
              )}
            </div>
            <p className="text-xs text-white/60 mt-0.5 line-clamp-2">
              {alert.message}
            </p>
            <p className="text-[10px] text-white/40 mt-1">
              Tap to view details
            </p>
          </div>

          {/* Dismiss button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="flex-shrink-0 p-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Progress bar for auto-dismiss */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 rounded-b-xl overflow-hidden">
          <div 
            className={cn(
              "h-full",
              alert.priority === 1 ? "bg-red-500/50" : "bg-blue-500/50",
              "animate-[shrink_linear]"
            )}
            style={{
              animation: `shrink ${alert.priority === 1 ? 12 : 8}s linear forwards`
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Provider component
export function AlertBannerProvider({ children }: { children: ReactNode }) {
  const { user } = useDemoAuth();
  const navigate = useNavigate();
  const [currentBanner, setCurrentBanner] = useState<BannerAlert | null>(null);
  const [, setAlertQueue] = useState<BannerAlert[]>([]);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);
  const [seenAlertIds, setSeenAlertIds] = useState<Set<number>>(new Set());

  const showBanner = useCallback((alert: BannerAlert) => {
    // Don't show if already seen
    if (seenAlertIds.has(alert.id)) return;
    
    setSeenAlertIds(prev => new Set(prev).add(alert.id));
    
    if (currentBanner) {
      // Queue if there's already a banner showing
      setAlertQueue(prev => [...prev, alert]);
    } else {
      setCurrentBanner(alert);
    }
  }, [currentBanner, seenAlertIds]);

  const dismissBanner = useCallback(() => {
    setCurrentBanner(null);
    // Show next in queue
    setAlertQueue(prev => {
      if (prev.length > 0) {
        const [next, ...rest] = prev;
        setTimeout(() => setCurrentBanner(next), 300);
        return rest;
      }
      return prev;
    });
  }, []);

  const handleBannerClick = useCallback(() => {
    if (currentBanner?.deep_link) {
      navigate(currentBanner.deep_link);
    } else if (currentBanner?.ticket_id) {
      navigate(`/bet/${currentBanner.ticket_id}/review`);
    } else if (currentBanner?.event_id) {
      navigate(`/games/nba/${currentBanner.event_id}`);
    }
  }, [currentBanner, navigate]);

  // Poll for new critical alerts with exponential backoff on errors
  const errorCountRef = useRef(0);
  const BASE_POLL_INTERVAL = 30000; // 30 seconds
  const MAX_BACKOFF = 240000; // 4 minutes max
  
  useEffect(() => {
    if (!user?.id) return;
    
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;

    const checkForAlerts = async () => {
      try {
        const params = new URLSearchParams();
        params.set('priority', '1'); // Only critical
        params.set('limit', '5');
        if (lastCheckTime) {
          params.set('since', lastCheckTime);
        }

        const response = await fetch(`/api/ticket-alerts/unread?${params}`, {
          headers: {
            'x-user-id': user.id.toString()
          }
        });

        if (response.ok) {
          const data = await response.json();
          const alerts = data.alerts || [];
          
          // Show new alerts as banners
          for (const alert of alerts) {
            showBanner(alert);
          }

          setLastCheckTime(new Date().toISOString());
          
          // Success - reset backoff
          errorCountRef.current = 0;
        } else {
          // Non-OK response - treat as error
          errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
        }
      } catch (err) {
        console.error('[AlertBanner] Error checking alerts:', err);
        // Increment error count for backoff (max 4 = 16x multiplier)
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      
      // Schedule next poll with backoff
      if (mounted) {
        const backoffMultiplier = Math.pow(2, errorCountRef.current);
        const nextInterval = Math.min(BASE_POLL_INTERVAL * backoffMultiplier, MAX_BACKOFF);
        timeoutId = setTimeout(checkForAlerts, nextInterval);
      }
    };

    // Defer initial check to avoid network congestion on app load
    const initialDelay = setTimeout(() => checkForAlerts(), 3000);

    return () => {
      mounted = false;
      clearTimeout(initialDelay);
      clearTimeout(timeoutId);
    };
  }, [user?.id, lastCheckTime, showBanner]);

  return (
    <AlertBannerContext.Provider value={{ showBanner, dismissBanner, currentBanner }}>
      {children}
      {currentBanner && (
        <BannerDisplay 
          alert={currentBanner} 
          onDismiss={dismissBanner}
          onClick={handleBannerClick}
        />
      )}
    </AlertBannerContext.Provider>
  );
}
