# Final Reliability Operating Checklist

## Hard Rule (Non-Negotiable)

No converted route family may call provider/live assembly on request path.

Converted request handlers may only:
- Read snapshot
- Validate snapshot
- Return snapshot or last-good snapshot
- Return explicit safe fallback if both missing

Converted request handlers may never:
- Call provider/live endpoints (SportsRadar/ESPN) on click
- Perform heavy normalization/join assembly on click
- Run request-time provider retry chains

## Program Status

- Program state: `[~] Phase 0 in progress`
- Current enforcement mode: `PHASE 0 GATE ACTIVE`
- Gate statement: `No Phase 1+ execution until all Phase 0 artifacts are complete and signed off.`

## Phase Index

- Phase 0: Deliverables and audit gate (no major code changes)
- Phase 1: Player routes conversion
- Phase 2: Team routes conversion
- Phase 3: Game routes conversion
- Phase 4: Home/Games feeds conversion
- Phase 5: Odds and remaining consumer routes conversion

## Task Ledger

| Task ID | Phase | Owner | Description | Deliverable | Status | Sign-off |
|---|---|---|---|---|---|---|
| FR-00-001 | 0 | Backend + Frontend | Build canonical route snapshot table with keys/schema/minimum completeness | `docs/reliability/phase0-route-snapshot-table.md` | [x] Done | [ ] Name / Date / Evidence |
| FR-00-002 | 0 | Backend | Audit request path for live/provider assembly and heavy joins | `docs/reliability/phase0-request-path-audit.md` | [x] Done | [ ] Name / Date / Evidence |
| FR-00-003 | 0 | Backend | Produce exact handler conversion plan by phase | `docs/reliability/phase0-handler-conversion-list.md` | [x] Done | [ ] Name / Date / Evidence |
| FR-00-004 | 0 | Backend + Ops | Builder/precompute plan by route family with write validation gates | `docs/reliability/phase0-builder-plan.md` | [x] Done | [ ] Name / Date / Evidence |
| FR-00-005 | 0 | QA + Ops | Release gates with strict pass/fail checks and stop-ship thresholds | `docs/reliability/phase0-release-gates.md` | [x] Done | [ ] Name / Date / Evidence |
| FR-00-006 | 0 | Program | Validate all five Phase 0 artifacts complete and linked | This checklist | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-01-001 | 1 | Backend | Convert `/api/page-data/player-profile` to read-only snapshot path | PR + gate evidence | [~] In Progress | [ ] Name / Date / Evidence |
| FR-01-002 | 1 | Frontend | Ensure player pages use single page-data path with no refresh dependency | PR + gate evidence | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-02-001 | 2 | Backend | Convert `/api/page-data/team-profile` to read-only snapshot path | PR + gate evidence | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-02-002 | 2 | Frontend | Team route parity checks (cold/warm consistency) | QA report | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-03-001 | 3 | Backend | Convert `/api/page-data/game-detail` to read-only snapshot path | PR + gate evidence | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-03-002 | 3 | Frontend | Game route no-refresh verification | QA report | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-04-001 | 4 | Backend | Convert `/api/page-data/games` + home feed source to read-only snapshots | PR + gate evidence | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-04-002 | 4 | Frontend | Home/Games no-blank-on-first-visit validation | QA report | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-05-001 | 5 | Backend | Convert `/api/page-data/odds`, `/sport-hub`, `/league-overview`, `/league-gameday`, `/league-picks` | PR + gate evidence | [ ] Not Started | [ ] Name / Date / Evidence |
| FR-05-002 | 5 | QA + Ops | Final full-family regression and rollout gate | Final report | [ ] Not Started | [ ] Name / Date / Evidence |

## Required Sign-off Boxes

- [ ] Backend lead sign-off (Phase 0 complete)
- [ ] Frontend lead sign-off (Phase 0 complete)
- [ ] QA lead sign-off (Phase 0 complete)
- [ ] Ops lead sign-off (Phase 0 complete)
- [ ] Program owner sign-off (Phase 0 gate passed)

## Release Gates (Global)

- [ ] `REFRESH_IMPROVED_ROUTE` trends to zero for converted families
- [ ] Wrong identity served: zero
- [ ] Empty success payload served: zero
- [ ] Cold click and warm click both usable without refresh
- [ ] Converted route provider-call count on request path: zero

## Stop-Ship Conditions

Ship is blocked if any condition is true:
- Any converted handler performs provider/live assembly on request path
- Any converted route requires refresh to become usable
- Any converted route returns wrong-identity payload
- Any converted route returns empty-shaped success payload
- Phase 0 artifacts incomplete or unsigned

## Decision Log

- 2026-04-07: Approved final reliability spec with strict read-only snapshot request path.
- 2026-04-07: Enforced sequencing rule: complete Phase 0 artifacts before major code conversion.
- 2026-04-07: Established hard program line: no converted route family may call provider/live assembly on request path.
- 2026-04-07: Began Phase 1 player backend conversion by separating read-only consumer route from warm-only builder route.

## Phase 0 Completion Banner

Until FR-00-006 and all sign-offs are complete:

`PHASE 0 INCOMPLETE - CODE CONVERSION BLOCKED`
