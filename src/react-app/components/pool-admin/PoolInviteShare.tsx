import { useState, useEffect } from "react";
import {
  Copy,
  Check,
  Link2,
  Share2,
  QrCode,
  Mail,
  MessageCircle,
  Twitter,
  Send,
  Smartphone,
  Download,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";

interface PoolInviteShareProps {
  poolName: string;
  inviteCode: string;
  sportKey?: string;
  memberCount?: number;
  className?: string;
}

// Simple QR code generator using a free API
function QRCodeDisplay({ value, size = 200 }: { value: string; size?: number }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=000000&margin=10`;
  
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="p-4 bg-white rounded-xl shadow-sm">
        <img 
          src={qrUrl} 
          alt="Invite QR Code" 
          width={size} 
          height={size}
          className="rounded-lg"
        />
      </div>
      <a 
        href={qrUrl} 
        download={`pool-invite-qr.png`}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Download className="w-3.5 h-3.5" />
        Download QR Code
      </a>
    </div>
  );
}

export function PoolInviteShare({ 
  poolName, 
  inviteCode, 
  sportKey: _sportKey,
  memberCount: _memberCount,
  className 
}: PoolInviteShareProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [canShare, setCanShare] = useState(false);
  
  const inviteLink = `${window.location.origin}/join?code=${inviteCode}`;
  const shareText = `Join my sports pool "${poolName}" on GZ Sports! 🏆`;
  const fullShareText = `${shareText}\n\n${inviteLink}`;
  
  useEffect(() => {
    // Check if Web Share API is available
    setCanShare(typeof navigator.share === 'function');
  }, []);
  
  const copyCode = async () => {
    await navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };
  
  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };
  
  const handleNativeShare = async () => {
    if (canShare) {
      try {
        await navigator.share({
          title: `Join ${poolName}`,
          text: shareText,
          url: inviteLink,
        });
      } catch (err) {
        // User cancelled or share failed - show fallback modal
        if ((err as Error).name !== 'AbortError') {
          setShowShareModal(true);
        }
      }
    } else {
      setShowShareModal(true);
    }
  };
  
  const shareViaEmail = () => {
    const subject = encodeURIComponent(`Join my sports pool: ${poolName}`);
    const body = encodeURIComponent(
      `Hey!\n\nI'm inviting you to join my sports pool "${poolName}" on GZ Sports.\n\n` +
      `Click this link to join:\n${inviteLink}\n\n` +
      `Or enter this invite code: ${inviteCode}\n\n` +
      `See you in the pool! 🎯`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };
  
  const shareViaSMS = () => {
    const text = encodeURIComponent(
      `Join my sports pool "${poolName}"! ${inviteLink}`
    );
    // Use different SMS URL scheme based on device
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    window.open(isIOS ? `sms:&body=${text}` : `sms:?body=${text}`);
  };
  
  const shareViaTwitter = () => {
    const text = encodeURIComponent(`Join my sports pool "${poolName}" on GZ Sports! 🏆🎯`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(inviteLink)}`);
  };
  
  const shareViaWhatsApp = () => {
    const text = encodeURIComponent(fullShareText);
    window.open(`https://wa.me/?text=${text}`);
  };
  
  const shareViaTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`);
  };
  
  return (
    <>
      <div className={cn("space-y-4", className)}>
        {/* Invite Code Row */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block font-medium">
            Invite Code
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg font-mono text-lg tracking-[0.25em] text-center font-bold border border-primary/20">
              {inviteCode}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={copyCode}
              className={cn(
                "h-12 w-12 shrink-0 transition-all",
                copiedCode && "bg-green-500 border-green-500 text-white hover:bg-green-600"
              )}
            >
              {copiedCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        
        {/* Invite Link Row */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block font-medium">
            Share Link
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-3 bg-muted rounded-lg text-sm truncate text-muted-foreground font-mono">
              {inviteLink}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={copyLink}
              className={cn(
                "h-12 w-12 shrink-0 transition-all",
                copiedLink && "bg-green-500 border-green-500 text-white hover:bg-green-600"
              )}
            >
              {copiedLink ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        
        {/* Share Buttons */}
        <div className="grid grid-cols-4 gap-2">
          <Button
            variant="outline"
            className="flex flex-col h-auto py-3 gap-1.5 hover:bg-primary/10 hover:border-primary/30"
            onClick={handleNativeShare}
          >
            <Share2 className="w-5 h-5 text-primary" />
            <span className="text-xs">Share</span>
          </Button>
          
          <Button
            variant="outline"
            className="flex flex-col h-auto py-3 gap-1.5 hover:bg-blue-500/10 hover:border-blue-500/30"
            onClick={shareViaEmail}
          >
            <Mail className="w-5 h-5 text-blue-500" />
            <span className="text-xs">Email</span>
          </Button>
          
          <Button
            variant="outline"
            className="flex flex-col h-auto py-3 gap-1.5 hover:bg-green-500/10 hover:border-green-500/30"
            onClick={shareViaSMS}
          >
            <MessageCircle className="w-5 h-5 text-green-500" />
            <span className="text-xs">Text</span>
          </Button>
          
          <Button
            variant="outline"
            className="flex flex-col h-auto py-3 gap-1.5 hover:bg-purple-500/10 hover:border-purple-500/30"
            onClick={() => setShowQR(true)}
          >
            <QrCode className="w-5 h-5 text-purple-500" />
            <span className="text-xs">QR Code</span>
          </Button>
        </div>
        
        {/* Social Share Row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Share on:</span>
          <div className="flex gap-1.5">
            <button
              onClick={shareViaWhatsApp}
              className="w-8 h-8 rounded-full bg-[#25D366]/10 hover:bg-[#25D366]/20 flex items-center justify-center transition-colors"
              title="Share on WhatsApp"
            >
              <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </button>
            
            <button
              onClick={shareViaTwitter}
              className="w-8 h-8 rounded-full bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 flex items-center justify-center transition-colors"
              title="Share on Twitter"
            >
              <Twitter className="w-4 h-4 text-[#1DA1F2]" />
            </button>
            
            <button
              onClick={shareViaTelegram}
              className="w-8 h-8 rounded-full bg-[#0088cc]/10 hover:bg-[#0088cc]/20 flex items-center justify-center transition-colors"
              title="Share on Telegram"
            >
              <Send className="w-4 h-4 text-[#0088cc]" />
            </button>
          </div>
        </div>
      </div>
      
      {/* QR Code Modal */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Scan to Join
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-6">
            <QRCodeDisplay value={inviteLink} size={220} />
            <div className="mt-4 text-center">
              <p className="font-semibold">{poolName}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Scan this QR code to join the pool instantly
              </p>
              <div className="mt-3 px-4 py-2 bg-muted rounded-lg inline-block">
                <span className="text-xs text-muted-foreground">Code: </span>
                <span className="font-mono font-bold tracking-wider">{inviteCode}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Fallback Share Modal (for browsers without Web Share API) */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-primary" />
              Share Pool Invite
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Choose how you'd like to share the invite to <strong>{poolName}</strong>:
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="flex items-center justify-start gap-3 h-auto py-3"
                onClick={() => { shareViaEmail(); setShowShareModal(false); }}
              >
                <Mail className="w-5 h-5 text-blue-500" />
                <span>Email</span>
              </Button>
              
              <Button
                variant="outline"
                className="flex items-center justify-start gap-3 h-auto py-3"
                onClick={() => { shareViaSMS(); setShowShareModal(false); }}
              >
                <Smartphone className="w-5 h-5 text-green-500" />
                <span>Text Message</span>
              </Button>
              
              <Button
                variant="outline"
                className="flex items-center justify-start gap-3 h-auto py-3"
                onClick={() => { shareViaWhatsApp(); setShowShareModal(false); }}
              >
                <svg className="w-5 h-5 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span>WhatsApp</span>
              </Button>
              
              <Button
                variant="outline"
                className="flex items-center justify-start gap-3 h-auto py-3"
                onClick={() => { shareViaTwitter(); setShowShareModal(false); }}
              >
                <Twitter className="w-5 h-5 text-[#1DA1F2]" />
                <span>Twitter</span>
              </Button>
              
              <Button
                variant="outline"
                className="flex items-center justify-start gap-3 h-auto py-3"
                onClick={() => { shareViaTelegram(); setShowShareModal(false); }}
              >
                <Send className="w-5 h-5 text-[#0088cc]" />
                <span>Telegram</span>
              </Button>
              
              <Button
                variant="outline"
                className="flex items-center justify-start gap-3 h-auto py-3"
                onClick={() => { setShowQR(true); setShowShareModal(false); }}
              >
                <QrCode className="w-5 h-5 text-purple-500" />
                <span>QR Code</span>
              </Button>
            </div>
            
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Or copy the link:</p>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm truncate font-mono">
                  {inviteLink}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyLink}
                  className={cn(copiedLink && "bg-green-500 text-white border-green-500")}
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Compact version for inline use
export function PoolInviteShareCompact({ 
  inviteCode, 
  poolName,
  className 
}: { 
  inviteCode: string; 
  poolName: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}/join?code=${inviteCode}`;
  
  const handleShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Join ${poolName}`,
          text: `Join my sports pool "${poolName}" on GZ Sports! 🏆`,
          url: inviteLink,
        });
      } catch {
        // Fallback to copy
        await navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } else {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 px-3 py-2 bg-muted rounded-lg font-mono text-sm tracking-wider text-center">
        {inviteCode}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
        className={cn(
          "shrink-0",
          copied && "bg-green-500 text-white border-green-500"
        )}
      >
        {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
      </Button>
    </div>
  );
}
