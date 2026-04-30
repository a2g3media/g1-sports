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
/** Cap mutation waits so the main thread never stalls on a hung worker/network response. */
const WATCHBOARD_MUTATION_TIMEOUT_MS = 15000;

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

function mergeGameIntoBoardState(
  boards: Watchboard[],
  boardId: number,
  gameId: string
): Watchboard[] {
  const gid = String(gameId || "").trim();
  if (!gid) return boards;
  return boards.map((b) => {
    if (b.id !== boardId) return b;
    const ids = new Set(
      (b.gameIds || []).map((x) => String(x || "").trim()).filter(Boolean)
    );
    ids.add(gid);
    const hasRow = (b.games || []).some((g) => String(g.game_id || "").trim() === gid);
    const games = hasRow
      ? b.games
      : [
          ...(b.games || []),
          {
            game_id: gid,
            home_team_code: "TBD",
            away_team_code: "TBD",
          },
        ];
    return { ...b, gameIds: Array.from(ids), games };
  });
}

function mergeNewBoardAfterCreate(
  boards: Watchboard[],
  board: { id: number; name: string },
  gameId: string
): Watchboard[] {
  const gid = String(gameId || "").trim();
  const entry: Watchboard = {
    id: board.id,
    name: board.name,
    gameIds: gid ? [gid] : [],
    games: gid
      ? [{ game_id: gid, home_team_code: "TBD", away_team_code: "TBD" }]
      : [],
  };
  const withoutDup = boards.filter((b) => b.id !== board.id);
  return sanitizeBoardsForDisplay([entry, ...withoutDup]);
}

async function fetchWatchboardJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ res: Response | null; data: Record<string, unknown>; timedOut: boolean; aborted: boolean }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    return { res, data, timedOut: false, aborted: false };
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? String((e as Error).name) : "";
    const aborted = name === "AbortError";
    return { res: null, data: {}, timedOut: aborted, aborted };
  } finally {
    window.clearTimeout(timer);
  }
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
  const { boards: hubBoards, refresh: refreshDataHub } = useDataHubWatchboards();
  const [boards, setBoards] = useState<Watchboard[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<"timeout" | "error" | null>(null);
  const [mode, setMode] = useState<"select" | "create">("select");
  const [newBoardName, setNewBoardName] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [lockedGameId, setLockedGameId] = useState("");
  const submitGuardRef = useRef(false);
  const lastFailedRef = useRef<{ kind: "add"; boardId: number } | { kind: "create" } | null>(null);
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
    submitGuardRef.current = false;
    setSubmitting(false);
    setSelectedBoardId(null);
    setSubmitError(null);
    lastFailedRef.current = null;
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
      setSubmitError(null);
      submitGuardRef.current = false;
      lastFailedRef.current = null;
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
    submitGuardRef.current = false;
    setSubmitting(false);
    setSelectedBoardId(null);
    setSubmitError(null);
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

  const runAddToBoardAsync = useCallback(async (boardId: number) => {
    const uid = user?.id;
    if (!uid || !resolvedGameId) return;
    try {
      console.log("REQUEST sent", { op: "add_game", boardId, gameId: resolvedGameId });
      const { res, data, timedOut } = await fetchWatchboardJson(
        "/api/watchboards/games",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": uid.toString(),
          },
          body: JSON.stringify({
            game_id: resolvedGameId,
            board_id: boardId,
            added_from: "modal",
            ...(gameSummary ? { game_summary: gameSummary } : {}),
          }),
        },
        WATCHBOARD_MUTATION_TIMEOUT_MS
      );
      console.log("RESPONSE received", {
        op: "add_game",
        timedOut,
        status: res?.status ?? null,
        success: Boolean(data?.success),
      });

      if (timedOut) {
        setSubmitError("timeout");
        lastFailedRef.current = { kind: "add", boardId };
        toast.error("Watchboard request timed out. Try Retry.", { duration: 4000 });
        return;
      }

      if (data.success) {
        const boardName = String(data.boardName || "Watchboard");
        setBoards((prev) => mergeGameIntoBoardState(prev, boardId, resolvedGameId));
        console.log("UI updated", { op: "add_game", boardId });
        void refreshDataHub();
        console.info("[Watchboard]", "add_game_ok", { boardId, gameId: resolvedGameId });
        onSuccess?.(boardName);
        onClose();
        return;
      }
      if (data.alreadyExists) {
        onError?.(`Already in ${data.boardName}`);
        return;
      }
      setSubmitError("error");
      lastFailedRef.current = { kind: "add", boardId };
      onError?.(String(data.error || "Failed to add game"));
    } catch {
      setSubmitError("error");
      lastFailedRef.current = { kind: "add", boardId };
      onError?.("Failed to add game");
    } finally {
      submitGuardRef.current = false;
      setSubmitting(false);
      setSelectedBoardId(null);
    }
  }, [user?.id, resolvedGameId, gameSummary, refreshDataHub, onSuccess, onClose, onError]);

  const runCreateAndAddAsync = useCallback(async () => {
    const uid = user?.id;
    const name = newBoardName.trim();
    if (!uid || !name || !resolvedGameId) return;
    try {
      console.log("REQUEST sent", { op: "create_board", name });
      const createPayload = await fetchWatchboardJson(
        "/api/watchboards",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": uid.toString(),
          },
          body: JSON.stringify({ name }),
        },
        WATCHBOARD_MUTATION_TIMEOUT_MS
      );
      console.log("RESPONSE received", {
        op: "create_board",
        timedOut: createPayload.timedOut,
        status: createPayload.res?.status ?? null,
        hasBoard: Boolean(createPayload.data?.board),
      });

      if (createPayload.timedOut) {
        setSubmitError("timeout");
        lastFailedRef.current = { kind: "create" };
        toast.error("Create watchboard timed out. Try Retry.", { duration: 4000 });
        return;
      }

      const createData = createPayload.data as { board?: { id: number; name: string }; error?: string };
      if (!createData.board) {
        setSubmitError("error");
        lastFailedRef.current = { kind: "create" };
        onError?.(createData.error || "Failed to create watchboard");
        return;
      }

      const newBoard = createData.board;
      console.log("REQUEST sent", { op: "add_game", boardId: newBoard.id, gameId: resolvedGameId });
      const addPayload = await fetchWatchboardJson(
        "/api/watchboards/games",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": uid.toString(),
          },
          body: JSON.stringify({
            game_id: resolvedGameId,
            board_id: newBoard.id,
            added_from: "modal-new-board",
            ...(gameSummary ? { game_summary: gameSummary } : {}),
          }),
        },
        WATCHBOARD_MUTATION_TIMEOUT_MS
      );
      console.log("RESPONSE received", {
        op: "add_game_after_create",
        timedOut: addPayload.timedOut,
        status: addPayload.res?.status ?? null,
        success: Boolean(addPayload.data?.success),
      });

      if (addPayload.timedOut) {
        setSubmitError("timeout");
        lastFailedRef.current = { kind: "create" };
        toast.error("Add game timed out. Try Retry.", { duration: 4000 });
        return;
      }

      const addData = addPayload.data as { success?: boolean; error?: string };
      if (addData.success) {
        setBoards((prev) => mergeNewBoardAfterCreate(prev, newBoard, resolvedGameId));
        console.log("UI updated", { op: "create_and_add", boardId: newBoard.id });
        void refreshDataHub();
        console.info("[Watchboard]", "create_board_and_add_ok", {
          boardId: newBoard.id,
          gameId: resolvedGameId,
        });
        onSuccess?.(newBoard.name);
        onClose();
        return;
      }
      setSubmitError("error");
      lastFailedRef.current = { kind: "create" };
      onError?.(addData.error || "Failed to add game");
    } catch {
      setSubmitError("error");
      lastFailedRef.current = { kind: "create" };
      onError?.("Failed to create watchboard");
    } finally {
      submitGuardRef.current = false;
      setSubmitting(false);
    }
  }, [
    user?.id,
    newBoardName,
    resolvedGameId,
    gameSummary,
    refreshDataHub,
    onSuccess,
    onClose,
    onError,
  ]);

  // Add game: instant UI feedback, non-blocking mutation (timeout-protected)
  const handleAddToBoard = (boardId: number) => {
    console.log("CLICK add game", { boardId });
    if (!user?.id) return;
    if (!resolvedGameId) {
      toast.error("Cannot add to watchboard: missing game id", { duration: 2800 });
      onError?.("Missing game id");
      return;
    }
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    setSubmitError(null);
    lastFailedRef.current = null;
    setSubmitting(true);
    setSelectedBoardId(boardId);
    window.setTimeout(() => void runAddToBoardAsync(boardId), 0);
  };

  const handleCreateAndAdd = () => {
    console.log("CLICK create and add");
    if (!user?.id || !newBoardName.trim()) return;
    if (!resolvedGameId) {
      toast.error("Cannot create watchboard: missing game id", { duration: 2800 });
      onError?.("Missing game id");
      return;
    }
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    setSubmitError(null);
    lastFailedRef.current = null;
    setSubmitting(true);
    window.setTimeout(() => void runCreateAndAddAsync(), 0);
  };

  const retryLastMutation = useCallback(() => {
    const failed = lastFailedRef.current;
    if (!failed) return;
    setSubmitError(null);
    if (failed.kind === "add") {
      if (submitGuardRef.current) return;
      submitGuardRef.current = true;
      setSubmitting(true);
      setSelectedBoardId(failed.boardId);
      window.setTimeout(() => void runAddToBoardAsync(failed.boardId), 0);
    } else {
      if (submitGuardRef.current) return;
      submitGuardRef.current = true;
      setSubmitting(true);
      window.setTimeout(() => void runCreateAndAddAsync(), 0);
    }
  }, [runAddToBoardAsync, runCreateAndAddAsync]);

  // Guest mode - show login prompt
  if (!user?.id) {
    if (typeof document === "undefined") return null;
    return createPortal((
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="watchboard-modal-backdrop-guest"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-watchboard-backdrop
              className="fixed inset-0 z-40 bg-black/50"
              onClick={requestClose}
            />
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              aria-hidden={false}
            >
              <motion.div
                key="watchboard-modal-panel-guest"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto w-[calc(100%-2rem)] max-w-sm max-h-[80vh] overflow-y-auto overflow-x-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-xl"
              >
              <div className="p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Eye className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Sign In Required</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Create an account to save games to your watchboard.
                </p>
                <Button type="button" onClick={requestClose} variant="outline" className="w-full transition-transform active:scale-[0.98]">
                  Got it
                </Button>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    ), document.body);
  }

  if (typeof document === "undefined") return null;
  return createPortal((
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="watchboard-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-watchboard-backdrop
            className="fixed inset-0 z-40 bg-black/50"
            onClick={requestClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="watchboard-modal-panel"
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 12 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto flex w-[calc(100%-2rem)] max-w-md max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-xl"
            >
            {/* Header */}
            <div className="relative shrink-0 border-b border-white/5 px-6 py-4">
              <button
                type="button"
                onClick={requestClose}
                className="pointer-events-auto absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 transition-colors hover:bg-white/10 active:bg-white/15 active:scale-95"
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
              {submitError && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <span>
                    {submitError === "timeout"
                      ? "Request timed out."
                      : "Something went wrong."}
                  </span>
                  <button
                    type="button"
                    onClick={retryLastMutation}
                    className="pointer-events-auto rounded-md bg-white/10 px-2 py-1 font-medium text-white transition-colors hover:bg-white/20 active:scale-95"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Content */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4"
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
                    type="button"
                    onClick={() => setMode("create")}
                    disabled={!hasResolvedGameId}
                    className={cn(
                      "pointer-events-auto mb-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-white/20 bg-gradient-to-r from-blue-500/5 to-purple-500/5 p-3 transition-all",
                      hasResolvedGameId
                        ? "cursor-pointer hover:border-blue-500/40 hover:from-blue-500/10 hover:to-purple-500/10 active:scale-[0.99] active:opacity-90"
                        : "cursor-not-allowed opacity-50 pointer-events-none"
                    )}
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
                    <div className="mb-4 max-h-[300px] min-h-0 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch]">
                      <p className="mb-2 px-1 text-xs uppercase tracking-wider text-slate-500">
                        Your Watchboards
                      </p>
                      <div className="space-y-2">
                      {visibleBoards.map((board) => {
                        const alreadyAdded = gameInBoards.some(b => b.id === board.id);
                        const isSelected = selectedBoardId === board.id;
                        const gameCount = board.gameIds?.length || board.games?.length || 0;

                        return (
                          <button
                            type="button"
                            key={board.id}
                            onClick={() => !alreadyAdded && hasResolvedGameId && handleAddToBoard(board.id)}
                            disabled={!hasResolvedGameId || alreadyAdded || submitting}
                            className={cn(
                              "flex w-full pointer-events-auto items-center justify-between gap-3 rounded-xl border p-3 transition-all",
                              alreadyAdded &&
                                "cursor-default border-emerald-500/30 bg-emerald-500/10",
                              !alreadyAdded &&
                                (!hasResolvedGameId || submitting) &&
                                "cursor-not-allowed border-white/10 bg-white/5 opacity-55",
                              !alreadyAdded &&
                                hasResolvedGameId &&
                                !submitting &&
                                "cursor-pointer border-white/10 bg-white/5 hover:bg-white/15 hover:border-blue-500/40 active:scale-[0.99] active:bg-white/10"
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
                              <span className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-blue-300 whitespace-nowrap">Adding...</span>
                                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                              </span>
                            ) : alreadyAdded ? (
                              <span className="text-xs text-emerald-400 flex-shrink-0">Added</span>
                            ) : (
                              <Plus className="w-5 h-5 text-slate-500 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                      </div>
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

                  <div className="flex gap-2 pointer-events-auto">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setMode("select")}
                      disabled={submitting}
                      className="flex-1 transition-transform active:scale-[0.98]"
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCreateAndAdd}
                      disabled={!newBoardName.trim() || submitting || !hasResolvedGameId}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 transition-transform hover:from-blue-500 hover:to-purple-500 active:scale-[0.98] active:from-blue-700 active:to-purple-700"
                    >
                      {submitting ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Creating...</span>
                        </span>
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
          </div>
        </>
      )}
    </AnimatePresence>
  ), document.body);
}

export default AddToWatchboardModal;
