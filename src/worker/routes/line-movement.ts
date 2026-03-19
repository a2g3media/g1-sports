/**
 * Line Movement Alert Routes
 * API endpoints for sharp action detection and alerts
 */

import { Hono } from 'hono';
import { 
  getActiveAlerts, 
  markAlertRead, 
  clearAlerts,
  getDemoLineMovements,
  getMovementStats,
  getOddsHistory,
} from '../services/lineMovementService';

type Env = {
  DB: D1Database;
};

// Check if request is in demo mode
function isDemoMode(c: any): boolean {
  return c.req.header('X-Demo-Mode') === 'true';
}

const lineMovementRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/line-movement/alerts
 * Get active line movement alerts
 */
lineMovementRouter.get('/alerts', async (c) => {
  try {
    const sport = c.req.query('sport');
    const demo = isDemoMode(c);
    
    // In demo mode, return demo data
    if (demo) {
      let alerts = getDemoLineMovements();
      if (sport) {
        alerts = alerts.filter(a => a.movement.sport.toUpperCase() === sport.toUpperCase());
      }
      return c.json({
        success: true,
        alerts,
        count: alerts.length,
        isDemo: true,
      });
    }
    
    const alerts = getActiveAlerts(sport);
    
    return c.json({
      success: true,
      alerts,
      count: alerts.length,
      isDemo: false,
    });
  } catch (err) {
    console.error('Error fetching line movement alerts:', err);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch alerts',
      alerts: [],
    }, 500);
  }
});

/**
 * GET /api/line-movement/stats
 * Get line movement statistics
 */
lineMovementRouter.get('/stats', async (c) => {
  try {
    const demo = isDemoMode(c);
    
    if (demo) {
      // Demo stats
      return c.json({
        success: true,
        stats: {
          totalAlerts: 4,
          byType: { spread: 2, total: 1, moneyline: 1 },
          bySeverity: { sharp: 2, steam: 2 },
          bySport: { NFL: 2, NBA: 1, NCAAB: 1 },
        },
        isDemo: true,
      });
    }
    
    const stats = getMovementStats();
    
    return c.json({
      success: true,
      stats,
      isDemo: false,
    });
  } catch (err) {
    console.error('Error fetching movement stats:', err);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch stats',
    }, 500);
  }
});

/**
 * POST /api/line-movement/alerts/:alertId/read
 * Mark an alert as read
 */
lineMovementRouter.post('/alerts/:alertId/read', async (c) => {
  try {
    const alertId = c.req.param('alertId');
    const success = markAlertRead(alertId);
    
    return c.json({ success });
  } catch (err) {
    console.error('Error marking alert read:', err);
    return c.json({ success: false, error: 'Failed to mark alert read' }, 500);
  }
});

/**
 * DELETE /api/line-movement/alerts
 * Clear all alerts
 */
lineMovementRouter.delete('/alerts', async (c) => {
  try {
    clearAlerts();
    return c.json({ success: true, message: 'All alerts cleared' });
  } catch (err) {
    console.error('Error clearing alerts:', err);
    return c.json({ success: false, error: 'Failed to clear alerts' }, 500);
  }
});

/**
 * GET /api/line-movement/history/:gameId
 * Get odds history for a specific game
 */
lineMovementRouter.get('/history/:gameId', async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const demo = isDemoMode(c);
    
    if (demo) {
      // Demo history
      const now = Date.now();
      const demoHistory = [
        { gameId, timestamp: new Date(now - 7200000).toISOString(), spread: -7.0, total: 225.0 },
        { gameId, timestamp: new Date(now - 5400000).toISOString(), spread: -7.5, total: 225.5 },
        { gameId, timestamp: new Date(now - 3600000).toISOString(), spread: -7.5, total: 226.0 },
        { gameId, timestamp: new Date(now - 1800000).toISOString(), spread: -6.5, total: 227.0 },
        { gameId, timestamp: new Date(now).toISOString(), spread: -6.0, total: 227.5 },
      ];
      
      return c.json({
        success: true,
        history: demoHistory,
        isDemo: true,
      });
    }
    
    const history = getOddsHistory(gameId);
    
    return c.json({
      success: true,
      history,
      isDemo: false,
    });
  } catch (err) {
    console.error('Error fetching odds history:', err);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch history',
      history: [],
    }, 500);
  }
});

/**
 * GET /api/line-movement/severity-guide
 * Returns the severity classification guide
 */
lineMovementRouter.get('/severity-guide', (c) => {
  return c.json({
    success: true,
    guide: {
      spread: {
        minor: '< 1.0 point',
        moderate: '1.0 - 1.5 points',
        sharp: '1.5 - 2.5 points',
        steam: '> 2.5 points',
      },
      total: {
        minor: '< 1.5 points',
        moderate: '1.5 - 2.0 points',
        sharp: '2.0 - 3.0 points',
        steam: '> 3.0 points',
      },
      moneyline: {
        minor: '< 25 points',
        moderate: '25 - 35 points',
        sharp: '35 - 50 points',
        steam: '> 50 points',
      },
    },
    descriptions: {
      minor: 'Normal market adjustment',
      moderate: 'Notable movement, worth monitoring',
      sharp: 'Professional money detected, consider following',
      steam: 'Heavy sharp action, significant move',
    },
  });
});

export default lineMovementRouter;
