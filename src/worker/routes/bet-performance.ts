/**
 * Bet Performance API Routes
 * Provides win/loss statistics, hit rates, and ROI calculations
 */

import { Hono } from "hono";
interface Bindings {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>();

// Helper to calculate ROI
function calculateROI(totalStaked: number, totalProfit: number): number {
  if (totalStaked === 0) return 0;
  return (totalProfit / totalStaked) * 100;
}

// Helper to calculate hit rate percentage
function calculateHitRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return (wins / total) * 100;
}

// GET /api/bet-performance - Get overall betting performance stats
app.get("/", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = c.env.DB;

  try {
    // Get all confirmed tickets (non-draft)
    const tickets = await db
      .prepare(
        `SELECT id, title, ticket_type, stake_amount, to_win_amount, total_odds, status, created_at
         FROM bet_tickets 
         WHERE user_id = ? AND status != 'draft'
         ORDER BY created_at DESC`
      )
      .bind(userId)
      .all();

    // Get all legs with their statuses
    const legs = await db
      .prepare(
        `SELECT btl.*, bt.status as ticket_status, bt.created_at as ticket_date
         FROM bet_ticket_legs btl
         JOIN bet_tickets bt ON btl.ticket_id = bt.id
         WHERE bt.user_id = ? AND bt.status != 'draft'`
      )
      .bind(userId)
      .all();

    // Calculate overall stats
    const totalTickets = tickets.results?.length || 0;
    const wonTickets = tickets.results?.filter((t: any) => t.status === 'won').length || 0;
    const lostTickets = tickets.results?.filter((t: any) => t.status === 'lost').length || 0;
    const pushTickets = tickets.results?.filter((t: any) => t.status === 'push').length || 0;
    const pendingTickets = tickets.results?.filter((t: any) => 
      t.status === 'pending' || t.status === 'active' || t.status === 'confirmed'
    ).length || 0;

    // Calculate leg stats
    const totalLegs = legs.results?.length || 0;
    const wonLegs = legs.results?.filter((l: any) => l.leg_status === 'Won').length || 0;
    const lostLegs = legs.results?.filter((l: any) => l.leg_status === 'Lost').length || 0;
    const pushLegs = legs.results?.filter((l: any) => l.leg_status === 'Push').length || 0;
    const pendingLegs = legs.results?.filter((l: any) => 
      l.leg_status === 'Pending' || l.leg_status === 'Covering' || l.leg_status === 'NotCovering'
    ).length || 0;

    // Calculate ROI (simplified - based on settled tickets only)
    let totalStaked = 0;
    let totalReturns = 0;
    
    tickets.results?.forEach((t: any) => {
      const stake = t.stake_amount || 0;
      const toWin = t.to_win_amount || 0;
      
      if (t.status === 'won') {
        totalStaked += stake;
        totalReturns += stake + toWin;
      } else if (t.status === 'lost') {
        totalStaked += stake;
      } else if (t.status === 'push') {
        // Push returns stake
        totalStaked += stake;
        totalReturns += stake;
      }
    });

    const totalProfit = totalReturns - totalStaked;
    const roi = calculateROI(totalStaked, totalProfit);

    // Break down by sport
    const sportStats: Record<string, { wins: number; losses: number; pushes: number; pending: number }> = {};
    legs.results?.forEach((l: any) => {
      const sport = l.sport || 'Unknown';
      if (!sportStats[sport]) {
        sportStats[sport] = { wins: 0, losses: 0, pushes: 0, pending: 0 };
      }
      if (l.leg_status === 'Won') sportStats[sport].wins++;
      else if (l.leg_status === 'Lost') sportStats[sport].losses++;
      else if (l.leg_status === 'Push') sportStats[sport].pushes++;
      else sportStats[sport].pending++;
    });

    // Break down by market type
    const marketStats: Record<string, { wins: number; losses: number; pushes: number; pending: number }> = {};
    legs.results?.forEach((l: any) => {
      const market = l.market_type || 'Other';
      if (!marketStats[market]) {
        marketStats[market] = { wins: 0, losses: 0, pushes: 0, pending: 0 };
      }
      if (l.leg_status === 'Won') marketStats[market].wins++;
      else if (l.leg_status === 'Lost') marketStats[market].losses++;
      else if (l.leg_status === 'Push') marketStats[market].pushes++;
      else marketStats[market].pending++;
    });

    // Calculate streaks
    const settledTickets = tickets.results
      ?.filter((t: any) => t.status === 'won' || t.status === 'lost')
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];
    
    let currentStreak = 0;
    let currentStreakType: 'W' | 'L' | null = null;
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;

    for (const ticket of settledTickets) {
      const t = ticket as any;
      if (t.status === 'won') {
        if (currentStreakType === null || currentStreakType === 'W') {
          currentStreak++;
          currentStreakType = 'W';
        }
        tempWinStreak++;
        tempLossStreak = 0;
        if (tempWinStreak > longestWinStreak) longestWinStreak = tempWinStreak;
      } else if (t.status === 'lost') {
        if (currentStreakType === null || currentStreakType === 'L') {
          currentStreak++;
          currentStreakType = 'L';
        }
        tempLossStreak++;
        tempWinStreak = 0;
        if (tempLossStreak > longestLossStreak) longestLossStreak = tempLossStreak;
      }
      
      if (currentStreakType !== null && t.status !== (currentStreakType === 'W' ? 'won' : 'lost')) {
        break; // End of current streak
      }
    }

    // Recent performance (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentTickets = tickets.results?.filter((t: any) => 
      new Date(t.created_at) >= sevenDaysAgo
    ) || [];
    const recentWins = recentTickets.filter((t: any) => t.status === 'won').length;
    const recentLosses = recentTickets.filter((t: any) => t.status === 'lost').length;

    return c.json({
      overview: {
        totalTickets,
        wonTickets,
        lostTickets,
        pushTickets,
        pendingTickets,
        ticketWinRate: calculateHitRate(wonTickets, wonTickets + lostTickets),
        totalLegs,
        wonLegs,
        lostLegs,
        pushLegs,
        pendingLegs,
        legHitRate: calculateHitRate(wonLegs, wonLegs + lostLegs),
      },
      financial: {
        totalStaked,
        totalReturns,
        totalProfit,
        roi,
        avgStake: totalTickets > 0 ? totalStaked / (wonTickets + lostTickets + pushTickets || 1) : 0,
      },
      streaks: {
        currentStreak,
        currentStreakType,
        longestWinStreak,
        longestLossStreak,
      },
      recent: {
        wins: recentWins,
        losses: recentLosses,
        total: recentTickets.length,
        hitRate: calculateHitRate(recentWins, recentWins + recentLosses),
      },
      bySport: Object.entries(sportStats).map(([sport, stats]) => ({
        sport,
        ...stats,
        total: stats.wins + stats.losses + stats.pushes + stats.pending,
        hitRate: calculateHitRate(stats.wins, stats.wins + stats.losses),
      })),
      byMarket: Object.entries(marketStats).map(([market, stats]) => ({
        market,
        ...stats,
        total: stats.wins + stats.losses + stats.pushes + stats.pending,
        hitRate: calculateHitRate(stats.wins, stats.wins + stats.losses),
      })),
    });
  } catch (error) {
    console.error("Error fetching bet performance:", error);
    return c.json({ error: "Failed to fetch performance data" }, 500);
  }
});

// GET /api/bet-performance/history - Get historical performance by time period
app.get("/history", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const period = c.req.query("period") || "30d"; // 7d, 30d, 90d, all
  const db = c.env.DB;

  try {
    let dateFilter = "";
    if (period !== "all") {
      const days = parseInt(period.replace("d", "")) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      dateFilter = `AND bt.created_at >= '${startDate.toISOString()}'`;
    }

    // Get daily aggregates
    const dailyStats = await db
      .prepare(
        `SELECT 
          DATE(bt.created_at) as date,
          COUNT(CASE WHEN bt.status = 'won' THEN 1 END) as wins,
          COUNT(CASE WHEN bt.status = 'lost' THEN 1 END) as losses,
          COUNT(CASE WHEN bt.status = 'push' THEN 1 END) as pushes,
          COUNT(*) as total,
          SUM(CASE WHEN bt.status = 'won' THEN bt.to_win_amount ELSE 0 END) as winnings,
          SUM(CASE WHEN bt.status = 'lost' THEN bt.stake_amount ELSE 0 END) as losses_amount
         FROM bet_tickets bt
         WHERE bt.user_id = ? AND bt.status IN ('won', 'lost', 'push') ${dateFilter}
         GROUP BY DATE(bt.created_at)
         ORDER BY date DESC
         LIMIT 90`
      )
      .bind(userId)
      .all();

    // Calculate cumulative profit over time
    let cumulativeProfit = 0;
    const historyWithCumulative = (dailyStats.results || []).reverse().map((day: any) => {
      const dailyProfit = (day.winnings || 0) - (day.losses_amount || 0);
      cumulativeProfit += dailyProfit;
      return {
        ...day,
        dailyProfit,
        cumulativeProfit,
        hitRate: day.wins + day.losses > 0 ? (day.wins / (day.wins + day.losses)) * 100 : 0,
      };
    });

    return c.json({
      period,
      history: historyWithCumulative.reverse(),
    });
  } catch (error) {
    console.error("Error fetching performance history:", error);
    return c.json({ error: "Failed to fetch history" }, 500);
  }
});

// GET /api/bet-performance/tickets - Get recent settled tickets
app.get("/tickets", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const limit = parseInt(c.req.query("limit") || "20");
  const status = c.req.query("status"); // won, lost, push, pending, all
  const db = c.env.DB;

  try {
    let statusFilter = "AND status != 'draft'";
    if (status && status !== "all") {
      if (status === "pending") {
        statusFilter = "AND status IN ('pending', 'active', 'confirmed')";
      } else {
        statusFilter = `AND status = '${status}'`;
      }
    }

    const tickets = await db
      .prepare(
        `SELECT * FROM bet_tickets 
         WHERE user_id = ? ${statusFilter}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(userId, limit)
      .all();

    // Get legs for each ticket
    const ticketIds = (tickets.results || []).map((t: any) => t.id);
    let legsMap: Record<number, any[]> = {};
    
    if (ticketIds.length > 0) {
      const legs = await db
        .prepare(
          `SELECT * FROM bet_ticket_legs 
           WHERE ticket_id IN (${ticketIds.join(",")})
           ORDER BY leg_index`
        )
        .all();
      
      (legs.results || []).forEach((leg: any) => {
        if (!legsMap[leg.ticket_id]) legsMap[leg.ticket_id] = [];
        legsMap[leg.ticket_id].push(leg);
      });
    }

    const ticketsWithLegs = (tickets.results || []).map((t: any) => ({
      ...t,
      legs: legsMap[t.id] || [],
    }));

    return c.json({ tickets: ticketsWithLegs });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return c.json({ error: "Failed to fetch tickets" }, 500);
  }
});

export default app;
