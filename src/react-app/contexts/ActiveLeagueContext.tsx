import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  invite_code: string;
  entry_fee_cents: number;
  is_payment_required: number;
  member_count: number;
  role: string;
  created_at: string;
}

interface LeagueContext {
  periodLabel: string;
  periodNumber: string | number;
  status: "open" | "submitted" | "locked" | "live" | "final";
  lockTime: Date;
  isSubmitted: boolean;
  receiptCode?: string;
}

interface ActiveLeagueContextType {
  // League data
  leagues: League[];
  activeLeague: League | null;
  activeLeagueContext: LeagueContext | null;
  isLoading: boolean;
  
  // Actions
  setActiveLeagueId: (id: number) => void;
  refreshLeagues: () => Promise<void>;
  
  // Convenience
  hasLeagues: boolean;
  userRank?: number;
  totalPlayers?: number;
}

const ActiveLeagueContext = createContext<ActiveLeagueContextType | null>(null);

const ACTIVE_LEAGUE_KEY = "poolvault_active_league_id";

function getPeriodName(sportKey: string): { singular: string; plural: string } {
  switch (sportKey) {
    case "nfl":
    case "ncaaf":
      return { singular: "Week", plural: "Weeks" };
    case "nba":
    case "ncaab":
      return { singular: "Game Day", plural: "Game Days" };
    case "mlb":
      return { singular: "Series", plural: "Series" };
    case "nhl":
      return { singular: "Game Day", plural: "Game Days" };
    case "golf":
      return { singular: "Round", plural: "Rounds" };
    case "soccer":
      return { singular: "Match Day", plural: "Match Days" };
    default:
      return { singular: "Period", plural: "Periods" };
  }
}

function getLeagueContext(league: League): LeagueContext {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const periodName = getPeriodName(league.sport_key);
  
  let periodNumber = 1;
  let status: "open" | "submitted" | "locked" | "live" | "final" = "open";
  const lockTime = new Date();
  
  switch (league.sport_key) {
    case "nfl":
    case "ncaaf":
      periodNumber = Math.min(18, Math.max(1, Math.floor((now.getTime() - new Date(2024, 8, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1));
      lockTime.setDate(now.getDate() + ((7 - dayOfWeek) % 7));
      lockTime.setHours(13, 0, 0, 0);
      if (dayOfWeek === 0 && hour >= 13) status = "live";
      else if (dayOfWeek === 1 && hour < 1) status = "live";
      else if (dayOfWeek >= 2 && dayOfWeek <= 3) status = "final";
      break;
    default:
      periodNumber = Math.floor((now.getTime() - new Date(2024, 0, 1).getTime()) / (24 * 60 * 60 * 1000)) + 1;
      lockTime.setHours(19, 0, 0, 0);
      if (hour >= 19) status = "live";
  }
  
  return {
    periodLabel: periodName.singular,
    periodNumber,
    status,
    lockTime,
    isSubmitted: false,
    receiptCode: undefined,
  };
}

export function ActiveLeagueProvider({ children }: { children: ReactNode }) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeLeagueId, setActiveLeagueIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(ACTIVE_LEAGUE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const setActiveLeagueId = (id: number) => {
    setActiveLeagueIdState(id);
    localStorage.setItem(ACTIVE_LEAGUE_KEY, id.toString());
  };

  const refreshLeagues = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/leagues");
      if (response.ok) {
        const data = await response.json();
        setLeagues(data);
        
        // Auto-select first league if none selected or current selection not found
        if (data.length > 0 && (!activeLeagueId || !data.find((l: League) => l.id === activeLeagueId))) {
          setActiveLeagueId(data[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch leagues:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshLeagues();
  }, []);

  const activeLeague = useMemo(() => {
    return leagues.find(l => l.id === activeLeagueId) || leagues[0] || null;
  }, [leagues, activeLeagueId]);

  const activeLeagueContext = useMemo(() => {
    if (!activeLeague) return null;
    return getLeagueContext(activeLeague);
  }, [activeLeague]);

  const value: ActiveLeagueContextType = {
    leagues,
    activeLeague,
    activeLeagueContext,
    isLoading,
    setActiveLeagueId,
    refreshLeagues,
    hasLeagues: leagues.length > 0,
  };

  return (
    <ActiveLeagueContext.Provider value={value}>
      {children}
    </ActiveLeagueContext.Provider>
  );
}

export function useActiveLeague() {
  const context = useContext(ActiveLeagueContext);
  if (!context) {
    throw new Error("useActiveLeague must be used within an ActiveLeagueProvider");
  }
  return context;
}
