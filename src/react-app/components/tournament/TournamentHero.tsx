type HeroTab = {
  key: string;
  label: string;
};

export function TournamentHero({
  title,
  subtitle,
  roundLabel,
  tabs,
  activeTab,
  onTabSelect,
  tone = "primary",
}: {
  title: string;
  subtitle: string;
  roundLabel: string;
  tabs: HeroTab[];
  activeTab: string;
  onTabSelect: (key: string) => void;
  tone?: "primary" | "secondary";
}) {
  const palette = tone === "secondary"
    ? {
        shell: "from-cyan-500/12 via-black/20 to-black/40",
        chip: "border-cyan-300/40 bg-cyan-500/15 text-cyan-100",
        subtitle: "text-cyan-200/90",
      }
    : {
        shell: "from-indigo-500/15 via-black/20 to-black/40",
        chip: "border-indigo-300/40 bg-indigo-500/15 text-indigo-200",
        subtitle: "text-indigo-300/90",
      };
  return (
    <section className={`rounded-2xl border border-white/10 bg-gradient-to-br p-5 ${palette.shell}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-xs uppercase tracking-wider ${palette.subtitle}`}>{subtitle}</p>
          <h1 className="text-3xl font-black text-white">{title}</h1>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${palette.chip}`}>
          {roundLabel}
        </span>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabSelect(tab.key)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-black"
                : "bg-white/10 text-white/75 hover:bg-white/20"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </section>
  );
}

