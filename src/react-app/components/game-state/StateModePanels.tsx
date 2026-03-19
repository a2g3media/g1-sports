import { FileText, ListOrdered, Sparkles, Trophy, Video } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamLogo } from "@/react-app/components/TeamLogo";

export type UnifiedViewMode = "pregame" | "live" | "final";

export function deriveUnifiedViewMode(status?: string): UnifiedViewMode {
  const normalized = String(status || "").toUpperCase();
  if (normalized.includes("LIVE") || normalized.includes("IN_PROGRESS") || normalized.includes("INPROGRESS")) return "live";
  if (normalized.includes("FINAL") || normalized.includes("COMPLETE") || normalized.includes("COMPLETED") || normalized.includes("CLOSED")) return "final";
  return "pregame";
}

export function deriveUnifiedFinalOutcomes(params: {
  homeTeam: string;
  awayTeam: string;
  homeScore?: number | null;
  awayScore?: number | null;
  spread?: number;
  total?: number;
}) {
  const homeScore = params.homeScore ?? 0;
  const awayScore = params.awayScore ?? 0;
  const winner = homeScore === awayScore ? "Push/Tie" : homeScore > awayScore ? params.homeTeam : params.awayTeam;
  const totalScore = homeScore + awayScore;

  const spreadResult =
    params.spread === undefined
      ? "Spread unavailable"
      : `${params.homeTeam} ${params.spread > 0 ? "+" : ""}${params.spread} | Margin ${homeScore - awayScore > 0 ? "+" : ""}${homeScore - awayScore}`;
  const coverResult =
    params.spread === undefined
      ? "Cover unavailable"
      : homeScore + params.spread === awayScore
        ? "Push"
        : homeScore + params.spread > awayScore
          ? `${params.homeTeam} covered`
          : `${params.awayTeam} covered`;

  const totalResult = params.total === undefined ? "Total unavailable" : `${totalScore} vs ${params.total}`;
  const overUnderResult =
    params.total === undefined
      ? "O/U unavailable"
      : totalScore === params.total
        ? "Push"
        : totalScore > params.total
          ? "Over"
          : "Under";

  return { winner, spreadResult, coverResult, totalResult, overUnderResult };
}

export function UnifiedLiveSignalStrip({
  cards,
}: {
  cards: Array<{ title: string; value: string; chip: string; tone: "red" | "green" | "amber" }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className={cn(
            "relative overflow-hidden rounded-xl border bg-[#121821] p-3",
            card.tone === "red" && "border-red-500/30 shadow-[0_0_22px_rgba(239,68,68,0.18)]",
            card.tone === "green" && "border-emerald-500/30 shadow-[0_0_22px_rgba(16,185,129,0.18)]",
            card.tone === "amber" && "border-amber-500/30 shadow-[0_0_22px_rgba(245,158,11,0.18)]"
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute left-0 right-0 top-0 h-px",
              card.tone === "red" && "bg-gradient-to-r from-transparent via-red-300/55 to-transparent",
              card.tone === "green" && "bg-gradient-to-r from-transparent via-emerald-300/55 to-transparent",
              card.tone === "amber" && "bg-gradient-to-r from-transparent via-amber-300/55 to-transparent"
            )}
          />
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide",
              card.tone === "red" && "text-red-300",
              card.tone === "green" && "text-emerald-300",
              card.tone === "amber" && "text-amber-300"
            )}
          >
            {card.title}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">{card.value}</p>
          <span
            className={cn(
              "mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              card.tone === "red" && "border-red-300/45 bg-red-500/20 text-red-100",
              card.tone === "green" && "border-emerald-300/45 bg-emerald-500/20 text-emerald-100",
              card.tone === "amber" && "border-amber-300/45 bg-amber-500/20 text-amber-100"
            )}
          >
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {card.chip}
          </span>
        </div>
      ))}
    </div>
  );
}

export function UnifiedCoachGLivePanel({
  pregameRead,
  liveNotes,
}: {
  pregameRead: string;
  liveNotes: Array<{ time: string; note: string }>;
}) {
  return (
    <div className="rounded-xl border border-cyan-500/25 bg-[#1B2633] p-4 md:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cyan-300" />
        <h3 className="text-sm font-semibold text-[#E5E7EB]">Coach G Live Take</h3>
      </div>
      <details className="rounded-lg border border-white/[0.05] bg-[#16202B] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#E5E7EB]">Pregame Coach G Read</summary>
        <p className="mt-2 text-sm text-[#9CA3AF]">{pregameRead}</p>
      </details>
      <div className="mt-3 rounded-lg border border-white/[0.05] bg-[#16202B] p-3">
        <div className="mb-2 flex items-center gap-2">
          <FileText className="h-4 w-4 text-cyan-300" />
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Coach G Live Notes</p>
        </div>
        <div className="space-y-1.5">
          {liveNotes.map((item, idx) => (
            <p key={`${item.time}-${idx}`} className="text-sm text-[#9CA3AF]">
              <span className="font-semibold text-[#E5E7EB]">{item.time}</span> - {item.note}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function UnifiedVideoPanel({
  title,
  subtitle,
  videoUrl,
  fallbackText,
  isPostgame = false,
}: {
  title: string;
  subtitle: string;
  videoUrl?: string;
  fallbackText: string;
  isPostgame?: boolean;
}) {
  const fallbackToneClass = fallbackText.toLowerCase().includes("process")
    ? "border-violet-400/30 bg-violet-500/10 text-violet-100"
    : fallbackText.toLowerCase().includes("sync")
      ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
      : "border-amber-400/30 bg-amber-500/10 text-amber-100";
  return (
    <div className="rounded-xl border border-violet-500/25 bg-[#121821] p-4 md:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Video className={cn("h-4 w-4", isPostgame ? "text-violet-300" : "text-violet-300")} />
        <h3 className="text-sm font-semibold text-[#E5E7EB]">{title}</h3>
      </div>
      <p className="mb-3 text-xs text-[#9CA3AF]">{subtitle}</p>
      {videoUrl ? (
        <video src={videoUrl} controls className="w-full rounded-xl border border-white/[0.05] bg-black/60" />
      ) : (
        <p className={cn("rounded-lg border px-3 py-2 text-sm", fallbackToneClass)}>{fallbackText}</p>
      )}
    </div>
  );
}

export function UnifiedPlayFeedPanel({
  items,
}: {
  items: Array<{ id: string; period?: string; clock?: string; time?: string; description: string }>;
}) {
  return (
    <div className="rounded-xl border border-emerald-500/25 bg-[#121821] p-4 md:p-5">
      <div className="mb-2 flex items-center gap-2">
        <ListOrdered className="h-4 w-4 text-emerald-300" />
        <h3 className="text-sm font-semibold text-[#E5E7EB]">Play-By-Play Feed</h3>
      </div>
      <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border border-white/[0.05] bg-[#16202B] px-3 py-2">
              <p className="text-xs text-[#6B7280]">
                {[item.period, item.clock, item.time].filter(Boolean).join(" • ")}
              </p>
              <p className="text-sm text-[#E5E7EB]">{item.description}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-[#9CA3AF]">No live events yet.</p>
        )}
      </div>
    </div>
  );
}

export function UnifiedFinalHeroPanel({
  sport,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  spreadResult,
  totalResult,
  coverResult,
  overUnderResult,
}: {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number | null;
  awayScore?: number | null;
  spreadResult: string;
  totalResult: string;
  coverResult: string;
  overUnderResult: string;
}) {
  const hasBothScores = typeof awayScore === "number" && typeof homeScore === "number";
  const awayWon = hasBothScores && awayScore > homeScore;
  const homeWon = hasBothScores && homeScore > awayScore;
  return (
    <div className="rounded-xl border border-violet-400/24 bg-[#1B2633] p-4 md:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-violet-300" />
        <h3 className="text-sm font-semibold text-[#E5E7EB]">Final Hero</h3>
      </div>
      <div className="grid grid-cols-3 items-center gap-3">
        <div className="rounded-xl border border-white/[0.05] bg-[#121821] p-3 text-center">
          <div className="mb-2 flex justify-center">
            <TeamLogo
              teamCode={awayTeam}
              sport={sport}
              size={44}
              winnerGlow={awayWon}
              className="drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)]"
            />
          </div>
          <p className="text-xs text-[#9CA3AF]">{awayTeam}</p>
          <p className="text-3xl font-black text-[#E5E7EB]">{awayScore ?? "-"}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wide text-violet-300">Final</p>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-[#121821] p-3 text-center">
          <div className="mb-2 flex justify-center">
            <TeamLogo
              teamCode={homeTeam}
              sport={sport}
              size={44}
              winnerGlow={homeWon}
              className="drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)]"
            />
          </div>
          <p className="text-xs text-[#9CA3AF]">{homeTeam}</p>
          <p className="text-3xl font-black text-[#E5E7EB]">{homeScore ?? "-"}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-white/[0.05] bg-[#121821] p-2 text-sm text-[#9CA3AF]">Final spread result: <span className="font-semibold text-[#E5E7EB]">{spreadResult}</span></div>
        <div className="rounded-lg border border-white/[0.05] bg-[#121821] p-2 text-sm text-[#9CA3AF]">Final total result: <span className="font-semibold text-[#E5E7EB]">{totalResult}</span></div>
        <div className="rounded-lg border border-white/[0.05] bg-[#121821] p-2 text-sm text-[#9CA3AF]">Cover / No Cover: <span className="font-semibold text-[#E5E7EB]">{coverResult}</span></div>
        <div className="rounded-lg border border-white/[0.05] bg-[#121821] p-2 text-sm text-[#9CA3AF]">Over / Under: <span className="font-semibold text-[#E5E7EB]">{overUnderResult}</span></div>
      </div>
    </div>
  );
}
