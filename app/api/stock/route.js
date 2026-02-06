import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();
const SEC_BASE = 'https://data.sec.gov';
const USER_AGENT = `StockValuationCalculator/1.0 (${process.env.SEC_CONTACT_EMAIL || 'admin@stockvaluationcalculator.app'})`;

// In-memory cache for SEC company tickers (refreshes once per day)
let tickerCache = { data: null, fetchedAt: 0 };
const TICKER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getTickerMap() {
  const now = Date.now();
  if (tickerCache.data && (now - tickerCache.fetchedAt) < TICKER_CACHE_TTL) {
    return tickerCache.data;
  }
  const response = await fetch(`https://www.sec.gov/files/company_tickers.json`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const data = await response.json();
  tickerCache = { data, fetchedAt: now };
  return data;
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

      return {
        date: startMs ? new Date(startMs).toISOString().slice(0, 10) : null,
        epochMs: startMs,
        insider: row?.filerName || row?.name || 'Unknown',
        relation: row?.filerRelation || row?.position || row?.title || 'N/A',
        side,
        shares: sharesRaw !== null ? Math.abs(sharesRaw) : null,
        value: valueRaw !== null ? Math.abs(valueRaw) : null,
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
    // Get CIK from ticker
    const cik = await getCIK(ticker);
    if (!cik) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    // Fetch company facts (financial data) from SEC and price/stats from Yahoo
    const [factsRes, submissionsRes, yahooQuote, yahooStats] = await Promise.all([
      fetch(`${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`, {
        headers: { 'User-Agent': USER_AGENT },
      }),
      fetch(`${SEC_BASE}/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': USER_AGENT },
      }),
      yahooFinance.quote(ticker.toUpperCase()).catch(() => null),
      yahooFinance.quoteSummary(ticker.toUpperCase(), {
        modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'insiderTransactions'],
      }).catch(() => null),
    ]);

    if (!factsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch financial data' }, { status: 500 });
    }

    const facts = await factsRes.json();
    const submissions = await submissionsRes.json();
    const usGaap = facts?.facts?.['us-gaap'] || {};

    // Build profile
    const profile = {
      symbol: ticker.toUpperCase(),
      companyName: facts.entityName || submissions.name || ticker,
      exchangeShortName: submissions.exchanges?.[0] || '',
      sector: submissions.sicDescription || '',
      industry: submissions.sicDescription || '',
      description: '',
      ceo: '',
      fullTimeEmployees: 0,
      website: submissions.website || '',
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

    // Build income statement data (annual)
    const income = revenueAnnual.map((rev) => ({
      grossProfit: (() => {
        const directGross = grossProfitAnnual.find(g => g.fy === rev.fy)?.val;
        if (directGross !== null && directGross !== undefined) return directGross;
        const costOfRevenue = costOfRevenueAnnual.find(c => c.fy === rev.fy)?.val;
        return costOfRevenue !== null && costOfRevenue !== undefined ? (rev.val || 0) - costOfRevenue : null;
      })(),
      date: rev.end,
      calendarYear: String(rev.fy),
      revenue: rev.val || 0,
      operatingIncome: operatingIncomeAnnual.find(o => o.fy === rev.fy)?.val ?? null,
      netIncome: netIncomeAnnual.find(n => n.fy === rev.fy)?.val ?? null,
    })).reverse();

    // Build income statement data (quarterly)
    const incomeQ = revenueQuarterly.map((rev) => ({
      grossProfit: (() => {
        const directGross = grossProfitQuarterly.find(g => g.end === rev.end)?.val;
        if (directGross !== null && directGross !== undefined) return directGross;
        const costOfRevenue = costOfRevenueQuarterly.find(c => c.end === rev.end)?.val;
        return costOfRevenue !== null && costOfRevenue !== undefined ? (rev.val || 0) - costOfRevenue : null;
      })(),
      date: rev.end,
      fiscalYear: String(rev.fy),
      period: rev.fp,
      revenue: rev.val || 0,
      operatingIncome: operatingIncomeQuarterly.find(o => o.end === rev.end)?.val ?? null,
      netIncome: netIncomeQuarterly.find(n => n.end === rev.end)?.val ?? null,
    })).reverse();

    // Build balance sheet data (annual)
    const balance = assetsAnnual.map((asset) => ({
      date: asset.end,
      calendarYear: String(asset.fy),
      totalAssets: asset.val || 0,
      totalEquity: equityAnnual.find(e => e.fy === asset.fy)?.val || 0,
      cashAndCashEquivalents: cashAnnual.find(c => c.fy === asset.fy)?.val || 0,
      shortTermInvestments: 0,
      currentAssets: currentAssetsAnnual.find(ca => ca.fy === asset.fy)?.val || null,
      currentLiabilities: currentLiabilitiesAnnual.find(cl => cl.fy === asset.fy)?.val || null,
      totalDebt: debtAnnual.find(d => d.fy === asset.fy)?.val || 0,
    })).reverse();

    // Build balance sheet data (quarterly)
    const balanceQ = assetsQuarterly.map((asset) => ({
      date: asset.end,
      fiscalYear: String(asset.fy),
      period: asset.fp,
      totalAssets: asset.val || 0,
      totalEquity: equityQuarterly.find(e => e.end === asset.end)?.val || 0,
      cashAndCashEquivalents: cashQuarterly.find(c => c.end === asset.end)?.val || 0,
      shortTermInvestments: 0,
      currentAssets: null,
      currentLiabilities: null,
      totalDebt: debtQuarterly.find(d => d.end === asset.end)?.val || 0,
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

    // Build favorites metrics
    const summaryDetail = yahooStats?.summaryDetail || {};
    const keyStats = yahooStats?.defaultKeyStatistics || {};
    const financialData = yahooStats?.financialData || {};
    const insiderTransactionsRaw = yahooStats?.insiderTransactions?.transactions || [];
    const insiderTransactions = normalizeInsiderTransactions(insiderTransactionsRaw).slice(0, 50);
    const insiderSelling = insiderTransactions
      .filter((tx) => tx.side === 'SELL')
      .slice(0, 20);

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
    const sharesOutstanding = latestDilutedShares || latestBasicShares || favorites.sharesOutstanding || 1;
    const currentPrice = quote.price || 1;

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

    // Simple DCF helper for 20-year projections
    const calcDCF = (baseValue, growthRate, years, shares) => {
      if (!baseValue || baseValue <= 0 || !isFinite(baseValue)) return null;
      const dr = discountRate || 0.10;
      const gr = Math.min(growthRate || 0, 0.15); // Cap growth at 15%
      let totalPV = 0;
      for (let i = 1; i <= years; i++) {
        const cfVal = baseValue * Math.pow(1 + gr, i);
        totalPV += cfVal / Math.pow(1 + dr, i);
      }
      // Add terminal value
      const terminalCF = baseValue * Math.pow(1 + gr, years) * (1 + 0.025);
      const terminalValue = terminalCF / (dr - 0.025);
      const pvTerminal = terminalValue / Math.pow(1 + dr, years);
      return (totalPV + pvTerminal) / (shares || 1);
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
      metrics[i].netIncomePerShare = inc.netIncome ? inc.netIncome / sharesOutstanding : null;
      metrics[i].bookValuePerShare = bal.totalEquity ? bal.totalEquity / sharesOutstanding : null;
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

      return totalPV / sharesOutstanding;
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
      fairValuePS: avgPS && latestRevenue > 0 ? (latestRevenue * avgPS * 0.9) / sharesOutstanding : null, // 10% margin of safety
      fairValuePE: avgPE && latestNetIncome > 0 ? (latestNetIncome * avgPE * 0.9) / sharesOutstanding : null,
      fairValuePB: avgPB && latestEquity > 0 ? (latestEquity * avgPB * 0.8) / sharesOutstanding : null, // 20% margin of safety

      // Growth-adjusted valuations
      pegValue: avgPE && netIncomeGrowth > 0
        ? (latestNetIncome * (avgPE / (netIncomeGrowth * 100 + 1))) / sharesOutstanding
        : null,
      psgValue: avgPS && revenueGrowth > 0
        ? (latestRevenue * (avgPS / (revenueGrowth * 100 + 1))) / sharesOutstanding
        : null,

      // Graham Number (conservative)
      grahamNumber: latestNetIncome > 0 && latestEquity > 0
        ? Math.sqrt(22.5 * (latestNetIncome / sharesOutstanding) * (latestEquity / sharesOutstanding))
        : null,

      // Earnings Power Value
      earningsPowerValue: latestNetIncome > 0 && discountRate > 0
        ? (latestNetIncome / discountRate) / sharesOutstanding
        : null,
    };

    const compositeMethodConfig = [
      { key: 'dcfOperatingCashFlow', label: 'DCF (Unlevered FCF)' },
      { key: 'dcfTerminal', label: 'DCF Terminal (15x FCF)' },
      { key: 'fairValuePS', label: 'Fair Value (P/S)' },
      { key: 'fairValuePE', label: 'Fair Value (P/E)' },
      { key: 'fairValuePB', label: 'Fair Value (P/B)' },
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
      currentPrice,
      upside: compositeValue ? ((compositeValue - currentPrice) / currentPrice) * 100 : null,
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
    const currentShares = favorites.sharesOutstanding || 1;
    const currentPE = favorites.peRatio;
    const currentPS = favorites.psRatio;
    const currentPB = latestEquity > 0 ? currentMarketCap / latestEquity : null;

    // Calculate historical ratios (using current price as approximation for trend analysis)
    const valuationRatios = income.map((inc, i) => {
      const bal = balanceByYear.get(String(inc.calendarYear)) || {};
      const year = inc.calendarYear;

      // EPS and per-share metrics
      const eps = inc.netIncome / currentShares;
      const salesPerShare = inc.revenue / currentShares;
      const bookValuePerShare = (bal.totalEquity || 0) / currentShares;

      // Calculate growth rates for PEG/PSG
      const prevIncome = income[i - 1];
      const prevEps = prevIncome ? (prevIncome.netIncome / currentShares) : null;
      const epsGrowth = prevEps && prevEps !== 0
        ? (eps - prevEps) / prevEps
        : null;
      const revenueGrowthRate = prevIncome && prevIncome.revenue > 0
        ? (inc.revenue - prevIncome.revenue) / prevIncome.revenue
        : null;

      // Historical P/E (using that year's earnings with current price as reference)
      const peRatio = eps > 0 ? currentPrice / eps : null;
      const psRatio = salesPerShare > 0 ? currentPrice / salesPerShare : null;
      const pbRatio = bookValuePerShare > 0 ? currentPrice / bookValuePerShare : null;

      // PEG ratio (P/E divided by growth rate)
      const pegRatio = peRatio && epsGrowth && epsGrowth > 0
        ? peRatio / (epsGrowth * 100)
        : null;

      // PSG ratio (P/S divided by growth rate)
      const psgRatio = psRatio && revenueGrowthRate && revenueGrowthRate > 0
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
        epsGrowth: epsGrowth ? epsGrowth * 100 : null,
        revenueGrowth: revenueGrowthRate ? revenueGrowthRate * 100 : null,
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
    const currentEPS = latestNetIncome / currentShares;
    const salesPerShare = latestRevenue / currentShares;
    const bookValuePerShare = latestEquity / currentShares;

    // Rule of 40 (Revenue Growth % + Profit Margin %)
    const profitMargin = latestRevenue > 0 ? (latestNetIncome / latestRevenue) * 100 : 0;
    const ruleOf40 = (revenueGrowth * 100) + profitMargin;

    // Forward P/E (estimate using growth)
    const forwardEPS = currentEPS * (1 + Math.min(netIncomeGrowth, 0.2));
    const forwardPE = forwardEPS > 0 ? currentPrice / forwardEPS : null;

    const otherValuationRatios = {
      // Per Share Metrics
      ebitdaPerShare: ebitdaForRatios ? ebitdaForRatios / currentShares : null,
      earningsYield: currentEPS > 0 ? (currentEPS / currentPrice) * 100 : null,

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

      // DCF Values (20-year projections)
      dcf20Year: calcDCF(latestOCF, fcfGrowth * 0.6, 20, currentShares),
      dfcf20Year: calcDCF(latestFCF, fcfGrowth * 0.7, 20, currentShares),
      dni20Year: calcDCF(latestNetIncome, netIncomeGrowth * 0.6, 20, currentShares),
      dfcfTerminal: latestFCF > 0 ? (latestFCF * (1 + terminalGrowth) / (discountRate - terminalGrowth)) / currentShares : null,

      // Rule of 40
      ruleOf40,
    };

    const latestEps = currentShares > 0 ? latestNetIncome / currentShares : null;
    const prevNetIncome = income[income.length - 2]?.netIncome;
    const prevEps = currentShares > 0 && prevNetIncome ? prevNetIncome / currentShares : null;
    const currentEpsGrowth = prevEps && prevEps !== 0 ? (latestEps - prevEps) / prevEps : null;

    const valuationRatiosSummary = {
      historical: valuationRatios,
      current: {
        peRatio: currentPE,
        psRatio: currentPS,
        pbRatio: currentPB,
        pegRatio: currentPE && currentEpsGrowth && currentEpsGrowth > 0
          ? currentPE / (currentEpsGrowth * 100)
          : null,
        psgRatio: currentPS && revenueGrowth > 0 ? currentPS / (revenueGrowth * 100) : null,
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
    const netMargin = latestRevenue > 0 ? (latestNetIncome / latestRevenue) : 0;
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
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch stock data' }, { status: 500 });
  }
}
