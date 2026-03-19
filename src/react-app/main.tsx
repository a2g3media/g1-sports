import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/react-app/index.css";
import App from "@/react-app/App";
import { ErrorBoundary } from "@/react-app/components/ErrorBoundary";
import { FeatureFlagsProvider } from "@/react-app/hooks/useFeatureFlags";
import { OddsFormatProvider } from "@/react-app/hooks/useOddsFormat";

const isLocalDevHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

// Service Worker update handler - production only.
if ("serviceWorker" in navigator && !isLocalDevHost) {
  // Listen for messages from SW
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SW_UPDATED") {
      console.log("[SW] New version detected:", event.data.version);
      // Clear all caches and reload
      const reloadPage = () => location.reload();
      if (typeof caches !== "undefined") {
        caches.keys().then((names) => {
          return Promise.all(names.map((name) => caches.delete(name)));
        }).then(reloadPage);
      } else {
        reloadPage();
      }
    }
  });

  // Force SW update check on page load
  navigator.serviceWorker.ready.then((registration) => {
    registration.update().catch(() => {});
  });

  // Check for waiting SW and skip waiting
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    
    // Listen for new SW installing
    registration?.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      newWorker?.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // New SW installed, skip waiting and reload
          newWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// Remove initial loading screen once React is ready
const removeInitialLoader = () => {
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.3s ease-out';
    setTimeout(() => loader.remove(), 300);
  }
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <FeatureFlagsProvider>
          <OddsFormatProvider>
            <App />
          </OddsFormatProvider>
        </FeatureFlagsProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
);

// Hide loader after React renders
requestAnimationFrame(() => {
  requestAnimationFrame(removeInitialLoader);
});
