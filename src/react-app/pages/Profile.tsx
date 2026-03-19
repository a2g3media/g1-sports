import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { ProfileHeader } from "@/react-app/components/profile/ProfileHeader";
import { ReferralCard } from "@/react-app/components/ReferralCard";
import { 
  Settings, 
  Trophy, 
  Target, 
  Flame, 
  Calendar,
  TrendingUp,
  Award,
  ChevronRight,
  Sparkles,
  Zap,
  Star,
  Crown
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/react-app/lib/utils";
import { ROUTES } from "@/react-app/config/routes";

// Cinematic stat card with glass effect
function StatCard({ 
  icon: Icon, 
  value, 
  label, 
  iconColor,
  highlight = false 
}: { 
  icon: typeof Target; 
  value: string | number; 
  label: string; 
  iconColor: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "relative group",
      "rounded-2xl overflow-hidden",
      "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
      "border border-white/[0.08]",
      "backdrop-blur-xl",
      "p-5",
      "transition-all duration-500",
      "hover:border-white/20 hover:from-white/[0.12] hover:to-white/[0.04]",
      "hover:shadow-xl hover:shadow-black/20",
      highlight && "ring-1 ring-primary/30"
    )}>
      {/* Glow effect on hover */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        "bg-gradient-to-br from-primary/10 via-transparent to-transparent"
      )} />
      
      <div className="relative z-10 text-center">
        <div className={cn(
          "w-12 h-12 mx-auto mb-3 rounded-xl",
          "bg-gradient-to-br from-white/10 to-white/5",
          "flex items-center justify-center",
          "group-hover:scale-110 transition-transform duration-300"
        )}>
          <Icon className={cn("h-6 w-6", iconColor)} />
        </div>
        <p className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
          {value}
        </p>
        <p className="text-xs text-white/50 font-medium uppercase tracking-wider mt-1">
          {label}
        </p>
      </div>
    </div>
  );
}

// Achievement badge with premium styling
function AchievementBadge({ 
  achievement 
}: { 
  achievement: { name: string; description: string; earned: boolean } 
}) {
  return (
    <div className={cn(
      "relative group",
      "p-4 rounded-xl overflow-hidden",
      "transition-all duration-300",
      achievement.earned
        ? "bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30"
        : "bg-white/[0.03] border border-white/[0.06] opacity-60"
    )}>
      {/* Earned glow */}
      {achievement.earned && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}
      
      <div className="relative z-10 flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          "transition-all duration-300",
          achievement.earned
            ? "bg-gradient-to-br from-primary/30 to-primary/10 group-hover:scale-110"
            : "bg-white/[0.05]"
        )}>
          {achievement.earned ? (
            <Trophy className="h-5 w-5 text-primary" />
          ) : (
            <span className="text-lg text-white/30">?</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "font-semibold text-sm",
            achievement.earned ? "text-white" : "text-white/50"
          )}>
            {achievement.name}
          </p>
          <p className="text-xs text-white/40 mt-0.5 line-clamp-2">
            {achievement.description}
          </p>
        </div>
        {achievement.earned && (
          <Star className="h-4 w-4 text-yellow-500 shrink-0 fill-yellow-500" />
        )}
      </div>
    </div>
  );
}

export function Profile() {
  const { } = useDemoAuth();

  // Demo stats
  const stats = {
    totalPicks: 247,
    correctPicks: 144,
    winRate: 58.3,
    currentStreak: 4,
    bestStreak: 12,
    poolsJoined: 6,
    poolsWon: 2,
    memberSince: "Jan 2024"
  };

  const achievements = [
    { name: "First Pick", description: "Made your first pick", earned: true },
    { name: "On Fire", description: "5 correct picks in a row", earned: true },
    { name: "Pool Champion", description: "Won a pool", earned: true },
    { name: "Sharp Shooter", description: "70%+ accuracy in a week", earned: false },
    { name: "Century Club", description: "Made 100 correct picks", earned: true },
    { name: "Legend", description: "Won 10 pools", earned: false }
  ];

  const earnedCount = achievements.filter(a => a.earned).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl space-y-8">
        {/* Profile Header - keeping original component */}
        <ProfileHeader />

        {/* Stats Highlight Banner */}
        <div className={cn(
          "relative overflow-hidden rounded-2xl",
          "bg-gradient-to-r from-primary/20 via-emerald-500/10 to-primary/20",
          "border border-primary/20",
          "p-6"
        )}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05),transparent)]" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {stats.winRate}% <span className="text-lg text-white/60 font-medium">Win Rate</span>
                </p>
                <p className="text-sm text-white/50">
                  {stats.correctPicks} correct picks from {stats.totalPicks} total
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              <span className="text-sm font-medium text-white/70">
                {stats.currentStreak} game streak
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            icon={Target} 
            value={`${stats.winRate}%`} 
            label="Win Rate" 
            iconColor="text-primary"
            highlight 
          />
          <StatCard 
            icon={Crown} 
            value={stats.poolsWon} 
            label="Pools Won" 
            iconColor="text-yellow-500" 
          />
          <StatCard 
            icon={Flame} 
            value={stats.currentStreak} 
            label="Current Streak" 
            iconColor="text-orange-500" 
          />
          <StatCard 
            icon={TrendingUp} 
            value={stats.correctPicks} 
            label="Correct Picks" 
            iconColor="text-emerald-500" 
          />
        </div>

        {/* Detailed Stats Panel */}
        <div className={cn(
          "rounded-2xl overflow-hidden",
          "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
          "border border-white/[0.08]",
          "backdrop-blur-xl"
        )}>
          <div className="p-5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
                <Target className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-white">Picking Stats</h2>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Total Picks</p>
                <p className="text-2xl font-bold text-white">{stats.totalPicks}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Correct</p>
                <p className="text-2xl font-bold text-emerald-400">{stats.correctPicks}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Incorrect</p>
                <p className="text-2xl font-bold text-red-400">{stats.totalPicks - stats.correctPicks}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Best Streak</p>
                <p className="text-2xl font-bold text-white">{stats.bestStreak}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Pools Joined</p>
                <p className="text-2xl font-bold text-white">{stats.poolsJoined}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Member Since
                </p>
                <p className="text-2xl font-bold text-white">{stats.memberSince}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Achievements Panel */}
        <div className={cn(
          "rounded-2xl overflow-hidden",
          "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
          "border border-white/[0.08]",
          "backdrop-blur-xl"
        )}>
          <div className="p-5 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 flex items-center justify-center">
                  <Award className="h-5 w-5 text-yellow-500" />
                </div>
                <h2 className="text-lg font-semibold text-white">Achievements</h2>
              </div>
              <span className="px-3 py-1 rounded-full bg-white/10 text-sm font-medium text-white/70">
                {earnedCount} / {achievements.length}
              </span>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {achievements.map((achievement) => (
                <AchievementBadge key={achievement.name} achievement={achievement} />
              ))}
            </div>
          </div>
        </div>

        {/* Referral Card */}
        <ReferralCard />

        {/* Settings Link */}
        <Link to={ROUTES.SETTINGS}>
          <div className={cn(
            "group relative rounded-2xl overflow-hidden",
            "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
            "border border-white/[0.08]",
            "backdrop-blur-xl",
            "p-5",
            "transition-all duration-300",
            "hover:border-white/20 hover:from-white/[0.12] hover:to-white/[0.04]",
            "cursor-pointer"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Settings className="h-6 w-6 text-white/70" />
                </div>
                <div>
                  <p className="font-semibold text-white">Settings</p>
                  <p className="text-sm text-white/50">
                    Notifications, preferences, subscription
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-white/40 group-hover:text-white/70 group-hover:translate-x-1 transition-all duration-300" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
