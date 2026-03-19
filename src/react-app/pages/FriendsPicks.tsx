/**
 * FriendsPicks - Social feed of picks from friends
 * View shared picks, follow/unfollow users, see friend activity
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Users, UserPlus, UserMinus, Search, 
  Flame, TrendingUp, Clock, RefreshCw,
  Trophy, Zap
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import type { SharedPick } from "@/react-app/components/PickShareCard";

// =====================================================
// CINEMATIC BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-500/[0.03] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-primary/[0.03] rounded-full blur-[100px]" />
    </div>
  );
}

// =====================================================
// TYPES
// =====================================================

interface FriendUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  record: { wins: number; losses: number };
  streak: number;
  isFollowing: boolean;
}

interface FriendPick extends SharedPick {
  sharedAt: string;
  user: FriendUser;
}

// =====================================================
// DEMO DATA
// =====================================================

const DEMO_FRIENDS: FriendUser[] = [
  { id: '1', username: 'pickmaster', displayName: 'Pick Master', record: { wins: 47, losses: 31 }, streak: 5, isFollowing: true },
  { id: '2', username: 'sharpshooter', displayName: 'Sharp Shooter', record: { wins: 89, losses: 52 }, streak: -2, isFollowing: true },
  { id: '3', username: 'underdoglover', displayName: 'Underdog Lover', record: { wins: 23, losses: 28 }, streak: 3, isFollowing: true },
  { id: '4', username: 'statsguru', displayName: 'Stats Guru', record: { wins: 156, losses: 98 }, streak: 7, isFollowing: false },
  { id: '5', username: 'clutchking', displayName: 'Clutch King', record: { wins: 34, losses: 19 }, streak: 4, isFollowing: false },
];

const DEMO_PICKS: FriendPick[] = [
  {
    id: 'fp1',
    homeTeam: 'Lakers',
    awayTeam: 'Celtics',
    sport: 'NBA',
    pickType: 'SPREAD',
    pickSide: 'AWAY',
    lineValue: -4.5,
    odds: -110,
    confidence: 'high',
    result: 'PENDING',
    gameTime: new Date(Date.now() + 3600000).toISOString(),
    userName: 'Pick Master',
    userRecord: { wins: 47, losses: 31 },
    sharedAt: new Date(Date.now() - 1800000).toISOString(),
    user: DEMO_FRIENDS[0],
  },
  {
    id: 'fp2',
    homeTeam: 'Chiefs',
    awayTeam: 'Bills',
    sport: 'NFL',
    pickType: 'TOTAL',
    pickSide: 'OVER',
    lineValue: 48.5,
    odds: -105,
    confidence: 'max',
    result: 'PENDING',
    gameTime: new Date(Date.now() + 86400000).toISOString(),
    userName: 'Sharp Shooter',
    userRecord: { wins: 89, losses: 52 },
    sharedAt: new Date(Date.now() - 3600000).toISOString(),
    user: DEMO_FRIENDS[1],
  },
  {
    id: 'fp3',
    homeTeam: 'Yankees',
    awayTeam: 'Red Sox',
    sport: 'MLB',
    pickType: 'MONEYLINE',
    pickSide: 'AWAY',
    lineValue: null,
    odds: +145,
    confidence: 'medium',
    result: 'WIN',
    gameTime: new Date(Date.now() - 7200000).toISOString(),
    userName: 'Underdog Lover',
    userRecord: { wins: 23, losses: 28 },
    sharedAt: new Date(Date.now() - 14400000).toISOString(),
    user: DEMO_FRIENDS[2],
  },
  {
    id: 'fp4',
    homeTeam: 'Bruins',
    awayTeam: 'Rangers',
    sport: 'NHL',
    pickType: 'SPREAD',
    pickSide: 'HOME',
    lineValue: -1.5,
    odds: +135,
    confidence: 'low',
    result: 'LOSS',
    gameTime: new Date(Date.now() - 10800000).toISOString(),
    userName: 'Sharp Shooter',
    userRecord: { wins: 89, losses: 52 },
    sharedAt: new Date(Date.now() - 21600000).toISOString(),
    user: DEMO_FRIENDS[1],
  },
];

// =====================================================
// SUB-COMPONENTS
// =====================================================

function FriendCard({ friend, onToggleFollow }: { friend: FriendUser; onToggleFollow: () => void }) {
  const winRate = ((friend.record.wins / (friend.record.wins + friend.record.losses)) * 100).toFixed(1);
  
  return (
    <div className={cn(
      "rounded-xl p-3 transition-all",
      "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
      "border border-white/[0.08]",
      "hover:from-white/[0.08] hover:to-white/[0.04]"
    )}>
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          "bg-gradient-to-br from-primary to-blue-600"
        )}>
          <span className="text-sm font-bold text-white">
            {friend.displayName.charAt(0).toUpperCase()}
          </span>
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{friend.displayName}</p>
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span>{friend.record.wins}-{friend.record.losses}</span>
            <span>•</span>
            <span>{winRate}%</span>
            {friend.streak !== 0 && (
              <>
                <span>•</span>
                <span className={cn(
                  "flex items-center gap-0.5",
                  friend.streak > 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  <Flame className="w-3 h-3" />
                  {friend.streak > 0 ? 'W' : 'L'}{Math.abs(friend.streak)}
                </span>
              </>
            )}
          </div>
        </div>
        
        {/* Follow button */}
        <Button
          variant={friend.isFollowing ? "outline" : "default"}
          size="sm"
          onClick={onToggleFollow}
          className={cn(
            "rounded-lg gap-1",
            friend.isFollowing 
              ? "bg-white/[0.04] border-white/[0.08] text-white/60 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-400"
              : "bg-gradient-to-r from-primary to-blue-600"
          )}
        >
          {friend.isFollowing ? (
            <>
              <UserMinus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Following</span>
            </>
          ) : (
            <>
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Follow</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function FriendPickCard({ pick, index }: { pick: FriendPick; index: number }) {
  const sharedTime = new Date(pick.sharedAt);
  const gameTime = new Date(pick.gameTime);
  const now = new Date();
  
  const getRelativeTime = (date: Date) => {
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };
  
  const getResultBadge = () => {
    if (pick.result === 'WIN') return { color: 'from-emerald-500 to-emerald-600', text: 'WIN' };
    if (pick.result === 'LOSS') return { color: 'from-red-500 to-red-600', text: 'LOSS' };
    if (pick.result === 'PUSH') return { color: 'from-gray-500 to-gray-600', text: 'PUSH' };
    return null;
  };
  
  const resultBadge = getResultBadge();
  
  const formatOdds = (odds: number) => odds > 0 ? `+${odds}` : `${odds}`;
  
  const getPickDescription = () => {
    switch (pick.pickType) {
      case 'SPREAD': {
        const team = pick.pickSide === 'HOME' ? pick.homeTeam : pick.awayTeam;
        const line = pick.lineValue || 0;
        return `${team} ${line > 0 ? '+' : ''}${line}`;
      }
      case 'TOTAL':
        return `${pick.pickSide === 'OVER' ? 'Over' : 'Under'} ${pick.lineValue}`;
      case 'MONEYLINE':
        return `${pick.pickSide === 'HOME' ? pick.homeTeam : pick.awayTeam} ML`;
      default:
        return '';
    }
  };

  return (
    <div
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn(
        "rounded-xl overflow-hidden transition-all duration-300",
        "animate-in fade-in slide-in-from-bottom-3",
        "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
        "border border-white/[0.08]",
        "hover:from-white/[0.08] hover:to-white/[0.04]"
      )}
    >
      {/* User header */}
      <div className="flex items-center gap-3 p-3 border-b border-white/[0.06]">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center",
          "bg-gradient-to-br from-primary to-blue-600"
        )}>
          <span className="text-xs font-bold text-white">
            {pick.user.displayName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{pick.user.displayName}</p>
          <p className="text-[10px] text-white/40">{getRelativeTime(sharedTime)}</p>
        </div>
        {pick.user.streak > 2 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
            <Flame className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400">W{pick.user.streak}</span>
          </div>
        )}
      </div>
      
      {/* Pick content */}
      <div className="p-4">
        {/* Sport & matchup */}
        <div className="flex items-center gap-2 mb-3">
          <span className={cn(
            "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
            "bg-white/[0.08] text-white/60"
          )}>
            {pick.sport}
          </span>
          {resultBadge && (
            <span className={cn(
              "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white",
              "bg-gradient-to-r",
              resultBadge.color
            )}>
              {resultBadge.text}
            </span>
          )}
        </div>
        
        {/* Teams */}
        <div className="flex items-center gap-3 mb-3">
          <TeamBadge teamName={pick.awayTeam} size="sm" />
          <p className="flex-1 text-sm font-semibold text-white text-center">
            {pick.awayTeam} @ {pick.homeTeam}
          </p>
          <TeamBadge teamName={pick.homeTeam} size="sm" />
        </div>
        
        {/* Pick details */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg",
          "bg-gradient-to-r from-primary/20 to-primary/10",
          "border border-primary/30"
        )}>
          <div>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Their Pick</p>
            <p className="font-bold text-white">{getPickDescription()}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Odds</p>
            <p className="font-mono font-bold text-primary">{formatOdds(pick.odds)}</p>
          </div>
        </div>
        
        {/* Confidence */}
        {pick.confidence && (
          <div className="flex items-center gap-2 mt-3">
            <Zap className={cn(
              "w-4 h-4",
              pick.confidence === 'max' ? "text-amber-400" :
              pick.confidence === 'high' ? "text-emerald-400" :
              pick.confidence === 'medium' ? "text-blue-400" : "text-white/40"
            )} />
            <span className="text-xs font-semibold text-white/60 capitalize">
              {pick.confidence} confidence
            </span>
          </div>
        )}
        
        {/* Game time */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
          <Clock className="w-3.5 h-3.5 text-white/40" />
          <span className="text-xs text-white/40">
            {pick.result === 'PENDING' 
              ? `Starts ${gameTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
              : `Played ${gameTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            }
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="text-center py-16">
      <div className={cn(
        "w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center",
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
        "border border-white/[0.1]"
      )}>
        <Users className="w-9 h-9 text-white/20" />
      </div>
      <h3 className="font-bold text-lg text-white/80 mb-2">No picks from friends yet</h3>
      <p className="text-sm text-white/40 mb-6 max-w-xs mx-auto">
        Follow other users to see their picks in your feed
      </p>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function FriendsPicks() {
  const navigate = useNavigate();
  useDemoAuth();
  const [activeTab, setActiveTab] = useState<'feed' | 'friends'>('feed');
  const [picks] = useState<FriendPick[]>(DEMO_PICKS);
  const [friends, setFriends] = useState<FriendUser[]>(DEMO_FRIENDS);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResult, setFilterResult] = useState<string | null>(null);
  
  const filteredPicks = useMemo(() => {
    let filtered = [...picks];
    
    if (filterResult === 'pending') {
      filtered = filtered.filter(p => p.result === 'PENDING');
    } else if (filterResult === 'graded') {
      filtered = filtered.filter(p => p.result !== 'PENDING');
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.user.displayName.toLowerCase().includes(q) ||
        p.homeTeam.toLowerCase().includes(q) ||
        p.awayTeam.toLowerCase().includes(q)
      );
    }
    
    return filtered.sort((a, b) => 
      new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()
    );
  }, [picks, searchQuery, filterResult]);
  
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const q = searchQuery.toLowerCase();
    return friends.filter(f => 
      f.displayName.toLowerCase().includes(q) ||
      f.username.toLowerCase().includes(q)
    );
  }, [friends, searchQuery]);
  
  const handleToggleFollow = (friendId: string) => {
    setFriends(prev => prev.map(f => 
      f.id === friendId ? { ...f, isFollowing: !f.isFollowing } : f
    ));
  };
  
  const followingCount = friends.filter(f => f.isFollowing).length;
  
  return (
    <div className="min-h-screen relative -mx-4 -mt-6 px-4 pt-6 pb-24">
      <CinematicBackground />
      
      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]"
              >
                <ArrowLeft className="w-5 h-5 text-white/70" />
              </Button>
              <div>
                <h1 className="font-black text-xl text-white flex items-center gap-2">
                  Friends' Picks
                  <Users className="w-5 h-5 text-purple-400" />
                </h1>
                <p className="text-xs text-white/40 font-medium">
                  Following {followingCount} {followingCount === 1 ? 'person' : 'people'}
                </p>
              </div>
            </div>
            
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLoading(true)}
              disabled={loading}
              className="rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]"
            >
              <RefreshCw className={cn("w-4 h-4 text-white/60", loading && "animate-spin")} />
            </Button>
          </div>
        </header>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('feed')}
            className={cn(
              "flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all",
              activeTab === 'feed'
                ? "bg-gradient-to-r from-primary to-blue-600 text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
                : "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:bg-white/[0.08]"
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Feed
            </span>
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={cn(
              "flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all",
              activeTab === 'friends'
                ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-[0_4px_16px_rgba(168,85,247,0.3)]"
                : "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:bg-white/[0.08]"
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <Users className="w-4 h-4" />
              Friends ({followingCount})
            </span>
          </button>
        </div>
        
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            placeholder={activeTab === 'feed' ? "Search picks or users..." : "Search friends..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "pl-10 rounded-xl",
              "bg-white/[0.04] border-white/[0.08]",
              "text-white placeholder:text-white/30",
              "focus:border-primary/50 focus:ring-primary/20"
            )}
          />
        </div>
        
        {/* Feed tab content */}
        {activeTab === 'feed' && (
          <>
            {/* Filter pills */}
            <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide -mx-4 px-4">
              <button
                onClick={() => setFilterResult(null)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0",
                  !filterResult
                    ? "bg-gradient-to-r from-primary to-blue-600 text-white"
                    : "bg-white/[0.04] text-white/50 border border-white/[0.08]"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilterResult('pending')}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0",
                  filterResult === 'pending'
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white"
                    : "bg-white/[0.04] text-white/50 border border-white/[0.08]"
                )}
              >
                Pending
              </button>
              <button
                onClick={() => setFilterResult('graded')}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0",
                  filterResult === 'graded'
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
                    : "bg-white/[0.04] text-white/50 border border-white/[0.08]"
                )}
              >
                Graded
              </button>
            </div>
            
            {/* Picks list */}
            {filteredPicks.length === 0 ? (
              <EmptyFeed />
            ) : (
              <div className="space-y-4">
                {filteredPicks.map((pick, index) => (
                  <FriendPickCard key={pick.id} pick={pick} index={index} />
                ))}
              </div>
            )}
          </>
        )}
        
        {/* Friends tab content */}
        {activeTab === 'friends' && (
          <div className="space-y-3">
            {/* Top performers section */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                Top Performers
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {friends
                  .filter(f => f.isFollowing)
                  .sort((a, b) => (b.record.wins / (b.record.wins + b.record.losses)) - (a.record.wins / (a.record.wins + a.record.losses)))
                  .slice(0, 3)
                  .map((friend, index) => (
                    <div 
                      key={friend.id}
                      className={cn(
                        "rounded-xl p-3 text-center",
                        "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
                        "border border-white/[0.08]"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center",
                        index === 0 ? "bg-gradient-to-br from-amber-500 to-amber-600" :
                        index === 1 ? "bg-gradient-to-br from-gray-400 to-gray-500" :
                        "bg-gradient-to-br from-amber-700 to-amber-800"
                      )}>
                        <span className="text-sm font-bold text-white">
                          {friend.displayName.charAt(0)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-white truncate">{friend.displayName}</p>
                      <p className="text-[10px] text-white/40">{friend.record.wins}-{friend.record.losses}</p>
                    </div>
                  ))}
              </div>
            </div>
            
            {/* All friends */}
            <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              All Users
            </h3>
            {filteredFriends.map(friend => (
              <FriendCard 
                key={friend.id} 
                friend={friend} 
                onToggleFollow={() => handleToggleFollow(friend.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FriendsPicks;
