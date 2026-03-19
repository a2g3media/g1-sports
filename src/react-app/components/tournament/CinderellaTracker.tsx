export function CinderellaTracker({
  teams,
}: {
  teams: Array<{ team: string; seed: number; roundReached: string }>;
}) {
  return (
    <section className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4">
      <h3 className="mb-3 text-lg font-bold text-white">Cinderella Tracker</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {teams.map((team) => (
          <div key={`${team.team}-${team.seed}`} className="rounded-lg border border-white/10 bg-black/25 p-2">
            <p className="text-sm text-white">#{team.seed} {team.team}</p>
            <p className="text-xs text-cyan-200">{team.roundReached}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

