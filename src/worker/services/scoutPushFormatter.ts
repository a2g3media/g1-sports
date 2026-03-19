/**
 * Coach G Push Notification Formatter
 * 
 * Enhanced push format for Coach G Live Watch:
 * - Title: "Coach G: [Short Headline]"
 * - Body: 1 sentence context + timestamp
 * - No long paragraphs
 * - No betting advice language
 * - "as of [time]" when referencing odds/lines
 * 
 * Deep link format for split view: /scores/game/:gameId/live?context=:category&alertId=:id
 */
import { sanitizeCoachGText } from "./coachgCompliance";

export interface ScoutPushAlert {
  id: string;
  gameId: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: string;
  homeTeam: string;
  awayTeam: string;
  score?: { home: number; away: number };
  period?: string;
  clock?: string;
  metadata?: Record<string, unknown>;
}

export interface FormattedScoutPush {
  title: string;
  body: string;
  deepLink: string;
  data: {
    gameId: string;
    alertId: string;
    category: string;
    openScout: boolean;
    contextType: string;
  };
}

// ============================================================================
// PUSH FORMATTING
// ============================================================================

/**
 * Format a Coach G push notification with proper branding and context
 */
export function formatScoutPush(alert: ScoutPushAlert): FormattedScoutPush {
  const title = sanitizeCoachGText(`Coach G Insight: ${generateHeadline(alert)}`);
  const body = sanitizeCoachGText(generateBody(alert));
  const deepLink = generateDeepLink(alert);
  
  return {
    title,
    body,
    deepLink,
    data: {
      gameId: alert.gameId,
      alertId: alert.id,
      category: alert.category,
      openScout: true,
      contextType: getCategoryContext(alert.category),
    },
  };
}

/**
 * Generate short headline for push title (max ~40 chars)
 */
function generateHeadline(alert: ScoutPushAlert): string {
  const { category, metadata, homeTeam, awayTeam, score } = alert;
  
  switch (category) {
    case "game_winner":
      return `${metadata?.winningTeam || homeTeam} wins!`;
    
    case "overtime_start":
      return `OT: ${awayTeam} vs ${homeTeam}`;
    
    case "final_score":
      return `Final: ${awayTeam} ${score?.away ?? 0}-${score?.home ?? 0} ${homeTeam}`;
    
    case "scoring_event": {
      const scorer = metadata?.team || homeTeam;
      const eventType = metadata?.eventType || "scores";
      return `${scorer} ${eventType}`;
    }
    
    case "period_break": {
      const period = metadata?.period || alert.period;
      return `End ${period}`;
    }
    
    case "critical_injury": {
      const player = metadata?.playerName || "Player";
      return `${player} ruled out`;
    }
    
    case "line_movement": {
      const direction = (metadata?.changeAmount as number) > 0 ? "↑" : "↓";
      const market = metadata?.marketType || "Line";
      return `${market} moved ${direction}`;
    }
    
    case "dominant_performance": {
      const type = metadata?.performanceType || "Performance";
      return `${type} alert`;
    }
    
    case "weather_alert":
      return `Weather update`;
    
    default:
      return `${awayTeam} @ ${homeTeam}`;
  }
}

/**
 * Generate contextual body text (1 sentence + timestamp)
 */
function generateBody(alert: ScoutPushAlert): string {
  const { category, metadata, timestamp, homeTeam, awayTeam, score, period, clock } = alert;
  
  // Format timestamp
  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString("en-US", { 
    hour: "numeric", 
    minute: "2-digit",
    hour12: true 
  });
  
  // Build game context
  const gameContext = score 
    ? `${awayTeam} ${score.away}-${score.home} ${homeTeam}`
    : `${awayTeam} @ ${homeTeam}`;
  
  const periodClock = period && clock ? ` (${period}, ${clock})` : period ? ` (${period})` : "";
  
  switch (category) {
    case "game_winner":
      return `What's up G1. ${gameContext}.${periodClock} Something bettors will notice: late execution decided it. Informational only.`;
    
    case "overtime_start":
      return `Interesting matchup here. Tied at ${score?.home ?? 0}, headed to OT. Watch pace and foul pressure in bonus time. Informational only.`;
    
    case "final_score":
      return `Final is in: ${gameContext}. As of ${timeStr}. Informational only.`;
    
    case "scoring_event": {
      const description = metadata?.description || "Scoring update";
      return `Coach G update: ${description}.${periodClock} As of ${timeStr}.`;
    }
    
    case "period_break": {
      const summary = metadata?.summary || gameContext;
      return `Period check-in: ${summary}. Something bettors will notice: tempo and rotation patterns heading into the next stretch.`;
    }
    
    case "critical_injury": {
      const player = metadata?.playerName || "Player";
      const injury = metadata?.injury || "injury";
      return `Coach G alert: ${player} out with ${injury}. Status as of ${timeStr}. Watch matchup redistribution effects.`;
    }
    
    case "line_movement": {
      const market = metadata?.marketType || "Line";
      const from = metadata?.previousValue;
      const to = metadata?.newValue;
      const moveDesc = from && to ? `${from} → ${to}` : "shifted";
      return `Market movement: ${market} ${moveDesc}. As of ${timeStr}. Something bettors will notice: books reacting to new information.`;
    }
    
    case "dominant_performance": {
      const description = metadata?.description || "Exceptional performance in progress";
      return `Interesting matchup here: ${description}.${periodClock} Monitor usage sustainability and defensive adjustments.`;
    }
    
    case "weather_alert": {
      const condition = metadata?.condition || "Weather change";
      return `Weather update: ${condition} affecting game context. Informational only.`;
    }
    
    default:
      return `Coach G update: ${gameContext}. As of ${timeStr}.`;
  }
}

/**
 * Generate deep link URL for split view
 * Uses /scores/game/:id/live for immersive game + Scout experience
 */
function generateDeepLink(alert: ScoutPushAlert): string {
  const params = new URLSearchParams({
    context: alert.category,
    alertId: alert.id,
  });
  
  // Route to split view for push notifications
  return `/scores/game/${alert.gameId}/live?${params.toString()}`;
}

/**
 * Get context type for Scout drawer pre-population
 */
function getCategoryContext(category: string): string {
  const contextMap: Record<string, string> = {
    game_winner: "game_summary",
    final_score: "game_summary",
    overtime_start: "live_action",
    scoring_event: "live_action",
    period_break: "period_summary",
    critical_injury: "injury_report",
    line_movement: "odds_analysis",
    dominant_performance: "performance_analysis",
    weather_alert: "weather_impact",
  };
  
  return contextMap[category] || "game_overview";
}

// ============================================================================
// BUNDLED PUSH FORMATTING
// ============================================================================

/**
 * Format a bundled push (multiple alerts from same game)
 */
export function formatBundledScoutPush(
  alerts: ScoutPushAlert[],
  gameId: string
): FormattedScoutPush {
  if (alerts.length === 0) {
    throw new Error("Cannot format empty alert bundle");
  }
  
  if (alerts.length === 1) {
    return formatScoutPush(alerts[0]);
  }
  
  const count = alerts.length;
  
  // Title: "Coach G: X updates in [Game]"
  const title = sanitizeCoachGText(`Coach G Insight: ${count} live updates`);
  
  // Body: List key events (max 3)
  const eventLines = alerts.slice(0, 3).map(a => {
    const headline = generateHeadline({ ...a, category: a.category });
    return `• ${headline}`;
  });
  
  if (count > 3) {
    eventLines.push(`• +${count - 3} more`);
  }
  
  const body = sanitizeCoachGText(`What's up G1. ${eventLines.join(" ")} Informational only.`);
  
  // Deep link to split view for immersive experience
  const deepLink = `/scores/game/${gameId}/live?context=bundle&alertId=bundle_${Date.now()}`;
  
  return {
    title,
    body,
    deepLink,
    data: {
      gameId,
      alertId: `bundle_${gameId}_${Date.now()}`,
      category: "bundled_alerts",
      openScout: true,
      contextType: "game_overview",
    },
  };
}

// ============================================================================
// TIER-SPECIFIC FORMATTING
// ============================================================================

/**
 * Elite tier gets slightly richer push context (but still short)
 */
export function formatElitePush(alert: ScoutPushAlert): FormattedScoutPush {
  const basePush = formatScoutPush(alert);
  
  // Elite gets priority indicator in title when warranted
  if (alert.severity === "critical" || alert.severity === "high") {
    basePush.title = `⚡ ${basePush.title}`;
  }
  
  return basePush;
}

/**
 * Pro tier standard format
 */
export function formatProPush(alert: ScoutPushAlert): FormattedScoutPush {
  return formatScoutPush(alert);
}

// ============================================================================
// EXAMPLES (for documentation)
// ============================================================================

/**
 * Push format examples for documentation
 */
export const PUSH_FORMAT_EXAMPLES = {
  game_winner: {
    title: "Coach G: Chiefs win!",
    body: "Chiefs 27-24 Bills. (4Q, 0:03)",
  },
  final_score: {
    title: "Coach G: Final: Bills 24-27 Chiefs",
    body: "Game ended at 8:47 PM.",
  },
  scoring_event: {
    title: "Coach G: Chiefs TD",
    body: "Mahomes to Kelce, 8 yards. (4Q, 2:14) (8:42 PM)",
  },
  period_break: {
    title: "Coach G: End Q3",
    body: "Chiefs lead 21-17. Defense forcing turnovers.",
  },
  line_movement: {
    title: "Coach G: Spread moved ↓",
    body: "KC -3 → KC -1.5. As of 8:30 PM.",
  },
  critical_injury: {
    title: "Coach G: Josh Allen ruled out",
    body: "Josh Allen out with ankle injury. Status as of 8:15 PM.",
  },
  dominant_performance: {
    title: "Coach G: Mahomes on fire",
    body: "4 TDs, 0 INTs, 320 yards through 3 quarters. (Q3, 1:30)",
  },
  bundled: {
    title: "Coach G: 3 updates",
    body: "• Chiefs TD\n• Spread moved ↓\n• Allen questionable",
  },
};
