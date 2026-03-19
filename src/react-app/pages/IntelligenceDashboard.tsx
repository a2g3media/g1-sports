import { useEffect, useMemo, useState } from "react";
import { Brain, Radar, TrendingUp, Newspaper, Zap, BellRing } from "lucide-react";

type Payload = {
  id: string;
  entity_id?: string;
  entity_type?: string;
  title: string;
  summary: string;
  edge_score: number;
  sharp_signals: Array<{ type: string; summary: string; confidence: number }>;
  prop_edges: Array<{ player: string; prop: string; edge_score: number }>;
  alerts: string[];
  generated_at: string;
};
type VideoJob = {
  id: string;
  gameId: string;
  status: "queued" | "submitted" | "completed" | "failed";
  socialStatus?: "not_requested" | "queued" | "published" | "failed";
  videoUrl?: string;
  createdAt: string;
  errorMessage?: string | null;
};
type FeaturedItem = {
  itemId: string;
  sport: string;
  gameId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  headline: string;
  shortSummary: string;
  fullAnalysisText: string;
  videoStatus: string;
  videoUrl?: string | null;
  updatedAt: string;
};

const MODULES = [
  { key: "daily_brief", label: "Coach G Daily Brief", icon: Brain },
  { key: "sharp_radar", label: "Sharp Radar", icon: Radar },
  { key: "smart_money", label: "Smart Money Tracker", icon: TrendingUp },
  { key: "value_board", label: "Value Board", icon: Zap },
  { key: "market_movers", label: "Market Movers", icon: Newspaper },
  { key: "alerts", label: "Games Requiring Attention", icon: BellRing },
];

export default function IntelligenceDashboard() {
  const [payloads, setPayloads] = useState<Payload[]>([]);
  const [videoJobs, setVideoJobs] = useState<VideoJob[]>([]);
  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([]);
  const [videoBusyByGame, setVideoBusyByGame] = useState<Record<string, boolean>>({});
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/coachg/feed?surface=home&limit=10", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setPayloads(Array.isArray(data?.payloads) ? data.payloads : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const timer = setInterval(run, 45000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/coachg/featured?limit=12", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { items?: FeaturedItem[] };
        if (!cancelled) setFeaturedItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        // non-blocking section
      }
    };
    run();
    const timer = setInterval(run, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const viewerOffset = new Date().getTimezoneOffset();
        const res = await fetch(`/api/coachg/video/jobs?limit=20&window_hours=24&viewer_tz_offset_min=${encodeURIComponent(String(viewerOffset))}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setVideoJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      } catch {
        // Keep silent; this is a secondary panel
      }
    };
    run();
    const timer = setInterval(run, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const createVideo = async (gameId: string) => {
    setVideoBusyByGame((prev) => ({ ...prev, [gameId]: true }));
    try {
      const res = await fetch("/api/coachg/video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ game_id: gameId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const job = data?.job as VideoJob | undefined;
      if (job) setVideoJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVideoBusyByGame((prev) => ({ ...prev, [gameId]: false }));
    }
  };

  const publishSocial = async (jobId: string) => {
    setPublishingJobId(jobId);
    try {
      const res = await fetch(`/api/coachg/video/jobs/${encodeURIComponent(jobId)}/publish-social`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const job = data?.job as VideoJob | undefined;
      if (job) setVideoJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishingJobId(null);
    }
  };

  const top = payloads[0] || null;
  const cards = useMemo(() => payloads.slice(0, 8), [payloads]);
  const latestVideoByGame = useMemo(() => {
    const map: Record<string, VideoJob> = {};
    for (const job of videoJobs) {
      if (!job.gameId) continue;
      const prev = map[job.gameId];
      if (!prev || new Date(job.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
        map[job.gameId] = job;
      }
    }
    return map;
  }, [videoJobs]);

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-violet-500/10 p-5">
          <p className="text-xs uppercase tracking-wider text-cyan-300/80">Coach G V3</p>
          <h1 className="mt-1 text-2xl font-bold">Sports Intelligence Dashboard</h1>
          <p className="mt-2 text-sm text-white/70">
            Daily Brief, Sharp Radar, Smart Money Tracker, Value Board, Market Movers, Prop Edge Board, and Watchlist signals.
          </p>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <m.icon className="h-4 w-4 text-cyan-300" />
                <p className="text-sm font-semibold">{m.label}</p>
              </div>
            </div>
          ))}
        </div>

        {loading && <p className="text-sm text-white/60">Loading intelligence feed...</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}

        {top && (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <p className="text-xs uppercase text-emerald-300">Daily Brief</p>
            <h2 className="mt-1 text-lg font-semibold">{top.title}</h2>
            <p className="mt-2 text-sm text-white/85">{top.summary}</p>
            <p className="mt-2 text-xs text-white/60">Edge score: {top.edge_score} • {new Date(top.generated_at).toLocaleString()}</p>
          </div>
        )}

        <div className="mb-6 rounded-xl border border-white/10 bg-black/30 p-4">
          <h3 className="text-sm font-semibold text-cyan-200">Coach G Featured Games</h3>
          <p className="mt-1 text-xs text-white/60">Text-first featured analysis. Video attaches automatically when ready.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {featuredItems.length === 0 && <p className="text-xs text-white/50">No featured items published yet.</p>}
            {featuredItems.slice(0, 8).map((item) => (
              <article key={item.itemId} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[11px] uppercase tracking-wide text-cyan-300">{item.sport}</p>
                <h4 className="mt-1 text-sm font-semibold text-white">{item.headline}</h4>
                <p className="mt-1 text-xs text-white/75">{item.shortSummary}</p>
                <p className="mt-2 text-xs text-white/70">{item.fullAnalysisText}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-white/80">
                    Video: {item.videoStatus}
                  </span>
                  {item.videoUrl && (
                    <a
                      href={item.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-200"
                    >
                      Watch
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <article key={card.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-cyan-200">{card.title}</h3>
                {card.entity_type === "game" && card.entity_id && latestVideoByGame[card.entity_id] && (
                  <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                    Video: {latestVideoByGame[card.entity_id].status}
                    {latestVideoByGame[card.entity_id].socialStatus === "published" ? " • published" : ""}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-white/85">{card.summary}</p>
              <p className="mt-3 text-xs text-white/60">Edge: {card.edge_score}</p>
              {card.sharp_signals?.[0] && (
                <p className="mt-1 text-xs text-amber-300">
                  Sharp: {card.sharp_signals[0].summary} ({Math.round(card.sharp_signals[0].confidence)}%)
                </p>
              )}
              {card.prop_edges?.[0] && (
                <p className="mt-1 text-xs text-cyan-300">
                  Prop: {card.prop_edges[0].player} {card.prop_edges[0].prop} (Edge {card.prop_edges[0].edge_score})
                </p>
              )}
              {card.entity_type === "game" && card.entity_id && (
                <button
                  type="button"
                  onClick={() => createVideo(card.entity_id!)}
                  disabled={Boolean(videoBusyByGame[card.entity_id])}
                  className="mt-3 rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 disabled:opacity-50"
                >
                  {videoBusyByGame[card.entity_id] ? "Creating Video..." : "Create Coach G Video"}
                </button>
              )}
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-white/10 bg-black/30 p-4">
          <h3 className="text-sm font-semibold text-cyan-200">Coach G Video Jobs</h3>
          <p className="mt-1 text-xs text-white/60">Persistent HeyGen jobs with social campaign publish action.</p>
          <div className="mt-3 space-y-2">
            {videoJobs.length === 0 && <p className="text-xs text-white/50">No video jobs yet.</p>}
            {videoJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                <p className="text-xs text-white/70">Game: {job.gameId}</p>
                <p className="text-xs text-white/90">Status: {job.status} • Social: {job.socialStatus || "not_requested"}</p>
                {job.errorMessage && <p className="mt-1 text-xs text-red-300">{job.errorMessage}</p>}
                <div className="mt-2 flex items-center gap-2">
                  {job.videoUrl && (
                    <a
                      href={job.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200"
                    >
                      Open Video
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => publishSocial(job.id)}
                    disabled={publishingJobId === job.id}
                    className="rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-200 disabled:opacity-50"
                  >
                    {publishingJobId === job.id ? "Publishing..." : "Publish to Social"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
