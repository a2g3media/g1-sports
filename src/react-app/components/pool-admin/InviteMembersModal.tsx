import { useState, useRef, KeyboardEvent, ClipboardEvent } from "react";
import {
  X,
  UserPlus,
  Mail,
  Loader2,
  Check,
  AlertCircle,
  Copy,
  Link2,
  Send,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Textarea } from "@/react-app/components/ui/textarea";

interface InviteMembersModalProps {
  leagueId: string;
  poolName: string;
  inviteCode?: string;
  onClose: () => void;
  onSuccess: () => void;
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMembersModal({
  leagueId,
  poolName,
  inviteCode = "",
  onClose,
  onSuccess,
}: InviteMembersModalProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [invalidEmails, setInvalidEmails] = useState<Set<string>>(new Set());
  const [customMessage, setCustomMessage] = useState("");
  const [includeMessage, setIncludeMessage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  
  const inviteLink = inviteCode ? `${window.location.origin}/join?code=${inviteCode}` : "";
  
  // Parse and add emails from input
  const addEmails = (text: string) => {
    // Split by comma, semicolon, space, or newline
    const newEmails = text
      .split(/[,;\s\n]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
    
    const validNew: string[] = [];
    const invalidNew: string[] = [];
    
    for (const email of newEmails) {
      // Skip duplicates
      if (emails.includes(email) || validNew.includes(email)) continue;
      
      if (EMAIL_REGEX.test(email)) {
        validNew.push(email);
      } else {
        invalidNew.push(email);
      }
    }
    
    if (validNew.length > 0) {
      setEmails((prev) => [...prev, ...validNew]);
    }
    
    if (invalidNew.length > 0) {
      setInvalidEmails((prev) => new Set([...prev, ...invalidNew]));
    }
    
    setInputValue("");
  };
  
  // Handle keyboard events
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (inputValue.trim()) {
        addEmails(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      // Remove last email on backspace if input is empty
      setEmails((prev) => prev.slice(0, -1));
    }
  };
  
  // Handle paste
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    addEmails(pasted);
  };
  
  // Remove an email
  const removeEmail = (email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  };
  
  // Clear invalid emails
  const clearInvalid = () => {
    setInvalidEmails(new Set());
  };
  
  // Submit invites
  const handleSubmit = async () => {
    if (emails.length === 0) {
      setError("Please add at least one email address");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/pool-admin/${leagueId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails,
          custom_message: includeMessage ? customMessage : null,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send invites");
      }
      
      const data = await res.json();
      setSuccessCount(data.invited_count || emails.length);
      
      // Auto-close after success
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invites");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Copy handlers
  const copyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };
  
  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
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
            <h2 className="text-lg font-semibold mb-2">Invites Sent!</h2>
            <p className="text-sm text-muted-foreground">
              {successCount} invitation{successCount > 1 ? "s" : ""} sent successfully
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
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Invite Members</h2>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick Share Section */}
          {inviteCode && (
            <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                Quick Share
              </h3>
              
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-background rounded-lg font-mono text-sm tracking-wide text-center">
                  {inviteCode}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyCode}
                  className={cn("shrink-0", copiedCode && "bg-green-500/10 text-green-600")}
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-background rounded-lg text-xs text-muted-foreground truncate">
                  {inviteLink}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyLink}
                  className={cn("shrink-0", copiedLink && "bg-green-500/10 text-green-600")}
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
          
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-muted-foreground">or invite by email</span>
            <div className="flex-1 border-t border-border" />
          </div>
          
          {/* Email Input */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Email Addresses
            </label>
            <div
              className={cn(
                "min-h-[80px] p-2 bg-background border border-border rounded-lg cursor-text transition-colors",
                "focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20"
              )}
              onClick={() => inputRef.current?.focus()}
            >
              <div className="flex flex-wrap gap-1.5">
                {emails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium"
                  >
                    <Mail className="w-3 h-3" />
                    {email}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEmail(email);
                      }}
                      className="ml-0.5 hover:text-primary/70 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onBlur={() => inputValue.trim() && addEmails(inputValue)}
                  placeholder={emails.length === 0 ? "Enter emails (comma-separated or paste a list)" : ""}
                  className="flex-1 min-w-[200px] bg-transparent outline-none text-sm py-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Type or paste emails, separated by commas, semicolons, or new lines
            </p>
          </div>
          
          {/* Invalid Emails Warning */}
          {invalidEmails.size > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-600">
                  {invalidEmails.size} invalid email{invalidEmails.size > 1 ? "s" : ""} skipped
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {[...invalidEmails].slice(0, 3).join(", ")}
                  {invalidEmails.size > 3 && ` +${invalidEmails.size - 3} more`}
                </p>
              </div>
              <button
                onClick={clearInvalid}
                className="text-xs text-amber-600 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}
          
          {/* Custom Message Toggle */}
          <div>
            <button
              onClick={() => setIncludeMessage((prev) => !prev)}
              className="flex items-center gap-2 text-sm"
            >
              <div
                className={cn(
                  "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                  includeMessage
                    ? "bg-primary border-primary"
                    : "border-border bg-background"
                )}
              >
                {includeMessage && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <span>Include a personal message</span>
            </button>
            
            {includeMessage && (
              <div className="mt-3">
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Add a personal note to your invitation..."
                  className="min-h-[80px] text-sm"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  {customMessage.length}/500
                </p>
              </div>
            )}
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
              {emails.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4" />
                  {emails.length} recipient{emails.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={emails.length === 0 || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1.5" />
                    Send Invites
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
