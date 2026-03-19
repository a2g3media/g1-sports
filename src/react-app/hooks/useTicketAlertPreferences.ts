/**
 * useTicketAlertPreferences - Hook for managing ticket/bet alert preferences
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoAuth } from '../contexts/DemoAuthContext';

export interface TicketAlertPreferences {
  user_id: string;
  is_enabled: boolean;
  min_priority: 1 | 2 | 3;
  channel_push: boolean;
  channel_banner: boolean;
  channel_center: boolean;
  mute_ticket_settled: boolean;
  mute_parlay_last_leg: boolean;
  mute_cover_flip_clutch: boolean;
  mute_game_final: boolean;
  mute_cover_flip: boolean;
  mute_momentum_shift: boolean;
  mute_overtime_start: boolean;
  mute_game_start: boolean;
  mute_lead_change: boolean;
  mute_buzzer_beater: boolean;
  mute_major_run: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

// Alert type metadata for UI
export const ALERT_TYPE_INFO: Record<string, {
  label: string;
  description: string;
  priority: 1 | 2 | 3;
  emoji: string;
  category: 'ticket' | 'game';
}> = {
  ticket_settled: {
    label: 'Ticket Settled',
    description: 'When your ticket wins, loses, or pushes',
    priority: 1,
    emoji: '🎉',
    category: 'ticket',
  },
  parlay_last_leg: {
    label: 'Parlay Last Leg',
    description: 'When your final parlay leg goes live',
    priority: 1,
    emoji: '🎰',
    category: 'ticket',
  },
  cover_flip_clutch: {
    label: 'Clutch Cover Flip',
    description: 'Cover status changes in final 2 minutes',
    priority: 1,
    emoji: '🚨',
    category: 'ticket',
  },
  game_final: {
    label: 'Game Final',
    description: 'When a game with your bet ends',
    priority: 1,
    emoji: '🏁',
    category: 'ticket',
  },
  cover_flip: {
    label: 'Cover Flip',
    description: 'Cover status changes mid-game',
    priority: 2,
    emoji: '🔄',
    category: 'ticket',
  },
  momentum_shift: {
    label: 'Momentum Shift',
    description: 'Big scoring runs affecting your bet',
    priority: 2,
    emoji: '📈',
    category: 'game',
  },
  overtime_start: {
    label: 'Overtime Start',
    description: 'Game goes to overtime',
    priority: 2,
    emoji: '⏱️',
    category: 'game',
  },
  lead_change: {
    label: 'Lead Change',
    description: 'Lead changes in watchboard games',
    priority: 2,
    emoji: '🔃',
    category: 'game',
  },
  buzzer_beater: {
    label: 'Buzzer Beater',
    description: 'Close finishes in your games',
    priority: 2,
    emoji: '🏀',
    category: 'game',
  },
  major_run: {
    label: 'Major Run',
    description: 'Big scoring runs (8-0, etc.)',
    priority: 2,
    emoji: '🔥',
    category: 'game',
  },
  game_start: {
    label: 'Game Start',
    description: 'When a tracked game begins',
    priority: 3,
    emoji: '▶️',
    category: 'game',
  },
};

const DEFAULT_PREFERENCES: TicketAlertPreferences = {
  user_id: '',
  is_enabled: true,
  min_priority: 3,
  channel_push: true,
  channel_banner: true,
  channel_center: true,
  mute_ticket_settled: false,
  mute_parlay_last_leg: false,
  mute_cover_flip_clutch: false,
  mute_game_final: false,
  mute_cover_flip: false,
  mute_momentum_shift: false,
  mute_overtime_start: false,
  mute_game_start: false,
  mute_lead_change: false,
  mute_buzzer_beater: false,
  mute_major_run: false,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
};

interface UseTicketAlertPreferencesReturn {
  preferences: TicketAlertPreferences;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  updatePreferences: (updates: Partial<TicketAlertPreferences>) => Promise<void>;
  toggleAlertType: (alertType: string, enabled: boolean) => Promise<void>;
  setMinPriority: (priority: 1 | 2 | 3) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTicketAlertPreferences(): UseTicketAlertPreferencesReturn {
  const { user } = useDemoAuth();
  const [preferences, setPreferences] = useState<TicketAlertPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const getHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-user-id': user?.id?.toString() || '',
  }), [user?.id]);

  const fetchPreferences = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ticket-alerts/preferences', {
        headers: getHeaders(),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current && data.preferences) {
          // Convert DB 0/1 to booleans
          const prefs = { ...data.preferences };
          for (const key of Object.keys(prefs)) {
            if (typeof prefs[key] === 'number' && (key.startsWith('is_') || key.startsWith('mute_') || key.startsWith('channel_') || key.startsWith('quiet_hours_enabled'))) {
              prefs[key] = Boolean(prefs[key]);
            }
          }
          setPreferences(prefs);
        }
      } else {
        throw new Error('Failed to fetch preferences');
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

  const updatePreferences = useCallback(async (updates: Partial<TicketAlertPreferences>) => {
    if (!user?.id) return;
    
    setIsSaving(true);
    setError(null);

    // Optimistic update
    setPreferences(prev => ({ ...prev, ...updates }));

    try {
      const res = await fetch('/api/ticket-alerts/preferences', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(updates),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current && data.preferences) {
          // Convert DB 0/1 to booleans
          const prefs = { ...data.preferences };
          for (const key of Object.keys(prefs)) {
            if (typeof prefs[key] === 'number' && (key.startsWith('is_') || key.startsWith('mute_') || key.startsWith('channel_') || key.startsWith('quiet_hours_enabled'))) {
              prefs[key] = Boolean(prefs[key]);
            }
          }
          setPreferences(prefs);
        }
      } else {
        throw new Error('Failed to update preferences');
      }
    } catch (err) {
      // Revert on error
      await fetchPreferences();
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [user?.id, getHeaders, fetchPreferences]);

  const toggleAlertType = useCallback(async (alertType: string, enabled: boolean) => {
    const muteKey = `mute_${alertType}` as keyof TicketAlertPreferences;
    await updatePreferences({ [muteKey]: !enabled } as Partial<TicketAlertPreferences>);
  }, [updatePreferences]);

  const setMinPriority = useCallback(async (priority: 1 | 2 | 3) => {
    await updatePreferences({ min_priority: priority });
  }, [updatePreferences]);

  useEffect(() => {
    isMountedRef.current = true;
    if (user?.id) {
      fetchPreferences();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [user?.id, fetchPreferences]);

  return {
    preferences,
    isLoading,
    isSaving,
    error,
    updatePreferences,
    toggleAlertType,
    setMinPriority,
    refresh: fetchPreferences,
  };
}

export default useTicketAlertPreferences;
