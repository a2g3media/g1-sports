import { useState, useEffect, useCallback, useRef } from "react";

export type PushPermissionState = "prompt" | "granted" | "denied" | "unsupported";

interface UsePushNotificationsReturn {
  permission: PushPermissionState;
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  requestPermission: () => Promise<boolean>;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  sendTestNotification: (type?: "line_movement" | "deadline" | "general") => Promise<boolean>;
}

// Convert VAPID public key from base64 to Uint8Array for push subscription
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<PushPermissionState>("prompt");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const vapidKeyRef = useRef<string | null>(null);

  const isSupported = typeof window !== "undefined" 
    && "Notification" in window 
    && "serviceWorker" in navigator
    && "PushManager" in window;

  // Check current permission and subscription status
  useEffect(() => {
    const checkStatus = async () => {
      if (!isSupported) {
        setPermission("unsupported");
        setIsLoading(false);
        return;
      }

      // Check notification permission
      const notifPermission = Notification.permission;
      setPermission(notifPermission as PushPermissionState);

      if (notifPermission === "granted") {
        // Check if we have an active subscription
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(Boolean(subscription));
        } catch {
          setIsSubscribed(false);
        }
      }

      setIsLoading(false);
    };

    checkStatus();
  }, [isSupported]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      return result === "granted";
    } catch {
      return false;
    }
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      // First ensure permission
      if (Notification.permission !== "granted") {
        const granted = await requestPermission();
        if (!granted) {
          setIsLoading(false);
          return false;
        }
      }

      // Fetch VAPID public key from server if we don't have it
      if (!vapidKeyRef.current) {
        try {
          const res = await fetch("/api/push/vapid-public-key");
          if (res.ok) {
            const data = await res.json();
            vapidKeyRef.current = data.vapidPublicKey;
          }
        } catch (err) {
          console.log("VAPID key not available, using local notifications only");
        }
      }

      // Register service worker if not already
      const registration = await navigator.serviceWorker.ready;

      // Create push subscription
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription && vapidKeyRef.current) {
        // Subscribe with server's VAPID key for real push notifications
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKeyRef.current),
          });
        } catch (err) {
          console.log("Push subscription failed, using local notifications:", err);
        }
      }

      // Send subscription to server if we have one
      if (subscription) {
        const subscriptionJson = subscription.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            endpoint: subscriptionJson.endpoint,
            keys: subscriptionJson.keys,
          }),
        });
      }

      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error("Failed to subscribe:", err);
      // Even if server registration fails, enable local notifications
      if (Notification.permission === "granted") {
        setIsSubscribed(true);
        setIsLoading(false);
        return true;
      }
      setIsLoading(false);
      return false;
    }
  }, [isSupported, requestPermission]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove from server
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });
      }

      setIsSubscribed(false);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
      setIsLoading(false);
      return false;
    }
  }, [isSupported]);

  const sendTestNotification = useCallback(async (
    type: "line_movement" | "deadline" | "general" = "line_movement"
  ): Promise<boolean> => {
    if (!isSupported || Notification.permission !== "granted") return false;

    const notifications: Record<string, { title: string; body: string; icon?: string }> = {
      line_movement: {
        title: "📊 Line Movement Alert",
        body: "Chiefs -3.5 → -4.5 vs Raiders. Spread moved 1 point toward KC.",
        icon: "/icons/icon-192x192.png",
      },
      deadline: {
        title: "⏰ Picks Deadline",
        body: "Week 12 picks lock in 15 minutes! Don't forget to submit.",
        icon: "/icons/icon-192x192.png",
      },
      general: {
        title: "🏈 POOLVAULT Update",
        body: "This is a test notification from POOLVAULT.",
        icon: "/icons/icon-192x192.png",
      },
    };

    const notif = notifications[type];

    try {
      // Use the service worker to show the notification
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(notif.title, {
        body: notif.body,
        icon: notif.icon,
        badge: "/icons/icon-72x72.png",
        tag: `test-${type}`,
        vibrate: [200, 100, 200],
        data: {
          url: type === "line_movement" ? "/watchlist" : "/",
          type,
        },
      } as NotificationOptions & { vibrate?: number[]; data?: unknown });
      return true;
    } catch {
      // Fallback to regular notification
      new Notification(notif.title, {
        body: notif.body,
        icon: notif.icon,
      });
      return true;
    }
  }, [isSupported]);

  return {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}

// Helper to trigger a local notification for an alert
export async function showAlertNotification(alert: {
  headline: string;
  body?: string;
  severity: string;
  item_type: string;
  deep_link?: string;
}): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const icons: Record<string, string> = {
    CRITICAL: "🚨",
    IMPACT: "📊",
    INFO: "ℹ️",
  };

  const icon = icons[alert.severity] || "📣";

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(`${icon} ${alert.headline}`, {
      body: alert.body || undefined,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      tag: `alert-${Date.now()}`,
      vibrate: alert.severity === "CRITICAL" ? [200, 100, 200, 100, 200] : [200, 100, 200],
      requireInteraction: alert.severity === "CRITICAL",
      data: {
        url: alert.deep_link || "/alerts",
        type: "line_movement",
      },
    } as NotificationOptions & { vibrate?: number[]; data?: unknown });
  } catch {
    // Fallback
    new Notification(`${icon} ${alert.headline}`, {
      body: alert.body || undefined,
      icon: "/icons/icon-192x192.png",
    });
  }
}
