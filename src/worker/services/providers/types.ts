/**
 * Sports Data Provider Types
 * 
 * Common types and interfaces for all sports data providers.
 */

import type { Game } from "../../../shared/types";

export type SportKey = "nfl" | "nba" | "mlb" | "nhl" | "ncaaf" | "ncaab" | "soccer" | "mma" | "golf" | "nascar";

export interface GameOdds {
  bookmaker: string;
  spread: string;
  total: string;
  moneylineAway: string;
  moneylineHome: string;
  updated: string;
}

export interface PlayerProp {
  player_name: string;
  team: string | null;
  prop_type: string;
  line_value: number;
  open_line_value: number | null;
  movement: number | null;
}

export interface GameStats {
  category: string;
  label: string;
  awayValue: string | number;
  homeValue: string | number;
}

export interface PlayByPlayEvent {
  id: string;
  timestamp: string;
  period: string;
  clock: string;
  description: string;
  team: "home" | "away" | "neutral";
  isScoring: boolean;
}

export interface Injury {
  player: string;
  team: "home" | "away";
  status: string;
  injury: string;
  updated: string;
}

export interface Weather {
  condition: string;
  temperature: number;
  wind: string;
  humidity: number;
}

export interface GameDetail {
  game: Game;
  stats: GameStats[];
  playByPlay: PlayByPlayEvent[];
  injuries: Injury[];
  weather: Weather | null;
  odds: GameOdds[];
  props?: PlayerProp[];
}

export interface ProviderResponse<T> {
  data: T;
  fromCache: boolean;
  cachedAt?: number;
  provider: string;
  error?: string;
}

/**
 * Sports Data Provider Interface
 * 
 * All providers must implement this interface.
 */
export interface SportsDataProvider {
  readonly name: string;
  readonly supportedSports: SportKey[];
  
  /**
   * Fetch games for a sport
   */
  fetchGames(
    sport: SportKey,
    options?: { date?: string; status?: Game["status"] }
  ): Promise<ProviderResponse<Game[]>>;
  
  /**
   * Fetch a single game by ID
   */
  fetchGame(gameId: string): Promise<ProviderResponse<GameDetail | null>>;
  
  /**
   * Check if the provider is available/configured
   */
  isAvailable(): boolean;
}

/**
 * Provider configuration stored in database/memory
 */
export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  apiKey?: string;
  baseUrl?: string;
}
