import { useEffect, useState } from "react";
import { ClipboardList, Info, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import type { PoolRuleEngineOutput } from "@/shared/poolRuleEngine";

interface RuleEnginePreviewCardProps {
  output: PoolRuleEngineOutput;
  title?: string;
  description?: string;
}

const FULL_RULES_PREF_KEY = "g1-rule-engine-preview-show-full";

export function RuleEnginePreviewCard({
  output,
  title = "Live Rule Engine Preview",
  description = "This updates as settings change and powers overlay, rules tab, and inline tips.",
}: RuleEnginePreviewCardProps) {
  const [showFullRules, setShowFullRules] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(FULL_RULES_PREF_KEY) === "1";
  });
  const fullRules = output.ui.full_rules || [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FULL_RULES_PREF_KEY, showFullRules ? "1" : "0");
  }, [showFullRules]);

  return (
    <Card className="border-border/60">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] uppercase tracking-wide text-primary">
            {output.engine} • {output.mode}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {output.ui.overlay_rules.map((rule) => (
            <span key={rule} className="rounded-full px-3 py-1 text-xs border border-primary/20 bg-primary/10">
              {rule}
            </span>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              System Rules
            </p>
            <div className="space-y-1">
              {output.pool_rules.system_rules.slice(0, 4).map((rule) => (
                <p key={rule.key} className="text-sm text-muted-foreground">
                  • {rule.text}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Commissioner Rules
            </p>
            <div className="space-y-1">
              {output.pool_rules.commissioner_rules.slice(0, 4).map((rule) => (
                <p key={rule.key} className="text-sm text-muted-foreground">
                  • {rule.text}
                </p>
              ))}
            </div>
          </div>
        </div>

        {output.ui.inline_messages.length > 0 && (
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Inline Messages</p>
            <div className="space-y-1">
              {output.ui.inline_messages.slice(0, 3).map((msg) => (
                <p key={msg} className="text-sm">
                  {msg}
                </p>
              ))}
            </div>
          </div>
        )}

        {fullRules.length > 0 && (
          <div className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Full Rules Payload ({fullRules.length})
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowFullRules((prev) => !prev)}
              >
                {showFullRules ? "Hide Full Rules" : "Show Full Rules"}
              </Button>
            </div>
            {showFullRules && (
              <div className="mt-3 max-h-64 overflow-auto space-y-1 rounded-md border border-dashed border-border/70 bg-muted/20 p-2">
                {fullRules.map((rule, index) => (
                  <p key={`${index}-${rule}`} className="text-sm text-muted-foreground">
                    {index + 1}. {rule}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
