import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calendar,
  MapPin,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Trophy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card } from "@/react-app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import { Badge } from "@/react-app/components/ui/badge";
import { SPORTS } from "@/react-app/data/sports";
import {
  formatPeriodName,
  type EventStatus,
} from "@/shared/events";

interface Event {
  id: number;
  external_id: string;
  sport_key: string;
  league_key: string | null;
  season: string;
  period_id: string;
  start_at: string;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  status: EventStatus;
  winner: string | null;
  final_result: string | null;
  venue: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<EventStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  scheduled: { label: "Scheduled", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Calendar },
  in_progress: { label: "Live", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Play },
  halftime: { label: "Halftime", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Pause },
  delayed: { label: "Delayed", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: AlertCircle },
  postponed: { label: "Postponed", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertCircle },
  cancelled: { label: "Cancelled", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: AlertCircle },
  final: { label: "Final", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  final_ot: { label: "Final (OT)", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Trophy },
};

export default function Events() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<Event[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sportKey = searchParams.get("sport") || "nfl";
  const periodId = searchParams.get("period") || "";
  const statusFilter = searchParams.get("status") || "all";

  const sport = SPORTS.find((s) => s.key === sportKey);

  useEffect(() => {
    fetchPeriods();
  }, [sportKey]);

  useEffect(() => {
    if (periodId) {
      fetchEvents();
    }
  }, [sportKey, periodId, statusFilter]);

  async function fetchPeriods() {
    try {
      const res = await fetch(`/api/events/periods?sport=${sportKey}`);
      const data = await res.json();
      
      if (res.ok) {
        setPeriods(data.periods || []);
        if (!periodId && data.currentPeriod) {
          setSearchParams((prev) => {
            prev.set("period", data.currentPeriod);
            return prev;
          });
        } else if (!periodId && data.periods?.length > 0) {
          setSearchParams((prev) => {
            prev.set("period", data.periods[0]);
            return prev;
          });
        }
      }
    } catch {
      console.error("Failed to fetch periods");
    }
  }

  async function fetchEvents() {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        sport: sportKey,
        period: periodId,
      });
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      
      const res = await fetch(`/api/events?${params}`);
      const data = await res.json();
      
      if (res.ok) {
        setEvents(data.events || []);
      } else {
        setError(data.error || "Failed to fetch events");
      }
    } catch {
      setError("Failed to fetch events");
    } finally {
      setLoading(false);
    }
  }

  async function syncEvents() {
    setSyncing(true);
    try {
      const res = await fetch("/api/events/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sportKey, periodId }),
      });
      
      if (res.ok) {
        await fetchEvents();
      }
    } catch {
      console.error("Failed to sync events");
    } finally {
      setSyncing(false);
    }
  }

  function navigatePeriod(direction: "prev" | "next") {
    const currentIdx = periods.indexOf(periodId);
    const newIdx = direction === "prev" ? currentIdx - 1 : currentIdx + 1;
    
    if (newIdx >= 0 && newIdx < periods.length) {
      setSearchParams((prev) => {
        prev.set("period", periods[newIdx]);
        return prev;
      });
    }
  }

  const currentPeriodIdx = periods.indexOf(periodId);
  const hasPrev = currentPeriodIdx > 0;
  const hasNext = currentPeriodIdx < periods.length - 1;

  const scheduledCount = events.filter((e) => e.status === "scheduled").length;
  const liveCount = events.filter((e) => e.status === "in_progress" || e.status === "halftime").length;
  const finalCount = events.filter((e) => e.status === "final" || e.status === "final_ot").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              {sport && <sport.icon className="h-10 w-10" />}
              {sport?.name} Events
            </h1>
            <p className="text-muted-foreground mt-1">
              Browse and manage game schedules
            </p>
          </div>
          
          <Button
            onClick={syncEvents}
            disabled={syncing}
            variant="outline"
            className="shrink-0"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Events"}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Select
            value={sportKey}
            onValueChange={(value) => {
              setSearchParams((prev) => {
                prev.set("sport", value);
                prev.delete("period");
                return prev;
              });
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select sport" />
            </SelectTrigger>
            <SelectContent>
              {SPORTS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  <span className="flex items-center gap-2">
                    <s.icon className="h-4 w-4" />
                    <span>{s.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Period Navigation */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigatePeriod("prev")}
              disabled={!hasPrev}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <Select
              value={periodId}
              onValueChange={(value) => {
                setSearchParams((prev) => {
                  prev.set("period", value);
                  return prev;
                });
              }}
            >
              <SelectTrigger className="w-32 border-0 bg-transparent">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {formatPeriodName(sportKey, p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigatePeriod("next")}
              disabled={!hasNext}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setSearchParams((prev) => {
                prev.set("status", value);
                return prev;
              });
            }}
          >
            <SelectTrigger className="w-36">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="final">Final</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="p-4 bg-card/50 border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{scheduledCount}</p>
                <p className="text-sm text-muted-foreground">Scheduled</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-card/50 border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Play className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{liveCount}</p>
                <p className="text-sm text-muted-foreground">Live</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-card/50 border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{finalCount}</p>
                <p className="text-sm text-muted-foreground">Final</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Events List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Error loading events</p>
            <p className="text-muted-foreground">{error}</p>
          </Card>
        ) : events.length === 0 ? (
          <Card className="p-8 text-center">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">No events found</p>
            <p className="text-muted-foreground mb-4">
              Click "Sync Events" to load sample events for this period
            </p>
            <Button onClick={syncEvents} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              Sync Events
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
  const statusInfo = STATUS_CONFIG[event.status] || STATUS_CONFIG.scheduled;
  const StatusIcon = statusInfo.icon;
  
  const startDate = new Date(event.start_at);
  const isLive = event.status === "in_progress" || event.status === "halftime";
  const isFinal = event.status === "final" || event.status === "final_ot";

  return (
    <Card className={`p-4 border ${isLive ? "border-green-500/50 bg-green-500/5" : "border-border"}`}>
      <div className="flex items-center justify-between gap-4">
        {/* Teams & Score */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4">
            {/* Away Team */}
            <div className={`flex-1 text-right ${event.winner === event.away_team ? "font-bold" : ""}`}>
              <p className="text-foreground truncate">{event.away_team}</p>
              {(isFinal || isLive) && event.away_score !== null && (
                <p className={`text-2xl font-bold ${event.winner === event.away_team ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {event.away_score}
                </p>
              )}
            </div>
            
            {/* VS / Score Divider */}
            <div className="text-center px-4">
              {isFinal || isLive ? (
                <Badge variant="outline" className={statusInfo.color}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusInfo.label}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-sm font-medium">@</span>
              )}
            </div>
            
            {/* Home Team */}
            <div className={`flex-1 ${event.winner === event.home_team ? "font-bold" : ""}`}>
              <p className="text-foreground truncate">{event.home_team}</p>
              {(isFinal || isLive) && event.home_score !== null && (
                <p className={`text-2xl font-bold ${event.winner === event.home_team ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {event.home_score}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Time & Status */}
        <div className="text-right shrink-0 w-32">
          {!isFinal && !isLive && (
            <>
              <p className="text-foreground font-medium">
                {startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
              <p className="text-sm text-muted-foreground flex items-center justify-end gap-1">
                <Calendar className="w-3 h-3" />
                {startDate.toLocaleDateString([], { month: "short", day: "numeric" })}
              </p>
            </>
          )}
          {event.venue && (
            <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-1">
              <MapPin className="w-3 h-3" />
              {event.venue}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
