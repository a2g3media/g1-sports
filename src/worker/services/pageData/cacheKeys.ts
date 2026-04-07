type Primitive = string | number | boolean | null | undefined;

function normalizePart(value: Primitive): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function canonicalizeCsv(value: string): string {
  return value
    .split(",")
    .map((v) => normalizePart(v))
    .filter(Boolean)
    .sort()
    .join(",");
}

export function pageDataGamesCacheKey(params: {
  date: string;
  sport: string;
  tab?: string;
  includeLiveSlice?: boolean;
  v?: string;
}): string {
  const version = normalizePart(params.v || "v1");
  const sport = normalizePart(params.sport || "all") || "all";
  const date = normalizePart(params.date);
  const tab = normalizePart(params.tab || "scores") || "scores";
  const includeLiveSlice = params.includeLiveSlice ? "1" : "0";
  return `page_data_games:${version}:${sport}:${date}:${tab}:live${includeLiveSlice}`;
}

export function canonicalGameIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => normalizePart(id))
        .filter(Boolean)
    )
  ).sort();
}

export function pageDataGenericKey(namespace: string, params: Record<string, Primitive>): string {
  const ns = normalizePart(namespace) || "unknown";
  const stableParts = Object.entries(params)
    .map(([key, raw]) => {
      if (typeof raw === "string" && raw.includes(",")) {
        return `${normalizePart(key)}=${canonicalizeCsv(raw)}`;
      }
      return `${normalizePart(key)}=${normalizePart(raw)}`;
    })
    .sort();
  return `page_data:${ns}:${stableParts.join(":")}`;
}

