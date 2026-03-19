/**
 * TicketAlertPreferences - UI for controlling bet ticket alert settings
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Switch } from "@/react-app/components/ui/switch";
import { Label } from "@/react-app/components/ui/label";
import { Input } from "@/react-app/components/ui/input";
import { Badge } from "@/react-app/components/ui/badge";
import { Separator } from "@/react-app/components/ui/separator";
import { 
  useTicketAlertPreferences, 
  ALERT_TYPE_INFO,
  type TicketAlertPreferences as TicketAlertPrefs 
} from "@/react-app/hooks/useTicketAlertPreferences";
import { 
  Bell, BellOff, Volume2, Smartphone, Zap, Moon, Check, Loader2,
  AlertTriangle, Trophy, Target
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

const PRIORITY_LABELS = {
  1: { label: 'Critical Only', description: 'Only the most urgent alerts', icon: AlertTriangle, color: 'text-red-500' },
  2: { label: 'Critical + Important', description: 'Major events and updates', icon: Target, color: 'text-amber-500' },
  3: { label: 'All Alerts', description: 'Everything including game starts', icon: Bell, color: 'text-blue-500' },
};

export function TicketAlertPreferences() {
  const {
    preferences,
    isLoading,
    isSaving,
    updatePreferences,
  } = useTicketAlertPreferences();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle>Bet Tracker Alerts</CardTitle>
              <CardDescription>Loading preferences...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const ticketAlerts = Object.entries(ALERT_TYPE_INFO).filter(([, info]) => info.category === 'ticket');
  const gameAlerts = Object.entries(ALERT_TYPE_INFO).filter(([, info]) => info.category === 'game');

  const getMuteKey = (alertType: string): keyof TicketAlertPrefs => {
    return `mute_${alertType}` as keyof TicketAlertPrefs;
  };

  const isAlertEnabled = (alertType: string): boolean => {
    const muteKey = getMuteKey(alertType);
    const isMuted = preferences[muteKey];
    const alertPriority = ALERT_TYPE_INFO[alertType]?.priority || 3;
    return !isMuted && alertPriority <= preferences.min_priority;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Bet Tracker Alerts
              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
            <CardDescription>
              Control alerts for your bet tickets and watchboards
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className={cn(
          "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
          preferences.is_enabled 
            ? "border-emerald-500/50 bg-emerald-500/5" 
            : "border-border"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              preferences.is_enabled ? "bg-emerald-500/10" : "bg-muted"
            )}>
              {preferences.is_enabled ? (
                <Volume2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <BellOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium">Bet Alerts Enabled</p>
              <p className="text-sm text-muted-foreground">
                {preferences.is_enabled ? "Receiving alerts for your tickets" : "All bet alerts are paused"}
              </p>
            </div>
          </div>
          <Switch 
            checked={preferences.is_enabled} 
            onCheckedChange={(checked) => updatePreferences({ is_enabled: checked })}
          />
        </div>

        {preferences.is_enabled && (
          <>
            {/* Priority Level */}
            <div className="space-y-3">
              <Label className="text-base">Alert Priority Level</Label>
              <p className="text-sm text-muted-foreground">
                Choose which priority alerts to receive
              </p>
              <div className="grid grid-cols-1 gap-2">
                {([3, 2, 1] as const).map((priority) => {
                  const info = PRIORITY_LABELS[priority];
                  const Icon = info.icon;
                  return (
                    <button
                      key={priority}
                      onClick={() => updatePreferences({ min_priority: priority })}
                      className={cn(
                        "relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
                        "hover:border-primary/50 hover:bg-muted/50",
                        preferences.min_priority === priority 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      )}
                    >
                      {preferences.min_priority === priority && (
                        <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center",
                        preferences.min_priority === priority ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Icon className={cn("h-4 w-4", info.color)} />
                      </div>
                      <div className="flex-1">
                        <p className={cn(
                          "text-sm font-medium",
                          preferences.min_priority === priority && "text-primary"
                        )}>{info.label}</p>
                        <p className="text-xs text-muted-foreground">{info.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Delivery Channels */}
            <div className="space-y-3">
              <Label className="text-base">Delivery Channels</Label>
              <div className="space-y-2">
                <div className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                  preferences.channel_push ? "border-primary/30 bg-primary/5" : "border-border"
                )}>
                  <div className="flex items-center gap-3">
                    <Smartphone className={cn("h-4 w-4", preferences.channel_push ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className="text-sm font-medium">Push Notifications</p>
                      <p className="text-xs text-muted-foreground">Alerts when app is closed</p>
                    </div>
                  </div>
                  <Switch 
                    checked={preferences.channel_push} 
                    onCheckedChange={(checked) => updatePreferences({ channel_push: checked })}
                  />
                </div>
                
                <div className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                  preferences.channel_banner ? "border-primary/30 bg-primary/5" : "border-border"
                )}>
                  <div className="flex items-center gap-3">
                    <Zap className={cn("h-4 w-4", preferences.channel_banner ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className="text-sm font-medium">In-App Banner</p>
                      <p className="text-xs text-muted-foreground">Slide-in alerts when using the app</p>
                    </div>
                  </div>
                  <Switch 
                    checked={preferences.channel_banner} 
                    onCheckedChange={(checked) => updatePreferences({ channel_banner: checked })}
                  />
                </div>
                
                <div className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                  preferences.channel_center ? "border-primary/30 bg-primary/5" : "border-border"
                )}>
                  <div className="flex items-center gap-3">
                    <Bell className={cn("h-4 w-4", preferences.channel_center ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className="text-sm font-medium">Notification Center</p>
                      <p className="text-xs text-muted-foreground">Log all alerts in the bell dropdown</p>
                    </div>
                  </div>
                  <Switch 
                    checked={preferences.channel_center} 
                    onCheckedChange={(checked) => updatePreferences({ channel_center: checked })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Ticket Alert Types */}
            <div className="space-y-3">
              <Label className="text-base">Ticket Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Alerts about your bet coverage and outcomes
              </p>
              <div className="space-y-2">
                {ticketAlerts.map(([alertType, info]) => {
                  const enabled = isAlertEnabled(alertType);
                  const belowPriority = info.priority > preferences.min_priority;
                  
                  return (
                    <div 
                      key={alertType}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-all",
                        belowPriority && "opacity-50",
                        enabled ? "border-primary/20 bg-primary/5" : "border-border"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{info.emoji}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{info.label}</p>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                info.priority === 1 && "border-red-500/50 text-red-500",
                                info.priority === 2 && "border-amber-500/50 text-amber-500",
                                info.priority === 3 && "border-blue-500/50 text-blue-500"
                              )}
                            >
                              P{info.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{info.description}</p>
                        </div>
                      </div>
                      <Switch 
                        checked={enabled}
                        disabled={belowPriority}
                        onCheckedChange={(checked) => {
                          const muteKey = getMuteKey(alertType);
                          updatePreferences({ [muteKey]: !checked } as Partial<TicketAlertPrefs>);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Game Alert Types */}
            <div className="space-y-3">
              <Label className="text-base">Game Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Alerts about games on your watchboard
              </p>
              <div className="space-y-2">
                {gameAlerts.map(([alertType, info]) => {
                  const enabled = isAlertEnabled(alertType);
                  const belowPriority = info.priority > preferences.min_priority;
                  
                  return (
                    <div 
                      key={alertType}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-all",
                        belowPriority && "opacity-50",
                        enabled ? "border-primary/20 bg-primary/5" : "border-border"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{info.emoji}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{info.label}</p>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                info.priority === 1 && "border-red-500/50 text-red-500",
                                info.priority === 2 && "border-amber-500/50 text-amber-500",
                                info.priority === 3 && "border-blue-500/50 text-blue-500"
                              )}
                            >
                              P{info.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{info.description}</p>
                        </div>
                      </div>
                      <Switch 
                        checked={enabled}
                        disabled={belowPriority}
                        onCheckedChange={(checked) => {
                          const muteKey = getMuteKey(alertType);
                          updatePreferences({ [muteKey]: !checked } as Partial<TicketAlertPrefs>);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Quiet Hours */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center",
                    preferences.quiet_hours_enabled ? "bg-primary/10" : "bg-muted"
                  )}>
                    <Moon className={cn(
                      "h-4 w-4",
                      preferences.quiet_hours_enabled ? "text-primary" : "text-muted-foreground"
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
                  checked={preferences.quiet_hours_enabled} 
                  onCheckedChange={(checked) => updatePreferences({ quiet_hours_enabled: checked })}
                />
              </div>
              
              {preferences.quiet_hours_enabled && (
                <div className="flex gap-4 ml-12">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="ticketQuietStart" className="text-xs text-muted-foreground">Start</Label>
                    <Input 
                      id="ticketQuietStart"
                      type="time" 
                      value={preferences.quiet_hours_start}
                      onChange={(e) => updatePreferences({ quiet_hours_start: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="ticketQuietEnd" className="text-xs text-muted-foreground">End</Label>
                    <Input 
                      id="ticketQuietEnd"
                      type="time" 
                      value={preferences.quiet_hours_end}
                      onChange={(e) => updatePreferences({ quiet_hours_end: e.target.value })}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default TicketAlertPreferences;
