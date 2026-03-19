import type { BracketViewMode } from "@/react-app/lib/ncaabTournamentData";
import { cn } from "@/react-app/lib/utils";

export function BracketConnector({
  active,
  mode,
}: {
  active?: boolean;
  mode: BracketViewMode;
}) {
  return (
    <div className="hidden w-8 items-center justify-center md:flex" aria-hidden>
      <div className="flex w-full items-center">
        <div
          className={cn(
            "h-px flex-1",
            active
              ? mode === "live"
                ? "bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.8)]"
                : "bg-cyan-300/60"
              : "bg-white/15"
          )}
        />
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            active
              ? mode === "live"
                ? "bg-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.9)]"
                : "bg-cyan-300/80"
              : "bg-white/25"
          )}
        />
      </div>
    </div>
  );
}

