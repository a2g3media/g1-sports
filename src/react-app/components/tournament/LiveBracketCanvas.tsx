import { useEffect, useMemo, useRef, useState } from "react";
import { BracketConnector } from "@/react-app/components/tournament/BracketConnector";
import { BracketFocusDrawer } from "@/react-app/components/tournament/BracketFocusDrawer";
import { BracketRegion } from "@/react-app/components/tournament/BracketRegion";
import { BracketRoundColumn } from "@/react-app/components/tournament/BracketRoundColumn";
import { MatchupNode } from "@/react-app/components/tournament/MatchupNode";
import { RoundFilterBar } from "@/react-app/components/tournament/RoundFilterBar";
import { TournamentViewModeToggle } from "@/react-app/components/tournament/TournamentViewModeToggle";
import type {
  BracketViewMode,
  LiveBracketMatchup,
  LiveBracketRegion,
  LiveBracketTree,
} from "@/react-app/lib/ncaabTournamentData";

function filterRegion(region: LiveBracketRegion, activeRound: string): LiveBracketRegion {
  if (activeRound === "ALL") return region;
  return {
    ...region,
    rounds: region.rounds.filter((r) => r.label === activeRound),
  };
}

function pathFromMatchup(matchupId: string, matchups: LiveBracketMatchup[]): Set<string> {
  const byId = new Map(matchups.map((m) => [m.id, m]));
  const reverse = new Map<string, string[]>();
  for (const m of matchups) {
    if (!m.nextMatchupId) continue;
    const prev = reverse.get(m.nextMatchupId) || [];
    prev.push(m.id);
    reverse.set(m.nextMatchupId, prev);
  }

  const visited = new Set<string>();
  const queue = [matchupId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node?.nextMatchupId) queue.push(node.nextMatchupId);
    const prev = reverse.get(id) || [];
    for (const p of prev) queue.push(p);
  }
  return visited;
}

const REGION_ORDER = ["South", "East", "Midwest", "West", "Final Four", "Championship"];
const ROUND_ORDER = ["Round of 64", "Round of 32", "Sweet 16", "Elite Eight", "Final Four", "Championship"];

function regionRank(region: string): number {
  const idx = REGION_ORDER.findIndex((r) => r.toLowerCase() === region.toLowerCase());
  return idx === -1 ? 99 : idx;
}

export function LiveBracketCanvas({
  tree,
  mode,
  onModeChange,
  onOpenGame,
  fullPager = false,
  onExitFullPager,
}: {
  tree: LiveBracketTree;
  mode: BracketViewMode;
  onModeChange: (mode: BracketViewMode) => void;
  onOpenGame: (gameId: string) => void;
  fullPager?: boolean;
  onExitFullPager?: () => void;
}) {
  const isClassic = mode === "classic";
  const [activeRound, setActiveRound] = useState<string>("ALL");
  const [activeRegion, setActiveRegion] = useState<string>("ALL");
  const [layoutStyle, setLayoutStyle] = useState<"progression" | "regional">("progression");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [focusMatchupId, setFocusMatchupId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [activeJump, setActiveJump] = useState<string>("");
  const [pulseJump, setPulseJump] = useState<string>("");
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number }>({
    active: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
  });
  const touchRef = useRef<{ d0: number; z0: number } | null>(null);
  const activeJumpScoreRef = useRef<number>(Number.POSITIVE_INFINITY);

  const allMatchups = useMemo(
    () => [
      ...tree.regions.flatMap((r) => r.rounds.flatMap((round) => round.matchups)),
      ...tree.centerRounds.flatMap((round) => round.matchups),
    ],
    [tree]
  );

  const highlightedByTeam = useMemo(() => {
    if (!selectedTeam) return new Set<string>();
    return new Set(
      allMatchups
        .filter(
          (m) =>
            m.topTeam.name === selectedTeam ||
            m.bottomTeam.name === selectedTeam ||
            m.winnerName === selectedTeam
        )
        .map((m) => m.id)
    );
  }, [allMatchups, selectedTeam]);

  const highlightedByFocus = useMemo(() => {
    if (!focusMatchupId) return new Set<string>();
    return pathFromMatchup(focusMatchupId, allMatchups);
  }, [allMatchups, focusMatchupId]);

  const highlightedMatchupIds = useMemo(
    () => new Set<string>([...highlightedByTeam, ...highlightedByFocus]),
    [highlightedByTeam, highlightedByFocus]
  );

  const visibleRegions = useMemo(
    () =>
      tree.regions
        .filter((r) => activeRegion === "ALL" || r.label === activeRegion)
        .map((r) => filterRegion(r, activeRound))
        .filter((r) => r.rounds.length > 0),
    [tree, activeRound, activeRegion]
  );

  const visibleCenterRounds = useMemo(
    () => (activeRound === "ALL" ? tree.centerRounds : tree.centerRounds.filter((r) => r.label === activeRound)),
    [tree.centerRounds, activeRound]
  );

  const focusMatchup = useMemo(
    () => allMatchups.find((m) => m.id === focusMatchupId),
    [allMatchups, focusMatchupId]
  );

  const progressionColumns = useMemo(() => {
    const rounds = ROUND_ORDER.filter((round) => allMatchups.some((m) => m.round === round));
    const activeRounds = activeRound === "ALL" ? rounds : rounds.filter((r) => r === activeRound);
    return activeRounds.map((round) => {
      const items = allMatchups
        .filter((m) => m.round === round)
        .filter((m) => activeRegion === "ALL" || m.region === activeRegion)
        .sort((a, b) => {
          const rr = regionRank(a.region) - regionRank(b.region);
          if (rr !== 0) return rr;
          return a.id.localeCompare(b.id);
        });
      const grouped = items.reduce<Record<string, LiveBracketMatchup[]>>((acc, matchup) => {
        if (!acc[matchup.region]) acc[matchup.region] = [];
        acc[matchup.region].push(matchup);
        return acc;
      }, {});
      return { round, grouped };
    });
  }, [allMatchups, activeRound, activeRegion]);

  const regionLabels = useMemo(() => tree.regions.map((r) => r.label), [tree.regions]);

  const handleQuickJump = (target: string) => {
    const anchor = target === "championship" ? "round-championship" : "round-final-four";
    const node = canvasRef.current?.querySelector(`[data-round-anchor="${anchor}"]`);
    if (node instanceof HTMLElement) node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  const hasVisibleRegional = visibleRegions.length > 0 || visibleCenterRounds.length > 0;
  const hasVisibleProgression = progressionColumns.some((c) => Object.values(c.grouped).some((list) => list.length > 0));
  const hasVisibleBracket = layoutStyle === "progression" ? hasVisibleProgression : hasVisibleRegional;
  const zoomPct = Math.round(zoom * 100);
  const effectiveScale = fullPager ? fitScale * zoom : zoom;
  const canPan = fullPager && effectiveScale > fitScale + 0.02;
  const jumpRegions = useMemo(
    () => tree.regions.map((r) => r.label).filter(Boolean),
    [tree.regions]
  );
  const jumpTargets = useMemo(
    () => [
      ...jumpRegions.map((region) => `region-${region.toLowerCase()}`),
      "round-final-four",
      "round-championship",
    ],
    [jumpRegions]
  );

  const clampPan = (x: number, y: number, scaleValue: number) => {
    if (!fullPager) return { x: 0, y: 0 };
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return { x: 0, y: 0 };
    const scaledW = content.offsetWidth * scaleValue;
    const scaledH = content.offsetHeight * scaleValue;
    const minX = Math.min(0, viewport.clientWidth - scaledW);
    const minY = Math.min(0, viewport.clientHeight - scaledH);
    return {
      x: Math.max(minX, Math.min(0, x)),
      y: Math.max(minY, Math.min(0, y)),
    };
  };

  useEffect(() => {
    if (!fullPager) return;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const updateFit = () => {
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      const cw = content.offsetWidth;
      const ch = content.offsetHeight;
      if (!w || !h || !cw || !ch) return;
      const nextFit = Math.max(0.5, Math.min(1, Math.min(w / cw, h / ch)));
      setFitScale(nextFit);
      setPan(clampPan(0, 0, nextFit * zoom));
    };
    updateFit();
    const ro = new ResizeObserver(updateFit);
    ro.observe(viewport);
    ro.observe(content);
    return () => ro.disconnect();
  }, [fullPager, zoom]);

  useEffect(() => {
    if (!fullPager) return;
    setPan((prev) => clampPan(prev.x, prev.y, fitScale * zoom));
  }, [zoom, fitScale, fullPager]);

  useEffect(() => {
    if (!pulseJump) return;
    const tid = window.setTimeout(() => setPulseJump(""), 240);
    return () => window.clearTimeout(tid);
  }, [pulseJump]);

  const startMouseDrag = (clientX: number, clientY: number) => {
    if (!canPan) return;
    dragRef.current = { active: true, sx: clientX, sy: clientY, px: pan.x, py: pan.y };
  };

  const moveMouseDrag = (clientX: number, clientY: number) => {
    if (!dragRef.current.active) return;
    const dx = clientX - dragRef.current.sx;
    const dy = clientY - dragRef.current.sy;
    const next = clampPan(dragRef.current.px + dx, dragRef.current.py + dy, effectiveScale);
    setPan(next);
  };

  const endMouseDrag = () => {
    dragRef.current.active = false;
  };

  const distance = (touches: TouchList) => {
    if (touches.length < 2) return 0;
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const applyZoom = (nextZoom: number) => {
    const clamped = Math.max(0.75, Math.min(2.5, Number(nextZoom.toFixed(3))));
    setZoom(clamped);
  };

  const fitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const centerOnAnchor = (anchor: string) => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const node = canvasRef.current?.querySelector(`[data-round-anchor="${anchor}"]`);
    if (!(viewport instanceof HTMLElement) || !(content instanceof HTMLElement) || !(node instanceof HTMLElement)) return;
    const scaleValue = fullPager ? fitScale * zoom : zoom;
    if (scaleValue <= 0) return;
    const targetX = -(node.offsetLeft * scaleValue - viewport.clientWidth * 0.45);
    const targetY = -(node.offsetTop * scaleValue - viewport.clientHeight * 0.2);
    setPan(clampPan(targetX, targetY, scaleValue));
    setActiveJump(anchor);
    setPulseJump(anchor);
    activeJumpScoreRef.current = 0;
  };

  useEffect(() => {
    if (!fullPager) return;
    const viewport = viewportRef.current;
    if (!(viewport instanceof HTMLElement)) return;
    const scaleValue = fitScale * zoom;
    if (scaleValue <= 0) return;

    const viewportCx = viewport.clientWidth / 2;
    const viewportCy = viewport.clientHeight / 2;
    let bestId = "";
    let bestScore = Number.POSITIVE_INFINITY;

    for (const id of jumpTargets) {
      const node = canvasRef.current?.querySelector(`[data-round-anchor="${id}"]`);
      if (!(node instanceof HTMLElement)) continue;
      const cx = pan.x + (node.offsetLeft + node.offsetWidth / 2) * scaleValue;
      const cy = pan.y + (node.offsetTop + node.offsetHeight / 2) * scaleValue;
      const dx = cx - viewportCx;
      const dy = cy - viewportCy;
      const score = dx * dx + dy * dy;
      if (score < bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (!bestId) return;
    const currentId = activeJump;
    const currentScore = currentId ? activeJumpScoreRef.current : Number.POSITIVE_INFINITY;
    // Sticky threshold prevents jump-chip flicker when two anchors are nearly tied.
    const shouldSwitch = !currentId || bestId === currentId || bestScore < currentScore * 0.9;
    if (shouldSwitch) {
      setActiveJump(bestId);
      activeJumpScoreRef.current = bestScore;
    } else {
      activeJumpScoreRef.current = currentScore;
    }
  }, [fullPager, pan, zoom, fitScale, jumpTargets, activeJump]);

  return (
    <section
      className={
        isClassic
          ? "rounded-2xl border border-white/20 bg-gradient-to-b from-[#121726] to-[#0f1523] p-3 md:p-4"
          : "rounded-2xl border border-white/15 bg-gradient-to-b from-[#0d1224] to-[#090f1d] p-3 md:p-4"
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!fullPager ? (
          <RoundFilterBar
            rounds={tree.rounds}
            regions={regionLabels}
            activeRound={activeRound}
            activeRegion={activeRegion}
            onRoundChange={setActiveRound}
            onRegionChange={setActiveRegion}
            onQuickJump={handleQuickJump}
          />
        ) : (
          <div className="rounded-md border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-white/70">
            Pinch to zoom. Drag to pan. Use chips to jump regions.
          </div>
        )}
        <div className="ml-auto">
          <TournamentViewModeToggle value={mode} onChange={onModeChange} />
        </div>
        {!fullPager && (
          <div className="inline-flex rounded-md border border-white/15 bg-black/30 p-1 text-xs">
            <button
              type="button"
              onClick={() => setLayoutStyle("progression")}
              className={`rounded px-2 py-1 ${layoutStyle === "progression" ? "bg-cyan-300 text-black" : "text-white/75 hover:text-white"}`}
            >
              Progression
            </button>
            <button
              type="button"
              onClick={() => setLayoutStyle("regional")}
              className={`rounded px-2 py-1 ${layoutStyle === "regional" ? "bg-white text-black" : "text-white/75 hover:text-white"}`}
            >
              Regional
            </button>
          </div>
        )}
        {fullPager && (
          <button
            type="button"
            onClick={onExitFullPager}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
          >
            Back To Command Center
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-white/70">
          {isClassic ? "Classic Sheet" : "Canvas"}: {tree.totalMatchups} matchups
        </div>
        <div className="inline-flex items-center rounded-md border border-white/10 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => applyZoom(zoom - 0.05)}
            className="rounded px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Zoom out bracket"
          >
            -
          </button>
          <span className="px-2 text-white/70">{zoomPct}%</span>
          <button
            type="button"
            onClick={() => applyZoom(zoom + 0.1)}
            className="rounded px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Zoom in bracket"
          >
            +
          </button>
        </div>
        {fullPager && (
          <button
            type="button"
            onClick={fitToScreen}
            className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-white/70 hover:text-white"
          >
            Fit
          </button>
        )}
        {fullPager && (
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-white/70 hover:text-white"
          >
            100%
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setSelectedTeam(null);
            setFocusMatchupId(null);
            fitToScreen();
          }}
          className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-white/70 hover:text-white"
        >
          Reset View
        </button>
      </div>

      {fullPager && jumpRegions.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {jumpRegions.map((region) => (
            (() => {
              const id = `region-${region.toLowerCase()}`;
              const isActive = activeJump === id;
              return (
            <button
              key={region}
              type="button"
              onClick={() => centerOnAnchor(id)}
              className={
                isActive
                  ? `rounded-full border border-cyan-300/40 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition-all duration-200 ${pulseJump === id ? "scale-[1.04] shadow-[0_0_14px_rgba(34,211,238,0.45)]" : ""}`
                  : "rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white/75 transition-all duration-200 hover:text-white"
              }
              aria-pressed={isActive}
            >
              {region}
            </button>
              );
            })()
          ))}
          <button
            type="button"
            onClick={() => centerOnAnchor("round-final-four")}
            className={
              activeJump === "round-final-four"
                ? `rounded-full border border-cyan-300/45 bg-cyan-500/18 px-2.5 py-1 text-[11px] font-semibold text-cyan-50 transition-all duration-200 ${pulseJump === "round-final-four" ? "scale-[1.04] shadow-[0_0_14px_rgba(34,211,238,0.45)]" : ""}`
                : "rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition-all duration-200"
            }
            aria-pressed={activeJump === "round-final-four"}
          >
            Final Four
          </button>
          <button
            type="button"
            onClick={() => centerOnAnchor("round-championship")}
            className={
              activeJump === "round-championship"
                ? `rounded-full border border-amber-300/45 bg-amber-500/18 px-2.5 py-1 text-[11px] font-semibold text-amber-50 transition-all duration-200 ${pulseJump === "round-championship" ? "scale-[1.04] shadow-[0_0_14px_rgba(251,191,36,0.45)]" : ""}`
                : "rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100 transition-all duration-200"
            }
            aria-pressed={activeJump === "round-championship"}
          >
            Championship
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className={fullPager ? "h-[calc(100vh-230px)] overflow-hidden rounded-lg border border-white/10 bg-black/20 touch-none" : "overflow-x-auto pb-2 [scrollbar-width:thin]"}
        onWheel={(e) => {
          if (!fullPager || (!e.ctrlKey && !e.metaKey)) return;
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.06 : 0.06;
          applyZoom(zoom + delta);
        }}
        onMouseMove={(e) => moveMouseDrag(e.clientX, e.clientY)}
        onMouseUp={endMouseDrag}
        onMouseLeave={endMouseDrag}
        onTouchStart={(e) => {
          if (!fullPager) return;
          if (e.touches.length === 2) {
            touchRef.current = { d0: distance(e.touches), z0: zoom };
            return;
          }
          if (e.touches.length === 1 && canPan) {
            const t = e.touches[0];
            dragRef.current = { active: true, sx: t.clientX, sy: t.clientY, px: pan.x, py: pan.y };
          }
        }}
        onTouchMove={(e) => {
          if (!fullPager) return;
          if (e.touches.length === 2 && touchRef.current) {
            e.preventDefault();
            const d = distance(e.touches);
            const ratio = touchRef.current.d0 > 0 ? d / touchRef.current.d0 : 1;
            applyZoom(touchRef.current.z0 * ratio);
            return;
          }
          if (e.touches.length === 1 && dragRef.current.active) {
            e.preventDefault();
            const t = e.touches[0];
            const dx = t.clientX - dragRef.current.sx;
            const dy = t.clientY - dragRef.current.sy;
            const next = clampPan(dragRef.current.px + dx, dragRef.current.py + dy, effectiveScale);
            setPan(next);
          }
        }}
        onTouchEnd={() => {
          dragRef.current.active = false;
          touchRef.current = null;
        }}
      >
        {!hasVisibleBracket && (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/25 p-4 text-sm text-white/70">
            No bracket nodes match this filter yet. Try All Rounds or All Regions.
          </div>
        )}

        <div
          ref={canvasRef}
          className={fullPager ? "h-full w-full overflow-hidden p-2 md:p-3" : ""}
        >
          <div
            ref={contentRef}
            className="flex min-w-max items-start gap-4 origin-top-left transition-transform duration-200 md:gap-5"
            style={{
              transform: fullPager
                ? `translate(${pan.x}px, ${pan.y}px) scale(${effectiveScale})`
                : `scale(${zoom})`,
            }}
            onMouseDown={(e) => startMouseDrag(e.clientX, e.clientY)}
          >
          {layoutStyle === "progression" && (
            <section className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-cyan-200">Tournament Progression</h3>
              <div className="flex min-w-max items-stretch gap-2">
                {progressionColumns.map((col, idx) => (
                  <div
                    key={`flow-${col.round}`}
                    className="flex items-stretch gap-2"
                    data-round-anchor={
                      col.round === "Championship"
                        ? "round-championship"
                        : col.round === "Final Four"
                          ? "round-final-four"
                          : undefined
                    }
                  >
                    <div className="w-[296px] rounded-xl border border-white/10 bg-black/25 p-2.5">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">{col.round}</p>
                      <div className="space-y-2.5">
                        {REGION_ORDER.filter((region) => (col.grouped[region] || []).length > 0).map((region) => (
                          <div key={`${col.round}-${region}`} className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">{region}</p>
                            <div className="space-y-1.5">
                              {(col.grouped[region] || []).map((matchup) => (
                                <MatchupNode
                                  key={matchup.id}
                                  matchup={matchup}
                                  mode={mode}
                                  selectedTeam={selectedTeam}
                                  highlighted={highlightedMatchupIds.has(matchup.id)}
                                  onOpenMatchup={onOpenGame}
                                  onSelectTeam={setSelectedTeam}
                                  onHover={setFocusMatchupId}
                                  onFocus={setFocusMatchupId}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                        {Object.values(col.grouped).every((list) => list.length === 0) && (
                          <div className="rounded-lg border border-dashed border-white/15 p-2 text-xs text-white/50">
                            No games in this round for current filter.
                          </div>
                        )}
                      </div>
                    </div>
                    {idx < progressionColumns.length - 1 && (
                      <BracketConnector mode={mode} active={Boolean(selectedTeam || focusMatchupId || isClassic)} />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {layoutStyle === "regional" && (
            <>
              {visibleRegions.map((region) => (
                <div key={region.key} data-round-anchor={`region-${region.label.toLowerCase()}`}>
                  <BracketRegion
                    region={region}
                    mode={mode}
                    selectedTeam={selectedTeam}
                    highlightedMatchupIds={highlightedMatchupIds}
                    onOpenMatchup={onOpenGame}
                    onSelectTeam={setSelectedTeam}
                    onHoverMatchup={setFocusMatchupId}
                    onFocusMatchup={setFocusMatchupId}
                  />
                </div>
              ))}

              {visibleCenterRounds.length > 0 && (
                <section
                  className={
                    isClassic
                      ? "space-y-2 rounded-xl border border-amber-200/20 bg-amber-200/[0.04] p-3"
                      : "space-y-2 rounded-xl border border-cyan-300/25 bg-cyan-500/[0.04] p-3 shadow-[0_0_26px_rgba(56,189,248,0.08)]"
                  }
                >
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-cyan-200">Final Four / Championship</h3>
                  <div className="flex min-w-max items-stretch gap-2">
                    {visibleCenterRounds.map((round, idx) => (
                      <div
                        key={`center-${round.key}`}
                        className="flex items-stretch gap-2"
                        data-round-anchor={
                          round.label.toLowerCase().includes("championship")
                            ? "round-championship"
                            : round.label.toLowerCase().includes("final four")
                              ? "round-final-four"
                              : undefined
                        }
                      >
                        <BracketRoundColumn
                          round={round}
                          mode={mode}
                          selectedTeam={selectedTeam}
                          highlightedMatchupIds={highlightedMatchupIds}
                          onOpenMatchup={onOpenGame}
                          onSelectTeam={setSelectedTeam}
                          onHoverMatchup={setFocusMatchupId}
                          onFocusMatchup={setFocusMatchupId}
                        />
                        {idx < visibleCenterRounds.length - 1 && (
                          <BracketConnector mode={mode} active={Boolean(selectedTeam || focusMatchupId || isClassic)} />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      {!isClassic && !fullPager && (
        <div className="mt-3">
          <BracketFocusDrawer matchup={focusMatchup} onOpen={onOpenGame} />
        </div>
      )}
    </section>
  );
}

