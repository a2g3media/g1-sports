/**
 * AddToWatchboardModal
 * 
 * A modal that lets users choose which watchboard to add a game to,
 * or create a new watchboard with a custom name.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Check, Loader2, Eye, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useDataHubWatchboards } from "@/react-app/hooks/useDataHub";
import { toast } from "sonner";

interface Watchboard {
  id: number;
  name: string;
  pending?: boolean;
  gameIds?: string[];
  games?: Array<{
    game_id: string;
    home_team_code: string;
    away_team_code: string;
  }>;
}

interface AddToWatchboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  gameSummary?: string; // e.g., "Arsenal vs Chelsea"
  onSuccess?: (boardName: string) => void;
  onError?: (error: string) => void;
}

const WATCHBOARD_LIST_TIMEOUT_MS = 15000;

function sanitizeBoardsForDisplay(input: Watchboard[]): Watchboard[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  const byId = new Map<number, Watchboard>();
  const next: Watchboard[] = [];
  for (const raw of input) {
    const id = Number(raw?.id);
    const name = String(raw?.name || "").trim();
    if (!Number.isFinite(id) || id <= 0 || !name) continue;
    const gameIds = Array.from(new Set(
      (Array.isArray(raw?.gameIds) ? raw.gameIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ));
    const games = (Array.isArray(raw?.games) ? raw.games : [])
      .filter((game) => String(game?.game_id || "").trim().length > 0);
    next.push({
      ...raw,
      id,
      name,
      pending: false,
      gameIds,
      games,
    });
  }
  // Canonical dedupe by board id: keep the highest-id occurrence.
  for (const board of next) {
    const existing = byId.get(board.id);
    if (!existing || board.id > existing.id) {
      byId.set(board.id, board);
    }
  }
  const canonical = Array.from(byId.values());

  // UX dedupe by repeated empty-name collisions (e.g. repeated "Board 1" shells).
  const emptyNameIndex = new Map<string, Watchboard>();
  const keep = new Set<number>();
  for (const board of canonical) {
    const normalizedName = String(board.name || "").trim().toLowerCase();
    const gameCount = (board.gameIds?.length || 0) + (board.games?.length || 0);
    if (!normalizedName) continue;
    if (gameCount > 0) {
      keep.add(board.id);
      continue;
    }
    const existing = emptyNameIndex.get(normalizedName);
    if (!existing || board.id > existing.id) {
      emptyNameIndex.set(normalizedName, board);
    }
  }
  for (const board of emptyNameIndex.values()) {
    keep.add(board.id);
  }
  return canonical
    .filter((board) => keep.has(board.id))
    .sort((a, b) => b.id - a.id);
}

function normalizeBoardsPayload(rawBoards: any[]): Watchboard[] {
  return sanitizeBoardsForDisplay(
    rawBoards.map((board) => ({
      ...board,
      gameIds: Array.isArray(board?.gameIds) ? board.gameIds : [],
      games: Array.isArray(board?.games) ? board.games : [],
    }))
  );
}

export function AddToWatchboardModal({
  isOpen,
  onClose,
  gameId,
  gameSummary,
  onSuccess,
  onError,
}: AddToWatchboardModalProps) {
  const location = useLocation();
  const { user } = useDemoAuth();
  const { boards: hubBoards } = useDataHubWatchboards();
  const [boards, setBoards] = useState<Watchboard[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"select" | "create">("select");
  const [newBoardName, setNewBoardName] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [lockedGameId, setLockedGameId] = useState("");
  const listAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const openerElementRef = useRef<HTMLElement | null>(null);
  const openLocationRef = useRef<string>("");
  const hasLoadedBoardsRef = useRef(false);
  const resolvedGameId = useMemo(() => {
    const locked = String(lockedGameId || "").trim();
    if (locked) return locked;
    return String(gameId || "").trim();
  }, [gameId, lockedGameId]);
  const hasResolvedGameId = resolvedGameId.length > 0;

  const runModalCleanupLog = useCallback(() => {
    if (typeof document === "undefined") return;
    console.log("[WATCHBOARD MODAL CLEANUP]", {
      modalOpen: false,
      submitting: false,
      bodyOverflow: document.body.style.overflow,
      backdropCount: document.querySelectorAll("[data-watchboard-backdrop]").length,
    });
  }, []);

  const requestClose = useCallback(() => {
    setSubmitting(false);
    setSelectedBoardId(null);
    onClose();
  }, [onClose]);

  const hubBoardsForPicker = useMemo(() => {
    if (!Array.isArray(hubBoards) || hubBoards.length === 0) return [] as Watchboard[];
    return sanitizeBoardsForDisplay(
      hubBoards.map((board) => ({
        id: Number(board?.id),
        name: String(board?.name || ""),
        gameIds: Array.isArray((board as any)?.gameIds) ? (board as any).gameIds : [],
        games: Array.isArray((board as any)?.games) ? (board as any).games : [],
      }))
    );
  }, [hubBoards]);

  // Fetch user's watchboards
  const fetchBoards = useCallback(async () => {
    if (!user?.id) {
      setBoards([]);
      setLoading(false);
      setListError(null);
      hasLoadedBoardsRef.current = true;
      return;
    }

    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    try {
      setLoading(true);
      setListError(null);
      const timeoutId = window.setTimeout(() => controller.abort("watchboard-list-timeout"), WATCHBOARD_LIST_TIMEOUT_MS);
      // Use home-preview payload so board picker has real game counts immediately.
      const res = await fetch("/api/watchboards/home-preview?fast=1", {
        headers: { "x-user-id": user.id.toString() },
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const data = await res.json();
      const rawBoards = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.boards)
          ? data.boards
          : [];
      const nextBoards = normalizeBoardsPayload(rawBoards);
      if (!isMountedRef.current) return;
      setBoards(nextBoards);
      setListError(null);
      hasLoadedBoardsRef.current = true;
    } catch (err) {
      // Ignore expected aborts from superseded requests or modal close.
      if (controller.signal.aborted || (err as any)?.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch watchboards:", err);
      if (!isMountedRef.current) return;
      setListError("Could not refresh watchboards");
      hasLoadedBoardsRef.current = true;
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
      listAbortRef.current = null;
    }
  }, [user?.id]);

  useEffect(() => {
    if (isOpen) {
      openLocationRef.current = `${location.pathname}${location.search}${location.hash}`;
      console.log("[WATCHBOARD MODAL OPEN]", {
        source: "add-to-watchboard",
        scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      });
      if (hubBoardsForPicker.length > 0) {
        setBoards(hubBoardsForPicker);
      }
      hasLoadedBoardsRef.current = hubBoardsForPicker.length > 0;
      setListError(null);
      setMode("select");
      setNewBoardName("");
      setSelectedBoardId(null);
      setSubmitting(false);
      void fetchBoards();
    }
  }, [isOpen, fetchBoards, hubBoardsForPicker, location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    openerElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      const opener = openerElementRef.current;
      if (opener && typeof opener.focus === "function") {
        window.setTimeout(() => {
          try {
            opener.focus({ preventScroll: true });
          } catch {
            opener.focus();
          }
        }, 0);
      }
      window.setTimeout(() => runModalCleanupLog(), 0);
    };
  }, [isOpen, runModalCleanupLog]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, requestClose]);

  useEffect(() => {
    if (!isOpen) return;
    const currentLocation = `${location.pathname}${location.search}${location.hash}`;
    if (openLocationRef.current && currentLocation !== openLocationRef.current) {
      requestClose();
    }
  }, [isOpen, location.pathname, location.search, location.hash, requestClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (hubBoardsForPicker.length === 0) return;
    setBoards((prev) => {
      if (prev.length > 0) return prev;
      return hubBoardsForPicker;
    });
  }, [hubBoardsForPicker, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setLockedGameId("");
      return;
    }
    const incoming = String(gameId || "").trim();
    if (incoming) {
      setLockedGameId(incoming);
    }
  }, [gameId, isOpen]);

  useEffect(() => {
    if (isOpen) return;
    listAbortRef.current?.abort();
    listAbortRef.current = null;
    setSubmitting(false);
    setSelectedBoardId(null);
    setLoading(false);
  }, [isOpen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      listAbortRef.current?.abort();
      listAbortRef.current = null;
    };
  }, []);

  const visibleBoards = useMemo(() => sanitizeBoardsForDisplay(boards), [boards]);
  const showNoBoardsEmptyState = !loading && hasLoadedBoardsRef.current && visibleBoards.length === 0 && !listError;

  // Check if game is already in a board
  const gameInBoards = visibleBoards.filter(b =>
    b.gameIds?.includes(resolvedGameId) || b.games?.some(g => g.game_id === resolvedGameId)
  );

  // Add game to selected board — await POST, then close only on success (8b63a48 pattern)
  const handleAddToBoard = async (boardId: number) => {
    if (!user?.id) return;
    if (!resolvedGameId) {
      toast.error("Cannot add to watchboard: missing game id", { duration: 2800 });
      onError?.("Missing game id");
      return;
    }

    setSubmitting(true);
    setSelectedBoardId(boardId);

    try {
      const res = await fetch("/api/watchboards/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id.toString(),
        },
        body: JSON.stringify({
          game_id: resolvedGameId,
          board_id: boardId,
          added_from: "modal",
          ...(gameSummary ? { game_summary: gameSummary } : {}),
        }),
      });

      const data = await res.json();

      if (data.success) {
        console.info("[Watchboard]", "add_game_ok", { boardId, gameId: resolvedGameId });
        onSuccess?.(data.boardName);
        onClose();
      } else if (data.alreadyExists) {
        onError?.(`Already in ${data.boardName}`);
      } else {
        onError?.(data.error || "Failed to add game");
      }
    } catch {
      onError?.("Failed to add game");
    } finally {
      setSubmitting(false);
      setSelectedBoardId(null);
    }
  };

  // Create new board and add game — POST /watchboards then POST /games; await both (8b63a48 pattern)
  const handleCreateAndAdd = async () => {
    if (!user?.id || !newBoardName.trim()) return;
    if (!resolvedGameId) {
      toast.error("Cannot create watchboard: missing game id", { duration: 2800 });
      onError?.("Missing game id");
      return;
    }

    setSubmitting(true);

    try {
      const createRes = await fetch("/api/watchboards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id.toString(),
        },
        body: JSON.stringify({ name: newBoardName.trim() }),
      });

      const createData = await createRes.json();

      if (!createData.board) {
        onError?.(createData.error || "Failed to create watchboard");
        return;
      }

      const addRes = await fetch("/api/watchboards/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id.toString(),
        },
        body: JSON.stringify({
          game_id: resolvedGameId,
          board_id: createData.board.id,
          added_from: "modal-new-board",
          ...(gameSummary ? { game_summary: gameSummary } : {}),
        }),
      });

      const addData = await addRes.json();

      if (addData.success) {
        console.info("[Watchboard]", "create_board_and_add_ok", {
          boardId: createData.board.id,
          gameId: resolvedGameId,
        });
        onSuccess?.(createData.board.name);
        onClose();
      } else {
        onError?.(addData.error || "Failed to add game");
      }
    } catch {
      onError?.("Failed to create watchboard");
    } finally {
      setSubmitting(false);
    }
  };

  // Guest mode - show login prompt
  if (!user?.id) {
    if (typeof document === "undefined") return null;
    return createPortal((
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-watchboard-backdrop
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
            onClick={requestClose}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 bg-slate-900 rounded-2xl border border-white/10 shadow-xl overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Eye className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Sign In Required</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Create an account to save games to your watchboard.
                </p>
                <Button onClick={requestClose} variant="outline" className="w-full">
                  Got it
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    ), document.body);
  }

  if (typeof document === "undefined") return null;
  return createPortal((
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-watchboard-backdrop
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
          onClick={requestClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-md max-h-[88vh] -translate-x-1/2 -translate-y-1/2 bg-slate-900 rounded-2xl border border-white/10 shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="relative px-6 py-4 border-b border-white/5">
              <button
                onClick={requestClose}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
              <h2 className="text-lg font-semibold text-white pr-10">Add to Watchboard</h2>
              {gameSummary && (
                <p className="text-sm text-slate-400 mt-0.5">{gameSummary}</p>
              )}
              {!hasResolvedGameId && (
                <p className="text-xs text-amber-300/90 mt-1">
                  Missing game id. Re-open from a game card and try again.
                </p>
              )}
            </div>

            {/* Content */}
            <div
              className="p-4 overflow-y-auto overscroll-y-contain max-h-[calc(88vh-92px)]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {mode === "select" ? (
                <>
                  {(loading || listError) && (
                    <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-300">
                        {loading ? "Refreshing watchboards..." : "Could not refresh. Showing available boards."}
                      </div>
                      {loading ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => void fetchBoards()}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                  {/* Create New Board Button (always visible) */}
                  <button
                    onClick={() => setMode("create")}
                    disabled={!hasResolvedGameId}
                    className="w-full flex items-center gap-3 p-3 mb-4 rounded-xl border border-dashed border-white/20 bg-gradient-to-r from-blue-500/5 to-purple-500/5 hover:border-blue-500/40 hover:from-blue-500/10 hover:to-purple-500/10 transition-all"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-white">Create New Watchboard</p>
                      <p className="text-xs text-slate-500">Start a fresh collection</p>
                    </div>
                  </button>
                  {/* Existing Boards */}
                  {visibleBoards.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      <p className="text-xs text-slate-500 uppercase tracking-wider px-1 mb-2">
                        Your Watchboards
                      </p>
                      {visibleBoards.map((board) => {
                        const alreadyAdded = gameInBoards.some(b => b.id === board.id);
                        const isSelected = selectedBoardId === board.id;
                        const gameCount = board.gameIds?.length || board.games?.length || 0;

                        return (
                          <button
                            key={board.id}
                            onClick={() => !alreadyAdded && hasResolvedGameId && handleAddToBoard(board.id)}
                            disabled={!hasResolvedGameId || alreadyAdded || submitting}
                            className={cn(
                              "w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all",
                              alreadyAdded
                                ? "bg-emerald-500/10 border-emerald-500/30 cursor-default"
                                : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-blue-500/30"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                                alreadyAdded ? "bg-emerald-500/20" : "bg-blue-500/10"
                              )}>
                                {alreadyAdded ? (
                                  <Check className="w-5 h-5 text-emerald-400" />
                                ) : (
                                  <Eye className="w-5 h-5 text-blue-400" />
                                )}
                              </div>
                              <div className="text-left min-w-0">
                                <p className="font-medium text-white truncate">{board.name}</p>
                                <p className="text-xs text-slate-500">
                                  {gameCount} {gameCount === 1 ? "game" : "games"}
                                </p>
                              </div>
                            </div>
                            {isSelected && submitting ? (
                              <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
                            ) : alreadyAdded ? (
                              <span className="text-xs text-emerald-400 flex-shrink-0">Added</span>
                            ) : (
                              <Plus className="w-5 h-5 text-slate-500 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : loading ? (
                    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                      Loading watchboards...
                    </div>
                  ) : showNoBoardsEmptyState ? (
                    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                      No watchboards yet. Create one below.
                    </div>
                  ) : null}
                </>
              ) : (
                /* Create Mode */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Watchboard Name
                    </label>
                    <Input
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      placeholder="e.g., Weekend Matches, EPL Games..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newBoardName.trim() && hasResolvedGameId) {
                          handleCreateAndAdd();
                        }
                      }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setMode("select")}
                      disabled={submitting}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleCreateAndAdd}
                      disabled={!newBoardName.trim() || submitting || !hasResolvedGameId}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-1.5" />
                          Create & Add
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  ), document.body);
}

export default AddToWatchboardModal;
