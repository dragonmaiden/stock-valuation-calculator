# ROADMAP.md — Stock Valuation Calculator

## Vision

**The free Bloomberg terminal for retail investors.**

A tool that tells you — backed by data, not vibes — when a stock is cheap and when it's expensive.
Fundamentals + technicals + statistical deviation = optimal entry/exit price range with confidence levels.

Anyone, anywhere, types a ticker and gets a clear answer: *"Is this stock worth buying right now, and at what price?"*

---

## Phase 1: Fix the Foundation (CURRENT PRIORITY)
> *"Don't build on broken ground."*

**Goal:** Every number on screen is correct and trustworthy.

### 1.1 Data Accuracy
- [ ] Fix all known data discrepancies (Oracle will find them)
- [ ] Ensure SEC EDGAR data matches latest filings
- [ ] Validate TTM calculations use correct 4 quarters
- [ ] Handle edge cases: negative earnings, missing data, dual-class shares
- [ ] Show data source + filing date on every metric ("SEC 10-K, filed Nov 2024")
- [ ] Add data freshness indicator (green = current, yellow = >30 days, red = >90 days)

### 1.2 Valuation Model Accuracy
- [ ] DCF model: validate discount rate, growth assumptions, terminal value logic
- [ ] Graham Number: verify formula matches Benjamin Graham's original
- [ ] Earnings Power Value: cross-check methodology
- [ ] Ensure all models handle negative earnings gracefully (show "N/A" not garbage)
- [ ] Add confidence interval — don't show a single "fair value", show a RANGE
- [ ] Composite valuation: weight multiple models, show how they agree/disagree

### 1.3 Code Architecture
- [ ] Split page.js (230KB monolith) into focused components
- [ ] Create reusable hooks (useStockData, useValuation)
- [ ] Extract calculation logic into testable utility functions
- [ ] Add error boundaries so one broken chart doesn't crash the whole page

### 1.4 Testing
- [ ] Unit tests for ALL financial calculations
- [ ] Integration tests for API route (SEC + Yahoo data fetching)
- [ ] Snapshot tests for key UI components
- [ ] Test edge cases: BRK.A, negative earnings, newly listed, ETF input

---

## Phase 2: Clean UI/UX
> *"Look professional or nobody trusts your numbers."*

**Goal:** Bloomberg-grade interface. Clean, dense, information-rich. Dark mode.

### 2.1 Design System
- [ ] Consistent color palette (dark mode primary, light mode option)
- [ ] Typography system (monospace for numbers, sans-serif for labels)
- [ ] Standardized number formatting (2 decimal places, B/M/K suffixes, red/green for delta)
- [ ] Loading skeletons (not spinners — skeletons feel faster)
- [ ] Error states that actually tell you what went wrong

### 2.2 Layout
- [ ] Dashboard-style grid layout (like Bloomberg Terminal)
- [ ] Responsive — works on mobile but optimized for desktop
- [ ] Collapsible sections so users can focus on what they care about
- [ ] Sticky header with ticker, price, and change always visible

### 2.3 Charts
- [ ] Revenue/earnings trend with projections overlay
- [ ] Margin trends over 10 years
- [ ] Valuation band chart (where is current price vs historical PE range?)
- [ ] Interactive — hover to see exact values, click to drill down

---

## Phase 3: Entry/Exit Intelligence (THE CORE FEATURE)
> *"Tell me WHEN to buy and at WHAT PRICE."*

**Goal:** Combine fundamentals + technicals + statistical deviation to generate optimal entry/exit zones.

### 3.1 Fundamental Valuation Range
- [ ] Multi-model consensus: DCF, Graham, EPV, dividend discount, residual income
- [ ] Show "fair value range" not single number (e.g., $142 - $168)
- [ ] Margin of safety visualizer (current price vs. fair value range)
- [ ] Historical accuracy — show how the model performed on past data

### 3.2 Technical Indicators
- [ ] Moving averages (50/100/200 SMA + EMA)
- [ ] RSI (Relative Strength Index) — overbought/oversold signals
- [ ] MACD (signal line crossovers)
- [ ] Bollinger Bands — statistical deviation from mean
- [ ] Volume profile — unusual volume detection
- [ ] Support/resistance levels from price history

### 3.3 Statistical Deviation Analysis
- [ ] Z-score of current PE vs 5-year average PE
- [ ] Z-score of current PS, PB, EV/EBITDA vs historical
- [ ] Standard deviation bands on valuation multiples
- [ ] Percentile ranking ("current PE is in the 15th percentile of its 10-year range")
- [ ] Mean reversion probability estimates

### 3.4 Entry/Exit Signal Dashboard
- [ ] **Entry Signal**: composite score combining fundamental undervaluation + technical oversold + statistical deviation below mean
- [ ] **Exit Signal**: composite score combining fundamental overvaluation + technical overbought + deviation above mean
- [ ] Traffic light system: 🟢 Strong Buy Zone / 🟡 Fair Value / 🔴 Overvalued
- [ ] Price targets: "Based on our models, optimal entry range is $142-$155"
- [ ] Confidence score: "72% confidence — 4/6 models agree on undervaluation"

---

## Phase 4: Power User Features
> *"Make it sticky."*

### 4.1 Watchlist & Comparison
- [ ] Save favorite stocks (localStorage first, then database)
- [ ] Side-by-side comparison of 2-3 stocks
- [ ] Sector comparison (stock vs sector average multiples)
- [ ] Custom screener (find stocks where PE < 15 AND ROE > 20%)

### 4.2 Export & Sharing
- [ ] Export analysis as PDF report
- [ ] Export raw data as CSV
- [ ] Shareable link (stock.valuation.app/AAPL)
- [ ] Embed widget for blogs/newsletters

### 4.3 Historical Backtesting
- [ ] "If you bought AAPL every time our entry signal triggered, you'd have returned X%"
- [ ] Model accuracy tracker — how often was our fair value range correct?
- [ ] Calibration score — were our 70% confidence calls right 70% of the time?

### 4.4 Alerts (Future)
- [ ] Email/push when a watched stock enters buy zone
- [ ] Price alerts with fundamental context
- [ ] Earnings date reminders with pre-earnings analysis

---

## Phase 5: Scale & Polish
> *"From side project to product."*

- [ ] Database (Supabase or Postgres) for caching + watchlists + user prefs
- [ ] API rate limiting and caching layer (don't hammer SEC)
- [ ] SEO optimization — rank for "AAPL stock valuation"
- [ ] Performance optimization — <2s load time
- [ ] Progressive Web App — installable on mobile
- [ ] Analytics — track which stocks are searched most
- [ ] Custom domain + branding

---

## Agent Priority Rules

When choosing what to work on, agents should follow this order:

1. **Phase 1 items** until ALL are complete — nothing else matters until the numbers are right
2. **Phase 2 items** can run in parallel with Phase 1 (UI fixes don't break data)
3. **Phase 3 items** only after Phase 1 is done — can't build entry signals on bad data
4. **Phase 4+** only after Phase 3 has a working MVP

### Draco's focus
- Start with: data accuracy fixes + code architecture
- Then: UI/UX improvements + valuation model work
- Then: technical indicators + entry/exit signals
- Always: ask the user before starting anything in Phase 3+

### Oracle's focus
- Constantly verify Phase 1 is done — keep auditing numbers
- When Phase 3 launches, verify entry/exit signals against historical data
- Never stop auditing — data accuracy is forever

### Sentinel's focus
- Review everything Draco ships
- Press hard on financial calculation correctness
- Flag if Draco skips phases or builds ahead of the roadmap

---

## Success Metrics

| Metric | Target |
|---|---|
| Data accuracy | >99% of metrics within tolerance |
| Page load time | <2 seconds |
| Build status | Always green |
| Valuation model coverage | 5+ independent models |
| Entry signal accuracy | Backtested >60% win rate |
| Mobile responsive | Works on iPhone SE |
