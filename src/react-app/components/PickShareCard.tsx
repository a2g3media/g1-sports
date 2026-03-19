/**
 * PickShareCard - Shareable pick card with social sharing
 * Premium cinematic design with share buttons for Twitter, copy link, SMS
 */

import { useState, useRef } from "react";
import { 
  Share2, Twitter, Link2, MessageSquare, X, Check,
  TrendingUp
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { TeamBadge } from "@/react-app/components/ui/team-badge";

// =====================================================
// TYPES
// =====================================================

export interface SharedPick {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  pickType: 'SPREAD' | 'TOTAL' | 'MONEYLINE';
  pickSide: 'HOME' | 'AWAY' | 'OVER' | 'UNDER';
  lineValue: number | null;
  odds: number;
  confidence?: 'low' | 'medium' | 'high' | 'max';
  result?: 'WIN' | 'LOSS' | 'PUSH' | 'PENDING';
  gameTime: string;
  notes?: string;
  userName?: string;
  userStreak?: number;
  userRecord?: { wins: number; losses: number };
}

interface PickShareCardProps {
  pick: SharedPick;
  onClose?: () => void;
  showShareButtons?: boolean;
  compact?: boolean;
}

// =====================================================
// HELPERS
// =====================================================

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatLine(line: number | null, type: string): string {
  if (line === null) return "";
  if (type === "TOTAL") return line.toString();
  return line > 0 ? `+${line}` : `${line}`;
}

function getPickDescription(pick: SharedPick): string {
  switch (pick.pickType) {
    case "SPREAD": {
      const team = pick.pickSide === "HOME" ? pick.homeTeam : pick.awayTeam;
      return `${team} ${formatLine(pick.lineValue, "SPREAD")}`;
    }
    case "TOTAL":
      return `${pick.pickSide === "OVER" ? "Over" : "Under"} ${pick.lineValue}`;
    case "MONEYLINE":
      return `${pick.pickSide === "HOME" ? pick.homeTeam : pick.awayTeam} ML`;
    default:
      return "";
  }
}

function getConfidenceColor(confidence?: string) {
  switch (confidence) {
    case 'max': return 'from-amber-500 to-orange-600';
    case 'high': return 'from-emerald-500 to-emerald-600';
    case 'medium': return 'from-blue-500 to-blue-600';
    case 'low': return 'from-white/20 to-white/10';
    default: return 'from-primary to-primary/80';
  }
}

function getConfidenceLabel(confidence?: string) {
  switch (confidence) {
    case 'max': return 'MAX PLAY 🔥';
    case 'high': return 'HIGH CONFIDENCE';
    case 'medium': return 'CONFIDENT';
    case 'low': return 'LEAN';
    default: return '';
  }
}

// =====================================================
// SHARE MODAL
// =====================================================

interface ShareModalProps {
  pick: SharedPick;
  onClose: () => void;
}

function ShareModal({ pick, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/shared-pick/${pick.id}`;
  
  const shareText = `My pick: ${getPickDescription(pick)} (${formatOdds(pick.odds)}) - ${pick.awayTeam} @ ${pick.homeTeam}`;
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  const handleTwitterShare = () => {
    const tweetText = encodeURIComponent(`${shareText}\n\nTrack your picks on GZ Sports 🏈`);
    const tweetUrl = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`, '_blank');
  };
  
  const handleSMSShare = () => {
    const smsBody = encodeURIComponent(`${shareText}\n\n${shareUrl}`);
    window.open(`sms:?body=${smsBody}`, '_blank');
  };
  
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Pick on GZ Sports',
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={cn(
        "relative w-full max-w-md rounded-2xl overflow-hidden",
        "bg-gradient-to-br from-slate-900 to-slate-950",
        "border border-white/10",
        "shadow-[0_0_60px_rgba(59,130,246,0.15)]",
        "animate-in zoom-in-95 fade-in duration-200"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Share Your Pick
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>
        
        {/* Preview Card */}
        <div className="p-4">
          <PickPreviewCard pick={pick} />
        </div>
        
        {/* Share buttons */}
        <div className="p-4 pt-0 space-y-3">
          {/* Native share (if available) */}
          {'share' in navigator && (
            <Button
              onClick={handleNativeShare}
              className={cn(
                "w-full gap-2 rounded-xl py-6",
                "bg-gradient-to-r from-primary to-blue-600",
                "shadow-[0_8px_24px_rgba(59,130,246,0.3)]"
              )}
            >
              <Share2 className="w-5 h-5" />
              Share Pick
            </Button>
          )}
          
          <div className="grid grid-cols-3 gap-3">
            {/* Twitter */}
            <Button
              variant="outline"
              onClick={handleTwitterShare}
              className={cn(
                "flex-col gap-2 py-4 rounded-xl",
                "bg-white/[0.04] border-white/[0.08]",
                "hover:bg-[#1DA1F2]/20 hover:border-[#1DA1F2]/40",
                "transition-all duration-200"
              )}
            >
              <Twitter className="w-5 h-5 text-[#1DA1F2]" />
              <span className="text-xs text-white/60">Twitter</span>
            </Button>
            
            {/* Copy Link */}
            <Button
              variant="outline"
              onClick={handleCopyLink}
              className={cn(
                "flex-col gap-2 py-4 rounded-xl",
                "bg-white/[0.04] border-white/[0.08]",
                "hover:bg-emerald-500/20 hover:border-emerald-500/40",
                "transition-all duration-200",
                copied && "bg-emerald-500/20 border-emerald-500/40"
              )}
            >
              {copied ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : (
                <Link2 className="w-5 h-5 text-white/60" />
              )}
              <span className="text-xs text-white/60">
                {copied ? 'Copied!' : 'Copy Link'}
              </span>
            </Button>
            
            {/* SMS */}
            <Button
              variant="outline"
              onClick={handleSMSShare}
              className={cn(
                "flex-col gap-2 py-4 rounded-xl",
                "bg-white/[0.04] border-white/[0.08]",
                "hover:bg-green-500/20 hover:border-green-500/40",
                "transition-all duration-200"
              )}
            >
              <MessageSquare className="w-5 h-5 text-green-400" />
              <span className="text-xs text-white/60">Message</span>
            </Button>
          </div>
        </div>
        
        {/* URL Preview */}
        <div className="p-4 pt-0">
          <div className={cn(
            "flex items-center gap-2 p-3 rounded-xl",
            "bg-white/[0.03] border border-white/[0.06]"
          )}>
            <Link2 className="w-4 h-4 text-white/40 shrink-0" />
            <span className="text-xs text-white/40 truncate font-mono">{shareUrl}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// PREVIEW CARD (used in share modal)
// =====================================================

function PickPreviewCard({ pick }: { pick: SharedPick }) {
  const gameTime = new Date(pick.gameTime);
  
  return (
    <div className={cn(
      "rounded-xl overflow-hidden",
      "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
      "border border-white/[0.08]"
    )}>
      {/* Confidence banner */}
      {pick.confidence && (
        <div className={cn(
          "px-3 py-1.5 text-center",
          "bg-gradient-to-r",
          getConfidenceColor(pick.confidence)
        )}>
          <span className="text-[10px] font-black uppercase tracking-wider text-white">
            {getConfidenceLabel(pick.confidence)}
          </span>
        </div>
      )}
      
      <div className="p-4">
        {/* Sport & time */}
        <div className="flex items-center justify-between mb-3">
          <span className={cn(
            "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
            "bg-white/[0.08] text-white/60"
          )}>
            {pick.sport}
          </span>
          <span className="text-xs text-white/40">
            {gameTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        
        {/* Matchup */}
        <div className="flex items-center gap-3 mb-4">
          <TeamBadge teamName={pick.awayTeam} size="sm" />
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-white">
              {pick.awayTeam} @ {pick.homeTeam}
            </p>
          </div>
          <TeamBadge teamName={pick.homeTeam} size="sm" />
        </div>
        
        {/* Pick */}
        <div className={cn(
          "p-3 rounded-lg text-center",
          "bg-gradient-to-r from-primary/20 to-primary/10",
          "border border-primary/30"
        )}>
          <p className="text-lg font-black text-white">{getPickDescription(pick)}</p>
          <p className="text-sm font-mono font-bold text-primary mt-1">
            {formatOdds(pick.odds)}
          </p>
        </div>
        
        {/* User info */}
        {pick.userName && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">
                  {pick.userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-semibold text-white/80">{pick.userName}</span>
            </div>
            {pick.userRecord && (
              <span className="text-xs text-white/40 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                {pick.userRecord.wins}-{pick.userRecord.losses}
              </span>
            )}
          </div>
        )}
      </div>
      
      {/* GZ Sports branding */}
      <div className="px-4 py-2 bg-white/[0.03] border-t border-white/[0.06] flex items-center justify-center gap-2">
        <span className="text-xs font-bold text-primary">GZ</span>
        <span className="text-xs text-white/40">Sports</span>
      </div>
    </div>
  );
}

// =====================================================
// SHARE BUTTON (inline, for pick cards)
// =====================================================

export function PickShareButton({ 
  pick, 
  size = 'default' 
}: { 
  pick: SharedPick; 
  size?: 'sm' | 'default' 
}) {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(true);
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-lg transition-all",
          "hover:bg-primary/20 hover:text-primary",
          size === 'sm' 
            ? "p-1.5 text-white/40" 
            : "px-3 py-1.5 text-xs font-semibold text-white/50 bg-white/[0.04] border border-white/[0.06]"
        )}
        title="Share pick"
      >
        <Share2 className={cn(size === 'sm' ? "w-4 h-4" : "w-3.5 h-3.5")} />
        {size !== 'sm' && <span>Share</span>}
      </button>
      
      {showModal && (
        <ShareModal pick={pick} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function PickShareCard({ pick, onClose, showShareButtons = true, compact = false }: PickShareCardProps) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  
  const shareUrl = `${window.location.origin}/shared-pick/${pick.id}`;
  const shareText = `My pick: ${getPickDescription(pick)} (${formatOdds(pick.odds)})`;
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  if (compact || !showShareButtons) {
    return <PickPreviewCard pick={pick} />;
  }
  
  return (
    <div ref={cardRef} className={cn(
      "rounded-2xl overflow-hidden",
      "bg-gradient-to-br from-slate-900 to-slate-950",
      "border border-white/10",
      "shadow-[0_0_40px_rgba(59,130,246,0.1)]"
    )}>
      {/* Header */}
      {onClose && (
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Share Pick
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>
      )}
      
      {/* Card content */}
      <div className="p-4">
        <PickPreviewCard pick={pick} />
      </div>
      
      {/* Share buttons */}
      {showShareButtons && (
        <div className="p-4 pt-0 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const tweetText = encodeURIComponent(`${shareText}\n\nTrack on GZ Sports 🏈`);
              window.open(`https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`, '_blank');
            }}
            className="flex-1 gap-2 rounded-xl bg-white/[0.04] border-white/[0.08] hover:bg-[#1DA1F2]/20"
          >
            <Twitter className="w-4 h-4 text-[#1DA1F2]" />
            Tweet
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className={cn(
              "flex-1 gap-2 rounded-xl bg-white/[0.04] border-white/[0.08]",
              copied && "bg-emerald-500/20 border-emerald-500/40"
            )}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link2 className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default PickShareCard;
