# Todo

## Bug Fixes
- #1: Fix odds conversion - show American odds (+520) instead of decimal (6.2)
- #2: Fix player props showing undefined player names

## SportsDataIO Cleanup (files reference sdio_ tables and functions)
- #3: Clean activeSlateService.ts, refreshOrchestrator.ts, internalScheduler.ts
- #4a: Clean games.ts (21 SDIO refs - sdio_games, sdio_odds_history queries)
- #4b: Clean scoreboard.ts (19 SDIO refs - sdio_games, sdio_odds_current queries)
- #4c: Clean sports-data-refresh.ts
- #5: Update sports-data/index.ts exports
- #6: Drop sdio_* database tables

## Completed
- ✓ Deleted sportsdataService.ts (NHL SDIO service)
- ✓ Cleaned game-detail.ts (removed SDIO fallbacks, API key, helper functions)
- ✓ Cleaned live-sweat.ts (removed sdio_games queries, getSdioLiveGames function)
