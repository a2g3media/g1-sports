import { useState, useRef, useEffect } from "react";
import { X, Send, ChevronDown } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { 
  AI_PERSONAS, 
  type PersonaKey, 
  type AIMessage, 
  generateMessageId,
  getAvailablePersonas 
} from "@/shared/ai-personas";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useAdminMode } from "@/react-app/contexts/AdminModeContext";
import { useSuperAdmin } from "@/react-app/contexts/SuperAdminContext";
import { cn } from "@/react-app/lib/utils";
import { ScoutResponseRenderer } from "@/react-app/components/ScoutResponseRenderer";
import { detectIntent, generateActionButtons, type ActionButton } from "@/react-app/lib/coachGActionEngine";

interface AIAssistantProps {
  leagueId?: number;
  defaultPersona?: PersonaKey;
  isOpen?: boolean;
  onClose?: () => void;
}

// Color configurations for each persona
const personaColors: Record<PersonaKey, {
  bg: string;
  light: string;
  border: string;
  text: string;
  button: string;
  shadow: string;
}> = {
  billy: {
    bg: "from-emerald-500 to-teal-600",
    light: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-600 dark:text-emerald-400",
    button: "bg-emerald-500 hover:bg-emerald-600",
    shadow: "shadow-emerald-500/20",
  },
  coach: {
    bg: "from-amber-500 to-orange-600",
    light: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-600 dark:text-amber-400",
    button: "bg-amber-500 hover:bg-amber-600",
    shadow: "shadow-amber-500/20",
  },
  big_g: {
    bg: "from-blue-600 to-indigo-700",
    light: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-600 dark:text-blue-400",
    button: "bg-blue-600 hover:bg-blue-700",
    shadow: "shadow-blue-500/20",
  },
};

export function AIAssistant({ leagueId, defaultPersona, isOpen: controlledOpen, onClose }: AIAssistantProps) {
  // Determine user role for persona access
  const { user } = useDemoAuth();
  const { isAdminMode } = useAdminMode();
  const { isSuperAdmin } = useSuperAdmin();
  
  const userRole: "consumer" | "pool_admin" | "super_admin" = 
    isSuperAdmin ? "super_admin" : 
    isAdminMode ? "pool_admin" : 
    "consumer";
  
  // Get available personas for this user's role
  const availablePersonas = getAvailablePersonas(userRole);
  
  // Determine default persona based on role if not specified
  const getDefaultPersona = (): PersonaKey => {
    if (defaultPersona && availablePersonas.some(p => p.key === defaultPersona)) {
      return defaultPersona;
    }
    // Default to role-appropriate persona
    if (isSuperAdmin) return "big_g";
    if (isAdminMode) return "coach";
    return "billy";
  };
  
  const [isOpen, setIsOpen] = useState(controlledOpen ?? false);
  const [selectedPersona, setSelectedPersona] = useState<PersonaKey>(getDefaultPersona());
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPersonaSelect, setShowPersonaSelect] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const persona = AI_PERSONAS[selectedPersona];
  const colors = personaColors[selectedPersona];

  // Sync with controlled open state
  useEffect(() => {
    if (controlledOpen !== undefined) {
      setIsOpen(controlledOpen);
    }
  }, [controlledOpen]);

  // Update persona when role changes
  useEffect(() => {
    const newDefault = getDefaultPersona();
    if (!availablePersonas.some(p => p.key === selectedPersona)) {
      setSelectedPersona(newDefault);
      setMessages([]); // Clear conversation when switching
    }
  }, [userRole]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  const switchPersona = (newPersona: PersonaKey) => {
    if (newPersona !== selectedPersona) {
      setSelectedPersona(newPersona);
      setMessages([]); // Clear conversation when switching
    }
    setShowPersonaSelect(false);
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: AIMessage = {
      id: generateMessageId(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          persona: selectedPersona,
          message: userMessage.content,
          leagueId,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      const assistantMessage: AIMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        persona: selectedPersona,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("AI chat error:", error);
      // Generate a contextual fallback response based on persona
      const fallbackResponses: Record<PersonaKey, string> = {
        billy: "Whoa, hit a snag there! 🏈 Try again in a sec - Scout's not going anywhere!",
        coach: "Technical timeout called. Let's try that again - good commissioners don't give up easily.",
        big_g: "System hiccup detected. Retry recommended. Platform resilience is key.",
      };
      const errorMessage: AIMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: fallbackResponses[selectedPersona],
        timestamp: new Date(),
        persona: selectedPersona,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInputValue(question);
    inputRef.current?.focus();
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3",
          "bg-gradient-to-r shadow-lg",
          "hover:scale-105 transition-all duration-200",
          "text-white font-medium",
          colors.bg,
          colors.shadow
        )}
      >
        <span className="text-xl">{persona.avatar}</span>
        <span className="hidden sm:inline">Ask {persona.name}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] animate-in slide-in-from-bottom-4 duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[600px]">
        {/* Header */}
        <div className={cn("bg-gradient-to-r p-4 text-white", colors.bg)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl">
                {persona.avatar}
              </div>
              <div>
                <button
                  onClick={() => availablePersonas.length > 1 && setShowPersonaSelect(!showPersonaSelect)}
                  className={cn(
                    "flex items-center gap-1 font-semibold transition-opacity",
                    availablePersonas.length > 1 ? "hover:opacity-80 cursor-pointer" : "cursor-default"
                  )}
                >
                  {persona.name}
                  {availablePersonas.length > 1 && (
                    <ChevronDown className={cn("w-4 h-4 transition-transform", showPersonaSelect && "rotate-180")} />
                  )}
                </button>
                <p className="text-white/80 text-sm">{persona.title}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Persona Selector - Only show if multiple personas available */}
          {showPersonaSelect && availablePersonas.length > 1 && (
            <div className="mt-3 p-2 bg-white/10 backdrop-blur rounded-lg space-y-1">
              {availablePersonas.map((p) => (
                <button
                  key={p.key}
                  onClick={() => switchPersona(p.key)}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                    p.key === selectedPersona ? "bg-white/20" : "hover:bg-white/10"
                  )}
                >
                  <span className="text-xl">{p.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-white/70 truncate">{p.title}</p>
                  </div>
                  {p.key === selectedPersona && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[350px] bg-muted/30">
          {messages.length === 0 ? (
            <div className="text-center space-y-4">
              <div className={cn("w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl", colors.light)}>
                {persona.avatar}
              </div>
              <div>
                <p className="font-medium mb-1">{persona.name}</p>
                <p className="text-muted-foreground text-sm">{persona.description}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Try asking:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {persona.suggestedQuestions.slice(0, 3).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestedQuestion(q)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full border transition-colors",
                        colors.light,
                        colors.border,
                        colors.text,
                        "hover:opacity-80"
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                // For assistant messages, detect actions from the preceding user message
                let actionButtons: ActionButton[] = [];
                if (msg.role === "assistant" && index > 0) {
                  const prevMsg = messages[index - 1];
                  if (prevMsg?.role === "user") {
                    const detected = detectIntent(prevMsg.content);
                    actionButtons = generateActionButtons(msg.content, detected);
                  }
                }
                
                return (
                <div
                  key={msg.id}
                  className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      msg.role === "user" ? "bg-primary text-primary-foreground" : colors.light
                    )}
                  >
                    {msg.role === "user" ? (
                      <span className="text-xs font-medium">
                        {user?.google_user_data?.given_name?.charAt(0) || "You"}
                      </span>
                    ) : (
                      <span>{persona.avatar}</span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm text-sm"
                        : "bg-card border border-border rounded-tl-sm"
                    )}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <ScoutResponseRenderer 
                        content={msg.content} 
                        actions={actionButtons}
                      />
                    )}
                  </div>
                </div>
              )})}
              {isLoading && (
                <div className="flex gap-3">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", colors.light)}>
                    <span>{persona.avatar}</span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border bg-card">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder={`Ask ${persona.name}...`}
              className="flex-1 bg-muted rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isLoading}
            />
            <Button
              onClick={sendMessage}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
              className={cn("rounded-full shrink-0", colors.button)}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            {persona.name} provides suggestions only • All actions are yours
          </p>
        </div>
      </div>
    </div>
  );
}

// Standalone button to open the AI assistant - role-aware
export function AIAssistantButton({ onClick, persona: forcedPersona }: { onClick: () => void; persona?: PersonaKey }) {
  const { isAdminMode } = useAdminMode();
  const { isSuperAdmin } = useSuperAdmin();
  
  // Determine appropriate persona based on role
  const persona: PersonaKey = forcedPersona || (
    isSuperAdmin ? "big_g" : 
    isAdminMode ? "coach" : 
    "billy"
  );
  
  const p = AI_PERSONAS[persona];
  const colors = personaColors[persona];

  return (
    <Button
      onClick={onClick}
      variant="ghost"
      className={cn(
        "gap-2 bg-gradient-to-r text-white hover:text-white hover:opacity-90",
        colors.bg
      )}
    >
      <span className="text-lg">{p.avatar}</span>
      Ask {p.name}
    </Button>
  );
}
