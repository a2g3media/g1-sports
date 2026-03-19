/**
 * Coach Whisper - Contextual betting tips for game cards
 * Generates short, actionable insights based on game data
 */

interface WhisperGame {
  homeTeam: {
    code: string;
    name: string;
    score: number;
    record?: string;
  };
  awayTeam: {
    code: string;
    name: string;
    score: number;
    record?: string;
  };
  status: "LIVE" | "SCHEDULED" | "FINAL";
  period?: string;
  clock?: string;
  spread?: number;
  channel?: string;
}

interface CoachWhisper {
  text: string;
  sentiment: "bullish" | "bearish" | "neutral" | "alert";
  icon: "fire" | "target" | "eye" | "zap" | "clock" | "trending";
}

// Parse record string like "15-8" into wins/losses
function parseRecord(record?: string): { wins: number; losses: number } | null {
  if (!record) return null;
  const match = record.match(/(\d+)-(\d+)/);
  if (!match) return null;
  return { wins: parseInt(match[1]), losses: parseInt(match[2]) };
}

// Calculate win percentage from record
function getWinPct(record?: string): number | null {
  const parsed = parseRecord(record);
  if (!parsed || (parsed.wins + parsed.losses) === 0) return null;
  return parsed.wins / (parsed.wins + parsed.losses);
}

// Generate whisper for live games
function getLiveWhisper(game: WhisperGame): CoachWhisper | null {
  const scoreDiff = game.homeTeam.score - game.awayTeam.score;
  const totalScore = game.homeTeam.score + game.awayTeam.score;
  const period = game.period?.toLowerCase() || "";
  
  // Late game scenarios
  const isLateGame = period.includes("4th") || period.includes("q4") || 
                     period.includes("2nd half") || period.includes("9th") ||
                     period.includes("3rd") && period.includes("period");
  
  // Blowout detection
  if (Math.abs(scoreDiff) >= 20) {
    const leader = scoreDiff > 0 ? game.homeTeam.code : game.awayTeam.code;
    return {
      text: `${leader} in cruise control`,
      sentiment: "neutral",
      icon: "eye"
    };
  }
  
  // Nail-biter in late game
  if (isLateGame && Math.abs(scoreDiff) <= 5) {
    return {
      text: "Nail-biter finish brewing",
      sentiment: "alert",
      icon: "fire"
    };
  }
  
  // Comeback alert
  if (game.spread && scoreDiff !== 0) {
    const favored = game.spread < 0 ? "home" : "away";
    const trailing = scoreDiff < 0 ? "home" : "away";
    
    if (favored === trailing && Math.abs(scoreDiff) >= 8) {
      return {
        text: "Favorite fighting from behind",
        sentiment: "alert",
        icon: "zap"
      };
    }
  }
  
  // High-scoring game
  if (totalScore > 180) {
    return {
      text: "Pace favoring the over",
      sentiment: "bullish",
      icon: "trending"
    };
  }
  
  // Close game
  if (Math.abs(scoreDiff) <= 3) {
    return {
      text: "Every possession matters",
      sentiment: "alert",
      icon: "target"
    };
  }
  
  return null;
}

// Generate whisper for scheduled games
function getScheduledWhisper(game: WhisperGame): CoachWhisper | null {
  const homeWinPct = getWinPct(game.homeTeam.record);
  const awayWinPct = getWinPct(game.awayTeam.record);
  
  // Heavy favorite by spread
  if (game.spread && Math.abs(game.spread) >= 10) {
    const favored = game.spread < 0 ? game.homeTeam.code : game.awayTeam.code;
    return {
      text: `${favored} heavy favorite (-${Math.abs(game.spread)})`,
      sentiment: "neutral",
      icon: "target"
    };
  }
  
  // Pick'em game
  if (game.spread && Math.abs(game.spread) <= 2) {
    return {
      text: "True toss-up—trust your read",
      sentiment: "neutral",
      icon: "eye"
    };
  }
  
  // Mismatch by record
  if (homeWinPct !== null && awayWinPct !== null) {
    const winPctDiff = homeWinPct - awayWinPct;
    
    if (winPctDiff > 0.25) {
      return {
        text: `${game.homeTeam.code} rolling at home`,
        sentiment: "bullish",
        icon: "fire"
      };
    }
    
    if (winPctDiff < -0.25) {
      return {
        text: `${game.awayTeam.code} dangerous on the road`,
        sentiment: "bullish",
        icon: "zap"
      };
    }
  }
  
  // Primetime spotlight
  const primetimeChannels = ['ESPN', 'TNT', 'ABC', 'FOX', 'NBC'];
  if (game.channel && primetimeChannels.some(ch => game.channel?.includes(ch))) {
    return {
      text: "National spotlight—expect intensity",
      sentiment: "neutral",
      icon: "eye"
    };
  }
  
  // Spread value
  if (game.spread && Math.abs(game.spread) >= 5 && Math.abs(game.spread) <= 8) {
    const dog = game.spread > 0 ? game.homeTeam.code : game.awayTeam.code;
    return {
      text: `${dog} could keep it close`,
      sentiment: "neutral",
      icon: "target"
    };
  }
  
  return null;
}

// Generate whisper for final games
function getFinalWhisper(game: WhisperGame): CoachWhisper | null {
  const scoreDiff = game.homeTeam.score - game.awayTeam.score;
  const winner = scoreDiff > 0 ? game.homeTeam : game.awayTeam;
  const loser = scoreDiff > 0 ? game.awayTeam : game.homeTeam;
  
  // Cover check
  if (game.spread !== undefined) {
    const homeMargin = game.homeTeam.score - game.awayTeam.score;
    
    // Close cover
    const coverMargin = homeMargin - (-game.spread);
    if (Math.abs(coverMargin) <= 2) {
      return {
        text: "Came down to the wire on the spread",
        sentiment: "neutral",
        icon: "target"
      };
    }
    
    // Blowout cover
    if (Math.abs(scoreDiff) >= 20) {
      return {
        text: `${winner.code} dominated outright`,
        sentiment: "neutral",
        icon: "fire"
      };
    }
  }
  
  // Upset detection (if we have records)
  const winnerPct = getWinPct(winner.record);
  const loserPct = getWinPct(loser.record);
  
  if (winnerPct !== null && loserPct !== null && loserPct - winnerPct > 0.2) {
    return {
      text: `${winner.code} pulled the upset`,
      sentiment: "alert",
      icon: "zap"
    };
  }
  
  return null;
}

/**
 * Generate a Coach Whisper for a game
 * Returns null if no interesting insight available
 */
export function generateCoachWhisper(game: WhisperGame): CoachWhisper | null {
  switch (game.status) {
    case "LIVE":
      return getLiveWhisper(game);
    case "SCHEDULED":
      return getScheduledWhisper(game);
    case "FINAL":
      return getFinalWhisper(game);
    default:
      return null;
  }
}

/**
 * Get icon component name for whisper
 */
export function getWhisperIconName(whisper: CoachWhisper): string {
  return whisper.icon;
}

/**
 * Get color classes for whisper sentiment
 */
export function getWhisperColors(sentiment: CoachWhisper["sentiment"]): string {
  switch (sentiment) {
    case "bullish":
      return "text-emerald-400";
    case "bearish":
      return "text-red-400";
    case "alert":
      return "text-amber-400";
    case "neutral":
    default:
      return "text-cyan-400";
  }
}
