/**
 * routes.ts - Single source of truth for all app routes
 * All navigation links and route definitions should reference this file.
 */

export const ROUTES = {
  // Main navigation (bottom nav)
  HOME: '/',
  GAMES: '/games',
  POOLS: '/pools',
  FRIENDS: '/friends',
  COACH: '/coach',
  
  // Scores & Games
  SCORES: '/scores',
  GAME_DETAIL: (gameId: string) => `/scores/game/${gameId}`,
  SPORT_MATCH: (sport: string, matchId: string) => `/sports/${sport.toLowerCase()}/match/${matchId}`,
  LINES: '/lines',
  PROPS_RESEARCH: '/props-research',
  
  // Pools & Leagues
  POOL_HUB: (poolId: string | number) => `/pools/${poolId}`,
  CREATE_LEAGUE: '/create-league',
  JOIN_LEAGUE: '/join',
  SCORES_LIVE: '/scores?filter=live',
  LEAGUE_PICKS: (leagueId: string | number) => `/league/${leagueId}/picks`,
  LEAGUE_STANDINGS: (leagueId: string | number) => `/league/${leagueId}/standings`,
  LEAGUE_HISTORY: (leagueId: string | number) => `/league/${leagueId}/history`,
  LEAGUE_OVERVIEW: (leagueId: string | number) => `/league/${leagueId}`,
  LEAGUE_ADMIN: (leagueId: string | number) => `/league/${leagueId}/admin`,
  LEAGUE_PAYMENTS: (leagueId: string | number) => `/league/${leagueId}/payments`,
  LEAGUE_CHAT: (leagueId: string | number) => `/league/${leagueId}/chat`,
  
  // Picks
  MY_PICKS: '/picks',
  PICKS_TRACKER: '/tracker',
  PICKS_ANALYTICS: '/analytics/picks',
  
  // Elite Features
  COMMAND_CENTER: '/elite/command-center',
  CUSTOM_ALERT_BUILDER: '/elite/custom-alerts',
  HEAT_MAP: '/elite/heat-map',
  
  // Intelligence
  INTELLIGENCE: '/intelligence',
  GAME_INTELLIGENCE: (gameId: string) => `/intelligence/game/${gameId}`,
  
  // Alerts & Watchlist
  ALERTS: '/alerts',
  WATCHLIST: '/watchlist',
  
  // User
  PROFILE: '/profile',
  SETTINGS: '/settings',
  LEADERBOARD: '/leaderboard',
  RECEIPTS: '/receipts',
  RECEIPT_DETAIL: (receiptId: string) => `/receipts/${receiptId}`,
  
  // Public
  LOGIN: '/login',
  PRICING: '/pricing',
  PRIVACY: '/privacy',
  TERMS: '/terms',
  WHY_WE_CHARGE: '/why-we-charge',
  SHARE: (shareId: string) => `/share/${shareId}`,
  
  // Admin
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_POOLS: '/admin/pools',
  ADMIN_METRICS: '/admin/metrics',
  ADMIN_SPORTS_DATA: '/admin/sports-data',
  ADMIN_API_HEALTH: '/admin/api-health',
  ADMIN_FEATURE_FLAGS: '/admin/feature-flags',
  
  // Pool Admin
  POOL_ADMIN: '/pool-admin',
  POOL_ADMIN_MEMBERS: '/pool-admin/members',
  POOL_ADMIN_PAYMENTS: '/pool-admin/payments',
  
} as const;

// Navigation items for bottom nav bar
export interface NavItem {
  name: string;
  href: string;
  iconName: 'home' | 'games' | 'pools' | 'friends' | 'coach';
}

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { name: 'Home', href: ROUTES.HOME, iconName: 'home' },
  { name: 'Games & Odds', href: ROUTES.GAMES, iconName: 'games' },
  { name: 'Pools', href: ROUTES.POOLS, iconName: 'pools' },
  { name: 'Friends', href: ROUTES.FRIENDS, iconName: 'friends' },
  { name: 'Coach G', href: ROUTES.COACH, iconName: 'coach' },
];

// Helper to check if a path matches a route (for active state)
export function isRouteActive(currentPath: string, routePath: string): boolean {
  if (routePath === '/') {
    return currentPath === '/';
  }
  return currentPath.startsWith(routePath);
}
