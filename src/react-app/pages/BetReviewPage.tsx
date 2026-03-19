/**
 * BetReviewPage - Review and confirm AI-parsed bet tickets
 * Shows editable fields for correcting parsing mistakes
 * @module BetReviewPage
 */

import * as React from "react";
const { useState, useEffect, useCallback } = React;
import { useNavigate, useParams, Link } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  Edit2,
  Save,
  Trash2,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  X,
  Target,
  Trophy,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { cn } from "@/react-app/lib/utils";

// =====================================================
// TYPES
// =====================================================

interface BetTicket {
  id: number;
  user_id: string;
  title: string | null;
  sportsbook: string | null;
  ticket_type: string;
  stake_amount: number | null;
  to_win_amount: number | null;
  total_odds: number | null;
  status: string;
  source: string;
  source_image_url: string | null;
  raw_ai_response: string | null;
  created_at: string;
}

// Parsing metadata from AI response
interface ParsingMetadata {
  parsing_notes: string[];
  review_reasons: string[];
  overall_confidence: number;
  sportsbook_confidence: number;
}

interface BetLeg {
  id: number;
  ticket_id: number;
  leg_index: number;
  sport: string | null;
  league: string | null;
  event_id: string | null;
  team_or_player: string;
  opponent_or_context: string | null;
  market_type: string;
  side: string | null;
  user_line_value: number | null;
  user_odds: number | null;
  confidence_score: number | null;
  is_needs_review: number;
  raw_text: string | null;
  leg_status: string;
}

// =====================================================
// CONSTANTS
// =====================================================

const MARKET_TYPES = [
  "Spread",
  "Moneyline", 
  "Total",
  "Player Prop",
  "Team Prop",
  "First Half",
  "First Quarter",
  "Other",
];

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "Soccer", "Tennis", "Golf", "MMA"];

const SPORTSBOOKS = [
  "FanDuel",
  "DraftKings",
  "BetMGM",
  "Caesars",
  "PointsBet",
  "BetRivers",
  "Bet365",
  "Barstool",
  "Other",
];

// =====================================================
// CINEMATIC BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}

// =====================================================
// PARSING NOTES DISPLAY
// =====================================================

interface ParsingNotesProps {
  metadata: ParsingMetadata;
  isExpanded: boolean;
  onToggle: () => void;
}

function ParsingNotesPanel({ metadata, isExpanded, onToggle }: ParsingNotesProps) {
  const hasNotes = metadata.parsing_notes.length > 0;
  const hasReviewReasons = metadata.review_reasons.length > 0;
  
  if (!hasNotes && !hasReviewReasons && metadata.overall_confidence >= 80) {
    return null; // Don't show if high confidence and no notes
  }
  
  // Determine confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    if (confidence >= 60) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    return "text-red-400 bg-red-500/10 border-red-500/30";
  };
  
  const confidenceLabel = (confidence: number) => {
    if (confidence >= 80) return "High Confidence";
    if (confidence >= 60) return "Medium Confidence";
    return "Low Confidence";
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
            getConfidenceColor(metadata.overall_confidence)
          )}>
            <Target className="w-3.5 h-3.5" />
            <span>{Math.round(metadata.overall_confidence)}% • {confidenceLabel(metadata.overall_confidence)}</span>
          </div>
          {(hasNotes || hasReviewReasons) && (
            <span className="text-xs text-slate-400">
              {metadata.parsing_notes.length + metadata.review_reasons.length} note{(metadata.parsing_notes.length + metadata.review_reasons.length) !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Sportsbook Confidence */}
          {metadata.sportsbook_confidence > 0 && metadata.sportsbook_confidence < 80 && (
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-slate-300">
                <span className="text-amber-400 font-medium">Sportsbook Detection:</span>{" "}
                {Math.round(metadata.sportsbook_confidence)}% confidence - verify the sportsbook is correct
              </p>
            </div>
          )}
          
          {/* Review Reasons */}
          {hasReviewReasons && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Items to Review</p>
              <ul className="space-y-1.5">
                {metadata.review_reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-slate-300">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Parsing Notes */}
          {hasNotes && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Parser Notes</p>
              <ul className="space-y-1.5">
                {metadata.parsing_notes.map((note, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-slate-400">{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Help text */}
          <p className="text-xs text-slate-500 pt-2 border-t border-slate-700/50">
            AI parsing isn't perfect. Please verify the details above match your actual bet slip before confirming.
          </p>
        </div>
      )}
    </div>
  );
}

// =====================================================
// EDITABLE LEG CARD
// =====================================================

interface LegCardProps {
  leg: BetLeg;
  index: number;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSave: (updates: Partial<BetLeg>) => Promise<void>;
  onDelete: () => Promise<void>;
  isSaving: boolean;
}

function LegCard({ leg, index, isEditing, onToggleEdit, onSave, onDelete, isSaving }: LegCardProps) {
  const [editData, setEditData] = useState({
    team_or_player: leg.team_or_player,
    opponent_or_context: leg.opponent_or_context || "",
    market_type: leg.market_type,
    side: leg.side || "",
    user_line_value: leg.user_line_value?.toString() || "",
    user_odds: leg.user_odds?.toString() || "",
    sport: leg.sport || "",
  });

  const handleSave = async () => {
    await onSave({
      team_or_player: editData.team_or_player,
      opponent_or_context: editData.opponent_or_context || null,
      market_type: editData.market_type,
      side: editData.side || null,
      user_line_value: editData.user_line_value ? parseFloat(editData.user_line_value) : null,
      user_odds: editData.user_odds ? parseFloat(editData.user_odds) : null,
      sport: editData.sport || null,
      is_needs_review: 0,
    });
    onToggleEdit();
  };

  const needsReview = leg.is_needs_review === 1;
  // Confidence score is 0-100 from the enhanced parser
  const confidenceScore = leg.confidence_score ?? 100;
  const lowConfidence = confidenceScore < 70;
  const veryLowConfidence = confidenceScore < 50;

  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200",
      needsReview 
        ? "border-amber-500/50 bg-amber-500/5" 
        : veryLowConfidence
        ? "border-red-500/30 bg-red-500/5"
        : lowConfidence
        ? "border-yellow-500/30 bg-yellow-500/5"
        : "border-slate-700 bg-slate-800/50",
      isEditing && "ring-2 ring-blue-500/50"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
            needsReview ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-slate-300"
          )}>
            {index + 1}
          </div>
          <div>
            <span className="text-sm text-slate-400">{leg.sport || "Sport"}</span>
            {leg.league && <span className="text-sm text-slate-500 ml-2">• {leg.league}</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Confidence score indicator */}
          {confidenceScore < 100 && (
            <span className={cn(
              "px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1",
              veryLowConfidence 
                ? "bg-red-500/20 text-red-400"
                : lowConfidence 
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-slate-700/50 text-slate-400"
            )}>
              {veryLowConfidence && <AlertCircle className="w-3 h-3" />}
              {Math.round(confidenceScore)}% conf
            </span>
          )}
          {needsReview && (
            <span className="px-2 py-1 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Review
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleEdit}
            className="text-slate-400 hover:text-slate-200"
          >
            {isEditing ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isEditing ? (
          <div className="space-y-4">
            {/* Team/Player */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Team / Player</label>
                <Input
                  value={editData.team_or_player}
                  onChange={(e) => setEditData({ ...editData, team_or_player: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Opponent / Context</label>
                <Input
                  value={editData.opponent_or_context}
                  onChange={(e) => setEditData({ ...editData, opponent_or_context: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                  placeholder="vs. Team Name"
                />
              </div>
            </div>

            {/* Sport & Market */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Sport</label>
                <select
                  value={editData.sport}
                  onChange={(e) => setEditData({ ...editData, sport: e.target.value })}
                  className="w-full h-10 px-3 rounded-md bg-slate-900/50 border border-slate-600 text-slate-200 text-sm"
                >
                  <option value="">Select Sport</option>
                  {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Market Type</label>
                <select
                  value={editData.market_type}
                  onChange={(e) => setEditData({ ...editData, market_type: e.target.value })}
                  className="w-full h-10 px-3 rounded-md bg-slate-900/50 border border-slate-600 text-slate-200 text-sm"
                >
                  {MARKET_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Side & Line */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Side</label>
                <Input
                  value={editData.side}
                  onChange={(e) => setEditData({ ...editData, side: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                  placeholder="Over / Under / etc"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Line Value</label>
                <Input
                  type="number"
                  step="0.5"
                  value={editData.user_line_value}
                  onChange={(e) => setEditData({ ...editData, user_line_value: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                  placeholder="-3.5"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Odds</label>
                <Input
                  type="number"
                  value={editData.user_odds}
                  onChange={(e) => setEditData({ ...editData, user_odds: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                  placeholder="-110"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={isSaving}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Leg
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Main bet display */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-100">{leg.team_or_player}</p>
                {leg.opponent_or_context && (
                  <p className="text-sm text-slate-400">{leg.opponent_or_context}</p>
                )}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <span className="px-2 py-1 text-xs font-medium bg-slate-700 text-slate-300 rounded">
                    {leg.market_type}
                  </span>
                </div>
              </div>
            </div>

            {/* Line & Odds */}
            <div className="flex items-center gap-6 pt-2 border-t border-slate-700/50">
              {leg.side && (
                <div>
                  <span className="text-xs text-slate-500 block">Side</span>
                  <span className="text-sm font-medium text-slate-200">{leg.side}</span>
                </div>
              )}
              {leg.user_line_value !== null && (
                <div>
                  <span className="text-xs text-slate-500 block">Line</span>
                  <span className="text-sm font-medium text-blue-400">
                    {leg.user_line_value > 0 ? `+${leg.user_line_value}` : leg.user_line_value}
                  </span>
                </div>
              )}
              {leg.user_odds !== null && (
                <div>
                  <span className="text-xs text-slate-500 block">Odds</span>
                  <span className="text-sm font-medium text-emerald-400">
                    {leg.user_odds > 0 ? `+${leg.user_odds}` : leg.user_odds}
                  </span>
                </div>
              )}
              {leg.event_id && (
                <div className="ml-auto">
                  <span className="text-xs text-slate-500 block">Matched</span>
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Game found
                  </span>
                </div>
              )}
            </div>

            {/* Raw text if available */}
            {leg.raw_text && (
              <div className="pt-2 border-t border-slate-700/50">
                <span className="text-xs text-slate-500 block mb-1">Original Text</span>
                <p className="text-xs text-slate-400 italic">"{leg.raw_text}"</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

function BetReviewPage() {
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId: string }>();
  const { user } = useDemoAuth();
  
  console.log("[BET REVIEW] Component render", { ticketId, userId: user?.id });
  
  const [ticket, setTicket] = useState<BetTicket | null>(null);
  const [legs, setLegs] = useState<BetLeg[]>([]);
  const [watchboardId, setWatchboardId] = useState<number | null>(null);
  const [parsingMetadata, setParsingMetadata] = useState<ParsingMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingLegId, setEditingLegId] = useState<number | null>(null);
  const [isSavingLeg, setIsSavingLeg] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showImage, setShowImage] = useState(true);
  const [showParsingNotes, setShowParsingNotes] = useState(false);
  
  // Ticket edit state
  const [isEditingTicket, setIsEditingTicket] = useState(false);
  const [ticketEdits, setTicketEdits] = useState({
    title: "",
    sportsbook: "",
    stake_amount: "",
    to_win_amount: "",
  });

  // Fetch ticket data
  const fetchTicket = useCallback(async () => {
    console.log("[BET REVIEW] fetchTicket called", { ticketId, userId: user?.id });
    if (!ticketId) {
      console.log("[BET REVIEW] No ticketId - showing error");
      setError("No ticket ID provided");
      setIsLoading(false);
      return;
    }
    if (!user?.id) {
      console.log("[BET REVIEW] Waiting for user auth...");
      // Don't set error yet - user might still be loading
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      console.log("[BET REVIEW] Fetching ticket", ticketId, "for user", user.id);
      const response = await fetch(`/api/bet-tickets/${ticketId}`, {
        headers: { "x-user-id": user.id.toString() },
      });
      console.log("[BET REVIEW] Response status:", response.status);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Ticket not found");
        }
        throw new Error("Failed to load ticket");
      }

      const data = await response.json();
      console.log("[BET REVIEW] Loaded ticket:", data.ticket?.id, "with", data.legs?.length, "legs");
      setTicket(data.ticket);
      setLegs(data.legs || []);
      setWatchboardId(data.watchboard_id);
      
      // Parse AI response metadata for parsing notes
      if (data.ticket.raw_ai_response) {
        try {
          const aiResponse = JSON.parse(data.ticket.raw_ai_response);
          setParsingMetadata({
            parsing_notes: aiResponse.parsing_notes || [],
            review_reasons: aiResponse.review_reasons || [],
            overall_confidence: aiResponse.overall_confidence || 0,
            sportsbook_confidence: aiResponse.sportsbook_confidence || 0,
          });
        } catch {
          // Ignore parsing errors for malformed AI response
          setParsingMetadata(null);
        }
      }
      
      // Initialize edit state
      setTicketEdits({
        title: data.ticket.title || "",
        sportsbook: data.ticket.sportsbook || "",
        stake_amount: data.ticket.stake_amount?.toString() || "",
        to_win_amount: data.ticket.to_win_amount?.toString() || "",
      });
    } catch (err) {
      console.error("[BET REVIEW] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    } finally {
      setIsLoading(false);
    }
  }, [ticketId, user]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  // Save ticket updates
  const saveTicketEdits = async () => {
    if (!ticket) return;

    try {
      const response = await fetch(`/api/bet-tickets/${ticket.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          ...(user?.id ? { "x-user-id": user.id.toString() } : {}),
        },
        body: JSON.stringify({
          title: ticketEdits.title || null,
          sportsbook: ticketEdits.sportsbook || null,
          stake_amount: ticketEdits.stake_amount ? parseFloat(ticketEdits.stake_amount) : null,
          to_win_amount: ticketEdits.to_win_amount ? parseFloat(ticketEdits.to_win_amount) : null,
        }),
      });

      if (!response.ok) throw new Error("Failed to save");

      setTicket({
        ...ticket,
        title: ticketEdits.title || null,
        sportsbook: ticketEdits.sportsbook || null,
        stake_amount: ticketEdits.stake_amount ? parseFloat(ticketEdits.stake_amount) : null,
        to_win_amount: ticketEdits.to_win_amount ? parseFloat(ticketEdits.to_win_amount) : null,
      });
      setIsEditingTicket(false);
    } catch (err) {
      setError("Failed to save ticket changes");
    }
  };

  // Save leg updates
  const saveLegUpdates = async (legId: number, updates: Partial<BetLeg>) => {
    setIsSavingLeg(true);
    try {
      const response = await fetch(`/api/bet-tickets/${ticketId}/legs/${legId}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          ...(user?.id ? { "x-user-id": user.id.toString() } : {}),
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error("Failed to save leg");

      // Update local state
      setLegs(legs.map(l => l.id === legId ? { ...l, ...updates } as BetLeg : l));
    } catch (err) {
      setError("Failed to save leg changes");
      throw err;
    } finally {
      setIsSavingLeg(false);
    }
  };

  // Delete leg
  const deleteLeg = async (legId: number) => {
    if (!confirm("Delete this leg from the ticket?")) return;
    
    try {
      const response = await fetch(`/api/bet-tickets/${ticketId}/legs/${legId}`, {
        method: "DELETE",
        headers: user?.id ? { "x-user-id": user.id.toString() } : {},
      });

      if (!response.ok) throw new Error("Failed to delete");

      setLegs(legs.filter(l => l.id !== legId));
      setEditingLegId(null);
    } catch (err) {
      setError("Failed to delete leg");
    }
  };

  // Confirm ticket
  const confirmTicket = async () => {
    if (!ticket) return;

    // Check for unreviewed legs
    const unreviewedLegs = legs.filter(l => l.is_needs_review === 1);
    if (unreviewedLegs.length > 0) {
      setError(`Please review ${unreviewedLegs.length} leg(s) marked for review before confirming`);
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      const response = await fetch(`/api/bet-tickets/${ticket.id}/confirm`, {
        method: "POST",
        headers: user?.id ? { "x-user-id": user.id.toString() } : {},
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to confirm ticket");
      }

      // Navigate to watchboard
      if (data.watchboard_id) {
        navigate(`/watchboard?board=${data.watchboard_id}`);
      } else {
        navigate("/watchboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm ticket");
      setIsConfirming(false);
    }
  };

  // Delete ticket
  const deleteTicket = async () => {
    if (!ticket) return;
    if (!confirm("Delete this entire ticket? This cannot be undone.")) return;

    try {
      const response = await fetch(`/api/bet-tickets/${ticket.id}`, {
        method: "DELETE",
        headers: user?.id ? { "x-user-id": user.id.toString() } : {},
      });

      if (!response.ok) throw new Error("Failed to delete");

      navigate("/bet/upload");
    } catch (err) {
      setError("Failed to delete ticket");
    }
  };

  // Count legs needing review
  const legsNeedingReview = legs.filter(l => l.is_needs_review === 1).length;

  if (isLoading || !user?.id) {
    return (
      <div className="min-h-screen">
        <CinematicBackground />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
            <p className="text-slate-400">{!user?.id ? "Authenticating..." : "Loading ticket..."}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="min-h-screen">
        <CinematicBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-slate-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-200 mb-2">Error Loading Ticket</h2>
            <p className="text-slate-400 mb-6">{error}</p>
            <Button onClick={() => navigate("/bet/upload")}>
              Upload New Screenshot
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="min-h-screen pb-48">
      <CinematicBackground />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          {ticket.status === "active" && watchboardId && (
            <Link
              to={`/watchboard?board=${watchboardId}`}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              View Watchboard →
            </Link>
          )}
        </div>

        {/* Title Section */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-emerald-400 mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Review Your Ticket</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-100">
            {ticket.title || `${ticket.ticket_type === "parlay" ? "Parlay" : "Single"} Ticket`}
          </h1>
          <p className="text-slate-400 mt-2">
            {ticket.source === "screenshot" ? "AI-parsed from screenshot" : "Manually entered"} • {legs.length} leg{legs.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/30">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Warning for legs needing review */}
        {legsNeedingReview > 0 && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-sm text-amber-300">
              {legsNeedingReview} leg{legsNeedingReview !== 1 ? "s" : ""} need{legsNeedingReview === 1 ? "s" : ""} review before confirming
            </p>
          </div>
        )}

        {/* Parsing Notes Panel - only show for screenshot uploads */}
        {ticket.source === "screenshot" && parsingMetadata && (
          <ParsingNotesPanel
            metadata={parsingMetadata}
            isExpanded={showParsingNotes}
            onToggle={() => setShowParsingNotes(!showParsingNotes)}
          />
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Image & Ticket Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Source Image */}
            {ticket.source_image_url && (
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <button
                  onClick={() => setShowImage(!showImage)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm text-slate-300">
                    <ImageIcon className="w-4 h-4" />
                    Original Screenshot
                  </span>
                  {showImage ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showImage && (
                  <div className="p-2 bg-slate-900/50">
                    <img
                      src={ticket.source_image_url}
                      alt="Bet slip"
                      className="w-full rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Ticket Info Card */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
                <span className="text-sm font-medium text-slate-300">Ticket Details</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingTicket(!isEditingTicket)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  {isEditingTicket ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                </Button>
              </div>

              <div className="p-4 space-y-4">
                {isEditingTicket ? (
                  <>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Title</label>
                      <Input
                        value={ticketEdits.title}
                        onChange={(e) => setTicketEdits({ ...ticketEdits, title: e.target.value })}
                        className="bg-slate-900/50 border-slate-600"
                        placeholder="My Parlay"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Sportsbook</label>
                      <select
                        value={ticketEdits.sportsbook}
                        onChange={(e) => setTicketEdits({ ...ticketEdits, sportsbook: e.target.value })}
                        className="w-full h-10 px-3 rounded-md bg-slate-900/50 border border-slate-600 text-slate-200 text-sm"
                      >
                        <option value="">Select Sportsbook</option>
                        {SPORTSBOOKS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Stake</label>
                        <Input
                          type="number"
                          value={ticketEdits.stake_amount}
                          onChange={(e) => setTicketEdits({ ...ticketEdits, stake_amount: e.target.value })}
                          className="bg-slate-900/50 border-slate-600"
                          placeholder="100"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">To Win</label>
                        <Input
                          type="number"
                          value={ticketEdits.to_win_amount}
                          onChange={(e) => setTicketEdits({ ...ticketEdits, to_win_amount: e.target.value })}
                          className="bg-slate-900/50 border-slate-600"
                          placeholder="250"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={saveTicketEdits}
                      className="w-full bg-emerald-600 hover:bg-emerald-500"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Details
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Sportsbook</span>
                        <span className="text-sm font-medium text-slate-200">{ticket.sportsbook || "Not specified"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                        <Target className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Type</span>
                        <span className="text-sm font-medium text-slate-200 capitalize">{ticket.ticket_type}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-700/50">
                      <div className="text-center">
                        <span className="text-xs text-slate-500 block">Stake</span>
                        <span className="text-lg font-bold text-slate-200">
                          {ticket.stake_amount ? `$${ticket.stake_amount.toFixed(2)}` : "—"}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-slate-500 block">To Win</span>
                        <span className="text-lg font-bold text-emerald-400">
                          {ticket.to_win_amount ? `$${ticket.to_win_amount.toFixed(2)}` : "—"}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Delete Ticket Button */}
            <Button
              variant="ghost"
              onClick={deleteTicket}
              className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Ticket
            </Button>
          </div>

          {/* Right Column - Legs */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-200">Selections ({legs.length})</h2>
            </div>

            {legs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
                <p className="text-slate-400">No selections found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {legs.map((leg, index) => (
                  <LegCard
                    key={leg.id}
                    leg={leg}
                    index={index}
                    isEditing={editingLegId === leg.id}
                    onToggleEdit={() => setEditingLegId(editingLegId === leg.id ? null : leg.id)}
                    onSave={(updates) => saveLegUpdates(leg.id, updates)}
                    onDelete={() => deleteLeg(leg.id)}
                    isSaving={isSavingLeg}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fixed Confirm Section with Name Input */}
        {ticket.status === "draft" && (
          <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
            <div className="max-w-4xl mx-auto space-y-3">
              {/* Ticket Name Input */}
              <div className="flex gap-3">
                <Input
                  value={ticketEdits.title}
                  onChange={(e) => setTicketEdits({ ...ticketEdits, title: e.target.value })}
                  placeholder="Name your ticket (e.g., Sunday NBA Parlay)"
                  className="flex-1 h-12 bg-slate-800/80 border-slate-600 text-slate-200 placeholder:text-slate-500"
                />
              </div>
              <Button
                onClick={async () => {
                  // Save title if changed, then confirm
                  if (ticketEdits.title !== (ticket.title || '')) {
                    await saveTicketEdits();
                  }
                  confirmTicket();
                }}
                disabled={isConfirming || legs.length === 0}
                className="w-full h-14 text-lg gap-3 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Confirm & Create Watchboard
                  </>
                )}
              </Button>
              {legsNeedingReview > 0 && (
                <p className="text-xs text-center text-amber-400 mt-2">
                  Review flagged legs before confirming
                </p>
              )}
            </div>
          </div>
        )}

        {/* Already Confirmed State */}
        {ticket.status !== "draft" && (
          <div className="mt-8 p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
            <Check className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-emerald-300">Ticket Confirmed</h3>
            <p className="text-slate-400 mt-1 mb-4">This ticket is active and being tracked</p>
            {watchboardId && (
              <Link to={`/watchboard?board=${watchboardId}`}>
                <Button className="bg-emerald-600 hover:bg-emerald-500">
                  View Watchboard
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BetReviewPage;
