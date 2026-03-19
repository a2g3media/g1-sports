import { useEffect, useCallback, useRef } from "react";

interface ScheduledNotification {
  id: number;
  league_id: number;
  notification_type: string;
  title: string;
  body: string;
  url: string;
  scheduled_for: string;
}

export function useDeadlineNotifications() {
  const checkIntervalRef = useRef<number | null>(null);
  const shownNotificationsRef = useRef<Set<number>>(new Set());

  const showNotification = useCallback(async (notification: ScheduledNotification) => {
    // Don't show the same notification twice
    if (shownNotificationsRef.current.has(notification.id)) {
      return;
    }
    shownNotificationsRef.current.add(notification.id);

    // Check if we have permission
    if (Notification.permission !== "granted") {
      return;
    }

    // Show the notification
    const notif = new Notification(notification.title, {
      body: notification.body,
      icon: "https://019c35cd-bc59-7336-8464-048ca4acc6ad.mochausercontent.com/icons-icon-192x192.png",
      badge: "https://019c35cd-bc59-7336-8464-048ca4acc6ad.mochausercontent.com/icons-icon-72x72.png",
      tag: `poolvault-${notification.notification_type}-${notification.league_id}`,
      requireInteraction: notification.notification_type === "deadline_alert",
      data: {
        url: notification.url,
        notificationId: notification.id,
      },
    });

    // Handle click
    notif.onclick = () => {
      window.focus();
      if (notification.url) {
        window.location.href = notification.url;
      }
      notif.close();
    };

    // Mark as sent on the server
    try {
      await fetch(`/api/notifications/${notification.id}/sent`, { method: "PATCH" });
    } catch (err) {
      console.error("Failed to mark notification as sent:", err);
    }
  }, []);

  const checkPendingNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/pending");
      if (!res.ok) return;
      
      const notifications: ScheduledNotification[] = await res.json();
      
      for (const notification of notifications) {
        await showNotification(notification);
      }
    } catch {
      // Silently fail - user might not be logged in
    }
  }, [showNotification]);

  const scheduleDeadlineNotifications = useCallback(async () => {
    try {
      await fetch("/api/notifications/schedule-deadlines", { method: "POST" });
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    // Only run if notifications are supported and permitted
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    // Schedule notifications on mount
    scheduleDeadlineNotifications();

    // Check for pending notifications immediately
    checkPendingNotifications();

    // Check every 30 seconds
    checkIntervalRef.current = window.setInterval(() => {
      checkPendingNotifications();
    }, 30000);

    // Re-schedule notifications every 5 minutes to catch new leagues/events
    const scheduleInterval = window.setInterval(() => {
      scheduleDeadlineNotifications();
    }, 5 * 60 * 1000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      clearInterval(scheduleInterval);
    };
  }, [checkPendingNotifications, scheduleDeadlineNotifications]);

  return {
    checkPendingNotifications,
    scheduleDeadlineNotifications,
  };
}
