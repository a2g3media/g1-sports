import { useMemo, useState } from "react";
import { Search, ArrowRight, Clock3, Users, Shield, Sparkles } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

export interface ScoutFlowItem {
  id: string;
  label: string;
  subtitle?: string;
  kind: "player" | "team" | "recent";
  onSelect: () => void;
}

interface PremiumScoutFlowBarProps {
  title?: string;
  placeholder?: string;
  items: ScoutFlowItem[];
  quickActions?: Array<{ id: string; label: string; onClick: () => void }>;
}

export default function PremiumScoutFlowBar({
  title = "Coach G Flow",
  placeholder = "Search players or teams...",
  items,
  quickActions = [],
}: PremiumScoutFlowBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const token = query.trim().toLowerCase();
    const base = items.slice(0, 24);
    if (!token) return base;
    return base
      .filter((item) =>
        `${item.label} ${item.subtitle || ""}`.toLowerCase().includes(token)
      )
      .slice(0, 24);
  }, [items, query]);
  const quickPicks = useMemo(() => filtered.slice(0, 6), [filtered]);

  const iconFor = (kind: ScoutFlowItem["kind"]) => {
    if (kind === "player") return <Users className="w-3.5 h-3.5 text-cyan-200/90" />;
    if (kind === "team") return <Shield className="w-3.5 h-3.5 text-indigo-200/90" />;
    return <Clock3 className="w-3.5 h-3.5 text-amber-200/90" />;
  };

  return (
    <div className="rounded-xl border border-cyan-400/20 bg-gradient-to-r from-[#0d1628]/95 via-[#0b1323]/95 to-[#111827]/95 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/12 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {title}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.slice(0, 3).map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/75 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-200/60" />
          <input
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-cyan-400/20 bg-white/[0.03] pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25"
          />
        </div>

        {quickPicks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {quickPicks.map((item) => (
              <button
                key={`chip:${item.id}`}
                type="button"
                onClick={item.onSelect}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-cyan-500/20 hover:border-cyan-300/35 transition-colors"
              >
                {iconFor(item.kind)}
                <span className="max-w-[160px] truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {open && (
          <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-white/[0.08] bg-black/25 backdrop-blur-sm">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-white/55">No matches yet. Try another name or team.</div>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onSelect}
                  className={cn(
                    "w-full px-3 py-2.5 text-left border-b border-white/[0.05] last:border-b-0",
                    "hover:bg-white/[0.05] transition-colors"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {iconFor(item.kind)}
                        <span className="truncate text-sm font-semibold text-white">{item.label}</span>
                      </div>
                      {item.subtitle && (
                        <div className="mt-0.5 truncate text-[11px] text-white/55">{item.subtitle}</div>
                      )}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-cyan-200/75 flex-shrink-0" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

