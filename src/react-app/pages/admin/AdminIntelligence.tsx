import { useEffect, useState } from "react";

interface AdminIntelResponse {
  as_of: string;
  model_usage: {
    provider: string;
    model: string;
    latency_ms: number;
    fallback_used: boolean;
  };
  signal_generation: {
    sharp_signals: number;
    prop_edges: number;
    edge_score: number;
  };
}

interface AdminVideoJob {
  id: string;
  gameId: string;
  status: "queued" | "submitted" | "completed" | "failed";
  socialStatus?: "not_requested" | "queued" | "published" | "failed";
  videoUrl?: string;
  createdAt: string;
  errorMessage?: string | null;
}

export default function AdminIntelligence() {
  const [data, setData] = useState<AdminIntelResponse | null>(null);
  const [videoJobs, setVideoJobs] = useState<AdminVideoJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [intelRes, jobsRes] = await Promise.all([
          fetch("/api/coachg/admin/intelligence", { credentials: "include" }),
          fetch("/api/coachg/admin/video/jobs?limit=50", { credentials: "include" }),
        ]);
        if (!intelRes.ok) throw new Error(`HTTP ${intelRes.status}`);
        const payload = await intelRes.json();
        const jobsPayload = jobsRes.ok ? await jobsRes.json() as { jobs?: AdminVideoJob[] } : { jobs: [] };
        if (!cancelled) {
          setData(payload);
          setVideoJobs(Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    run();
    const timer = setInterval(run, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Intelligence</h1>
        <p className="text-sm text-white/60">AI activity, model usage, and signal generation telemetry.</p>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase text-white/60">Provider</p>
              <p className="mt-2 text-lg font-semibold text-cyan-200">{data.model_usage.provider}</p>
              <p className="text-xs text-white/60">{data.model_usage.model}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase text-white/60">Latency</p>
              <p className="mt-2 text-lg font-semibold text-amber-200">{data.model_usage.latency_ms} ms</p>
              <p className="text-xs text-white/60">Fallback: {data.model_usage.fallback_used ? "yes" : "no"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase text-white/60">Signals</p>
              <p className="mt-2 text-lg font-semibold text-emerald-200">{data.signal_generation.sharp_signals} sharp</p>
              <p className="text-xs text-white/60">{data.signal_generation.prop_edges} prop edges • Edge {data.signal_generation.edge_score}</p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-cyan-200">Video Jobs (Full History)</h2>
              <p className="text-xs text-white/50">Showing latest {videoJobs.length}</p>
            </div>
            <div className="mt-3 space-y-2">
              {videoJobs.length === 0 && <p className="text-xs text-white/50">No jobs found.</p>}
              {videoJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                  <p className="text-xs text-white/75">Game: {job.gameId}</p>
                  <p className="text-xs text-white/90">
                    Status: {job.status} • Social: {job.socialStatus || "not_requested"} • {new Date(job.createdAt).toLocaleString()}
                  </p>
                  {job.errorMessage && <p className="mt-1 text-xs text-red-300">{job.errorMessage}</p>}
                  {job.videoUrl && (
                    <a
                      href={job.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200"
                    >
                      Open Video
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
