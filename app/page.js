'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function StockValuationCalculator() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const fetchStockData = async () => {
    if (!ticker) {
      setError('Please enter a ticker symbol');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/stock?ticker=${ticker.toUpperCase()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') fetchStockData();
  };

  const calculateGrahamNumber = () => {
    if (!data?.metrics?.length || !data?.quote) return null;
    const latestMetrics = data.metrics[data.metrics.length - 1];
    const eps = latestMetrics.netIncomePerShare || 0;
    const bvps = latestMetrics.bookValuePerShare || 0;
    if (eps <= 0 || bvps <= 0) return null;
    return Math.sqrt(22.5 * eps * bvps);
  };

  const calculatePEGValue = () => {
    if (!data?.quote || !data?.income?.length) return null;
    const pe = data.quote.pe;
    const growthRates = data.income.slice(-5).map((inc, i, arr) => {
      if (i === 0) return null;
      const prevIncome = arr[i - 1]?.netIncome;
      const currIncome = inc?.netIncome;
      if (!prevIncome || !currIncome || prevIncome <= 0) return null;
      return ((currIncome - prevIncome) / prevIncome) * 100;
    }).filter(Boolean);

    if (growthRates.length === 0 || !pe) return null;
    const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
    if (avgGrowth <= 0) return null;
    return pe / avgGrowth;
  };

  const getValuationVerdict = () => {
    if (!data?.quote?.price) return null;

    const currentPrice = data.quote.price;
    const valuations = [];

    const dcfValue = data.dcf?.dcf;
    if (dcfValue) valuations.push({ method: 'DCF Model', value: dcfValue });

    const graham = calculateGrahamNumber();
    if (graham) valuations.push({ method: 'Graham Number', value: graham });

    if (valuations.length === 0) return null;

    const avgFairValue = valuations.reduce((sum, v) => sum + v.value, 0) / valuations.length;
    const upside = ((avgFairValue - currentPrice) / currentPrice) * 100;

    return {
      currentPrice,
      avgFairValue,
      upside,
      valuations,
      verdict: upside > 15 ? 'UNDERVALUED' : upside < -15 ? 'OVERVALUED' : 'FAIRLY VALUED',
    };
  };

  const formatNumber = (num, decimals = 2) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
    if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
    return `$${num.toFixed(decimals)}`;
  };

  const formatPercent = (num) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return `${(num * 100).toFixed(2)}%`;
  };

  const formatRatio = (num) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return num.toFixed(2);
  };

  const prepareMarginData = () => {
    if (!data?.ratios) return [];
    return data.ratios.map((r) => ({
      year: r.calendarYear || r.date?.slice(0, 4),
      'Gross Margin': parseFloat(((r.grossProfitMargin || 0) * 100).toFixed(1)),
      'Operating Margin': parseFloat(((r.operatingProfitMargin || 0) * 100).toFixed(1)),
      'Net Margin': parseFloat(((r.netProfitMargin || 0) * 100).toFixed(1)),
    }));
  };

  const prepareReturnData = () => {
    if (!data?.ratios) return [];
    return data.ratios.map((r) => ({
      year: r.calendarYear || r.date?.slice(0, 4),
      ROE: parseFloat(((r.returnOnEquity || 0) * 100).toFixed(1)),
      ROIC: parseFloat(((r.returnOnCapitalEmployed || 0) * 100).toFixed(1)),
      ROA: parseFloat(((r.returnOnAssets || 0) * 100).toFixed(1)),
    }));
  };

  const prepareIncomeData = () => {
    if (!data?.income) return [];
    return data.income.map((i) => ({
      year: i.calendarYear || i.date?.slice(0, 4),
      Revenue: parseFloat((i.revenue / 1e9).toFixed(2)),
      'Operating Income': parseFloat((i.operatingIncome / 1e9).toFixed(2)),
      'Net Income': parseFloat((i.netIncome / 1e9).toFixed(2)),
    }));
  };

  const prepareCashFlowData = () => {
    if (!data?.cashflow) return [];
    return data.cashflow.map((c) => ({
      year: c.calendarYear || c.date?.slice(0, 4),
      'Operating CF': parseFloat((c.operatingCashFlow / 1e9).toFixed(2)),
      'Free Cash Flow': parseFloat((c.freeCashFlow / 1e9).toFixed(2)),
      CapEx: parseFloat((Math.abs(c.capitalExpenditure || 0) / 1e9).toFixed(2)),
    }));
  };

  const prepareBalanceData = () => {
    if (!data?.balance) return [];
    return data.balance.map((b) => ({
      year: b.calendarYear || b.date?.slice(0, 4),
      'Cash & Investments': parseFloat(
        ((b.cashAndCashEquivalents + (b.shortTermInvestments || 0)) / 1e9).toFixed(2)
      ),
      'Total Debt': parseFloat(((b.totalDebt || 0) / 1e9).toFixed(2)),
    }));
  };

  const prepareQuarterlyIncomeData = () => {
    if (!data?.incomeQ) return [];
    return data.incomeQ.map((i) => ({
      quarter: `${i.fiscalYear || i.date?.slice(0, 4)} ${i.period || ''}`.trim(),
      Revenue: parseFloat((i.revenue / 1e9).toFixed(2)),
      'Operating Income': parseFloat((i.operatingIncome / 1e9).toFixed(2)),
      'Net Income': parseFloat((i.netIncome / 1e9).toFixed(2)),
    }));
  };

  const prepareQuarterlyCashFlowData = () => {
    if (!data?.cashflowQ) return [];
    return data.cashflowQ.map((c) => ({
      quarter: `${c.fiscalYear || c.date?.slice(0, 4)} ${c.period || ''}`.trim(),
      'Operating CF': parseFloat((c.operatingCashFlow / 1e9).toFixed(2)),
      'Free Cash Flow': parseFloat((c.freeCashFlow / 1e9).toFixed(2)),
    }));
  };

  const verdict = data ? getValuationVerdict() : null;

  const ChartSection = ({ title, chartData, dataKeys, colors, unit = '', dataKeyX = 'year' }) => (
    <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold mb-4 text-gray-700 tracking-wide">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={dataKeyX} tick={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} />
          <YAxis tick={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontFamily: 'JetBrains Mono', fontSize: 12, borderRadius: '8px' }}
            formatter={(value) => [`${value}${unit}`, '']}
          />
          <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} />
          {dataKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={colors[i]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const MetricCard = ({ label, value, subtext }) => (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
      <div className="text-xs text-gray-500 mb-1 tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-wider mb-2">
          STOCK VALUATION CALCULATOR
        </h1>
        <p className="text-sm text-gray-500 tracking-wide">
          Professional fundamental analysis & intrinsic value estimation
        </p>
      </div>

      {/* Search Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full sm:max-w-xs">
            <label className="block text-xs text-gray-600 mb-2 tracking-wide">
              TICKER SYMBOL
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="AAPL"
              className="w-full px-4 py-3 text-lg font-mono border-2 border-gray-200 rounded-lg transition-colors"
            />
          </div>
          <button
            onClick={fetchStockData}
            disabled={loading}
            className={`px-8 py-3 text-sm font-semibold tracking-wider rounded-lg transition-colors ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gray-900 hover:bg-gray-700 cursor-pointer'
            } text-white`}
          >
            {loading ? 'ANALYZING...' : 'ANALYZE'}
          </button>
        </div>
        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">⚠ {error}</div>
        )}
        <p className="mt-4 text-xs text-gray-400">
          Enter any US stock ticker (e.g., AAPL, MSFT, GOOGL, NVDA, TSLA)
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-16">
          <div className="inline-block animate-pulse">
            <div className="text-lg text-gray-500">Fetching financial data...</div>
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Company Header */}
          <div
            className="p-6 rounded-xl text-white mb-6 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)' }}
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold mb-1">{data.profile.companyName}</h2>
                <p className="text-sm opacity-85">
                  {data.profile.symbol} • {data.profile.exchangeShortName} • {data.profile.sector}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-3xl sm:text-4xl font-bold">
                  ${data.quote?.price?.toFixed(2)}
                </div>
                <div
                  className={`text-sm font-medium ${
                    data.quote?.changesPercentage >= 0 ? 'text-green-300' : 'text-red-300'
                  }`}
                >
                  {data.quote?.changesPercentage >= 0 ? '▲' : '▼'} $
                  {Math.abs(data.quote?.change || 0).toFixed(2)} (
                  {Math.abs(data.quote?.changesPercentage || 0).toFixed(2)}%)
                </div>
              </div>
            </div>
          </div>

          {/* Valuation Verdict */}
          {verdict && (
            <div
              className={`p-6 rounded-xl mb-6 border-2 ${
                verdict.verdict === 'UNDERVALUED'
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-500'
                  : verdict.verdict === 'OVERVALUED'
                  ? 'bg-gradient-to-r from-red-50 to-rose-50 border-red-500'
                  : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-400'
              }`}
            >
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                  <div className="text-xs text-gray-500 mb-2 tracking-wider">VALUATION VERDICT</div>
                  <div
                    className={`text-2xl sm:text-3xl font-bold tracking-wide ${
                      verdict.verdict === 'UNDERVALUED'
                        ? 'text-green-600'
                        : verdict.verdict === 'OVERVALUED'
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {verdict.verdict}
                  </div>
                  <div className="text-sm mt-2">
                    {verdict.upside > 0 ? (
                      <span className="text-green-600">
                        ↑ {verdict.upside.toFixed(1)}% upside potential
                      </span>
                    ) : (
                      <span className="text-red-600">
                        ↓ {Math.abs(verdict.upside).toFixed(1)}% downside risk
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-8 sm:gap-12">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 tracking-wide mb-1">CURRENT PRICE</div>
                    <div className="text-xl sm:text-2xl font-bold text-gray-700">
                      ${verdict.currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 tracking-wide mb-1">EST. FAIR VALUE</div>
                    <div className="text-xl sm:text-2xl font-bold text-green-600">
                      ${verdict.avgFairValue.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Valuation Methods */}
              <div className="mt-6 pt-5 border-t border-gray-200/50">
                <div className="text-xs text-gray-500 mb-3 tracking-wide">VALUATION METHODS</div>
                <div className="flex flex-wrap gap-3">
                  {verdict.valuations.map((v, i) => (
                    <div
                      key={i}
                      className="bg-white px-4 py-3 rounded-lg border border-gray-200 shadow-sm"
                    >
                      <div className="text-xs text-gray-400 tracking-wide">{v.method}</div>
                      <div className="text-lg font-semibold text-gray-900">
                        ${v.value.toFixed(2)}
                      </div>
                    </div>
                  ))}
                  {data.quote?.pe && (
                    <div className="bg-white px-4 py-3 rounded-lg border border-gray-200 shadow-sm">
                      <div className="text-xs text-gray-400 tracking-wide">P/E Ratio</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {data.quote.pe.toFixed(2)}x
                      </div>
                    </div>
                  )}
                  {calculatePEGValue() && (
                    <div className="bg-white px-4 py-3 rounded-lg border border-gray-200 shadow-sm">
                      <div className="text-xs text-gray-400 tracking-wide">PEG Ratio</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {calculatePEGValue().toFixed(2)}
                      </div>
                    </div>
                  )}
                  {data.ratios?.length > 0 &&
                    data.ratios[data.ratios.length - 1]?.priceToSalesRatio && (
                      <div className="bg-white px-4 py-3 rounded-lg border border-gray-200 shadow-sm">
                        <div className="text-xs text-gray-400 tracking-wide">P/S Ratio</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {data.ratios[data.ratios.length - 1].priceToSalesRatio.toFixed(2)}x
                        </div>
                      </div>
                    )}
                  {data.ratios?.length > 0 &&
                    data.ratios[data.ratios.length - 1]?.priceToBookRatio && (
                      <div className="bg-white px-4 py-3 rounded-lg border border-gray-200 shadow-sm">
                        <div className="text-xs text-gray-400 tracking-wide">P/B Ratio</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {data.ratios[data.ratios.length - 1].priceToBookRatio.toFixed(2)}x
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Key Metrics Grid */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-4 text-gray-700 tracking-wider">KEY METRICS</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <MetricCard label="MARKET CAP" value={formatNumber(data.quote?.marketCap)} />
              <MetricCard
                label="ENTERPRISE VALUE"
                value={formatNumber(data.metrics[data.metrics.length - 1]?.enterpriseValue)}
              />
              <MetricCard label="P/E RATIO" value={formatRatio(data.quote?.pe)} subtext="TTM" />
              <MetricCard
                label="P/S RATIO"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.priceToSalesRatio)}
              />
              <MetricCard
                label="P/B RATIO"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.priceToBookRatio)}
              />
              <MetricCard
                label="EV/EBITDA"
                value={formatRatio(
                  data.metrics[data.metrics.length - 1]?.evToEBITDA
                )}
              />
              <MetricCard
                label="DEBT/EQUITY"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.debtToEquityRatio)}
              />
              <MetricCard
                label="CURRENT RATIO"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.currentRatio)}
              />
              <MetricCard
                label="QUICK RATIO"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.quickRatio)}
              />
              <MetricCard
                label="DIVIDEND YIELD"
                value={formatPercent(data.ratios[data.ratios.length - 1]?.dividendYield)}
              />
              <MetricCard
                label="FCF YIELD"
                value={formatPercent(data.metrics[data.metrics.length - 1]?.freeCashFlowYield)}
              />
              <MetricCard
                label="EARNINGS YIELD"
                value={formatPercent(data.metrics[data.metrics.length - 1]?.earningsYield)}
              />
            </div>
          </div>

          {/* Annual Charts */}
          <h3 className="text-sm font-semibold mb-4 text-gray-700 tracking-wider">ANNUAL DATA</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <ChartSection
              title="PROFITABILITY MARGINS (%)"
              chartData={prepareMarginData()}
              dataKeys={['Gross Margin', 'Operating Margin', 'Net Margin']}
              colors={['#3b82f6', '#f97316', '#22c55e']}
              unit="%"
            />
            <ChartSection
              title="RETURN ON CAPITAL (%)"
              chartData={prepareReturnData()}
              dataKeys={['ROE', 'ROIC', 'ROA']}
              colors={['#3b82f6', '#f97316', '#92400e']}
              unit="%"
            />
            <ChartSection
              title="INCOME STATEMENT ($B)"
              chartData={prepareIncomeData()}
              dataKeys={['Revenue', 'Operating Income', 'Net Income']}
              colors={['#3b82f6', '#f97316', '#22c55e']}
              unit="B"
            />
            <ChartSection
              title="CASH FLOW ($B)"
              chartData={prepareCashFlowData()}
              dataKeys={['Operating CF', 'Free Cash Flow', 'CapEx']}
              colors={['#f97316', '#166534', '#ec4899']}
              unit="B"
            />
            <ChartSection
              title="BALANCE SHEET ($B)"
              chartData={prepareBalanceData()}
              dataKeys={['Cash & Investments', 'Total Debt']}
              colors={['#22c55e', '#dc2626']}
              unit="B"
            />
          </div>

          {/* Quarterly Charts */}
          <h3 className="text-sm font-semibold mb-4 text-gray-700 tracking-wider">QUARTERLY DATA</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSection
              title="QUARTERLY REVENUE & INCOME ($B)"
              chartData={prepareQuarterlyIncomeData()}
              dataKeys={['Revenue', 'Operating Income', 'Net Income']}
              colors={['#3b82f6', '#f97316', '#22c55e']}
              unit="B"
              dataKeyX="quarter"
            />
            <ChartSection
              title="QUARTERLY CASH FLOW ($B)"
              chartData={prepareQuarterlyCashFlowData()}
              dataKeys={['Operating CF', 'Free Cash Flow']}
              colors={['#f97316', '#166534']}
              unit="B"
              dataKeyX="quarter"
            />
          </div>

          {/* Historical Ratios Table */}
          <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold mb-4 text-gray-700 tracking-wider">
              HISTORICAL FINANCIAL RATIOS
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 border-b-2 border-gray-200">
                      YEAR
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200">
                      GROSS
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200">
                      OPERATING
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200">
                      NET
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200">
                      ROE
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200">
                      ROIC
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200">
                      ROA
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200">
                      D/E
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200">
                      CURRENT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.ratios.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {r.calendarYear || r.date?.slice(0, 4)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatPercent(r.grossProfitMargin)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatPercent(r.operatingProfitMargin)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatPercent(r.netProfitMargin)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatPercent(r.returnOnEquity)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatPercent(r.returnOnCapitalEmployed)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatPercent(r.returnOnAssets)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatRatio(r.debtToEquityRatio)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatRatio(r.currentRatio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Company Profile */}
          <div className="mt-6 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold mb-3 text-gray-700 tracking-wider">
              COMPANY PROFILE
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {data.profile.description?.slice(0, 600)}
              {data.profile.description?.length > 600 ? '...' : ''}
            </p>
            <div className="mt-4 flex flex-wrap gap-6 text-sm text-gray-500">
              <span>
                <strong>CEO:</strong> {data.profile.ceo || 'N/A'}
              </span>
              <span>
                <strong>Employees:</strong>{' '}
                {data.profile.fullTimeEmployees?.toLocaleString() || 'N/A'}
              </span>
              <span>
                <strong>Website:</strong>{' '}
                <a
                  href={data.profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  {data.profile.website}
                </a>
              </span>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 p-5 bg-amber-50 rounded-xl border border-amber-200 text-sm text-amber-800 leading-relaxed">
            <strong>⚠ Disclaimer:</strong> This calculator provides estimates based on publicly
            available financial data and standard valuation models (DCF, Graham Number, multiples).
            It should not be considered financial advice. Always conduct your own due diligence and
            consult with a qualified financial advisor before making investment decisions. Past
            performance does not guarantee future results.
          </div>
        </>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-gray-400">
        Data provided by Financial Modeling Prep • Built with Next.js & Recharts
      </div>
    </div>
  );
}
