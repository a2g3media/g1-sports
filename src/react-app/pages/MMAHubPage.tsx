import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Calendar, ChevronRight, Loader2, MessageSquare, TrendingUp } from "lucide-react";

type MMAEvent = {
  eventId: string;
  name: string;
  dateTime: string;
  status: string;
  fightsCount?: number;
};

export default function MMAHubPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<MMAEvent[]>([]);
  const [nextEvent, setNextEvent] = useState<MMAEvent | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextRes, scheduleRes] = await Promise.all([
          fetch("/api/mma/next"),
          fetch("/api/mma/schedule"),
        ]);
        const nextJson = await nextRes.json().catch(() => ({}));
        const scheduleJson = await scheduleRes.json().catch(() => ({}));

        if (!active) return;
        const nextEventPayload = nextRes.ok && nextJson?.eventId
          ? {
            eventId: String(nextJson.eventId),
            name: String(nextJson.name || "Upcoming UFC Event"),
            dateTime: String(nextJson.dateTime || new Date().toISOString()),
            status: String(nextJson.status || "Scheduled"),
            fightsCount: Number(nextJson.fightsCount || 0),
          }
          : null;
        setNextEvent(nextEventPayload);

        const normalized = (Array.isArray(scheduleJson?.events) ? scheduleJson.events : [])
          .map((e: any) => ({
            eventId: String(e?.eventId || ""),
            name: String(e?.name || "UFC Event"),
            dateTime: String(e?.dateTime || new Date().toISOString()),
            status: String(e?.status || "Scheduled"),
            fightsCount: Number(e?.fightsCount || 0),
          }))
          .filter((e: MMAEvent) => e.eventId.trim().length > 0)
          .slice(0, 10);
        setEvents(normalized);

        const nextError = !nextRes.ok ? String(nextJson?.error || `Next event request failed (${nextRes.status})`) : null;
        const scheduleError = !scheduleRes.ok
          ? String(scheduleJson?.error || `Schedule request failed (${scheduleRes.status})`)
          : null;

        if (!nextRes.ok && !scheduleRes.ok) {
          setError(`MMA feed unavailable: ${scheduleError || nextError || "Service temporarily unavailable"}`);
        } else if (!nextEventPayload && normalized.length === 0 && (nextError || scheduleError)) {
          setError(nextError || scheduleError || "No UFC events available right now");
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load MMA schedule");
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo(() => {
    if (events.length > 0) return events;
    if (nextEvent) return [nextEvent];
    return [];
  }, [events, nextEvent]);

  const formatDate = (dateTime: string) =>
    new Date(dateTime).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
        <div className="rounded-2xl border border-red-500/20 bg-gradient-to-r from-red-500/15 to-transparent p-5">
          <p className="text-xs uppercase tracking-wider text-red-300">MMA Command Center</p>
          <h1 className="mt-1 text-2xl font-bold text-white">UFC Fight Intelligence</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Real schedule + event cards from SportsData feed. Coach G overlays market context in real time.
          </p>
        </div>


        <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
          <div className="flex items-center gap-2 text-violet-300 text-sm font-semibold">
            <MessageSquare className="h-4 w-4" />
            Ask Coach G about MMA
          </div>
          <p className="mt-2 text-sm text-zinc-300">
            Compare edge signals, sharp/public pressure, and line movement across the next UFC slate.
          </p>
          <button
            onClick={() => navigate("/scout")}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-violet-400/40 bg-violet-500/20 px-3 py-2 text-sm text-violet-200"
          >
            Open Coach G
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing upcoming UFC events...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          {cards.map((event) => (
            <button
              key={event.eventId}
              onClick={() => navigate(`/sports/mma/event/${event.eventId}`)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{event.name}</h3>
                  <p className="mt-1 inline-flex items-center gap-1 text-sm text-zinc-400">
                    <Calendar className="h-4 w-4" />
                    {formatDate(event.dateTime)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Status: {event.status} {event.fightsCount ? `• ${event.fightsCount} fights` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
                    <TrendingUp className="h-3 w-3" />
                    View Card
                  </span>
                </div>
              </div>
            </button>
          ))}

          {!loading && !error && cards.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-300">
              No upcoming UFC events available right now. Try refreshing in a few minutes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
