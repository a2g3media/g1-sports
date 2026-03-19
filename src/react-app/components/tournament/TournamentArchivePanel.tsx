export function TournamentArchivePanel({
  seasonLabel,
  summary,
  onOpen,
}: {
  seasonLabel: string;
  summary: string;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-wide text-white/50">{seasonLabel}</p>
      <h3 className="text-lg font-bold text-white">Tournament Archive</h3>
      <p className="mt-1 text-sm text-white/70">{summary}</p>
      <button
        onClick={onOpen}
        className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
      >
        Open Archive
      </button>
    </div>
  );
}

