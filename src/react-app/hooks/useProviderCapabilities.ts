/**
 * useProviderCapabilities - Hook for checking data provider feature availability
 * 
 * Fetches and caches provider capabilities for UI gating decisions.
 * Components can check if features like props, alternates, futures are available
 * before attempting to fetch or display that data.
 */

import { useState, useEffect, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

export interface ProviderCapabilities {
  hasGames: boolean;
  hasOdds: boolean;
  hasProps: boolean;
  hasPropsPregame: boolean;
  hasPropsInPlay: boolean;
  hasPropMovement: boolean;
  propMovementLookbackDays: number;
  hasAlternateLines: boolean;
  hasFutures: boolean;
  hasDerivatives: boolean;
  hasLiveInGameLines: boolean;
  liveLineLatencyMs: number | null;
  supportedSports: string[];
  hasPlayerImages: boolean;
  hasTeamLogos: boolean;
  mediaLicenseConfirmed: boolean;
}

export interface ProviderFeatures {
  props: boolean;
  propMovement: boolean;
  alternateLines: boolean;
  futures: boolean;
  liveLines: boolean;
  playerImages: boolean;
  teamLogos: boolean;
}

export interface CapabilitiesResponse {
  provider: string;
  apiConfigured: boolean;
  capabilities: ProviderCapabilities;
  features: ProviderFeatures;
  supportedSports: string[];
}

// ============================================
// CACHE
// ============================================

// Cache capabilities for 10 minutes to reduce API calls
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedCapabilities: CapabilitiesResponse | null = null;
let cacheTimestamp: number = 0;

function isCacheValid(): boolean {
  return cachedCapabilities !== null && (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}

// ============================================
// HOOK
// ============================================

export function useProviderCapabilities() {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(
    isCacheValid() ? cachedCapabilities : null
  );
  const [loading, setLoading] = useState(!isCacheValid());
  const [error, setError] = useState<string | null>(null);

  const fetchCapabilities = useCallback(async (force: boolean = false) => {
    // Return cached data if valid and not forcing refresh
    if (!force && isCacheValid() && cachedCapabilities) {
      setCapabilities(cachedCapabilities);
      setLoading(false);
      return cachedCapabilities;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/sports-data/capabilities');
      
      if (!res.ok) {
        throw new Error(`Failed to fetch capabilities: ${res.status}`);
      }
      
      const data: CapabilitiesResponse = await res.json();
      
      // Update cache
      cachedCapabilities = data;
      cacheTimestamp = Date.now();
      
      setCapabilities(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[useProviderCapabilities] Error:', message);
      
      // Return default capabilities on error (conservative - most things disabled)
      const defaults: CapabilitiesResponse = {
        provider: 'unknown',
        apiConfigured: false,
        capabilities: {
          hasGames: true,
          hasOdds: true,
          hasProps: false,
          hasPropsPregame: false,
          hasPropsInPlay: false,
          hasPropMovement: false,
          propMovementLookbackDays: 0,
          hasAlternateLines: false,
          hasFutures: false,
          hasDerivatives: false,
          hasLiveInGameLines: false,
          liveLineLatencyMs: null,
          supportedSports: ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB'],
          hasPlayerImages: false,
          hasTeamLogos: false,
          mediaLicenseConfirmed: false,
        },
        features: {
          props: false,
          propMovement: false,
          alternateLines: false,
          futures: false,
          liveLines: false,
          playerImages: false,
          teamLogos: false,
        },
        supportedSports: ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB'],
      };
      
      return defaults;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchCapabilities();
  }, [fetchCapabilities]);

  // Quick access helpers
  const hasProps = capabilities?.features?.props ?? false;
  const hasPropMovement = capabilities?.features?.propMovement ?? false;
  const hasAlternateLines = capabilities?.features?.alternateLines ?? false;
  const hasFutures = capabilities?.features?.futures ?? false;
  const hasLiveLines = capabilities?.features?.liveLines ?? false;
  const hasPlayerImages = capabilities?.features?.playerImages ?? false;
  const hasTeamLogos = capabilities?.features?.teamLogos ?? false;

  const isSportSupported = useCallback((sport: string): boolean => {
    if (!capabilities?.supportedSports) return true; // Default to supported
    return capabilities.supportedSports.includes(sport.toUpperCase());
  }, [capabilities]);

  return {
    capabilities,
    loading,
    error,
    refresh: () => fetchCapabilities(true),
    
    // Quick access flags
    hasProps,
    hasPropMovement,
    hasAlternateLines,
    hasFutures,
    hasLiveLines,
    hasPlayerImages,
    hasTeamLogos,
    isSportSupported,
    
    // Full capabilities object for advanced use
    fullCapabilities: capabilities?.capabilities ?? null,
  };
}

export default useProviderCapabilities;
