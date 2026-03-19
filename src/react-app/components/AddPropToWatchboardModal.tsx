/**
 * AddPropToWatchboardModal
 * 
 * A modal that lets users choose which watchboard to add a player prop to,
 * or create a new watchboard with a custom name.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Loader2, Target, Sparkles } from "lucide-react";
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

interface PropData {
  game_id?: string;
  player_name: string;
  player_id?: string;
  team?: string;
  sport: string;
  prop_type: string;
  line_value: number;
  selection: string;
  odds_american?: number;
}

interface AddPropToWatchboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  prop: PropData;
  propSummary?: string; // e.g., "LeBron James Over 25.5 Points"
  onSuccess?: (boardName: string) => void;
  onError?: (error: string) => void;
}

export function AddPropToWatchboardModal({
  isOpen,
  onClose,
  prop,
  propSummary,
  onSuccess,
  onError,
}: AddPropToWatchboardModalProps) {
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

  // Add prop to selected board
  const handleAddToBoard = async (boardId: number) => {
    if (!user?.id) return;
    
    setSubmitting(true);
    setSelectedBoardId(boardId);
    
    try {
      const res = await fetch("/api/watchboards/props", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id.toString(),
        },
        body: JSON.stringify({
          ...prop,
          board_id: boardId,
          added_from: "modal",
        }),
      });

      const data = await res.json();

      if (data.success) {
        onSuccess?.(data.boardName);
        onClose();
      } else if (data.alreadyExists) {
        onError?.(`Already tracking this prop in ${data.boardName}`);
      } else {
        onError?.(data.error || "Failed to add prop");
      }
    } catch (err) {
      onError?.("Failed to add prop");
    } finally {
      setSubmitting(false);
      setSelectedBoardId(null);
    }
  };

  // Create new board and add prop to it
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

      // Add prop to new board
      const addRes = await fetch("/api/watchboards/props", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id.toString(),
        },
        body: JSON.stringify({
          ...prop,
          board_id: createData.board.id,
          added_from: "modal-new-board",
        }),
      });

      const addData = await addRes.json();

      if (addData.success) {
        onSuccess?.(createData.board.name);
        onClose();
      } else {
        onError?.(addData.error || "Failed to add prop");
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
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Target className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Sign In Required</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Create an account to track props on your watchboard.
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="relative px-6 py-4 border-b border-white/5">
              <button
                onClick={onClose}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
              <h2 className="text-lg font-semibold text-white pr-10">Track Prop</h2>
              {propSummary && (
                <p className="text-sm text-amber-400 mt-0.5">{propSummary}</p>
              )}
            </div>

            {/* Content */}
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                </div>
              ) : mode === "select" ? (
                <>
                  {/* Existing Boards */}
                  {boards.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      <p className="text-xs text-slate-500 uppercase tracking-wider px-1 mb-2">
                        Add to Watchboard
                      </p>
                      {boards.map((board) => {
                        const isSelected = selectedBoardId === board.id;
                        const gameCount = board.gameIds?.length || board.games?.length || 0;

                        return (
                          <button
                            key={board.id}
                            onClick={() => handleAddToBoard(board.id)}
                            disabled={submitting}
                            className={cn(
                              "w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all",
                              "bg-white/5 border-white/10 hover:bg-white/10 hover:border-amber-500/30"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                <Target className="w-5 h-5 text-amber-400" />
                              </div>
                              <div className="text-left min-w-0">
                                <p className="font-medium text-white truncate">{board.name}</p>
                                <p className="text-xs text-slate-500">
                                  {gameCount} {gameCount === 1 ? "item" : "items"}
                                </p>
                              </div>
                            </div>
                            {isSelected && submitting ? (
                              <Loader2 className="w-5 h-5 text-amber-400 animate-spin flex-shrink-0" />
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
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/20 bg-gradient-to-r from-amber-500/5 to-orange-500/5 hover:border-amber-500/40 hover:from-amber-500/10 hover:to-orange-500/10 transition-all"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-amber-400" />
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
                      placeholder="e.g., NBA Props, Tonight's Picks..."
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
                      className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"
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

export default AddPropToWatchboardModal;
