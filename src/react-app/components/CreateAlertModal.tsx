/**
 * Create Alert Modal
 * Bell button functionality for setting up game alerts
 */

import { useState } from "react";
import { Bell, TrendingUp, Trophy, Clock, Zap, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/react-app/components/ui/dialog";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { useFollow } from "@/react-app/hooks/useAlerts";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface CreateAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  gameSummary?: string;
}

interface AlertType {
  id: string;
  label: string;
  description: string;
  icon: typeof Bell;
  enabled: boolean;
}

export function CreateAlertModal({
  isOpen,
  onClose,
  gameId,
  homeTeam,
  awayTeam,
  sport,
  gameSummary,
}: CreateAlertModalProps) {
  const { user } = useDemoAuth();
  const { isFollowing, toggle, loading } = useFollow(
    "PROD",
    "GAME",
    gameId,
    sport
  );

  const [alertTypes, setAlertTypes] = useState<AlertType[]>([
    {
      id: "game_start",
      label: "Game Start",
      description: "Alert when the game begins",
      icon: Clock,
      enabled: true,
    },
    {
      id: "score_updates",
      label: "Score Updates",
      description: "Live scoring plays and touchdowns",
      icon: Zap,
      enabled: true,
    },
    {
      id: "line_movement",
      label: "Line Movement",
      description: "Significant odds changes",
      icon: TrendingUp,
      enabled: true,
    },
    {
      id: "final_score",
      label: "Final Score",
      description: "Alert when game ends",
      icon: Trophy,
      enabled: true,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const toggleAlertType = (id: string) => {
    setAlertTypes((prev) =>
      prev.map((type) =>
        type.id === id ? { ...type, enabled: !type.enabled } : type
      )
    );
  };

  const handleSave = async () => {
    if (!user) {
      alert("Please sign in to create alerts");
      return;
    }

    setSaving(true);
    setSuccess(false);

    try {
      // If not following, follow the game first
      if (!isFollowing) {
        const followSuccess = await toggle();
        if (!followSuccess) {
          throw new Error("Failed to follow game");
        }
      }

      // In a full implementation, you'd save alert preferences here
      // For now, we just add to watchlist which enables basic alerts
      
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Failed to create alert:", err);
      alert("Failed to create alert. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-amber-500/30">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-400" />
            </div>
            <DialogTitle className="text-xl text-white">Set Alert</DialogTitle>
          </div>
          <DialogDescription className="text-white/60">
            {gameSummary || `${awayTeam} @ ${homeTeam}`}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-white font-medium mb-1">Alert Created!</p>
            <p className="text-white/50 text-sm">
              You'll be notified about this game
            </p>
          </div>
        ) : (
          <>
            {/* Alert Type Selection */}
            <div className="space-y-2">
              <div className="text-xs text-white/40 uppercase tracking-wide font-medium mb-3">
                Alert Types
              </div>
              {alertTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => toggleAlertType(type.id)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-xl transition-all",
                      "border text-left",
                      type.enabled
                        ? "bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5"
                        : "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]"
                    )}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                        type.enabled
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-white/5 text-white/40"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          "font-medium mb-0.5 transition-colors",
                          type.enabled ? "text-white" : "text-white/60"
                        )}
                      >
                        {type.label}
                      </div>
                      <div className="text-xs text-white/40">
                        {type.description}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        type.enabled
                          ? "border-amber-500 bg-amber-500"
                          : "border-white/20"
                      )}
                    >
                      {type.enabled && (
                        <svg
                          className="w-3 h-3 text-black"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Info Notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-400/90">
                Alerts will appear in your notification center and on the games page
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 border-white/20 text-white/70 hover:bg-white/5"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  saving ||
                  loading ||
                  !alertTypes.some((t) => t.enabled) ||
                  !user
                }
                className={cn(
                  "flex-1 bg-gradient-to-r from-amber-500 to-orange-500",
                  "hover:from-amber-400 hover:to-orange-400",
                  "text-black font-bold shadow-lg shadow-amber-500/25"
                )}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : isFollowing ? (
                  <>
                    <Bell className="w-4 h-4 mr-2" />
                    Update Alert
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4 mr-2" />
                    Create Alert
                  </>
                )}
              </Button>
            </div>

            {!user && (
              <p className="text-xs text-center text-white/40 -mt-1">
                Sign in to create alerts
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
