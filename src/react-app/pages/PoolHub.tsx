import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { 
  LayoutGrid, 
  Target, 
  Users, 
  Trophy,
  BarChart3,
  Settings,
  ChevronLeft,
  Clock,
  Shield,
  Sparkles,
  Flame
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/react-app/components/ui/tabs";
import { POOL_FORMATS } from "@/react-app/data/sports";
// League state type for pool status
type LeagueState = "preview" | "open" | "submitted" | "locked" | "live" | "final";
import { useActiveLeague } from "@/react-app/contexts/ActiveLeagueContext";
import { useAdminMode } from "@/react-app/contexts/AdminModeContext";

import { cn } from "@/react-app/lib/utils";
import { StatusPill, CountdownPill } from "@/react-app/components/ui/premium";

// Tab Components (will be expanded in subsequent tasks)
import { PoolHubOverview } from "@/react-app/components/pool-hub/PoolHubOverview";
import { PoolHubMakePicks } from "@/react-app/components/pool-hub/PoolHubMakePicks";
import { PoolHubEveryonesPicks } from "@/react-app/components/pool-hub/PoolHubEveryonesPicks";
import { PoolHubStandings } from "@/react-app/components/pool-hub/PoolHubStandings";
import { PoolHubMyEntries } from "@/react-app/components/pool-hub/PoolHubMyEntries";
import { PoolHubAdmin } from "@/react-app/components/pool-hub/PoolHubAdmin";
import { PoolHubRules } from "@/react-app/components/pool-hub/PoolHubRules";
import { LiveTab } from "@/react-app/components/LiveTab";
import { FollowButton } from "@/react-app/components/FollowButton";
import { PoolTypeBadgeIcon } from "@/react-app/components/pools/PoolTypeBadgeIcon";

type PoolStatus = "open" | "locked" | "live" | "final";

interface TimeContext {
  periodLabel: string;
  periodNumber: number | string;
  status: PoolStatus;
  lockTime: Date;
  timeUntilLock: number;
}

// Cinematic Background Component
function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-black" />
      
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
      
      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />
    </div>
  );
}

function getPeriodName(sportKey: string): { singular: string; plural: string } {
  switch (sportKey) {
    case "nfl":
    case "ncaaf":
      return { singular: "Week", plural: "Weeks" };
    case "nba":
    case "ncaab":
      return { singular: "Game Day", plural: "Game Days" };
    case "mlb":
      return { singular: "Series", plural: "Series" };
    case "nhl":
      return { singular: "Game Day", plural: "Game Days" };
    case "golf":
      return { singular: "Round", plural: "Rounds" };
    case "soccer":
      return { singular: "Match Day", plural: "Match Days" };
    default:
      return { singular: "Period", plural: "Periods" };
  }
}

function getTimeContext(sportKey: string): TimeContext {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  
  let periodNumber = 1;
  let status: PoolStatus = "open";
  let lockTime = new Date();
  const periodName = getPeriodName(sportKey);
  
  switch (sportKey) {
    case "nfl":
    case "ncaaf":
      periodNumber = Math.min(18, Math.max(1, Math.floor((now.getTime() - new Date(2024, 8, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1));
      lockTime = new Date(now);
      lockTime.setDate(now.getDate() + ((7 - dayOfWeek) % 7));
      lockTime.setHours(13, 0, 0, 0);
      if (dayOfWeek === 0 && hour >= 13) {
        status = "live";
      } else if (dayOfWeek === 1 && hour < 1) {
        status = "live";
      } else if (dayOfWeek >= 2 && dayOfWeek <= 3) {
        status = "final";
      }
      break;
      
    case "nba":
    case "ncaab":
      periodNumber = Math.floor((now.getTime() - new Date(2024, 9, 1).getTime()) / (24 * 60 * 60 * 1000)) + 1;
      lockTime = new Date(now);
      lockTime.setHours(19, 0, 0, 0);
      if (hour >= 19 && hour < 24) {
        status = "live";
      }
      break;
      
    default:
      periodNumber = Math.floor((now.getTime() - new Date(2024, 0, 1).getTime()) / (24 * 60 * 60 * 1000)) + 1;
      lockTime = new Date(now);
      lockTime.setHours(19, 0, 0, 0);
      if (hour >= 19) {
        status = "live";
      }
  }
  
  const timeUntilLock = Math.max(0, lockTime.getTime() - now.getTime());
  
  return {
    periodLabel: periodName.singular,
    periodNumber,
    status,
    lockTime,
    timeUntilLock
  };
}

// Premium Glass Tab Component
function GlassTab({ 
  active, 
  icon: Icon, 
  label, 
  isLive,
  onClick 
}: { 
  active: boolean;
  icon: React.ElementType;
  label: string;
  isLive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-300",
        "text-sm font-medium whitespace-nowrap",
        active ? [
          "bg-gradient-to-br from-white/[0.12] to-white/[0.04]",
          "text-white",
          "border border-white/[0.15]",
          "shadow-lg shadow-black/20"
        ] : [
          "text-slate-400 hover:text-slate-200",
          "hover:bg-white/[0.05]"
        ]
      )}
    >
      <Icon className={cn(
        "w-4 h-4",
        isLive && "text-red-400"
      )} />
      <span>{label}</span>
      {isLive && (
        <div className="absolute top-2 right-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping" />
          </div>
        </div>
      )}
    </button>
  );
}

export function PoolHub() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leagueId = parseInt(id || "0", 10);
  
  const { leagues } = useActiveLeague();
  const { isAdminMode } = useAdminMode();
  
  const [activeTab, setActiveTab] = useState("overview");
  
  // Find the league from API data
  const league = useMemo(() => {
    return leagues.find(l => l.id === leagueId);
  }, [leagues, leagueId]);
  
  const format = league ? POOL_FORMATS.find(f => f.key === league.format_key) : null;
  
  // Calculate time context from sport schedule
  const timeContext = useMemo(() => {
    if (!league) return null;
    
    // If league has a state, use it directly
    const leagueState = (league as { state?: LeagueState }).state;
    if (leagueState) {
      const demoStatus = leagueState === "submitted" ? "locked" : 
                         leagueState === "preview" ? "open" : 
                         leagueState as PoolStatus;
      const periodName = getPeriodName(league.sport_key);
      const now = new Date();
      const lockTime = new Date(now.getTime() + 3600000);
      
      return {
        periodLabel: periodName.singular,
        periodNumber: league.sport_key.includes("nfl") || league.sport_key.includes("ncaaf") ? 14 : 
                     league.sport_key.includes("golf") ? 3 : "Dec 15",
        status: demoStatus,
        lockTime,
        timeUntilLock: Math.max(0, lockTime.getTime() - now.getTime())
      };
    }
    
    return getTimeContext(league.sport_key);
  }, [league]);
  
  // Check if user is admin/owner of this pool
  const isPoolAdmin = league?.role === "owner" || league?.role === "admin";
  const showAdminTab = isPoolAdmin && isAdminMode;
  
  if (!league) {
    return (
      <div className="min-h-screen relative">
        <CinematicBackground />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center p-8 rounded-2xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.08]">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-slate-500" />
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">Pool Not Found</h1>
            <p className="text-slate-400 mb-6">This pool doesn't exist or you don't have access.</p>
            <Link 
              to="/pools"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium transition-colors"
            >
              Back to Pools
            </Link>
          </div>
        </div>
      </div>
    );
  }
  
  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutGrid },
    { id: "picks", label: "Make Picks", icon: Target },
    { id: "entries", label: "My Entries", icon: BarChart3 },
    { id: "rules", label: "Rules", icon: Shield },
    { id: "live", label: "Live Sweat", icon: Flame },
    { id: "everyone", label: "Everyone's Picks", icon: Users },
    { id: "standings", label: "Standings", icon: Trophy },
    ...(showAdminTab ? [{ id: "admin", label: "Admin", icon: Settings }] : [])
  ];

  return (
    <div className="min-h-screen relative">
      <CinematicBackground />
      
      <div className="relative z-10">
        {/* Premium Glass Header */}
        <header className="sticky top-0 z-40">
          <div className="bg-slate-950/80 backdrop-blur-2xl border-b border-white/[0.06]">
            <div className="container mx-auto px-4">
              {/* Top row: Back + Pool Info */}
              <div className="flex items-center gap-4 h-16">
                <button 
                  onClick={() => navigate(-1)}
                  className="p-2 -ml-2 rounded-xl hover:bg-white/[0.05] transition-colors text-slate-400 hover:text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <PoolTypeBadgeIcon formatKey={league.format_key} size="sm" />
                    <div>
                      <h1 className="font-bold text-white text-lg truncate">{league.name}</h1>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08]">
                          {format?.name || league.format_key}
                        </span>
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {timeContext?.periodLabel} {timeContext?.periodNumber}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Follow + Status + Lock Time */}
                <div className="flex items-center gap-3 shrink-0">
                  <FollowButton 
                    itemType="POOL" 
                    itemId={String(leagueId)} 
                    sportType={league?.sport_key}
                    variant="icon"
                  />
                  {timeContext && (
                    <>
                      <StatusPill status={timeContext.status} />
                      {(timeContext.status === "open") && (
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08]">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <CountdownPill targetDate={timeContext.lockTime} size="sm" />
                        </div>
                      )}
                      {timeContext.status === "live" && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                          <div className="relative">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <div className="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                          </div>
                          <span className="text-xs font-medium text-red-400">LIVE</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* Glass Tabs Navigation */}
              <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 pb-3">
                <div className="flex items-center gap-2 w-max min-w-full">
                  {tabs.map(tab => {
                    const isLive = tab.id === "live" && timeContext?.status === "live";
                    return (
                      <GlassTab
                        key={tab.id}
                        active={activeTab === tab.id}
                        icon={tab.icon}
                        label={tab.label}
                        isLive={isLive}
                        onClick={() => setActiveTab(tab.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </header>
        
        {/* Tab Content */}
        <main className="container mx-auto px-4 py-6 pb-24">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="hidden">
              {tabs.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
              ))}
            </TabsList>
            
            <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
              <PoolHubOverview league={league} timeContext={timeContext} />
            </TabsContent>
            
            <TabsContent value="picks" className="mt-0 focus-visible:outline-none">
              <PoolHubMakePicks league={league} timeContext={timeContext} />
            </TabsContent>

            <TabsContent value="entries" className="mt-0 focus-visible:outline-none">
              <PoolHubMyEntries league={league} />
            </TabsContent>

            <TabsContent value="rules" className="mt-0 focus-visible:outline-none">
              <PoolHubRules league={league} />
            </TabsContent>
            
            <TabsContent value="live" className="mt-0 focus-visible:outline-none">
              <LiveTab 
                poolId={league.id} 
                periodId={timeContext?.periodNumber?.toString() || '1'} 
                poolType={league.format_key}
              />
            </TabsContent>
            
            <TabsContent value="everyone" className="mt-0 focus-visible:outline-none">
              <PoolHubEveryonesPicks league={league} />
            </TabsContent>
            
            <TabsContent value="standings" className="mt-0 focus-visible:outline-none">
              <PoolHubStandings league={league} />
            </TabsContent>
            
            {showAdminTab && (
              <TabsContent value="admin" className="mt-0 focus-visible:outline-none">
                <PoolHubAdmin league={league} />
              </TabsContent>
            )}
          </Tabs>
        </main>
      </div>
    </div>
  );
}
