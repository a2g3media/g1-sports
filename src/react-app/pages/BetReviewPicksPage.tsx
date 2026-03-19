/**
 * BetReviewPicksPage - Full-screen review page for mobile
 * Simple, no gestures, just edit lines and create watchboard
 * @module BetReviewPicksPage
 */

import * as React from "react";
const { useState } = React;
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Minus,
  X,
  Ticket,
  AlertCircle,
  Loader2,
  LogIn,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useBetSlip, BetLeg } from "@/react-app/hooks/useBetSlip";

// =====================================================
// BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
    </div>
  );
}

// =====================================================
// BET SLIP CARD
// =====================================================

interface BetSlipCardProps {
  leg: BetLeg;
  index: number;
  onUpdate: (leg: BetLeg) => void;
  onRemove: () => void;
}

function BetSlipCard({ leg, index, onUpdate, onRemove }: BetSlipCardProps) {
  const adjustLine = (delta: number) => {
    const current = parseFloat(leg.userLine) || 0;
    const newValue = current + delta;
    onUpdate({ ...leg, userLine: newValue.toString() });
  };

  const hasModifiedLine = leg.userLine !== leg.marketLine && leg.marketLine !== "";

  return (
    <div className="relative p-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Pick number badge */}
      <div className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
        <span className="text-sm font-bold text-white">{index + 1}</span>
      </div>

      <div className="pr-10 pt-1">
        {/* Team/Player */}
        <p className="font-semibold text-slate-100 text-lg">{leg.teamOrPlayer}</p>
        <p className="text-sm text-slate-400 mb-3">{leg.opponentOrContext}</p>

        {/* Market type badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-300 capitalize">
            {leg.marketType.replace("_", " ")}
          </span>
          {hasModifiedLine && (
            <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Modified
            </span>
          )}
        </div>

        {/* Line adjuster */}
        {leg.marketLine && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Your Line</span>
              {hasModifiedLine && (
                <span className="text-xs text-slate-500">Market: {leg.marketLine}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => adjustLine(-0.5)}
                className="p-3 rounded-xl bg-slate-700/50 hover:bg-blue-500/20 border border-slate-600/50 hover:border-blue-500/50 text-slate-300 hover:text-blue-300 transition-all active:scale-95"
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className={cn(
                "flex-1 text-center py-3 rounded-xl text-xl font-bold transition-all",
                hasModifiedLine
                  ? "bg-amber-500/15 border-2 border-amber-500/40 text-amber-300"
                  : "bg-slate-700/50 border border-slate-600/50 text-slate-100"
              )}>
                {leg.userLine}
              </div>
              <button
                onClick={() => adjustLine(0.5)}
                className="p-3 rounded-xl bg-slate-700/50 hover:bg-blue-500/20 border border-slate-600/50 hover:border-blue-500/50 text-slate-300 hover:text-blue-300 transition-all active:scale-95"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// LOGIN PROMPT
// =====================================================

interface LoginPromptProps {
  open: boolean;
  onClose: () => void;
}

function LoginPrompt({ open, onClose }: LoginPromptProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/80 shadow-2xl p-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
            <LogIn className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Sign In to Save</h2>
          <p className="text-slate-400 text-sm mb-6">
            Create a free account to save your watchboard and track your picks
          </p>
          <div className="space-y-3">
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Link>
            <Link
              to="/signup"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-700/50 text-slate-200 font-medium border border-slate-600/50"
            >
              Create Account
            </Link>
            <button
              onClick={onClose}
              className="w-full py-2 text-sm text-slate-500 hover:text-slate-300"
            >
              Continue editing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

function BetReviewPicksPage() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();
  const { legs, updateLeg, removeLeg, clearSlip, count } = useBetSlip();

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle create watchboard
  const handleCreate = async () => {
    if (count === 0) return;

    // Check auth first
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const ticketType = count > 1 ? "parlay" : "single";
      const userId = String(user.id);
      console.log("Creating ticket for user:", userId);
      
      const response = await fetch("/api/bet-tickets", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        credentials: "include",
        body: JSON.stringify({
          title: `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} - ${count} pick${count !== 1 ? "s" : ""}`,
          sportsbook: "Unknown",
          ticket_type: ticketType,
          stake_amount: null,
          to_win_amount: null,
          total_odds: null,
          status: "draft",
          source: "manual",
          legs: legs.map((leg, i) => ({
            leg_index: i,
            sport: leg.sport,
            league: leg.league,
            event_id: leg.gameId,
            team_or_player: leg.teamOrPlayer,
            opponent_or_context: leg.opponentOrContext,
            market_type: leg.marketType,
            side: leg.side,
            user_line_value: leg.userLine || null,
            user_odds: leg.userOdds || null,
            confidence_score: 100,
            is_needs_review: false,
            raw_text: null,
            leg_status: "Pending",
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create watchboard");
      }

      const result = await response.json();
      const ticketId = result.ticket_id || result.id;
      
      if (!ticketId) {
        console.error("No ticket ID returned:", result);
        throw new Error("Failed to create ticket - no ID returned");
      }

      // Confirm and create watchboard
      console.log("Confirming ticket:", ticketId, "for user:", userId);
      const confirmResponse = await fetch(`/api/bet-tickets/${ticketId}/confirm`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        credentials: "include",
      });

      if (!confirmResponse.ok) {
        const confirmError = await confirmResponse.json().catch(() => ({}));
        console.error("Confirm error:", confirmError);
        throw new Error(confirmError.error || "Failed to create watchboard");
      }

      const confirmResult = await confirmResponse.json();

      // Clear the slip
      clearSlip();

      // Navigate to watchboard
      if (confirmResult.watchboard_id) {
        navigate(`/watchboard/${confirmResult.watchboard_id}`);
      } else {
        navigate("/watchboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  // Empty state
  if (count === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <CinematicBackground />
        
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
          <div className="px-4 py-3 flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/bet/new")}
              className="text-slate-400 hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-lg font-bold text-slate-100">Review Picks</h1>
          </div>
        </header>

        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4 border border-slate-700/50">
              <Ticket className="w-10 h-10 text-slate-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-200 mb-2">No picks yet</h2>
            <p className="text-slate-500 mb-6">Add some games to your slip first</p>
            <Button
              onClick={() => navigate("/bet/new")}
              className="bg-blue-600 hover:bg-blue-500"
            >
              Browse Games
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-48">
      <CinematicBackground />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/bet/new")}
              className="text-slate-400 hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h1 className="text-lg font-bold text-slate-100">Review Picks</h1>
            </div>
          </div>
          <button
            onClick={clearSlip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>
      </header>

      {/* Picks list */}
      <div className="flex-1 p-4 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-slate-400">
            {count} pick{count !== 1 ? "s" : ""} selected
          </p>
          <p className="text-xs text-slate-500">Adjust lines with +/- buttons</p>
        </div>

        {legs.map((leg, index) => (
          <BetSlipCard
            key={leg.id}
            leg={leg}
            index={index}
            onUpdate={(updated) => updateLeg(index, updated)}
            onRemove={() => removeLeg(index)}
          />
        ))}
      </div>

      {/* Fixed bottom action - positioned above mobile nav */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 p-4 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 z-50">
        {error && (
          <div className="flex items-center gap-2 p-3 mb-3 rounded-xl bg-red-500/10 border border-red-500/30">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
        <Button
          onClick={handleCreate}
          disabled={saving}
          className="w-full h-14 text-base gap-3 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 shadow-lg shadow-emerald-500/20 font-semibold"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Ticket className="w-5 h-5" />
              Create Your Ticket Watchboard
            </>
          )}
        </Button>
      </div>

      {/* Login prompt */}
      <LoginPrompt open={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
    </div>
  );
}

export default BetReviewPicksPage;
