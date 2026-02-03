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
        modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData'],
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

    // Build favorites metrics
    const summaryDetail = yahooStats?.summaryDetail || {};
    const keyStats = yahooStats?.defaultKeyStatistics || {};
    const financialData = yahooStats?.financialData || {};

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

    // Calculate ROIC and Debt/EBITDA from SEC data if available
    const latestIncome = income[income.length - 1];
    const latestBalance = balance[balance.length - 1];
    const latestCashflow = cashflow[cashflow.length - 1];

    if (latestIncome && latestBalance) {
      const nopat = latestIncome.operatingIncome * 0.75; // Approximate after-tax
      const investedCapital = (latestBalance.totalEquity || 0) + (latestBalance.totalDebt || 0) - (latestBalance.cashAndCashEquivalents || 0);
      if (investedCapital > 0) {
        favorites.roic = nopat / investedCapital;
      }
    }

    if (latestIncome && latestBalance && latestCashflow) {
      // EBITDA = Operating Income + Depreciation (approximated from cashflow)
      const depreciation = Math.abs(latestCashflow.capitalExpenditure || 0) * 0.5; // Rough estimate
      const ebitda = latestIncome.operatingIncome + depreciation;
      if (ebitda > 0) {
        favorites.debtToEbitda = (latestBalance.totalDebt || 0) / ebitda;
      }
    }

    // Calculate comprehensive valuations
    const sharesOutstanding = favorites.sharesOutstanding || 1;
    const currentPrice = quote.price || 1;

    // Get historical data for calculations
    const recentIncome = income.slice(-5);
    const recentCashflow = cashflow.slice(-5);
    const recentBalance = balance.slice(-5);

    // Calculate average growth rates
    const calcGrowthRate = (data, key) => {
      if (data.length < 2) return 0.05; // Default 5%
      const values = data.map(d => d[key]).filter(v => v > 0);
      if (values.length < 2) return 0.05;
      const growthRates = [];
      for (let i = 1; i < values.length; i++) {
        if (values[i-1] > 0) {
          growthRates.push((values[i] - values[i-1]) / values[i-1]);
        }
      }
      const avg = growthRates.length > 0 ? growthRates.reduce((a,b) => a+b, 0) / growthRates.length : 0.05;
      return Math.min(Math.max(avg, -0.1), 0.25); // Cap between -10% and 25%
    };

    const revenueGrowth = calcGrowthRate(recentIncome, 'revenue');
    const netIncomeGrowth = calcGrowthRate(recentIncome, 'netIncome');
    const fcfGrowth = calcGrowthRate(recentCashflow, 'freeCashFlow');

    // Latest values
    const latestRevenue = recentIncome[recentIncome.length - 1]?.revenue || 0;
    const latestNetIncome = recentIncome[recentIncome.length - 1]?.netIncome || 0;
    const latestFCF = recentCashflow[recentCashflow.length - 1]?.freeCashFlow || 0;
    const latestOCF = recentCashflow[recentCashflow.length - 1]?.operatingCashFlow || 0;
    const latestEquity = recentBalance[recentBalance.length - 1]?.totalEquity || 0;

    // Discount rate (WACC approximation)
    const riskFreeRate = 0.04; // 4%
    const marketRiskPremium = 0.05; // 5%
    const beta = favorites.beta || 1;
    const discountRate = riskFreeRate + beta * marketRiskPremium;
    const terminalGrowth = 0.025; // 2.5% perpetual growth

    // DCF calculation helper
    const calcDCF = (initialValue, growthRate, years, terminalMultiple = null) => {
      if (initialValue <= 0) return null;
      let totalPV = 0;
      let projectedValue = initialValue;

      for (let year = 1; year <= years; year++) {
        projectedValue *= (1 + Math.min(growthRate, 0.15)); // Cap growth at 15%
        totalPV += projectedValue / Math.pow(1 + discountRate, year);
      }

      // Terminal value
      if (terminalMultiple) {
        const terminalValue = projectedValue * terminalMultiple;
        totalPV += terminalValue / Math.pow(1 + discountRate, years);
      } else {
        const terminalValue = projectedValue * (1 + terminalGrowth) / (discountRate - terminalGrowth);
        totalPV += terminalValue / Math.pow(1 + discountRate, years);
      }

      return totalPV / sharesOutstanding;
    };

    // Calculate average multiples from historical data
    const avgPS = recentIncome.length > 0 && latestRevenue > 0
      ? (favorites.psRatio || (quote.marketCap / latestRevenue))
      : null;
    const avgPE = favorites.peRatio || null;
    const avgPB = latestEquity > 0 ? quote.marketCap / latestEquity : null;

    // Calculate valuations
    const valuations = {
      // DCF Models (10-year projections)
      dcfOperatingCashFlow: calcDCF(latestOCF, fcfGrowth * 0.8, 10),
      dcfFreeCashFlow: calcDCF(latestFCF, fcfGrowth, 10),
      dcfNetIncome: calcDCF(latestNetIncome, netIncomeGrowth, 10),
      dcfTerminal: latestFCF > 0 ? (latestFCF * 15) / sharesOutstanding : null, // Simple 15x FCF multiple

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

    // Calculate composite fair value (weighted average of valid methods)
    const validValuations = Object.entries(valuations)
      .filter(([_, v]) => v !== null && v > 0 && isFinite(v))
      .map(([k, v]) => ({ method: k, value: v }));

    const compositeValue = validValuations.length > 0
      ? validValuations.reduce((sum, v) => sum + v.value, 0) / validValuations.length
      : null;

    const dcf = {
      ...valuations,
      compositeValue,
      currentPrice,
      upside: compositeValue ? ((compositeValue - currentPrice) / currentPrice) * 100 : null,
      discountRate: discountRate * 100,
      terminalGrowth: terminalGrowth * 100,
    };

    // Calculate historical valuation ratios
    const currentMarketCap = quote.marketCap || 0;
    const currentShares = favorites.sharesOutstanding || 1;
    const currentPE = favorites.peRatio;
    const currentPS = favorites.psRatio;
    const currentPB = latestEquity > 0 ? currentMarketCap / latestEquity : null;

    // Calculate historical ratios (using current price as approximation for trend analysis)
    const valuationRatios = income.map((inc, i) => {
      const bal = balance[i] || {};
      const cf = cashflow[i] || {};
      const year = inc.calendarYear;

      // EPS and per-share metrics
      const eps = inc.netIncome / currentShares;
      const salesPerShare = inc.revenue / currentShares;
      const bookValuePerShare = (bal.totalEquity || 0) / currentShares;

      // Calculate growth rates for PEG/PSG
      const prevIncome = income[i - 1];
      const epsGrowth = prevIncome && prevIncome.netIncome > 0
        ? (inc.netIncome - prevIncome.netIncome) / prevIncome.netIncome
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
    const depreciation = Math.abs(latestCashflow?.capitalExpenditure || 0) * 0.7; // Estimate D&A
    const ebitda = latestOperatingIncome + depreciation;
    const ebit = latestOperatingIncome;

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
      ebitdaPerShare: ebitda / currentShares,
      earningsYield: currentEPS > 0 ? (currentEPS / currentPrice) * 100 : null,

      // Enterprise Value Metrics
      enterpriseValue,
      evToFCF: latestFCF > 0 ? enterpriseValue / latestFCF : null,
      evToEBIT: ebit > 0 ? enterpriseValue / ebit : null,
      evToEBITDA: ebitda > 0 ? enterpriseValue / ebitda : null,
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
      dcf20Year: calcDCF(latestOCF, fcfGrowth * 0.6, 20),
      dfcf20Year: calcDCF(latestFCF, fcfGrowth * 0.7, 20),
      dni20Year: calcDCF(latestNetIncome, netIncomeGrowth * 0.6, 20),
      dfcfTerminal: latestFCF > 0 ? (latestFCF * (1 + terminalGrowth) / (discountRate - terminalGrowth)) / currentShares : null,

      // Rule of 40
      ruleOf40,
    };

    const valuationRatiosSummary = {
      historical: valuationRatios,
      current: {
        peRatio: currentPE,
        psRatio: currentPS,
        pbRatio: currentPB,
        pegRatio: currentPE && netIncomeGrowth > 0 ? currentPE / (netIncomeGrowth * 100) : null,
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
    const debtToEquity = favorites.debtToEbitda || 0;
    const financialStrengthScore = Math.min(100, (
      (debtToEquity < 1 ? 50 : debtToEquity < 2 ? 35 : debtToEquity < 3 ? 20 : 10) +
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
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch stock data: ' + error.message }, { status: 500 });
  }
}
