# G1 Design System Log

Last updated: 2026-03-13
Scope: `GameDetailPage` + Coach G core surfaces

## Core Palette

- Canvas: `#0B0F14`
- Secondary canvas: `#0F141B`
- Standard card: `#121821`
- Elevated card: `#16202B`
- Highlight card: `#1B2633`

## Text Tokens

- Primary text: `#E5E7EB`
- Secondary text: `#9CA3AF`
- Muted text: `#6B7280`

## Border + Depth Rules

- Standard border: `1px solid rgba(255,255,255,0.05)` (`border-white/[0.05]`)
- Hover border (interactive): up to `border-white/[0.10]`
- Card radius target: `14px` (or matching existing component radius)
- Shadows: soft black depth first, accent glow second

## Accent Semantics

- Blue: Coach G / AI intelligence
- Green: positive signal / edge
- Red: risk / injury / pressure
- Amber: caution / volatility
- Violet: premium analysis / spotlight

## Glow Guidelines

- Use glow as an accent, not a base fill.
- Keep glow opacity low (generally `0.08`-`0.24` range).
- Prefer local glows (avatar halo, section top line) over full-card bloom.
- One subtle glow layer per component surface is preferred.

## Motion Guidelines

- Motion should support state communication:
  - Monitoring: slow breathing/ambient
  - Alert: pulse with readable foreground
- Avoid transformations that blur avatar imagery.
- Keep durations calm and non-distracting for default states.

## Coach G Surface Notes

- `CoachGSpotlightCard`
  - Uses layered dark gradient base with cyan/violet radial accents.
  - Includes a subtle top highlight line for depth.
  - Avatar halo uses restrained glow to preserve sharpness.

- `CoachGAvatar` modal
  - Uses dark layered gradient aligned with global card system.
  - Drag handle has minimal cyan ambient glow.
  - Text follows token hierarchy (`#E5E7EB`, `#9CA3AF`, `#6B7280`).

## Change Log

- Finalized token consistency in `GameDetailPage` (removed white text drift).
- Applied palette hardening to `CoachGSpotlightCard` and `CoachGAvatar`.
- Added small glow + background polish to Coach G spotlight and modal surfaces.
