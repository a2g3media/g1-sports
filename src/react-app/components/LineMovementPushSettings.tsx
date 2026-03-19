import { useState } from "react";
import { usePushNotifications } from "@/react-app/hooks/usePushNotifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { Separator } from "@/react-app/components/ui/separator";
import { cn } from "@/react-app/lib/utils";
import { 
  Bell, 
  BellOff, 
  BellRing, 
  Check, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Loader2,
  Volume2,
  VolumeX,
  Smartphone,
  ExternalLink,
  Info
} from "lucide-react";

interface LineMovementPrefs {
  enabled: boolean;
  spreadAlerts: boolean;
  totalAlerts: boolean;
  moneylineAlerts: boolean;
  criticalOnly: boolean;
  minimumMovement: number; // points for spread/total, odds for ML
}

const DEFAULT_PREFS: LineMovementPrefs = {
  enabled: true,
  spreadAlerts: true,
  totalAlerts: true,
  moneylineAlerts: false,
  criticalOnly: false,
  minimumMovement: 0.5,
};

export function LineMovementPushSettings() {
  const {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    sendTestNotification,
  } = usePushNotifications();

  const [prefs, setPrefs] = useState<LineMovementPrefs>(DEFAULT_PREFS);
  const [testSending, setTestSending] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const handleEnablePush = async () => {
    const success = await subscribe();
    if (success) {
      setPrefs(prev => ({ ...prev, enabled: true }));
    }
  };

  const handleSendTest = async () => {
    setTestSending(true);
    setTestSent(false);
    const success = await sendTestNotification("line_movement");
    setTestSending(false);
    if (success) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  const updatePref = <K extends keyof LineMovementPrefs>(
    key: K,
    value: LineMovementPrefs[K]
  ) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  // Not supported
  if (!isSupported) {
    return (
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <BellOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-amber-800 dark:text-amber-200">
                Push Notifications Unavailable
              </CardTitle>
              <CardDescription className="text-amber-700 dark:text-amber-300">
                Your browser doesn't support push notifications
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Try using Chrome, Firefox, or Edge on desktop or mobile for push notification support.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Permission denied
  if (permission === "denied") {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-red-800 dark:text-red-200">
                Notifications Blocked
              </CardTitle>
              <CardDescription className="text-red-700 dark:text-red-300">
                You've blocked notifications for this site
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-700 dark:text-red-300">
            To enable line movement alerts, you'll need to update your browser settings:
          </p>
          <ol className="text-sm text-red-700 dark:text-red-300 list-decimal list-inside space-y-1">
            <li>Click the lock/info icon in your browser's address bar</li>
            <li>Find "Notifications" in the site settings</li>
            <li>Change from "Block" to "Allow"</li>
            <li>Refresh this page</li>
          </ol>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center",
            isSubscribed && prefs.enabled
              ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/20"
              : "bg-muted"
          )}>
            {isSubscribed && prefs.enabled ? (
              <BellRing className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Bell className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Line Movement Alerts
              {isSubscribed && prefs.enabled && (
                <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-0">
                  Active
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Get notified instantly when odds move on your watchlist
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Push */}
        {!isSubscribed ? (
          <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/20">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Smartphone className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h4 className="font-semibold">Enable Push Notifications</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Receive instant alerts when lines move on games you're watching. 
                    Never miss a sharp move or value opportunity.
                  </p>
                </div>
                <Button 
                  onClick={handleEnablePush} 
                  disabled={isLoading}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enabling...
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4 mr-2" />
                      Enable Notifications
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Master Toggle */}
            <div className={cn(
              "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
              prefs.enabled 
                ? "border-emerald-400/50 bg-emerald-50/50 dark:bg-emerald-900/10" 
                : "border-border bg-muted/50"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  prefs.enabled ? "bg-emerald-500/20" : "bg-muted"
                )}>
                  {prefs.enabled ? (
                    <Volume2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <VolumeX className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium">
                    {prefs.enabled ? "Notifications Active" : "Notifications Paused"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {prefs.enabled 
                      ? "You'll receive alerts for line movements" 
                      : "Line movement alerts are currently disabled"}
                  </p>
                </div>
              </div>
              <Switch 
                checked={prefs.enabled} 
                onCheckedChange={(checked) => updatePref("enabled", checked)}
              />
            </div>

            {prefs.enabled && (
              <>
                <Separator />

                {/* Alert Types */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Alert Types</h4>
                  <div className="grid gap-3">
                    <AlertTypeToggle
                      icon={TrendingUp}
                      label="Spread Movement"
                      description="When point spreads move (e.g., -3.5 → -4.5)"
                      checked={prefs.spreadAlerts}
                      onChange={(v) => updatePref("spreadAlerts", v)}
                    />
                    <AlertTypeToggle
                      icon={Activity}
                      label="Total Movement"
                      description="When over/under totals change"
                      checked={prefs.totalAlerts}
                      onChange={(v) => updatePref("totalAlerts", v)}
                    />
                    <AlertTypeToggle
                      icon={TrendingDown}
                      label="Moneyline Movement"
                      description="When moneyline odds shift significantly"
                      checked={prefs.moneylineAlerts}
                      onChange={(v) => updatePref("moneylineAlerts", v)}
                      badge="High Volume"
                    />
                  </div>
                </div>

                <Separator />

                {/* Sensitivity */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Alert Sensitivity</h4>
                  <div className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                    prefs.criticalOnly 
                      ? "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10" 
                      : "border-border"
                  )}>
                    <div className="flex items-center gap-3">
                      <AlertTriangle className={cn(
                        "h-4 w-4",
                        prefs.criticalOnly ? "text-orange-600" : "text-muted-foreground"
                      )} />
                      <div>
                        <p className="text-sm font-medium">Critical Moves Only</p>
                        <p className="text-xs text-muted-foreground">
                          Only notify for significant line moves (1+ points)
                        </p>
                      </div>
                    </div>
                    <Switch 
                      checked={prefs.criticalOnly} 
                      onCheckedChange={(v) => updatePref("criticalOnly", v)}
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-muted/50 flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Alerts are only sent for games on your watchlist. 
                      <a href="/watchlist" className="text-primary hover:underline ml-1 inline-flex items-center gap-0.5">
                        Manage watchlist <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Test Notification */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Test Notification</p>
                    <p className="text-xs text-muted-foreground">
                      Send a sample line movement alert
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSendTest}
                    disabled={testSending}
                    className={cn(
                      testSent && "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
                    )}
                  >
                    {testSending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Sending...
                      </>
                    ) : testSent ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Sent!
                      </>
                    ) : (
                      <>
                        <Bell className="h-3.5 w-3.5 mr-1.5" />
                        Send Test
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AlertTypeToggle({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
  badge,
}: {
  icon: typeof TrendingUp;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  badge?: string;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-xl border transition-all",
      checked ? "border-primary/30 bg-primary/5" : "border-border"
    )}>
      <div className="flex items-center gap-3">
        <Icon className={cn(
          "h-4 w-4",
          checked ? "text-primary" : "text-muted-foreground"
        )} />
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{label}</p>
            {badge && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
