import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Bell, 
  Check, 
  CheckCheck, 
  X, 
  Trophy, 
  Users, 
  Calendar, 
  CreditCard,
  MessageSquare,
  AlertCircle,
  Sparkles,
  Target,
  TrendingUp,
  AlertTriangle,
  Activity,
  Clock,
  ChevronRight,
  Ticket,
  ArrowUpDown,
  Play,
  Flag,
  Zap
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/react-app/components/ui/popover";
import { ScrollArea } from "@/react-app/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/react-app/components/ui/tabs";
import { cn } from "@/react-app/lib/utils";
import { useAlertCounts, type Alert } from "@/react-app/hooks/useAlerts";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
let unifiedNotificationsAuthBlocked = false;

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// Notification type config
const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  league_invite: Users,
  pick_reminder: Calendar,
  deadline_alert: AlertCircle,
  results: Trophy,
  payment: CreditCard,
  chat_mention: MessageSquare,
  achievement: Sparkles,
  pick_scored: Target,
  line_movement: TrendingUp,
  default: Bell,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  league_invite: "text-blue-500",
  pick_reminder: "text-amber-500",
  deadline_alert: "text-red-500",
  results: "text-emerald-500",
  payment: "text-green-500",
  chat_mention: "text-purple-500",
  achievement: "text-yellow-500",
  pick_scored: "text-cyan-500",
  line_movement: "text-orange-500",
  default: "text-muted-foreground",
};

// Alert type config
const ALERT_ICONS: Record<string, typeof Bell> = {
  line_movement: TrendingUp,
  deadline: Clock,
  game_start: Activity,
  score_update: Trophy,
  injury: AlertTriangle,
  default: AlertCircle,
};

const ALERT_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-blue-500",
};

// Ticket alert config
interface TicketAlert {
  id: number;
  alert_type: string;
  priority: number;
  title: string;
  message: string | null;
  deep_link: string | null;
  ticket_id: number | null;
  event_id: string | null;
  is_read: number;
  created_at: string;
}

const TICKET_ALERT_ICONS: Record<string, typeof Bell> = {
  ticket_settled: Flag,
  parlay_last_leg: Zap,
  cover_flip_clutch: ArrowUpDown,
  cover_flip: ArrowUpDown,
  game_final: Flag,
  game_start: Play,
  lead_change: TrendingUp,
  overtime: Activity,
  buzzer_beater: Sparkles,
  major_run: TrendingUp,
  default: Ticket,
};

const PRIORITY_COLORS: Record<number, string> = {
  1: "text-red-500",
  2: "text-orange-500",
  3: "text-blue-500",
};

const PRIORITY_BG: Record<number, string> = {
  1: "bg-red-500/10",
  2: "bg-orange-500/10",
  3: "bg-blue-500/10",
};

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

export function UnifiedNotificationCenter() {
  const navigate = useNavigate();
  const { isDemoMode, user } = useDemoAuth();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "alerts" | "bets">("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [ticketAlerts, setTicketAlerts] = useState<TicketAlert[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadTicketCount, setUnreadTicketCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const scope = isDemoMode || !user?.id ? "DEMO" : "PROD";
  const { counts } = useAlertCounts(scope);
  const alertUnreadCount = counts.total_unread;
  const hasCritical = counts.critical_unread > 0 || ticketAlerts.some(a => a.priority === 1 && !a.is_read);

  // Total unread combines all three
  const totalUnread = unreadNotifCount + alertUnreadCount + unreadTicketCount;

  const fetchNotifications = useCallback(async () => {
    if (isDemoMode || !user?.id) return;
    if (unifiedNotificationsAuthBlocked) return;
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?limit=20", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadNotifCount(data.unread_count || 0);
      } else if (res.status === 401 || res.status === 403) {
        unifiedNotificationsAuthBlocked = true;
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, user?.id]);

  const fetchAlerts = useCallback(async () => {
    if (isDemoMode || !user?.id) return;
    try {
      const res = await fetch(`/api/alerts/events?scope=${scope}&limit=10`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    }
  }, [isDemoMode, scope, user?.id]);

  const fetchTicketAlerts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/ticket-alerts/unread", {
        credentials: "include",
        headers: { "x-user-id": user.id.toString() },
      });
      if (res.ok) {
        const data = await res.json();
        setTicketAlerts(data.alerts || []);
        setUnreadTicketCount(data.alerts?.length || 0);
      }
    } catch (error) {
      console.error("Failed to fetch ticket alerts:", error);
    }
  }, [user?.id]);

  // Stagger initial fetches to avoid network congestion on app load
  useEffect(() => {
    // Defer initial fetch to not block app load - stagger requests
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    
    timeouts.push(setTimeout(() => fetchNotifications(), 1500));
    timeouts.push(setTimeout(() => fetchAlerts(), 2000));
    timeouts.push(setTimeout(() => fetchTicketAlerts(), 2500));
    
    const interval = setInterval(() => {
      fetchNotifications();
      setTimeout(() => fetchAlerts(), 200);
      setTimeout(() => fetchTicketAlerts(), 400);
    }, 60000);
    
    return () => {
      timeouts.forEach(t => clearTimeout(t));
      clearInterval(interval);
    };
  }, [fetchNotifications, fetchAlerts, fetchTicketAlerts]);

  useEffect(() => {
    if (open) {
      fetchNotifications();
      fetchAlerts();
      fetchTicketAlerts();
    }
  }, [open, fetchNotifications, fetchAlerts, fetchTicketAlerts]);

  const markNotifAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllNotifsAsRead = async () => {
    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
      
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadNotifCount(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const deleteNotification = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      const notification = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (notification && !notification.is_read) {
        setUnreadNotifCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markNotifAsRead(notification.id);
    }
    
    if (notification.url) {
      setOpen(false);
      navigate(notification.url);
    }
  };

  const handleAlertClick = (alert: Alert) => {
    setOpen(false);
    // Navigate to alert center with this alert selected
    navigate(`/alerts?id=${alert.id}`);
  };

  const handleTicketAlertClick = async (alert: TicketAlert) => {
    // Mark as read
    if (!alert.is_read && user?.id) {
      try {
        await fetch("/api/ticket-alerts/read", {
          method: "POST",
          credentials: "include",
          headers: { 
            "Content-Type": "application/json",
            "x-user-id": user.id.toString() 
          },
          body: JSON.stringify({ alert_ids: [alert.id] }),
        });
        setTicketAlerts(prev => prev.map(a => 
          a.id === alert.id ? { ...a, is_read: 1 } : a
        ));
        setUnreadTicketCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Failed to mark ticket alert as read:", error);
      }
    }
    
    setOpen(false);
    // Navigate to deep link or watchboard
    if (alert.deep_link) {
      navigate(alert.deep_link);
    } else if (alert.ticket_id) {
      navigate(`/watchboard?ticket=${alert.ticket_id}`);
    }
  };

  const markAllTicketAlertsRead = async () => {
    if (!user?.id || ticketAlerts.length === 0) return;
    try {
      const alertIds = ticketAlerts.filter(a => !a.is_read).map(a => a.id);
      if (alertIds.length === 0) return;
      
      await fetch("/api/ticket-alerts/read", {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": user.id.toString() 
        },
        body: JSON.stringify({ alert_ids: alertIds }),
      });
      setTicketAlerts(prev => prev.map(a => ({ ...a, is_read: 1 })));
      setUnreadTicketCount(0);
    } catch (error) {
      console.error("Failed to mark all ticket alerts as read:", error);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full hover:bg-muted/50"
        >
          <Bell className={cn(
            "h-4.5 w-4.5 transition-colors",
            hasCritical && "text-red-500"
          )} />
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center">
              <span className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                hasCritical ? "bg-red-500/40" : "bg-primary/40"
              )} />
              <span className={cn(
                "relative inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white",
                hasCritical ? "bg-red-500" : "bg-primary"
              )}>
                {totalUnread > 9 ? "9+" : totalUnread}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        className="w-96 p-0"
        sideOffset={8}
      >
        {/* Header with Tabs */}
        <div className="border-b">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "alerts")}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs px-3 h-7">
                  All
                  {unreadNotifCount > 0 && (
                    <span className="ml-1.5 h-4 w-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center">
                      {unreadNotifCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="alerts" className="text-xs px-3 h-7">
                  Alerts
                  {alertUnreadCount > 0 && (
                    <span className={cn(
                      "ml-1.5 h-4 w-4 rounded-full text-[10px] flex items-center justify-center",
                      hasCritical ? "bg-red-500/20 text-red-500" : "bg-amber-500/20 text-amber-600"
                    )}>
                      {alertUnreadCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="bets" className="text-xs px-3 h-7">
                  Bets
                  {unreadTicketCount > 0 && (
                    <span className={cn(
                      "ml-1.5 h-4 w-4 rounded-full text-[10px] flex items-center justify-center",
                      ticketAlerts.some(a => a.priority === 1 && !a.is_read) 
                        ? "bg-red-500/20 text-red-500" 
                        : "bg-emerald-500/20 text-emerald-600"
                    )}>
                      {unreadTicketCount}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              
              {activeTab === "all" && unreadNotifCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={markAllNotifsAsRead}
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Mark all read
                </Button>
              )}
              {activeTab === "bets" && unreadTicketCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={markAllTicketAlertsRead}
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Mark all read
                </Button>
              )}
            </div>

            <TabsContent value="all" className="m-0">
              <ScrollArea className="max-h-[350px]">
                {loading && notifications.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Bell className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      No notifications yet
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      We'll notify you about important updates
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {notifications.map((notification) => {
                      const Icon = NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS.default;
                      const iconColor = NOTIFICATION_COLORS[notification.type] || NOTIFICATION_COLORS.default;
                      
                      return (
                        <div
                          key={notification.id}
                          onClick={() => handleNotificationClick(notification)}
                          className={cn(
                            "relative flex gap-3 px-4 py-3 transition-colors cursor-pointer group",
                            notification.is_read 
                              ? "bg-background hover:bg-muted/50" 
                              : "bg-primary/5 hover:bg-primary/10"
                          )}
                        >
                          {!notification.is_read && (
                            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
                          )}
                          
                          <div className={cn(
                            "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
                            notification.is_read ? "bg-muted" : "bg-primary/10"
                          )}>
                            <Icon className={cn("h-4 w-4", iconColor)} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm leading-tight",
                              !notification.is_read && "font-medium"
                            )}>
                              {notification.title}
                            </p>
                            {notification.body && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {notification.body}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              {formatTimeAgo(notification.created_at)}
                            </p>
                          </div>
                          
                          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.is_read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markNotifAsRead(notification.id);
                                }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={(e) => deleteNotification(notification.id, e)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="alerts" className="m-0">
              <ScrollArea className="max-h-[350px]">
                {alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <AlertCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      No active alerts
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      You'll see watchlist and deadline alerts here
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {alerts.slice(0, 10).map((alert) => {
                      const Icon = ALERT_ICONS[alert.item_type?.toLowerCase() || "default"] || ALERT_ICONS.default;
                      const priorityColor = ALERT_COLORS[alert.severity?.toLowerCase() || "medium"] || "text-muted-foreground";
                      
                      return (
                        <div
                          key={alert.id}
                          onClick={() => handleAlertClick(alert)}
                          className={cn(
                            "relative flex gap-3 px-4 py-3 transition-colors cursor-pointer group",
                            alert.is_read 
                              ? "bg-background hover:bg-muted/50" 
                              : "bg-amber-500/5 hover:bg-amber-500/10"
                          )}
                        >
                          {!alert.is_read && (
                            <div className={cn(
                              "absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full",
                              alert.severity === "CRITICAL" ? "bg-red-500" : "bg-amber-500"
                            )} />
                          )}
                          
                          <div className={cn(
                            "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
                            alert.severity === "CRITICAL" ? "bg-red-500/10" : "bg-amber-500/10"
                          )}>
                            <Icon className={cn("h-4 w-4", priorityColor)} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={cn(
                                "text-sm leading-tight",
                                !alert.is_read && "font-medium"
                              )}>
                                {alert.headline}
                              </p>
                              {alert.severity === "CRITICAL" && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-500/20 text-red-500">
                                  Critical
                                </span>
                              )}
                            </div>
                            {alert.body && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {alert.body}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              {formatTimeAgo(alert.created_at || new Date().toISOString())}
                            </p>
                          </div>
                          
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
              
              {alerts.length > 0 && (
                <div className="border-t px-4 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      setOpen(false);
                      navigate("/alerts");
                    }}
                  >
                    View all alerts
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="bets" className="m-0">
              <ScrollArea className="max-h-[350px]">
                {ticketAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Ticket className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      No bet alerts
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Upload a bet slip to track coverage
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {ticketAlerts.slice(0, 15).map((alert) => {
                      const Icon = TICKET_ALERT_ICONS[alert.alert_type] || TICKET_ALERT_ICONS.default;
                      const priorityColor = PRIORITY_COLORS[alert.priority] || "text-muted-foreground";
                      const priorityBg = PRIORITY_BG[alert.priority] || "bg-muted";
                      
                      return (
                        <div
                          key={alert.id}
                          onClick={() => handleTicketAlertClick(alert)}
                          className={cn(
                            "relative flex gap-3 px-4 py-3 transition-colors cursor-pointer group",
                            alert.is_read 
                              ? "bg-background hover:bg-muted/50" 
                              : alert.priority === 1 
                                ? "bg-red-500/5 hover:bg-red-500/10"
                                : "bg-emerald-500/5 hover:bg-emerald-500/10"
                          )}
                        >
                          {!alert.is_read && (
                            <div className={cn(
                              "absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full",
                              alert.priority === 1 ? "bg-red-500" : "bg-emerald-500"
                            )} />
                          )}
                          
                          <div className={cn(
                            "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
                            priorityBg
                          )}>
                            <Icon className={cn("h-4 w-4", priorityColor)} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={cn(
                                "text-sm leading-tight",
                                !alert.is_read && "font-medium"
                              )}>
                                {alert.title}
                              </p>
                              {alert.priority === 1 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-500/20 text-red-500">
                                  Critical
                                </span>
                              )}
                            </div>
                            {alert.message && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {alert.message}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              {formatTimeAgo(alert.created_at)}
                            </p>
                          </div>
                          
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
              
              {ticketAlerts.length > 0 && (
                <div className="border-t px-4 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      setOpen(false);
                      navigate("/watchboard");
                    }}
                  >
                    View watchboard
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        {activeTab === "all" && notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setOpen(false);
                navigate("/settings");
              }}
            >
              Notification settings
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
