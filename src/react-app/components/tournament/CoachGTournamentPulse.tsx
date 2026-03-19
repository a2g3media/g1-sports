import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";

export function CoachGTournamentPulse({
  lines,
  onAskCoachG,
}: {
  lines: string[];
  onAskCoachG: () => void;
}) {
  return (
    <section className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 to-transparent p-4">
      <div className="mb-3 flex items-center gap-3">
        <CoachGAvatar size="sm" presence="alert" />
        <div>
          <p className="text-xs uppercase tracking-wide text-violet-200">Coach G Live Pulse</p>
          <h3 className="text-base font-semibold text-white">Tournament Guru Desk</h3>
        </div>
      </div>
      <ul className="space-y-1 text-sm text-white/85">
        {lines.map((line) => (
          <li key={line}>- {line}</li>
        ))}
      </ul>
      <button
        onClick={onAskCoachG}
        className="mt-3 rounded-lg border border-violet-300/40 bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-200 hover:bg-violet-500/30"
      >
        Ask Coach G
      </button>
    </section>
  );
}

