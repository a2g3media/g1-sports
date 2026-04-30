# Odds Engine Hard Lock

The Odds engine is production-stable and frozen.

Do not modify any of the following without explicit approval:

- `src/worker/routes/page-data.ts` odds logic
- `src/worker/services/sportsRadarOddsService.ts`
- `src/react-app/pages/OddsPage.tsx` fetch/retry/merge/cache architecture
- `src/react-app/components/OddsCard.tsx` period-market rendering
- Any `oddsSummaryByGame` shaping
- Sport period mappings: NBA `1H`, NHL `1P`, MLB `F5`
- Odds routing helpers

Accepted current behavior:

- Cold load remains stable.
- Odds board remains grouped and key-scoped by date/sport.
- Period rows render per sport mapping:
  - NBA `1H`
  - NHL `1P`
  - MLB `F5`
- If provider does not return a period field (for example some NHL period totals), that field stays blank and valid period spread/ML still render.
