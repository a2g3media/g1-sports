// OpenAI-Powered Scout AI Service with Function Calling
// Provides grounded, data-driven responses for sports intelligence

import OpenAI from "openai";
import { AI_PERSONAS, type PersonaKey } from "../../shared/ai-personas";
import {
  detectSportCategory,
  getTerminology,
  formatScore,
  formatPeriod,
  formatStatus,
  formatGameSummary,
  getStandingsColumns,
} from "../../shared/sport-formatters";
import { 
  type ScoutResponse, 
  type ScoutSource,
  getDataFreshness,
  SUPPORTED_SPORTS,
  findCompetitionByAlias,
  buildMatchContext,
  MMA_WEIGHT_CLASSES,
  BOXING_WEIGHT_CLASSES,
  findWeightClass,
  parseResultMethod,
  formatFighterRecord,
  type FightCard,
  type FightBout,
  type BoutType,
  // Tennis types
  TENNIS_TOURNAMENTS,
  findTennisTournament,
  formatTennisRound,
  type TennisMatch,
  type TennisRoundName,
  // Golf types
  GOLF_TOURNAMENTS,
  findGolfTournament,
  formatGolfScore,
  formatGolfPosition,
  type GolfLeaderboardEntry,
  // Motorsport types
  MOTORSPORT_TRACKS,
  findMotorsportTrack,
  formatLapTime,
  formatGap,
  getSeriesName,
  type MotorsportSeries,
  type RaceResult,
} from "../../shared/scout-schema";
import { findTeam, searchTeams, findLeague, searchLeagues } from "../../shared/soccer-entities";
import {
  generateCacheKey,
  getCachedData,
  setCachedData,
  CACHE_CONFIG,
} from "./scout-cache";
import {
  getMemorySummary,
  learnFromQuestion,
  type MemorySummary,
} from "./scoutMemoryService";
// processTicketLegs is used in bet-tickets.ts for leg status updates
import { 
  getAIPriorityRouting, 
  getResponseDepthInstructions,
  buildEliteContextPrompt,
  type PriorityRouting,
  type EliteContext,
} from "./aiPriorityRouter";

// ========== Bet Ticket Context for Coach G ========== //

interface BetTicketContext {
  tickets: Array<{
    id: number;
    title: string;
    sportsbook: string | null;
    ticket_type: string;
    stake_amount: number | null;
    to_win_amount: number | null;
    status: string;
    legs: Array<{
      team_or_player: string;
      opponent_or_context: string | null;
      market_type: string;
      side: string | null;
      user_line_value: number | null;
      user_odds: number | null;
      leg_status: string;
      event_id: string | null;
    }>;
  }>;
  summary: {
    total_tickets: number;
    active_tickets: number;
    total_legs: number;
    covering_legs: number;
    not_covering_legs: number;
    pending_legs: number;
  };
}

/**
 * Fetch user's active bet tickets for Coach G context injection
 */
async function getBetTicketContext(db: D1Database, userId: string): Promise<BetTicketContext | null> {
  try {
    // Get active and draft tickets (not settled)
    const { results: tickets } = await db.prepare(`
      SELECT id, title, sportsbook, ticket_type, stake_amount, to_win_amount, status
      FROM bet_tickets
      WHERE user_id = ? AND status IN ('active', 'draft')
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(userId).all();

    if (tickets.length === 0) {
      return null;
    }

    const ticketIds = tickets.map((t: any) => t.id);
    
    // Get legs for all tickets
    const placeholders = ticketIds.map(() => '?').join(',');
    const { results: legs } = await db.prepare(`
      SELECT ticket_id, team_or_player, opponent_or_context, market_type, side,
             user_line_value, user_odds, leg_status, event_id
      FROM bet_ticket_legs
      WHERE ticket_id IN (${placeholders})
      ORDER BY ticket_id, leg_index
    `).bind(...ticketIds).all();

    // Group legs by ticket
    const legsByTicket: Record<number, any[]> = {};
    for (const leg of legs) {
      const ticketId = (leg as any).ticket_id;
      if (!legsByTicket[ticketId]) legsByTicket[ticketId] = [];
      legsByTicket[ticketId].push({
        team_or_player: (leg as any).team_or_player,
        opponent_or_context: (leg as any).opponent_or_context,
        market_type: (leg as any).market_type,
        side: (leg as any).side,
        user_line_value: (leg as any).user_line_value,
        user_odds: (leg as any).user_odds,
        leg_status: (leg as any).leg_status,
        event_id: (leg as any).event_id,
      });
    }

    // Build context
    const contextTickets = tickets.map((t: any) => ({
      id: t.id,
      title: t.title,
      sportsbook: t.sportsbook,
      ticket_type: t.ticket_type,
      stake_amount: t.stake_amount,
      to_win_amount: t.to_win_amount,
      status: t.status,
      legs: legsByTicket[t.id] || [],
    }));

    // Calculate summary stats
    let totalLegs = 0;
    let coveringLegs = 0;
    let notCoveringLegs = 0;
    let pendingLegs = 0;

    for (const ticket of contextTickets) {
      for (const leg of ticket.legs) {
        totalLegs++;
        const status = (leg.leg_status || 'Pending').toLowerCase();
        if (status === 'covering' || status === 'won') coveringLegs++;
        else if (status === 'notcovering' || status === 'lost') notCoveringLegs++;
        else pendingLegs++;
      }
    }

    return {
      tickets: contextTickets,
      summary: {
        total_tickets: contextTickets.length,
        active_tickets: contextTickets.filter(t => t.status === 'active').length,
        total_legs: totalLegs,
        covering_legs: coveringLegs,
        not_covering_legs: notCoveringLegs,
        pending_legs: pendingLegs,
      },
    };
  } catch (err) {
    console.error("Failed to fetch bet ticket context:", err);
    return null;
  }
}

/**
 * Build prompt block for bet ticket awareness
 */
function buildBetTicketPromptBlock(context: BetTicketContext): string {
  const lines: string[] = [];
  
  lines.push("\n\n=== USER'S ACTIVE BET TICKETS (CONFIDENTIAL) ===");
  lines.push(`The user has ${context.summary.total_tickets} active ticket(s) with ${context.summary.total_legs} total leg(s).`);
  
  if (context.summary.covering_legs > 0 || context.summary.not_covering_legs > 0) {
    lines.push(`Status: ${context.summary.covering_legs} covering, ${context.summary.not_covering_legs} not covering, ${context.summary.pending_legs} pending.`);
  }
  
  lines.push("\nTicket Details:");
  
  for (const ticket of context.tickets) {
    const stakeInfo = ticket.stake_amount ? `$${(ticket.stake_amount / 100).toFixed(2)} to win $${((ticket.to_win_amount || 0) / 100).toFixed(2)}` : '';
    lines.push(`\n• ${ticket.title || `Ticket #${ticket.id}`}${ticket.ticket_type ? ` (${ticket.ticket_type})` : ''}${stakeInfo ? ` - ${stakeInfo}` : ''}`);
    
    for (const leg of ticket.legs) {
      const lineValue = leg.user_line_value !== null ? ` ${leg.user_line_value > 0 ? '+' : ''}${leg.user_line_value}` : '';
      const oddsValue = leg.user_odds !== null ? ` (${leg.user_odds > 0 ? '+' : ''}${leg.user_odds})` : '';
      const status = leg.leg_status || 'Pending';
      const statusEmoji = status === 'Covering' || status === 'Won' ? '✓' : 
                          status === 'NotCovering' || status === 'Lost' ? '✗' : '○';
      
      lines.push(`  ${statusEmoji} ${leg.team_or_player}${leg.opponent_or_context ? ` vs ${leg.opponent_or_context}` : ''} - ${leg.market_type}${lineValue}${oddsValue} [${status}]`);
    }
  }
  
  lines.push("\nTICKET-AWARE INSTRUCTIONS:");
  lines.push("- When the user asks about a game where they have a bet, reference their SPECIFIC line (e.g., 'You have Thunder -4.5')");
  lines.push("- If a game they bet on is live, proactively mention how their bet is doing (e.g., 'Good news on your Celtics -7 - they're up by 12')");
  lines.push("- Use their exact line value from the ticket, NOT the current market line");
  lines.push("- For spread bets: calculate margin from their line (e.g., 'covering by 3 points')");
  lines.push("- For totals: reference their over/under line specifically");
  lines.push("- Never reveal stake amounts unless the user asks about their bet");
  lines.push("- Be encouraging but realistic - don't oversell or understate coverage");
  lines.push("=== END BET TICKETS ===");
  
  return lines.join("\n");
}

// Tool definitions for OpenAI function calling
export const SCOUT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  // IDENTITY & RESOLUTION
  {
    type: "function",
    function: {
      name: "resolve_entity",
      description: "Resolve a team, league, or competition name to its canonical form with metadata. Essential for soccer queries - handles nicknames, abbreviations, and common aliases (e.g., 'Man U' → 'Manchester United', 'El Clásico' → Real Madrid vs Barcelona).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, nickname, or abbreviation to resolve (e.g., 'Spurs', 'Bayern', 'UCL', 'La Liga')" },
          entity_type: { type: "string", enum: ["team", "league", "competition", "event"], description: "Type of entity to find (default: auto-detect)" },
          sport: { type: "string", description: "Sport to narrow search (e.g., 'soccer', 'nfl'). Defaults to soccer." },
        },
        required: ["query"],
      },
    },
  },
  // SCHEDULE / SCORES
  {
    type: "function",
    function: {
      name: "get_game_schedule",
      description: "Get the schedule of upcoming or past games for a specific date, sport, and league. Supports all major sports.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format (defaults to today)" },
          sport: { type: "string", description: "Sport key like 'americanfootball_nfl', 'basketball_nba', 'baseball_mlb'" },
          league: { type: "string", description: "League filter" },
          period: { type: "string", description: "Period/week identifier like 'Week 12' or 'Regular Season'" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_game_details",
      description: "Get detailed information about a specific game including teams, time, venue, status, and score",
      parameters: {
        type: "object",
        properties: {
          game_id: { type: "number", description: "The unique identifier for the game" },
          teams: { type: "string", description: "Team names to search for (e.g., 'Chiefs vs Raiders' or 'Patriots')" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_live_state",
      description: "Get live/current state of a game or event including score, period/quarter/half, time remaining, and game clock. Use this for any 'what's the score' or 'how's the game going' questions. Works across all sports.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "number", description: "The unique event/game ID" },
          teams: { type: "string", description: "Team names to find the game (e.g., 'Lakers vs Celtics')" },
          sport: { type: "string", description: "Sport key to narrow search" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_standings",
      description: "Get current league table/standings. For soccer: returns full table with P, W, D, L, GF, GA, GD, Pts and competition-specific tie-break explanation. For US sports: returns standard W-L records with conference/division breakdown.",
      parameters: {
        type: "object",
        properties: {
          league: { type: "string", description: "League key (e.g., 'soccer_epl', 'soccer_spain_la_liga', 'americanfootball_nfl')" },
          division: { type: "string", description: "Optional division/conference filter" },
          season: { type: "string", description: "Season year (defaults to current)" },
          include_tiebreak_info: { type: "boolean", description: "Include tie-breaker rules explanation (default true for soccer)" },
        },
        required: ["league"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_recent_results",
      description: "Get a team's recent game results with scores and outcomes",
      parameters: {
        type: "object",
        properties: {
          team: { type: "string", description: "Team name or abbreviation" },
          sport: { type: "string", description: "Sport key" },
          limit: { type: "number", description: "Number of recent games (default 5, max 10)" },
        },
        required: ["team"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_form",
      description: "Get a team's recent form showing last 5 matches with results, goals, and form string (W/D/L). Essential for soccer analysis.",
      parameters: {
        type: "object",
        properties: {
          team: { type: "string", description: "Team name (e.g., 'Liverpool', 'Real Madrid', 'Bayern Munich')" },
          competition: { type: "string", description: "Optional: filter by competition (e.g., 'EPL', 'Champions League', 'La Liga')" },
          include_all_competitions: { type: "boolean", description: "Include matches from all competitions (default true)" },
        },
        required: ["team"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_head_to_head",
      description: "Get head-to-head history between two teams with past matchup results",
      parameters: {
        type: "object",
        properties: {
          team_a: { type: "string", description: "First team name" },
          team_b: { type: "string", description: "Second team name" },
          sport: { type: "string", description: "Sport key" },
          limit: { type: "number", description: "Number of matchups to return (default 5)" },
        },
        required: ["team_a", "team_b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_stats",
      description: "Get team statistics for a season including offensive/defensive metrics",
      parameters: {
        type: "object",
        properties: {
          team: { type: "string", description: "Team name or abbreviation" },
          sport: { type: "string", description: "Sport key" },
          season: { type: "string", description: "Season year" },
        },
        required: ["team"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_venue_info",
      description: "Get venue/stadium information including location, surface, capacity, and conditions",
      parameters: {
        type: "object",
        properties: {
          venue_name: { type: "string", description: "Venue or stadium name" },
          game_id: { type: "number", description: "Game ID to look up venue for" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Search the knowledge base for rules, glossary terms, pool formats, and app help articles",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for rules, terms, or help topics" },
          category: { type: "string", enum: ["rules", "glossary", "pool_format", "league_rules", "app_help"], description: "Category filter" },
          sport: { type: "string", description: "Sport filter" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lines_history",
      description: "Get betting lines history for a game including open, current, and closing lines with movement timeline",
      parameters: {
        type: "object",
        properties: {
          game_id: {
            type: "number",
            description: "The unique identifier for the game",
          },
          teams: {
            type: "string",
            description: "Team names to search for",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_averages",
      description: "Get consensus/market average lines for a game across multiple sportsbooks",
      parameters: {
        type: "object",
        properties: {
          game_id: {
            type: "number",
            description: "The unique identifier for the game",
          },
          teams: {
            type: "string",
            description: "Team names to search for",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_injuries",
      description: "Get injury reports for a team including player status and impact",
      parameters: {
        type: "object",
        properties: {
          team: {
            type: "string",
            description: "Team name or abbreviation",
          },
          sport: {
            type: "string",
            description: "Sport key like 'nfl', 'nba'",
          },
        },
        required: ["team"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather forecast for an outdoor game venue",
      parameters: {
        type: "object",
        properties: {
          game_id: {
            type: "number",
            description: "The unique identifier for the game",
          },
          venue: {
            type: "string",
            description: "Venue/stadium name",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pool_rules",
      description: "Get rules and settings for a specific pool",
      parameters: {
        type: "object",
        properties: {
          pool_id: {
            type: "number",
            description: "The pool/league identifier",
          },
        },
        required: ["pool_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_picks",
      description: "Get the user's submitted picks for a pool and period",
      parameters: {
        type: "object",
        properties: {
          pool_id: {
            type: "number",
            description: "The pool/league identifier",
          },
          period: {
            type: "string",
            description: "Period/week identifier",
          },
        },
        required: ["pool_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_match_context",
      description: "Get detailed context about a match including competition format, stage (league/knockout/group), significance (derby, rivalry, title race, relegation battle), and tiebreaker rules. ALWAYS use this for soccer matches to provide proper context.",
      parameters: {
        type: "object",
        properties: {
          game_id: {
            type: "number",
            description: "The game/event ID",
          },
          home_team: {
            type: "string",
            description: "Home team name (used if game_id not provided)",
          },
          away_team: {
            type: "string",
            description: "Away team name (used if game_id not provided)",
          },
          competition: {
            type: "string",
            description: "Competition name or key (e.g., 'EPL', 'Champions League')",
          },
        },
        required: [],
      },
    },
  },
  // TENNIS TOOLS
  {
    type: "function",
    function: {
      name: "get_tennis_rankings",
      description: "Get current ATP or WTA tennis rankings. Returns top players with ranking, points, country, and recent form.",
      parameters: {
        type: "object",
        properties: {
          tour: { type: "string", enum: ["atp", "wta"], description: "Tennis tour (ATP for men, WTA for women)" },
          top: { type: "number", description: "Number of top players to return (default 20, max 100)" },
        },
        required: ["tour"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tennis_tournament",
      description: "Get information about a tennis tournament including draw, results, and schedule. Works for Grand Slams, Masters 1000s, and other ATP/WTA events.",
      parameters: {
        type: "object",
        properties: {
          tournament: { type: "string", description: "Tournament name or key (e.g., 'Wimbledon', 'US Open', 'Indian Wells')" },
          round: { type: "string", description: "Specific round to filter (e.g., 'quarter_finals', 'semi_finals', 'final')" },
        },
        required: ["tournament"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tennis_player",
      description: "Get detailed profile for a tennis player including ranking, career stats, recent results, and head-to-head records.",
      parameters: {
        type: "object",
        properties: {
          player_name: { type: "string", description: "Player's name (e.g., 'Novak Djokovic', 'Carlos Alcaraz')" },
          include_h2h: { type: "string", description: "Optional opponent name to include head-to-head record" },
        },
        required: ["player_name"],
      },
    },
  },
  // GOLF TOOLS
  {
    type: "function",
    function: {
      name: "get_golf_rankings",
      description: "Get current Official World Golf Ranking (OWGR), FedEx Cup standings, or LIV Golf standings.",
      parameters: {
        type: "object",
        properties: {
          ranking_type: { type: "string", enum: ["owgr", "fedex_cup", "liv"], description: "Type of ranking (default: owgr)" },
          top: { type: "number", description: "Number of top players to return (default 20, max 100)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_golf_leaderboard",
      description: "Get current leaderboard for a golf tournament including positions, scores, and round-by-round details.",
      parameters: {
        type: "object",
        properties: {
          tournament: { type: "string", description: "Tournament name (e.g., 'Masters', 'US Open', 'Players Championship')" },
          top: { type: "number", description: "Number of positions to return (default 30)" },
        },
        required: ["tournament"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_golf_player",
      description: "Get detailed profile for a golfer including world ranking, tour stats, recent results, and major wins.",
      parameters: {
        type: "object",
        properties: {
          player_name: { type: "string", description: "Golfer's name (e.g., 'Scottie Scheffler', 'Rory McIlroy')" },
        },
        required: ["player_name"],
      },
    },
  },
  // MOTORSPORTS TOOLS
  {
    type: "function",
    function: {
      name: "get_race_schedule",
      description: "Get upcoming race schedule for F1, NASCAR, IndyCar, or other motorsport series. Returns race dates, tracks, and session times.",
      parameters: {
        type: "object",
        properties: {
          series: { type: "string", enum: ["f1", "nascar_cup", "nascar_xfinity", "indycar", "motogp"], description: "Motorsport series" },
          season: { type: "number", description: "Season year (default: current year)" },
          upcoming_only: { type: "boolean", description: "Only show upcoming races (default: true)" },
        },
        required: ["series"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_race_results",
      description: "Get results for a specific race including finishing order, gaps, points, and fastest laps. Works for F1, NASCAR, IndyCar.",
      parameters: {
        type: "object",
        properties: {
          series: { type: "string", enum: ["f1", "nascar_cup", "nascar_xfinity", "indycar", "motogp"], description: "Motorsport series" },
          race_name: { type: "string", description: "Race name or track (e.g., 'Monaco', 'Daytona 500', 'Indy 500')" },
          round: { type: "number", description: "Round number in the season" },
          session: { type: "string", enum: ["race", "qualifying", "sprint"], description: "Session type (default: race)" },
        },
        required: ["series"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_driver_standings",
      description: "Get current driver/rider championship standings for F1, NASCAR, IndyCar, or MotoGP. Includes points, wins, and gap to leader.",
      parameters: {
        type: "object",
        properties: {
          series: { type: "string", enum: ["f1", "nascar_cup", "nascar_xfinity", "indycar", "motogp"], description: "Motorsport series" },
          season: { type: "number", description: "Season year (default: current year)" },
          top: { type: "number", description: "Number of top drivers to return (default: 20)" },
        },
        required: ["series"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_constructor_standings",
      description: "Get team/constructor championship standings. For F1: constructor standings. For NASCAR: owner standings. Includes points and wins.",
      parameters: {
        type: "object",
        properties: {
          series: { type: "string", enum: ["f1", "nascar_cup", "indycar"], description: "Motorsport series" },
          season: { type: "number", description: "Season year (default: current year)" },
        },
        required: ["series"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_driver_profile",
      description: "Get detailed profile for a motorsport driver including team, car number, championship position, wins, and recent results.",
      parameters: {
        type: "object",
        properties: {
          driver_name: { type: "string", description: "Driver's name (e.g., 'Max Verstappen', 'Kyle Larson')" },
          series: { type: "string", description: "Optional: F1, NASCAR, IndyCar to narrow search" },
        },
        required: ["driver_name"],
      },
    },
  },
  // COMBAT SPORTS TOOLS
  {
    type: "function",
    function: {
      name: "get_fight_card",
      description: "Get the full fight card for a UFC, Bellator, PFL, ONE Championship, or boxing event. Returns all bouts with fighters, weight classes, records, and results. Use this for any MMA or boxing event queries.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "number", description: "The event ID" },
          event_name: { type: "string", description: "Event name to search for (e.g., 'UFC 300', 'Canelo vs Munguia')" },
          promotion: { type: "string", enum: ["ufc", "bellator", "pfl", "one", "boxing"], description: "Fighting promotion/organization" },
          date: { type: "string", description: "Event date in YYYY-MM-DD format" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fighter_profile",
      description: "Get detailed profile for an MMA fighter or boxer including record, weight class, ranking, recent fights, and physical stats.",
      parameters: {
        type: "object",
        properties: {
          fighter_name: { type: "string", description: "Fighter's name (e.g., 'Jon Jones', 'Islam Makhachev')" },
          promotion: { type: "string", description: "Optional: UFC, Bellator, boxing, etc." },
        },
        required: ["fighter_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weight_class_rankings",
      description: "Get current rankings for a specific weight class in UFC or boxing. Returns champion, top contenders, and recent title history.",
      parameters: {
        type: "object",
        properties: {
          weight_class: { type: "string", description: "Weight class name (e.g., 'lightweight', 'heavyweight', 'welterweight')" },
          sport: { type: "string", enum: ["mma", "boxing"], description: "Combat sport (default: mma)" },
          promotion: { type: "string", description: "Organization (default: UFC for MMA)" },
        },
        required: ["weight_class"],
      },
    },
  },
];

// Helper to build a human-readable match description with context
function buildMatchDescription(
  context: any,
  homeTeam: string,
  awayTeam: string,
  homePos?: number,
  awayPos?: number
): string {
  const parts: string[] = [];
  
  // Format: "Arsenal (1st) vs Chelsea (4th)"
  const homeLabel = homePos ? `${homeTeam} (${homePos}${getOrdinalSuffix(homePos)})` : homeTeam;
  const awayLabel = awayPos ? `${awayTeam} (${awayPos}${getOrdinalSuffix(awayPos)})` : awayTeam;
  parts.push(`${homeLabel} vs ${awayLabel}`);
  
  // Add match type context
  if (context.isRivalry && context.rivalry) {
    parts.push(`— ${context.rivalry.name}`);
  } else if (context.isKnockout) {
    parts.push(`— ${context.stage.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}`);
  }
  
  // Add significance
  const sigs = context.significance?.filter((s: string) => s !== "regular") || [];
  if (sigs.length > 0) {
    const sigLabels = sigs.map((s: string) => 
      s.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    );
    parts.push(`(${sigLabels.join(', ')})`);
  }
  
  return parts.join(' ');
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Execute a tool call and return results (with caching)
export async function executeToolCall(
  db: D1Database,
  userId: string,
  toolName: string,
  args: Record<string, any>
): Promise<{ data: any; source: string; lastUpdated: string; cached?: boolean }> {
  const now = new Date().toISOString();
  
  // Check cache first for cacheable tools
  if (CACHE_CONFIG[toolName]) {
    const cacheKey = generateCacheKey(toolName, args, userId);
    const cached = await getCachedData(db, cacheKey);
    
    if (cached) {
      return {
        data: cached.data,
        source: cached.source,
        lastUpdated: cached.lastUpdated,
        cached: true,
      };
    }
  }

  // Execute tool and get fresh data
  const result = await executeToolCallInternal(db, userId, toolName, args, now);
  
  // Store in cache for cacheable tools
  if (CACHE_CONFIG[toolName] && result.data) {
    const cacheKey = generateCacheKey(toolName, args, userId);
    await setCachedData(db, toolName, cacheKey, result.data, result.source, result.lastUpdated);
  }
  
  return result;
}

// Internal tool execution (without caching)
async function executeToolCallInternal(
  db: D1Database,
  userId: string,
  toolName: string,
  args: Record<string, any>,
  now: string
): Promise<{ data: any; source: string; lastUpdated: string }> {
  switch (toolName) {
    case "resolve_entity": {
      const query = args.query?.toLowerCase().trim() || "";
      const entityType = args.entity_type || "auto";
      const sport = args.sport?.toLowerCase() || "";
      
      // Sport detection helpers
      const isSoccer = sport === "soccer" || sport.includes("soccer") || sport.includes("mls") || sport.includes("epl") || sport.includes("premier league");
      const isFootball = sport.includes("nfl") || sport.includes("football") || sport.includes("ncaaf");
      const isBasketball = sport.includes("nba") || sport.includes("basketball") || sport.includes("ncaab") || sport.includes("wnba");
      const isBaseball = sport.includes("mlb") || sport.includes("baseball");
      const isHockey = sport.includes("nhl") || sport.includes("hockey");
      const isMMA = sport.includes("ufc") || sport.includes("mma");
      const isBoxing = sport.includes("boxing");
      const isTennis = sport.includes("tennis") || sport.includes("atp") || sport.includes("wta");
      const isGolf = sport.includes("golf") || sport.includes("pga");
      const isMotorsport = sport.includes("f1") || sport.includes("formula") || sport.includes("nascar") || sport.includes("motogp");
      
      // Determine sport category for database queries
      const getSportFilter = (): string | null => {
        if (isSoccer) return "soccer";
        if (isFootball) return sport.includes("ncaaf") ? "ncaaf" : "nfl";
        if (isBasketball) return sport.includes("ncaab") ? "ncaab" : sport.includes("wnba") ? "wnba" : "nba";
        if (isBaseball) return "mlb";
        if (isHockey) return "nhl";
        if (isMMA) return "mma";
        if (isBoxing) return "boxing";
        if (isTennis) return "tennis";
        if (isGolf) return "golf";
        if (isMotorsport) return "motorsport";
        return null;
      };
      
      const sportFilter = getSportFilter();
      
      // Soccer-specific resolution (uses rich entity database)
      if (isSoccer || (!sport && (entityType === "team" || entityType === "league" || entityType === "competition"))) {
        // Try team resolution first
        const teamMatch = findTeam(query);
        const teamMatches = searchTeams(query, 5);
        
        // Try league/competition resolution
        const leagueMatch = findLeague(query);
        const leagueMatches = searchLeagues(query, 5);
        
        // Also check SOCCER_COMPETITIONS from scout-schema
        const competition = findCompetitionByAlias(query);
        
        // Build comprehensive response
        if (entityType === "team" || (entityType === "auto" && teamMatch)) {
          if (teamMatch) {
            return {
              data: {
                resolved: true,
                entityType: "team",
                sport: "soccer",
                canonical: {
                  id: teamMatch.id,
                  name: teamMatch.name,
                  shortName: teamMatch.shortName,
                  abbreviation: teamMatch.abbreviation,
                  country: teamMatch.country,
                  league: teamMatch.league,
                  leagueKey: teamMatch.leagueKey,
                  city: teamMatch.city,
                  stadium: teamMatch.stadium,
                },
                aliases: teamMatch.aliases,
                query,
              },
              source: "Soccer Entity Database",
              lastUpdated: now,
            };
          }
          
          // Return similar matches if no exact match
          if (teamMatches.length > 0 && isSoccer) {
            return {
              data: {
                resolved: false,
                entityType: "team",
                sport: "soccer",
                query,
                suggestions: teamMatches.map(t => ({
                  name: t.name,
                  shortName: t.shortName,
                  country: t.country,
                  league: t.league,
                })),
                message: `No exact match for "${query}". Did you mean one of these?`,
              },
              source: "Soccer Entity Database",
              lastUpdated: now,
            };
          }
        }
        
        if (entityType === "league" || entityType === "competition" || 
            (entityType === "auto" && (leagueMatch || competition))) {
          if (leagueMatch) {
            return {
              data: {
                resolved: true,
                entityType: "league",
                sport: "soccer",
                canonical: {
                  key: leagueMatch.key,
                  name: leagueMatch.name,
                  shortName: leagueMatch.shortName,
                  country: leagueMatch.country,
                  tier: leagueMatch.tier,
                },
                aliases: leagueMatch.aliases,
                query,
              },
              source: "Soccer Entity Database",
              lastUpdated: now,
            };
          }
          
          if (competition) {
            return {
              data: {
                resolved: true,
                entityType: "competition",
                sport: "soccer",
                canonical: {
                  key: competition.key,
                  name: competition.name,
                  format: competition.format,
                  tier: competition.tier,
                  tieBreakers: competition.tieBreakers,
                },
                aliases: competition.aliases,
                query,
              },
              source: "Soccer Competition Database",
              lastUpdated: now,
            };
          }
          
          if (leagueMatches.length > 0 && isSoccer) {
            return {
              data: {
                resolved: false,
                entityType: "league",
                sport: "soccer",
                query,
                suggestions: leagueMatches.map(l => ({
                  key: l.key,
                  name: l.name,
                  country: l.country,
                })),
                message: `No exact match for "${query}". Did you mean one of these?`,
              },
              source: "Soccer Entity Database",
              lastUpdated: now,
            };
          }
        }
      }
      
      // Universal team resolution via events database (works for ALL sports)
      if (entityType === "team" || entityType === "auto") {
        let sql = `
          SELECT home_team, away_team, sport_key, league_key, COUNT(*) as game_count
          FROM events 
          WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?)
        `;
        const params: any[] = [`%${query}%`, `%${query}%`];
        
        if (sportFilter) {
          sql += ` AND LOWER(sport_key) LIKE ?`;
          params.push(`%${sportFilter}%`);
        }
        
        sql += ` GROUP BY CASE WHEN LOWER(home_team) LIKE ? THEN home_team ELSE away_team END, sport_key
                 ORDER BY game_count DESC LIMIT 10`;
        params.push(`%${query}%`);
        
        const { results } = await db.prepare(sql).bind(...params).all();
        
        if (results.length > 0) {
          // Find best matching teams
          const teamMatches: { name: string; sport: string; league: string; games: number }[] = [];
          const seen = new Set<string>();
          
          results.forEach((r: any) => {
            const homeMatch = (r.home_team as string).toLowerCase().includes(query);
            const teamName = homeMatch ? r.home_team : r.away_team;
            const key = `${teamName}-${r.sport_key}`;
            
            if (!seen.has(key)) {
              seen.add(key);
              teamMatches.push({
                name: teamName as string,
                sport: r.sport_key as string,
                league: r.league_key as string || r.sport_key as string,
                games: r.game_count as number,
              });
            }
          });
          
          // If we found exactly one match, return as resolved
          if (teamMatches.length === 1) {
            return {
              data: {
                resolved: true,
                entityType: "team",
                sport: teamMatches[0].sport,
                canonical: {
                  name: teamMatches[0].name,
                  league: teamMatches[0].league,
                },
                gamesInDatabase: teamMatches[0].games,
                query,
              },
              source: "Events Database",
              lastUpdated: now,
            };
          }
          
          // Multiple matches - return as suggestions
          if (teamMatches.length > 1) {
            return {
              data: {
                resolved: false,
                entityType: "team",
                query,
                suggestions: teamMatches.map(t => ({
                  name: t.name,
                  sport: t.sport,
                  league: t.league,
                })),
                message: sportFilter 
                  ? `Found ${teamMatches.length} teams matching "${query}" in ${sportFilter}. Please be more specific.`
                  : `Found ${teamMatches.length} teams matching "${query}" across multiple sports. Specify the sport for better results.`,
              },
              source: "Events Database",
              lastUpdated: now,
            };
          }
        }
      }
      
      // Universal league resolution via SUPPORTED_SPORTS
      if (entityType === "league" || entityType === "auto") {
        const leagueMatches = SUPPORTED_SPORTS.filter(s => 
          s.key.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query) ||
          s.sport.toLowerCase().includes(query)
        );
        
        if (leagueMatches.length === 1) {
          return {
            data: {
              resolved: true,
              entityType: "league",
              sport: leagueMatches[0].sport,
              canonical: {
                key: leagueMatches[0].key,
                name: leagueMatches[0].name,
              },
              query,
            },
            source: "League Database",
            lastUpdated: now,
          };
        }
        
        if (leagueMatches.length > 1) {
          return {
            data: {
              resolved: false,
              entityType: "league",
              query,
              suggestions: leagueMatches.slice(0, 5).map(l => ({
                key: l.key,
                name: l.name,
                sport: l.sport,
              })),
              message: `Found ${leagueMatches.length} leagues matching "${query}". Please be more specific.`,
            },
            source: "League Database",
            lastUpdated: now,
          };
        }
      }
      
      // Event resolution - search events table
      if (entityType === "event" || entityType === "auto") {
        let sql = `SELECT id, home_team, away_team, sport_key, league_key, start_at, venue FROM events WHERE LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?`;
        const params: any[] = [`%${query}%`, `%${query}%`];
        
        if (sportFilter) {
          sql += ` AND LOWER(sport_key) LIKE ?`;
          params.push(`%${sportFilter}%`);
        }
        
        sql += ` ORDER BY start_at DESC LIMIT 10`;
        const { results } = await db.prepare(sql).bind(...params).all();
        
        if (results.length > 0) {
          const teams = new Set<string>();
          const events: any[] = [];
          
          results.forEach((e: any) => {
            teams.add(e.home_team);
            teams.add(e.away_team);
            events.push({
              id: e.id,
              matchup: `${e.away_team} @ ${e.home_team}`,
              sport: e.sport_key,
              league: e.league_key,
              date: e.start_at,
              venue: e.venue,
            });
          });
          
          return {
            data: {
              resolved: true,
              entityType: "event",
              query,
              teams: Array.from(teams).filter(t => t.toLowerCase().includes(query)),
              events,
              matchCount: results.length,
            },
            source: "Events Database",
            lastUpdated: now,
          };
        }
      }
      
      // Fighter/athlete resolution for combat sports
      if ((isMMA || isBoxing) && (entityType === "athlete" || entityType === "fighter" || entityType === "auto")) {
        // Search events for fighter names (they appear in home_team/away_team for combat sports)
        let sql = `
          SELECT home_team, away_team, sport_key, start_at, COUNT(*) as fights
          FROM events 
          WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?)
          AND (LOWER(sport_key) LIKE '%mma%' OR LOWER(sport_key) LIKE '%boxing%' OR LOWER(sport_key) LIKE '%ufc%')
          GROUP BY CASE WHEN LOWER(home_team) LIKE ? THEN home_team ELSE away_team END
          ORDER BY fights DESC LIMIT 5
        `;
        const { results } = await db.prepare(sql).bind(`%${query}%`, `%${query}%`, `%${query}%`).all();
        
        if (results.length > 0) {
          const fighters = results.map((r: any) => ({
            name: (r.home_team as string).toLowerCase().includes(query) ? r.home_team : r.away_team,
            sport: r.sport_key,
            fights: r.fights,
          }));
          
          if (fighters.length === 1) {
            return {
              data: {
                resolved: true,
                entityType: "fighter",
                sport: fighters[0].sport,
                canonical: { name: fighters[0].name },
                fightsInDatabase: fighters[0].fights,
                query,
              },
              source: "Events Database",
              lastUpdated: now,
            };
          }
          
          return {
            data: {
              resolved: false,
              entityType: "fighter",
              query,
              suggestions: fighters,
              message: `Found ${fighters.length} fighters matching "${query}".`,
            },
            source: "Events Database",
            lastUpdated: now,
          };
        }
      }
      
      return { 
        data: { 
          resolved: false,
          query, 
          entityType,
          sport: sportFilter || "unknown",
          message: `Could not resolve "${query}" as a ${entityType === "auto" ? "team, league, or event" : entityType}. Try being more specific or check spelling.` 
        }, 
        source: "Entity Resolution", 
        lastUpdated: now 
      };
    }

    case "get_game_schedule": {
      const sport = args.sport || "nfl";
      const period = args.period;
      
      let query = `SELECT * FROM events WHERE sport_key = ?`;
      const params: any[] = [sport];
      
      if (period) {
        query += ` AND period_id = ?`;
        params.push(period);
      }
      
      query += ` ORDER BY start_at ASC LIMIT 20`;
      
      const { results } = await db.prepare(query).bind(...params).all();
      
      return {
        data: results.map((e: any) => ({
          id: e.id,
          homeTeam: e.home_team,
          awayTeam: e.away_team,
          startAt: e.start_at,
          status: e.status,
          venue: e.venue,
          homeScore: e.home_score,
          awayScore: e.away_score,
          period: e.period_id,
        })),
        source: "Schedule Feed",
        lastUpdated: now,
      };
    }

    case "get_game_details": {
      let game;
      
      if (args.game_id) {
        game = await db.prepare(`SELECT * FROM events WHERE id = ?`).bind(args.game_id).first();
      } else if (args.teams) {
        const searchTerm = `%${args.teams.toLowerCase()}%`;
        game = await db.prepare(`
          SELECT * FROM events 
          WHERE LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?
          ORDER BY start_at DESC LIMIT 1
        `).bind(searchTerm, searchTerm).first();
      }
      
      if (!game) {
        return { data: null, source: "Game Data", lastUpdated: now };
      }
      
      return {
        data: {
          id: game.id,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          startAt: game.start_at,
          status: game.status,
          venue: game.venue,
          broadcast: game.broadcast,
          homeScore: game.home_score,
          awayScore: game.away_score,
          winner: game.winner,
          period: game.period_id,
        },
        source: "Game Data",
        lastUpdated: now,
      };
    }

    case "get_live_state": {
      // Get live/current state of a game - scores, period, time remaining
      let game;
      
      if (args.event_id) {
        game = await db.prepare(`SELECT * FROM events WHERE id = ?`).bind(args.event_id).first();
      } else if (args.teams) {
        // Search for the most recent/active game matching these teams
        const searchTerm = `%${args.teams.toLowerCase().replace(/\s+vs\.?\s+/i, '%')}%`;
        let query = `
          SELECT * FROM events 
          WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?)
        `;
        const params: any[] = [searchTerm, searchTerm];
        
        if (args.sport) {
          query += ` AND LOWER(sport_key) LIKE ?`;
          params.push(`%${args.sport.toLowerCase()}%`);
        }
        
        // Prioritize: in-progress > today's games > most recent
        query += ` ORDER BY 
          CASE 
            WHEN status = 'in_progress' THEN 0 
            WHEN DATE(start_at) = DATE('now') THEN 1
            ELSE 2 
          END,
          start_at DESC 
          LIMIT 1`;
        
        game = await db.prepare(query).bind(...params).first();
      }
      
      if (!game) {
        return { 
          data: { found: false, message: "Game not found. Try specifying team names or event ID." }, 
          source: "Live Data", 
          lastUpdated: now 
        };
      }
      
      // Determine game state based on status and times
      const startAt = new Date(game.start_at as string);
      const nowDate = new Date();
      const isLive = game.status === 'in_progress' || game.status === 'live';
      const isUpcoming = game.status === 'scheduled' || nowDate < startAt;
      const isComplete = game.status === 'complete' || game.status === 'final' || game.winner;
      
      // Build live state response
      const liveState: any = {
        eventId: game.id,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeScore: game.home_score ?? null,
        awayScore: game.away_score ?? null,
        status: isLive ? 'LIVE' : isComplete ? 'FINAL' : 'SCHEDULED',
        startAt: game.start_at,
        venue: game.venue,
        sport: game.sport_key,
        league: game.league_key,
      };
      
      // Add period/quarter/half information
      if (game.period_id) {
        liveState.period = game.period_id;
        
        // Sport-specific period labels
        const sportKey = (game.sport_key as string || '').toLowerCase();
        if (sportKey.includes('soccer') || sportKey.includes('mls')) {
          liveState.periodLabel = game.period_id === 1 ? '1st Half' : game.period_id === 2 ? '2nd Half' : `Period ${game.period_id}`;
        } else if (sportKey.includes('football') || sportKey.includes('nfl') || sportKey.includes('ncaaf')) {
          liveState.periodLabel = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter', 'OT'][(game.period_id as number) - 1] || `Q${game.period_id}`;
        } else if (sportKey.includes('basketball') || sportKey.includes('nba') || sportKey.includes('ncaab')) {
          liveState.periodLabel = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter', 'OT'][(game.period_id as number) - 1] || `Q${game.period_id}`;
        } else if (sportKey.includes('hockey') || sportKey.includes('nhl')) {
          liveState.periodLabel = ['1st Period', '2nd Period', '3rd Period', 'OT', 'SO'][(game.period_id as number) - 1] || `P${game.period_id}`;
        } else if (sportKey.includes('baseball') || sportKey.includes('mlb')) {
          liveState.periodLabel = `${getOrdinalSuffix(game.period_id as number)} Inning`;
        }
      }
      
      // Add winner if complete
      if (isComplete && game.winner) {
        liveState.winner = game.winner;
      }
      
      // Add time context
      if (isUpcoming) {
        const diffMs = startAt.getTime() - nowDate.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        liveState.startsIn = diffHours > 0 ? `${diffHours}h ${diffMins}m` : `${diffMins}m`;
      }
      
      return {
        data: liveState,
        source: "Live Data",
        lastUpdated: now,
      };
    }

    case "get_standings": {
      const league = args.league || "americanfootball_nfl";
      const division = args.division;
      const season = args.season || new Date().getFullYear().toString();
      const includeTiebreakInfo = args.include_tiebreak_info !== false;
      
      // Check if this is a soccer competition
      const isSoccer = league.toLowerCase().includes("soccer") || 
                       league.toLowerCase().includes("epl") ||
                       league.toLowerCase().includes("liga") ||
                       league.toLowerCase().includes("serie") ||
                       league.toLowerCase().includes("bundesliga") ||
                       league.toLowerCase().includes("ligue");
      
      // Get competition config for tie-breakers
      const competition = findCompetitionByAlias(league);
      
      // First try dedicated standings table
      let query = `
        SELECT * FROM league_standings 
        WHERE LOWER(sport_key) LIKE ? AND season = ?
      `;
      const params: any[] = [`%${league.split('_').pop()?.toLowerCase()}%`, season];
      
      if (division) {
        query += ` AND (LOWER(division) LIKE ? OR LOWER(conference) LIKE ?)`;
        params.push(`%${division.toLowerCase()}%`, `%${division.toLowerCase()}%`);
      }
      
      // Sort by rank_overall for all sports, with appropriate secondary sort
      if (isSoccer) {
        // Soccer: sort by points (wins*3 + ties), then GD, then GF
        query += ` ORDER BY rank_overall ASC, (wins * 3 + ties) DESC, point_diff DESC, points_for DESC LIMIT 32`;
      } else {
        query += ` ORDER BY rank_overall ASC, wins DESC, point_diff DESC LIMIT 32`;
      }
      
      const { results: standingsData } = await db.prepare(query).bind(...params).all();
      
      if (standingsData.length > 0) {
        const lastUpdate = standingsData[0]?.updated_at as string || now;
        
        if (isSoccer) {
          // Soccer-specific table format: P, W, D, L, GF, GA, GD, Pts
          const soccerStandings = standingsData.map((s: any, idx: number) => {
            const played = (s.wins || 0) + (s.losses || 0) + (s.ties || 0);
            const points = (s.wins || 0) * 3 + (s.ties || 0);
            return {
              position: s.rank_overall || idx + 1,
              team: s.team_name,
              abbr: s.team_abbr,
              played,
              won: s.wins || 0,
              drawn: s.ties || 0,
              lost: s.losses || 0,
              goalsFor: s.points_for || 0,
              goalsAgainst: s.points_against || 0,
              goalDifference: s.point_diff || 0,
              points,
              form: s.last_10 || null,
              homeRecord: s.home_record,
              awayRecord: s.away_record,
              // Qualification/relegation status
              status: s.clinched_playoff === 1 ? "Champions League" : 
                      s.clinched_division === 1 ? "Europa League" : 
                      s.eliminated === 1 ? "Relegated" : null,
            };
          });
          
          // Build tie-breaker explanation
          let tiebreakExplanation = "";
          if (includeTiebreakInfo && competition) {
            const tbNames: Record<string, string> = {
              "goal_difference": "Goal Difference",
              "goals_scored": "Goals Scored",
              "h2h_points": "Head-to-Head Points",
              "h2h_gd": "Head-to-Head Goal Difference",
              "h2h_away_goals": "Head-to-Head Away Goals",
              "away_goals": "Away Goals Scored",
              "total_wins": "Total Wins",
              "fair_play": "Fair Play Points",
              "drawing_lots": "Drawing of Lots",
            };
            tiebreakExplanation = competition.tieBreakers
              .map((tb, i) => `${i + 1}. ${tbNames[tb] || tb}`)
              .join(", ");
          }
          
          // Determine qualification/relegation zones
          const totalTeams = soccerStandings.length;
          const zones = {
            championsLeague: { start: 1, end: Math.min(4, totalTeams) },
            europaLeague: { start: 5, end: Math.min(6, totalTeams) },
            relegation: { start: Math.max(totalTeams - 2, 1), end: totalTeams },
          };
          
          return {
            data: {
              league: competition?.name || league,
              shortName: competition?.shortName || league,
              country: competition?.country || "Unknown",
              format: "league",
              season,
              division,
              table: soccerStandings,
              columns: ["Pos", "Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"],
              zones,
              tieBreakers: {
                rules: competition?.tieBreakers || ["goal_difference", "goals_scored"],
                explanation: tiebreakExplanation || "Goal Difference, then Goals Scored",
              },
              note: "Points: 3 for win, 1 for draw, 0 for loss",
              totalTeams,
              source: standingsData[0]?.source || "League Table",
            },
            source: "League Standings",
            lastUpdated: lastUpdate,
          };
        }
        
        // Non-soccer (NFL, NBA, etc.) - standard format
        return {
          data: {
            league,
            division,
            season,
            standings: standingsData.map((s: any) => ({
              team: s.team_name,
              abbr: s.team_abbr,
              division: s.division,
              conference: s.conference,
              wins: s.wins,
              losses: s.losses,
              ties: s.ties,
              winPct: s.win_pct?.toFixed(3) || ".000",
              gamesBack: s.games_back,
              homeRecord: s.home_record,
              awayRecord: s.away_record,
              streak: s.streak,
              last10: s.last_10,
              pointsFor: s.points_for,
              pointsAgainst: s.points_against,
              pointDiff: s.point_diff,
              rankOverall: s.rank_overall,
              rankDivision: s.rank_division,
              clinched: s.clinched_playoff === 1 ? "Playoff" : s.clinched_division === 1 ? "Division" : null,
              eliminated: s.eliminated === 1,
            })),
            source: standingsData[0]?.source || "Standings Feed",
          },
          source: "League Standings",
          lastUpdated: lastUpdate,
        };
      }
      
      // Fallback: Calculate from completed events
      const { results: games } = await db.prepare(`
        SELECT home_team, away_team, home_score, away_score, winner, start_at
        FROM events 
        WHERE LOWER(sport_key) LIKE ? AND status = 'completed'
        ORDER BY start_at DESC
        LIMIT 200
      `).bind(`%${league.split('_').pop()?.toLowerCase()}%`).all();
      
      const teamRecords: Record<string, { wins: number; losses: number; ties: number; pf: number; pa: number }> = {};
      
      games.forEach((g: any) => {
        const homeTeam = g.home_team;
        const awayTeam = g.away_team;
        
        if (!teamRecords[homeTeam]) teamRecords[homeTeam] = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
        if (!teamRecords[awayTeam]) teamRecords[awayTeam] = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
        
        const homeScore = g.home_score || 0;
        const awayScore = g.away_score || 0;
        
        teamRecords[homeTeam].pf += homeScore;
        teamRecords[homeTeam].pa += awayScore;
        teamRecords[awayTeam].pf += awayScore;
        teamRecords[awayTeam].pa += homeScore;
        
        if (g.winner === homeTeam) {
          teamRecords[homeTeam].wins++;
          teamRecords[awayTeam].losses++;
        } else if (g.winner === awayTeam) {
          teamRecords[awayTeam].wins++;
          teamRecords[homeTeam].losses++;
        } else if (homeScore === awayScore) {
          teamRecords[homeTeam].ties++;
          teamRecords[awayTeam].ties++;
        }
      });
      
      if (isSoccer) {
        // Calculate soccer table from game results
        const soccerTable = Object.entries(teamRecords)
          .map(([team, record], idx) => {
            const played = record.wins + record.losses + record.ties;
            const points = record.wins * 3 + record.ties;
            return {
              position: idx + 1,
              team,
              played,
              won: record.wins,
              drawn: record.ties,
              lost: record.losses,
              goalsFor: record.pf,
              goalsAgainst: record.pa,
              goalDifference: record.pf - record.pa,
              points,
            };
          })
          .filter(t => !division || t.team.toLowerCase().includes(division.toLowerCase()))
          .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
          .map((t, idx) => ({ ...t, position: idx + 1 }))
          .slice(0, 20);
        
        return {
          data: {
            league: competition?.name || league,
            shortName: competition?.shortName || league,
            format: "league",
            season,
            table: soccerTable,
            columns: ["Pos", "Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"],
            tieBreakers: {
              rules: competition?.tieBreakers || ["goal_difference", "goals_scored"],
              explanation: "Goal Difference, then Goals Scored",
            },
            gamesAnalyzed: games.length,
            note: "Table calculated from match results. Official standings data may differ.",
          },
          source: "Calculated Table",
          lastUpdated: now,
        };
      }
      
      // Non-soccer fallback
      const standings = Object.entries(teamRecords)
        .map(([team, record]) => ({
          team,
          ...record,
          winPct: record.wins + record.losses > 0 ? (record.wins / (record.wins + record.losses)).toFixed(3) : ".000",
          diff: record.pf - record.pa,
        }))
        .filter(t => !division || t.team.toLowerCase().includes(division.toLowerCase()))
        .sort((a, b) => b.wins - a.wins || b.diff - a.diff)
        .slice(0, 20);
      
      return {
        data: { 
          league, 
          division, 
          standings, 
          gamesAnalyzed: games.length,
          note: "Standings calculated from game results. Official standings data coming soon.",
        },
        source: "Calculated Standings",
        lastUpdated: now,
      };
    }

    case "get_team_recent_results": {
      const team = args.team?.toLowerCase() || "";
      const limit = Math.min(args.limit || 5, 10);
      
      const { results } = await db.prepare(`
        SELECT id, home_team, away_team, home_score, away_score, winner, start_at, status, sport_key
        FROM events 
        WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?) AND status = 'completed'
        ORDER BY start_at DESC
        LIMIT ?
      `).bind(`%${team}%`, `%${team}%`, limit).all();
      
      const recentGames = results.map((g: any) => {
        const isHome = g.home_team.toLowerCase().includes(team);
        const teamName = isHome ? g.home_team : g.away_team;
        const opponent = isHome ? g.away_team : g.home_team;
        const teamScore = isHome ? g.home_score : g.away_score;
        const oppScore = isHome ? g.away_score : g.home_score;
        const result = g.winner === teamName ? "W" : g.winner ? "L" : "T";
        
        return {
          date: g.start_at,
          opponent,
          location: isHome ? "Home" : "Away",
          score: `${teamScore}-${oppScore}`,
          result,
        };
      });
      
      const record = recentGames.reduce((acc, g) => {
        if (g.result === "W") acc.wins++;
        else if (g.result === "L") acc.losses++;
        else acc.ties++;
        return acc;
      }, { wins: 0, losses: 0, ties: 0 });
      
      return {
        data: { team, games: recentGames, record, form: recentGames.map(g => g.result).join("-") },
        source: "Game Results",
        lastUpdated: now,
      };
    }

    case "get_team_form": {
      const team = args.team?.toLowerCase() || "";
      const competition = args.competition?.toLowerCase() || "";
      const includeAll = args.include_all_competitions !== false;
      
      // Build query - optionally filter by competition
      let query = `
        SELECT id, home_team, away_team, home_score, away_score, winner, start_at, status, sport_key, venue
        FROM events 
        WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?) 
          AND status = 'completed'
      `;
      const params: any[] = [`%${team}%`, `%${team}%`];
      
      if (competition && !includeAll) {
        query += ` AND LOWER(sport_key) LIKE ?`;
        params.push(`%${competition}%`);
      }
      
      query += ` ORDER BY start_at DESC LIMIT 5`;
      
      const stmt = db.prepare(query);
      const { results } = await stmt.bind(...params).all();
      
      const matches = results.map((m: any) => {
        const isHome = m.home_team.toLowerCase().includes(team);
        const teamName = isHome ? m.home_team : m.away_team;
        const opponent = isHome ? m.away_team : m.home_team;
        const goalsFor = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
        const goalsAgainst = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
        
        let result: "W" | "D" | "L";
        if (m.winner === teamName) result = "W";
        else if (m.winner === null || m.winner === "") result = "D";
        else result = "L";
        
        return {
          date: m.start_at,
          competition: m.sport_key,
          opponent,
          venue: isHome ? "H" : "A",
          goalsFor,
          goalsAgainst,
          score: `${goalsFor}-${goalsAgainst}`,
          result,
        };
      });
      
      // Calculate form string (most recent first)
      const formString = matches.map(m => m.result).join("");
      
      // Calculate stats
      const stats = matches.reduce((acc, m) => {
        if (m.result === "W") acc.wins++;
        else if (m.result === "D") acc.draws++;
        else acc.losses++;
        acc.goalsFor += m.goalsFor;
        acc.goalsAgainst += m.goalsAgainst;
        return acc;
      }, { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, played: matches.length });
      
      // Points (soccer: 3 for win, 1 for draw)
      const points = (stats.wins * 3) + stats.draws;
      const pointsPerGame = stats.played > 0 ? (points / stats.played).toFixed(2) : "0.00";
      
      // Home/Away breakdown
      const homeMatches = matches.filter(m => m.venue === "H");
      const awayMatches = matches.filter(m => m.venue === "A");
      const homeForm = homeMatches.map(m => m.result).join("");
      const awayForm = awayMatches.map(m => m.result).join("");
      
      return {
        data: {
          team: args.team,
          form: formString,
          formReadable: formString.split("").join("-"), // W-D-W-L-W
          last5Matches: matches,
          summary: {
            played: stats.played,
            wins: stats.wins,
            draws: stats.draws,
            losses: stats.losses,
            goalsFor: stats.goalsFor,
            goalsAgainst: stats.goalsAgainst,
            goalDifference: stats.goalsFor - stats.goalsAgainst,
            points,
            pointsPerGame,
          },
          homeForm,
          awayForm,
          competitions: [...new Set(matches.map(m => m.competition))],
        },
        source: "Match Results Database",
        lastUpdated: now,
      };
    }

    case "get_head_to_head": {
      const teamA = args.team_a?.toLowerCase() || "";
      const teamB = args.team_b?.toLowerCase() || "";
      const limit = Math.min(args.limit || 5, 10);
      
      const { results } = await db.prepare(`
        SELECT id, home_team, away_team, home_score, away_score, winner, start_at, venue
        FROM events 
        WHERE ((LOWER(home_team) LIKE ? AND LOWER(away_team) LIKE ?) 
           OR (LOWER(home_team) LIKE ? AND LOWER(away_team) LIKE ?))
          AND status = 'completed'
        ORDER BY start_at DESC
        LIMIT ?
      `).bind(`%${teamA}%`, `%${teamB}%`, `%${teamB}%`, `%${teamA}%`, limit).all();
      
      const matchups = results.map((g: any) => ({
        date: g.start_at,
        home: g.home_team,
        away: g.away_team,
        score: `${g.away_team} ${g.away_score} - ${g.home_score} ${g.home_team}`,
        winner: g.winner,
        venue: g.venue,
      }));
      
      // Calculate series record
      const seriesRecord = { teamAWins: 0, teamBWins: 0, ties: 0 };
      matchups.forEach(m => {
        if (m.winner?.toLowerCase().includes(teamA)) seriesRecord.teamAWins++;
        else if (m.winner?.toLowerCase().includes(teamB)) seriesRecord.teamBWins++;
        else seriesRecord.ties++;
      });
      
      return {
        data: { teamA, teamB, matchups, seriesRecord, totalMeetings: matchups.length },
        source: "Head-to-Head History",
        lastUpdated: now,
      };
    }

    case "get_team_stats": {
      const team = args.team?.toLowerCase() || "";
      const sport = args.sport || "";
      
      // Calculate stats from completed games
      const { results } = await db.prepare(`
        SELECT home_team, away_team, home_score, away_score, winner
        FROM events 
        WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?) 
          AND status = 'completed'
          ${sport ? "AND sport_key LIKE ?" : ""}
        ORDER BY start_at DESC
        LIMIT 50
      `).bind(`%${team}%`, `%${team}%`, ...(sport ? [`%${sport}%`] : [])).all();
      
      let teamName = "";
      let totalPF = 0, totalPA = 0, wins = 0, losses = 0, homeWins = 0, awayWins = 0;
      
      results.forEach((g: any) => {
        const isHome = g.home_team.toLowerCase().includes(team);
        teamName = isHome ? g.home_team : g.away_team;
        const pf = isHome ? g.home_score : g.away_score;
        const pa = isHome ? g.away_score : g.home_score;
        totalPF += pf || 0;
        totalPA += pa || 0;
        
        if (g.winner === teamName) {
          wins++;
          if (isHome) homeWins++;
          else awayWins++;
        } else if (g.winner) {
          losses++;
        }
      });
      
      const gamesPlayed = results.length;
      
      return {
        data: {
          team: teamName || team,
          gamesPlayed,
          record: `${wins}-${losses}`,
          ppg: gamesPlayed > 0 ? (totalPF / gamesPlayed).toFixed(1) : "0.0",
          oppg: gamesPlayed > 0 ? (totalPA / gamesPlayed).toFixed(1) : "0.0",
          pointDiff: totalPF - totalPA,
          homeRecord: `${homeWins}-${results.filter((g: any) => g.home_team.toLowerCase().includes(team)).length - homeWins}`,
          awayRecord: `${awayWins}-${results.filter((g: any) => g.away_team.toLowerCase().includes(team)).length - awayWins}`,
        },
        source: "Team Statistics",
        lastUpdated: now,
      };
    }

    case "get_venue_info": {
      let venueName = args.venue_name;
      
      if (!venueName && args.game_id) {
        const game = await db.prepare(`SELECT venue FROM events WHERE id = ?`).bind(args.game_id).first();
        venueName = game?.venue as string;
      }
      
      // Known venue data (expandable)
      const venueData: Record<string, any> = {
        "arrowhead stadium": { city: "Kansas City, MO", surface: "Grass", roof: "Open", capacity: 76416, elevation: 820 },
        "sofi stadium": { city: "Inglewood, CA", surface: "Turf", roof: "Retractable", capacity: 70240, elevation: 131 },
        "lambeau field": { city: "Green Bay, WI", surface: "Grass", roof: "Open", capacity: 81441, elevation: 639 },
        "highmark stadium": { city: "Orchard Park, NY", surface: "Turf", roof: "Open", capacity: 71608, elevation: 597 },
        "empower field": { city: "Denver, CO", surface: "Grass", roof: "Open", capacity: 76125, elevation: 5280 },
      };
      
      const venueKey = venueName?.toLowerCase() || "";
      const info = Object.entries(venueData).find(([k]) => venueKey.includes(k))?.[1];
      
      return {
        data: {
          venue: venueName || "Unknown",
          ...(info || { message: "Detailed venue data not available. Check game details for basic venue information." }),
          outdoorWeatherFactor: info?.roof === "Open" ? "Yes - weather impacts gameplay" : "No - climate controlled",
        },
        source: "Venue Database",
        lastUpdated: now,
      };
    }

    case "search_knowledge_base": {
      const query = args.query?.toLowerCase() || "";
      const category = args.category;
      
      // Built-in knowledge base
      const knowledgeBase = [
        { id: "spread", category: "glossary", title: "Point Spread", content: "The point spread is a margin of victory set by oddsmakers. The favorite must win by more than the spread, while the underdog can lose by less than the spread (or win outright) to cover.", keywords: ["spread", "line", "ats", "against the spread"] },
        { id: "total", category: "glossary", title: "Over/Under (Total)", content: "The total is the combined score of both teams. Bettors wager whether the actual combined score will be over or under this number.", keywords: ["total", "over", "under", "o/u"] },
        { id: "moneyline", category: "glossary", title: "Moneyline", content: "A moneyline bet is simply picking which team will win, regardless of the margin. Odds indicate the payout: negative odds show the favorite, positive odds show the underdog.", keywords: ["moneyline", "ml", "straight up", "win"] },
        { id: "pickem", category: "pool_format", title: "Pick'em Pool", content: "In a pick'em pool, participants select winners for each game. Points are awarded for correct picks. Some pools use confidence points where you rank your picks by confidence level.", keywords: ["pickem", "pick em", "picks", "confidence"] },
        { id: "survivor", category: "pool_format", title: "Survivor Pool", content: "In a survivor/eliminator pool, you pick one team to win each week. If your team wins, you advance. If they lose, you're eliminated. You can only use each team once all season.", keywords: ["survivor", "eliminator", "knockout", "last man standing"] },
        { id: "nfl_ot", category: "league_rules", title: "NFL Overtime Rules", content: "In regular season, each team gets one possession unless the first team scores a touchdown. If tied after one OT period (10 min), the game ends in a tie. Playoffs use sudden death after both teams possess.", keywords: ["overtime", "ot", "nfl", "tie"] },
        { id: "locks", category: "app_help", title: "Pick Lock Times", content: "Picks lock at the scheduled game time. Once a game starts, you cannot change your pick for that game. Submit picks early to ensure they're recorded.", keywords: ["lock", "deadline", "submit", "picks"] },
        { id: "receipts", category: "app_help", title: "Pick Receipts", content: "Pick receipts are timestamped records of your submissions. They serve as proof of your picks and include a hash for verification. View receipts from your picks history.", keywords: ["receipt", "proof", "timestamp", "verification"] },
      ];
      
      // Search and rank results
      const results = knowledgeBase
        .filter(article => {
          if (category && article.category !== category) return false;
          return article.title.toLowerCase().includes(query) ||
                 article.content.toLowerCase().includes(query) ||
                 article.keywords.some(k => query.includes(k) || k.includes(query));
        })
        .slice(0, 5);
      
      return {
        data: {
          query,
          results: results.map(r => ({ title: r.title, content: r.content, category: r.category })),
          totalMatches: results.length,
        },
        source: "Knowledge Base",
        lastUpdated: now,
      };
    }

    case "get_lines_history": {
      // Get game first
      let gameId = args.game_id;
      let gameInfo = null;
      
      if (!gameId && args.teams) {
        const searchTerm = `%${args.teams.toLowerCase()}%`;
        const game = await db.prepare(`
          SELECT id, external_id, home_team, away_team, start_at, status FROM events 
          WHERE LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?
          ORDER BY start_at DESC LIMIT 1
        `).bind(searchTerm, searchTerm).first();
        gameId = game?.id;
        gameInfo = game;
      } else if (gameId) {
        gameInfo = await db.prepare(`SELECT * FROM events WHERE id = ?`).bind(gameId).first();
      }
      
      if (!gameId) {
        return { data: { message: "Game not found" }, source: "Lines Feed", lastUpdated: now };
      }
      
      const externalId = (gameInfo as any)?.external_id || gameId.toString();
      
      // Get opening lines
      const { results: openingLines } = await db.prepare(`
        SELECT * FROM odds_opening 
        WHERE game_id = ?
        ORDER BY opened_at ASC
      `).bind(externalId).all();
      
      // Get current odds from odds_quotes
      const { results: currentOdds } = await db.prepare(`
        SELECT * FROM odds_quotes 
        WHERE game_id = ?
        ORDER BY updated_at DESC
      `).bind(externalId).all();
      
      // Get historical snapshots
      const { results: snapshots } = await db.prepare(`
        SELECT * FROM odds_snapshots 
        WHERE game_id = ?
        ORDER BY captured_at ASC
        LIMIT 50
      `).bind(externalId).all();
      
      // Group current odds by market
      const markets: Record<string, any[]> = {};
      currentOdds.forEach((o: any) => {
        const key = o.market_key || "spreads";
        if (!markets[key]) markets[key] = [];
        markets[key].push({
          bookmaker: o.bookmaker_key,
          outcome: o.outcome_key,
          line: o.line_value,
          priceAmerican: o.price_american,
          priceDecimal: o.price_decimal,
          impliedProb: o.implied_probability,
        });
      });
      
      // Calculate line movement
      const spreadSnapshots = snapshots.filter((s: any) => s.market_key === "spreads");
      let movement = null;
      if (spreadSnapshots.length >= 2) {
        const first = spreadSnapshots[0] as any;
        const last = spreadSnapshots[spreadSnapshots.length - 1] as any;
        movement = {
          openLine: first.line_value,
          currentLine: last.line_value,
          change: last.line_value - first.line_value,
          direction: last.line_value > first.line_value ? "up" : last.line_value < first.line_value ? "down" : "flat",
          snapshots: spreadSnapshots.length,
        };
      }
      
      const lastUpdate = currentOdds.length > 0 
        ? (currentOdds[0] as any).updated_at 
        : snapshots.length > 0 
          ? (snapshots[snapshots.length - 1] as any).captured_at 
          : now;
      
      return {
        data: {
          gameId,
          game: gameInfo ? {
            homeTeam: (gameInfo as any).home_team,
            awayTeam: (gameInfo as any).away_team,
            startAt: (gameInfo as any).start_at,
            status: (gameInfo as any).status,
          } : null,
          openingLines: openingLines.map((o: any) => ({
            market: o.market_key,
            outcome: o.outcome_key,
            line: o.opening_line_value,
            price: o.opening_price_american,
            openedAt: o.opened_at,
          })),
          currentLines: markets,
          lineMovement: movement,
          snapshotCount: snapshots.length,
          history: snapshots.slice(-10).map((s: any) => ({
            market: s.market_key,
            outcome: s.outcome_key,
            line: s.line_value,
            price: s.price_american,
            capturedAt: s.captured_at,
          })),
        },
        source: "Odds Feed",
        lastUpdated: lastUpdate,
      };
    }

    case "get_market_averages": {
      let gameId = args.game_id;
      let gameInfo = null;
      
      if (!gameId && args.teams) {
        const searchTerm = `%${args.teams.toLowerCase()}%`;
        const game = await db.prepare(`
          SELECT id, external_id, home_team, away_team, start_at FROM events 
          WHERE LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?
          ORDER BY start_at DESC LIMIT 1
        `).bind(searchTerm, searchTerm).first();
        gameId = game?.id;
        gameInfo = game;
      } else if (gameId) {
        gameInfo = await db.prepare(`SELECT * FROM events WHERE id = ?`).bind(gameId).first();
      }
      
      if (!gameId) {
        return { data: { message: "Game not found" }, source: "Market Data", lastUpdated: now };
      }
      
      const externalId = (gameInfo as any)?.external_id || gameId.toString();
      
      // Get all current odds for this game from odds_quotes
      const { results: odds } = await db.prepare(`
        SELECT * FROM odds_quotes WHERE game_id = ?
      `).bind(externalId).all();
      
      if (odds.length === 0) {
        return { 
          data: { 
            gameId, 
            game: gameInfo ? {
              homeTeam: (gameInfo as any).home_team,
              awayTeam: (gameInfo as any).away_team,
            } : null,
            message: "No odds data currently available for this game." 
          }, 
          source: "Market Data", 
          lastUpdated: now 
        };
      }
      
      // Group by market type
      const spreadOdds = odds.filter((o: any) => o.market_key === "spreads" && o.line_value !== null);
      const totalOdds = odds.filter((o: any) => o.market_key === "totals" && o.line_value !== null);
      // Filter moneyline odds for potential future use
      odds.filter((o: any) => o.market_key === "h2h");
      
      // Calculate spread consensus
      const homeSpreadLines = spreadOdds
        .filter((o: any) => o.outcome_key === (gameInfo as any)?.home_team)
        .map((o: any) => o.line_value);
      const avgSpread = homeSpreadLines.length > 0 
        ? homeSpreadLines.reduce((a: number, b: number) => a + b, 0) / homeSpreadLines.length 
        : null;
      
      // Calculate totals consensus
      const overLines = totalOdds
        .filter((o: any) => o.outcome_key === "Over")
        .map((o: any) => o.line_value);
      const avgTotal = overLines.length > 0 
        ? overLines.reduce((a: number, b: number) => a + b, 0) / overLines.length 
        : null;
      
      // Get unique bookmakers
      const bookmakers = [...new Set(odds.map((o: any) => o.bookmaker_key))];
      
      // Calculate best lines
      const bestHomeSpread = homeSpreadLines.length > 0 ? Math.max(...homeSpreadLines) : null;
      const bestAwaySpread = homeSpreadLines.length > 0 ? Math.min(...homeSpreadLines) * -1 : null;
      const bestOver = overLines.length > 0 ? Math.min(...overLines) : null;
      const bestUnder = overLines.length > 0 ? Math.max(...overLines) : null;
      
      const lastUpdate = odds.length > 0 ? (odds[0] as any).updated_at : now;
      
      return {
        data: {
          gameId,
          game: gameInfo ? {
            homeTeam: (gameInfo as any).home_team,
            awayTeam: (gameInfo as any).away_team,
            startAt: (gameInfo as any).start_at,
          } : null,
          consensus: {
            spread: avgSpread ? avgSpread.toFixed(1) : "N/A",
            total: avgTotal ? avgTotal.toFixed(1) : "N/A",
          },
          spreadRange: homeSpreadLines.length > 0 ? {
            min: Math.min(...homeSpreadLines),
            max: Math.max(...homeSpreadLines),
            variance: Math.max(...homeSpreadLines) - Math.min(...homeSpreadLines),
          } : null,
          totalRange: overLines.length > 0 ? {
            min: Math.min(...overLines),
            max: Math.max(...overLines),
            variance: Math.max(...overLines) - Math.min(...overLines),
          } : null,
          bestLines: {
            homeSpread: bestHomeSpread,
            awaySpread: bestAwaySpread,
            over: bestOver,
            under: bestUnder,
          },
          bookmakerCount: bookmakers.length,
          bookmakers,
          totalQuotes: odds.length,
        },
        source: "Market Consensus",
        lastUpdated: lastUpdate,
      };
    }

    case "get_injuries": {
      const team = args.team?.toLowerCase() || "";
      const sport = args.sport || "nfl";
      
      // Check injuries table
      const { results } = await db.prepare(`
        SELECT * FROM injuries 
        WHERE (LOWER(team_abbr) LIKE ? OR LOWER(team_name) LIKE ?) 
          AND LOWER(sport_key) LIKE ?
        ORDER BY 
          CASE status 
            WHEN 'Out' THEN 1 
            WHEN 'Doubtful' THEN 2 
            WHEN 'Questionable' THEN 3 
            WHEN 'Probable' THEN 4 
            ELSE 5 
          END,
          updated_at DESC
        LIMIT 20
      `).bind(`%${team}%`, `%${team}%`, `%${sport}%`).all();
      
      const lastUpdate = results.length > 0 ? (results[0]?.updated_at as string) : now;
      
      // Group by status for better presentation
      const byStatus: Record<string, any[]> = {};
      results.forEach((i: any) => {
        const status = i.status || "Unknown";
        if (!byStatus[status]) byStatus[status] = [];
        byStatus[status].push({
          player: i.player_name,
          position: i.position,
          injury: i.injury_type,
          details: i.injury_details,
          estimatedReturn: i.estimated_return,
          impact: i.impact_rating,
          reportedAt: i.reported_at,
        });
      });
      
      return {
        data: {
          team,
          sport,
          totalInjuries: results.length,
          injuriesByStatus: byStatus,
          injuries: results.map((i: any) => ({
            player: i.player_name,
            position: i.position,
            status: i.status,
            injury: i.injury_type,
            details: i.injury_details,
            estimatedReturn: i.estimated_return,
            impact: i.impact_rating,
            lastUpdated: i.updated_at,
          })),
          message: results.length === 0 
            ? "No injury data currently available for this team. Data updates periodically from official sources."
            : undefined,
        },
        source: "Injury Reports",
        lastUpdated: lastUpdate,
      };
    }

    case "get_weather": {
      const gameId = args.game_id;
      const venue = args.venue?.toLowerCase() || "";
      
      // Try to find weather forecast
      let weatherResult;
      
      if (gameId) {
        // Look up by game ID
        weatherResult = await db.prepare(`
          SELECT wf.*, e.home_team, e.away_team, e.start_at, e.venue as event_venue
          FROM weather_forecasts wf
          LEFT JOIN events e ON wf.game_id = e.id
          WHERE wf.game_id = ?
          ORDER BY wf.updated_at DESC
          LIMIT 1
        `).bind(gameId).first();
      }
      
      if (!weatherResult && venue) {
        // Look up by venue name
        weatherResult = await db.prepare(`
          SELECT * FROM weather_forecasts 
          WHERE LOWER(venue_name) LIKE ?
          ORDER BY forecast_time DESC
          LIMIT 1
        `).bind(`%${venue}%`).first();
      }
      
      if (weatherResult) {
        const w = weatherResult as any;
        return {
          data: {
            venue: w.venue_name,
            gameId: w.game_id,
            forecastTime: w.forecast_time,
            isDome: w.is_dome === 1,
            forecast: {
              temp: w.temp_fahrenheit,
              feelsLike: w.feels_like_fahrenheit,
              tempUnit: "F",
              conditions: w.conditions,
              wind: { 
                speed: w.wind_speed_mph, 
                gust: w.wind_gust_mph,
                direction: w.wind_direction 
              },
              precipitation: w.precipitation_chance,
              precipType: w.precipitation_type,
              humidity: w.humidity,
              visibility: w.visibility_miles,
            },
            gameImpact: {
              score: w.game_impact_score,
              notes: w.game_impact_notes,
            },
          },
          source: w.source || "Weather Feed",
          lastUpdated: w.updated_at || now,
        };
      }
      
      // No forecast found - return helpful message
      return {
        data: {
          venue: args.venue || "Unknown Venue",
          gameId: gameId || null,
          message: "No weather forecast currently available. Weather data is updated closer to game time for outdoor venues.",
          isDome: false,
        },
        source: "Weather Feed",
        lastUpdated: now,
      };
    }

    case "get_pool_rules": {
      const poolId = args.pool_id;
      
      const league = await db.prepare(`
        SELECT * FROM leagues WHERE id = ?
      `).bind(poolId).first();
      
      if (!league) {
        return { data: null, source: "Pool Settings", lastUpdated: now };
      }
      
      let rulesData: Record<string, unknown> = {};
      if (league.rules_json) {
        try {
          rulesData = JSON.parse(league.rules_json as string);
        } catch {
          rulesData = {};
        }
      }
      
      return {
        data: {
          poolId: args.pool_id,
          name: league.name,
          sport: league.sport_key,
          format: league.format_key,
          entryFee: league.entry_fee_cents ? (league.entry_fee_cents as number / 100) : 0,
          rules: {
            pointsPerWin: rulesData.pointsPerWin || 1,
            tiebreakerType: rulesData.tiebreakerType || "total_points",
            lockTime: rulesData.pickDeadline || "Game time",
            survivorType: rulesData.survivorType,
            survivorVariant: rulesData.survivorVariant,
          },
        },
        source: "Pool Settings",
        lastUpdated: (league.updated_at as string) || now,
      };
    }

    case "get_match_context": {
      const cacheKey = generateCacheKey("match_context", {
        game_id: args.game_id,
        home: args.home_team,
        away: args.away_team,
        comp: args.competition
      });
      
      const cached = await getCachedData(db, cacheKey);
      if (cached) {
        return { data: cached, source: "Match Context (cached)", lastUpdated: cached.cachedAt || now };
      }
      
      let homeTeam = args.home_team || "";
      let awayTeam = args.away_team || "";
      let sportKey = "";
      let roundName = "";
      let periodId = "";
      
      // Get game data if game_id provided
      if (args.game_id) {
        const game = await db.prepare(`SELECT * FROM events WHERE id = ?`).bind(args.game_id).first();
        if (game) {
          homeTeam = game.home_team as string || "";
          awayTeam = game.away_team as string || "";
          sportKey = game.sport_key as string || "";
          periodId = game.period_id as string || "";
        }
      }
      
      // Find competition from provided name or sport_key
      const compQuery = args.competition || sportKey;
      const competition = compQuery ? findCompetitionByAlias(compQuery) : undefined;
      if (competition) {
        sportKey = competition.key;
      }
      
      // Get standings positions if available (for league matches)
      let homeStanding: number | undefined;
      let awayStanding: number | undefined;
      let totalTeams = 20; // Default for most leagues
      
      if (sportKey && competition?.format === "league") {
        // Try to get standings for both teams
        const standings = await db.prepare(`
          SELECT team_name, rank_overall 
          FROM league_standings 
          WHERE sport_key = ? OR league_key = ?
          ORDER BY rank_overall ASC
        `).bind(sportKey, sportKey).all();
        
        if (standings.results.length > 0) {
          totalTeams = standings.results.length;
          for (const row of standings.results) {
            const teamName = (row.team_name as string || "").toLowerCase();
            if (teamName.includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(teamName)) {
              homeStanding = row.rank_overall as number;
            }
            if (teamName.includes(awayTeam.toLowerCase()) || awayTeam.toLowerCase().includes(teamName)) {
              awayStanding = row.rank_overall as number;
            }
          }
        }
      }
      
      // Build comprehensive match context
      const context = buildMatchContext(
        homeTeam,
        awayTeam,
        sportKey,
        roundName,
        periodId,
        homeStanding,
        awayStanding,
        totalTeams
      );
      
      // Add standings info to context
      const enhancedContext = {
        ...context,
        homeTeam,
        awayTeam,
        homeStanding: homeStanding || null,
        awayStanding: awayStanding || null,
        totalTeamsInLeague: totalTeams,
        matchDescription: buildMatchDescription(context, homeTeam, awayTeam, homeStanding, awayStanding)
      };
      
      // Cache for 30 minutes
      await setCachedData(db, "get_match_context", cacheKey, enhancedContext, "Match Context", now);
      
      return {
        data: enhancedContext,
        source: "Match Context",
        lastUpdated: now
      };
    }

    case "get_user_picks": {
      const userPoolId = args.pool_id;
      const period = args.period;
      
      let query = `
        SELECT p.*, e.home_team, e.away_team, e.start_at, e.status, e.winner
        FROM picks p
        LEFT JOIN events e ON p.event_id = e.id
        WHERE p.user_id = ? AND p.league_id = ?
      `;
      const params: any[] = [userId, userPoolId];
      
      if (period) {
        query += ` AND p.period_id = ?`;
        params.push(period);
      }
      
      query += ` ORDER BY e.start_at ASC`;
      
      const { results } = await db.prepare(query).bind(...params).all();
      
      return {
        data: {
          poolId: args.pool_id,
          period,
          picks: results.map((p: any) => ({
            eventId: p.event_id,
            matchup: `${p.away_team} @ ${p.home_team}`,
            pick: p.pick_value,
            confidence: p.confidence_rank,
            status: p.status,
            result: p.is_correct !== null ? (p.is_correct ? "Win" : "Loss") : "Pending",
            pointsEarned: p.points_earned || 0,
          })),
          totalPicks: results.length,
        },
        source: "User Picks",
        lastUpdated: now,
      };
    }

    // ==========================================
    // COMBAT SPORTS TOOLS
    // ==========================================
    
    case "get_fight_card": {
      const eventId = args.event_id;
      const eventName = args.event_name?.toLowerCase() || "";
      const promotion = args.promotion?.toLowerCase() || "";
      const eventDate = args.date;
      
      // Build query to find fight card events
      let query = `
        SELECT * FROM events 
        WHERE (LOWER(sport_key) LIKE '%mma%' OR LOWER(sport_key) LIKE '%ufc%' 
               OR LOWER(sport_key) LIKE '%boxing%' OR LOWER(sport_key) LIKE '%bellator%'
               OR LOWER(sport_key) LIKE '%pfl%' OR LOWER(sport_key) LIKE '%one%')
      `;
      const params: any[] = [];
      
      if (eventId) {
        query = `SELECT * FROM events WHERE id = ?`;
        params.push(eventId);
      } else {
        if (eventName) {
          query += ` AND (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ? OR LOWER(venue) LIKE ?)`;
          params.push(`%${eventName}%`, `%${eventName}%`, `%${eventName}%`);
        }
        if (promotion) {
          query += ` AND LOWER(sport_key) LIKE ?`;
          params.push(`%${promotion}%`);
        }
        if (eventDate) {
          query += ` AND DATE(start_at) = ?`;
          params.push(eventDate);
        }
        query += ` ORDER BY start_at DESC LIMIT 20`;
      }
      
      const stmt = eventId ? db.prepare(query).bind(...params) : db.prepare(query).bind(...params);
      const { results } = await stmt.all();
      
      if (results.length === 0) {
        return {
          data: {
            found: false,
            message: "No fight card found. Try searching by event name (e.g., 'UFC 300') or date.",
            searchedFor: { eventName, promotion, date: eventDate },
          },
          source: "Fight Card Database",
          lastUpdated: now,
        };
      }
      
      // Parse results into fight card format
      const bouts: FightBout[] = results.map((e: any, idx: number) => {
        const sportKey = (e.sport_key as string || "").toLowerCase();
        const isMMA = sportKey.includes("mma") || sportKey.includes("ufc") || sportKey.includes("bellator") || sportKey.includes("pfl");
        
        // Determine weight class from event metadata or sport_key
        let weightClass = "Unknown";
        let isTitleFight = false;
        const titleKeywords = ["title", "championship", "champion", "belt"];
        
        if (e.period_id) {
          const periodLower = (e.period_id as string).toLowerCase();
          // Try to extract weight class
          const wcMatch = findWeightClass(periodLower, isMMA ? "mma" : "boxing");
          if (wcMatch) weightClass = wcMatch.name;
          isTitleFight = titleKeywords.some(kw => periodLower.includes(kw));
        }
        
        // Determine bout type
        let boutType: BoutType = "main_card";
        if (idx === 0) boutType = "main_event";
        else if (idx === 1) boutType = "co_main";
        else if (e.period_id?.toLowerCase().includes("prelim")) boutType = "prelim";
        if (isTitleFight) boutType = "title_fight";
        
        // Parse result if available
        let result = undefined;
        if (e.status === "completed" || e.winner) {
          const methodParsed = e.broadcast ? parseResultMethod(e.broadcast as string) : { category: "Decision", detail: "Decision" };
          result = {
            winner: e.winner as string,
            method: methodParsed.detail,
            round: undefined,
            time: undefined,
          };
        }
        
        return {
          boutOrder: idx + 1,
          boutType,
          weightClass,
          isTitleFight,
          titleType: isTitleFight ? `${weightClass} Championship` : undefined,
          rounds: isTitleFight ? 5 : 3,
          fighter1: {
            name: e.home_team as string,
            record: undefined, // Would need separate fighter table
          },
          fighter2: {
            name: e.away_team as string,
            record: undefined,
          },
          result,
        } as FightBout;
      });
      
      // Build fight card response
      const mainEvent = bouts[0];
      const firstEvent = results[0] as any;
      
      // Detect promotion from sport_key
      let detectedPromotion = "MMA";
      const sportKey = (firstEvent.sport_key as string || "").toLowerCase();
      if (sportKey.includes("ufc")) detectedPromotion = "UFC";
      else if (sportKey.includes("bellator")) detectedPromotion = "Bellator";
      else if (sportKey.includes("pfl")) detectedPromotion = "PFL";
      else if (sportKey.includes("one")) detectedPromotion = "ONE Championship";
      else if (sportKey.includes("boxing")) detectedPromotion = "Boxing";
      
      const fightCard: FightCard = {
        eventId: firstEvent.id,
        eventName: firstEvent.venue || `${detectedPromotion} Event`,
        promotion: detectedPromotion,
        date: firstEvent.start_at,
        venue: firstEvent.venue,
        location: undefined,
        status: firstEvent.status === "completed" ? "completed" : 
                firstEvent.status === "in_progress" ? "live" : "scheduled",
        mainEvent,
        bouts,
        totalBouts: bouts.length,
      };
      
      // Add weight class reference
      const weightClasses = sportKey.includes("boxing") ? BOXING_WEIGHT_CLASSES : MMA_WEIGHT_CLASSES;
      
      return {
        data: {
          fightCard,
          weightClassReference: weightClasses.map(wc => ({
            name: wc.name,
            upperLimit: `${wc.upperLimit} lbs`,
          })),
          note: "Fight card data parsed from events database. Full fighter records require dedicated fighter database.",
        },
        source: "Fight Card Database",
        lastUpdated: firstEvent.updated_at || now,
      };
    }

    case "get_fighter_profile": {
      const fighterName = args.fighter_name?.toLowerCase() || "";
      const promotion = args.promotion?.toLowerCase() || "";
      
      // Search for fighter in events (fighters appear as home_team/away_team in combat sports)
      let query = `
        SELECT home_team, away_team, sport_key, start_at, status, winner, venue
        FROM events 
        WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?)
          AND (LOWER(sport_key) LIKE '%mma%' OR LOWER(sport_key) LIKE '%ufc%' 
               OR LOWER(sport_key) LIKE '%boxing%' OR LOWER(sport_key) LIKE '%bellator%')
      `;
      const params: any[] = [`%${fighterName}%`, `%${fighterName}%`];
      
      if (promotion) {
        query += ` AND LOWER(sport_key) LIKE ?`;
        params.push(`%${promotion}%`);
      }
      
      query += ` ORDER BY start_at DESC LIMIT 20`;
      
      const { results } = await db.prepare(query).bind(...params).all();
      
      if (results.length === 0) {
        return {
          data: {
            found: false,
            message: `No fight history found for "${args.fighter_name}". Check spelling or try a more common name variation.`,
          },
          source: "Fighter Database",
          lastUpdated: now,
        };
      }
      
      // Find the actual fighter name (case-preserved)
      let actualName = args.fighter_name;
      for (const r of results) {
        if ((r.home_team as string).toLowerCase().includes(fighterName)) {
          actualName = r.home_team as string;
          break;
        }
        if ((r.away_team as string).toLowerCase().includes(fighterName)) {
          actualName = r.away_team as string;
          break;
        }
      }
      
      // Calculate record from fight history
      let wins = 0, losses = 0, draws = 0;
      const recentFights: any[] = [];
      const opponents = new Set<string>();
      
      for (const fight of results) {
        const isHome = (fight.home_team as string).toLowerCase().includes(fighterName);
        const opponent = isHome ? fight.away_team : fight.home_team;
        opponents.add(opponent as string);
        
        if (fight.status === "completed" || fight.winner) {
          if (fight.winner === actualName || (isHome && fight.winner === fight.home_team)) {
            wins++;
          } else if (fight.winner) {
            losses++;
          } else {
            draws++;
          }
        }
        
        if (recentFights.length < 5) {
          recentFights.push({
            date: fight.start_at,
            opponent,
            event: fight.venue,
            result: fight.winner === actualName ? "Win" : fight.winner ? "Loss" : "Pending",
            promotion: (fight.sport_key as string || "").toUpperCase(),
          });
        }
      }
      
      // Detect promotion
      const sportKeys = results.map(r => (r.sport_key as string || "").toLowerCase());
      let detectedPromotion = "MMA";
      if (sportKeys.some(s => s.includes("ufc"))) detectedPromotion = "UFC";
      else if (sportKeys.some(s => s.includes("bellator"))) detectedPromotion = "Bellator";
      else if (sportKeys.some(s => s.includes("boxing"))) detectedPromotion = "Boxing";
      
      return {
        data: {
          found: true,
          name: actualName,
          promotion: detectedPromotion,
          record: formatFighterRecord(wins, losses, draws),
          recordBreakdown: { wins, losses, draws },
          totalFightsInDatabase: results.length,
          recentFights,
          opponents: Array.from(opponents).slice(0, 10),
          note: "Record calculated from available fight history in database. Official records may differ.",
        },
        source: "Fighter Database",
        lastUpdated: now,
      };
    }

    case "get_weight_class_rankings": {
      const weightClassQuery = args.weight_class?.toLowerCase() || "";
      const sport = args.sport?.toLowerCase() === "boxing" ? "boxing" : "mma";
      const promotion = args.promotion?.toLowerCase() || (sport === "mma" ? "ufc" : "boxing");
      
      // Find the weight class
      const weightClass = findWeightClass(weightClassQuery, sport);
      
      if (!weightClass) {
        const allClasses = sport === "boxing" ? BOXING_WEIGHT_CLASSES : MMA_WEIGHT_CLASSES;
        return {
          data: {
            found: false,
            message: `Weight class "${args.weight_class}" not found.`,
            availableClasses: allClasses.map(wc => ({
              name: wc.name,
              limit: `${wc.upperLimit} lbs`,
            })),
          },
          source: "Weight Class Database",
          lastUpdated: now,
        };
      }
      
      // Get fighters who have competed in this weight class
      const sportFilter = sport === "boxing" ? "%boxing%" : "%mma%|%ufc%|%bellator%";
      const { results } = await db.prepare(`
        SELECT home_team, away_team, winner, start_at, sport_key
        FROM events 
        WHERE (LOWER(sport_key) LIKE ? OR LOWER(sport_key) LIKE ?)
          AND LOWER(period_id) LIKE ?
        ORDER BY start_at DESC
        LIMIT 50
      `).bind(sportFilter, `%${promotion}%`, `%${weightClass.key}%`).all();
      
      // Build fighter stats from available data
      const fighterStats: Record<string, { wins: number; losses: number; lastFight: string }> = {};
      
      for (const fight of results) {
        const fighters = [fight.home_team as string, fight.away_team as string];
        for (const fighter of fighters) {
          if (!fighterStats[fighter]) {
            fighterStats[fighter] = { wins: 0, losses: 0, lastFight: fight.start_at as string };
          }
          if (fight.winner === fighter) fighterStats[fighter].wins++;
          else if (fight.winner) fighterStats[fighter].losses++;
        }
      }
      
      // Sort by wins (simple ranking)
      const rankedFighters = Object.entries(fighterStats)
        .map(([name, stats]) => ({
          name,
          record: formatFighterRecord(stats.wins, stats.losses),
          wins: stats.wins,
          losses: stats.losses,
          lastFight: stats.lastFight,
        }))
        .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
        .slice(0, 15);
      
      return {
        data: {
          weightClass: {
            name: weightClass.name,
            key: weightClass.key,
            upperLimit: `${weightClass.upperLimit} lbs`,
            sport: sport.toUpperCase(),
          },
          promotion: promotion.toUpperCase(),
          rankings: rankedFighters.map((f, i) => ({
            rank: i === 0 ? "Champion" : `#${i}`,
            name: f.name,
            record: f.record,
            lastFight: f.lastFight,
          })),
          totalFighters: rankedFighters.length,
          note: "Rankings derived from fight history in database. Official rankings may differ.",
          allWeightClasses: (sport === "boxing" ? BOXING_WEIGHT_CLASSES : MMA_WEIGHT_CLASSES).map(wc => ({
            name: wc.name,
            limit: `${wc.upperLimit} lbs`,
          })),
        },
        source: "Weight Class Rankings",
        lastUpdated: now,
      };
    }

    // ==========================================
    // TENNIS TOOLS
    // ==========================================
    
    case "get_tennis_rankings": {
      const tour = args.tour?.toLowerCase() === "wta" ? "wta" : "atp";
      const top = Math.min(args.top || 20, 100);
      
      // Search events to build player rankings from match data
      const sportFilter = tour === "wta" ? "%wta%" : "%atp%";
      const { results } = await db.prepare(`
        SELECT home_team, away_team, winner, start_at, sport_key, venue
        FROM events 
        WHERE (LOWER(sport_key) LIKE ? OR LOWER(sport_key) LIKE '%tennis%')
        ORDER BY start_at DESC
        LIMIT 200
      `).bind(sportFilter).all();
      
      // Build player stats from match results
      const playerStats: Record<string, { 
        wins: number; 
        losses: number; 
        lastMatch: string;
        tournaments: Set<string>;
      }> = {};
      
      for (const match of results) {
        const players = [match.home_team as string, match.away_team as string];
        const venue = match.venue as string || "";
        
        for (const player of players) {
          if (!player) continue;
          if (!playerStats[player]) {
            playerStats[player] = { wins: 0, losses: 0, lastMatch: match.start_at as string, tournaments: new Set() };
          }
          if (venue) playerStats[player].tournaments.add(venue);
          if (match.winner === player) playerStats[player].wins++;
          else if (match.winner) playerStats[player].losses++;
        }
      }
      
      // Calculate simple ranking points (wins weighted by recency)
      const rankedPlayers = Object.entries(playerStats)
        .map(([name, stats]) => ({
          name,
          wins: stats.wins,
          losses: stats.losses,
          winPct: stats.wins + stats.losses > 0 ? (stats.wins / (stats.wins + stats.losses) * 100).toFixed(1) : "0.0",
          points: stats.wins * 100, // Simplified point calculation
          tournaments: stats.tournaments.size,
          lastMatch: stats.lastMatch,
        }))
        .sort((a, b) => b.points - a.points || b.wins - a.wins)
        .slice(0, top);
      
      // Rankings built directly in the response below
      
      return {
        data: {
          tour: tour.toUpperCase(),
          tourName: tour === "wta" ? "Women's Tennis Association" : "Association of Tennis Professionals",
          asOf: now,
          rankings: rankedPlayers.map((p, idx) => ({
            rank: idx + 1,
            name: p.name,
            points: p.points,
            record: `${p.wins}-${p.losses}`,
            winPct: `${p.winPct}%`,
            tournaments: p.tournaments,
            lastMatch: p.lastMatch,
          })),
          totalPlayers: rankedPlayers.length,
          topTournaments: TENNIS_TOURNAMENTS.filter(t => t.tour === tour || t.tour === "grand_slam").slice(0, 5).map(t => ({
            name: t.name,
            category: t.category,
            surface: t.surface,
            points: t.rankingPoints,
          })),
          note: "Rankings calculated from available match data. Official ATP/WTA rankings may differ.",
        },
        source: `${tour.toUpperCase()} Rankings`,
        lastUpdated: now,
      };
    }

    case "get_tennis_tournament": {
      const tournamentQuery = args.tournament?.toLowerCase() || "";
      const roundFilter = args.round?.toLowerCase() as TennisRoundName | undefined;
      
      // Find tournament info
      const tournament = findTennisTournament(tournamentQuery);
      
      // Search for matches in this tournament
      let matchQuery = `
        SELECT id, home_team, away_team, winner, start_at, status, home_score, away_score, period_id, venue
        FROM events 
        WHERE LOWER(sport_key) LIKE '%tennis%'
          AND (LOWER(venue) LIKE ? OR LOWER(sport_key) LIKE ?)
      `;
      const params: any[] = [`%${tournamentQuery}%`, `%${tournamentQuery}%`];
      
      if (roundFilter) {
        matchQuery += ` AND LOWER(period_id) LIKE ?`;
        params.push(`%${roundFilter.replace(/_/g, '%')}%`);
      }
      
      matchQuery += ` ORDER BY start_at DESC LIMIT 50`;
      
      const { results } = await db.prepare(matchQuery).bind(...params).all();
      
      if (results.length === 0 && !tournament) {
        return {
          data: {
            found: false,
            message: `No tournament or matches found for "${args.tournament}".`,
            availableTournaments: TENNIS_TOURNAMENTS.slice(0, 10).map(t => ({
              name: t.name,
              category: t.category,
              surface: t.surface,
            })),
          },
          source: "Tennis Tournament Database",
          lastUpdated: now,
        };
      }
      
      // Parse matches into structured format
      const matches: TennisMatch[] = results.map((m: any) => {
        // Determine round from period_id
        let round: TennisRoundName = "first_round";
        const periodLower = (m.period_id as string || "").toLowerCase();
        if (periodLower.includes("final") && !periodLower.includes("semi") && !periodLower.includes("quarter")) {
          round = "final";
        } else if (periodLower.includes("semi")) {
          round = "semi_finals";
        } else if (periodLower.includes("quarter")) {
          round = "quarter_finals";
        } else if (periodLower.includes("16") || periodLower.includes("r16")) {
          round = "round_of_16";
        } else if (periodLower.includes("32") || periodLower.includes("r32")) {
          round = "round_of_32";
        } else if (periodLower.includes("64")) {
          round = "round_of_64";
        }
        
        return {
          tournamentKey: tournament?.key || tournamentQuery,
          tournamentName: tournament?.name || m.venue || tournamentQuery,
          round,
          roundDisplay: formatTennisRound(round),
          surface: tournament?.surface || "hard",
          player1: { name: m.home_team, country: "Unknown", countryCode: "UNK", ranking: 0, points: 0 },
          player2: { name: m.away_team, country: "Unknown", countryCode: "UNK", ranking: 0, points: 0 },
          scheduledTime: m.start_at,
          status: m.status === "completed" ? "completed" : m.status === "in_progress" ? "live" : "scheduled",
          winner: m.winner,
        } as TennisMatch;
      });
      
      // Group matches by round
      const matchesByRound: Record<string, TennisMatch[]> = {};
      for (const match of matches) {
        const roundKey = match.round;
        if (!matchesByRound[roundKey]) matchesByRound[roundKey] = [];
        matchesByRound[roundKey].push(match);
      }
      
      return {
        data: {
          found: true,
          tournament: tournament ? {
            key: tournament.key,
            name: tournament.name,
            shortName: tournament.shortName,
            category: tournament.category,
            surface: tournament.surface,
            location: `${tournament.location}, ${tournament.country}`,
            drawSize: tournament.drawSize,
            rankingPoints: tournament.rankingPoints,
          } : {
            name: args.tournament,
            note: "Tournament details not found in database",
          },
          totalMatches: matches.length,
          matchesByRound,
          recentMatches: matches.slice(0, 10).map(m => ({
            round: m.roundDisplay,
            player1: m.player1.name,
            player2: m.player2.name,
            winner: m.winner,
            date: m.scheduledTime,
            status: m.status,
          })),
          allTournaments: TENNIS_TOURNAMENTS.filter(t => 
            t.category === "grand_slam" || t.category === "masters_1000"
          ).map(t => ({
            name: t.name,
            category: t.category,
            surface: t.surface,
          })),
        },
        source: "Tennis Tournament Database",
        lastUpdated: now,
      };
    }

    case "get_tennis_player": {
      const playerName = args.player_name?.toLowerCase() || "";
      const h2hOpponent = args.include_h2h?.toLowerCase();
      
      // Search for player matches
      const { results } = await db.prepare(`
        SELECT id, home_team, away_team, winner, start_at, status, venue, period_id, sport_key
        FROM events 
        WHERE LOWER(sport_key) LIKE '%tennis%'
          AND (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?)
        ORDER BY start_at DESC
        LIMIT 50
      `).bind(`%${playerName}%`, `%${playerName}%`).all();
      
      if (results.length === 0) {
        return {
          data: {
            found: false,
            message: `No match history found for "${args.player_name}". Check spelling or try a different name.`,
          },
          source: "Tennis Player Database",
          lastUpdated: now,
        };
      }
      
      // Find actual player name
      let actualName = args.player_name;
      for (const m of results) {
        if ((m.home_team as string).toLowerCase().includes(playerName)) {
          actualName = m.home_team as string;
          break;
        }
        if ((m.away_team as string).toLowerCase().includes(playerName)) {
          actualName = m.away_team as string;
          break;
        }
      }
      
      // Calculate stats
      let wins = 0, losses = 0;
      const recentMatches: any[] = [];
      const opponents = new Set<string>();
      const tournaments = new Set<string>();
      
      for (const match of results) {
        const isPlayer1 = (match.home_team as string).toLowerCase().includes(playerName);
        const opponent = isPlayer1 ? match.away_team : match.home_team;
        opponents.add(opponent as string);
        if (match.venue) tournaments.add(match.venue as string);
        
        if (match.status === "completed" || match.winner) {
          if (match.winner === actualName || (isPlayer1 && match.winner === match.home_team)) {
            wins++;
          } else if (match.winner) {
            losses++;
          }
        }
        
        if (recentMatches.length < 10) {
          recentMatches.push({
            date: match.start_at,
            tournament: match.venue,
            round: match.period_id,
            opponent,
            result: match.winner === actualName ? "W" : match.winner ? "L" : "Pending",
          });
        }
      }
      
      // Head-to-head if requested
      let h2h = null;
      if (h2hOpponent) {
        const h2hMatches = results.filter((m: any) => {
          const opp = (m.home_team as string).toLowerCase().includes(playerName) ? m.away_team : m.home_team;
          return (opp as string).toLowerCase().includes(h2hOpponent);
        });
        
        let h2hWins = 0, h2hLosses = 0;
        for (const m of h2hMatches) {
          if (m.winner === actualName) h2hWins++;
          else if (m.winner) h2hLosses++;
        }
        
        h2h = {
          opponent: args.include_h2h,
          record: `${h2hWins}-${h2hLosses}`,
          matches: h2hMatches.length,
          recentMeetings: h2hMatches.slice(0, 5).map((m: any) => ({
            date: m.start_at,
            tournament: m.venue,
            winner: m.winner,
          })),
        };
      }
      
      return {
        data: {
          found: true,
          name: actualName,
          record: `${wins}-${losses}`,
          winPct: wins + losses > 0 ? `${((wins / (wins + losses)) * 100).toFixed(1)}%` : "N/A",
          matchesInDatabase: results.length,
          tournamentsPlayed: tournaments.size,
          recentMatches,
          uniqueOpponents: opponents.size,
          headToHead: h2h,
          note: "Stats calculated from available match data. Official ATP/WTA stats may differ.",
        },
        source: "Tennis Player Database",
        lastUpdated: now,
      };
    }

    // ==========================================
    // GOLF TOOLS
    // ==========================================
    
    case "get_golf_rankings": {
      const rankingType = args.ranking_type?.toLowerCase() || "owgr";
      const top = Math.min(args.top || 20, 100);
      
      // Search golf events to build rankings from tournament results
      const tourFilter = rankingType === "liv" ? "%liv%" : "%pga%|%golf%";
      const { results } = await db.prepare(`
        SELECT home_team, away_team, winner, start_at, sport_key, venue, home_score
        FROM events 
        WHERE LOWER(sport_key) LIKE ? OR LOWER(sport_key) LIKE '%golf%'
        ORDER BY start_at DESC
        LIMIT 200
      `).bind(tourFilter).all();
      
      // Build player stats from results
      // In golf events, home_team often contains the leader/winner, and venue is the tournament
      const playerStats: Record<string, {
        wins: number;
        topTens: number;
        tournaments: number;
        lastTournament: string;
        events: Set<string>;
      }> = {};
      
      for (const event of results) {
        const winner = event.winner as string || event.home_team as string;
        const venue = event.venue as string || "";
        
        if (winner && winner.length > 2) {
          if (!playerStats[winner]) {
            playerStats[winner] = { wins: 0, topTens: 0, tournaments: 0, lastTournament: event.start_at as string, events: new Set() };
          }
          
          if (!playerStats[winner].events.has(venue)) {
            playerStats[winner].events.add(venue);
            playerStats[winner].tournaments++;
            if (event.winner === winner) {
              playerStats[winner].wins++;
              playerStats[winner].topTens++;
            }
          }
        }
      }
      
      // Sort by wins then tournaments
      const rankedPlayers = Object.entries(playerStats)
        .map(([name, stats]) => ({
          name,
          wins: stats.wins,
          topTens: stats.topTens,
          tournaments: stats.tournaments,
          points: stats.wins * 500 + stats.topTens * 50 + stats.tournaments * 10,
          lastTournament: stats.lastTournament,
        }))
        .sort((a, b) => b.points - a.points || b.wins - a.wins)
        .slice(0, top);
      
      const rankingNames: Record<string, string> = {
        owgr: "Official World Golf Ranking",
        fedex_cup: "FedEx Cup Standings",
        liv: "LIV Golf Standings",
      };
      
      return {
        data: {
          rankingType,
          rankingName: rankingNames[rankingType] || "Golf Rankings",
          asOf: now,
          rankings: rankedPlayers.map((p, idx) => ({
            rank: idx + 1,
            name: p.name,
            points: p.points,
            wins: p.wins,
            tournaments: p.tournaments,
            lastPlayed: p.lastTournament,
          })),
          totalPlayers: rankedPlayers.length,
          majorTournaments: GOLF_TOURNAMENTS.filter(t => t.isMajor).map(t => ({
            name: t.name,
            course: t.course,
            purse: t.purseUSD ? `$${(t.purseUSD / 1000000).toFixed(1)}M` : undefined,
          })),
          note: "Rankings calculated from available tournament data. Official OWGR/PGA rankings may differ.",
        },
        source: `${rankingNames[rankingType] || "Golf Rankings"}`,
        lastUpdated: now,
      };
    }

    case "get_golf_leaderboard": {
      const tournamentQuery = args.tournament?.toLowerCase() || "";
      const top = Math.min(args.top || 30, 100);
      
      // Find tournament info
      const tournament = findGolfTournament(tournamentQuery);
      
      // Search for tournament events
      const { results } = await db.prepare(`
        SELECT id, home_team, away_team, winner, start_at, status, home_score, away_score, venue, period_id
        FROM events 
        WHERE LOWER(sport_key) LIKE '%golf%'
          AND (LOWER(venue) LIKE ? OR LOWER(sport_key) LIKE ?)
        ORDER BY home_score ASC, start_at DESC
        LIMIT ?
      `).bind(`%${tournamentQuery}%`, `%${tournamentQuery}%`, top).all();
      
      if (results.length === 0 && !tournament) {
        return {
          data: {
            found: false,
            message: `No leaderboard found for "${args.tournament}".`,
            availableTournaments: GOLF_TOURNAMENTS.slice(0, 8).map(t => ({
              name: t.name,
              isMajor: t.isMajor,
              course: t.course,
            })),
          },
          source: "Golf Leaderboard",
          lastUpdated: now,
        };
      }
      
      // Build leaderboard entries
      const leaderboard: GolfLeaderboardEntry[] = results.map((e: any, idx: number) => {
        const score = e.home_score as number || 0;
        return {
          position: idx + 1,
          player: {
            name: e.home_team as string || e.winner as string || `Player ${idx + 1}`,
            country: "Unknown",
            countryCode: "UNK",
            worldRanking: 0,
          },
          roundScores: [],
          totalScore: score,
          thruHole: "F",
          holesPlayed: 72,
        };
      });
      
      // Determine tournament status
      const hasCompleted = results.some((r: any) => r.status === "completed");
      const hasLive = results.some((r: any) => r.status === "in_progress");
      
      return {
        data: {
          found: true,
          tournament: tournament ? {
            key: tournament.key,
            name: tournament.name,
            course: tournament.course,
            location: `${tournament.location}, ${tournament.country}`,
            par: tournament.par,
            purse: tournament.purseUSD ? `$${(tournament.purseUSD / 1000000).toFixed(1)}M` : undefined,
            isMajor: tournament.isMajor,
          } : {
            name: args.tournament,
            note: "Tournament details not found in database",
          },
          status: hasCompleted ? "final" : hasLive ? "in_progress" : "scheduled",
          leaderboard: leaderboard.slice(0, top).map((entry, idx) => ({
            position: formatGolfPosition(idx + 1, false),
            name: entry.player.name,
            score: formatGolfScore(entry.totalScore),
            thru: entry.thruHole,
          })),
          totalEntries: leaderboard.length,
          cutLine: leaderboard.length > 70 ? formatGolfScore(leaderboard[69]?.totalScore || 0) : undefined,
          allMajors: GOLF_TOURNAMENTS.filter(t => t.isMajor).map(t => t.name),
        },
        source: "Golf Leaderboard",
        lastUpdated: now,
      };
    }

    case "get_golf_player": {
      const playerName = args.player_name?.toLowerCase() || "";
      
      // Search for player in golf events
      const { results } = await db.prepare(`
        SELECT id, home_team, away_team, winner, start_at, status, venue, home_score, sport_key
        FROM events 
        WHERE LOWER(sport_key) LIKE '%golf%'
          AND (LOWER(home_team) LIKE ? OR LOWER(winner) LIKE ?)
        ORDER BY start_at DESC
        LIMIT 30
      `).bind(`%${playerName}%`, `%${playerName}%`).all();
      
      if (results.length === 0) {
        return {
          data: {
            found: false,
            message: `No tournament history found for "${args.player_name}". Check spelling or try a different name.`,
          },
          source: "Golf Player Database",
          lastUpdated: now,
        };
      }
      
      // Find actual player name
      let actualName = args.player_name;
      for (const e of results) {
        if ((e.home_team as string || "").toLowerCase().includes(playerName)) {
          actualName = e.home_team as string;
          break;
        }
        if ((e.winner as string || "").toLowerCase().includes(playerName)) {
          actualName = e.winner as string;
          break;
        }
      }
      
      // Calculate stats
      let wins = 0;
      const tournaments = new Set<string>();
      const recentResults: any[] = [];
      
      for (const event of results) {
        const venue = event.venue as string || "";
        if (venue) tournaments.add(venue);
        
        if (event.winner === actualName) wins++;
        
        if (recentResults.length < 10) {
          recentResults.push({
            date: event.start_at,
            tournament: venue,
            result: event.winner === actualName ? "Won" : "Played",
            score: event.home_score,
          });
        }
      }
      
      return {
        data: {
          found: true,
          name: actualName,
          wins,
          tournamentsPlayed: tournaments.size,
          eventsInDatabase: results.length,
          recentResults,
          majorWins: 0, // Would need to cross-reference with major tournaments
          note: "Stats calculated from available tournament data. Official PGA/OWGR stats may differ.",
        },
        source: "Golf Player Database",
        lastUpdated: now,
      };
    }

    // ==========================================
    // MOTORSPORTS TOOLS
    // ==========================================
    
    case "get_race_schedule": {
      const series = (args.series?.toLowerCase() || "f1") as MotorsportSeries;
      const season = args.season || new Date().getFullYear();
      const upcomingOnly = args.upcoming_only !== false;
      
      // Map series to sport_key patterns
      const seriesPatterns: Record<string, string[]> = {
        f1: ["formula_1", "f1", "formula1"],
        nascar_cup: ["nascar_cup", "nascar", "cup_series"],
        nascar_xfinity: ["nascar_xfinity", "xfinity"],
        indycar: ["indycar", "indy"],
        motogp: ["motogp", "moto_gp"],
      };
      
      const patterns = seriesPatterns[series] || [series];
      const likePattern = patterns.map(p => `LOWER(sport_key) LIKE '%${p}%'`).join(" OR ");
      
      let query = `
        SELECT id, home_team, away_team, start_at, status, venue, period_id, sport_key
        FROM events 
        WHERE (${likePattern})
      `;
      
      if (upcomingOnly) {
        query += ` AND start_at >= datetime('now')`;
      }
      
      query += ` ORDER BY start_at ASC LIMIT 25`;
      
      const { results } = await db.prepare(query).all();
      
      // Find track info for each race
      const races = results.map((e: any, idx: number) => {
        const venueName = e.venue as string || e.home_team as string || "";
        const track = findMotorsportTrack(venueName);
        
        return {
          round: idx + 1,
          name: e.home_team || venueName,
          shortName: track?.shortName || venueName.split(" ")[0],
          date: e.start_at,
          status: e.status,
          track: track ? {
            name: track.name,
            location: `${track.location}, ${track.country}`,
            lengthKm: track.lengthKm,
            laps: track.laps,
            trackType: track.trackType,
          } : {
            name: venueName,
            location: "Unknown",
          },
          sessions: e.period_id ? [{ type: e.period_id, status: e.status }] : [],
        };
      });
      
      return {
        data: {
          series,
          seriesName: getSeriesName(series),
          season,
          totalRaces: races.length,
          schedule: races,
          upcomingOnly,
          knownTracks: MOTORSPORT_TRACKS.filter(t => 
            series === "f1" ? ["monaco", "monza", "silverstone", "spa", "suzuka", "cota", "miami", "las_vegas"].includes(t.key) :
            series.includes("nascar") ? ["daytona", "talladega", "charlotte", "bristol", "martinsville"].includes(t.key) :
            series === "indycar" ? ["indianapolis", "long_beach", "st_pete"].includes(t.key) :
            true
          ).map(t => ({
            name: t.name,
            shortName: t.shortName,
            location: `${t.location}, ${t.country}`,
            trackType: t.trackType,
          })),
        },
        source: `${getSeriesName(series)} Schedule`,
        lastUpdated: now,
      };
    }

    case "get_race_results": {
      const series = (args.series?.toLowerCase() || "f1") as MotorsportSeries;
      const raceName = args.race_name?.toLowerCase() || "";
      // args.round reserved for future filtering
      const session = args.session?.toLowerCase() || "race";
      
      // Build query
      const seriesPatterns: Record<string, string[]> = {
        f1: ["formula_1", "f1", "formula1"],
        nascar_cup: ["nascar_cup", "nascar", "cup_series"],
        nascar_xfinity: ["nascar_xfinity", "xfinity"],
        indycar: ["indycar", "indy"],
        motogp: ["motogp", "moto_gp"],
      };
      
      const patterns = seriesPatterns[series] || [series];
      const likePattern = patterns.map(p => `LOWER(sport_key) LIKE '%${p}%'`).join(" OR ");
      
      let query = `
        SELECT id, home_team, away_team, winner, start_at, status, venue, home_score, away_score, period_id
        FROM events 
        WHERE (${likePattern})
          AND status = 'completed'
      `;
      const params: any[] = [];
      
      if (raceName) {
        query += ` AND (LOWER(venue) LIKE ? OR LOWER(home_team) LIKE ?)`;
        params.push(`%${raceName}%`, `%${raceName}%`);
      }
      
      query += ` ORDER BY start_at DESC LIMIT 30`;
      
      const stmt = params.length > 0 
        ? db.prepare(query).bind(...params) 
        : db.prepare(query);
      const { results } = await stmt.all();
      
      if (results.length === 0) {
        return {
          data: {
            found: false,
            message: `No race results found for ${getSeriesName(series)}${raceName ? ` at ${raceName}` : ""}.`,
            series,
          },
          source: "Race Results",
          lastUpdated: now,
        };
      }
      
      // Parse results into race format
      const race = results[0] as any;
      const track = findMotorsportTrack(race.venue || race.home_team || "");
      
      // In motorsports events, results might be stored differently
      // Parse available data into structured format
      const raceResults: RaceResult[] = results.slice(0, 20).map((r: any, idx: number) => ({
        position: idx + 1,
        driver: {
          name: r.winner || r.home_team as string,
          number: 0,
          team: r.away_team as string || "Unknown",
          country: "Unknown",
          countryCode: "UNK",
          championshipPoints: 0,
          championshipPosition: 0,
          wins: 0,
          podiums: 0,
          poles: 0,
        },
        team: r.away_team as string || "Unknown",
        lapsCompleted: track?.laps || 0,
        timeOrGap: idx === 0 ? (r.home_score ? formatLapTime(r.home_score as number) : "Winner") : formatGap((r.home_score || 0) - (results[0] as any).home_score || idx * 2),
        gridPosition: idx + 1,
        positionsGained: 0,
        points: series === "f1" ? [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][idx] || 0 :
               series.includes("nascar") ? Math.max(40 - idx, 1) : 0,
        status: "finished",
      }));
      
      return {
        data: {
          found: true,
          series,
          seriesName: getSeriesName(series),
          session,
          race: {
            name: race.venue || race.home_team,
            date: race.start_at,
            status: "completed",
            track: track ? {
              name: track.name,
              location: `${track.location}, ${track.country}`,
              lengthKm: track.lengthKm,
              laps: track.laps,
            } : { name: race.venue || "Unknown" },
          },
          winner: raceResults[0]?.driver.name,
          podium: raceResults.slice(0, 3).map(r => ({
            position: r.position,
            driver: r.driver.name,
            team: r.team,
          })),
          results: raceResults.map(r => ({
            position: r.position,
            driver: r.driver.name,
            team: r.team,
            timeOrGap: r.timeOrGap,
            points: r.points,
            status: r.status,
          })),
          totalFinishers: raceResults.length,
          fastestLap: raceResults[0]?.driver.name, // Simplified
        },
        source: `${getSeriesName(series)} Race Results`,
        lastUpdated: race.updated_at || now,
      };
    }

    case "get_driver_standings": {
      const series = (args.series?.toLowerCase() || "f1") as MotorsportSeries;
      const season = args.season || new Date().getFullYear();
      const top = Math.min(args.top || 20, 50);
      
      // Build driver stats from race results
      const seriesPatterns: Record<string, string[]> = {
        f1: ["formula_1", "f1", "formula1"],
        nascar_cup: ["nascar_cup", "nascar", "cup_series"],
        nascar_xfinity: ["nascar_xfinity", "xfinity"],
        indycar: ["indycar", "indy"],
        motogp: ["motogp", "moto_gp"],
      };
      
      const patterns = seriesPatterns[series] || [series];
      const likePattern = patterns.map(p => `LOWER(sport_key) LIKE '%${p}%'`).join(" OR ");
      
      const { results } = await db.prepare(`
        SELECT home_team, away_team, winner, start_at, venue
        FROM events 
        WHERE (${likePattern})
          AND status = 'completed'
        ORDER BY start_at DESC
        LIMIT 100
      `).all();
      
      // Calculate driver statistics
      const driverStats: Record<string, {
        wins: number;
        podiums: number;
        races: number;
        points: number;
        team: string;
        lastRace: string;
      }> = {};
      
      // Point systems
      const pointSystem = series === "f1" 
        ? [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
        : series.includes("nascar")
          ? Array.from({ length: 40 }, (_, i) => Math.max(40 - i, 1))
          : Array.from({ length: 20 }, (_, i) => Math.max(50 - i * 2, 5));
      
      for (const race of results) {
        const winner = race.winner as string;
        const team = race.away_team as string || "Unknown";
        
        if (winner) {
          if (!driverStats[winner]) {
            driverStats[winner] = { wins: 0, podiums: 0, races: 0, points: 0, team, lastRace: race.start_at as string };
          }
          driverStats[winner].wins++;
          driverStats[winner].podiums++;
          driverStats[winner].races++;
          driverStats[winner].points += pointSystem[0] || 25;
          driverStats[winner].team = team;
        }
      }
      
      // Sort by points
      const standings = Object.entries(driverStats)
        .map(([name, stats]) => ({
          name,
          ...stats,
        }))
        .sort((a, b) => b.points - a.points || b.wins - a.wins)
        .slice(0, top);
      
      const leader = standings[0];
      
      return {
        data: {
          series,
          seriesName: getSeriesName(series),
          season,
          asOf: now,
          standings: standings.map((d, idx) => ({
            position: idx + 1,
            driver: d.name,
            team: d.team,
            points: d.points,
            wins: d.wins,
            podiums: d.podiums,
            races: d.races,
            behindLeader: leader ? leader.points - d.points : 0,
          })),
          leader: leader ? {
            driver: leader.name,
            team: leader.team,
            points: leader.points,
            wins: leader.wins,
          } : null,
          racesCompleted: results.length,
          note: "Standings calculated from available race data. Official standings may differ.",
        },
        source: `${getSeriesName(series)} Standings`,
        lastUpdated: now,
      };
    }

    case "get_constructor_standings": {
      const series = (args.series?.toLowerCase() || "f1") as MotorsportSeries;
      const season = args.season || new Date().getFullYear();
      
      // Build team stats from race results
      const seriesPatterns: Record<string, string[]> = {
        f1: ["formula_1", "f1", "formula1"],
        nascar_cup: ["nascar_cup", "nascar", "cup_series"],
        indycar: ["indycar", "indy"],
      };
      
      const patterns = seriesPatterns[series] || [series];
      const likePattern = patterns.map(p => `LOWER(sport_key) LIKE '%${p}%'`).join(" OR ");
      
      const { results } = await db.prepare(`
        SELECT home_team, away_team, winner, start_at
        FROM events 
        WHERE (${likePattern})
          AND status = 'completed'
        ORDER BY start_at DESC
        LIMIT 100
      `).all();
      
      // Calculate team statistics (away_team often contains team name)
      const teamStats: Record<string, {
        wins: number;
        podiums: number;
        points: number;
        drivers: Set<string>;
      }> = {};
      
      const pointSystem = series === "f1" ? [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] : [];
      
      for (const race of results) {
        const team = race.away_team as string || "Unknown";
        const winner = race.winner as string;
        
        if (team && team !== "Unknown") {
          if (!teamStats[team]) {
            teamStats[team] = { wins: 0, podiums: 0, points: 0, drivers: new Set() };
          }
          
          if (winner) {
            teamStats[team].drivers.add(winner);
            if (race.winner === race.home_team || race.winner) {
              teamStats[team].wins++;
              teamStats[team].points += pointSystem[0] || 25;
            }
          }
        }
      }
      
      // Sort by points
      const standings = Object.entries(teamStats)
        .map(([name, stats]) => ({
          name,
          wins: stats.wins,
          points: stats.points,
          drivers: Array.from(stats.drivers),
        }))
        .sort((a, b) => b.points - a.points || b.wins - a.wins)
        .slice(0, 12);
      
      const leader = standings[0];
      const standingLabel = series === "f1" ? "Constructor Standings" : 
                           series.includes("nascar") ? "Owner Standings" : 
                           "Team Standings";
      
      return {
        data: {
          series,
          seriesName: getSeriesName(series),
          standingType: standingLabel,
          season,
          asOf: now,
          standings: standings.map((t, idx) => ({
            position: idx + 1,
            team: t.name,
            points: t.points,
            wins: t.wins,
            drivers: t.drivers.slice(0, 4),
            behindLeader: leader ? leader.points - t.points : 0,
          })),
          leader: leader ? {
            team: leader.name,
            points: leader.points,
            wins: leader.wins,
          } : null,
          note: "Standings calculated from available race data. Official standings may differ.",
        },
        source: `${getSeriesName(series)} ${standingLabel}`,
        lastUpdated: now,
      };
    }

    case "get_driver_profile": {
      const driverName = args.driver_name?.toLowerCase() || "";
      const seriesFilter = args.series?.toLowerCase() || "";
      
      // Search for driver in motorsport events
      let query = `
        SELECT home_team, away_team, winner, start_at, status, venue, sport_key
        FROM events 
        WHERE (LOWER(sport_key) LIKE '%f1%' OR LOWER(sport_key) LIKE '%formula%'
               OR LOWER(sport_key) LIKE '%nascar%' OR LOWER(sport_key) LIKE '%indycar%'
               OR LOWER(sport_key) LIKE '%motogp%')
          AND (LOWER(home_team) LIKE ? OR LOWER(winner) LIKE ?)
      `;
      const params: any[] = [`%${driverName}%`, `%${driverName}%`];
      
      if (seriesFilter) {
        query += ` AND LOWER(sport_key) LIKE ?`;
        params.push(`%${seriesFilter}%`);
      }
      
      query += ` ORDER BY start_at DESC LIMIT 50`;
      
      const { results } = await db.prepare(query).bind(...params).all();
      
      if (results.length === 0) {
        return {
          data: {
            found: false,
            message: `No race history found for "${args.driver_name}". Check spelling or try a different name.`,
          },
          source: "Driver Database",
          lastUpdated: now,
        };
      }
      
      // Find actual driver name
      let actualName = args.driver_name;
      let team = "Unknown";
      for (const r of results) {
        if ((r.home_team as string || "").toLowerCase().includes(driverName)) {
          actualName = r.home_team as string;
          team = r.away_team as string || team;
          break;
        }
        if ((r.winner as string || "").toLowerCase().includes(driverName)) {
          actualName = r.winner as string;
          team = r.away_team as string || team;
          break;
        }
      }
      
      // Calculate stats
      let wins = 0, podiums = 0;
      const recentRaces: any[] = [];
      const tracks = new Set<string>();
      const series = new Set<string>();
      
      for (const race of results) {
        const venue = race.venue as string || "";
        const sportKey = race.sport_key as string || "";
        
        if (venue) tracks.add(venue);
        if (sportKey) series.add(sportKey);
        
        if (race.winner === actualName || (race.home_team as string || "").toLowerCase().includes(driverName)) {
          wins++;
          podiums++;
        }
        
        if (recentRaces.length < 10) {
          recentRaces.push({
            date: race.start_at,
            race: venue || "Unknown",
            result: race.winner === actualName ? "Win" : "Participated",
            series: sportKey,
          });
        }
      }
      
      // Detect primary series
      const seriesArray = Array.from(series);
      let primarySeries = "Motorsport";
      if (seriesArray.some(s => s.includes("f1") || s.includes("formula"))) primarySeries = "Formula 1";
      else if (seriesArray.some(s => s.includes("nascar"))) primarySeries = "NASCAR";
      else if (seriesArray.some(s => s.includes("indycar"))) primarySeries = "IndyCar";
      else if (seriesArray.some(s => s.includes("motogp"))) primarySeries = "MotoGP";
      
      return {
        data: {
          found: true,
          name: actualName,
          team,
          series: primarySeries,
          stats: {
            wins,
            podiums,
            racesInDatabase: results.length,
            tracksRaced: tracks.size,
          },
          recentRaces,
          championshipPosition: wins > 0 ? "Top Contender" : "Competitor",
          note: "Stats calculated from available race data. Official career stats may differ.",
        },
        source: "Driver Database",
        lastUpdated: now,
      };
    }

    default:
      return { data: null, source: "Unknown", lastUpdated: now };
  }
}

// Source metadata with icons and descriptions
const SOURCE_METADATA: Record<string, { icon: string; description: string; reliability: "high" | "medium" | "low" }> = {
  "Schedule Feed": { icon: "📅", description: "Official game schedules", reliability: "high" },
  "Game Data": { icon: "🏟️", description: "Event details", reliability: "high" },
  "Live Data": { icon: "⚡", description: "Real-time scores and status", reliability: "high" },
  "League Standings": { icon: "📊", description: "Official standings", reliability: "high" },
  "Calculated Table": { icon: "📈", description: "Computed from results", reliability: "medium" },
  "Calculated Standings": { icon: "📈", description: "Computed from results", reliability: "medium" },
  "Game Results": { icon: "📝", description: "Historical results", reliability: "high" },
  "Match Results Database": { icon: "📋", description: "Match history", reliability: "high" },
  "Head-to-Head History": { icon: "⚔️", description: "H2H records", reliability: "high" },
  "Team Statistics": { icon: "📊", description: "Team stats", reliability: "medium" },
  "Venue Database": { icon: "🏟️", description: "Venue information", reliability: "high" },
  "Knowledge Base": { icon: "📚", description: "Rules and glossary", reliability: "high" },
  "Odds Feed": { icon: "💹", description: "Betting lines", reliability: "high" },
  "Market Consensus": { icon: "📉", description: "Line averages", reliability: "high" },
  "Injury Reports": { icon: "🏥", description: "Injury status", reliability: "high" },
  "Weather Feed": { icon: "🌤️", description: "Weather forecast", reliability: "medium" },
  "Pool Settings": { icon: "⚙️", description: "Pool configuration", reliability: "high" },
  "User Picks": { icon: "✅", description: "Your selections", reliability: "high" },
  "Match Context": { icon: "🎯", description: "Match significance", reliability: "high" },
  "Soccer Entity Database": { icon: "⚽", description: "Team/league data", reliability: "high" },
  "Soccer Competition Database": { icon: "🏆", description: "Competition info", reliability: "high" },
  "Events Database": { icon: "📋", description: "Event records", reliability: "high" },
  "League Database": { icon: "🏅", description: "League info", reliability: "high" },
  "Entity Resolution": { icon: "🔍", description: "Name lookup", reliability: "medium" },
  "Fight Card Database": { icon: "🥊", description: "Fight cards", reliability: "high" },
  "Fighter Database": { icon: "🥋", description: "Fighter profiles", reliability: "medium" },
  "Weight Class Database": { icon: "⚖️", description: "Weight class info", reliability: "high" },
  "Weight Class Rankings": { icon: "🏆", description: "Division rankings", reliability: "medium" },
  "Tennis Tournament Database": { icon: "🎾", description: "Tournament info", reliability: "high" },
  "Tennis Player Database": { icon: "🎾", description: "Player profiles", reliability: "medium" },
  "Golf Leaderboard": { icon: "⛳", description: "Tournament scores", reliability: "high" },
  "Golf Player Database": { icon: "🏌️", description: "Golfer profiles", reliability: "medium" },
  "Race Results": { icon: "🏎️", description: "Race results", reliability: "high" },
  "Driver Database": { icon: "🏁", description: "Driver profiles", reliability: "medium" },
};

// Format relative time for human readability
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 30) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Get freshness indicator with visual cue
function getFreshnessIndicator(isoString: string): { level: string; icon: string; note: string } {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 2) return { level: "live", icon: "🟢", note: "Live data" };
  if (diffMins < 15) return { level: "fresh", icon: "🟢", note: "Recently updated" };
  if (diffMins < 60) return { level: "recent", icon: "🟡", note: "Updated within the hour" };
  if (diffMins < 360) return { level: "aging", icon: "🟠", note: "Updated a few hours ago" };
  if (diffMins < 1440) return { level: "stale", icon: "🔴", note: "Updated today" };
  return { level: "old", icon: "⚪", note: "May be outdated" };
}

// Format tool results for the AI response with sport-aware formatting
export function formatToolResults(toolResults: Array<{ name: string; result: any }>): string {
  return toolResults.map(({ name, result }) => {
    const { data, source, lastUpdated, cached } = result;
    
    // Get source metadata
    const sourceMeta = SOURCE_METADATA[source] || { icon: "📋", description: source, reliability: "medium" };
    const freshness = getFreshnessIndicator(lastUpdated);
    const relativeTime = formatRelativeTime(lastUpdated);
    
    // Build enhanced source header
    const cacheIndicator = cached ? " (cached)" : "";
    const sourceHeader = `${sourceMeta.icon} ${source}${cacheIndicator}`;
    const freshnessHeader = `${freshness.icon} ${relativeTime} • ${freshness.note}`;
    const reliabilityNote = sourceMeta.reliability === "medium" 
      ? " • Note: Calculated data, official sources may differ" 
      : "";
    
    // Detect sport from data to apply appropriate formatting
    const sportKey = data?.sport_key || data?.sport || data?.league || data?.series || "";
    const category = detectSportCategory(sportKey);
    const terminology = getTerminology(sportKey);
    
    // Add formatting hints to help the AI use correct terminology
    let formattingHints = "";
    if (category !== "unknown") {
      formattingHints = `\n[Terminology: "${terminology.event}" for events, "${terminology.period}" for periods, "${terminology.standings}" for rankings]`;
    }
    
    // Format specific data types with sport-aware context
    let formattedData = data;
    
    // Enhance game/match data with formatted scores
    if (data?.homeTeam && data?.awayTeam && data?.homeScore !== undefined) {
      const scoreStr = formatScore({
        homeScore: data.homeScore,
        awayScore: data.awayScore,
        homeTeam: data.homeTeam,
        awayTeam: data.awayTeam,
        sportKey,
        isLive: data.status === "live" || data.status === "in_progress",
        period: data.period,
      });
      formattedData = { ...data, formattedScore: scoreStr };
    }
    
    // Enhance standings with column labels
    if (name === "get_standings" && data?.table) {
      const columns = getStandingsColumns(sportKey);
      formattedData = { 
        ...data, 
        columnLabels: columns.map(c => `${c.key}: ${c.label}${c.description ? ` (${c.description})` : ""}`).join(", "),
        standingsType: terminology.standings,
      };
    }
    
    // Format live state with period labels
    if (name === "get_live_state" && data?.period) {
      const periodLabel = formatPeriod(data.period, sportKey);
      const statusInfo = formatStatus(data.status || "scheduled", sportKey);
      formattedData = { 
        ...data, 
        periodLabel: periodLabel || data.periodLabel,
        statusDisplay: statusInfo.label,
        terminology: {
          event: terminology.event,
          period: terminology.period,
        }
      };
    }
    
    // Format game summaries
    if ((name === "get_game_details" || name === "get_team_recent_results") && data?.homeTeam) {
      const summary = formatGameSummary({
        homeTeam: data.homeTeam,
        awayTeam: data.awayTeam,
        homeScore: data.homeScore || 0,
        awayScore: data.awayScore || 0,
        sportKey,
        venue: data.venue,
        status: data.status || "completed",
        winner: data.winner,
      });
      formattedData = { ...data, gameSummary: summary };
    }
    
    // Add timestamp to data for AI reference
    formattedData = {
      ...formattedData,
      _meta: {
        source: source,
        updatedAt: lastUpdated,
        updatedRelative: relativeTime,
        freshness: freshness.level,
        cached: !!cached,
      }
    };
    
    return `[${sourceHeader}]\n[${freshnessHeader}]${reliabilityNote}${formattingHints}\n${JSON.stringify(formattedData, null, 2)}`;
  }).join("\n\n---\n\n");
}

// Safety check for betting advice
export function checkForBettingAdvice(message: string): { isBettingAdvice: boolean; flags: string[] } {
  const lowerMessage = message.toLowerCase();
  const flags: string[] = [];
  
  const bettingPhrases = [
    "should i bet", "what should i bet", "who should i pick",
    "lock of the week", "guaranteed", "slam dunk", "sure thing",
    "best bet", "my pick", "i'd go with", "take the",
    "parlay", "teaser", "bet on", "wager on",
    "who's going to win", "who will win", "who wins",
  ];
  
  for (const phrase of bettingPhrases) {
    if (lowerMessage.includes(phrase)) {
      flags.push(phrase);
    }
  }
  
  return {
    isBettingAdvice: flags.length > 0,
    flags,
  };
}

// Format timestamp for display (e.g., "Sat, Jan 15, 2:30 PM")
function formatDisplayTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Calculate relative time (e.g., "5 minutes ago", "2 hours ago")
function getRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return formatDisplayTimestamp(isoString);
}

// Build structured response for Scout persona
function buildStructuredResponse(
  persona: PersonaKey,
  content: string,
  toolsUsed: string[],
  sources: ScoutSource[],
  isBettingAdvice: boolean
): ScoutResponse | undefined {
  // Only Scout gets structured responses with tools
  if (persona !== "billy" || toolsUsed.length === 0) {
    return undefined;
  }
  
  // Determine intent from tools used
  let intent: ScoutResponse["intent"] = "general";
  if (toolsUsed.includes("get_game_schedule")) intent = "schedule";
  else if (toolsUsed.includes("get_standings")) intent = "standings";
  else if (toolsUsed.includes("get_head_to_head")) intent = "h2h";
  else if (toolsUsed.includes("get_injuries")) intent = "injuries";
  else if (toolsUsed.includes("get_weather")) intent = "weather";
  else if (toolsUsed.includes("get_lines_history") || toolsUsed.includes("get_market_averages")) intent = "lines";
  else if (toolsUsed.includes("get_team_form")) intent = "form";
  else if (toolsUsed.includes("get_team_stats") || toolsUsed.includes("get_team_recent_results")) intent = "stats";
  else if (toolsUsed.includes("search_knowledge_base")) intent = "rules";
  else if (toolsUsed.includes("get_user_picks")) intent = "picks";
  else if (toolsUsed.includes("resolve_entity")) intent = "entity";
  else if (toolsUsed.length > 2) intent = "mixed";
  
  // Extract key points from content (simple heuristic - lines starting with - or •)
  const keyPoints: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-") || trimmed.startsWith("•") || trimmed.startsWith("*")) {
      keyPoints.push(trimmed.replace(/^[-•*]\s*/, ""));
    }
  }
  
  // Extract summary (first substantial paragraph)
  const answerSummary = lines.find(l => l.trim().length > 30)?.trim().substring(0, 300) || content.substring(0, 200);
  
  // Enhance sources with formatted timestamps and freshness indicators
  const now = new Date();
  const enhancedSources: ScoutSource[] = sources.map(source => {
    const lastUpdated = new Date(source.lastUpdated);
    const ageMinutes = Math.floor((now.getTime() - lastUpdated.getTime()) / 60000);
    
    return {
      ...source,
      displayTimestamp: formatDisplayTimestamp(source.lastUpdated),
      relativeTime: getRelativeTime(source.lastUpdated),
      isStale: ageMinutes > 30,
      ageMinutes,
      freshnessWarning: ageMinutes > 60 
        ? `Data last updated ${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m ago`
        : ageMinutes > 30 
          ? `Data updated ${ageMinutes} minutes ago`
          : undefined,
    };
  });
  
  // Find most recent data timestamp
  const latestSource = sources.length > 0 
    ? sources.reduce((latest, s) => 
        new Date(s.lastUpdated) > new Date(latest.lastUpdated) ? s : latest
      )
    : null;
  
  return {
    intent,
    answerSummary,
    keyPoints: keyPoints.slice(0, 5),
    sourcesUsed: enhancedSources,
    asOf: now.toISOString(),
    asOfDisplay: formatDisplayTimestamp(now.toISOString()),
    dataTimestamp: latestSource?.lastUpdated || now.toISOString(),
    dataTimestampDisplay: latestSource 
      ? `As of ${formatDisplayTimestamp(latestSource.lastUpdated)} (${getRelativeTime(latestSource.lastUpdated)})`
      : `As of ${formatDisplayTimestamp(now.toISOString())}`,
    complianceNote: "Coach G provides sports intelligence only. No betting advice or pick recommendations.",
    recommendedNextActions: [],
    toolsCalled: toolsUsed,
    isBettingAdviceRequest: isBettingAdvice,
    bettingAdviceFlags: isBettingAdvice ? ["betting_advice_detected"] : [],
  };
}

// Build personalization block for Coach G system prompt
function buildMemoryPromptBlock(memory: MemorySummary): string {
  const lines: string[] = [];
  
  // Check if memory is enabled
  if (!memory.preferences.useMemoryInResponses) {
    return "";
  }
  
  lines.push("\n\n=== USER PERSONALIZATION (CONFIDENTIAL) ===");
  
  // Followed teams
  if (memory.followedTeams.length > 0) {
    const teams = memory.followedTeams
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10)
      .map(t => `${t.entityName} (${t.sportKey})${t.priority >= 8 ? " ⭐" : ""}`)
      .join(", ");
    lines.push(`\nFavorite Teams: ${teams}`);
  }
  
  // Followed players
  if (memory.followedPlayers.length > 0) {
    const players = memory.followedPlayers
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5)
      .map(p => `${p.entityName} (${p.sportKey})`)
      .join(", ");
    lines.push(`Followed Players: ${players}`);
  }
  
  // Followed leagues
  if (memory.followedLeagues.length > 0) {
    const leagues = memory.followedLeagues
      .slice(0, 5)
      .map(l => l.entityName)
      .join(", ");
    lines.push(`Preferred Leagues: ${leagues}`);
  }
  
  // Tone and detail preferences
  lines.push(`\nResponse Style: ${memory.preferences.tone} tone, ${memory.preferences.detailLevel} detail level`);
  
  // Focus areas
  const focusAreas: string[] = [];
  if (memory.preferences.focusInjuries) focusAreas.push("injuries");
  if (memory.preferences.focusWeather) focusAreas.push("weather");
  if (memory.preferences.focusTrends) focusAreas.push("trends");
  if (memory.preferences.focusLineMovement) focusAreas.push("line movement");
  if (memory.preferences.focusMatchups) focusAreas.push("matchups");
  
  if (focusAreas.length > 0) {
    lines.push(`Focus Areas: ${focusAreas.join(", ")}`);
  }
  
  // Context preferences
  const contextPrefs: string[] = [];
  if (memory.preferences.includeHistoricalContext) contextPrefs.push("historical context");
  if (memory.preferences.includeMarketContext) contextPrefs.push("market context");
  if (memory.preferences.includeSocialSentiment) contextPrefs.push("social sentiment");
  
  if (contextPrefs.length > 0) {
    lines.push(`Include: ${contextPrefs.join(", ")}`);
  }
  
  // Recent topics
  if (memory.recentTopics.length > 0) {
    lines.push(`\nRecent Topics: ${memory.recentTopics.slice(0, 5).join(", ")}`);
  }
  
  // Instructions for using memory
  lines.push("\nPERSONALIZATION INSTRUCTIONS:");
  lines.push("- Prioritize information about their followed teams/players in responses");
  lines.push("- Proactively mention relevant news about their favorites");
  lines.push("- Match their preferred tone and detail level");
  lines.push(`- ${memory.preferences.showMemoryCitations ? "Cite when using memory (e.g., 'Since you follow...')" : "Use memory naturally without explicit citations"}`);
  lines.push("- Never reveal the raw memory data to the user");
  lines.push("=== END PERSONALIZATION ===");
  
  return lines.join("\n");
}

// Extract entities mentioned in a message for learning
function extractEntitiesFromMessage(message: string): string[] {
  // Simple extraction - look for capitalized multi-word phrases that might be teams/players
  const entities: string[] = [];
  
  // Match phrases like "Kansas City Chiefs", "LeBron James", "Manchester United"
  const teamPlayerPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  let match;
  while ((match = teamPlayerPattern.exec(message)) !== null) {
    const entity = match[1];
    // Filter out common non-entity phrases
    const skipPhrases = ["The", "How", "What", "When", "Where", "Who", "Why", "Can", "Does", "Should", "Will", "Could"];
    if (!skipPhrases.includes(entity.split(" ")[0])) {
      entities.push(entity.toLowerCase().replace(/\s+/g, "_"));
    }
  }
  
  return entities.slice(0, 5);
}

// Generate AI response with function calling and structured outputs
export async function generateAIResponse(
  client: OpenAI,
  db: D1Database,
  userId: string,
  persona: PersonaKey,
  message: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  pageContext?: string,
  leagueId?: number,
  eliteContext?: EliteContext | null,
  routingOverride?: PriorityRouting
): Promise<{
  response: string;
  structured?: ScoutResponse;
  toolsUsed: string[];
  sources: ScoutSource[];
  isBettingAdvice: boolean;
  flags: string[];
}> {
  const personaConfig = AI_PERSONAS[persona];
  const toolsUsed: string[] = [];
  const sources: ScoutSource[] = [];
  
  // Check for betting advice request
  const { isBettingAdvice, flags } = checkForBettingAdvice(message);
  
  // Get AI priority routing based on user tier (use override if provided)
  const routing = routingOverride || await getAIPriorityRouting(db, userId);
  toolsUsed.push(`tier:${routing.tier}`);
  
  // Fetch user's memory for personalization (Scout persona only)
  let memorySummary: MemorySummary | null = null;
  if (persona === "billy") {
    try {
      memorySummary = await getMemorySummary(db, userId, "PROD");
    } catch (err) {
      console.error("Failed to load Scout memory:", err);
    }
  }
  
  // Build system prompt
  let systemPrompt = personaConfig.systemPrompt;
  
  // Add personalization from memory
  if (memorySummary && memorySummary.preferences.useMemoryInResponses) {
    systemPrompt += buildMemoryPromptBlock(memorySummary);
  }
  
  // Add tier-based response depth instructions
  systemPrompt += getResponseDepthInstructions(routing);
  
  // Add Elite context (watched games, followed teams, session memory)
  if (eliteContext && routing.tier === 'elite') {
    systemPrompt += buildEliteContextPrompt(eliteContext);
  }
  
  // Add bet ticket context (Coach G ticket-aware mode)
  if (persona === "billy") {
    try {
      const betTicketContext = await getBetTicketContext(db, userId);
      if (betTicketContext && betTicketContext.tickets.length > 0) {
        systemPrompt += buildBetTicketPromptBlock(betTicketContext);
        toolsUsed.push("bet_ticket_context");
      }
    } catch (err) {
      console.error("Failed to load bet ticket context:", err);
    }
  }
  
  if (pageContext) {
    systemPrompt += `\n\nCurrent context: User is viewing the ${pageContext} page.`;
  }
  
  if (leagueId) {
    systemPrompt += `\nCurrent pool ID: ${leagueId}`;
  }
  
  // Add tool usage instructions - SOCCER-FIRST, DATA-GROUNDED
  systemPrompt += `\n\nCRITICAL INSTRUCTIONS FOR DATA-GROUNDED RESPONSES:

RULE #1 — ALWAYS USE TOOLS:
You MUST call the appropriate tool for ANY factual sports question. NEVER answer from memory. NEVER guess.
- Schedules/fixtures → get_game_schedule
- Standings/tables → get_standings  
- Team form (last 5 matches) → get_team_form
- Team recent results → get_team_recent_results
- Head-to-head history → get_head_to_head
- Injuries/suspensions → get_injuries
- Weather conditions → get_weather
- Team/league lookup → resolve_entity

RULE #2 — CITE SOURCES:
Every factual claim must include:
- "As of [timestamp]" from the tool response
- Source name (e.g., "Source: Schedule Feed", "Source: Injury Reports")
- If data is stale (>1 hour), note that explicitly

RULE #3 — HANDLE MISSING DATA:
If a tool returns no data or errors, say clearly:
"I don't have current data for [X]. The data may not be available yet or the team/competition may not be in my coverage."
NEVER make up information to fill gaps.

RULE #4 — SOCCER EXPERTISE:
You are an elite soccer analyst. When discussing soccer:
- Use correct terminology: "match" not "game", "table" not "standings", "fixture" not "schedule"
- Explain competition-specific tie-breakers when relevant
- Note match context: league vs cup, group stage vs knockout, home/away legs
- Reference proper competition names: "Champions League" not "UCL" (unless abbreviating)

RULE #5 — NO BETTING ADVICE:
If asked for picks, predictions, or betting advice:
1. Say: "I can't recommend picks, but I can explain the matchup in full context."
2. Then provide: recent form, H2H record, injuries, venue/weather factors
3. Let the user draw their own conclusions

Supported competitions: ${SUPPORTED_SPORTS.filter(s => s.sport === "soccer").map(s => s.name).join(", ")}, plus NFL, NBA, MLB, NHL, and more.

RULE #6 — SPORT-AWARE FORMATTING:
Use correct terminology for each sport:

SOCCER: "match" (not game), "table" (not standings), "fixture", "side/club" (not team)
- Scores: "2-1" format, say "beat" or "drew with"
- Periods: "first half", "second half", "extra time"
- Table: P W D L GF GA GD Pts

AMERICAN FOOTBALL (NFL/NCAAF): "game", "standings", "squad/roster"
- Scores: "Chiefs 24, Raiders 17" format
- Periods: "1st quarter", "4th quarter", "overtime"

BASKETBALL (NBA/NCAAB): "game", "standings"  
- Periods: "Q1", "Q2", "OT"
- Stats: PPG, RPG, APG

BASEBALL (MLB): "game", "standings"
- Scores: "5-3" or runs format
- Periods: "top/bottom of the 3rd", "9th inning"

HOCKEY (NHL): "game", "standings"
- Periods: "1st period", "2nd period", "OT", "shootout"
- Stats: G, A, Pts, +/-

TENNIS: "match", "rankings"
- Scores: sets and games (6-4, 7-6)
- Rounds: "quarter-finals", "semi-finals", "final"

GOLF: "tournament", "leaderboard"  
- Scores: relative to par (-8, +2, E for even)
- Positions: "T5" for tied 5th

MOTORSPORT (F1/NASCAR): "race", "championship"
- Positions: "P1", "P2" or "1st", "2nd"
- Times: gap format "+1.234s" or "+1 lap"

COMBAT SPORTS (UFC/Boxing): "bout/fight", "rankings"
- Results: "won by KO/TKO", "won by submission", "won by decision"
- Cards: "main event", "co-main", "prelims"`;

  
  // Build messages
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];
  
  // Only Scout (billy) uses function calling for sports data
  const shouldUseTools = persona === "billy" && !isBettingAdvice;
  
  try {
    // First call - may include tool calls (using tier-based routing)
    const response = await client.chat.completions.create({
      model: routing.model,
      messages,
      tools: shouldUseTools ? SCOUT_TOOLS : undefined,
      tool_choice: shouldUseTools ? "auto" : undefined,
      max_tokens: routing.maxTokens,
      temperature: routing.temperature,
    });
    
    const assistantMessage = response.choices[0]?.message;
    
    // Check if model wants to call tools
    if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Execute all tool calls
      const toolResults: Array<{ id: string; name: string; result: any }> = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        const fn = (toolCall as any).function;
        const toolName = fn.name;
        const args = JSON.parse(fn.arguments || "{}");
        
        toolsUsed.push(toolName);
        const result = await executeToolCall(db, userId, toolName, args);
        sources.push({ 
          sourceName: result.source, 
          lastUpdated: result.lastUpdated,
          dataFreshness: getDataFreshness(result.lastUpdated)
        });
        
        toolResults.push({
          id: toolCall.id,
          name: toolName,
          result,
        });
      }
      
      // Second call with tool results
      const messagesWithTools: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...messages,
        assistantMessage as OpenAI.Chat.Completions.ChatCompletionMessageParam,
        ...toolResults.map(tr => ({
          role: "tool" as const,
          tool_call_id: tr.id,
          content: JSON.stringify(tr.result),
        })),
      ];
      
      const finalResponse = await client.chat.completions.create({
        model: routing.model,
        messages: messagesWithTools,
        max_tokens: routing.maxTokens,
        temperature: routing.temperature,
      });
      
      const finalContent = finalResponse.choices[0]?.message?.content || "Unable to generate response.";
      
      // Build structured response for Scout
      const structured = buildStructuredResponse(persona, finalContent, toolsUsed, sources, isBettingAdvice);
      
      return {
        response: finalContent,
        structured,
        toolsUsed,
        sources,
        isBettingAdvice,
        flags,
      };
    }
    
    // No tool calls needed
    const content = assistantMessage?.content || "Unable to generate response.";
    const structured = buildStructuredResponse(persona, content, toolsUsed, sources, isBettingAdvice);
    
    // Learn from this question (async, don't await)
    if (persona === "billy" && memorySummary?.preferences.autoLearnFollows) {
      const entities = extractEntitiesFromMessage(message);
      learnFromQuestion(db, userId, "PROD", {
        topic: message.substring(0, 200),
        entityKeys: entities,
      }).catch(err => console.error("Failed to record interaction:", err));
    }
    
    return {
      response: content,
      structured,
      toolsUsed,
      sources,
      isBettingAdvice,
      flags,
    };
  } catch (error) {
    console.error("AI generation error:", error);
    throw error;
  }
}
