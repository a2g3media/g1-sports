import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { MessageSquare, Shield } from "lucide-react";
import { useSocialMode } from "@/react-app/contexts/SocialModeContext";

interface SocialModeToggleProps {
  variant?: "button" | "badge" | "compact";
}

export function SocialModeToggle({ variant = "button" }: SocialModeToggleProps) {
  const { isSocialMode, toggleSocialMode } = useSocialMode();

  if (variant === "badge") {
    return (
      <Badge 
        variant={isSocialMode ? "default" : "outline"}
        className="cursor-pointer select-none"
        onClick={toggleSocialMode}
      >
        {isSocialMode ? (
          <>
            <MessageSquare className="h-3 w-3 mr-1" />
            Social
          </>
        ) : (
          <>
            <Shield className="h-3 w-3 mr-1" />
            System
          </>
        )}
      </Badge>
    );
  }

  if (variant === "compact") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleSocialMode}
        className="h-8 px-2 gap-1.5"
      >
        {isSocialMode ? (
          <>
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="text-xs">Social</span>
          </>
        ) : (
          <>
            <Shield className="h-3.5 w-3.5" />
            <span className="text-xs">System</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      variant={isSocialMode ? "default" : "outline"}
      size="sm"
      onClick={toggleSocialMode}
      className="gap-2"
    >
      {isSocialMode ? (
        <>
          <MessageSquare className="h-4 w-4" />
          Social Mode
        </>
      ) : (
        <>
          <Shield className="h-4 w-4" />
          System Mode
        </>
      )}
    </Button>
  );
}
