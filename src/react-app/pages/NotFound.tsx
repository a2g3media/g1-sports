import { Link } from "react-router-dom";
import { Home, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { useDocumentTitle } from "@/react-app/hooks/useDocumentTitle";

/**
 * 404 Not Found Page
 * Shown when users navigate to a route that doesn't exist
 */
export function NotFound() {
  useDocumentTitle("Page Not Found");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* 404 Visual */}
        <div className="space-y-2">
          <div className="text-8xl font-bold text-muted-foreground/20">404</div>
          <h1 className="text-2xl font-bold text-foreground">
            Page not found
          </h1>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default">
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/games">
              <Search className="h-4 w-4 mr-2" />
              View Scores
            </Link>
          </Button>
        </div>

        {/* Back navigation */}
        <button
          onClick={() => window.history.back()}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 mx-auto"
        >
          <ArrowLeft className="h-3 w-3" />
          Go back to previous page
        </button>
      </div>
    </div>
  );
}
