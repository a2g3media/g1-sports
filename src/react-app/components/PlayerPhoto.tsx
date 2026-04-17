/**
 * CENTRALIZED PLAYER PHOTO COMPONENT
 * Single source of truth for player photos across the entire app.
 * Uses ESPN CDN for major sports with comprehensive ID mappings.
 */

import { useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import {
  addPlayerMapping as addPlayerMappingToLookup,
  getPlayerPhotoUrls as buildPlayerHeadshotUrls,
  hasEspnAthletePhotoMapping,
} from "@/shared/espnAthleteIdLookup";

export { getPlayerPhotoUrls } from "@/shared/espnAthleteIdLookup";

function buildInitialsAvatarDataUri(name: string): string {
  const safe = (name || "Player").trim();
  const initials =
    safe
      .split(/\s+/)
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 3)
      .toUpperCase() || "P";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#e2e8f0" font-size="92" font-family="Arial, sans-serif" font-weight="700">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function PlayerSilhouette({
  size,
  highlight,
  className,
}: {
  size: number;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full",
        highlight
          ? "bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-500/50"
          : "bg-white/10 text-white/30",
        className
      )}
      style={{ width: size, height: size }}
    >
      <User className="w-1/2 h-1/2" />
    </div>
  );
}

export interface PlayerPhotoProps {
  playerName: string;
  playerId?: string | number | null;
  photoUrl?: string | null;
  sport?: string;
  size?: number;
  className?: string;
  highlight?: boolean;
  showRing?: boolean;
  ringColor?: string;
  shape?: "circle" | "rounded";
}

export function PlayerPhoto({
  playerName,
  playerId,
  photoUrl,
  sport = "nba",
  size = 48,
  className,
  highlight = false,
  showRing = false,
  ringColor = "ring-white/20",
  shape = "circle",
}: PlayerPhotoProps) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(false);

  const photoSize = size < 60 ? "small" : size > 100 ? "large" : "medium";
  const normalizedPlayerId = String(playerId ?? "").trim();
  const numericEspnPlayerId = useMemo(() => {
    const direct = normalizedPlayerId.match(/^\d{4,}$/)?.[0];
    if (direct) return direct;
    const extracted = normalizedPlayerId.match(/(\d{4,})/);
    return extracted?.[1] || "";
  }, [normalizedPlayerId]);
  const espnSportPath = (() => {
    const key = String(sport || "").trim().toLowerCase();
    if (key === "nba" || key === "ncaab") return "nba";
    if (key === "nfl" || key === "ncaaf") return "nfl";
    if (key === "mlb") return "mlb";
    if (key === "nhl") return "nhl";
    if (key === "soccer") return "soccer";
    if (key === "mma") return "mma";
    if (key === "golf") return "golf";
    return "";
  })();
  const directEspnUrls = useMemo(() => {
    if (!numericEspnPlayerId || !espnSportPath) return [] as string[];
    const sizeParam = size >= 96 ? "w=350&h=254" : size >= 60 ? "w=120&h=90" : "w=80&h=58";
    return [
      `https://a.espncdn.com/combiner/i?img=/i/headshots/${espnSportPath}/players/full/${encodeURIComponent(numericEspnPlayerId)}.png&${sizeParam}&cb=1`,
      `https://a.espncdn.com/i/headshots/${espnSportPath}/players/full/${encodeURIComponent(numericEspnPlayerId)}.png`,
    ];
  }, [espnSportPath, numericEspnPlayerId, size]);
  const photoUrls = buildPlayerHeadshotUrls(playerName, sport, photoSize);
  const explicitPhotoUrl = String(photoUrl || "").trim();
  const avatarUrl = useMemo(() => {
    return buildInitialsAvatarDataUri(playerName || "Player");
  }, [playerName]);
  const candidateUrls = useMemo(
    () => [explicitPhotoUrl, ...directEspnUrls, ...photoUrls, avatarUrl].filter((url): url is string => Boolean(url)),
    [explicitPhotoUrl, directEspnUrls, photoUrls, avatarUrl]
  );

  useEffect(() => {
    setAttemptIndex(0);
    setAllFailed(false);
  }, [photoUrl, playerId, playerName, sport, size]);

  if (candidateUrls.length === 0) {
    return <PlayerSilhouette size={size} highlight={highlight} className={className} />;
  }

  if (allFailed) {
    return <PlayerSilhouette size={size} highlight={highlight} className={className} />;
  }

  return (
    <img
      src={candidateUrls[Math.min(attemptIndex, candidateUrls.length - 1)]}
      alt={playerName}
      className={cn(
        "object-cover object-center",
        shape === "rounded" ? "rounded-xl" : "rounded-full",
        showRing && `ring-2 ${ringColor}`,
        highlight && "ring-2 ring-amber-500/30",
        className
      )}
      style={{ width: size, height: size }}
      onError={() => {
        setAttemptIndex((prev) => {
          const next = Math.min(prev + 1, candidateUrls.length - 1);
          if (next === prev) {
            setAllFailed(true);
          }
          return next;
        });
      }}
      loading="lazy"
    />
  );
}

export function PlayerPhotoCompact({
  playerName,
  sport,
  className,
  highlight,
}: Omit<PlayerPhotoProps, "size" | "showRing" | "ringColor">) {
  return (
    <PlayerPhoto
      playerName={playerName}
      sport={sport}
      size={32}
      className={className}
      highlight={highlight}
    />
  );
}

export function PlayerPhotoLarge({
  playerName,
  sport,
  className,
  highlight,
}: Omit<PlayerPhotoProps, "size">) {
  return (
    <PlayerPhoto
      playerName={playerName}
      sport={sport}
      size={120}
      showRing={true}
      className={className}
      highlight={highlight}
    />
  );
}

export function hasPlayerPhoto(playerName: string): boolean {
  return hasEspnAthletePhotoMapping(playerName);
}

export function addPlayerMapping(playerName: string, espnId: string): void {
  addPlayerMappingToLookup(playerName, espnId);
}

export default PlayerPhoto;
