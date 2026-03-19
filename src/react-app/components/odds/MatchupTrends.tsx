/**
 * Matchup Trends Component
 * Shows head-to-head history, ATS record, and O/U trends
 */

import { memo, useState, useEffect } from "react";
import { History, TrendingUp, TrendingDown, Target, Minus } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface Meeting {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  spread: number;
  total: number;
  coveredSpread: 'home' | 'away' | 'push';
  hitOver: boolean | null; // null = push
}

interface MatchupTrendsProps {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
}

// Generate mock historical data based on team names for consistent display
function generateMockMeetings(homeTeam: string, awayTeam: string): Meeting[] {
  const seed = (homeTeam + awayTeam).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const meetings: Meeting[] = [];
  
  const dates = [
    '2025-03-15', '2025-01-22', '2024-11-08', '2024-04-12', '2024-02-28'
  ];
  
  for (let i = 0; i < 5; i++) {
    const homeWin = (seed + i * 17) % 3 !== 0;
    const homeScore = 95 + ((seed + i * 13) % 30);
    const awayScore = homeWin ? homeScore - 3 - ((seed + i) % 10) : homeScore + 3 + ((seed + i) % 8);
    const spread = -3.5 + ((seed + i * 7) % 7);
    const total = 215 + ((seed + i * 11) % 20);
    const actualTotal = homeScore + awayScore;
    const margin = homeScore - awayScore;
    
    meetings.push({
      date: dates[i],
      homeTeam: i % 2 === 0 ? homeTeam : awayTeam,
      awayTeam: i % 2 === 0 ? awayTeam : homeTeam,
      homeScore: i % 2 === 0 ? homeScore : awayScore,
      awayScore: i % 2 === 0 ? awayScore : homeScore,
      spread,
      total,
      coveredSpread: margin > spread ? 'home' : margin < spread ? 'away' : 'push',
      hitOver: actualTotal > total ? true : actualTotal < total ? false : null,
    });
  }
  
  return meetings;
}

export const MatchupTrends = memo(function MatchupTrends({
  gameId: _gameId,
  homeTeam,
  awayTeam,
}: MatchupTrendsProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Simulate API fetch - in production, this would call a real endpoint
    const timer = setTimeout(() => {
      setMeetings(generateMockMeetings(homeTeam, awayTeam));
      setIsLoading(false);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [homeTeam, awayTeam]);
  
  // Calculate ATS record
  const atsRecord = meetings.reduce(
    (acc, m) => {
      const isHome = m.homeTeam === homeTeam;
      const covered = m.coveredSpread === 'home' ? isHome : m.coveredSpread === 'away' ? !isHome : null;
      if (covered === true) acc.wins++;
      else if (covered === false) acc.losses++;
      else acc.pushes++;
      return acc;
    },
    { wins: 0, losses: 0, pushes: 0 }
  );
  
  // Calculate O/U record
  const ouRecord = meetings.reduce(
    (acc, m) => {
      if (m.hitOver === true) acc.overs++;
      else if (m.hitOver === false) acc.unders++;
      else acc.pushes++;
      return acc;
    },
    { overs: 0, unders: 0, pushes: 0 }
  );
  
  // Calculate straight up record
  const suRecord = meetings.reduce(
    (acc, m) => {
      const isHome = m.homeTeam === homeTeam;
      const homeWon = m.homeScore > m.awayScore;
      if ((isHome && homeWon) || (!isHome && !homeWon)) acc.wins++;
      else acc.losses++;
      return acc;
    },
    { wins: 0, losses: 0 }
  );
  
  if (isLoading) {
    return (
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-white/50 uppercase tracking-wide font-medium">Matchup Trends</span>
        </div>
        <div className="h-32 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-amber-400" />
        <span className="text-xs text-white/50 uppercase tracking-wide font-medium">Matchup Trends</span>
      </div>
      
      {/* Record Summary Cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {/* Straight Up */}
        <div className="rounded-lg bg-white/[0.03] p-3 text-center">
          <div className="text-[10px] text-white/40 uppercase mb-1">Straight Up</div>
          <div className="text-lg font-bold text-white">
            {suRecord.wins}-{suRecord.losses}
          </div>
          <div className={cn(
            "text-[10px] font-medium mt-0.5",
            suRecord.wins > suRecord.losses ? "text-emerald-400" : suRecord.wins < suRecord.losses ? "text-rose-400" : "text-white/50"
          )}>
            {suRecord.wins > suRecord.losses ? `${homeTeam} leads` : suRecord.wins < suRecord.losses ? `${awayTeam} leads` : 'Even'}
          </div>
        </div>
        
        {/* ATS Record */}
        <div className="rounded-lg bg-white/[0.03] p-3 text-center">
          <div className="text-[10px] text-white/40 uppercase mb-1">ATS</div>
          <div className="text-lg font-bold text-white">
            {atsRecord.wins}-{atsRecord.losses}{atsRecord.pushes > 0 ? `-${atsRecord.pushes}` : ''}
          </div>
          <div className={cn(
            "text-[10px] font-medium mt-0.5",
            atsRecord.wins > atsRecord.losses ? "text-emerald-400" : atsRecord.wins < atsRecord.losses ? "text-rose-400" : "text-white/50"
          )}>
            {atsRecord.wins > atsRecord.losses ? 'Covering' : atsRecord.wins < atsRecord.losses ? 'Not covering' : 'Breaking even'}
          </div>
        </div>
        
        {/* O/U Record */}
        <div className="rounded-lg bg-white/[0.03] p-3 text-center">
          <div className="text-[10px] text-white/40 uppercase mb-1">O/U</div>
          <div className="text-lg font-bold text-white">
            {ouRecord.overs}O-{ouRecord.unders}U{ouRecord.pushes > 0 ? `-${ouRecord.pushes}P` : ''}
          </div>
          <div className={cn(
            "text-[10px] font-medium mt-0.5",
            ouRecord.overs > ouRecord.unders ? "text-emerald-400" : ouRecord.overs < ouRecord.unders ? "text-cyan-400" : "text-white/50"
          )}>
            {ouRecord.overs > ouRecord.unders ? 'Trending Over' : ouRecord.overs < ouRecord.unders ? 'Trending Under' : 'Split'}
          </div>
        </div>
      </div>
      
      {/* Last 5 Meetings */}
      <div className="text-[10px] text-white/40 uppercase mb-2">Last 5 Meetings</div>
      <div className="space-y-1.5">
        {meetings.map((meeting, i) => {
          const homeWon = meeting.homeScore > meeting.awayScore;
          const isCurrentHome = meeting.homeTeam === homeTeam;
          const teamWon = (isCurrentHome && homeWon) || (!isCurrentHome && !homeWon);
          
          return (
            <div 
              key={i}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                "bg-white/[0.02] hover:bg-white/[0.04]"
              )}
            >
              {/* Date */}
              <span className="text-[10px] text-white/30 w-16 flex-shrink-0">
                {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              
              {/* Result indicator */}
              <div className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                teamWon ? "bg-emerald-400" : "bg-rose-400"
              )} />
              
              {/* Score */}
              <div className="flex-1 text-xs">
                <span className={cn(
                  "font-medium",
                  !homeWon ? "text-white" : "text-white/60"
                )}>
                  {meeting.awayTeam} {meeting.awayScore}
                </span>
                <span className="text-white/30 mx-1">@</span>
                <span className={cn(
                  "font-medium",
                  homeWon ? "text-white" : "text-white/60"
                )}>
                  {meeting.homeTeam} {meeting.homeScore}
                </span>
              </div>
              
              {/* ATS Result */}
              <div className={cn(
                "text-[10px] font-medium w-10 text-center",
                meeting.coveredSpread === 'push' ? "text-white/40" :
                  (meeting.coveredSpread === 'home' && isCurrentHome) || 
                  (meeting.coveredSpread === 'away' && !isCurrentHome)
                    ? "text-emerald-400" : "text-rose-400"
              )}>
                {meeting.coveredSpread === 'push' ? (
                  <Minus className="w-3 h-3 mx-auto" />
                ) : (
                  (meeting.coveredSpread === 'home' && isCurrentHome) || 
                  (meeting.coveredSpread === 'away' && !isCurrentHome)
                    ? <Target className="w-3 h-3 mx-auto" />
                    : <span className="text-rose-400">✗</span>
                )}
              </div>
              
              {/* O/U Result */}
              <div className={cn(
                "text-[10px] font-medium w-8 text-center",
                meeting.hitOver === null ? "text-white/40" :
                  meeting.hitOver ? "text-emerald-400" : "text-cyan-400"
              )}>
                {meeting.hitOver === null ? (
                  <Minus className="w-3 h-3 mx-auto" />
                ) : meeting.hitOver ? (
                  <TrendingUp className="w-3 h-3 mx-auto" />
                ) : (
                  <TrendingDown className="w-3 h-3 mx-auto" />
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1 text-[9px] text-white/30">
          <Target className="w-2.5 h-2.5 text-emerald-400" />
          <span>Covered</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-white/30">
          <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
          <span>Over</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-white/30">
          <TrendingDown className="w-2.5 h-2.5 text-cyan-400" />
          <span>Under</span>
        </div>
      </div>
    </div>
  );
});

export default MatchupTrends;
