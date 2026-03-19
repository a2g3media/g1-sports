import { ReactNode, useState, useEffect, lazy, Suspense } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Button } from "@/react-app/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/react-app/components/ui/avatar";
import { useFavoriteSports } from "@/react-app/components/FavoriteSportsSelector";

// Lazy load heavy modals - only imported when needed
const WhyGZModal = lazy(() => import("@/react-app/components/WhyGZModal").then(m => ({ default: m.WhyGZModal })));
import { OnboardingOverlay, useOnboarding } from "@/react-app/components/OnboardingOverlay";
import { ROUTES, isRouteActive } from "@/react-app/config/routes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { 
  Settings, 
  LogOut, 
  User, 
  ChevronDown,
  Trophy,
  Home,
  BarChart3,
  Ticket,
  TrendingUp,
  Compass,
} from "lucide-react";
import { useImpersonation } from "@/react-app/contexts/ImpersonationContext";
import { ThemeToggle } from "@/react-app/components/ThemeToggle";
import { UnifiedNotificationCenter } from "@/react-app/components/UnifiedNotificationCenter";
import { CoachGIntelligenceLayer } from "@/react-app/components/CoachGIntelligenceLayer";
import { useFeatureFlags } from "@/react-app/hooks/useFeatureFlags";

import { useFirstSession } from "@/react-app/hooks/useFirstSession";
import { cn } from "@/react-app/lib/utils";


interface LayoutProps {
  children: ReactNode;
  hideFooter?: boolean;
}

interface MarketplaceDiscoveryPool {
  is_featured?: boolean;
  state?: string | null;
}

const BRAND_LOGO_SRC = "/assets/g1-sports-logo-clean.png";
const BRAND_LOGO_FALLBACK = "/assets/g1-sports-logo.png";

export function Layout({ children, hideFooter: _hideFooter }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isDemoMode, devRole } = useDemoAuth();
  const { effectiveRole } = useImpersonation();
  const [mounted, setMounted] = useState(false);
  const { hasCompletedOnboarding, isLoading: onboardingLoading } = useFavoriteSports();
  const { flags } = useFeatureFlags();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWhyGZ, setShowWhyGZ] = useState(false);
  const [featuredMarketplaceCount, setFeaturedMarketplaceCount] = useState(0);
  const [liveMarketplaceCount, setLiveMarketplaceCount] = useState(0);

  const firstSession = useFirstSession();
  const { shouldShow: _shouldShowTour, complete: _completeTour } = useOnboarding();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show onboarding modal for new users after loading
  useEffect(() => {
    if (!onboardingLoading && !hasCompletedOnboarding && user && !isDemoMode) {
      setShowOnboarding(true);
    }
  }, [onboardingLoading, hasCompletedOnboarding, user, isDemoMode]);

  useEffect(() => {
    let cancelled = false;

    const loadMarketplaceSignal = async () => {
      if (!flags.PUBLIC_POOLS || !flags.MARKETPLACE_ENABLED) {
        if (!cancelled) {
          setFeaturedMarketplaceCount(0);
          setLiveMarketplaceCount(0);
        }
        return;
      }
      try {
        const res = await fetch("/api/marketplace/pools", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) {
            setFeaturedMarketplaceCount(0);
            setLiveMarketplaceCount(0);
          }
          return;
        }
        const payload = await res.json() as { pools?: MarketplaceDiscoveryPool[] };
        const pools = Array.isArray(payload?.pools) ? payload.pools : [];
        const featuredCount = pools.filter((pool) => Boolean(pool?.is_featured)).length;
        const liveCount = pools.filter((pool) => String(pool?.state || "").toLowerCase() === "live").length;
        if (!cancelled) {
          setFeaturedMarketplaceCount(featuredCount);
          setLiveMarketplaceCount(liveCount);
        }
      } catch {
        if (!cancelled) {
          setFeaturedMarketplaceCount(0);
          setLiveMarketplaceCount(0);
        }
      }
    };

    loadMarketplaceSignal();
    return () => {
      cancelled = true;
    };
  }, [flags.MARKETPLACE_ENABLED, flags.PUBLIC_POOLS]);

  // Navigation items - using centralized routes config
  // Order: Home, Games, Bet Builder (center), Odds, Pools, Coach G
  const navItems = [
    { name: "Home", href: ROUTES.HOME, icon: Home },
    { name: "Games", href: ROUTES.GAMES, icon: BarChart3 },
    { name: "Bet Builder", href: "/bet/new", icon: Ticket, isBetBuilder: true }, // Special bet builder button - keep centered
    { name: "Odds", href: "/odds", icon: TrendingUp },
    { name: "Pools", href: ROUTES.POOLS, icon: Trophy },
    { name: "Coach G", href: ROUTES.COACH, icon: null }, // Uses CoachGAvatarIcon
  ];

  // Custom isActive that handles Games vs Odds tab distinction
  const isActive = (href: string) => {
    const searchParams = new URLSearchParams(location.search);
    const currentTab = searchParams.get('tab');
    
    // Special handling for Games/Odds which share the same path
    if (href === ROUTES.GAMES) {
      // Games is active when on /games WITHOUT ?tab=odds
      return location.pathname === '/games' && currentTab !== 'odds' && currentTab !== 'props';
    }
    if (href === '/odds') {
      // Odds is active when on /odds page
      return location.pathname === '/odds';
    }
    
    return isRouteActive(location.pathname, href);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const userName = isDemoMode ? "Demo User" : (user?.google_user_data?.name || "User");
  const userEmail = isDemoMode ? "demo@mecca.app" : user?.email;
  const userPicture = isDemoMode ? undefined : user?.google_user_data?.picture;
  
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Only show dev banner to admins in admin areas
  const showDevBanner = isDemoMode && (effectiveRole === 'super_admin' || effectiveRole === 'pool_admin') && 
    (location.pathname.startsWith('/admin') || location.pathname.startsWith('/pool-admin'));
  const isHomePage = location.pathname === "/" || location.pathname === "/home";
  const showMarketplaceQuickJump = !location.pathname.startsWith("/pools");

  return (
    <div className="min-h-screen bg-background">
      {/* Onboarding Overlay for new users */}
      {showOnboarding && (
        <OnboardingOverlay 
          onComplete={() => {
            setShowOnboarding(false);
            firstSession.completeOnboarding();
          }} 
        />
      )}
      
      {/* Dev Mode Banner - Only in admin areas */}
      {showDevBanner && (
        <div className={cn(
          "text-white text-center py-1.5 text-xs font-medium flex items-center justify-center gap-3",
          devRole === "pool_admin" && "bg-amber-600",
          devRole === "super_admin" && "bg-purple-600"
        )}>
          <span>{devRole === "pool_admin" ? "🛡️" : "👑"}</span>
          <span>
            Dev: <span className="font-bold uppercase">{devRole === "pool_admin" ? "Pool Admin" : "Super Admin"}</span>
          </span>
          <Link 
            to="/login" 
            onClick={(e) => {
              e.preventDefault();
              localStorage.setItem("poolvault_demo_mode", "false");
              localStorage.removeItem("poolvault_dev_role");
              window.location.href = "/login";
            }}
            className="px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors font-semibold"
          >
            Switch
          </Link>
        </div>
      )}
      
      {/* Why GZ Modal */}
      {showWhyGZ && (
        <Suspense fallback={null}>
          <WhyGZModal open={showWhyGZ} onClose={() => setShowWhyGZ(false)} />
        </Suspense>
      )}
      
      {/* Feature Tour Overlay - disabled by default, can be triggered from Settings */}
      {/* {_shouldShowTour && hasCompletedOnboarding && !showOnboarding && (
        <OnboardingOverlay onComplete={_completeTour} />
      )} */}

      {/* Header - Same across all screen sizes */}
      <header className="sticky top-0 z-40 bg-gradient-to-b from-[hsl(220,20%,8%)] to-[hsl(220,20%,6%)] border-b border-white/5 shadow-lg shadow-black/20">
        <div className="w-full max-w-[1320px] mx-auto px-4 md:px-6 lg:px-10">
          <div className="flex h-[72px] md:h-[82px] items-center justify-between">
            {/* G1 Sports company logo - glow and contrast so it pops on dark header */}
            <div className="relative mr-2">
              <Link 
                to="/" 
                className="relative flex items-center gap-2 group pl-1 pr-1"
              >
                <span className="absolute -inset-5 bg-blue-400/40 rounded-3xl blur-2xl pointer-events-none group-hover:bg-blue-400/60 transition-colors" />
                <span className="relative flex items-center justify-center py-0.5">
                  <img 
                    src={BRAND_LOGO_SRC}
                    alt="G1 Sports" 
                    className="h-14 sm:h-16 md:h-[74px] w-auto max-w-[255px] sm:max-w-[315px] md:max-w-[370px] object-contain saturate-130 contrast-130 brightness-110 drop-shadow-[0_0_36px_rgba(59,130,246,0.78)] group-hover:scale-[1.015] group-hover:drop-shadow-[0_0_46px_rgba(59,130,246,0.95)] transition-all duration-200"
                    onError={(e) => {
                      e.currentTarget.src = BRAND_LOGO_FALLBACK;
                    }}
                  />
                </span>
              </Link>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <Link
                to="/pools#marketplace"
                className="relative hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-blue-400/30 transition-colors"
              >
                <Compass className="h-3.5 w-3.5 text-blue-300" />
                <span className="text-[11px] font-semibold text-white/75">Marketplace</span>
                {liveMarketplaceCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                    LIVE {liveMarketplaceCount > 9 ? "9+" : liveMarketplaceCount}
                  </span>
                )}
                {featuredMarketplaceCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-[10px] leading-4 font-bold text-white text-center shadow-[0_0_10px_rgba(16,185,129,0.55)]">
                    {featuredMarketplaceCount > 9 ? "9+" : featuredMarketplaceCount}
                  </span>
                )}
              </Link>
              <UnifiedNotificationCenter />
              
              {/* Active Pools Badge - glass pill */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-blue-400/20 shadow-[0_0_10px_rgba(59,130,246,0.08)]">
                <span className="text-[10px] font-medium text-white/50">Active Pools:</span>
                <span className="text-[10px] font-bold text-blue-400">3</span>
              </div>
              
              <ThemeToggle variant="compact" />

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="relative h-9 gap-2 pl-2 pr-2 sm:pr-3 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage 
                        src={userPicture || undefined} 
                        alt={userName} 
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
                  <div className="px-3 py-3 border-b">
                    <p className="text-sm font-medium">{userName}</p>
                    <p className="text-xs text-muted-foreground">{userEmail}</p>
                  </div>
                  
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/profile" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/performance" className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Performance
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem 
                    onClick={handleLogout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        
        {/* Authority Strip - System-level header with premium infrastructure feel */}
        {/* Hidden on /games page (tool page, not marketing page) */}
        {location.pathname !== '/games' && (
        <div className="relative w-full">
          {/* Subtle ambient glow behind strip - reduced 10-15% */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/[0.02] to-transparent blur-xl pointer-events-none" />
          
          {/* Main strip with glass effect - lightened 10-12% from page bg for authority, interactive hover */}
          <div className={cn(
            "relative w-full mx-auto",
            "bg-gradient-to-r from-[hsl(220,25%,17%)] via-[hsl(220,30%,19%)] to-[hsl(220,25%,17%)]",
            "backdrop-blur-md",
            "border-t border-b border-blue-400/[0.08]",
            "shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(96,165,250,0.05)]",
            "hover:bg-gradient-to-r hover:from-[hsl(220,28%,14%)] hover:via-[hsl(220,35%,18%)] hover:to-[hsl(220,28%,14%)]",
            "hover:border-blue-400/[0.15]",
            "transition-all duration-200 ease-out",
            "cursor-pointer"
          )}>
            {/* Left vertical blue accent line - refined, minimal glow */}
            <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-gradient-to-b from-blue-400/30 via-blue-500/50 to-blue-400/30 shadow-[0_0_4px_rgba(59,130,246,0.25)]" />
            {/* Inner glow line at top */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/20 to-transparent" />
            
            <div className="w-full max-w-[1320px] mx-auto px-4 md:px-6 lg:px-10">
              <div className="flex items-center justify-between h-9 md:h-10">
                {/* Left: Premium Shield Icon + Tagline */}
                <div className="flex items-center gap-2.5">
                  {/* Custom Premium Shield - Fintech Security Badge Style */}
                  <div className="relative">
                    <svg 
                      width="18" 
                      height="20" 
                      viewBox="0 0 18 20" 
                      fill="none" 
                      className="relative z-10"
                    >
                      {/* Shield glow filter */}
                      <defs>
                        <linearGradient id="shieldGradient" x1="9" y1="0" x2="9" y2="20" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="hsl(220, 30%, 18%)" />
                          <stop offset="50%" stopColor="hsl(220, 25%, 12%)" />
                          <stop offset="100%" stopColor="hsl(220, 30%, 8%)" />
                        </linearGradient>
                        <linearGradient id="shieldShine" x1="4" y1="2" x2="14" y2="8" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="rgba(148,163,184,0.25)" />
                          <stop offset="50%" stopColor="rgba(148,163,184,0.08)" />
                          <stop offset="100%" stopColor="rgba(148,163,184,0)" />
                        </linearGradient>
                        <filter id="shieldGlow" x="-2" y="-2" width="22" height="24">
                          <feGaussianBlur stdDeviation="1" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                      </defs>
                      
                      {/* Shield base shape */}
                      <path 
                        d="M9 1L2 4V9C2 13.5 5 17 9 19C13 17 16 13.5 16 9V4L9 1Z"
                        fill="url(#shieldGradient)"
                        stroke="hsl(210, 100%, 55%)"
                        strokeWidth="0.75"
                        strokeOpacity="0.4"
                        filter="url(#shieldGlow)"
                      />
                      
                      {/* Inner border glow */}
                      <path 
                        d="M9 2.5L3.5 4.8V9C3.5 12.8 6 15.8 9 17.5C12 15.8 14.5 12.8 14.5 9V4.8L9 2.5Z"
                        fill="none"
                        stroke="hsl(210, 80%, 60%)"
                        strokeWidth="0.5"
                        strokeOpacity="0.15"
                      />
                      
                      {/* Metallic shine highlight */}
                      <path 
                        d="M9 2L4 4.3V6.5C4 6.5 6 5.5 9 5.5C12 5.5 14 6.5 14 6.5V4.3L9 2Z"
                        fill="url(#shieldShine)"
                      />
                      
                      {/* Center checkmark/lock detail */}
                      <path 
                        d="M6.5 10L8.5 12L12 8"
                        fill="none"
                        stroke="hsl(210, 100%, 60%)"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity="0.7"
                      />
                    </svg>
                  </div>
                  
                  <span className="text-[11px] md:text-xs text-white/55 tracking-[0.14em] uppercase">
                    <span className="font-medium">The </span>
                    <span className="font-extrabold text-white/85">Official</span>
                    <span className="font-medium"> </span>
                    <span className="font-bold text-white/70">Office Pool</span>
                    <span className="font-medium"> Command Center</span>
                  </span>
                </div>
                
                {/* Right: Glass pill "Why GZ Wins Pools" button - premium styling */}
                <button
                  onClick={() => setShowWhyGZ(true)}
                  className={cn(
                    "relative px-4 py-1.5 rounded-full text-[10px] md:text-[11px] font-bold tracking-wide",
                    "bg-gradient-to-r from-white/[0.04] to-white/[0.02]",
                    "hover:from-white/[0.08] hover:to-white/[0.04]",
                    "border border-blue-400/25 hover:border-blue-400/50",
                    "text-white/60 hover:text-white/90",
                    "transition-all duration-300 ease-out",
                    "shadow-[0_0_0_1px_rgba(59,130,246,0.08),0_2px_12px_-2px_rgba(0,0,0,0.4)]",
                    "hover:shadow-[0_0_20px_-2px_rgba(59,130,246,0.25),0_4px_16px_-2px_rgba(0,0,0,0.4)]",
                    "hover:scale-[1.02]",
                    "backdrop-blur-sm",
                    "group/btn"
                  )}
                >
                  <span className="relative z-10">Why GZ Wins Pools</span>
                  {/* Subtle inner glow on hover */}
                  <span className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
                </button>
              </div>
            </div>
            
            {/* Bottom subtle glow line */}
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-400/10 to-transparent" />
          </div>
        </div>
        )}
        
        {/* Premium divider under authority strip - subtle blue glow */}
        {location.pathname !== '/games' && (
          <div className="w-full h-px bg-[#1E90FF]/[0.15] shadow-[0_0_8px_rgba(30,144,255,0.12)]" />
        )}
      </header>

      {/* Main Content - Centered with max-width, responsive padding */}
      <main 
        key={location.pathname}
        className={cn(
          "w-full max-w-[1180px] mx-auto",
          "px-4 md:px-6 lg:px-8",
          isHomePage ? "pt-2 pb-[100px]" : "py-6 pb-[100px]", // bottom nav (60px) + 40px clearance
          mounted && "animate-page-enter"
        )}
      >
        {!isHomePage
          && !location.pathname.startsWith('/create-league')
          && !location.pathname.startsWith('/admin')
          && !location.pathname.startsWith('/pool-admin')
          && !location.pathname.startsWith('/settings')
          && !location.pathname.startsWith('/join')
          && location.pathname !== '/games'
          && <CoachGIntelligenceLayer />}
        {children}
      </main>

      {/* Mobile quick jump to marketplace discovery */}
      {showMarketplaceQuickJump && (
        <Link
          to="/pools#marketplace"
          className={cn(
            "fixed md:hidden right-4 bottom-[72px] z-50 relative",
            "inline-flex items-center gap-1.5 px-3 py-2 rounded-full",
            "bg-gradient-to-r from-blue-500 to-indigo-500 text-white",
            "shadow-[0_8px_24px_rgba(59,130,246,0.35)] border border-white/20",
            "hover:brightness-110 transition-all"
          )}
        >
          <Compass className="h-4 w-4" />
          <span className="text-xs font-semibold tracking-wide">Marketplace</span>
          {liveMarketplaceCount > 0 && (
            <span className="absolute -top-1 left-0 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[10px] leading-5 font-bold text-white text-center shadow-[0_0_10px_rgba(239,68,68,0.6)]">
              {liveMarketplaceCount > 9 ? "9+" : liveMarketplaceCount}
            </span>
          )}
          {featuredMarketplaceCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-emerald-500 text-[10px] leading-5 font-bold text-white text-center shadow-[0_0_10px_rgba(16,185,129,0.6)]">
              {featuredMarketplaceCount > 9 ? "9+" : featuredMarketplaceCount}
            </span>
          )}
          {(featuredMarketplaceCount > 0 || liveMarketplaceCount > 0) && (
            <span
              className={cn(
                "absolute -top-1 -right-1 h-5 w-5 rounded-full animate-ping",
                liveMarketplaceCount > 0 ? "bg-red-400/50" : "bg-emerald-400/50"
              )}
            />
          )}
        </Link>
      )}

      {/* Fixed Bottom Navigation - ALWAYS at bottom on ALL screen sizes (no sidebar) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-[hsl(220,20%,5%)] to-[hsl(220,20%,7%)] border-t border-white/[0.04] safe-area-pb shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        {/* Centered container with max-width for desktop */}
        <div className="w-full max-w-[1000px] mx-auto px-2 lg:px-4">
          <div className="flex items-center justify-around h-[60px]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const isScout = item.name === "Coach G";
              const isBetBuilder = (item as any).isBetBuilder;
              
              // Special styling for Bet Builder button - centered, prominent
              if (isBetBuilder) {
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 py-1 px-2 sm:px-3 relative group",
                      "transition-all duration-200 ease-in-out",
                      "hover:-translate-y-1"
                    )}
                  >
                    {/* Glow aura behind button */}
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-14 h-14 bg-emerald-500/20 rounded-full blur-xl pointer-events-none group-hover:bg-emerald-400/30 transition-colors" />
                    
                    {/* Main button circle */}
                    <div className={cn(
                      "relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center",
                      "bg-gradient-to-br from-emerald-500 to-emerald-600",
                      "shadow-[0_4px_20px_rgba(16,185,129,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]",
                      "border border-emerald-400/50",
                      "group-hover:shadow-[0_6px_25px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]",
                      "group-hover:scale-105",
                      "transition-all duration-200"
                    )}>
                      {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white stroke-[2.5px]" />}
                    </div>
                    
                    <span className="text-[9px] sm:text-[10px] font-bold text-emerald-400 relative z-10">
                      Bet Builder
                    </span>
                  </Link>
                );
              }
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-1.5 px-3 sm:px-4 lg:px-5 xl:px-6 min-w-[56px] sm:min-w-[72px] lg:min-w-[80px] relative group",
                    "transition-all duration-200 ease-in-out",
                    active 
                      ? "text-primary" 
                      : "text-white/55 hover:text-white/75",
                    "hover:-translate-y-0.5"
                  )}
                >
                  {/* Active glow aura */}
                  {active && (
                    <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-10 h-10 bg-primary/10 rounded-full blur-lg pointer-events-none" />
                  )}
                  {/* Hover glow effect */}
                  <div className={cn(
                    "absolute inset-1.5 rounded-lg blur-sm transition-opacity duration-200",
                    active ? "bg-primary/8 opacity-100" : "bg-white/3 opacity-0 group-hover:opacity-100"
                  )} />
                  <div className={cn(
                    "relative flex items-center justify-center transition-all duration-200 ease-in-out",
                    active && "scale-105",
                    "group-hover:scale-[1.02]"
                  )}>
                    {isScout ? (
                      <div className={cn(
                        "rounded-full overflow-hidden border transition-all duration-200",
                        active 
                          ? "w-6 h-6 border-primary/50 shadow-[0_0_8px_rgba(59,130,246,0.4)]" 
                          : "w-5 h-5 border-white/20"
                      )}>
                        <img
                          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='100%25' height='100%25' rx='40' fill='%230f172a'/%3E%3Ccircle cx='40' cy='30' r='14' fill='%233b82f6'/%3E%3Cpath d='M14 68c4-14 16-22 26-22s22 8 26 22' fill='%233b82f6'/%3E%3C/svg%3E"
                          alt="Coach G"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to SVG icon if image fails
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerHTML = '<svg viewBox="0 0 24 24" class="w-full h-full p-0.5 text-white/50"><circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.6"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="currentColor" opacity="0.4"/></svg>';
                          }}
                        />
                      </div>
                    ) : Icon ? (
                      <Icon className={cn(
                        "transition-all duration-200",
                        active ? "h-5 w-5" : "h-4.5 w-4.5",
                        active 
                          ? "stroke-[2px] drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]" 
                          : "stroke-[1.5px] group-hover:stroke-[1.75px]"
                      )} />
                    ) : null}
                  </div>
                  <span className={cn(
                    "text-[9px] sm:text-[10px] relative z-10 transition-all duration-200",
                    active ? "font-bold text-primary" : "font-medium group-hover:font-semibold"
                  )}>
                    {item.name}
                  </span>
                  {/* Active indicator bar */}
                  {active && (
                    <div className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary shadow-[0_0_4px_rgba(59,130,246,0.5)] animate-nav-slide origin-center" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
