/**
 * Favorite Sports Selector
 * 
 * Multi-select grid for choosing favorite sports.
 * Features location-based defaults and premium glow UI.
 */

import { useState, useEffect, useMemo } from "react";
import { Check, Trophy, MapPin } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";

// Comprehensive sport definitions
const SPORTS = [
  { key: 'nfl', name: 'NFL', emoji: '🏈', region: 'us', color: 'from-orange-500 to-orange-600', glow: 'shadow-orange-500/30' },
  { key: 'nba', name: 'NBA', emoji: '🏀', region: 'global', color: 'from-orange-400 to-red-500', glow: 'shadow-red-500/30' },
  { key: 'mlb', name: 'MLB', emoji: '⚾', region: 'us', color: 'from-red-500 to-blue-600', glow: 'shadow-red-500/30' },
  { key: 'nhl', name: 'NHL', emoji: '🏒', region: 'us', color: 'from-blue-500 to-slate-600', glow: 'shadow-blue-500/30' },
  { key: 'ncaaf', name: 'College Football', emoji: '🎓', region: 'us', color: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/30' },
  { key: 'ncaab', name: 'College Basketball', emoji: '🏟️', region: 'us', color: 'from-blue-400 to-amber-500', glow: 'shadow-blue-400/30' },
  { key: 'soccer', name: 'Soccer', emoji: '⚽', region: 'global', color: 'from-green-500 to-emerald-600', glow: 'shadow-green-500/30' },
  { key: 'tennis', name: 'Tennis', emoji: '🎾', region: 'global', color: 'from-lime-500 to-green-600', glow: 'shadow-lime-500/30' },
  { key: 'golf', name: 'Golf', emoji: '⛳', region: 'global', color: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/30' },
  { key: 'mma', name: 'MMA/UFC', emoji: '🥊', region: 'global', color: 'from-red-600 to-gray-800', glow: 'shadow-red-600/30' },
  { key: 'boxing', name: 'Boxing', emoji: '🥊', region: 'global', color: 'from-yellow-500 to-red-600', glow: 'shadow-yellow-500/30' },
  { key: 'f1', name: 'F1 Racing', emoji: '🏎️', region: 'global', color: 'from-red-500 to-black', glow: 'shadow-red-500/30' },
] as const;

export type SportKey = typeof SPORTS[number]['key'];

let lastFavoriteSportsFetchAttempt = 0;

// Regional defaults based on locale
const REGIONAL_DEFAULTS: Record<string, SportKey[]> = {
  // US & Canada
  'US': ['nfl', 'nba', 'mlb'],
  'CA': ['nhl', 'nba', 'mlb'],
  // Europe
  'GB': ['soccer', 'tennis', 'f1'],
  'DE': ['soccer', 'f1', 'tennis'],
  'ES': ['soccer', 'tennis', 'f1'],
  'FR': ['soccer', 'tennis', 'f1'],
  'IT': ['soccer', 'f1', 'tennis'],
  // Asia Pacific
  'JP': ['mlb', 'soccer', 'golf'],
  'KR': ['mlb', 'soccer', 'golf'],
  'AU': ['soccer', 'tennis', 'f1'],
  // Latin America
  'MX': ['soccer', 'mlb', 'boxing'],
  'BR': ['soccer', 'mma', 'f1'],
  // Default
  'default': ['nfl', 'nba', 'soccer'],
};

// Detect user's locale and return country code
export function detectUserRegion(): string {
  try {
    // Try to get from browser
    const locale = navigator.language || 'en-US';
    const parts = locale.split('-');
    if (parts.length > 1) {
      return parts[1].toUpperCase();
    }
    // Try timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes('America/')) return 'US';
    if (tz.includes('Europe/London')) return 'GB';
    if (tz.includes('Europe/Berlin') || tz.includes('Europe/Vienna')) return 'DE';
    if (tz.includes('Europe/Paris')) return 'FR';
    if (tz.includes('Europe/Rome')) return 'IT';
    if (tz.includes('Europe/Madrid')) return 'ES';
    if (tz.includes('Asia/Tokyo')) return 'JP';
    if (tz.includes('Asia/Seoul')) return 'KR';
    if (tz.includes('Australia/')) return 'AU';
  } catch {
    // Fallback
  }
  return 'US';
}

// Get default sports for a region
export function getRegionalDefaults(region: string): SportKey[] {
  return REGIONAL_DEFAULTS[region] || REGIONAL_DEFAULTS['default'];
}

// Get region display name
export function getRegionName(region: string): string {
  const names: Record<string, string> = {
    'US': 'United States',
    'CA': 'Canada',
    'GB': 'United Kingdom',
    'DE': 'Germany',
    'ES': 'Spain',
    'FR': 'France',
    'IT': 'Italy',
    'JP': 'Japan',
    'KR': 'South Korea',
    'AU': 'Australia',
    'MX': 'Mexico',
    'BR': 'Brazil',
  };
  return names[region] || 'Your Region';
}

interface FavoriteSportsSelectorProps {
  selectedSports: SportKey[];
  onChange: (sports: SportKey[]) => void;
  maxSelections?: number;
  showHeader?: boolean;
  showRegionalHint?: boolean;
  compact?: boolean;
  className?: string;
}

export function FavoriteSportsSelector({
  selectedSports,
  onChange,
  maxSelections = 12,
  showHeader = true,
  showRegionalHint = false,
  compact = false,
  className,
}: FavoriteSportsSelectorProps) {
  const region = useMemo(() => detectUserRegion(), []);
  const regionalDefaults = useMemo(() => getRegionalDefaults(region), [region]);
  
  const toggleSport = (sportKey: SportKey) => {
    if (selectedSports.includes(sportKey)) {
      onChange(selectedSports.filter((s) => s !== sportKey));
    } else if (selectedSports.length < maxSelections) {
      onChange([...selectedSports, sportKey]);
    }
  };

  const selectAll = () => {
    onChange(SPORTS.map((s) => s.key));
  };

  const clearAll = () => {
    onChange([]);
  };

  // Group sports: regional favorites first, then others
  const groupedSports = useMemo(() => {
    const regional = SPORTS.filter(s => regionalDefaults.includes(s.key));
    const others = SPORTS.filter(s => !regionalDefaults.includes(s.key));
    return { regional, others };
  }, [regionalDefaults]);

  return (
    <div className={cn("space-y-5", className)}>
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              Select your favorite sports
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="text-xs h-7"
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-xs h-7"
              disabled={selectedSports.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Regional hint */}
      {showRegionalHint && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <MapPin className="h-3 w-3" />
          <span>Popular in {getRegionName(region)}</span>
        </div>
      )}

      {/* Regional favorites section */}
      {showRegionalHint && groupedSports.regional.length > 0 && (
        <div className="space-y-2">
          <div className={cn(
            "grid gap-3",
            compact ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"
          )}>
            {groupedSports.regional.map((sport) => (
              <SportTile
                key={sport.key}
                sport={sport}
                isSelected={selectedSports.includes(sport.key)}
                onToggle={() => toggleSport(sport.key)}
                compact={compact}
                isRegionalFavorite
              />
            ))}
          </div>
        </div>
      )}

      {/* All other sports or full list */}
      <div className={cn(
        "grid gap-3",
        compact ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      )}>
        {(showRegionalHint ? groupedSports.others : SPORTS).map((sport) => (
          <SportTile
            key={sport.key}
            sport={sport}
            isSelected={selectedSports.includes(sport.key)}
            onToggle={() => toggleSport(sport.key)}
            compact={compact}
          />
        ))}
      </div>

      {/* Selection count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
        <span>
          {selectedSports.length} of {SPORTS.length} selected
        </span>
        {selectedSports.length === 0 && (
          <span className="text-amber-500 text-xs">
            Select at least one sport
          </span>
        )}
      </div>
    </div>
  );
}

interface SportTileProps {
  sport: typeof SPORTS[number];
  isSelected: boolean;
  onToggle: () => void;
  compact?: boolean;
  isRegionalFavorite?: boolean;
}

function SportTile({ sport, isSelected, onToggle, compact, isRegionalFavorite }: SportTileProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 transition-all duration-300",
        "hover:scale-[1.03] active:scale-[0.97] touch-manipulation",
        compact ? "p-3 gap-1" : "p-4",
        isSelected
          ? cn(
              "border-transparent bg-gradient-to-br",
              sport.color,
              "shadow-xl",
              sport.glow
            )
          : cn(
              "border-border/40 bg-card/50 hover:border-border hover:bg-card",
              isRegionalFavorite && "ring-1 ring-primary/20"
            )
      )}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/90 dark:bg-black/60 flex items-center justify-center shadow-sm">
          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        </div>
      )}

      {/* Sport emoji */}
      <span className={cn(
        "transition-transform duration-300",
        compact ? "text-2xl" : "text-3xl",
        isSelected && "scale-110 drop-shadow-lg"
      )}>
        {sport.emoji}
      </span>

      {/* Sport name */}
      <span className={cn(
        "font-medium transition-colors",
        compact ? "text-xs" : "text-sm",
        isSelected ? "text-white drop-shadow-sm" : "text-muted-foreground"
      )}>
        {sport.name}
      </span>
    </button>
  );
}

// Hook to manage favorite sports state
export function useFavoriteSports() {
  const [favoriteSports, setFavoriteSports] = useState<SportKey[]>([]);
  const [followedTeams, setFollowedTeams] = useState<string[]>([]);
  const [followedPlayers, setFollowedPlayers] = useState<string[]>([]);
  const [userLocale, setUserLocale] = useState<string>('US');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);

  // Fetch favorite sports on mount (deferred to not block initial render)
  useEffect(() => {
    const fetchFavorites = async () => {
      if (Date.now() - lastFavoriteSportsFetchAttempt < 10000) {
        setIsLoading(false);
        return;
      }
      lastFavoriteSportsFetchAttempt = Date.now();
      try {
        const res = await fetch('/api/user/favorite-sports', {
          credentials: 'include',
        });
        if (res.status === 401 || res.status === 403) {
          setIsLoading(false);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setFavoriteSports(data.sports || []);
          setFollowedTeams(data.followedTeams || []);
          setFollowedPlayers(data.followedPlayers || []);
          setUserLocale(data.locale || detectUserRegion());
          setHasCompletedOnboarding(data.hasCompletedOnboarding ?? true);
        }
      } catch (err) {
        console.error('Failed to fetch favorite sports:', err);
      } finally {
        setIsLoading(false);
      }
    };

    // Defer API call to not block initial paint
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => fetchFavorites(), { timeout: 2000 });
    } else {
      setTimeout(fetchFavorites, 100);
    }
  }, []);

  // Save favorite sports
  const saveFavorites = async (
    sports: SportKey[], 
    markOnboardingComplete = false,
    teams?: string[],
    players?: string[]
  ) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/user/favorite-sports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sports, 
          followedTeams: teams ?? followedTeams,
          followedPlayers: players ?? followedPlayers,
          locale: userLocale,
          markOnboardingComplete,
        }),
      });
      if (res.ok) {
        setFavoriteSports(sports);
        if (teams) setFollowedTeams(teams);
        if (players) setFollowedPlayers(players);
        if (markOnboardingComplete) {
          setHasCompletedOnboarding(true);
        }
        return true;
      }
    } catch (err) {
      console.error('Failed to save favorite sports:', err);
    } finally {
      setIsSaving(false);
    }
    return false;
  };

  return {
    favoriteSports,
    setFavoriteSports,
    followedTeams,
    setFollowedTeams,
    followedPlayers,
    setFollowedPlayers,
    userLocale,
    saveFavorites,
    isLoading,
    isSaving,
    hasCompletedOnboarding,
  };
}

// Export sports list for use elsewhere
export { SPORTS };
