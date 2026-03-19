/**
 * ShareModal - Sharing capabilities for watchboards and performance stats
 * Supports Web Share API, clipboard copy, and social sharing
 */

import { useState, useCallback } from "react";
import { 
  Share2, 
  Copy, 
  Check, 
  X, 
  Twitter, 
  Link2,
  ExternalLink
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import { cn } from "@/react-app/lib/utils";

// =====================================================
// TYPES
// =====================================================

export type ShareContentType = 'watchboard' | 'performance' | 'bet';

export interface ShareData {
  type: ShareContentType;
  title: string;
  description: string;
  url?: string;
  // Watchboard-specific
  boardId?: number;
  boardName?: string;
  gameCount?: number;
  liveCount?: number;
  // Performance-specific
  winRate?: number;
  totalTickets?: number;
  roi?: number;
  currentStreak?: { count: number; type: 'W' | 'L' };
  // Bet-specific
  ticketId?: number;
  ticketType?: string;
  legCount?: number;
  status?: string;
}

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  data: ShareData;
}

// =====================================================
// SHARE TEXT GENERATORS
// =====================================================

function generateShareText(data: ShareData): string {
  switch (data.type) {
    case 'watchboard':
      return `📺 Watching ${data.gameCount || 0} games${data.liveCount ? ` (${data.liveCount} LIVE)` : ''} on my GZ Sports Watchboard "${data.boardName || 'My Board'}"`;
    
    case 'performance':
      const roiStr = data.roi !== undefined 
        ? data.roi >= 0 ? `+${data.roi.toFixed(1)}%` : `${data.roi.toFixed(1)}%`
        : '';
      const streakStr = data.currentStreak && data.currentStreak.count > 0
        ? `${data.currentStreak.count}${data.currentStreak.type} streak`
        : '';
      return `📊 GZ Sports Performance:\n${data.winRate?.toFixed(1)}% win rate across ${data.totalTickets} tickets${roiStr ? ` • ${roiStr} ROI` : ''}${streakStr ? ` • ${streakStr}` : ''}`;
    
    case 'bet':
      const statusEmoji = data.status === 'won' ? '✅' : data.status === 'lost' ? '❌' : data.status === 'push' ? '↔️' : '⏳';
      return `${statusEmoji} ${data.ticketType === 'parlay' ? 'Parlay' : 'Bet'} with ${data.legCount} ${data.legCount === 1 ? 'leg' : 'legs'} - ${data.status?.toUpperCase() || 'PENDING'}`;
    
    default:
      return data.description;
  }
}

function generateTwitterText(data: ShareData): string {
  const baseText = generateShareText(data);
  return `${baseText}\n\n#GZSports #SportsBetting`;
}

function generateShareUrl(data: ShareData): string {
  const baseUrl = window.location.origin;
  
  switch (data.type) {
    case 'watchboard':
      return data.boardId ? `${baseUrl}/watchboard/${data.boardId}` : `${baseUrl}/watchboard`;
    case 'performance':
      return `${baseUrl}/performance`;
    case 'bet':
      return data.ticketId ? `${baseUrl}/bet/${data.ticketId}/review` : baseUrl;
    default:
      return data.url || baseUrl;
  }
}

// =====================================================
// SHARE CARD PREVIEW
// =====================================================

function ShareCardPreview({ data }: { data: ShareData }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      {/* Accent bar */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
      
      {/* GZ Sports branding */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center">
          <span className="text-xs font-bold text-white">GZ</span>
        </div>
        <span className="text-xs font-medium text-slate-400">GZ Sports</span>
      </div>
      
      {/* Content based on type */}
      {data.type === 'watchboard' && (
        <div>
          <h3 className="font-semibold text-white mb-1">{data.boardName || 'My Watchboard'}</h3>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span>📺 {data.gameCount || 0} games</span>
            {data.liveCount && data.liveCount > 0 && (
              <span className="text-red-400">🔴 {data.liveCount} LIVE</span>
            )}
          </div>
        </div>
      )}
      
      {data.type === 'performance' && (
        <div>
          <h3 className="font-semibold text-white mb-2">My Betting Performance</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/5 rounded-lg p-2">
              <div className={cn(
                "text-lg font-bold",
                (data.winRate || 0) >= 52 ? "text-emerald-400" : "text-slate-300"
              )}>
                {data.winRate?.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">Win Rate</div>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <div className={cn(
                "text-lg font-bold",
                (data.roi || 0) >= 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {(data.roi || 0) >= 0 ? '+' : ''}{data.roi?.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">ROI</div>
            </div>
          </div>
          {data.currentStreak && data.currentStreak.count > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">Current Streak:</span>
              <span className={cn(
                "text-sm font-bold",
                data.currentStreak.type === 'W' ? "text-emerald-400" : "text-red-400"
              )}>
                {data.currentStreak.count}{data.currentStreak.type}
              </span>
            </div>
          )}
        </div>
      )}
      
      {data.type === 'bet' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-white">
              {data.ticketType === 'parlay' ? 'Parlay' : 'Single Bet'}
            </h3>
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-bold",
              data.status === 'won' && "bg-emerald-500/20 text-emerald-400",
              data.status === 'lost' && "bg-red-500/20 text-red-400",
              data.status === 'push' && "bg-amber-500/20 text-amber-400",
              (!data.status || data.status === 'pending') && "bg-blue-500/20 text-blue-400"
            )}>
              {data.status?.toUpperCase() || 'PENDING'}
            </span>
          </div>
          <div className="text-sm text-slate-400">
            {data.legCount} {data.legCount === 1 ? 'leg' : 'legs'}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// SHARE MODAL COMPONENT
// =====================================================

export function ShareModal({ open, onClose, data }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  
  const shareUrl = generateShareUrl(data);
  const shareText = generateShareText(data);
  const twitterText = generateTwitterText(data);
  
  // Check if Web Share API is available
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  
  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) {
      setShareError('Sharing not supported on this device');
      return;
    }
    
    try {
      await navigator.share({
        title: data.title,
        text: shareText,
        url: shareUrl,
      });
    } catch (err) {
      // User cancelled or error
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
        setShareError('Failed to share. Try copying the link instead.');
      }
    }
  }, [data.title, shareText, shareUrl]);
  
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      setShareError('Failed to copy link');
    }
  }, [shareUrl]);
  
  const handleCopyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      setShareError('Failed to copy');
    }
  }, [shareText, shareUrl]);
  
  const handleTwitterShare = useCallback(() => {
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(tweetUrl, '_blank', 'width=550,height=420');
  }, [twitterText, shareUrl]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Share2 className="w-5 h-5 text-blue-400" />
            Share
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Preview Card */}
          <ShareCardPreview data={data} />
          
          {/* Error message */}
          {shareError && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 text-red-400 text-sm">
              <X className="w-4 h-4" />
              {shareError}
            </div>
          )}
          
          {/* Share Options */}
          <div className="grid gap-2">
            {/* Native Share (mobile) */}
            {canNativeShare && (
              <Button
                onClick={handleNativeShare}
                className="w-full justify-start gap-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
              >
                <Share2 className="w-4 h-4" />
                Share...
              </Button>
            )}
            
            {/* Copy Link */}
            <Button
              variant="outline"
              onClick={handleCopyLink}
              className="w-full justify-start gap-3 border-white/10 hover:bg-white/5"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
            
            {/* Copy with Text */}
            <Button
              variant="outline"
              onClick={handleCopyText}
              className="w-full justify-start gap-3 border-white/10 hover:bg-white/5"
            >
              <Copy className="w-4 h-4" />
              Copy with Stats
            </Button>
            
            {/* Twitter/X */}
            <Button
              variant="outline"
              onClick={handleTwitterShare}
              className="w-full justify-start gap-3 border-white/10 hover:bg-white/5 hover:text-[#1DA1F2]"
            >
              <Twitter className="w-4 h-4" />
              Share on X
              <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
            </Button>
          </div>
          
          {/* URL Preview */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 text-sm">
            <Link2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span className="text-slate-400 truncate">{shareUrl}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// SHARE BUTTON COMPONENT
// =====================================================

interface ShareButtonProps {
  data: ShareData;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ShareButton({ data, className, variant = 'outline', size = 'sm' }: ShareButtonProps) {
  const [showModal, setShowModal] = useState(false);
  
  // Quick native share on mobile without opening modal
  const handleQuickShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // On mobile with native share, use it directly
    if (navigator.share) {
      try {
        await navigator.share({
          title: data.title,
          text: generateShareText(data),
          url: generateShareUrl(data),
        });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Fall back to modal on error
      }
    }
    
    // Otherwise show modal
    setShowModal(true);
  };
  
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleQuickShare}
        className={cn("gap-2", className)}
      >
        <Share2 className="w-4 h-4" />
        {size !== 'icon' && <span className="hidden sm:inline">Share</span>}
      </Button>
      
      <ShareModal
        open={showModal}
        onClose={() => setShowModal(false)}
        data={data}
      />
    </>
  );
}

export default ShareModal;
