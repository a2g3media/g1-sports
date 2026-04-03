/*
 * War-room API perf benchmark for key slow endpoints.
 * Usage:
 *   npx tsx scripts/qa-warroom-perf.ts --base http://localhost:5173 --runs 6 --mode mixed
 *   npx tsx scripts/qa-warroom-perf.ts --base http://localhost:5173 --runs 5 --mode cold
 *   npx tsx scripts/qa-warroom-perf.ts --base http://localhost:5173 --runs 8 --mode warm
 *   npx tsx scripts/qa-warroom-perf.ts --runs 5 --mode cold --only props_today_all --cooldown-ms 1200
 */

type Probe = { name: string; path: string };
type RunMode = 'mixed' | 'cold' | 'warm';

type ProbeResult = {
  ok: boolean;
  status: number;
  ms: number;
};

const probes: Probe[] = [
  { name: 'odds_slate_nba', path: '/api/odds/slate?sport=NBA&scope=PROD' },
  { name: 'odds_slate_ncaab', path: '/api/odds/slate?sport=NCAAB&scope=PROD' },
  { name: 'odds_slate_mlb', path: '/api/odds/slate?sport=MLB&scope=PROD' },
  { name: 'props_today_nba', path: '/api/sports-data/props/today?sport=NBA&limit=800' },
  { name: 'props_today_all', path: '/api/sports-data/props/today?sport=ALL&limit=1200' },
];

function parseArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function parseMode(): RunMode {
  const modeRaw = parseArg('--mode', 'mixed').trim().toLowerCase();
  if (modeRaw === 'cold' || modeRaw === 'warm' || modeRaw === 'mixed') return modeRaw;
  return 'mixed';
}

function parseOnlySet(): Set<string> {
  const raw = parseArg('--only', '').trim();
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  );
}

function parseCooldownMs(): number {
  const n = Number.parseInt(parseArg('--cooldown-ms', '0'), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(base: string, path: string, options: { fresh: boolean; nonce: string | null }): string {
  const url = new URL(path, base);
  if (options.fresh) url.searchParams.set('fresh', '1');
  if (options.nonce) url.searchParams.set('_perf_nonce', options.nonce);
  return url.toString();
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

async function timedFetch(url: string): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const res = await fetch(url, { credentials: 'include' as RequestCredentials });
    const ms = performance.now() - started;
    return {
      ok: res.ok,
      status: res.status,
      ms,
    };
  } catch {
    const ms = performance.now() - started;
    return {
      ok: false,
      status: 0,
      ms,
    };
  }
}

async function main() {
  const base = parseArg('--base', 'http://localhost:5173');
  const runs = Math.max(1, Number.parseInt(parseArg('--runs', '6'), 10) || 6);
  const mode = parseMode();
  const only = parseOnlySet();
  const cooldownMs = parseCooldownMs();

  const selectedProbes = only.size > 0
    ? probes.filter((probe) => only.has(probe.name))
    : probes;

  if (selectedProbes.length === 0) {
    console.error('[warroom-perf] no probes selected; check --only names');
    process.exit(1);
  }

  console.log(`
[warroom-perf] base=${base} runs=${runs} mode=${mode} probes=${selectedProbes.length} cooldown_ms=${cooldownMs}
`);

  for (const probe of selectedProbes) {
    const results: ProbeResult[] = [];

    if (mode === 'warm') {
      // Prime endpoint once before timing warm-only behavior.
      const warmupUrl = buildUrl(base, probe.path, { fresh: false, nonce: null });
      await timedFetch(warmupUrl);
    }

    for (let i = 0; i < runs; i += 1) {
      const shouldColdRun = mode === 'cold' || (mode === 'mixed' && i === 0);
      const nonce = shouldColdRun ? `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}` : null;
      const url = buildUrl(base, probe.path, { fresh: shouldColdRun, nonce });
      const result = await timedFetch(url);
      results.push(result);
      if (cooldownMs > 0 && i < runs - 1) {
        await sleep(cooldownMs);
      }
    }

    const msValues = results.map((r) => r.ms);
    const successes = results.filter((r) => r.ok).length;
    const warmValues = msValues.slice(1);

    const cold = msValues[0] || 0;
    const warmAvg = warmValues.length > 0
      ? warmValues.reduce((sum, n) => sum + n, 0) / warmValues.length
      : cold;
    const avgAll = msValues.length > 0
      ? msValues.reduce((sum, n) => sum + n, 0) / msValues.length
      : 0;

    console.log(`[${probe.name}]`);
    console.log(`  success: ${successes}/${runs}`);
    if (mode === 'mixed') {
      console.log(`  cold_ms: ${cold.toFixed(1)}`);
      console.log(`  warm_avg_ms: ${warmAvg.toFixed(1)}`);
    } else if (mode === 'cold') {
      console.log(`  cold_avg_ms: ${avgAll.toFixed(1)}`);
      console.log(`  first_cold_ms: ${cold.toFixed(1)}`);
    } else {
      console.log(`  warm_avg_ms: ${avgAll.toFixed(1)}`);
      console.log(`  first_warm_ms: ${cold.toFixed(1)}`);
    }
    console.log(`  p50_ms: ${percentile(msValues, 50).toFixed(1)}`);
    console.log(`  p95_ms: ${percentile(msValues, 95).toFixed(1)}`);
    console.log(`  max_ms: ${Math.max(...msValues).toFixed(1)}\n`);
  }
}

main().catch((err) => {
  console.error('[warroom-perf] failed', err);
  process.exit(1);
});
