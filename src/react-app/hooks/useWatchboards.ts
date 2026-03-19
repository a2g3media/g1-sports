/**
 * useWatchboards Hook
 * Manages watchboard state with DB persistence for logged-in users
 * and localStorage fallback for guests.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

// Types
export interface Watchboard {
  id: number;
  user_id: string;
  name: string;
  pinned_game_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WatchboardGame {
  id: number;
  watchboard_id: number;
  game_id: string;
  order_index: number;
  added_from: string | null;
  created_at: string;
}

export interface WatchboardProp {
  id: number;
  watchboard_id: number;
  game_id: string;
  player_name: string;
  player_id: string | null;
  team: string | null;
  sport: string;
  prop_type: string;
  line_value: number;
  selection: string;
  odds_american: number | null;
  current_stat_value: number | null;
  order_index: number;
  added_from: string | null;
  created_at: string;
}

export interface WatchboardPlayer {
  id: number;
  watchboard_id: number;
  user_id: string;
  player_name: string;
  player_id: string | null;
  sport: string;
  team: string | null;
  team_abbr: string | null;
  position: string | null;
  headshot_url: string | null;
  prop_type: string | null;
  prop_line: number | null;
  prop_selection: string | null;
  current_stat_value: number | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
}

interface WatchboardState {
  boards: Watchboard[];
  activeBoard: Watchboard | null;
  gameIds: string[];
  props: WatchboardProp[];
  players: WatchboardPlayer[];
  isLoading: boolean;
  error: string | null;
}

// localStorage keys
const STORAGE_KEY = "gz-watchboards";
const STORAGE_GAMES_KEY = "gz-watchboard-games";
const STORAGE_PROPS_KEY = "gz-watchboard-props";
const STORAGE_PLAYERS_KEY = "gz-watchboard-players";

// Guest localStorage helpers
function getGuestBoards(): Watchboard[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function setGuestBoards(boards: Watchboard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
}

function getGuestGames(): Record<number, string[]> {
  try {
    const stored = localStorage.getItem(STORAGE_GAMES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function setGuestGames(games: Record<number, string[]>) {
  localStorage.setItem(STORAGE_GAMES_KEY, JSON.stringify(games));
}

function getGuestProps(): Record<number, WatchboardProp[]> {
  try {
    const stored = localStorage.getItem(STORAGE_PROPS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function setGuestProps(props: Record<number, WatchboardProp[]>) {
  localStorage.setItem(STORAGE_PROPS_KEY, JSON.stringify(props));
}

function getGuestPlayers(): Record<number, WatchboardPlayer[]> {
  try {
    const stored = localStorage.getItem(STORAGE_PLAYERS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function setGuestPlayers(players: Record<number, WatchboardPlayer[]>) {
  localStorage.setItem(STORAGE_PLAYERS_KEY, JSON.stringify(players));
}

export function useWatchboards() {
  const { user } = useDemoAuth();
  const isAuthenticated = user !== null;
  const [state, setState] = useState<WatchboardState>({
    boards: [],
    activeBoard: null,
    gameIds: [],
    props: [],
    players: [],
    isLoading: true,
    error: null,
  });
  
  const fetchedRef = useRef(false);

  // Fetch boards from API or localStorage
  const fetchBoards = useCallback(async () => {
    if (isAuthenticated && user) {
      // Fetch from API
      try {
        const res = await fetch("/api/watchboards", {
          headers: { "x-user-id": user.id.toString() },
        });
        const data = await res.json();
        
        const boards: Watchboard[] = data.boards || [];
        const activeBoard = boards.find(b => b.is_active) || boards[0] || null;
        
        // Fetch active board's games, props, and players
        let gameIds: string[] = [];
        let props: WatchboardProp[] = [];
        let players: WatchboardPlayer[] = [];
        if (activeBoard) {
          const [gamesRes, propsRes, playersRes] = await Promise.all([
            fetch("/api/watchboards/active", {
              headers: { "x-user-id": user.id.toString() },
            }),
            fetch("/api/watchboards/props", {
              headers: { "x-user-id": user.id.toString() },
            }),
            fetch("/api/watchboards/players", {
              headers: { "x-user-id": user.id.toString() },
            }),
          ]);
          const gamesData = await gamesRes.json();
          const propsData = await propsRes.json();
          const playersData = await playersRes.json();
          gameIds = gamesData.gameIds || [];
          props = propsData.props || [];
          players = playersData.players || [];
        }
        
        setState({
          boards,
          activeBoard,
          gameIds,
          props,
          players,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        console.error("[useWatchboards] Fetch error:", err);
        setState(prev => ({ ...prev, isLoading: false, error: "Failed to load watchboards" }));
      }
    } else {
      // Guest mode - use localStorage
      let boards = getGuestBoards();
      
      // Create default board if none
      if (boards.length === 0) {
        const defaultBoard: Watchboard = {
          id: 1,
          user_id: "guest",
          name: "My Watchboard",
          pinned_game_id: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        boards = [defaultBoard];
        setGuestBoards(boards);
      }
      
      const activeBoard = boards.find(b => b.is_active) || boards[0];
      const gamesMap = getGuestGames();
      const gameIds = activeBoard ? (gamesMap[activeBoard.id] || []) : [];
      const propsMap = getGuestProps();
      const props = activeBoard ? (propsMap[activeBoard.id] || []) : [];
      const playersMap = getGuestPlayers();
      const players = activeBoard ? (playersMap[activeBoard.id] || []) : [];
      
      setState({
        boards,
        activeBoard,
        gameIds,
        props,
        players,
        isLoading: false,
        error: null,
      });
    }
  }, [isAuthenticated, user]);

  // Initial fetch
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchBoards();
    }
  }, [fetchBoards]);

  // Refetch when auth changes
  useEffect(() => {
    fetchedRef.current = false;
    fetchBoards();
  }, [isAuthenticated, user?.id]);

  // Add game to active board (legacy - for backwards compatibility)
  const addGame = useCallback(async (gameId: string, addedFrom?: string): Promise<{ success: boolean; boardName?: string; error?: string }> => {
    if (state.gameIds.includes(gameId)) {
      return { success: false, error: "Already in watchboard" };
    }

    if (isAuthenticated && user) {
      try {
        const res = await fetch("/api/watchboards/games", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify({ game_id: gameId, added_from: addedFrom }),
        });
        const data = await res.json();
        
        if (data.success) {
          setState(prev => ({
            ...prev,
            gameIds: [...prev.gameIds, gameId],
          }));
          return { success: true, boardName: data.boardName };
        }
        return { success: false, error: data.error };
      } catch (err) {
        return { success: false, error: "Failed to add game" };
      }
    } else {
      // Guest mode
      const gamesMap = getGuestGames();
      const boardId = state.activeBoard?.id || 1;
      const current = gamesMap[boardId] || [];
      
      if (current.includes(gameId)) {
        return { success: false, error: "Already in watchboard" };
      }
      
      gamesMap[boardId] = [...current, gameId];
      setGuestGames(gamesMap);
      
      setState(prev => ({
        ...prev,
        gameIds: [...prev.gameIds, gameId],
      }));
      
      return { success: true, boardName: state.activeBoard?.name || "My Watchboard" };
    }
  }, [isAuthenticated, user, state.gameIds, state.activeBoard]);

  // Add game to a SPECIFIC board (new API - for modal use)
  const addGameToBoard = useCallback(async (
    gameId: string, 
    boardId: number, 
    addedFrom?: string
  ): Promise<{ success: boolean; boardName?: string; boardId?: number; error?: string }> => {
    if (isAuthenticated && user) {
      try {
        const res = await fetch("/api/watchboards/games", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify({ game_id: gameId, board_id: boardId, added_from: addedFrom }),
        });
        const data = await res.json();
        
        if (data.success) {
          // If added to active board, update local state
          if (state.activeBoard?.id === boardId) {
            setState(prev => ({
              ...prev,
              gameIds: [...prev.gameIds, gameId],
            }));
          }
          return { success: true, boardName: data.boardName, boardId: data.boardId };
        }
        return { success: false, error: data.error, boardName: data.boardName };
      } catch (err) {
        return { success: false, error: "Failed to add game" };
      }
    } else {
      // Guest mode - just add to specified board in localStorage
      const gamesMap = getGuestGames();
      const current = gamesMap[boardId] || [];
      
      if (current.includes(gameId)) {
        const board = state.boards.find(b => b.id === boardId);
        return { success: false, error: "Already in watchboard", boardName: board?.name };
      }
      
      gamesMap[boardId] = [...current, gameId];
      setGuestGames(gamesMap);
      
      // If added to active board, update local state
      if (state.activeBoard?.id === boardId) {
        setState(prev => ({
          ...prev,
          gameIds: [...prev.gameIds, gameId],
        }));
      }
      
      const board = state.boards.find(b => b.id === boardId);
      return { success: true, boardName: board?.name || "Watchboard", boardId };
    }
  }, [isAuthenticated, user, state.activeBoard, state.boards]);

  // Remove game from active board
  const removeGame = useCallback(async (gameId: string): Promise<boolean> => {
    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/games/${encodeURIComponent(gameId)}`, {
          method: "DELETE",
          headers: { "x-user-id": user.id.toString() },
        });
        setState(prev => ({
          ...prev,
          gameIds: prev.gameIds.filter(id => id !== gameId),
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const gamesMap = getGuestGames();
      const boardId = state.activeBoard?.id || 1;
      gamesMap[boardId] = (gamesMap[boardId] || []).filter(id => id !== gameId);
      setGuestGames(gamesMap);
      
      setState(prev => ({
        ...prev,
        gameIds: prev.gameIds.filter(id => id !== gameId),
      }));
      return true;
    }
  }, [isAuthenticated, user, state.activeBoard]);

  // Reorder games
  const reorderGames = useCallback(async (newOrder: string[]): Promise<boolean> => {
    // Optimistically update UI
    setState(prev => ({ ...prev, gameIds: newOrder }));
    
    if (isAuthenticated && user) {
      try {
        await fetch("/api/watchboards/games/reorder", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify({ gameIds: newOrder }),
        });
        return true;
      } catch {
        // Revert on failure
        fetchBoards();
        return false;
      }
    } else {
      // Guest mode
      const gamesMap = getGuestGames();
      const boardId = state.activeBoard?.id || 1;
      gamesMap[boardId] = newOrder;
      setGuestGames(gamesMap);
      return true;
    }
  }, [isAuthenticated, user, state.activeBoard, fetchBoards]);

  // Create new board
  const createBoard = useCallback(async (name: string): Promise<Watchboard | null> => {
    if (isAuthenticated && user) {
      try {
        const res = await fetch("/api/watchboards", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (data.board) {
          setState(prev => ({
            ...prev,
            boards: [...prev.boards, data.board],
          }));
          return data.board;
        }
        return null;
      } catch {
        return null;
      }
    } else {
      // Guest mode
      const boards = getGuestBoards();
      const newId = Math.max(0, ...boards.map(b => b.id)) + 1;
      const newBoard: Watchboard = {
        id: newId,
        user_id: "guest",
        name,
        pinned_game_id: null,
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      boards.push(newBoard);
      setGuestBoards(boards);
      setState(prev => ({
        ...prev,
        boards: [...prev.boards, newBoard],
      }));
      return newBoard;
    }
  }, [isAuthenticated, user]);

  // Switch active board
  const switchBoard = useCallback(async (boardId: number): Promise<boolean> => {
    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/${boardId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify({ is_active: true }),
        });
        await fetchBoards();
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const boards = getGuestBoards().map(b => ({
        ...b,
        is_active: b.id === boardId,
      }));
      setGuestBoards(boards);
      
      const activeBoard = boards.find(b => b.id === boardId) || null;
      const gamesMap = getGuestGames();
      const gameIds = activeBoard ? (gamesMap[activeBoard.id] || []) : [];
      
      setState(prev => ({
        ...prev,
        boards,
        activeBoard,
        gameIds,
      }));
      return true;
    }
  }, [isAuthenticated, user, fetchBoards]);

  // Rename board
  const renameBoard = useCallback(async (boardId: number, name: string): Promise<boolean> => {
    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/${boardId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify({ name }),
        });
        setState(prev => ({
          ...prev,
          boards: prev.boards.map(b => b.id === boardId ? { ...b, name } : b),
          activeBoard: prev.activeBoard?.id === boardId ? { ...prev.activeBoard, name } : prev.activeBoard,
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const boards = getGuestBoards().map(b => b.id === boardId ? { ...b, name } : b);
      setGuestBoards(boards);
      setState(prev => ({
        ...prev,
        boards,
        activeBoard: prev.activeBoard?.id === boardId ? { ...prev.activeBoard, name } : prev.activeBoard,
      }));
      return true;
    }
  }, [isAuthenticated, user]);

  // Delete board
  const deleteBoard = useCallback(async (boardId: number): Promise<boolean> => {
    if (state.boards.length <= 1) {
      return false;
    }

    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/${boardId}`, {
          method: "DELETE",
          headers: { "x-user-id": user.id.toString() },
        });
        await fetchBoards();
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      let boards = getGuestBoards().filter(b => b.id !== boardId);
      const wasActive = state.activeBoard?.id === boardId;
      
      if (wasActive && boards.length > 0) {
        boards = boards.map((b, i) => i === 0 ? { ...b, is_active: true } : b);
      }
      
      setGuestBoards(boards);
      
      // Clean up games
      const gamesMap = getGuestGames();
      delete gamesMap[boardId];
      setGuestGames(gamesMap);
      
      const activeBoard = boards.find(b => b.is_active) || boards[0] || null;
      const gameIds = activeBoard ? (gamesMap[activeBoard.id] || []) : [];
      
      const propsMap = getGuestProps();
      const boardProps = activeBoard ? (propsMap[activeBoard.id] || []) : [];
      
      setState({
        boards,
        activeBoard,
        gameIds,
        props: boardProps,
        players: [],
        isLoading: false,
        error: null,
      });
      return true;
    }
  }, [isAuthenticated, user, state.boards.length, state.activeBoard, fetchBoards]);

  // Set pinned game
  const setPinnedGame = useCallback(async (gameId: string | null): Promise<boolean> => {
    if (!state.activeBoard) return false;

    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/${state.activeBoard.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify({ pinned_game_id: gameId }),
        });
        setState(prev => ({
          ...prev,
          activeBoard: prev.activeBoard ? { ...prev.activeBoard, pinned_game_id: gameId } : null,
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const boards = getGuestBoards().map(b =>
        b.id === state.activeBoard?.id ? { ...b, pinned_game_id: gameId } : b
      );
      setGuestBoards(boards);
      setState(prev => ({
        ...prev,
        boards,
        activeBoard: prev.activeBoard ? { ...prev.activeBoard, pinned_game_id: gameId } : null,
      }));
      return true;
    }
  }, [isAuthenticated, user, state.activeBoard]);

  // Check if game is in watchboard
  const isGameInWatchboard = useCallback((gameId: string): boolean => {
    return state.gameIds.includes(gameId);
  }, [state.gameIds]);

  // ============================================
  // PLAYER PROPS FUNCTIONS
  // ============================================

  // Add prop to active board (legacy - backwards compatible)
  const addProp = useCallback(async (prop: {
    game_id?: string;
    player_name: string;
    player_id?: string;
    team?: string;
    sport: string;
    prop_type: string;
    line_value: number;
    selection: string;
    odds_american?: number;
    added_from?: string;
  }): Promise<{ success: boolean; boardName?: string; error?: string }> => {
    // Check if already exists
    const exists = state.props.some(
      p => p.game_id === prop.game_id && p.player_name === prop.player_name && p.prop_type === prop.prop_type
    );
    if (exists) {
      return { success: false, error: "Prop already tracked" };
    }

    if (isAuthenticated && user) {
      try {
        const res = await fetch("/api/watchboards/props", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify(prop),
        });
        const data = await res.json();
        
        if (data.success) {
          await fetchBoards(); // Refresh to get the new prop with ID
          return { success: true, boardName: data.boardName };
        }
        return { success: false, error: data.error };
      } catch {
        return { success: false, error: "Failed to add prop" };
      }
    } else {
      // Guest mode
      const propsMap = getGuestProps();
      const boardId = state.activeBoard?.id || 1;
      const current = propsMap[boardId] || [];
      
      const newProp: WatchboardProp = {
        id: Math.max(0, ...current.map(p => p.id), 0) + 1,
        watchboard_id: boardId,
        game_id: prop.game_id || '',
        player_name: prop.player_name,
        player_id: prop.player_id || null,
        team: prop.team || null,
        sport: prop.sport,
        prop_type: prop.prop_type,
        line_value: prop.line_value,
        selection: prop.selection,
        odds_american: prop.odds_american || null,
        current_stat_value: null,
        order_index: current.length,
        added_from: prop.added_from || null,
        created_at: new Date().toISOString(),
      };
      
      propsMap[boardId] = [...current, newProp];
      setGuestProps(propsMap);
      
      setState(prev => ({
        ...prev,
        props: [...prev.props, newProp],
      }));
      
      return { success: true, boardName: state.activeBoard?.name || "My Watchboard" };
    }
  }, [isAuthenticated, user, state.props, state.activeBoard, fetchBoards]);

  // Add prop to a SPECIFIC board (new API - for modal use)
  const addPropToBoard = useCallback(async (
    prop: {
      game_id?: string;
      player_name: string;
      player_id?: string;
      team?: string;
      sport: string;
      prop_type: string;
      line_value: number;
      selection: string;
      odds_american?: number;
      added_from?: string;
    },
    boardId: number
  ): Promise<{ success: boolean; boardName?: string; boardId?: number; error?: string }> => {
    if (isAuthenticated && user) {
      try {
        const res = await fetch("/api/watchboards/props", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify({ ...prop, board_id: boardId }),
        });
        const data = await res.json();
        
        if (data.success) {
          // If added to active board, update local state
          if (state.activeBoard?.id === boardId) {
            await fetchBoards();
          }
          return { success: true, boardName: data.boardName, boardId: data.boardId };
        }
        return { success: false, error: data.error, boardName: data.boardName };
      } catch (err) {
        return { success: false, error: "Failed to add prop" };
      }
    } else {
      // Guest mode - just add to specified board in localStorage
      const propsMap = getGuestProps();
      const current = propsMap[boardId] || [];
      
      // Check if already exists
      const exists = current.some(
        p => p.player_name === prop.player_name && p.prop_type === prop.prop_type && p.selection === prop.selection
      );
      if (exists) {
        const board = state.boards.find(b => b.id === boardId);
        return { success: false, error: "Prop already tracked", boardName: board?.name };
      }
      
      const newProp: WatchboardProp = {
        id: Math.max(0, ...current.map(p => p.id), 0) + 1,
        watchboard_id: boardId,
        game_id: prop.game_id || '',
        player_name: prop.player_name,
        player_id: prop.player_id || null,
        team: prop.team || null,
        sport: prop.sport,
        prop_type: prop.prop_type,
        line_value: prop.line_value,
        selection: prop.selection,
        odds_american: prop.odds_american || null,
        current_stat_value: null,
        order_index: current.length,
        added_from: prop.added_from || null,
        created_at: new Date().toISOString(),
      };
      
      propsMap[boardId] = [...current, newProp];
      setGuestProps(propsMap);
      
      // If added to active board, update local state
      if (state.activeBoard?.id === boardId) {
        setState(prev => ({
          ...prev,
          props: [...prev.props, newProp],
        }));
      }
      
      const board = state.boards.find(b => b.id === boardId);
      return { success: true, boardName: board?.name || "Watchboard", boardId };
    }
  }, [isAuthenticated, user, state.activeBoard, state.boards, fetchBoards]);

  // Remove prop from active board
  const removeProp = useCallback(async (propId: number): Promise<boolean> => {
    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/props/${propId}`, {
          method: "DELETE",
          headers: { "x-user-id": user.id.toString() },
        });
        setState(prev => ({
          ...prev,
          props: prev.props.filter(p => p.id !== propId),
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const propsMap = getGuestProps();
      const boardId = state.activeBoard?.id || 1;
      propsMap[boardId] = (propsMap[boardId] || []).filter(p => p.id !== propId);
      setGuestProps(propsMap);
      
      setState(prev => ({
        ...prev,
        props: prev.props.filter(p => p.id !== propId),
      }));
      return true;
    }
  }, [isAuthenticated, user, state.activeBoard]);

  // Update prop (e.g., current stat value)
  const updateProp = useCallback(async (propId: number, updates: { current_stat_value?: number; selection?: string; line_value?: number }): Promise<boolean> => {
    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/props/${propId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify(updates),
        });
        setState(prev => ({
          ...prev,
          props: prev.props.map(p => p.id === propId ? { ...p, ...updates } : p),
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const propsMap = getGuestProps();
      const boardId = state.activeBoard?.id || 1;
      propsMap[boardId] = (propsMap[boardId] || []).map(p => 
        p.id === propId ? { ...p, ...updates } : p
      );
      setGuestProps(propsMap);
      
      setState(prev => ({
        ...prev,
        props: prev.props.map(p => p.id === propId ? { ...p, ...updates } : p),
      }));
      return true;
    }
  }, [isAuthenticated, user, state.activeBoard]);

  // Check if prop is already tracked
  const isPropInWatchboard = useCallback((gameId: string, playerName: string, propType: string, selection?: string): boolean => {
    return state.props.some(
      p => p.game_id === gameId && 
           p.player_name === playerName && 
           p.prop_type === propType &&
           (!selection || p.selection === selection)
    );
  }, [state.props]);

  // ============================================
  // FOLLOWED PLAYERS FUNCTIONS
  // ============================================

  // Follow a player
  const followPlayer = useCallback(async (player: {
    player_name: string;
    player_id?: string;
    sport: string;
    team?: string;
    team_abbr?: string;
    position?: string;
    headshot_url?: string;
    prop_type?: string;
    prop_line?: number;
    prop_selection?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (isAuthenticated && user) {
      try {
        const res = await fetch("/api/watchboards/players", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify(player),
        });
        const data = await res.json();
        
        if (data.success) {
          await fetchBoards();
          return { success: true };
        }
        return { success: false, error: data.error };
      } catch {
        return { success: false, error: "Failed to follow player" };
      }
    } else {
      // Guest mode
      const playersMap = getGuestPlayers();
      const boardId = state.activeBoard?.id || 1;
      const current = playersMap[boardId] || [];
      
      // Check if already following
      const existing = current.find(p => p.player_name === player.player_name && p.sport === player.sport);
      if (existing) {
        // Update existing
        playersMap[boardId] = current.map(p => 
          p.player_name === player.player_name && p.sport === player.sport
            ? { ...p, ...player, is_active: true, updated_at: new Date().toISOString() }
            : p
        );
        setGuestPlayers(playersMap);
        setState(prev => ({
          ...prev,
          players: playersMap[boardId].filter(p => p.is_active),
        }));
        return { success: true };
      }
      
      const newPlayer: WatchboardPlayer = {
        id: Math.max(0, ...current.map(p => p.id), 0) + 1,
        watchboard_id: boardId,
        user_id: "guest",
        player_name: player.player_name,
        player_id: player.player_id || null,
        sport: player.sport,
        team: player.team || null,
        team_abbr: player.team_abbr || null,
        position: player.position || null,
        headshot_url: player.headshot_url || null,
        prop_type: player.prop_type || null,
        prop_line: player.prop_line ?? null,
        prop_selection: player.prop_selection || null,
        current_stat_value: null,
        order_index: current.length,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      
      playersMap[boardId] = [...current, newPlayer];
      setGuestPlayers(playersMap);
      
      setState(prev => ({
        ...prev,
        players: [...prev.players, newPlayer],
      }));
      
      return { success: true };
    }
  }, [isAuthenticated, user, state.activeBoard, fetchBoards]);

  // Unfollow a player
  const unfollowPlayer = useCallback(async (playerId: number): Promise<boolean> => {
    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/players/${playerId}`, {
          method: "DELETE",
          headers: { "x-user-id": user.id.toString() },
        });
        setState(prev => ({
          ...prev,
          players: prev.players.filter(p => p.id !== playerId),
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const playersMap = getGuestPlayers();
      const boardId = state.activeBoard?.id || 1;
      playersMap[boardId] = (playersMap[boardId] || []).map(p => 
        p.id === playerId ? { ...p, is_active: false } : p
      );
      setGuestPlayers(playersMap);
      
      setState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
      }));
      return true;
    }
  }, [isAuthenticated, user, state.activeBoard]);

  // Unfollow by name
  const unfollowPlayerByName = useCallback(async (playerName: string, sport: string): Promise<boolean> => {
    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/players/by-name/${encodeURIComponent(sport)}/${encodeURIComponent(playerName)}`, {
          method: "DELETE",
          headers: { "x-user-id": user.id.toString() },
        });
        setState(prev => ({
          ...prev,
          players: prev.players.filter(p => !(p.player_name === playerName && p.sport === sport)),
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const playersMap = getGuestPlayers();
      const boardId = state.activeBoard?.id || 1;
      playersMap[boardId] = (playersMap[boardId] || []).map(p => 
        p.player_name === playerName && p.sport === sport ? { ...p, is_active: false } : p
      );
      setGuestPlayers(playersMap);
      
      setState(prev => ({
        ...prev,
        players: prev.players.filter(p => !(p.player_name === playerName && p.sport === sport)),
      }));
      return true;
    }
  }, [isAuthenticated, user, state.activeBoard]);

  // Update followed player
  const updateFollowedPlayer = useCallback(async (playerId: number, updates: {
    prop_type?: string;
    prop_line?: number;
    prop_selection?: string;
    current_stat_value?: number;
  }): Promise<boolean> => {
    if (isAuthenticated && user) {
      try {
        await fetch(`/api/watchboards/players/${playerId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
          },
          body: JSON.stringify(updates),
        });
        setState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === playerId ? { ...p, ...updates } : p),
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      // Guest mode
      const playersMap = getGuestPlayers();
      const boardId = state.activeBoard?.id || 1;
      playersMap[boardId] = (playersMap[boardId] || []).map(p => 
        p.id === playerId ? { ...p, ...updates } : p
      );
      setGuestPlayers(playersMap);
      
      setState(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === playerId ? { ...p, ...updates } : p),
      }));
      return true;
    }
  }, [isAuthenticated, user, state.activeBoard]);

  // Check if player is followed
  const isPlayerFollowed = useCallback((playerName: string, sport: string): boolean => {
    return state.players.some(p => p.player_name === playerName && p.sport === sport);
  }, [state.players]);

  // Get followed player data
  const getFollowedPlayer = useCallback((playerName: string, sport: string): WatchboardPlayer | undefined => {
    return state.players.find(p => p.player_name === playerName && p.sport === sport);
  }, [state.players]);

  return {
    // State
    boards: state.boards,
    activeBoard: state.activeBoard,
    gameIds: state.gameIds,
    props: state.props,
    players: state.players,
    isLoading: state.isLoading,
    error: state.error,
    
    // Game Actions
    addGame,
    addGameToBoard,
    removeGame,
    reorderGames,
    isGameInWatchboard,
    
    // Prop Actions
    addProp,
    addPropToBoard,
    removeProp,
    updateProp,
    isPropInWatchboard,
    
    // Player Actions
    followPlayer,
    unfollowPlayer,
    unfollowPlayerByName,
    updateFollowedPlayer,
    isPlayerFollowed,
    getFollowedPlayer,
    
    // Board Actions
    createBoard,
    switchBoard,
    renameBoard,
    deleteBoard,
    setPinnedGame,
    refetch: fetchBoards,
  };
}
