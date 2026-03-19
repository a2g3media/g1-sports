import type { CoachGContextPackage } from "../types/context";

type NodeType = "game" | "team" | "player" | "market" | "injury" | "prop" | "news";

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: Record<string, unknown>;
}

interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  weight: number;
  reason: string;
}

export interface GraphInsight {
  id: string;
  summary: string;
  confidence: number;
  reasonCodes: string[];
}

export interface GameIntelligenceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  insights: GraphInsight[];
}

function makeNode(id: string, type: NodeType, label: string, data: Record<string, unknown> = {}): GraphNode {
  return { id, type, label, data };
}

function makeEdge(from: string, to: string, relation: string, weight: number, reason: string): GraphEdge {
  return { from, to, relation, weight, reason };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function buildGameIntelligenceGraph(context: CoachGContextPackage): GameIntelligenceGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const insights: GraphInsight[] = [];

  const game = context.gameContext;
  if (!game) {
    return { nodes, edges, insights };
  }

  const gameNodeId = `game:${game.gameId}`;
  const homeTeamNode = `team:${game.homeTeam}`;
  const awayTeamNode = `team:${game.awayTeam}`;
  const marketNode = `market:${game.gameId}`;

  nodes.push(makeNode(gameNodeId, "game", `${game.awayTeam} @ ${game.homeTeam}`, { sport: game.sport }));
  nodes.push(makeNode(homeTeamNode, "team", game.homeTeam));
  nodes.push(makeNode(awayTeamNode, "team", game.awayTeam));
  nodes.push(makeNode(marketNode, "market", `Market ${game.gameId}`));

  edges.push(makeEdge(homeTeamNode, gameNodeId, "participates_in", 1, "Home team in game"));
  edges.push(makeEdge(awayTeamNode, gameNodeId, "participates_in", 1, "Away team in game"));
  edges.push(makeEdge(marketNode, gameNodeId, "prices", 1, "Market pricing this game"));

  for (const injury of game.injuries) {
    const injuryNodeId = `injury:${injury.entityId}:${injury.name}`;
    nodes.push(makeNode(injuryNodeId, "injury", injury.name, { status: injury.status, impact: injury.impact }));
    edges.push(makeEdge(injuryNodeId, gameNodeId, "impacts_game", injury.impact === "high" ? 0.9 : 0.5, injury.status));
  }

  for (const prop of game.propLines.slice(0, 25)) {
    const propNodeId = `prop:${prop.player}:${prop.propType}`;
    const playerNodeId = `player:${prop.player}`;
    nodes.push(makeNode(playerNodeId, "player", prop.player));
    nodes.push(makeNode(propNodeId, "prop", `${prop.player} ${prop.propType}`, { line: prop.line }));
    edges.push(makeEdge(playerNodeId, propNodeId, "has_prop", 1, "Prop market listing"));
    edges.push(makeEdge(propNodeId, gameNodeId, "related_to_game", 0.8, "Game-linked player prop"));
  }

  const highImpactInjuries = game.injuries.filter((i) => i.impact === "high").length;
  if (highImpactInjuries > 0 && Math.abs(game.lineMovement) >= 0.75) {
    insights.push({
      id: `insight:injury_line:${game.gameId}`,
      summary: "High-impact injury context aligns with current line movement.",
      confidence: clamp(65 + highImpactInjuries * 8, 0, 95),
      reasonCodes: ["injury_line_correlation"],
    });
  }

  const movedProps = game.propLineMovement.filter((m) => Math.abs(m.movement) >= 0.75).length;
  if (movedProps > 0) {
    insights.push({
      id: `insight:prop_market:${game.gameId}`,
      summary: `${movedProps} prop markets show meaningful movement tied to this game context.`,
      confidence: clamp(58 + movedProps * 4, 0, 92),
      reasonCodes: ["prop_market_acceleration"],
    });
  }

  const splitGapHome = Math.abs((game.publicBettingPercentage.home ?? 50) - (game.moneyPercentage.home ?? 50));
  const splitGapAway = Math.abs((game.publicBettingPercentage.away ?? 50) - (game.moneyPercentage.away ?? 50));
  if (Math.max(splitGapHome, splitGapAway) >= 12) {
    insights.push({
      id: `insight:money_split:${game.gameId}`,
      summary: "Ticket-vs-money split indicates potential sharp/public divergence.",
      confidence: clamp(60 + Math.round(Math.max(splitGapHome, splitGapAway)), 0, 93),
      reasonCodes: ["public_money_divergence"],
    });
  }

  return { nodes, edges, insights };
}
