import { useEffect, useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useLineMovementPolling } from "@/react-app/hooks/useLineMovementPolling";

/**
 * Provider component that manages line movement notification polling.
 * Should be placed high in the component tree but within auth context.
 * 
 * Automatically enables polling when:
 * - User is logged in
 * - Browser notifications are permitted
 * - User has push notifications enabled in their preferences
 */
export function LineMovementNotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useDemoAuth();
  const [pushEnabled, setPushEnabled] = useState(false);

  // Check if user has push enabled in their preferences
  useEffect(() => {
    if (!user) {
      setPushEnabled(false);
      return;
    }

    // Check notification permission first
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPushEnabled(false);
      return;
    }

    if (Notification.permission !== "granted") {
      setPushEnabled(false);
      return;
    }

    // Check server-side push status (deferred to not block initial render)
    const checkPushStatus = async () => {
      try {
        const res = await fetch("/api/push/status", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setPushEnabled(data.enabled && data.subscribed);
        }
      } catch {
        // Default to checking just local permission
        setPushEnabled(true);
      }
    };

    // Defer API call to not block initial paint
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => checkPushStatus(), { timeout: 2000 });
    } else {
      setTimeout(checkPushStatus, 100);
    }

    // Re-check periodically in case user enables/disables in settings
    const checkInterval = setInterval(checkPushStatus, 60000);

    return () => clearInterval(checkInterval);
  }, [user]);

  // Enable polling when user is logged in and has push enabled
  const shouldPoll = Boolean(user) && pushEnabled;
  
  useLineMovementPolling(shouldPoll);

  return <>{children}</>;
}
