import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Badge } from "@/react-app/components/ui/badge";
import { Checkbox } from "@/react-app/components/ui/checkbox";
import { Progress } from "@/react-app/components/ui/progress";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle,
  ChevronRight,
  CreditCard,
  DollarSign,
  FileText,
  Loader2,
  Mail,
  PartyPopper,
  Phone,
  Shield,
  Sparkles,
  Star,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { SPORTS, POOL_FORMATS } from "@/react-app/data/sports";
import { PoolAccessGate } from "@/react-app/components/PoolAccessGate";
import { cn } from "@/react-app/lib/utils";

interface LeaguePreview {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  member_count: number;
  season: string;
  entry_fee_cents: number;
  isMember: boolean;
  membershipStatus?: string | null;
  joinRequirements?: {
    approvalRequired: boolean;
    requireEmail: boolean;
    requirePhone: boolean;
    autoApproveWhenProfileComplete?: boolean;
  };
  entrySettings?: {
    allowMultipleEntries: boolean;
    maxEntriesPerUser: number;
    entryPackageOptions: number[];
    requirePaymentBeforeEntry: boolean;
  };
  profileRequirements?: {
    missingEmail: boolean;
    missingPhone: boolean;
  };
}

interface RuleItem {
  key: string;
  text: string;
}

interface RuleEnginePayload {
  pool_rules: {
    system_rules: RuleItem[];
    commissioner_rules: RuleItem[];
    dynamic_rules: RuleItem[];
  };
  ui: {
    overlay_rules: string[];
    full_rules: string[];
  };
}

type StepId = "intro" | "info" | "entries" | "rules" | "payment" | "review" | "success";

const STEP_META: Array<{ id: StepId; label: string; icon: React.ElementType }> = [
  { id: "intro", label: "Pool Intro", icon: Star },
  { id: "info", label: "Your Info", icon: User },
  { id: "entries", label: "Entries", icon: Trophy },
  { id: "rules", label: "Rules", icon: Shield },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "review", label: "Review", icon: FileText },
  { id: "success", label: "Confirmed", icon: CheckCircle },
];

function clampEntryCount(value: number, max: number): number {
  const safeMax = Math.max(1, max || 1);
  return Math.min(safeMax, Math.max(1, Math.floor(value || 1)));
}

function getDraftKey(inviteCode: string): string {
  return `join-wizard:${inviteCode.toUpperCase()}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length >= 7) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length >= 4) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length > 0) return `(${digits}`;
  return "";
}

function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 10;
}

// Step indicator with checkmarks for completed steps
function StepIndicator({
  steps,
  currentIndex,
  skipPayment,
}: {
  steps: typeof STEP_META;
  currentIndex: number;
  skipPayment: boolean;
}) {
  const visibleSteps = steps.filter((s) => !(skipPayment && s.id === "payment"));
  const adjustedIndex = skipPayment && currentIndex >= 4 ? currentIndex - 1 : currentIndex;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {visibleSteps.map((step, idx) => {
        const isCompleted = idx < adjustedIndex;
        const isCurrent = idx === adjustedIndex;
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                isCompleted && "bg-emerald-500/10 text-emerald-400",
                isCurrent && "bg-primary/10 text-primary border border-primary/20",
                !isCompleted && !isCurrent && "text-slate-500"
              )}
            >
              {isCompleted ? (
                <Check className="w-3 h-3" />
              ) : (
                <Icon className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {idx < visibleSteps.length - 1 && (
              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Animated step wrapper
function StepContainer({ children, direction }: { children: React.ReactNode; direction: "forward" | "backward" }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = direction === "forward" ? "translateX(16px)" : "translateX(-16px)";
    requestAnimationFrame(() => {
      el.style.transition = "opacity 250ms ease, transform 250ms ease";
      el.style.opacity = "1";
      el.style.transform = "translateX(0)";
    });
  }, [direction, children]);

  return <div ref={ref}>{children}</div>;
}

// Field validation indicator
function FieldStatus({ valid, message }: { valid: boolean | null; message?: string }) {
  if (valid === null) return null;
  return (
    <p className={cn("text-xs mt-1 transition-colors", valid ? "text-emerald-400" : "text-red-400")}>
      {valid ? <Check className="w-3 h-3 inline mr-1" /> : null}
      {message}
    </p>
  );
}

export function JoinLeague() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get("code") || "";

  const [inviteCode, setInviteCode] = useState(codeFromUrl.toUpperCase());
  const [isLoading, setIsLoading] = useState(false);
  const [leaguePreview, setLeaguePreview] = useState<LeaguePreview | null>(null);
  const [error, setError] = useState("");

  const [joined, setJoined] = useState(false);
  const [joinedLeagueName, setJoinedLeagueName] = useState("");
  const [joinedLeagueId, setJoinedLeagueId] = useState<number | null>(null);
  const [joinPendingApproval, setJoinPendingApproval] = useState(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [stepDirection, setStepDirection] = useState<"forward" | "backward">("forward");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [requestedEntries, setRequestedEntries] = useState(1);
  const [entryNames, setEntryNames] = useState<string[]>(["Main Entry"]);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [poolRules, setPoolRules] = useState<RuleEnginePayload | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);

  const maxEntries = leaguePreview?.entrySettings?.allowMultipleEntries
    ? Math.max(1, leaguePreview.entrySettings.maxEntriesPerUser || 1)
    : 1;
  const packageOptions = (leaguePreview?.entrySettings?.entryPackageOptions || [1])
    .filter((v) => Number.isFinite(Number(v)) && Number(v) >= 1)
    .map((v) => Math.floor(Number(v)))
    .sort((a, b) => a - b);
  const requiresPaymentStep =
    (leaguePreview?.entrySettings?.requirePaymentBeforeEntry === true ||
      (leaguePreview?.entry_fee_cents || 0) > 0) &&
    (leaguePreview?.entry_fee_cents || 0) > 0;
  const effectiveRequestedEntries = clampEntryCount(requestedEntries, maxEntries);
  const totalDueCents = (leaguePreview?.entry_fee_cents || 0) * effectiveRequestedEntries;

  const sport = leaguePreview ? SPORTS.find((s) => s.key === leaguePreview.sport_key) : null;
  const format = leaguePreview ? POOL_FORMATS.find((f) => f.key === leaguePreview.format_key) : null;

  const progressPercent = useMemo(() => {
    if (joined) return 100;
    const totalSteps = requiresPaymentStep ? 7 : 6;
    const currentStep = !requiresPaymentStep && stepIndex >= 4 ? stepIndex + 1 : stepIndex;
    return Math.round(((currentStep + 1) / totalSteps) * 100);
  }, [joined, stepIndex, requiresPaymentStep]);

  // Email/phone validation state
  const emailValid = useMemo(() => {
    if (!contactEmail.trim()) return null;
    return isValidEmail(contactEmail);
  }, [contactEmail]);

  const phoneValid = useMemo(() => {
    if (!contactPhone.trim()) return null;
    return isValidPhone(contactPhone);
  }, [contactPhone]);

  // Persist draft to localStorage
  useEffect(() => {
    if (!leaguePreview || !inviteCode) return;
    const key = getDraftKey(inviteCode);
    const payload = {
      stepIndex,
      firstName,
      lastName,
      contactEmail,
      contactPhone,
      requestedEntries: effectiveRequestedEntries,
      entryNames,
      rulesAccepted,
      paymentConfirmed,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  }, [
    leaguePreview, inviteCode, stepIndex, firstName, lastName, contactEmail,
    contactPhone, effectiveRequestedEntries, entryNames, rulesAccepted, paymentConfirmed,
  ]);

  // Auto-lookup if code in URL
  useEffect(() => {
    if (!codeFromUrl) return;
    void handleLookup(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  // Fetch pool rules when reaching rules step
  useEffect(() => {
    if (stepIndex !== 3 || !leaguePreview || poolRules) return;
    let cancelled = false;
    (async () => {
      setRulesLoading(true);
      try {
        const res = await fetch(`/api/leagues/${leaguePreview.id}/rules-engine`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setPoolRules(data as RuleEnginePayload);
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setRulesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stepIndex, leaguePreview, poolRules]);

  const resetWizardState = () => {
    setStepIndex(0);
    setStepDirection("forward");
    setFirstName("");
    setLastName("");
    setContactEmail("");
    setContactPhone("");
    setRequestedEntries(1);
    setEntryNames(["Main Entry"]);
    setRulesAccepted(false);
    setPaymentConfirmed(false);
    setPoolRules(null);
  };

  const syncEntryNames = (count: number, previous: string[]) => {
    const next: string[] = [];
    for (let i = 0; i < count; i++) {
      next.push(previous[i]?.trim() || (i === 0 ? "Main Entry" : `Entry ${i + 1}`));
    }
    return next;
  };

  const handleLookup = async (code?: string) => {
    const lookupCode = (code || inviteCode).trim().toUpperCase();
    if (!lookupCode) {
      setError("Please enter an invite code");
      return;
    }

    setIsLoading(true);
    setError("");
    setLeaguePreview(null);
    resetWizardState();

    try {
      const response = await fetch(`/api/leagues/invite/${lookupCode}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Invalid invite code");
      }

      const data = (await response.json()) as LeaguePreview;
      setInviteCode(lookupCode);
      setLeaguePreview(data);

      const nextMaxEntries = data.entrySettings?.allowMultipleEntries
        ? Math.max(1, data.entrySettings.maxEntriesPerUser || 1)
        : 1;
      const draftRaw = localStorage.getItem(getDraftKey(lookupCode));
      if (draftRaw) {
        try {
          const draft = JSON.parse(draftRaw) as {
            stepIndex?: number;
            firstName?: string;
            lastName?: string;
            contactEmail?: string;
            contactPhone?: string;
            requestedEntries?: number;
            entryNames?: string[];
            rulesAccepted?: boolean;
            paymentConfirmed?: boolean;
          };
          const entryCount = clampEntryCount(Number(draft.requestedEntries || 1), nextMaxEntries);
          setStepIndex(Math.min(5, Math.max(0, Number(draft.stepIndex || 0))));
          setFirstName(draft.firstName || "");
          setLastName(draft.lastName || "");
          setContactEmail(draft.contactEmail || "");
          setContactPhone(draft.contactPhone || "");
          setRequestedEntries(entryCount);
          setEntryNames(syncEntryNames(entryCount, draft.entryNames || []));
          setRulesAccepted(draft.rulesAccepted === true);
          setPaymentConfirmed(draft.paymentConfirmed === true);
        } catch {
          setRequestedEntries(1);
          setEntryNames(["Main Entry"]);
        }
      } else {
        setRequestedEntries(1);
        setEntryNames(["Main Entry"]);
      }

      if (data.profileRequirements?.missingEmail) setContactEmail("");
      if (data.profileRequirements?.missingPhone) setContactPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid invite code. Please check and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const validateCurrentStep = useCallback((): string | null => {
    if (!leaguePreview) return "Please look up a valid invite code first.";
    if (stepIndex === 1) {
      if (!firstName.trim() || !lastName.trim()) return "First and last name are required.";
      if (leaguePreview.joinRequirements?.requireEmail && (!contactEmail.trim() || !isValidEmail(contactEmail)))
        return "A valid email is required for this pool.";
      if (leaguePreview.joinRequirements?.requirePhone && (!contactPhone.trim() || !isValidPhone(contactPhone)))
        return "A valid phone number is required for this pool.";
      if (contactEmail.trim() && !isValidEmail(contactEmail)) return "Please enter a valid email address.";
      if (contactPhone.trim() && !isValidPhone(contactPhone)) return "Please enter a valid 10-digit phone number.";
    }
    if (stepIndex === 2) {
      if (effectiveRequestedEntries < 1 || effectiveRequestedEntries > maxEntries)
        return `Entries must be between 1 and ${maxEntries}.`;
      const hasBlankNames = entryNames.slice(0, effectiveRequestedEntries).some((v) => !v.trim());
      if (hasBlankNames) return "Each entry needs a name.";
    }
    if (stepIndex === 3 && !rulesAccepted) return "You must accept the pool rules to continue.";
    if (stepIndex === 4 && requiresPaymentStep && !paymentConfirmed)
      return "Please confirm payment to continue.";
    return null;
  }, [leaguePreview, stepIndex, firstName, lastName, contactEmail, contactPhone, effectiveRequestedEntries, maxEntries, entryNames, rulesAccepted, requiresPaymentStep, paymentConfirmed]);

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/leagues/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode.toUpperCase(),
          email: contactEmail.trim() || undefined,
          phone: contactPhone.trim() || undefined,
          requestedEntries: effectiveRequestedEntries,
          entryNames: entryNames
            .slice(0, effectiveRequestedEntries)
            .map((v, idx) => v.trim() || (idx === 0 ? "Main Entry" : `Entry ${idx + 1}`)),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to join league");
      }

      const data = await response.json() as { leagueName: string; leagueId?: number; status?: string };
      setJoinedLeagueName(data.leagueName);
      setJoinedLeagueId(data.leagueId || leaguePreview?.id || null);
      setJoinPendingApproval(data.status === "pending_approval");
      setJoined(true);
      setStepIndex(6);
      localStorage.removeItem(getDraftKey(inviteCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join league");
    } finally {
      setIsLoading(false);
    }
  };

  const goNext = async () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");

    // Auto-skip payment step when no fee
    if (stepIndex === 3 && !requiresPaymentStep) {
      setStepDirection("forward");
      setStepIndex(5); // skip to review
      return;
    }

    if (stepIndex >= 5) {
      await handleJoin();
      return;
    }
    setStepDirection("forward");
    setStepIndex((prev) => Math.min(prev + 1, 5));
  };

  const goBack = () => {
    setError("");
    // Auto-skip payment step going backward
    if (stepIndex === 5 && !requiresPaymentStep) {
      setStepDirection("backward");
      setStepIndex(3);
      return;
    }
    setStepDirection("backward");
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  // ============ Success Screen ============
  if (joined) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="relative">
            <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 flex items-center justify-center">
              {joinPendingApproval ? (
                <Loader2 className="h-10 w-10 text-amber-400" />
              ) : (
                <PartyPopper className="h-10 w-10 text-emerald-400" />
              )}
            </div>
            <div className="absolute inset-0 -z-10">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {joinPendingApproval ? "Request Submitted" : "You're In!"}
            </h2>
            <p className="text-slate-400">
              {joinPendingApproval
                ? `Your request to join ${joinedLeagueName} is awaiting commissioner approval. You'll be notified when it's confirmed.`
                : `Welcome to ${joinedLeagueName}! Your entries are active and ready to go.`}
            </p>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Pool</span>
              <span className="text-white font-medium">{joinedLeagueName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Entries</span>
              <span className="text-white font-medium">{effectiveRequestedEntries}</span>
            </div>
            {totalDueCents > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-400">Total Due</span>
                <span className="text-white font-medium">${(totalDueCents / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Status</span>
              <Badge variant={joinPendingApproval ? "outline" : "default"} className="text-xs">
                {joinPendingApproval ? "Pending Approval" : "Active"}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {joinedLeagueId && !joinPendingApproval && (
              <Button
                onClick={() => navigate(`/pool/${joinedLeagueId}`)}
                className="w-full bg-primary hover:bg-primary/90 h-12 text-base"
              >
                Go to Pool
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/")} className="w-full">
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============ Main Enrollment Flow ============
  return (
    <div className="max-w-2xl mx-auto space-y-6 min-h-[70vh] pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Join a Pool</h1>
          <p className="text-muted-foreground text-sm">Enter your invite code to begin enrollment.</p>
        </div>
      </div>

      {/* Invite Code Input */}
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter invite code"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value.toUpperCase());
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleLookup();
              }}
              className="font-mono text-lg tracking-wider uppercase flex-1"
            />
            <Button
              onClick={() => void handleLookup()}
              disabled={isLoading || !inviteCode.trim()}
              className="px-6"
            >
              {isLoading && !leaguePreview ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Look Up"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status messages for existing members */}
      {leaguePreview?.membershipStatus === "pending_approval" && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium">Pending Approval</p>
              <p className="text-xs text-muted-foreground">Your request is waiting for commissioner approval.</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate("/")}>
              Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {leaguePreview?.isMember && leaguePreview.membershipStatus === "joined" && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium">Already a Member</p>
              <p className="text-xs text-muted-foreground">You're already in {leaguePreview.name}.</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate(`/pool/${leaguePreview.id}`)}>
              Go to Pool
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Enrollment Wizard */}
      {leaguePreview && !leaguePreview.isMember && leaguePreview.membershipStatus !== "pending_approval" && sport && format && (
        <Card className="border-primary/20 overflow-hidden">
          {/* Pool Banner */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <sport.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-white truncate">{leaguePreview.name}</h2>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Badge variant="secondary" className="text-xs">{format.name}</Badge>
                  <span>&middot;</span>
                  <span>{leaguePreview.season}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="px-5 pt-4 pb-2">
            <StepIndicator
              steps={STEP_META}
              currentIndex={stepIndex}
              skipPayment={!requiresPaymentStep}
            />
            <Progress value={progressPercent} className="mt-3 h-1" />
          </div>

          <CardContent className="p-5 pt-3">
            <StepContainer direction={stepDirection}>
              {/* ============ Step 0: Intro ============ */}
              {stepIndex === 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoTile icon={Trophy} label="Sport" value={sport.name} />
                    <InfoTile icon={Calendar} label="Season" value={leaguePreview.season} />
                    <InfoTile icon={Users} label="Members" value={`${leaguePreview.member_count}`} />
                    <InfoTile
                      icon={DollarSign}
                      label="Entry Fee"
                      value={
                        leaguePreview.entry_fee_cents > 0
                          ? `$${(leaguePreview.entry_fee_cents / 100).toFixed(2)}`
                          : "Free"
                      }
                    />
                  </div>

                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">What to expect</p>
                    <ul className="space-y-1.5 text-sm text-slate-300">
                      {leaguePreview.joinRequirements?.approvalRequired && (
                        <li className="flex items-start gap-2">
                          <Shield className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                          Commissioner approval required
                        </li>
                      )}
                      {leaguePreview.entrySettings?.allowMultipleEntries ? (
                        <li className="flex items-start gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                          Multiple entries allowed (up to {maxEntries})
                        </li>
                      ) : (
                        <li className="flex items-start gap-2">
                          <User className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                          Single entry pool
                        </li>
                      )}
                      {(leaguePreview.entry_fee_cents || 0) > 0 && (
                        <li className="flex items-start gap-2">
                          <CreditCard className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                          Payment required to activate entry
                        </li>
                      )}
                      <li className="flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        You'll review and accept pool rules before joining
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* ============ Step 1: User Info ============ */}
              {stepIndex === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    Provide your contact info so the commissioner and other members can identify you.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="join-first-name" className="text-xs">First Name *</Label>
                      <Input
                        id="join-first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="join-last-name" className="text-xs">Last Name *</Label>
                      <Input
                        id="join-last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="join-email" className="text-xs flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      Email {leaguePreview.joinRequirements?.requireEmail ? "*" : "(optional)"}
                    </Label>
                    <Input
                      id="join-email"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="name@example.com"
                    />
                    <FieldStatus
                      valid={emailValid}
                      message={emailValid === false ? "Enter a valid email address" : emailValid ? "Valid" : undefined}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="join-phone" className="text-xs flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      Phone {leaguePreview.joinRequirements?.requirePhone ? "*" : "(optional)"}
                    </Label>
                    <Input
                      id="join-phone"
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(formatPhone(e.target.value))}
                      placeholder="(555) 555-5555"
                    />
                    <FieldStatus
                      valid={phoneValid}
                      message={phoneValid === false ? "Enter a valid 10-digit number" : phoneValid ? "Valid" : undefined}
                    />
                  </div>
                </div>
              )}

              {/* ============ Step 2: Entry Setup ============ */}
              {stepIndex === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    {leaguePreview.entrySettings?.allowMultipleEntries
                      ? `Choose how many entries you'd like (max ${maxEntries}), and name each one.`
                      : "You'll have a single entry in this pool. Give it a name."}
                  </p>

                  {leaguePreview.entrySettings?.allowMultipleEntries && (
                    <div className="space-y-2">
                      <Label className="text-xs">Number of Entries</Label>
                      <div className="flex flex-wrap gap-2">
                        {(packageOptions.length > 0 ? packageOptions : [1]).map((option) => {
                          const value = clampEntryCount(option, maxEntries);
                          const isSelected = effectiveRequestedEntries === value;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setRequestedEntries(value);
                                setEntryNames((prev) => syncEntryNames(value, prev));
                              }}
                              className={cn(
                                "px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                                isSelected
                                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                                  : "bg-white/[0.03] border-white/[0.08] text-slate-300 hover:bg-white/[0.06]"
                              )}
                            >
                              {value} {value === 1 ? "Entry" : "Entries"}
                              {(leaguePreview.entry_fee_cents || 0) > 0 && (
                                <span className="block text-xs opacity-70">
                                  ${((leaguePreview.entry_fee_cents * value) / 100).toFixed(2)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs">Name{effectiveRequestedEntries > 1 ? "s" : ""}</Label>
                    <div className="space-y-2">
                      {Array.from({ length: effectiveRequestedEntries }).map((_, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-xs text-slate-400 shrink-0">
                            {idx + 1}
                          </span>
                          <Input
                            value={entryNames[idx] || ""}
                            onChange={(e) => {
                              const next = [...entryNames];
                              next[idx] = e.target.value;
                              setEntryNames(next);
                            }}
                            placeholder={idx === 0 ? "Main Entry" : `Entry ${idx + 1}`}
                            className="flex-1"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ============ Step 3: Rules ============ */}
              {stepIndex === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    Review the pool rules before continuing. All participants are bound by these rules.
                  </p>

                  {rulesLoading ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading pool rules...
                    </div>
                  ) : poolRules ? (
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] max-h-[40vh] overflow-y-auto">
                      <div className="p-4 space-y-4">
                        {poolRules.pool_rules.system_rules.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 font-medium">System Rules</p>
                            <ul className="space-y-1.5">
                              {poolRules.pool_rules.system_rules.map((rule) => (
                                <li key={rule.key} className="text-sm text-slate-300 flex items-start gap-2">
                                  <span className="text-primary mt-1 shrink-0">&bull;</span>
                                  <span>{rule.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {poolRules.pool_rules.commissioner_rules.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 font-medium">Commissioner Rules</p>
                            <ul className="space-y-1.5">
                              {poolRules.pool_rules.commissioner_rules.map((rule) => (
                                <li key={rule.key} className="text-sm text-slate-300 flex items-start gap-2">
                                  <span className="text-amber-400 mt-1 shrink-0">&bull;</span>
                                  <span>{rule.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {poolRules.pool_rules.dynamic_rules.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 font-medium">Dynamic Rules</p>
                            <ul className="space-y-1.5">
                              {poolRules.pool_rules.dynamic_rules.map((rule) => (
                                <li key={rule.key} className="text-sm text-slate-300 flex items-start gap-2">
                                  <span className="text-cyan-400 mt-1 shrink-0">&bull;</span>
                                  <span>{rule.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 text-sm text-slate-300">
                      <p className="font-medium mb-1">Pool Rules</p>
                      <p className="text-muted-foreground">
                        You agree to follow commissioner settings, lock deadlines, and scoring rules for this pool.
                      </p>
                    </div>
                  )}

                  <label className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:bg-white/[0.05] transition-colors">
                    <Checkbox
                      id="join-rules-accepted"
                      checked={rulesAccepted}
                      onCheckedChange={(checked) => setRulesAccepted(checked === true)}
                    />
                    <span className="text-sm text-white">
                      I accept the pool rules and participation terms.
                    </span>
                  </label>
                </div>
              )}

              {/* ============ Step 4: Payment ============ */}
              {stepIndex === 4 && (
                <div className="space-y-4">
                  {requiresPaymentStep ? (
                    <>
                      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CreditCard className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">Payment Summary</p>
                            <p className="text-xs text-slate-400">Entry fee required to activate</p>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm border-t border-white/[0.06] pt-3">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Entry fee</span>
                            <span className="text-white">${(leaguePreview.entry_fee_cents / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Entries</span>
                            <span className="text-white">&times; {effectiveRequestedEntries}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-white/[0.06]">
                            <span className="font-semibold text-white">Total</span>
                            <span className="font-bold text-lg text-white">${(totalDueCents / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <label className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:bg-white/[0.05] transition-colors">
                        <Checkbox
                          id="join-payment-confirmed"
                          checked={paymentConfirmed}
                          onCheckedChange={(checked) => setPaymentConfirmed(checked === true)}
                        />
                        <span className="text-sm text-white">
                          I understand payment is required to activate {effectiveRequestedEntries > 1 ? "these entries" : "this entry"}.
                        </span>
                      </label>
                    </>
                  ) : (
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-4 flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                      <p className="text-sm text-emerald-300">
                        No upfront payment required. Continue to review your enrollment.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ============ Step 5: Review ============ */}
              {stepIndex === 5 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    Review your enrollment details. Use Back to edit any section.
                  </p>

                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] divide-y divide-white/[0.06]">
                    <ReviewRow label="Name" value={`${firstName.trim()} ${lastName.trim()}`} />
                    <ReviewRow label="Email" value={contactEmail.trim() || "Not provided"} />
                    <ReviewRow label="Phone" value={contactPhone.trim() || "Not provided"} />
                    <ReviewRow label="Entries" value={`${effectiveRequestedEntries}`} />
                    <ReviewRow
                      label="Entry Names"
                      value={entryNames.slice(0, effectiveRequestedEntries).map((v) => v.trim()).filter(Boolean).join(", ")}
                    />
                    <ReviewRow
                      label="Total Due"
                      value={totalDueCents > 0 ? `$${(totalDueCents / 100).toFixed(2)}` : "Free"}
                      highlight
                    />
                    <ReviewRow label="Rules" value={rulesAccepted ? "Accepted" : "Not accepted"} />
                  </div>
                </div>
              )}
            </StepContainer>

            {/* Error */}
            {error && (
              <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-white/[0.06]">
              <Button
                variant="ghost"
                onClick={goBack}
                disabled={stepIndex === 0 || isLoading}
                className="gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>

              {stepIndex < 5 ? (
                <Button onClick={() => void goNext()} disabled={isLoading} className="gap-1 px-6">
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <PoolAccessGate action="join" variant="inline">
                  <Button
                    onClick={() => void goNext()}
                    disabled={isLoading}
                    className="gap-2 px-6 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Submit Enrollment
                      </>
                    )}
                  </Button>
                </PoolAccessGate>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <p className="text-xs text-slate-400">{label}</p>
      </div>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function ReviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={cn("text-sm", highlight ? "font-bold text-white" : "text-white font-medium")}>{value}</span>
    </div>
  );
}
