# Phase 0 - Route Snapshot Table

## Scope

Consumer route families only:
- home
- games
- odds
- sport hubs
- game detail
- team
- player
- props/player detail
- consumer league/pool routes on same data platform

## Canonical Route Snapshot Matrix (Layer C)

| Route Family | Primary Handler(s) | Canonical Key | Layers Used | Required Fields for Usable Snapshot | Last-Good Policy | Freshness Class |
|---|---|---|---|---|---|---|
| Home | feed data from `/api/page-data/games` | `pd:snap:v2:home:{sport}:{date}` | B + C | `date`, `sport`, non-empty slate for active dates or explicit no-games marker | return `pd:lastgood:v2:home:{sport}:{date}` before unavailable | fast |
| Games | `/api/page-data/games` | `pd:snap:v2:games:{sport}:{date}:{tab}` | B + C | stable game card shell, canonical `gameId`, status/time/team fields | return `pd:lastgood:v2:games:{sport}:{date}:{tab}` | fast |
| Odds | `/api/page-data/odds` | `pd:snap:v2:odds:{sport}:{scope}:{dateOrGameId}` | B + C | odds map keyed by canonical `gameId`, scope metadata, game shell when required | return `pd:lastgood:v2:odds:{sport}:{scope}:{dateOrGameId}` | fast |
| Sport Hub | `/api/page-data/sport-hub` | `pd:snap:v2:sport-hub:{sport}:{date}` | B + C | sport/date metadata, non-empty hub game context for active date or explicit no-games | return `pd:lastgood:v2:sport-hub:{sport}:{date}` | medium |
| Game Detail | `/api/page-data/game-detail` | `pd:snap:v2:game:{sport}:{gameId}` | B + C | canonical `gameId`, teams, status, scheduled/live time, detail shell modules | return `pd:lastgood:v2:game:{sport}:{gameId}` | fast |
| Team Route | `/api/page-data/team-profile` | `pd:snap:v2:team-route:{sport}:{teamId}` | A + B + C | canonical `teamId`, header identity, roster index pointer or core content block | return `pd:lastgood:v2:team-route:{sport}:{teamId}` | medium |
| Player Route | `/api/page-data/player-profile` | `pd:snap:v2:player-route:{sport}:{playerId}` | A + B + C | canonical `playerId`, identity, at least one meaningful content module | return `pd:lastgood:v2:player-route:{sport}:{playerId}` | medium |
| Props Player Detail | player detail route payloads from player route snapshot | `pd:snap:v2:props-player:{sport}:{playerId}` | A + B + C | canonical `playerId`, route sections used by props-driven player click | return `pd:lastgood:v2:props-player:{sport}:{playerId}` | medium |
| League Overview | `/api/page-data/league-overview` | `pd:snap:v2:league-overview:{leagueId}` | C | league identity, standings or league core summary, period info | return `pd:lastgood:v2:league-overview:{leagueId}` | medium |
| League GameDay | `/api/page-data/league-gameday` | `pd:snap:v2:league-gameday:{leagueId}:{periodId}` | C | league identity, period, events/picks summary | return `pd:lastgood:v2:league-gameday:{leagueId}:{periodId}` | medium |
| League Picks | `/api/page-data/league-picks` | `pd:snap:v2:league-picks:{leagueId}:{periodId}` | C | league identity, period, picks + eligibility modules | return `pd:lastgood:v2:league-picks:{leagueId}:{periodId}` | medium |

## Base Snapshot Matrix (Layers A/B)

| Snapshot Type | Canonical Key | Required Identity Fields | Required Content Fields | Write Validators | Read Validators |
|---|---|---|---|---|---|
| Player Base (A) | `pd:base:v2:player:{sport}:{playerId}` | `playerId`, `sport`, resolved displayName, canonical team ref | profile header, season summary and/or recent log summary, metadata block | reject if wrong identity, empty-shaped payload, no meaningful section | reject if identity mismatch, missing required shape, degraded placeholder |
| Team Base (A) | `pd:base:v2:team:{sport}:{teamId}` | `teamId`, `sport`, canonical name/alias | team header, roster index, core team stats/recent context | reject if wrong identity or no roster/core module | reject if id mismatch or missing header + roster/core |
| Game Snapshot (B) | `pd:base:v2:game:{sport}:{gameId}` | `gameId`, `sport`, home/away team IDs | status/time, matchup shell, odds summary pointer/data | reject if id mismatch or missing team/time shell | reject if id mismatch or missing game shell |

## Canonical Key Rules

- Canonical IDs are authoritative for all writes and reads: `playerId`, `teamId`, `gameId`, `leagueId`.
- Names/slugs/aliases are lookup-only and must resolve to canonical IDs before key generation.
- Snapshot keys include explicit schema version and route/base namespace.
- Any non-canonical alias key is transitional read-compat only and cannot be authoritative for write success.

## Unavailable Contract

If snapshot and last-good are both missing:
- return explicit unavailable payload (`degraded: true`, `partialReason: "snapshot_missing"`),
- never perform provider fetch/build/normalize/join on request path,
- never return empty fake success payload.
