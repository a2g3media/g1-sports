import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, ChevronRight, Sparkles, Database, Copy, Check, ExternalLink, AlertTriangle, Clock, Zap, Info, Share2 } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { 
  AI_PERSONAS, 
  type PersonaKey, 
  generateMessageId 
} from "@/shared/ai-personas";
import { 
  type ScoutResponse,
  type ScoutSource,
  type ScoutTable,
  formatAsOf
} from "@/shared/scout-schema";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useAdminMode } from "@/react-app/contexts/AdminModeContext";
import { useScoutPanelState } from "@/react-app/hooks/useLocalStorage";
import { cn } from "@/react-app/lib/utils";
import { useAICallOptimizer } from "@/react-app/lib/aiCallOptimizer";
import { trackAiCapHit } from "@/react-app/lib/paywallTracker";
import { useLocation, useNavigate } from "react-router-dom";
import { AnonymousGate } from "@/react-app/components/AnonymousGate";
import { ScoutSoftCapPrompt } from "@/react-app/components/ScoutSoftCapPrompt";
import { TrialOfferPrompt } from "@/react-app/components/TrialOfferPrompt";
import { CoachGWelcomeTooltip, FreeQuestionsBadge, FeatureHint } from "@/react-app/components/ScoutOnboardingHints";
import { useFirstSession } from "@/react-app/hooks/useFirstSession";

interface AIInteractionStats {
  hasUnlimitedAccess: boolean;
  todayCount: number;
  dailyLimit: number;
  hasReachedLimit: boolean;
  shouldShowTrialOffer: boolean;
  tier: string;
  remaining: number;
}

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  persona?: PersonaKey;
  sources?: ScoutSource[];
  toolsUsed?: string[];
  structured?: ScoutResponse;
}

// Persona visual configurations - clean, unified blue accent
const personaStyles: Record<PersonaKey, {
  gradient: string;
  glow: string;
  accent: string;
  avatarBg: string;
  panelBorder: string;
}> = {
  billy: {
    gradient: "from-blue-500/90 to-blue-600/90",
    glow: "",
    accent: "text-blue-500",
    avatarBg: "bg-blue-500",
    panelBorder: "border-border",
  },
  coach: {
    gradient: "from-blue-500/90 to-blue-600/90",
    glow: "",
    accent: "text-blue-500",
    avatarBg: "bg-blue-500",
    panelBorder: "border-border",
  },
  big_g: {
    gradient: "from-blue-500/90 to-blue-600/90",
    glow: "",
    accent: "text-blue-500",
    avatarBg: "bg-blue-500",
    panelBorder: "border-border",
  },
};

// Context hints based on current route
function getPageContext(pathname: string): string {
  if (pathname.startsWith("/pool/") || pathname.startsWith("/pools/")) return "pool";
  if (pathname.startsWith("/leagues/") && pathname.includes("/picks")) return "picks";
  if (pathname.startsWith("/leagues/") && pathname.includes("/standings")) return "standings";
  if (pathname.startsWith("/live")) return "live";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/odds")) return "odds";
  if (pathname.startsWith("/intel")) return "intel";
  if (pathname === "/") return "dashboard";
  return "general";
}

// Freshness indicator component
function FreshnessIndicator({ freshness }: { freshness: ScoutSource["dataFreshness"] }) {
  const config = {
    live: { icon: Zap, color: "text-green-500", label: "Live" },
    recent: { icon: Clock, color: "text-blue-500", label: "Recent" },
    stale: { icon: AlertTriangle, color: "text-amber-500", label: "Stale" },
    unknown: { icon: Info, color: "text-muted-foreground", label: "Unknown" },
  };
  
  const { icon: Icon, color, label } = config[freshness];
  
  return (
    <span className={cn("inline-flex items-center gap-0.5", color)} title={label}>
      <Icon className="w-2.5 h-2.5" />
    </span>
  );
}

// Structured table renderer
function StructuredTable({ table }: { table: ScoutTable }) {
  return (
    <div className="mt-3 rounded-lg border border-border/50 overflow-hidden bg-background/50">
      <div className="px-3 py-1.5 bg-muted/50 border-b border-border/50">
        <span className="text-xs font-medium text-foreground">{table.title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30">
              {table.columns.map((col) => (
                <th 
                  key={col.key} 
                  className={cn(
                    "px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap",
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {table.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-muted/20 transition-colors">
                {table.columns.map((col) => (
                  <td 
                    key={col.key}
                    className={cn(
                      "px-2 py-1.5 text-foreground whitespace-nowrap",
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                    )}
                  >
                    {row[col.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.footnote && (
        <div className="px-3 py-1.5 bg-muted/30 border-t border-border/30 text-[10px] text-muted-foreground italic">
          {table.footnote}
        </div>
      )}
    </div>
  );
}

// Key points renderer with styled bullets
function KeyPoints({ points }: { points: string[] }) {
  if (!points || points.length === 0) return null;
  
  return (
    <ul className="mt-2 space-y-1">
      {points.map((point, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
          <span className="text-foreground/90">{point}</span>
        </li>
      ))}
    </ul>
  );
}

// Recommended actions as clickable chips
function RecommendedActions({ 
  actions, 
  onNavigate 
}: { 
  actions: ScoutResponse["recommendedNextActions"]; 
  onNavigate: (route: string) => void;
}) {
  if (!actions || actions.length === 0) return null;
  
  return (
    <div className="mt-3 pt-2 border-t border-border/30">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">
        <ExternalLink className="w-3 h-3" />
        <span>Related</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action, idx) => (
          <button
            key={idx}
            onClick={() => onNavigate(action.route)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs text-primary transition-colors"
            title={action.description}
          >
            {action.label}
            <ChevronRight className="w-3 h-3" />
          </button>
        ))}
      </div>
    </div>
  );
}

// Compliance warning banner
function ComplianceNote({ note }: { note: string }) {
  return (
    <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700 dark:text-amber-400">{note}</p>
    </div>
  );
}

// Structured message content renderer
function StructuredContent({ 
  structured, 
  onNavigate 
}: { 
  structured: ScoutResponse; 
  onNavigate: (route: string) => void;
}) {
  return (
    <div className="space-y-1">
      {/* Answer summary */}
      <p className="text-sm text-foreground leading-relaxed">{structured.answerSummary}</p>
      
      {/* Compliance note (if present) */}
      {structured.complianceNote && (
        <ComplianceNote note={structured.complianceNote} />
      )}
      
      {/* Key points */}
      {structured.keyPoints && structured.keyPoints.length > 0 && (
        <KeyPoints points={structured.keyPoints} />
      )}
      
      {/* Tables */}
      {structured.tables && structured.tables.length > 0 && (
        <div className="space-y-2">
          {structured.tables.map((table, idx) => (
            <StructuredTable key={idx} table={table} />
          ))}
        </div>
      )}
      
      {/* Recommended actions */}
      {structured.recommendedNextActions && structured.recommendedNextActions.length > 0 && (
        <RecommendedActions 
          actions={structured.recommendedNextActions} 
          onNavigate={onNavigate} 
        />
      )}
    </div>
  );
}

// Sources display with freshness
function SourcesDisplay({ sources, asOf }: { sources: ScoutSource[]; asOf?: string }) {
  if (!sources || sources.length === 0) return null;
  
  return (
    <div className="mt-3 pt-2 border-t border-border/30">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Database className="w-3 h-3" />
          <span>Sources</span>
        </div>
        {asOf && (
          <span className="text-[10px] text-muted-foreground/70">
            {formatAsOf(asOf)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, idx) => (
          <span 
            key={idx} 
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-background/60 rounded text-[10px] text-muted-foreground"
            title={`Updated: ${new Date(source.lastUpdated).toLocaleString()}`}
          >
            <FreshnessIndicator freshness={source.dataFreshness} />
            {source.sourceName}
          </span>
        ))}
      </div>
    </div>
  );
}

interface FloatingAIAvatarProps {
  isSuperAdmin?: boolean;
  /** Force the drawer open (from deep link) */
  forceOpen?: boolean;
  /** Initial prompt to send when opened via deep link */
  initialPrompt?: string;
  /** Callback when user manually closes the drawer */
  onClose?: () => void;
  /** Auto-open after onboarding completion */
  autoOpenFromOnboarding?: boolean;
  /** Callback when auto-open is consumed */
  onAutoOpenConsumed?: () => void;
}

export function FloatingAIAvatar({ 
  isSuperAdmin = false, 
  forceOpen = false,
  initialPrompt,
  onClose,
  autoOpenFromOnboarding = false,
  onAutoOpenConsumed,
}: FloatingAIAvatarProps) {
  const { user } = useDemoAuth();
  const { isAdminMode } = useAdminMode();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine persona based on role
  const persona: PersonaKey = isSuperAdmin ? "big_g" : isAdminMode ? "coach" : "billy";
  const personaData = AI_PERSONAS[persona];
  const styles = personaStyles[persona];
  
  // Persist collapse state in localStorage (default = expanded/not collapsed)
  const [isCollapsed, setIsCollapsed] = useScoutPanelState();
  const [isExpanded, setIsExpanded] = useState(!isCollapsed);
  
  // First session tracking
  const firstSession = useFirstSession();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // AI call optimizer to prevent redundant calls
  const aiOptimizer = useAICallOptimizer({ debounceMs: 300, reuseInFlight: true });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Anonymous & soft cap states
  const [showAnonymousGate, setShowAnonymousGate] = useState(false);
  const [showSoftCapPrompt, setShowSoftCapPrompt] = useState(false);
  const [showTrialOffer, setShowTrialOffer] = useState(false);
  const [interactionStats, setInteractionStats] = useState<AIInteractionStats | null>(null);
  
  const pageContext = getPageContext(location.pathname);
  
  // Check if user is anonymous (no user = anonymous browsing)
  const isAnonymous = !user;
  
  // Fetch interaction stats when component mounts or user changes
  const fetchInteractionStats = useCallback(async () => {
    if (isAnonymous) return;
    
    try {
      const response = await fetch("/api/ai/interaction-stats", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setInteractionStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch interaction stats:", err);
    }
  }, [isAnonymous]);
  
  useEffect(() => {
    if (!isAnonymous && isExpanded) {
      fetchInteractionStats();
    }
  }, [isAnonymous, isExpanded, fetchInteractionStats]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isExpanded]);

  // Clear messages when persona changes
  useEffect(() => {
    setMessages([]);
  }, [persona]);

  // Handle deep link force open
  useEffect(() => {
    if (forceOpen && !isAnonymous && !isExpanded) {
      setIsExpanded(true);
      // If there's an initial prompt, send it after a short delay
      if (initialPrompt) {
        setTimeout(() => {
          setInputValue(initialPrompt);
        }, 300);
      }
    }
  }, [forceOpen, isAnonymous, isExpanded, initialPrompt]);
  
  // Handle auto-open after onboarding
  useEffect(() => {
    if (autoOpenFromOnboarding && !isAnonymous && !isExpanded) {
      setIsExpanded(true);
      setIsCollapsed(false);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenFromOnboarding, isAnonymous, isExpanded, setIsCollapsed, onAutoOpenConsumed]);

  const handleToggle = () => {
    // If anonymous user tries to open Scout, show login prompt
    if (isAnonymous) {
      setShowAnonymousGate(true);
      return;
    }
    if (isExpanded) {
      // User is closing - call onClose callback and persist collapsed state
      onClose?.();
      setIsCollapsed(true);
    } else {
      // User is opening - persist expanded state
      setIsCollapsed(false);
    }
    setIsExpanded(!isExpanded);
  };

  const handleNavigate = (route: string) => {
    navigate(route);
    setIsExpanded(false);
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    
    // Check soft cap for free tier users before sending
    if (interactionStats && !interactionStats.hasUnlimitedAccess && interactionStats.hasReachedLimit) {
      trackAiCapHit({ capType: "daily", screenName: location.pathname, fromTier: interactionStats.tier });
      setShowSoftCapPrompt(true);
      return;
    }

    const userMessage: AIMessage = {
      id: generateMessageId(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    
    // Track first question milestone
    if (!firstSession.hasAskedFirstQuestion) {
      firstSession.recordQuestionAsked();
    }

    try {
      // Track the interaction first
      const trackResponse = await fetch("/api/ai/track-interaction", {
        method: "POST",
        credentials: "include",
      });
      
      if (trackResponse.ok) {
        const trackData = await trackResponse.json();
        setInteractionStats(trackData);
        
        // Check if we should show trial offer (after 3 interactions)
        if (trackData.shouldShowTrialOffer && !showTrialOffer) {
          // Defer showing trial offer until after response
          setTimeout(() => setShowTrialOffer(true), 1500);
        }
        
        // If tracking says we've now hit the limit, show soft cap
        if (!trackData.allowed && !trackData.hasUnlimitedAccess) {
          trackAiCapHit({ capType: "daily", screenName: location.pathname, fromTier: trackData.tier || interactionStats?.tier });
          setShowSoftCapPrompt(true);
          setIsLoading(false);
          return;
        }
      }
      
      const chatPayload = {
          persona,
          message: userMessage.content,
          pageContext,
          conversationHistory: messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        };
      
      // Use optimizer to prevent duplicate/redundant calls
      const data = await aiOptimizer.call(async () => {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(chatPayload),
        });
        if (!response.ok) throw new Error("Failed to get response");
        return response.json();
      }, chatPayload);
      
      // Build sources array from response
      const sources: ScoutSource[] = data.sources || [];
      
      const assistantMessage: AIMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        persona,
        sources,
        toolsUsed: data.toolsUsed || [],
        structured: data.structured,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      
      // Track first response milestone
      if (!firstSession.hasReceivedFirstResponse) {
        firstSession.recordResponseReceived();
      }
    } catch {
      const fallbackMessages: Record<PersonaKey, string> = {
        billy: "Connection interrupted. Give me a moment and try again.",
        coach: "Signal lost. Stand by for reconnection.",
        big_g: "System sync interrupted. Retrying recommended.",
      };
      const errorMessage: AIMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: fallbackMessages[persona],
        timestamp: new Date(),
        persona,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareScoutTake = async (msg: AIMessage) => {
    if (!msg.structured?.answerSummary && !msg.content) return;
    setSharingId(msg.id);
    
    try {
      // Create the share on the backend
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          gameContext: null,
          scoutTake: msg.structured?.answerSummary || msg.content,
          confidence: null,
          persona,
          sportKey: null,
          teams: null,
        }),
      });
      
      if (!res.ok) throw new Error("Failed to create share");
      
      const { shareUrl } = await res.json();
      
      // Try native share API first, fall back to clipboard
      if (navigator.share) {
        await navigator.share({
          title: "Scout AI Take",
          text: msg.structured?.answerSummary || msg.content,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }
      
      setSharedId(msg.id);
      setTimeout(() => setSharedId(null), 2000);
    } catch (err) {
      // User cancelled share or error occurred
      if ((err as Error).name !== "AbortError") {
        console.error("Failed to share:", err);
      }
    } finally {
      setSharingId(null);
    }
  };

  // Get contextual quick actions based on page
  const getQuickActions = (): string[] => {
    const baseActions = personaData.suggestedQuestions.slice(0, 3);
    
    switch (pageContext) {
      case "pool":
        return persona === "coach" 
          ? ["Check pool rules", "Review eligibility", "Payment status"]
          : ["How do standings work?", "When do picks lock?", "View my history"];
      case "picks":
        return ["Explain lock times", "How does scoring work?", "Check my submissions"];
      case "live":
        return ["What games matter?", "Explain live impact", "Score updates"];
      case "admin":
        return ["Platform health", "User trends", "System alerts"];
      default:
        return baseActions;
    }
  };

  // Handle trial offer dismissal
  const handleDismissTrialOffer = async () => {
    setShowTrialOffer(false);
    try {
      await fetch("/api/ai/dismiss-trial-offer", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Failed to dismiss trial offer:", err);
    }
  };

  // Collapsed state - just the avatar (show for both anonymous and logged-in users)
  if (!isExpanded) {
    return (
      <>
        <div className="fixed bottom-6 right-6 z-50">
          {/* Welcome tooltip for first-time users */}
          {firstSession.shouldShowCoachGWelcome && !isAnonymous && (
            <CoachGWelcomeTooltip 
              onDismiss={() => firstSession.markCoachGWelcomeSeen()}
            />
          )}
          
          <button
            onClick={handleToggle}
            className={cn(
              "w-14 h-14 rounded-full",
              "flex items-center justify-center",
              "shadow-2xl transition-all duration-300",
              "hover:scale-110 hover:shadow-3xl",
              "group",
              styles.avatarBg,
              styles.glow
            )}
            aria-label={`Ask ${personaData.name}`}
          >
            <span className="text-2xl transition-transform group-hover:scale-110">
              {personaData.avatar}
            </span>
            {/* Subtle pulse indicator */}
            <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-white" style={{ animationDuration: "3s" }} />
          </button>
        </div>
        
        {/* Anonymous Gate Modal */}
        {showAnonymousGate && (
          <AnonymousGate
            feature="scout"
            onClose={() => setShowAnonymousGate(false)}
            variant="modal"
          >
            <></>
          </AnonymousGate>
        )}
      </>
    );
  }

  // Expanded state - conversation panel
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50",
      "w-[400px] max-w-[calc(100vw-48px)]",
      "animate-in slide-in-from-bottom-4 fade-in duration-200",
      "transition-all ease-out"
    )}>
      <div className={cn(
        "bg-card/95 backdrop-blur-xl border rounded-2xl shadow-2xl overflow-hidden",
        "flex flex-col max-h-[70vh]",
        styles.panelBorder
      )}>
        {/* Header - Premium, calm design */}
        <div className={cn(
          "bg-gradient-to-r p-4 text-white relative overflow-hidden",
          styles.gradient
        )}>
          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
          </div>
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-2xl shadow-lg">
                {personaData.avatar}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold tracking-tight">{personaData.name}</h3>
                  <Sparkles className="w-3.5 h-3.5 opacity-70" />
                </div>
                <p className="text-white/70 text-xs">{personaData.title}</p>
                {/* Free questions badge for free tier users */}
                {interactionStats && !interactionStats.hasUnlimitedAccess && (
                  <div className="mt-1.5">
                    <FreeQuestionsBadge 
                      questionsRemaining={Math.max(0, interactionStats.remaining)}
                      dailyLimit={interactionStats.dailyLimit}
                      className="bg-white/15 text-white/90"
                    />
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleToggle}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[400px] bg-background/50">
          {messages.length === 0 ? (
            <div className="text-center space-y-5 py-4">
              <div className={cn(
                "w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl",
                "bg-muted/50 shadow-inner"
              )}>
                {personaData.avatar}
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">{personaData.name}</p>
                <p className="text-muted-foreground text-sm px-4 leading-relaxed">
                  {persona === "billy" && "Sports context and pool guidance. Ask anything."}
                  {persona === "coach" && "Pool operations and rules enforcement. How can I assist?"}
                  {persona === "big_g" && "Platform oversight at your service."}
                </p>
              </div>
              
              {/* Quick actions */}
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground/70 uppercase tracking-wider font-medium">Quick Actions</p>
                <div className="flex flex-col gap-1.5 px-2">
                  {getQuickActions().map((q, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInputValue(q);
                        inputRef.current?.focus();
                      }}
                      className={cn(
                        "text-sm px-4 py-2 rounded-lg text-left transition-all",
                        "bg-muted/50 hover:bg-muted border border-transparent hover:border-border",
                        "flex items-center justify-between group"
                      )}
                    >
                      <span>{q}</span>
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground" 
                        : styles.avatarBg
                    )}
                  >
                    {msg.role === "user" ? (
                      <span className="text-xs font-semibold">
                        {user?.google_user_data?.given_name?.charAt(0) || "U"}
                      </span>
                    ) : (
                      <span className="text-sm">{personaData.avatar}</span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-md"
                        : "bg-muted border border-border/50 rounded-tl-md"
                    )}
                  >
                    {/* Render structured content for Scout or plain text */}
                    {msg.role === "assistant" && msg.structured ? (
                      <StructuredContent 
                        structured={msg.structured} 
                        onNavigate={handleNavigate}
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                    
                    {/* Sources display for assistant messages */}
                    {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                      <SourcesDisplay 
                        sources={msg.sources} 
                        asOf={msg.structured?.asOf}
                      />
                    )}
                    
                    {/* Copy button for assistant messages */}
                    {msg.role === "assistant" && (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          onClick={() => shareScoutTake(msg)}
                          disabled={sharingId === msg.id}
                          className="text-[10px] text-muted-foreground/70 hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          {sharedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-green-500" />
                              <span>Shared</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="w-3 h-3" />
                              <span>{sharingId === msg.id ? "Sharing..." : "Share"}</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => copyToClipboard(
                            msg.structured?.answerSummary || msg.content, 
                            msg.id
                          )}
                          className="text-[10px] text-muted-foreground/70 hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-green-500" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", styles.avatarBg)}>
                    <span className="text-sm">{personaData.avatar}</span>
                  </div>
                  <div className="bg-muted border border-border/50 rounded-2xl rounded-tl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              
              {/* Share hint for first-time users after first response */}
              {firstSession.shouldShowShareHint && messages.length > 0 && !isLoading && (
                <div className="flex justify-center pt-2">
                  <FeatureHint
                    type="share"
                    onDismiss={() => firstSession.markShareHintSeen()}
                  />
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area - Clean and minimal */}
        <div className="p-3 border-t border-border/50 bg-card/80">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Ask a question..."
              className={cn(
                "flex-1 bg-muted/50 rounded-xl px-4 py-2.5 text-sm",
                "outline-none focus:ring-2 focus:ring-primary/30 focus:bg-muted",
                "placeholder:text-muted-foreground/50 transition-all"
              )}
              disabled={isLoading}
            />
            <Button
              onClick={sendMessage}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
              className={cn("rounded-xl shrink-0", styles.avatarBg, "hover:opacity-90")}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
            AI provides informational assistance only
          </p>
        </div>
      </div>
      
      {/* Soft Cap Prompt for Free Tier */}
      <ScoutSoftCapPrompt
        open={showSoftCapPrompt}
        onClose={() => setShowSoftCapPrompt(false)}
        questionsUsed={interactionStats?.todayCount || 0}
        dailyLimit={interactionStats?.dailyLimit || 10}
      />
      
      {/* Trial Offer Prompt (after 3 interactions) */}
      <TrialOfferPrompt
        open={showTrialOffer}
        onClose={handleDismissTrialOffer}
        questionsAsked={interactionStats?.todayCount || 0}
      />
    </div>
  );
}
