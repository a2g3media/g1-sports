import { useEffect, useMemo, useState } from 'react';
import { getPerfSnapshot } from '@/react-app/lib/perfTelemetry';

type OddsTelemetryDebugPanelProps = {
  pageKey: 'odds' | 'games';
  gamesCount: number;
  oddsCoverageCount: number;
  staleNotice?: string | null;
  isHydrating?: boolean;
  cycleToken?: number;
  lowCoverageThresholdPct?: number;
};

export function OddsTelemetryDebugPanel({
  pageKey,
  gamesCount,
  oddsCoverageCount,
  staleNotice,
  isHydrating = false,
  cycleToken = 0,
  lowCoverageThresholdPct = 35,
}: OddsTelemetryDebugPanelProps) {
  const [tick, setTick] = useState(0);
  const [lowCoverageStreak, setLowCoverageStreak] = useState(0);
  const [lowCoverageAlert, setLowCoverageAlert] = useState(false);
  const [lastLowCoveragePct, setLastLowCoveragePct] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((v) => v + 1), 2000);
    return () => window.clearInterval(timer);
  }, []);

  const snapshot = useMemo(() => {
    void tick;
    return getPerfSnapshot();
  }, [tick]);

  const coveragePct = gamesCount > 0 ? Math.round((oddsCoverageCount / gamesCount) * 100) : 0;

  useEffect(() => {
    if (cycleToken <= 0) return;
    if (gamesCount <= 0) {
      setLowCoverageStreak(0);
      setLowCoverageAlert(false);
      setLastLowCoveragePct(null);
      return;
    }
    const isLowCoverage = coveragePct < lowCoverageThresholdPct;
    if (isLowCoverage) {
      setLowCoverageStreak((prev) => {
        const next = prev + 1;
        if (next >= 3) setLowCoverageAlert(true);
        return next;
      });
      setLastLowCoveragePct(coveragePct);
    } else {
      setLowCoverageStreak(0);
      setLowCoverageAlert(false);
      setLastLowCoveragePct(null);
    }
  }, [coveragePct, cycleToken, gamesCount, lowCoverageThresholdPct]);

  const counters = useMemo(() => {
    return Object.entries(snapshot.counters)
      .filter(([key]) => key.startsWith(`${pageKey}.`) || key.endsWith('.staleProtected'))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [pageKey, snapshot.counters]);

  const durations = useMemo(() => {
    return Object.entries(snapshot.durations)
      .filter(([key]) => key.startsWith(pageKey))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [pageKey, snapshot.durations]);

  return (
    <div className="rounded-xl border border-fuchsia-400/35 bg-fuchsia-500/10 px-3 py-2 text-[11px] text-fuchsia-100">
      <div className="flex flex-wrap items-center gap-3">
        <span>debug telemetry</span>
        <span>coverage: {oddsCoverageCount}/{gamesCount} ({coveragePct}%)</span>
        <span>hydrating: {isHydrating ? 'yes' : 'no'}</span>
        <span>stale: {staleNotice ? 'yes' : 'no'}</span>
        <span>cycle: {cycleToken}</span>
      </div>
      {lowCoverageAlert && (
        <div className="mt-1 rounded border border-red-400/50 bg-red-500/15 px-2 py-1 text-red-100">
          low-coverage alert: {lowCoverageStreak} consecutive refresh cycles below {lowCoverageThresholdPct}% (last {lastLowCoveragePct}%)
        </div>
      )}
      {counters.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-fuchsia-200/90">
          {counters.map(([key, value]) => (
            <span key={key}>{key}: {value}</span>
          ))}
        </div>
      )}
      {durations.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-fuchsia-200/80">
          {durations.map(([key, value]) => (
            <span key={key}>{key}: avg {value.avgMs}ms</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default OddsTelemetryDebugPanel;
