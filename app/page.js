'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

// Theme definitions
const themes = {
  dark: {
    bg: '#0a0a0f',
    bgCard: '#16161f',
    bgElevated: '#1e1e2a',
    bgInput: '#0a0a0f',
    border: 'rgba(255, 255, 255, 0.06)',
    borderHover: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.15)',
    text: '#f0f0f5',
    textSecondary: '#a0a0b0',
    textTertiary: '#6b6b80',
    textMuted: '#45455a',
    chartGrid: 'rgba(255,255,255,0.06)',
    chartTooltipBg: '#1e1e2a',
    chartTooltipBorder: 'rgba(255,255,255,0.1)',
    tableBg: '#0a0a0f',
    tableRowHover: 'rgba(255,255,255,0.02)',
    stickyBg: '#16161f',
    cursorFill: 'rgba(255,255,255,0.03)',
    neutralPillBg: 'rgba(255,255,255,0.03)',
    positive: '#34d399',
    negative: '#f87171',
    fairValue: '#a0a0b0',
    positiveBg: 'rgba(16,185,129,0.1)',
    negativeBg: 'rgba(239,68,68,0.1)',
    positiveBorder: 'rgba(16,185,129,0.2)',
    negativeBorder: 'rgba(239,68,68,0.2)',
    accent: '#60a5fa',
    accentAlt: '#a78bfa',
    warning: '#fbbf24',
    warningText: 'rgba(253,230,138,0.7)',
    warningBg: 'rgba(245,158,11,0.05)',
    warningBorder: 'rgba(245,158,11,0.2)',
    warningStrong: '#fbbf24',
  },
  light: {
    bg: '#f8f9fc',
    bgCard: '#ffffff',
    bgElevated: '#f1f3f9',
    bgInput: '#ffffff',
    border: 'rgba(0, 0, 0, 0.08)',
    borderHover: 'rgba(0, 0, 0, 0.15)',
    borderStrong: 'rgba(0, 0, 0, 0.2)',
    text: '#111827',
    textSecondary: '#4b5563',
    textTertiary: '#9ca3af',
    textMuted: '#d1d5db',
    chartGrid: 'rgba(0,0,0,0.08)',
    chartTooltipBg: '#ffffff',
    chartTooltipBorder: 'rgba(0,0,0,0.1)',
    tableBg: '#f8f9fc',
    tableRowHover: 'rgba(0,0,0,0.02)',
    stickyBg: '#ffffff',
    cursorFill: 'rgba(0,0,0,0.03)',
    neutralPillBg: 'rgba(0,0,0,0.03)',
    positive: '#059669',
    negative: '#dc2626',
    fairValue: '#4b5563',
    positiveBg: 'rgba(5,150,105,0.08)',
    negativeBg: 'rgba(220,38,38,0.08)',
    positiveBorder: 'rgba(5,150,105,0.2)',
    negativeBorder: 'rgba(220,38,38,0.2)',
    accent: '#2563eb',
    accentAlt: '#7c3aed',
    warning: '#d97706',
    warningText: '#92400e',
    warningBg: 'rgba(217,119,6,0.06)',
    warningBorder: 'rgba(217,119,6,0.2)',
    warningStrong: '#b45309',
  },
};

const NAV_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'financials', label: 'Financials' },
  { id: 'operating-metrics', label: 'Operating Metrics' },
  { id: 'charts', label: 'Charts' },
  { id: 'insider', label: 'Insider Activity' },
  { id: 'profile', label: 'Profile' },
];

const TICKER_REGEX = /^[A-Z0-9.\-]{1,10}$/;

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('https://') || url.startsWith('http://');
}

// ---- Extracted Components (outside render, no remount on re-render) ----

function ChartSection({ title, chartData, dataKeys, colors, unit = '', dataKeyX = 'period', theme }) {
  const numericValues = useMemo(() => {
    if (!Array.isArray(chartData) || !Array.isArray(dataKeys)) return [];
    return chartData.flatMap((row) =>
      dataKeys
        .map((key) => row?.[key])
        .filter((value) => typeof value === 'number' && Number.isFinite(value))
    );
  }, [chartData, dataKeys]);

  const yDomain = useMemo(() => {
    if (!numericValues.length) return [0, 1];
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);

    if (min === max) {
      if (max === 0) return [0, unit === 'B' ? 0.01 : 1];
      const padding = Math.abs(max) * 0.2;
      if (min >= 0) return [0, max + padding];
      if (max <= 0) return [min - padding, 0];
      return [min - padding, max + padding];
    }

    const span = max - min;
    const padding = span * 0.1;
    if (min >= 0) return [0, max + padding];
    if (max <= 0) return [min - padding, 0];
    return [min - padding, max + padding];
  }, [numericValues, unit]);

  const formatBillionsValue = useCallback((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    const abs = Math.abs(value);
    if (abs >= 1) return `${value.toFixed(abs < 10 ? 2 : 1)}B`;
    if (abs >= 0.001) return `${(value * 1_000).toFixed(abs * 1_000 < 10 ? 2 : 1)}M`;
    if (abs >= 0.000001) return `${(value * 1_000_000).toFixed(abs * 1_000_000 < 10 ? 1 : 0)}K`;
    return `${(value * 1_000_000_000).toFixed(0)}`;
  }, []);

  const formatAxisTick = useCallback((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '';
    if (unit === 'B') return formatBillionsValue(value);
    if (unit === '%') return `${value.toFixed(1)}%`;
    return `${value}`;
  }, [formatBillionsValue, unit]);

  const formatTooltipValue = useCallback((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    if (unit === 'B') return `$${formatBillionsValue(value)}`;
    if (unit === '%') return `${value.toFixed(2)}%`;
    return `${value}${unit}`;
  }, [formatBillionsValue, unit]);

  return (
    <div
      className="p-5 rounded-2xl border transition-colors"
      style={{ background: theme.bgCard, borderColor: theme.border }}
    >
      <h3
        className="text-[10px] font-semibold mb-4 tracking-widest uppercase"
        style={{ color: theme.textSecondary }}
      >
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
          <XAxis dataKey={dataKeyX} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} />
          <YAxis
            domain={yDomain}
            tickFormatter={formatAxisTick}
            tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: theme.textTertiary }}
            axisLine={{ stroke: theme.chartGrid }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ fontFamily: 'JetBrains Mono', fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
            formatter={(value) => [formatTooltipValue(value), '']}
            cursor={{ fill: theme.cursorFill }}
          />
          <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: theme.textSecondary }} />
          {dataKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={colors[i]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricCard({ label, value, subtext, theme }) {
  return (
    <div
      className="p-4 rounded-xl border transition-all duration-200 group"
      style={{ background: theme.bgCard, borderColor: theme.border }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.borderHover}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
    >
      <div className="text-[10px] mb-1.5 tracking-wider uppercase" style={{ color: theme.textTertiary }}>{label}</div>
      <div className="text-base font-semibold" style={{ color: theme.text }}>{value}</div>
      {subtext && <div className="text-[10px] mt-1" style={{ color: theme.textMuted }}>{subtext}</div>}
    </div>
  );
}

function SignalPill({ label, value, tone = 'neutral', theme }) {
  const toneStyles = tone === 'positive'
    ? { background: theme.positiveBg, color: theme.positive, borderColor: theme.positiveBorder }
    : tone === 'negative'
    ? { background: theme.negativeBg, color: theme.negative, borderColor: theme.negativeBorder }
    : { background: theme.neutralPillBg, color: theme.textSecondary, borderColor: theme.border };

  return (
    <div
      className="px-3 py-2.5 rounded-lg text-xs font-medium border transition-all duration-200"
      style={toneStyles}
    >
      <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: theme.textTertiary }}>{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function OverviewTab({ data, verdict, theme, formatNumber, formatPercent, formatRatio, calculatePEGValue, revenueCagr, fcfCagr, netMargin, marginDelta }) {
  const latestMetrics = data?.metrics?.[data.metrics.length - 1];
  const latestRatios = data?.ratios?.[data.ratios.length - 1];

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
      {/* Valuation Verdict */}
      {verdict && (
        <div
          className="p-6 sm:p-8 rounded-2xl border animate-slideUp"
          style={{
            borderColor: verdict.verdict === 'UNDERVALUED' ? theme.positiveBorder
              : verdict.verdict === 'OVERVALUED' ? theme.negativeBorder
              : theme.border,
            background: verdict.verdict === 'UNDERVALUED'
              ? `linear-gradient(to bottom right, ${theme.positiveBg}, transparent)`
              : verdict.verdict === 'OVERVALUED'
              ? `linear-gradient(to bottom right, ${theme.negativeBg}, transparent)`
              : undefined,
          }}
        >
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div>
              <div className="text-[10px] mb-3 tracking-widest uppercase" style={{ color: theme.textTertiary }}>Valuation Verdict</div>
              <div
                className="text-2xl sm:text-4xl font-bold tracking-wide"
                style={{
                  color: verdict.verdict === 'UNDERVALUED' ? theme.positive
                    : verdict.verdict === 'OVERVALUED' ? theme.negative
                    : theme.fairValue,
                }}
              >
                {verdict.verdict}
              </div>
              <div className="text-sm mt-3 font-medium">
                {verdict.upside > 0 ? (
                  <span className="inline-flex items-center gap-1" style={{ color: theme.positive }}>
                    <span className="text-lg">↑</span> {verdict.upside.toFixed(1)}% upside potential
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1" style={{ color: theme.negative }}>
                    <span className="text-lg">↓</span> {Math.abs(verdict.upside).toFixed(1)}% downside risk
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-8 sm:gap-12">
              <div className="text-center">
                <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: theme.textTertiary }}>Current Price</div>
                <div className="text-2xl sm:text-3xl font-bold" style={{ color: theme.text }}>
                  ${verdict.currentPrice.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: theme.textTertiary }}>Est. Fair Value</div>
                <div className="text-2xl sm:text-3xl font-bold" style={{ color: theme.positive }}>
                  ${verdict.avgFairValue.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6" style={{ borderTop: `1px solid ${theme.border}` }}>
            <div className="text-[10px] mb-4 tracking-widest uppercase" style={{ color: theme.textTertiary }}>Valuation Methods</div>
            <div className="flex flex-wrap gap-3">
              {verdict.valuations.map((v, i) => (
                <div key={i} className="px-4 py-3 rounded-xl border transition-colors" style={{ background: theme.bgCard, borderColor: theme.border }}>
                  <div className="text-[10px] tracking-wide uppercase" style={{ color: theme.textTertiary }}>{v.method}</div>
                  <div className="text-lg font-semibold mt-1" style={{ color: theme.text }}>${v.value.toFixed(2)}</div>
                </div>
              ))}
              {data.quote?.pe && (
                <div className="px-4 py-3 rounded-xl border transition-colors" style={{ background: theme.bgCard, borderColor: theme.border }}>
                  <div className="text-[10px] tracking-wide uppercase" style={{ color: theme.textTertiary }}>P/E Ratio</div>
                  <div className="text-lg font-semibold mt-1" style={{ color: theme.text }}>{data.quote.pe.toFixed(2)}x</div>
                </div>
              )}
              {calculatePEGValue() != null && (
                <div className="px-4 py-3 rounded-xl border transition-colors" style={{ background: theme.bgCard, borderColor: theme.border }}>
                  <div className="text-[10px] tracking-wide uppercase" style={{ color: theme.textTertiary }}>PEG Ratio</div>
                  <div className="text-lg font-semibold mt-1" style={{ color: theme.text }}>{calculatePEGValue().toFixed(2)}</div>
                </div>
              )}
              {latestRatios?.priceToSalesRatio && (
                <div className="px-4 py-3 rounded-xl border transition-colors" style={{ background: theme.bgCard, borderColor: theme.border }}>
                  <div className="text-[10px] tracking-wide uppercase" style={{ color: theme.textTertiary }}>P/S Ratio</div>
                  <div className="text-lg font-semibold mt-1" style={{ color: theme.text }}>{latestRatios.priceToSalesRatio.toFixed(2)}x</div>
                </div>
              )}
              {latestRatios?.priceToBookRatio && (
                <div className="px-4 py-3 rounded-xl border transition-colors" style={{ background: theme.bgCard, borderColor: theme.border }}>
                  <div className="text-[10px] tracking-wide uppercase" style={{ color: theme.textTertiary }}>P/B Ratio</div>
                  <div className="text-lg font-semibold mt-1" style={{ color: theme.text }}>{latestRatios.priceToBookRatio.toFixed(2)}x</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Factor Rankings */}
      {data?.factorRankings && (
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Factor Rankings</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { key: 'predictability', label: 'Predictability', highLabel: 'High' },
              { key: 'profitability', label: 'Profitability', highLabel: 'High' },
              { key: 'growth', label: 'Growth', highLabel: 'High' },
              { key: 'moat', label: 'Moat', highLabel: 'Wide' },
              { key: 'financialStrength', label: 'Fin. Strength', highLabel: 'High' },
              { key: 'valuation', label: 'Valuation', highLabel: 'Undervalued' },
            ].map(({ key, label, highLabel }) => {
              const factor = data.factorRankings?.[key];
              if (!factor) return null;
              const isHigh = factor.rank === highLabel || factor.rank === 'High';
              const isMid = factor.rank === 'Medium' || factor.rank === 'Narrow' || factor.rank === 'Fairly Valued';
              const barColor = isHigh ? theme.positive : isMid ? theme.warning : theme.negative;
              return (
                <div key={key} className="text-center p-4 rounded-xl border transition-colors" style={{ background: theme.bg, borderColor: theme.border }}>
                  <div className="text-[10px] mb-2 tracking-wider uppercase" style={{ color: theme.textTertiary }}>{label}</div>
                  <div className="text-base font-bold" style={{ color: barColor }}>{factor.rank}</div>
                  <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: theme.border }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${key === 'valuation' ? Math.min(100, Math.max(0, factor.score)) : factor.score}%`, background: barColor }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key Metrics (Favorites) */}
      {data?.favorites && (
        <div className="p-6 rounded-2xl border" style={{ background: theme.positiveBg, borderColor: theme.accentAlt + '22' }}>
          <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.accentAlt }}>Key Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { label: 'P/E Ratio', value: data.favorites.peRatio?.toFixed(2) || 'N/A' },
              { label: 'P/S Ratio', value: data.favorites.psRatio?.toFixed(2) || 'N/A' },
              { label: 'EPS Growth', value: data.favorites.epsGrowth ? `${(data.favorites.epsGrowth * 100).toFixed(1)}%` : 'N/A', color: data.favorites.epsGrowth >= 0 ? theme.positive : theme.negative },
              { label: 'Div Yield', value: data.favorites.dividendYield ? `${(data.favorites.dividendYield * 100).toFixed(2)}%` : 'N/A' },
              { label: 'Market Cap', value: data.favorites.marketCap ? `$${(data.favorites.marketCap / 1e9).toFixed(1)}B` : 'N/A' },
              { label: 'Shares Out', value: data.favorites.sharesOutstanding ? `${(data.favorites.sharesOutstanding / 1e9).toFixed(2)}B` : 'N/A' },
              { label: 'Beta', value: data.favorites.beta?.toFixed(2) || 'N/A' },
              { label: 'ROE', value: data.favorites.roe ? `${(data.favorites.roe * 100).toFixed(1)}%` : 'N/A', color: data.favorites.roe >= 0.15 ? theme.positive : undefined },
              { label: 'ROIC', value: data.favorites.roic ? `${(data.favorites.roic * 100).toFixed(1)}%` : 'N/A', color: data.favorites.roic >= 0.12 ? theme.positive : undefined },
              { label: 'Debt/EBITDA', value: data.favorites.debtToEbitda?.toFixed(2) || 'N/A', color: data.favorites.debtToEbitda < 2 ? theme.positive : data.favorites.debtToEbitda > 3 ? theme.negative : undefined },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-4 rounded-xl border transition-colors" style={{ background: theme.bgCard, borderColor: theme.border }}>
                <div className="text-[10px] mb-1.5 tracking-wider uppercase" style={{ color: theme.textTertiary }}>{label}</div>
                <div className="text-lg font-bold" style={{ color: color || theme.text }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insight Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <div className="text-[10px] tracking-widest uppercase mb-3" style={{ color: theme.textTertiary }}>Valuation Snapshot</div>
          <div className="text-xl font-bold mb-1" style={{
            color: verdict?.verdict === 'UNDERVALUED' ? theme.positive
              : verdict?.verdict === 'OVERVALUED' ? theme.negative
              : theme.text,
          }}>
            {verdict ? verdict.verdict : 'N/A'}
          </div>
          <div className="text-xs mb-4" style={{ color: theme.textTertiary }}>
            {verdict
              ? `${verdict.upside >= 0 ? 'Upside' : 'Downside'} ${Math.abs(verdict.upside).toFixed(1)}% vs fair value`
              : 'Run analysis to generate a verdict'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SignalPill theme={theme} label="Current Price" value={verdict ? `$${verdict.currentPrice.toFixed(2)}` : 'N/A'} />
            <SignalPill theme={theme} label="Fair Value" value={verdict ? `$${verdict.avgFairValue.toFixed(2)}` : 'N/A'} tone={verdict && verdict.upside > 0 ? 'positive' : verdict && verdict.upside < 0 ? 'negative' : 'neutral'} />
          </div>
        </div>

        <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <div className="text-[10px] tracking-widest uppercase mb-3" style={{ color: theme.textTertiary }}>Growth & Momentum</div>
          <div className="text-xs mb-4" style={{ color: theme.textMuted }}>5Y pace and profitability drift</div>
          <div className="grid grid-cols-2 gap-2">
            <SignalPill theme={theme} label="Revenue CAGR" value={revenueCagr !== null ? `${(revenueCagr * 100).toFixed(1)}%` : 'N/A'} tone={revenueCagr > 0.08 ? 'positive' : revenueCagr < 0 ? 'negative' : 'neutral'} />
            <SignalPill theme={theme} label="FCF CAGR" value={fcfCagr !== null ? `${(fcfCagr * 100).toFixed(1)}%` : 'N/A'} tone={fcfCagr > 0.08 ? 'positive' : fcfCagr < 0 ? 'negative' : 'neutral'} />
            <SignalPill theme={theme} label="Net Margin" value={netMargin !== null ? `${(netMargin * 100).toFixed(1)}%` : 'N/A'} tone={netMargin > 0.15 ? 'positive' : netMargin < 0.05 ? 'negative' : 'neutral'} />
            <SignalPill theme={theme} label="Margin Drift" value={marginDelta !== null ? `${(marginDelta * 100).toFixed(1)}%` : 'N/A'} tone={marginDelta > 0 ? 'positive' : marginDelta < 0 ? 'negative' : 'neutral'} />
          </div>
        </div>

        <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <div className="text-[10px] tracking-widest uppercase mb-3" style={{ color: theme.textTertiary }}>Quality & Strength</div>
          <div className="text-xs mb-4" style={{ color: theme.textMuted }}>Returns, leverage, predictability</div>
          <div className="grid grid-cols-2 gap-2">
            <SignalPill theme={theme} label="ROIC" value={data?.favorites?.roic ? `${(data.favorites.roic * 100).toFixed(1)}%` : 'N/A'} tone={data?.favorites?.roic > 0.12 ? 'positive' : data?.favorites?.roic < 0.06 ? 'negative' : 'neutral'} />
            <SignalPill theme={theme} label="ROE" value={data?.favorites?.roe ? `${(data.favorites.roe * 100).toFixed(1)}%` : 'N/A'} tone={data?.favorites?.roe > 0.15 ? 'positive' : data?.favorites?.roe < 0.08 ? 'negative' : 'neutral'} />
            <SignalPill theme={theme} label="Debt / EBITDA" value={data?.favorites?.debtToEbitda ? data.favorites.debtToEbitda.toFixed(2) : 'N/A'} tone={data?.favorites?.debtToEbitda < 2 ? 'positive' : data?.favorites?.debtToEbitda > 3 ? 'negative' : 'neutral'} />
            <SignalPill theme={theme} label="Predictability" value={data?.factorRankings?.predictability?.rank || 'N/A'} tone={data?.factorRankings?.predictability?.rank === 'High' ? 'positive' : data?.factorRankings?.predictability?.rank === 'Low' ? 'negative' : 'neutral'} />
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div>
        <h3 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Key Metrics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard theme={theme} label="Market Cap" value={formatNumber(data?.quote?.marketCap)} />
          <MetricCard theme={theme} label="Enterprise Value" value={formatNumber(latestMetrics?.enterpriseValue)} />
          <MetricCard theme={theme} label="P/E Ratio" value={formatRatio(data?.quote?.pe)} subtext="TTM" />
          <MetricCard theme={theme} label="P/S Ratio" value={formatRatio(latestRatios?.priceToSalesRatio)} />
          <MetricCard theme={theme} label="P/B Ratio" value={formatRatio(latestRatios?.priceToBookRatio)} />
          <MetricCard theme={theme} label="EV/EBITDA" value={formatRatio(latestMetrics?.evToEBITDA)} />
          <MetricCard theme={theme} label="Debt/Equity" value={formatRatio(latestRatios?.debtToEquityRatio)} />
          <MetricCard theme={theme} label="Current Ratio" value={formatRatio(latestRatios?.currentRatio)} />
          <MetricCard theme={theme} label="Quick Ratio" value={formatRatio(latestRatios?.quickRatio)} />
          <MetricCard theme={theme} label="Div Yield" value={formatPercent(latestRatios?.dividendYield)} />
          <MetricCard theme={theme} label="FCF Yield" value={formatPercent(latestMetrics?.freeCashFlowYield)} />
          <MetricCard theme={theme} label="Earnings Yield" value={formatPercent(latestMetrics?.earningsYield)} />
        </div>
      </div>
    </div>
  );
}

function ValuationTab({ data, theme, formatNumber, formatRatio }) {
  const methodTypeByKey = {
    dcfOperatingCashFlow: 'dcf',
    dcfTerminal: 'dcf',
    dcf20Year: 'dcf',
    dfcf20Year: 'dcf',
    dni20Year: 'dcf',
    dfcfTerminal: 'dcf',
    fairValuePS: 'relative',
    fairValuePE: 'relative',
    fairValuePB: 'relative',
    meanPSValue: 'relative',
    meanPEValue: 'relative',
    meanPBValue: 'relative',
    psgValue: 'relative',
    pegValue: 'relative',
    earningsPowerValue: 'relative',
    grahamNumber: 'conservative',
  };

  const methodColorByType = {
    dcf: '#f59e0b',
    relative: '#f97316',
    conservative: '#6b7280',
  };

  const valuationMethods = (data?.dcf?.compositeMethods || [])
    .map((entry) => ({
      name: entry.label,
      value: entry.value,
      key: entry.key,
      type: methodTypeByKey[entry.key] || 'relative',
    }))
    .filter((entry) => entry.value && entry.value > 0 && isFinite(entry.value));
  const valuationMethodsForChart = valuationMethods.length > 0
    ? valuationMethods
    : [
      { name: 'DCF (Unlevered FCF)', value: data?.dcf?.dcfOperatingCashFlow, key: 'dcfOperatingCashFlow' },
      { name: 'DCF Terminal (15x FCF)', value: data?.dcf?.dcfTerminal, key: 'dcfTerminal' },
      { name: 'Fair Value (P/S)', value: data?.dcf?.fairValuePS, key: 'fairValuePS' },
      { name: 'Fair Value (P/E)', value: data?.dcf?.fairValuePE, key: 'fairValuePE' },
      { name: 'Fair Value (P/B)', value: data?.dcf?.fairValuePB, key: 'fairValuePB' },
      { name: 'Earnings Power Value', value: data?.dcf?.earningsPowerValue, key: 'earningsPowerValue' },
      { name: 'Graham Number', value: data?.dcf?.grahamNumber, key: 'grahamNumber' },
    ]
      .map((entry) => ({ ...entry, type: methodTypeByKey[entry.key] || 'relative' }))
      .filter((entry) => entry.value && entry.value > 0 && isFinite(entry.value));

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-valuation" aria-labelledby="tab-valuation">
      {/* Valuation Chart */}
      {data?.dcf && data.dcf.compositeValue && (
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Valuation Models</h3>
              {data.dcf?.confidence && (
                <div className="text-[10px] px-3 py-1 rounded-full border w-fit" style={{
                  background: data.dcf.confidence.valid ? theme.positiveBg : theme.warningBg,
                  color: data.dcf.confidence.valid ? theme.positive : theme.warning,
                  borderColor: data.dcf.confidence.valid ? theme.positiveBorder : theme.warningBorder,
                }}>
                  {data.dcf.confidence.valid ? 'DCF VALID' : `DCF PARTIAL: missing ${data.dcf.confidence.missing.join(', ')}`}
                </div>
              )}
            </div>
            <div className="text-left sm:text-right">
              <div className="text-[10px] tracking-wider uppercase" style={{ color: theme.textTertiary }}>Fair Value Estimate</div>
              <div className="text-2xl font-bold" style={{ color: data.dcf.upside > 0 ? theme.positive : theme.negative }}>
                ${data.dcf.compositeValue?.toFixed(2)}
              </div>
              <div className="text-xs font-medium" style={{ color: data.dcf.upside > 0 ? theme.positive : theme.negative, opacity: 0.7 }}>
                {data.dcf.upside > 0 ? '+' : ''}{data.dcf.upside?.toFixed(1)}% vs Current
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              layout="vertical"
              data={valuationMethodsForChart}
              margin={{ top: 20, right: 30, left: 130, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
              <XAxis
                type="number"
                domain={[0, 'auto']}
                tick={{ fontSize: 10, fill: theme.textTertiary }}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                axisLine={{ stroke: theme.chartGrid }}
                tickLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 11, fill: theme.textSecondary }}
                width={260}
                axisLine={{ stroke: theme.chartGrid }}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => [`$${value?.toFixed(2)}`, 'Fair Value']}
                contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
                cursor={{ fill: theme.cursorFill }}
              />
              <ReferenceLine
                x={data.dcf.currentPrice}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="5 5"
                label={{ value: `Current: $${data.dcf.currentPrice?.toFixed(2)}`, position: 'top', fontSize: 10, fill: '#ef4444' }}
              />
              <ReferenceLine
                x={data.dcf.compositeValue}
                stroke="#10b981"
                strokeWidth={2}
                label={{ value: `Fair: $${data.dcf.compositeValue?.toFixed(2)}`, position: 'top', fontSize: 10, fill: '#10b981' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {valuationMethodsForChart.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={methodColorByType[entry.type] || methodColorByType.relative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-5 flex flex-wrap gap-5 text-[10px]" style={{ color: theme.textTertiary }}>
            <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm" style={{ background: '#f59e0b' }}></div><span>DCF Models</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm" style={{ background: '#f97316' }}></div><span>Relative Valuation</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm" style={{ background: '#6b7280' }}></div><span>Conservative</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-0.5" style={{ background: '#ef4444' }}></div><span>Current Price</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-0.5" style={{ background: '#10b981' }}></div><span>Fair Value</span></div>
          </div>

          <div className="mt-5 p-4 rounded-xl text-[10px] border" style={{ background: theme.bg, borderColor: theme.border, color: theme.textTertiary }}>
            <span style={{ color: theme.textSecondary }}>Assumptions:</span> Discount Rate: {data.dcf.discountRate?.toFixed(1)}% (WACC) | Terminal Growth: {data.dcf.terminalGrowth?.toFixed(1)}% | Projection: 10 years | Composite Source: {data.dcf.compositeSource || 'core'}
          </div>
        </div>
      )}

      {/* Calculation Trace */}
      {data?.dcf?.assumptions && (
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-5">
            <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Calculation Trace</h3>
            <div className="text-[10px]" style={{ color: theme.textMuted }}>Key inputs driving fair value</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <MetricCard theme={theme} label="Shares Out" value={formatNumber(data.dcf.assumptions.sharesOutstanding, 0)} />
            <MetricCard theme={theme} label="Beta" value={formatRatio(data.dcf.assumptions.beta)} />
            <MetricCard theme={theme} label="Cost of Equity" value={`${data.dcf.assumptions.costOfEquity.toFixed(2)}%`} />
            <MetricCard theme={theme} label="Cost of Debt" value={`${data.dcf.assumptions.costOfDebt.toFixed(2)}%`} />
            <MetricCard theme={theme} label="Equity Weight" value={`${data.dcf.assumptions.equityWeight.toFixed(1)}%`} />
            <MetricCard theme={theme} label="Debt Weight" value={`${data.dcf.assumptions.debtWeight.toFixed(1)}%`} />
            <MetricCard theme={theme} label="Tax Rate" value={`${data.dcf.assumptions.taxRate.toFixed(1)}%`} />
            <MetricCard theme={theme} label="Rev Growth" value={`${data.dcf.assumptions.revenueGrowth.toFixed(1)}%`} />
            <MetricCard theme={theme} label="NI Growth" value={`${data.dcf.assumptions.netIncomeGrowth.toFixed(1)}%`} />
            <MetricCard theme={theme} label="FCF Growth" value={`${data.dcf.assumptions.fcfGrowth.toFixed(1)}%`} />
            <MetricCard theme={theme} label="Op Margin" value={data.dcf.assumptions.operatingMargin !== null ? `${data.dcf.assumptions.operatingMargin.toFixed(1)}%` : 'N/A'} />
            <MetricCard theme={theme} label="CapEx %" value={data.dcf.assumptions.capexRatio !== null ? `${data.dcf.assumptions.capexRatio.toFixed(1)}%` : 'N/A'} />
            <MetricCard theme={theme} label="D&A %" value={data.dcf.assumptions.daRatio !== null ? `${data.dcf.assumptions.daRatio.toFixed(1)}%` : 'N/A'} />
            <MetricCard theme={theme} label="NWC %" value={data.dcf.assumptions.nwcRatio !== null ? `${data.dcf.assumptions.nwcRatio.toFixed(1)}%` : 'N/A'} />
            <MetricCard theme={theme} label="Latest Revenue" value={formatNumber(data.dcf.assumptions.latestRevenue)} />
            <MetricCard theme={theme} label="Latest NI" value={formatNumber(data.dcf.assumptions.latestNetIncome)} />
            <MetricCard theme={theme} label="Latest FCF" value={formatNumber(data.dcf.assumptions.latestFCF)} />
            <MetricCard theme={theme} label="Latest OCF" value={formatNumber(data.dcf.assumptions.latestOCF)} />
            <MetricCard theme={theme} label="Latest Equity" value={formatNumber(data.dcf.assumptions.latestEquity)} />
          </div>
        </div>
      )}

      {/* Valuation Ratios Table */}
      {data?.valuationRatios?.historical?.length > 0 && (
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Valuation Ratios</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: theme.tableBg }}>
                  <th className="px-3 py-3 text-left font-semibold sticky left-0" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, background: theme.tableBg }}>Metric</th>
                  {data.valuationRatios.historical.map((h) => (
                    <th key={h.year} className="px-3 py-3 text-right font-medium min-w-[60px]" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>{h.year}</th>
                  ))}
                  <th className="px-3 py-3 text-right font-semibold min-w-[70px]" style={{ color: theme.accent, borderBottom: `1px solid ${theme.border}`, background: theme.accent + '0d' }}>Current</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[70px]" style={{ color: theme.accentAlt, borderBottom: `1px solid ${theme.border}`, background: theme.accentAlt + '0d' }}>10Y Avg</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'P/E Ratio', key: 'peRatio' },
                  { label: 'P/S Ratio', key: 'psRatio' },
                  { label: 'P/B Ratio', key: 'pbRatio' },
                  { label: 'PEG Ratio', key: 'pegRatio' },
                  { label: 'PSG Ratio', key: 'psgRatio' },
                ].map(({ label, key }) => (
                  <tr key={key} style={{ borderBottom: `1px solid ${theme.border}` }}
                    onMouseEnter={(e) => e.currentTarget.style.background = theme.tableRowHover}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-3 py-3 font-medium sticky left-0" style={{ color: theme.text, background: theme.stickyBg }}>{label}</td>
                    {data.valuationRatios.historical.map((h) => (
                      <td key={h.year} className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{h[key]?.toFixed(2) || '-'}</td>
                    ))}
                    <td className="px-3 py-3 text-right font-semibold" style={{ color: theme.accent, background: theme.accent + '0d' }}>{data.valuationRatios.current?.[key]?.toFixed(2) || '-'}</td>
                    <td className="px-3 py-3 text-right font-semibold" style={{ color: theme.accentAlt, background: theme.accentAlt + '0d' }}>{data.valuationRatios.tenYearAvg?.[key]?.toFixed(2) || '-'}</td>
                  </tr>
                ))}
                {[
                  { label: 'EPS Growth', key: 'epsGrowth' },
                  { label: 'Rev Growth', key: 'revenueGrowth' },
                ].map(({ label, key }) => (
                  <tr key={key} style={{ borderBottom: `1px solid ${theme.border}` }}
                    onMouseEnter={(e) => e.currentTarget.style.background = theme.tableRowHover}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-3 py-3 font-medium sticky left-0" style={{ color: theme.textSecondary, background: theme.stickyBg }}>{label}</td>
                    {data.valuationRatios.historical.map((h) => (
                      <td key={h.year} className="px-3 py-3 text-right" style={{ color: h[key] >= 0 ? theme.positive : theme.negative }}>
                        {h[key] !== null && h[key] !== undefined ? `${h[key].toFixed(1)}%` : '-'}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right" style={{ color: theme.textMuted, background: theme.accent + '0d' }}>-</td>
                    <td className="px-3 py-3 text-right" style={{ color: theme.textMuted, background: theme.accentAlt + '0d' }}>-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-[10px]" style={{ color: theme.textMuted }}>
            Note: Historical ratios calculated using current price vs historical earnings/sales/book value.
          </div>
        </div>
      )}

      {/* Other Valuation Ratios */}
      {data?.valuationRatios?.other && (
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Other Valuation Ratios</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest pb-2" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Per Share & Yield</h4>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>EBITDA per Share</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.ebitdaPerShare?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Earnings Yield</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.earningsYield?.toFixed(2) || 'N/A'}%</span></div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest pb-2" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Enterprise Value</h4>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Enterprise Value</span><span className="text-xs font-semibold" style={{ color: theme.text }}>${(data.valuationRatios.other.enterpriseValue / 1e9)?.toFixed(2) || 'N/A'}B</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>EV / FCF</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.evToFCF?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>EV / EBIT</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.evToEBIT?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>EV / EBITDA</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.evToEBITDA?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>EV / Revenue</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.evToRevenue?.toFixed(2) || 'N/A'}</span></div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest pb-2" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Forward Metrics</h4>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Forward P/E</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.forwardPE?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Rule of 40</span><span className="text-xs font-semibold" style={{ color: data.valuationRatios.other.ruleOf40 >= 40 ? theme.positive : theme.warning }}>{data.valuationRatios.other.ruleOf40?.toFixed(2) || 'N/A'}%</span></div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest pb-2" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Mean Valuations</h4>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Mean P/E Ratio</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.meanPE?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Mean P/E Value</span><span className="text-xs font-semibold" style={{ color: theme.positive }}>${data.valuationRatios.other.meanPEValue?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Mean P/S Ratio</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.meanPS?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Mean P/S Value</span><span className="text-xs font-semibold" style={{ color: theme.positive }}>${data.valuationRatios.other.meanPSValue?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Mean P/B Ratio</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.meanPB?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Mean P/B Value</span><span className="text-xs font-semibold" style={{ color: theme.positive }}>${data.valuationRatios.other.meanPBValue?.toFixed(2) || 'N/A'}</span></div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest pb-2" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Median Valuations</h4>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Median P/E Ratio</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.medianPE?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Median P/E Value</span><span className="text-xs font-semibold" style={{ color: theme.positive }}>${data.valuationRatios.other.medianPEValue?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Median P/S Ratio</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.medianPS?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Median P/S Value</span><span className="text-xs font-semibold" style={{ color: theme.positive }}>${data.valuationRatios.other.medianPSValue?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Median P/B Ratio</span><span className="text-xs font-semibold" style={{ color: theme.text }}>{data.valuationRatios.other.medianPB?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>Median P/B Value</span><span className="text-xs font-semibold" style={{ color: theme.positive }}>${data.valuationRatios.other.medianPBValue?.toFixed(2) || 'N/A'}</span></div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest pb-2" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>DCF Valuations (20Y)</h4>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>DCF-20 Value</span><span className="text-xs font-semibold" style={{ color: theme.accent }}>${data.valuationRatios.other.dcf20Year?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>DFCF-20 Value</span><span className="text-xs font-semibold" style={{ color: theme.accent }}>${data.valuationRatios.other.dfcf20Year?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>DNI-20 Value</span><span className="text-xs font-semibold" style={{ color: theme.accent }}>${data.valuationRatios.other.dni20Year?.toFixed(2) || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-xs" style={{ color: theme.textTertiary }}>DFCF-Terminal</span><span className="text-xs font-semibold" style={{ color: theme.accent }}>${data.valuationRatios.other.dfcfTerminal?.toFixed(2) || 'N/A'}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinancialsTab({ data, theme, formatPercent, formatRatio }) {
  if (!data?.ratios?.length) {
    return (
      <div className="animate-fadeIn" role="tabpanel" id="tabpanel-financials" aria-labelledby="tab-financials">
        <div className="p-6 rounded-2xl border text-center" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <p className="text-xs" style={{ color: theme.textTertiary }}>No financial ratio data available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-financials" aria-labelledby="tab-financials">
      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>
          Historical Financial Ratios
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: theme.tableBg }}>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Year</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Gross Profit Margin</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Operating Margin</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Net Margin</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Return on Equity</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Return on Capital Employed</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Return on Assets</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Debt to Equity</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Current Ratio</th>
              </tr>
            </thead>
            <tbody>
              {data.ratios.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}
                  onMouseEnter={(e) => e.currentTarget.style.background = theme.tableRowHover}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td className="px-3 py-3 font-semibold" style={{ color: theme.text }}>{r.calendarYear || r.date?.slice(0, 4)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatPercent(r.grossProfitMargin)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatPercent(r.operatingProfitMargin)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatPercent(r.netProfitMargin)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatPercent(r.returnOnEquity)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatPercent(r.returnOnCapitalEmployed)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatPercent(r.returnOnAssets)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatRatio(r.debtToEquityRatio)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatRatio(r.currentRatio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OperatingMetricsTab({ data, theme }) {
  const incomeByYear = useMemo(
    () => new Map((data?.income || []).map((r) => [String(r.calendarYear), r])),
    [data?.income]
  );
  const cashflowByYear = useMemo(
    () => new Map((data?.cashflow || []).map((r) => [String(r.calendarYear), r])),
    [data?.cashflow]
  );
  const balanceByYear = useMemo(
    () => new Map((data?.balance || []).map((r) => [String(r.calendarYear), r])),
    [data?.balance]
  );
  const ratioByYear = useMemo(
    () => new Map((data?.ratios || []).map((r) => [String(r.calendarYear), r])),
    [data?.ratios]
  );

  const years = useMemo(() => {
    const set = new Set([
      ...(data?.income || []).map((r) => String(r.calendarYear)),
      ...(data?.cashflow || []).map((r) => String(r.calendarYear)),
      ...(data?.balance || []).map((r) => String(r.calendarYear)),
    ]);
    return Array.from(set).sort();
  }, [data?.income, data?.cashflow, data?.balance]);

  const avg = (values) => {
    const valid = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    if (!valid.length) return null;
    return valid.reduce((s, v) => s + v, 0) / valid.length;
  };

  const pct = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v * 100);
  const ratio = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);

  const getMetricSeries = (getter) =>
    years.map((y) => {
      const inc = incomeByYear.get(y);
      const cf = cashflowByYear.get(y);
      const bal = balanceByYear.get(y);
      const rat = ratioByYear.get(y);
      return getter({ y, inc, cf, bal, rat });
    });

  const rowFromSeries = (label, values, type = 'percent') => ({
    label,
    type,
    values,
    current: values[values.length - 1] ?? null,
    avg10: avg(values),
  });

  const formatCell = (value, type) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-';
    if (type === 'percent') return `${value.toFixed(2)}%`;
    return value.toFixed(2);
  };

  const profitabilityRows = [
    rowFromSeries('Operating Cash Flow Margin', getMetricSeries(({ inc, cf }) => (inc?.revenue ? pct((cf?.operatingCashFlow || 0) / inc.revenue) : null))),
    rowFromSeries('Free Cash Flow Margin', getMetricSeries(({ inc, cf }) => (inc?.revenue ? pct((cf?.freeCashFlow || 0) / inc.revenue) : null))),
    rowFromSeries('Gross Profit Margin', getMetricSeries(({ rat }) => pct(rat?.grossProfitMargin))),
    rowFromSeries('Operating Profit Margin', getMetricSeries(({ rat }) => pct(rat?.operatingProfitMargin))),
    rowFromSeries('Net Profit Margin', getMetricSeries(({ rat }) => pct(rat?.netProfitMargin))),
    rowFromSeries('Return on Assets (ROA)', getMetricSeries(({ rat }) => pct(rat?.returnOnAssets))),
    rowFromSeries('Return on Equity (ROE)', getMetricSeries(({ rat }) => pct(rat?.returnOnEquity))),
    rowFromSeries('Return on Invested Capital (ROIC)', getMetricSeries(({ rat }) => pct(rat?.returnOnCapitalEmployed))),
  ];

  const debtLiquidityRows = [
    rowFromSeries('Cash Ratio', getMetricSeries(({ bal }) => (bal?.currentLiabilities > 0 ? ratio(((bal.cashAndCashEquivalents || 0) + (bal.shortTermInvestments || 0)) / bal.currentLiabilities) : null)), 'ratio'),
    rowFromSeries('Current Ratio', getMetricSeries(({ rat }) => ratio(rat?.currentRatio)), 'ratio'),
    rowFromSeries('Debt Servicing Ratio', getMetricSeries(() => null)),
    rowFromSeries('Interest Coverage', getMetricSeries(() => null), 'ratio'),
    rowFromSeries('Total Debt / EBITDA', getMetricSeries(() => null), 'ratio'),
  ];

  const efficiencyRows = [
    rowFromSeries('Fixed Asset Turnover', getMetricSeries(() => null), 'ratio'),
    rowFromSeries('Days of Payables Outstanding', getMetricSeries(() => null), 'ratio'),
    rowFromSeries('Inventory Turnover', getMetricSeries(() => null), 'ratio'),
    rowFromSeries('Receivables Turnover', getMetricSeries(() => null), 'ratio'),
    rowFromSeries('Asset Turnover Ratio', getMetricSeries(({ inc, bal }) => (bal?.totalAssets ? ratio(inc?.revenue / bal.totalAssets) : null)), 'ratio'),
    rowFromSeries('Cash Conversion Cycle', getMetricSeries(() => null), 'ratio'),
    rowFromSeries('CapEx to Operating Cash Flow', getMetricSeries(({ cf }) => (cf?.operatingCashFlow ? ratio(Math.abs(cf.capitalExpenditure || 0) / cf.operatingCashFlow) : null)), 'ratio'),
    rowFromSeries('CapEx to Operating Income', getMetricSeries(({ inc, cf }) => (inc?.operatingIncome ? ratio(Math.abs(cf?.capitalExpenditure || 0) / inc.operatingIncome) : null)), 'ratio'),
    rowFromSeries('CapEx to Revenue', getMetricSeries(({ inc, cf }) => (inc?.revenue ? ratio(Math.abs(cf?.capitalExpenditure || 0) / inc.revenue) : null)), 'ratio'),
  ];

  const valuationHistoryByYear = new Map((data?.valuationRatios?.historical || []).map((h) => [String(h.year), h]));
  const priceRatioRows = [
    rowFromSeries('Price to Earnings (PE) Ratio', years.map((y) => ratio(valuationHistoryByYear.get(y)?.peRatio)), 'ratio'),
    rowFromSeries('Price to Earnings Growth (PEG) Ratio', years.map((y) => ratio(valuationHistoryByYear.get(y)?.pegRatio)), 'ratio'),
    rowFromSeries('Price to Sales (PS) Ratio', years.map((y) => ratio(valuationHistoryByYear.get(y)?.psRatio)), 'ratio'),
    rowFromSeries('Price to Book (PB) Ratio', years.map((y) => ratio(valuationHistoryByYear.get(y)?.pbRatio)), 'ratio'),
  ];

  const getCagr = (series, nYears) => {
    if (series.length < nYears + 1) return null;
    const end = series[series.length - 1];
    const start = series[series.length - 1 - nYears];
    if (!start || !end || start <= 0 || end <= 0) return null;
    return Math.pow(end / start, 1 / nYears) - 1;
  };

  const growthRows = [
    { label: 'Revenue', series: (data?.income || []).map((r) => r.revenue || 0) },
    { label: 'Net Income', series: (data?.income || []).map((r) => r.netIncome || 0) },
    { label: 'Operating Income', series: (data?.income || []).map((r) => r.operatingIncome || 0) },
    { label: 'Operating Cash Flow', series: (data?.cashflow || []).map((r) => r.operatingCashFlow || 0) },
    { label: 'Free Cash Flow', series: (data?.cashflow || []).map((r) => r.freeCashFlow || 0) },
  ];

  const ttmGross = profitabilityRows.find((r) => r.label === 'Gross Profit Margin')?.current;
  const ttmNet = profitabilityRows.find((r) => r.label === 'Net Profit Margin')?.current;
  const ttmOp = profitabilityRows.find((r) => r.label === 'Operating Profit Margin')?.current;
  const ttmOcf = profitabilityRows.find((r) => r.label === 'Operating Cash Flow Margin')?.current;
  const ttmFcf = profitabilityRows.find((r) => r.label === 'Free Cash Flow Margin')?.current;
  const ttmRoa = profitabilityRows.find((r) => r.label === 'Return on Assets (ROA)')?.current;
  const ttmRoic = profitabilityRows.find((r) => r.label === 'Return on Invested Capital (ROIC)')?.current;
  const ttmRoe = profitabilityRows.find((r) => r.label === 'Return on Equity (ROE)')?.current;
  const gross5yAvg = avg(profitabilityRows.find((r) => r.label === 'Gross Profit Margin')?.values.slice(-5) || []);

  const ttmAssetTurnover = efficiencyRows.find((r) => r.label === 'Asset Turnover Ratio')?.current;
  const ttmCapexToOcf = efficiencyRows.find((r) => r.label === 'CapEx to Operating Cash Flow')?.current;
  const ttmCapexToOp = efficiencyRows.find((r) => r.label === 'CapEx to Operating Income')?.current;
  const ttmCapexToRev = efficiencyRows.find((r) => r.label === 'CapEx to Revenue')?.current;
  const ttmDpo = efficiencyRows.find((r) => r.label === 'Days of Payables Outstanding')?.current;
  const ttmFat = efficiencyRows.find((r) => r.label === 'Fixed Asset Turnover')?.current;
  const ttmInvTurnover = efficiencyRows.find((r) => r.label === 'Inventory Turnover')?.current;
  const ttmReceivables = efficiencyRows.find((r) => r.label === 'Receivables Turnover')?.current;
  const ttmCcc = efficiencyRows.find((r) => r.label === 'Cash Conversion Cycle')?.current;

  const renderTable = (title, rows) => (
    <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
      <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: theme.tableBg }}>
              <th className="px-3 py-3 text-left font-semibold sticky left-0" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, background: theme.tableBg }}>Metric</th>
              {years.map((y) => (
                <th key={y} className="px-3 py-3 text-right font-medium min-w-[70px]" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>{y}</th>
              ))}
              <th className="px-3 py-3 text-right font-semibold min-w-[70px]" style={{ color: theme.accent, borderBottom: `1px solid ${theme.border}`, background: theme.accent + '0d' }}>Current</th>
              <th className="px-3 py-3 text-right font-semibold min-w-[70px]" style={{ color: theme.accentAlt, borderBottom: `1px solid ${theme.border}`, background: theme.accentAlt + '0d' }}>10yAvg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td className="px-3 py-3 font-medium sticky left-0" style={{ color: theme.text, background: theme.stickyBg }}>{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={`${row.label}-${years[i]}`} className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>
                    {formatCell(v, row.type)}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-semibold" style={{ color: theme.accent, background: theme.accent + '0d' }}>{formatCell(row.current, row.type)}</td>
                <td className="px-3 py-3 text-right font-semibold" style={{ color: theme.accentAlt, background: theme.accentAlt + '0d' }}>{formatCell(row.avg10, row.type)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-operating-metrics" aria-labelledby="tab-operating-metrics">
      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Profitability Ratios</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricCard theme={theme} label="Gross Profit Margin (TTM)" value={formatCell(ttmGross, 'percent')} />
          <MetricCard theme={theme} label="Gross Profit Margin (5-year Average)" value={formatCell(gross5yAvg, 'percent')} />
          <MetricCard theme={theme} label="Net Profit Margin (TTM)" value={formatCell(ttmNet, 'percent')} />
          <MetricCard theme={theme} label="Operating Cash Flow Margin (TTM)" value={formatCell(ttmOcf, 'percent')} />
          <MetricCard theme={theme} label="Free Cash Flow Margin (TTM)" value={formatCell(ttmFcf, 'percent')} />
          <MetricCard theme={theme} label="Operating Profit Margin (TTM)" value={formatCell(ttmOp, 'percent')} />
          <MetricCard theme={theme} label="Return on Assets (TTM)" value={formatCell(ttmRoa, 'percent')} />
          <MetricCard theme={theme} label="Return on Invested Capital (TTM)" value={formatCell(ttmRoic, 'percent')} />
          <MetricCard theme={theme} label="Return on Equity (TTM)" value={formatCell(ttmRoe, 'percent')} />
          <MetricCard theme={theme} label="Return on Common Equity (TTM)" value={formatCell(ttmRoe, 'percent')} />
        </div>
      </div>

      {renderTable('Profitability Ratios (Historical)', profitabilityRows)}
      {renderTable('Debt & Liquidity Ratios', debtLiquidityRows)}

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Efficiency Ratios</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricCard theme={theme} label="Asset Turnover Ratio (TTM)" value={formatCell(ttmAssetTurnover, 'ratio')} />
          <MetricCard theme={theme} label="CapEx to Operating Cash Flow (TTM)" value={formatCell(ttmCapexToOcf, 'ratio')} />
          <MetricCard theme={theme} label="CapEx to Operating Income (TTM)" value={formatCell(ttmCapexToOp, 'ratio')} />
          <MetricCard theme={theme} label="CapEx to Revenue (TTM)" value={formatCell(ttmCapexToRev, 'ratio')} />
          <MetricCard theme={theme} label="Cash Conversion Cycle (TTM)" value={formatCell(ttmCcc, 'ratio')} />
          <MetricCard theme={theme} label="Days of Payables Outstanding (TTM)" value={formatCell(ttmDpo, 'ratio')} />
          <MetricCard theme={theme} label="Fixed Asset Turnover (TTM)" value={formatCell(ttmFat, 'ratio')} />
          <MetricCard theme={theme} label="Inventory Turnover (TTM)" value={formatCell(ttmInvTurnover, 'ratio')} />
          <MetricCard theme={theme} label="Receivables Turnover (TTM)" value={formatCell(ttmReceivables, 'ratio')} />
        </div>
      </div>

      {renderTable('Efficiency Ratios (Historical)', efficiencyRows)}
      {renderTable('Price Ratios', priceRatioRows)}

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Growth</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: theme.tableBg }}>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Historical</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>1-year</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>3-year</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>5-year</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>10-year</th>
              </tr>
            </thead>
            <tbody>
              {growthRows.map((row) => (
                <tr key={row.label} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td className="px-3 py-3 font-medium" style={{ color: theme.text }}>{row.label}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatCell(pct(getCagr(row.series, 1)), 'percent')}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatCell(pct(getCagr(row.series, 3)), 'percent')}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatCell(pct(getCagr(row.series, 5)), 'percent')}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatCell(pct(getCagr(row.series, 10)), 'percent')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: theme.tableBg }}>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Projected</th>
                <th className="px-3 py-3 text-right font-medium" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>Current</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td className="px-3 py-3 font-medium" style={{ color: theme.text }}>Projected Revenue Growth Rate</td>
                <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatCell(data?.dcf?.assumptions?.revenueGrowth, 'percent')}</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td className="px-3 py-3 font-medium" style={{ color: theme.text }}>Projected 3-5 Years EPS Growth Rate</td>
                <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatCell(data?.dcf?.assumptions?.netIncomeGrowth, 'percent')}</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td className="px-3 py-3 font-medium" style={{ color: theme.text }}>Projected Long Term EPS Growth Rate</td>
                <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>-</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td className="px-3 py-3 font-medium" style={{ color: theme.text }}>Projected 3-5 Years Cash Flow per Share Growth Rate</td>
                <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatCell(data?.dcf?.assumptions?.fcfGrowth, 'percent')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChartsTab({ theme, viewMode, setViewMode, marginData, returnData, incomeData, cashFlowData, balanceData }) {
  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-charts" aria-labelledby="tab-charts">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Financial Charts</h3>
        <div className="flex rounded-lg p-1 border" style={{ background: theme.bg, borderColor: theme.border }}>
          <button
            onClick={() => setViewMode('annual')}
            className="px-4 py-2 text-[10px] font-semibold tracking-wider rounded-md transition-all"
            style={viewMode === 'annual' ? { background: '#2563eb', color: '#fff' } : { color: theme.textTertiary }}
          >
            ANNUAL
          </button>
          <button
            onClick={() => setViewMode('quarterly')}
            className="px-4 py-2 text-[10px] font-semibold tracking-wider rounded-md transition-all"
            style={viewMode === 'quarterly' ? { background: '#2563eb', color: '#fff' } : { color: theme.textTertiary }}
          >
            QUARTERLY
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {viewMode === 'annual' && (
          <>
            <ChartSection theme={theme} title="PROFITABILITY MARGINS (%)" chartData={marginData} dataKeys={['Gross Margin', 'Operating Margin', 'Net Margin']} colors={['#3b82f6', '#f97316', '#22c55e']} unit="%" dataKeyX="year" />
            <ChartSection theme={theme} title="RETURN ON CAPITAL (%)" chartData={returnData} dataKeys={['ROE', 'ROIC', 'ROA']} colors={['#3b82f6', '#f97316', '#92400e']} unit="%" dataKeyX="year" />
          </>
        )}
        <ChartSection theme={theme} title="INCOME STATEMENT ($B)" chartData={incomeData} dataKeys={['Revenue', 'Operating Income', 'Net Income']} colors={['#3b82f6', '#f97316', '#22c55e']} unit="B" />
        <ChartSection theme={theme} title="CASH FLOW ($B)" chartData={cashFlowData} dataKeys={['Operating CF', 'Free Cash Flow', 'CapEx']} colors={['#f97316', '#166534', '#ec4899']} unit="B" />
        <ChartSection theme={theme} title="BALANCE SHEET ($B)" chartData={balanceData} dataKeys={['Cash & Investments', 'Total Debt']} colors={['#22c55e', '#dc2626']} unit="B" />
      </div>
    </div>
  );
}

function ProfileTab({ data, theme }) {
  const websiteUrl = data?.profile?.website;
  const safeUrl = isValidUrl(websiteUrl) ? websiteUrl : null;

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-profile" aria-labelledby="tab-profile">
      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Company Profile</h3>
        <p className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
          {data?.profile?.description?.slice(0, 600)}
          {data?.profile?.description?.length > 600 ? '...' : ''}
        </p>
        <div className="mt-5 pt-4 flex flex-wrap gap-6 text-xs" style={{ borderTop: `1px solid ${theme.border}`, color: theme.textTertiary }}>
          <span><span style={{ color: theme.textSecondary }}>CEO:</span> {data?.profile?.ceo || 'N/A'}</span>
          <span><span style={{ color: theme.textSecondary }}>Employees:</span> {data?.profile?.fullTimeEmployees?.toLocaleString() || 'N/A'}</span>
          <span>
            <span style={{ color: theme.textSecondary }}>Website:</span>{' '}
            {safeUrl ? (
              <a href={safeUrl} target="_blank" rel="noopener noreferrer" style={{ color: theme.accent }} className="hover:underline transition-colors">
                {websiteUrl}
              </a>
            ) : (
              <span style={{ color: theme.textMuted }}>{websiteUrl || 'N/A'}</span>
            )}
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="p-5 rounded-2xl border text-xs leading-relaxed" style={{ background: theme.warningBg, borderColor: theme.warningBorder, color: theme.warningText }}>
        <span className="font-semibold" style={{ color: theme.warningStrong }}>Disclaimer:</span> This calculator provides estimates based on publicly
        available financial data and standard valuation models (DCF, Graham Number, multiples).
        It should not be considered financial advice. Always conduct your own due diligence and
        consult with a qualified financial advisor before making investment decisions.
      </div>
    </div>
  );
}

function InsiderActivityTab({ data, theme }) {
  const transactions = data?.insiderTransactions || [];

  const formatShares = (num) => {
    if (num === null || num === undefined || !Number.isFinite(num)) return 'N/A';
    return num.toLocaleString();
  };

  const formatMoney = (num) => {
    if (num === null || num === undefined || !Number.isFinite(num)) return 'N/A';
    if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const sells = transactions.filter((tx) => tx.side === 'SELL');
  const buys = transactions.filter((tx) => tx.side === 'BUY');

  const sellShares = sells.reduce((sum, tx) => sum + (tx.shares || 0), 0);
  const buyShares = buys.reduce((sum, tx) => sum + (tx.shares || 0), 0);
  const sellValue = sells.reduce((sum, tx) => sum + (tx.value || 0), 0);
  const buyValue = buys.reduce((sum, tx) => sum + (tx.value || 0), 0);

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-insider" aria-labelledby="tab-insider">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard theme={theme} label="Sell Transactions" value={String(sells.length)} subtext={formatMoney(sellValue)} />
        <MetricCard theme={theme} label="Buy Transactions" value={String(buys.length)} subtext={formatMoney(buyValue)} />
        <MetricCard theme={theme} label="Net Shares" value={formatShares(buyShares - sellShares)} subtext="Buys - Sells" />
        <MetricCard theme={theme} label="Net Value" value={formatMoney(buyValue - sellValue)} subtext="Buys - Sells" />
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Recent Insider Transactions</h3>
          <div className="text-[10px]" style={{ color: theme.textMuted }}>Latest reported insider activity</div>
        </div>

        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: theme.tableBg }}>
                  <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Date</th>
                  <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Insider</th>
                  <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Role</th>
                  <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Type</th>
                  <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Shares</th>
                  <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 20).map((tx, idx) => {
                  const tone = tx.side === 'SELL' ? theme.negative : tx.side === 'BUY' ? theme.positive : theme.textTertiary;
                  return (
                    <tr
                      key={`${tx.date}-${tx.insider}-${idx}`}
                      style={{ borderBottom: `1px solid ${theme.border}` }}
                      onMouseEnter={(e) => e.currentTarget.style.background = theme.tableRowHover}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="px-3 py-3" style={{ color: theme.text }}>{tx.date || 'N/A'}</td>
                      <td className="px-3 py-3 font-medium" style={{ color: theme.textSecondary }}>{tx.insider || 'N/A'}</td>
                      <td className="px-3 py-3" style={{ color: theme.textTertiary }}>{tx.relation || 'N/A'}</td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: `${tone}22`, color: tone }}>
                          {tx.side || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right" style={{ color: tone }}>{formatShares(tx.shares)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: tone }}>{formatMoney(tx.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs" style={{ color: theme.textTertiary }}>
            No insider activity data found for this ticker.
          </p>
        )}
      </div>
    </div>
  );
}

// ---- Main Component ----

export default function StockValuationCalculator() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState('annual');
  const [activeTab, setActiveTab] = useState('overview');
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('svc-theme');
    if (saved === 'light') setIsDark(false);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem('svc-theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const t = isDark ? themes.dark : themes.light;

  const fetchStockData = async () => {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) {
      setError('Please enter a ticker symbol');
      return;
    }

    if (!TICKER_REGEX.test(symbol)) {
      setError('Invalid ticker. Use 1-10 characters: letters, numbers, dots, or hyphens.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      setTicker(symbol);
      const response = await fetch(`/api/stock?ticker=${encodeURIComponent(symbol)}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result);
      setActiveTab('overview');
    } catch (err) {
      setError(err.message || 'Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculatePEGValue = useCallback(() => {
    return data?.valuationRatios?.current?.pegRatio ?? null;
  }, [data]);

  const getValuationVerdict = useCallback(() => {
    if (!data?.quote?.price) return null;

    const currentPrice = data.quote.price;
    const fairValue = data?.dcf?.compositeValue;
    if (!fairValue || !isFinite(fairValue)) return null;

    const valuations = (data?.dcf?.compositeMethods || []).map((entry) => ({
      method: entry.label,
      value: entry.value,
    }));
    if (valuations.length === 0) {
      valuations.push({ method: 'DCF Composite', value: fairValue });
    }
    const upside = ((fairValue - currentPrice) / currentPrice) * 100;

    return {
      currentPrice,
      avgFairValue: fairValue,
      upside,
      valuations,
      verdict: upside > 15 ? 'UNDERVALUED' : upside < -15 ? 'OVERVALUED' : 'FAIRLY VALUED',
    };
  }, [data]);

  const formatNumber = useCallback((num, decimals = 2) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
    if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
    return `$${num.toFixed(decimals)}`;
  }, []);

  const formatPercent = useCallback((num) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return `${(num * 100).toFixed(2)}%`;
  }, []);

  const formatRatio = useCallback((num) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return num.toFixed(2);
  }, []);

  const toBillions = useCallback((num) => {
    if (num === null || num === undefined || !Number.isFinite(num)) return null;
    return num / 1e9;
  }, []);

  // Memoized data prep
  const marginData = useMemo(() => {
    if (!data?.ratios) return [];
    return data.ratios.map((r) => ({
      year: r.calendarYear || r.date?.slice(0, 4),
      'Gross Margin': r.grossProfitMargin !== null && r.grossProfitMargin !== undefined
        ? parseFloat((r.grossProfitMargin * 100).toFixed(1))
        : null,
      'Operating Margin': r.operatingProfitMargin !== null && r.operatingProfitMargin !== undefined
        ? parseFloat((r.operatingProfitMargin * 100).toFixed(1))
        : null,
      'Net Margin': r.netProfitMargin !== null && r.netProfitMargin !== undefined
        ? parseFloat((r.netProfitMargin * 100).toFixed(1))
        : null,
    }));
  }, [data?.ratios]);

  const returnData = useMemo(() => {
    if (!data?.ratios) return [];
    return data.ratios.map((r) => ({
      year: r.calendarYear || r.date?.slice(0, 4),
      ROE: parseFloat(((r.returnOnEquity || 0) * 100).toFixed(1)),
      ROIC: parseFloat(((r.returnOnCapitalEmployed || 0) * 100).toFixed(1)),
      ROA: parseFloat(((r.returnOnAssets || 0) * 100).toFixed(1)),
    }));
  }, [data?.ratios]);

  const incomeData = useMemo(() => {
    const source = viewMode === 'quarterly' ? data?.incomeQ : data?.income;
    if (!source) return [];
    return source.map((i) => ({
      period: viewMode === 'quarterly'
        ? `${i.fiscalYear || i.date?.slice(0, 4)} ${i.period || ''}`.trim()
        : i.calendarYear || i.date?.slice(0, 4),
      Revenue: toBillions(i.revenue),
      'Operating Income': toBillions(i.operatingIncome),
      'Net Income': toBillions(i.netIncome),
    }));
  }, [data?.income, data?.incomeQ, toBillions, viewMode]);

  const cashFlowData = useMemo(() => {
    const source = viewMode === 'quarterly' ? data?.cashflowQ : data?.cashflow;
    if (!source) return [];
    return source.map((c) => ({
      period: viewMode === 'quarterly'
        ? `${c.fiscalYear || c.date?.slice(0, 4)} ${c.period || ''}`.trim()
        : c.calendarYear || c.date?.slice(0, 4),
      'Operating CF': toBillions(c.operatingCashFlow),
      'Free Cash Flow': toBillions(c.freeCashFlow),
      CapEx: toBillions(Math.abs(c.capitalExpenditure || 0)),
    }));
  }, [data?.cashflow, data?.cashflowQ, toBillions, viewMode]);

  const balanceData = useMemo(() => {
    const source = viewMode === 'quarterly' ? data?.balanceQ : data?.balance;
    if (!source) return [];
    return source.map((b) => ({
      period: viewMode === 'quarterly'
        ? `${b.fiscalYear || b.date?.slice(0, 4)} ${b.period || ''}`.trim()
        : b.calendarYear || b.date?.slice(0, 4),
      'Cash & Investments': toBillions((b.cashAndCashEquivalents || 0) + (b.shortTermInvestments || 0)),
      'Total Debt': toBillions(b.totalDebt || 0),
    }));
  }, [data?.balance, data?.balanceQ, toBillions, viewMode]);

  const calcCAGR = (values) => {
    if (!values || values.length < 2) return null;
    const start = values[0];
    const end = values[values.length - 1];
    if (!start || !end || start <= 0 || end <= 0) return null;
    const years = values.length - 1;
    return Math.pow(end / start, 1 / years) - 1;
  };

  const verdict = useMemo(() => data ? getValuationVerdict() : null, [data, getValuationVerdict]);
  const recentIncome = data?.income?.slice(-5) || [];
  const recentCashflow = data?.cashflow?.slice(-5) || [];
  const revenueCagr = useMemo(() => calcCAGR(recentIncome.map((i) => i.revenue).filter((v) => v > 0)), [recentIncome]);
  const fcfCagr = useMemo(() => calcCAGR(recentCashflow.map((c) => c.freeCashFlow).filter((v) => v > 0)), [recentCashflow]);
  const latestRatio = data?.ratios?.[data?.ratios?.length - 1];
  const priorRatio = data?.ratios?.[data?.ratios?.length - 2];
  const netMargin = latestRatio?.netProfitMargin ?? null;
  const marginDelta = netMargin !== null && priorRatio?.netProfitMargin !== null
    ? netMargin - priorRatio.netProfitMargin
    : null;

  const renderTab = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab data={data} verdict={verdict} theme={t} formatNumber={formatNumber} formatPercent={formatPercent} formatRatio={formatRatio} calculatePEGValue={calculatePEGValue} revenueCagr={revenueCagr} fcfCagr={fcfCagr} netMargin={netMargin} marginDelta={marginDelta} />;
      case 'valuation': return <ValuationTab data={data} theme={t} formatNumber={formatNumber} formatRatio={formatRatio} />;
      case 'financials': return <FinancialsTab data={data} theme={t} formatPercent={formatPercent} formatRatio={formatRatio} />;
      case 'operating-metrics': return <OperatingMetricsTab data={data} theme={t} />;
      case 'charts': return <ChartsTab theme={t} viewMode={viewMode} setViewMode={setViewMode} marginData={marginData} returnData={returnData} incomeData={incomeData} cashFlowData={cashFlowData} balanceData={balanceData} />;
      case 'insider': return <InsiderActivityTab data={data} theme={t} />;
      case 'profile': return <ProfileTab data={data} theme={t} />;
      default: return <OverviewTab data={data} verdict={verdict} theme={t} formatNumber={formatNumber} formatPercent={formatPercent} formatRatio={formatRatio} calculatePEGValue={calculatePEGValue} revenueCagr={revenueCagr} fcfCagr={fcfCagr} netMargin={netMargin} marginDelta={marginDelta} />;
    }
  };

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ background: t.bg, color: t.text }}>
      {/* Top Navigation Bar */}
      <header
        className="sticky top-0 z-50 backdrop-blur-xl border-b transition-colors duration-300"
        style={{ background: isDark ? 'rgba(10,10,15,0.85)' : 'rgba(248,249,252,0.85)', borderColor: t.border }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo / Brand */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: t.positive }}></div>
                <span className="text-xs font-bold tracking-widest uppercase" style={{ color: t.text }}>SVC</span>
              </div>
              <div className="hidden sm:block h-4 w-px" style={{ background: t.border }}></div>
              <span className="hidden sm:block text-[10px] tracking-wider uppercase" style={{ color: t.textTertiary }}>
                Stock Valuation Calculator
              </span>
            </div>

            {/* Search Bar (in header) */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && fetchStockData()}
                  placeholder="Enter ticker..."
                  aria-label="Stock ticker symbol"
                  className="w-28 sm:w-40 px-3 py-2 text-xs font-mono rounded-lg border transition-all"
                  style={{ background: t.bgInput, borderColor: t.border, color: t.text }}
                />
                <button
                  onClick={fetchStockData}
                  disabled={loading}
                  className="px-4 py-2 text-[10px] font-semibold tracking-wider rounded-lg transition-all"
                  style={loading
                    ? { background: t.bgElevated, color: t.textTertiary, cursor: 'not-allowed' }
                    : { background: '#2563eb', color: '#fff' }
                  }
                >
                  {loading ? 'LOADING...' : 'ANALYZE'}
                </button>
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg border transition-all hover:scale-105"
                style={{ borderColor: t.border, color: t.textSecondary }}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="p-3 rounded-lg text-xs border" role="alert" style={{ background: t.negativeBg, color: t.negative, borderColor: t.negativeBorder }}>{error}</div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-32">
          <div className="inline-flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: t.border, borderTopColor: t.accent }}></div>
            <div className="text-sm tracking-wide" style={{ color: t.textTertiary }}>Analyzing financial data...</div>
          </div>
        </div>
      )}

      {/* Empty / Landing State */}
      {!data && !loading && (
        <div className="text-center py-32">
          <div className="inline-flex flex-col items-center gap-4 max-w-md">
            <div className="text-4xl font-bold tracking-wider" style={{ color: t.text }}>STOCK VALUATION</div>
            <p className="text-sm tracking-wide" style={{ color: t.textTertiary }}>
              Professional fundamental analysis & intrinsic value estimation
            </p>
            <p className="text-[10px] tracking-wide" style={{ color: t.textMuted }}>
              Enter any US stock ticker above (e.g., AAPL, MSFT, GOOGL, NVDA, TSLA)
            </p>
          </div>
        </div>
      )}

      {data && !loading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Company Header */}
          <div
            className="p-6 sm:p-8 rounded-2xl text-white mb-6 relative overflow-hidden animate-fadeIn"
            style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #8b5cf6 100%)' }}
          >
            <div className="absolute inset-0 opacity-30" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">{data?.profile?.companyName || 'Unknown'}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm">{data?.profile?.symbol || ''}</span>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm">{data?.profile?.exchangeShortName || ''}</span>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm">{data?.profile?.sector || ''}</span>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-3xl sm:text-5xl font-bold tracking-tight">
                  ${data.quote?.price?.toFixed(2) ?? '—'}
                </div>
                <div
                  className="text-sm font-semibold mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{
                    background: data.quote?.changesPercentage >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                    color: data.quote?.changesPercentage >= 0 ? '#6ee7b7' : '#fca5a5',
                  }}
                >
                  {data.quote?.changesPercentage >= 0 ? '+' : '-'}$
                  {Math.abs(data.quote?.change || 0).toFixed(2)} ({Math.abs(data.quote?.changesPercentage || 0).toFixed(2)}%)
                </div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mb-6 border-b" style={{ borderColor: t.border }}>
            <nav className="flex gap-0 overflow-x-auto" role="tablist" aria-label="Analysis sections">
              {NAV_TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-5 py-3 text-xs font-semibold tracking-wider uppercase whitespace-nowrap transition-all border-b-2"
                  style={{
                    color: activeTab === tab.id ? t.accent : t.textTertiary,
                    borderBottomColor: activeTab === tab.id ? t.accent : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = t.textSecondary; }}
                  onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = t.textTertiary; }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Active Tab Content */}
          {renderTab()}

          {/* Footer */}
          <div className="mt-10 pt-6 text-center text-[10px] tracking-wide" style={{ borderTop: `1px solid ${t.border}`, color: t.textMuted }}>
            Data provided by Financial Modeling Prep | Built with Next.js & Recharts
          </div>
        </div>
      )}
    </div>
  );
}
