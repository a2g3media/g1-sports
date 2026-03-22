import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Plus, User, X } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";

interface PlayerData {
  player_name: string;
  player_id?: string;
  sport: string;
  team?: string;
  team_abbr?: string;
  position?: string;
  headshot_url?: string;
}

interface AddPlayerToWatchboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerData;
  playerSummary?: string;
  onSuccess?: (boardName: string) => void;
  onError?: (error: string) => void;
}

export function AddPlayerToWatchboardModal({
  isOpen,
  onClose,
  player,
  playerSummary,
  onSuccess,
  onError,
}: AddPlayerToWatchboardModalProps) {
  const { boards, createBoard, followPlayer } = useWatchboards();
  const [mode, setMode] = useState<"select" | "create">("select");
  const [newBoardName, setNewBoardName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode("select");
    setNewBoardName("");
    setSubmitting(false);
    setSelectedBoardId(null);
  }, [isOpen]);

  const hasBoards = boards.length > 0;
  const canCreate = newBoardName.trim().length > 0;
  const titleText = useMemo(() => playerSummary || player.player_name, [playerSummary, player.player_name]);

  const handleAddToBoard = async (boardId: number) => {
    setSubmitting(true);
    setSelectedBoardId(boardId);
    try {
      const result = await followPlayer({
        ...player,
        board_id: boardId,
      });
      if (!result.success) {
        onError?.(result.error || "Failed to add player");
        return;
      }
      const boardName = boards.find((b) => b.id === boardId)?.name || "Watchboard";
      onSuccess?.(boardName);
      onClose();
    } finally {
      setSubmitting(false);
      setSelectedBoardId(null);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!canCreate) return;
    setSubmitting(true);
    try {
      const newBoard = await createBoard(newBoardName.trim());
      if (!newBoard) {
        onError?.("Failed to create watchboard");
        return;
      }
      const result = await followPlayer({
        ...player,
        board_id: newBoard.id,
      });
      if (!result.success) {
        onError?.(result.error || "Failed to add player");
        return;
      }
      onSuccess?.(newBoard.name);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

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
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-xl overflow-hidden"
          >
            <div className="relative px-6 py-4 border-b border-white/5">
              <button
                onClick={onClose}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
              <h2 className="text-lg font-semibold text-white pr-10">Add Player to Watchboard</h2>
              <p className="text-sm text-amber-400 mt-0.5 truncate">{titleText}</p>
            </div>

            <div className="p-4">
              {mode === "select" ? (
                <>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {hasBoards ? (
                      boards.map((board) => (
                        <button
                          key={board.id}
                          onClick={() => void handleAddToBoard(board.id)}
                          disabled={submitting}
                          className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-amber-500/30 transition-all disabled:opacity-60"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <User className="w-4 h-4 text-amber-400 flex-shrink-0" />
                              <span className="text-white font-medium truncate">{board.name}</span>
                            </div>
                            {submitting && selectedBoardId === board.id && (
                              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                            )}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-slate-400 text-center py-6">
                        No watchboards yet. Create one to track this player.
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setMode("create")}
                    disabled={submitting}
                    className="mt-3 w-full p-3 rounded-lg border border-dashed border-white/20 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-slate-300 hover:text-white disabled:opacity-60"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" />
                      <span>Create New Watchboard</span>
                    </div>
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <Input
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    placeholder="Board name (e.g., NBA Targets)"
                    maxLength={48}
                    disabled={submitting}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canCreate && !submitting) {
                        e.preventDefault();
                        void handleCreateAndAdd();
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setMode("select")}
                      disabled={submitting}
                    >
                      Back
                    </Button>
                    <Button
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                      onClick={() => void handleCreateAndAdd()}
                      disabled={!canCreate || submitting}
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create & Add"}
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

export default AddPlayerToWatchboardModal;
