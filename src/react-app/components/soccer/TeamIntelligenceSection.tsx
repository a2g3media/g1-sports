/**
 * Team Intelligence Section Component
 * Displays Coach G analysis for soccer teams
 */

import { useEffect, useState } from "react";
import { Brain, TrendingUp, AlertCircle, Newspaper, CheckCircle } from "lucide-react";

interface TeamIntelligenceProps {
  teamId: string;
  teamName: string;
}

interface TeamIntelligence {
  teamId: string;
  lastMatchAnalysis: {
    summary: string;
    whatWentRight: string[];
    whatWentWrong: string[];
  };
  nextMatchPreview: {
    summary: string;
    keyPoints: string[];
  };
  injuries: {
    available: boolean;
    injuries: Array<{ player: string; status: string; expectedReturn?: string }>;
  };
  newsSentiment: {
    headlines: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
  };
  generatedAt: string;
}

export function TeamIntelligenceSection({ teamId, teamName: _teamName }: TeamIntelligenceProps) {
  const [intelligence, setIntelligence] = useState<TeamIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchIntelligence() {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/team-intelligence/${teamId}`);
        if (!response.ok) {
          throw new Error('Failed to load team intelligence');
        }
        
        const data = await response.json();
        if (data.success && data.intelligence) {
          setIntelligence(data.intelligence);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        console.error('Error fetching team intelligence:', err);
        setError(err instanceof Error ? err.message : 'Failed to load intelligence');
      } finally {
        setLoading(false);
      }
    }
    
    fetchIntelligence();
  }, [teamId]);

  if (loading) {
    return (
      <section className="rounded-2xl bg-gradient-to-br from-emerald-900/10 to-cyan-900/10 border border-emerald-500/20 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-white/10 flex items-center gap-3">
          <Brain className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Coach G — Team Intelligence</h2>
        </div>
        <div className="p-8 flex items-center justify-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent"></div>
        </div>
      </section>
    );
  }

  if (error || !intelligence) {
    return (
      <section className="rounded-2xl bg-gradient-to-br from-emerald-900/10 to-cyan-900/10 border border-emerald-500/20 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-white/10 flex items-center gap-3">
          <Brain className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Coach G — Team Intelligence</h2>
        </div>
        <div className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-white/50 text-sm">{error || 'Unable to load team intelligence'}</p>
        </div>
      </section>
    );
  }

  const sentimentColor = {
    positive: 'text-emerald-400',
    neutral: 'text-white/70',
    negative: 'text-red-400'
  }[intelligence.newsSentiment.sentiment];

  return (
    <section className="rounded-2xl bg-gradient-to-br from-emerald-900/10 to-cyan-900/10 border border-emerald-500/20 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Coach G — Team Intelligence</h2>
        </div>
        <span className="text-xs text-white/40">
          Updated {new Date(intelligence.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      
      <div className="p-4 md:p-6 space-y-6">
        {/* Last Match Analysis */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">Last Match Analysis</h3>
          </div>
          
          <p className="text-white/80 text-sm leading-relaxed">{intelligence.lastMatchAnalysis.summary}</p>
          
          {intelligence.lastMatchAnalysis.whatWentRight.length > 0 && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs font-semibold text-emerald-400 mb-2">What Went Right</p>
              <ul className="space-y-1">
                {intelligence.lastMatchAnalysis.whatWentRight.map((point, idx) => (
                  <li key={idx} className="text-xs text-white/70 flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {intelligence.lastMatchAnalysis.whatWentWrong.length > 0 && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs font-semibold text-red-400 mb-2">What Went Wrong</p>
              <ul className="space-y-1">
                {intelligence.lastMatchAnalysis.whatWentWrong.map((point, idx) => (
                  <li key={idx} className="text-xs text-white/70 flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Next Match Preview */}
        <div className="space-y-3 border-t border-white/10 pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Next Match Preview</h3>
          </div>
          
          <p className="text-white/80 text-sm leading-relaxed">{intelligence.nextMatchPreview.summary}</p>
          
          {intelligence.nextMatchPreview.keyPoints.length > 0 && (
            <div className="space-y-2">
              {intelligence.nextMatchPreview.keyPoints.map((point, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
                  <p className="text-xs text-white/70">{point}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Injuries & Availability */}
        <div className="space-y-3 border-t border-white/10 pt-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Injuries & Availability</h3>
          </div>
          
          {intelligence.injuries.available && intelligence.injuries.injuries.length > 0 ? (
            <div className="space-y-2">
              {intelligence.injuries.injuries.map((injury, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white/90">{injury.player}</p>
                      <p className="text-xs text-white/50">{injury.status}</p>
                    </div>
                    {injury.expectedReturn && (
                      <span className="text-xs text-amber-400 flex-shrink-0">
                        {injury.expectedReturn}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
              <p className="text-xs text-white/50 text-center">No confirmed injuries found</p>
            </div>
          )}
        </div>

        {/* News Sentiment */}
        {intelligence.newsSentiment.headlines.length > 0 && (
          <div className="space-y-3 border-t border-white/10 pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">Recent Headlines</h3>
              <span className={`text-xs font-medium ${sentimentColor} ml-auto capitalize`}>
                {intelligence.newsSentiment.sentiment}
              </span>
            </div>
            
            <div className="space-y-2">
              {intelligence.newsSentiment.headlines.map((headline, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-white/[0.03] border border-white/10 hover:border-cyan-500/30 transition-colors">
                  <p className="text-xs text-white/70">{headline}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default TeamIntelligenceSection;
