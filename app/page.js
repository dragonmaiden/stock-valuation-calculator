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
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) {
      setError('Please enter a ticker symbol');
      return;
    }

    setLoading(true);
    setError('');

    try {
      setTicker(symbol);
      const response = await fetch(`/api/stock?ticker=${symbol}`);
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


  const calculateGrahamNumber = () => {
    if (data?.dcf?.grahamNumber) return data.dcf.grahamNumber;
    if (!data?.metrics?.length) return null;
    const latestMetrics = data.metrics[data.metrics.length - 1];
    const eps = latestMetrics.netIncomePerShare || 0;
    const bvps = latestMetrics.bookValuePerShare || 0;
    if (eps <= 0 || bvps <= 0) return null;
    return Math.sqrt(22.5 * eps * bvps);
  };

  const calculatePEGValue = () => {
    return data?.valuationRatios?.current?.pegRatio ?? null;
  };

  const getValuationVerdict = () => {
    if (!data?.quote?.price) return null;

    const currentPrice = data.quote.price;
    const valuations = [];

    const dcfValue = data.dcf?.compositeValue;
    if (dcfValue) valuations.push({ method: 'DCF Composite', value: dcfValue });

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

  const calcCAGR = (values) => {
    if (!values || values.length < 2) return null;
    const start = values[0];
    const end = values[values.length - 1];
    if (!start || !end || start <= 0 || end <= 0) return null;
    const years = values.length - 1;
    return Math.pow(end / start, 1 / years) - 1;
  };
  const verdict = data ? getValuationVerdict() : null;
  const recentIncome = data?.income?.slice(-5) || [];
  const recentCashflow = data?.cashflow?.slice(-5) || [];
  const revenueCagr = calcCAGR(recentIncome.map((i) => i.revenue).filter((v) => v > 0));
  const fcfCagr = calcCAGR(recentCashflow.map((c) => c.freeCashFlow).filter((v) => v > 0));
  const latestRatio = data?.ratios?.[data?.ratios?.length - 1];
  const priorRatio = data?.ratios?.[data?.ratios?.length - 2];
  const netMargin = latestRatio?.netProfitMargin ?? null;
  const marginDelta = netMargin !== null && priorRatio?.netProfitMargin !== null
    ? netMargin - priorRatio.netProfitMargin
    : null;

  const ChartSection = ({ title, chartData, dataKeys, colors, unit = '', dataKeyX = 'period' }) => (
    <div className="mb-6 bg-[#16161f] p-6 rounded-2xl border border-white/[0.06] hover:border-white/[0.1] transition-colors">
      <h3 className="text-xs font-semibold mb-4 text-[#a0a0b0] tracking-widest uppercase">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey={dataKeyX} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#6b6b80' }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />
          <YAxis tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#6b6b80' }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />
          <Tooltip
            contentStyle={{ fontFamily: 'JetBrains Mono', fontSize: 11, borderRadius: '8px', background: '#1e1e2a', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f0f5' }}
            formatter={(value) => [`${value}${unit}`, '']}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#a0a0b0' }} />
          {dataKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={colors[i]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const MetricCard = ({ label, value, subtext }) => (
    <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.06] hover:border-white/[0.1] transition-all duration-200 group">
      <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">{label}</div>
      <div className="text-base font-semibold text-[#f0f0f5] group-hover:text-white transition-colors">{value}</div>
      {subtext && <div className="text-[10px] text-[#45455a] mt-1">{subtext}</div>}
    </div>
  );

  const SignalPill = ({ label, value, tone = 'neutral' }) => (
    <div
      className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
        tone === 'positive'
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : tone === 'negative'
          ? 'bg-red-500/10 text-red-400 border-red-500/20'
          : 'bg-white/[0.03] text-[#a0a0b0] border-white/[0.06]'
      }`}
    >
      <div className="text-[9px] uppercase tracking-wider text-[#6b6b80] mb-1">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] text-[#6b6b80] tracking-widest uppercase">Live Data</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#f0f0f5] tracking-wider mb-3">
          STOCK VALUATION
        </h1>
        <p className="text-sm text-[#6b6b80] tracking-wide max-w-md mx-auto">
          Professional fundamental analysis & intrinsic value estimation
        </p>
      </div>

      {/* Search Section */}
      <div className="bg-[#16161f] p-6 rounded-2xl border border-white/[0.06] mb-8 gradient-border">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full sm:max-w-sm">
            <label className="block text-[10px] text-[#6b6b80] mb-2 tracking-widest uppercase">
              Ticker Symbol
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && fetchStockData()}
              placeholder="AAPL"
              className="w-full px-4 py-3.5 text-lg font-mono bg-[#0a0a0f] border border-white/[0.1] rounded-xl text-[#f0f0f5] placeholder-[#45455a] focus:border-blue-500/50 transition-all"
            />
          </div>
          <button
            onClick={fetchStockData}
            disabled={loading}
            className={`px-8 py-3.5 text-xs font-semibold tracking-widest rounded-xl transition-all ${
              loading
                ? 'bg-[#1e1e2a] text-[#6b6b80] cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30'
            }`}
          >
            {loading ? 'ANALYZING...' : 'ANALYZE'}
          </button>
        </div>
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 text-red-400 rounded-lg text-xs border border-red-500/20">{error}</div>
        )}
        <p className="mt-4 text-[10px] text-[#45455a] tracking-wide">
          Enter any US stock ticker (e.g., AAPL, MSFT, GOOGL, NVDA, TSLA)
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-20">
          <div className="inline-flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="text-sm text-[#6b6b80] tracking-wide">Analyzing financial data...</div>
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Company Header */}
          <div
            className="p-6 sm:p-8 rounded-2xl text-white mb-6 relative overflow-hidden animate-fadeIn"
            style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #8b5cf6 100%)' }}
          >
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">{data.profile.companyName}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm">{data.profile.symbol}</span>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm">{data.profile.exchangeShortName}</span>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm">{data.profile.sector}</span>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-3xl sm:text-5xl font-bold tracking-tight">
                  ${data.quote?.price?.toFixed(2)}
                </div>
                <div
                  className={`text-sm font-semibold mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                    data.quote?.changesPercentage >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {data.quote?.changesPercentage >= 0 ? '+' : '-'}$
                  {Math.abs(data.quote?.change || 0).toFixed(2)} ({Math.abs(data.quote?.changesPercentage || 0).toFixed(2)}%)
                </div>
              </div>
            </div>
          </div>

          {/* Valuation Verdict */}
          {verdict && (
            <div
              className={`p-6 sm:p-8 rounded-2xl mb-6 border animate-slideUp ${
                verdict.verdict === 'UNDERVALUED'
                  ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30 glow-green'
                  : verdict.verdict === 'OVERVALUED'
                  ? 'bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent border-red-500/30 glow-red'
                  : 'bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent border-white/[0.1]'
              }`}
            >
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                  <div className="text-[10px] text-[#6b6b80] mb-3 tracking-widest uppercase">Valuation Verdict</div>
                  <div
                    className={`text-2xl sm:text-4xl font-bold tracking-wide ${
                      verdict.verdict === 'UNDERVALUED'
                        ? 'text-emerald-400'
                        : verdict.verdict === 'OVERVALUED'
                        ? 'text-red-400'
                        : 'text-[#a0a0b0]'
                    }`}
                  >
                    {verdict.verdict}
                  </div>
                  <div className="text-sm mt-3 font-medium">
                    {verdict.upside > 0 ? (
                      <span className="text-emerald-400 inline-flex items-center gap-1">
                        <span className="text-lg">↑</span> {verdict.upside.toFixed(1)}% upside potential
                      </span>
                    ) : (
                      <span className="text-red-400 inline-flex items-center gap-1">
                        <span className="text-lg">↓</span> {Math.abs(verdict.upside).toFixed(1)}% downside risk
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-8 sm:gap-12">
                  <div className="text-center">
                    <div className="text-[10px] text-[#6b6b80] tracking-widest uppercase mb-2">Current Price</div>
                    <div className="text-2xl sm:text-3xl font-bold text-[#f0f0f5]">
                      ${verdict.currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-[#6b6b80] tracking-widest uppercase mb-2">Est. Fair Value</div>
                    <div className="text-2xl sm:text-3xl font-bold text-emerald-400">
                      ${verdict.avgFairValue.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Valuation Methods */}
              <div className="mt-8 pt-6 border-t border-white/[0.06]">
                <div className="text-[10px] text-[#6b6b80] mb-4 tracking-widest uppercase">Valuation Methods</div>
                <div className="flex flex-wrap gap-3">
                  {verdict.valuations.map((v, i) => (
                    <div
                      key={i}
                      className="bg-[#16161f] px-4 py-3 rounded-xl border border-white/[0.06] hover:border-white/[0.1] transition-colors"
                    >
                      <div className="text-[10px] text-[#6b6b80] tracking-wide uppercase">{v.method}</div>
                      <div className="text-lg font-semibold text-[#f0f0f5] mt-1">
                        ${v.value.toFixed(2)}
                      </div>
                    </div>
                  ))}
                  {data.quote?.pe && (
                    <div className="bg-[#16161f] px-4 py-3 rounded-xl border border-white/[0.06] hover:border-white/[0.1] transition-colors">
                      <div className="text-[10px] text-[#6b6b80] tracking-wide uppercase">P/E Ratio</div>
                      <div className="text-lg font-semibold text-[#f0f0f5] mt-1">
                        {data.quote.pe.toFixed(2)}x
                      </div>
                    </div>
                  )}
                  {calculatePEGValue() && (
                    <div className="bg-[#16161f] px-4 py-3 rounded-xl border border-white/[0.06] hover:border-white/[0.1] transition-colors">
                      <div className="text-[10px] text-[#6b6b80] tracking-wide uppercase">PEG Ratio</div>
                      <div className="text-lg font-semibold text-[#f0f0f5] mt-1">
                        {calculatePEGValue().toFixed(2)}
                      </div>
                    </div>
                  )}
                  {data.ratios?.length > 0 &&
                    data.ratios[data.ratios.length - 1]?.priceToSalesRatio && (
                      <div className="bg-[#16161f] px-4 py-3 rounded-xl border border-white/[0.06] hover:border-white/[0.1] transition-colors">
                        <div className="text-[10px] text-[#6b6b80] tracking-wide uppercase">P/S Ratio</div>
                        <div className="text-lg font-semibold text-[#f0f0f5] mt-1">
                          {data.ratios[data.ratios.length - 1].priceToSalesRatio.toFixed(2)}x
                        </div>
                      </div>
                    )}
                  {data.ratios?.length > 0 &&
                    data.ratios[data.ratios.length - 1]?.priceToBookRatio && (
                      <div className="bg-[#16161f] px-4 py-3 rounded-xl border border-white/[0.06] hover:border-white/[0.1] transition-colors">
                        <div className="text-[10px] text-[#6b6b80] tracking-wide uppercase">P/B Ratio</div>
                        <div className="text-lg font-semibold text-[#f0f0f5] mt-1">
                          {data.ratios[data.ratios.length - 1].priceToBookRatio.toFixed(2)}x
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Factor Rankings Section */}
          {data.factorRankings && (
            <div className="mb-6 bg-[#16161f] p-6 rounded-2xl border border-white/[0.06]">
              <h3 className="text-xs font-semibold mb-5 text-[#a0a0b0] tracking-widest uppercase">Factor Rankings</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Predictability */}
                <div className="text-center p-4 rounded-xl bg-[#0a0a0f] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-2 tracking-wider uppercase">Predictability</div>
                  <div className={`text-base font-bold ${
                    data.factorRankings.predictability.rank === 'High' ? 'text-emerald-400' :
                    data.factorRankings.predictability.rank === 'Medium' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {data.factorRankings.predictability.rank}
                  </div>
                  <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.factorRankings.predictability.rank === 'High' ? 'bg-emerald-500' :
                        data.factorRankings.predictability.rank === 'Medium' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${data.factorRankings.predictability.score}%` }}
                    ></div>
                  </div>
                </div>

                {/* Profitability */}
                <div className="text-center p-4 rounded-xl bg-[#0a0a0f] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-2 tracking-wider uppercase">Profitability</div>
                  <div className={`text-base font-bold ${
                    data.factorRankings.profitability.rank === 'High' ? 'text-emerald-400' :
                    data.factorRankings.profitability.rank === 'Medium' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {data.factorRankings.profitability.rank}
                  </div>
                  <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.factorRankings.profitability.rank === 'High' ? 'bg-emerald-500' :
                        data.factorRankings.profitability.rank === 'Medium' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${data.factorRankings.profitability.score}%` }}
                    ></div>
                  </div>
                </div>

                {/* Growth */}
                <div className="text-center p-4 rounded-xl bg-[#0a0a0f] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-2 tracking-wider uppercase">Growth</div>
                  <div className={`text-base font-bold ${
                    data.factorRankings.growth.rank === 'High' ? 'text-emerald-400' :
                    data.factorRankings.growth.rank === 'Medium' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {data.factorRankings.growth.rank}
                  </div>
                  <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.factorRankings.growth.rank === 'High' ? 'bg-emerald-500' :
                        data.factorRankings.growth.rank === 'Medium' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${data.factorRankings.growth.score}%` }}
                    ></div>
                  </div>
                </div>

                {/* Moat */}
                <div className="text-center p-4 rounded-xl bg-[#0a0a0f] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-2 tracking-wider uppercase">Moat</div>
                  <div className={`text-base font-bold ${
                    data.factorRankings.moat.rank === 'Wide' ? 'text-emerald-400' :
                    data.factorRankings.moat.rank === 'Narrow' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {data.factorRankings.moat.rank}
                  </div>
                  <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.factorRankings.moat.rank === 'Wide' ? 'bg-emerald-500' :
                        data.factorRankings.moat.rank === 'Narrow' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${data.factorRankings.moat.score}%` }}
                    ></div>
                  </div>
                </div>

                {/* Financial Strength */}
                <div className="text-center p-4 rounded-xl bg-[#0a0a0f] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-2 tracking-wider uppercase">Fin. Strength</div>
                  <div className={`text-base font-bold ${
                    data.factorRankings.financialStrength.rank === 'High' ? 'text-emerald-400' :
                    data.factorRankings.financialStrength.rank === 'Medium' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {data.factorRankings.financialStrength.rank}
                  </div>
                  <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.factorRankings.financialStrength.rank === 'High' ? 'bg-emerald-500' :
                        data.factorRankings.financialStrength.rank === 'Medium' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${data.factorRankings.financialStrength.score}%` }}
                    ></div>
                  </div>
                </div>

                {/* Valuation */}
                <div className="text-center p-4 rounded-xl bg-[#0a0a0f] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-2 tracking-wider uppercase">Valuation</div>
                  <div className={`text-base font-bold ${
                    data.factorRankings.valuation.rank === 'Undervalued' ? 'text-emerald-400' :
                    data.factorRankings.valuation.rank === 'Fairly Valued' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {data.factorRankings.valuation.rank}
                  </div>
                  <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.factorRankings.valuation.rank === 'Undervalued' ? 'bg-emerald-500' :
                        data.factorRankings.valuation.rank === 'Fairly Valued' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, data.factorRankings.valuation.score))}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* My Favorites Section */}
          {data.favorites && (
            <div className="mb-6 bg-gradient-to-br from-violet-500/5 via-indigo-500/5 to-transparent p-6 rounded-2xl border border-violet-500/10">
              <h3 className="text-xs font-semibold mb-5 text-violet-400 tracking-widest uppercase">Key Metrics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">P/E Ratio</div>
                  <div className="text-lg font-bold text-[#f0f0f5]">
                    {data.favorites.peRatio?.toFixed(2) || 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">P/S Ratio</div>
                  <div className="text-lg font-bold text-[#f0f0f5]">
                    {data.favorites.psRatio?.toFixed(2) || 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">EPS Growth</div>
                  <div className={`text-lg font-bold ${data.favorites.epsGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.favorites.epsGrowth ? `${(data.favorites.epsGrowth * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">Div Yield</div>
                  <div className="text-lg font-bold text-[#f0f0f5]">
                    {data.favorites.dividendYield ? `${(data.favorites.dividendYield * 100).toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">Market Cap</div>
                  <div className="text-lg font-bold text-[#f0f0f5]">
                    {data.favorites.marketCap ? `$${(data.favorites.marketCap / 1e9).toFixed(1)}B` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">Shares Out</div>
                  <div className="text-lg font-bold text-[#f0f0f5]">
                    {data.favorites.sharesOutstanding ? `${(data.favorites.sharesOutstanding / 1e9).toFixed(2)}B` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">Beta</div>
                  <div className="text-lg font-bold text-[#f0f0f5]">
                    {data.favorites.beta?.toFixed(2) || 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">ROE</div>
                  <div className={`text-lg font-bold ${data.favorites.roe >= 0.15 ? 'text-emerald-400' : 'text-[#f0f0f5]'}`}>
                    {data.favorites.roe ? `${(data.favorites.roe * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">ROIC</div>
                  <div className={`text-lg font-bold ${data.favorites.roic >= 0.12 ? 'text-emerald-400' : 'text-[#f0f0f5]'}`}>
                    {data.favorites.roic ? `${(data.favorites.roic * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#16161f] p-4 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-colors">
                  <div className="text-[10px] text-[#6b6b80] mb-1.5 tracking-wider uppercase">Debt/EBITDA</div>
                  <div className={`text-lg font-bold ${data.favorites.debtToEbitda < 2 ? 'text-emerald-400' : data.favorites.debtToEbitda > 3 ? 'text-red-400' : 'text-[#f0f0f5]'}`}>
                    {data.favorites.debtToEbitda?.toFixed(2) || 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Valuation Chart Section */}
          {data.dcf && data.dcf.compositeValue && (
            <div className="mb-6 bg-[#16161f] p-6 rounded-2xl border border-white/[0.06]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h3 className="text-xs font-semibold text-[#a0a0b0] tracking-widest uppercase">Valuation Models</h3>
                <div className="text-left sm:text-right">
                  <div className="text-[10px] text-[#6b6b80] tracking-wider uppercase">Fair Value Estimate</div>
                  <div className={`text-2xl font-bold ${data.dcf.upside > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ${data.dcf.compositeValue?.toFixed(2)}
                  </div>
                  <div className={`text-xs font-medium ${data.dcf.upside > 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                    {data.dcf.upside > 0 ? '+' : ''}{data.dcf.upside?.toFixed(1)}% vs Current
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  layout="vertical"
                  data={[
                    { name: 'DCF (Unlevered FCF)', value: data.dcf.dcfOperatingCashFlow, type: 'dcf' },
                    { name: 'DCF Terminal (15x FCF)', value: data.dcf.dcfTerminal, type: 'dcf' },
                    { name: 'Fair Value (P/S)', value: data.dcf.fairValuePS, type: 'relative' },
                    { name: 'Fair Value (P/E)', value: data.dcf.fairValuePE, type: 'relative' },
                    { name: 'Fair Value (P/B)', value: data.dcf.fairValuePB, type: 'relative' },
                    { name: 'Earnings Power Value', value: data.dcf.earningsPowerValue, type: 'relative' },
                    { name: 'Graham Number', value: data.dcf.grahamNumber, type: 'conservative' },
                  ].filter(d => d.value && d.value > 0 && isFinite(d.value))}
                  margin={{ top: 20, right: 60, left: 180, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    type="number"
                    domain={[0, 'auto']}
                    tick={{ fontSize: 10, fill: '#6b6b80' }}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 10, fill: '#a0a0b0' }}
                    width={170}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [`$${value?.toFixed(2)}`, 'Fair Value']}
                    contentStyle={{ fontSize: 11, borderRadius: '8px', background: '#1e1e2a', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f0f5' }}
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  />
                  <ReferenceLine
                    x={data.dcf.currentPrice}
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    label={{
                      value: `Current: $${data.dcf.currentPrice?.toFixed(2)}`,
                      position: 'top',
                      fontSize: 10,
                      fill: '#ef4444'
                    }}
                  />
                  <ReferenceLine
                    x={data.dcf.compositeValue}
                    stroke="#10b981"
                    strokeWidth={2}
                    label={{
                      value: `Fair: $${data.dcf.compositeValue?.toFixed(2)}`,
                      position: 'top',
                      fontSize: 10,
                      fill: '#10b981'
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {[
                    { name: 'DCF (Unlevered FCF)', type: 'dcf' },
                    { name: 'DCF Terminal (15x FCF)', type: 'dcf' },
                    { name: 'Fair Value (P/S)', type: 'relative' },
                    { name: 'Fair Value (P/E)', type: 'relative' },
                    { name: 'Fair Value (P/B)', type: 'relative' },
                    { name: 'Earnings Power Value', type: 'relative' },
                    { name: 'Graham Number', type: 'conservative' },
                  ].filter(d => {
                    const val = data.dcf[d.name === 'DCF (Unlevered FCF)' ? 'dcfOperatingCashFlow' :
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
                        fill={entry.type === 'dcf' ? '#f59e0b' : entry.type === 'relative' ? '#f97316' : '#6b7280'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-5 flex flex-wrap gap-5 text-[10px] text-[#6b6b80]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2.5 bg-amber-500 rounded-sm"></div>
                  <span>DCF Models</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2.5 bg-orange-500 rounded-sm"></div>
                  <span>Relative Valuation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2.5 bg-gray-500 rounded-sm"></div>
                  <span>Conservative</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-red-500"></div>
                  <span>Current Price</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-emerald-500"></div>
                  <span>Fair Value</span>
                </div>
              </div>

              <div className="mt-5 p-4 bg-[#0a0a0f] rounded-xl text-[10px] text-[#6b6b80] border border-white/[0.04]">
                <span className="text-[#a0a0b0]">Assumptions:</span> Discount Rate: {data.dcf.discountRate?.toFixed(1)}% (WACC) | Terminal Growth: {data.dcf.terminalGrowth?.toFixed(1)}% | Projection: 10 years
              </div>
            </div>
          )}

          {/* Calculation Trace */}
          {data.dcf?.assumptions && (
            <div className="mb-6 bg-[#16161f] p-6 rounded-2xl border border-white/[0.06]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-5">
                <h3 className="text-xs font-semibold text-[#a0a0b0] tracking-widest uppercase">Calculation Trace</h3>
                <div className="text-[10px] text-[#45455a]">Key inputs driving fair value</div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                <MetricCard label="Shares Out" value={formatNumber(data.dcf.assumptions.sharesOutstanding, 0)} />
                <MetricCard label="Beta" value={formatRatio(data.dcf.assumptions.beta)} />
                <MetricCard label="Cost of Equity" value={`${data.dcf.assumptions.costOfEquity.toFixed(2)}%`} />
                <MetricCard label="Cost of Debt" value={`${data.dcf.assumptions.costOfDebt.toFixed(2)}%`} />
                <MetricCard label="Equity Weight" value={`${data.dcf.assumptions.equityWeight.toFixed(1)}%`} />
                <MetricCard label="Debt Weight" value={`${data.dcf.assumptions.debtWeight.toFixed(1)}%`} />
                <MetricCard label="Tax Rate" value={`${data.dcf.assumptions.taxRate.toFixed(1)}%`} />
                <MetricCard label="Rev Growth" value={`${data.dcf.assumptions.revenueGrowth.toFixed(1)}%`} />
                <MetricCard label="NI Growth" value={`${data.dcf.assumptions.netIncomeGrowth.toFixed(1)}%`} />
                <MetricCard label="FCF Growth" value={`${data.dcf.assumptions.fcfGrowth.toFixed(1)}%`} />
                <MetricCard label="Op Margin" value={data.dcf.assumptions.operatingMargin !== null ? `${data.dcf.assumptions.operatingMargin.toFixed(1)}%` : 'N/A'} />
                <MetricCard label="CapEx %" value={data.dcf.assumptions.capexRatio !== null ? `${data.dcf.assumptions.capexRatio.toFixed(1)}%` : 'N/A'} />
                <MetricCard label="D&A %" value={data.dcf.assumptions.daRatio !== null ? `${data.dcf.assumptions.daRatio.toFixed(1)}%` : 'N/A'} />
                <MetricCard label="NWC %" value={data.dcf.assumptions.nwcRatio !== null ? `${data.dcf.assumptions.nwcRatio.toFixed(1)}%` : 'N/A'} />
                <MetricCard label="Latest Revenue" value={formatNumber(data.dcf.assumptions.latestRevenue)} />
                <MetricCard label="Latest NI" value={formatNumber(data.dcf.assumptions.latestNetIncome)} />
                <MetricCard label="Latest FCF" value={formatNumber(data.dcf.assumptions.latestFCF)} />
                <MetricCard label="Latest OCF" value={formatNumber(data.dcf.assumptions.latestOCF)} />
                <MetricCard label="Latest Equity" value={formatNumber(data.dcf.assumptions.latestEquity)} />
              </div>
            </div>
          )}

          {/* Financial Charts (Core Focus) */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
            <h3 className="text-xs font-semibold text-[#a0a0b0] tracking-widest uppercase">Financial Charts</h3>
            <div className="flex bg-[#0a0a0f] rounded-lg p-1 border border-white/[0.06]">
              <button
                onClick={() => setViewMode('annual')}
                className={`px-4 py-2 text-[10px] font-semibold tracking-wider rounded-md transition-all ${
                  viewMode === 'annual'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-[#6b6b80] hover:text-[#a0a0b0]'
                }`}
              >
                ANNUAL
              </button>
              <button
                onClick={() => setViewMode('quarterly')}
                className={`px-4 py-2 text-[10px] font-semibold tracking-wider rounded-md transition-all ${
                  viewMode === 'quarterly'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-[#6b6b80] hover:text-[#a0a0b0]'
                }`}
              >
                QUARTERLY
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
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

          {/* Insight Dashboard */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-[#16161f] p-5 rounded-2xl border border-white/[0.06]">
              <div className="text-[10px] text-[#6b6b80] tracking-widest uppercase mb-3">Valuation Snapshot</div>
              <div className={`text-xl font-bold mb-1 ${
                verdict?.verdict === 'UNDERVALUED' ? 'text-emerald-400' :
                verdict?.verdict === 'OVERVALUED' ? 'text-red-400' : 'text-[#f0f0f5]'
              }`}>
                {verdict ? verdict.verdict : 'N/A'}
              </div>
              <div className="text-xs text-[#6b6b80] mb-4">
                {verdict
                  ? `${verdict.upside >= 0 ? 'Upside' : 'Downside'} ${Math.abs(
                      verdict.upside
                    ).toFixed(1)}% vs fair value`
                  : 'Run analysis to generate a verdict'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SignalPill
                  label="Current Price"
                  value={verdict ? `$${verdict.currentPrice.toFixed(2)}` : 'N/A'}
                />
                <SignalPill
                  label="Fair Value"
                  value={verdict ? `$${verdict.avgFairValue.toFixed(2)}` : 'N/A'}
                  tone={verdict && verdict.upside > 0 ? 'positive' : verdict && verdict.upside < 0 ? 'negative' : 'neutral'}
                />
              </div>
            </div>

            <div className="bg-[#16161f] p-5 rounded-2xl border border-white/[0.06]">
              <div className="text-[10px] text-[#6b6b80] tracking-widest uppercase mb-3">Growth & Momentum</div>
              <div className="text-xs text-[#45455a] mb-4">5Y pace and profitability drift</div>
              <div className="grid grid-cols-2 gap-2">
                <SignalPill
                  label="Revenue CAGR"
                  value={revenueCagr !== null ? `${(revenueCagr * 100).toFixed(1)}%` : 'N/A'}
                  tone={revenueCagr > 0.08 ? 'positive' : revenueCagr < 0 ? 'negative' : 'neutral'}
                />
                <SignalPill
                  label="FCF CAGR"
                  value={fcfCagr !== null ? `${(fcfCagr * 100).toFixed(1)}%` : 'N/A'}
                  tone={fcfCagr > 0.08 ? 'positive' : fcfCagr < 0 ? 'negative' : 'neutral'}
                />
                <SignalPill
                  label="Net Margin"
                  value={netMargin !== null ? `${(netMargin * 100).toFixed(1)}%` : 'N/A'}
                  tone={netMargin > 0.15 ? 'positive' : netMargin < 0.05 ? 'negative' : 'neutral'}
                />
                <SignalPill
                  label="Margin Drift"
                  value={marginDelta !== null ? `${(marginDelta * 100).toFixed(1)}%` : 'N/A'}
                  tone={marginDelta > 0 ? 'positive' : marginDelta < 0 ? 'negative' : 'neutral'}
                />
              </div>
            </div>

            <div className="bg-[#16161f] p-5 rounded-2xl border border-white/[0.06]">
              <div className="text-[10px] text-[#6b6b80] tracking-widest uppercase mb-3">Quality & Strength</div>
              <div className="text-xs text-[#45455a] mb-4">Returns, leverage, predictability</div>
              <div className="grid grid-cols-2 gap-2">
                <SignalPill
                  label="ROIC"
                  value={data.favorites?.roic ? `${(data.favorites.roic * 100).toFixed(1)}%` : 'N/A'}
                  tone={data.favorites?.roic > 0.12 ? 'positive' : data.favorites?.roic < 0.06 ? 'negative' : 'neutral'}
                />
                <SignalPill
                  label="ROE"
                  value={data.favorites?.roe ? `${(data.favorites.roe * 100).toFixed(1)}%` : 'N/A'}
                  tone={data.favorites?.roe > 0.15 ? 'positive' : data.favorites?.roe < 0.08 ? 'negative' : 'neutral'}
                />
                <SignalPill
                  label="Debt / EBITDA"
                  value={data.favorites?.debtToEbitda ? data.favorites.debtToEbitda.toFixed(2) : 'N/A'}
                  tone={data.favorites?.debtToEbitda < 2 ? 'positive' : data.favorites?.debtToEbitda > 3 ? 'negative' : 'neutral'}
                />
                <SignalPill
                  label="Predictability"
                  value={data.factorRankings?.predictability?.rank || 'N/A'}
                  tone={data.factorRankings?.predictability?.rank === 'High' ? 'positive' : data.factorRankings?.predictability?.rank === 'Low' ? 'negative' : 'neutral'}
                />
              </div>
            </div>
          </div>

          {/* Valuation Ratios Table */}
          {data.valuationRatios && data.valuationRatios.historical?.length > 0 && (
            <div className="mb-6 bg-[#16161f] p-6 rounded-2xl border border-white/[0.06]">
              <h3 className="text-xs font-semibold mb-5 text-[#a0a0b0] tracking-widest uppercase">Valuation Ratios</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#0a0a0f]">
                      <th className="px-3 py-3 text-left font-semibold text-[#a0a0b0] border-b border-white/[0.06] sticky left-0 bg-[#0a0a0f]">
                        Metric
                      </th>
                      {data.valuationRatios.historical.map((h) => (
                        <th key={h.year} className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06] min-w-[60px]">
                          {h.year}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-right font-semibold text-blue-400 border-b border-white/[0.06] bg-blue-500/5 min-w-[70px]">
                        Current
                      </th>
                      <th className="px-3 py-3 text-right font-semibold text-violet-400 border-b border-white/[0.06] bg-violet-500/5 min-w-[70px]">
                        10Y Avg
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3 font-medium text-[#f0f0f5] sticky left-0 bg-[#16161f]">P/E Ratio</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-[#a0a0b0]">
                          {h.peRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-400 bg-blue-500/5">
                        {data.valuationRatios.current?.peRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-violet-400 bg-violet-500/5">
                        {data.valuationRatios.tenYearAvg?.peRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3 font-medium text-[#f0f0f5] sticky left-0 bg-[#16161f]">P/S Ratio</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-[#a0a0b0]">
                          {h.psRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-400 bg-blue-500/5">
                        {data.valuationRatios.current?.psRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-violet-400 bg-violet-500/5">
                        {data.valuationRatios.tenYearAvg?.psRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3 font-medium text-[#f0f0f5] sticky left-0 bg-[#16161f]">P/B Ratio</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-[#a0a0b0]">
                          {h.pbRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-400 bg-blue-500/5">
                        {data.valuationRatios.current?.pbRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-violet-400 bg-violet-500/5">
                        {data.valuationRatios.tenYearAvg?.pbRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3 font-medium text-[#f0f0f5] sticky left-0 bg-[#16161f]">PEG Ratio</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-[#a0a0b0]">
                          {h.pegRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-400 bg-blue-500/5">
                        {data.valuationRatios.current?.pegRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-violet-400 bg-violet-500/5">
                        {data.valuationRatios.tenYearAvg?.pegRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3 font-medium text-[#f0f0f5] sticky left-0 bg-[#16161f]">PSG Ratio</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className="px-3 py-3 text-right text-[#a0a0b0]">
                          {h.psgRatio?.toFixed(2) || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-blue-400 bg-blue-500/5">
                        {data.valuationRatios.current?.psgRatio?.toFixed(2) || '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-violet-400 bg-violet-500/5">
                        {data.valuationRatios.tenYearAvg?.psgRatio?.toFixed(2) || '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors bg-white/[0.01]">
                      <td className="px-3 py-3 font-medium text-[#a0a0b0] sticky left-0 bg-[#16161f]">EPS Growth</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className={`px-3 py-3 text-right ${h.epsGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {h.epsGrowth !== null ? `${h.epsGrowth.toFixed(1)}%` : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right text-[#45455a] bg-blue-500/5">-</td>
                      <td className="px-3 py-3 text-right text-[#45455a] bg-violet-500/5">-</td>
                    </tr>
                    <tr className="hover:bg-white/[0.02] transition-colors bg-white/[0.01]">
                      <td className="px-3 py-3 font-medium text-[#a0a0b0] sticky left-0 bg-[#16161f]">Rev Growth</td>
                      {data.valuationRatios.historical.map((h) => (
                        <td key={h.year} className={`px-3 py-3 text-right ${h.revenueGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {h.revenueGrowth !== null ? `${h.revenueGrowth.toFixed(1)}%` : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right text-[#45455a] bg-blue-500/5">-</td>
                      <td className="px-3 py-3 text-right text-[#45455a] bg-violet-500/5">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-[10px] text-[#45455a]">
                Note: Historical ratios calculated using current price vs historical earnings/sales/book value.
              </div>
            </div>
          )}

          {/* Other Valuation Ratios */}
          {data.valuationRatios?.other && (
            <div className="mb-6 bg-[#16161f] p-6 rounded-2xl border border-white/[0.06]">
              <h3 className="text-xs font-semibold mb-5 text-[#a0a0b0] tracking-widest uppercase">Other Valuation Ratios</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Per Share & Yield Metrics */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold text-[#6b6b80] uppercase tracking-widest border-b border-white/[0.06] pb-2">Per Share & Yield</h4>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">EBITDA per Share</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.ebitdaPerShare?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Earnings Yield</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.earningsYield?.toFixed(2) || 'N/A'}%</span>
                  </div>
                </div>

                {/* Enterprise Value Metrics */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold text-[#6b6b80] uppercase tracking-widest border-b border-white/[0.06] pb-2">Enterprise Value</h4>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Enterprise Value</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">${(data.valuationRatios.other.enterpriseValue / 1e9)?.toFixed(2) || 'N/A'}B</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">EV / FCF</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.evToFCF?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">EV / EBIT</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.evToEBIT?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">EV / EBITDA</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.evToEBITDA?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">EV / Revenue</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.evToRevenue?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>

                {/* Forward Metrics */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold text-[#6b6b80] uppercase tracking-widest border-b border-white/[0.06] pb-2">Forward Metrics</h4>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Forward P/E</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.forwardPE?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Rule of 40</span>
                    <span className={`text-xs font-semibold ${data.valuationRatios.other.ruleOf40 >= 40 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {data.valuationRatios.other.ruleOf40?.toFixed(2) || 'N/A'}%
                    </span>
                  </div>
                </div>

                {/* Mean Valuations */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold text-[#6b6b80] uppercase tracking-widest border-b border-white/[0.06] pb-2">Mean Valuations</h4>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Mean P/E Ratio</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.meanPE?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Mean P/E Value</span>
                    <span className="text-xs font-semibold text-emerald-400">${data.valuationRatios.other.meanPEValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Mean P/S Ratio</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.meanPS?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Mean P/S Value</span>
                    <span className="text-xs font-semibold text-emerald-400">${data.valuationRatios.other.meanPSValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Mean P/B Ratio</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.meanPB?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Mean P/B Value</span>
                    <span className="text-xs font-semibold text-emerald-400">${data.valuationRatios.other.meanPBValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>

                {/* Median Valuations */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold text-[#6b6b80] uppercase tracking-widest border-b border-white/[0.06] pb-2">Median Valuations</h4>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Median P/E Ratio</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.medianPE?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Median P/E Value</span>
                    <span className="text-xs font-semibold text-emerald-400">${data.valuationRatios.other.medianPEValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Median P/S Ratio</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.medianPS?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Median P/S Value</span>
                    <span className="text-xs font-semibold text-emerald-400">${data.valuationRatios.other.medianPSValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Median P/B Ratio</span>
                    <span className="text-xs font-semibold text-[#f0f0f5]">{data.valuationRatios.other.medianPB?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">Median P/B Value</span>
                    <span className="text-xs font-semibold text-emerald-400">${data.valuationRatios.other.medianPBValue?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>

                {/* DCF Valuations */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold text-[#6b6b80] uppercase tracking-widest border-b border-white/[0.06] pb-2">DCF Valuations (20Y)</h4>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">DCF-20 Value</span>
                    <span className="text-xs font-semibold text-blue-400">${data.valuationRatios.other.dcf20Year?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">DFCF-20 Value</span>
                    <span className="text-xs font-semibold text-blue-400">${data.valuationRatios.other.dfcf20Year?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">DNI-20 Value</span>
                    <span className="text-xs font-semibold text-blue-400">${data.valuationRatios.other.dni20Year?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#6b6b80]">DFCF-Terminal</span>
                    <span className="text-xs font-semibold text-blue-400">${data.valuationRatios.other.dfcfTerminal?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Key Metrics Grid */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold mb-4 text-[#a0a0b0] tracking-widest uppercase">Key Metrics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <MetricCard label="Market Cap" value={formatNumber(data.quote?.marketCap)} />
              <MetricCard
                label="Enterprise Value"
                value={formatNumber(data.metrics[data.metrics.length - 1]?.enterpriseValue)}
              />
              <MetricCard label="P/E Ratio" value={formatRatio(data.quote?.pe)} subtext="TTM" />
              <MetricCard
                label="P/S Ratio"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.priceToSalesRatio)}
              />
              <MetricCard
                label="P/B Ratio"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.priceToBookRatio)}
              />
              <MetricCard
                label="EV/EBITDA"
                value={formatRatio(
                  data.metrics[data.metrics.length - 1]?.evToEBITDA
                )}
              />
              <MetricCard
                label="Debt/Equity"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.debtToEquityRatio)}
              />
              <MetricCard
                label="Current Ratio"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.currentRatio)}
              />
              <MetricCard
                label="Quick Ratio"
                value={formatRatio(data.ratios[data.ratios.length - 1]?.quickRatio)}
              />
              <MetricCard
                label="Div Yield"
                value={formatPercent(data.ratios[data.ratios.length - 1]?.dividendYield)}
              />
              <MetricCard
                label="FCF Yield"
                value={formatPercent(data.metrics[data.metrics.length - 1]?.freeCashFlowYield)}
              />
              <MetricCard
                label="Earnings Yield"
                value={formatPercent(data.metrics[data.metrics.length - 1]?.earningsYield)}
              />
            </div>
          </div>

          {/* Historical Ratios Table */}
          <div className="mt-6 bg-[#16161f] p-6 rounded-2xl border border-white/[0.06]">
            <h3 className="text-xs font-semibold mb-5 text-[#a0a0b0] tracking-widest uppercase">
              Historical Financial Ratios
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0a0a0f]">
                    <th className="px-3 py-3 text-left font-semibold text-[#a0a0b0] border-b border-white/[0.06]">
                      Year
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06]">
                      Gross
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06]">
                      Op
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06]">
                      Net
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06]">
                      ROE
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06]">
                      ROIC
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06]">
                      ROA
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06]">
                      D/E
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-[#6b6b80] border-b border-white/[0.06]">
                      Current
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.ratios.map((r, i) => (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3 font-semibold text-[#f0f0f5]">
                        {r.calendarYear || r.date?.slice(0, 4)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#a0a0b0]">
                        {formatPercent(r.grossProfitMargin)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#a0a0b0]">
                        {formatPercent(r.operatingProfitMargin)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#a0a0b0]">
                        {formatPercent(r.netProfitMargin)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#a0a0b0]">
                        {formatPercent(r.returnOnEquity)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#a0a0b0]">
                        {formatPercent(r.returnOnCapitalEmployed)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#a0a0b0]">
                        {formatPercent(r.returnOnAssets)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#a0a0b0]">
                        {formatRatio(r.debtToEquityRatio)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#a0a0b0]">
                        {formatRatio(r.currentRatio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Company Profile */}
          <div className="mt-6 bg-[#16161f] p-6 rounded-2xl border border-white/[0.06]">
            <h3 className="text-xs font-semibold mb-4 text-[#a0a0b0] tracking-widest uppercase">
              Company Profile
            </h3>
            <p className="text-xs text-[#a0a0b0] leading-relaxed">
              {data.profile.description?.slice(0, 600)}
              {data.profile.description?.length > 600 ? '...' : ''}
            </p>
            <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-wrap gap-6 text-xs text-[#6b6b80]">
              <span>
                <span className="text-[#a0a0b0]">CEO:</span> {data.profile.ceo || 'N/A'}
              </span>
              <span>
                <span className="text-[#a0a0b0]">Employees:</span>{' '}
                {data.profile.fullTimeEmployees?.toLocaleString() || 'N/A'}
              </span>
              <span>
                <span className="text-[#a0a0b0]">Website:</span>{' '}
                <a
                  href={data.profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {data.profile.website}
                </a>
              </span>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 p-5 bg-amber-500/5 rounded-2xl border border-amber-500/20 text-xs text-amber-200/70 leading-relaxed">
            <span className="text-amber-400 font-semibold">Disclaimer:</span> This calculator provides estimates based on publicly
            available financial data and standard valuation models (DCF, Graham Number, multiples).
            It should not be considered financial advice. Always conduct your own due diligence and
            consult with a qualified financial advisor before making investment decisions.
          </div>
        </>
      )}

      {/* Footer */}
      <div className="mt-10 pt-6 border-t border-white/[0.06] text-center text-[10px] text-[#45455a] tracking-wide">
        Data provided by Financial Modeling Prep | Built with Next.js & Recharts
      </div>
    </div>
  );
}
