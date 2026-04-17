function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractSoccerIdToken(rawValue: unknown): string {
  let raw = decodeSafe(String(rawValue || "").trim());
  if (!raw) return "";

  if (raw.startsWith("soccer_")) {
    raw = raw.replace(/^soccer_/, "");
  }
  if (raw.startsWith("sr:match:")) {
    raw = raw.replace(/^sr:match:/, "");
  }
  if (raw.startsWith("sr:sport_event:")) {
    raw = raw.replace(/^sr:sport_event:/, "");
  }
  if (raw.startsWith("sr_soccer_")) {
    const parts = raw.split("_");
    raw = parts.length >= 3 ? parts.slice(2).join("_") : raw;
  }
  if (raw.startsWith("espn_soccer_")) {
    raw = raw.replace(/^espn_soccer_/, "");
  }
  if (raw.startsWith("espn:")) {
    raw = raw.replace(/^espn:/, "");
  }

  return raw.trim();
}

export function normalizeSoccerRouteId(rawValue: unknown): string {
  const token = extractSoccerIdToken(rawValue);
  if (!token) return "";
  if (/^\d+$/.test(token)) return token;
  return `sr:sport_event:${token}`;
}

export function isSportsRadarSoccerEventId(rawValue: unknown): boolean {
  return normalizeSoccerRouteId(rawValue).startsWith("sr:sport_event:");
}

export function toSoccerProviderMatchId(rawValue: unknown): string {
  return normalizeSoccerRouteId(rawValue);
}

