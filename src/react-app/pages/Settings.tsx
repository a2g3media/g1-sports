import { useState, useEffect, useCallback, useRef } from "react";
import { useDocumentTitle } from "@/react-app/hooks/useDocumentTitle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Input } from "@/react-app/components/ui/input";
import { Button } from "@/react-app/components/ui/button";
import { Switch } from "@/react-app/components/ui/switch";
import { Separator } from "@/react-app/components/ui/separator";
import { Badge } from "@/react-app/components/ui/badge";
import { useTheme } from "@/react-app/components/ThemeToggle";
import { useAdminMode } from "@/react-app/contexts/AdminModeContext";
import { AdminModeToggle } from "@/react-app/components/AdminModeToggle";
import { useAlertPreferences } from "@/react-app/hooks/useAlerts";
import type { AlertSensitivity, AlertSeverity } from "@/shared/types";
import { 
  Sun, Moon, Monitor, Palette, Check, Shield, Crown, AlertTriangle,
  Bell, Mail, Smartphone, Clock, Trophy, Users, MessageSquare, 
  Calendar, Zap, CheckCircle, Loader2, Settings as SettingsIcon, Radio, ExternalLink,
  Volume2, VolumeX, Volume1, AlertCircle, Info, MapPin, Heart, ChevronRight,
  Newspaper, Send, Sparkles
} from "lucide-react";
import { LineMovementPushSettings } from "@/react-app/components/LineMovementPushSettings";
import { ReceiptPreferences } from "@/react-app/components/ReceiptPreferences";
import { ScoutLiveWatchSettings } from "@/react-app/components/ScoutLiveWatchSettings";
import { CoachMemorySettings } from "@/react-app/components/CoachMemorySettings";
import { SubscriptionManager } from "@/react-app/components/SubscriptionManager";
import { TicketAlertPreferences } from "@/react-app/components/TicketAlertPreferences";
import { CommandCenterAlertPreferences } from "@/react-app/components/CommandCenterAlertPreferences";
import { FavoriteSportsSelector, useFavoriteSports, type SportKey, getRegionName, detectUserRegion } from "@/react-app/components/FavoriteSportsSelector";
import { NotificationPreferencesCard } from "@/react-app/components/NotificationPreferencesCard";
import { Link, useSearchParams } from "react-router-dom";
import { useOnboarding } from "@/react-app/components/OnboardingOverlay";
import { TrialCountdownCard } from "@/react-app/components/TrialBadge";
import { ReferralCard } from "@/react-app/components/ReferralCard";
import { LeaderboardPrivacyToggle } from "@/react-app/components/Leaderboard";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

import { cn } from "@/react-app/lib/utils";
import { useImpersonation } from "@/react-app/contexts/ImpersonationContext";
import { useOddsFormat, type OddsFormat } from "@/react-app/hooks/useOddsFormat";

// Cinematic Background Component
function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-black" />
      
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
      
      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />
    </div>
  );
}

type ThemeOption = "light" | "dark" | "system";

interface NotificationPreferences {
  // Delivery channels
  channelEmail: boolean;
  channelPush: boolean;
  channelSms: boolean;
  
  // Notification types
  pickReminders: boolean;
  pickReminderTiming: "1h" | "2h" | "6h" | "24h";
  deadlineAlerts: boolean;
  leagueInvites: boolean;
  leagueActivity: boolean;
  weeklyResults: boolean;
  scoreUpdates: boolean;
  memberJoins: boolean;
  chatMessages: boolean;
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  channelEmail: true,
  channelPush: false,
  channelSms: false,
  pickReminders: true,
  pickReminderTiming: "2h",
  deadlineAlerts: true,
  leagueInvites: true,
  leagueActivity: true,
  weeklyResults: true,
  scoreUpdates: false,
  memberJoins: true,
  chatMessages: false,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
};

function ThemeCard({ 
  label, 
  description, 
  icon: Icon, 
  selected, 
  onClick,
  preview
}: { 
  label: string; 
  description: string;
  icon: typeof Sun; 
  selected: boolean; 
  onClick: () => void;
  preview: "light" | "dark";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left w-full",
        "hover:border-primary/50 hover:bg-muted/50",
        "active:scale-[0.98]",
        selected 
          ? "border-primary bg-primary/5 shadow-sm" 
          : "border-border bg-background"
      )}
    >
      {selected && (
        <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      
      <div className={cn(
        "w-full h-16 rounded-lg border overflow-hidden",
        preview === "dark" 
          ? "bg-zinc-900 border-zinc-700" 
          : "bg-white border-zinc-200"
      )}>
        <div className={cn(
          "h-3 border-b flex items-center px-2 gap-1",
          preview === "dark" 
            ? "bg-zinc-800 border-zinc-700" 
            : "bg-zinc-100 border-zinc-200"
        )}>
          <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <div className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
          <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
        </div>
        <div className="p-2 flex gap-2">
          <div className={cn(
            "h-6 w-10 rounded",
            preview === "dark" ? "bg-zinc-700" : "bg-zinc-200"
          )} />
          <div className="flex-1 space-y-1">
            <div className={cn(
              "h-2 w-3/4 rounded",
              preview === "dark" ? "bg-zinc-700" : "bg-zinc-200"
            )} />
            <div className={cn(
              "h-2 w-1/2 rounded",
              preview === "dark" ? "bg-zinc-800" : "bg-zinc-100"
            )} />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center",
          selected ? "bg-primary/10" : "bg-muted"
        )}>
          <Icon className={cn(
            "h-4 w-4",
            selected ? "text-primary" : "text-muted-foreground"
          )} />
        </div>
        <div>
          <p className={cn(
            "text-sm font-medium",
            selected && "text-primary"
          )}>{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </button>
  );
}

/**
 * OddsFormatCard - Toggle between American (-110) and Decimal (1.91) odds formats
 */
function OddsFormatCard() {
  const { format, setFormat } = useOddsFormat();

  const formatOptions: { value: OddsFormat; label: string; example: string }[] = [
    { value: 'american', label: 'American', example: '-110 / +150' },
    { value: 'decimal', label: 'Decimal', example: '1.91 / 2.50' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <CardTitle>Odds Format</CardTitle>
            <CardDescription>
              Choose how betting odds are displayed
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {formatOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setFormat(option.value)}
              className={cn(
                "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                format === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              )}
            >
              {format === option.value && (
                <div className="absolute top-2 right-2">
                  <Check className="h-4 w-4 text-primary" />
                </div>
              )}
              <span className={cn(
                "text-sm font-medium",
                format === option.value && "text-primary"
              )}>
                {option.label}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {option.example}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          American odds show profit on a $100 bet. Decimal odds show total return including stake.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * FavoriteSportsCard - Settings card for managing favorite sports
 */
function FavoriteSportsCard() {
  const { favoriteSports, followedTeams, isLoading, saveFavorites } = useFavoriteSports();
  const [editing, setEditing] = useState(false);
  const [selectedSports, setSelectedSports] = useState<SportKey[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const region = detectUserRegion();

  useEffect(() => {
    setSelectedSports(favoriteSports);
  }, [favoriteSports]);

  const handleSave = async () => {
    setIsSaving(true);
    const success = await saveFavorites(selectedSports);
    if (success) {
      setEditing(false);
    }
    setIsSaving(false);
  };

  const sportNames: Record<SportKey, string> = {
    nfl: 'NFL',
    nba: 'NBA',
    mlb: 'MLB',
    nhl: 'NHL',
    ncaaf: 'College Football',
    ncaab: 'College Basketball',
    soccer: 'Soccer',
    tennis: 'Tennis',
    golf: 'Golf',
    mma: 'MMA',
    boxing: 'Boxing',
    f1: 'F1',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <Heart className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Favorite Sports
              <div className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                <MapPin className="h-3 w-3" />
                {getRegionName(region)}
              </div>
            </CardTitle>
            <CardDescription>
              Personalize your scoreboard and alerts
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : editing ? (
          <div className="space-y-4">
            <FavoriteSportsSelector
              selectedSports={selectedSports}
              onChange={setSelectedSports}
              showHeader={false}
              showRegionalHint
              compact
            />
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSelectedSports(favoriteSports);
                  setEditing(false);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                className="flex-1"
                disabled={isSaving || selectedSports.length === 0}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current selections */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Following</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {favoriteSports.length > 0 ? (
                    favoriteSports.map(sport => (
                      <Badge key={sport} variant="secondary" className="px-3 py-1">
                        {sportNames[sport] || sport.toUpperCase()}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No sports selected</p>
                  )}
                </div>
              </div>

              {followedTeams.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Teams</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {followedTeams.length} team{followedTeams.length !== 1 ? 's' : ''} followed
                  </p>
                </div>
              )}
            </div>

            <Button 
              variant="outline" 
              onClick={() => setEditing(true)}
              className="w-full justify-between"
            >
              <span>Edit Favorites</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * WeeklyRecapCard - Settings card for weekly recap email preferences
 */
function WeeklyRecapCard() {
  const { user, isDemoMode } = useDemoAuth();
  const [isOptedIn, setIsOptedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setIsLoading(false);
      return;
    }
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/weekly-recap/status");
        if (res.ok) {
          const data = await res.json();
          setIsOptedIn(data.opted_in);
        }
      } catch (err) {
        console.error("Failed to fetch weekly recap status:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, [isDemoMode, user?.id]);

  const handleToggle = async (checked: boolean) => {
    if (isDemoMode || !user?.id) {
      setIsOptedIn(checked);
      return;
    }
    setIsSaving(true);
    try {
      const endpoint = checked ? "/api/weekly-recap/subscribe" : "/api/weekly-recap/unsubscribe";
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        setIsOptedIn(checked);
      }
    } catch (err) {
      console.error("Failed to update weekly recap preference:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (isDemoMode || !user?.id) return;
    setIsSendingTest(true);
    setTestSent(false);
    try {
      const res = await fetch("/api/weekly-recap/send-test", { method: "POST" });
      if (res.ok) {
        setTestSent(true);
        setTimeout(() => setTestSent(false), 3000);
      }
    } catch (err) {
      console.error("Failed to send test email:", err);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
            <Newspaper className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <CardTitle>Weekly Recap Email</CardTitle>
            <CardDescription>
              Get a summary of your performance across all pools
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Main toggle */}
            <div className={cn(
              "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
              isOptedIn ? "border-primary bg-primary/5" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  isOptedIn ? "bg-primary/10" : "bg-muted"
                )}>
                  <Mail className={cn(
                    "h-5 w-5",
                    isOptedIn ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div>
                  <p className="font-medium">Weekly Recap</p>
                  <p className="text-sm text-muted-foreground">
                    {isOptedIn ? "You'll receive weekly summaries" : "Subscribe to weekly summaries"}
                  </p>
                </div>
              </div>
              <Switch 
                checked={isOptedIn} 
                onCheckedChange={handleToggle}
                disabled={isSaving}
              />
            </div>

            {/* Features list */}
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span>Performance stats across all your pools</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-500" />
                <span>Rank changes and standings updates</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                <span>Upcoming deadlines reminder</span>
              </div>
            </div>

            {/* Test email button */}
            {isOptedIn && (
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendTest}
                  disabled={isSendingTest}
                  className="w-full"
                >
                  {isSendingTest ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : testSent ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />
                      Test Email Sent!
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Test Email
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationToggle({
  icon: Icon,
  label,
  description,
  checked,
  onCheckedChange,
  badge,
}: {
  icon: typeof Bell;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-start gap-3">
        <div className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
          checked ? "bg-primary/10" : "bg-muted"
        )}>
          <Icon className={cn(
            "h-4 w-4",
            checked ? "text-primary" : "text-muted-foreground"
          )} />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">{label}</Label>
            {badge && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function Settings() {
  // SEO: Dynamic page title
  useDocumentTitle('Settings');
  
  const { theme, setTheme } = useTheme();
  const { user, isDemoMode } = useDemoAuth();
  const { hasAdminSubscription, isAdminMode, simulateUpgrade, resetSubscription } = useAdminMode();
  const { effectiveRole } = useImpersonation();
  const { preferences: alertPrefs, loading: alertPrefsLoading, updatePreferences: updateAlertPrefs } =
    useAlertPreferences(isDemoMode ? "DEMO" : "PROD");
  const [searchParams] = useSearchParams();
  const subscriptionRef = useRef<HTMLDivElement>(null);
  
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const { reset: resetTour } = useOnboarding();
  
  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      if (isDemoMode || !user?.id) {
        return;
      }
      try {
        const res = await fetch("/api/users/preferences");
        if (res.ok) {
          const data = await res.json();
          setPreferences(prev => ({ ...prev, ...data.notifications }));
          setDisplayName(data.displayName || "");
          setPhone(data.phone || "");
        }
      } catch (err) {
        console.error("Failed to load preferences:", err);
      }
    };
    loadPreferences();
    
    // Check push notification support
    if ("Notification" in window && "serviceWorker" in navigator) {
      setPushSupported(true);
      setPushSubscribed(Notification.permission === "granted");
    }
  }, [isDemoMode, user?.id]);
  
  // Scroll to subscription section if ?tab=subscription
  useEffect(() => {
    if (searchParams.get("tab") === "subscription" && subscriptionRef.current) {
      setTimeout(() => {
        subscriptionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [searchParams]);
  
  // Auto-save preferences with debounce
  const savePreferences = useCallback(async (newPrefs: NotificationPreferences) => {
    if (isDemoMode || !user?.id) {
      setPreferences(newPrefs);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1200);
      return;
    }
    setIsSaving(true);
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/users/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications: newPrefs }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }, [isDemoMode, user?.id]);
  
  const updatePreference = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    savePreferences(newPrefs);
  };
  
  const requestPushPermission = async () => {
    if (!pushSupported) return;
    
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        // Register with service worker
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined, // Would need VAPID key for real push
        });
        
        // Save subscription to server
        const subscriptionJson = subscription.toJSON();
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subscriptionJson.endpoint,
            keys: subscriptionJson.keys,
          }),
        });

        if (res.ok) {
          setPushSubscribed(true);
          updatePreference("channelPush", true);
          
          // Schedule deadline notifications
          if (!isDemoMode && user?.id) {
            await fetch("/api/notifications/schedule-deadlines", { method: "POST" });
          }
        }
      }
    } catch (err) {
      console.error("Push permission error:", err);
      // Still allow local notifications if subscription fails
      if (Notification.permission === "granted") {
        setPushSubscribed(true);
        updatePreference("channelPush", true);
      }
    }
  };
  
  const sendTestNotification = async () => {
    if (isDemoMode || !user?.id) return;
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = await res.json();
      
      if (res.ok && Notification.permission === "granted") {
        // Show a local notification for testing
        new Notification(data.notification.title, {
          body: data.notification.body,
          icon: data.notification.icon,
          badge: data.notification.badge,
        });
      }
    } catch (err) {
      console.error("Test notification error:", err);
    }
  };
  
  const saveProfile = async () => {
    if (isDemoMode || !user?.id) {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1200);
      return;
    }
    setIsSaving(true);
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/users/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, phone }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };
  
  const themeOptions: { 
    value: ThemeOption; 
    label: string; 
    description: string;
    icon: typeof Sun; 
    preview: "light" | "dark";
  }[] = [
    { 
      value: "light", 
      label: "Light", 
      description: "Bright and clean",
      icon: Sun,
      preview: "light"
    },
    { 
      value: "dark", 
      label: "Dark", 
      description: "Easy on the eyes",
      icon: Moon,
      preview: "dark"
    },
    { 
      value: "system", 
      label: "System", 
      description: "Match your device",
      icon: Monitor,
      preview: typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    },
  ];

  return (
    <div className="relative min-h-screen">
      <CinematicBackground />
      
      <div className="relative z-10 space-y-6 max-w-2xl pb-8">
        {/* Cinematic Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl border border-white/[0.08] p-6">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-emerald-500/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
                <SettingsIcon className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
                <p className="text-slate-400 mt-0.5">
                  Manage your account and preferences
                </p>
              </div>
            </div>
            {saveStatus !== "idle" && (
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all backdrop-blur-sm",
                saveStatus === "saving" && "bg-white/10 text-slate-300",
                saveStatus === "saved" && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
                saveStatus === "error" && "bg-red-500/20 text-red-400 border border-red-500/30"
              )}>
                {saveStatus === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saveStatus === "saved" && <CheckCircle className="h-3.5 w-3.5" />}
                {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Error"}
              </div>
            )}
          </div>
        </div>

      {/* Trial Countdown - prominent display when on trial */}
      <TrialCountdownCard />

      {/* Feature Tour */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1">
              <CardTitle>Feature Tour</CardTitle>
              <CardDescription>
                Take a guided tour of GZ Sports' key features
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={resetTour}
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Replay Feature Tour
            </span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <div ref={subscriptionRef}>
        <SubscriptionManager />
      </div>

      {/* Referral Program */}
      <ReferralCard />

      {/* Leaderboard Privacy */}
      <LeaderboardPrivacyToggle />

      {/* Scout Memory (Personalization) */}
      <CoachMemorySettings />

      {/* Favorite Sports */}
      <FavoriteSportsCard />

      {/* Smart Notification Preferences */}
      <NotificationPreferencesCard />

      {/* Ticket/Bet Alert Preferences */}
      <TicketAlertPreferences />

      {/* Command Center Alerts */}
      <CommandCenterAlertPreferences />

      {/* Weekly Recap Email */}
      <WeeklyRecapCard />

      {/* Scout Live Watch */}
      <ScoutLiveWatchSettings />

      {/* Line Movement Push Notifications */}
      <LineMovementPushSettings />

      {/* Pick Confirmation Receipts */}
      <ReceiptPreferences />

      {/* Alert Preferences Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 flex items-center justify-center">
              <Bell className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <CardTitle>Alert Preferences</CardTitle>
              <CardDescription>
                Control how and when you receive alerts about watchlisted items
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {alertPrefsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : alertPrefs ? (
            <>
              {/* Master Toggle */}
              <div className={cn(
                "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
                alertPrefs.is_enabled 
                  ? "border-primary bg-primary/5" 
                  : "border-border"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    alertPrefs.is_enabled ? "bg-primary/10" : "bg-muted"
                  )}>
                    {alertPrefs.is_enabled ? (
                      <Volume2 className="h-5 w-5 text-primary" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">Alerts Enabled</p>
                    <p className="text-sm text-muted-foreground">
                      {alertPrefs.is_enabled ? "Receiving alerts for watchlisted items" : "All alerts are paused"}
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={alertPrefs.is_enabled} 
                  onCheckedChange={(checked) => updateAlertPrefs({ is_enabled: checked })}
                />
              </div>

              {/* Sensitivity Level */}
              <div className="space-y-3">
                <Label className="text-base">Alert Sensitivity</Label>
                <p className="text-sm text-muted-foreground">
                  Control the volume and urgency of alerts you receive
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { 
                      value: "CALM" as AlertSensitivity, 
                      label: "Calm", 
                      description: "Only critical alerts",
                      icon: Volume1,
                      color: "text-emerald-600 dark:text-emerald-400",
                      bgColor: "bg-emerald-500/10"
                    },
                    { 
                      value: "STANDARD" as AlertSensitivity, 
                      label: "Standard", 
                      description: "Critical + Impact",
                      icon: Volume2,
                      color: "text-blue-600 dark:text-blue-400",
                      bgColor: "bg-blue-500/10"
                    },
                    { 
                      value: "AGGRESSIVE" as AlertSensitivity, 
                      label: "Aggressive", 
                      description: "All alerts",
                      icon: Zap,
                      color: "text-orange-600 dark:text-orange-400",
                      bgColor: "bg-orange-500/10"
                    },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => updateAlertPrefs({ sensitivity: option.value })}
                      className={cn(
                        "relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left",
                        "hover:border-primary/50 hover:bg-muted/50",
                        alertPrefs.sensitivity === option.value 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      )}
                    >
                      {alertPrefs.sensitivity === option.value && (
                        <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center",
                        alertPrefs.sensitivity === option.value ? option.bgColor : "bg-muted"
                      )}>
                        <option.icon className={cn(
                          "h-4 w-4",
                          alertPrefs.sensitivity === option.value ? option.color : "text-muted-foreground"
                        )} />
                      </div>
                      <div>
                        <p className={cn(
                          "text-sm font-medium",
                          alertPrefs.sensitivity === option.value && "text-primary"
                        )}>{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Minimum Severity */}
              <div className="space-y-3">
                <Label className="text-base">Minimum Severity</Label>
                <p className="text-sm text-muted-foreground">
                  Only receive alerts at or above this level
                </p>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: "INFO" as AlertSeverity, label: "Info", icon: Info, color: "text-slate-600 dark:text-slate-400" },
                    { value: "IMPACT" as AlertSeverity, label: "Impact", icon: AlertCircle, color: "text-amber-600" },
                    { value: "CRITICAL" as AlertSeverity, label: "Critical", icon: AlertTriangle, color: "text-red-600" },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => updateAlertPrefs({ severity_minimum: option.value })}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        alertPrefs.severity_minimum === option.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      )}
                    >
                      <option.icon className="h-4 w-4" />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Alert Channels */}
              <div className="space-y-3">
                <Label className="text-base">Delivery Channels</Label>
                <p className="text-sm text-muted-foreground">
                  Choose how you want to receive alerts
                </p>
                <div className="space-y-3">
                  <div className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                    alertPrefs.channel_in_app ? "border-primary/30 bg-primary/5" : "border-border"
                  )}>
                    <div className="flex items-center gap-3">
                      <Bell className={cn("h-4 w-4", alertPrefs.channel_in_app ? "text-primary" : "text-muted-foreground")} />
                      <div>
                        <p className="text-sm font-medium">In-App</p>
                        <p className="text-xs text-muted-foreground">Alerts in the notification bell</p>
                      </div>
                    </div>
                    <Switch 
                      checked={alertPrefs.channel_in_app} 
                      onCheckedChange={(checked) => updateAlertPrefs({ channel_in_app: checked })}
                    />
                  </div>
                  
                  <div className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                    alertPrefs.channel_push ? "border-primary/30 bg-primary/5" : "border-border"
                  )}>
                    <div className="flex items-center gap-3">
                      <Zap className={cn("h-4 w-4", alertPrefs.channel_push ? "text-primary" : "text-muted-foreground")} />
                      <div>
                        <p className="text-sm font-medium">Push Notifications</p>
                        <p className="text-xs text-muted-foreground">Browser push notifications</p>
                      </div>
                    </div>
                    <Switch 
                      checked={alertPrefs.channel_push} 
                      onCheckedChange={(checked) => updateAlertPrefs({ channel_push: checked })}
                    />
                  </div>
                  
                  <div className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                    alertPrefs.channel_email ? "border-primary/30 bg-primary/5" : "border-border"
                  )}>
                    <div className="flex items-center gap-3">
                      <Mail className={cn("h-4 w-4", alertPrefs.channel_email ? "text-primary" : "text-muted-foreground")} />
                      <div>
                        <p className="text-sm font-medium">Email</p>
                        <p className="text-xs text-muted-foreground">Alert digest via email</p>
                      </div>
                    </div>
                    <Switch 
                      checked={alertPrefs.channel_email} 
                      onCheckedChange={(checked) => updateAlertPrefs({ channel_email: checked })}
                    />
                  </div>
                  
                  <div className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all opacity-60",
                    alertPrefs.channel_sms ? "border-primary/30 bg-primary/5" : "border-border"
                  )}>
                    <div className="flex items-center gap-3">
                      <Smartphone className={cn("h-4 w-4", alertPrefs.channel_sms ? "text-primary" : "text-muted-foreground")} />
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2">
                          SMS
                          <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">Text message alerts</p>
                      </div>
                    </div>
                    <Switch 
                      checked={alertPrefs.channel_sms} 
                      onCheckedChange={(checked) => updateAlertPrefs({ channel_sms: checked })}
                      disabled
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Quiet Hours */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center",
                      alertPrefs.quiet_hours_enabled ? "bg-primary/10" : "bg-muted"
                    )}>
                      <Moon className={cn(
                        "h-4 w-4",
                        alertPrefs.quiet_hours_enabled ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <Label className="text-base">Quiet Hours</Label>
                      <p className="text-sm text-muted-foreground">
                        Pause non-critical alerts during set times
                      </p>
                    </div>
                  </div>
                  <Switch 
                    checked={alertPrefs.quiet_hours_enabled} 
                    onCheckedChange={(checked) => updateAlertPrefs({ quiet_hours_enabled: checked })}
                  />
                </div>
                
                {alertPrefs.quiet_hours_enabled && (
                  <div className="flex gap-4 ml-12">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="alertQuietStart" className="text-xs text-muted-foreground">Start</Label>
                      <Input 
                        id="alertQuietStart"
                        type="time" 
                        value={alertPrefs.quiet_hours_start}
                        onChange={(e) => updateAlertPrefs({ quiet_hours_start: e.target.value })}
                        className="w-full"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="alertQuietEnd" className="text-xs text-muted-foreground">End</Label>
                      <Input 
                        id="alertQuietEnd"
                        type="time" 
                        value={alertPrefs.quiet_hours_end}
                        onChange={(e) => updateAlertPrefs({ quiet_hours_end: e.target.value })}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Sign in to manage alert preferences</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin Mode Section */}
      <Card className={cn(
        "overflow-hidden",
        hasAdminSubscription && isAdminMode && "ring-2 ring-emerald-400 dark:ring-emerald-500"
      )}>
        <CardHeader className={cn(
          hasAdminSubscription 
            ? "bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20" 
            : ""
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center",
              hasAdminSubscription 
                ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/20" 
                : "bg-muted"
            )}>
              <Shield className={cn(
                "h-5 w-5",
                hasAdminSubscription ? "text-white" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Admin Mode
                {hasAdminSubscription && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    Pro
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                {hasAdminSubscription 
                  ? "Manage your pools with inline admin controls" 
                  : "Upgrade to unlock admin controls for your pools"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <AdminModeToggle variant="full" />
          
          <div className="p-4 rounded-xl bg-secondary/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Subscription Status</span>
              <span className={cn(
                "px-2.5 py-1 rounded-full text-xs font-semibold",
                hasAdminSubscription 
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" 
                  : "bg-muted text-muted-foreground"
              )}>
                {hasAdminSubscription ? "Active" : "Free Plan"}
              </span>
            </div>
            {hasAdminSubscription ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Crown className="w-4 h-4 text-emerald-500" />
                  <span>Pro subscription - $79.99/year</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Admin controls are available on all your pools.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Upgrade to Pro to unlock Admin Mode and manage your pools with ease.
              </p>
            )}
          </div>
          
          <div className="p-4 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Demo Controls</p>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                  For testing purposes - in production, this would connect to Stripe
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {!hasAdminSubscription ? (
                <Button 
                  onClick={simulateUpgrade}
                  size="sm"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  <Crown className="w-4 h-4 mr-1.5" />
                  Simulate Upgrade
                </Button>
              ) : (
                <Button 
                  onClick={resetSubscription}
                  size="sm"
                  variant="outline"
                  className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                >
                  Reset to Free Plan
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Channels */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
              <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Notification Channels</CardTitle>
              <CardDescription>
                Choose how you want to receive notifications
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {/* Email */}
            <div className={cn(
              "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
              preferences.channelEmail 
                ? "border-primary bg-primary/5" 
                : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  preferences.channelEmail ? "bg-primary/10" : "bg-muted"
                )}>
                  <Mail className={cn(
                    "h-5 w-5",
                    preferences.channelEmail ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div>
                  <p className="font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                </div>
              </div>
              <Switch 
                checked={preferences.channelEmail} 
                onCheckedChange={(checked) => updatePreference("channelEmail", checked)}
              />
            </div>
            
            {/* Push */}
            <div className={cn(
              "p-4 rounded-xl border-2 transition-all",
              preferences.channelPush && pushSubscribed 
                ? "border-primary bg-primary/5" 
                : "border-border"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    preferences.channelPush && pushSubscribed ? "bg-primary/10" : "bg-muted"
                  )}>
                    <Zap className={cn(
                      "h-5 w-5",
                      preferences.channelPush && pushSubscribed ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      Push Notifications
                      {!pushSupported && (
                        <Badge variant="secondary" className="text-[10px]">Not Supported</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {pushSubscribed 
                        ? "Push notifications enabled" 
                        : pushSupported 
                          ? "Enable browser push notifications" 
                          : "Your browser doesn't support push notifications"}
                    </p>
                  </div>
                </div>
                {pushSupported && !pushSubscribed ? (
                  <Button size="sm" onClick={requestPushPermission}>
                    Enable
                  </Button>
                ) : (
                  <Switch 
                    checked={preferences.channelPush && pushSubscribed} 
                    onCheckedChange={(checked) => updatePreference("channelPush", checked)}
                    disabled={!pushSupported || !pushSubscribed}
                  />
                )}
              </div>
              {pushSubscribed && preferences.channelPush && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={sendTestNotification}
                    className="text-xs"
                  >
                    <Bell className="h-3 w-3 mr-1.5" />
                    Send Test Notification
                  </Button>
                </div>
              )}
            </div>
            
            {/* SMS */}
            <div className={cn(
              "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
              preferences.channelSms 
                ? "border-primary bg-primary/5" 
                : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  preferences.channelSms ? "bg-primary/10" : "bg-muted"
                )}>
                  <Smartphone className={cn(
                    "h-5 w-5",
                    preferences.channelSms ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div>
                  <p className="font-medium">SMS</p>
                  <p className="text-sm text-muted-foreground">
                    {phone ? "Receive text messages" : "Add phone number to enable"}
                  </p>
                </div>
              </div>
              <Switch 
                checked={preferences.channelSms} 
                onCheckedChange={(checked) => updatePreference("channelSms", checked)}
                disabled={!phone}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pick & Deadline Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle>Picks & Deadlines</CardTitle>
              <CardDescription>
                Never miss a deadline with timely reminders
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <NotificationToggle
            icon={Bell}
            label="Pick Reminders"
            description="Get reminded before picks lock"
            checked={preferences.pickReminders}
            onCheckedChange={(checked) => updatePreference("pickReminders", checked)}
          />
          
          {preferences.pickReminders && (
            <div className="ml-12 mb-4">
              <Label className="text-xs text-muted-foreground mb-2 block">Remind me</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "1h", label: "1 hour" },
                  { value: "2h", label: "2 hours" },
                  { value: "6h", label: "6 hours" },
                  { value: "24h", label: "1 day" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updatePreference("pickReminderTiming", option.value as typeof preferences.pickReminderTiming)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      preferences.pickReminderTiming === option.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    )}
                  >
                    {option.label} before
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <Separator />
          
          <NotificationToggle
            icon={AlertTriangle}
            label="Deadline Alerts"
            description="Urgent notification when deadline is imminent (15 min)"
            checked={preferences.deadlineAlerts}
            onCheckedChange={(checked) => updatePreference("deadlineAlerts", checked)}
            badge="Urgent"
          />
          
          <Separator />
          
          <NotificationToggle
            icon={Trophy}
            label="Weekly Results"
            description="Get standings and results summary each week"
            checked={preferences.weeklyResults}
            onCheckedChange={(checked) => updatePreference("weeklyResults", checked)}
          />
          
          <Separator />
          
          <NotificationToggle
            icon={Zap}
            label="Live Score Updates"
            description="Real-time updates as games affect your picks"
            checked={preferences.scoreUpdates}
            onCheckedChange={(checked) => updatePreference("scoreUpdates", checked)}
            badge="High Volume"
          />
        </CardContent>
      </Card>

      {/* League Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>League Activity</CardTitle>
              <CardDescription>
                Stay connected with your pools
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <NotificationToggle
            icon={Mail}
            label="League Invites"
            description="When you're invited to join a new pool"
            checked={preferences.leagueInvites}
            onCheckedChange={(checked) => updatePreference("leagueInvites", checked)}
          />
          
          <Separator />
          
          <NotificationToggle
            icon={Users}
            label="Member Joins"
            description="When someone joins a pool you're in"
            checked={preferences.memberJoins}
            onCheckedChange={(checked) => updatePreference("memberJoins", checked)}
          />
          
          <Separator />
          
          <NotificationToggle
            icon={Calendar}
            label="League Activity"
            description="Important pool updates and announcements"
            checked={preferences.leagueActivity}
            onCheckedChange={(checked) => updatePreference("leagueActivity", checked)}
          />
          
          <Separator />
          
          <NotificationToggle
            icon={MessageSquare}
            label="Chat Messages"
            description="When someone posts in the league feed"
            checked={preferences.chatMessages}
            onCheckedChange={(checked) => updatePreference("chatMessages", checked)}
          />
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-500/20 to-zinc-500/20 flex items-center justify-center">
              <Moon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <CardTitle>Quiet Hours</CardTitle>
              <CardDescription>
                Pause non-urgent notifications during set times
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Quiet Hours</Label>
              <p className="text-sm text-muted-foreground">
                Only urgent deadline alerts will come through
              </p>
            </div>
            <Switch 
              checked={preferences.quietHoursEnabled} 
              onCheckedChange={(checked) => updatePreference("quietHoursEnabled", checked)}
            />
          </div>
          
          {preferences.quietHoursEnabled && (
            <div className="flex gap-4 mt-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="quietStart" className="text-xs text-muted-foreground">Start</Label>
                <Input 
                  id="quietStart"
                  type="time" 
                  value={preferences.quietHoursStart}
                  onChange={(e) => updatePreference("quietHoursStart", e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="quietEnd" className="text-xs text-muted-foreground">End</Label>
                <Input 
                  id="quietEnd"
                  type="time" 
                  value={preferences.quietHoursEnd}
                  onChange={(e) => updatePreference("quietHoursEnd", e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Palette className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how POOLVAULT looks on your device
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Label className="text-base">Theme</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {themeOptions.map((option) => (
                <ThemeCard
                  key={option.value}
                  {...option}
                  selected={theme === option.value}
                  onClick={() => setTheme(option.value)}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Your preference is saved automatically and persists across sessions.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Odds Format Section */}
      <OddsFormatCard />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Update your display name and contact info
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input 
              id="displayName" 
              placeholder="Your name" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This is how other players will see you
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input 
              id="phone" 
              type="tel" 
              placeholder="+1 (555) 123-4567" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Required for SMS notifications and receipt delivery
            </p>
          </div>
          <Button onClick={saveProfile} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Developer Tools - Only visible for Super Admin */}
      {effectiveRole === 'super_admin' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                <SettingsIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle>Developer Tools</CardTitle>
                <CardDescription>
                  Testing and simulation controls for demo mode
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              to="/admin/developer-tools"
              className="flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Zap className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <p className="font-medium">Admin Developer Tools</p>
                  <p className="text-sm text-muted-foreground">
                    Debug tools, logs, and advanced testing controls
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
            <Link
              to="/settings/providers"
              className="flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Radio className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <p className="font-medium">Live Score Providers</p>
                  <p className="text-sm text-muted-foreground">
                    Configure data sources for real-time game scores
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
