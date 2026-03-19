import { useState, useEffect } from "react";
import {
  X,
  Bell,
  Mail,
  MessageSquare,
  Users,
  AlertCircle,
  Clock,
  DollarSign,
  Loader2,
  Check,
  ChevronRight,
  Send,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Textarea } from "@/react-app/components/ui/textarea";

interface ReminderTemplate {
  id: number;
  template_key: string;
  name: string;
  subject: string;
  body: string;
  target_group: string;
  channels: string;
}

interface SendReminderModalProps {
  leagueId: string;
  poolName: string;
  selectedMemberIds?: number[];
  stats?: {
    total: number;
    missing_picks: number;
    unpaid: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

type TargetGroup = "all" | "missing_picks" | "unpaid" | "selected";

const TARGET_GROUP_CONFIG: Record<TargetGroup, { label: string; icon: typeof Users; color: string }> = {
  all: { label: "All Members", icon: Users, color: "text-blue-500" },
  missing_picks: { label: "Missing Picks", icon: Clock, color: "text-amber-500" },
  unpaid: { label: "Unpaid Members", icon: DollarSign, color: "text-red-500" },
  selected: { label: "Selected Members", icon: Users, color: "text-purple-500" },
};

export function SendReminderModal({
  leagueId,
  poolName,
  selectedMemberIds = [],
  stats,
  onClose,
  onSuccess,
}: SendReminderModalProps) {
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ReminderTemplate | null>(null);
  const [targetGroup, setTargetGroup] = useState<TargetGroup>(
    selectedMemberIds.length > 0 ? "selected" : "missing_picks"
  );
  const [customMessage, setCustomMessage] = useState("");
  const [useCustomMessage, setUseCustomMessage] = useState(false);
  const [channels, setChannels] = useState<Set<string>>(new Set(["email"]));
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  
  // Fetch templates
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch(`/api/pool-admin/${leagueId}/reminder-templates`);
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
          // Auto-select first template that matches target group
          const defaultTemplate = data.templates?.find(
            (t: ReminderTemplate) => t.target_group === targetGroup || t.target_group === "all"
          );
          if (defaultTemplate) {
            setSelectedTemplate(defaultTemplate);
          }
        }
      } catch (e) {
        console.error("Failed to fetch templates", e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchTemplates();
  }, [leagueId, targetGroup]);
  
  // Get recipient count
  const getRecipientCount = (): number => {
    if (targetGroup === "selected") return selectedMemberIds.length;
    if (!stats) return 0;
    switch (targetGroup) {
      case "all": return stats.total;
      case "missing_picks": return stats.missing_picks;
      case "unpaid": return stats.unpaid;
      default: return 0;
    }
  };
  
  // Toggle channel
  const toggleChannel = (channel: string) => {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) {
        // Don't allow removing last channel
        if (next.size > 1) {
          next.delete(channel);
        }
      } else {
        next.add(channel);
      }
      return next;
    });
  };
  
  // Submit reminder
  const handleSubmit = async () => {
    const recipientCount = getRecipientCount();
    if (recipientCount === 0) {
      setError("No recipients selected");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/pool-admin/${leagueId}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: useCustomMessage ? null : selectedTemplate?.id,
          target_group: targetGroup,
          member_ids: targetGroup === "selected" ? selectedMemberIds : undefined,
          custom_subject: useCustomMessage ? "Reminder from " + poolName : undefined,
          custom_body: useCustomMessage ? customMessage : undefined,
          channels: [...channels],
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send reminder");
      }
      
      const data = await res.json();
      setSuccessCount(data.sent_count || recipientCount);
      
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send reminder");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Success state
  if (successCount !== null) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-card border border-border rounded-xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Reminders Sent!</h2>
            <p className="text-sm text-muted-foreground">
              {successCount} reminder{successCount > 1 ? "s" : ""} sent successfully
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold">Send Reminder</h2>
              <p className="text-xs text-muted-foreground">{poolName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Target Group Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Who should receive this?</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TARGET_GROUP_CONFIG) as TargetGroup[]).map((group) => {
                // Hide "selected" option if no members are selected
                if (group === "selected" && selectedMemberIds.length === 0) return null;
                
                const config = TARGET_GROUP_CONFIG[group];
                const Icon = config.icon;
                const count = group === "selected" 
                  ? selectedMemberIds.length 
                  : group === "all" 
                    ? stats?.total 
                    : group === "missing_picks" 
                      ? stats?.missing_picks 
                      : stats?.unpaid;
                
                return (
                  <button
                    key={group}
                    onClick={() => setTargetGroup(group)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                      targetGroup === group
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/80 hover:bg-secondary/50"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", config.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{config.label}</p>
                      {count !== undefined && (
                        <p className="text-xs text-muted-foreground">{count} member{count !== 1 ? "s" : ""}</p>
                      )}
                    </div>
                    {targetGroup === group && (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Template Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Message Template</label>
              <button
                onClick={() => setUseCustomMessage((prev) => !prev)}
                className="text-xs text-primary hover:underline"
              >
                {useCustomMessage ? "Use template" : "Write custom"}
              </button>
            </div>
            
            {useCustomMessage ? (
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Write your reminder message..."
                className="min-h-[120px] text-sm"
                maxLength={1000}
              />
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-6 bg-secondary/30 rounded-lg">
                <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No templates available</p>
                <button
                  onClick={() => setUseCustomMessage(true)}
                  className="text-xs text-primary mt-2 hover:underline"
                >
                  Write a custom message
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left",
                      selectedTemplate?.id === template.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/80 hover:bg-secondary/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {template.body.replace(/\{\{[^}]+\}\}/g, "...")}
                      </p>
                    </div>
                    {selectedTemplate?.id === template.id ? (
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Preview */}
          {(selectedTemplate || (useCustomMessage && customMessage)) && (
            <div className="bg-secondary/30 rounded-lg p-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Preview
              </h4>
              <div className="bg-background rounded-lg p-3 border border-border">
                <p className="text-sm font-medium mb-1">
                  {useCustomMessage ? `Reminder from ${poolName}` : selectedTemplate?.subject}
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {useCustomMessage 
                    ? customMessage 
                    : selectedTemplate?.body.replace(/\{\{pool_name\}\}/g, poolName).replace(/\{\{[^}]+\}\}/g, "...")}
                </p>
              </div>
            </div>
          )}
          
          {/* Channels */}
          <div>
            <label className="text-sm font-medium mb-2 block">Send via</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleChannel("email")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all",
                  channels.has("email")
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80"
                )}
              >
                <Mail className="w-4 h-4" />
                <span className="text-sm font-medium">Email</span>
              </button>
              <button
                onClick={() => toggleChannel("sms")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all",
                  channels.has("sms")
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80"
                )}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm font-medium">SMS</span>
              </button>
            </div>
          </div>
          
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-500">{error}</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/30">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {getRecipientCount()} recipient{getRecipientCount() !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={getRecipientCount() === 0 || (!selectedTemplate && !customMessage) || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1.5" />
                    Send Reminder
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
