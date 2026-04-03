import { useState, useEffect, useCallback, useRef } from "react";
import type { 
  AlertEvent, 
  AlertPreferences, 
  AlertCounts, 
  WatchlistItemType 
} from "@/shared/types";

// =====================================================
// ALERT EVENTS HOOK
// =====================================================

interface UseAlertsOptions {
  scope: "DEMO" | "PROD";
  filter?: "all" | "critical" | "impact" | "info";
  itemType?: WatchlistItemType;
  limit?: number;
}

interface UseAlertsReturn {
  alerts: AlertEvent[];
  counts: AlertCounts;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  dismiss: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearRead: () => Promise<void>;
  generateFromEvents: () => Promise<unknown>;
  generateDemo: () => Promise<unknown>;
}

const DEFAULT_COUNTS: AlertCounts = { 
  total_unread: 0, 
  critical_unread: 0, 
  impact_unread: 0, 
  info_unread: 0 
};
let alertCountsAuthBlocked = false;
let alertCountsProbeInFlight = false;

export function useAlerts(options: UseAlertsOptions): UseAlertsReturn {
  const { scope, filter = "all", itemType, limit = 50 } = options;
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [counts, setCounts] = useState<AlertCounts>(DEFAULT_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to get headers for demo mode
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    if (scope === "DEMO") {
      headers["X-Demo-Mode"] = "true";
    }
    return headers;
  }, [scope]);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ scope, limit: limit.toString() });
      if (filter !== "all") params.set("filter", filter);
      if (itemType) params.set("itemType", itemType);
      
      const res = await fetch(`/api/alerts/events?${params}`, { 
        credentials: "include",
        headers: getHeaders(),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to view alerts");
          return;
        }
        throw new Error("Failed to fetch alerts");
      }
      
      const data = await res.json();
      setAlerts(data.alerts || []);
      setCounts(data.counts || DEFAULT_COUNTS);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
      setError("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [scope, filter, itemType, limit, getHeaders]);

  // Polling with exponential backoff on errors
  const errorCountRef = useRef(0);
  
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    const BASE_INTERVAL = 30000;
    const MAX_BACKOFF = 240000; // 4 minutes
    
    const pollWithBackoff = async () => {
      try {
        await fetchAlerts();
        // Reset on success
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, errorCountRef.current);
        const nextInterval = Math.min(BASE_INTERVAL * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    pollWithBackoff();
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [fetchAlerts]);

  const markAsRead = useCallback(async (id: number) => {
    try {
      await fetch(`/api/alerts/events/${id}/read?scope=${scope}`, {
        method: "POST",
        credentials: "include",
        headers: getHeaders(),
      });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, read_at: new Date().toISOString() } : a));
      setCounts(prev => ({ ...prev, total_unread: Math.max(0, prev.total_unread - 1) }));
    } catch (err) {
      console.error("Failed to mark alert as read:", err);
    }
  }, [scope]);

  const dismiss = useCallback(async (id: number) => {
    try {
      const alert = alerts.find(a => a.id === id);
      await fetch(`/api/alerts/events/${id}/dismiss?scope=${scope}`, {
        method: "POST",
        credentials: "include",
      });
      setAlerts(prev => prev.filter(a => a.id !== id));
      setCounts(prev => ({
        ...prev,
        total_unread: alert && !alert.read_at ? Math.max(0, prev.total_unread - 1) : prev.total_unread,
      }));
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
    }
  }, [scope, alerts]);

  const markAllRead = useCallback(async () => {
    try {
      await fetch(`/api/alerts/events/mark-all-read?scope=${scope}`, {
        method: "POST",
        credentials: "include",
      });
      setAlerts(prev => prev.map(a => ({ ...a, read_at: a.read_at || new Date().toISOString() })));
      setCounts(prev => ({ ...prev, total_unread: 0 }));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [scope]);

  const clearRead = useCallback(async () => {
    try {
      await fetch(`/api/alerts/events/clear-read?scope=${scope}`, {
        method: "POST",
        credentials: "include",
      });
      setAlerts(prev => prev.filter(a => !a.read_at));
      fetchAlerts();
    } catch (err) {
      console.error("Failed to clear read alerts:", err);
    }
  }, [scope, fetchAlerts]);

  const generateFromEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/alerts/generate?scope=${scope}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        await fetchAlerts();
        return data;
      }
      return null;
    } catch (err) {
      console.error("Failed to generate alerts:", err);
      return null;
    }
  }, [scope, fetchAlerts]);

  const generateDemo = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/generate-demo", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        await fetchAlerts();
        return data;
      }
      return null;
    } catch (err) {
      console.error("Failed to generate demo alerts:", err);
      return null;
    }
  }, [fetchAlerts]);

  return {
    alerts,
    counts,
    loading,
    error,
    refresh: fetchAlerts,
    markAsRead,
    dismiss,
    markAllRead,
    clearRead,
    generateFromEvents,
    generateDemo,
  };
}

// =====================================================
// ALERT COUNTS HOOK (lightweight for badge)
// =====================================================

export function useAlertCounts(scope: "DEMO" | "PROD") {
  const [counts, setCounts] = useState<AlertCounts>(DEFAULT_COUNTS);
  const errorCountRef = useRef(0);
  const authBlockedRef = useRef(alertCountsAuthBlocked);

  const fetchCounts = useCallback(async () => {
    if (scope === "DEMO") return true;
    if (authBlockedRef.current) return true;
    if (alertCountsProbeInFlight) return true;
    alertCountsProbeInFlight = true;
    try {
      const res = await fetch(`/api/alerts/counts?scope=${scope}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCounts(data);
        return true;
      }
      if (res.status === 401 || res.status === 403) {
        authBlockedRef.current = true;
        alertCountsAuthBlocked = true;
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to fetch alert counts:", err);
      return false;
    } finally {
      alertCountsProbeInFlight = false;
    }
  }, [scope]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    const BASE_INTERVAL = 30000;
    const MAX_BACKOFF = 240000;
    
    const pollWithBackoff = async () => {
      const success = await fetchCounts();
      if (success) {
        errorCountRef.current = 0;
      } else {
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, errorCountRef.current);
        const nextInterval = Math.min(BASE_INTERVAL * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    pollWithBackoff();
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [fetchCounts]);

  return { counts, refresh: fetchCounts };
}

// =====================================================
// ALERT PREFERENCES HOOK
// =====================================================

export function useAlertPreferences(scope: "DEMO" | "PROD") {
  const [preferences, setPreferences] = useState<AlertPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    if (scope === "DEMO") {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/alerts/preferences?scope=${scope}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
      }
    } catch (err) {
      console.error("Failed to fetch preferences:", err);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreferences = useCallback(async (updates: Partial<AlertPreferences>) => {
    if (scope === "DEMO") {
      setPreferences(prev => (prev ? { ...prev, ...updates } : prev));
      return true;
    }
    try {
      const res = await fetch(`/api/alerts/preferences?scope=${scope}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to update preferences:", err);
      return false;
    }
  }, [scope]);

  return { preferences, loading, refresh: fetchPreferences, updatePreferences };
}

// =====================================================
// FOLLOW/WATCHLIST HOOK
// =====================================================

interface FollowState {
  isFollowing: boolean;
  loading: boolean;
}

export function useFollow(
  scope: "DEMO" | "PROD",
  itemType: WatchlistItemType,
  itemId: string,
  sportType?: string
) {
  const [state, setState] = useState<FollowState>({ isFollowing: false, loading: true });

  // Helper to get headers for demo mode
  const getHeaders = useCallback((contentType?: string) => {
    const headers: Record<string, string> = {};
    if (scope === "DEMO") {
      headers["X-Demo-Mode"] = "true";
    }
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }, [scope]);

  const checkFollowStatus = useCallback(async () => {
    try {
      const params = new URLSearchParams({ item_type: itemType, item_id: itemId });
      const res = await fetch(`/api/alerts/watchlist/check?${params}`, { 
        credentials: "include",
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setState({ isFollowing: data.following, loading: false });
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Failed to check follow status:", err);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [itemType, itemId, getHeaders]);

  useEffect(() => {
    checkFollowStatus();
  }, [checkFollowStatus]);

  const toggle = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      if (state.isFollowing) {
        // Unfollow
        const params = new URLSearchParams({ item_type: itemType, item_id: itemId });
        const res = await fetch(`/api/alerts/watchlist/unfollow?${params}`, {
          method: "DELETE",
          credentials: "include",
          headers: getHeaders(),
        });
        if (res.ok) {
          setState({ isFollowing: false, loading: false });
          return true;
        }
      } else {
        // Follow
        const res = await fetch(`/api/alerts/watchlist/follow`, {
          method: "POST",
          headers: getHeaders("application/json"),
          credentials: "include",
          body: JSON.stringify({ item_type: itemType, item_id: itemId, sport_type: sportType }),
        });
        if (res.ok) {
          setState({ isFollowing: true, loading: false });
          return true;
        }
        // Treat "already following" as success to avoid stale-state failures.
        if (res.status === 400) {
          const data = await res.json().catch(() => null) as { error?: string } | null;
          if (typeof data?.error === "string" && /already following/i.test(data.error)) {
            setState({ isFollowing: true, loading: false });
            return true;
          }
        }
      }
      setState(prev => ({ ...prev, loading: false }));
      return false;
    } catch (err) {
      console.error("Failed to toggle follow:", err);
      setState(prev => ({ ...prev, loading: false }));
      return false;
    }
  }, [itemType, itemId, sportType, state.isFollowing, getHeaders]);

  return { ...state, toggle, refresh: checkFollowStatus };
}

// =====================================================
// WATCHLIST MANAGEMENT HOOK
// =====================================================

// Re-export Alert type for components
export type Alert = AlertEvent & { is_read?: boolean };

export interface WatchlistItemDisplay {
  id: number;
  item_type: WatchlistItemType;
  item_id: string;
  sport_type: string | null;
  display_name: string | null;
  metadata_json: string | null;
  created_at: string;
}

export function useWatchlistItems() {
  const [items, setItems] = useState<WatchlistItemDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/alerts/watchlist`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to view your watchlist");
          return;
        }
        throw new Error("Failed to fetch watchlist");
      }
      const data = await res.json();
      setItems(data.items || []);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch watchlist items:", err);
      setError("Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const unfollow = useCallback(async (itemType: WatchlistItemType, itemId: string) => {
    try {
      const params = new URLSearchParams({ item_type: itemType, item_id: itemId });
      const res = await fetch(`/api/alerts/watchlist/unfollow?${params}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setItems(prev => prev.filter(item => !(item.item_type === itemType && item.item_id === itemId)));
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to unfollow:", err);
      return false;
    }
  }, []);

  return { items, loading, error, refresh: fetchItems, unfollow };
}
