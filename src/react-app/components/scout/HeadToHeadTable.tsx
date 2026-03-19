/**
 * HeadToHeadTable - Display historical matchups between two teams
 * Part of Scout Visual Intelligence system
 */

import { cn } from "@/react-app/lib/utils";
import { Calendar, MapPin, Trophy } from "lucide-react";
import { FreshnessBadge, FreshnessLevel } from "@/react-app/components/ui/freshness-badge";

export interface Matchup {
  date: string;
  venue?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition?: string;
  isNeutral?: boolean;
}

export interface HeadToHeadTableProps {
  team1: string;
  team2: string;
  matchups: Matchup[];
  freshness?: FreshnessLevel;
  lastUpdated?: string;
  className?: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], { 
    month: "short", 
    day: "numeric", 
    year: "2-digit" 
  });
}

export function HeadToHeadTable({
  team1,
  team2,
  matchups,
  freshness = "fresh",
  lastUpdated,
  className,
}: HeadToHeadTableProps) {
  // Calculate summary stats
  const team1Wins = matchups.filter(m => {
    const isTeam1Home = m.homeTeam === team1;
    return isTeam1Home 
      ? m.homeScore > m.awayScore 
      : m.awayScore > m.homeScore;
  }).length;
  
  const team2Wins = matchups.filter(m => {
    const isTeam2Home = m.homeTeam === team2;
    return isTeam2Home 
      ? m.homeScore > m.awayScore 
      : m.awayScore > m.homeScore;
  }).length;
  
  const draws = matchups.length - team1Wins - team2Wins;

  // Total goals/points
  const team1Total = matchups.reduce((sum, m) => {
    return sum + (m.homeTeam === team1 ? m.homeScore : m.awayScore);
  }, 0);
  
  const team2Total = matchups.reduce((sum, m) => {
    return sum + (m.homeTeam === team2 ? m.homeScore : m.awayScore);
  }, 0);

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-foreground">Head-to-Head</h4>
          </div>
          <FreshnessBadge level={freshness} timestamp={lastUpdated} compact />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Last {matchups.length} meetings
        </p>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-500/5 via-muted/10 to-blue-500/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{team1}</span>
          <span className="text-xs text-muted-foreground">vs</span>
          <span className="text-sm font-semibold">{team2}</span>
        </div>
        
        {/* Win distribution bar */}
        <div className="relative h-2 rounded-full bg-muted/50 overflow-hidden mb-2">
          <div 
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full"
            style={{ width: `${(team1Wins / matchups.length) * 100}%` }}
          />
          <div 
            className="absolute right-0 top-0 h-full bg-gradient-to-l from-blue-500 to-blue-400 rounded-r-full"
            style={{ width: `${(team2Wins / matchups.length) * 100}%` }}
          />
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-emerald-400">{team1Wins}W</span>
            <span className="text-muted-foreground">{team1Total} pts</span>
          </div>
          {draws > 0 && (
            <span className="px-2 py-0.5 rounded bg-muted/50 text-muted-foreground">
              {draws} Draw{draws !== 1 ? "s" : ""}
            </span>
          )}
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{team2Total} pts</span>
            <span className="font-bold text-blue-400">{team2Wins}W</span>
          </div>
        </div>
      </div>

      {/* Matchup list */}
      <div className="divide-y divide-border/30">
        {matchups.map((match, idx) => {
          const isTeam1Home = match.homeTeam === team1;
          const team1Score = isTeam1Home ? match.homeScore : match.awayScore;
          const team2Score = isTeam1Home ? match.awayScore : match.homeScore;
          const winner = team1Score > team2Score ? 1 : team2Score > team1Score ? 2 : 0;

          return (
            <div 
              key={idx}
              className="px-4 py-2.5 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center justify-between">
                {/* Team 1 side */}
                <div className={cn(
                  "flex items-center gap-2 flex-1",
                  winner === 1 && "font-semibold"
                )}>
                  {winner === 1 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                  <span className={cn(
                    "text-sm",
                    winner === 1 ? "text-emerald-400" : "text-foreground"
                  )}>
                    {team1}
                  </span>
                  {isTeam1Home && !match.isNeutral && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-muted/50 text-muted-foreground">
                      H
                    </span>
                  )}
                </div>

                {/* Score */}
                <div className="flex items-center gap-1 px-3">
                  <span className={cn(
                    "text-sm font-mono font-bold w-6 text-center",
                    winner === 1 ? "text-emerald-400" : "text-foreground"
                  )}>
                    {team1Score}
                  </span>
                  <span className="text-muted-foreground text-xs">-</span>
                  <span className={cn(
                    "text-sm font-mono font-bold w-6 text-center",
                    winner === 2 ? "text-blue-400" : "text-foreground"
                  )}>
                    {team2Score}
                  </span>
                </div>

                {/* Team 2 side */}
                <div className={cn(
                  "flex items-center gap-2 flex-1 justify-end",
                  winner === 2 && "font-semibold"
                )}>
                  {!isTeam1Home && !match.isNeutral && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-muted/50 text-muted-foreground">
                      H
                    </span>
                  )}
                  <span className={cn(
                    "text-sm",
                    winner === 2 ? "text-blue-400" : "text-foreground"
                  )}>
                    {team2}
                  </span>
                  {winner === 2 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  )}
                </div>
              </div>

              {/* Meta info */}
              <div className="flex items-center justify-center gap-3 mt-1">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" />
                  {formatDate(match.date)}
                </span>
                {match.venue && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" />
                    {match.venue}
                  </span>
                )}
                {match.competition && (
                  <span className="text-[10px] text-muted-foreground">
                    {match.competition}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {matchups.length === 0 && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No previous meetings found</p>
        </div>
      )}
    </div>
  );
}

// Compact single-row version
export function HeadToHeadCompact({
  team1,
  team2,
  team1Wins,
  team2Wins,
  draws = 0,
  className,
}: {
  team1: string;
  team2: string;
  team1Wins: number;
  team2Wins: number;
  draws?: number;
  className?: string;
}) {
  const total = team1Wins + team2Wins + draws;
  
  return (
    <div className={cn(
      "flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30",
      className
    )}>
      <span className="text-xs font-medium truncate max-w-[80px]">{team1}</span>
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-emerald-400">{team1Wins}</span>
        <span className="text-[10px] text-muted-foreground">-</span>
        {draws > 0 && (
          <>
            <span className="text-xs text-muted-foreground">{draws}</span>
            <span className="text-[10px] text-muted-foreground">-</span>
          </>
        )}
        <span className="text-xs font-bold text-blue-400">{team2Wins}</span>
      </div>
      <span className="text-xs font-medium truncate max-w-[80px]">{team2}</span>
      <span className="text-[10px] text-muted-foreground">
        ({total} games)
      </span>
    </div>
  );
}
