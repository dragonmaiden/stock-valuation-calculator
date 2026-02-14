# AGENTS.md — Workspace

## Startup

1. Read `SOUL.md` — your personality and values
2. Read `IDENTITY.md` — who you are this session
3. Read `MEMORY.md` — long-term project knowledge (architecture, known issues, decisions)
4. Read `memory/YYYY-MM-DD.md` — today's + yesterday's daily logs (what happened recently)
5. Read `ROADMAP.md` — the product vision and what to build next
6. Read `GUARDRAILS.md` — strict rules on what you can/can't do (MUST FOLLOW)
7. Read `HEARTBEAT.md` — what to do and how to communicate
8. Check `ISSUES.md` — QA-found bugs are top priority
9. `git log -5 --oneline` — know what happened recently

## Tech Stack
- **Framework**: Next.js 14 (App Router, `app/` directory)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Font**: JetBrains Mono
- **Data**: SEC EDGAR API (primary) + Yahoo Finance (secondary)
- **Deploy**: Vercel

## Workflow (every heartbeat)

```
1. git pull                          # get latest
2. Read startup files above          # context
3. git log -5 --oneline              # recent changes
4. Scan codebase for improvements    # find work
5. MESSAGE USER on Telegram          # what you found, what you plan to do
6. Make ONE focused change           # implement
7. npm run build                     # verify
8. git add -A && git commit          # commit
9. git push origin main              # push
10. MESSAGE USER on Telegram         # what you did + what's next
11. Update daily log (memory/YYYY-MM-DD.md)  # log what you did
12. Update MEMORY.md if you learned something important
```

## Style Guide
- **React**: Functional components with hooks, no class components
- **State**: Keep state as local as possible, lift only when needed
- **CSS**: Tailwind utility classes, extract to @apply for repeated patterns
- **Naming**: camelCase for functions/vars, PascalCase for components, SCREAMING_SNAKE for constants
- **File structure**: one component per file, co-locate styles and tests
- **Imports**: group by external → internal → relative, alphabetized within groups
- **Types**: JSDoc when TypeScript isn't available

## Architecture Vision

The `page.js` monolith (230KB) should evolve into:
```
app/
  page.js                  → thin shell, just layout + routing
  components/
    SearchBar.jsx          → ticker search + autocomplete
    ValuationSummary.jsx   → DCF, Graham, ratios overview
    MetricsGrid.jsx        → key financial metrics cards
    Charts/
      MarginsChart.jsx
      ReturnsChart.jsx
      IncomeChart.jsx
      CashFlowChart.jsx
      BalanceSheetChart.jsx
    HistoricalTable.jsx    → 10-year ratio tables
    CompanyProfile.jsx     → header, description, sector info
  hooks/
    useStockData.js        → data fetching + caching
    useValuation.js        → calculation logic
  utils/
    formatters.js          → number/currency/date formatting
    calculations.js        → DCF, Graham, ratio calculations
  api/
    stock/route.js         → (existing) SEC + Yahoo data
```

## Architecture Notes
- `app/page.js` is a 230KB monolith — splitting this into components is high-priority
- `app/api/stock/route.js` handles all API calls (SEC + Yahoo)
- `scripts/oracleCalibration.js` is a calibration utility
- No test suite exists yet

## Commit Message Format
```
type: short description

- detail 1
- detail 2
```
Types: `fix`, `feat`, `refactor`, `perf`, `style`, `test`, `docs`, `chore`

## Priorities
1. **Correctness** of financial calculations — these affect investment decisions
2. **User experience** — fast, responsive, informative error messages
3. **Code maintainability** — future humans should understand every file
4. **Mobile-first** — every UI change must look good on phone screens
5. **Accessibility** — semantic HTML, ARIA labels, keyboard navigation

## What NOT to do
- Don't change the data sources (SEC + Yahoo are intentional)
- Don't add new API key dependencies without noting it in README
- Don't make massive multi-file rewrites in a single commit
- Don't remove existing features
- Don't ignore build errors — if it doesn't build, don't push
