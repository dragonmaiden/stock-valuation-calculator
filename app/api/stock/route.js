import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
  }

  try {
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: [
        'price',
        'summaryDetail',
        'summaryProfile',
        'financialData',
        'defaultKeyStatistics',
        'incomeStatementHistory',
        'incomeStatementHistoryQuarterly',
        'balanceSheetHistory',
        'balanceSheetHistoryQuarterly',
        'cashflowStatementHistory',
        'cashflowStatementHistoryQuarterly',
      ],
    });

    const {
      price,
      summaryDetail,
      summaryProfile,
      financialData,
      defaultKeyStatistics,
      incomeStatementHistory,
      incomeStatementHistoryQuarterly,
      balanceSheetHistory,
      balanceSheetHistoryQuarterly,
      cashflowStatementHistory,
      cashflowStatementHistoryQuarterly,
    } = quoteSummary;

    // Build profile
    const profile = {
      symbol: price?.symbol || ticker,
      companyName: price?.longName || price?.shortName || ticker,
      exchangeShortName: price?.exchangeName || '',
      sector: summaryProfile?.sector || '',
      industry: summaryProfile?.industry || '',
      description: summaryProfile?.longBusinessSummary || '',
      ceo: summaryProfile?.companyOfficers?.[0]?.name || '',
      fullTimeEmployees: summaryProfile?.fullTimeEmployees || 0,
      website: summaryProfile?.website || '',
    };

    // Build quote
    const quote = {
      price: price?.regularMarketPrice || 0,
      change: price?.regularMarketChange || 0,
      changesPercentage: price?.regularMarketChangePercent * 100 || 0,
      marketCap: price?.marketCap || summaryDetail?.marketCap || 0,
      pe: summaryDetail?.trailingPE || defaultKeyStatistics?.trailingPE || null,
    };

    // Build ratios from latest data
    const latestRatios = {
      grossProfitMargin: financialData?.grossMargins || null,
      operatingProfitMargin: financialData?.operatingMargins || null,
      netProfitMargin: financialData?.profitMargins || null,
      returnOnEquity: financialData?.returnOnEquity || null,
      returnOnAssets: financialData?.returnOnAssets || null,
      currentRatio: financialData?.currentRatio || null,
      quickRatio: financialData?.quickRatio || null,
      debtToEquityRatio: financialData?.debtToEquity ? financialData.debtToEquity / 100 : null,
      priceToSalesRatio: summaryDetail?.priceToSalesTrailing12Months || null,
      priceToBookRatio: defaultKeyStatistics?.priceToBook || null,
      dividendYield: summaryDetail?.dividendYield || null,
    };

    // Build metrics
    const latestMetrics = {
      enterpriseValue: defaultKeyStatistics?.enterpriseValue || null,
      evToEBITDA: defaultKeyStatistics?.enterpriseToEbitda || null,
      freeCashFlowYield: financialData?.freeCashflow && price?.marketCap
        ? financialData.freeCashflow / price.marketCap
        : null,
      earningsYield: summaryDetail?.trailingPE ? 1 / summaryDetail.trailingPE : null,
      bookValuePerShare: defaultKeyStatistics?.bookValue || null,
      netIncomePerShare: defaultKeyStatistics?.trailingEps || null,
    };

    // Process income statements (annual)
    const income = (incomeStatementHistory?.incomeStatementHistory || []).map((stmt) => ({
      date: stmt.endDate?.toISOString?.() || '',
      calendarYear: stmt.endDate?.getFullYear?.()?.toString() || '',
      revenue: stmt.totalRevenue || 0,
      grossProfit: stmt.grossProfit || 0,
      operatingIncome: stmt.operatingIncome || 0,
      netIncome: stmt.netIncome || 0,
    })).reverse();

    // Process income statements (quarterly)
    const incomeQ = (incomeStatementHistoryQuarterly?.incomeStatementHistory || []).map((stmt) => ({
      date: stmt.endDate?.toISOString?.() || '',
      fiscalYear: stmt.endDate?.getFullYear?.()?.toString() || '',
      period: `Q${Math.ceil((stmt.endDate?.getMonth?.() + 1) / 3)}`,
      revenue: stmt.totalRevenue || 0,
      grossProfit: stmt.grossProfit || 0,
      operatingIncome: stmt.operatingIncome || 0,
      netIncome: stmt.netIncome || 0,
    })).reverse();

    // Process balance sheets (annual)
    const balance = (balanceSheetHistory?.balanceSheetStatements || []).map((stmt) => ({
      date: stmt.endDate?.toISOString?.() || '',
      calendarYear: stmt.endDate?.getFullYear?.()?.toString() || '',
      totalAssets: stmt.totalAssets || 0,
      totalLiabilities: stmt.totalLiab || 0,
      totalEquity: stmt.totalStockholderEquity || 0,
      cashAndCashEquivalents: stmt.cash || 0,
      shortTermInvestments: stmt.shortTermInvestments || 0,
      totalDebt: (stmt.longTermDebt || 0) + (stmt.shortLongTermDebt || 0),
    })).reverse();

    // Process balance sheets (quarterly)
    const balanceQ = (balanceSheetHistoryQuarterly?.balanceSheetStatements || []).map((stmt) => ({
      date: stmt.endDate?.toISOString?.() || '',
      fiscalYear: stmt.endDate?.getFullYear?.()?.toString() || '',
      period: `Q${Math.ceil((stmt.endDate?.getMonth?.() + 1) / 3)}`,
      totalAssets: stmt.totalAssets || 0,
      totalLiabilities: stmt.totalLiab || 0,
      totalEquity: stmt.totalStockholderEquity || 0,
      cashAndCashEquivalents: stmt.cash || 0,
      shortTermInvestments: stmt.shortTermInvestments || 0,
      totalDebt: (stmt.longTermDebt || 0) + (stmt.shortLongTermDebt || 0),
    })).reverse();

    // Process cash flow statements (annual)
    const cashflow = (cashflowStatementHistory?.cashflowStatements || []).map((stmt) => ({
      date: stmt.endDate?.toISOString?.() || '',
      calendarYear: stmt.endDate?.getFullYear?.()?.toString() || '',
      operatingCashFlow: stmt.totalCashFromOperatingActivities || 0,
      capitalExpenditure: stmt.capitalExpenditures || 0,
      freeCashFlow: (stmt.totalCashFromOperatingActivities || 0) + (stmt.capitalExpenditures || 0),
    })).reverse();

    // Process cash flow statements (quarterly)
    const cashflowQ = (cashflowStatementHistoryQuarterly?.cashflowStatements || []).map((stmt) => ({
      date: stmt.endDate?.toISOString?.() || '',
      fiscalYear: stmt.endDate?.getFullYear?.()?.toString() || '',
      period: `Q${Math.ceil((stmt.endDate?.getMonth?.() + 1) / 3)}`,
      operatingCashFlow: stmt.totalCashFromOperatingActivities || 0,
      capitalExpenditure: stmt.capitalExpenditures || 0,
      freeCashFlow: (stmt.totalCashFromOperatingActivities || 0) + (stmt.capitalExpenditures || 0),
    })).reverse();

    // Calculate historical ratios from income statements
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
        returnOnCapitalEmployed: bal.totalAssets && bal.totalLiabilities
          ? inc.operatingIncome / (bal.totalAssets - bal.totalLiabilities)
          : null,
        debtToEquityRatio: bal.totalEquity ? bal.totalDebt / bal.totalEquity : null,
        currentRatio: latestRatios.currentRatio,
      };
    });

    // Build metrics array for historical data
    const metrics = income.map((inc) => ({
      date: inc.date,
      calendarYear: inc.calendarYear,
      enterpriseValue: latestMetrics.enterpriseValue,
      evToEBITDA: latestMetrics.evToEBITDA,
      freeCashFlowYield: latestMetrics.freeCashFlowYield,
      earningsYield: latestMetrics.earningsYield,
      bookValuePerShare: latestMetrics.bookValuePerShare,
      netIncomePerShare: latestMetrics.netIncomePerShare,
    }));

    // Simple DCF estimate
    const dcf = financialData?.freeCashflow && defaultKeyStatistics?.sharesOutstanding
      ? {
          dcf: (financialData.freeCashflow * 15) / defaultKeyStatistics.sharesOutstanding,
          stockPrice: price?.regularMarketPrice || 0,
        }
      : null;

    return NextResponse.json({
      profile,
      quote,
      income,
      incomeQ,
      balance,
      balanceQ,
      cashflow,
      cashflowQ,
      ratios: ratios.length > 0 ? ratios : [latestRatios],
      metrics: metrics.length > 0 ? metrics : [latestMetrics],
      dcf,
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch stock data: ' + error.message }, { status: 500 });
  }
}
