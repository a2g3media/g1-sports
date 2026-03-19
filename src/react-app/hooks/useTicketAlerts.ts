/**
 * useTicketAlerts - Smart Alert Engine frontend hook
 * 
 * Polls for ticket alerts and provides methods to manage them.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoAuth } from '../contexts/DemoAuthContext';

export interface TicketAlert {
  id: number;
  user_id: string;
  alert_type: string;
  priority: 1 | 2 | 3;
  title: string;
  message: string;
  deep_link: string | null;
  ticket_id: number | null;
  event_id: string | null;
  leg_id: number | null;
  is_read: number;
  delivered_push: number;
  delivered_banner: number;
  created_at: string;
  updated_at: string;
}

export interface AlertStats {
  total: number;
  unread: number;
  by_priority: {
    critical: number;
    important: number;
    info: number;
  };
  by_type: {
    settlements: number;
    cover_flips: number;
  };
}

interface UseTicketAlertsOptions {
  /** Polling interval in ms. Default 30000 (30s). Set to 0 to disable polling. */
  pollInterval?: number;
  /** Whether to auto-evaluate alerts on each poll */
  autoEvaluate?: boolean;
  /** Max alerts to fetch */
  limit?: number;
}

interface UseTicketAlertsReturn {
  alerts: TicketAlert[];
  unreadCount: number;
  stats: AlertStats | null;
  isLoading: boolean;
  error: string | null;
  /** Manually trigger alert evaluation */
  evaluate: () => Promise<void>;
  /** Refresh alerts list */
  refresh: () => Promise<void>;
  /** Mark specific alerts as read */
  markRead: (alertIds?: number[]) => Promise<void>;
  /** Mark all alerts as read */
  markAllRead: () => Promise<void>;
  /** Delete a specific alert */
  deleteAlert: (alertId: number) => Promise<void>;
  /** Clear old alerts */
  clearOld: (olderThanDays: number) => Promise<void>;
  /** Get recent alerts (unread + critical) */
  recentAlerts: TicketAlert[];
  /** Check if there are any critical unread alerts */
  hasCritical: boolean;
}

export function useTicketAlerts(options: UseTicketAlertsOptions = {}): UseTicketAlertsReturn {
  const { pollInterval = 30000, autoEvaluate = true, limit = 50 } = options;
  const { user } = useDemoAuth();
  
  const [alerts, setAlerts] = useState<TicketAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const getHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      'x-user-id': user?.id?.toString() || '',
    };
  }, [user?.id]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const res = await fetch('/api/ticket-alerts/count', {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          setUnreadCount(data.unread_count || 0);
        }
      }
    } catch (err) {
      console.error('[useTicketAlerts] Error fetching count:', err);
    }
  }, [user?.id, getHeaders]);

  // Fetch alerts list
  const fetchAlerts = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const res = await fetch(`/api/ticket-alerts?limit=${limit}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          setAlerts(data.alerts || []);
        }
      }
    } catch (err) {
      console.error('[useTicketAlerts] Error fetching alerts:', err);
    }
  }, [user?.id, limit, getHeaders]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const res = await fetch('/api/ticket-alerts/stats', {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          setStats(data.stats || null);
        }
      }
    } catch (err) {
      console.error('[useTicketAlerts] Error fetching stats:', err);
    }
  }, [user?.id, getHeaders]);

  // Evaluate alerts (trigger engine to check for new alerts)
  const evaluate = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const res = await fetch('/api/ticket-alerts/evaluate', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ app_open: true }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[useTicketAlerts] Evaluation result:', data);
      }
    } catch (err) {
      console.error('[useTicketAlerts] Error evaluating:', err);
    }
  }, [user?.id, getHeaders]);

  // Combined refresh
  const refresh = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Evaluate first if autoEvaluate is enabled
      if (autoEvaluate) {
        await evaluate();
      }
      
      // Then fetch all data in parallel
      await Promise.all([
        fetchAlerts(),
        fetchUnreadCount(),
        fetchStats(),
      ]);
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [user?.id, autoEvaluate, evaluate, fetchAlerts, fetchUnreadCount, fetchStats]);

  // Mark alerts as read
  const markRead = useCallback(async (alertIds?: number[]) => {
    if (!user?.id) return;
    
    try {
      await fetch('/api/ticket-alerts/read', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ alert_ids: alertIds }),
      });
      
      // Update local state
      if (alertIds) {
        setAlerts(prev => prev.map(a => 
          alertIds.includes(a.id) ? { ...a, is_read: 1 } : a
        ));
        setUnreadCount(prev => Math.max(0, prev - alertIds.length));
      } else {
        setAlerts(prev => prev.map(a => ({ ...a, is_read: 1 })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('[useTicketAlerts] Error marking read:', err);
    }
  }, [user?.id, getHeaders]);

  const markAllRead = useCallback(() => markRead(), [markRead]);

  // Delete alert
  const deleteAlert = useCallback(async (alertId: number) => {
    if (!user?.id) return;
    
    try {
      await fetch(`/api/ticket-alerts/${alertId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      // Also update unread count if it was unread
      const alert = alerts.find(a => a.id === alertId);
      if (alert && !alert.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('[useTicketAlerts] Error deleting:', err);
    }
  }, [user?.id, alerts, getHeaders]);

  // Clear old alerts
  const clearOld = useCallback(async (olderThanDays: number) => {
    if (!user?.id) return;
    
    try {
      await fetch('/api/ticket-alerts/clear', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ older_than_days: olderThanDays }),
      });
      
      await refresh();
    } catch (err) {
      console.error('[useTicketAlerts] Error clearing old:', err);
    }
  }, [user?.id, getHeaders, refresh]);

  // Set up polling with exponential backoff on errors
  const errorCountRef = useRef(0);
  
  useEffect(() => {
    isMountedRef.current = true;
    const BASE_INTERVAL = pollInterval;
    const MAX_BACKOFF = 240000; // 4 minutes max
    
    const pollWithBackoff = async () => {
      if (!isMountedRef.current) return;
      
      try {
        await refresh();
        // Reset on success
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      
      if (isMountedRef.current && pollInterval > 0) {
        const backoff = Math.pow(2, errorCountRef.current);
        const nextInterval = Math.min(BASE_INTERVAL * backoff, MAX_BACKOFF);
        pollRef.current = setTimeout(pollWithBackoff, nextInterval) as unknown as ReturnType<typeof setInterval>;
      }
    };
    
    if (user?.id) {
      // Initial fetch
      pollWithBackoff();
    }
    
    return () => {
      isMountedRef.current = false;
      if (pollRef.current) {
        clearTimeout(pollRef.current as unknown as ReturnType<typeof setTimeout>);
        pollRef.current = null;
      }
    };
  }, [user?.id, pollInterval, refresh]);

  // Computed values
  const recentAlerts = alerts
    .filter(a => !a.is_read || a.priority === 1)
    .slice(0, 10);
    
  const hasCritical = alerts.some(a => a.priority === 1 && !a.is_read);

  return {
    alerts,
    unreadCount,
    stats,
    isLoading,
    error,
    evaluate,
    refresh,
    markRead,
    markAllRead,
    deleteAlert,
    clearOld,
    recentAlerts,
    hasCritical,
  };
}

export default useTicketAlerts;
