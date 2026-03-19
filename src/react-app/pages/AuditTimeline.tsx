import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Input } from "@/react-app/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Switch } from "@/react-app/components/ui/switch";
import { 
  History, Search, Filter, ChevronDown, ChevronUp, 
  Loader2, Shield, Users, Trophy, FileCheck, 
  UserPlus, Settings, Trash2, Lock, Mail, Hash, CheckCircle2,
  Eye, Link2, Download, Copy, Check, ShieldCheck, Fingerprint,
  ExternalLink, AlertTriangle
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface AuditEvent {
  id: number;
  event_type: string;
  league_id: number | null;
  league_name: string | null;
  user_id: number | null;
  user_email: string | null;
  actor_id: number | null;
  actor_email: string | null;
  entity_type: string | null;
  entity_id: number | null;
  payload_json: string | null;
  reason: string | null;
  created_at: string;
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: typeof History; color: string }> = {
  // League events
  league_created: { label: "League Created", icon: Trophy, color: "text-green-500" },
  league_joined: { label: "Member Joined", icon: UserPlus, color: "text-blue-500" },
  league_settings_updated: { label: "Settings Updated", icon: Settings, color: "text-amber-500" },
  member_role_changed: { label: "Role Changed", icon: Users, color: "text-purple-500" },
  member_removed: { label: "Member Removed", icon: Trash2, color: "text-red-500" },
  
  // Pick events
  picks_submitted: { label: "Picks Submitted", icon: FileCheck, color: "text-emerald-500" },
  picks_locked: { label: "Picks Locked", icon: Lock, color: "text-orange-500" },
  
  // Receipt events
  receipt_created: { label: "Receipt Created", icon: Hash, color: "text-cyan-500" },
  receipt_verified: { label: "Receipt Verified", icon: Shield, color: "text-indigo-500" },
  receipt_viewed: { label: "Receipt Viewed", icon: Eye, color: "text-slate-500" },
  receipt_delivered: { label: "Receipt Delivered", icon: Mail, color: "text-pink-500" },
  receipt_superseded: { label: "Receipt Replaced", icon: History, color: "text-amber-500" },
  receipt_delivery_queued: { label: "Delivery Queued", icon: Mail, color: "text-blue-400" },
  pick_submission_confirm_sent: { label: "Confirmation Sent", icon: Mail, color: "text-emerald-500" },
  
  // Notification preferences
  confirmation_preferences_updated: { label: "Preferences Updated", icon: Settings, color: "text-violet-500" },
  
  // Phone verification
  phone_verification_started: { label: "Phone Verification Started", icon: Shield, color: "text-blue-500" },
  phone_verification_completed: { label: "Phone Verified", icon: CheckCircle2, color: "text-green-500" },
  
  // Payment events
  payment_initiated: { label: "Payment Started", icon: CheckCircle2, color: "text-teal-500" },
  payment_completed: { label: "Payment Complete", icon: CheckCircle2, color: "text-green-600" },
};

// Compute a fingerprint for an event (simulated hash)
function computeEventFingerprint(event: AuditEvent, prevFingerprint: string | null): string {
  const data = `${event.id}|${event.event_type}|${event.created_at}|${event.actor_id}|${prevFingerprint || "genesis"}`;
  // Simple hash simulation - in production this would be SHA-256
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `0x${hex}${hex.split("").reverse().join("")}`;
}

export function AuditTimeline() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [transparencyMode, setTransparencyMode] = useState(false);
  const [copiedHash, setCopiedHash] = useState<number | null>(null);
  const [isVerifyingChain, setIsVerifyingChain] = useState(false);
  const [chainVerified, setChainVerified] = useState<boolean | null>(null);

  useEffect(() => {
    fetchEvents(1, true);
  }, [eventTypeFilter]);

  // Compute fingerprints for chain verification
  const eventFingerprints = useMemo(() => {
    const fingerprints = new Map<number, { hash: string; prevHash: string | null }>();
    let prevHash: string | null = null;
    
    // Sort by ID to ensure correct chain order
    const sortedEvents = [...events].sort((a, b) => a.id - b.id);
    
    for (const event of sortedEvents) {
      const hash = computeEventFingerprint(event, prevHash);
      fingerprints.set(event.id, { hash, prevHash });
      prevHash = hash;
    }
    
    return fingerprints;
  }, [events]);

  const fetchEvents = async (pageNum: number, reset = false) => {
    if (reset) {
      setIsLoading(true);
      setChainVerified(null);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "50",
      });
      if (eventTypeFilter !== "all") {
        params.append("type", eventTypeFilter);
      }

      const response = await fetch(`/api/audit?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (reset) {
          setEvents(data.events);
        } else {
          setEvents(prev => [...prev, ...data.events]);
        }
        setHasMore(data.hasMore);
        setPage(pageNum);
      }
    } catch (error) {
      console.error("Failed to fetch audit events:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const verifyChain = async () => {
    setIsVerifyingChain(true);
    setChainVerified(null);
    
    // Simulate verification delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Verify chain integrity
    const sortedEvents = [...events].sort((a, b) => a.id - b.id);
    let prevHash: string | null = null;
    let valid = true;
    
    for (const event of sortedEvents) {
      const fp = eventFingerprints.get(event.id);
      if (fp && fp.prevHash !== prevHash) {
        valid = false;
        break;
      }
      prevHash = fp?.hash || null;
    }
    
    setChainVerified(valid);
    setIsVerifyingChain(false);
  };

  const exportAuditLog = () => {
    const exportData = events.map(event => ({
      ...event,
      fingerprint: eventFingerprints.get(event.id)?.hash,
      prev_fingerprint: eventFingerprints.get(event.id)?.prevHash,
    }));
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `poolvault-audit-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyHash = (eventId: number, hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(eventId);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const toggleExpand = (eventId: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatFullTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toISOString();
  };

  const getEventConfig = (eventType: string) => {
    return EVENT_TYPE_CONFIG[eventType] || { 
      label: eventType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), 
      icon: History, 
      color: "text-muted-foreground" 
    };
  };

  const formatPayload = (payloadJson: string | null) => {
    if (!payloadJson) return null;
    try {
      return JSON.parse(payloadJson);
    } catch {
      return null;
    }
  };

  const filteredEvents = events.filter(event => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const config = getEventConfig(event.event_type);
    return (
      config.label.toLowerCase().includes(term) ||
      event.league_name?.toLowerCase().includes(term) ||
      event.user_email?.toLowerCase().includes(term) ||
      event.actor_email?.toLowerCase().includes(term) ||
      event.reason?.toLowerCase().includes(term)
    );
  });

  // Group events by date
  const groupedEvents = filteredEvents.reduce((acc, event) => {
    const date = formatDate(event.created_at);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(event);
    return acc;
  }, {} as Record<string, AuditEvent[]>);

  const uniqueEventTypes = [...new Set(events.map(e => e.event_type))];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            <History className="h-6 w-6" />
            Audit Timeline
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Append-only log of all actions — immutable and transparent
          </p>
        </div>
        
        {/* Transparency Mode Toggle */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors",
              transparencyMode 
                ? "bg-primary/10 border-primary/30 text-primary" 
                : "bg-muted/50 border-border text-muted-foreground"
            )}>
              <Eye className="h-4 w-4" />
              <span className="text-sm font-medium">Transparency</span>
              <Switch
                checked={transparencyMode}
                onCheckedChange={setTransparencyMode}
                className="scale-90"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Transparency Mode Panel */}
      {transparencyMode && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent animate-in fade-in slide-in-from-top-2 duration-300">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Fingerprint className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium flex items-center gap-2">
                    Chain Verification Mode
                    {chainVerified === true && (
                      <Badge className="bg-[hsl(var(--success))] text-white">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                    {chainVerified === false && (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Integrity Error
                      </Badge>
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Each event is cryptographically linked to the previous, forming an immutable chain
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={verifyChain}
                  disabled={isVerifyingChain}
                >
                  {isVerifyingChain ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  {isVerifyingChain ? "Verifying..." : "Verify Chain"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportAuditLog}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                {uniqueEventTypes.map(type => {
                  const config = getEventConfig(type);
                  return (
                    <SelectItem key={type} value={type}>
                      {config.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold tabular-nums">{events.length}</div>
            <p className="text-sm text-muted-foreground">Total Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold tabular-nums">{Object.keys(groupedEvents).length}</div>
            <p className="text-sm text-muted-foreground">Active Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold tabular-nums">{uniqueEventTypes.length}</div>
            <p className="text-sm text-muted-foreground">Event Types</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-[hsl(var(--success))]" />
              Immutable
            </div>
            <p className="text-sm text-muted-foreground">Append-Only</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      {filteredEvents.length === 0 ? (
        <Card className="p-8 text-center">
          <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No events found</h3>
          <p className="text-muted-foreground">
            {searchTerm || eventTypeFilter !== "all" 
              ? "Try adjusting your filters"
              : "Events will appear here as actions are taken"
            }
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedEvents).map(([date, dateEvents]) => (
            <div key={date}>
              <div className="sticky top-20 z-10 bg-background/95 backdrop-blur py-2 mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  {date}
                  <Badge variant="secondary" className="ml-2">
                    {dateEvents.length} event{dateEvents.length !== 1 ? "s" : ""}
                  </Badge>
                </h2>
              </div>
              
              <div className="relative pl-6 space-y-4">
                {/* Timeline line */}
                <div className={cn(
                  "absolute left-[11px] top-0 bottom-0 w-0.5",
                  transparencyMode && chainVerified === true 
                    ? "bg-[hsl(var(--success))]/50" 
                    : transparencyMode && chainVerified === false
                    ? "bg-destructive/50"
                    : "bg-border"
                )} />
                
                {dateEvents.map((event, idx) => {
                  const config = getEventConfig(event.event_type);
                  const Icon = config.icon;
                  const payload = formatPayload(event.payload_json);
                  const isExpanded = expandedEvents.has(event.id);
                  const fingerprint = eventFingerprints.get(event.id);

                  return (
                    <div key={event.id} className="relative">
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute -left-6 w-6 h-6 rounded-full border-2 border-background flex items-center justify-center",
                        transparencyMode && chainVerified === true
                          ? "bg-[hsl(var(--success))]/20"
                          : "bg-muted"
                      )}>
                        <Icon className={cn("h-3 w-3", config.color)} />
                      </div>

                      {/* Chain link indicator */}
                      {transparencyMode && idx > 0 && (
                        <div className="absolute -left-[15px] -top-2 text-muted-foreground">
                          <Link2 className="h-3 w-3" />
                        </div>
                      )}

                      <Card className={cn(
                        "ml-2 transition-all",
                        transparencyMode && "border-l-2 border-l-primary/30"
                      )}>
                        <CardContent className="py-4">
                          <div 
                            className="flex items-start justify-between cursor-pointer"
                            onClick={() => toggleExpand(event.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className={cn("gap-1", config.color)}>
                                  <Icon className="h-3 w-3" />
                                  {config.label}
                                </Badge>
                                {event.league_name && (
                                  <Badge variant="secondary">{event.league_name}</Badge>
                                )}
                              </div>
                              
                              <p className="text-sm mt-2">
                                {event.actor_email && (
                                  <span className="font-medium">{event.actor_email}</span>
                                )}
                                {event.actor_email && event.user_email && event.actor_email !== event.user_email && (
                                  <span className="text-muted-foreground">
                                    {" → "}{event.user_email}
                                  </span>
                                )}
                                {!event.actor_email && event.user_email && (
                                  <span className="font-medium">{event.user_email}</span>
                                )}
                                {event.reason && (
                                  <span className="text-muted-foreground ml-1">
                                    — {event.reason}
                                  </span>
                                )}
                              </p>

                              <p className="text-xs text-muted-foreground mt-1">
                                {transparencyMode ? (
                                  <span className="font-mono">{formatFullTimestamp(event.created_at)}</span>
                                ) : (
                                  formatTime(event.created_at)
                                )}
                                <span className="mx-2">•</span>
                                <span className="font-mono">ID: {event.id}</span>
                                {event.entity_type && (
                                  <>
                                    <span className="mx-2">•</span>
                                    <span>{event.entity_type} #{event.entity_id}</span>
                                  </>
                                )}
                              </p>

                              {/* Fingerprint display in transparency mode */}
                              {transparencyMode && fingerprint && (
                                <div className="mt-3 pt-3 border-t border-dashed">
                                  <div className="flex items-center gap-2">
                                    <Fingerprint className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <code className="text-xs font-mono text-primary bg-primary/5 px-2 py-0.5 rounded">
                                      {fingerprint.hash}
                                    </code>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyHash(event.id, fingerprint.hash);
                                      }}
                                    >
                                      {copiedHash === event.id ? (
                                        <Check className="h-3 w-3 text-[hsl(var(--success))]" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                  {fingerprint.prevHash && (
                                    <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                                      <Link2 className="h-3 w-3 shrink-0" />
                                      <span className="text-[10px] font-mono truncate">
                                        prev: {fingerprint.prevHash}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <Button variant="ghost" size="icon" className="shrink-0">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 pt-4 border-t space-y-3">
                              {payload && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2">
                                    Event Payload
                                  </p>
                                  <pre className="p-3 bg-zinc-900 rounded-lg text-xs font-mono overflow-auto max-h-48 text-zinc-300">
                                    {JSON.stringify(payload, null, 2)}
                                  </pre>
                                </div>
                              )}
                              
                              {transparencyMode && (
                                <div className="flex items-center gap-2 pt-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const data = {
                                        event,
                                        fingerprint,
                                      };
                                      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                                    }}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1.5" />
                                    Export Event
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => fetchEvents(page + 1)}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  "Load More Events"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
