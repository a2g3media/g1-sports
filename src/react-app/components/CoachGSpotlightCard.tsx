import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, PlayCircle, Sparkles } from "lucide-react";
import { useCoachGPreview } from "@/react-app/hooks/useCoachGPreview";
import { Badge } from "@/react-app/components/ui/badge";
import { cn } from "@/react-app/lib/utils";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";

interface CoachGSpotlightCardProps {
  gameId: string;
  sport?: string;
  isLive?: boolean;
  summaryFallback?: string | null;
  signalBadges?: string[];
  onReadFullAnalysis?: () => void;
}

interface VideoJob {
  id?: string;
  status?: "queued" | "submitted" | "completed" | "failed";
  videoUrl?: string;
  createdAt?: string;
}

export function CoachGSpotlightCard({
  gameId,
  sport,
  isLive = false,
  summaryFallback,
  signalBadges = [],
  onReadFullAnalysis,
}: CoachGSpotlightCardProps) {
  const { preview, isLoading } = useCoachGPreview(gameId);
  const [latestVideoJob, setLatestVideoJob] = useState<VideoJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!gameId) return;
      try {
        const viewerOffset = new Date().getTimezoneOffset();
        const res = await fetch(
          `/api/coachg/video/jobs?game_id=${encodeURIComponent(gameId)}&limit=1&window_hours=24&viewer_tz_offset_min=${encodeURIComponent(String(viewerOffset))}`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const data = await res.json() as { jobs?: VideoJob[] };
        if (!cancelled) setLatestVideoJob(data.jobs?.[0] || null);
      } catch {
        if (!cancelled) setLatestVideoJob(null);
      }
    };
    void run();
    const timer = setInterval(run, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gameId]);

  const summary = useMemo(() => {
    if (preview?.content?.headline) {
      const trimmed = preview.content.headline.trim();
      if (trimmed.length <= 180) return trimmed;
      return `${trimmed.slice(0, 177)}...`;
    }
    if (summaryFallback && summaryFallback.trim().length > 0) return summaryFallback;
    return "Coach G is building a matchup intelligence summary for this game.";
  }, [preview?.content?.headline, summaryFallback]);

  const updatedAt = preview?.updated_at || preview?.generated_at || latestVideoJob?.createdAt || null;
  const normalizedBadges = useMemo(() => {
    const priorityOrder = ["Sharp Signal", "Market Shift", "Rotation Risk", "Live Tempo"];
    const uniqueBadges = Array.from(new Set(signalBadges));
    uniqueBadges.sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a);
      const bIdx = priorityOrder.indexOf(b);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
    return uniqueBadges.slice(0, 3);
  }, [signalBadges]);
  const videoUrl = latestVideoJob?.videoUrl || null;

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-cyan-400/20 bg-[radial-gradient(circle_at_15%_0%,rgba(56,189,248,0.16),transparent_36%),radial-gradient(circle_at_85%_20%,rgba(139,92,246,0.14),transparent_40%),linear-gradient(145deg,#16202B,#121821_55%,rgba(0,0,0,0.35))] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.32)]">
      <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="absolute inset-[-8px] rounded-full bg-cyan-400/20 blur-md" />
          <CoachGAvatar
            size="xl"
            presence={isLive ? "alert" : "monitoring"}
            className="relative border-cyan-300/45 shadow-[0_0_22px_rgba(34,211,238,0.22)]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Coach G Spotlight</p>
            {sport && <Badge className="bg-white/10 text-[10px] text-[#E5E7EB]">{sport.toUpperCase()}</Badge>}
          </div>
          <p className="mt-1 text-sm text-[#E5E7EB]">{summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#9CA3AF]">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {updatedAt ? `Updated ${new Date(updatedAt).toLocaleString()}` : "Updating..."}
            </span>
            {isLoading && <span className="text-cyan-200">Refreshing analysis...</span>}
          </div>
          {normalizedBadges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {normalizedBadges.map((badge) => (
                <span
                  key={badge}
                  className={cn(
                    "rounded-full border border-white/[0.05] bg-black/35 px-2 py-0.5 text-[10px] text-[#9CA3AF]",
                    badge.toLowerCase().includes("sharp") && "border-amber-400/40 text-amber-200"
                  )}
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {videoUrl ? (
              <a
                href={videoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-100"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Watch Video
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.05] bg-black/35 px-2.5 py-1 text-xs text-[#9CA3AF]"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Video Pending
              </button>
            )}
            <button
              type="button"
              onClick={onReadFullAnalysis}
              className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1 text-xs font-semibold text-cyan-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Read Full Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CoachGSpotlightCard;
