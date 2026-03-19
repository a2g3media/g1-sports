import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/react-app/components/ui/dialog";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Copy, Check, Mail, MessageCircle, Link2, QrCode, Share2, Download } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueName: string;
  inviteCode: string;
}

export function InviteModal({ open, onOpenChange, leagueName, inviteCode }: InviteModalProps) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [showQR, setShowQR] = useState(false);
  
  const inviteLink = `${window.location.origin}/join?code=${inviteCode}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}&bgcolor=ffffff&color=000000&margin=10`;
  
  const handleNativeShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Join ${leagueName}`,
          text: `Join my sports pool "${leagueName}" on GZ Sports! 🏆`,
          url: inviteLink,
        });
      } catch {
        // User cancelled
      }
    }
  };
  
  const copyToClipboard = async (text: string, type: "code" | "link") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent(`Join my league: ${leagueName}`);
    const body = encodeURIComponent(
      `I'm inviting you to join "${leagueName}" on POOLVAULT!\n\n` +
      `Click this link to join:\n${inviteLink}\n\n` +
      `Or enter this code manually: ${inviteCode}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareViaSMS = () => {
    const text = encodeURIComponent(
      `Join my league "${leagueName}" on POOLVAULT! ${inviteLink}`
    );
    window.open(`sms:?body=${text}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to {leagueName}</DialogTitle>
          <DialogDescription>
            Share the invite code or link with friends to have them join your league
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Invite Code */}
          <div className="space-y-2">
            <Label>Invite Code</Label>
            <div className="flex gap-2">
              <Input
                value={inviteCode}
                readOnly
                className="font-mono text-xl tracking-widest text-center font-bold"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(inviteCode, "code")}
              >
                {copied === "code" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Invite Link */}
          <div className="space-y-2">
            <Label>Invite Link</Label>
            <div className="flex gap-2">
              <Input
                value={inviteLink}
                readOnly
                className="text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(inviteLink, "link")}
              >
                {copied === "link" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Quick Share Options */}
          <div className="space-y-2">
            <Label>Quick Share</Label>
            <div className="grid grid-cols-4 gap-2">
              {typeof navigator.share === 'function' && (
                <Button
                  variant="outline"
                  className="flex flex-col h-auto py-3 gap-1"
                  onClick={handleNativeShare}
                >
                  <Share2 className="h-5 w-5 text-primary" />
                  <span className="text-xs">Share</span>
                </Button>
              )}
              <Button
                variant="outline"
                className="flex flex-col h-auto py-3 gap-1"
                onClick={shareViaEmail}
              >
                <Mail className="h-5 w-5 text-blue-500" />
                <span className="text-xs">Email</span>
              </Button>
              <Button
                variant="outline"
                className="flex flex-col h-auto py-3 gap-1"
                onClick={shareViaSMS}
              >
                <MessageCircle className="h-5 w-5 text-green-500" />
                <span className="text-xs">Text</span>
              </Button>
              <Button
                variant="outline"
                className={cn(
                  "flex flex-col h-auto py-3 gap-1",
                  showQR && "border-primary bg-primary/5"
                )}
                onClick={() => setShowQR(!showQR)}
              >
                <QrCode className="h-5 w-5 text-purple-500" />
                <span className="text-xs">QR Code</span>
              </Button>
            </div>
          </div>
          
          {/* QR Code Display */}
          {showQR && (
            <div className="flex flex-col items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="p-3 bg-white rounded-xl shadow-sm">
                <img 
                  src={qrUrl} 
                  alt="Invite QR Code" 
                  width={180} 
                  height={180}
                  className="rounded-lg"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Scan to join the pool instantly
              </p>
              <a 
                href={qrUrl} 
                download={`${leagueName.replace(/\s+/g, '-').toLowerCase()}-invite-qr.png`}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                Download QR Code
              </a>
            </div>
          )}
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
          <p>
            🔒 This invite code is unique to your league. Members who join will be added immediately.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
