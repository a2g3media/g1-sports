export type IntelligenceEntityType =
  | "game"
  | "team"
  | "player"
  | "market"
  | "user_brief"
  | "watchboard"
  | "system";

export interface IntelligenceSourceRef {
  source: string;
  ref?: string;
  updatedAt?: string;
}

export interface IntelligenceAction {
  id: string;
  label: string;
  type: "navigate" | "add_to_watchboard" | "open_chat" | "view_details";
  payload?: Record<string, string | number | boolean | null>;
}

export interface IntelligenceUIModule {
  id: string;
  kind: string;
  title: string;
  priority: number;
  data: Record<string, unknown>;
}

export interface IntelligencePayload {
  id: string;
  entity_type: IntelligenceEntityType;
  entity_id: string;
  sport: string;
  title: string;
  summary: string;
  coachg_note: string;
  edge_score: number;
  sharp_signals: Array<{
    type: string;
    confidence: number;
    reason_codes: string[];
    summary: string;
    impact: "high" | "medium" | "low";
  }>;
  line_prediction: {
    current_line: number | null;
    projected_line: number | null;
    confidence: number;
    reason_codes: string[];
  };
  prop_edges: Array<{
    player: string;
    prop: string;
    line: number;
    projection: number;
    edge_score: number;
    confidence: number;
    reason_codes: string[];
  }>;
  context_factors: Array<{
    factor: string;
    weight: number;
    value: number;
    contribution: number;
    reason: string;
  }>;
  alerts: string[];
  source_refs: IntelligenceSourceRef[];
  confidence: number;
  generated_at: string;
  expires_at: string;
  ui_modules: IntelligenceUIModule[];
  actions: IntelligenceAction[];
}
