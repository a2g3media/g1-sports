import { useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Construction } from "lucide-react";

/**
 * Placeholder component for Pool Admin pages that are not yet implemented
 */
export function PoolAdminPlaceholder() {
  const location = useLocation();
  
  // Extract page name from path
  const pageName = location.pathname
    .split("/")
    .pop()
    ?.split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Page";

  return (
    <div className="p-6">
      <Card className="max-w-lg mx-auto mt-20">
        <CardHeader className="text-center">
          <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>{pageName}</CardTitle>
          <CardDescription>
            This page is coming soon. Pool admin features are being developed.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            Check back later for pool management tools.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
