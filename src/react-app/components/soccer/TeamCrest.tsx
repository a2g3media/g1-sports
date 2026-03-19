/**
 * TeamCrest - Premium soccer team logo component with fallback
 * 
 * Features:
 * - Uses getSoccerTeamLogo helper for best available logo
 * - React state-based error handling (not CSS hidden)
 * - Premium initials badge fallback when logo fails
 * - Soft glow for separation from dark backgrounds
 */

import { useState } from "react";
import { getSoccerTeamLogo, getSoccerTeamInitials } from "@/react-app/lib/espnSoccer";

interface TeamCrestProps {
  teamId?: string | null;
  teamName: string;
  teamLogo?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  className?: string;
}

const SIZES = {
  sm: { container: "w-6 h-6", text: "text-[8px]" },
  md: { container: "w-10 h-10", text: "text-xs" },
  lg: { container: "w-14 h-14", text: "text-sm" },
  xl: { container: "w-20 h-20", text: "text-lg" },
  hero: { container: "w-16 h-16 sm:w-24 sm:h-24", text: "text-lg sm:text-2xl" },
};

export default function TeamCrest({ 
  teamId, 
  teamName, 
  teamLogo,
  size = "lg",
  className = "" 
}: TeamCrestProps) {
  const [imgFailed, setImgFailed] = useState(false);
  
  // Get logo URL using standardized helper
  const logoUrl = getSoccerTeamLogo({ 
    id: teamId, 
    name: teamName, 
    logo: teamLogo 
  });
  
  // Get initials for fallback
  const initials = getSoccerTeamInitials(teamName);
  
  // Determine if we should show the logo or fallback
  const showLogo = logoUrl && !imgFailed;
  const sizeConfig = SIZES[size];

  if (showLogo) {
    return (
      <div className={`relative flex-shrink-0 ${sizeConfig.container} ${className}`}>
        {/* Soft outer glow */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            filter: 'blur(8px)',
            background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
          }}
        />
        <img 
          src={logoUrl}
          alt={teamName}
          className="relative w-full h-full object-contain"
          style={{
            filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))',
          }}
          onError={() => setImgFailed(true)}
          loading="eager"
        />
      </div>
    );
  }

  // Premium initials badge fallback
  return (
    <div 
      className={`relative flex-shrink-0 rounded-full flex items-center justify-center border border-white/15 ${sizeConfig.container} ${className}`}
      style={{
        background: 'linear-gradient(145deg, rgba(30,35,32,0.95) 0%, rgba(18,22,20,0.98) 100%)',
        boxShadow: '0 0 12px rgba(16,185,129,0.08)',
      }}
    >
      <span className={`font-black tracking-tight text-white/60 ${sizeConfig.text}`}>
        {initials}
      </span>
    </div>
  );
}
