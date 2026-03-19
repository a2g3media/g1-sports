import { useState, useEffect } from "react";
import {
  X,
  User,
  Mail,
  Phone,
  Calendar,
  Clock,
  Shield,
  Eye,
  Receipt,
  Activity,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  MessageSquare,
  FileText,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Textarea } from "@/react-app/components/ui/textarea";

interface MemberDetail {
  member_id: number;
  user_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  invite_status: string;
  pick_status: string;
  payment_status: string;
  eligibility_status: string;
  notes: string | null;
  invited_at: string | null;
  joined_at: string | null;
  last_active_at: string | null;
  notification_email: boolean;
  notification_sms: boolean;
  receipts: Array<{
    id: number;
    code: string;
    period: string;
    submitted_at: string;
    status: string;
    pick_count: number;
  }>;
  activity: Array<{
    id: number;
    event_type: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
  payments: Array<{
    id: number;
    type: string;
    amount_cents: number;
    status: string;
    created_at: string;
  }>;
  stats: {
    total_picks: number;
    picks_on_time: number;
    total_paid: number;
    seasons_played: number;
  };
}

interface MemberDetailDrawerProps {
  memberId: number;
  leagueId: string;
  onClose: () => void;
  onNotesSaved?: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: string; type?: "pick" | "payment" | "eligibility" | "invite" }) {
  const configs: Record<string, { className: string; icon?: typeof CheckCircle2 }> = {
    // Pick statuses
    submitted: { className: "bg-green-500/10 text-green-600", icon: CheckCircle2 },
    missing: { className: "bg-red-500/10 text-red-500", icon: XCircle },
    locked: { className: "bg-amber-500/10 text-amber-600", icon: Clock },
    // Payment statuses
    paid: { className: "bg-green-500/10 text-green-600", icon: CheckCircle2 },
    unpaid: { className: "bg-red-500/10 text-red-500", icon: XCircle },
    pending: { className: "bg-amber-500/10 text-amber-600", icon: Clock },
    // Eligibility
    eligible: { className: "bg-green-500/10 text-green-600", icon: CheckCircle2 },
    ineligible: { className: "bg-red-500/10 text-red-500", icon: XCircle },
    // Invite
    joined: { className: "bg-green-500/10 text-green-600" },
    invited: { className: "bg-blue-500/10 text-blue-600" },
    declined: { className: "bg-red-500/10 text-red-500" },
    removed: { className: "bg-muted text-muted-foreground" },
  };

  const config = configs[status] || { className: "bg-muted text-muted-foreground" };
  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize", config.className)}>
      {Icon && <Icon className="w-3 h-3" />}
      {status}
    </span>
  );
}

export function MemberDetailDrawer({
  memberId,
  leagueId,
  onClose,
  onNotesSaved,
}: MemberDetailDrawerProps) {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "receipts" | "activity" | "payments">("overview");
  const [notes, setNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);

  // Fetch member details
  useEffect(() => {
    async function fetchMember() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/pool-admin/${leagueId}/members/${memberId}/detail`);
        if (!res.ok) {
          throw new Error("Failed to load member details");
        }
        const data = await res.json();
        setMember(data);
        setNotes(data.notes || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    }
    fetchMember();
  }, [memberId, leagueId]);

  // Reveal phone
  const revealPhone = async () => {
    try {
      const res = await fetch(`/api/pool-admin/${leagueId}/members/${memberId}/reveal-phone`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedPhone(data.phone || "Not set");
        setPhoneRevealed(true);
      }
    } catch (e) {
      console.error("Failed to reveal phone", e);
    }
  };

  // Save notes
  const saveNotes = async () => {
    setIsSavingNotes(true);
    try {
      const res = await fetch(`/api/pool-admin/${leagueId}/members/${memberId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        onNotesSaved?.();
      }
    } catch (e) {
      console.error("Failed to save notes", e);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const tabs = [
    { key: "overview", label: "Overview", icon: User },
    { key: "receipts", label: "Receipts", icon: Receipt },
    { key: "activity", label: "Activity", icon: Activity },
    { key: "payments", label: "Payments", icon: DollarSign },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Drawer */}
      <div
        className="relative w-full max-w-md h-full bg-card border-l border-border flex flex-col animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Member Details</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={onClose} className="mt-4">
                Close
              </Button>
            </div>
          </div>
        ) : member ? (
          <>
            {/* Profile Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary">
                  {member.name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">
                    {member.name || member.email.split("@")[0]}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {member.role !== "member" && (
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                        member.role === "owner" ? "bg-amber-500/10 text-amber-600" : "bg-purple-500/10 text-purple-600"
                      )}>
                        <Shield className="w-3 h-3" />
                        {member.role}
                      </span>
                    )}
                    <StatusBadge status={member.invite_status} type="invite" />
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-2 mt-4">
                <div className="text-center p-2 bg-secondary/50 rounded-lg">
                  <p className="text-lg font-semibold">{member.stats.total_picks}</p>
                  <p className="text-[10px] text-muted-foreground">Picks</p>
                </div>
                <div className="text-center p-2 bg-secondary/50 rounded-lg">
                  <p className="text-lg font-semibold">
                    {member.stats.total_picks > 0 
                      ? Math.round((member.stats.picks_on_time / member.stats.total_picks) * 100) 
                      : 0}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">On Time</p>
                </div>
                <div className="text-center p-2 bg-secondary/50 rounded-lg">
                  <p className="text-lg font-semibold">{formatCurrency(member.stats.total_paid)}</p>
                  <p className="text-[10px] text-muted-foreground">Paid</p>
                </div>
                <div className="text-center p-2 bg-secondary/50 rounded-lg">
                  <p className="text-lg font-semibold">{member.stats.seasons_played}</p>
                  <p className="text-[10px] text-muted-foreground">Seasons</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
                    activeTab === tab.key
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "overview" && (
                <div className="space-y-4">
                  {/* Contact Info */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Contact
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-2.5 bg-secondary/30 rounded-lg">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm truncate">{member.email}</span>
                      </div>
                      <div className="flex items-center gap-3 p-2.5 bg-secondary/30 rounded-lg">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        {phoneRevealed ? (
                          <span className="text-sm font-mono">{revealedPhone}</span>
                        ) : member.phone ? (
                          <button
                            onClick={revealPhone}
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            Reveal phone <Eye className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not set</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Status
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Pick Status</p>
                        <StatusBadge status={member.pick_status} type="pick" />
                      </div>
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Payment</p>
                        <StatusBadge status={member.payment_status} type="payment" />
                      </div>
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Eligibility</p>
                        <StatusBadge status={member.eligibility_status} type="eligibility" />
                      </div>
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Last Active</p>
                        <p className="text-sm font-medium">{formatRelativeTime(member.last_active_at)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Timeline
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> Invited
                        </span>
                        <span>{formatDate(member.invited_at)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> Joined
                        </span>
                        <span>{formatDate(member.joined_at)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Clock className="w-4 h-4" /> Last Active
                        </span>
                        <span>{formatDateTime(member.last_active_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notifications */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Notifications
                    </h4>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                        member.notification_email ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
                      )}>
                        <Mail className="w-3 h-3" />
                        Email {member.notification_email ? "On" : "Off"}
                      </div>
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                        member.notification_sms ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
                      )}>
                        <MessageSquare className="w-3 h-3" />
                        SMS {member.notification_sms ? "On" : "Off"}
                      </div>
                    </div>
                  </div>

                  {/* Admin Notes */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Admin Notes
                    </h4>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add private notes about this member..."
                      className="min-h-[80px] text-sm"
                    />
                    {notes !== (member.notes || "") && (
                      <Button size="sm" onClick={saveNotes} disabled={isSavingNotes}>
                        {isSavingNotes ? (
                          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                        ) : (
                          <FileText className="w-3 h-3 mr-1.5" />
                        )}
                        Save Notes
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "receipts" && (
                <div className="space-y-3">
                  {/* Admin Notice */}
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                    <Shield className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        Admin Read-Only Access
                      </p>
                      <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                        View receipts for dispute resolution. All access is logged.
                      </p>
                    </div>
                  </div>

                  {member.receipts.length === 0 ? (
                    <div className="text-center py-8">
                      <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No receipts yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This member hasn't submitted any picks
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {member.receipts.map((receipt) => (
                        <a
                          key={receipt.id}
                          href={`/receipts/${receipt.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                              receipt.status === "active" || receipt.status === "submitted"
                                ? "bg-green-500/10 text-green-600"
                                : "bg-muted text-muted-foreground"
                            )}>
                              <Receipt className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono font-medium">
                                  {receipt.code}
                                </code>
                                {receipt.status === "replaced" && (
                                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                    Replaced
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {receipt.period} · {receipt.pick_count} picks · {formatRelativeTime(receipt.submitted_at)}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "activity" && (
                <div className="space-y-2">
                  {member.activity.length === 0 ? (
                    <div className="text-center py-8">
                      <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No activity yet</p>
                    </div>
                  ) : (
                    member.activity.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 p-3 bg-secondary/30 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{event.event_type.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(event.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "payments" && (
                <div className="space-y-2">
                  {member.payments.length === 0 ? (
                    <div className="text-center py-8">
                      <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No payments yet</p>
                    </div>
                  ) : (
                    member.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium capitalize">{payment.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(payment.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatCurrency(payment.amount_cents)}</p>
                          <StatusBadge status={payment.status} type="payment" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
