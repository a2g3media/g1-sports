import { useEffect, useState, useCallback, useRef } from "react";
import { AlertCircle, Check, ClipboardList, HelpCircle, Info, Shield, Sparkles, X } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface League {
  id: number;
}

interface RuleItem {
  key: string;
  text: string;
}

interface RuleEnginePayload {
  engine: string;
  mode: string;
  pool_rules: {
    system_rules: RuleItem[];
    commissioner_rules: RuleItem[];
    dynamic_rules: RuleItem[];
  };
  ui: {
    overlay_rules: string[];
    full_rules: string[];
    inline_messages: string[];
  };
}

function computeRuleHash(lines: string[]): string {
  const source = lines.join("|");
  let hash = 5381;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
  }
  return `r${(hash >>> 0).toString(16)}`;
}

function RuleTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="ml-1 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="More info"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 rounded-lg bg-slate-800 border border-white/10 shadow-xl text-xs text-slate-200 leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 rotate-45 bg-slate-800 border-r border-b border-white/10" />
        </div>
      )}
    </span>
  );
}

function RulesAcceptanceOverlay({
  rules,
  onAccept,
  onDismiss,
}: {
  rules: string[];
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 10) {
      setScrolledToEnd(true);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      const { scrollHeight, clientHeight } = scrollRef.current;
      if (scrollHeight <= clientHeight) setScrolledToEnd(true);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Pool Rules</h2>
              <p className="text-xs text-slate-400">Review and accept before continuing</p>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="px-6 max-h-[50vh] overflow-y-auto"
        >
          <ol className="space-y-3 pb-4">
            {rules.map((rule, idx) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="shrink-0 w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-xs text-slate-400 font-mono mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-slate-200 leading-relaxed">{rule}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <button onClick={onDismiss} className="text-sm text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4 inline mr-1" />
            Dismiss
          </button>
          <button
            onClick={onAccept}
            disabled={!scrolledToEnd}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              scrolledToEnd
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-white/[0.05] text-slate-500 cursor-not-allowed"
            )}
          >
            <Check className="w-4 h-4" />
            {scrolledToEnd ? "I Accept" : "Scroll to review all rules"}
          </button>
        </div>
      </div>
    </div>
  );
}

const TOOLTIP_MAP: Record<string, string> = {
  lock_type: "Determines when picks lock — at each game's scheduled start, or all at once when the first game begins.",
  scoring_type: "Straight = win/loss. ATS = against the spread. Confidence = assign point values to picks.",
  tie_handling: "How ties/pushes are handled: treated as a loss, no contest (excluded from record), or a half-win.",
  missed_pick: "What happens if a member doesn't submit a pick before lock: counted as a loss, a no-pick (excluded), or the most popular pick is auto-assigned.",
  canceled_game: "How a canceled or postponed game is handled: void the pick, count it as a loss, or reschedule.",
  payout_type: "Determines when payouts occur: season-end, weekly, per-round, or a hybrid of multiple.",
  visibility_type: "Controls when members can see each other's picks: after lock, after results, or never.",
};

export function PoolHubRules({ league }: { league: League }) {
  const [payload, setPayload] = useState<RuleEnginePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [rulesResponse, acceptanceResponse] = await Promise.all([
          fetch(`/api/leagues/${league.id}/rules-engine`, { credentials: "include" }),
          fetch(`/api/leagues/${league.id}/rules-acceptance`, { credentials: "include" }),
        ]);
        if (!rulesResponse.ok) throw new Error("Failed to load rule engine");
        const data = await rulesResponse.json();
        const acceptance = acceptanceResponse.ok
          ? await acceptanceResponse.json() as { accepted?: boolean; accepted_at?: string | null }
          : null;
        if (!cancelled) {
          setPayload(data as RuleEnginePayload);
          const localFallbackAccepted = localStorage.getItem(`rules_accepted_${league.id}`) === "true";
          const serverAccepted = acceptance?.accepted === true;
          const resolvedAccepted = serverAccepted || localFallbackAccepted;
          setAccepted(resolvedAccepted);
          setAcceptedAt(acceptance?.accepted_at || null);
          setShowOverlay(!resolvedAccepted);
        }
      } catch {
        if (!cancelled) setError("Unable to load rules right now.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [league.id]);

  const handleAccept = useCallback(() => {
    const allRules = payload
      ? [
        ...payload.ui.overlay_rules,
        ...payload.ui.full_rules.filter((r) => !payload.ui.overlay_rules.includes(r)),
      ]
      : [];
    const ruleHash = computeRuleHash(allRules);
    setAccepted(true);
    setShowOverlay(false);
    localStorage.setItem(`rules_accepted_${league.id}`, "true");
    void fetch(`/api/leagues/${league.id}/rules-acceptance`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rule_hash: ruleHash,
        rule_snapshot: payload?.pool_rules || null,
      }),
    }).then(async (res) => {
      if (!res.ok) return;
      const saved = await res.json() as { accepted_at?: string | null };
      setAcceptedAt(saved.accepted_at || null);
    }).catch(() => {
      // UI state is preserved locally even if audit write fails.
    });
  }, [league.id, payload]);

  if (isLoading) {
    return (
      <div className="card-elevated p-6">
        <p className="text-sm text-muted-foreground">Loading rules...</p>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="card-elevated p-6 flex items-center gap-2 text-sm text-amber-400">
        <AlertCircle className="w-4 h-4" />
        <span>{error || "Rule payload unavailable."}</span>
      </div>
    );
  }

  const allOverlayRules = [
    ...payload.ui.overlay_rules,
    ...payload.ui.full_rules.filter((r) => !payload.ui.overlay_rules.includes(r)),
  ];

  return (
    <>
      {showOverlay && allOverlayRules.length > 0 && (
        <RulesAcceptanceOverlay
          rules={allOverlayRules}
          onAccept={handleAccept}
          onDismiss={() => setShowOverlay(false)}
        />
      )}

      <div className="space-y-4 animate-page-enter">
        {/* Acceptance Status */}
        {accepted && (
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 px-4 py-2.5 flex items-center gap-2 text-sm text-emerald-400">
            <Check className="w-4 h-4" />
            <span>
              Rules reviewed and accepted
              {acceptedAt ? ` (${new Date(acceptedAt).toLocaleString()})` : ""}
            </span>
            <button
              onClick={() => setShowOverlay(true)}
              className="ml-auto text-xs text-emerald-400/70 hover:text-emerald-300 transition-colors"
            >
              Review again
            </button>
          </div>
        )}
        {!accepted && (
          <button
            onClick={() => setShowOverlay(true)}
            className="w-full rounded-xl bg-amber-500/5 border border-amber-500/10 px-4 py-3 flex items-center gap-2 text-sm text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <Shield className="w-4 h-4" />
            <span>Rules have not been accepted yet — tap to review</span>
          </button>
        )}

        {/* Engine Summary */}
        <div className="card-elevated p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Rule Engine Summary</h3>
            </div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              {payload.engine} &middot; {payload.mode}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {payload.ui.overlay_rules.map((rule, idx) => (
              <span key={`${idx}-${rule}`} className="rounded-full px-3 py-1 text-xs bg-primary/10 border border-primary/20">
                {rule}
              </span>
            ))}
          </div>
        </div>

        {/* System Rules */}
        <div className="card-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-semibold">System Rules</h4>
          </div>
          <ul className="space-y-2">
            {payload.pool_rules.system_rules.map((rule) => (
              <li key={rule.key} className="text-sm text-muted-foreground flex items-start gap-1">
                <span>&bull; {rule.text}</span>
                {TOOLTIP_MAP[rule.key] && <RuleTooltip text={TOOLTIP_MAP[rule.key]} />}
              </li>
            ))}
          </ul>
        </div>

        {/* Commissioner Rules */}
        <div className="card-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-semibold">Commissioner Rules</h4>
          </div>
          <ul className="space-y-2">
            {payload.pool_rules.commissioner_rules.map((rule) => (
              <li key={rule.key} className="text-sm text-muted-foreground flex items-start gap-1">
                <span>&bull; {rule.text}</span>
                {TOOLTIP_MAP[rule.key] && <RuleTooltip text={TOOLTIP_MAP[rule.key]} />}
              </li>
            ))}
          </ul>
        </div>

        {/* Dynamic Rules */}
        {payload.pool_rules.dynamic_rules.length > 0 && (
          <div className="card-elevated p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-semibold">Dynamic Rules</h4>
            </div>
            <ul className="space-y-2">
              {payload.pool_rules.dynamic_rules.map((rule) => (
                <li key={rule.key} className="text-sm text-muted-foreground flex items-start gap-1">
                  <span>&bull; {rule.text}</span>
                  {TOOLTIP_MAP[rule.key] && <RuleTooltip text={TOOLTIP_MAP[rule.key]} />}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Inline Messages */}
        {payload.ui.inline_messages.length > 0 && (
          <div className="card-elevated p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-slate-400" />
              <h4 className="text-sm font-semibold">Notes</h4>
            </div>
            <div className="space-y-2">
              {payload.ui.inline_messages.map((msg, idx) => (
                <p key={idx} className="text-sm text-muted-foreground italic">
                  {msg}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
