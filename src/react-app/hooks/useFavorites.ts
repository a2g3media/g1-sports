import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

export type FavoriteType = "team" | "player" | "game" | "market";

export interface FavoriteEntity {
  id: number;
  type: FavoriteType;
  entity_id: string;
  sport: string | null;
  league: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface FavoritesDashboard {
  teams: Array<Record<string, unknown> | FavoriteEntity>;
  players: Array<Record<string, unknown> | FavoriteEntity>;
  live_priority: Array<Record<string, unknown>>;
  counts: { total: number; teams: number; players: number; live: number };
}

const LOCAL_FAVORITES_KEY = "gz-local-favorites-v1";

export function useFavorites(type?: FavoriteType) {
  const { user } = useDemoAuth();
  const isAuthed = Boolean(user?.id);
  const [favorites, setFavorites] = useState<FavoriteEntity[]>([]);
  const [loading, setLoading] = useState(true);

  const userHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (user?.id) headers["x-user-id"] = String(user.id);
    return headers;
  }, [user?.id]);

  const loadLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(LOCAL_FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed as FavoriteEntity[];
    } catch {
      return [];
    }
  }, []);

  const saveLocal = useCallback((items: FavoriteEntity[]) => {
    try {
      localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(items));
    } catch {
      // no-op
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!isAuthed) {
        const local = loadLocal();
        setFavorites(type ? local.filter((f) => f.type === type) : local);
        return;
      }
      const query = type ? `?type=${type}` : "";
      const res = await fetch(`/api/favorites${query}`, { headers: userHeaders });
      if (!res.ok) return;
      const payload = await res.json();
      setFavorites(Array.isArray(payload.favorites) ? payload.favorites : []);
    } finally {
      setLoading(false);
    }
  }, [isAuthed, loadLocal, type, userHeaders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isFavorite = useCallback(
    (favoriteType: FavoriteType, entityId: string) =>
      favorites.some((f) => f.type === favoriteType && String(f.entity_id) === String(entityId)),
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (payload: {
      type: FavoriteType;
      entity_id: string;
      sport?: string;
      league?: string;
      metadata?: Record<string, unknown>;
    }): Promise<boolean> => {
      if (!isAuthed) {
        const local = loadLocal();
        const existingIdx = local.findIndex(
          (f) => f.type === payload.type && String(f.entity_id) === String(payload.entity_id)
        );
        if (existingIdx >= 0) {
          const next = [...local];
          next.splice(existingIdx, 1);
          saveLocal(next);
          setFavorites(type ? next.filter((f) => f.type === type) : next);
          return false;
        }
        const record: FavoriteEntity = {
          id: Date.now(),
          type: payload.type,
          entity_id: payload.entity_id,
          sport: payload.sport || null,
          league: payload.league || null,
          metadata: payload.metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const next = [record, ...local];
        saveLocal(next);
        setFavorites(type ? next.filter((f) => f.type === type) : next);
        return true;
      }

      const currentlyFavorite = isFavorite(payload.type, payload.entity_id);
      setFavorites((prev) => {
        if (currentlyFavorite) {
          return prev.filter((f) => !(f.type === payload.type && String(f.entity_id) === String(payload.entity_id)));
        }
        return [
          {
            id: Date.now(),
            type: payload.type,
            entity_id: payload.entity_id,
            sport: payload.sport || null,
            league: payload.league || null,
            metadata: payload.metadata || {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...prev,
        ];
      });

      try {
        const res = await fetch("/api/favorites/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...userHeaders },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          await refresh();
          return currentlyFavorite;
        }
        const data = await res.json();
        return Boolean(data.is_favorite);
      } catch {
        await refresh();
        return currentlyFavorite;
      }
    },
    [isAuthed, isFavorite, loadLocal, refresh, saveLocal, type, userHeaders]
  );

  const fetchDashboard = useCallback(async (): Promise<FavoritesDashboard | null> => {
    if (!isAuthed) {
      const local = loadLocal();
      return {
        teams: local.filter((f) => f.type === "team"),
        players: local.filter((f) => f.type === "player"),
        live_priority: [],
        counts: {
          total: local.length,
          teams: local.filter((f) => f.type === "team").length,
          players: local.filter((f) => f.type === "player").length,
          live: 0,
        },
      };
    }
    const res = await fetch("/api/favorites/dashboard", { headers: userHeaders });
    if (!res.ok) return null;
    return (await res.json()) as FavoritesDashboard;
  }, [isAuthed, loadLocal, userHeaders]);

  return { favorites, loading, refresh, toggleFavorite, isFavorite, fetchDashboard };
}
