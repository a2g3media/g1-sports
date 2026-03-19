import { useMemo, useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Save, Globe, CalendarRange, ShieldAlert, Loader2, CheckCircle2, XCircle, ArrowRight, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { EmptyState } from "@/react-app/components/ui/empty-state";
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
import { Link, useSearchParams } from "react-router-dom";
import { RuleEnginePreviewCard } from "@/react-app/components/pools/RuleEnginePreviewCard";
import { getPoolTypeByKey, getTemplateForPoolType } from "@/shared/poolTypeCatalog";
import { generatePoolRuleEngineOutput } from "@/shared/poolRuleEngine";

interface Pool {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
}

interface EventMapRow {
  event_id: string;
  event_type: string;
  sport_key: string;
  home_team?: string;
  away_team?: string;
  start_time?: string;
  is_required?: boolean;
}

interface BackfillEntryEventsResult {
  success: boolean;
  dryRun: boolean;
  targetUserId: number | null;
  entriesProcessed: number;
  entryCreatedInserted: number;
  picksSubmittedInserted: number;
  pickScoredInserted: number;
}

export function PoolAdminSettings() {
  const { isDemoMode } = useDemoAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedPoolId, setSelectedPoolId] = useState(searchParams.get("pool") || "all");
  const [periodId, setPeriodId] = useState("Week 1");
  const [eventMapInput, setEventMapInput] = useState(
    JSON.stringify(
      [
        {
          event_id: "12345",
          event_type: "GAME",
          sport_key: "nfl",
          home_team: "Chiefs",
          away_team: "Bills",
          start_time: new Date().toISOString(),
          is_required: true,
          league_key: "nfl",
          mixed_league: false,
        },
      ],
      null,
      2,
    ),
  );
  const [listingStatus, setListingStatus] = useState<"listed" | "hidden">("listed");
  const [categoryKey, setCategoryKey] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [listingFeeCents, setListingFeeCents] = useState(0);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [joinApprovalRequired, setJoinApprovalRequired] = useState(false);
  const [requireJoinEmail, setRequireJoinEmail] = useState(false);
  const [requireJoinPhone, setRequireJoinPhone] = useState(false);
  const [joinAutoApproveWhenProfileComplete, setJoinAutoApproveWhenProfileComplete] = useState(false);
  const [joinNotifyAdminsOnRequest, setJoinNotifyAdminsOnRequest] = useState(true);
  const [joinNotifyUsersOnStatusChange, setJoinNotifyUsersOnStatusChange] = useState(true);
  const [weeklyRankRecapEnabled, setWeeklyRankRecapEnabled] = useState(true);
  const [weeklyRankRecapPushEnabled, setWeeklyRankRecapPushEnabled] = useState(true);
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [backfillPreview, setBackfillPreview] = useState<BackfillEntryEventsResult | null>(null);

  const headers = useMemo<HeadersInit>(() => {
    const h: HeadersInit = { "Content-Type": "application/json" };
    if (isDemoMode) h["X-Demo-Mode"] = "true";
    return h;
  }, [isDemoMode]);

  const joinNotificationPreview = useMemo(() => {
    const adminBehavior = joinNotifyAdminsOnRequest ? "admins get new-request alerts" : "admins do not get new-request alerts";
    const userBehavior = joinNotifyUsersOnStatusChange
      ? "users get submitted/approved/rejected alerts"
      : "users do not get join-status alerts";
    const entryFlow = joinApprovalRequired
      ? (joinAutoApproveWhenProfileComplete ? "approval required with auto-approve fallback" : "manual commissioner approval required")
      : "users join instantly";
    return `${entryFlow}; ${adminBehavior}; ${userBehavior}.`;
  }, [
    joinApprovalRequired,
    joinAutoApproveWhenProfileComplete,
    joinNotifyAdminsOnRequest,
    joinNotifyUsersOnStatusChange,
  ]);

  const weeklyRecapPreview = useMemo(() => {
    const inApp = weeklyRankRecapEnabled ? "weekly rank recap notifications are enabled" : "weekly rank recap notifications are disabled";
    const push = weeklyRankRecapPushEnabled ? "device push is enabled (for subscribed users)" : "device push is disabled";
    return `${inApp}; ${push}.`;
  }, [weeklyRankRecapEnabled, weeklyRankRecapPushEnabled]);

  const poolsQuery = useQuery({
    queryKey: ["pool-admin-settings-pools", isDemoMode],
    queryFn: async () => {
      const res = await fetch("/api/pool-admin/my-pools", { credentials: "include", headers: isDemoMode ? { "X-Demo-Mode": "true" } : undefined });
      if (!res.ok) throw new Error("Failed to fetch pools");
      const payload = await res.json();
      return (payload.pools || []) as Pool[];
    },
  });

  const selectedPool = (poolsQuery.data || []).find((p) => String(p.id) === selectedPoolId);
  const selectedPoolType = getPoolTypeByKey(selectedPool?.format_key || "");
  const selectedTemplate = getTemplateForPoolType(selectedPool?.format_key || "");

  const adminRulePreview = useMemo(() => {
    const settings: Record<string, unknown> = {
      joinApprovalRequired,
      requireJoinEmail,
      requireJoinPhone,
      joinAutoApproveWhenProfileComplete,
      joinNotifyAdminsOnRequest,
      joinNotifyUsersOnStatusChange,
      weeklyRankRecapEnabled,
      weeklyRankRecapPushEnabled,
      allowLateJoins: true,
      tieHandling: "push",
      lockType: "game_start",
    };
    return generatePoolRuleEngineOutput({
      template: selectedTemplate,
      scheduleType: selectedPoolType?.schedule_type || ["weekly"],
      settings,
      userState: {
        currentPeriod: periodId,
        lateEntry: joinApprovalRequired,
        invalidSelectionCount: requireJoinEmail || requireJoinPhone ? 1 : 0,
      },
    });
  }, [
    joinApprovalRequired,
    requireJoinEmail,
    requireJoinPhone,
    joinAutoApproveWhenProfileComplete,
    joinNotifyAdminsOnRequest,
    joinNotifyUsersOnStatusChange,
    weeklyRankRecapEnabled,
    weeklyRankRecapPushEnabled,
    selectedTemplate,
    selectedPoolType?.schedule_type,
    periodId,
  ]);

  const eventMapQuery = useQuery({
    queryKey: ["pool-admin-settings-event-map", selectedPoolId, periodId, isDemoMode],
    enabled: selectedPoolId !== "all",
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/event-map?period_id=${encodeURIComponent(periodId)}`, {
        credentials: "include",
        headers: isDemoMode ? { "X-Demo-Mode": "true" } : undefined,
      });
      if (!res.ok) throw new Error("Failed to load event map");
      const payload = await res.json();
      const mappings = Array.isArray(payload.mappings) ? payload.mappings : [];
      if (mappings.length) {
        setEventMapInput(
          JSON.stringify(
            mappings.map((m: Record<string, unknown>) => ({
              event_id: m.event_id,
              event_type: m.event_type,
              sport_key: m.sport_key,
              home_team: m.home_team,
              away_team: m.away_team,
              start_time: m.start_time,
              is_required: !!m.is_required,
            })),
            null,
            2,
          ),
        );
      }
      return mappings as EventMapRow[];
    },
  });

  const launchChecklist = useMemo(() => {
    const checks = [
      {
        id: "join-gate",
        label: "Join gate configuration",
        description: "If approval is on, require at least one contact field (email or phone).",
        done: !joinApprovalRequired || requireJoinEmail || requireJoinPhone,
      },
      {
        id: "weekly-recap",
        label: "Weekly recap channel",
        description: "At least in-app recap should be enabled for post-period engagement.",
        done: weeklyRankRecapEnabled,
      },
      {
        id: "listing",
        label: "Marketplace listing state",
        description: "Pool is visible to marketplace users only when listing status is listed.",
        done: listingStatus === "listed",
      },
      {
        id: "profile",
        label: "Commissioner profile completeness",
        description: "Profile should have clear display name and short host bio.",
        done: profileDisplayName.trim().length >= 2 && profileBio.trim().length >= 12,
      },
      {
        id: "event-map",
        label: "Event eligibility map",
        description: "Current period has at least one mapped eligible event.",
        done: (eventMapQuery.data?.length || 0) > 0,
      },
    ];
    const complete = checks.filter((c) => c.done).length;
    return {
      checks,
      complete,
      total: checks.length,
      percent: checks.length > 0 ? Math.round((complete / checks.length) * 100) : 0,
    };
  }, [
    eventMapQuery.data?.length,
    joinApprovalRequired,
    listingStatus,
    profileBio,
    profileDisplayName,
    requireJoinEmail,
    requireJoinPhone,
    weeklyRankRecapEnabled,
  ]);

  const listingQuery = useQuery({
    queryKey: ["pool-admin-settings-listing", selectedPoolId, isDemoMode],
    enabled: selectedPoolId !== "all",
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/marketplace-listing`, {
        credentials: "include",
        headers: isDemoMode ? { "X-Demo-Mode": "true" } : undefined,
      });
      if (!res.ok) throw new Error("Failed to load listing");
      const payload = await res.json();
      const listing = payload.listing || {};
      setListingStatus(listing.listing_status === "hidden" ? "hidden" : "listed");
      setCategoryKey(typeof listing.category_key === "string" ? listing.category_key : "");
      setIsFeatured(!!listing.is_featured);
      setListingFeeCents(Number(listing.listing_fee_cents || 0));
      return listing;
    },
  });

  const saveEventMap = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(eventMapInput);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Event map must be a non-empty JSON array.");
      }
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/event-map`, {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({ period_id: periodId, events: parsed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to save event map");
      return payload;
    },
  });

  const saveListing = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/marketplace-listing`, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({
          listing_status: listingStatus,
          category_key: categoryKey || null,
          is_featured: isFeatured,
          listing_fee_cents: listingFeeCents,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to save listing settings");
      return payload;
    },
  });

  const profileQuery = useQuery({
    queryKey: ["pool-admin-settings-profile", isDemoMode],
    queryFn: async () => {
      const res = await fetch("/api/marketplace/commissioners/me", {
        credentials: "include",
        headers: isDemoMode ? { "X-Demo-Mode": "true" } : undefined,
      });
      if (!res.ok) throw new Error("Failed to load commissioner profile");
      const profile = await res.json();
      setProfileDisplayName(profile.display_name || "");
      setProfileAvatarUrl(profile.avatar_url || "");
      setProfileBio(profile.bio || "");
      return profile;
    },
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/marketplace/commissioners/me", {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({
          display_name: profileDisplayName,
          avatar_url: profileAvatarUrl,
          bio: profileBio,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to save profile");
      return payload;
    },
  });

  const listingFeesQuery = useQuery({
    queryKey: ["pool-admin-settings-listing-fees", selectedPoolId, isDemoMode],
    enabled: selectedPoolId !== "all",
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/marketplace-listing-fees`, {
        credentials: "include",
        headers: isDemoMode ? { "X-Demo-Mode": "true" } : undefined,
      });
      if (!res.ok) throw new Error("Failed to load listing fees");
      return res.json() as Promise<{ fees: Array<{ id: number; amount_cents: number; status: string; created_at: string }> }>;
    },
  });

  const joinRequirementsQuery = useQuery({
    queryKey: ["pool-admin-settings-join-reqs", selectedPoolId, isDemoMode],
    enabled: selectedPoolId !== "all",
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/join-requirements`, {
        credentials: "include",
        headers: isDemoMode ? { "X-Demo-Mode": "true" } : undefined,
      });
      if (!res.ok) throw new Error("Failed to load join requirements");
      const payload = await res.json();
      setJoinApprovalRequired(payload.joinApprovalRequired === true);
      setRequireJoinEmail(payload.requireJoinEmail === true);
      setRequireJoinPhone(payload.requireJoinPhone === true);
      setJoinAutoApproveWhenProfileComplete(payload.joinAutoApproveWhenProfileComplete === true);
      setJoinNotifyAdminsOnRequest(payload.joinNotifyAdminsOnRequest !== false);
      setJoinNotifyUsersOnStatusChange(payload.joinNotifyUsersOnStatusChange !== false);
      setWeeklyRankRecapEnabled(payload.weeklyRankRecapEnabled !== false);
      setWeeklyRankRecapPushEnabled(payload.weeklyRankRecapPushEnabled !== false);
      return payload as {
        joinApprovalRequired: boolean;
        requireJoinEmail: boolean;
        requireJoinPhone: boolean;
        joinAutoApproveWhenProfileComplete: boolean;
        joinNotifyAdminsOnRequest: boolean;
        joinNotifyUsersOnStatusChange: boolean;
        weeklyRankRecapEnabled: boolean;
        weeklyRankRecapPushEnabled: boolean;
      };
    },
  });

  const saveJoinRequirements = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/join-requirements`, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({
          joinApprovalRequired,
          requireJoinEmail,
          requireJoinPhone,
          joinAutoApproveWhenProfileComplete,
          joinNotifyAdminsOnRequest,
          joinNotifyUsersOnStatusChange,
          weeklyRankRecapEnabled,
          weeklyRankRecapPushEnabled,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to save join requirements");
      return payload;
    },
  });

  const weeklyRecapBroadcast = useMutation({
    mutationFn: async (opts: { send: boolean; selfOnly?: boolean }) => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/weekly-rank-recap/test`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          send: opts.send,
          selfOnly: opts.selfOnly === true,
          periodId: periodId || "Current Week",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to run weekly recap test");
      return payload as {
        dry_run: boolean;
        self_only: boolean;
        audience: { joined_members: number; in_app_eligible: number; push_eligible: number };
        delivery: { in_app_sent: number; push_sent: number };
        sample: { title: string; body: string; url: string };
      };
    },
  });

  const autoFixLaunch = useMutation({
    mutationFn: async () => {
      if (selectedPoolId === "all") throw new Error("Select a pool first.");
      const profileName = profileDisplayName.trim() || selectedPool?.name?.trim() || "Commissioner";
      const profileBioSafe =
        profileBio.trim().length >= 12
          ? profileBio.trim()
          : `Host of ${selectedPool?.name || "this pool"} with clear rules, active moderation, and weekly recaps.`;
      const categorySafe = categoryKey.trim() || (selectedPool?.format_key || "pickem");

      const nextJoinRules = {
        joinApprovalRequired: true,
        requireJoinEmail: true,
        requireJoinPhone: requireJoinPhone,
        joinAutoApproveWhenProfileComplete: false,
        joinNotifyAdminsOnRequest: true,
        joinNotifyUsersOnStatusChange: true,
        weeklyRankRecapEnabled: true,
        weeklyRankRecapPushEnabled: true,
      };

      const [joinRes, listingRes, profileRes] = await Promise.all([
        fetch(`/api/pool-admin/${selectedPoolId}/join-requirements`, {
          method: "PATCH",
          credentials: "include",
          headers,
          body: JSON.stringify(nextJoinRules),
        }),
        fetch(`/api/pool-admin/${selectedPoolId}/marketplace-listing`, {
          method: "PATCH",
          credentials: "include",
          headers,
          body: JSON.stringify({
            listing_status: "listed",
            category_key: categorySafe,
            is_featured: isFeatured,
            listing_fee_cents: listingFeeCents,
          }),
        }),
        fetch("/api/marketplace/commissioners/me", {
          method: "PATCH",
          credentials: "include",
          headers,
          body: JSON.stringify({
            display_name: profileName,
            avatar_url: profileAvatarUrl,
            bio: profileBioSafe,
          }),
        }),
      ]);

      const joinPayload = await joinRes.json().catch(() => ({}));
      const listingPayload = await listingRes.json().catch(() => ({}));
      const profilePayload = await profileRes.json().catch(() => ({}));
      if (!joinRes.ok) throw new Error(joinPayload.error || "Failed to apply join launch defaults");
      if (!listingRes.ok) throw new Error(listingPayload.error || "Failed to apply listing launch defaults");
      if (!profileRes.ok) throw new Error(profilePayload.error || "Failed to apply profile launch defaults");

      return {
        profileName,
        profileBioSafe,
        categorySafe,
        nextJoinRules,
      };
    },
    onSuccess: (result) => {
      setJoinApprovalRequired(result.nextJoinRules.joinApprovalRequired);
      setRequireJoinEmail(result.nextJoinRules.requireJoinEmail);
      setJoinAutoApproveWhenProfileComplete(result.nextJoinRules.joinAutoApproveWhenProfileComplete);
      setJoinNotifyAdminsOnRequest(result.nextJoinRules.joinNotifyAdminsOnRequest);
      setJoinNotifyUsersOnStatusChange(result.nextJoinRules.joinNotifyUsersOnStatusChange);
      setWeeklyRankRecapEnabled(result.nextJoinRules.weeklyRankRecapEnabled);
      setWeeklyRankRecapPushEnabled(result.nextJoinRules.weeklyRankRecapPushEnabled);
      setListingStatus("listed");
      setCategoryKey(result.categorySafe);
      setProfileDisplayName(result.profileName);
      setProfileBio(result.profileBioSafe);
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-settings-join-reqs"] });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-settings-listing"] });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-settings-profile"] });
    },
  });

  const backfillEntryEvents = useMutation({
    mutationFn: async (opts: { dryRun: boolean }) => {
      if (selectedPoolId === "all") {
        throw new Error("Select a pool first.");
      }
      const h: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) h["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/leagues/${selectedPoolId}/backfill-entry-events`, {
        method: "POST",
        credentials: "include",
        headers: h,
        body: JSON.stringify({ dryRun: opts.dryRun }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to run entry history backfill.");
      return payload as BackfillEntryEventsResult;
    },
    onSuccess: (result) => {
      if (result.dryRun) {
        setBackfillPreview(result);
      } else {
        setBackfillConfirmOpen(false);
        void queryClient.invalidateQueries({ queryKey: ["pool-admin-settings-pools"] });
        void queryClient.invalidateQueries({ queryKey: ["pool-admin", "my-pools"] });
      }
    },
  });

  if (!poolsQuery.isLoading && (poolsQuery.data || []).length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Settings}
          title="No admin pools yet"
          description="Create or administer a pool to configure advanced settings."
          primaryAction={{ label: "Create Pool", href: "/create-league" }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pool Settings</h1>
          <p className="text-muted-foreground">Configure event eligibility and marketplace listing controls</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pool Context</CardTitle>
          <CardDescription>Select a pool and period to edit deterministic rules.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Pool</Label>
            <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
              <SelectTrigger>
                <SelectValue placeholder="Select pool" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Select a pool...</SelectItem>
                {(poolsQuery.data || []).map((pool) => (
                  <SelectItem key={pool.id} value={String(pool.id)}>
                    {pool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Period ID</Label>
            <Input value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="Week 1" />
          </div>
        </CardContent>
      </Card>

      {selectedPoolId !== "all" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Commissioner Launch Checklist</span>
                <Badge variant={launchChecklist.percent >= 80 ? "default" : "outline"}>
                  {launchChecklist.complete}/{launchChecklist.total} complete ({launchChecklist.percent}%)
                </Badge>
              </CardTitle>
              <CardDescription>
                Quick readiness pass for approvals, notifications, listing visibility, and event mapping.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {launchChecklist.checks.map((check) => (
                  <div key={check.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="flex items-start gap-2">
                      {check.done ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 text-amber-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{check.label}</p>
                        <p className="text-xs text-muted-foreground">{check.description}</p>
                      </div>
                    </div>
                    <Badge variant={check.done ? "default" : "outline"}>{check.done ? "Ready" : "Needs setup"}</Badge>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/pool-admin/members?pool=${encodeURIComponent(selectedPoolId)}&invite_status=pending_approval`}>
                    Review approvals <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/pool-admin/notifications?pool=${encodeURIComponent(selectedPoolId)}`}>
                    Notification center <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/pools#marketplace`}>
                    Marketplace view <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => autoFixLaunch.mutate()}
                  disabled={autoFixLaunch.isPending}
                >
                  {autoFixLaunch.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  One-Click Launch Defaults
                </Button>
              </div>
              {autoFixLaunch.isError && (
                <p className="text-xs text-red-500">{(autoFixLaunch.error as Error).message}</p>
              )}
              {autoFixLaunch.isSuccess && (
                <p className="text-xs text-emerald-500">
                  Launch defaults applied: approval+email gate, recap enabled, listed marketplace profile.
                </p>
              )}
            </CardContent>
          </Card>

          <RuleEnginePreviewCard
            output={adminRulePreview}
            title="Commissioner Rules Impact Preview"
            description="Preview how your current admin toggles translate into system, commissioner, and inline rule outputs."
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-emerald-500" />
                Join Requirements & Approval
              </CardTitle>
              <CardDescription>
                Control who can enter this pool and what profile fields are required before entry.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Require Commissioner Approval</p>
                  <p className="text-xs text-muted-foreground">Users submit a request. Admin must approve before entry.</p>
                </div>
                <Switch checked={joinApprovalRequired} onCheckedChange={setJoinApprovalRequired} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Require Email</p>
                  <p className="text-xs text-muted-foreground">User must provide email before join request/entry.</p>
                </div>
                <Switch checked={requireJoinEmail} onCheckedChange={setRequireJoinEmail} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Require Phone Number</p>
                  <p className="text-xs text-muted-foreground">User must provide phone before join request/entry.</p>
                </div>
                <Switch checked={requireJoinPhone} onCheckedChange={setRequireJoinPhone} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Auto-Approve If Profile Complete</p>
                  <p className="text-xs text-muted-foreground">
                    When approval mode is on, auto-admit users who satisfy required contact fields.
                  </p>
                </div>
                <Switch
                  checked={joinAutoApproveWhenProfileComplete}
                  onCheckedChange={setJoinAutoApproveWhenProfileComplete}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Notify Admins On New Requests</p>
                  <p className="text-xs text-muted-foreground">
                    Send in-app alerts to commissioners when a user requests access.
                  </p>
                </div>
                <Switch checked={joinNotifyAdminsOnRequest} onCheckedChange={setJoinNotifyAdminsOnRequest} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Notify Users On Status Changes</p>
                  <p className="text-xs text-muted-foreground">
                    Notify users when request is submitted, approved, rejected, or auto-approved.
                  </p>
                </div>
                <Switch checked={joinNotifyUsersOnStatusChange} onCheckedChange={setJoinNotifyUsersOnStatusChange} />
              </div>
              <div className="md:col-span-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Requirements apply immediately to new join attempts via invite code.
                </p>
                <Button onClick={() => saveJoinRequirements.mutate()} disabled={saveJoinRequirements.isPending}>
                  {saveJoinRequirements.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Join Rules
                </Button>
              </div>
              <div className="md:col-span-2 rounded-md border border-dashed bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Current behavior preview: {joinNotificationPreview}
                </p>
              </div>
              <div className="md:col-span-2 h-px bg-border/80" />
              <div className="md:col-span-2">
                <p className="text-sm font-medium">Weekly Rank Recap Controls</p>
                <p className="text-xs text-muted-foreground">
                  Admin-level control for celebratory end-of-week standings updates.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Enable Weekly Rank Recap</p>
                  <p className="text-xs text-muted-foreground">
                    Send in-app weekly standings updates (winner, climb, drop, no-change).
                  </p>
                </div>
                <Switch checked={weeklyRankRecapEnabled} onCheckedChange={setWeeklyRankRecapEnabled} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Enable Weekly Rank Recap Push</p>
                  <p className="text-xs text-muted-foreground">
                    Also deliver as device push for users with push enabled and active subscriptions.
                  </p>
                </div>
                <Switch checked={weeklyRankRecapPushEnabled} onCheckedChange={setWeeklyRankRecapPushEnabled} />
              </div>
              <div className="md:col-span-2 rounded-md border border-dashed bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Weekly recap preview: {weeklyRecapPreview}
                </p>
              </div>
              <div className="md:col-span-2 h-px bg-border/80" />
              <div className="md:col-span-2">
                <p className="text-sm font-medium">Admin Weekly Recap Test Broadcast</p>
                <p className="text-xs text-muted-foreground">
                  Run a dry-run audience check first, then send a safe test broadcast to eligible members.
                </p>
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => weeklyRecapBroadcast.mutate({ send: false })}
                  disabled={weeklyRecapBroadcast.isPending}
                >
                  {weeklyRecapBroadcast.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Dry Run Audience Check
                </Button>
                <Button
                  variant="outline"
                  onClick={() => weeklyRecapBroadcast.mutate({ send: true, selfOnly: true })}
                  disabled={weeklyRecapBroadcast.isPending}
                >
                  {weeklyRecapBroadcast.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Send Test To Me Only
                </Button>
                <Button
                  onClick={() => weeklyRecapBroadcast.mutate({ send: true })}
                  disabled={weeklyRecapBroadcast.isPending}
                >
                  {weeklyRecapBroadcast.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Send Test Broadcast
                </Button>
              </div>
              {weeklyRecapBroadcast.data && (
                <div className="md:col-span-2 rounded-md border px-3 py-2 text-xs text-muted-foreground space-y-1">
                  <p>
                    Mode: {weeklyRecapBroadcast.data.dry_run ? "Dry run" : weeklyRecapBroadcast.data.self_only ? "Self-only send" : "Broadcast send"}
                  </p>
                  <p>
                    Audience: {weeklyRecapBroadcast.data.audience.joined_members} joined • in-app eligible{" "}
                    {weeklyRecapBroadcast.data.audience.in_app_eligible} • push eligible{" "}
                    {weeklyRecapBroadcast.data.audience.push_eligible}
                  </p>
                  <p>
                    Delivery: in-app sent {weeklyRecapBroadcast.data.delivery.in_app_sent} • push queued{" "}
                    {weeklyRecapBroadcast.data.delivery.push_sent}
                  </p>
                  <p>Sample: {weeklyRecapBroadcast.data.sample.title}</p>
                </div>
              )}
              {weeklyRecapBroadcast.isError && (
                <p className="md:col-span-2 text-sm text-red-500">{(weeklyRecapBroadcast.error as Error).message}</p>
              )}
              {saveJoinRequirements.isError && (
                <p className="md:col-span-2 text-sm text-red-500">{(saveJoinRequirements.error as Error).message}</p>
              )}
              {saveJoinRequirements.isSuccess && (
                <p className="md:col-span-2 text-sm text-emerald-500">Join requirements saved.</p>
              )}
              {joinRequirementsQuery.isLoading && (
                <p className="md:col-span-2 text-xs text-muted-foreground">Loading join requirements...</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-500" />
                Entry History Backfill
              </CardTitle>
              <CardDescription>
                Rebuild missing entry timeline events for legacy data. Run dry-run first, then apply.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => backfillEntryEvents.mutate({ dryRun: true })}
                  disabled={backfillEntryEvents.isPending}
                >
                  {backfillEntryEvents.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Dry Run Backfill
                </Button>
                <Button
                  onClick={() => setBackfillConfirmOpen(true)}
                  disabled={backfillEntryEvents.isPending || !backfillPreview}
                >
                  {backfillEntryEvents.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Apply Backfill
                </Button>
              </div>

              {backfillPreview ? (
                <div className="rounded-md border p-3 text-xs space-y-2">
                  <p className="text-muted-foreground">Dry-run preview (no writes made):</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Entries {backfillPreview.entriesProcessed}</Badge>
                    <Badge variant="outline">entry_created +{backfillPreview.entryCreatedInserted}</Badge>
                    <Badge variant="outline">picks_submitted +{backfillPreview.picksSubmittedInserted}</Badge>
                    <Badge variant="outline">pick_scored +{backfillPreview.pickScoredInserted}</Badge>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Run dry-run to preview how many timeline events will be inserted.
                </p>
              )}

              {backfillEntryEvents.isError && (
                <p className="text-xs text-red-500">{(backfillEntryEvents.error as Error).message}</p>
              )}
              {backfillEntryEvents.isSuccess && backfillEntryEvents.data && !backfillEntryEvents.data.dryRun && (
                <p className="text-xs text-emerald-500">
                  Backfill complete: entry_created +{backfillEntryEvents.data.entryCreatedInserted}, picks_submitted +
                  {backfillEntryEvents.data.picksSubmittedInserted}, pick_scored +{backfillEntryEvents.data.pickScoredInserted}.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-blue-500" />
                    Event Eligibility Map
                  </CardTitle>
                  <CardDescription>
                    Controls which events are valid for picks in this pool/period.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {selectedPool?.sport_key.toUpperCase()} • {selectedPool?.format_key}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label>Events JSON</Label>
              <textarea
                value={eventMapInput}
                onChange={(e) => setEventMapInput(e.target.value)}
                className="w-full min-h-[260px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Expected array fields: `event_id`, `event_type`, `sport_key`, `home_team`, `away_team`, `start_time`, `is_required`.
                </p>
                <Button onClick={() => saveEventMap.mutate()} disabled={saveEventMap.isPending}>
                  {saveEventMap.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Event Map
                </Button>
              </div>
              {saveEventMap.isError && (
                <p className="text-sm text-red-500">{(saveEventMap.error as Error).message}</p>
              )}
              {saveEventMap.isSuccess && <p className="text-sm text-emerald-500">Event map saved.</p>}
              {eventMapQuery.isLoading && <p className="text-xs text-muted-foreground">Loading existing map...</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-violet-500" />
                Marketplace Listing
              </CardTitle>
              <CardDescription>Publish/hide this pool and control listing metadata.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={listingStatus} onValueChange={(v) => setListingStatus(v as "listed" | "hidden")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="listed">Listed</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category Key</Label>
                <Input value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} placeholder="survivor" />
              </div>
              <div className="space-y-2">
                <Label>Listing Fee (cents)</Label>
                <Input
                  type="number"
                  min={0}
                  value={listingFeeCents}
                  onChange={(e) => setListingFeeCents(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Featured Listing</p>
                  <p className="text-xs text-muted-foreground">High-priority placement in marketplace rail.</p>
                </div>
                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
              </div>
              <div className="md:col-span-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Marketplace/fee behavior is feature-flag controlled at platform level.
                </p>
                <Button onClick={() => saveListing.mutate()} disabled={saveListing.isPending}>
                  {saveListing.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Listing
                </Button>
              </div>
              {saveListing.isError && (
                <p className="md:col-span-2 text-sm text-red-500">{(saveListing.error as Error).message}</p>
              )}
              {saveListing.isSuccess && <p className="md:col-span-2 text-sm text-emerald-500">Marketplace settings saved.</p>}
              {listingQuery.isLoading && <p className="md:col-span-2 text-xs text-muted-foreground">Loading listing settings...</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Listing Fee History
              </CardTitle>
              <CardDescription>Recent listing fee transactions for this pool.</CardDescription>
            </CardHeader>
            <CardContent>
              {listingFeesQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading fee history...</p>
              ) : (listingFeesQuery.data?.fees || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No listing fees recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {(listingFeesQuery.data?.fees || []).map((fee) => (
                    <div key={fee.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                      <span>${(fee.amount_cents / 100).toFixed(2)}</span>
                      <span className="text-muted-foreground">{fee.status}</span>
                      <span className="text-xs text-muted-foreground">{new Date(fee.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={backfillConfirmOpen} onOpenChange={setBackfillConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Entry History Backfill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will insert missing timeline events for existing entries in the selected pool. It is safe to re-run;
              existing event types per entry/period are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backfillEntryEvents.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                backfillEntryEvents.mutate({ dryRun: false });
              }}
              disabled={backfillEntryEvents.isPending}
            >
              {backfillEntryEvents.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Apply Backfill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>Commissioner Profile</CardTitle>
          <CardDescription>Displayed in marketplace cards and trust panels.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Avatar URL</Label>
            <Input value={profileAvatarUrl} onChange={(e) => setProfileAvatarUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Bio</Label>
            <textarea
              value={profileBio}
              onChange={(e) => setProfileBio(e.target.value)}
              className="w-full min-h-[90px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {profileQuery.data?.rating_avg ? `${Number(profileQuery.data.rating_avg).toFixed(1)} avg • ${profileQuery.data.rating_count} ratings` : "No ratings yet"}
            </p>
            <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
              {saveProfile.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Profile
            </Button>
          </div>
          {saveProfile.isError && <p className="text-sm text-red-500">{(saveProfile.error as Error).message}</p>}
          {saveProfile.isSuccess && <p className="text-sm text-emerald-500">Profile saved.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export default PoolAdminSettings;
