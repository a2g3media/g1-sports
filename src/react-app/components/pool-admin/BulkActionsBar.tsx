import { useState } from "react";
import {
  X,
  Bell,
  Mail,
  Trash2,
  UserCog,
  AlertTriangle,
  Loader2,
  Check,
  Shield,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";

interface BulkActionsBarProps {
  selectedCount: number;
  selectedMemberIds: number[];
  leagueId: string;
  onClearSelection: () => void;
  onSendReminder: () => void;
  onResendInvites: () => void;
  onSuccess: () => void;
}

type ConfirmAction = "remove" | "promote" | "demote" | null;

export function BulkActionsBar({
  selectedCount,
  selectedMemberIds,
  leagueId,
  onClearSelection,
  onSendReminder,
  onResendInvites,
  onSuccess,
}: BulkActionsBarProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Execute bulk action
  const executeBulkAction = async (action: ConfirmAction) => {
    if (!action || selectedMemberIds.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      let endpoint = "";
      let method = "POST";
      let body: Record<string, unknown> = { member_ids: selectedMemberIds };
      
      switch (action) {
        case "remove":
          endpoint = `/api/pool-admin/${leagueId}/bulk/remove`;
          break;
        case "promote":
          endpoint = `/api/pool-admin/${leagueId}/bulk/role`;
          body.role = "admin";
          break;
        case "demote":
          endpoint = `/api/pool-admin/${leagueId}/bulk/role`;
          body.role = "member";
          break;
      }
      
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} members`);
      }
      
      setConfirmAction(null);
      onClearSelection();
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Confirmation dialog content
  const getConfirmContent = () => {
    switch (confirmAction) {
      case "remove":
        return {
          icon: Trash2,
          iconColor: "text-red-500",
          iconBg: "bg-red-500/10",
          title: "Remove Members",
          description: `Are you sure you want to remove ${selectedCount} member${selectedCount > 1 ? "s" : ""} from this pool? They will need to be re-invited to rejoin.`,
          confirmText: "Remove Members",
          confirmVariant: "destructive" as const,
        };
      case "promote":
        return {
          icon: Shield,
          iconColor: "text-purple-500",
          iconBg: "bg-purple-500/10",
          title: "Promote to Managers",
          description: `Promote ${selectedCount} member${selectedCount > 1 ? "s" : ""} to manager role? They will be able to manage pool members and settings.`,
          confirmText: "Promote",
          confirmVariant: "default" as const,
        };
      case "demote":
        return {
          icon: UserCog,
          iconColor: "text-amber-500",
          iconBg: "bg-amber-500/10",
          title: "Demote to Members",
          description: `Demote ${selectedCount} manager${selectedCount > 1 ? "s" : ""} to regular member role? They will lose admin privileges.`,
          confirmText: "Demote",
          confirmVariant: "default" as const,
        };
      default:
        return null;
    }
  };
  
  const confirmContent = getConfirmContent();
  
  return (
    <>
      {/* Actions Bar */}
      <div className="px-4 py-3 border-t border-border bg-primary/5 flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-primary" />
          {selectedCount} member{selectedCount > 1 ? "s" : ""} selected
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onSendReminder}>
            <Bell className="w-3.5 h-3.5 mr-1.5" />
            Send Reminder
          </Button>
          <Button variant="outline" size="sm" onClick={onResendInvites}>
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            Resend Invites
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmAction("promote")}>
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            Promote
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmAction("demote")}>
            <UserCog className="w-3.5 h-3.5 mr-1.5" />
            Demote
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            onClick={() => setConfirmAction("remove")}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Remove
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      
      {/* Confirmation Dialog */}
      {confirmAction && confirmContent && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !isProcessing && setConfirmAction(null)}
        >
          <div
            className="bg-card border border-border rounded-xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4", confirmContent.iconBg)}>
              <confirmContent.icon className={cn("w-6 h-6", confirmContent.iconColor)} />
            </div>
            
            <h3 className="text-lg font-semibold text-center mb-2">
              {confirmContent.title}
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {confirmContent.description}
            </p>
            
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-500">{error}</p>
              </div>
            )}
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmAction(null)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                variant={confirmContent.confirmVariant}
                className="flex-1"
                onClick={() => executeBulkAction(confirmAction)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  confirmContent.confirmText
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
