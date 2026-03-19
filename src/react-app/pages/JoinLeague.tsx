import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Badge } from "@/react-app/components/ui/badge";
import { Checkbox } from "@/react-app/components/ui/checkbox";
import { Progress } from "@/react-app/components/ui/progress";
import { ArrowLeft, Users, Trophy, Calendar, CheckCircle, Loader2, DollarSign } from "lucide-react";
import { SPORTS, POOL_FORMATS } from "@/react-app/data/sports";
import { PoolAccessGate } from "@/react-app/components/PoolAccessGate";

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

const WIZARD_STEPS = [
  "Pool Intro",
  "User Info",
  "Entry Setup",
  "Rules",
  "Payment",
  "Review",
  "Success",
] as const;

function clampEntryCount(value: number, max: number): number {
  const safeMax = Math.max(1, max || 1);
  return Math.min(safeMax, Math.max(1, Math.floor(value || 1)));
}

function getDraftKey(inviteCode: string): string {
  return `join-wizard:${inviteCode.toUpperCase()}`;
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
  const [joinPendingApproval, setJoinPendingApproval] = useState(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [requestedEntries, setRequestedEntries] = useState(1);
  const [entryNames, setEntryNames] = useState<string[]>(["Main Entry"]);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

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
    return Math.round(((stepIndex + 1) / WIZARD_STEPS.length) * 100);
  }, [joined, stepIndex]);

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
    leaguePreview,
    inviteCode,
    stepIndex,
    firstName,
    lastName,
    contactEmail,
    contactPhone,
    effectiveRequestedEntries,
    entryNames,
    rulesAccepted,
    paymentConfirmed,
  ]);

  useEffect(() => {
    if (!codeFromUrl) return;
    void handleLookup(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  const resetWizardState = () => {
    setStepIndex(0);
    setFirstName("");
    setLastName("");
    setContactEmail("");
    setContactPhone("");
    setRequestedEntries(1);
    setEntryNames(["Main Entry"]);
    setRulesAccepted(false);
    setPaymentConfirmed(false);
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
        throw new Error(data.error || "Invalid invite code");
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

      if (data.profileRequirements?.missingEmail) {
        setContactEmail("");
      }
      if (data.profileRequirements?.missingPhone) {
        setContactPhone("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid invite code. Please check and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const validateCurrentStep = (): string | null => {
    if (!leaguePreview) return "Please look up a valid invite code first.";
    if (stepIndex === 1) {
      if (!firstName.trim() || !lastName.trim()) return "First and last name are required.";
      if (leaguePreview.joinRequirements?.requireEmail && !contactEmail.trim()) return "Email is required for this pool.";
      if (leaguePreview.joinRequirements?.requirePhone && !contactPhone.trim()) return "Phone number is required for this pool.";
    }
    if (stepIndex === 2) {
      if (effectiveRequestedEntries < 1 || effectiveRequestedEntries > maxEntries) {
        return `Entries must be between 1 and ${maxEntries}.`;
      }
      const hasBlankNames = entryNames.slice(0, effectiveRequestedEntries).some((v) => !v.trim());
      if (hasBlankNames) return "Each entry needs a name.";
    }
    if (stepIndex === 3 && !rulesAccepted) {
      return "You must accept the pool rules to continue.";
    }
    if (stepIndex === 4 && requiresPaymentStep && !paymentConfirmed) {
      return "Please confirm payment step to continue.";
    }
    return null;
  };

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
          entryNames: entryNames.slice(0, effectiveRequestedEntries).map((v, idx) => v.trim() || (idx === 0 ? "Main Entry" : `Entry ${idx + 1}`)),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to join league");
      }

      const data = await response.json();
      setJoinedLeagueName(data.leagueName);
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
    if (stepIndex >= 5) {
      await handleJoin();
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, 5));
  };

  const goBack = () => {
    setError("");
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  if (joined) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {joinPendingApproval ? "Request submitted" : "You're in!"}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {joinPendingApproval
                    ? `Your request to join ${joinedLeagueName} is waiting for commissioner approval.`
                    : `Successfully joined ${joinedLeagueName}`}
                </p>
              </div>
              <Button onClick={() => navigate("/")} className="w-full">
                {joinPendingApproval ? "Back to Dashboard" : "Go to Dashboard"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 min-h-[70vh]">
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Join a League</h1>
          <p className="text-muted-foreground text-sm">Complete the enrollment flow to enter this pool.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enter Invite Code</CardTitle>
          <CardDescription>Paste your invite code to start enrollment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Invite Code</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                placeholder="e.g. ABC123"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleLookup();
                }}
                className="font-mono text-lg tracking-wider uppercase"
              />
              <Button onClick={() => void handleLookup()} disabled={isLoading || !inviteCode.trim()}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look Up"}
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {leaguePreview?.membershipStatus === "pending_approval" && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">You already have a pending request for this pool.</p>
            <Button className="w-full" variant="secondary" onClick={() => navigate("/")}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {leaguePreview?.isMember && leaguePreview.membershipStatus === "joined" && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">You are already a member of this league.</p>
            <Button className="w-full" variant="secondary" onClick={() => navigate("/")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {leaguePreview && !leaguePreview.isMember && leaguePreview.membershipStatus !== "pending_approval" && sport && format && (
        <Card className="border-primary/40">
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <sport.icon className="h-6 w-6" />
                  {leaguePreview.name}
                </CardTitle>
                <CardDescription>{WIZARD_STEPS[stepIndex]} ({stepIndex + 1}/{WIZARD_STEPS.length})</CardDescription>
              </div>
              <Badge variant="secondary">{format.name}</Badge>
            </div>
            <Progress value={progressPercent} />
          </CardHeader>
          <CardContent className="space-y-6">
            {stepIndex === 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-muted-foreground" />
                    <span>{sport.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{leaguePreview.season}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{leaguePreview.member_count} member{leaguePreview.member_count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>${(leaguePreview.entry_fee_cents / 100).toFixed(2)} per entry</span>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  <p className="font-medium mb-1">Highlights</p>
                  <ul className="list-disc pl-4 text-muted-foreground space-y-1">
                    {leaguePreview.joinRequirements?.approvalRequired && <li>Commissioner approval required.</li>}
                    {leaguePreview.joinRequirements?.approvalRequired && leaguePreview.joinRequirements?.autoApproveWhenProfileComplete && (
                      <li>Auto-approval enabled when required profile fields are complete.</li>
                    )}
                    {leaguePreview.joinRequirements?.requireEmail && <li>Email is required to submit enrollment.</li>}
                    {leaguePreview.joinRequirements?.requirePhone && <li>Phone number is required to submit enrollment.</li>}
                    {leaguePreview.entrySettings?.allowMultipleEntries
                      ? <li>Multiple entries enabled (max {maxEntries}).</li>
                      : <li>Single entry pool.</li>}
                  </ul>
                </div>
              </div>
            )}

            {stepIndex === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="join-first-name">First Name</Label>
                    <Input
                      id="join-first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="join-last-name">Last Name</Label>
                    <Input
                      id="join-last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="join-email">Email</Label>
                  <Input
                    id="join-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="join-phone">Phone Number</Label>
                  <Input
                    id="join-phone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>
            )}

            {stepIndex === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>How many entries?</Label>
                  <div className="flex flex-wrap gap-2">
                    {(packageOptions.length > 0 ? packageOptions : [1]).map((option) => {
                      const value = clampEntryCount(option, maxEntries);
                      return (
                        <Button
                          key={option}
                          type="button"
                          size="sm"
                          variant={effectiveRequestedEntries === value ? "default" : "outline"}
                          onClick={() => {
                            setRequestedEntries(value);
                            setEntryNames((prev) => syncEntryNames(value, prev));
                          }}
                        >
                          {value} {value === 1 ? "Entry" : "Entries"}
                        </Button>
                      );
                    })}
                  </div>
                  {leaguePreview.entrySettings?.allowMultipleEntries && (
                    <p className="text-xs text-muted-foreground">Maximum allowed: {maxEntries}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Entry names</Label>
                  {Array.from({ length: effectiveRequestedEntries }).map((_, idx) => (
                    <Input
                      key={`entry-name-${idx + 1}`}
                      value={entryNames[idx] || ""}
                      onChange={(e) => {
                        const next = [...entryNames];
                        next[idx] = e.target.value;
                        setEntryNames(next);
                      }}
                      placeholder={idx === 0 ? "Main Entry" : `Entry ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {stepIndex === 3 && (
              <div className="space-y-4">
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Rules acceptance</p>
                  <p>You agree to follow commissioner settings, lock deadlines, and scoring rules for this pool.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="join-rules-accepted"
                    checked={rulesAccepted}
                    onCheckedChange={(checked) => setRulesAccepted(checked === true)}
                  />
                  <Label htmlFor="join-rules-accepted">I accept the pool rules and participation terms.</Label>
                </div>
              </div>
            )}

            {stepIndex === 4 && (
              <div className="space-y-4">
                {requiresPaymentStep ? (
                  <>
                    <div className="rounded-md border p-3 text-sm">
                      <p className="font-medium mb-1">Payment required before entry</p>
                      <p className="text-muted-foreground">
                        Entry fee: ${(leaguePreview.entry_fee_cents / 100).toFixed(2)} x {effectiveRequestedEntries} ={" "}
                        <span className="font-semibold text-foreground">${(totalDueCents / 100).toFixed(2)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="join-payment-confirmed"
                        checked={paymentConfirmed}
                        onCheckedChange={(checked) => setPaymentConfirmed(checked === true)}
                      />
                      <Label htmlFor="join-payment-confirmed">I understand payment is required to activate these entries.</Label>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                    No upfront payment is required for this pool. Continue to review your enrollment.
                  </div>
                )}
              </div>
            )}

            {stepIndex === 5 && (
              <div className="space-y-4">
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium mb-2">Review</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>Name: {firstName.trim()} {lastName.trim()}</li>
                    <li>Email: {contactEmail.trim() || "Not provided"}</li>
                    <li>Phone: {contactPhone.trim() || "Not provided"}</li>
                    <li>Entries: {effectiveRequestedEntries}</li>
                    <li>
                      Entry names: {entryNames.slice(0, effectiveRequestedEntries).map((v) => v.trim()).filter(Boolean).join(", ")}
                    </li>
                    <li>Total due: ${(totalDueCents / 100).toFixed(2)}</li>
                  </ul>
                </div>
                <div className="text-xs text-muted-foreground">
                  Use Back to edit any section before submitting.
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="outline" onClick={goBack} disabled={stepIndex === 0 || isLoading}>
                Back
              </Button>

              {stepIndex < 5 ? (
                <Button onClick={() => void goNext()} disabled={isLoading}>
                  Continue
                </Button>
              ) : (
                <PoolAccessGate action="join" variant="inline">
                  <Button onClick={() => void goNext()} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Enrollment"
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
