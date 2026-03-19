// =====================================================
// DEMO UNIVERSE DATA - DO NOT DELETE
// This file powers the Demo Mode testing system.
// When adding new pool types, add demo leagues here.
// =====================================================

export interface DemoLeague {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  invite_code: string;
  entry_fee_cents: number;
  is_payment_required: number;
  member_count: number;
  role: string;
  created_at: string;
  // Demo-specific fields
  state: LeagueState;
  description?: string;
}

export type LeagueState = "preview" | "open" | "submitted" | "locked" | "live" | "final";

export type PoolType = 
  | "pickem" 
  | "ats" 
  | "confidence" 
  | "survivor" 
  | "survivor_reentry" 
  | "bracket" 
  | "squares" 
  | "props";

// Pool type metadata for display
export const POOL_TYPE_INFO: Record<PoolType, { name: string; description: string }> = {
  pickem: { name: "Pick'em", description: "Pick winners straight up" },
  ats: { name: "ATS", description: "Pick winners against the spread" },
  confidence: { name: "Confidence", description: "Assign point values to picks" },
  survivor: { name: "Survivor", description: "Pick one team per week, can't repeat" },
  survivor_reentry: { name: "Survivor (Re-entry)", description: "Survivor with 2 lives" },
  bracket: { name: "Bracket", description: "Tournament bracket predictions" },
  squares: { name: "Squares", description: "10x10 grid based on score digits" },
  props: { name: "Props", description: "Prop bet selections" },
};

// State metadata for display
export const STATE_INFO: Record<LeagueState, { name: string; description: string; color: string }> = {
  preview: { name: "Preview", description: "League created, week not opened", color: "gray" },
  open: { name: "Open", description: "Picks open, accepting submissions", color: "green" },
  submitted: { name: "Submitted", description: "You've submitted, can still edit", color: "blue" },
  locked: { name: "Locked", description: "Picks locked, awaiting results", color: "amber" },
  live: { name: "Live", description: "Games in progress", color: "red" },
  final: { name: "Final", description: "Week complete, results finalized", color: "purple" },
};

// Sports to distribute across leagues
const SPORTS = ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "golf"];

// Pool types we support
const POOL_TYPES: PoolType[] = ["pickem", "ats", "confidence", "survivor", "survivor_reentry", "bracket", "squares", "props"];

// All states
const STATES: LeagueState[] = ["preview", "open", "submitted", "locked", "live", "final"];

// Generate unique invite codes
function generateInviteCode(index: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "DM";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt((index * 7 + i * 13) % chars.length);
  }
  return code;
}

// Generate league names
function getLeagueName(poolType: PoolType, state: LeagueState, sport: string): string {
  const poolNames: Record<PoolType, string[]> = {
    pickem: ["Winners Circle", "The Straight Shot", "Pick Masters", "Victory Lane", "Champion Picks", "Elite Selections"],
    ats: ["Spread Kings", "Cover Club", "Line Crushers", "Point Spread Pros", "ATS Aces", "Spread Masters"],
    confidence: ["Confidence Kings", "Point Stakers", "Ranked Picks", "Conviction Pool", "Confidence Crew", "Sure Shots"],
    survivor: ["Last One Standing", "Survivor Elite", "Elimination Nation", "The Gauntlet", "Final Stand", "Survive & Advance"],
    survivor_reentry: ["Second Chance", "Phoenix Pool", "Two Lives", "Resurrection", "Comeback Kings", "Extra Life"],
    bracket: ["March Glory", "Bracket Busters", "Tournament Trail", "Championship Chase", "Bracket Masters", "Big Dance"],
    squares: ["Grid Iron", "Number Crunch", "Square Deal", "Lucky Squares", "Digit Derby", "Box Score"],
    props: ["Prop Stars", "Side Bets", "Prop Masters", "Action Alley", "Bonus Bets", "Prop Shop"],
  };

  const sportEmoji: Record<string, string> = {
    nfl: "🏈",
    nba: "🏀",
    mlb: "⚾",
    nhl: "🏒",
    ncaaf: "🏈",
    ncaab: "🏀",
    soccer: "⚽",
    golf: "⛳",
  };

  const names = poolNames[poolType];
  const nameIndex = STATES.indexOf(state) % names.length;
  const emoji = sportEmoji[sport] || "🏆";
  
  return `${names[nameIndex]} ${emoji}`;
}

// Generate all demo leagues: POOL_TYPES × STATES = 48 leagues minimum
// Plus extra survivor leagues for drama scenarios
function generateDemoLeagues(): DemoLeague[] {
  const leagues: DemoLeague[] = [];
  let id = 1;

  // Generate one league for each pool type × state combination
  for (const poolType of POOL_TYPES) {
    for (const state of STATES) {
      // Rotate through sports
      const sportIndex = (id - 1) % SPORTS.length;
      const sport = SPORTS[sportIndex];
      
      // Vary member counts based on state and type
      let memberCount = 12 + Math.floor(Math.random() * 20);
      if (poolType === "survivor" && state === "live") {
        memberCount = 100 + Math.floor(Math.random() * 50); // Large survivor pool
      } else if (poolType === "squares") {
        memberCount = 100; // Squares always has 100 squares
      } else if (poolType === "bracket") {
        memberCount = 32 + Math.floor(Math.random() * 32);
      }

      // Vary entry fees
      const entryFees = [0, 500, 1000, 2000, 2500, 5000, 10000];
      const feeIndex = id % entryFees.length;
      const entryFee = entryFees[feeIndex];

      // Vary roles
      const roles = ["owner", "admin", "member", "member", "member"];
      const roleIndex = id % roles.length;

      leagues.push({
        id,
        name: getLeagueName(poolType, state, sport),
        sport_key: sport,
        format_key: poolType,
        season: "2024-2025",
        invite_code: generateInviteCode(id),
        entry_fee_cents: entryFee,
        is_payment_required: entryFee > 0 ? 1 : 0,
        member_count: memberCount,
        role: roles[roleIndex],
        created_at: new Date(Date.now() - (id * 86400000)).toISOString(),
        state,
        description: `${POOL_TYPE_INFO[poolType].name} pool in ${STATE_INFO[state].name} state`,
      });

      id++;
    }
  }

  // Add extra survivor leagues for drama scenarios
  const survivorDramaLeagues: Partial<DemoLeague>[] = [
    {
      name: "Survivor Showdown - Mass Elimination 💀",
      sport_key: "nfl",
      format_key: "survivor",
      member_count: 128,
      state: "live" as LeagueState,
      description: "Large pool with multiple eliminations happening now",
    },
    {
      name: "Final Four Standing 🏆",
      sport_key: "nfl",
      format_key: "survivor",
      member_count: 4,
      state: "live" as LeagueState,
      description: "Down to the final 4 players",
    },
    {
      name: "Survivor Championship 👑",
      sport_key: "nfl",
      format_key: "survivor",
      member_count: 2,
      state: "live" as LeagueState,
      description: "Head-to-head finals",
    },
    {
      name: "Office Eliminator 🏢",
      sport_key: "nba",
      format_key: "survivor",
      member_count: 75,
      state: "live" as LeagueState,
      description: "Office pool with sweating scenarios",
    },
  ];

  for (const drama of survivorDramaLeagues) {
    leagues.push({
      id,
      name: drama.name!,
      sport_key: drama.sport_key!,
      format_key: drama.format_key!,
      season: "2024-2025",
      invite_code: generateInviteCode(id),
      entry_fee_cents: 2500,
      is_payment_required: 1,
      member_count: drama.member_count!,
      role: "member",
      created_at: new Date(Date.now() - (id * 86400000)).toISOString(),
      state: drama.state!,
      description: drama.description,
    });
    id++;
  }

  // Add featured leagues with premium names
  const featuredLeagues: Partial<DemoLeague>[] = [
    {
      name: "Sunday Showdown 🏈",
      sport_key: "nfl",
      format_key: "pickem",
      state: "open" as LeagueState,
      role: "owner",
      member_count: 24,
      entry_fee_cents: 2500,
    },
    {
      name: "Office Champions League 🏆",
      sport_key: "nfl",
      format_key: "confidence",
      state: "submitted" as LeagueState,
      role: "admin",
      member_count: 18,
      entry_fee_cents: 5000,
    },
    {
      name: "March Madness Bracket Bash 🏀",
      sport_key: "ncaab",
      format_key: "bracket",
      state: "locked" as LeagueState,
      role: "member",
      member_count: 64,
      entry_fee_cents: 1000,
    },
    {
      name: "Super Bowl Squares LVIII 🟩",
      sport_key: "nfl",
      format_key: "squares",
      state: "open" as LeagueState,
      role: "owner",
      member_count: 78,
      entry_fee_cents: 500,
    },
    {
      name: "NBA Nightly Action 🔥",
      sport_key: "nba",
      format_key: "ats",
      state: "live" as LeagueState,
      role: "member",
      member_count: 32,
      entry_fee_cents: 2000,
    },
    {
      name: "Props Madness 🎯",
      sport_key: "nfl",
      format_key: "props",
      state: "open" as LeagueState,
      role: "member",
      member_count: 20,
      entry_fee_cents: 1000,
    },
  ];

  for (const featured of featuredLeagues) {
    leagues.push({
      id,
      name: featured.name!,
      sport_key: featured.sport_key!,
      format_key: featured.format_key!,
      season: "2024-2025",
      invite_code: generateInviteCode(id),
      entry_fee_cents: featured.entry_fee_cents!,
      is_payment_required: featured.entry_fee_cents! > 0 ? 1 : 0,
      member_count: featured.member_count!,
      role: featured.role!,
      created_at: new Date().toISOString(),
      state: featured.state!,
    });
    id++;
  }

  return leagues;
}

// Export the generated demo leagues
export const DEMO_LEAGUES = generateDemoLeagues();

// Group leagues by state for easy filtering
export function getLeaguesByState(state: LeagueState): DemoLeague[] {
  return DEMO_LEAGUES.filter(l => l.state === state);
}

// Group leagues by pool type
export function getLeaguesByPoolType(poolType: PoolType): DemoLeague[] {
  return DEMO_LEAGUES.filter(l => l.format_key === poolType);
}

// Get leagues that need action (open, not submitted by current user)
export function getLeaguesNeedingAction(): DemoLeague[] {
  return DEMO_LEAGUES.filter(l => l.state === "open");
}

// Get active leagues (live or locked)
export function getActiveLeagues(): DemoLeague[] {
  return DEMO_LEAGUES.filter(l => l.state === "live" || l.state === "locked");
}

// Get completed leagues
export function getCompletedLeagues(): DemoLeague[] {
  return DEMO_LEAGUES.filter(l => l.state === "final");
}

// Get survivor drama leagues (large, live survivor pools)
export function getSurvivorDramaLeagues(): DemoLeague[] {
  return DEMO_LEAGUES.filter(l => l.format_key === "survivor" && l.state === "live");
}

// Demo activity items
export const DEMO_ACTIVITY_ITEMS = [
  { id: 1, type: "picks_submitted", message: "Alex submitted Week 14 picks" },
  { id: 2, type: "member_joined", message: "Jamie joined Sunday Showdown" },
  { id: 3, type: "payment_verified", message: "Payment verified for Office Champions" },
  { id: 4, type: "picks_submitted", message: "Morgan locked in their survivor pick" },
  { id: 5, type: "member_eliminated", message: "Taylor was eliminated from Survivor Elite" },
  { id: 6, type: "picks_submitted", message: "Jordan submitted confidence rankings" },
  { id: 7, type: "league_created", message: "Props Madness was created" },
  { id: 8, type: "payment_verified", message: "Casey paid entry for March Madness" },
];

// Demo members for league population
export interface DemoMember {
  id: number;
  name: string;
  avatar_initials: string;
  performance_tier: "top" | "mid" | "bottom";
  is_eliminated?: boolean;
  is_sweating?: boolean;
  current_pick?: string;
  picks_made?: number;
  total_points?: number;
  rank?: number;
  rank_delta?: number;
}

export const DEMO_MEMBERS: DemoMember[] = [
  { id: 1, name: "Alex Johnson", avatar_initials: "AJ", performance_tier: "top", rank: 1, rank_delta: 2, total_points: 142 },
  { id: 2, name: "Jordan Smith", avatar_initials: "JS", performance_tier: "top", rank: 2, rank_delta: -1, total_points: 138 },
  { id: 3, name: "Casey Williams", avatar_initials: "CW", performance_tier: "top", rank: 3, rank_delta: 1, total_points: 135 },
  { id: 4, name: "Morgan Brown", avatar_initials: "MB", performance_tier: "mid", rank: 4, rank_delta: 0, total_points: 128 },
  { id: 5, name: "Taylor Davis", avatar_initials: "TD", performance_tier: "mid", rank: 5, rank_delta: -2, total_points: 125 },
  { id: 6, name: "Riley Wilson", avatar_initials: "RW", performance_tier: "mid", rank: 6, rank_delta: 3, total_points: 122 },
  { id: 7, name: "Quinn Anderson", avatar_initials: "QA", performance_tier: "mid", rank: 7, rank_delta: 0, total_points: 118 },
  { id: 8, name: "Avery Thomas", avatar_initials: "AT", performance_tier: "mid", rank: 8, rank_delta: -1, total_points: 115 },
  { id: 9, name: "Peyton Jackson", avatar_initials: "PJ", performance_tier: "mid", rank: 9, rank_delta: 2, total_points: 112 },
  { id: 10, name: "Cameron White", avatar_initials: "CW", performance_tier: "bottom", rank: 10, rank_delta: -3, total_points: 108 },
  { id: 11, name: "Jamie Martin", avatar_initials: "JM", performance_tier: "bottom", rank: 11, rank_delta: 1, total_points: 105 },
  { id: 12, name: "Drew Garcia", avatar_initials: "DG", performance_tier: "bottom", rank: 12, rank_delta: -2, total_points: 98 },
  // Survivor-specific members
  { id: 13, name: "Pat Martinez", avatar_initials: "PM", performance_tier: "mid", is_eliminated: false, is_sweating: true, current_pick: "Chiefs" },
  { id: 14, name: "Sam Robinson", avatar_initials: "SR", performance_tier: "mid", is_eliminated: false, is_sweating: false, current_pick: "Ravens" },
  { id: 15, name: "Chris Clark", avatar_initials: "CC", performance_tier: "bottom", is_eliminated: true, current_pick: "Bengals" },
  { id: 16, name: "Blake Lewis", avatar_initials: "BL", performance_tier: "mid", is_eliminated: false, is_sweating: true, current_pick: "Bills" },
  { id: 17, name: "Bailey Lee", avatar_initials: "BL", performance_tier: "top", is_eliminated: false, is_sweating: false, current_pick: "49ers" },
  { id: 18, name: "Skyler Walker", avatar_initials: "SW", performance_tier: "bottom", is_eliminated: true, current_pick: "Cowboys" },
  { id: 19, name: "Reese Hall", avatar_initials: "RH", performance_tier: "mid", is_eliminated: false, is_sweating: true, current_pick: "Eagles" },
  { id: 20, name: "Finley Allen", avatar_initials: "FA", performance_tier: "mid", is_eliminated: false, is_sweating: false, current_pick: "Dolphins" },
];

// Demo receipts
export interface DemoReceipt {
  id: number;
  receipt_code: string;
  league_id: number;
  league_name: string;
  period_id: string;
  submitted_at: string;
  payload_hash: string;
  pick_count: number;
  status: "submitted" | "replaced";
  deliveries: Array<{
    channel: "email" | "sms";
    status: "sent" | "delivered" | "failed";
    sent_at: string;
  }>;
}

export const DEMO_RECEIPTS: DemoReceipt[] = [
  {
    id: 1,
    receipt_code: "PV-M4K7X-8JN2",
    league_id: 1,
    league_name: "Sunday Showdown",
    period_id: "Week 14",
    submitted_at: new Date(Date.now() - 3600000).toISOString(),
    payload_hash: "8a4d7e3b9c1f2a5d6e8b0c3f7a9d2e4b6c8f0a1d3e5b7c9f2a4d6e8b0c3f5a7d",
    pick_count: 14,
    status: "submitted",
    deliveries: [
      { channel: "email", status: "delivered", sent_at: new Date(Date.now() - 3500000).toISOString() },
    ],
  },
  {
    id: 2,
    receipt_code: "PV-N5L8Y-9KP3",
    league_id: 2,
    league_name: "Office Champions",
    period_id: "Week 14",
    submitted_at: new Date(Date.now() - 7200000).toISOString(),
    payload_hash: "7b5c8d4e2f1a3b6c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    pick_count: 16,
    status: "replaced",
    deliveries: [
      { channel: "email", status: "delivered", sent_at: new Date(Date.now() - 7100000).toISOString() },
    ],
  },
  {
    id: 3,
    receipt_code: "PV-P6M9Z-0LQ4",
    league_id: 2,
    league_name: "Office Champions",
    period_id: "Week 14",
    submitted_at: new Date(Date.now() - 1800000).toISOString(),
    payload_hash: "9c6d9e5f3g2b4c7d0e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4",
    pick_count: 16,
    status: "submitted",
    deliveries: [
      { channel: "email", status: "delivered", sent_at: new Date(Date.now() - 1700000).toISOString() },
      { channel: "sms", status: "sent", sent_at: new Date(Date.now() - 1600000).toISOString() },
    ],
  },
];

// Demo audit log entries
export interface DemoAuditEntry {
  id: number;
  event_type: string;
  league_name?: string;
  user_name?: string;
  actor_name?: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export const DEMO_AUDIT_LOG: DemoAuditEntry[] = [
  { id: 1, event_type: "picks_submitted", league_name: "Sunday Showdown", user_name: "You", actor_name: "You", payload: { pick_count: 14, receipt_code: "PV-M4K7X-8JN2" }, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 2, event_type: "member_joined", league_name: "Sunday Showdown", user_name: "Jamie Martin", actor_name: "Jamie Martin", payload: {}, created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 3, event_type: "payment_verified", league_name: "Office Champions", user_name: "Casey Williams", actor_name: "Admin", payload: { amount_cents: 5000, method: "manual" }, created_at: new Date(Date.now() - 14400000).toISOString() },
  { id: 4, event_type: "picks_replaced", league_name: "Office Champions", user_name: "You", actor_name: "You", payload: { old_receipt: "PV-N5L8Y-9KP3", new_receipt: "PV-P6M9Z-0LQ4" }, created_at: new Date(Date.now() - 1800000).toISOString() },
  { id: 5, event_type: "league_created", league_name: "Props Madness", user_name: "You", actor_name: "You", payload: { sport: "nfl", format: "props" }, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 6, event_type: "admin_override", league_name: "Survivor Elite", user_name: "Chris Clark", actor_name: "Admin", payload: { reason: "Technical issue prevented pick submission", action: "reinstated" }, created_at: new Date(Date.now() - 172800000).toISOString() },
  { id: 7, event_type: "picks_locked", league_name: "NBA Nightly Action", user_name: "System", actor_name: "System", payload: { games_count: 8 }, created_at: new Date(Date.now() - 43200000).toISOString() },
  { id: 8, event_type: "survivor_eliminated", league_name: "Survivor Elite", user_name: "Taylor Davis", actor_name: "System", payload: { picked_team: "Bengals", result: "loss" }, created_at: new Date(Date.now() - 259200000).toISOString() },
];

// Demo events/games
export interface DemoEvent {
  id: number;
  sport_key: string;
  period_id: string;
  home_team: string;
  away_team: string;
  start_at: string;
  status: "scheduled" | "live" | "final";
  home_score?: number;
  away_score?: number;
  winner?: string;
  clock?: string;
  quarter?: string;
}

export const DEMO_EVENTS: DemoEvent[] = [
  // NFL Week 14 - Mix of statuses
  { id: 1, sport_key: "nfl", period_id: "Week 14", home_team: "Chiefs", away_team: "Bills", start_at: new Date(Date.now() + 3600000).toISOString(), status: "scheduled" },
  { id: 2, sport_key: "nfl", period_id: "Week 14", home_team: "Ravens", away_team: "Steelers", start_at: new Date(Date.now() - 1800000).toISOString(), status: "live", home_score: 17, away_score: 14, clock: "8:42", quarter: "3rd" },
  { id: 3, sport_key: "nfl", period_id: "Week 14", home_team: "Eagles", away_team: "Cowboys", start_at: new Date(Date.now() - 3600000).toISOString(), status: "live", home_score: 21, away_score: 10, clock: "2:15", quarter: "4th" },
  { id: 4, sport_key: "nfl", period_id: "Week 14", home_team: "49ers", away_team: "Seahawks", start_at: new Date(Date.now() - 10800000).toISOString(), status: "final", home_score: 31, away_score: 17, winner: "49ers" },
  { id: 5, sport_key: "nfl", period_id: "Week 14", home_team: "Dolphins", away_team: "Jets", start_at: new Date(Date.now() - 14400000).toISOString(), status: "final", home_score: 28, away_score: 24, winner: "Dolphins" },
  { id: 6, sport_key: "nfl", period_id: "Week 14", home_team: "Bengals", away_team: "Browns", start_at: new Date(Date.now() - 18000000).toISOString(), status: "final", home_score: 14, away_score: 21, winner: "Browns" },
  { id: 7, sport_key: "nfl", period_id: "Week 14", home_team: "Packers", away_team: "Bears", start_at: new Date(Date.now() + 7200000).toISOString(), status: "scheduled" },
  { id: 8, sport_key: "nfl", period_id: "Week 14", home_team: "Vikings", away_team: "Lions", start_at: new Date(Date.now() + 10800000).toISOString(), status: "scheduled" },
  // NBA games
  { id: 9, sport_key: "nba", period_id: "Dec 15", home_team: "Lakers", away_team: "Celtics", start_at: new Date(Date.now() - 900000).toISOString(), status: "live", home_score: 88, away_score: 92, clock: "6:30", quarter: "4th" },
  { id: 10, sport_key: "nba", period_id: "Dec 15", home_team: "Warriors", away_team: "Suns", start_at: new Date(Date.now() + 5400000).toISOString(), status: "scheduled" },
];

// Summary counts for Demo Control Center
export function getDemoSummary() {
  const byState: Record<LeagueState, number> = {
    preview: 0,
    open: 0,
    submitted: 0,
    locked: 0,
    live: 0,
    final: 0,
  };

  const byPoolType: Record<string, number> = {};

  for (const league of DEMO_LEAGUES) {
    byState[league.state]++;
    byPoolType[league.format_key] = (byPoolType[league.format_key] || 0) + 1;
  }

  return {
    totalLeagues: DEMO_LEAGUES.length,
    byState,
    byPoolType,
    totalMembers: DEMO_MEMBERS.length,
    totalReceipts: DEMO_RECEIPTS.length,
    totalAuditEntries: DEMO_AUDIT_LOG.length,
    totalEvents: DEMO_EVENTS.length,
  };
}

// Log the summary on import (for debugging)
console.log("[Demo Universe] Loaded:", getDemoSummary());

// =====================================================
// DEMO DATA HELPERS FOR LEAGUE DETAIL PAGES
// =====================================================

// Get a demo league by ID
export function getDemoLeagueById(id: number): DemoLeague | undefined {
  return DEMO_LEAGUES.find(l => l.id === id);
}

// Generate demo events for a specific league
export function getDemoEventsForLeague(leagueId: number): DemoEvent[] {
  const league = getDemoLeagueById(leagueId);
  if (!league) return [];
  
  const sport = league.sport_key;
  const state = league.state;
  
  // NFL teams
  const nflTeams = [
    { home: "Chiefs", away: "Bills" },
    { home: "Ravens", away: "Steelers" },
    { home: "Eagles", away: "Cowboys" },
    { home: "49ers", away: "Seahawks" },
    { home: "Dolphins", away: "Jets" },
    { home: "Bengals", away: "Browns" },
    { home: "Packers", away: "Bears" },
    { home: "Vikings", away: "Lions" },
    { home: "Patriots", away: "Broncos" },
    { home: "Chargers", away: "Raiders" },
    { home: "Falcons", away: "Saints" },
    { home: "Buccaneers", away: "Panthers" },
    { home: "Cardinals", away: "Rams" },
    { home: "Commanders", away: "Giants" },
  ];
  
  // NBA teams
  const nbaTeams = [
    { home: "Lakers", away: "Celtics" },
    { home: "Warriors", away: "Suns" },
    { home: "Bucks", away: "Heat" },
    { home: "Nuggets", away: "Mavericks" },
    { home: "Clippers", away: "Thunder" },
    { home: "76ers", away: "Knicks" },
    { home: "Nets", away: "Bulls" },
    { home: "Cavaliers", away: "Pacers" },
  ];
  
  const teams = sport.includes("nba") || sport.includes("ncaab") ? nbaTeams : nflTeams;
  const numGames = league.format_key === "survivor" ? 14 : Math.min(teams.length, 10);
  
  const events: DemoEvent[] = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < numGames; i++) {
    const matchup = teams[i % teams.length];
    let status: "scheduled" | "live" | "final" = "scheduled";
    let homeScore: number | undefined;
    let awayScore: number | undefined;
    let clock: string | undefined;
    let quarter: string | undefined;
    let winner: string | undefined;
    let startAt: string;
    
    // Determine status based on league state
    if (state === "final") {
      status = "final";
      homeScore = 14 + Math.floor(Math.random() * 28);
      awayScore = 14 + Math.floor(Math.random() * 28);
      winner = homeScore > awayScore ? matchup.home : matchup.away;
      startAt = new Date(baseTime - ((i + 1) * 3600000)).toISOString();
    } else if (state === "live") {
      if (i < 3) {
        status = "live";
        homeScore = Math.floor(Math.random() * 35);
        awayScore = Math.floor(Math.random() * 35);
        clock = `${Math.floor(Math.random() * 12)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
        quarter = ["1st", "2nd", "3rd", "4th"][Math.floor(Math.random() * 4)];
        startAt = new Date(baseTime - 1800000).toISOString();
      } else if (i < 6) {
        status = "final";
        homeScore = 14 + Math.floor(Math.random() * 28);
        awayScore = 14 + Math.floor(Math.random() * 28);
        winner = homeScore > awayScore ? matchup.home : matchup.away;
        startAt = new Date(baseTime - ((i) * 3600000)).toISOString();
      } else {
        status = "scheduled";
        startAt = new Date(baseTime + ((i - 5) * 3600000)).toISOString();
      }
    } else if (state === "locked") {
      startAt = new Date(baseTime + (i * 600000)).toISOString();
    } else {
      // Open, submitted, preview - games in future
      startAt = new Date(baseTime + ((i + 1) * 3600000)).toISOString();
    }
    
    events.push({
      id: leagueId * 1000 + i + 1,
      sport_key: sport,
      period_id: getPeriodIdForSport(sport),
      home_team: matchup.home,
      away_team: matchup.away,
      start_at: startAt,
      status,
      home_score: homeScore,
      away_score: awayScore,
      clock,
      quarter,
      winner,
    });
  }
  
  return events;
}

function getPeriodIdForSport(sport: string): string {
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return "Week 14";
    case "nba":
    case "ncaab":
      return "Dec 15";
    case "mlb":
      return "Sept 28";
    case "nhl":
      return "Dec 15";
    case "soccer":
      return "Matchday 18";
    case "golf":
      return "Round 3";
    default:
      return "Week 1";
  }
}

// Generate demo picks for a league (user's picks)
export function getDemoPicksForLeague(leagueId: number): Array<{
  id: number;
  event_id: number;
  pick_value: string;
  confidence_rank: number | null;
  is_locked: number;
}> {
  const league = getDemoLeagueById(leagueId);
  if (!league) return [];
  
  // If state is "open" or "preview", no picks yet
  if (league.state === "preview" || league.state === "open") {
    return [];
  }
  
  const events = getDemoEventsForLeague(leagueId);
  const isConfidence = league.format_key === "confidence";
  
  // For submitted, locked, live, final - show picks
  return events.map((event, idx) => {
    const pickHome = Math.random() > 0.5;
    return {
      id: leagueId * 10000 + idx + 1,
      event_id: event.id,
      pick_value: pickHome ? event.home_team : event.away_team,
      confidence_rank: isConfidence ? events.length - idx : null,
      is_locked: league.state === "locked" || league.state === "live" || league.state === "final" ? 1 : 0,
    };
  });
}

// Generate demo standings for a league
export function getDemoStandingsForLeague(leagueId: number): Array<{
  user_id: number;
  display_name: string;
  email: string;
  avatar_url: string | null;
  rank: number;
  previous_rank: number | null;
  total_points: number;
  correct_picks: number;
  total_picks: number;
  win_percentage: number;
  current_streak: number;
  streak_type: "win" | "loss" | "none";
  best_week: string | null;
  best_week_points: number;
  is_eliminated?: boolean;
  is_current_user?: boolean;
}> {
  const league = getDemoLeagueById(leagueId);
  if (!league) return [];
  
  const isSurvivor = league.format_key === "survivor" || league.format_key === "survivor_reentry";
  const numMembers = Math.min(league.member_count, 20);
  
  const standings = [];
  for (let i = 0; i < numMembers; i++) {
    const member = DEMO_MEMBERS[i % DEMO_MEMBERS.length];
    const isEliminated = isSurvivor && member.is_eliminated;
    const basePoints = 100 - (i * 5) + Math.floor(Math.random() * 10);
    const totalPicks = 50 + Math.floor(Math.random() * 20);
    const correctPicks = Math.floor(totalPicks * (0.5 + (0.4 * (1 - i / numMembers))));
    
    standings.push({
      user_id: member.id,
      display_name: member.name,
      email: `${member.name.toLowerCase().replace(" ", ".")}@example.com`,
      avatar_url: null,
      rank: i + 1,
      previous_rank: i === 0 ? 2 : i + Math.floor(Math.random() * 3) - 1,
      total_points: basePoints,
      correct_picks: correctPicks,
      total_picks: totalPicks,
      win_percentage: Math.round((correctPicks / totalPicks) * 100),
      current_streak: Math.floor(Math.random() * 5),
      streak_type: Math.random() > 0.5 ? "win" : "loss" as "win" | "loss" | "none",
      best_week: "Week 10",
      best_week_points: basePoints + Math.floor(Math.random() * 20),
      is_eliminated: isEliminated,
      is_current_user: i === 3, // Make 4th place the current user
    });
  }
  
  return standings;
}

// Get available periods for a league
export function getDemoPeriodsForLeague(leagueId: number): string[] {
  const league = getDemoLeagueById(leagueId);
  if (!league) return [];
  
  const sport = league.sport_key;
  
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return ["Week 12", "Week 13", "Week 14", "Week 15"];
    case "nba":
    case "ncaab":
      return ["Dec 13", "Dec 14", "Dec 15", "Dec 16"];
    case "mlb":
      return ["Sept 26", "Sept 27", "Sept 28", "Sept 29"];
    case "nhl":
      return ["Dec 13", "Dec 14", "Dec 15", "Dec 16"];
    case "soccer":
      return ["Matchday 16", "Matchday 17", "Matchday 18", "Matchday 19"];
    case "golf":
      return ["Round 1", "Round 2", "Round 3", "Round 4"];
    default:
      return ["Week 1", "Week 2", "Week 3"];
  }
}

// Get current period for a league
export function getDemoCurrentPeriod(leagueId: number): string {
  const periods = getDemoPeriodsForLeague(leagueId);
  // Return third item (current week) or last item
  return periods[2] || periods[periods.length - 1] || "Week 1";
}
