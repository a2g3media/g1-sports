/**
 * Bet Tickets API Routes
 * CRUD operations for bet tickets and legs
 * Supports manual entry and AI screenshot parsing
 */

import { Hono } from "hono";
import { processTicketLegs, processUserTickets } from "../services/legStatusEngine";
import { parseBetSlip, verifyLowConfidenceLegs } from "../services/betSlipParser";
import { fetchGamesWithFallback, type SportKey } from "../services/providers";

// Comprehensive NBA team name mappings for robust matching
// Maps various forms (full name, nickname, abbreviation, common variations) to search terms
const NBA_TEAM_MAPPINGS: Record<string, string[]> = {
  // Format: "search key": ["abbrev1", "abbrev2", "nickname", "city", "full name patterns"]
  "hawks": ["ATL", "atlanta", "hawks"],
  "celtics": ["BOS", "boston", "celtics"],
  "nets": ["BKN", "BRK", "brooklyn", "nets"],
  "hornets": ["CHA", "charlotte", "hornets"],
  "bulls": ["CHI", "chicago", "bulls"],
  "cavaliers": ["CLE", "cleveland", "cavaliers", "cavs"],
  "mavericks": ["DAL", "dallas", "mavericks", "mavs"],
  "nuggets": ["DEN", "denver", "nuggets"],
  "pistons": ["DET", "detroit", "pistons"],
  "warriors": ["GS", "GSW", "golden state", "warriors", "dubs"],
  "rockets": ["HOU", "houston", "rockets"],
  "pacers": ["IND", "indiana", "pacers"],
  "clippers": ["LAC", "la clippers", "clippers"],
  "lakers": ["LAL", "la lakers", "lakers", "los angeles lakers"],
  "grizzlies": ["MEM", "memphis", "grizzlies", "grizz"],
  "heat": ["MIA", "miami", "heat"],
  "bucks": ["MIL", "milwaukee", "bucks"],
  "timberwolves": ["MIN", "minnesota", "timberwolves", "wolves", "twolves"],
  "pelicans": ["NO", "NOP", "new orleans", "pelicans", "pels"],
  "knicks": ["NY", "NYK", "new york", "knicks"],
  "thunder": ["OKC", "oklahoma city", "thunder"],
  "magic": ["ORL", "orlando", "magic"],
  "76ers": ["PHI", "philadelphia", "76ers", "sixers"],
  "suns": ["PHO", "PHX", "phoenix", "suns"],
  "blazers": ["POR", "portland", "blazers", "trail blazers", "trailblazers"],
  "kings": ["SAC", "sacramento", "kings"],
  "spurs": ["SA", "SAS", "san antonio", "spurs"],
  "raptors": ["TOR", "toronto", "raptors"],
  "jazz": ["UTA", "UTAH", "utah", "jazz", "utah jazz"],
  "wizards": ["WAS", "WSH", "washington", "wizards"],
};

// Build reverse lookup: any term -> canonical nickname
const TEAM_REVERSE_LOOKUP: Record<string, string> = {};
for (const [canonical, aliases] of Object.entries(NBA_TEAM_MAPPINGS)) {
  TEAM_REVERSE_LOOKUP[canonical.toLowerCase()] = canonical;
  for (const alias of aliases) {
    TEAM_REVERSE_LOOKUP[alias.toLowerCase()] = canonical;
  }
}

// Get all search terms for a team name input
function getTeamSearchTerms(input: string): string[] {
  const normalized = input.toLowerCase().trim();
  const terms = new Set<string>();
  
  // Always include the original input
  terms.add(normalized);
  
  // Extract last word as potential nickname
  const words = normalized.split(/\s+/);
  if (words.length > 1) {
    terms.add(words[words.length - 1]); // e.g., "spurs" from "san antonio spurs"
    terms.add(words[0]); // e.g., "san" - city prefix
  }
  
  // Check if any word matches our reverse lookup
  for (const word of words) {
    const canonical = TEAM_REVERSE_LOOKUP[word];
    if (canonical) {
      // Add all aliases for this team
      const aliases = NBA_TEAM_MAPPINGS[canonical] || [];
      for (const alias of aliases) {
        terms.add(alias.toLowerCase());
      }
      terms.add(canonical.toLowerCase());
    }
  }
  
  // Also check if full input matches
  const canonical = TEAM_REVERSE_LOOKUP[normalized];
  if (canonical) {
    const aliases = NBA_TEAM_MAPPINGS[canonical] || [];
    for (const alias of aliases) {
      terms.add(alias.toLowerCase());
    }
  }
  
  // Check partial matches (e.g., "utah jazz" contains "jazz")
  for (const [key, aliases] of Object.entries(NBA_TEAM_MAPPINGS)) {
    for (const alias of [...aliases, key]) {
      if (normalized.includes(alias.toLowerCase()) || alias.toLowerCase().includes(normalized)) {
        // Found a match, add all terms for this team
        terms.add(key.toLowerCase());
        for (const a of aliases) {
          terms.add(a.toLowerCase());
        }
        break;
      }
    }
  }
  
  return Array.from(terms);
}

type Bindings = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  OPENAI_API_KEY?: string;
  MOCHA_USERS_SERVICE_API_URL: string;
  MOCHA_USERS_SERVICE_API_KEY: string;
};

const betTicketsRouter = new Hono<{ Bindings: Bindings }>();

// Types
interface BetTicket {
  id: number;
  user_id: string | null;
  title: string | null;
  sportsbook: string | null;
  ticket_type: string;
  stake_amount: number | null;
  to_win_amount: number | null;
  total_odds: number | null;
  status: string;
  source: string;
  source_image_url: string | null;
  raw_ai_response: string | null;
  created_at: string;
  updated_at: string;
}

interface BetTicketLeg {
  id: number;
  ticket_id: number;
  leg_index: number;
  sport: string | null;
  league: string | null;
  event_id: string | null;
  team_or_player: string;
  opponent_or_context: string | null;
  market_type: string;
  side: string | null;
  user_line_value: number | null;
  user_odds: number | null;
  stake_override: number | null;
  confidence_score: number | null;
  is_needs_review: number;
  raw_text: string | null;
  leg_status: string;
  created_at: string;
  updated_at: string;
}

// Status types for reference:
// LegStatus: 'Pending' | 'Covering' | 'NotCovering' | 'Won' | 'Lost' | 'Push'
// TicketStatus: 'draft' | 'active' | 'won' | 'lost' | 'partial' | 'push' | 'void'

// Tier-based upload limits
type SubscriptionTier = 'free' | 'pool_access' | 'pro' | 'elite';

interface UploadLimitConfig {
  maxUploads: number | null; // null = unlimited
  windowHours: number;
  displayName: string;
}

const UPLOAD_LIMITS: Record<SubscriptionTier, UploadLimitConfig> = {
  elite: { maxUploads: null, windowHours: 0, displayName: 'Elite' },
  pro: { maxUploads: null, windowHours: 0, displayName: 'Pro' },
  pool_access: { maxUploads: 1, windowHours: 24, displayName: 'Pool Access' },
  free: { maxUploads: 1, windowHours: 168, displayName: 'Free' }, // 168 hours = 7 days
};

// Helper to get user from headers
function getUserId(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header("x-user-id") || null;
}

// Helper to get user's subscription tier
async function getUserSubscriptionTier(db: D1Database, userId: string): Promise<SubscriptionTier> {
  const user = await db
    .prepare(`
      SELECT subscription_status, simulated_subscription, demo_mode_enabled 
      FROM users WHERE id = ?
    `)
    .bind(userId)
    .first<{ subscription_status: string | null; simulated_subscription: string | null; demo_mode_enabled: number | null }>();
  
  if (!user) return 'free';
  
  // Use simulated tier if demo mode is enabled
  const rawTier = user.demo_mode_enabled 
    ? (user.simulated_subscription || 'free')
    : (user.subscription_status || 'free');
  
  // Map tier values to our SubscriptionTier type
  const tierMap: Record<string, SubscriptionTier> = {
    'elite': 'elite',
    'pro': 'pro',
    'pool_access': 'pool_access',
    'pool-access': 'pool_access',
    'paid': 'pro', // Legacy mapping
    'trial': 'pro', // Treat trial as pro
    'free': 'free',
  };
  
  return tierMap[rawTier.toLowerCase()] || 'free';
}

// Helper to check upload limits for a user
interface UploadLimitResult {
  canUpload: boolean;
  uploadsUsed: number;
  maxUploads: number | null;
  windowHours: number;
  nextUploadAt: Date | null;
  tier: SubscriptionTier;
  tierDisplayName: string;
}

async function checkUploadLimit(db: D1Database, userId: string): Promise<UploadLimitResult> {
  const tier = await getUserSubscriptionTier(db, userId);
  const config = UPLOAD_LIMITS[tier];
  
  // Unlimited tiers can always upload
  if (config.maxUploads === null) {
    return {
      canUpload: true,
      uploadsUsed: 0,
      maxUploads: null,
      windowHours: 0,
      nextUploadAt: null,
      tier,
      tierDisplayName: config.displayName,
    };
  }
  
  // Count uploads within the rolling window
  const windowStart = new Date(Date.now() - config.windowHours * 60 * 60 * 1000);
  
  const result = await db
    .prepare(`
      SELECT COUNT(*) as count, MIN(created_at) as oldest_upload
      FROM bet_tickets 
      WHERE user_id = ? 
        AND source = 'screenshot'
        AND created_at > ?
    `)
    .bind(userId, windowStart.toISOString())
    .first<{ count: number; oldest_upload: string | null }>();
  
  const uploadsUsed = result?.count || 0;
  const canUpload = uploadsUsed < config.maxUploads;
  
  // Calculate when the next upload will be available
  let nextUploadAt: Date | null = null;
  if (!canUpload && result?.oldest_upload) {
    const oldestUpload = new Date(result.oldest_upload);
    nextUploadAt = new Date(oldestUpload.getTime() + config.windowHours * 60 * 60 * 1000);
  }
  
  return {
    canUpload,
    uploadsUsed,
    maxUploads: config.maxUploads,
    windowHours: config.windowHours,
    nextUploadAt,
    tier,
    tierDisplayName: config.displayName,
  };
}

// GET /api/bet-tickets - List all tickets for user
betTicketsRouter.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const db = c.env.DB;
  const status = c.req.query("status"); // Optional filter

  try {
    let query = "SELECT * FROM bet_tickets WHERE user_id = ?";
    const params: (string | number)[] = [userId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const tickets = await db
      .prepare(query)
      .bind(...params)
      .all<BetTicket>();

    // Get leg counts for each ticket
    const ticketsWithCounts = await Promise.all(
      (tickets.results || []).map(async (ticket) => {
        const legCount = await db
          .prepare("SELECT COUNT(*) as count FROM bet_ticket_legs WHERE ticket_id = ?")
          .bind(ticket.id)
          .first<{ count: number }>();
        return {
          ...ticket,
          leg_count: legCount?.count || 0,
        };
      })
    );

    return c.json({ tickets: ticketsWithCounts });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return c.json({ error: "Failed to fetch tickets" }, 500);
  }
});

// GET /api/bet-tickets/:id - Get single ticket with all legs
betTicketsRouter.get("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  if (isNaN(ticketId)) {
    return c.json({ error: "Invalid ticket ID" }, 400);
  }

  const db = c.env.DB;

  try {
    const ticket = await db
      .prepare("SELECT * FROM bet_tickets WHERE id = ? AND user_id = ?")
      .bind(ticketId, userId)
      .first<BetTicket>();

    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }

    const legs = await db
      .prepare("SELECT * FROM bet_ticket_legs WHERE ticket_id = ? ORDER BY leg_index ASC")
      .bind(ticketId)
      .all<BetTicketLeg>();

    // Get associated watchboard if any
    const watchboardLink = await db
      .prepare("SELECT watchboard_id FROM bet_ticket_watchboards WHERE ticket_id = ?")
      .bind(ticketId)
      .first<{ watchboard_id: number }>();

    return c.json({
      ticket,
      legs: legs.results || [],
      watchboard_id: watchboardLink?.watchboard_id || null,
    });
  } catch (error) {
    console.error("Error fetching ticket:", error);
    return c.json({ error: "Failed to fetch ticket" }, 500);
  }
});

// POST /api/bet-tickets - Create new ticket
betTicketsRouter.post("/", async (c) => {
  const userId = getUserId(c);
  console.log("[create ticket] userId from header:", userId);
  
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const db = c.env.DB;

  try {
    const body = await c.req.json();
    const {
      title,
      sportsbook,
      ticket_type = "single",
      stake_amount,
      to_win_amount,
      total_odds,
      status = "draft",
      source = "manual",
      source_image_url,
      legs = [],
    } = body;

    // Insert ticket
    const ticketResult = await db
      .prepare(`
        INSERT INTO bet_tickets 
        (user_id, title, sportsbook, ticket_type, stake_amount, to_win_amount, total_odds, status, source, source_image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        userId,
        title || null,
        sportsbook || null,
        ticket_type,
        stake_amount || null,
        to_win_amount || null,
        total_odds || null,
        status,
        source,
        source_image_url || null
      )
      .run();

    const ticketId = ticketResult.meta.last_row_id;

    // Insert legs if provided
    if (legs.length > 0) {
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        await db
          .prepare(`
            INSERT INTO bet_ticket_legs 
            (ticket_id, leg_index, sport, league, event_id, team_or_player, opponent_or_context, 
             market_type, side, user_line_value, user_odds, confidence_score, is_needs_review, raw_text, leg_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            ticketId,
            leg.leg_index ?? i,
            leg.sport || null,
            leg.league || null,
            leg.event_id || null,
            leg.team_or_player,
            leg.opponent_or_context || null,
            leg.market_type || "Other",
            leg.side || null,
            leg.user_line_value ?? null,
            leg.user_odds ?? null,
            leg.confidence_score ?? null,
            leg.is_needs_review ? 1 : 0,
            leg.raw_text || null,
            leg.leg_status || "Pending"
          )
          .run();
      }
    }

    return c.json({ 
      success: true, 
      ticket_id: ticketId,
      message: "Ticket created successfully"
    }, 201);
  } catch (error) {
    console.error("Error creating ticket:", error);
    return c.json({ error: "Failed to create ticket" }, 500);
  }
});

// PUT /api/bet-tickets/:id - Update ticket
betTicketsRouter.put("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  if (isNaN(ticketId)) {
    return c.json({ error: "Invalid ticket ID" }, 400);
  }

  const db = c.env.DB;

  try {
    // Verify ownership
    const existing = await db
      .prepare("SELECT * FROM bet_tickets WHERE id = ? AND user_id = ?")
      .bind(ticketId, userId)
      .first<BetTicket>();

    if (!existing) {
      return c.json({ error: "Ticket not found" }, 404);
    }

    const body = await c.req.json();
    const {
      title,
      sportsbook,
      ticket_type,
      stake_amount,
      to_win_amount,
      total_odds,
      status,
    } = body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (title !== undefined) {
      updates.push("title = ?");
      params.push(title);
    }
    if (sportsbook !== undefined) {
      updates.push("sportsbook = ?");
      params.push(sportsbook);
    }
    if (ticket_type !== undefined) {
      updates.push("ticket_type = ?");
      params.push(ticket_type);
    }
    if (stake_amount !== undefined) {
      updates.push("stake_amount = ?");
      params.push(stake_amount);
    }
    if (to_win_amount !== undefined) {
      updates.push("to_win_amount = ?");
      params.push(to_win_amount);
    }
    if (total_odds !== undefined) {
      updates.push("total_odds = ?");
      params.push(total_odds);
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }

    if (updates.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(ticketId);

    await db
      .prepare(`UPDATE bet_tickets SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...params)
      .run();

    return c.json({ success: true, message: "Ticket updated" });
  } catch (error) {
    console.error("Error updating ticket:", error);
    return c.json({ error: "Failed to update ticket" }, 500);
  }
});

// DELETE /api/bet-tickets/:id - Delete ticket
betTicketsRouter.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  if (isNaN(ticketId)) {
    return c.json({ error: "Invalid ticket ID" }, 400);
  }

  const db = c.env.DB;

  try {
    // Verify ownership
    const existing = await db
      .prepare("SELECT * FROM bet_tickets WHERE id = ? AND user_id = ?")
      .bind(ticketId, userId)
      .first<BetTicket>();

    if (!existing) {
      return c.json({ error: "Ticket not found" }, 404);
    }

    // Delete associated watchboard link
    await db
      .prepare("DELETE FROM bet_ticket_watchboards WHERE ticket_id = ?")
      .bind(ticketId)
      .run();

    // Delete legs
    await db
      .prepare("DELETE FROM bet_ticket_legs WHERE ticket_id = ?")
      .bind(ticketId)
      .run();

    // Delete ticket
    await db
      .prepare("DELETE FROM bet_tickets WHERE id = ?")
      .bind(ticketId)
      .run();

    return c.json({ success: true, message: "Ticket deleted" });
  } catch (error) {
    console.error("Error deleting ticket:", error);
    return c.json({ error: "Failed to delete ticket" }, 500);
  }
});

// POST /api/bet-tickets/:id/legs - Add or update legs
betTicketsRouter.post("/:id/legs", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  if (isNaN(ticketId)) {
    return c.json({ error: "Invalid ticket ID" }, 400);
  }

  const db = c.env.DB;

  try {
    // Verify ownership
    const existing = await db
      .prepare("SELECT * FROM bet_tickets WHERE id = ? AND user_id = ?")
      .bind(ticketId, userId)
      .first<BetTicket>();

    if (!existing) {
      return c.json({ error: "Ticket not found" }, 404);
    }

    const body = await c.req.json();
    const { legs = [], replace_all = false } = body;

    if (replace_all) {
      // Delete existing legs and replace
      await db
        .prepare("DELETE FROM bet_ticket_legs WHERE ticket_id = ?")
        .bind(ticketId)
        .run();
    }

    // Insert new legs
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      
      if (leg.id && !replace_all) {
        // Update existing leg
        await db
          .prepare(`
            UPDATE bet_ticket_legs SET
              sport = ?, league = ?, event_id = ?, team_or_player = ?, opponent_or_context = ?,
              market_type = ?, side = ?, user_line_value = ?, user_odds = ?, 
              confidence_score = ?, is_needs_review = ?, raw_text = ?, leg_status = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND ticket_id = ?
          `)
          .bind(
            leg.sport || null,
            leg.league || null,
            leg.event_id || null,
            leg.team_or_player,
            leg.opponent_or_context || null,
            leg.market_type || "Other",
            leg.side || null,
            leg.user_line_value ?? null,
            leg.user_odds ?? null,
            leg.confidence_score ?? null,
            leg.is_needs_review ? 1 : 0,
            leg.raw_text || null,
            leg.leg_status || "Pending",
            leg.id,
            ticketId
          )
          .run();
      } else {
        // Insert new leg
        await db
          .prepare(`
            INSERT INTO bet_ticket_legs 
            (ticket_id, leg_index, sport, league, event_id, team_or_player, opponent_or_context, 
             market_type, side, user_line_value, user_odds, confidence_score, is_needs_review, raw_text, leg_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            ticketId,
            leg.leg_index ?? i,
            leg.sport || null,
            leg.league || null,
            leg.event_id || null,
            leg.team_or_player,
            leg.opponent_or_context || null,
            leg.market_type || "Other",
            leg.side || null,
            leg.user_line_value ?? null,
            leg.user_odds ?? null,
            leg.confidence_score ?? null,
            leg.is_needs_review ? 1 : 0,
            leg.raw_text || null,
            leg.leg_status || "Pending"
          )
          .run();
      }
    }

    // Update ticket type based on leg count
    const legCount = await db
      .prepare("SELECT COUNT(*) as count FROM bet_ticket_legs WHERE ticket_id = ?")
      .bind(ticketId)
      .first<{ count: number }>();

    const newType = (legCount?.count || 0) > 1 ? "parlay" : "single";
    await db
      .prepare("UPDATE bet_tickets SET ticket_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(newType, ticketId)
      .run();

    return c.json({ success: true, message: "Legs updated", leg_count: legCount?.count || 0 });
  } catch (error) {
    console.error("Error updating legs:", error);
    return c.json({ error: "Failed to update legs" }, 500);
  }
});

// PUT /api/bet-tickets/:id/legs/:legId - Update single leg
betTicketsRouter.put("/:id/legs/:legId", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  const legId = parseInt(c.req.param("legId"));
  
  if (isNaN(ticketId) || isNaN(legId)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const db = c.env.DB;

  try {
    // Verify ownership
    const existing = await db
      .prepare(`
        SELECT btl.* FROM bet_ticket_legs btl 
        JOIN bet_tickets bt ON bt.id = btl.ticket_id 
        WHERE btl.id = ? AND btl.ticket_id = ? AND bt.user_id = ?
      `)
      .bind(legId, ticketId, userId)
      .first<BetTicketLeg>();

    if (!existing) {
      return c.json({ error: "Leg not found" }, 404);
    }

    const body = await c.req.json();
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    // Allow updating specific fields
    const allowedFields = [
      "sport", "league", "event_id", "team_or_player", "opponent_or_context",
      "market_type", "side", "user_line_value", "user_odds", "confidence_score",
      "is_needs_review", "raw_text", "leg_status"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === "is_needs_review") {
          params.push(body[field] ? 1 : 0);
        } else {
          params.push(body[field]);
        }
      }
    }

    if (updates.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(legId);

    await db
      .prepare(`UPDATE bet_ticket_legs SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...params)
      .run();

    return c.json({ success: true, message: "Leg updated" });
  } catch (error) {
    console.error("Error updating leg:", error);
    return c.json({ error: "Failed to update leg" }, 500);
  }
});

// DELETE /api/bet-tickets/:id/legs/:legId - Delete single leg
betTicketsRouter.delete("/:id/legs/:legId", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  const legId = parseInt(c.req.param("legId"));
  
  if (isNaN(ticketId) || isNaN(legId)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const db = c.env.DB;

  try {
    // Verify ownership
    const existing = await db
      .prepare(`
        SELECT btl.* FROM bet_ticket_legs btl 
        JOIN bet_tickets bt ON bt.id = btl.ticket_id 
        WHERE btl.id = ? AND btl.ticket_id = ? AND bt.user_id = ?
      `)
      .bind(legId, ticketId, userId)
      .first<BetTicketLeg>();

    if (!existing) {
      return c.json({ error: "Leg not found" }, 404);
    }

    await db
      .prepare("DELETE FROM bet_ticket_legs WHERE id = ?")
      .bind(legId)
      .run();

    // Update ticket type
    const legCount = await db
      .prepare("SELECT COUNT(*) as count FROM bet_ticket_legs WHERE ticket_id = ?")
      .bind(ticketId)
      .first<{ count: number }>();

    const newType = (legCount?.count || 0) > 1 ? "parlay" : "single";
    await db
      .prepare("UPDATE bet_tickets SET ticket_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(newType, ticketId)
      .run();

    return c.json({ success: true, message: "Leg deleted" });
  } catch (error) {
    console.error("Error deleting leg:", error);
    return c.json({ error: "Failed to delete leg" }, 500);
  }
});

// POST /api/bet-tickets/:id/confirm - Confirm ticket and create watchboard
betTicketsRouter.post("/:id/confirm", async (c) => {
  const userId = getUserId(c);
  console.log("[confirm] userId from header:", userId);
  
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  if (isNaN(ticketId)) {
    return c.json({ error: "Invalid ticket ID" }, 400);
  }

  const db = c.env.DB;

  try {
    // First check if ticket exists at all
    const anyTicket = await db
      .prepare("SELECT id, user_id, status FROM bet_tickets WHERE id = ?")
      .bind(ticketId)
      .first<{ id: number; user_id: string | null; status: string }>();
    console.log("[confirm] Ticket lookup:", { ticketId, anyTicket, requestUserId: userId });
    
    // Get ticket with legs
    const ticket = await db
      .prepare("SELECT * FROM bet_tickets WHERE id = ? AND user_id = ?")
      .bind(ticketId, userId)
      .first<BetTicket>();

    if (!ticket) {
      console.log("[confirm] Ticket not found for user. Ticket user_id:", anyTicket?.user_id, "Request user_id:", userId);
      return c.json({ error: "Ticket not found", debug: { ticketExists: !!anyTicket, ticketUserId: anyTicket?.user_id, requestUserId: userId } }, 404);
    }

    if (ticket.status !== "draft") {
      return c.json({ error: "Ticket already confirmed" }, 400);
    }

    const legs = await db
      .prepare("SELECT * FROM bet_ticket_legs WHERE ticket_id = ? ORDER BY leg_index ASC")
      .bind(ticketId)
      .all<BetTicketLeg>();

    if (!legs.results || legs.results.length === 0) {
      return c.json({ error: "Ticket has no legs" }, 400);
    }

    // Check if any legs need review
    const needsReview = legs.results.some(l => l.is_needs_review === 1);
    if (needsReview) {
      return c.json({ 
        error: "Some legs need review before confirming",
        legs_needing_review: legs.results.filter(l => l.is_needs_review === 1).map(l => l.id)
      }, 400);
    }

    // Update ticket status to active
    await db
      .prepare("UPDATE bet_tickets SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(ticketId)
      .run();

    // Create a watchboard for this ticket
    const boardName = ticket.title || `Ticket #${ticketId}`;
    const watchboardResult = await db
      .prepare("INSERT INTO watchboards (user_id, name, is_active) VALUES (?, ?, 0)")
      .bind(userId, boardName)
      .run();

    const watchboardId = watchboardResult.meta.last_row_id;

    // Link ticket to watchboard
    await db
      .prepare("INSERT INTO bet_ticket_watchboards (ticket_id, watchboard_id) VALUES (?, ?)")
      .bind(ticketId, watchboardId)
      .run();

    // Add games from legs to watchboard
    // If event_id is missing, try to find the game via API (same data source as /games page)
    const gamesAdded: string[] = [];
    const uniqueGameIds = new Set<string>();
    
    // Cache fetched games by sport to avoid redundant API calls
    const gamesBySport: Record<string, Awaited<ReturnType<typeof fetchGamesWithFallback>>['data']> = {};
    
    console.log(`[confirm] Processing ${legs.results.length} legs for watchboard ${watchboardId}`);
    
    for (let i = 0; i < legs.results.length; i++) {
      const leg = legs.results[i];
      let gameId = leg.event_id;
      
      console.log(`[confirm] Leg ${i}: team="${leg.team_or_player}", sport="${leg.sport}", event_id="${leg.event_id}", market="${leg.market_type}", line="${leg.user_line_value}"`);
      
      // If we already have event_id, use it directly
      if (gameId) {
        console.log(`[confirm] Leg ${i} already has event_id: ${gameId}`);
      }
      
      // If no event_id, try to find game via API using team name matching
      if (!gameId && leg.team_or_player) {
        const teamInput = leg.team_or_player.trim().toLowerCase();
        const sportKey = (leg.sport?.toLowerCase() || 'nba') as SportKey;
        
        // Get all possible search terms for this team
        const searchTerms = getTeamSearchTerms(teamInput);
        
        console.log(`[confirm] Leg ${i} searching for "${teamInput}"`);
        console.log(`[confirm] Search terms: [${searchTerms.join(', ')}]`);
        
        // Fetch games for this sport if not already cached
        if (!gamesBySport[sportKey]) {
          try {
            const result = await fetchGamesWithFallback(sportKey);
            gamesBySport[sportKey] = result.data;
            console.log(`[confirm] Fetched ${result.data.length} ${sportKey} games from ${result.provider}`);
            // Log ALL games for debugging
            for (const g of result.data) {
              console.log(`[confirm] Available game: "${g.home_team_name}" vs "${g.away_team_name}" (${g.home_team_code} vs ${g.away_team_code}) id=${g.game_id}`);
            }
          } catch (err) {
            console.error(`[confirm] Failed to fetch ${sportKey} games:`, err);
            gamesBySport[sportKey] = [];
          }
        }
        
        const games = gamesBySport[sportKey];
        
        // More robust matching: try multiple strategies
        for (const game of games) {
          if (gameId) break; // Already found
          
          const homeTeam = (game.home_team_name || '').toLowerCase();
          const awayTeam = (game.away_team_name || '').toLowerCase();
          const homeCode = (game.home_team_code || '').toLowerCase();
          const awayCode = (game.away_team_code || '').toLowerCase();
          
          // Strategy 1: Check if any search term matches team names/codes
          for (const term of searchTerms) {
            const termLen = term.length;
            // Skip very short terms (like "la" which matches too much)
            if (termLen < 3) continue;
            
            const matches = 
              // Term is contained in team name
              homeTeam.includes(term) || awayTeam.includes(term) ||
              // Exact code match
              homeCode === term || awayCode === term ||
              // Team name is contained in term (e.g., "jazz" in "utah jazz")
              (homeTeam.length >= 3 && term.includes(homeTeam)) || 
              (awayTeam.length >= 3 && term.includes(awayTeam));
            
            if (matches) {
              gameId = game.game_id;
              console.log(`[confirm] ✓ MATCH Leg ${i}: "${teamInput}" -> game ${gameId} (${game.home_team_name} vs ${game.away_team_name}) via term "${term}"`);
              break;
            }
          }
          
          // Strategy 2: Fuzzy last-word match (nickname matching)
          if (!gameId) {
            const inputWords = teamInput.split(/\s+/);
            const inputLastWord = inputWords[inputWords.length - 1];
            const homeLastWord = homeTeam.split(/\s+/).pop() || '';
            const awayLastWord = awayTeam.split(/\s+/).pop() || '';
            
            if (inputLastWord.length >= 3 && (inputLastWord === homeLastWord || inputLastWord === awayLastWord)) {
              gameId = game.game_id;
              console.log(`[confirm] ✓ MATCH Leg ${i}: "${teamInput}" -> game ${gameId} (${game.home_team_name} vs ${game.away_team_name}) via nickname "${inputLastWord}"`);
            }
          }
        }
        
        if (!gameId) {
          console.log(`[confirm] ✗ NO MATCH for Leg ${i} "${teamInput}" after checking ${games.length} games`);
        }
      }
      
      // Add to watchboard if we have a game ID
      if (gameId) {
        // CRITICAL: Update the leg's event_id so /legs-by-games can link them
        if (!leg.event_id) {
          await db
            .prepare(`UPDATE bet_ticket_legs SET event_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(gameId, leg.id)
            .run();
          console.log(`[confirm] Updated leg ${leg.id} with event_id=${gameId}`);
        }
        
        // Add game to watchboard (only once per unique game)
        if (!uniqueGameIds.has(gameId)) {
          uniqueGameIds.add(gameId);
          try {
            await db
              .prepare(`
                INSERT OR IGNORE INTO watchboard_games (watchboard_id, game_id, order_index, added_from)
                VALUES (?, ?, ?, 'bet_ticket')
              `)
              .bind(watchboardId, gameId, gamesAdded.length)
              .run();
            gamesAdded.push(gameId);
          } catch (e) {
            // Ignore duplicate key errors
          }
        }
      }
    }

    const totalLegs = legs.results.length;
    const matchRate = totalLegs > 0 ? Math.round((gamesAdded.length / totalLegs) * 100) : 0;
    
    console.log(`[confirm] COMPLETE: ${gamesAdded.length}/${totalLegs} games matched (${matchRate}%). IDs: [${gamesAdded.join(', ')}]`);
    
    return c.json({
      success: true,
      message: "Ticket confirmed and watchboard created",
      watchboard_id: watchboardId,
      games_added: gamesAdded.length,
      total_legs: totalLegs,
      match_rate: matchRate,
      game_ids: gamesAdded,
    });
  } catch (error) {
    console.error("Error confirming ticket:", error);
    return c.json({ error: "Failed to confirm ticket" }, 500);
  }
});

// GET /api/bet-tickets/upload-limit - Check upload limits for current user
betTicketsRouter.get("/upload-limit", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const limitResult = await checkUploadLimit(c.env.DB, userId);
    return c.json(limitResult);
  } catch (error) {
    console.error("Error checking upload limit:", error);
    return c.json({ error: "Failed to check upload limit" }, 500);
  }
});

// POST /api/bet-tickets/parse - Upload image and start async parsing job
// Returns immediately with job_id, frontend polls /jobs/:jobId for completion
betTicketsRouter.post("/parse", async (c) => {
  console.log("[BET PARSE] Parse request received");
  
  const userId = getUserId(c);
  if (!userId) {
    console.log("[BET PARSE] No user ID found");
    return c.json({ error: "Authentication required" }, 401);
  }
  console.log("[BET PARSE] User ID:", userId);

  const db = c.env.DB;
  const bucket = c.env.R2_BUCKET;

  try {
    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File | null;
    const ticketName = formData.get("ticket_name") as string | null;
    
    if (!imageFile) {
      console.log("[BET PARSE] No image in form data");
      return c.json({ error: "No image provided" }, 400);
    }
    
    console.log("[BET PARSE] Custom ticket name:", ticketName || "(none)");
    
    // Validate image type
    const supportedTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    let imageType = imageFile.type;
    
    if (!imageType || imageType === "application/octet-stream") {
      const ext = imageFile.name.split('.').pop()?.toLowerCase();
      const extTypeMap: Record<string, string> = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'gif': 'image/gif', 'webp': 'image/webp',
      };
      imageType = extTypeMap[ext || ''] || 'image/png';
    }
    
    if (!supportedTypes.includes(imageType)) {
      return c.json({ error: `Unsupported image type: ${imageType}. Use PNG, JPEG, GIF, or WebP.` }, 400);
    }
    
    console.log("[BET PARSE] Image received:", imageFile.name, imageType, imageFile.size, "bytes");

    // Get image buffer
    const imageBuffer = await imageFile.arrayBuffer();

    // Sanitize filename - remove special chars and spaces
    const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'png';
    const safeName = imageFile.name
      .replace(/\.[^.]+$/, '') // remove extension
      .replace(/[^a-zA-Z0-9]/g, '_') // replace special chars with underscore
      .substring(0, 50); // limit length
    const imageKey = `bet-tickets/${userId}/${Date.now()}-${safeName}.${ext}`;
    
    // Upload image to R2
    await bucket.put(imageKey, imageBuffer, { httpMetadata: { contentType: imageType } });
    console.log("[BET PARSE] Image uploaded to R2:", imageKey);

    // Create parse job record - return immediately
    const jobResult = await db
      .prepare(`INSERT INTO parse_jobs (user_id, status, image_key, image_type, ticket_name) VALUES (?, 'pending', ?, ?, ?)`)
      .bind(userId, imageKey, imageType, ticketName || null)
      .run();
    
    const jobId = jobResult.meta.last_row_id as number;
    console.log("[BET PARSE] Created parse job:", jobId);

    // Return immediately - frontend will poll for completion
    return c.json({ 
      success: true, 
      job_id: jobId,
      status: "pending"
    });
  } catch (error) {
    console.error("[BET PARSE] Error creating parse job:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return c.json({ error: `Failed to upload: ${errorMsg}` }, 500);
  }
});

// GET /api/bet-tickets/jobs/:jobId - Check parse job status, process if pending
betTicketsRouter.get("/jobs/:jobId", async (c) => {
  const jobId = parseInt(c.req.param("jobId"));
  const userId = getUserId(c);
  
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const db = c.env.DB;
  const bucket = c.env.R2_BUCKET;
  const openaiKey = c.env.OPENAI_API_KEY;

  console.log("[PARSE JOB] Checking job:", jobId, "user:", userId);

  // Get job
  const job = await db
    .prepare(`SELECT * FROM parse_jobs WHERE id = ? AND user_id = ?`)
    .bind(jobId, userId)
    .first<{ id: number; user_id: string; status: string; image_key: string; image_type: string; ticket_id: number | null; error_message: string | null; ticket_name: string | null }>();

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Already complete or errored
  if (job.status === "complete") {
    return c.json({ success: true, status: "complete", ticket_id: job.ticket_id });
  }
  if (job.status === "error") {
    return c.json({ success: false, status: "error", error: job.error_message || "Unknown error" });
  }
  if (job.status === "processing") {
    return c.json({ success: true, status: "processing" });
  }

  // Pending - start processing
  if (!openaiKey) {
    await db.prepare(`UPDATE parse_jobs SET status = 'error', error_message = ? WHERE id = ?`)
      .bind("AI parsing not configured", jobId).run();
    return c.json({ error: "AI parsing not configured" }, 503);
  }

  // Mark as processing
  await db.prepare(`UPDATE parse_jobs SET status = 'processing' WHERE id = ?`).bind(jobId).run();
  console.log("[PARSE JOB] Starting OpenAI parsing for job:", jobId);

  try {
    // Fetch image from R2
    const imageObject = await bucket.get(job.image_key);
    if (!imageObject) throw new Error("Image not found");

    const imageBuffer = await imageObject.arrayBuffer();
    const bytes = new Uint8Array(imageBuffer);
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192) {
      chunks.push(String.fromCharCode(...bytes.slice(i, i + 8192)));
    }
    const base64Image = btoa(chunks.join(''));

    // Parse with OpenAI
    let parsed = await parseBetSlip(base64Image, job.image_type, openaiKey);
    console.log("[PARSE JOB] Parse successful:", { legs: parsed.legs.length, confidence: parsed.overall_confidence });

    // Second-pass for low-confidence legs
    if (parsed.legs.some(leg => leg.confidence.overall < 70)) {
      try {
        parsed = await verifyLowConfidenceLegs(base64Image, job.image_type, parsed, openaiKey, 70);
      } catch (e) {
        console.error("[PARSE JOB] Second-pass failed:", e);
      }
    }

    // Create ticket - use custom name if provided, otherwise auto-generate
    const rawAiResponse = JSON.stringify({
      ...parsed,
      parsing_metadata: { parser_version: 'universal-v2', parsed_at: new Date().toISOString() }
    });
    
    // Auto-generate title based on ticket type and leg count
    const autoTitle = parsed.ticket_type === "parlay" 
      ? `Parlay ${parsed.legs.length} Picks` 
      : (parsed.legs[0]?.team_or_player || "Straight Bet");
    const ticketTitle = job.ticket_name || autoTitle;

    const ticketResult = await db.prepare(`
      INSERT INTO bet_tickets 
      (user_id, title, sportsbook, ticket_type, stake_amount, to_win_amount, total_odds, status, source, source_image_url, raw_ai_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'screenshot', ?, ?)
    `).bind(
      userId, ticketTitle, parsed.sportsbook || null, parsed.ticket_type || "single",
      parsed.stake_amount || null, parsed.to_win_amount || parsed.potential_payout || null,
      parsed.total_odds || null, job.image_key, rawAiResponse
    ).run();

    const ticketId = ticketResult.meta.last_row_id as number;

    // Insert legs
    for (let i = 0; i < parsed.legs.length; i++) {
      const leg = parsed.legs[i];
      const needsReview = leg.confidence.overall < 70 || !leg.team_or_player || leg.team_or_player === 'Unknown' ||
        ((leg.market_type === 'Spread' || leg.market_type === 'Total' || leg.market_type === 'Player Prop') && leg.user_line_value === null);
      
      await db.prepare(`
        INSERT INTO bet_ticket_legs 
        (ticket_id, leg_index, sport, league, team_or_player, opponent_or_context, market_type, side, user_line_value, user_odds, is_needs_review, raw_text, leg_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
      `).bind(
        ticketId, i, leg.sport || null, leg.league || null, leg.team_or_player || "Unknown",
        leg.opponent_or_context || null, leg.market_type || "Other", leg.side || null,
        leg.user_line_value ?? null, leg.user_odds ?? null, needsReview ? 1 : 0,
        leg.raw_text || null, leg.confidence.overall
      ).run();
    }

    // Mark complete
    await db.prepare(`UPDATE parse_jobs SET status = 'complete', ticket_id = ? WHERE id = ?`).bind(ticketId, jobId).run();
    console.log("[PARSE JOB] Complete, ticket:", ticketId);

    return c.json({ success: true, status: "complete", ticket_id: ticketId });

  } catch (error) {
    console.error("[PARSE JOB] Error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    await db.prepare(`UPDATE parse_jobs SET status = 'error', error_message = ? WHERE id = ?`).bind(errorMsg, jobId).run();
    return c.json({ success: false, status: "error", error: errorMsg });
  }
});

// GET /api/bet-tickets/:id/coverage - Get live coverage status for legs (also updates statuses)
betTicketsRouter.get("/:id/coverage", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  if (isNaN(ticketId)) {
    return c.json({ error: "Invalid ticket ID" }, 400);
  }

  const db = c.env.DB;

  try {
    // Verify ticket belongs to user
    const ticket = await db
      .prepare("SELECT * FROM bet_tickets WHERE id = ? AND user_id = ?")
      .bind(ticketId, userId)
      .first<BetTicket>();

    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }

    // Run leg status engine to calculate and update statuses
    const result = await processTicketLegs(db, ticketId);

    // Build coverage response with detailed info
    const coveringCount = result.results.filter(r => r.new_status === 'Covering' || r.new_status === 'Won').length;
    const notCoveringCount = result.results.filter(r => r.new_status === 'NotCovering' || r.new_status === 'Lost').length;
    const pendingCount = result.results.filter(r => r.new_status === 'Pending').length;

    return c.json({
      ticket_id: ticketId,
      ticket_status: result.new_ticket_status,
      ticket_status_changed: result.ticket_status_changed,
      legs: result.results.map(r => ({
        leg_id: r.leg_id,
        leg_status: r.new_status,
        previous_status: r.previous_status,
        changed: r.changed,
        current_value: r.current_value,
        margin: r.margin,
        game_status: r.game_status,
        details: r.details,
        is_covering: r.new_status === 'Covering' || r.new_status === 'Won',
      })),
      summary: {
        total_legs: result.legs_processed,
        covering: coveringCount,
        not_covering: notCoveringCount,
        pending: pendingCount,
        legs_changed: result.legs_changed,
      },
    });
  } catch (error) {
    console.error("Error getting coverage:", error);
    return c.json({ error: "Failed to get coverage" }, 500);
  }
});

// POST /api/bet-tickets/:id/refresh - Refresh leg statuses for a ticket
betTicketsRouter.post("/:id/refresh", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const ticketId = parseInt(c.req.param("id"));
  if (isNaN(ticketId)) {
    return c.json({ error: "Invalid ticket ID" }, 400);
  }

  const db = c.env.DB;

  try {
    // Verify ticket belongs to user
    const ticket = await db
      .prepare("SELECT id, status FROM bet_tickets WHERE id = ? AND user_id = ?")
      .bind(ticketId, userId)
      .first<{ id: number; status: string }>();

    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }

    if (ticket.status === 'draft') {
      return c.json({ error: "Cannot refresh draft ticket - confirm it first" }, 400);
    }

    // Run leg status engine
    const result = await processTicketLegs(db, ticketId);

    return c.json({
      success: true,
      ticket_id: ticketId,
      legs_processed: result.legs_processed,
      legs_changed: result.legs_changed,
      ticket_status: result.new_ticket_status,
      ticket_status_changed: result.ticket_status_changed,
      legs: result.results.map(r => ({
        leg_id: r.leg_id,
        status: r.new_status,
        changed: r.changed,
        current_value: r.current_value,
        margin: r.margin,
        game_status: r.game_status,
        details: r.details,
      })),
    });
  } catch (error) {
    console.error("Error refreshing ticket:", error);
    return c.json({ error: "Failed to refresh ticket" }, 500);
  }
});

// POST /api/bet-tickets/refresh-all - Refresh all active tickets for user
betTicketsRouter.post("/refresh-all", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const db = c.env.DB;

  try {
    const result = await processUserTickets(db, userId);

    return c.json({
      success: true,
      user_id: result.user_id,
      tickets_processed: result.tickets_processed,
      total_legs_changed: result.total_legs_changed,
      tickets: result.results,
    });
  } catch (error) {
    console.error("Error refreshing user tickets:", error);
    return c.json({ error: "Failed to refresh tickets" }, 500);
  }
});

// POST /api/bet-tickets/legs-by-games - Get bet leg statuses for specific game IDs
// Used by Watchboard to show coverage badges on game tiles
betTicketsRouter.post("/legs-by-games", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const db = c.env.DB;

  try {
    const body = await c.req.json<{ game_ids: string[] }>();
    const gameIds = body.game_ids || [];

    if (gameIds.length === 0) {
      return c.json({ legs: {} });
    }

    // Find all active ticket legs for these games belonging to this user
    const placeholders = gameIds.map(() => "?").join(",");
    const legs = await db
      .prepare(`
        SELECT 
          l.id as leg_id,
          l.event_id,
          l.team_or_player,
          l.market_type,
          l.side,
          l.user_line_value,
          l.user_odds,
          l.leg_status,
          t.id as ticket_id,
          t.title as ticket_title,
          t.ticket_type,
          t.status as ticket_status
        FROM bet_ticket_legs l
        JOIN bet_tickets t ON l.ticket_id = t.id
        WHERE t.user_id = ?
          AND t.status IN ('active', 'draft')
          AND l.event_id IN (${placeholders})
        ORDER BY l.created_at DESC
      `)
      .bind(userId, ...gameIds)
      .all<{
        leg_id: number;
        event_id: string;
        team_or_player: string;
        market_type: string;
        side: string | null;
        user_line_value: number | null;
        user_odds: number | null;
        leg_status: string;
        ticket_id: number;
        ticket_title: string | null;
        ticket_type: string;
        ticket_status: string;
      }>();

    // Group legs by game_id (event_id)
    const legsByGame: Record<string, Array<{
      leg_id: number;
      team_or_player: string;
      market_type: string;
      side: string | null;
      user_line_value: number | null;
      user_odds: number | null;
      leg_status: string;
      ticket_id: number;
      ticket_title: string | null;
      ticket_type: string;
    }>> = {};

    for (const leg of legs.results || []) {
      if (!leg.event_id) continue;
      if (!legsByGame[leg.event_id]) {
        legsByGame[leg.event_id] = [];
      }
      legsByGame[leg.event_id].push({
        leg_id: leg.leg_id,
        team_or_player: leg.team_or_player,
        market_type: leg.market_type,
        side: leg.side,
        user_line_value: leg.user_line_value,
        user_odds: leg.user_odds,
        leg_status: leg.leg_status,
        ticket_id: leg.ticket_id,
        ticket_title: leg.ticket_title,
        ticket_type: leg.ticket_type,
      });
    }

    return c.json({ legs: legsByGame });
  } catch (error) {
    console.error("Error getting legs by games:", error);
    return c.json({ error: "Failed to get legs" }, 500);
  }
});

export default betTicketsRouter;
