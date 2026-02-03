import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();
const SEC_BASE = 'https://data.sec.gov';
const USER_AGENT = 'StockValuationCalculator/1.0 (contact@example.com)';

// Map common tickers to CIK numbers
async function getCIK(ticker) {
  const response = await fetch(`https://www.sec.gov/files/company_tickers.json`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const data = await response.json();

  const upperTicker = ticker.toUpperCase();
  for (const entry of Object.values(data)) {
    if (entry.ticker === upperTicker) {
      return String(entry.cik_str).padStart(10, '0');
    }
  }
  return null;
}

// Get metric values, combining data from multiple field names for full history
function getMetricValues(facts, fieldNames, period = 'FY', limit = 20) {
  const seen = new Map();

  // Collect data from ALL matching field names to get complete history
  for (const fieldName of fieldNames) {
    const data = facts?.[fieldName]?.units?.USD || [];

    // Filter by period type
    let filtered;
    if (period === 'Q') {
      filtered = data.filter(d => {
        if (!['Q1','Q2','Q3','Q4'].includes(d.fp)) return false;
        if (d.start && d.end) {
          const startDate = new Date(d.start);
          const endDate = new Date(d.end);
          const months = (endDate - startDate) / (1000 * 60 * 60 * 24 * 30);
          return months < 5;
        }
        return true;
      });
    } else {
      filtered = data.filter(d => d.fp === period);
    }

    // Add to seen map, preferring newer filings
    for (const entry of filtered) {
      const key = `${entry.fy}-${entry.fp}`;
      const existing = seen.get(key);
      if (!existing || new Date(entry.filed) > new Date(existing.filed)) {
        seen.set(key, entry);
      }
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.fy - a.fy || b.fp?.localeCompare(a.fp))
    .slice(0, limit);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
  }

  try {
    // Get CIK from ticker
    const cik = await getCIK(ticker);
    if (!cik) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    // Fetch company facts (financial data) from SEC and price from Yahoo
    const [factsRes, submissionsRes, yahooQuote] = await Promise.all([
      fetch(`${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`, {
        headers: { 'User-Agent': USER_AGENT },
      }),
      fetch(`${SEC_BASE}/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': USER_AGENT },
      }),
      yahooFinance.quote(ticker.toUpperCase()).catch(() => null),
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
    const operatingIncomeFields = ['OperatingIncomeLoss'];
    const totalAssetsFields = ['Assets'];
    const totalLiabilitiesFields = ['Liabilities', 'LiabilitiesAndStockholdersEquity'];
    const totalEquityFields = ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'];
    const cashFields = ['CashAndCashEquivalentsAtCarryingValue', 'Cash'];
    const debtFields = ['LongTermDebt', 'LongTermDebtNoncurrent'];
    const operatingCashFlowFields = ['NetCashProvidedByUsedInOperatingActivities'];
    const capexFields = ['PaymentsToAcquirePropertyPlantAndEquipment'];

    // Get annual data (10 years)
    const revenueAnnual = getMetricValues(usGaap, revenueFields, 'FY', 10);
    const netIncomeAnnual = getMetricValues(usGaap, netIncomeFields, 'FY', 10);
    const grossProfitAnnual = getMetricValues(usGaap, grossProfitFields, 'FY', 10);
    const operatingIncomeAnnual = getMetricValues(usGaap, operatingIncomeFields, 'FY', 10);
    const assetsAnnual = getMetricValues(usGaap, totalAssetsFields, 'FY', 10);
    const equityAnnual = getMetricValues(usGaap, totalEquityFields, 'FY', 10);
    const cashAnnual = getMetricValues(usGaap, cashFields, 'FY', 10);
    const debtAnnual = getMetricValues(usGaap, debtFields, 'FY', 10);
    const opCashFlowAnnual = getMetricValues(usGaap, operatingCashFlowFields, 'FY', 10);
    const capexAnnual = getMetricValues(usGaap, capexFields, 'FY', 10);

    // Get quarterly data (20 quarters = 5 years)
    const revenueQuarterly = getMetricValues(usGaap, revenueFields, 'Q', 20);
    const netIncomeQuarterly = getMetricValues(usGaap, netIncomeFields, 'Q', 20);
    const grossProfitQuarterly = getMetricValues(usGaap, grossProfitFields, 'Q', 20);
    const operatingIncomeQuarterly = getMetricValues(usGaap, operatingIncomeFields, 'Q', 20);
    const assetsQuarterly = getMetricValues(usGaap, totalAssetsFields, 'Q', 20);
    const equityQuarterly = getMetricValues(usGaap, totalEquityFields, 'Q', 20);
    const cashQuarterly = getMetricValues(usGaap, cashFields, 'Q', 20);
    const debtQuarterly = getMetricValues(usGaap, debtFields, 'Q', 20);
    const opCashFlowQuarterly = getMetricValues(usGaap, operatingCashFlowFields, 'Q', 20);
    const capexQuarterly = getMetricValues(usGaap, capexFields, 'Q', 20);

    // Build income statement data (annual)
    const income = revenueAnnual.map((rev, i) => ({
      date: rev.end,
      calendarYear: String(rev.fy),
      revenue: rev.val || 0,
      grossProfit: grossProfitAnnual[i]?.val || 0,
      operatingIncome: operatingIncomeAnnual[i]?.val || 0,
      netIncome: netIncomeAnnual.find(n => n.fy === rev.fy)?.val || 0,
    })).reverse();

    // Build income statement data (quarterly)
    const incomeQ = revenueQuarterly.map((rev) => ({
      date: rev.end,
      fiscalYear: String(rev.fy),
      period: rev.fp,
      revenue: rev.val || 0,
      grossProfit: grossProfitQuarterly.find(g => g.end === rev.end)?.val || 0,
      operatingIncome: operatingIncomeQuarterly.find(o => o.end === rev.end)?.val || 0,
      netIncome: netIncomeQuarterly.find(n => n.end === rev.end)?.val || 0,
    })).reverse();

    // Build balance sheet data (annual)
    const balance = assetsAnnual.map((asset, i) => ({
      date: asset.end,
      calendarYear: String(asset.fy),
      totalAssets: asset.val || 0,
      totalEquity: equityAnnual.find(e => e.fy === asset.fy)?.val || 0,
      cashAndCashEquivalents: cashAnnual.find(c => c.fy === asset.fy)?.val || 0,
      shortTermInvestments: 0,
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

    // Build ratios (calculated from data)
    const ratios = income.map((inc, i) => {
      const bal = balance[i] || {};
      return {
        date: inc.date,
        calendarYear: inc.calendarYear,
        grossProfitMargin: inc.revenue ? inc.grossProfit / inc.revenue : null,
        operatingProfitMargin: inc.revenue ? inc.operatingIncome / inc.revenue : null,
        netProfitMargin: inc.revenue ? inc.netIncome / inc.revenue : null,
        returnOnEquity: bal.totalEquity ? inc.netIncome / bal.totalEquity : null,
        returnOnAssets: bal.totalAssets ? inc.netIncome / bal.totalAssets : null,
        returnOnCapitalEmployed: bal.totalAssets && bal.totalEquity
          ? inc.operatingIncome / (bal.totalAssets - (bal.totalAssets - bal.totalEquity - bal.totalDebt))
          : null,
        debtToEquityRatio: bal.totalEquity ? bal.totalDebt / bal.totalEquity : null,
        currentRatio: null,
      };
    });

    // Build metrics
    const metrics = income.map((inc, i) => {
      const bal = balance[i] || {};
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

    // Simple DCF placeholder
    const dcf = null;

    return NextResponse.json({
      profile,
      quote,
      income,
      incomeQ,
      balance,
      balanceQ,
      cashflow,
      cashflowQ,
      ratios,
      metrics,
      dcf,
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch stock data: ' + error.message }, { status: 500 });
  }
}
