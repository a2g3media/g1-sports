/**
 * useBetPerformance - Hook for fetching betting performance statistics
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoAuth } from '../contexts/DemoAuthContext';

export interface PerformanceOverview {
  totalTickets: number;
  wonTickets: number;
  lostTickets: number;
  pushTickets: number;
  pendingTickets: number;
  ticketWinRate: number;
  totalLegs: number;
  wonLegs: number;
  lostLegs: number;
  pushLegs: number;
  pendingLegs: number;
  legHitRate: number;
}

export interface PerformanceFinancial {
  totalStaked: number;
  totalReturns: number;
  totalProfit: number;
  roi: number;
  avgStake: number;
}

export interface PerformanceStreaks {
  currentStreak: number;
  currentStreakType: 'W' | 'L' | null;
  longestWinStreak: number;
  longestLossStreak: number;
}

export interface RecentPerformance {
  wins: number;
  losses: number;
  total: number;
  hitRate: number;
}

export interface SportStats {
  sport: string;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  total: number;
  hitRate: number;
}

export interface MarketStats {
  market: string;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  total: number;
  hitRate: number;
}

export interface BetPerformanceData {
  overview: PerformanceOverview;
  financial: PerformanceFinancial;
  streaks: PerformanceStreaks;
  recent: RecentPerformance;
  bySport: SportStats[];
  byMarket: MarketStats[];
}

export interface DailyHistory {
  date: string;
  wins: number;
  losses: number;
  pushes: number;
  total: number;
  winnings: number;
  losses_amount: number;
  dailyProfit: number;
  cumulativeProfit: number;
  hitRate: number;
}

export interface TicketLeg {
  id: number;
  leg_index: number;
  sport: string;
  league: string;
  event_id: string;
  team_or_player: string;
  opponent_or_context: string;
  market_type: string;
  side: string;
  user_line_value: number;
  user_odds: number;
  leg_status: string;
}

export interface TicketWithLegs {
  id: number;
  title: string;
  ticket_type: string;
  stake_amount: number;
  to_win_amount: number;
  total_odds: number;
  status: string;
  created_at: string;
  legs: TicketLeg[];
}

interface UseBetPerformanceReturn {
  data: BetPerformanceData | null;
  history: DailyHistory[];
  tickets: TicketWithLegs[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  isLoadingTickets: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  fetchHistory: (period?: string) => Promise<void>;
  fetchTickets: (status?: string, limit?: number) => Promise<void>;
}

export function useBetPerformance(): UseBetPerformanceReturn {
  const { user } = useDemoAuth();
  const [data, setData] = useState<BetPerformanceData | null>(null);
  const [history, setHistory] = useState<DailyHistory[]>([]);
  const [tickets, setTickets] = useState<TicketWithLegs[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const getHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-user-id': user?.id?.toString() || '',
  }), [user?.id]);

  const fetchPerformance = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/bet-performance', {
        headers: getHeaders(),
      });
      
      if (res.ok) {
        const responseData = await res.json();
        if (isMountedRef.current) {
          setData(responseData);
        }
      } else {
        throw new Error('Failed to fetch performance data');
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [user?.id, getHeaders]);

  const fetchHistory = useCallback(async (period = '30d') => {
    if (!user?.id) return;
    
    setIsLoadingHistory(true);

    try {
      const res = await fetch(`/api/bet-performance/history?period=${period}`, {
        headers: getHeaders(),
      });
      
      if (res.ok) {
        const responseData = await res.json();
        if (isMountedRef.current) {
          setHistory(responseData.history || []);
        }
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingHistory(false);
      }
    }
  }, [user?.id, getHeaders]);

  const fetchTickets = useCallback(async (status = 'all', limit = 20) => {
    if (!user?.id) return;
    
    setIsLoadingTickets(true);

    try {
      const res = await fetch(`/api/bet-performance/tickets?status=${status}&limit=${limit}`, {
        headers: getHeaders(),
      });
      
      if (res.ok) {
        const responseData = await res.json();
        if (isMountedRef.current) {
          setTickets(responseData.tickets || []);
        }
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingTickets(false);
      }
    }
  }, [user?.id, getHeaders]);

  useEffect(() => {
    isMountedRef.current = true;
    if (user?.id) {
      fetchPerformance();
      fetchHistory('30d');
      fetchTickets('all', 10);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [user?.id, fetchPerformance, fetchHistory, fetchTickets]);

  return {
    data,
    history,
    tickets,
    isLoading,
    isLoadingHistory,
    isLoadingTickets,
    error,
    refresh: fetchPerformance,
    fetchHistory,
    fetchTickets,
  };
}

export default useBetPerformance;
