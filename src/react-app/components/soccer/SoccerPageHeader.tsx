/**
 * SoccerPageHeader - Reusable Header with Breadcrumb Navigation
 * 
 * Used on all soccer subpages:
 * - /soccer/league/:leagueId
 * - /soccer/team/:teamId
 * - /soccer/match/:matchId
 * - /soccer/player/:playerId
 * 
 * NOT used on the main Soccer Command Center (/sports/soccer)
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import SoccerSearchDrawer from "./SoccerSearchDrawer";
import { getSoccerLeagueMeta } from "@/react-app/lib/soccerLeagueMeta";

// ============================================================================
// TYPES
// ============================================================================

export interface BreadcrumbItem {
  label: string;
  href?: string; // If undefined, this is the current page (not clickable)
}

export interface SoccerPageHeaderProps {
  /** Array of breadcrumb items. Last item should have no href (current page). */
  breadcrumbs: BreadcrumbItem[];
  /** Large page title */
  title: string;
  /** Optional subtitle (e.g., competition + date for match, league position for team) */
  subtitle?: string;
  /** Back navigation handler - called when back button is clicked */
  onBack?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SoccerPageHeader({
  breadcrumbs,
  title,
  subtitle,
  onBack,
}: SoccerPageHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Always start with "Soccer" linking to the hub
  const fullBreadcrumbs: BreadcrumbItem[] = [
    { label: "Soccer", href: "/sports/soccer" },
    ...breadcrumbs,
  ];

  return (
    <>
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
          {/* Top Row: Back button + Breadcrumbs + Search */}
          <div className="flex items-center gap-2 mb-2">
          {/* Back Button - always visible on mobile, optional on desktop */}
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center justify-center w-8 h-8 -ml-1 rounded-lg 
                         bg-white/5 hover:bg-white/10 active:bg-white/15
                         transition-colors touch-manipulation"
              aria-label="Go back"
            >
              <ChevronLeft className="w-5 h-5 text-white/70" />
            </button>
          )}
          
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0 flex-1">
            {fullBreadcrumbs.map((item, index) => {
              const isLast = index === fullBreadcrumbs.length - 1;
              
              return (
                <span key={index} className="flex items-center gap-1.5 min-w-0">
                  {index > 0 && (
                    <ChevronRight className="w-3 h-3 text-white/30 flex-shrink-0" />
                  )}
                  {item.href && !isLast ? (
                    <Link
                      to={item.href}
                      className="text-white/50 hover:text-white transition-colors truncate max-w-[100px] sm:max-w-[180px]"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-white/70 truncate max-w-[120px] sm:max-w-[220px]">
                      {item.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
          
          {/* Search Button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-lg 
                     bg-white/5 hover:bg-white/10 active:bg-white/15
                     transition-colors touch-manipulation flex-shrink-0"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Title Section */}
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-white/50 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </header>
    
    {/* Search Drawer */}
    <SoccerSearchDrawer 
      isOpen={isSearchOpen} 
      onClose={() => setIsSearchOpen(false)} 
    />
    </>
  );
}

// ============================================================================
// HELPER FUNCTIONS FOR BUILDING BREADCRUMBS
// ============================================================================

/**
 * Build breadcrumbs for a team page
 */
export function buildTeamBreadcrumbs(
  teamName: string,
  leagueInfo?: { id: string; name: string } | { id: string } // Can pass just id, name will be looked up
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [];
  
  if (leagueInfo) {
    const leagueName = 'name' in leagueInfo ? leagueInfo.name : getSoccerLeagueMeta(leagueInfo.id).name;
    crumbs.push({
      label: leagueName,
      href: `/sports/soccer/league/${leagueInfo.id}`,
    });
  }
  
  crumbs.push({ label: teamName }); // Current page - no href
  
  return crumbs;
}

/**
 * Build breadcrumbs for a match page
 */
export function buildMatchBreadcrumbs(
  homeTeam: string,
  awayTeam: string,
  leagueInfo?: { id: string; name: string },
  teamInfo?: { id: string; name: string },
  fromLeagueId?: string | null,
  fromTeamId?: string | null
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [];
  
  if (leagueInfo) {
    crumbs.push({
      label: leagueInfo.name,
      href: `/sports/soccer/league/${leagueInfo.id}`,
    });
  } else if (fromLeagueId) {
    const leagueMeta = getSoccerLeagueMeta(fromLeagueId);
    crumbs.push({
      label: leagueMeta.name,
      href: `/sports/soccer/league/${fromLeagueId}`,
    });
  }
  
  if (teamInfo) {
    crumbs.push({
      label: teamInfo.name,
      href: `/sports/soccer/team/${teamInfo.id}`,
    });
  } else if (fromTeamId && !leagueInfo) {
    crumbs.push({
      label: 'Team',
      href: `/sports/soccer/team/${fromTeamId}`,
    });
  }
  
  crumbs.push({ label: `${homeTeam} vs ${awayTeam}` });
  
  return crumbs;
}

/**
 * Build breadcrumbs for a league page
 */
export function buildLeagueBreadcrumbs(leagueName: string): BreadcrumbItem[] {
  return [{ label: leagueName }]; // Current page
}

/**
 * Build breadcrumbs for a player page
 */
export function buildPlayerBreadcrumbs(
  playerName: string,
  teamInfo?: { id: string; name: string }
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [];
  
  if (teamInfo) {
    crumbs.push({
      label: teamInfo.name,
      href: `/sports/soccer/team/${teamInfo.id}`,
    });
  }
  
  crumbs.push({ label: playerName }); // Current page
  
  return crumbs;
}
