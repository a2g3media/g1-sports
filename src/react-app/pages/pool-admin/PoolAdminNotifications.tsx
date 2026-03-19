import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import {
  Bell,
  Send,
  Mail,
  Users,
  Clock,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  UserPlus,
  MoreHorizontal,
  Sparkles,
  Eye,
  Copy,
  History,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Badge } from "@/react-app/components/ui/badge";
import { Textarea } from "@/react-app/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import { formatDistanceToNow } from "date-fns";

interface Pool {
  id: number;
  name: string;
  member_count: number;
  sport_key: string;
}

interface ReminderTemplate {
  id: number;
  template_key: string;
  name: string;
  subject: string;
  body: string;
  target_group: string | null;
  channels: string;
}

interface ReminderSend {
  id: number;
  league_id: number;
  pool_name: string;
  template_id: number | null;
  template_name: string | null;
  sender_user_id: number;
  sender_name: string | null;
  sender_email: string;
  target_group: string;
  target_user_ids: string;
  channel: string;
  subject: string;
  body: string;
  recipient_count: number;
  status: string;
  created_at: string;
}

interface ReminderHistoryResponse {
  reminders: ReminderSend[];
  summary: {
    total: number;
    this_week: number;
    recipients_total: number;
  };
}

interface PoolsResponse {
  pools: Pool[];
}

const TARGET_GROUPS = [
  { key: "all", label: "All Members", icon: Users, description: "Send to everyone in the pool" },
  { key: "missing_picks", label: "Missing Picks", icon: AlertTriangle, description: "Members who haven't submitted picks" },
  { key: "unpaid", label: "Unpaid Members", icon: DollarSign, description: "Members with pending payments" },
  { key: "invited", label: "Pending Invites", icon: UserPlus, description: "Members who haven't accepted their invite" },
];

const DEFAULT_TEMPLATES = [
  {
    id: "quick_picks",
    name: "Pick Deadline Reminder",
    subject: "⏰ Pick deadline approaching for {pool_name}",
    body: "Hey! Just a friendly reminder that picks are due soon for {pool_name}. Don't forget to lock in your selections before the deadline!\n\nGood luck! 🏈",
    target_group: "missing_picks",
    icon: Clock,
  },
  {
    id: "quick_payment",
    name: "Payment Reminder",
    subject: "💵 Payment needed for {pool_name}",
    body: "Hi! Your entry fee for {pool_name} is still pending. Please complete your payment to be eligible for prizes.\n\nThanks!",
    target_group: "unpaid",
    icon: DollarSign,
  },
  {
    id: "quick_invite",
    name: "Invitation Reminder",
    subject: "🎉 You're invited to join {pool_name}!",
    body: "Don't miss out! You've been invited to join {pool_name}. Accept your invitation to start making picks and compete for prizes.\n\nSee you there!",
    target_group: "invited",
    icon: UserPlus,
  },
  {
    id: "quick_update",
    name: "Pool Update",
    subject: "📢 Update from {pool_name}",
    body: "Hey everyone! Just wanted to share a quick update about {pool_name}.\n\n[Your message here]\n\nGood luck to all!",
    target_group: "all",
    icon: Bell,
  },
];

// Stat Card Component
function StatCard({ label, value, icon: Icon, trend }: { 
  label: string; 
  value: string | number; 
  icon: React.ElementType;
  trend?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
        </div>
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </div>
  );
}

// Quick Template Card Component
function QuickTemplateCard({ 
  template, 
  onUse 
}: { 
  template: typeof DEFAULT_TEMPLATES[0];
  onUse: () => void;
}) {
  const Icon = template.icon;
  const targetGroup = TARGET_GROUPS.find(g => g.key === template.target_group);
  
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm">{template.name}</h4>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.body.slice(0, 80)}...</p>
          {targetGroup && (
            <Badge variant="outline" className="mt-2 text-xs">
              {targetGroup.label}
            </Badge>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" className="w-full mt-3" onClick={onUse}>
        <Copy className="h-3.5 w-3.5 mr-1.5" />
        Use Template
      </Button>
    </div>
  );
}

// History Row Component
function HistoryRow({ reminder }: { reminder: ReminderSend }) {
  const targetGroup = TARGET_GROUPS.find(g => g.key === reminder.target_group);
  
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-border last:border-0 hover:bg-muted/30">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Mail className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{reminder.subject || "No subject"}</span>
          <Badge variant="outline" className="text-xs shrink-0">
            {targetGroup?.label || reminder.target_group}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{reminder.pool_name}</span>
          <span>•</span>
          <span>{reminder.recipient_count} recipient{reminder.recipient_count !== 1 ? "s" : ""}</span>
          <span>•</span>
          <span>{formatDistanceToNow(new Date(reminder.created_at), { addSuffix: true })}</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate & Edit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function PoolAdminNotifications() {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoAuth();
  const [activeTab, setActiveTab] = useState("compose");
  const [selectedPool, setSelectedPool] = useState<string>("all");
  const [targetGroup, setTargetGroup] = useState<string>("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // Fetch pools
  const { data: poolsData, isLoading: poolsLoading } = useQuery<PoolsResponse>({
    queryKey: ["pool-admin-pools", isDemoMode],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch("/api/pool-admin/my-pools", { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to fetch pools");
      return res.json();
    },
  });

  // Fetch reminder history
  const { data: historyData, isLoading: historyLoading } = useQuery<ReminderHistoryResponse>({
    queryKey: ["pool-admin-reminder-history", isDemoMode],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch("/api/pool-admin/reminders/history", { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  // Fetch templates
  const { data: templatesData } = useQuery<{ templates: ReminderTemplate[] }>({
    queryKey: ["pool-admin-reminder-templates", isDemoMode],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch("/api/pool-admin/reminder-templates", { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  // Send reminder mutation
  const sendReminder = useMutation({
    mutationFn: async () => {
      if (selectedPool === "all") {
        throw new Error("Please select a specific pool");
      }
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPool}/reminders`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          target_group: targetGroup,
          subject: subject.replace("{pool_name}", poolsData?.pools.find(p => p.id.toString() === selectedPool)?.name || ""),
          body: body.replace("{pool_name}", poolsData?.pools.find(p => p.id.toString() === selectedPool)?.name || ""),
          channels: "email",
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send reminder");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSentCount(data.recipients_count || 0);
      setSuccessOpen(true);
      setConfirmOpen(false);
      setSubject("");
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["pool-admin-reminder-history"] });
    },
  });

  const quickSendPreset = useMutation({
    mutationFn: async (templateId: string) => {
      if (selectedPool === "all") {
        throw new Error("Select a pool first for quick-send presets.");
      }
      const template = DEFAULT_TEMPLATES.find((item) => item.id === templateId);
      if (!template) throw new Error("Preset template not found");
      const poolName = poolsData?.pools.find((p) => p.id.toString() === selectedPool)?.name || "";
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPool}/reminders`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          target_group: template.target_group,
          subject: template.subject.replace("{pool_name}", poolName),
          body: template.body.replace("{pool_name}", poolName),
          channels: "email",
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to send quick preset");
      }
      return res.json() as Promise<{ recipients_count?: number }>;
    },
    onSuccess: (data) => {
      setSentCount(Number(data.recipients_count || 0));
      setSuccessOpen(true);
      queryClient.invalidateQueries({ queryKey: ["pool-admin-reminder-history"] });
    },
  });

  // Filter history by search
  const filteredHistory = useMemo(() => {
    if (!historyData?.reminders) return [];
    let filtered = historyData.reminders;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.subject?.toLowerCase().includes(query) ||
        r.pool_name?.toLowerCase().includes(query) ||
        r.body?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [historyData, searchQuery]);

  const pools = poolsData?.pools || [];
  const selectedPoolData = pools.find(p => p.id.toString() === selectedPool);
  const canSend = selectedPool !== "all" && subject.trim() && body.trim();

  const handleUseTemplate = (template: typeof DEFAULT_TEMPLATES[0]) => {
    setSubject(template.subject);
    setBody(template.body);
    setTargetGroup(template.target_group);
    setActiveTab("compose");
  };

  const handlePreview = () => {
    setPreviewOpen(true);
  };

  const handleSend = () => {
    setPreviewOpen(false);
    setConfirmOpen(true);
  };

  const confirmSend = () => {
    sendReminder.mutate();
  };

  if (poolsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Bell}
          title="No pools to manage"
          description="You need to create or administer a pool before you can send notifications."
          primaryAction={{ label: "Create Pool", href: "/create" }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Notifications & Reminders</h1>
        <p className="text-muted-foreground mt-1">
          Send reminders to pool members and view notification history
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Sent This Week"
          value={historyData?.summary.this_week || 0}
          icon={Send}
          trend="Last 7 days"
        />
        <StatCard
          label="Total Sent"
          value={historyData?.summary.total || 0}
          icon={Mail}
        />
        <StatCard
          label="Total Recipients"
          value={historyData?.summary.recipients_total || 0}
          icon={Users}
        />
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="compose" className="gap-2">
            <Send className="h-4 w-4" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Compose Tab */}
        <TabsContent value="compose" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Compose Form */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 space-y-5">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Compose Message
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Select Pool</label>
                  <Select value={selectedPool} onValueChange={setSelectedPool}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a pool" />
                    </SelectTrigger>
                    <SelectContent>
                      {pools.map(pool => (
                        <SelectItem key={pool.id} value={pool.id.toString()}>
                          {pool.name} ({pool.member_count} members)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Target Group</label>
                  <Select value={targetGroup} onValueChange={setTargetGroup}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_GROUPS.map(group => (
                        <SelectItem key={group.key} value={group.key}>
                          <span className="flex items-center gap-2">
                            <group.icon className="h-4 w-4" />
                            {group.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use {"{pool_name}"} to insert the pool name
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Message</label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message..."
                  rows={6}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  {selectedPoolData ? (
                    <>Sending to <span className="font-medium">{selectedPoolData.name}</span></>
                  ) : (
                    "Select a pool to continue"
                  )}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handlePreview} disabled={!canSend || quickSendPreset.isPending}>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                  <Button onClick={handlePreview} disabled={!canSend || quickSendPreset.isPending}>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Actions Sidebar */}
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <h4 className="font-medium text-sm mb-3">1-Tap Presets</h4>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={quickSendPreset.isPending || selectedPool === "all"}
                    onClick={() => quickSendPreset.mutate("quick_picks")}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Send Pick Deadline Reminder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={quickSendPreset.isPending || selectedPool === "all"}
                    onClick={() => quickSendPreset.mutate("quick_payment")}
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Send Payment Reminder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={quickSendPreset.isPending || selectedPool === "all"}
                    onClick={() => quickSendPreset.mutate("quick_invite")}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Send Invite Reminder
                  </Button>
                </div>
                {selectedPool === "all" && (
                  <p className="mt-2 text-xs text-muted-foreground">Select a pool to enable one-tap sends.</p>
                )}
                {quickSendPreset.isError && (
                  <p className="mt-2 text-xs text-red-500">{(quickSendPreset.error as Error).message}</p>
                )}
                {quickSendPreset.isPending && (
                  <p className="mt-2 text-xs text-muted-foreground">Sending preset reminder...</p>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-4">
                <h4 className="font-medium text-sm mb-3">Target Groups</h4>
                <div className="space-y-2">
                  {TARGET_GROUPS.map(group => {
                    const Icon = group.icon;
                    return (
                      <button
                        key={group.key}
                        onClick={() => setTargetGroup(group.key)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                          targetGroup === group.key 
                            ? "bg-primary/10 border border-primary/30" 
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${targetGroup === group.key ? "text-primary" : "text-muted-foreground"}`} />
                        <div>
                          <p className="text-sm font-medium">{group.label}</p>
                          <p className="text-xs text-muted-foreground">{group.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-4">
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">Quick Templates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {DEFAULT_TEMPLATES.map(template => (
                  <QuickTemplateCard
                    key={template.id}
                    template={template}
                    onUse={() => handleUseTemplate(template)}
                  />
                ))}
              </div>
            </div>

            {templatesData?.templates && templatesData.templates.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-4">Saved Templates</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templatesData.templates.map(template => (
                    <div
                      key={template.id}
                      className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
                    >
                      <h4 className="font-medium">{template.name}</h4>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{template.subject}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          setSubject(template.subject);
                          setBody(template.body);
                          if (template.target_group) setTargetGroup(template.target_group);
                          setActiveTab("compose");
                        }}
                      >
                        Use Template
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <div className="bg-card border border-border rounded-xl">
            <div className="p-4 border-b border-border flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search history..."
                  className="pl-9"
                />
              </div>
            </div>

            {historyLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-8 text-center">
                <History className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">No reminders sent yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your sent reminders will appear here
                </p>
              </div>
            ) : (
              <div>
                {filteredHistory.map(reminder => (
                  <HistoryRow key={reminder.id} reminder={reminder} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview Message</DialogTitle>
            <DialogDescription>
              Review your message before sending
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">TO</label>
              <p className="text-sm mt-1">
                {TARGET_GROUPS.find(g => g.key === targetGroup)?.label} in {selectedPoolData?.name || "Selected Pool"}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">SUBJECT</label>
              <p className="text-sm mt-1 font-medium">
                {subject.replace("{pool_name}", selectedPoolData?.name || "")}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">MESSAGE</label>
              <div className="mt-1 p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                {body.replace("{pool_name}", selectedPoolData?.name || "")}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Edit
            </Button>
            <Button onClick={handleSend}>
              <Send className="h-4 w-4 mr-2" />
              Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Send</DialogTitle>
            <DialogDescription>
              Are you sure you want to send this reminder to {TARGET_GROUPS.find(g => g.key === targetGroup)?.label.toLowerCase()} in {selectedPoolData?.name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSend} disabled={sendReminder.isPending}>
              {sendReminder.isPending ? "Sending..." : "Yes, Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Reminder Sent!
            </DialogTitle>
            <DialogDescription>
              Your reminder was successfully sent to {sentCount} recipient{sentCount !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSuccessOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
