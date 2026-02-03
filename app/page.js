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
  ReferenceLine,
  Cell,
} from 'recharts';

export default function StockValuationCalculator() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState('annual');

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
    const source = viewMode === 'quarterly' ? data?.incomeQ : data?.income;
    if (!source) return [];
    return source.map((i) => ({
      period: viewMode === 'quarterly'
        ? `${i.fiscalYear || i.date?.slice(0, 4)} ${i.period || ''}`.trim()
        : i.calendarYear || i.date?.slice(0, 4),
      Revenue: parseFloat((i.revenue / 1e9).toFixed(2)),
      'Operating Income': parseFloat((i.operatingIncome / 1e9).toFixed(2)),
      'Net Income': parseFloat((i.netIncome / 1e9).toFixed(2)),
    }));
  };

  const prepareCashFlowData = () => {
    const source = viewMode === 'quarterly' ? data?.cashflowQ : data?.cashflow;
    if (!source) return [];
    return source.map((c) => ({
      period: viewMode === 'quarterly'
        ? `${c.fiscalYear || c.date?.slice(0, 4)} ${c.period || ''}`.trim()
        : c.calendarYear || c.date?.slice(0, 4),
      'Operating CF': parseFloat((c.operatingCashFlow / 1e9).toFixed(2)),
      'Free Cash Flow': parseFloat((c.freeCashFlow / 1e9).toFixed(2)),
      CapEx: parseFloat((Math.abs(c.capitalExpenditure || 0) / 1e9).toFixed(2)),
    }));
  };

  const prepareBalanceData = () => {
    const source = viewMode === 'quarterly' ? data?.balanceQ : data?.balance;
    if (!source) return [];
    return source.map((b) => ({
      period: viewMode === 'quarterly'
        ? `${b.fiscalYear || b.date?.slice(0, 4)} ${b.period || ''}`.trim()
        : b.calendarYear || b.date?.slice(0, 4),
      'Cash & Investments': parseFloat(
        ((b.cashAndCashEquivalents + (b.shortTermInvestments || 0)) / 1e9).toFixed(2)
      ),
      'Total Debt': parseFloat(((b.totalDebt || 0) / 1e9).toFixed(2)),
    }));
  };

  const verdict = data ? getValuationVerdict() : null;

  const ChartSection = ({ title, chartData, dataKeys, colors, unit = '', dataKeyX = 'period' }) => (
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

          {/* My Favorites Section */}
          {data.favorites && (
            <div className="mb-8 bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100">
              <h3 className="text-sm font-semibold mb-4 text-indigo-800 tracking-wider">MY FAVORITES</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">P/E Ratio (TTM)</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.peRatio?.toFixed(2) || 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">P/S Ratio (TTM)</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.psRatio?.toFixed(2) || 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">EPS Growth Rate</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.epsGrowth ? `${(data.favorites.epsGrowth * 100).toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">Dividend Yield (TTM)</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.dividendYield ? `${(data.favorites.dividendYield * 100).toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">Market Cap</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.marketCap ? `$${(data.favorites.marketCap / 1e9).toFixed(2)}B` : 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">Shares Outstanding</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.sharesOutstanding ? `${(data.favorites.sharesOutstanding / 1e9).toFixed(2)}B` : 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">Beta</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.beta?.toFixed(2) || 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">Return on Equity (TTM)</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.roe ? `${(data.favorites.roe * 100).toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">ROIC (TTM)</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.roic ? `${(data.favorites.roic * 100).toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">Debt / EBITDA (TTM)</div>
                  <div className="text-xl font-bold text-gray-900">
                    {data.favorites.debtToEbitda?.toFixed(2) || 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Valuation Chart Section */}
          {data.dcf && data.dcf.compositeValue && (
            <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-gray-700 tracking-wider">VALUATION MODELS</h3>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Fair Value Estimate</div>
                  <div className={`text-2xl font-bold ${data.dcf.upside > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    ${data.dcf.compositeValue?.toFixed(2)}
                  </div>
                  <div className={`text-xs ${data.dcf.upside > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {data.dcf.upside > 0 ? '▲' : '▼'} {Math.abs(data.dcf.upside)?.toFixed(1)}% vs Current Price
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  layout="vertical"
                  data={[
                    { name: 'DCF Operating Cash Flow', value: data.dcf.dcfOperatingCashFlow, type: 'dcf' },
                    { name: 'DCF Free Cash Flow', value: data.dcf.dcfFreeCashFlow, type: 'dcf' },
                    { name: 'DCF Net Income', value: data.dcf.dcfNetIncome, type: 'dcf' },
                    { name: 'DCF Terminal (15x FCF)', value: data.dcf.dcfTerminal, type: 'dcf' },
                    { name: 'Fair Value (P/S)', value: data.dcf.fairValuePS, type: 'relative' },
                    { name: 'Fair Value (P/E)', value: data.dcf.fairValuePE, type: 'relative' },
                    { name: 'Fair Value (P/B)', value: data.dcf.fairValuePB, type: 'relative' },
                    { name: 'Earnings Power Value', value: data.dcf.earningsPowerValue, type: 'relative' },
                    { name: 'Graham Number', value: data.dcf.grahamNumber, type: 'conservative' },
                  ].filter(d => d.value && d.value > 0 && isFinite(d.value))}
                  margin={{ top: 20, right: 60, left: 180, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    type="number"
                    domain={[0, 'auto']}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11 }}
                    width={170}
                  />
                  <Tooltip
                    formatter={(value) => [`$${value?.toFixed(2)}`, 'Fair Value']}
                    contentStyle={{ fontSize: 12, borderRadius: '8px' }}
                  />
                  <ReferenceLine
                    x={data.dcf.currentPrice}
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    label={{
                      value: `Current: $${data.dcf.currentPrice?.toFixed(2)}`,
                      position: 'top',
                      fontSize: 11,
                      fill: '#dc2626'
                    }}
                  />
                  <ReferenceLine
                    x={data.dcf.compositeValue}
                    stroke="#16a34a"
                    strokeWidth={2}
                    label={{
                      value: `Fair Value: $${data.dcf.compositeValue?.toFixed(2)}`,
                      position: 'top',
                      fontSize: 11,
                      fill: '#16a34a'
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {[
                      { name: 'DCF Operating Cash Flow', type: 'dcf' },
                      { name: 'DCF Free Cash Flow', type: 'dcf' },
                      { name: 'DCF Net Income', type: 'dcf' },
                      { name: 'DCF Terminal (15x FCF)', type: 'dcf' },
                      { name: 'Fair Value (P/S)', type: 'relative' },
                      { name: 'Fair Value (P/E)', type: 'relative' },
                      { name: 'Fair Value (P/B)', type: 'relative' },
                      { name: 'Earnings Power Value', type: 'relative' },
                      { name: 'Graham Number', type: 'conservative' },
                    ].filter(d => {
                      const val = data.dcf[d.name === 'DCF Operating Cash Flow' ? 'dcfOperatingCashFlow' :
                        d.name === 'DCF Free Cash Flow' ? 'dcfFreeCashFlow' :
                        d.name === 'DCF Net Income' ? 'dcfNetIncome' :
                        d.name === 'DCF Terminal (15x FCF)' ? 'dcfTerminal' :
                        d.name === 'Fair Value (P/S)' ? 'fairValuePS' :
                        d.name === 'Fair Value (P/E)' ? 'fairValuePE' :
                        d.name === 'Fair Value (P/B)' ? 'fairValuePB' :
                        d.name === 'Earnings Power Value' ? 'earningsPowerValue' :
                        'grahamNumber'];
                      return val && val > 0 && isFinite(val);
                    }).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.type === 'dcf' ? '#eab308' : entry.type === 'relative' ? '#f97316' : '#6b7280'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 bg-yellow-500 rounded"></div>
                  <span>DCF Models</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 bg-orange-500 rounded"></div>
                  <span>Relative Valuation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 bg-gray-500 rounded"></div>
                  <span>Conservative</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-red-600"></div>
                  <span>Current Price</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-green-600"></div>
                  <span>Fair Value</span>
                </div>
              </div>

              <div className="mt-4 p-4 bg-gray-50 rounded-lg text-xs text-gray-600">
                <strong>Assumptions:</strong> Discount Rate: {data.dcf.discountRate?.toFixed(1)}% (CAPM-based) •
                Terminal Growth: {data.dcf.terminalGrowth?.toFixed(1)}% •
                Projection Period: 10 years
              </div>
            </div>
          )}

          {/* Valuation Ratios Table */}
          {data.valuationRatios && data.valuationRatios.historical?.length > 0 && (
            <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold mb-4 text-gray-700 tracking-wider">VALUATION RATIOS</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-3 text-left font-semibold text-gray-600 border-b-2 border-gray-200 sticky left-0 bg-gray-50">
                        Metric
                      </th>
                      {data.valuationRatios.historical.map((h) => (
                        <th key={h.year} className="px-3 py-3 text-right font-semibold text-gray-600 border-b-2 border-gray-200 min-w-[70px]">
                          {h.year}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-right font-semibold text-blue-600 border-b-2 border-gray-200 bg-blue-50 min-w-[80px]">
                        Current
                      </th>
                      <th className="px-3 py-3 text-right font-semibold text-purple-600 border-b-2 border-gray-200 bg-purple-50 min-w-[80px]">
                        10Y Avg
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900 sticky left-0 bg-white">Price to Earnings (PE) Ratio</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-gray-600">
                          {h.peRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-600 bg-blue-50">
                        {data.valuationRatios.current?.peRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-purple-600 bg-purple-50">
                        {data.valuationRatios.tenYearAvg?.peRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900 sticky left-0 bg-white">Price to Sales (PS) Ratio</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-gray-600">
                          {h.psRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-600 bg-blue-50">
                        {data.valuationRatios.current?.psRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-purple-600 bg-purple-50">
                        {data.valuationRatios.tenYearAvg?.psRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900 sticky left-0 bg-white">Price to Book (PB) Ratio</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-gray-600">
                          {h.pbRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-600 bg-blue-50">
                        {data.valuationRatios.current?.pbRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-purple-600 bg-purple-50">
                        {data.valuationRatios.tenYearAvg?.pbRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900 sticky left-0 bg-white">PEG Ratio (PE/Growth)</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-gray-600">
                          {h.pegRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-600 bg-blue-50">
                        {data.valuationRatios.current?.pegRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-purple-600 bg-purple-50">
                        {data.valuationRatios.tenYearAvg?.pegRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900 sticky left-0 bg-white">PSG Ratio (PS/Growth)</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-gray-600">
                          {h.psgRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-600 bg-blue-50">
                        {data.valuationRatios.current?.psgRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-purple-600 bg-purple-50">
                        {data.valuationRatios.tenYearAvg?.psgRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 hover:bg-gray-50 bg-gray-25">
                      <td className="px-3 py-3 font-medium text-gray-700 sticky left-0 bg-white">EPS Growth (%)</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className={`px-3 py-3 text-right ${h.epsGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {h.epsGrowth !== null ? `${h.epsGrowth.toFixed(1)}%` : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right text-gray-400 bg-blue-50">-</td>
                      <td className="px-3 py-3 text-right text-gray-400 bg-purple-50">-</td>
                    </tr>
                    <tr className="hover:bg-gray-50 bg-gray-25">
                      <td className="px-3 py-3 font-medium text-gray-700 sticky left-0 bg-white">Revenue Growth (%)</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className={`px-3 py-3 text-right ${h.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {h.revenueGrowth !== null ? `${h.revenueGrowth.toFixed(1)}%` : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right text-gray-400 bg-blue-50">-</td>
                      <td className="px-3 py-3 text-right text-gray-400 bg-purple-50">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-xs text-gray-500">
                Note: Historical ratios calculated using current price vs historical earnings/sales/book value to show relative valuation trends.
              </div>
            </div>
          )}

          {/* Other Valuation Ratios */}
          {data.valuationRatios?.other && (
            <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold mb-4 text-gray-700 tracking-wider">OTHER VALUATION RATIOS</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Per Share & Yield Metrics */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-2">Per Share & Yield</h4>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">EBITDA per Share</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.ebitdaPerShare?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Earnings Yield</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.earningsYield?.toFixed(2) || 'N/A'}%</span>
                  </div>
                </div>

                {/* Enterprise Value Metrics */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-2">Enterprise Value</h4>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Enterprise Value</span>
                    <span className="text-sm font-semibold">${(data.valuationRatios.other.enterpriseValue / 1e9)?.toFixed(2) || 'N/A'}B</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">EV / Free Cash Flow</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.evToFCF?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">EV / EBIT</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.evToEBIT?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">EV / EBITDA</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.evToEBITDA?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">EV / Revenue</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.evToRevenue?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>

                {/* Forward Metrics */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-2">Forward Metrics</h4>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Forward P/E (Next Year)</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.forwardPE?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Rule of 40</span>
                    <span className={`text-sm font-semibold ${data.valuationRatios.other.ruleOf40 >= 40 ? 'text-green-600' : 'text-orange-500'}`}>
                      {data.valuationRatios.other.ruleOf40?.toFixed(2) || 'N/A'}%
                    </span>
                  </div>
                </div>

                {/* Mean Valuations */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-2">Mean Valuations</h4>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mean P/E Ratio</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.meanPE?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mean P/E Value</span>
                    <span className="text-sm font-semibold text-green-600">${data.valuationRatios.other.meanPEValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mean P/S Ratio</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.meanPS?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mean P/S Value</span>
                    <span className="text-sm font-semibold text-green-600">${data.valuationRatios.other.meanPSValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mean P/B Ratio</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.meanPB?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mean P/B Value</span>
                    <span className="text-sm font-semibold text-green-600">${data.valuationRatios.other.meanPBValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>

                {/* Median Valuations */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-2">Median Valuations</h4>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Median P/E Ratio</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.medianPE?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Median P/E Value</span>
                    <span className="text-sm font-semibold text-green-600">${data.valuationRatios.other.medianPEValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Median P/S Ratio</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.medianPS?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Median P/S Value</span>
                    <span className="text-sm font-semibold text-green-600">${data.valuationRatios.other.medianPSValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Median P/B Ratio</span>
                    <span className="text-sm font-semibold">{data.valuationRatios.other.medianPB?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Median P/B Value</span>
                    <span className="text-sm font-semibold text-green-600">${data.valuationRatios.other.medianPBValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>

                {/* DCF Valuations */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-2">DCF Valuations (20-Year)</h4>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">DCF-20 Value</span>
                    <span className="text-sm font-semibold text-blue-600">${data.valuationRatios.other.dcf20Year?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">DFCF-20 Value</span>
                    <span className="text-sm font-semibold text-blue-600">${data.valuationRatios.other.dfcf20Year?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">DNI-20 Value</span>
                    <span className="text-sm font-semibold text-blue-600">${data.valuationRatios.other.dni20Year?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">DFCF-Terminal Value</span>
                    <span className="text-sm font-semibold text-blue-600">${data.valuationRatios.other.dfcfTerminal?.toFixed(2) || 'N/A'}</span>
                  </div>
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

          {/* Charts Section with Toggle */}
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-gray-700 tracking-wider">FINANCIAL CHARTS</h3>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('annual')}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === 'annual'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ANNUAL
              </button>
              <button
                onClick={() => setViewMode('quarterly')}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === 'quarterly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                QUARTERLY
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {viewMode === 'annual' && (
              <>
                <ChartSection
                  title="PROFITABILITY MARGINS (%)"
                  chartData={prepareMarginData()}
                  dataKeys={['Gross Margin', 'Operating Margin', 'Net Margin']}
                  colors={['#3b82f6', '#f97316', '#22c55e']}
                  unit="%"
                  dataKeyX="year"
                />
                <ChartSection
                  title="RETURN ON CAPITAL (%)"
                  chartData={prepareReturnData()}
                  dataKeys={['ROE', 'ROIC', 'ROA']}
                  colors={['#3b82f6', '#f97316', '#92400e']}
                  unit="%"
                  dataKeyX="year"
                />
              </>
            )}
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
