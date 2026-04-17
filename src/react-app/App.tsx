import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { DemoAuthProvider, useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { SocialModeProvider } from "@/react-app/contexts/SocialModeContext";
import { AdminModeProvider } from "@/react-app/contexts/AdminModeContext";
import { ActiveLeagueProvider } from "@/react-app/contexts/ActiveLeagueContext";
import { DemoProvider } from "@/react-app/contexts/DemoContext";
import { SuperAdminProvider } from "@/react-app/contexts/SuperAdminContext";
import { ImpersonationProvider } from "@/react-app/contexts/ImpersonationContext";
import { LineMovementNotificationProvider } from "@/react-app/components/LineMovementNotificationProvider";
import { GlobalAIProvider } from "@/react-app/components/GlobalAIProvider";
import { AlertBannerProvider } from "@/react-app/components/AlertBanner";
import { ParlayBuilderProvider } from "@/react-app/context/ParlayBuilderContext";
import { DataHubProvider } from "@/react-app/hooks/useDataHub";
import { ParlaySlip, ParlayFloatingButton } from "@/react-app/components/ParlaySlip";
import { LazyRoute, lazyLoad } from "@/react-app/components/LazyRoute";
import { ErrorProvider, ErrorBoundary } from "@/react-app/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import SportsPlayerRouteRedirect from "@/react-app/components/SportsPlayerRouteRedirect";
import { Toaster } from "sonner";

// Eager load - needed immediately for app shell
import { Layout } from "@/react-app/components/Layout";
import { Login } from "@/react-app/pages/Login";
import { AuthCallback } from "@/react-app/pages/AuthCallback";
import { NotFound } from "@/react-app/pages/NotFound";
import { AdminLayout } from "@/react-app/components/admin/AdminLayout";
import { PoolAdminLayout } from "@/react-app/components/pool-admin/PoolAdminLayout";

// =====================================================
// LAZY LOADED PAGES - Code split into separate chunks
// =====================================================

// Dashboard & Core
const Dashboard = lazyLoad(() => import("@/react-app/pages/Dashboard"), "Dashboard");
const Settings = lazyLoad(() => import("@/react-app/pages/Settings"), "Settings");
const Profile = lazyLoad(() => import("@/react-app/pages/Profile"), "Profile");

// Scores & Games
const NHLScores = lazy(() => import("@/react-app/pages/NHLScores"));
const LinesCenter = lazyLoad(() => import("@/react-app/pages/LinesCenter"), "LinesCenter");
const PropsResearch = lazyLoad(() => import("@/react-app/pages/PropsResearch"), "PropsResearch");
const PlayerPropsPage = lazyLoad(() => import("@/react-app/pages/PlayerPropsPage"), "PlayerPropsPage");
const GamesPage = lazyLoad(() => import("@/react-app/pages/GamesPage"), "GamesPage");
const OddsPage = lazyLoad(() => import("@/react-app/pages/OddsPage"), "default");
const GameDetailPage = lazyLoad(() => import("@/react-app/pages/GameDetailPage"), "GameDetailPage");
const OddsGamePage = lazyLoad(() => import("@/react-app/pages/OddsGamePage"), "default");

// Pools & Leagues
const PoolsList = lazyLoad(() => import("@/react-app/pages/PoolsList"), "PoolsList");
const PoolHub = lazyLoad(() => import("@/react-app/pages/PoolHub"), "PoolHub");
const CreateLeague = lazyLoad(() => import("@/react-app/pages/CreateLeague"), "CreateLeague");
const JoinLeague = lazyLoad(() => import("@/react-app/pages/JoinLeague"), "JoinLeague");
const LeagueAdmin = lazyLoad(() => import("@/react-app/pages/LeagueAdmin"), "LeagueAdmin");
const LeaguePicks = lazyLoad(() => import("@/react-app/pages/LeaguePicks"), "LeaguePicks");
const LeagueStandings = lazyLoad(() => import("@/react-app/pages/LeagueStandings"), "LeagueStandings");
const LeagueHistory = lazyLoad(() => import("@/react-app/pages/LeagueHistory"), "LeagueHistory");
const LeagueOverview = lazyLoad(() => import("@/react-app/pages/LeagueOverview"), "LeagueOverview");
const LeaguePayments = lazyLoad(() => import("@/react-app/pages/LeaguePayments"), "LeaguePayments");
const LeagueChat = lazy(() => import("@/react-app/pages/LeagueChat"));

// Pool Types
const SquaresPicks = lazyLoad(() => import("@/react-app/pages/SquaresPicks"), "SquaresPicks");
const BracketPicks = lazyLoad(() => import("@/react-app/pages/BracketPicks"), "BracketPicks");
const SurvivorPicks = lazyLoad(() => import("@/react-app/pages/SurvivorPicks"), "SurvivorPicks");
const SurvivorLive = lazyLoad(() => import("@/react-app/pages/SurvivorLive"), "SurvivorLive");
const ATSPicks = lazyLoad(() => import("@/react-app/pages/ATSPicks"), "ATSPicks");
const PropsPicks = lazyLoad(() => import("@/react-app/pages/PropsPicks"), "PropsPicks");

// Picks & Analytics
const PicksTracker = lazyLoad(() => import("@/react-app/pages/PicksTracker"), "PicksTracker");
const PicksAnalytics = lazyLoad(() => import("@/react-app/pages/PicksAnalytics"), "PicksAnalytics");
const MyPicks = lazyLoad(() => import("@/react-app/pages/MyPicks"), "MyPicks");
const PerformanceTrackerPage = lazyLoad(() => import("@/react-app/pages/PerformanceTrackerPage"), "default");

// Elite Features
const CommandCenter = lazyLoad(() => import("@/react-app/pages/CommandCenter"), "CommandCenter");
const CustomAlertBuilder = lazyLoad(() => import("@/react-app/pages/CustomAlertBuilder"), "CustomAlertBuilder");
const HeatMap = lazyLoad(() => import("@/react-app/pages/HeatMap"), "HeatMap");

// Intelligence & Odds
const IntelligenceHome = lazyLoad(() => import("@/react-app/pages/IntelligenceHome"), "IntelligenceHome");
const IntelligenceDashboard = lazyLoad(() => import("@/react-app/pages/IntelligenceDashboard"), "default");
const GameIntelligence = lazyLoad(() => import("@/react-app/pages/GameIntelligence"), "GameIntelligence");
const OddsExplorer = lazy(() => import("@/react-app/pages/OddsExplorer"));
const LiveMode = lazy(() => import("@/react-app/pages/LiveMode").then(m => ({ default: m.LiveMode })));

// Alerts & Watchlist
const AlertCenter = lazyLoad(() => import("@/react-app/pages/AlertCenter"), "AlertCenter");
const Watchlist = lazyLoad(() => import("@/react-app/pages/Watchlist"), "Watchlist");
const WatchboardPage = lazyLoad(() => import("@/react-app/pages/WatchboardPage"), "WatchboardPage");
const MyFavoritesPage = lazyLoad(() => import("@/react-app/pages/MyFavoritesPage"), "default");

// Other Pages
const Leaderboard = lazyLoad(() => import("@/react-app/components/Leaderboard"), "Leaderboard");
const Receipts = lazyLoad(() => import("@/react-app/pages/Receipts"), "Receipts");
const ReceiptDetail = lazyLoad(() => import("@/react-app/pages/ReceiptDetail"), "ReceiptDetail");
const AuditTimeline = lazyLoad(() => import("@/react-app/pages/AuditTimeline"), "AuditTimeline");
const Analytics = lazyLoad(() => import("@/react-app/pages/Analytics"), "Analytics");
const GameDay = lazyLoad(() => import("@/react-app/pages/GameDay"), "GameDay");
const Events = lazy(() => import("@/react-app/pages/Events"));
const CommissionerDashboard = lazyLoad(() => import("@/react-app/pages/CommissionerDashboard"), "CommissionerDashboard");
const DemoControlCenter = lazyLoad(() => import("@/react-app/pages/DemoControlCenter"), "DemoControlCenter");
const ProviderConfig = lazyLoad(() => import("@/react-app/pages/ProviderConfig"), "ProviderConfig");


// Coach G AI
const CoachG = lazyLoad(() => import("@/react-app/pages/Scout"), "default");

// Bet Tickets
const BetUploadPage = lazyLoad(() => import("@/react-app/pages/BetUploadPage"), "default");
const BetReviewPage = lazyLoad(() => import("@/react-app/pages/BetReviewPage"), "default");
const BetManualEntryPage = lazyLoad(() => import("@/react-app/pages/BetManualEntryPage"), "default");
const BetReviewPicksPage = lazyLoad(() => import("@/react-app/pages/BetReviewPicksPage"), "default");

// Sport Hubs
const SportDirectoryPage = lazyLoad(() => import("@/react-app/pages/SportDirectoryPage"), "SportDirectoryPage");
const SportHubPage = lazyLoad(() => import("@/react-app/pages/SportHubPage"), "SportHubPage");
const SoccerDirectoryPage = lazyLoad(() => import("@/react-app/pages/SoccerDirectoryPage"), "default");
const SoccerNewsPage = lazyLoad(() => import("@/react-app/pages/SoccerNewsPage"), "default");
const SoccerTeamPage = lazyLoad(() => import("@/react-app/pages/SoccerTeamPage"), "default");
const SoccerLeagueHubPage = lazyLoad(() => import("@/react-app/pages/SoccerLeagueHubPage"), "default");
const SoccerPlayerPage = lazyLoad(() => import("@/react-app/pages/SoccerPlayerPage"), "default");
const TeamProfilePage = lazyLoad(() => import("@/react-app/pages/TeamProfilePage"), "default");
const FuturesPage = lazyLoad(() => import("@/react-app/pages/FuturesPage"), "default");
const GolfHubPage = lazyLoad(() => import("@/react-app/pages/GolfHubPage"), "default");
const NHLHubPage = lazyLoad(() => import("@/react-app/pages/NHLHubPage"), "default");
const NCAABHubPage = lazyLoad(() => import("@/react-app/pages/NCAABHubPage"), "default");
const TournamentCentralPage = lazyLoad(() => import("@/react-app/pages/ncaab/TournamentCentralPage"), "default");
const MarchMadnessPage = lazyLoad(() => import("@/react-app/pages/ncaab/MarchMadnessPage"), "default");
const MarchMadnessFullBracketPage = lazyLoad(() => import("@/react-app/pages/ncaab/MarchMadnessFullBracketPage"), "default");
const NITPage = lazyLoad(() => import("@/react-app/pages/ncaab/NITPage"), "default");
const NASCARHubPage = lazyLoad(() => import("@/react-app/pages/NASCARHubPage"), "default");
const MMAHubPage = lazyLoad(() => import("@/react-app/pages/MMAHubPage"), "default");
const MMAEventPage = lazyLoad(() => import("@/react-app/pages/MMAEventPage"), "default");
const MMAFightPage = lazyLoad(() => import("@/react-app/pages/MMAFightPage"), "default");
const MMAFighterPage = lazyLoad(() => import("@/react-app/pages/MMAFighterPage"), "default");
const NASCARDriverPage = lazyLoad(() => import("@/react-app/pages/NASCARDriverPage"), "default");
const NASCARRacePage = lazyLoad(() => import("@/react-app/pages/NASCARRacePage"), "default");
const PlayerProfilePage = lazyLoad(() => import("@/react-app/pages/PlayerProfilePage"), "default");

// Static Pages
const PrivacyPolicy = lazyLoad(() => import("@/react-app/pages/PrivacyPolicy"), "PrivacyPolicy");
const TermsOfService = lazyLoad(() => import("@/react-app/pages/TermsOfService"), "TermsOfService");
const WhyWeChargePage = lazy(() => import("@/react-app/pages/WhyWeChargePage"));
const PricingPage = lazy(() => import("@/react-app/pages/PricingPage"));
const SharePage = lazyLoad(() => import("@/react-app/pages/SharePage"), "SharePage");
const FriendsPicks = lazy(() => import("@/react-app/pages/FriendsPicks"));

// Super Admin Pages
const AdminOverview = lazyLoad(() => import("@/react-app/pages/admin/AdminOverview"), "AdminOverview");
const AdminUsers = lazyLoad(() => import("@/react-app/pages/admin/AdminUsers"), "AdminUsers");
const AdminPools = lazyLoad(() => import("@/react-app/pages/admin/AdminPools"), "AdminPools");
const AdminPoolTypes = lazyLoad(() => import("@/react-app/pages/admin/AdminPoolTypes"), "AdminPoolTypes");
const AdminAuditTimeline = lazyLoad(() => import("@/react-app/pages/admin/AdminAuditTimeline"), "AdminAuditTimeline");
const AdminLedger = lazyLoad(() => import("@/react-app/pages/admin/AdminLedger"), "AdminLedger");
const AdminNotifications = lazyLoad(() => import("@/react-app/pages/admin/AdminNotifications"), "AdminNotifications");
const AdminSettings = lazyLoad(() => import("@/react-app/pages/admin/AdminSettings"), "AdminSettings");
const AdminMarketing = lazyLoad(() => import("@/react-app/pages/admin/AdminMarketing"), "AdminMarketing");
const AdminAIInsights = lazyLoad(() => import("@/react-app/pages/admin/AdminAIInsights"), "AdminAIInsights");
const AdminScoutQA = lazyLoad(() => import("@/react-app/pages/admin/AdminScoutQA"), "AdminScoutQA");
const AdminMetrics = lazyLoad(() => import("@/react-app/pages/admin/AdminMetrics"), "AdminMetrics");
const AdminDeveloperTools = lazyLoad(() => import("@/react-app/pages/admin/AdminDeveloperTools"), "AdminDeveloperTools");
const AdminFeatureFlags = lazyLoad(() => import("@/react-app/pages/admin/AdminFeatureFlags"), "AdminFeatureFlags");
const AdminProviders = lazyLoad(() => import("@/react-app/pages/admin/AdminProviders"), "AdminProviders");
const AdminSportsData = lazyLoad(() => import("@/react-app/pages/admin/AdminSportsData"), "AdminSportsData");
const AdminApiHealth = lazyLoad(() => import("@/react-app/pages/admin/AdminApiHealth"), "AdminApiHealth");
const AdminIntelligence = lazyLoad(() => import("@/react-app/pages/admin/AdminIntelligence"), "default");
const AdminSystem = lazyLoad(() => import("@/react-app/pages/admin/AdminSystem"), "default");
const AdminVideoOps = lazyLoad(() => import("@/react-app/pages/admin/AdminVideoOps"), "default");


// Pool Admin Pages
const PoolAdminDashboard = lazyLoad(() => import("@/react-app/pages/pool-admin/PoolAdminDashboard"), "PoolAdminDashboard");
const PoolAdminMembers = lazyLoad(() => import("@/react-app/pages/pool-admin/PoolAdminMembers"), "PoolAdminMembers");
const PoolAdminApprovals = lazyLoad(() => import("@/react-app/pages/pool-admin/PoolAdminApprovals"), "PoolAdminApprovals");
const PoolAdminPools = lazyLoad(() => import("@/react-app/pages/pool-admin/PoolAdminPools"), "PoolAdminPools");
const PoolAdminPayments = lazy(() => import("@/react-app/pages/pool-admin/PoolAdminPayments"));
const PoolAdminNotifications = lazy(() => import("@/react-app/pages/pool-admin/PoolAdminNotifications"));
const PoolAdminActivity = lazyLoad(() => import("@/react-app/pages/pool-admin/PoolAdminActivity"), "PoolAdminActivity");
const PoolAdminSettings = lazyLoad(() => import("@/react-app/pages/pool-admin/PoolAdminSettings"), "PoolAdminSettings");
const PoolAdminPayouts = lazy(() => import("@/react-app/pages/pool-admin/PoolAdminPayouts"));
const PoolAdminRuleConfig = lazy(() => import("@/react-app/pages/pool-admin/PoolAdminRuleConfig"));
const PoolAdminRecalculation = lazy(() => import("@/react-app/pages/pool-admin/PoolAdminRecalculation"));
const PoolAdminBundles = lazy(() => import("@/react-app/pages/pool-admin/PoolAdminBundles"));
const PoolAdminCalcutta = lazy(() => import("@/react-app/pages/pool-admin/PoolAdminCalcutta"));

// =====================================================
// ROUTE COMPONENTS
// =====================================================

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useDemoAuth();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Admin layout fallback
function AdminLayoutFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function LegacyPlayerRouteRedirect() {
  const { sport, playerId } = useParams<{ sport: string; playerId: string }>();
  const sportKey = String(sport || "").trim();
  const id = String(playerId || "").trim();
  if (!sportKey || !id) {
    return <Navigate to="/props" replace />;
  }
  return (
    <Layout>
      <LazyRoute skeleton="scores"><PlayerProfilePage /></LazyRoute>
    </Layout>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes - no lazy loading for fast initial render */}
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      
      {/* Public pages with lazy loading */}
      <Route path="/privacy" element={
        <LazyRoute><PrivacyPolicy /></LazyRoute>
      } />
      <Route path="/share/:shareId" element={
        <LazyRoute><SharePage /></LazyRoute>
      } />
      <Route path="/terms" element={
        <LazyRoute><TermsOfService /></LazyRoute>
      } />
      <Route path="/why-we-charge" element={
        <LazyRoute><WhyWeChargePage /></LazyRoute>
      } />
      <Route path="/pricing" element={
        <LazyRoute skeleton="settings"><PricingPage /></LazyRoute>
      } />
      
      {/* Super Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Suspense fallback={<AdminLayoutFallback />}>
              <AdminLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route index element={<LazyRoute skeleton="admin"><AdminOverview /></LazyRoute>} />
        <Route path="users" element={<LazyRoute skeleton="table"><AdminUsers /></LazyRoute>} />
        <Route path="pools" element={<LazyRoute skeleton="table"><AdminPools /></LazyRoute>} />
        <Route path="pool-types" element={<LazyRoute skeleton="table"><AdminPoolTypes /></LazyRoute>} />
        <Route path="ledger" element={<LazyRoute skeleton="table"><AdminLedger /></LazyRoute>} />
        <Route path="notifications" element={<LazyRoute skeleton="admin"><AdminNotifications /></LazyRoute>} />
        <Route path="audit" element={<LazyRoute skeleton="table"><AdminAuditTimeline /></LazyRoute>} />
        <Route path="ai-insights" element={<LazyRoute skeleton="admin"><AdminAIInsights /></LazyRoute>} />
        <Route path="coach-qa" element={<LazyRoute skeleton="admin"><AdminScoutQA /></LazyRoute>} />
        <Route path="metrics" element={<LazyRoute skeleton="admin"><AdminMetrics /></LazyRoute>} />
        <Route path="marketing" element={<LazyRoute skeleton="admin"><AdminMarketing /></LazyRoute>} />
        <Route path="developer-tools" element={<LazyRoute skeleton="admin"><AdminDeveloperTools /></LazyRoute>} />
        <Route path="feature-flags" element={<LazyRoute skeleton="admin"><AdminFeatureFlags /></LazyRoute>} />
        <Route path="providers" element={<LazyRoute skeleton="admin"><AdminProviders /></LazyRoute>} />
        <Route path="sports-data" element={<LazyRoute skeleton="admin"><AdminSportsData /></LazyRoute>} />
        <Route path="api-health" element={<LazyRoute skeleton="admin"><AdminApiHealth /></LazyRoute>} />
        <Route path="intelligence" element={<LazyRoute skeleton="admin"><AdminIntelligence /></LazyRoute>} />
        <Route path="video-ops" element={<LazyRoute skeleton="admin"><AdminVideoOps /></LazyRoute>} />
        <Route path="system" element={<LazyRoute skeleton="admin"><AdminSystem /></LazyRoute>} />

        <Route path="settings" element={<LazyRoute skeleton="settings"><AdminSettings /></LazyRoute>} />
      </Route>
      
      {/* Pool Admin routes */}
      <Route
        path="/pool-admin"
        element={
          <ProtectedRoute>
            <Suspense fallback={<AdminLayoutFallback />}>
              <PoolAdminLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route index element={<LazyRoute skeleton="admin"><PoolAdminDashboard /></LazyRoute>} />
        <Route path="pools" element={<LazyRoute skeleton="pools"><PoolAdminPools /></LazyRoute>} />
        <Route path="members" element={<LazyRoute skeleton="table"><PoolAdminMembers /></LazyRoute>} />
        <Route path="approvals" element={<LazyRoute skeleton="table"><PoolAdminApprovals /></LazyRoute>} />
        <Route path="payments" element={<LazyRoute skeleton="table"><PoolAdminPayments /></LazyRoute>} />
        <Route path="notifications" element={<LazyRoute skeleton="admin"><PoolAdminNotifications /></LazyRoute>} />
        <Route path="activity" element={<LazyRoute skeleton="table"><PoolAdminActivity /></LazyRoute>} />
        <Route path="payouts" element={<LazyRoute skeleton="table"><PoolAdminPayouts /></LazyRoute>} />
        <Route path="rule-config" element={<LazyRoute skeleton="settings"><PoolAdminRuleConfig /></LazyRoute>} />
        <Route path="recalculation" element={<LazyRoute skeleton="table"><PoolAdminRecalculation /></LazyRoute>} />
        <Route path="bundles" element={<LazyRoute skeleton="table"><PoolAdminBundles /></LazyRoute>} />
        <Route path="calcutta" element={<LazyRoute skeleton="table"><PoolAdminCalcutta /></LazyRoute>} />
        <Route path="settings" element={<LazyRoute skeleton="settings"><PoolAdminSettings /></LazyRoute>} />
      </Route>
      
      {/* Protected routes with Layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><Dashboard /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores"
        element={<Navigate to="/games" replace />}
      />
      <Route
        path="/sports"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="scores"><SportDirectoryPage /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sports/soccer"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><SoccerDirectoryPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/soccer/news"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><SoccerNewsPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/soccer/match/:matchId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><GameDetailPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/soccer/team/:teamId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><SoccerTeamPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/soccer/league/:leagueId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><SoccerLeagueHubPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/soccer/player/:playerId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><SoccerPlayerPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/golf"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><GolfHubPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/nhl"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><NHLHubPage /></LazyRoute>
          </Layout>
        }
      />
      <Route path="/sports/college-basketball" element={<Navigate to="/sports/ncaab" replace />} />
      <Route path="/sports/collegebasketball" element={<Navigate to="/sports/ncaab" replace />} />
      <Route path="/sports/ncaam" element={<Navigate to="/sports/ncaab" replace />} />
      <Route path="/sports/cbb" element={<Navigate to="/sports/ncaab" replace />} />
      <Route
        path="/sports/ncaab"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><NCAABHubPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/ncaab/tournament"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><TournamentCentralPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/ncaab/tournament/march-madness"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><MarchMadnessPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/ncaab/tournament/march-madness/full"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><MarchMadnessFullBracketPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/ncaab/tournament/nit"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><NITPage /></LazyRoute>
          </Layout>
        }
      />
      <Route path="/ncaab/tournament" element={<Navigate to="/sports/ncaab/tournament" replace />} />
      <Route path="/ncaab/tournament/march-madness" element={<Navigate to="/sports/ncaab/tournament/march-madness" replace />} />
      <Route path="/ncaab/tournament/march-madness/full" element={<Navigate to="/sports/ncaab/tournament/march-madness/full" replace />} />
      <Route path="/ncaab/tournament/nit" element={<Navigate to="/sports/ncaab/tournament/nit" replace />} />
      <Route
        path="/sports/nascar"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><NASCARHubPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/nascar/driver/:driverId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><NASCARDriverPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/nascar/race/:raceId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><NASCARRacePage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/mma"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><MMAHubPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/mma/event/:eventId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><MMAEventPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/mma/fight/:fightId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><MMAFightPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/mma/fighter/:fighterId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><MMAFighterPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/:sportKey"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="scores"><SportHubPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/:sportKey/match/:matchId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><GameDetailPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/sports/:sportKey/odds/:matchId"
        element={
          <Layout hideFooter>
            <LazyRoute skeleton="detail"><OddsGamePage /></LazyRoute>
          </Layout>
        }
      />

      <Route
        path="/sports/:sportKey/player/:playerId"
        element={
          <ProtectedRoute>
            <SportsPlayerRouteRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sports/:sportKey/team/:teamId"
        element={
          <Layout>
            <LazyRoute skeleton="detail"><TeamProfilePage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/games"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="scores"><GamesPage /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/odds"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="scores"><OddsPage /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/:league/:gameId"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="detail"><GameDetailPage /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute><CoachG /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/lines"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="scores"><LinesCenter /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/lines/:gameId/props"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="detail"><PropsResearch /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/props"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="scores"><PlayerPropsPage /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/props/player/:sport/:playerId"
        element={
          <ProtectedRoute>
            <LegacyPlayerRouteRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bet/new"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute><BetManualEntryPage /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bet/upload"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute><BetUploadPage /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bet/:ticketId/review"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute><BetReviewPage /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bet/review"
        element={
          <Layout>
            <LazyRoute><BetReviewPicksPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/performance"
        element={
          <Layout>
            <LazyRoute><PerformanceTrackerPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/futures"
        element={
          <Layout>
            <LazyRoute><FuturesPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/scores/game/:id"
        element={<Navigate to="/games" replace />}
      />
      <Route
        path="/nhl"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="scores"><NHLScores /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="table"><Leaderboard /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/create-league"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="form"><CreateLeague /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/join"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="form"><JoinLeague /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="table"><AuditTimeline /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><Analytics /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="settings"><Settings /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="settings"><Profile /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/admin"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="admin"><LeagueAdmin /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/picks"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><LeaguePicks /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/squares"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><SquaresPicks /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/bracket"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><BracketPicks /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/survivor"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><SurvivorPicks /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/ats"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><ATSPicks /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/props"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><PropsPicks /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/standings"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="table"><LeagueStandings /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/history"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="table"><LeagueHistory /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/gameday"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="dashboard"><GameDay /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/overview"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="detail"><LeagueOverview /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/payments"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="table"><LeaguePayments /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/live"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="dashboard"><SurvivorLive /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leagues/:id/chat"
        element={
          <ProtectedRoute>
            <LazyRoute><LeagueChat /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/events"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="table"><Events /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/commissioner"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="admin"><CommissionerDashboard /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/demo"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="admin"><DemoControlCenter /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/providers"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="settings"><ProviderConfig /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/intelligence"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><IntelligenceDashboard /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/intel"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><IntelligenceHome /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/intel/game/:id"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="detail"><GameIntelligence /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/live"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="command-center"><LiveMode /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pools"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="pools"><PoolsList /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pools/:id"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="detail"><PoolHub /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pool/:id"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="detail"><PoolHub /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/odds/:gameId"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="detail"><OddsExplorer /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/picks"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><PicksTracker /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/friends"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><FriendsPicks /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/picks/history"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="table"><MyPicks /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/picks/analytics"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="dashboard"><PicksAnalytics /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/watchlist"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><Watchlist /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/favorites"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="dashboard"><MyFavoritesPage /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/watchboard"
        element={
          <Layout>
            <LazyRoute skeleton="dashboard"><WatchboardPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/watchboard/:id"
        element={
          <Layout>
            <LazyRoute skeleton="dashboard"><WatchboardPage /></LazyRoute>
          </Layout>
        }
      />
      <Route
        path="/alerts"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="dashboard"><AlertCenter /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/game/:id"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="detail"><GameIntelligence /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pool-admin/pools/:leagueId/members"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="table"><PoolAdminMembers /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/receipts/:code"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="detail"><ReceiptDetail /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/receipts"
        element={
          <ProtectedRoute>
            <Layout>
              <LazyRoute skeleton="table"><Receipts /></LazyRoute>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/me/receipts" element={<Navigate to="/receipts" replace />} />
      <Route
        path="/scores/game/:id/live"
        element={<Navigate to="/games" replace />}
      />

      <Route
        path="/elite/heat-map"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="dashboard"><HeatMap /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/elite/command-center"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="command-center"><CommandCenter /></LazyRoute>
          </ProtectedRoute>
        }
      />
      <Route path="/command-center" element={<Navigate to="/elite/command-center" replace />} />
      <Route
        path="/elite/alerts/builder"
        element={
          <ProtectedRoute>
            <LazyRoute skeleton="form"><CustomAlertBuilder /></LazyRoute>
          </ProtectedRoute>
        }
      />
      
      {/* 404 Catch-all route - must be last */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <DemoAuthProvider>
            <SuperAdminProvider>
              <ImpersonationProvider>
                <DemoProvider>
                  <ActiveLeagueProvider>
                    <AdminModeProvider>
                      <SocialModeProvider>
                        <LineMovementNotificationProvider>
                          <GlobalAIProvider>
                            <AlertBannerProvider>
                              <DataHubProvider>
                                <ParlayBuilderProvider>
                                  <AppRoutes />
                                  <ParlaySlip />
                                  <ParlayFloatingButton />
                                  <Toaster position="top-center" richColors closeButton />
                                </ParlayBuilderProvider>
                              </DataHubProvider>
                            </AlertBannerProvider>
                          </GlobalAIProvider>
                        </LineMovementNotificationProvider>
                      </SocialModeProvider>
                    </AdminModeProvider>
                  </ActiveLeagueProvider>
                </DemoProvider>
              </ImpersonationProvider>
            </SuperAdminProvider>
          </DemoAuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </ErrorProvider>
  );
}

export default App;
