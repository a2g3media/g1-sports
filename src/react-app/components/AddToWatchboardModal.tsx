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

function emitWatchboardMutation(
  action: string,
  itemId: string,
  boardId: number | null,
  source: string,
  extraDetail?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const mutationTs = Date.now();
  window.dispatchEvent(new CustomEvent("watchboards:changed", {
    detail: {
      source,
      action,
      itemId,
      boardId,
      entity: "game",
      mutationTs,
      ...extraDetail,
    },
  }));
}

const WATCHBOARD_MUTATION_TIMEOUT_MS = 20000;
const WATCHBOARD_CREATE_MUTATION_TIMEOUT_MS = 30000;
const WATCHBOARD_LIST_TIMEOUT_MS = 15000;
const WATCHBOARD_VERIFY_TIMEOUT_MS = 6000;
const WATCHBOARD_VERIFY_RECONCILE_WINDOW_MS = 30000;
const WATCHBOARD_VERIFY_RECONCILE_MAX_ATTEMPTS = 8;
const WATCHBOARD_VERIFY_RECONCILE_RETRY_DELAY_MS = 2000;
const WATCHBOARD_CREATE_VERIFY_WINDOW_MS = 25000;
const WATCHBOARD_CREATE_VERIFY_MAX_ATTEMPTS = 7;
const WATCHBOARD_CREATE_VERIFY_RETRY_DELAY_MS = 1500;
const DEBUG_LOG_ENDPOINT = "http://127.0.0.1:7738/ingest/3f0629af-a99a-4780-a8a2-f41a5bc25b15";
const DEBUG_SESSION_ID = "05f1a6";

function sendDebugLog(payload: {
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}): void {
  // #region agent log
  fetch(DEBUG_LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      ...payload,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function buildGameIdAliasCandidates(gameId: string | null | undefined): string[] {
  const normalized = String(gameId || "").trim();
  if (!normalized) return [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const next = String(value || "").trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
  };

  push(normalized);

  const soccerLegacy = normalized.startsWith("soccer_sr:sport_event:")
    ? normalized.replace(/^soccer_/, "")
    : normalized;
  push(soccerLegacy);

  const srMatch = normalized.match(/^sr_([a-z0-9]+)_(.+)$/i);
  if (srMatch) {
    const external = String(srMatch[2] || "").trim();
    push(external);
    if (external) {
      push(`sr:sport_event:${external}`);
      push(`sr:match:${external}`);
    }
  }

  if (normalized.startsWith("sr:sport_event:")) {
    const external = normalized.replace("sr:sport_event:", "").trim();
    push(external);
  }
  if (normalized.startsWith("sr:match:")) {
    const external = normalized.replace("sr:match:", "").trim();
    push(external);
  }

  const espnMatch = normalized.match(/^espn_([a-z0-9]+)_(.+)$/i);
  if (espnMatch) {
    const external = String(espnMatch[2] || "").trim();
    push(external);
  }

  return Array.from(seen);
}

function gameIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = buildGameIdAliasCandidates(a);
  const right = new Set(buildGameIdAliasCandidates(b));
  if (left.length === 0 || right.size === 0) return false;
  return left.some((value) => right.has(value));
}

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

function upsertBoard(boards: Watchboard[], board: Watchboard): Watchboard[] {
  const existingIdx = boards.findIndex((b) => b.id === board.id);
  if (existingIdx === -1) return [board, ...boards];
  const next = [...boards];
  next[existingIdx] = { ...next[existingIdx], ...board };
  return next;
}

function removeBoardById(boards: Watchboard[], boardId: number): Watchboard[] {
  return boards.filter((b) => b.id !== boardId);
}

function replaceBoardId(boards: Watchboard[], tempId: number, nextBoard: Watchboard): Watchboard[] {
  const withoutTemp = boards.filter((b) => b.id !== tempId);
  return upsertBoard(withoutTemp, nextBoard);
}

function removeGameIdFromBoard(boards: Watchboard[], boardId: number, gameId: string): Watchboard[] {
  return boards.map((board) => {
    if (board.id !== boardId) return board;
    return {
      ...board,
      gameIds: (board.gameIds || []).filter((id) => String(id || "").trim() !== gameId),
      games: (board.games || []).filter((game) => String(game?.game_id || "").trim() !== gameId),
    };
  });
}

class MutationTimeoutError extends Error {
  timedOut = true;
  constructor(message = "Request timed out") {
    super(message);
    this.name = "MutationTimeoutError";
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  controller?: AbortController
): Promise<Response> {
  const requestController = controller ?? new AbortController();
  const timeout = window.setTimeout(() => requestController.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: requestController.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new MutationTimeoutError();
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function runBoundedVerification<T>(
  verifyOnce: () => Promise<T | null>,
  options?: {
    deadlineMs?: number;
    maxAttempts?: number;
    retryDelayMs?: number;
  }
): Promise<T | null> {
  const deadlineMs = Math.max(0, Number(options?.deadlineMs ?? WATCHBOARD_VERIFY_RECONCILE_WINDOW_MS));
  const maxAttempts = Math.max(1, Number(options?.maxAttempts ?? WATCHBOARD_VERIFY_RECONCILE_MAX_ATTEMPTS));
  const retryDelayMs = Math.max(0, Number(options?.retryDelayMs ?? WATCHBOARD_VERIFY_RECONCILE_RETRY_DELAY_MS));
  const deadlineAt = Date.now() + deadlineMs;
  let attempts = 0;
  while (attempts < maxAttempts && Date.now() <= deadlineAt) {
    attempts += 1;
    try {
      const result = await verifyOnce();
      if (result !== null) return result;
    } catch {
      // Keep retrying within bounded reconciliation window.
    }
    if (attempts >= maxAttempts) break;
    if (Date.now() >= deadlineAt) break;
    await sleepMs(retryDelayMs);
  }
  return null;
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
  const [pendingMutation, setPendingMutation] = useState<string | null>(null);
  const [lockedGameId, setLockedGameId] = useState("");
  const activeMutationRef = useRef(0);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const openerElementRef = useRef<HTMLElement | null>(null);
  const openLocationRef = useRef<string>("");
  const hasLoadedBoardsRef = useRef(false);
  const isMutationCurrent = useCallback((token: number) => activeMutationRef.current === token, []);
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
      pendingMutation: null,
      bodyOverflow: document.body.style.overflow,
      backdropCount: document.querySelectorAll("[data-watchboard-backdrop]").length,
    });
  }, []);

  const scheduleBackgroundReconcile = useCallback((source: string, boardId: number | null, extraDetail?: Record<string, unknown>) => {
    console.info("[WATCHBOARD RECONCILE]", { source, boardId, gameId: resolvedGameId, ...extraDetail });
    if (!resolvedGameId) return;
    emitWatchboardMutation("verify:pending", resolvedGameId, boardId, source, extraDetail);
  }, [resolvedGameId]);

  const fetchCanonicalBoardsSnapshot = useCallback(async (userId: string): Promise<Watchboard[]> => {
    const startedAt = Date.now();
    // Use home-preview so verification has board + game membership in one payload.
    const res = await fetchWithTimeout("/api/watchboards/home-preview?fast=1", {
      method: "GET",
      headers: { "x-user-id": userId },
    }, WATCHBOARD_VERIFY_TIMEOUT_MS);
    const data = await res.json();
    console.info("[WATCHBOARD VERIFY SNAPSHOT]", {
      durationMs: Date.now() - startedAt,
      boardCount: Array.isArray(data?.boards) ? data.boards.length : 0,
      endpointDurationMs: Number(data?.meta?.durationMs || 0) || null,
      endpointQueryCount: Number(data?.meta?.queryCount || 0) || null,
    });
    const rawBoards = Array.isArray(data?.boards) ? data.boards : [];
    return normalizeBoardsPayload(rawBoards);
  }, []);

  const fetchCanonicalBoardList = useCallback(async (userId: string): Promise<Watchboard[]> => {
    const res = await fetchWithTimeout("/api/watchboards/home-preview?fast=1", {
      method: "GET",
      headers: { "x-user-id": userId },
    }, WATCHBOARD_VERIFY_TIMEOUT_MS);
    const data = await res.json();
    const rawBoards = Array.isArray(data?.boards) ? data.boards : [];
    return normalizeBoardsPayload(rawBoards);
  }, []);

  const verifyGameExists = useCallback(async (userId: string, boardId: number, targetGameId: string): Promise<boolean> => {
    const startedAt = Date.now();
    const verifyRequestId = `wb-verify:${boardId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const res = await fetchWithTimeout(`/api/watchboards/games/check/${encodeURIComponent(targetGameId)}?board_id=${boardId}`, {
      method: "GET",
      headers: {
        "x-user-id": userId,
        "x-request-id": verifyRequestId,
      },
    }, WATCHBOARD_VERIFY_TIMEOUT_MS);
    const data = await res.json();
    if (!res.ok) {
      console.info("[WATCHBOARD VERIFY]", {
        durationMs: Date.now() - startedAt,
        boardId,
        gameId: targetGameId,
        exists: false,
        requestId: data?.request_id || verifyRequestId,
        status: res.status,
        reason: data?.error || "verify-check-failed",
      });
      return false;
    }
    const exists = Boolean(data?.inWatchboard);
    console.info("[WATCHBOARD VERIFY]", {
      durationMs: Date.now() - startedAt,
      boardId,
      gameId: targetGameId,
      exists,
      requestId: data?.request_id || verifyRequestId,
    });
    return exists;
  }, []);

  const markMutationPendingVerify = useCallback((boardId: number | null, source: string, extraDetail?: Record<string, unknown>) => {
    setPendingMutation("pending_verify");
    scheduleBackgroundReconcile(source, boardId, { phase: "pending_verify", ...extraDetail });
  }, [scheduleBackgroundReconcile]);

  const finalizeMutation = useCallback((boardId: number | null, source: string, extraDetail?: Record<string, unknown>) => {
    if (!resolvedGameId) return;
    emitWatchboardMutation("verify:confirmed", resolvedGameId, boardId, source, extraDetail);
  }, [resolvedGameId]);

  const requestClose = useCallback(() => {
    setSubmitting(false);
    setSelectedBoardId(null);
    setPendingMutation(null);
    onClose();
  }, [onClose]);

  const rollbackMutation = useCallback((
    boardId: number | null,
    source: string,
    options?: { rollbackBoard?: boolean; tempBoardId?: number | null; userId?: string }
  ) => {
    if (!boardId && !options?.rollbackBoard) return;
    if (options?.rollbackBoard && options?.tempBoardId && options?.userId) {
      setBoards((prev) => {
        return removeBoardById(prev, options.tempBoardId as number);
      });
      if (resolvedGameId) emitWatchboardMutation("create:rollback", resolvedGameId, null, source, {
        tempBoardId: options.tempBoardId,
      });
      return;
    }
    if (!boardId) return;
    if (resolvedGameId) emitWatchboardMutation("remove", resolvedGameId, boardId, source);
    if (options?.userId) {
      setBoards((prev) => {
        return removeGameIdFromBoard(prev, boardId, resolvedGameId);
      });
    }
  }, [resolvedGameId]);

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
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
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
      setPendingMutation(null);
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
    setPendingMutation(null);
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

  // Add game to selected board
  const handleAddToBoard = async (boardId: number) => {
    if (!user?.id) return;
    if (!resolvedGameId) {
      toast.error("Cannot add to watchboard: missing game id", { duration: 2800 });
      onError?.("Missing game id");
      return;
    }
    if (mutationAbortRef.current) {
      mutationAbortRef.current.abort();
      mutationAbortRef.current = null;
    }
    setSubmitting(true);
    setSelectedBoardId(boardId);
    const mutationStartedAt = Date.now();
    const mutationToken = activeMutationRef.current + 1;
    activeMutationRef.current = mutationToken;
    const boardName = visibleBoards.find((b) => b.id === boardId)?.name || "Watchboard";
    const clientMutationId = `add-game:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const addRequestId = `${clientMutationId}:add`;
    console.log("[WATCHBOARD ADD START]", { gameId: resolvedGameId, boardId, clientMutationId, addRequestId });

    // Optimistic UX/state: patch UI immediately, sync in background.
    emitWatchboardMutation("add", resolvedGameId, boardId, "mutation:add-modal-optimistic");
    toast.success(`Added to ${boardName}`, { duration: 2200 });
    onSuccess?.(boardName);
    requestClose();

    const controller = new AbortController();
    mutationAbortRef.current = controller;
    let ok = false;
    let timedOut = false;
    void (async () => {
      try {
        const res = await fetchWithTimeout("/api/watchboards/games", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
            "x-request-id": addRequestId,
          },
          body: JSON.stringify({
            game_id: resolvedGameId,
            board_id: boardId,
            added_from: "modal",
            client_mutation_id: clientMutationId,
            game_summary: gameSummary || "",
          }),
        }, WATCHBOARD_MUTATION_TIMEOUT_MS, controller);

        const data = await res.json();
        console.log("[WATCHBOARD ADD RESPONSE]", {
          status: res.status,
          requestId: data?.request_id || null,
          boardId,
          clientMutationId,
        });
        // #region agent log
        sendDebugLog({
          runId: "syncing-debug-run1",
          hypothesisId: "H3",
          location: "src/react-app/components/AddToWatchboardModal.tsx:handleAddToBoard",
          message: "add mutation response",
          data: {
            boardId,
            gameId: resolvedGameId,
            status: res.status,
            success: Boolean(data?.success),
            alreadyExists: Boolean(data?.alreadyExists),
            error: data?.error || null,
            requestId: data?.request_id || null,
          },
        });
        // #endregion

        if (data.success || data.alreadyExists) {
          if (!isMutationCurrent(mutationToken)) return;
          ok = true;
          console.log("[WATCHBOARD ADD SUCCESS]");
          return;
        }
        if (!isMutationCurrent(mutationToken)) return;
        console.log("[WATCHBOARD ADD ERROR]", data);
        const notFound = String(data?.error || "").toLowerCase().includes("watchboard not found");
        if (notFound) {
          try {
            const canonicalBoards = await fetchCanonicalBoardList(user.id.toString());
            if (canonicalBoards.length > 0) {
              setBoards(canonicalBoards);
            }
            const remappedBoard = canonicalBoards.find(
              (board) => String(board.name || "").trim().toLowerCase() === boardName.toLowerCase()
            );
            if (remappedBoard?.id && remappedBoard.id !== boardId) {
              const remapRequestId = `${clientMutationId}:remap`;
              const retryRes = await fetchWithTimeout("/api/watchboards/games", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-user-id": user.id.toString(),
                  "x-request-id": remapRequestId,
                },
                body: JSON.stringify({
                  game_id: resolvedGameId,
                  board_id: remappedBoard.id,
                  added_from: "modal-remap-board-id",
                  client_mutation_id: clientMutationId,
                  game_summary: gameSummary || "",
                }),
              }, WATCHBOARD_MUTATION_TIMEOUT_MS, controller);
              const retryData = await retryRes.json();
              console.log("[WATCHBOARD ADD REMAP RESPONSE]", {
                status: retryRes.status,
                requestId: retryData?.request_id || null,
                boardId: remappedBoard.id,
                clientMutationId,
              });
              if (retryData.success || retryData.alreadyExists) {
                if (!isMutationCurrent(mutationToken)) return;
                ok = true;
                emitWatchboardMutation("add", resolvedGameId, remappedBoard.id, "mutation:add-modal-remapped-board");
                finalizeMutation(remappedBoard.id, "mutation:verify-confirm:add-modal-remapped-board", { remappedBoardId: remappedBoard.id });
                console.log("[WATCHBOARD ADD SUCCESS]");
                return;
              }
            }
          } catch (remapErr) {
            if (!isMutationCurrent(mutationToken)) return;
            console.log("[WATCHBOARD ADD ERROR]", remapErr);
          }
        }
        if (!isMutationCurrent(mutationToken)) return;
        rollbackMutation(boardId, "mutation:rollback:add-modal", { userId: user.id.toString() });
        toast.error("Failed to add to watchboard", { duration: 2600 });
        onError?.(data.error || "Failed to add game");
      } catch (err: any) {
        if (!isMutationCurrent(mutationToken)) return;
        timedOut = Boolean(err?.timedOut);
        console.log("[WATCHBOARD ADD ERROR]", { err, boardId, clientMutationId, addRequestId });
        if (timedOut) {
          markMutationPendingVerify(boardId, "mutation:pending-verify:add-modal");
          const verified = await runBoundedVerification<boolean>(async () => {
            const exists = await verifyGameExists(user.id.toString(), boardId, resolvedGameId);
            return exists ? true : null;
          });
          // #region agent log
          sendDebugLog({
            runId: "syncing-debug-run1",
            hypothesisId: "H3",
            location: "src/react-app/components/AddToWatchboardModal.tsx:handleAddToBoard",
            message: "add verify after timeout",
            data: {
              boardId,
              gameId: resolvedGameId,
              timedOut: true,
              verified,
            },
          });
          // #endregion
          if (verified) {
            if (!isMutationCurrent(mutationToken)) return;
            ok = true;
            finalizeMutation(boardId, "mutation:verify-confirm:add-modal", { committedLate: true });
            toast.success("Added to watchboard", { duration: 2200 });
            onSuccess?.(boardName);
          } else {
            if (!isMutationCurrent(mutationToken)) return;
            // Do not hard-rollback on bounded verify timeout. The mutation may have
            // committed server-side but remain temporarily unresolved in home-preview.
            // Keep optimistic state and let background reconciliation settle it.
            toast("Still syncing to watchboard...", { duration: 2600 });
          }
          return;
        }
        if (!isMutationCurrent(mutationToken)) return;
        rollbackMutation(boardId, "mutation:rollback:add-modal", { userId: user.id.toString() });
        toast.error("Failed to add game", { duration: 2600 });
        onError?.("Failed to add game");
      } finally {
        if (isMutationCurrent(mutationToken)) {
          mutationAbortRef.current = null;
          setSubmitting(false);
          setSelectedBoardId(null);
          setPendingMutation(null);
        }
        console.log("[WATCHBOARD ADD END]", {
          ok,
          timedOut,
          cleanedUp: true,
          totalLatencyMs: Date.now() - mutationStartedAt,
          clientMutationId,
        });
      }
    })();
  };

  // Create new board and add game to it
  const handleCreateAndAdd = async () => {
    if (!user?.id || !newBoardName.trim()) return;
    if (!resolvedGameId) {
      toast.error("Cannot create watchboard: missing game id", { duration: 2800 });
      onError?.("Missing game id");
      return;
    }
    if (mutationAbortRef.current) {
      mutationAbortRef.current.abort();
      mutationAbortRef.current = null;
    }
    setSubmitting(true);
    const mutationStartedAt = Date.now();
    const mutationToken = activeMutationRef.current + 1;
    activeMutationRef.current = mutationToken;
    const boardName = newBoardName.trim();
    const tempBoardId = -Date.now();
    const userId = user.id.toString();
    const clientMutationId = `create-with-game:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const createRequestId = `${clientMutationId}:create`;
    console.log("[WATCHBOARD ADD START]", { gameId: resolvedGameId, clientMutationId, createRequestId });

    const optimisticBoard: Watchboard = {
      id: tempBoardId,
      name: boardName,
      pending: true,
      gameIds: [resolvedGameId],
      games: [],
    };
    setBoards((prev) => {
      return upsertBoard(prev, optimisticBoard);
    });

    emitWatchboardMutation("create:add", resolvedGameId, null, "mutation:create-add-optimistic", {
      tempBoardId,
      boardName,
      clientMutationId,
    });
    const pendingToastId = toast.loading(`Creating ${boardName}...`, { duration: Infinity });
    requestClose();

    const controller = new AbortController();
    mutationAbortRef.current = controller;
    let ok = false;
    let timedOut = false;
    void (async () => {
      try {
        const createWithGameRes = await fetchWithTimeout("/api/watchboards/create-with-game", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id.toString(),
            "x-request-id": createRequestId,
          },
          body: JSON.stringify({
            name: boardName,
            game_id: resolvedGameId,
            added_from: "modal-create-with-game",
            client_mutation_id: clientMutationId,
            game_summary: gameSummary || "",
          }),
        }, WATCHBOARD_CREATE_MUTATION_TIMEOUT_MS, controller);

        const createData = await createWithGameRes.json();
        console.log("[WATCHBOARD CREATE RESPONSE]", {
          status: createWithGameRes.status,
          requestId: createData?.request_id || null,
          clientMutationId,
        });
        const realBoardId = Number(createData?.boardId || createData?.board?.id || 0) || null;
        const realBoardName = String(createData?.boardName || createData?.board?.name || boardName).trim() || boardName;

        if (!createData?.success || !realBoardId) {
          if (!isMutationCurrent(mutationToken)) return;
          console.log("[WATCHBOARD ADD ERROR]", createData);
          rollbackMutation(null, "mutation:create-rollback", {
            rollbackBoard: true,
            tempBoardId,
            userId,
          });
          toast.dismiss(pendingToastId);
          toast.error("Failed to create watchboard", { duration: 2600 });
          onError?.(createData.error || "Failed to create watchboard");
          return;
        }

        const confirmedBoard: Watchboard = {
          id: realBoardId,
          name: realBoardName,
          pending: false,
          gameIds: Array.from(new Set([resolvedGameId, ...((createData?.board?.gameIds as string[]) || [])])),
          games: Array.isArray(createData?.board?.games) ? createData.board.games : [],
        };
        setBoards((prev) => {
          return replaceBoardId(prev, tempBoardId, confirmedBoard);
        });
        if (!isMutationCurrent(mutationToken)) return;
        emitWatchboardMutation("create:confirm", resolvedGameId, realBoardId, "mutation:create-confirm", {
          tempBoardId,
          boardName: confirmedBoard.name,
          clientMutationId,
        });
        toast.dismiss(pendingToastId);
        toast.success(`Added to ${realBoardName}`, { duration: 2200 });
        onSuccess?.(realBoardName);
        ok = true;
        console.log("[WATCHBOARD ADD SUCCESS]");
      } catch (err: any) {
        if (!isMutationCurrent(mutationToken)) return;
        timedOut = Boolean(err?.timedOut);
        console.log("[WATCHBOARD ADD ERROR]", {
          err,
          clientMutationId,
          createRequestId,
        });
        if (timedOut) {
          markMutationPendingVerify(tempBoardId, "mutation:pending-verify:create-modal", {
            boardName,
            clientMutationId,
          });
          const resolvedBoard = await runBoundedVerification<Watchboard>(async () => {
            const boardsSnapshot = await fetchCanonicalBoardsSnapshot(userId);
            const exactMatches = boardsSnapshot.filter((board) => String(board.name || "").trim().toLowerCase() === boardName.toLowerCase());
            if (exactMatches.length === 0) return null;
            const matchedWithGame = exactMatches.find((board) => {
              const ids = Array.isArray(board.gameIds) ? board.gameIds : [];
              const rows = Array.isArray(board.games) ? board.games : [];
              return ids.some((id) => gameIdsMatch(String(id || ""), resolvedGameId))
                || rows.some((row) => gameIdsMatch(String(row?.game_id || ""), resolvedGameId));
            });
            const fallbackBoard = exactMatches
              .slice()
              .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
            const target = matchedWithGame || fallbackBoard;
            if (!target?.id) return null;
            return {
              id: Number(target.id),
              name: target.name || boardName,
              pending: false,
              gameIds: Array.isArray(target.gameIds) ? target.gameIds : [],
              games: Array.isArray(target.games) ? target.games : [],
            };
          }, {
            deadlineMs: WATCHBOARD_CREATE_VERIFY_WINDOW_MS,
            maxAttempts: WATCHBOARD_CREATE_VERIFY_MAX_ATTEMPTS,
            retryDelayMs: WATCHBOARD_CREATE_VERIFY_RETRY_DELAY_MS,
          });
          if (resolvedBoard?.id) {
            if (!isMutationCurrent(mutationToken)) return;
            const realBoardId = Number(resolvedBoard.id);
            let ensuredGameAttached = Boolean(
              (resolvedBoard.gameIds || []).some((id) => gameIdsMatch(String(id || ""), resolvedGameId))
              || (resolvedBoard.games || []).some((row) => gameIdsMatch(String(row?.game_id || ""), resolvedGameId))
            );
            if (!ensuredGameAttached) {
              const attachRequestId = `${clientMutationId}:attach`;
              try {
                const attachRes = await fetchWithTimeout("/api/watchboards/games", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-user-id": user.id.toString(),
                    "x-request-id": attachRequestId,
                  },
                  body: JSON.stringify({
                    game_id: resolvedGameId,
                    board_id: realBoardId,
                    added_from: "modal-create-timeout-retry-attach",
                    client_mutation_id: clientMutationId,
                    game_summary: gameSummary || "",
                  }),
                }, WATCHBOARD_MUTATION_TIMEOUT_MS, controller);
                const attachData = await attachRes.json();
                console.log("[WATCHBOARD ATTACH RESPONSE]", {
                  status: attachRes.status,
                  requestId: attachData?.request_id || null,
                  clientMutationId,
                  boardId: realBoardId,
                });
                ensuredGameAttached = Boolean(attachData?.success || attachData?.alreadyExists);
              } catch {
                ensuredGameAttached = false;
              }
            }
            setBoards((prev) => {
              return replaceBoardId(prev, tempBoardId, resolvedBoard);
            });
            emitWatchboardMutation("create:confirm", resolvedGameId, realBoardId, "mutation:create-confirm-verify", {
              tempBoardId,
              boardName: resolvedBoard.name,
              clientMutationId,
              ensuredGameAttached,
            });
            ok = true;
            finalizeMutation(realBoardId, "mutation:verify-confirm:create-modal", { committedLate: true, clientMutationId, ensuredGameAttached });
            toast.dismiss(pendingToastId);
            toast.success(
              ensuredGameAttached
                ? "Added to watchboard"
                : "Watchboard created (game syncing)",
              { duration: 2400 }
            );
            onSuccess?.(resolvedBoard.name || boardName);
          } else {
            if (!isMutationCurrent(mutationToken)) return;
            // Fast-fail after bounded verification window; don't keep user waiting for minutes.
            rollbackMutation(null, "mutation:create-rollback", {
              rollbackBoard: true,
              tempBoardId,
              userId,
            });
            toast.dismiss(pendingToastId);
            toast.error("Failed to create watchboard", { duration: 2600 });
            onError?.("Failed to create watchboard");
          }
          return;
        }
        if (!isMutationCurrent(mutationToken)) return;
        rollbackMutation(null, "mutation:create-rollback", {
          rollbackBoard: true,
          tempBoardId,
          userId,
        });
        toast.dismiss(pendingToastId);
        toast.error("Failed to create watchboard", { duration: 2600 });
        onError?.("Failed to create watchboard");
      } finally {
        if (!isMutationCurrent(mutationToken)) return;
        toast.dismiss(pendingToastId);
        if (isMutationCurrent(mutationToken)) {
          mutationAbortRef.current = null;
          setSubmitting(false);
          setSelectedBoardId(null);
          setPendingMutation(null);
        }
        console.log("[WATCHBOARD ADD END]", {
          ok,
          timedOut,
          cleanedUp: true,
          route: "create-with-game",
          totalLatencyMs: Date.now() - mutationStartedAt,
          clientMutationId,
        });
      }
    })();
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
          data-pending-mutation={pendingMutation || undefined}
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
