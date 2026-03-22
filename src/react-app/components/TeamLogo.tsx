/**
 * CENTRALIZED TEAM LOGO COMPONENT
 * Single source of truth for team logos across the entire app.
 * Uses ESPN CDN with comprehensive team mappings.
 */

import { useState } from 'react';
import { getTeamOrCountryLogoUrl } from '@/react-app/lib/teamLogos';
import { getEspnTeamLogo } from '@/react-app/lib/espnSoccer';
import { cn } from '@/react-app/lib/utils';

// Fallback team icon when logo fails to load
function TeamFallback({ 
  teamCode, 
  size, 
  className 
}: { 
  teamCode: string; 
  size: number;
  className?: string;
}) {
  const initials = teamCode?.slice(0, 3).toUpperCase() || '???';
  const fontSize = size < 24 ? 'text-[8px]' : size < 40 ? 'text-xs' : 'text-sm';
  
  return (
    <div 
      className={cn(
        "flex items-center justify-center rounded-full bg-white/10 border border-white/20 font-bold text-white/60",
        fontSize,
        className
      )}
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

export interface TeamLogoProps {
  /** Team abbreviation (e.g., 'LAL', 'NYY', 'MAN') */
  teamCode: string;
  /** Optional full team name (used for soccer fallback lookup) */
  teamName?: string;
  /** Sport code: NBA, NFL, MLB, NHL, NCAAB, NCAAF, SOCCER */
  sport: string;
  /** Size in pixels (default: 40) */
  size?: number;
  /** Optional league for soccer (EPL, MLS, UCL) */
  league?: string | null;
  /** Additional CSS classes */
  className?: string;
  /** Show border ring around logo */
  showRing?: boolean;
  /** Custom ring color class (e.g., 'ring-amber-500') */
  ringColor?: string;
  /** Apply final winner glow treatment */
  winnerGlow?: boolean;
}

export function TeamLogo({
  teamCode,
  teamName,
  sport,
  size = 40,
  league,
  className,
  showRing = false,
  ringColor = 'ring-white/20',
  winnerGlow = false,
}: TeamLogoProps) {
  const [failed, setFailed] = useState(false);
  
  // Get logo URL (club logo or country flag for WBC/World Cup)
  const primaryLogoUrl = getTeamOrCountryLogoUrl(teamCode, sport, league);
  const isSoccer = String(sport || '').toUpperCase() === 'SOCCER';
  const soccerFallbackLogo = isSoccer
    ? (() => {
        const byName = getEspnTeamLogo(undefined, teamName || teamCode);
        return byName.includes('default-team-logo') ? null : byName;
      })()
    : null;
  const logoUrl = primaryLogoUrl || soccerFallbackLogo;
  
  // Show fallback if no URL or load failed
  if (!logoUrl || failed) {
    return (
      <TeamFallback 
        teamCode={teamCode} 
        size={size} 
        className={cn(
          className,
          winnerGlow && "ring-2 ring-emerald-300/90 shadow-[0_0_22px_rgba(16,185,129,0.85),0_0_42px_rgba(16,185,129,0.55)] scale-110"
        )}
      />
    );
  }
  
  return (
    <img
      src={logoUrl}
      alt={`${teamCode} logo`}
      className={cn(
        "object-contain transition-all duration-300 saturate-[1.06] contrast-[1.04] brightness-[1.01] [filter:drop-shadow(0_12px_21px_rgba(0,0,0,0.62))_drop-shadow(0_0_1px_rgba(255,255,255,0.72))]",
        showRing && `ring-2 ${ringColor} rounded-full`,
        winnerGlow && "ring-2 ring-emerald-300/90 rounded-full shadow-[0_0_22px_rgba(16,185,129,0.85),0_0_42px_rgba(16,185,129,0.55)] scale-110",
        className
      )}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

/**
 * Compact team logo for tight spaces (game tiles, lists)
 */
export function TeamLogoCompact({
  teamCode,
  sport,
  league,
  className,
}: Omit<TeamLogoProps, 'size' | 'showRing' | 'ringColor'>) {
  return (
    <TeamLogo
      teamCode={teamCode}
      sport={sport}
      league={league}
      size={24}
      className={className}
    />
  );
}

/**
 * Large team logo for hero sections and detail pages
 */
export function TeamLogoLarge({
  teamCode,
  sport,
  league,
  className,
  showRing = true,
}: Omit<TeamLogoProps, 'size'>) {
  return (
    <TeamLogo
      teamCode={teamCode}
      sport={sport}
      league={league}
      size={80}
      showRing={showRing}
      ringColor="ring-white/10"
      className={className}
    />
  );
}

export default TeamLogo;
