import {
  buildContextPackage,
  getGameContext,
  getMarketContext,
  getPlayerContext,
  getTeamContext,
  getUserContext,
} from "./sportsDataLayer";
import type {
  CoachGContextPackage,
  GameContext,
  MarketContext,
  PlayerContext,
  TeamContext,
  UserContext,
} from "../types/context";

type Db = D1Database;

export type CoachGGameContext = GameContext;
export type CoachGTeamContext = TeamContext;
export type CoachGPlayerContext = PlayerContext;
export type CoachGMarketContext = MarketContext;
export type CoachGUserContext = UserContext;

export async function buildGameContext(db: Db, env: Env, gameId: string): Promise<CoachGGameContext | null> {
  return getGameContext(db, env, gameId);
}

export async function buildUserContext(db: Db, userId: string | null): Promise<CoachGUserContext> {
  return getUserContext(db, userId);
}

export async function buildTeamAndPlayerContexts(gameContext: CoachGGameContext): Promise<{
  team_context: CoachGTeamContext[];
  player_context: CoachGPlayerContext[];
  market_context: CoachGMarketContext;
}> {
  const [team_context, player_context, market_context] = await Promise.all([
    getTeamContext(gameContext),
    getPlayerContext(gameContext),
    getMarketContext(gameContext),
  ]);

  return { team_context, player_context, market_context };
}

export async function buildCoachGContextPackage(params: {
  db: Db;
  env: Env;
  userId: string | null;
  gameId?: string;
  query?: string;
}): Promise<CoachGContextPackage> {
  return buildContextPackage(params);
}
