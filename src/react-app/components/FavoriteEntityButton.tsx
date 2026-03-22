import { useMemo, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { type FavoriteType, useFavorites } from "@/react-app/hooks/useFavorites";

interface FavoriteEntityButtonProps {
  type: FavoriteType;
  entityId: string;
  sport?: string;
  league?: string;
  metadata?: Record<string, unknown>;
  className?: string;
  label?: string;
  compact?: boolean;
}

export function FavoriteEntityButton({
  type,
  entityId,
  sport,
  league,
  metadata,
  className,
  label = "Favorite",
  compact = false,
}: FavoriteEntityButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [busy, setBusy] = useState(false);
  const active = useMemo(() => isFavorite(type, entityId), [entityId, isFavorite, type]);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await toggleFavorite({
            type,
            entity_id: entityId,
            sport,
            league,
            metadata,
          });
        } finally {
          setBusy(false);
        }
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all",
        "backdrop-blur-sm",
        compact && "h-8 w-8 justify-center rounded-full p-0",
        active
          ? "border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/20"
          : "border-white/15 bg-white/[0.03] text-white/80 hover:bg-white/[0.07] hover:text-white",
        busy && "opacity-70 cursor-wait",
        className
      )}
      aria-label={active ? "Remove favorite" : "Add favorite"}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Star className={cn("h-3.5 w-3.5", active && "fill-current")} />
      )}
      {!compact && <span>{active ? "Favorited" : label}</span>}
    </button>
  );
}

export default FavoriteEntityButton;
