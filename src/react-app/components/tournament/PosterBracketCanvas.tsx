import { useEffect, useMemo, useRef, useState } from "react";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import type { LiveBracketMatchup, LiveBracketTree } from "@/react-app/lib/ncaabTournamentData";
import { cn } from "@/react-app/lib/utils";

type PositionedMatchup = {
  matchup: LiveBracketMatchup;
  x: number;
  y: number;
  regionKey: string;
};

type JumpAnchor = { id: string; label: string; x: number; y: number };

const NODE_W = 252;
const NODE_H = 72;
const COL_GAP = 200;
const ROW_GAP = 56;
const REGION_H = 940;
const TOP_PAD = 56;
const LEFT_PAD = 32;
const ROUND64_SEED_PAIRS: Array<[number, number]> = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];
const REGION_ROUND_SPEC = [
  { label: "Round of 64", count: 8, order: 2 },
  { label: "Round of 32", count: 4, order: 3 },
  { label: "Sweet 16", count: 2, order: 4 },
  { label: "Elite Eight", count: 1, order: 5 },
];

function statusTone(state: LiveBracketMatchup["state"]): string {
  if (state === "live") return "text-red-200 bg-red-500/20 border-red-300/40";
  if (state === "overtime") return "text-fuchsia-100 bg-fuchsia-500/20 border-fuchsia-300/40";
  if (state === "final") return "text-emerald-100 bg-emerald-500/20 border-emerald-300/40";
  return "text-cyan-100 bg-cyan-500/15 border-cyan-300/35";
}

function makePlaceholder(
  regionLabel: string,
  roundLabel: string,
  roundOrder: number,
  idx: number
): LiveBracketMatchup {
  const seedPair = roundLabel === "Round of 64" ? ROUND64_SEED_PAIRS[idx] : undefined;
  return {
    id: `placeholder-${regionLabel.toLowerCase()}-${roundLabel.toLowerCase().replace(/\s+/g, "-")}-${idx + 1}`,
    gameId: `placeholder-${regionLabel.toLowerCase()}-${roundLabel.toLowerCase().replace(/\s+/g, "-")}-${idx + 1}`,
    tournament: "march_madness",
    region: regionLabel,
    round: roundLabel,
    roundOrder,
    state: "upcoming",
    statusLabel: "UPCOMING",
    topTeam: {
      name: "TBD",
      shortName: "TBD",
      seed: seedPair?.[0],
      logoCode: "TBD",
    },
    bottomTeam: {
      name: "TBD",
      shortName: "TBD",
      seed: seedPair?.[1],
      logoCode: "TBD",
    },
    overlays: {},
  };
}

function slotOffset(roundIndex: number, itemIndex: number): number {
  const step = 2 ** (roundIndex + 1);
  const start = 2 ** roundIndex - 1;
  return start + itemIndex * step;
}

function buildLayout(tree: LiveBracketTree) {
  const fullRegions = tree.regions.map((region) => {
    const byRound = new Map(region.rounds.map((r) => [r.label, r.matchups]));
    const rounds = REGION_ROUND_SPEC.map((spec) => {
      const existing = [...(byRound.get(spec.label) || [])]
        .map((m) => ({
          ...m,
          topTeam: { ...m.topTeam },
          bottomTeam: { ...m.bottomTeam },
          overlays: { ...m.overlays },
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, spec.count);
      while (existing.length < spec.count) {
        existing.push(makePlaceholder(region.label, spec.label, spec.order, existing.length));
      }
      return { ...spec, items: existing };
    });

    for (let ri = 0; ri < rounds.length - 1; ri++) {
      const curr = rounds[ri].items;
      const next = rounds[ri + 1].items;
      curr.forEach((m, i) => {
        if (m.nextMatchupId) return;
        const target = next[Math.floor(i / 2)];
        if (!target) return;
        m.nextMatchupId = target.id;
        m.nextSlot = i % 2 === 0 ? "top" : "bottom";
      });
    }
    return { ...region, rounds };
  });

  const allRegionMatchups = fullRegions.flatMap((r) => r.rounds.flatMap((round) => round.items));
  const allCenterMatchups = tree.centerRounds.flatMap((r) => r.matchups);
  const all = [...allRegionMatchups, ...allCenterMatchups];
  const byId = new Map(all.map((m) => [m.id, m]));

  const maxRegionRounds = REGION_ROUND_SPEC.length;
  const leftRegions = fullRegions.slice(0, 2);
  const rightRegions = fullRegions.slice(2);
  const centerCols = Math.max(1, tree.centerRounds.length);
  const leftWidth = maxRegionRounds * COL_GAP + NODE_W;
  const centerWidth = centerCols * COL_GAP + NODE_W;
  const rightWidth = maxRegionRounds * COL_GAP + NODE_W;
  const canvasW = LEFT_PAD + leftWidth + 110 + centerWidth + 110 + rightWidth + LEFT_PAD;
  const rows = Math.max(leftRegions.length, rightRegions.length, 2);
  const canvasH = TOP_PAD + rows * REGION_H + 60;

  const placed: PositionedMatchup[] = [];
  const posById = new Map<string, { x: number; y: number }>();
  const anchors: JumpAnchor[] = [];
  const parentMap = new Map<string, string[]>();
  for (const m of all) {
    if (!m.nextMatchupId) continue;
    const list = parentMap.get(m.nextMatchupId) || [];
    list.push(m.id);
    parentMap.set(m.nextMatchupId, list);
  }

  const placeRegion = (regionList: typeof fullRegions, side: "left" | "right") => {
    regionList.forEach((region, idx) => {
      const originY = TOP_PAD + idx * REGION_H;
      const originX =
        side === "left"
          ? LEFT_PAD
          : LEFT_PAD + leftWidth + 110 + centerWidth + 110;
      anchors.push({
        id: `region-${region.label.toLowerCase()}`,
        label: region.label,
        x: side === "left" ? originX + NODE_W : originX + (maxRegionRounds - 1) * COL_GAP + NODE_W,
        y: originY + 90,
      });

      region.rounds.forEach((round, roundIdx) => {
        round.items.forEach((matchup, i) => {
            const slot = slotOffset(roundIdx, i);
            const x =
              side === "left"
                ? originX + roundIdx * COL_GAP
                : originX + (maxRegionRounds - 1 - roundIdx) * COL_GAP;
            const y = originY + slot * ROW_GAP;
            posById.set(matchup.id, { x, y });
            placed.push({ matchup, x, y, regionKey: region.key });
          });
      });
    });
  };

  placeRegion(leftRegions, "left");
  placeRegion(rightRegions, "right");

  const centerStartX = LEFT_PAD + leftWidth + 110;
  const centerOriginY = TOP_PAD + REGION_H / 2 - NODE_H;
  tree.centerRounds
    .sort((a, b) => a.order - b.order)
    .forEach((round, roundIdx) => {
      round.matchups.forEach((matchup, i) => {
        const parents = parentMap.get(matchup.id) || [];
        const parentY = parents
          .map((p) => posById.get(p)?.y)
          .filter((v): v is number => Number.isFinite(v));
        const y = parentY.length > 0 ? parentY.reduce((a, b) => a + b, 0) / parentY.length : centerOriginY + i * 170;
        const x = centerStartX + roundIdx * COL_GAP;
        posById.set(matchup.id, { x, y });
        placed.push({ matchup, x, y, regionKey: "center" });
      });
      const labelToken = round.label.toLowerCase().includes("championship")
        ? "round-championship"
        : round.label.toLowerCase().includes("final four")
          ? "round-final-four"
          : `round-${round.label.toLowerCase().replace(/\s+/g, "-")}`;
      anchors.push({
        id: labelToken,
        label: round.label,
        x: centerStartX + roundIdx * COL_GAP + NODE_W / 2,
        y: centerOriginY - 24,
      });
    });

  const paths = all
    .filter((m) => m.nextMatchupId && byId.has(m.nextMatchupId))
    .map((m) => {
      const from = posById.get(m.id);
      const to = posById.get(m.nextMatchupId as string);
      if (!from || !to) return null;
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const mid = x1 + (x2 - x1) * 0.5;
      return {
        id: `${m.id}->${m.nextMatchupId}`,
        d: `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`,
      };
    })
    .filter(Boolean) as Array<{ id: string; d: string }>;

  return { placed, paths, anchors, canvasW, canvasH };
}

export function PosterBracketCanvas({
  tree,
  onOpenGame,
}: {
  tree: LiveBracketTree;
  onOpenGame: (gameId: string) => void;
}) {
  const [zoom, setZoom] = useState(1.1);
  const [fitScale, setFitScale] = useState(1);
  const [activeJump, setActiveJump] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<{ d0: number; z0: number } | null>(null);

  const layout = useMemo(() => {
    try {
      return buildLayout(tree);
    } catch {
      return {
        placed: [] as PositionedMatchup[],
        paths: [] as Array<{ id: string; d: string }>,
        anchors: [] as JumpAnchor[],
        canvasW: 1800,
        canvasH: 1200,
      };
    }
  }, [tree]);
  const scale = fitScale * zoom;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fit = Math.max(0.34, Math.min(1, Math.min(viewport.clientWidth / layout.canvasW, viewport.clientHeight / layout.canvasH)));
    setFitScale(fit);
  }, [layout.canvasW, layout.canvasH]);

  const centerOn = (id: string) => {
    const viewport = viewportRef.current;
    const anchor = layout.anchors.find((a) => a.id === id);
    if (!viewport || !anchor) return;
    viewport.scrollTo({
      left: Math.max(0, anchor.x * scale - viewport.clientWidth * 0.45),
      top: Math.max(0, anchor.y * scale - viewport.clientHeight * 0.25),
      behavior: "smooth",
    });
    setActiveJump(id);
  };

  return (
    <section className="rounded-2xl border border-white/15 bg-[#0b1120] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/70">Poster Bracket Sheet</div>
        <button className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80" onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.06).toFixed(2))))}>-</button>
        <div className="text-xs text-white/70">{Math.round(zoom * 100)}%</div>
        <button className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80" onClick={() => setZoom((z) => Math.min(2.8, Number((z + 0.08).toFixed(2))))}>+</button>
        <button className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80" onClick={() => {
          setZoom(1);
          const viewport = viewportRef.current;
          if (viewport) viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
        }}>Fit</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {layout.anchors.map((a) => (
          <button
            key={a.id}
            onClick={() => centerOn(a.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
              activeJump === a.id
                ? "border-cyan-300/45 bg-cyan-500/18 text-cyan-100"
                : "border-white/15 bg-black/25 text-white/75 hover:text-white"
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div
        ref={viewportRef}
        className="h-[calc(100vh-240px)] overflow-auto rounded-lg border border-white/10 bg-[#060b18]"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.05 : 0.05;
          setZoom((z) => Math.max(0.7, Math.min(2.8, Number((z + delta).toFixed(2)))));
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const a = e.touches[0];
            const b = e.touches[1];
            touchRef.current = { d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z0: zoom };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && touchRef.current) {
            e.preventDefault();
            const a = e.touches[0];
            const b = e.touches[1];
            const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const ratio = touchRef.current.d0 > 0 ? d / touchRef.current.d0 : 1;
            setZoom(Math.max(0.7, Math.min(2.8, Number((touchRef.current.z0 * ratio).toFixed(2)))));
          }
        }}
        onTouchEnd={() => {
          touchRef.current = null;
        }}
      >
        <div
          className="relative"
          style={{
            width: layout.canvasW * scale,
            height: layout.canvasH * scale,
          }}
        >
          <div
            ref={contentRef}
            className="relative origin-top-left"
            style={{
              width: layout.canvasW,
              height: layout.canvasH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
          <svg width={layout.canvasW} height={layout.canvasH} className="absolute inset-0">
            {layout.paths.map((p) => (
              <path key={p.id} d={p.d} fill="none" stroke="rgba(120,200,255,0.55)" strokeWidth={1.6} />
            ))}
          </svg>

          {layout.placed.map(({ matchup, x, y }) => (
            <button
              key={matchup.id}
              onClick={() => onOpenGame(matchup.gameId)}
              className="absolute rounded-md border border-white/20 bg-[#0d1424] p-2 text-left transition hover:border-cyan-300/50"
              style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-bold", statusTone(matchup.state))}>
                  {matchup.statusLabel}
                </span>
                <span className="text-[10px] text-white/60">{matchup.clockLabel || matchup.startTimeLabel || matchup.round}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-white">
                <div className="flex min-w-0 items-center gap-1">
                  <TeamLogo teamCode={matchup.topTeam.logoCode} sport="ncaab" size={14} />
                  <span className="w-4 text-[10px] text-cyan-100">{matchup.topTeam.seed ? `#${matchup.topTeam.seed}` : ""}</span>
                  <span className="truncate">{matchup.topTeam.shortName}</span>
                </div>
                <span className="font-mono text-[12px]">{Number.isFinite(matchup.topTeam.score) ? matchup.topTeam.score : "-"}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-white/90">
                <div className="flex min-w-0 items-center gap-1">
                  <TeamLogo teamCode={matchup.bottomTeam.logoCode} sport="ncaab" size={14} />
                  <span className="w-4 text-[10px] text-cyan-100">{matchup.bottomTeam.seed ? `#${matchup.bottomTeam.seed}` : ""}</span>
                  <span className="truncate">{matchup.bottomTeam.shortName}</span>
                </div>
                <span className="font-mono text-[12px]">{Number.isFinite(matchup.bottomTeam.score) ? matchup.bottomTeam.score : "-"}</span>
              </div>
            </button>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
}

