export type NascarRaceResultRow = {
  position: number;
  driverName: string;
  points: number | null;
  status?: string;
};

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function readDriverName(row: any): string {
  return String(
    row?.driver_name
    || row?.name
    || row?.displayName
    || row?.full_name
    || row?.athlete?.displayName
    || row?.competitor?.displayName
    || row?.team?.displayName
    || ""
  ).trim();
}

function readPosition(row: any, fallbackPosition: number): number {
  const first =
    toFiniteNumber(row?.position)
    ?? toFiniteNumber(row?.order)
    ?? toFiniteNumber(row?.rank)
    ?? toFiniteNumber(row?.place)
    ?? toFiniteNumber(row?.running_order);
  if (first == null) return fallbackPosition;
  return Math.max(1, Math.trunc(first));
}

export function normalizeNascarNameToken(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeProviderRaceResults(rawRows: unknown): NascarRaceResultRow[] {
  if (!Array.isArray(rawRows)) return [];
  const rows = rawRows
    .map((row, idx) => {
      const driverName = readDriverName(row);
      if (!driverName) return null;
      return {
        position: readPosition(row, idx + 1),
        driverName,
        points: toFiniteNumber((row as any)?.points ?? (row as any)?.score),
        status: String((row as any)?.status || (row as any)?.statusDetail || "").trim() || undefined,
      };
    })
    .filter((row): row is NascarRaceResultRow => Boolean(row))
    .sort((a, b) => a.position - b.position);
  return rows;
}

export function hasVerifiedNascarRaceResults(rows: NascarRaceResultRow[] | undefined, minRows = 3): boolean {
  if (!Array.isArray(rows) || rows.length < minRows) return false;
  const p1 = rows.find((row) => row.position === 1);
  if (!p1 || !p1.driverName) return false;
  const uniquePositions = new Set(rows.map((row) => row.position).filter((n) => Number.isFinite(n)));
  return uniquePositions.size >= minRows;
}

export function extractProviderWinnerName(game: any, rows?: NascarRaceResultRow[]): string {
  const winnerName = String(
    game?.winner_name
    || game?.winner
    || game?.winnerName
    || game?.result?.winner_name
    || game?.result?.winner
    || game?.champion?.name
    || ""
  ).trim();
  if (winnerName) return winnerName;
  const fromRows = (rows || []).find((row) => row.position === 1)?.driverName;
  return String(fromRows || "").trim();
}
