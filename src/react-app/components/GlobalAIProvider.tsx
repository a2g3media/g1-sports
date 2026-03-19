import { createContext, useContext, useState, ReactNode } from "react";

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
});

export function useGlobalAI() {
  return useContext(GlobalAIContext);
}

export function GlobalAIProvider({ children }: { children: ReactNode }) {
  const [isSuperAdminContext, setIsSuperAdminContext] = useState(false);
  const [shouldAutoOpenScout, setShouldAutoOpenScout] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

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
