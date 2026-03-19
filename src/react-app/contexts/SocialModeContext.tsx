import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SocialModeContextType {
  isSocialMode: boolean;
  toggleSocialMode: () => void;
  setSocialMode: (enabled: boolean) => void;
}

const SocialModeContext = createContext<SocialModeContextType | undefined>(undefined);

export function SocialModeProvider({ children }: { children: ReactNode }) {
  const [isSocialMode, setIsSocialMode] = useState(() => {
    const stored = localStorage.getItem("poolvault-social-mode");
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("poolvault-social-mode", isSocialMode.toString());
  }, [isSocialMode]);

  const toggleSocialMode = () => setIsSocialMode(prev => !prev);
  const setSocialMode = (enabled: boolean) => setIsSocialMode(enabled);

  return (
    <SocialModeContext.Provider value={{ isSocialMode, toggleSocialMode, setSocialMode }}>
      {children}
    </SocialModeContext.Provider>
  );
}

export function useSocialMode() {
  const context = useContext(SocialModeContext);
  if (!context) {
    throw new Error("useSocialMode must be used within a SocialModeProvider");
  }
  return context;
}
