import { useNavigate } from "react-router-dom";
import { getNcaabTournamentState } from "@/react-app/lib/ncaabTournamentSeason";
import { TournamentArchivePanel } from "@/react-app/components/tournament/TournamentArchivePanel";

export default function TournamentCentralPage() {
  const navigate = useNavigate();
  const state = getNcaabTournamentState();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#090c16] via-[#0d1120] to-[#090c16] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/20 via-white/[0.03] to-transparent p-6">
          <p className="text-xs uppercase tracking-wider text-orange-200">NCAAB Postseason</p>
          <h1 className="text-3xl font-black text-white md:text-4xl">Tournament Central</h1>
          <p className="mt-2 text-sm text-white/75">
            Premium postseason experience for March Madness and NIT. Regular season hub remains your default.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <button
            onClick={() => navigate("/sports/ncaab/tournament/march-madness")}
            className="md:col-span-2 rounded-2xl border border-orange-400/30 bg-gradient-to-br from-orange-500/15 to-red-500/10 p-5 text-left hover:bg-orange-500/20"
          >
            <p className="text-xs uppercase tracking-wide text-orange-200">Primary</p>
            <h2 className="text-2xl font-black text-white">March Madness</h2>
            <p className="mt-2 text-sm text-white/75">
              Command center with live score pills, bracket centerpiece, Coach G insights, upset watch, and Cinderella tracker.
            </p>
          </button>
          <button
            onClick={() => navigate("/sports/ncaab/tournament/nit")}
            className="rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/10 to-transparent p-5 text-left hover:bg-cyan-500/15"
          >
            <p className="text-xs uppercase tracking-wide text-cyan-200">Secondary</p>
            <h2 className="text-xl font-bold text-white">NIT</h2>
            <p className="mt-2 text-sm text-white/70">
              Lighter postseason hub with bracket, today&apos;s games, and Coach G quick notes.
            </p>
          </button>
        </section>

        {state.showArchiveEntry && (
          <TournamentArchivePanel
            seasonLabel={`${state.seasonYear} Tournament Archive`}
            summary="Postseason completed. Explore final bracket states, winners, and archived Coach G insights."
            onOpen={() => navigate("/sports/ncaab/tournament/march-madness")}
          />
        )}
      </div>
    </div>
  );
}

