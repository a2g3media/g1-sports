import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// Prop leg in a parlay
export interface ParlayLeg {
  id: string;
  gameId: string;
  playerName: string;
  propType: string;
  line: number;
  selection: 'over' | 'under';
  odds: number; // American odds (-110, +120, etc.)
  teamName?: string;
  gameInfo?: string; // "Lakers vs Celtics"
}

interface ParlayBuilderContextType {
  legs: ParlayLeg[];
  addLeg: (leg: Omit<ParlayLeg, 'id'>) => void;
  removeLeg: (legId: string) => void;
  clearParlay: () => void;
  isInParlay: (gameId: string, playerName: string, propType: string, selection: 'over' | 'under') => boolean;
  totalOdds: number; // American odds
  decimalOdds: number;
  impliedProbability: number;
  calculatePayout: (stake: number) => number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ParlayBuilderContext = createContext<ParlayBuilderContextType | null>(null);

// Convert American odds to decimal
function americanToDecimal(american: number): number {
  if (american > 0) {
    return (american / 100) + 1;
  } else {
    return (100 / Math.abs(american)) + 1;
  }
}

// Convert decimal odds to American
function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

export function ParlayBuilderProvider({ children }: { children: React.ReactNode }) {
  const [legs, setLegs] = useState<ParlayLeg[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addLeg = useCallback((leg: Omit<ParlayLeg, 'id'>) => {
    const id = `${leg.gameId}-${leg.playerName}-${leg.propType}-${leg.selection}`;
    
    // Check if already exists
    setLegs(prev => {
      const exists = prev.some(l => l.id === id);
      if (exists) return prev;
      
      const newLegs = [...prev, { ...leg, id }];
      return newLegs;
    });
    
    // Auto-open the slip when first leg is added
    setIsOpen(true);
  }, []);

  const removeLeg = useCallback((legId: string) => {
    setLegs(prev => prev.filter(l => l.id !== legId));
  }, []);

  const clearParlay = useCallback(() => {
    setLegs([]);
  }, []);

  const isInParlay = useCallback((
    gameId: string, 
    playerName: string, 
    propType: string, 
    selection: 'over' | 'under'
  ): boolean => {
    const id = `${gameId}-${playerName}-${propType}-${selection}`;
    return legs.some(l => l.id === id);
  }, [legs]);

  // Calculate combined odds
  const { totalOdds, decimalOdds, impliedProbability } = useMemo(() => {
    if (legs.length === 0) {
      return { totalOdds: 0, decimalOdds: 1, impliedProbability: 0 };
    }

    // Multiply decimal odds
    const combinedDecimal = legs.reduce((acc, leg) => {
      return acc * americanToDecimal(leg.odds);
    }, 1);

    const american = decimalToAmerican(combinedDecimal);
    const probability = (1 / combinedDecimal) * 100;

    return {
      totalOdds: american,
      decimalOdds: combinedDecimal,
      impliedProbability: probability
    };
  }, [legs]);

  const calculatePayout = useCallback((stake: number): number => {
    return stake * decimalOdds;
  }, [decimalOdds]);

  return (
    <ParlayBuilderContext.Provider value={{
      legs,
      addLeg,
      removeLeg,
      clearParlay,
      isInParlay,
      totalOdds,
      decimalOdds,
      impliedProbability,
      calculatePayout,
      isOpen,
      setIsOpen
    }}>
      {children}
    </ParlayBuilderContext.Provider>
  );
}

export function useParlayBuilder() {
  const context = useContext(ParlayBuilderContext);
  if (!context) {
    throw new Error('useParlayBuilder must be used within ParlayBuilderProvider');
  }
  return context;
}
