# Issues

Bugs and regressions found by QA Agent (Sentinel). Dev Agent (Draco) picks these up.

---

## [BUILD] Missing metadataBase in Next.js metadata
- **Severity**: MEDIUM
- **Commit**: Observed after review cycle on 2026-02-14 (not tied to a specific reviewed commit)
- **File**: `app/layout.js` (or wherever `metadata` is defined)
- **Problem**: `npm run build` succeeds but emits warning: `metadata.metadataBase is not set`, causing social metadata URLs to resolve against `http://localhost:3000`.
- **Suggested fix**: Set `metadataBase` to the production site URL in app metadata config (e.g., `new URL('https://<your-domain>')`).

## [DATA] Multi-ticker — `metrics.netIncomePerShare` uses Yahoo sharesOutstanding instead of SEC diluted shares
- **Severity**: HIGH
- **Tickers checked**: TSLA, NET, DOCN
- **Metric**: `metrics[].netIncomePerShare`
- **App shows**:
  - TSLA 2025: **1.0111**
  - NET 2024: **-0.2483**
  - DOCN 2024: **0.9235**
- **Source (SEC companyfacts, latest FY)**:
  - TSLA diluted shares FY2025: 3,528,000,000 filed 2026-01-29 → EPS **1.0754**
  - NET diluted shares FY2024: 341,411,000 filed 2025-02-20 → EPS **-0.2308**
  - DOCN diluted shares FY2024: 94,503,000 filed 2025-02-25 → EPS **0.8941**
- **Difference**:
  - TSLA: -5.98%
  - NET: -7.59%
  - DOCN: +3.29%
- **Likely cause**: In `app/api/stock/route.js`, `sharesForYear()` falls back to `favorites.sharesOutstanding` from Yahoo and appears to prefer it over SEC-diluted share counts for latest year.
- **File to check**: `app/api/stock/route.js` (search `metrics[i].netIncomePerShare` and `sharesForYear`)
- **How to verify**: Compare API `metrics[-1].netIncomePerShare` with SEC `WeightedAverageNumberOfDilutedSharesOutstanding` (FY) from `https://data.sec.gov/api/xbrl/companyfacts/CIK<CIK>.json`.

## [DATA] DOCN — `quote.pe` mismatches Yahoo Finance quote page
- **Severity**: MEDIUM
- **Ticker**: DOCN
- **Metric**: `quote.pe`
- **App shows**: **27.2640**
- **Source (Yahoo Finance quote page, fetched 2026-02-14)**: PE Ratio (TTM) **25.53**
- **Difference**: +6.79%
- **Likely cause**: `yahoo-finance2 quote.trailingPE` appears stale versus the live quote page snapshot for DOCN.
- **File to check**: `app/api/stock/route.js` (`quote.pe` from `yahooQuote?.trailingPE`)
- **How to verify**: Compare API response `/api/stock?ticker=DOCN` with `https://finance.yahoo.com/quote/DOCN/` PE Ratio (TTM) at the same timestamp.

## [DATA] AVGO — `balance.totalDebt` missing current debt tags
- **Severity**: CRITICAL
- **Ticker**: AVGO
- **Metric**: `balance[-1].totalDebt` (FY2025)
- **App shows**: **0**
- **Source (SEC companyfacts, FY2025 filed 2025-12-18)**: `DebtLongtermAndShorttermCombinedAmount` **67,120,000,000** (and `LongTermDebtCurrent` **3,152,000,000**)
- **Difference**: -100% (outside 1% tolerance)
- **Likely cause**: `route.js` only maps `LongTermDebt` / `LongTermDebtNoncurrent`; AVGO reports debt under combined/current debt tags in latest filing.
- **File to check**: `app/api/stock/route.js` (`debtFields`, `balance.totalDebt`, `ratios.debtToEquityRatio`)
- **How to verify**: Compare `/api/stock?ticker=AVGO` with SEC companyfacts `CIK0001730168` debt tags for FY2025.

## [DATA] ZS — `balance.totalDebt` drops to zero despite outstanding convertible notes
- **Severity**: HIGH
- **Ticker**: ZS
- **Metric**: `balance[-1].totalDebt` (FY2025)
- **App shows**: **0**
- **Source (SEC companyfacts, FY2025 filed 2025-09-11)**: `ConvertibleLongTermNotesPayable` **1,700,727,000**
- **Difference**: -100% (outside 1% tolerance)
- **Likely cause**: Debt mapping omits `ConvertibleLongTermNotesPayable`; year/end-date join logic also fails when latest debt uses a different tag than prior year `LongTermDebt`.
- **File to check**: `app/api/stock/route.js` (`debtFields`, annual balance merge keyed by `end`)
- **How to verify**: Compare `/api/stock?ticker=ZS` with SEC companyfacts `CIK0001713683` debt tags for FY2025.
