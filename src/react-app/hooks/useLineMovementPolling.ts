import { useEffect, useCallback, useRef } from "react";
import { showAlertNotification } from "./usePushNotifications";

interface PendingNotification {
  title: string;
  body: string;
  type: string;
  url?: string;
  severity?: string;
}

/**
 * Hook that polls for pending line movement push notifications
 * and displays them using the browser notification API.
 * 
 * This serves as a fallback for when true web-push isn't available,
 * allowing users to still receive alerts while the app is open.
 */
export function useLineMovementPolling(enabled: boolean = true) {
  const pollIntervalRef = useRef<number | null>(null);
  const isPollingRef = useRef(false);

  const pollForNotifications = useCallback(async () => {
    // Prevent overlapping polls
    if (isPollingRef.current) return;
    
    // Check if we have notification permission
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    isPollingRef.current = true;

    try {
      const res = await fetch("/api/push/pending", {
        credentials: "include",
      });

      if (!res.ok) {
        isPollingRef.current = false;
        return;
      }

      const data = await res.json();
      const notifications: PendingNotification[] = data.notifications || [];

      // Show each notification
      for (const notif of notifications) {
        // Map to the format expected by showAlertNotification
        await showAlertNotification({
          headline: notif.title.replace(/^[🚨📊ℹ️📣]\s*/, ""), // Strip emoji prefix if present
          body: notif.body,
          severity: notif.severity || (notif.title.includes("🚨") ? "CRITICAL" : "INFO"),
          item_type: notif.type,
          deep_link: notif.url,
        });
      }
    } catch {
      // Silently fail - user might not be logged in or network issue
    } finally {
      isPollingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Clear any existing interval when disabled
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Only poll if notifications are supported and permitted
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    // Poll immediately on mount
    pollForNotifications();

    // Then poll every 30 seconds
    pollIntervalRef.current = window.setInterval(() => {
      pollForNotifications();
    }, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enabled, pollForNotifications]);

  return {
    pollNow: pollForNotifications,
  };
}
