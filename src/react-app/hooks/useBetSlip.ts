/**
 * useBetSlip - Manages bet slip state in localStorage
 * Shared between browse and review pages
 */

import { useState, useEffect, useCallback } from 'react';

export interface BetLeg {
  id: string;
  sport: string;
  league: string;
  gameId: string;
  gameName: string;
  homeTeam: string;
  awayTeam: string;
  teamOrPlayer: string;
  opponentOrContext: string;
  marketType: string;
  side: string;
  marketLine: string;
  userLine: string;
  marketOdds: string;
  userOdds: string;
  startTime: string;
}

const STORAGE_KEY = 'gz-bet-slip';

function loadFromStorage(): BetLeg[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToStorage(legs: BetLeg[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legs));
  } catch {
    // Ignore storage errors
  }
}

export function useBetSlip() {
  const [legs, setLegs] = useState<BetLeg[]>(loadFromStorage);

  // Sync with storage on mount and across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setLegs(loadFromStorage());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Save to storage whenever legs change
  useEffect(() => {
    saveToStorage(legs);
  }, [legs]);

  const addLeg = useCallback((legData: Omit<BetLeg, 'id'>) => {
    const newLeg: BetLeg = {
      ...legData,
      id: crypto.randomUUID(),
    };
    setLegs(prev => [...prev, newLeg]);
  }, []);

  const updateLeg = useCallback((index: number, updatedLeg: BetLeg) => {
    setLegs(prev => {
      const newLegs = [...prev];
      newLegs[index] = updatedLeg;
      return newLegs;
    });
  }, []);

  const removeLeg = useCallback((index: number) => {
    setLegs(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearSlip = useCallback(() => {
    setLegs([]);
  }, []);

  const isInSlip = useCallback((gameId: string, marketType: string, side: string) => {
    return legs.some(
      leg => leg.gameId === gameId && leg.marketType === marketType && leg.side === side
    );
  }, [legs]);

  return {
    legs,
    addLeg,
    updateLeg,
    removeLeg,
    clearSlip,
    isInSlip,
    count: legs.length,
  };
}
