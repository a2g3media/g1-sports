/**
 * AddToWatchboardModal
 * 
 * A modal that lets users choose which watchboard to add a game to,
 * or create a new watchboard with a custom name.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Check, Loader2, Eye, Sparkles } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface Watchboard {
  id: number;
  name: string;
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

export function AddToWatchboardModal({
  isOpen,
  onClose,
  gameId,
  gameSummary,
  onSuccess,
  onError,
}: AddToWatchboardModalProps) {
  const { user } = useDemoAuth();
  const [boards, setBoards] = useState<Watchboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"select" | "create">("select");
  const [newBoardName, setNewBoardName] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);

  // Fetch user's watchboards
  const fetchBoards = useCallback(async () => {
    if (!user?.id) {
      setBoards([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/watchboards/home-preview", {
        headers: { "x-user-id": user.id.toString() },
      });
      const data = await res.json();
      setBoards(data.boards || []);
    } catch (err) {
      console.error("Failed to fetch watchboards:", err);
      setBoards([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setMode("select");
      setNewBoardName("");
      setSelectedBoardId(null);
      fetchBoards();
    }
  }, [isOpen, fetchBoards]);

  // Check if game is already in a board
  const gameInBoards = boards.filter(b => 
    b.gameIds?.includes(gameId) || b.games?.some(g => g.game_id === gameId)
  );

  // Add game to selected board
  const handleAddToBoard = async (boardId: number) => {
    if (!user?.id) return;
    
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
          game_id: gameId,
          board_id: boardId,
          added_from: "modal",
        }),
      });

      const data = await res.json();

      if (data.success) {
        onSuccess?.(data.boardName);
        onClose();
      } else if (data.alreadyExists) {
        onError?.(`Already in ${data.boardName}`);
      } else {
        onError?.(data.error || "Failed to add game");
      }
    } catch (err) {
      onError?.("Failed to add game");
    } finally {
      setSubmitting(false);
      setSelectedBoardId(null);
    }
  };

  // Create new board and add game to it
  const handleCreateAndAdd = async () => {
    if (!user?.id || !newBoardName.trim()) return;

    setSubmitting(true);

    try {
      // Create board
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

      // Add game to new board
      const addRes = await fetch("/api/watchboards/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id.toString(),
        },
        body: JSON.stringify({
          game_id: gameId,
          board_id: createData.board.id,
          added_from: "modal-new-board",
        }),
      });

      const addData = await addRes.json();

      if (addData.success) {
        onSuccess?.(createData.board.name);
        onClose();
      } else {
        onError?.(addData.error || "Failed to add game");
      }
    } catch (err) {
      onError?.("Failed to create watchboard");
    } finally {
      setSubmitting(false);
    }
  };

  // Guest mode - show login prompt
  if (!user?.id) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-slate-900 rounded-2xl border border-white/10 shadow-xl overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Eye className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Sign In Required</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Create an account to save games to your watchboard.
                </p>
                <Button onClick={onClose} variant="outline" className="w-full">
                  Got it
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-[15vh] sm:pt-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-xl overflow-hidden my-auto"
          >
            {/* Header */}
            <div className="relative px-6 py-4 border-b border-white/5">
              <button
                onClick={onClose}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
              <h2 className="text-lg font-semibold text-white pr-10">Add to Watchboard</h2>
              {gameSummary && (
                <p className="text-sm text-slate-400 mt-0.5">{gameSummary}</p>
              )}
            </div>

            {/* Content */}
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                </div>
              ) : mode === "select" ? (
                <>
                  {/* Existing Boards */}
                  {boards.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      <p className="text-xs text-slate-500 uppercase tracking-wider px-1 mb-2">
                        Your Watchboards
                      </p>
                      {boards.map((board) => {
                        const alreadyAdded = gameInBoards.some(b => b.id === board.id);
                        const isSelected = selectedBoardId === board.id;
                        const gameCount = board.gameIds?.length || board.games?.length || 0;

                        return (
                          <button
                            key={board.id}
                            onClick={() => !alreadyAdded && handleAddToBoard(board.id)}
                            disabled={alreadyAdded || submitting}
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
                  ) : null}

                  {/* Create New Board Button */}
                  <button
                    onClick={() => setMode("create")}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/20 bg-gradient-to-r from-blue-500/5 to-purple-500/5 hover:border-blue-500/40 hover:from-blue-500/10 hover:to-purple-500/10 transition-all"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-white">Create New Watchboard</p>
                      <p className="text-xs text-slate-500">Start a fresh collection</p>
                    </div>
                  </button>
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
                        if (e.key === "Enter" && newBoardName.trim()) {
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
                      disabled={!newBoardName.trim() || submitting}
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
  );
}

export default AddToWatchboardModal;
