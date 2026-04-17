type PlayerSample = {
  sport: string;
  name: string;
  lineSources: Record<string, number>;
  hasEdgePayload: boolean;
};

const SAMPLE_NAMES_BY_SPORT: Record<string, string[]> = {
  NBA: ["Nikola Jokic", "Luka Doncic", "Jayson Tatum"],
  NFL: ["Patrick Mahomes", "Josh Allen", "Lamar Jackson"],
  MLB: ["Shohei Ohtani", "Aaron Judge", "Mookie Betts"],
  NHL: ["Connor McDavid", "Auston Matthews", "Sidney Crosby"],
  SOCCER: ["Lionel Messi", "Kylian Mbappe", "Erling Haaland"],
  NCAAB: ["Zach Edey", "Braden Smith", "Hunter Dickinson"],
  NCAAF: ["Carson Beck", "Quinn Ewers", "Jalen Milroe"],
};

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function samplePlayer(sport: string, name: string): Promise<PlayerSample | null> {
  const data = await fetchJson(`http://localhost:5173/api/player/${sport}/${encodeURIComponent(name)}`);
  if (!data || typeof data !== "object") return null;
  const recent = Array.isArray(data.recentPerformance) ? data.recentPerformance : [];
  const lineSources: Record<string, number> = {};
  for (const row of recent) {
    const key = String((row as any)?.lineSource || "none");
    lineSources[key] = (lineSources[key] || 0) + 1;
  }
  const hasEdgePayload = Array.isArray((data as any)?.edgeSignals) && (data as any).edgeSignals.length > 0;
  return { sport, name, lineSources, hasEdgePayload };
}

async function main(): Promise<void> {
  const sports = ["NBA", "NFL", "MLB", "NHL", "SOCCER", "NCAAB", "NCAAF"];
  const samples: PlayerSample[] = [];
  for (const sport of sports) {
    const names = SAMPLE_NAMES_BY_SPORT[sport] || [];
    for (const name of names) {
      const sample = await samplePlayer(sport, name);
      if (sample) samples.push(sample);
      if (samples.length >= 18) break;
    }
    if (samples.length >= 18) break;
  }
  const summary = samples.reduce(
    (acc, row) => {
      acc.totalSamples += 1;
      if (row.hasEdgePayload) acc.edgePayloadSamples += 1;
      for (const [source, count] of Object.entries(row.lineSources)) {
        acc.lineSources[source] = (acc.lineSources[source] || 0) + Number(count || 0);
      }
      return acc;
    },
    {
      totalSamples: 0,
      edgePayloadSamples: 0,
      lineSources: {} as Record<string, number>,
    }
  );
  console.log(JSON.stringify({ summary, samples }, null, 2));
}

main().catch((error) => {
  console.error("[qa-launch-mode] failed", error);
  process.exit(1);
});

