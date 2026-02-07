import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';

const yahooFinance = new YahooFinance();
const SEC_BASE = 'https://data.sec.gov';
const USER_AGENT = `StockValuationCalculator/1.0 (${process.env.SEC_CONTACT_EMAIL || 'admin@stockvaluationcalculator.app'})`;
const EXTERNAL_FETCH_TIMEOUT_MS = 12000;

// In-memory cache for SEC company tickers (refreshes once per day)
let tickerCache = { data: null, fetchedAt: 0 };
const TICKER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
let historyCache = new Map();
const HISTORY_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function isValidDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function formatDateISO(value) {
  if (!isValidDate(value)) return null;
  return new Date(value).toISOString().slice(0, 10);
}

async function withTimeout(promise, timeoutMs, label = 'request') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getTickerMap() {
  const now = Date.now();
  if (tickerCache.data && (now - tickerCache.fetchedAt) < TICKER_CACHE_TTL) {
    return tickerCache.data;
  }
  const response = await fetchWithTimeout(`https://www.sec.gov/files/company_tickers.json`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SEC ticker map fetch failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  tickerCache = { data, fetchedAt: now };
  return data;
}

async function getHistoricalPrices(symbol) {
  const cacheKey = symbol.toUpperCase();
  const now = Date.now();
  const cached = historyCache.get(cacheKey);
  if (cached && (now - cached.fetchedAt) < HISTORY_CACHE_TTL) {
    return cached.data;
  }

  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setFullYear(period1.getFullYear() - 10); // bounded window for reliability on serverless

  const data = await withTimeout(
    yahooFinance.historical(cacheKey, {
      period1,
      period2,
      interval: '1d',
    }),
    EXTERNAL_FETCH_TIMEOUT_MS,
    'yahoo historical'
  ).catch(() => null);

  const normalized = Array.isArray(data) ? data : [];
  historyCache.set(cacheKey, { data: normalized, fetchedAt: now });
  return normalized;
}

// Map common tickers to CIK numbers
async function getCIK(ticker) {
  const data = await getTickerMap();
  const upperTicker = ticker.toUpperCase();
  for (const entry of Object.values(data)) {
    if (entry.ticker === upperTicker) {
      return String(entry.cik_str).padStart(10, '0');
    }
  }
  return null;
}

// Get metric values, combining data from multiple field names for full history.
// Keys by actual data period (end date) instead of filing year to avoid picking
// prior-year comparative data that SEC EDGAR includes in each filing.
function getMetricValues(facts, fieldNames, period = 'FY', limit = 20) {
  const seen = new Map();

  for (const fieldName of fieldNames) {
    const data = facts?.[fieldName]?.units?.USD || [];

    let filtered;
    if (period === 'Q') {
      // Quarterly: require fp in Q1-Q4 and a single-quarter span (~3 months)
      filtered = data.filter(d => {
        if (!['Q1','Q2','Q3','Q4'].includes(d.fp)) return false;
        if (d.start && d.end) {
          const months = (new Date(d.end) - new Date(d.start)) / (1000 * 60 * 60 * 24 * 30);
          return months < 5;
        }
        return true;
      });
    } else {
      // Annual: require fp === 'FY' and validate ~12-month span when dates available
      filtered = data.filter(d => {
        if (d.fp !== period) return false;
        if (d.start && d.end) {
          const months = (new Date(d.end) - new Date(d.start)) / (1000 * 60 * 60 * 24 * 30);
          if (months < 10 || months > 14) return false;
        }
        return true;
      });
    }

    // Key by the actual data period (end date) instead of the filing year.
    // SEC filings include prior-year comparatives, so the same fy can have
    // entries for different actual years. Using end date ensures we get the
    // correct value for each period and don't lose the most recent year's data.
    for (const entry of filtered) {
      if (!entry.end) continue;
      const key = entry.end; // e.g. "2024-12-31" for annual, "2024-03-31" for Q1
      const existing = seen.get(key);
      if (!existing || new Date(entry.filed) > new Date(existing.filed)) {
        // Normalize fy to reflect the actual data year (from end date)
        // so downstream code using .fy gets the correct calendar year
        const actualYear = new Date(entry.end).getFullYear();
        seen.set(key, { ...entry, fy: actualYear });
      }
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => {
      // Sort by end date descending for consistent ordering
      if (a.end && b.end) return b.end.localeCompare(a.end);
      return b.fy - a.fy || (b.fp || '').localeCompare(a.fp || '');
    })
    .slice(0, limit);
}

function toEpochMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (value instanceof Date && !isNaN(value)) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeInsiderTransactions(rows = []) {
  return rows
    .map((row) => {
      const startMs = toEpochMs(
        row?.startDate ??
        row?.transactionDate ??
        row?.date
      );
      const sharesRaw = toNumber(
        row?.shares ??
        row?.sharesTraded ??
        row?.transactionShares
      );
      const valueRaw = toNumber(
        row?.value ??
        row?.totalValue ??
        row?.dollarValue
      );
      const priceRaw = toNumber(
        row?.price ??
        row?.transactionPrice ??
        row?.pricePerShare ??
        row?.sharePrice
      );
      const text = String(
        row?.transactionText ??
        row?.transactionType ??
        row?.type ??
        ''
      ).toLowerCase();

      const isSellText = /sale|sell|sold|dispose/.test(text);
      const isBuyText = /buy|bought|purchase/.test(text);
      const side = isSellText || (sharesRaw !== null && sharesRaw < 0)
        ? 'SELL'
        : isBuyText || (sharesRaw !== null && sharesRaw > 0)
        ? 'BUY'
        : 'UNKNOWN';

      const absShares = sharesRaw !== null ? Math.abs(sharesRaw) : null;
      const estimatedValue = valueRaw === null && absShares !== null && priceRaw !== null
        ? Math.abs(absShares * priceRaw)
        : null;

      return {
        date: startMs ? new Date(startMs).toISOString().slice(0, 10) : null,
        epochMs: startMs,
        insider: row?.filerName || row?.name || 'Unknown',
        relation: row?.filerRelation || row?.position || row?.title || 'N/A',
        side,
        shares: absShares,
        value: valueRaw !== null ? Math.abs(valueRaw) : estimatedValue,
        valueIsEstimated: valueRaw === null && estimatedValue !== null,
        pricePerShare: priceRaw !== null ? Math.abs(priceRaw) : null,
        transactionText: row?.transactionText || row?.transactionType || row?.text || '',
      };
    })
    .filter((tx) => tx.date && (tx.shares !== null || tx.value !== null))
    .sort((a, b) => (b.epochMs || 0) - (a.epochMs || 0));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
  }

  if (!/^[A-Z0-9.\-^]{1,10}$/i.test(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker symbol' }, { status: 400 });
  }

  try {
    const symbol = ticker.toUpperCase();

    // Always fetch market data first so SEC outages do not take the whole API down.
    const [yahooQuote, yahooStats, priceHistoryRaw] = await Promise.all([
      withTimeout(yahooFinance.quote(symbol), EXTERNAL_FETCH_TIMEOUT_MS, 'yahoo quote').catch(() => null),
      withTimeout(
        yahooFinance.quoteSummary(symbol, {
          modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'insiderTransactions', 'assetProfile'],
        }),
        EXTERNAL_FETCH_TIMEOUT_MS,
        'yahoo quoteSummary'
      ).catch(() => null),
      getHistoricalPrices(symbol),
    ]);

    const hasYahooData = Boolean(yahooQuote) || (Array.isArray(priceHistoryRaw) && priceHistoryRaw.length > 0);
    if (!hasYahooData) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    // SEC path is best-effort: valuation gets richer when available, but route stays up without it.
    const secIssues = [];
    let cik = null;
    try {
      cik = await getCIK(symbol);
    } catch (err) {
      secIssues.push(`CIK lookup failed: ${err?.message || 'unknown_error'}`);
    }

    let facts = {};
    let submissions = {};
    if (cik) {
      const [factsRes, submissionsRes] = await Promise.all([
        fetchWithTimeout(`${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`, {
          headers: { 'User-Agent': USER_AGENT },
        }).catch((error) => ({ ok: false, status: 0, _error: error })),
        fetchWithTimeout(`${SEC_BASE}/submissions/CIK${cik}.json`, {
          headers: { 'User-Agent': USER_AGENT },
        }).catch((error) => ({ ok: false, status: 0, _error: error })),
      ]);

      if (factsRes?.ok) {
        facts = await factsRes.json();
      } else {
        const detail = factsRes?._error?.message || (typeof factsRes?.text === 'function' ? (await factsRes.text()).slice(0, 200) : 'request_failed');
        secIssues.push(`companyfacts unavailable (${factsRes?.status ?? 'n/a'}): ${detail}`);
      }

      if (submissionsRes?.ok) {
        submissions = await submissionsRes.json();
      } else {
        const detail = submissionsRes?._error?.message || (typeof submissionsRes?.text === 'function' ? (await submissionsRes.text()).slice(0, 200) : 'request_failed');
        secIssues.push(`submissions unavailable (${submissionsRes?.status ?? 'n/a'}): ${detail}`);
      }
    } else {
      secIssues.push('CIK not available for ticker');
    }

    const usGaap = facts?.facts?.['us-gaap'] || {};
    const assetProfile = yahooStats?.assetProfile || {};

    // Build profile
    const profile = {
      symbol,
      companyName: facts.entityName || submissions.name || yahooQuote?.longName || yahooQuote?.shortName || symbol,
      exchangeShortName: submissions.exchanges?.[0] || '',
      sector: assetProfile.sector || submissions.sicDescription || '',
      industry: assetProfile.industry || submissions.sicDescription || '',
      description: assetProfile.longBusinessSummary || '',
      ceo: assetProfile.companyOfficers?.[0]?.name || '',
      fullTimeEmployees: 0,
      website: assetProfile.website || submissions.website || '',
    };

    // Field mappings for different metrics
    const revenueFields = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'SalesRevenueGoodsNet'];
    const netIncomeFields = ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'];
    const grossProfitFields = ['GrossProfit'];
    const costOfRevenueFields = ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'];
    const operatingIncomeFields = ['OperatingIncomeLoss'];
    const totalAssetsFields = ['Assets'];
    const totalEquityFields = ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'];
    const cashFields = ['CashAndCashEquivalentsAtCarryingValue', 'Cash'];
    const debtFields = ['LongTermDebt', 'LongTermDebtNoncurrent'];
    const operatingCashFlowFields = ['NetCashProvidedByUsedInOperatingActivities'];
    const capexFields = [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'CapitalExpenditures',
    ];
    const depreciationFields = [
      'DepreciationAndAmortization',
      'DepreciationDepletionAndAmortization',
      'DepreciationAmortizationAndAccretionNet',
    ];
    const currentAssetsFields = ['AssetsCurrent'];
    const currentLiabilitiesFields = ['LiabilitiesCurrent'];
    const interestExpenseFields = ['InterestExpense'];
    const pretaxIncomeFields = ['IncomeBeforeTax'];
    const incomeTaxFields = ['IncomeTaxExpenseBenefit'];
    const sharesDilutedFields = ['WeightedAverageNumberOfDilutedSharesOutstanding'];
    const sharesBasicFields = ['WeightedAverageNumberOfSharesOutstandingBasic'];

    // Get annual data (10 years)
    const revenueAnnual = getMetricValues(usGaap, revenueFields, 'FY', 10);
    const netIncomeAnnual = getMetricValues(usGaap, netIncomeFields, 'FY', 10);
    const grossProfitAnnual = getMetricValues(usGaap, grossProfitFields, 'FY', 10);
    const costOfRevenueAnnual = getMetricValues(usGaap, costOfRevenueFields, 'FY', 10);
    const operatingIncomeAnnual = getMetricValues(usGaap, operatingIncomeFields, 'FY', 10);
    const assetsAnnual = getMetricValues(usGaap, totalAssetsFields, 'FY', 10);
    const equityAnnual = getMetricValues(usGaap, totalEquityFields, 'FY', 10);
    const cashAnnual = getMetricValues(usGaap, cashFields, 'FY', 10);
    const debtAnnual = getMetricValues(usGaap, debtFields, 'FY', 10);
    const opCashFlowAnnual = getMetricValues(usGaap, operatingCashFlowFields, 'FY', 10);
    const capexAnnual = getMetricValues(usGaap, capexFields, 'FY', 10);
    const depreciationAnnual = getMetricValues(usGaap, depreciationFields, 'FY', 10);
    const currentAssetsAnnual = getMetricValues(usGaap, currentAssetsFields, 'FY', 10);
    const currentLiabilitiesAnnual = getMetricValues(usGaap, currentLiabilitiesFields, 'FY', 10);
    const interestExpenseAnnual = getMetricValues(usGaap, interestExpenseFields, 'FY', 10);
    const pretaxIncomeAnnual = getMetricValues(usGaap, pretaxIncomeFields, 'FY', 10);
    const incomeTaxAnnual = getMetricValues(usGaap, incomeTaxFields, 'FY', 10);
    const sharesDilutedAnnual = getMetricValues(usGaap, sharesDilutedFields, 'FY', 10);
    const sharesBasicAnnual = getMetricValues(usGaap, sharesBasicFields, 'FY', 10);

    // Get quarterly data (20 quarters = 5 years)
    const revenueQuarterly = getMetricValues(usGaap, revenueFields, 'Q', 20);
    const netIncomeQuarterly = getMetricValues(usGaap, netIncomeFields, 'Q', 20);
    const grossProfitQuarterly = getMetricValues(usGaap, grossProfitFields, 'Q', 20);
    const costOfRevenueQuarterly = getMetricValues(usGaap, costOfRevenueFields, 'Q', 20);
    const operatingIncomeQuarterly = getMetricValues(usGaap, operatingIncomeFields, 'Q', 20);
    const assetsQuarterly = getMetricValues(usGaap, totalAssetsFields, 'Q', 20);
    const equityQuarterly = getMetricValues(usGaap, totalEquityFields, 'Q', 20);
    const cashQuarterly = getMetricValues(usGaap, cashFields, 'Q', 20);
    const debtQuarterly = getMetricValues(usGaap, debtFields, 'Q', 20);
    const opCashFlowQuarterly = getMetricValues(usGaap, operatingCashFlowFields, 'Q', 20);
    const capexQuarterly = getMetricValues(usGaap, capexFields, 'Q', 20);

    const mapByEndValue = (rows) => new Map(rows.map((r) => [r.end, r.val]));
    const grossProfitAnnualByEnd = mapByEndValue(grossProfitAnnual);
    const costOfRevenueAnnualByEnd = mapByEndValue(costOfRevenueAnnual);
    const operatingIncomeAnnualByEnd = mapByEndValue(operatingIncomeAnnual);
    const netIncomeAnnualByEnd = mapByEndValue(netIncomeAnnual);
    const equityAnnualByEnd = mapByEndValue(equityAnnual);
    const cashAnnualByEnd = mapByEndValue(cashAnnual);
    const debtAnnualByEnd = mapByEndValue(debtAnnual);
    const currentAssetsAnnualByEnd = mapByEndValue(currentAssetsAnnual);
    const currentLiabilitiesAnnualByEnd = mapByEndValue(currentLiabilitiesAnnual);

    const grossProfitQuarterlyByEnd = mapByEndValue(grossProfitQuarterly);
    const costOfRevenueQuarterlyByEnd = mapByEndValue(costOfRevenueQuarterly);
    const operatingIncomeQuarterlyByEnd = mapByEndValue(operatingIncomeQuarterly);
    const netIncomeQuarterlyByEnd = mapByEndValue(netIncomeQuarterly);
    const equityQuarterlyByEnd = mapByEndValue(equityQuarterly);
    const cashQuarterlyByEnd = mapByEndValue(cashQuarterly);
    const debtQuarterlyByEnd = mapByEndValue(debtQuarterly);

    // Build income statement data (annual)
    const income = revenueAnnual.map((rev) => ({
      grossProfit: (() => {
        const directGross = grossProfitAnnualByEnd.get(rev.end);
        if (directGross !== null && directGross !== undefined) return directGross;
        const costOfRevenue = costOfRevenueAnnualByEnd.get(rev.end);
        return costOfRevenue !== null && costOfRevenue !== undefined ? (rev.val || 0) - costOfRevenue : null;
      })(),
      date: rev.end,
      calendarYear: String(rev.fy),
      revenue: rev.val || 0,
      operatingIncome: operatingIncomeAnnualByEnd.get(rev.end) ?? null,
      netIncome: netIncomeAnnualByEnd.get(rev.end) ?? null,
    })).reverse();

    // Build income statement data (quarterly)
    const incomeQ = revenueQuarterly.map((rev) => ({
      grossProfit: (() => {
        const directGross = grossProfitQuarterlyByEnd.get(rev.end);
        if (directGross !== null && directGross !== undefined) return directGross;
        const costOfRevenue = costOfRevenueQuarterlyByEnd.get(rev.end);
        return costOfRevenue !== null && costOfRevenue !== undefined ? (rev.val || 0) - costOfRevenue : null;
      })(),
      date: rev.end,
      fiscalYear: String(rev.fy),
      period: rev.fp,
      revenue: rev.val || 0,
      operatingIncome: operatingIncomeQuarterlyByEnd.get(rev.end) ?? null,
      netIncome: netIncomeQuarterlyByEnd.get(rev.end) ?? null,
    })).reverse();

    // Build balance sheet data (annual)
    const balance = assetsAnnual.map((asset) => ({
      date: asset.end,
      calendarYear: String(asset.fy),
      totalAssets: asset.val || 0,
      totalEquity: equityAnnualByEnd.get(asset.end) || 0,
      cashAndCashEquivalents: cashAnnualByEnd.get(asset.end) || 0,
      shortTermInvestments: 0,
      currentAssets: currentAssetsAnnualByEnd.get(asset.end) || null,
      currentLiabilities: currentLiabilitiesAnnualByEnd.get(asset.end) || null,
      totalDebt: debtAnnualByEnd.get(asset.end) || 0,
    })).reverse();

    // Build balance sheet data (quarterly)
    const balanceQ = assetsQuarterly.map((asset) => ({
      date: asset.end,
      fiscalYear: String(asset.fy),
      period: asset.fp,
      totalAssets: asset.val || 0,
      totalEquity: equityQuarterlyByEnd.get(asset.end) || 0,
      cashAndCashEquivalents: cashQuarterlyByEnd.get(asset.end) || 0,
      shortTermInvestments: 0,
      currentAssets: null,
      currentLiabilities: null,
      totalDebt: debtQuarterlyByEnd.get(asset.end) || 0,
    })).reverse();

    // Build cash flow data (annual)
    const cashflow = opCashFlowAnnual.map((ocf) => ({
      date: ocf.end,
      calendarYear: String(ocf.fy),
      operatingCashFlow: ocf.val || 0,
      capitalExpenditure: -(capexAnnual.find(c => c.fy === ocf.fy)?.val || 0),
      freeCashFlow: (ocf.val || 0) - (capexAnnual.find(c => c.fy === ocf.fy)?.val || 0),
    })).reverse();

    // Build cash flow data (quarterly)
    const cashflowQ = opCashFlowQuarterly.map((ocf) => ({
      date: ocf.end,
      fiscalYear: String(ocf.fy),
      period: ocf.fp,
      operatingCashFlow: ocf.val || 0,
      capitalExpenditure: -(capexQuarterly.find(c => c.end === ocf.end)?.val || 0),
      freeCashFlow: (ocf.val || 0) - (capexQuarterly.find(c => c.end === ocf.end)?.val || 0),
    })).reverse();

    const balanceByYear = new Map(balance.map(b => [String(b.calendarYear), b]));
    const cashflowByYear = new Map(cashflow.map(c => [String(c.calendarYear), c]));

    // Build ratios (calculated from data)
    const ratios = income.map((inc) => {
      const bal = balanceByYear.get(String(inc.calendarYear)) || {};
      return {
        date: inc.date,
        calendarYear: inc.calendarYear,
        grossProfitMargin: (inc.revenue && inc.grossProfit !== null && inc.grossProfit !== undefined) ? inc.grossProfit / inc.revenue : null,
        operatingProfitMargin: (inc.revenue && inc.operatingIncome !== null && inc.operatingIncome !== undefined) ? inc.operatingIncome / inc.revenue : null,
        netProfitMargin: (inc.revenue && inc.netIncome !== null && inc.netIncome !== undefined) ? inc.netIncome / inc.revenue : null,
        returnOnEquity: (bal.totalEquity && inc.netIncome !== null && inc.netIncome !== undefined) ? inc.netIncome / bal.totalEquity : null,
        returnOnAssets: (bal.totalAssets && inc.netIncome !== null && inc.netIncome !== undefined) ? inc.netIncome / bal.totalAssets : null,
        returnOnCapitalEmployed: ((bal.totalEquity || bal.totalDebt) && inc.operatingIncome !== null && inc.operatingIncome !== undefined)
          ? inc.operatingIncome / ((bal.totalEquity || 0) + (bal.totalDebt || 0))
          : null,
        debtToEquityRatio: bal.totalEquity ? bal.totalDebt / bal.totalEquity : null,
        currentRatio: (bal.currentAssets !== null && bal.currentAssets !== undefined && bal.currentLiabilities && bal.currentLiabilities > 0)
          ? bal.currentAssets / bal.currentLiabilities
          : null,
      };
    });

    // Build metrics (per-share where possible)
    const metrics = income.map((inc) => {
      return {
        date: inc.date,
        calendarYear: inc.calendarYear,
        enterpriseValue: null,
        evToEBITDA: null,
        freeCashFlowYield: null,
        earningsYield: null,
        bookValuePerShare: null,
        netIncomePerShare: null,
      };
    });

    // Build quote from Yahoo Finance (live prices)
    const quote = {
      price: yahooQuote?.regularMarketPrice || 0,
      change: yahooQuote?.regularMarketChange || 0,
      changesPercentage: yahooQuote?.regularMarketChangePercent || 0,
      marketCap: yahooQuote?.marketCap || 0,
      pe: yahooQuote?.trailingPE || null,
    };

    const priceHistory = Array.isArray(priceHistoryRaw)
      ? priceHistoryRaw
          .map((row) => {
            const isoDate = formatDateISO(row?.date);
            if (!isoDate || !Number.isFinite(row?.close)) return null;
            return {
              date: isoDate,
              open: Number.isFinite(row?.open) ? row.open : null,
              high: Number.isFinite(row?.high) ? row.high : null,
              low: Number.isFinite(row?.low) ? row.low : null,
              close: Number.isFinite(row?.close) ? row.close : null,
              volume: Number.isFinite(row?.volume) ? row.volume : null,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];

    const calculateTradingSignals = (historyRows, latestPrice) => {
      const rows = Array.isArray(historyRows)
        ? historyRows.filter((r) =>
            Number.isFinite(r?.close) &&
            Number.isFinite(r?.high) &&
            Number.isFinite(r?.low) &&
            Number.isFinite(r?.volume)
          )
        : [];

      if (!Number.isFinite(latestPrice) || latestPrice <= 0 || rows.length < 60) {
        return {
          action: 'WAIT',
          regime: 'UNKNOWN',
          confidence: 0,
          reason: 'insufficient_data',
        };
      }

      const sma = (arr, period) => {
        if (arr.length < period) return null;
        const slice = arr.slice(arr.length - period);
        return slice.reduce((sum, v) => sum + v, 0) / period;
      };

      const closes = rows.map((r) => r.close);
      const sma50 = sma(closes, 50);
      const sma200 = sma(closes, 200);
      const sma50Prev = closes.length >= 70
        ? closes.slice(0, closes.length - 20).slice(-50).reduce((sum, v) => sum + v, 0) / 50
        : null;

      let vwma20 = null;
      if (rows.length >= 20) {
        const s = rows.slice(-20);
        const pv = s.reduce((sum, r) => sum + (r.close * (r.volume || 0)), 0);
        const vv = s.reduce((sum, r) => sum + (r.volume || 0), 0);
        vwma20 = vv > 0 ? pv / vv : null;
      }

      const nowYear = new Date().getUTCFullYear();
      const ytdStartIndex = rows.findIndex((r) => new Date(`${r.date}T00:00:00Z`).getUTCFullYear() === nowYear);
      const anchorIndex = ytdStartIndex >= 0 ? ytdStartIndex : Math.max(0, rows.length - 252);
      let avwap = null;
      {
        let pv = 0;
        let vv = 0;
        for (let i = anchorIndex; i < rows.length; i++) {
          const typical = (rows[i].high + rows[i].low + rows[i].close) / 3;
          const vol = rows[i].volume || 0;
          pv += typical * vol;
          vv += vol;
        }
        avwap = vv > 0 ? pv / vv : null;
      }

      const meanType = Number.isFinite(avwap)
        ? 'Anchored VWAP (YTD)'
        : Number.isFinite(vwma20)
        ? 'VWMA-20'
        : 'SMA-50';
      const mean = Number.isFinite(avwap) ? avwap : (Number.isFinite(vwma20) ? vwma20 : sma50);

      const stdWindow = closes.slice(-60);
      const stdMean = stdWindow.reduce((a, b) => a + b, 0) / stdWindow.length;
      const variance = stdWindow.reduce((sum, v) => sum + ((v - stdMean) ** 2), 0) / stdWindow.length;
      const stdDev = Math.sqrt(variance);
      const zScore = Number.isFinite(mean) && stdDev > 0 ? (latestPrice - mean) / stdDev : null;

      const spread = Number.isFinite(sma50) && Number.isFinite(sma200) && sma200 !== 0
        ? (sma50 - sma200) / sma200
        : 0;
      const slope = Number.isFinite(sma50) && Number.isFinite(sma50Prev) && sma50Prev !== 0
        ? (sma50 - sma50Prev) / sma50Prev
        : 0;
      const trendUp = spread >= 0.01 && slope >= 0.005;
      const trendDown = spread <= -0.01 && slope <= -0.005;
      const regime = trendUp ? 'TREND_UP' : trendDown ? 'TREND_DOWN' : 'RANGE';

      let action = 'WAIT';
      if (Number.isFinite(zScore)) {
        if (regime === 'RANGE') {
          if (zScore <= -2.5) action = 'ACCUMULATE';
          else if (zScore <= -1.8) action = 'SCALE IN';
          else if (zScore >= 2.5) action = 'REDUCE EXPOSURE';
          else if (zScore >= 1.8) action = 'TAKE PROFIT';
        } else if (regime === 'TREND_UP') {
          if (zScore <= -2.0) action = 'ACCUMULATE';
          else if (zScore <= -1.0) action = 'SCALE IN';
          else if (zScore >= 2.5) action = 'TAKE PROFIT';
          else action = 'WAIT';
        } else if (regime === 'TREND_DOWN') {
          if (zScore <= -2.8) action = 'SCALE IN';
          else if (zScore >= 2.0) action = 'REDUCE EXPOSURE';
          else action = 'WAIT';
        }
      }

      const zStrength = Number.isFinite(zScore) ? Math.min(100, (Math.abs(zScore) / 3) * 100) : 0;
      const regimeFit = action === 'WAIT' ? 40 : (regime === 'RANGE' ? 85 : 75);
      const trendFit = Number.isFinite(spread) && Number.isFinite(slope)
        ? Math.min(100, (Math.abs(spread) * 1500) + (Math.abs(slope) * 1500))
        : 0;
      const confidence = Math.round((zStrength * 0.55) + (regimeFit * 0.30) + (trendFit * 0.15));

      const sigma1 = Number.isFinite(mean) && Number.isFinite(stdDev) ? mean + stdDev : null;
      const sigmaNeg1 = Number.isFinite(mean) && Number.isFinite(stdDev) ? mean - stdDev : null;
      const sigma2 = Number.isFinite(mean) && Number.isFinite(stdDev) ? mean + (2 * stdDev) : null;
      const sigmaNeg2 = Number.isFinite(mean) && Number.isFinite(stdDev) ? mean - (2 * stdDev) : null;

      let entryZone = null;
      if (action === 'ACCUMULATE' || action === 'SCALE IN') {
        entryZone = Number.isFinite(sigmaNeg2) && Number.isFinite(sigmaNeg1)
          ? { low: Math.min(sigmaNeg2, sigmaNeg1), high: Math.max(sigmaNeg2, sigmaNeg1), side: 'BUY' }
          : null;
      } else if (action === 'TAKE PROFIT' || action === 'REDUCE EXPOSURE') {
        entryZone = Number.isFinite(sigma1) && Number.isFinite(sigma2)
          ? { low: Math.min(sigma1, sigma2), high: Math.max(sigma1, sigma2), side: 'SELL' }
          : null;
      }

      const targets = (() => {
        if (action === 'TAKE PROFIT' || action === 'REDUCE EXPOSURE') {
          return { tp1: sigma1, tp2: mean, tp3: sigmaNeg1 };
        }
        if (action === 'ACCUMULATE' || action === 'SCALE IN') {
          return { tp1: sigmaNeg1, tp2: mean, tp3: sigma1 };
        }
        return { tp1: mean, tp2: sigma1, tp3: sigma2 };
      })();

      return {
        action,
        regime,
        confidence,
        meanType,
        mean,
        stdDev,
        zScore,
        slope50v200: slope,
        levels: {
          sigmaNeg2,
          sigmaNeg1,
          mean,
          sigma1,
          sigma2,
        },
        entryZone,
        targets,
        rationale: [
          `Mean model: ${meanType}`,
          Number.isFinite(zScore) ? `Current Z-score: ${zScore.toFixed(2)}σ` : 'Z-score unavailable',
          `Regime: ${regime}`,
        ],
      };
    };

    // Build favorites metrics
    const summaryDetail = yahooStats?.summaryDetail || {};
    const keyStats = yahooStats?.defaultKeyStatistics || {};
    const financialData = yahooStats?.financialData || {};
    const insiderTransactionsRaw = yahooStats?.insiderTransactions?.transactions || [];
    const allInsiderTransactions = normalizeInsiderTransactions(insiderTransactionsRaw);
    const sixMonthsAgoMs = Date.now() - (183 * 24 * 60 * 60 * 1000);
    const insiderTransactions = allInsiderTransactions
      .filter((tx) => Number.isFinite(tx.epochMs) && tx.epochMs >= sixMonthsAgoMs)
      .slice(0, 200);
    const insiderSelling = insiderTransactions
      .filter((tx) => tx.side === 'SELL')
      .slice(0, 100);

    const favorites = {
      peRatio: yahooQuote?.trailingPE || null,
      psRatio: summaryDetail?.priceToSalesTrailing12Months || null,
      epsGrowth: keyStats?.earningsQuarterlyGrowth || financialData?.earningsGrowth || null,
      dividendYield: summaryDetail?.dividendYield || null,
      marketCap: yahooQuote?.marketCap || null,
      sharesOutstanding: keyStats?.sharesOutstanding || null,
      beta: yahooQuote?.beta || keyStats?.beta || null,
      roe: financialData?.returnOnEquity || null,
      roic: null, // Will calculate from SEC data
      debtToEbitda: null, // Will calculate from SEC data
    };

    // Calculate Debt/EBITDA from SEC data if available
    const latestIncome = income[income.length - 1];
    const latestBalance = balance[balance.length - 1];
    const latestDepreciation = depreciationAnnual[0]?.val || null;

    const ebitda = latestIncome && latestDepreciation !== null
      ? latestIncome.operatingIncome + latestDepreciation
      : null;
    if (latestBalance && ebitda && ebitda > 0) {
      favorites.debtToEbitda = (latestBalance.totalDebt || 0) / ebitda;
    }

    // Calculate comprehensive valuations
    const latestDilutedShares = sharesDilutedAnnual[0]?.val;
    const latestBasicShares = sharesBasicAnnual[0]?.val;
    const sharesOutstandingRaw = latestDilutedShares || latestBasicShares || favorites.sharesOutstanding || null;
    const sharesOutstanding = Number.isFinite(sharesOutstandingRaw) && sharesOutstandingRaw > 0
      ? sharesOutstandingRaw
      : null;
    const currentPrice = Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;

    const dilutedSharesByYear = new Map(sharesDilutedAnnual.map((s) => [String(s.fy), s.val]));
    const basicSharesByYear = new Map(sharesBasicAnnual.map((s) => [String(s.fy), s.val]));
    const sharesForYear = (year) => {
      const yearVal = dilutedSharesByYear.get(String(year)) || basicSharesByYear.get(String(year));
      if (Number.isFinite(yearVal) && yearVal > 0) return yearVal;
      return sharesOutstanding;
    };

    // Get historical data for calculations
    const recentIncome = income.slice(-5);
    const recentCashflow = cashflow.slice(-5);
    const recentBalance = balance.slice(-5);

    // Growth helpers
    const calcCAGR = (values) => {
      if (!values || values.length < 2) return null;
      const start = values[0];
      const end = values[values.length - 1];
      if (!start || !end || start <= 0 || end <= 0) return null;
      const years = values.length - 1;
      return Math.pow(end / start, 1 / years) - 1;
    };

    const revenueSeries = recentIncome.map(d => d.revenue).filter(v => v > 0);
    const revenueCagr = calcCAGR(revenueSeries);
    const revenueGrowth = revenueCagr !== null ? revenueCagr : 0;
    const netIncomeGrowth = calcCAGR(recentIncome.map(d => d.netIncome).filter(v => v > 0)) ?? 0;
    const fcfGrowth = calcCAGR(recentCashflow.map(d => d.freeCashFlow).filter(v => v > 0)) ?? 0;

    // Latest values
    const latestRevenue = recentIncome[recentIncome.length - 1]?.revenue || 0;
    const latestNetIncome = recentIncome[recentIncome.length - 1]?.netIncome || 0;
    const latestFCF = recentCashflow[recentCashflow.length - 1]?.freeCashFlow || 0;
    const latestOCF = recentCashflow[recentCashflow.length - 1]?.operatingCashFlow || 0;
    const latestEquity = recentBalance[recentBalance.length - 1]?.totalEquity || 0;

    // Populate per-share metrics now that sharesOutstanding is known
    for (let i = 0; i < metrics.length; i++) {
      const inc = income[i] || {};
      const bal = balance[i] || {};
      const metricShares = sharesForYear(inc.calendarYear);
      metrics[i].netIncomePerShare = metricShares && Number.isFinite(inc.netIncome) ? inc.netIncome / metricShares : null;
      metrics[i].bookValuePerShare = metricShares && Number.isFinite(bal.totalEquity) ? bal.totalEquity / metricShares : null;
    }

    // Discount rate (WACC approximation)
    const riskFreeRate = 0.04; // 4%
    const marketRiskPremium = 0.05; // 5%
    const beta = favorites.beta || 1;
    const costOfEquity = riskFreeRate + beta * marketRiskPremium;
    const totalDebt = latestBalance?.totalDebt || 0;
    const marketCap = quote.marketCap || 0;
    const latestInterest = Math.abs(interestExpenseAnnual[0]?.val || 0);
    const costOfDebt = totalDebt > 0 && latestInterest > 0 ? (latestInterest / totalDebt) : 0.05;
    const latestPretax = pretaxIncomeAnnual[0]?.val || 0;
    const latestTax = incomeTaxAnnual[0]?.val || 0;
    const effectiveTax = latestPretax !== 0 ? (latestTax / latestPretax) : null;
    const taxRate = effectiveTax !== null && isFinite(effectiveTax)
      ? Math.min(Math.max(effectiveTax, 0), 0.35)
      : 0.21;

    // Calculate ROIC using the dynamic tax rate
    if (latestIncome && latestBalance) {
      const nopat = latestIncome.operatingIncome * (1 - taxRate);
      const investedCapital = (latestBalance.totalEquity || 0) + (latestBalance.totalDebt || 0) - (latestBalance.cashAndCashEquivalents || 0);
      if (investedCapital > 0) {
        favorites.roic = nopat / investedCapital;
      }
    }

    const totalCapital = marketCap + totalDebt;
    const equityWeight = totalCapital > 0 ? marketCap / totalCapital : 1;
    const debtWeight = totalCapital > 0 ? totalDebt / totalCapital : 0;
    const discountRate = (equityWeight * costOfEquity) + (debtWeight * costOfDebt * (1 - taxRate));
    const terminalGrowth = 0.025; // 2.5% perpetual growth

    const getTerminalMargin = (sectorName, fallback) => {
      const sector = (sectorName || '').toLowerCase();
      const map = [
        { key: ['software', 'technology', 'semiconductor', 'computer'], margin: 0.18 },
        { key: ['health', 'biotech', 'pharma'], margin: 0.14 },
        { key: ['financial', 'bank', 'insurance'], margin: 0.22 },
        { key: ['industrial', 'machinery', 'transport'], margin: 0.10 },
        { key: ['energy', 'oil', 'gas'], margin: 0.10 },
        { key: ['utility'], margin: 0.09 },
        { key: ['consumer', 'retail', 'discretionary'], margin: 0.10 },
        { key: ['staple', 'food', 'beverage'], margin: 0.09 },
        { key: ['communication', 'media', 'telecom'], margin: 0.12 },
        { key: ['real estate'], margin: 0.12 },
        { key: ['materials', 'chemical', 'mining'], margin: 0.08 },
      ];
      for (const entry of map) {
        if (entry.key.some(k => sector.includes(k))) return entry.margin;
      }
      return fallback ?? 0.10;
    };

    // DCF using revenue + unlevered FCF (multi-stage with working capital)
    const calcMultiStageDCF = (startRevenue, startOpMargin, ratios) => {
      if (!startRevenue || !isFinite(startRevenue)) return null;
      const safetySpread = 0.01;
      if (discountRate <= terminalGrowth + safetySpread) return null;
      const highGrowth = Math.min(Math.max(revenueGrowth, -0.05), 0.25);
      const years = 10;
      const fadeStart = 6;
      const terminal = terminalGrowth;

      const histMargin = ratios?.opMargin;
      const sectorMargin = getTerminalMargin(profile.sector || profile.industry, histMargin);
      const terminalMargin = Math.min(Math.max(sectorMargin, 0.02), 0.20);
      const initialMargin = isFinite(startOpMargin) ? startOpMargin : (histMargin ?? terminalMargin);

      const capexRatio = ratios?.capexRatio ?? 0.04;
      const daRatio = ratios?.daRatio ?? 0.03;
      const nwcRatio = ratios?.nwcRatio ?? 0.05;

      let totalPV = 0;
      let revenue = startRevenue;
      let prevNwc = (ratios?.latestNwc !== null && ratios?.latestNwc !== undefined)
        ? ratios.latestNwc
        : (revenue * nwcRatio);

      for (let year = 1; year <= years; year++) {
        const growth = year < fadeStart
          ? highGrowth
          : highGrowth + (terminal - highGrowth) * ((year - fadeStart + 1) / (years - fadeStart + 1));
        const margin = initialMargin + (terminalMargin - initialMargin) * (year / years);
        revenue *= (1 + growth);

        const ebit = revenue * margin;
        const nopat = ebit * (1 - taxRate);
        const da = revenue * daRatio;
        const capex = revenue * capexRatio;
        const nwc = revenue * nwcRatio;
        const deltaNwc = nwc - prevNwc;
        prevNwc = nwc;

        const fcf = nopat + da - capex - deltaNwc;
        totalPV += fcf / Math.pow(1 + discountRate, year);
      }

      const terminalEbit = revenue * terminalMargin;
      const terminalNopat = terminalEbit * (1 - taxRate);
      const terminalDa = revenue * daRatio;
      const terminalCapex = revenue * capexRatio;
      const terminalFcf = terminalNopat + terminalDa - terminalCapex;
      if (terminalFcf <= 0) return null;
      const terminalValue = (terminalFcf * (1 + terminal)) / (discountRate - terminal);
      totalPV += terminalValue / Math.pow(1 + discountRate, years);

      return sharesOutstanding ? totalPV / sharesOutstanding : null;
    };

    // Calculate average multiples from historical data
    const avgPS = recentIncome.length > 0 && latestRevenue > 0
      ? (favorites.psRatio || (quote.marketCap / latestRevenue))
      : null;
    const avgPE = favorites.peRatio || null;
    const avgPB = latestEquity > 0 ? quote.marketCap / latestEquity : null;

    // Ratios for DCF inputs (working capital + reinvestment)
    const yearKey = (y) => String(y);
    const depByYear = new Map(depreciationAnnual.map(d => [yearKey(d.fy), d.val]));
    const capexByYear = new Map(capexAnnual.map(c => [yearKey(c.fy), Math.abs(c.val || 0)]));
    const ratiosSample = [];
    for (const inc of recentIncome) {
      const yr = yearKey(inc.calendarYear);
      const rev = inc.revenue;
      if (!rev || rev === 0) continue;
      const dep = depByYear.get(yr);
      const capex = capexByYear.get(yr) ?? Math.abs(cashflowByYear.get(yr)?.capitalExpenditure || 0);
      const bal = balance.find(b => b.calendarYear === yr);
      const ca = bal?.currentAssets;
      const cl = bal?.currentLiabilities;
      const nwc = (ca !== null && ca !== undefined && cl !== null && cl !== undefined) ? (ca - cl) : null;
      ratiosSample.push({
        opMargin: inc.operatingIncome / rev,
        capexRatio: capex ? (capex / rev) : null,
        daRatio: dep ? (dep / rev) : null,
        nwcRatio: nwc !== null ? (nwc / rev) : null,
        latestNwc: nwc,
      });
    }
    const avg = (arr, key) => {
      const vals = arr.map(a => a[key]).filter(v => v !== null && isFinite(v));
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    const dcfRatios = {
      opMargin: avg(ratiosSample, 'opMargin'),
      capexRatio: avg(ratiosSample, 'capexRatio'),
      daRatio: avg(ratiosSample, 'daRatio'),
      nwcRatio: avg(ratiosSample, 'nwcRatio'),
      latestNwc: ratiosSample.length > 0 ? ratiosSample[ratiosSample.length - 1].latestNwc : null,
    };
    const currentOpMargin = latestRevenue ? (latestIncome?.operatingIncome || 0) / latestRevenue : dcfRatios.opMargin;
    const dcfValue = calcMultiStageDCF(latestRevenue, currentOpMargin, dcfRatios);

    // Calculate valuations
    const valuations = {
      // DCF Models (10-year projections)
      dcfOperatingCashFlow: dcfValue,
      dcfFreeCashFlow: null,
      dcfNetIncome: null,
      dcfTerminal: null,

      // Relative Valuations
      fairValuePS: avgPS && latestRevenue > 0 && sharesOutstanding ? (latestRevenue * avgPS * 0.9) / sharesOutstanding : null, // 10% margin of safety
      fairValuePE: avgPE && latestNetIncome > 0 && sharesOutstanding ? (latestNetIncome * avgPE * 0.9) / sharesOutstanding : null,
      fairValuePB: avgPB && latestEquity > 0 && sharesOutstanding ? (latestEquity * avgPB * 0.8) / sharesOutstanding : null, // 20% margin of safety

      // Growth-adjusted valuations
      pegValue: avgPE && netIncomeGrowth > 0 && sharesOutstanding
        ? (latestNetIncome * (avgPE / (netIncomeGrowth * 100 + 1))) / sharesOutstanding
        : null,
      psgValue: avgPS && revenueGrowth > 0 && sharesOutstanding
        ? (latestRevenue * (avgPS / (revenueGrowth * 100 + 1))) / sharesOutstanding
        : null,

      // Graham Number (conservative)
      grahamNumber: latestNetIncome > 0 && latestEquity > 0 && sharesOutstanding
        ? Math.sqrt(22.5 * (latestNetIncome / sharesOutstanding) * (latestEquity / sharesOutstanding))
        : null,

      // Earnings Power Value
      earningsPowerValue: latestNetIncome > 0 && discountRate > 0 && sharesOutstanding
        ? (latestNetIncome / discountRate) / sharesOutstanding
        : null,
    };

    const compositeMethodConfig = [
      { key: 'dcfOperatingCashFlow', label: 'Discounted Cash Flow (Unlevered Free Cash Flow)' },
      { key: 'dcfTerminal', label: 'Discounted Cash Flow Terminal Value (15x Free Cash Flow)' },
      { key: 'fairValuePS', label: 'Fair Value (Price-to-Sales)' },
      { key: 'fairValuePE', label: 'Fair Value (Price-to-Earnings)' },
      { key: 'fairValuePB', label: 'Fair Value (Price-to-Book)' },
      { key: 'earningsPowerValue', label: 'Earnings Power Value' },
      { key: 'grahamNumber', label: 'Graham Number' },
    ];

    const compositeMethods = compositeMethodConfig
      .map(({ key, label }) => ({ key, label, value: valuations[key] }))
      .filter((entry) => entry.value !== null && entry.value > 0 && isFinite(entry.value));

    const compositeValue = compositeMethods.length > 0
      ? compositeMethods.reduce((sum, v) => sum + v.value, 0) / compositeMethods.length
      : null;

    const dcfConfidence = {
      valid: dcfRatios.opMargin !== null && dcfRatios.capexRatio !== null && dcfRatios.daRatio !== null && dcfRatios.nwcRatio !== null && discountRate > terminalGrowth,
      missing: [
        dcfRatios.opMargin === null ? 'operatingMargin' : null,
        dcfRatios.capexRatio === null ? 'capexRatio' : null,
        dcfRatios.daRatio === null ? 'daRatio' : null,
        dcfRatios.nwcRatio === null ? 'nwcRatio' : null,
      ].filter(Boolean),
    };

    const dcf = {
      ...valuations,
      compositeMethods,
      compositeValue,
      coreCompositeMethods: compositeMethods,
      coreCompositeValue: compositeValue,
      compositeSource: 'core',
      currentPrice,
      upside: compositeValue && currentPrice ? ((compositeValue - currentPrice) / currentPrice) * 100 : null,
      discountRate: discountRate * 100,
      terminalGrowth: terminalGrowth * 100,
      confidence: dcfConfidence,
      assumptions: {
        sharesOutstanding,
        beta,
        costOfEquity: costOfEquity * 100,
        costOfDebt: costOfDebt * 100,
        equityWeight: equityWeight * 100,
        debtWeight: debtWeight * 100,
        taxRate: taxRate * 100,
        revenueGrowth: revenueGrowth * 100,
        netIncomeGrowth: netIncomeGrowth * 100,
        fcfGrowth: fcfGrowth * 100,
        operatingMargin: dcfRatios.opMargin !== null ? dcfRatios.opMargin * 100 : null,
        capexRatio: dcfRatios.capexRatio !== null ? dcfRatios.capexRatio * 100 : null,
        daRatio: dcfRatios.daRatio !== null ? dcfRatios.daRatio * 100 : null,
        nwcRatio: dcfRatios.nwcRatio !== null ? dcfRatios.nwcRatio * 100 : null,
        latestRevenue,
        latestNetIncome,
        latestFCF,
        latestOCF,
        latestEquity,
      },
    };

    // Calculate historical valuation ratios
    const currentMarketCap = quote.marketCap || 0;
    const currentShares = sharesOutstanding;
    const currentPE = favorites.peRatio;
    const currentPS = favorites.psRatio;
    const currentPB = latestEquity > 0 ? currentMarketCap / latestEquity : null;

    // Use the latest close at or before fiscal period end for historical valuation ratios.
    // This avoids mixing today's price with old fundamentals.
    const historicalPriceAtOrBefore = (targetDate) => {
      if (!Array.isArray(priceHistory) || priceHistory.length === 0 || !targetDate) return null;
      for (let i = priceHistory.length - 1; i >= 0; i--) {
        if (priceHistory[i].date <= targetDate && Number.isFinite(priceHistory[i].close)) {
          return priceHistory[i].close;
        }
      }
      return null;
    };

    // Calculate historical ratios (using historical prices and year-specific shares).
    const valuationRatios = income.map((inc, i) => {
      const bal = balanceByYear.get(String(inc.calendarYear)) || {};
      const year = inc.calendarYear;
      const yearShares = sharesForYear(year);
      const historicalPrice = historicalPriceAtOrBefore(inc.date);

      // EPS and per-share metrics
      const eps = yearShares > 0 ? (inc.netIncome / yearShares) : null;
      const salesPerShare = yearShares > 0 ? (inc.revenue / yearShares) : null;
      const bookValuePerShare = yearShares > 0 ? ((bal.totalEquity || 0) / yearShares) : null;

      // Calculate growth rates for PEG/PSG
      const prevIncome = income[i - 1];
      const prevYearShares = prevIncome ? sharesForYear(prevIncome.calendarYear) : null;
      const prevEps = prevIncome && prevYearShares > 0 ? (prevIncome.netIncome / prevYearShares) : null;
      const epsGrowth = prevEps && prevEps !== 0
        ? (eps - prevEps) / prevEps
        : null;
      const revenueGrowthRate = prevIncome && prevIncome.revenue > 0
        ? (inc.revenue - prevIncome.revenue) / prevIncome.revenue
        : null;

      // Historical P/E/P/S/P/B using that period's own price and own fundamentals.
      const peRatio = Number.isFinite(historicalPrice) && eps > 0 ? historicalPrice / eps : null;
      const psRatio = Number.isFinite(historicalPrice) && salesPerShare > 0 ? historicalPrice / salesPerShare : null;
      const pbRatio = Number.isFinite(historicalPrice) && bookValuePerShare > 0 ? historicalPrice / bookValuePerShare : null;

      // PEG ratio (P/E divided by growth rate)
      const pegRatio = peRatio && epsGrowth !== null && epsGrowth > 0
        ? peRatio / (epsGrowth * 100)
        : null;

      // PSG ratio (P/S divided by growth rate)
      const psgRatio = psRatio && revenueGrowthRate !== null && revenueGrowthRate > 0
        ? psRatio / (revenueGrowthRate * 100)
        : null;

      return {
        year,
        peRatio,
        psRatio,
        pbRatio,
        pegRatio,
        psgRatio,
        eps,
        historicalPrice,
        epsGrowth: epsGrowth !== null ? epsGrowth * 100 : null,
        revenueGrowth: revenueGrowthRate !== null ? revenueGrowthRate * 100 : null,
      };
    });

    // Calculate 10-year averages
    const calcAvg = (arr, key) => {
      const valid = arr.map(a => a[key]).filter(v => v !== null && isFinite(v) && v > 0);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };

    // Calculate median
    const calcMedian = (arr, key) => {
      const valid = arr.map(a => a[key]).filter(v => v !== null && isFinite(v) && v > 0).sort((a, b) => a - b);
      if (valid.length === 0) return null;
      const mid = Math.floor(valid.length / 2);
      return valid.length % 2 !== 0 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
    };

    // Calculate additional metrics
    const latestOperatingIncome = latestIncome?.operatingIncome || 0;
    const ebit = latestOperatingIncome;
    const ebitdaForRatios = ebitda;

    // Enterprise Value calculation
    const enterpriseValue = currentMarketCap + (latestBalance?.totalDebt || 0) - (latestBalance?.cashAndCashEquivalents || 0);

    // Mean and Median calculations from historical data
    const meanPE = calcAvg(valuationRatios, 'peRatio');
    const meanPS = calcAvg(valuationRatios, 'psRatio');
    const meanPB = calcAvg(valuationRatios, 'pbRatio');
    const medianPE = calcMedian(valuationRatios, 'peRatio');
    const medianPS = calcMedian(valuationRatios, 'psRatio');
    const medianPB = calcMedian(valuationRatios, 'pbRatio');

    // EPS for value calculations
    const currentEPS = currentShares ? latestNetIncome / currentShares : null;
    const salesPerShare = currentShares ? latestRevenue / currentShares : null;
    const bookValuePerShare = currentShares ? latestEquity / currentShares : null;

    // Rule of 40 (Revenue Growth % + Profit Margin %)
    const profitMargin = latestRevenue > 0 ? (latestNetIncome / latestRevenue) * 100 : 0;
    const ruleOf40 = (revenueGrowth * 100) + profitMargin;

    // Forward P/E (estimate using growth)
    const forwardEPS = currentEPS !== null ? currentEPS * (1 + Math.min(netIncomeGrowth, 0.2)) : null;
    const forwardPE = forwardEPS && forwardEPS > 0 && currentPrice ? currentPrice / forwardEPS : null;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const growthSignals = [revenueGrowth, netIncomeGrowth, fcfGrowth, favorites.epsGrowth]
      .filter((g) => g !== null && g !== undefined && isFinite(g));
    const positiveGrowthSignals = growthSignals.filter((g) => g > 0);
    const blendedGrowthSignal = positiveGrowthSignals.length > 0
      ? positiveGrowthSignals.reduce((a, b) => a + b, 0) / positiveGrowthSignals.length
      : 0;

    // Oracle-style risk and growth assumptions for 20Y methods (separate from core WACC path).
    const oracleDiscountRate = clamp(
      (riskFreeRate + (beta * 0.055)) + 0.01 + (netIncomeGrowth < 0 ? 0.01 : 0) + (beta > 1.5 ? 0.005 : 0),
      0.10,
      0.18
    );
    const oracleTerminalGrowth = 0.03;

    const calcOracle20Y = (baseValue, growthBias = 1.0, shares) => {
      if (!baseValue || baseValue <= 0 || !isFinite(baseValue)) return null;
      const years = 20;
      const highGrowthYears = 4;
      const highGrowth = clamp(blendedGrowthSignal * growthBias, 0.05, 0.22);
      let totalPV = 0;
      let cf = baseValue;

      for (let year = 1; year <= years; year++) {
        const growth = year <= highGrowthYears
          ? highGrowth
          : highGrowth + (oracleTerminalGrowth - highGrowth) * ((year - highGrowthYears) / (years - highGrowthYears));
        cf *= (1 + growth);
        totalPV += cf / Math.pow(1 + oracleDiscountRate, year);
      }

      const terminalCF = cf * (1 + oracleTerminalGrowth);
      const terminalValue = terminalCF / (oracleDiscountRate - oracleTerminalGrowth);
      const pvTerminal = terminalValue / Math.pow(1 + oracleDiscountRate, years);
      if (!shares || shares <= 0) return null;
      return (totalPV + pvTerminal) / shares;
    };

    const otherValuationRatios = {
      // Per Share Metrics
      ebitdaPerShare: ebitdaForRatios && currentShares ? ebitdaForRatios / currentShares : null,
      earningsYield: currentEPS && currentEPS > 0 && currentPrice ? (currentEPS / currentPrice) * 100 : null,

      // Enterprise Value Metrics
      enterpriseValue,
      evToFCF: latestFCF > 0 ? enterpriseValue / latestFCF : null,
      evToEBIT: ebit > 0 ? enterpriseValue / ebit : null,
      evToEBITDA: ebitdaForRatios && ebitdaForRatios > 0 ? enterpriseValue / ebitdaForRatios : null,
      evToRevenue: latestRevenue > 0 ? enterpriseValue / latestRevenue : null,

      // Forward Metrics
      forwardPE,

      // Mean Ratios and Values
      meanPE,
      meanPEValue: meanPE && currentEPS > 0 ? meanPE * currentEPS : null,
      meanPS,
      meanPSValue: meanPS && salesPerShare > 0 ? meanPS * salesPerShare : null,
      meanPB,
      meanPBValue: meanPB && bookValuePerShare > 0 ? meanPB * bookValuePerShare : null,

      // Median Ratios and Values
      medianPE,
      medianPEValue: medianPE && currentEPS > 0 ? medianPE * currentEPS : null,
      medianPS,
      medianPSValue: medianPS && salesPerShare > 0 ? medianPS * salesPerShare : null,
      medianPB,
      medianPBValue: medianPB && bookValuePerShare > 0 ? medianPB * bookValuePerShare : null,

      // DCF Values (20-year projections, Oracle-style growth-aware path)
      dcf20Year: calcOracle20Y(latestOCF, 0.95, currentShares),
      dfcf20Year: calcOracle20Y(latestFCF, 1.00, currentShares),
      dni20Year: calcOracle20Y(latestNetIncome, 0.90, currentShares),
      dfcfTerminal: latestFCF > 0 && currentShares ? (latestFCF * (1 + oracleTerminalGrowth) / (oracleDiscountRate - oracleTerminalGrowth)) / currentShares : null,

      // Rule of 40
      ruleOf40,
    };

    const latestIncomeYear = income[income.length - 1]?.calendarYear;
    const prevIncomeYear = income[income.length - 2]?.calendarYear;
    const latestSharesForGrowth = latestIncomeYear ? sharesForYear(latestIncomeYear) : currentShares;
    const prevSharesForGrowth = prevIncomeYear ? sharesForYear(prevIncomeYear) : currentShares;
    const latestEps = latestSharesForGrowth ? latestNetIncome / latestSharesForGrowth : null;
    const prevNetIncome = income[income.length - 2]?.netIncome;
    const prevEps = prevSharesForGrowth && prevNetIncome ? prevNetIncome / prevSharesForGrowth : null;
    const currentEpsGrowth = prevEps !== null && prevEps !== 0 && latestEps !== null ? (latestEps - prevEps) / prevEps : null;
    const currentRevenueGrowth = Number.isFinite(valuationRatios[valuationRatios.length - 1]?.revenueGrowth)
      ? valuationRatios[valuationRatios.length - 1].revenueGrowth / 100
      : revenueGrowth;

    const valuationRatiosSummary = {
      historical: valuationRatios,
      current: {
        peRatio: currentPE,
        psRatio: currentPS,
        pbRatio: currentPB,
        pegRatio: currentPE && currentEpsGrowth !== null && currentEpsGrowth > 0
          ? currentPE / (currentEpsGrowth * 100)
          : null,
        psgRatio: currentPS && currentRevenueGrowth > 0 ? currentPS / (currentRevenueGrowth * 100) : null,
      },
      tenYearAvg: {
        peRatio: calcAvg(valuationRatios, 'peRatio'),
        psRatio: calcAvg(valuationRatios, 'psRatio'),
        pbRatio: calcAvg(valuationRatios, 'pbRatio'),
        pegRatio: calcAvg(valuationRatios, 'pegRatio'),
        psgRatio: calcAvg(valuationRatios, 'psgRatio'),
      },
      other: otherValuationRatios,
    };

    // Oracle-style approximation (for iterative calibration against sample charts)
    const oracleRawValues = {
      dcf20Year: otherValuationRatios.dcf20Year,
      dfcf20Year: otherValuationRatios.dfcf20Year,
      dni20Year: otherValuationRatios.dni20Year,
      dfcfTerminal: otherValuationRatios.dfcfTerminal,
      meanPSValue: otherValuationRatios.meanPSValue,
      meanPEValue: otherValuationRatios.meanPEValue,
      meanPBValue: otherValuationRatios.meanPBValue,
      psgValue: valuations.psgValue,
      pegValue: valuations.pegValue,
      analystTargetValue: financialData?.targetMeanPrice || financialData?.targetMedianPrice || null,
    };

    // Per-method scaling factors. Keep neutral unless broader calibration data
    // shows a systematic cross-ticker bias.
    const oracleCalibrationFactor = {
      dcf20Year: 1.0,
      dfcf20Year: 1.0,
      dni20Year: 1.0,
      dfcfTerminal: 1.0,
      meanPSValue: 1.0,
      meanPEValue: 1.0,
      meanPBValue: 1.0,
      psgValue: 1.0,
      pegValue: 1.0,
      analystTargetValue: 1.0,
    };

    const calibratedOracleValue = (key, rawValue) => {
      if (rawValue === null || rawValue === undefined || !isFinite(rawValue) || rawValue <= 0) return null;
      const factor = oracleCalibrationFactor[key] ?? 1;
      const adjusted = rawValue * factor;
      return isFinite(adjusted) && adjusted > 0 ? adjusted : null;
    };

    const oracleApproxConfig = {
      methodWeights: {
        dcf20Year: 0.30,
        dfcf20Year: 0.20,
        dni20Year: 0.35,
        dfcfTerminal: 0.15,
        meanPSValue: 0.20,
        meanPEValue: 0.30,
        meanPBValue: 0.25,
        psgValue: 0.10,
        pegValue: 0.15,
        analystTargetValue: 1.0,
      },
      dcfBlendWeight: 0.55,
      relativeBlendWeight: 0.35,
      analystBlendWeight: 0.10,
      medianAnchorWeight: 0.10,
      priceAnchorBase: 0.04,
      priceAnchorSpread: 0.10,
      priceAnchorMax: 0.22,
    };

    const oracleApproxMethodConfig = [
      { key: 'dcf20Year', label: 'Discounted Cash Flow (20-Year Cash Flow Model)', value: calibratedOracleValue('dcf20Year', oracleRawValues.dcf20Year), rawValue: oracleRawValues.dcf20Year, weight: oracleApproxConfig.methodWeights.dcf20Year, type: 'dcf' },
      { key: 'dfcf20Year', label: 'Discounted Free Cash Flow (20-Year Model)', value: calibratedOracleValue('dfcf20Year', oracleRawValues.dfcf20Year), rawValue: oracleRawValues.dfcf20Year, weight: oracleApproxConfig.methodWeights.dfcf20Year, type: 'dcf' },
      { key: 'dni20Year', label: 'Discounted Net Income (20-Year Model)', value: calibratedOracleValue('dni20Year', oracleRawValues.dni20Year), rawValue: oracleRawValues.dni20Year, weight: oracleApproxConfig.methodWeights.dni20Year, type: 'dcf' },
      { key: 'dfcfTerminal', label: 'Discounted Free Cash Flow (Terminal Value Model)', value: calibratedOracleValue('dfcfTerminal', oracleRawValues.dfcfTerminal), rawValue: oracleRawValues.dfcfTerminal, weight: oracleApproxConfig.methodWeights.dfcfTerminal, type: 'dcf' },
      { key: 'meanPSValue', label: 'Historical Mean Price-to-Sales Ratio Value', value: calibratedOracleValue('meanPSValue', oracleRawValues.meanPSValue), rawValue: oracleRawValues.meanPSValue, weight: oracleApproxConfig.methodWeights.meanPSValue, type: 'relative' },
      { key: 'meanPEValue', label: 'Historical Mean Price-to-Earnings Ratio Value (Excluding Non-Recurring Items)', value: calibratedOracleValue('meanPEValue', oracleRawValues.meanPEValue), rawValue: oracleRawValues.meanPEValue, weight: oracleApproxConfig.methodWeights.meanPEValue, type: 'relative' },
      { key: 'meanPBValue', label: 'Historical Mean Price-to-Book Ratio Value', value: calibratedOracleValue('meanPBValue', oracleRawValues.meanPBValue), rawValue: oracleRawValues.meanPBValue, weight: oracleApproxConfig.methodWeights.meanPBValue, type: 'relative' },
      { key: 'psgValue', label: 'Price-to-Sales-to-Growth Ratio Value', value: calibratedOracleValue('psgValue', oracleRawValues.psgValue), rawValue: oracleRawValues.psgValue, weight: oracleApproxConfig.methodWeights.psgValue, type: 'relative' },
      { key: 'pegValue', label: 'Price-to-Earnings-to-Growth Ratio Value (Excluding Non-Recurring Items)', value: calibratedOracleValue('pegValue', oracleRawValues.pegValue), rawValue: oracleRawValues.pegValue, weight: oracleApproxConfig.methodWeights.pegValue, type: 'relative' },
      { key: 'analystTargetValue', label: 'Analyst Mean Target Price', value: calibratedOracleValue('analystTargetValue', oracleRawValues.analystTargetValue), rawValue: oracleRawValues.analystTargetValue, weight: oracleApproxConfig.methodWeights.analystTargetValue, type: 'analyst' },
    ];

    const oracleApproxMethods = oracleApproxMethodConfig.filter((m) => m.value !== null && m.value > 0 && isFinite(m.value));

    const calcMedianValues = (vals) => {
      const sorted = [...vals].sort((a, b) => a - b);
      if (!sorted.length) return null;
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const rawOracleValues = oracleApproxMethods.map((m) => m.value).filter((v) => v > 0 && isFinite(v));
    const oracleMedian = calcMedianValues(rawOracleValues);

    const weightedOracleMethods = oracleApproxMethods.map((m) => {
      if (!oracleMedian || !m.value || m.value <= 0) return { ...m, dynamicWeight: m.weight };
      const distance = Math.abs(Math.log(m.value / oracleMedian));
      const reliability = 1 / (1 + (distance * 2));
      return { ...m, dynamicWeight: m.weight * reliability };
    });

    const weightedMean = (rows) => {
      const valid = rows.filter((r) => r.value > 0 && isFinite(r.value));
      if (!valid.length) return null;
      const w = valid.reduce((sum, r) => sum + (r.dynamicWeight || 0), 0);
      if (!w) return null;
      return valid.reduce((sum, r) => sum + (r.value * ((r.dynamicWeight || 0) / w)), 0);
    };

    const dcfBucket = weightedOracleMethods.filter((m) => m.type === 'dcf');
    const relativeBucket = weightedOracleMethods.filter((m) => m.type === 'relative');
    const analystBucket = weightedOracleMethods.filter((m) => m.type === 'analyst');
    const dcfBucketFair = weightedMean(dcfBucket);
    const relativeBucketFair = weightedMean(relativeBucket);
    const analystBucketFair = weightedMean(analystBucket);

    const blendedBucketFair = (() => {
      const parts = [
        { value: dcfBucketFair, weight: oracleApproxConfig.dcfBlendWeight },
        { value: relativeBucketFair, weight: oracleApproxConfig.relativeBlendWeight },
        { value: analystBucketFair, weight: oracleApproxConfig.analystBlendWeight },
      ].filter((p) => p.value && p.value > 0 && isFinite(p.value));
      if (!parts.length) return null;
      const w = parts.reduce((sum, p) => sum + p.weight, 0);
      if (!w) return null;
      return parts.reduce((sum, p) => sum + (p.value * (p.weight / w)), 0);
    })();

    const netMargin = latestRevenue > 0 ? (latestNetIncome / latestRevenue) : 0;

    const oracleApproxComposite = (() => {
      if (!blendedBucketFair) return null;
      const baseNoPrice = oracleMedian
        ? (blendedBucketFair * (1 - oracleApproxConfig.medianAnchorWeight)) + (oracleMedian * oracleApproxConfig.medianAnchorWeight)
        : blendedBucketFair;

      // First-principles adjustment layer:
      // - Growth premium from multi-signal growth trend
      // - Quality premium from profitability/returns
      // - Risk penalty from beta + leverage
      const growthScore = clamp((blendedGrowthSignal - 0.08) / 0.20, -0.50, 1.00);
      const qualityBase = [
        favorites.roic,
        favorites.roe,
        netMargin,
      ].filter((v) => v !== null && v !== undefined && isFinite(v));
      const qualityScore = qualityBase.length
        ? clamp((qualityBase.reduce((a, b) => a + b, 0) / qualityBase.length - 0.12) / 0.18, -0.50, 0.80)
        : 0;
      const riskSignals = [
        beta ? clamp((beta - 1.0) / 1.0, -0.50, 1.20) : 0,
        favorites.debtToEbitda !== null && favorites.debtToEbitda !== undefined
          ? clamp((favorites.debtToEbitda - 2.0) / 2.0, -0.50, 1.50)
          : 0,
      ];
      const riskScore = riskSignals.reduce((a, b) => a + b, 0) / riskSignals.length;

      let adjusted = baseNoPrice * (1 + (0.20 * growthScore) + (0.10 * qualityScore) - (0.12 * riskScore));

      // Regime-aware correction: if multiple-based bucket is much richer than
      // intrinsic cash-flow bucket, damp optimism; if opposite and growth is healthy,
      // allow a modest premium.
      if (dcfBucketFair && relativeBucketFair && dcfBucketFair > 0 && relativeBucketFair > 0) {
        const relativeStretch = relativeBucketFair / dcfBucketFair;
        if (relativeStretch > 1.35) {
          adjusted *= (1 - Math.min(0.20, (relativeStretch - 1.35) * 0.25));
        } else if (relativeStretch < 0.80 && growthScore > 0) {
          adjusted *= (1 + Math.min(0.12, (0.80 - relativeStretch) * 0.20));
        }
      }

      const spread = (dcfBucketFair && relativeBucketFair)
        ? Math.abs(Math.log((dcfBucketFair + 1) / (relativeBucketFair + 1)))
        : 0;
      const priceAnchor = Math.min(
        oracleApproxConfig.priceAnchorMax,
        oracleApproxConfig.priceAnchorBase + (oracleApproxConfig.priceAnchorSpread * spread) + (beta > 1.3 ? 0.04 : 0)
      );
      const anchored = currentPrice
        ? (adjusted * (1 - priceAnchor)) + (currentPrice * priceAnchor)
        : adjusted;

      if (!oracleMedian) return anchored;
      const floor = oracleMedian * 0.45;
      const ceiling = oracleMedian * 2.40;
      return Math.min(ceiling, Math.max(floor, anchored));
    })();

    if (oracleApproxComposite && oracleApproxMethods.length >= 4) {
      dcf.compositeMethods = weightedOracleMethods.map(({ key, label, value, boundedValue, type, rawValue, weight, dynamicWeight }) => ({
        key,
        label,
        value,
        boundedValue: value,
        type,
        rawValue,
        weight,
        dynamicWeight: dynamicWeight ?? weight,
        calibrationFactor: oracleCalibrationFactor[key] ?? 1,
      }));
      dcf.compositeValue = oracleApproxComposite;
      dcf.compositeSource = 'oracle_approx_v2_calibrated';
      dcf.upside = currentPrice ? ((oracleApproxComposite - currentPrice) / currentPrice) * 100 : null;
      dcf.oracleAssumptions = {
        oracleDiscountRate: oracleDiscountRate * 100,
        oracleTerminalGrowth: oracleTerminalGrowth * 100,
        blendedGrowthSignal: blendedGrowthSignal * 100,
        highGrowthYears: 4,
        weightingModel: 'oracle_approx_v2_calibrated',
        oracleMedian,
        oracleOutlierFloor: null,
        oracleOutlierCeiling: null,
        dcfBucketFair,
        relativeBucketFair,
        analystBucketFair,
        blendedBucketFair,
        dcfBlendWeight: oracleApproxConfig.dcfBlendWeight,
        relativeBlendWeight: oracleApproxConfig.relativeBlendWeight,
        analystBlendWeight: oracleApproxConfig.analystBlendWeight,
        medianAnchorWeight: oracleApproxConfig.medianAnchorWeight,
      };
    }

    // Calculate Factor Rankings (Low, Medium, High)
    const getRank = (score) => {
      if (score >= 70) return 'High';
      if (score >= 40) return 'Medium';
      return 'Low';
    };

    const getMoatRank = (score) => {
      if (score >= 75) return 'Wide';
      if (score >= 50) return 'Narrow';
      return 'None';
    };

    const getValuationRank = (upside) => {
      if (upside > 20) return 'Undervalued';
      if (upside > -10) return 'Fairly Valued';
      return 'Overvalued';
    };

    // 1. Predictability Rank - Based on earnings consistency
    const earningsValues = recentIncome.map(i => i.netIncome).filter(v => v > 0);
    const earningsVariance = earningsValues.length > 1
      ? Math.sqrt(earningsValues.reduce((sum, v, _, arr) => {
          const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
          return sum + Math.pow(v - mean, 2);
        }, 0) / earningsValues.length) / (earningsValues.reduce((a, b) => a + b, 0) / earningsValues.length)
      : 1;
    const predictabilityScore = Math.max(0, Math.min(100, 100 - (earningsVariance * 200)));

    // 2. Profitability Rank - Based on margins and returns
    const roe = favorites.roe || 0;
    const roic = favorites.roic || 0;
    const profitabilityScore = Math.min(100, (
      (netMargin > 0.20 ? 40 : netMargin > 0.10 ? 25 : netMargin > 0.05 ? 15 : 5) +
      (roe > 0.25 ? 30 : roe > 0.15 ? 20 : roe > 0.10 ? 10 : 5) +
      (roic > 0.20 ? 30 : roic > 0.12 ? 20 : roic > 0.08 ? 10 : 5)
    ));

    // 3. Growth Rank - Based on revenue and earnings growth
    const growthScore = Math.min(100, (
      (revenueGrowth > 0.20 ? 50 : revenueGrowth > 0.10 ? 35 : revenueGrowth > 0.05 ? 20 : revenueGrowth > 0 ? 10 : 0) +
      (netIncomeGrowth > 0.20 ? 50 : netIncomeGrowth > 0.10 ? 35 : netIncomeGrowth > 0.05 ? 20 : netIncomeGrowth > 0 ? 10 : 0)
    ));

    // 4. Moat Rank - Based on sustained margins, ROIC, and consistency
    const moatScore = Math.min(100, (
      (netMargin > 0.15 ? 25 : netMargin > 0.08 ? 15 : 5) +
      (roic > 0.15 ? 25 : roic > 0.10 ? 15 : 5) +
      (predictabilityScore > 60 ? 25 : predictabilityScore > 40 ? 15 : 5) +
      (revenueGrowth > 0.05 ? 25 : revenueGrowth > 0 ? 15 : 5)
    ));

    // 5. Financial Strength Rank - Based on debt levels and coverage
    const debtToEbitda = favorites.debtToEbitda || 0;
    const financialStrengthScore = Math.min(100, (
      (debtToEbitda < 1 ? 50 : debtToEbitda < 2 ? 35 : debtToEbitda < 3 ? 20 : 10) +
      (latestBalance?.cashAndCashEquivalents > latestBalance?.totalDebt ? 50 :
       latestBalance?.cashAndCashEquivalents > latestBalance?.totalDebt * 0.5 ? 35 : 20)
    ));

    // 6. Valuation Rank - Based on upside potential
    const valuationUpside = dcf.upside || 0;

    const factorRankings = {
      predictability: {
        score: Math.round(predictabilityScore),
        rank: getRank(predictabilityScore),
      },
      profitability: {
        score: Math.round(profitabilityScore),
        rank: getRank(profitabilityScore),
      },
      growth: {
        score: Math.round(growthScore),
        rank: getRank(growthScore),
      },
      moat: {
        score: Math.round(moatScore),
        rank: getMoatRank(moatScore),
      },
      financialStrength: {
        score: Math.round(financialStrengthScore),
        rank: getRank(financialStrengthScore),
      },
      valuation: {
        score: Math.round(50 + valuationUpside), // Center around 50
        rank: getValuationRank(valuationUpside),
      },
    };

    const tradingSignals = calculateTradingSignals(priceHistory, quote.price);
    const dataQuality = {
      sec: {
        cik,
        available: Boolean(cik) && secIssues.length === 0,
        issues: secIssues,
      },
      yahoo: {
        quote: Boolean(yahooQuote),
        fundamentals: Boolean(yahooStats),
        history: Array.isArray(priceHistoryRaw) && priceHistoryRaw.length > 0,
        historyWindowYears: 10,
        insiderWindowDays: 183,
      },
    };

    return NextResponse.json({
      profile,
      quote,
      favorites,
      income,
      incomeQ,
      balance,
      balanceQ,
      cashflow,
      cashflowQ,
      ratios,
      metrics,
      dcf,
      valuationRatios: valuationRatiosSummary,
      factorRankings,
      insiderTransactions,
      insiderSelling,
      priceHistory,
      tradingSignals,
      dataQuality,
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch stock data',
        detail: error?.message || 'unknown_error',
      },
      { status: 500 }
    );
  }
}
