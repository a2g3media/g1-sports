# G1 Sports Pool-Types Master Traceability

This checklist mirrors the user-approved master spec and is marked complete only after implementation + test gates.

## Framework + Domain

- [x] Reusable pool-type domain model includes `pool_type`, `sport`, `league_or_tournament`, `schedule_type`, `scoring_mode`, `pick_mode`, `elimination_mode`, `leaderboard_mode`, `entry_mode`, `commissioner_options`, payout bucket support, and multi-pool bundle support.
- [x] Pool catalog supports creation/editing/validation/scoring-display metadata requirements.
- [x] Canonical evaluator mapping supports all catalog pool keys.

## Sports Coverage

- [x] NFL
- [x] College Football
- [x] College Basketball
- [x] NBA
- [x] MLB
- [x] NHL
- [x] Golf
- [x] UFC / MMA
- [x] NASCAR
- [x] Soccer
- [x] Multi-sport

## Core Template Coverage

- [x] Pick'em
- [x] ATS Pick'em
- [x] Confidence
- [x] ATS Confidence
- [x] Survivor
- [x] Squares
- [x] Bracket
- [x] Prop
- [x] Streak
- [x] Upset / Underdog
- [x] Stat / Performance
- [x] Last Man Standing
- [x] Bundle Pool

## Required Pool Catalog Coverage

- [x] NFL pool family (Pick'em, ATS, Confidence, ATS Confidence, Survivor variants, Squares, Playoff, Prop, Margin, Underdog, Upset, Streak, SuperContest, Total Points, First TD)
- [x] College Football pool family (Top-25, ATS, Confidence, Upset, Survivor, Chaos Underdog, Pick-6, Bowl Mania, Bowl Pick'em)
- [x] College Basketball pool family (March Madness family, Squares, Tournament Squares, Calcutta)
- [x] NBA pool family
- [x] MLB pool family
- [x] NHL pool family
- [x] Golf pool family
- [x] UFC/MMA pool family
- [x] NASCAR pool family
- [x] Soccer pool family (including mixed league source selection support metadata)
- [x] All-Sport / All-American Survivor
- [x] Bundle pools with child-pool + overall-standings metadata

## Commissioner Configuration Requirements

- [x] Visibility controls
- [x] Sport/league/tournament selection
- [x] Game selection controls
- [x] Pick count controls
- [x] Multiple entries and naming behavior
- [x] Hidden picks/deadlines/late entry/missed-pick behavior
- [x] Tiebreakers/multipliers/bonus rules
- [x] Drop worst / best X
- [x] Round weighting/progressive payouts/custom payout buckets
- [x] Leaderboard mode + custom rule text

## Engine + API + Admin Wiring

- [x] League create endpoint validates against master catalog support.
- [x] Pool engine canonical mapping routes all pool keys to evaluator families.
- [x] Evaluator registry resolves non-legacy pool keys through canonical mapping.
- [x] Admin pool type library self-seeds from master catalog and returns enriched config.
- [x] Create flow preserves selected specific `poolTypeKey` while using template-compatible route format.

## Tests

- [x] Catalog contract script asserts all required names and evaluator mappings.
- [x] Evaluator QA script passes.
- [x] API contract script passes.
- [x] UI contract script passes.
