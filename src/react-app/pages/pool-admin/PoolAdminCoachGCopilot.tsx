import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, AlertTriangle, CheckCircle2, Clock3, Bot, MessageSquare, Send, Loader2, TrendingUp, TrendingDown, Minus, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { Input } from "@/react-app/components/ui/input";
import { cn } from "@/react-app/lib/utils";
import { AIAssistant } from "@/react-app/components/AIAssistant";
import { Switch } from "@/react-app/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/react-app/components/ui/alert-dialog";

interface PoolOption {
  id: number;
  name: string;
  status: "active" | "upcoming" | "completed";
}

interface CopilotSummary {
  league_id: number;
  league_name: string;
  current_period: string;
  next_lock_time: string | null;
  urgency: "critical" | "attention" | "healthy";
  coach_message: string;
  stats: {
    joined_members: number;
    missing_picks: number;
    unpaid_members: number;
    payment_pending_members: number;
    pending_invites: number;
    pending_approvals: number;
  };
  flags: {
    joinApprovalRequired: boolean;
    requireJoinEmail: boolean;
    requireJoinPhone: boolean;
    weeklyRankRecapEnabled: boolean;
    weeklyRankRecapPushEnabled: boolean;
    listedInMarketplace: boolean;
  };
  checklist: Array<{
    id: string;
    label: string;
    status: "todo" | "done";
  }>;
  suggestions: Array<{
    action: "remind_missing_picks" | "remind_unpaid_members" | "approve_all_pending";
    title: string;
    reason: string;
    confidence: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
  }>;
}

interface CopilotActionResult {
  success: boolean;
  action: string;
  affected_count: number;
  message: string;
}

interface CopilotAutomationSettings {
  league_id: number;
  morningBriefEnabled: boolean;
  morningBriefHourLocal: number;
  preLockNudgeEnabled: boolean;
  periodWrapEnabled: boolean;
}

interface CopilotAutomationStatus {
  league_id: number;
  last_runs: {
    morning: string | null;
    prelock: string | null;
    wrap: string | null;
  };
  next_runs: {
    morning: string | null;
    prelock: string | null;
    wrap: string | null;
  };
  telemetry: {
    queued_pending: number;
    sent_last_24h: number;
    failed_last_24h: number;
    retryable_failed: number;
  };
  reliability: {
    health_state: "green" | "yellow" | "red";
    health_score: number;
    failure_rate_24h: number;
    sla_target_failure_rate: number;
    trends: {
      sent_delta_vs_prior_24h: number;
      failed_delta_vs_prior_24h: number;
      retryable_delta_vs_prior_24h: number;
    };
    note: string;
  };
}

type CopilotActionKey = "remind_missing_picks" | "remind_unpaid_members" | "approve_all_pending";

type CopilotChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions?: Array<{
    action: CopilotActionKey;
    title: string;
    reason: string;
    confidence: "high" | "medium" | "low";
  }>;
};

function formatLockTime(value: string | null): string {
  if (!value) return "No scheduled lock found";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No scheduled lock found";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reliabilityClass(state: "green" | "yellow" | "red"): string {
  if (state === "green") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (state === "yellow") return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30";
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "0";
}

function formatDispatchType(type: "morning" | "prelock" | "wrap"): string {
  if (type === "morning") return "morning brief";
  if (type === "prelock") return "pre-lock wave";
  return "period wrap";
}

const COPILOT_PHASE7_RELEASE_NOTES = [
  "Health ring meter now shows live automation score and health state.",
  "24-hour trend chips compare sent, failed, and retryable delivery deltas vs prior day.",
  "Fix It For Me (Smart) runs retry + guided re-dispatch flow with confirmation.",
  "Last Smart Fix result and timestamp now appear beside controls.",
  "Clear status lets admins dismiss Smart Fix outcome badges anytime.",
];
const COPILOT_RELEASE_NOTES_HIDE_KEY = "pool-admin-coachg-release-notes-hidden";

export function PoolAdminCoachGCopilot({
  pools,
  isDemoMode,
}: {
  pools: PoolOption[];
  isDemoMode: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedPoolId, setSelectedPoolId] = useState<string>(() => {
    const active = pools.find((p) => p.status === "active");
    return String(active?.id || pools[0]?.id || "");
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotMessages, setCopilotMessages] = useState<CopilotChatMessage[]>([]);
  const [lastActionMessage, setLastActionMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    action: CopilotActionKey;
    title: string;
    reason: string;
  } | null>(null);
  const [lastAutomationMessage, setLastAutomationMessage] = useState("");
  const [fixDialogOpen, setFixDialogOpen] = useState(false);
  const [lastSmartFixRunAt, setLastSmartFixRunAt] = useState<string | null>(null);
  const [lastSmartFixOutcome, setLastSmartFixOutcome] = useState<"success" | "error" | null>(null);
  const [releaseNotesCollapsed, setReleaseNotesCollapsed] = useState(false);
  const [releaseNotesDismissed, setReleaseNotesDismissed] = useState(false);

  const selectedPool = useMemo(
    () => pools.find((p) => String(p.id) === selectedPoolId) || null,
    [pools, selectedPoolId],
  );

  const headers = useMemo<HeadersInit | undefined>(() => {
    if (!isDemoMode) return undefined;
    return { "X-Demo-Mode": "true" };
  }, [isDemoMode]);

  const summary = useQuery<CopilotSummary>({
    queryKey: ["pool-admin", "coachg-copilot-summary", selectedPoolId, isDemoMode],
    enabled: !!selectedPoolId,
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/summary`, {
        credentials: "include",
        headers,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to load Coach G copilot summary");
      return payload as CopilotSummary;
    },
    refetchInterval: 20_000,
  });

  const action = useMutation<CopilotActionResult, Error, string>({
    mutationFn: async (actionType: string) => {
      const reqHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) reqHeaders["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/action`, {
        method: "POST",
        credentials: "include",
        headers: reqHeaders,
        body: JSON.stringify({ action: actionType, confirm: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Coach G action failed");
      return payload as CopilotActionResult;
    },
    onSuccess: (result) => {
      setLastActionMessage(result.message || "Coach G action completed.");
      setPendingAction(null);
      void queryClient.invalidateQueries({
        queryKey: ["pool-admin", "coachg-copilot-summary", selectedPoolId, isDemoMode],
      });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin", "my-pools", isDemoMode] });
    },
    onError: (err) => {
      setLastActionMessage(err.message || "Coach G action failed.");
      setPendingAction(null);
    },
  });

  if (!pools.length) return null;

  const urgencyTone = summary.data?.urgency || "healthy";
  const urgencyClass =
    urgencyTone === "critical"
      ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30"
      : urgencyTone === "attention"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";

  const requestAction = (
    actionType: CopilotActionKey,
    title: string,
    reason: string,
  ) => {
    if (!selectedPoolId || action.isPending) return;
    setPendingAction({ action: actionType, title, reason });
  };

  const runConfirmedAction = () => {
    if (!pendingAction || action.isPending) return;
    action.mutate(pendingAction.action);
  };

  const confidenceClass = (confidence: "high" | "medium" | "low") => {
    if (confidence === "high") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    if (confidence === "medium") return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
    return "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30";
  };

  const copilotChat = useMutation<
    {
      response: string;
      action_plan?: string[];
      suggested_actions?: Array<{
        action: CopilotActionKey;
        title: string;
        reason: string;
        confidence: "high" | "medium" | "low";
      }>;
    },
    Error,
    string
  >({
    mutationFn: async (messageText: string) => {
      const reqHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) reqHeaders["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/chat`, {
        method: "POST",
        credentials: "include",
        headers: reqHeaders,
        body: JSON.stringify({ message: messageText }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Coach G chat failed");
      return payload as {
        response: string;
        action_plan?: string[];
        suggested_actions?: Array<{
          action: CopilotActionKey;
          title: string;
          reason: string;
          confidence: "high" | "medium" | "low";
        }>;
      };
    },
    onSuccess: (payload, userMessage) => {
      const userMsg: CopilotChatMessage = {
        id: `${Date.now()}-user`,
        role: "user",
        content: userMessage,
      };
      const assistantMsg: CopilotChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: payload.response || "Coach G completed analysis.",
        suggested_actions: payload.suggested_actions || [],
      };
      setCopilotMessages((prev) => [...prev, userMsg, assistantMsg]);
      setCopilotInput("");
    },
  });

  const automation = useQuery<CopilotAutomationSettings>({
    queryKey: ["pool-admin", "coachg-copilot-automation", selectedPoolId, isDemoMode],
    enabled: !!selectedPoolId,
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/automation`, {
        credentials: "include",
        headers,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to load automation settings");
      return payload as CopilotAutomationSettings;
    },
  });

  const saveAutomation = useMutation<CopilotAutomationSettings, Error, Partial<CopilotAutomationSettings>>({
    mutationFn: async (next) => {
      const current = automation.data;
      const reqHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) reqHeaders["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/automation`, {
        method: "PATCH",
        credentials: "include",
        headers: reqHeaders,
        body: JSON.stringify({
          morningBriefEnabled: next.morningBriefEnabled ?? current?.morningBriefEnabled ?? true,
          morningBriefHourLocal: next.morningBriefHourLocal ?? current?.morningBriefHourLocal ?? 8,
          preLockNudgeEnabled: next.preLockNudgeEnabled ?? current?.preLockNudgeEnabled ?? true,
          periodWrapEnabled: next.periodWrapEnabled ?? current?.periodWrapEnabled ?? true,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to save automation settings");
      return payload as CopilotAutomationSettings;
    },
    onSuccess: (payload) => {
      setLastAutomationMessage("Coach G automation settings saved.");
      queryClient.setQueryData(
        ["pool-admin", "coachg-copilot-automation", selectedPoolId, isDemoMode],
        payload,
      );
    },
    onError: (err) => {
      setLastAutomationMessage(err.message || "Failed to save automation settings.");
    },
  });

  const runAutomationTest = useMutation<
    { success: boolean; type: string; sent_count: number; message: string },
    Error,
    { type: "morning" | "prelock" | "wrap"; selfOnly?: boolean }
  >({
    mutationFn: async (input) => {
      const reqHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) reqHeaders["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/automation/test`, {
        method: "POST",
        credentials: "include",
        headers: reqHeaders,
        body: JSON.stringify(input),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Automation test failed");
      return payload as { success: boolean; type: string; sent_count: number; message: string };
    },
    onSuccess: (payload) => {
      setLastAutomationMessage(`${payload.message} Sent: ${payload.sent_count}.`);
    },
    onError: (err) => {
      setLastAutomationMessage(err.message || "Automation test failed.");
    },
  });

  const automationStatus = useQuery<CopilotAutomationStatus>({
    queryKey: ["pool-admin", "coachg-copilot-automation-status", selectedPoolId, isDemoMode],
    enabled: !!selectedPoolId,
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/automation/status`, {
        credentials: "include",
        headers,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to load automation status");
      return payload as CopilotAutomationStatus;
    },
    refetchInterval: 30_000,
  });

  const dispatchAutomation = useMutation<
    { success: boolean; type: string; sent_count: number; message: string },
    Error,
    { type: "morning" | "prelock" | "wrap" }
  >({
    mutationFn: async (input) => {
      const reqHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) reqHeaders["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/automation/dispatch`, {
        method: "POST",
        credentials: "include",
        headers: reqHeaders,
        body: JSON.stringify(input),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Automation dispatch failed");
      return payload as { success: boolean; type: string; sent_count: number; message: string };
    },
    onSuccess: (payload) => {
      setLastAutomationMessage(`${payload.message} Sent: ${payload.sent_count}.`);
      void queryClient.invalidateQueries({
        queryKey: ["pool-admin", "coachg-copilot-automation-status", selectedPoolId, isDemoMode],
      });
    },
    onError: (err) => {
      setLastAutomationMessage(err.message || "Automation dispatch failed.");
    },
  });

  const retryFailedDeliveries = useMutation<
    { success: boolean; retried_count: number; message: string },
    Error
  >({
    mutationFn: async () => {
      const reqHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) reqHeaders["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/automation/retry-failed`, {
        method: "POST",
        credentials: "include",
        headers: reqHeaders,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Retry failed deliveries failed");
      return payload as { success: boolean; retried_count: number; message: string };
    },
    onSuccess: (payload) => {
      setLastAutomationMessage(`${payload.message} Retried: ${payload.retried_count}.`);
      void queryClient.invalidateQueries({
        queryKey: ["pool-admin", "coachg-copilot-automation-status", selectedPoolId, isDemoMode],
      });
    },
    onError: (err) => {
      setLastAutomationMessage(err.message || "Retry failed deliveries failed.");
    },
  });

  const runSmartFix = useMutation<
    { retried: number; dispatched: number; dispatch_types: Array<"morning" | "prelock" | "wrap"> },
    Error
  >({
    mutationFn: async () => {
      const reqHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) reqHeaders["X-Demo-Mode"] = "true";

      const retryRes = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/automation/retry-failed`, {
        method: "POST",
        credentials: "include",
        headers: reqHeaders,
      });
      const retryPayload = await retryRes.json().catch(() => ({}));
      if (!retryRes.ok) throw new Error(retryPayload.error || "Smart fix retry step failed");

      const dispatchTypes: Array<"morning" | "prelock" | "wrap"> = ["prelock"];
      if (automationStatus.data?.reliability.health_state === "red") {
        dispatchTypes.push("morning");
      }

      let dispatched = 0;
      for (const type of dispatchTypes) {
        const dispatchRes = await fetch(`/api/pool-admin/${selectedPoolId}/copilot/automation/dispatch`, {
          method: "POST",
          credentials: "include",
          headers: reqHeaders,
          body: JSON.stringify({ type }),
        });
        const dispatchPayload = await dispatchRes.json().catch(() => ({}));
        if (!dispatchRes.ok) throw new Error(dispatchPayload.error || `Smart fix dispatch failed (${type})`);
        dispatched += Number(dispatchPayload.sent_count || 0);
      }

      return {
        retried: Number(retryPayload.retried_count || 0),
        dispatched,
        dispatch_types: dispatchTypes,
      };
    },
    onSuccess: (result) => {
      setFixDialogOpen(false);
      setLastSmartFixRunAt(new Date().toISOString());
      setLastSmartFixOutcome("success");
      setLastAutomationMessage(
        `Smart fix completed: retried ${result.retried} failed deliveries and sent ${result.dispatched} notifications via ${result.dispatch_types.map(formatDispatchType).join(" + ")}.`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["pool-admin", "coachg-copilot-automation-status", selectedPoolId, isDemoMode],
      });
    },
    onError: (err) => {
      setFixDialogOpen(false);
      setLastSmartFixRunAt(new Date().toISOString());
      setLastSmartFixOutcome("error");
      setLastAutomationMessage(err.message || "Smart fix failed.");
    },
  });

  const sendCopilotMessage = () => {
    const text = copilotInput.trim();
    if (!text || copilotChat.isPending || !selectedPoolId) return;
    copilotChat.mutate(text);
  };
  const clearSmartFixStatus = () => {
    setLastSmartFixRunAt(null);
    setLastSmartFixOutcome(null);
  };

  const reliability = automationStatus.data?.reliability;
  const ringPercent = Math.max(0, Math.min(100, reliability?.health_score ?? 0));
  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - ringPercent / 100);
  const ringColor =
    reliability?.health_state === "green"
      ? "#10b981"
      : reliability?.health_state === "yellow"
      ? "#f59e0b"
      : "#ef4444";
  const smartFixDispatchPlan: Array<"morning" | "prelock" | "wrap"> =
    reliability?.health_state === "red" ? ["prelock", "morning"] : ["prelock"];
  const smartFixDispatchLabels = smartFixDispatchPlan.map(formatDispatchType).join(" + ");

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const storedPreference = window.localStorage.getItem(COPILOT_RELEASE_NOTES_HIDE_KEY);
    if (storedPreference === "1") {
      setReleaseNotesDismissed(true);
      setReleaseNotesCollapsed(true);
      return;
    }
    const mq = window.matchMedia("(max-width: 768px)");
    const applyState = () => setReleaseNotesCollapsed(mq.matches);
    applyState();
    const onChange = () => applyState();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const dismissReleaseNotesPermanently = () => {
    setReleaseNotesDismissed(true);
    setReleaseNotesCollapsed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COPILOT_RELEASE_NOTES_HIDE_KEY, "1");
    }
  };

  const restoreReleaseNotes = () => {
    setReleaseNotesDismissed(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(COPILOT_RELEASE_NOTES_HIDE_KEY);
      setReleaseNotesCollapsed(window.matchMedia?.("(max-width: 768px)")?.matches ?? false);
    } else {
      setReleaseNotesCollapsed(false);
    }
  };

  return (
    <>
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Coach G Copilot
              </CardTitle>
              <CardDescription>
                AI-assisted commissioner operations: detect risks, remind members, and clear blockers.
              </CardDescription>
            </div>
            <div className="w-full sm:w-[280px]">
              <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pool" />
                </SelectTrigger>
                <SelectContent>
                  {pools.map((pool) => (
                    <SelectItem key={pool.id} value={String(pool.id)}>
                      {pool.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-16 w-full" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ) : summary.error || !summary.data ? (
            <div className="text-sm text-destructive">
              Failed to load Coach G copilot summary.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("capitalize", urgencyClass)}>
                  {urgencyTone === "critical" ? <AlertTriangle className="h-3.5 w-3.5 mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  {summary.data.urgency}
                </Badge>
                <Badge variant="outline">
                  Period: {summary.data.current_period}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  Lock: {formatLockTime(summary.data.next_lock_time)}
                </Badge>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                <p className="text-sm">
                  <span className="font-semibold">Coach G:</span> {summary.data.coach_message}
                </p>
              </div>

              {!releaseNotesDismissed ? (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">New</Badge>
                      <p className="text-xs font-semibold">Coach G Copilot - Phase 7 Release Notes</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setReleaseNotesCollapsed((prev) => !prev)}
                      >
                        {releaseNotesCollapsed ? "Show" : "Hide"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={dismissReleaseNotesPermanently}
                      >
                        Don't show again
                      </Button>
                    </div>
                  </div>
                  {!releaseNotesCollapsed && (
                    <ul className="space-y-1">
                      {COPILOT_PHASE7_RELEASE_NOTES.map((note) => (
                        <li key={note} className="text-xs text-muted-foreground">
                          - {note}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={restoreReleaseNotes}
                  >
                    Show What's New
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  Recommended actions
                </p>
                <div className="space-y-2">
                  {summary.data.suggestions?.map((suggestion) => (
                    <div key={`${suggestion.action}-${suggestion.title}`} className="rounded-lg border p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{suggestion.title}</p>
                        <Badge variant="outline" className={cn("capitalize", confidenceClass(suggestion.confidence))}>
                          {suggestion.confidence} confidence
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {suggestion.impact} impact
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() => requestAction(suggestion.action, suggestion.title, suggestion.reason)}
                      >
                        Review & Confirm
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Coach G Ops Chat</p>
                <div className="rounded-lg border bg-background/70 p-3 space-y-3">
                  {copilotMessages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Ask Coach G: "Who is missing picks?", "What should I do before lock?", or "Give me today&apos;s admin plan."
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-auto pr-1">
                      {copilotMessages.map((msg) => (
                        <div key={msg.id} className="space-y-2">
                          <div
                            className={cn(
                              "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground ml-6"
                                : "bg-muted mr-6"
                            )}
                          >
                            {msg.content}
                          </div>
                          {msg.role === "assistant" && msg.suggested_actions && msg.suggested_actions.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {msg.suggested_actions.map((suggestion) => (
                                <Button
                                  key={`${msg.id}-${suggestion.action}`}
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    requestAction(
                                      suggestion.action,
                                      suggestion.title,
                                      suggestion.reason,
                                    )
                                  }
                                >
                                  Run: {suggestion.title}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      value={copilotInput}
                      onChange={(e) => setCopilotInput(e.target.value)}
                      placeholder="Ask Coach G for an admin plan..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          sendCopilotMessage();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={sendCopilotMessage}
                      disabled={copilotChat.isPending || !copilotInput.trim()}
                    >
                      {copilotChat.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Automation</p>
                <div className="rounded-lg border bg-background/70 p-3 space-y-3">
                  {automation.isLoading || !automation.data ? (
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-56" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Morning commissioner briefing</p>
                          <p className="text-xs text-muted-foreground">Daily digest for owners/admins.</p>
                        </div>
                        <Switch
                          checked={automation.data.morningBriefEnabled}
                          onCheckedChange={(checked) => saveAutomation.mutate({ morningBriefEnabled: checked })}
                          disabled={saveAutomation.isPending}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Pre-lock member nudges</p>
                          <p className="text-xs text-muted-foreground">Warn missing picks/unpaid members before lock.</p>
                        </div>
                        <Switch
                          checked={automation.data.preLockNudgeEnabled}
                          onCheckedChange={(checked) => saveAutomation.mutate({ preLockNudgeEnabled: checked })}
                          disabled={saveAutomation.isPending}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">End-of-period wrap</p>
                          <p className="text-xs text-muted-foreground">Send standings wrap update after period close.</p>
                        </div>
                        <Switch
                          checked={automation.data.periodWrapEnabled}
                          onCheckedChange={(checked) => saveAutomation.mutate({ periodWrapEnabled: checked })}
                          disabled={saveAutomation.isPending}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Morning brief hour:</span>
                        <Select
                          value={String(automation.data.morningBriefHourLocal)}
                          onValueChange={(value) => saveAutomation.mutate({ morningBriefHourLocal: Number(value) })}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }).map((_, hour) => (
                              <SelectItem key={hour} value={String(hour)}>
                                {String(hour).padStart(2, "0")}:00
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={runAutomationTest.isPending}
                          onClick={() => runAutomationTest.mutate({ type: "morning", selfOnly: true })}
                        >
                          Test Morning Brief (Me)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={runAutomationTest.isPending}
                          onClick={() => runAutomationTest.mutate({ type: "prelock", selfOnly: true })}
                        >
                          Test Pre-Lock Nudge (Me)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={runAutomationTest.isPending}
                          onClick={() => runAutomationTest.mutate({ type: "wrap", selfOnly: true })}
                        >
                          Test Wrap (Me)
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={dispatchAutomation.isPending}
                          onClick={() => dispatchAutomation.mutate({ type: "morning" })}
                        >
                          Run Morning Brief Now
                        </Button>
                        <Button
                          size="sm"
                          disabled={dispatchAutomation.isPending}
                          onClick={() => dispatchAutomation.mutate({ type: "prelock" })}
                        >
                          Run Pre-Lock Wave Now
                        </Button>
                        <Button
                          size="sm"
                          disabled={dispatchAutomation.isPending}
                          onClick={() => dispatchAutomation.mutate({ type: "wrap" })}
                        >
                          Run Period Wrap Now
                        </Button>
                      </div>
                    </>
                  )}

                  {automationStatus.isLoading || !automationStatus.data ? (
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative h-20 w-20">
                          <svg
                            viewBox="0 0 80 80"
                            className={cn(
                              "h-20 w-20 -rotate-90",
                              automationStatus.data.reliability.health_state === "red" && "animate-pulse",
                            )}
                          >
                            <circle
                              cx="40"
                              cy="40"
                              r={ringRadius}
                              fill="none"
                              stroke="rgba(148,163,184,0.30)"
                              strokeWidth="8"
                            />
                            <circle
                              cx="40"
                              cy="40"
                              r={ringRadius}
                              fill="none"
                              stroke={ringColor}
                              strokeWidth="8"
                              strokeLinecap="round"
                              strokeDasharray={ringCircumference}
                              strokeDashoffset={ringOffset}
                              style={{ transition: "stroke-dashoffset 700ms ease, stroke 350ms ease" }}
                            />
                          </svg>
                          <div className="absolute inset-2 rounded-full bg-background/95 flex items-center justify-center border border-border/60">
                            <div className="text-center">
                              <p className="text-sm font-bold tabular-nums">{automationStatus.data.reliability.health_score}</p>
                              <p className="text-[10px] text-muted-foreground">score</p>
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            reliabilityClass(automationStatus.data.reliability.health_state),
                          )}
                        >
                          Automation Health: {automationStatus.data.reliability.health_state}
                        </Badge>
                        <Badge variant="outline">
                          Score {automationStatus.data.reliability.health_score}/100
                        </Badge>
                        <Badge variant="outline">
                          Fail 24h {automationStatus.data.reliability.failure_rate_24h}%
                        </Badge>
                        <Badge variant="outline">
                          SLO {automationStatus.data.reliability.sla_target_failure_rate}% max
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {automationStatus.data.reliability.note}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Trend window compares current 24h performance against the prior 24h period.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="rounded-lg border p-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Sent vs prior 24h</span>
                          <span className={cn(
                            "text-xs font-semibold inline-flex items-center gap-1",
                            automationStatus.data.reliability.trends.sent_delta_vs_prior_24h > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : automationStatus.data.reliability.trends.sent_delta_vs_prior_24h < 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground",
                          )}>
                            {automationStatus.data.reliability.trends.sent_delta_vs_prior_24h > 0 ? <TrendingUp className="h-3 w-3" /> : automationStatus.data.reliability.trends.sent_delta_vs_prior_24h < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {formatSigned(automationStatus.data.reliability.trends.sent_delta_vs_prior_24h)}
                          </span>
                        </div>
                        <div className="rounded-lg border p-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Failed vs prior 24h</span>
                          <span className={cn(
                            "text-xs font-semibold inline-flex items-center gap-1",
                            automationStatus.data.reliability.trends.failed_delta_vs_prior_24h < 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : automationStatus.data.reliability.trends.failed_delta_vs_prior_24h > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground",
                          )}>
                            {automationStatus.data.reliability.trends.failed_delta_vs_prior_24h < 0 ? <TrendingDown className="h-3 w-3" /> : automationStatus.data.reliability.trends.failed_delta_vs_prior_24h > 0 ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {formatSigned(automationStatus.data.reliability.trends.failed_delta_vs_prior_24h)}
                          </span>
                        </div>
                        <div className="rounded-lg border p-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Retryable vs prior 24h</span>
                          <span className={cn(
                            "text-xs font-semibold inline-flex items-center gap-1",
                            automationStatus.data.reliability.trends.retryable_delta_vs_prior_24h < 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : automationStatus.data.reliability.trends.retryable_delta_vs_prior_24h > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground",
                          )}>
                            {automationStatus.data.reliability.trends.retryable_delta_vs_prior_24h < 0 ? <TrendingDown className="h-3 w-3" /> : automationStatus.data.reliability.trends.retryable_delta_vs_prior_24h > 0 ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {formatSigned(automationStatus.data.reliability.trends.retryable_delta_vs_prior_24h)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">Queued Pending</p>
                          <p className="text-xl font-semibold">{automationStatus.data.telemetry.queued_pending}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">Sent (24h)</p>
                          <p className="text-xl font-semibold">{automationStatus.data.telemetry.sent_last_24h}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">Failed (24h)</p>
                          <p className="text-xl font-semibold">{automationStatus.data.telemetry.failed_last_24h}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">Retryable Failed</p>
                          <p className="text-xl font-semibold">{automationStatus.data.telemetry.retryable_failed}</p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="rounded-lg border p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Last Runs</p>
                          <p className="text-xs">Morning: {formatDateTime(automationStatus.data.last_runs.morning)}</p>
                          <p className="text-xs">Pre-lock: {formatDateTime(automationStatus.data.last_runs.prelock)}</p>
                          <p className="text-xs">Wrap: {formatDateTime(automationStatus.data.last_runs.wrap)}</p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Next Runs (Preview)</p>
                          <p className="text-xs">Morning: {formatDateTime(automationStatus.data.next_runs.morning)}</p>
                          <p className="text-xs">Pre-lock: {formatDateTime(automationStatus.data.next_runs.prelock)}</p>
                          <p className="text-xs">Wrap: {formatDateTime(automationStatus.data.next_runs.wrap)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={runSmartFix.isPending}
                          onClick={() => setFixDialogOpen(true)}
                        >
                          <Wrench className="h-4 w-4" />
                          Fix It For Me (Smart)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryFailedDeliveries.isPending}
                          onClick={() => retryFailedDeliveries.mutate()}
                        >
                          Retry Failed Deliveries
                        </Button>
                        {lastSmartFixOutcome && (
                          <Badge
                            variant="outline"
                            className={cn(
                              lastSmartFixOutcome === "success"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
                            )}
                          >
                            Last Smart Fix: {lastSmartFixOutcome === "success" ? "Success" : "Failed"}
                          </Badge>
                        )}
                        {lastSmartFixRunAt && (
                          <Badge variant="outline">
                            Ran {formatDateTime(lastSmartFixRunAt)}
                          </Badge>
                        )}
                        {(lastSmartFixOutcome || lastSmartFixRunAt) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={clearSmartFixStatus}
                          >
                            Clear status
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                  {lastAutomationMessage && (
                    <p className="text-xs text-muted-foreground">{lastAutomationMessage}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Missing Picks</p>
                  <p className="text-xl font-semibold">{summary.data.stats.missing_picks}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Unpaid Members</p>
                  <p className="text-xl font-semibold">{summary.data.stats.unpaid_members}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Pending Approvals</p>
                  <p className="text-xl font-semibold">{summary.data.stats.pending_approvals}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Pending Invites</p>
                  <p className="text-xl font-semibold">{summary.data.stats.pending_invites}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">One-click actions</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() =>
                      requestAction(
                        "remind_missing_picks",
                        "Send missing-pick reminders",
                        "Coach G will notify members without picks for the current period.",
                      )
                    }
                  >
                    Remind Missing Picks
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() =>
                      requestAction(
                        "remind_unpaid_members",
                        "Send unpaid reminders",
                        "Coach G will notify joined members with unverified payment.",
                      )
                    }
                  >
                    Remind Unpaid
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() =>
                      requestAction(
                        "approve_all_pending",
                        "Approve all pending join requests",
                        "Coach G will approve all members waiting in pending_approval.",
                      )
                    }
                  >
                    Approve All Pending
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setChatOpen(true)}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Open Coach G Chat
                  </Button>
                </div>
                {lastActionMessage && (
                  <p className="text-xs text-muted-foreground">{lastActionMessage}</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Checklist</p>
                <div className="space-y-1.5">
                  {summary.data.checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      {item.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                      <span className={cn(item.status === "done" && "text-muted-foreground")}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dedicated pool-admin Coach G chat */}
      {selectedPool && (
        <AIAssistant
          leagueId={selectedPool.id}
          defaultPersona="coach"
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
        />
      )}

      {/* Confirm-before-run guardrail */}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Coach G Action</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction
                ? `${pendingAction.title}. ${pendingAction.reason}`
                : "Confirm this operation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmedAction} disabled={action.isPending}>
              {action.isPending ? "Running..." : "Run Action"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={fixDialogOpen} onOpenChange={setFixDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Smart Auto-Fix?</AlertDialogTitle>
            <AlertDialogDescription>
              Coach G will safely run: retry failed deliveries, then dispatch {smartFixDispatchLabels}.
              This does not change your automation settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={runSmartFix.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runSmartFix.mutate()} disabled={runSmartFix.isPending}>
              {runSmartFix.isPending ? "Running Smart Fix..." : "Run Smart Fix Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

