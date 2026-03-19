import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@getmocha/users-service/react";
import { Loader2 } from "lucide-react";

export function AuthCallback() {
  const navigate = useNavigate();
  const { user, isPending, exchangeCodeForSessionToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isExchanging, setIsExchanging] = useState(false);
  const hasAttempted = useRef(false);

  useEffect(() => {
    // Wait for auth to finish loading
    if (isPending) return;

    // If already logged in, go to dashboard
    if (user) {
      navigate("/", { replace: true });
      return;
    }

    // Only attempt exchange once
    if (hasAttempted.current) return;
    
    // Check if code is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    
    console.log("AuthCallback: code present =", !!code, "URL =", window.location.href);
    
    if (!code) {
      setError("No authorization code received. Please try signing in again.");
      return;
    }

    hasAttempted.current = true;
    setIsExchanging(true);

    const doExchange = async () => {
      try {
        console.log("AuthCallback: Starting code exchange...");
        await exchangeCodeForSessionToken();
        console.log("AuthCallback: Exchange successful, navigating home");
        navigate("/", { replace: true });
      } catch (err: unknown) {
        console.error("AuthCallback: Exchange error:", err);
        
        // If Bad Request, the code was likely already used
        const message = err instanceof Error ? err.message : "";
        if (message.includes("Bad Request")) {
          setError(
            "The sign-in code has expired or was already used. Please try signing in again."
          );
        } else {
          setError(
            "Sign in failed. This may be caused by browser privacy settings blocking cookies in the preview iframe."
          );
        }
      } finally {
        setIsExchanging(false);
      }
    };

    doExchange();
  }, [isPending, user, exchangeCodeForSessionToken, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Sign In Issue</h2>
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
          
          <div className="space-y-3 pt-2">
            <div className="p-4 bg-muted/50 rounded-lg text-left">
              <p className="text-sm font-medium mb-2">Try this:</p>
              <p className="text-sm text-muted-foreground">
                Click the <strong>⋯</strong> menu above the preview and select <strong>"Open in new tab"</strong>, then sign in from there.
              </p>
            </div>
            
            <button 
              onClick={() => navigate("/login", { replace: true })}
              className="text-primary hover:underline text-sm inline-flex items-center gap-1"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">
          {isPending ? "Loading..." : isExchanging ? "Completing sign in..." : "Please wait..."}
        </p>
      </div>
    </div>
  );
}
