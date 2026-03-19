import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { 
  Settings, 
  Users, 
  FileText, 
  DollarSign, 
  Check,
  UserPlus,
  Shield,
  ChevronDown,
  ChevronRight,
  Trash2,
  Crown,
  UserCog,
  Mail,
  Ban,
  RotateCcw,
  X,
  AlertTriangle,
  Lock,
  MessageSquare,
  Loader2
} from "lucide-react";
import { PoolInviteShare } from "../pool-admin/PoolInviteShare";
import { cn } from "@/react-app/lib/utils";
import { formatCurrency } from "@/shared/escrow";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { DEMO_MEMBERS, DEMO_AUDIT_LOG, POOL_TYPE_INFO, DemoMember } from "@/react-app/data/demo-leagues";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  entry_fee_cents: number;
  member_count: number;
  invite_code?: string;
  is_chat_enabled?: number | null;
}

interface PoolHubAdminProps {
  league: League;
}

interface MemberWithPayment extends DemoMember {
  role: "owner" | "admin" | "member";
  paid: boolean;
  joined_at: string;
}

type AdminSection = "members" | "settings" | "audit" | "payments" | null;

export function PoolHubAdmin({ league }: PoolHubAdminProps) {
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  const [expandedSection, setExpandedSection] = useState<AdminSection>("members");
  
  // Member management state
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [removedMembers, setRemovedMembers] = useState<Set<number>>(new Set());
  const [roleChanges, setRoleChanges] = useState<Map<number, "admin" | "member">>(new Map());
  
  // Settings state
  const [settingsForm, setSettingsForm] = useState({
    allowLateJoins: true,
    requirePaymentBeforePicks: league.entry_fee_cents > 0,
    autoLockDeadline: true,
    weeklyReminders: true,
    chatEnabled: league.is_chat_enabled !== 0, // Default to true if null
  });
  const [savingChat, setSavingChat] = useState(false);
  
  // Handle chat toggle with API call
  const handleChatToggle = async () => {
    const newValue = !settingsForm.chatEnabled;
    setSavingChat(true);
    try {
      const res = await fetch(`/api/leagues/${league.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { "X-Demo-Mode": "true" } : {}) },
        body: JSON.stringify({ isChatEnabled: newValue }),
      });
      if (res.ok) {
        setSettingsForm(s => ({ ...s, chatEnabled: newValue }));
      }
    } catch (err) {
      console.error("Failed to update chat setting:", err);
    } finally {
      setSavingChat(false);
    }
  };
  
  const inviteCode = league.invite_code || "DEMO123";
  
  // Generate demo members with roles and payment status
  const members: MemberWithPayment[] = useMemo(() => {
    return DEMO_MEMBERS.slice(0, Math.min(league.member_count, 20)).map((m, idx) => ({
      ...m,
      role: idx === 0 ? "owner" : idx < 3 ? "admin" : "member",
      paid: league.entry_fee_cents === 0 || idx < 15 || Math.random() > 0.3,
      joined_at: new Date(Date.now() - (idx * 86400000 * Math.random())).toISOString(),
    }));
  }, [league.member_count, league.entry_fee_cents]);
  
  // Filter out removed members
  const activeMembersBase = members.filter(m => !removedMembers.has(m.id));
  
  // Apply role changes
  const activeMembers = activeMembersBase.map(m => {
    const newRole = roleChanges.get(m.id);
    if (newRole) {
      return { ...m, role: newRole };
    }
    return m;
  });
  
  const unpaidCount = activeMembers.filter(m => !m.paid && league.entry_fee_cents > 0).length;
  
  const handleRemoveMember = (memberId: number) => {
    setRemovedMembers(prev => new Set([...prev, memberId]));
  };
  
  const handleRestoreMember = (memberId: number) => {
    setRemovedMembers(prev => {
      const next = new Set(prev);
      next.delete(memberId);
      return next;
    });
  };
  
  const handleRoleChange = (memberId: number, newRole: "admin" | "member") => {
    setRoleChanges(prev => {
      const next = new Map(prev);
      next.set(memberId, newRole);
      return next;
    });
    setEditingMemberId(null);
  };
  
  const toggleSection = (section: AdminSection) => {
    setExpandedSection(prev => prev === section ? null : section);
  };
  
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };
  
  const getAuditEventIcon = (eventType: string) => {
    switch (eventType) {
      case "picks_submitted":
      case "picks_replaced":
        return <Check className="w-3.5 h-3.5 text-green-500" />;
      case "member_joined":
        return <UserPlus className="w-3.5 h-3.5 text-blue-500" />;
      case "payment_verified":
        return <DollarSign className="w-3.5 h-3.5 text-emerald-500" />;
      case "admin_override":
        return <Shield className="w-3.5 h-3.5 text-amber-500" />;
      case "picks_locked":
        return <Lock className="w-3.5 h-3.5 text-purple-500" />;
      case "survivor_eliminated":
        return <Ban className="w-3.5 h-3.5 text-red-500" />;
      case "league_created":
        return <Settings className="w-3.5 h-3.5 text-primary" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };
  
  const getRoleBadge = (role: "owner" | "admin" | "member") => {
    switch (role) {
      case "owner":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">
            <Crown className="w-3 h-3" />
            Owner
          </span>
        );
      case "admin":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600">
            <Shield className="w-3 h-3" />
            Admin
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 animate-page-enter">
      {/* Admin Notice */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <Shield className="w-5 h-5 text-amber-500 shrink-0" />
        <div>
          <p className="text-sm font-medium">Commissioner Access</p>
          <p className="text-xs text-muted-foreground">
            You can manage members, settings, and view all pool activity.
          </p>
        </div>
      </div>
      
      {/* Quick Invite Card */}
      <div className="card-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Invite Players
          </h3>
          <span className="text-xs text-muted-foreground">{activeMembers.length} members</span>
        </div>
        
        <PoolInviteShare 
          poolName={league.name}
          inviteCode={inviteCode}
          sportKey={league.sport_key}
          memberCount={activeMembers.length}
        />
      </div>
      
      {/* Advanced Members Management CTA */}
      <Link to={`/pool-admin/members?pool=${league.id}`}>
        <div className="card-elevated p-4 hover:bg-muted/30 transition-colors cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm flex items-center gap-2">
                Members Dashboard
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">NEW</span>
              </h4>
              <p className="text-xs text-muted-foreground">
                Advanced member management with search, filters, bulk actions & reminders
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>
      </Link>

      <Link to={`/pool-admin/settings?pool=${league.id}`}>
        <div className="card-elevated p-4 hover:bg-muted/30 transition-colors cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5 text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">Advanced Settings</h4>
              <p className="text-xs text-muted-foreground">
                Event map and marketplace listing controls for this pool
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>
      </Link>
      
      {/* Members Section */}
      <div className="card-elevated overflow-hidden">
        <button
          onClick={() => toggleSection("members")}
          className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Users className="w-4.5 h-4.5 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">Members & Roles</h4>
            <p className="text-xs text-muted-foreground">
              {activeMembers.length} members
              {unpaidCount > 0 && ` • ${unpaidCount} unpaid`}
            </p>
          </div>
          {expandedSection === "members" ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        
        {expandedSection === "members" && (
          <div className="border-t border-border">
            <div className="max-h-80 overflow-y-auto">
              {activeMembers.map((member, idx) => (
                <div 
                  key={member.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    idx !== activeMembers.length - 1 && "border-b border-border/50"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                    member.role === "owner" ? "bg-amber-500/20 text-amber-600" :
                    member.role === "admin" ? "bg-purple-500/20 text-purple-600" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {member.avatar_initials}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{member.name}</span>
                      {getRoleBadge(member.role)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Joined {formatRelativeTime(member.joined_at)}</span>
                      {league.entry_fee_cents > 0 && (
                        <>
                          <span>•</span>
                          {member.paid ? (
                            <span className="text-green-600">Paid</span>
                          ) : (
                            <span className="text-red-500">Unpaid</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  {member.role !== "owner" && (
                    <div className="flex items-center gap-1">
                      {editingMemberId === member.id ? (
                        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                          <button
                            onClick={() => handleRoleChange(member.id, member.role === "admin" ? "member" : "admin")}
                            className="px-2 py-1 text-xs rounded hover:bg-background transition-colors"
                          >
                            {member.role === "admin" ? "Demote" : "Promote"}
                          </button>
                          <button
                            onClick={() => setEditingMemberId(null)}
                            className="p-1 rounded hover:bg-background transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingMemberId(member.id)}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                            title="Change role"
                          >
                            <UserCog className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-red-500"
                            title="Remove member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Removed members recovery */}
            {removedMembers.size > 0 && (
              <div className="border-t border-border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">
                  {removedMembers.size} member{removedMembers.size > 1 ? "s" : ""} removed
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...removedMembers].map(id => {
                    const member = members.find(m => m.id === id);
                    if (!member) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => handleRestoreMember(id)}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs bg-background rounded-lg hover:bg-muted transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore {member.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Pool Settings Section */}
      <div className="card-elevated overflow-hidden">
        <button
          onClick={() => toggleSection("settings")}
          className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Settings className="w-4.5 h-4.5 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">Pool Settings</h4>
            <p className="text-xs text-muted-foreground">
              {POOL_TYPE_INFO[league.format_key as keyof typeof POOL_TYPE_INFO]?.name || league.format_key} • {league.entry_fee_cents > 0 ? formatCurrency(league.entry_fee_cents) + " entry" : "Free"}
            </p>
          </div>
          {expandedSection === "settings" ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        
        {expandedSection === "settings" && (
          <div className="border-t border-border p-4 space-y-4">
            {/* Format Info */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Pool Format</span>
                <span className="text-xs text-primary">{POOL_TYPE_INFO[league.format_key as keyof typeof POOL_TYPE_INFO]?.name || league.format_key}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {POOL_TYPE_INFO[league.format_key as keyof typeof POOL_TYPE_INFO]?.description || "Standard format"}
              </p>
            </div>
            
            {/* Toggleable Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm">Allow late joins</p>
                  <p className="text-xs text-muted-foreground">New members can join after season starts</p>
                </div>
                <button
                  onClick={() => setSettingsForm(s => ({ ...s, allowLateJoins: !s.allowLateJoins }))}
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors relative",
                    settingsForm.allowLateJoins ? "bg-primary" : "bg-muted"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                    settingsForm.allowLateJoins ? "left-5" : "left-1"
                  )} />
                </button>
              </div>
              
              {league.entry_fee_cents > 0 && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm">Require payment before picks</p>
                    <p className="text-xs text-muted-foreground">Members must pay before submitting picks</p>
                  </div>
                  <button
                    onClick={() => setSettingsForm(s => ({ ...s, requirePaymentBeforePicks: !s.requirePaymentBeforePicks }))}
                    className={cn(
                      "w-10 h-6 rounded-full transition-colors relative",
                      settingsForm.requirePaymentBeforePicks ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                      settingsForm.requirePaymentBeforePicks ? "left-5" : "left-1"
                    )} />
                  </button>
                </div>
              )}
              
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm">Auto-lock at deadline</p>
                  <p className="text-xs text-muted-foreground">Automatically lock picks at game time</p>
                </div>
                <button
                  onClick={() => setSettingsForm(s => ({ ...s, autoLockDeadline: !s.autoLockDeadline }))}
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors relative",
                    settingsForm.autoLockDeadline ? "bg-primary" : "bg-muted"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                    settingsForm.autoLockDeadline ? "left-5" : "left-1"
                  )} />
                </button>
              </div>
              
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm">Weekly reminders</p>
                  <p className="text-xs text-muted-foreground">Send email reminders before deadline</p>
                </div>
                <button
                  onClick={() => setSettingsForm(s => ({ ...s, weeklyReminders: !s.weeklyReminders }))}
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors relative",
                    settingsForm.weeklyReminders ? "bg-primary" : "bg-muted"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                    settingsForm.weeklyReminders ? "left-5" : "left-1"
                  )} />
                </button>
              </div>
              
              {/* Chat Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-border/50 pt-4 mt-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Pool Chat</p>
                    <p className="text-xs text-muted-foreground">Allow members to chat with each other</p>
                  </div>
                </div>
                <button
                  onClick={handleChatToggle}
                  disabled={savingChat}
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors relative",
                    settingsForm.chatEnabled ? "bg-primary" : "bg-muted",
                    savingChat && "opacity-50"
                  )}
                >
                  {savingChat ? (
                    <Loader2 className="w-4 h-4 animate-spin absolute top-1 left-3 text-muted-foreground" />
                  ) : (
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                      settingsForm.chatEnabled ? "left-5" : "left-1"
                    )} />
                  )}
                </button>
              </div>
              {!settingsForm.chatEnabled && (
                <p className="text-xs text-amber-600 bg-amber-500/10 p-2 rounded-lg mt-2">
                  Chat is currently disabled. Members cannot send or view messages.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Audit Log Section */}
      <div className="card-elevated overflow-hidden">
        <button
          onClick={() => toggleSection("audit")}
          className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
            <FileText className="w-4.5 h-4.5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">Audit Log</h4>
            <p className="text-xs text-muted-foreground">All pool activity (append-only)</p>
          </div>
          {expandedSection === "audit" ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        
        {expandedSection === "audit" && (
          <div className="border-t border-border">
            <div className="max-h-72 overflow-y-auto">
              {DEMO_AUDIT_LOG.slice(0, 10).map((entry, idx) => (
                <div 
                  key={entry.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3",
                    idx !== 9 && "border-b border-border/50"
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    {getAuditEventIcon(entry.event_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{entry.actor_name}</span>
                      {" "}
                      <span className="text-muted-foreground">
                        {entry.event_type.replace(/_/g, " ")}
                      </span>
                      {entry.league_name && (
                        <span className="text-muted-foreground"> in {entry.league_name}</span>
                      )}
                    </p>
                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {JSON.stringify(entry.payload).slice(0, 50)}...
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(entry.created_at)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-3 bg-muted/30">
              <p className="text-xs text-center text-muted-foreground">
                <Lock className="w-3 h-3 inline mr-1" />
                Audit log is append-only and cannot be modified
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Payments Section (only for paid pools) */}
      {league.entry_fee_cents > 0 && (
        <div className="card-elevated overflow-hidden">
          <button
            onClick={() => toggleSection("payments")}
            className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="w-4.5 h-4.5 text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">Payments</h4>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(league.entry_fee_cents)} entry • {activeMembers.filter(m => m.paid).length}/{activeMembers.length} paid
              </p>
            </div>
            {expandedSection === "payments" ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          
          {expandedSection === "payments" && (
            <div className="border-t border-border">
              {/* Payment Summary */}
              <div className="p-4 grid grid-cols-3 gap-4 border-b border-border/50 bg-muted/30">
                <div className="text-center">
                  <p className="text-xl font-semibold text-green-600">
                    {formatCurrency(activeMembers.filter(m => m.paid).length * league.entry_fee_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">Collected</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-amber-600">
                    {formatCurrency(unpaidCount * league.entry_fee_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold">
                    {formatCurrency(activeMembers.length * league.entry_fee_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Pot</p>
                </div>
              </div>
              
              {/* Unpaid Members */}
              {unpaidCount > 0 && (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium">Awaiting Payment ({unpaidCount})</span>
                  </div>
                  <div className="space-y-2">
                    {activeMembers.filter(m => !m.paid).map(member => (
                      <div 
                        key={member.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                            {member.avatar_initials}
                          </div>
                          <span className="text-sm">{member.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="p-1.5 rounded-lg hover:bg-background transition-colors text-muted-foreground" title="Send reminder">
                            <Mail className="w-4 h-4" />
                          </button>
                          <button className="px-2.5 py-1 text-xs rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors font-medium">
                            Mark Paid
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* All payments collected */}
              {unpaidCount === 0 && (
                <div className="p-6 text-center">
                  <Check className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-600">All Payments Collected!</p>
                  <p className="text-xs text-muted-foreground mt-1">Everyone has paid their entry fee</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Demo Tools */}
      {isDemoMode && (
        <div className="card-elevated p-5 border-2 border-dashed border-purple-500/30">
          <h3 className="text-sm font-medium text-purple-500 mb-4 flex items-center gap-2">
            🧪 Demo Tools
          </h3>
          
          <div className="space-y-2">
            <button
              onClick={() => navigate("/demo")}
              className="w-full p-3 rounded-lg bg-purple-500/10 text-purple-600 text-sm font-medium hover:bg-purple-500/20 transition-colors"
            >
              Open Demo Control Center
            </button>
            <p className="text-xs text-muted-foreground text-center">
              Simulate events, trigger thresholds, and test features
            </p>
          </div>
        </div>
      )}
      
      {/* Danger Zone */}
      <div className="card-elevated p-5 border border-red-500/20">
        <h3 className="text-sm font-medium text-red-500 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Danger Zone
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          These actions cannot be undone. Proceed with caution.
        </p>
        <div className="space-y-2">
          <button
            className="w-full p-3 rounded-lg bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            Archive Pool
          </button>
          <button
            className="w-full p-3 rounded-lg border border-red-500/30 text-red-500 text-sm font-medium hover:bg-red-500/10 transition-colors"
          >
            Delete Pool Permanently
          </button>
        </div>
      </div>
    </div>
  );
}
