/**
 * Line Movement Detection Service
 * Tracks odds changes and detects sharp action indicators
 */

// Movement thresholds for "sharp" action
const SHARP_THRESHOLDS = {
  spread: 1.0,        // 1 point spread move is significant
  total: 1.5,         // 1.5 point total move
  moneyline: 25,      // 25 point ML move (e.g., -110 to -135)
  timeWindow: 3600000, // 1 hour in ms - movements within this window
};

// Movement severity levels
export type MovementSeverity = 'minor' | 'moderate' | 'sharp' | 'steam';

export interface OddsSnapshot {
  gameId: string;
  sport: string;
  timestamp: string;
  homeTeam: string;
  awayTeam: string;
  spread: number | null;
  total: number | null;
  homeML: number | null;
  awayML: number | null;
  source: string; // sportsbook id
}

export interface LineMovement {
  id: string;
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  type: 'spread' | 'total' | 'moneyline';
  direction: 'up' | 'down';
  previousValue: number;
  currentValue: number;
  change: number;
  severity: MovementSeverity;
  detectedAt: string;
  source: string;
  analysis: string;
}

export interface SharpAlert {
  id: string;
  movement: LineMovement;
  headline: string;
  description: string;
  isNew: boolean;
  expiresAt: string;
}

// In-memory cache for odds history (persists during worker lifetime)
const oddsHistory: Map<string, OddsSnapshot[]> = new Map();
const activeAlerts: Map<string, SharpAlert> = new Map();

/**
 * Calculate movement severity based on the change magnitude
 */
function calculateSeverity(type: LineMovement['type'], change: number): MovementSeverity {
  const absChange = Math.abs(change);
  
  switch (type) {
    case 'spread':
      if (absChange >= 2.5) return 'steam';
      if (absChange >= 1.5) return 'sharp';
      if (absChange >= 1.0) return 'moderate';
      return 'minor';
    
    case 'total':
      if (absChange >= 3.0) return 'steam';
      if (absChange >= 2.0) return 'sharp';
      if (absChange >= 1.5) return 'moderate';
      return 'minor';
    
    case 'moneyline':
      if (absChange >= 50) return 'steam';
      if (absChange >= 35) return 'sharp';
      if (absChange >= 25) return 'moderate';
      return 'minor';
    
    default:
      return 'minor';
  }
}

/**
 * Generate analysis text for a line movement
 */
function generateAnalysis(movement: LineMovement): string {
  const { type, direction, severity, homeTeam, awayTeam, change } = movement;
  const absChange = Math.abs(change);
  
  const teamFocus = direction === 'up' 
    ? (type === 'spread' ? awayTeam : homeTeam)
    : (type === 'spread' ? homeTeam : awayTeam);
  
  let action = '';
  switch (severity) {
    case 'steam':
      action = 'Major steam move detected - heavy sharp money';
      break;
    case 'sharp':
      action = 'Sharp action detected - professional bettors moving line';
      break;
    case 'moderate':
      action = 'Notable movement - watch for continuation';
      break;
    default:
      action = 'Minor adjustment';
  }
  
  switch (type) {
    case 'spread':
      return `${action}. Spread moved ${absChange.toFixed(1)} points ${direction === 'up' ? 'toward' : 'away from'} ${teamFocus}.`;
    case 'total':
      return `${action}. Total moved ${absChange.toFixed(1)} points ${direction}.`;
    case 'moneyline':
      return `${action}. Moneyline shifted ${Math.round(absChange)} points favoring ${teamFocus}.`;
    default:
      return action;
  }
}

/**
 * Record a new odds snapshot and detect movements
 */
export function recordOddsSnapshot(snapshot: OddsSnapshot): LineMovement[] {
  const key = `${snapshot.gameId}-${snapshot.source}`;
  const history = oddsHistory.get(key) || [];
  
  // Add new snapshot
  history.push(snapshot);
  
  // Keep only last 24 hours of history
  const cutoff = Date.now() - 86400000;
  const filtered = history.filter(s => new Date(s.timestamp).getTime() > cutoff);
  oddsHistory.set(key, filtered);
  
  // Find movements compared to previous snapshot
  if (filtered.length < 2) return [];
  
  const prev = filtered[filtered.length - 2];
  const curr = filtered[filtered.length - 1];
  const movements: LineMovement[] = [];
  
  // Check spread movement
  if (prev.spread !== null && curr.spread !== null) {
    const change = curr.spread - prev.spread;
    if (Math.abs(change) >= SHARP_THRESHOLDS.spread) {
      const severity = calculateSeverity('spread', change);
      const movement: LineMovement = {
        id: `${key}-spread-${Date.now()}`,
        gameId: curr.gameId,
        sport: curr.sport,
        homeTeam: curr.homeTeam,
        awayTeam: curr.awayTeam,
        gameTime: new Date(Date.now() + 7200000).toISOString(), // Placeholder
        type: 'spread',
        direction: change > 0 ? 'up' : 'down',
        previousValue: prev.spread,
        currentValue: curr.spread,
        change,
        severity,
        detectedAt: new Date().toISOString(),
        source: curr.source,
        analysis: '',
      };
      movement.analysis = generateAnalysis(movement);
      movements.push(movement);
    }
  }
  
  // Check total movement
  if (prev.total !== null && curr.total !== null) {
    const change = curr.total - prev.total;
    if (Math.abs(change) >= SHARP_THRESHOLDS.total) {
      const severity = calculateSeverity('total', change);
      const movement: LineMovement = {
        id: `${key}-total-${Date.now()}`,
        gameId: curr.gameId,
        sport: curr.sport,
        homeTeam: curr.homeTeam,
        awayTeam: curr.awayTeam,
        gameTime: new Date(Date.now() + 7200000).toISOString(),
        type: 'total',
        direction: change > 0 ? 'up' : 'down',
        previousValue: prev.total,
        currentValue: curr.total,
        change,
        severity,
        detectedAt: new Date().toISOString(),
        source: curr.source,
        analysis: '',
      };
      movement.analysis = generateAnalysis(movement);
      movements.push(movement);
    }
  }
  
  // Check moneyline movement
  if (prev.homeML !== null && curr.homeML !== null) {
    const change = curr.homeML - prev.homeML;
    if (Math.abs(change) >= SHARP_THRESHOLDS.moneyline) {
      const severity = calculateSeverity('moneyline', change);
      const movement: LineMovement = {
        id: `${key}-ml-${Date.now()}`,
        gameId: curr.gameId,
        sport: curr.sport,
        homeTeam: curr.homeTeam,
        awayTeam: curr.awayTeam,
        gameTime: new Date(Date.now() + 7200000).toISOString(),
        type: 'moneyline',
        direction: change > 0 ? 'up' : 'down',
        previousValue: prev.homeML,
        currentValue: curr.homeML,
        change,
        severity,
        detectedAt: new Date().toISOString(),
        source: curr.source,
        analysis: '',
      };
      movement.analysis = generateAnalysis(movement);
      movements.push(movement);
    }
  }
  
  return movements;
}

/**
 * Create an alert from a movement
 */
export function createAlert(movement: LineMovement): SharpAlert {
  const headline = generateHeadline(movement);
  const alert: SharpAlert = {
    id: `alert-${movement.id}`,
    movement,
    headline,
    description: movement.analysis,
    isNew: true,
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
  };
  
  activeAlerts.set(alert.id, alert);
  return alert;
}

function generateHeadline(movement: LineMovement): string {
  const { type, severity, homeTeam, awayTeam, change } = movement;
  const absChange = Math.abs(change);
  
  const prefix = severity === 'steam' ? '🔥 STEAM' : severity === 'sharp' ? '⚡ SHARP' : '📊';
  
  switch (type) {
    case 'spread':
      return `${prefix} ${homeTeam} vs ${awayTeam} spread moved ${absChange.toFixed(1)} pts`;
    case 'total':
      return `${prefix} ${homeTeam} vs ${awayTeam} total ${change > 0 ? 'up' : 'down'} ${absChange.toFixed(1)}`;
    case 'moneyline':
      return `${prefix} ${homeTeam} vs ${awayTeam} ML shifted ${Math.round(absChange)}`;
    default:
      return `${prefix} Line movement detected`;
  }
}

/**
 * Get all active alerts, removing expired ones
 */
export function getActiveAlerts(sport?: string): SharpAlert[] {
  const now = Date.now();
  const alerts: SharpAlert[] = [];
  
  activeAlerts.forEach((alert, id) => {
    if (new Date(alert.expiresAt).getTime() < now) {
      activeAlerts.delete(id);
    } else if (!sport || alert.movement.sport.toUpperCase() === sport.toUpperCase()) {
      alerts.push(alert);
    }
  });
  
  // Sort by detection time (newest first)
  return alerts.sort((a, b) => 
    new Date(b.movement.detectedAt).getTime() - new Date(a.movement.detectedAt).getTime()
  );
}

/**
 * Mark an alert as read
 */
export function markAlertRead(alertId: string): boolean {
  const alert = activeAlerts.get(alertId);
  if (alert) {
    alert.isNew = false;
    return true;
  }
  return false;
}

/**
 * Clear all alerts
 */
export function clearAlerts(): void {
  activeAlerts.clear();
}

/**
 * Get odds history for a game
 */
export function getOddsHistory(gameId: string): OddsSnapshot[] {
  const allHistory: OddsSnapshot[] = [];
  oddsHistory.forEach((snapshots, key) => {
    if (key.startsWith(gameId)) {
      allHistory.push(...snapshots);
    }
  });
  return allHistory.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Generate demo line movements for testing
 */
export function getDemoLineMovements(): SharpAlert[] {
  const now = new Date();
  const demoMovements: LineMovement[] = [
    {
      id: 'demo-1',
      gameId: 'demo_nfl_1',
      sport: 'NFL',
      homeTeam: 'Chiefs',
      awayTeam: 'Raiders',
      gameTime: new Date(now.getTime() + 7200000).toISOString(),
      type: 'spread',
      direction: 'down',
      previousValue: -7.5,
      currentValue: -6.0,
      change: 1.5,
      severity: 'sharp',
      detectedAt: new Date(now.getTime() - 300000).toISOString(),
      source: 'G1100',
      analysis: 'Sharp action detected. Spread moved 1.5 points toward Raiders.',
    },
    {
      id: 'demo-2',
      gameId: 'demo_nba_1',
      sport: 'NBA',
      homeTeam: 'Lakers',
      awayTeam: 'Warriors',
      gameTime: new Date(now.getTime() + 3600000).toISOString(),
      type: 'total',
      direction: 'up',
      previousValue: 224.5,
      currentValue: 227.0,
      change: 2.5,
      severity: 'steam',
      detectedAt: new Date(now.getTime() - 180000).toISOString(),
      source: 'G1101',
      analysis: 'Major steam move detected. Total moved 2.5 points up.',
    },
    {
      id: 'demo-3',
      gameId: 'demo_nfl_2',
      sport: 'NFL',
      homeTeam: 'Eagles',
      awayTeam: 'Cowboys',
      gameTime: new Date(now.getTime() + 10800000).toISOString(),
      type: 'moneyline',
      direction: 'down',
      previousValue: -145,
      currentValue: -180,
      change: -35,
      severity: 'sharp',
      detectedAt: new Date(now.getTime() - 600000).toISOString(),
      source: 'G1103',
      analysis: 'Sharp action detected. Moneyline shifted 35 points favoring Eagles.',
    },
    {
      id: 'demo-4',
      gameId: 'demo_ncaab_1',
      sport: 'NCAAB',
      homeTeam: 'Duke',
      awayTeam: 'UNC',
      gameTime: new Date(now.getTime() + 5400000).toISOString(),
      type: 'spread',
      direction: 'up',
      previousValue: -3.5,
      currentValue: -5.5,
      change: 2.0,
      severity: 'steam',
      detectedAt: new Date(now.getTime() - 120000).toISOString(),
      source: 'G1100',
      analysis: 'Major steam move detected. Spread moved 2.0 points toward Duke.',
    },
  ];
  
  return demoMovements.map(m => ({
    id: `alert-${m.id}`,
    movement: m,
    headline: generateHeadline(m),
    description: m.analysis,
    isNew: true,
    expiresAt: new Date(now.getTime() + 3600000).toISOString(),
  }));
}

/**
 * Get stats about line movements
 */
export function getMovementStats(): {
  totalAlerts: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  bySport: Record<string, number>;
} {
  const alerts = getActiveAlerts();
  const stats = {
    totalAlerts: alerts.length,
    byType: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    bySport: {} as Record<string, number>,
  };
  
  alerts.forEach(alert => {
    const { type, severity, sport } = alert.movement;
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
    stats.bySport[sport] = (stats.bySport[sport] || 0) + 1;
  });
  
  return stats;
}
