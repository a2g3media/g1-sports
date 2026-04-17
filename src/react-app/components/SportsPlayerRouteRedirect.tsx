import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { buildPlayerRoute, canonicalPlayerIdQueryParam, normalizeSportKeyForRoute } from "@/react-app/lib/navigationRoutes";
import { resolvePlayerIdForNavigation } from "@/react-app/lib/resolvePlayerIdForNavigation";

/**
 * Legacy `/sports/:sportKey/player/:playerId` → canonical `/props/player/:sport/:playerId` (numeric id only).
 */
export default function SportsPlayerRouteRedirect() {
  const { sportKey, playerId } = useParams<{ sportKey: string; playerId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const sport = normalizeSportKeyForRoute(String(sportKey || ""));
    const raw = String(playerId || "").trim();
    if (!sport || !raw) {
      navigate("/props", { replace: true });
      return;
    }
    const decoded = decodeURIComponent(raw);
    const id =
      canonicalPlayerIdQueryParam(raw)
      ?? canonicalPlayerIdQueryParam(decoded)
      ?? resolvePlayerIdForNavigation(decoded, decoded, sport);
    if (id) {
      const hintedName = canonicalPlayerIdQueryParam(decoded) ? "" : decoded;
      const routeBase = buildPlayerRoute(sport, id);
      const route =
        hintedName
          ? `${routeBase}?playerName=${encodeURIComponent(hintedName)}`
          : routeBase;
      navigate(route, {
        replace: true,
        state: hintedName ? { playerNameHint: hintedName } : undefined,
      });
      return;
    }
    console.error("SPORTS_PLAYER_REDIRECT_MISSING_NUMERIC_ID", { sport, segment: decoded });
    navigate("/props", { replace: true });
  }, [sportKey, playerId, navigate]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
