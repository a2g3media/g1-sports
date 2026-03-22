import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface CoachGInlineTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  gameId?: string;
}

const INLINE_CHAT_STORAGE_KEY = "coachg-inline-conversations-v1";
const MAX_TURNS_PER_THREAD = 16;
const MAX_STORED_THREADS = 40;

interface GlobalAIContextValue {
  isSuperAdminContext: boolean;
  setIsSuperAdminContext: (value: boolean) => void;
  // First-session onboarding flow
  shouldAutoOpenScout: boolean;
  triggerAutoOpenScout: () => void;
  consumeAutoOpenScout: () => void;
  // Open chat with optional initial message
  openChat: (initialMessage?: string) => void;
  pendingMessage: string | null;
  consumePendingMessage: () => void;
  getInlineTurns: (threadKey: string) => CoachGInlineTurn[];
  appendInlineTurn: (threadKey: string, turn: CoachGInlineTurn) => void;
  clearInlineThread: (threadKey: string) => void;
}

const GlobalAIContext = createContext<GlobalAIContextValue>({
  isSuperAdminContext: false,
  setIsSuperAdminContext: () => {},
  shouldAutoOpenScout: false,
  triggerAutoOpenScout: () => {},
  consumeAutoOpenScout: () => {},
  openChat: () => {},
  pendingMessage: null,
  consumePendingMessage: () => {},
  getInlineTurns: () => [],
  appendInlineTurn: () => {},
  clearInlineThread: () => {},
});

export function useGlobalAI() {
  return useContext(GlobalAIContext);
}

export function GlobalAIProvider({ children }: { children: ReactNode }) {
  const [isSuperAdminContext, setIsSuperAdminContext] = useState(false);
  const [shouldAutoOpenScout, setShouldAutoOpenScout] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [inlineConversations, setInlineConversations] = useState<Record<string, CoachGInlineTurn[]>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(INLINE_CHAT_STORAGE_KEY) : null;
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, CoachGInlineTurn[]>;
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch {
      return {};
    }
  });

  const triggerAutoOpenScout = () => {
    setShouldAutoOpenScout(true);
  };

  const consumeAutoOpenScout = () => {
    setShouldAutoOpenScout(false);
  };

  const openChat = (initialMessage?: string) => {
    if (initialMessage) {
      setPendingMessage(initialMessage);
    }
    triggerAutoOpenScout();
  };

  const consumePendingMessage = () => {
    setPendingMessage(null);
  };

  const getInlineTurns = (threadKey: string): CoachGInlineTurn[] => inlineConversations[threadKey] || [];

  const appendInlineTurn = (threadKey: string, turn: CoachGInlineTurn) => {
    setInlineConversations((prev) => {
      const next = { ...prev };
      const existing = next[threadKey] || [];
      next[threadKey] = [...existing, turn].slice(-MAX_TURNS_PER_THREAD);

      const keys = Object.keys(next);
      if (keys.length > MAX_STORED_THREADS) {
        const oldestKey = keys
          .map((key) => ({ key, ts: next[key]?.[0]?.createdAt || 0 }))
          .sort((a, b) => a.ts - b.ts)[0]?.key;
        if (oldestKey) {
          delete next[oldestKey];
        }
      }
      return next;
    });
  };

  const clearInlineThread = (threadKey: string) => {
    setInlineConversations((prev) => {
      if (!prev[threadKey]) return prev;
      const next = { ...prev };
      delete next[threadKey];
      return next;
    });
  };

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(INLINE_CHAT_STORAGE_KEY, JSON.stringify(inlineConversations));
    } catch {
      // Ignore storage write errors.
    }
  }, [inlineConversations]);

  return (
    <GlobalAIContext.Provider
      value={{
        isSuperAdminContext,
        setIsSuperAdminContext,
        shouldAutoOpenScout,
        triggerAutoOpenScout,
        consumeAutoOpenScout,
        openChat,
        pendingMessage,
        consumePendingMessage,
        getInlineTurns,
        appendInlineTurn,
        clearInlineThread,
      }}
    >
      {children}
    </GlobalAIContext.Provider>
  );
}

// Hook to mark current route as super admin context
export function useSuperAdminAIContext(isSuperAdmin: boolean) {
  const { setIsSuperAdminContext } = useGlobalAI();
  
  // Update context when super admin status changes
  if (isSuperAdmin) {
    setIsSuperAdminContext(true);
  }
}
