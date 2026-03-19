interface ModelUsageRow {
  at: string;
  provider: string;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  task: string;
}

const MODEL_USAGE_LIMIT = 300;
const modelUsageRows: ModelUsageRow[] = [];

export function recordCoachGModelUsage(row: ModelUsageRow): void {
  modelUsageRows.push(row);
  if (modelUsageRows.length > MODEL_USAGE_LIMIT) {
    modelUsageRows.splice(0, modelUsageRows.length - MODEL_USAGE_LIMIT);
  }
}

export function getCoachGModelUsageSnapshot(): {
  total: number;
  byProvider: Record<string, number>;
  avgLatencyMs: number;
  fallbackRate: number;
  latest: ModelUsageRow[];
} {
  const total = modelUsageRows.length;
  const byProvider: Record<string, number> = {};
  let latencySum = 0;
  let fallbackCount = 0;
  for (const row of modelUsageRows) {
    byProvider[row.provider] = (byProvider[row.provider] || 0) + 1;
    latencySum += row.latencyMs;
    if (row.fallbackUsed) fallbackCount += 1;
  }
  return {
    total,
    byProvider,
    avgLatencyMs: total > 0 ? Math.round(latencySum / total) : 0,
    fallbackRate: total > 0 ? Number((fallbackCount / total).toFixed(3)) : 0,
    latest: modelUsageRows.slice(-20).reverse(),
  };
}
