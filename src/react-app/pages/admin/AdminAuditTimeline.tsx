import { useEffect, useState, useCallback } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  User,
  Users,
  FileText,
  Settings,
  Shield,
  Activity,
  CreditCard,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface AuditEvent {
  id: number;
  event_type: string;
  league_id: number | null;
  user_id: number | null;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: number | null;
  reason: string | null;
  created_at: string;
  actor_email: string | null;
  pool_name: string | null;
  details: {
    summary?: string;
    actor_role?: string;
    [key: string]: unknown;
  } | null;
}

const ENTITY_TYPES = [
  { value: "user", label: "Users" },
  { value: "pool", label: "Pools" },
  { value: "pool_type", label: "Pool Types" },
  { value: "transaction", label: "Transactions" },
  { value: "system", label: "System" },
  { value: "campaign", label: "Marketing" },
  { value: "ledger", label: "Ledger" },
];

const ACTION_TYPES = [
  { value: "admin_viewed_overview", label: "Viewed Overview" },
  { value: "admin_viewed_user", label: "Viewed User" },
  { value: "admin_viewed_pool", label: "Viewed Pool" },
  { value: "admin_viewed_ledger", label: "Viewed Ledger" },
  { value: "user_disabled", label: "User Disabled" },
  { value: "user_enabled", label: "User Enabled" },
  { value: "user_role_changed", label: "Role Changed" },
  { value: "pool_type_created", label: "Pool Type Created" },
  { value: "pool_type_versioned", label: "Pool Type Versioned" },
  { value: "pool_type_deprecated", label: "Pool Type Deprecated" },
  { value: "setting_changed", label: "Setting Changed" },
  { value: "feature_flag_toggled", label: "Feature Flag Toggled" },
  { value: "segment_created", label: "Segment Created" },
  { value: "campaign_created", label: "Campaign Created" },
];

const ACTOR_ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "pool_admin", label: "Pool Admin" },
  { value: "player", label: "Player" },
];

function getEventIcon(eventType: string, entityType: string | null) {
  if (eventType.includes("viewed")) return <Eye className="h-4 w-4" />;
  if (eventType.includes("disabled")) return <AlertTriangle className="h-4 w-4" />;
  if (eventType.includes("enabled")) return <CheckCircle className="h-4 w-4" />;
  if (eventType.includes("role")) return <Shield className="h-4 w-4" />;
  if (eventType.includes("pool_type")) return <FileText className="h-4 w-4" />;
  if (eventType.includes("setting") || eventType.includes("feature")) return <Settings className="h-4 w-4" />;
  if (eventType.includes("campaign") || eventType.includes("segment")) return <Users className="h-4 w-4" />;
  
  switch (entityType) {
    case "user": return <User className="h-4 w-4" />;
    case "pool": return <Activity className="h-4 w-4" />;
    case "transaction":
    case "ledger": return <CreditCard className="h-4 w-4" />;
    default: return <Clock className="h-4 w-4" />;
  }
}

function getEventColor(eventType: string): string {
  if (eventType.includes("disabled") || eventType.includes("deprecated")) return "text-amber-500 bg-amber-500/10";
  if (eventType.includes("enabled") || eventType.includes("created")) return "text-emerald-500 bg-emerald-500/10";
  if (eventType.includes("role") || eventType.includes("toggled")) return "text-blue-500 bg-blue-500/10";
  if (eventType.includes("viewed")) return "text-muted-foreground bg-muted/50";
  if (eventType.includes("changed")) return "text-violet-500 bg-violet-500/10";
  return "text-muted-foreground bg-muted/50";
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatFullDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function AdminAuditTimeline() {
  const { isDemoMode } = useDemoAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [entityType, setEntityType] = useState<string>("");
  const [actionType, setActionType] = useState<string>("");
  const [actorRole, setActorRole] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const hasActiveFilters = entityType || actionType || actorRole || startDate || endDate;

  const fetchEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "30",
      });

      if (entityType) params.append("entity_type", entityType);
      if (actionType) params.append("action_type", actionType);
      if (actorRole) params.append("actor_role", actorRole);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);

      const response = await fetch(`/api/admin/audit-timeline?${params}`, {
        credentials: "include",
        headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
      });

      if (response.ok) {
        const result = await response.json();
        setEvents(result.events);
        setHasMore(result.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch audit events:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, entityType, actionType, actorRole, startDate, endDate, isDemoMode]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const clearFilters = () => {
    setEntityType("");
    setActionType("");
    setActorRole("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // Group events by date
  const groupedEvents: Record<string, AuditEvent[]> = {};
  events.forEach((event) => {
    const date = new Date(event.created_at).toDateString();
    if (!groupedEvents[date]) {
      groupedEvents[date] = [];
    }
    groupedEvents[date].push(event);
  });

  const dateGroups = Object.entries(groupedEvents);

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Audit Timeline"
        description="Immutable event log and activity tracking"
        actions={
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8"
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                {[entityType, actionType, actorRole, startDate, endDate].filter(Boolean).length}
              </span>
            )}
          </Button>
        }
      />

      <div className="p-6">
        {/* Filters Panel */}
        {showFilters && (
          <div className="mb-6 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">Filter Events</h3>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                  <X className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Entity Type</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All entities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All entities</SelectItem>
                    {ENTITY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Action</Label>
                <Select value={actionType} onValueChange={setActionType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All actions</SelectItem>
                    {ACTION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Actor Role</Label>
                <Select value={actorRole} onValueChange={setActorRole}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All roles</SelectItem>
                    {ACTOR_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading audit events...</span>
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "No events match your filters."
                  : "No audit events recorded yet."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {dateGroups.map(([date, dayEvents]) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="px-4 py-2 bg-secondary/30 sticky top-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      {new Date(date).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  {/* Events for this date */}
                  <div className="divide-y divide-border/50">
                    {dayEvents.map((event) => (
                      <div
                        key={event.id}
                        className="px-4 py-3 hover:bg-secondary/20 transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div
                            className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                              getEventColor(event.event_type)
                            )}
                          >
                            {getEventIcon(event.event_type, event.entity_type)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                {/* Summary */}
                                <p className="text-sm font-medium">
                                  {event.details?.summary || formatEventType(event.event_type)}
                                </p>

                                {/* Details */}
                                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  {event.actor_email && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {event.actor_email}
                                    </span>
                                  )}
                                  {event.details?.actor_role && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                                      {event.details.actor_role}
                                    </span>
                                  )}
                                  {event.pool_name && (
                                    <span className="flex items-center gap-1">
                                      <Activity className="h-3 w-3" />
                                      {event.pool_name}
                                    </span>
                                  )}
                                  {event.entity_type && event.entity_id && (
                                    <span className="font-mono">
                                      {event.entity_type}#{event.entity_id}
                                    </span>
                                  )}
                                </div>

                                {/* Reason if present */}
                                {event.reason && (
                                  <p className="mt-1.5 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1 inline-block">
                                    {event.reason}
                                  </p>
                                )}
                              </div>

                              {/* Timestamp */}
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs text-muted-foreground" title={formatFullDateTime(event.created_at)}>
                                  {formatRelativeTime(event.created_at)}
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {new Date(event.created_at).toLocaleTimeString("en-US", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    second: "2-digit",
                                    hour12: true,
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {events.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="h-8"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
                className="h-8"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Info footer */}
        <div className="mt-6 p-4 bg-secondary/30 rounded-lg border border-border/50">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Immutable Audit Trail</p>
              <p className="text-xs text-muted-foreground mt-1">
                All events in this timeline are immutable and cannot be modified or deleted.
                This audit log is automatically maintained for compliance and security purposes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
