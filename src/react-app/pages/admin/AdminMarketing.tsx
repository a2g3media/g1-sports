import { useEffect, useState, useCallback } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Textarea } from "@/react-app/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/react-app/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import {
  Loader2,
  Users,
  Megaphone,
  Plus,
  RefreshCw,
  Mail,
  Bell,
  MessageSquare,
  Clock,
  Send,
  Pencil,
  Target,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface Segment {
  id: number;
  name: string;
  segment_key: string;
  criteria: Record<string, unknown> | null;
  user_count: number;
  created_at: string;
  updated_at: string;
}

interface Campaign {
  id: number;
  name: string;
  segment_id: number | null;
  segment_name: string | null;
  channel: string;
  subject: string | null;
  body: string | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case "email":
      return <Mail className="h-4 w-4" />;
    case "push":
      return <Bell className="h-4 w-4" />;
    case "sms":
      return <MessageSquare className="h-4 w-4" />;
    default:
      return <Megaphone className="h-4 w-4" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "sent":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "scheduled":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "draft":
      return "bg-slate-500/10 text-slate-600 dark:text-slate-400";
    case "paused":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    default:
      return "bg-slate-500/10 text-slate-600 dark:text-slate-400";
  }
}

export function AdminMarketing() {
  const { isDemoMode } = useDemoAuth();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New segment dialog
  const [showNewSegment, setShowNewSegment] = useState(false);
  const [newSegmentName, setNewSegmentName] = useState("");
  const [newSegmentKey, setNewSegmentKey] = useState("");
  const [newSegmentCriteria, setNewSegmentCriteria] = useState("");

  // New campaign dialog
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignChannel, setNewCampaignChannel] = useState("email");
  const [newCampaignSegmentId, setNewCampaignSegmentId] = useState<string>("");
  const [newCampaignSubject, setNewCampaignSubject] = useState("");
  const [newCampaignBody, setNewCampaignBody] = useState("");

  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);

      const headers: HeadersInit = {};
      if (isDemoMode) {
        headers['X-Demo-Mode'] = 'true';
      }
      const [segmentsRes, campaignsRes] = await Promise.all([
        fetch("/api/admin/marketing/segments", { credentials: "include", headers }),
        fetch("/api/admin/marketing/campaigns", { credentials: "include", headers }),
      ]);

      if (segmentsRes.ok) {
        const data = await segmentsRes.json();
        setSegments(data.segments || []);
      }

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Failed to fetch marketing data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createSegment = async () => {
    if (!newSegmentName.trim() || !newSegmentKey.trim()) return;

    try {
      setIsSaving(true);

      let criteria = null;
      if (newSegmentCriteria.trim()) {
        try {
          criteria = JSON.parse(newSegmentCriteria);
        } catch {
          // Keep as null if invalid JSON
        }
      }

      const response = await fetch("/api/admin/marketing/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { 'X-Demo-Mode': 'true' } : {}) },
        credentials: "include",
        body: JSON.stringify({
          name: newSegmentName.trim(),
          segment_key: newSegmentKey.trim(),
          criteria,
        }),
      });

      if (response.ok) {
        await fetchData(true);
        setShowNewSegment(false);
        setNewSegmentName("");
        setNewSegmentKey("");
        setNewSegmentCriteria("");
      }
    } catch (error) {
      console.error("Failed to create segment:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const createCampaign = async () => {
    if (!newCampaignName.trim() || !newCampaignChannel) return;

    try {
      setIsSaving(true);
      const response = await fetch("/api/admin/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { 'X-Demo-Mode': 'true' } : {}) },
        credentials: "include",
        body: JSON.stringify({
          name: newCampaignName.trim(),
          channel: newCampaignChannel,
          segment_id: newCampaignSegmentId ? parseInt(newCampaignSegmentId) : null,
          subject: newCampaignSubject.trim() || null,
          body: newCampaignBody.trim() || null,
        }),
      });

      if (response.ok) {
        await fetchData(true);
        setShowNewCampaign(false);
        setNewCampaignName("");
        setNewCampaignChannel("email");
        setNewCampaignSegmentId("");
        setNewCampaignSubject("");
        setNewCampaignBody("");
      }
    } catch (error) {
      console.error("Failed to create campaign:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Marketing"
        description="Segments and campaign management"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="h-8"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="p-6">
        <Tabs defaultValue="campaigns" className="space-y-6">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="campaigns" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="segments" className="gap-2">
              <Users className="h-4 w-4" />
              Segments
            </TabsTrigger>
          </TabsList>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">All Campaigns</h3>
                  <span className="text-xs text-muted-foreground">({campaigns.length})</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowNewCampaign(true)}
                  className="h-7 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New Campaign
                </Button>
              </div>

              {campaigns.length === 0 ? (
                <div className="p-8 text-center">
                  <Megaphone className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">No campaigns yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create your first campaign to reach users.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="px-4 py-3 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center">
                            {getChannelIcon(campaign.channel)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{campaign.name}</span>
                              <span className={cn(
                                "text-xs px-1.5 py-0.5 rounded font-medium capitalize",
                                getStatusColor(campaign.status)
                              )}>
                                {campaign.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {campaign.segment_name && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Target className="h-3 w-3" />
                                  {campaign.segment_name}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground capitalize">
                                {campaign.channel}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            {campaign.sent_at ? (
                              <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <Send className="h-3 w-3" />
                                Sent {formatDate(campaign.sent_at)}
                              </div>
                            ) : campaign.scheduled_for ? (
                              <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                                <Clock className="h-3 w-3" />
                                Scheduled {formatDate(campaign.scheduled_for)}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">
                                Created {formatDate(campaign.created_at)}
                              </div>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {campaign.subject && (
                        <p className="text-xs text-muted-foreground mt-2 ml-12 truncate max-w-lg">
                          Subject: {campaign.subject}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Segments Tab */}
          <TabsContent value="segments" className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">User Segments</h3>
                  <span className="text-xs text-muted-foreground">({segments.length})</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowNewSegment(true)}
                  className="h-7 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New Segment
                </Button>
              </div>

              {segments.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">No segments defined</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create segments to target specific user groups.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {segments.map((segment) => (
                    <div
                      key={segment.id}
                      className="px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{segment.name}</span>
                          <code className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                            {segment.segment_key}
                          </code>
                        </div>
                        {segment.criteria && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                            {JSON.stringify(segment.criteria)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4 ml-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">{segment.user_count.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">users</p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* New Segment Dialog */}
      <Dialog open={showNewSegment} onOpenChange={setShowNewSegment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Create User Segment
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="segment-name">Segment Name</Label>
              <Input
                id="segment-name"
                value={newSegmentName}
                onChange={(e) => setNewSegmentName(e.target.value)}
                placeholder="e.g., Power Users"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="segment-key">Segment Key</Label>
              <Input
                id="segment-key"
                value={newSegmentKey}
                onChange={(e) => setNewSegmentKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="e.g., power_users"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use snake_case for programmatic access.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="segment-criteria">Criteria (JSON)</Label>
              <Textarea
                id="segment-criteria"
                value={newSegmentCriteria}
                onChange={(e) => setNewSegmentCriteria(e.target.value)}
                placeholder='{"min_pools": 3, "has_paid": true}'
                className="font-mono text-sm h-24"
              />
              <p className="text-xs text-muted-foreground">
                Optional filter criteria in JSON format.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSegment(false)}>
              Cancel
            </Button>
            <Button
              onClick={createSegment}
              disabled={!newSegmentName.trim() || !newSegmentKey.trim() || isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Segment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Campaign Dialog */}
      <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Create Campaign
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="e.g., Summer Promotion"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={newCampaignChannel} onValueChange={setNewCampaignChannel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email
                      </div>
                    </SelectItem>
                    <SelectItem value="push">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        Push Notification
                      </div>
                    </SelectItem>
                    <SelectItem value="sms">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        SMS
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Segment</Label>
                <Select value={newCampaignSegmentId} onValueChange={setNewCampaignSegmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All users</SelectItem>
                    {segments.map((segment) => (
                      <SelectItem key={segment.id} value={segment.id.toString()}>
                        {segment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newCampaignChannel === "email" && (
              <div className="space-y-2">
                <Label htmlFor="campaign-subject">Subject Line</Label>
                <Input
                  id="campaign-subject"
                  value={newCampaignSubject}
                  onChange={(e) => setNewCampaignSubject(e.target.value)}
                  placeholder="Enter email subject..."
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="campaign-body">
                {newCampaignChannel === "email" ? "Email Body" : "Message"}
              </Label>
              <Textarea
                id="campaign-body"
                value={newCampaignBody}
                onChange={(e) => setNewCampaignBody(e.target.value)}
                placeholder={
                  newCampaignChannel === "email"
                    ? "Write your email content here..."
                    : "Enter your message..."
                }
                className="h-32"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCampaign(false)}>
              Cancel
            </Button>
            <Button
              onClick={createCampaign}
              disabled={!newCampaignName.trim() || !newCampaignChannel || isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
