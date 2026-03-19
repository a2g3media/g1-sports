/**
 * SharePage - Public landing page for shared Scout takes
 * Deep link destination with CTA to join the app
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ROUTES } from "@/react-app/config/routes";
import { Sparkles, ArrowRight, Loader2, AlertCircle, Share2, Eye, ExternalLink } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { ShareableScoutCard } from "@/react-app/components/ShareableScoutCard";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useDocumentMeta } from "@/react-app/hooks/useDocumentTitle";

interface SharedTakeData {
  shareId: string;
  gameContext: string | null;
  scoutTake: string;
  confidence: string | null;
  persona: string;
  sportKey: string | null;
  teams: string | null;
  viewCount: number;
  createdAt: string;
}

export function SharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { user } = useDemoAuth();
  const [take, setTake] = useState<SharedTakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dynamic SEO metadata for shared take
  const seoMeta = useMemo(() => {
    if (!take) return {};
    
    const teamsLabel = take.teams || "a game";
    const truncatedTake = take.scoutTake.length > 120 
      ? take.scoutTake.slice(0, 117) + "..." 
      : take.scoutTake;
    
    return {
      title: `Coach G's Take on ${teamsLabel}`,
      description: truncatedTake,
      ogTitle: `Coach G's Take on ${teamsLabel} | GZ Sports`,
      ogDescription: truncatedTake,
      ogUrl: `https://ecuvwnfybhffe.mocha.app/share/${shareId}`,
      keywords: `${take.sportKey || 'sports'} analysis, AI sports picks, Coach G AI, ${teamsLabel}`,
    };
  }, [take, shareId]);
  
  useDocumentMeta(seoMeta);

  useEffect(() => {
    if (!shareId) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    async function fetchShare() {
      try {
        const res = await fetch(`/api/shares/${shareId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("This shared take was not found or has expired.");
          } else {
            setError("Failed to load shared take");
          }
          return;
        }
        const data = await res.json();
        setTake(data);
      } catch (err) {
        console.error("Error fetching share:", err);
        setError("Failed to load shared take");
      } finally {
        setLoading(false);
      }
    }

    fetchShare();
  }, [shareId]);

  // Track conversion if user signs up
  useEffect(() => {
    if (user && shareId) {
      fetch(`/api/shares/${shareId}/conversion`, { method: "POST" }).catch(() => {});
    }
  }, [user, shareId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading Coach G insight...</p>
        </div>
      </div>
    );
  }

  if (error || !take) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Share Not Found</h1>
            <p className="text-muted-foreground">{error || "This shared take could not be loaded."}</p>
          </div>
          <Link to={ROUTES.HOME}>
            <Button>
              Go to GZ Sports
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to={ROUTES.HOME} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg">GZ Sports</span>
          </Link>
          
          {!user ? (
            <Link to={ROUTES.LOGIN}>
              <Button size="sm" className="gap-2">
                <Sparkles className="w-4 h-4" />
                Get Started
              </Button>
            </Link>
          ) : (
            <Link to={ROUTES.HOME}>
              <Button size="sm" variant="outline" className="gap-2">
                Open App
                <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-4xl mx-auto px-4 py-12">
        <div className="flex flex-col items-center gap-8">
          {/* Badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Share2 className="w-4 h-4" />
            Shared Coach G Insight
          </div>

          {/* The Card */}
          <ShareableScoutCard
            gameContext={take.gameContext}
            scoutTake={take.scoutTake}
            confidence={take.confidence}
            persona={take.persona}
            sportKey={take.sportKey}
            teams={take.teams}
            createdAt={take.createdAt}
            viewCount={take.viewCount}
          />

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              {take.viewCount + 1} {take.viewCount === 0 ? "view" : "views"}
            </span>
          </div>

          {/* CTA Section */}
          {!user && (
            <div className="w-full max-w-md text-center space-y-4 mt-8 p-6 rounded-2xl bg-card border border-border/50">
              <h2 className="text-lg font-semibold">Want More AI Sports Insights?</h2>
              <p className="text-muted-foreground text-sm">
                Get personalized predictions, real-time alerts, and expert analysis from Coach G AI.
              </p>
              <Link to={ROUTES.LOGIN} className="block">
                <Button size="lg" className="w-full gap-2">
                  <Sparkles className="w-5 h-5" />
                  Sign Up Free
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                No credit card required • 10 free AI questions daily
              </p>
            </div>
          )}

          {user && (
            <div className="w-full max-w-md text-center space-y-4 mt-8 p-6 rounded-2xl bg-card border border-border/50">
              <h2 className="text-lg font-semibold">Explore More</h2>
              <p className="text-muted-foreground text-sm">
                Ask Coach G your own questions and get personalized sports insights.
              </p>
              <Link to={ROUTES.HOME} className="block">
                <Button size="lg" variant="outline" className="w-full gap-2">
                  Open GZ Sports
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/20 mt-16">
        <div className="container max-w-4xl mx-auto px-4 py-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold">GZ Sports</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            AI-powered sports intelligence for the modern fan
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link to={ROUTES.PRIVACY} className="hover:text-foreground transition-colors">Privacy</Link>
            <span>•</span>
            <Link to={ROUTES.TERMS} className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default SharePage;
