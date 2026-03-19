/**
 * ScoutResponseRenderer - Renders Scout AI responses with visual intelligence components
 * Supports both structured JSON responses and text-based responses with freshness indicators
 */

import { cn } from "@/react-app/lib/utils";
import { CoachGActionButtons } from "@/react-app/components/CoachGActionButtons";
import type { ActionButton } from "@/react-app/lib/coachGActionEngine";
import { 
  FreshnessBadge, 
  InlineFreshnessIndicator,
  FreshnessLevel 
} from "@/react-app/components/ui/freshness-badge";
import { 
  Clock, 
  Database, 
  Calendar, 
  TrendingUp, 
  Trophy,
  Activity,
  MapPin,
  Newspaper,
  ChevronRight
} from "lucide-react";

// Import Scout Visual Intelligence components
import {
  LineMovementTimeline,
  LineMovementTimelineCompact,
  type LineMovementPoint,
} from "@/react-app/components/scout/LineMovementTimeline";
import {
  HeadToHeadTable,
  HeadToHeadCompact,
  type Matchup,
} from "@/react-app/components/scout/HeadToHeadTable";
import {
  FormStrip,
  FormStripInline,
  type FormGame,
} from "@/react-app/components/scout/FormStrip";
import {
  InjuryPanel,
  InjuryBadges,
  type TeamInjuries,
} from "@/react-app/components/scout/InjuryPanel";
import {
  WeatherCard,
  WeatherBadge,
  type WeatherData,
} from "@/react-app/components/scout/WeatherCard";

// Scout structured response types
export interface ScoutSource {
  sourceName: string;
  lastUpdated: string;
  dataFreshness: "live" | "recent" | "stale" | "unknown";
}

export interface ScoutVisualData {
  // Line movement data
  lineMovement?: {
    market: "spread" | "total" | "moneyline";
    team?: string;
    openLine: number;
    currentLine: number;
    closeLine?: number;
    points?: LineMovementPoint[];
  };
  
  // Head-to-head data
  headToHead?: {
    team1: string;
    team2: string;
    matchups: Matchup[];
  };
  
  // Form/recent results data
  form?: {
    team: string;
    games: FormGame[];
  }[];
  
  // Injury data
  injuries?: TeamInjuries[];
  
  // Weather data
  weather?: {
    venue: string;
    data: WeatherData;
  };
}

export interface ScoutStructuredResponse {
  intent: string;
  answerSummary: string;
  keyPoints: string[];
  tables?: {
    title: string;
    columns: { key: string; label: string; align?: "left" | "center" | "right" }[];
    rows: Record<string, string | number | null>[];
    footnote?: string;
  }[];
  sourcesUsed: ScoutSource[];
  asOf: string;
  recommendedNextActions: { label: string; route: string; description?: string }[];
  complianceNote?: string;
  
  // Visual data for rendering rich components
  visualData?: ScoutVisualData;
}

interface ScoutResponseRendererProps {
  actions?: ActionButton[];
  content: string;
  structuredResponse?: ScoutStructuredResponse;
  compact?: boolean;
  className?: string;
}

// Source metadata with icons
const sourceIcons: Record<string, { icon: React.ElementType; label: string }> = {
  "📅": { icon: Calendar, label: "Schedule" },
  "📊": { icon: TrendingUp, label: "Standings" },
  "⚡": { icon: Activity, label: "Live Data" },
  "🏥": { icon: Activity, label: "Injury Report" },
  "📈": { icon: TrendingUp, label: "Odds" },
  "🏆": { icon: Trophy, label: "Results" },
  "☁️": { icon: MapPin, label: "Weather" },
  "📰": { icon: Newspaper, label: "News" },
  "📋": { icon: Database, label: "Data" },
};

// Parse source labels from response
function parseSourceLabel(line: string): {
  icon: string;
  name: string;
  freshness?: FreshnessLevel;
  timestamp?: string;
} | null {
  // Match [📅 Schedule Feed] pattern
  const sourceMatch = line.match(/^\[([📅📊⚡🏥📈🏆☁️📰📋🎯⚔️🎾⛳🏎️])\s+([^\]]+)\]/);
  if (!sourceMatch) return null;

  const [, icon, name] = sourceMatch;
  
  // Look for freshness indicator on next line or same line
  const freshnessMatch = line.match(/\[(🟢|🟡|🟠|🔴|⚪)\s+([^•\]]+?)(?:\s+•\s+[^\]]+)?\]/);
  
  let freshness: FreshnessLevel = "unknown";
  let timestamp: string | undefined;
  
  if (freshnessMatch) {
    const [, indicator, time] = freshnessMatch;
    const levelMap: Record<string, FreshnessLevel> = {
      "🟢": "live",
      "🟡": "fresh",
      "🟠": "aging",
      "🔴": "stale",
      "⚪": "unknown",
    };
    freshness = levelMap[indicator] || "unknown";
    timestamp = time?.trim();
  }

  return { icon, name, freshness, timestamp };
}

// Map source freshness to FreshnessLevel
function mapFreshness(freshness: string): FreshnessLevel {
  const map: Record<string, FreshnessLevel> = {
    live: "live",
    recent: "fresh",
    stale: "stale",
    unknown: "unknown",
  };
  return map[freshness] || "unknown";
}

// Render visual components based on structured data
function renderVisualComponents(
  visualData: ScoutVisualData,
  sources: ScoutSource[],
  compact?: boolean
): React.ReactNode[] {
  const components: React.ReactNode[] = [];
  const freshness = sources[0]?.dataFreshness 
    ? mapFreshness(sources[0].dataFreshness) 
    : "fresh";
  const lastUpdated = sources[0]?.lastUpdated;

  // Line Movement
  if (visualData.lineMovement) {
    const lm = visualData.lineMovement;
    components.push(
      compact ? (
        <LineMovementTimelineCompact
          key="line-movement"
          market={lm.market}
          openLine={lm.openLine}
          currentLine={lm.currentLine}
          className="my-2"
        />
      ) : (
        <LineMovementTimeline
          key="line-movement"
          market={lm.market}
          team={lm.team}
          openLine={lm.openLine}
          currentLine={lm.currentLine}
          closeLine={lm.closeLine}
          points={lm.points}
          freshness={freshness}
          lastUpdated={lastUpdated}
          className="my-3"
        />
      )
    );
  }

  // Head to Head
  if (visualData.headToHead) {
    const h2h = visualData.headToHead;
    // Calculate wins from matchup scores
    const team1Wins = h2h.matchups.filter(m => {
      const isTeam1Home = m.homeTeam === h2h.team1;
      return isTeam1Home ? m.homeScore > m.awayScore : m.awayScore > m.homeScore;
    }).length;
    const team2Wins = h2h.matchups.filter(m => {
      const isTeam2Home = m.homeTeam === h2h.team2;
      return isTeam2Home ? m.homeScore > m.awayScore : m.awayScore > m.homeScore;
    }).length;
    const draws = h2h.matchups.length - team1Wins - team2Wins;
    
    components.push(
      compact ? (
        <HeadToHeadCompact
          key="h2h"
          team1={h2h.team1}
          team2={h2h.team2}
          team1Wins={team1Wins}
          team2Wins={team2Wins}
          draws={draws}
          className="my-2"
        />
      ) : (
        <HeadToHeadTable
          key="h2h"
          team1={h2h.team1}
          team2={h2h.team2}
          matchups={h2h.matchups}
          freshness={freshness}
          lastUpdated={lastUpdated}
          className="my-3"
        />
      )
    );
  }

  // Form
  if (visualData.form && visualData.form.length > 0) {
    visualData.form.forEach((teamForm, idx) => {
      components.push(
        compact ? (
          <FormStripInline
            key={`form-${idx}`}
            games={teamForm.games}
            className="my-2"
          />
        ) : (
          <FormStrip
            key={`form-${idx}`}
            team={teamForm.team}
            games={teamForm.games}
            freshness={freshness}
            lastUpdated={lastUpdated}
            className="my-3"
          />
        )
      );
    });
  }

  // Injuries
  if (visualData.injuries && visualData.injuries.length > 0) {
    const allPlayers = visualData.injuries.flatMap(t => t.players);
    components.push(
      compact ? (
        <InjuryBadges
          key="injuries"
          players={allPlayers}
          className="my-2"
        />
      ) : (
        <InjuryPanel
          key="injuries"
          teams={visualData.injuries}
          freshness={freshness}
          lastUpdated={lastUpdated}
          className="my-3"
        />
      )
    );
  }

  // Weather
  if (visualData.weather) {
    components.push(
      compact ? (
        <WeatherBadge
          key="weather"
          weather={visualData.weather.data}
          className="my-2"
        />
      ) : (
        <WeatherCard
          key="weather"
          venue={visualData.weather.venue}
          weather={visualData.weather.data}
          freshness={freshness}
          lastUpdated={lastUpdated}
          className="my-3"
        />
      )
    );
  }

  return components;
}

// Render structured response
function renderStructuredResponse(
  response: ScoutStructuredResponse,
  compact?: boolean
): React.ReactNode {
  const visualComponents = response.visualData 
    ? renderVisualComponents(response.visualData, response.sourcesUsed, compact)
    : [];

  return (
    <div className="space-y-3">
      {/* Summary */}
      <p className="text-sm leading-relaxed">{response.answerSummary}</p>

      {/* Visual components */}
      {visualComponents.length > 0 && (
        <div className="space-y-3">
          {visualComponents}
        </div>
      )}

      {/* Key points */}
      {response.keyPoints.length > 0 && (
        <div className="space-y-1">
          {response.keyPoints.map((point, idx) => (
            <div key={idx} className="flex items-start gap-2 py-0.5">
              <span className="text-primary mt-1">•</span>
              <span className="text-sm">{point}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tables */}
      {response.tables?.map((table, tableIdx) => (
        <div key={tableIdx} className="my-3">
          <h4 className="text-sm font-semibold mb-2">{table.title}</h4>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {table.columns.map((col, colIdx) => (
                    <th
                      key={colIdx}
                      className={cn(
                        "px-3 py-2 text-xs font-medium text-muted-foreground",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        !col.align && "text-left"
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {table.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-muted/30">
                    {table.columns.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        className={cn(
                          "px-3 py-2",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center"
                        )}
                      >
                        {row[col.key] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.footnote && (
            <p className="text-xs text-muted-foreground mt-1">{table.footnote}</p>
          )}
        </div>
      ))}

      {/* Compliance note */}
      {response.complianceNote && (
        <div className="text-xs text-muted-foreground/70 italic border-l-2 border-border pl-2 mt-3">
          {response.complianceNote}
        </div>
      )}

      {/* Recommended actions */}
      {response.recommendedNextActions.length > 0 && !compact && (
        <div className="pt-2 mt-2 border-t border-border/50">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Related
          </p>
          <div className="flex flex-wrap gap-1.5">
            {response.recommendedNextActions.slice(0, 3).map((action, idx) => (
              <a
                key={idx}
                href={action.route}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 text-xs hover:bg-muted transition-colors"
              >
                {action.label}
                <ChevronRight className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Sources footer */}
      {response.sourcesUsed.length > 0 && (
        <ResponseFreshnessFooter
          sources={response.sourcesUsed.map(s => ({
            name: s.sourceName,
            freshness: mapFreshness(s.dataFreshness),
            timestamp: s.lastUpdated,
          }))}
        />
      )}
    </div>
  );
}

// Enhanced line renderer for text content
function renderLine(line: string, index: number): React.ReactNode {
  // Check for source header
  const sourceInfo = parseSourceLabel(line);
  if (sourceInfo) {
    return (
      <SourceHeader 
        key={index}
        icon={sourceInfo.icon}
        name={sourceInfo.name}
        freshness={sourceInfo.freshness}
        timestamp={sourceInfo.timestamp}
      />
    );
  }

  // Check for freshness indicator line (standalone)
  if (line.match(/^\[(🟢|🟡|🟠|🔴|⚪)\s+/)) {
    const match = line.match(/^\[(🟢|🟡|🟠|🔴|⚪)\s+([^•\]]+?)(?:\s+•\s+([^\]]+))?\]/);
    if (match) {
      const [, indicator, time, description] = match;
      const levelMap: Record<string, FreshnessLevel> = {
        "🟢": "live",
        "🟡": "fresh",
        "🟠": "aging",
        "🔴": "stale",
        "⚪": "unknown",
      };
      return (
        <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
          <FreshnessBadge level={levelMap[indicator] || "unknown"} compact />
          <span>{time}</span>
          {description && <span className="opacity-70">• {description}</span>}
        </div>
      );
    }
  }

  // Check for standings/table row
  if (line.match(/^\d+\.\s+/) || line.match(/^#\d+\s+/)) {
    return (
      <div key={index} className="font-mono text-sm py-0.5 px-2 rounded bg-muted/30 hover:bg-muted/50 transition-colors">
        {line}
      </div>
    );
  }

  // Check for score line (e.g., "Team A 2-1 Team B")
  const scoreMatch = line.match(/^(.+?)\s+(\d+)\s*[-–]\s*(\d+)\s+(.+)$/);
  if (scoreMatch) {
    const [, team1, score1, score2, team2] = scoreMatch;
    const winner = parseInt(score1) > parseInt(score2) ? 1 : parseInt(score2) > parseInt(score1) ? 2 : 0;
    return (
      <div key={index} className="flex items-center justify-between py-1 px-2 rounded bg-muted/30 text-sm">
        <span className={cn(winner === 1 && "font-semibold text-green-500")}>{team1}</span>
        <span className="font-mono font-bold px-3 py-0.5 rounded bg-background">
          {score1} - {score2}
        </span>
        <span className={cn(winner === 2 && "font-semibold text-green-500")}>{team2}</span>
      </div>
    );
  }

  // Check for live indicator in line
  if (line.includes("🔴 LIVE") || line.includes("● LIVE")) {
    return (
      <div key={index} className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <span className="text-red-500 font-semibold text-xs uppercase tracking-wide">LIVE</span>
        <span>{line.replace(/🔴 LIVE|● LIVE/g, "").trim()}</span>
      </div>
    );
  }

  // Check for bullet points
  if (line.match(/^[•\-]\s+/)) {
    return (
      <div key={index} className="flex items-start gap-2 py-0.5">
        <span className="text-primary mt-1">•</span>
        <span>{line.replace(/^[•\-]\s+/, "")}</span>
      </div>
    );
  }

  // Section headers (lines ending with :)
  if (line.match(/^[A-Z][^:]+:$/) && line.length < 50) {
    return (
      <h4 key={index} className="font-semibold text-sm mt-3 mb-1 text-foreground">
        {line}
      </h4>
    );
  }

  // Regular line
  return line ? <p key={index} className="py-0.5">{line}</p> : <div key={index} className="h-2" />;
}

// Source header component
function SourceHeader({ 
  icon, 
  name, 
  freshness = "unknown",
  timestamp 
}: { 
  icon: string; 
  name: string; 
  freshness?: FreshnessLevel;
  timestamp?: string;
}) {
  const sourceConfig = sourceIcons[icon];
  const Icon = sourceConfig?.icon || Database;

  return (
    <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-gradient-to-r from-muted/60 to-muted/30 border border-border/50 my-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-background/80 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <span className="text-xs font-medium text-foreground">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {timestamp && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timestamp}
          </span>
        )}
        <FreshnessBadge level={freshness} compact />
      </div>
    </div>
  );
}

export function ScoutResponseRenderer({ 
  content, 
  structuredResponse,
  actions,
  compact = false,
  className 
}: ScoutResponseRendererProps) {
  // If we have a structured response, render it with visual components
  if (structuredResponse) {
    return (
      <div className={cn("space-y-1 text-sm leading-relaxed", className)}>
        {renderStructuredResponse(structuredResponse, compact)}
        {actions && actions.length > 0 && (
          <CoachGActionButtons buttons={actions} className="mt-4" />
        )}
      </div>
    );
  }

  // Otherwise, parse and render text content
  const lines = content.split("\n");
  
  // Group consecutive source/freshness lines
  const rendered: React.ReactNode[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this is a source header followed by freshness indicator
    const sourceInfo = parseSourceLabel(line);
    if (sourceInfo && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const freshnessMatch = nextLine.match(/^\[(🟢|🟡|🟠|🔴|⚪)\s+([^•\]]+?)(?:\s+•\s+([^\]]+))?\]/);
      
      if (freshnessMatch) {
        const [, indicator, time] = freshnessMatch;
        const levelMap: Record<string, FreshnessLevel> = {
          "🟢": "live",
          "🟡": "fresh",
          "🟠": "aging",
          "🔴": "stale",
          "⚪": "unknown",
        };
        rendered.push(
          <SourceHeader 
            key={i}
            icon={sourceInfo.icon}
            name={sourceInfo.name}
            freshness={levelMap[indicator] || "unknown"}
            timestamp={time?.trim()}
          />
        );
        i += 2; // Skip both lines
        continue;
      }
    }
    
    rendered.push(renderLine(line, i));
    i++;
  }

  return (
    <div className={cn("space-y-1 text-sm leading-relaxed", className)}>
      {rendered}
      {actions && actions.length > 0 && (
        <CoachGActionButtons buttons={actions} className="mt-4" />
      )}
    </div>
  );
}

// Quick freshness summary for response footer
interface ResponseFreshnessFooterProps {
  sources: Array<{ name: string; freshness: FreshnessLevel; timestamp?: string }>;
  className?: string;
}

export function ResponseFreshnessFooter({ sources, className }: ResponseFreshnessFooterProps) {
  if (!sources.length) return null;

  // Calculate overall freshness
  const freshnessOrder: FreshnessLevel[] = ["stale", "aging", "unknown", "recent", "fresh", "live"];
  const overallFreshness = sources.reduce((worst, s) => {
    const worstIdx = freshnessOrder.indexOf(worst);
    const currentIdx = freshnessOrder.indexOf(s.freshness);
    return currentIdx < worstIdx ? s.freshness : worst;
  }, "live" as FreshnessLevel);

  return (
    <div className={cn(
      "flex items-center gap-3 pt-2 mt-2 border-t border-border/50 text-[10px] text-muted-foreground",
      className
    )}>
      <div className="flex items-center gap-1">
        <InlineFreshnessIndicator level={overallFreshness} />
        <span>Data from {sources.length} source{sources.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex-1 flex items-center gap-1 flex-wrap justify-end">
        {sources.slice(0, 3).map((s, i) => (
          <span key={i} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/50">
            <InlineFreshnessIndicator level={s.freshness} />
            {s.name}
          </span>
        ))}
        {sources.length > 3 && (
          <span className="text-muted-foreground/60">+{sources.length - 3} more</span>
        )}
      </div>
    </div>
  );
}


