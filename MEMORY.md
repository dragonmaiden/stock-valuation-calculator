# MEMORY.md — Stock Valuation Calculator

> Long-term project knowledge. This file persists across all sessions.
> Agents: update this when you learn something important about the project.

## Project Facts
- **Repo**: dragonmaiden/stock-valuation-calculator
- **Stack**: Next.js 14, Tailwind CSS, Recharts, JetBrains Mono font
- **Data sources**: SEC EDGAR (primary), Yahoo Finance (secondary)
- **Deploy**: Vercel
- **Owner**: Sekoyaz (changyuesin@gmail.com)

## Architecture
- `app/page.js` — main monolith (~230KB, needs decomposition — Phase 1.3)
- `app/api/stock/route.js` — single API route, fetches live data
- No database — all data fetched fresh per request
- No components directory yet — everything in page.js

## Known Issues
- TTM calculations can use non-contiguous quarters (partially fixed: commit 968258c)
- Some valuation models return misleading numbers on negative earnings
- Data freshness not displayed — user can't tell if data is current

## Valuation Models in Use
- DCF (Discounted Cash Flow)
- Graham Number
- Earnings Power Value (EPV)
- Composite valuation (blended)
- Two-stage earnings model

## Key Decisions
- Phase 1 (data accuracy) must be completed before Phase 3 (entry/exit signals)
- Guardrails: max 50 lines per commit, 1 focused change per cycle
- All agents report to Telegram (chat ID: 244024848)

## User Preferences
- Wants Bloomberg-terminal-level analytics
- Priorities: data accuracy > clean UI > entry/exit signals
- Prefers asking before big changes
- Wants constant Telegram updates and interactivity
