import { useEffect, useState } from "react";
import { AlertCircle, ClipboardList, Info, Sparkles } from "lucide-react";

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

export function PoolHubRules({ league }: { league: League }) {
  const [payload, setPayload] = useState<RuleEnginePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/leagues/${league.id}/rules-engine`, { credentials: "include" });
        if (!response.ok) throw new Error("Failed to load rule engine");
        const data = await response.json();
        if (!cancelled) setPayload(data);
      } catch {
        if (!cancelled) setError("Unable to load rules right now.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [league.id]);

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

  return (
    <div className="space-y-4 animate-page-enter">
      <div className="card-elevated p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Rule Engine Summary</h3>
          </div>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {payload.engine} • {payload.mode}
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

      <div className="card-elevated p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-semibold">System Rules</h4>
        </div>
        <ul className="space-y-2">
          {payload.pool_rules.system_rules.map((rule) => (
            <li key={rule.key} className="text-sm text-muted-foreground">
              • {rule.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="card-elevated p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-semibold">Commissioner Rules</h4>
        </div>
        <ul className="space-y-2">
          {payload.pool_rules.commissioner_rules.map((rule) => (
            <li key={rule.key} className="text-sm text-muted-foreground">
              • {rule.text}
            </li>
          ))}
        </ul>
      </div>

      {payload.pool_rules.dynamic_rules.length > 0 && (
        <div className="card-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-semibold">Dynamic Rules</h4>
          </div>
          <ul className="space-y-2">
            {payload.pool_rules.dynamic_rules.map((rule) => (
              <li key={rule.key} className="text-sm text-muted-foreground">
                • {rule.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
