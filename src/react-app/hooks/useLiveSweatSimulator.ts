/**
 * Live Sweat Simulator Hook
 * 
 * Manages in-memory simulation state for testing Live Sweat features
 * without real game data. Creates fake events, users, and impacts.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// Types matching LiveTab
type PlayerStatus = 'WINNING' | 'AT_RISK' | 'TIED' | 'SAFE' | 'ELIMINATED' | 'PENDING';
type GameStatus = 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINAL';

interface SimPlayer {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

interface SimEvent {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: GameStatus;
  period: string;
  clock: string;
  // Which team each player picked (HOME or AWAY)
  picks: Map<string, 'HOME' | 'AWAY'>;
}

interface SimState {
  events: SimEvent[];
  players: SimPlayer[];
  tickCount: number;
  isRunning: boolean;
}

// Demo player names
const DEMO_NAMES = [
  'Alex Chen', 'Jordan Smith', 'Taylor Kim', 'Casey Miller', 'Morgan Lee',
  'Riley Davis', 'Quinn Johnson', 'Avery Wilson', 'Drew Martinez', 'Sam Thompson',
  'Jamie Brown', 'Parker White', 'Skyler Garcia', 'Reese Anderson', 'Blake Thomas',
  'Cameron Moore', 'Dylan Jackson', 'Emery Harris', 'Finley Clark', 'Gray Lewis'
];

// NFL team matchups for realistic simulation
const NFL_MATCHUPS = [
  { home: 'Chiefs', away: 'Bills' },
  { home: 'Cowboys', away: 'Eagles' },
  { home: '49ers', away: 'Ravens' },
];

function createInitialState(): SimState {
  // Create 20 demo players
  const players: SimPlayer[] = DEMO_NAMES.map((name, i) => ({
    userId: `sim-user-${i + 1}`,
    displayName: name,
  }));

  // Create 3 events with strategic pick distributions
  const events: SimEvent[] = [
    // Event A: Close game, mixed picks - for swing alerts
    {
      eventId: 'sim-event-a',
      homeTeam: NFL_MATCHUPS[0].home,
      awayTeam: NFL_MATCHUPS[0].away,
      homeScore: 21,
      awayScore: 20,
      status: 'LIVE',
      period: 'Q3',
      clock: '8:45',
      picks: new Map(),
    },
    // Event B: Most-picked side losing - for upset alerts  
    {
      eventId: 'sim-event-b',
      homeTeam: NFL_MATCHUPS[1].home,
      awayTeam: NFL_MATCHUPS[1].away,
      homeScore: 17,
      awayScore: 24,
      status: 'LIVE',
      period: 'Q4',
      clock: '12:30',
      picks: new Map(),
    },
    // Event C: Final with eliminations
    {
      eventId: 'sim-event-c',
      homeTeam: NFL_MATCHUPS[2].home,
      awayTeam: NFL_MATCHUPS[2].away,
      homeScore: 10,
      awayScore: 31,
      status: 'FINAL',
      period: 'Final',
      clock: '',
      picks: new Map(),
    },
  ];

  // Distribute picks strategically
  // Event A: 10 HOME, 10 AWAY (mixed)
  players.forEach((p, i) => {
    events[0].picks.set(p.userId, i < 10 ? 'HOME' : 'AWAY');
  });

  // Event B: 14 HOME (most picked, but losing), 6 AWAY
  players.forEach((p, i) => {
    events[1].picks.set(p.userId, i < 14 ? 'HOME' : 'AWAY');
  });

  // Event C: 8 HOME (losing/eliminated), 12 AWAY (safe)
  players.forEach((p, i) => {
    events[2].picks.set(p.userId, i < 8 ? 'HOME' : 'AWAY');
  });

  return {
    events,
    players,
    tickCount: 0,
    isRunning: false,
  };
}

// Convert sim state to LiveTab card format
function convertToCards(state: SimState) {
  return state.events.map(event => {
    const homeWinning = event.homeScore > event.awayScore;
    const awayWinning = event.awayScore > event.homeScore;
    const isTied = event.homeScore === event.awayScore;
    const isLive = event.status === 'LIVE' || event.status === 'HALFTIME';
    const isFinal = event.status === 'FINAL';

    // Group players by their picks
    const homePlayers: any[] = [];
    const awayPlayers: any[] = [];

    state.players.forEach(player => {
      const pick = event.picks.get(player.userId);
      if (!pick) return;

      let status: PlayerStatus = 'PENDING';
      
      if (isLive) {
        if (pick === 'HOME') {
          status = homeWinning ? 'WINNING' : awayWinning ? 'AT_RISK' : 'TIED';
        } else {
          status = awayWinning ? 'WINNING' : homeWinning ? 'AT_RISK' : 'TIED';
        }
      } else if (isFinal) {
        if (pick === 'HOME') {
          status = homeWinning ? 'SAFE' : 'ELIMINATED';
        } else {
          status = awayWinning ? 'SAFE' : 'ELIMINATED';
        }
      }

      const playerData = {
        userId: player.userId,
        displayName: player.displayName,
        avatarUrl: player.avatarUrl,
        selectionId: pick === 'HOME' ? `${event.eventId}-home` : `${event.eventId}-away`,
        selectionLabel: pick === 'HOME' ? event.homeTeam : event.awayTeam,
        status,
      };

      if (pick === 'HOME') {
        homePlayers.push(playerData);
      } else {
        awayPlayers.push(playerData);
      }
    });

    return {
      eventId: event.eventId,
      eventType: 'game',
      sportKey: 'nfl',
      status: event.status,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      homeScore: event.homeScore,
      awayScore: event.awayScore,
      period: event.period,
      clock: event.clock,
      isTied,
      totalPlayers: homePlayers.length + awayPlayers.length,
      groupedImpacts: [
        {
          selectionId: `${event.eventId}-home`,
          selectionLabel: event.homeTeam,
          side: 'HOME' as const,
          players: homePlayers,
          count: homePlayers.length,
        },
        {
          selectionId: `${event.eventId}-away`,
          selectionLabel: event.awayTeam,
          side: 'AWAY' as const,
          players: awayPlayers,
          count: awayPlayers.length,
        },
      ],
    };
  });
}

export function useLiveSweatSimulator() {
  const [isSimMode, setIsSimMode] = useState(false);
  const [state, setState] = useState<SimState>(createInitialState);
  const autoRunRef = useRef<NodeJS.Timeout | null>(null);

  // Reset simulation
  const reset = useCallback(() => {
    setState(createInitialState());
  }, []);

  // Enable/disable simulation mode
  const toggleSimMode = useCallback((enabled: boolean) => {
    setIsSimMode(enabled);
    if (enabled) {
      reset();
    } else {
      // Stop auto-run when disabling
      if (autoRunRef.current) {
        clearInterval(autoRunRef.current);
        autoRunRef.current = null;
      }
    }
  }, [reset]);

  // Tick: advance simulation by ~20 seconds of game time
  const tick = useCallback(() => {
    setState(prev => {
      const newEvents = prev.events.map(event => {
        if (event.status !== 'LIVE' && event.status !== 'HALFTIME') {
          return event;
        }

        // Parse clock
        const [mins, secs] = event.clock.split(':').map(Number);
        let newMins = mins;
        let newSecs = secs - 20;
        
        if (newSecs < 0) {
          newMins -= 1;
          newSecs = 60 + newSecs;
        }

        // Check for period changes
        let newPeriod = event.period;
        let newStatus: GameStatus = event.status;
        
        if (newMins < 0) {
          // Period ended
          if (event.period === 'Q4' || event.period === 'Q2') {
            newStatus = event.period === 'Q4' ? 'FINAL' : 'HALFTIME';
            newPeriod = event.period === 'Q4' ? 'Final' : 'Half';
            newMins = 0;
            newSecs = 0;
          } else {
            // Move to next quarter
            const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
            const idx = quarters.indexOf(event.period);
            if (idx >= 0 && idx < 3) {
              newPeriod = quarters[idx + 1];
              newMins = 15;
              newSecs = 0;
            }
          }
        }

        // Random score changes (20% chance per tick for live games)
        let newHomeScore = event.homeScore;
        let newAwayScore = event.awayScore;
        
        if ((newStatus === 'LIVE' || newStatus === 'HALFTIME') && Math.random() < 0.2) {
          const scoringTeam = Math.random() < 0.5 ? 'home' : 'away';
          const points = Math.random() < 0.6 ? 7 : 3; // TD or FG
          if (scoringTeam === 'home') {
            newHomeScore += points;
          } else {
            newAwayScore += points;
          }
        }

        return {
          ...event,
          homeScore: newHomeScore,
          awayScore: newAwayScore,
          status: newStatus,
          period: newPeriod,
          clock: newStatus === 'FINAL' ? '' : `${newMins}:${newSecs.toString().padStart(2, '0')}`,
        };
      });

      return {
        ...prev,
        events: newEvents,
        tickCount: prev.tickCount + 1,
      };
    });
  }, []);

  // Force upset: make most-picked side lose
  const forceUpset = useCallback(() => {
    setState(prev => {
      const newEvents = prev.events.map(event => {
        if (event.status !== 'LIVE') return event;

        // Find most-picked side
        let homeCount = 0;
        let awayCount = 0;
        event.picks.forEach(pick => {
          if (pick === 'HOME') homeCount++;
          else awayCount++;
        });

        const mostPickedIsHome = homeCount >= awayCount;
        
        // Make them lose by 7
        if (mostPickedIsHome) {
          return {
            ...event,
            homeScore: event.awayScore - 7,
            awayScore: event.awayScore,
          };
        } else {
          return {
            ...event,
            homeScore: event.homeScore,
            awayScore: event.homeScore - 7,
          };
        }
      });

      return { ...prev, events: newEvents };
    });
  }, []);

  // Flip lead: swap who's winning
  const flipLead = useCallback(() => {
    setState(prev => {
      const newEvents = prev.events.map(event => {
        if (event.status !== 'LIVE') return event;

        return {
          ...event,
          homeScore: event.awayScore,
          awayScore: event.homeScore,
        };
      });

      return { ...prev, events: newEvents };
    });
  }, []);

  // Finalize a specific game or the first live game
  const finalizeGame = useCallback((eventId?: string) => {
    setState(prev => {
      const newEvents = prev.events.map(event => {
        if (eventId && event.eventId !== eventId) return event;
        if (!eventId && event.status !== 'LIVE') return event;
        if (event.status === 'FINAL') return event;

        // Only finalize first live game if no specific ID
        if (!eventId) {
          const liveEvents = prev.events.filter(e => e.status === 'LIVE');
          if (liveEvents.length > 0 && event.eventId !== liveEvents[0].eventId) {
            return event;
          }
        }

        return {
          ...event,
          status: 'FINAL' as const,
          period: 'Final',
          clock: '',
        };
      });

      return { ...prev, events: newEvents };
    });
  }, []);

  // Auto-run toggle
  const toggleAutoRun = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, isRunning: enabled }));
    
    if (enabled) {
      autoRunRef.current = setInterval(() => {
        tick();
      }, 5000);
    } else if (autoRunRef.current) {
      clearInterval(autoRunRef.current);
      autoRunRef.current = null;
    }
  }, [tick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoRunRef.current) {
        clearInterval(autoRunRef.current);
      }
    };
  }, []);

  // Get cards for rendering
  const cards = isSimMode ? convertToCards(state) : null;

  return {
    isSimMode,
    toggleSimMode,
    cards,
    tickCount: state.tickCount,
    isAutoRunning: state.isRunning,
    
    // Control actions
    tick,
    forceUpset,
    flipLead,
    finalizeGame,
    toggleAutoRun,
    reset,
  };
}

export type LiveSweatSimulator = ReturnType<typeof useLiveSweatSimulator>;
