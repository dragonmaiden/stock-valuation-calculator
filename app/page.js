'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
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
  { id: 'trading', label: 'Trading' },
  { id: 'institutional', label: 'Institutional Ownership' },
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

  const chartGuide = useMemo(() => {
    const xLabel = dataKeyX === 'year' ? 'fiscal year' : dataKeyX === 'period' ? 'reporting period' : dataKeyX;
    const yLabel = unit === 'B'
      ? 'billions of USD'
      : unit === '%'
      ? 'percentage'
      : 'raw metric value';
    const seriesText = dataKeys.join(', ');
    return {
      xLabel,
      yLabel,
      seriesText,
    };
  }, [dataKeyX, unit, dataKeys]);

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
      <div className="mt-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
        <div><b>X-axis:</b> {chartGuide.xLabel}</div>
        <div><b>Y-axis:</b> {chartGuide.yLabel}</div>
        <div><b>Bars:</b> {chartGuide.seriesText}</div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, subtext, helpText, tone = 'neutral', theme }) {
  const toneStyles = tone === 'positive'
    ? { background: theme.positiveBg, borderColor: theme.positiveBorder, valueColor: theme.positive }
    : tone === 'negative'
    ? { background: theme.negativeBg, borderColor: theme.negativeBorder, valueColor: theme.negative }
    : tone === 'warning'
    ? { background: theme.warningBg, borderColor: theme.warningBorder, valueColor: theme.warningStrong || theme.warning }
    : { background: theme.bgCard, borderColor: theme.border, valueColor: theme.text };

  return (
    <div
      className="p-4 rounded-xl border transition-all duration-200 group"
      style={{ background: toneStyles.background, borderColor: toneStyles.borderColor }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.borderHover}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = toneStyles.borderColor}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="text-[10px] tracking-wider uppercase" style={{ color: theme.textTertiary }}>{label}</div>
        {helpText && (
          <span
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border text-[9px] font-bold cursor-help"
            style={{ color: theme.textTertiary, borderColor: theme.borderStrong, background: theme.bgElevated }}
            title={helpText}
            aria-label={helpText}
          >
            i
          </span>
        )}
      </div>
      <div className="text-base font-semibold" style={{ color: toneStyles.valueColor }}>{value}</div>
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

function OverviewTab({ data, theme }) {
  const [showReferences, setShowReferences] = useState(false);
  const subtleText = theme.textSecondary;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const safeRatio = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : 'N/A');
  const safeMoney = (value, digits = 2) => (Number.isFinite(value) ? `$${value.toFixed(digits)}` : 'N/A');
  const safePercent = (value, digits = 1) => (Number.isFinite(value) ? `${value.toFixed(digits)}%` : 'N/A');

  const currentPrice = data?.quote?.price || null;
  const currentPE = data?.valuationRatios?.current?.peRatio || data?.quote?.pe || null;
  const forwardPE = data?.valuationRatios?.other?.forwardPE || null;
  const forwardEarningsYield = Number.isFinite(forwardPE) && forwardPE > 0 ? (1 / forwardPE) : null;

  const latestIncome = (data?.income || [])[data?.income?.length - 1] || null;
  const latestCashflow = (data?.cashflow || [])[data?.cashflow?.length - 1] || null;
  const sharesOutstanding = data?.dcf?.assumptions?.sharesOutstanding || data?.favorites?.sharesOutstanding || null;
  const latestEPS = Number.isFinite(data?.valuationRatios?.historical?.[data?.valuationRatios?.historical?.length - 1]?.eps)
    ? data.valuationRatios.historical[data.valuationRatios.historical.length - 1].eps
    : (sharesOutstanding && Number.isFinite(latestIncome?.netIncome) ? latestIncome.netIncome / sharesOutstanding : null);
  const latestFcfPerShare = sharesOutstanding && Number.isFinite(latestCashflow?.freeCashFlow)
    ? latestCashflow.freeCashFlow / sharesOutstanding
    : null;

  const calcCagr = (series) => {
    const clean = (series || []).filter((v) => Number.isFinite(v) && v > 0);
    if (clean.length < 2) return null;
    const start = clean[0];
    const end = clean[clean.length - 1];
    const years = clean.length - 1;
    if (start <= 0 || end <= 0 || years <= 0) return null;
    return Math.pow(end / start, 1 / years) - 1;
  };

  const recentRevenueCagr = calcCagr((data?.income || []).slice(-5).map((r) => r?.revenue));
  const recentFcfCagr = calcCagr((data?.cashflow || []).slice(-5).map((r) => r?.freeCashFlow));
  const netMargin = Number.isFinite(latestIncome?.revenue) && latestIncome.revenue > 0 && Number.isFinite(latestIncome?.netIncome)
    ? latestIncome.netIncome / latestIncome.revenue
    : null;
  const roic = Number.isFinite(data?.favorites?.roic) ? data.favorites.roic : null;
  const debtToEbitda = Number.isFinite(data?.favorites?.debtToEbitda) ? data.favorites.debtToEbitda : null;

  const priceNarrative = (() => {
    if (!Number.isFinite(forwardPE)) return 'Forward earnings multiple unavailable; market expectations are not fully observable.';
    if (forwardPE >= 35) return 'At the current price, the market is valuing the company as a long-duration earnings grower rather than a mature business.';
    if (forwardPE >= 20) return 'At the current price, the market is pricing in continued growth with moderate durability expectations.';
    return 'At the current price, the market is valuing the company closer to a mature cash-generating profile than a long-duration grower.';
  })();

  const calcImpliedGrowth = ({ basePerShare, requiredReturn, years, terminalMultiple }) => {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
    if (!Number.isFinite(basePerShare) || basePerShare <= 0) return null;
    if (!Number.isFinite(requiredReturn) || !Number.isFinite(years) || years <= 0) return null;
    if (!Number.isFinite(terminalMultiple) || terminalMultiple <= 0) return null;
    const rhs = (currentPrice * Math.pow(1 + requiredReturn, years)) / (basePerShare * terminalMultiple);
    if (!Number.isFinite(rhs) || rhs <= 0) return null;
    const growth = Math.pow(rhs, 1 / years) - 1;
    return Number.isFinite(growth) ? growth : null;
  };

  const requiredReturns = [0.08, 0.1];
  const horizons = [5, 10];
  const terminalPE = Number.isFinite(currentPE) ? clamp(currentPE * 0.85, 10, 24) : 16;
  const currentPfcf = Number.isFinite(currentPrice) && Number.isFinite(latestFcfPerShare) && latestFcfPerShare > 0
    ? currentPrice / latestFcfPerShare
    : null;
  const terminalPfcf = Number.isFinite(currentPfcf) ? clamp(currentPfcf * 0.85, 8, 28) : 14;

  const impliedEpsRows = requiredReturns.map((requiredReturn) => ({
    requiredReturn,
    values: horizons.map((years) => ({
      years,
      growth: calcImpliedGrowth({ basePerShare: latestEPS, requiredReturn, years, terminalMultiple: terminalPE }),
    })),
  }));

  const impliedFcfRows = requiredReturns.map((requiredReturn) => ({
    requiredReturn,
    values: horizons.map((years) => ({
      years,
      growth: calcImpliedGrowth({ basePerShare: latestFcfPerShare, requiredReturn, years, terminalMultiple: terminalPfcf }),
    })),
  }));

  const impliedEpsAll = impliedEpsRows.flatMap((r) => r.values.map((v) => v.growth)).filter((v) => Number.isFinite(v));
  const impliedFcfAll = impliedFcfRows.flatMap((r) => r.values.map((v) => v.growth)).filter((v) => Number.isFinite(v));
  const impliedEpsMin = impliedEpsAll.length ? Math.min(...impliedEpsAll) : null;
  const impliedEpsMax = impliedEpsAll.length ? Math.max(...impliedEpsAll) : null;
  const impliedFcfMin = impliedFcfAll.length ? Math.min(...impliedFcfAll) : null;
  const impliedFcfMax = impliedFcfAll.length ? Math.max(...impliedFcfAll) : null;

  const impliedExpectationsText = (() => {
    if (!Number.isFinite(impliedEpsMin) || !Number.isFinite(impliedEpsMax)) {
      return 'To justify today\'s price, implied earnings growth cannot be estimated reliably with current inputs.';
    }
    return `To justify today’s price, earnings must grow approximately ${(impliedEpsMin * 100).toFixed(1)}% to ${(impliedEpsMax * 100).toFixed(1)}% per year over multi-year horizons under a reasonable return requirement.`;
  })();

  const calcQuarterlyTtmGrowth = (rows, valueKey) => {
    const clean = (rows || []).filter((r) => Number.isFinite(r?.[valueKey]));
    if (clean.length < 8) return null;
    const latest4 = clean.slice(-4).reduce((sum, r) => sum + r[valueKey], 0);
    const prev4 = clean.slice(-8, -4).reduce((sum, r) => sum + r[valueKey], 0);
    if (!Number.isFinite(prev4) || prev4 === 0) return null;
    return (latest4 - prev4) / Math.abs(prev4);
  };

  const annualEpsYoY = (() => {
    const epsSeries = (data?.valuationRatios?.historical || [])
      .map((h) => h?.eps)
      .filter((v) => Number.isFinite(v) && v > 0);
    if (epsSeries.length < 2) return null;
    const latest = epsSeries[epsSeries.length - 1];
    const prev = epsSeries[epsSeries.length - 2];
    if (!Number.isFinite(prev) || prev === 0) return null;
    return (latest - prev) / Math.abs(prev);
  })();

  const ttmEpsGrowth = Number.isFinite(data?.favorites?.epsGrowth)
    ? data.favorites.epsGrowth
    : annualEpsYoY;
  const eps5yCagr = calcCagr((data?.valuationRatios?.historical || []).map((h) => h?.eps));

  const ttmFcfGrowth = calcQuarterlyTtmGrowth(data?.cashflowQ, 'freeCashFlow') ?? (() => {
    const annualFcf = (data?.cashflow || [])
      .map((r) => r?.freeCashFlow)
      .filter((v) => Number.isFinite(v));
    if (annualFcf.length < 2) return null;
    const latest = annualFcf[annualFcf.length - 1];
    const prev = annualFcf[annualFcf.length - 2];
    if (!Number.isFinite(prev) || prev === 0) return null;
    return (latest - prev) / Math.abs(prev);
  })();
  const fcf5yCagr = recentFcfCagr;

  const baselineComparisonText = (() => {
    const impliedMid = Number.isFinite(impliedEpsMin) && Number.isFinite(impliedEpsMax)
      ? (impliedEpsMin + impliedEpsMax) / 2
      : null;
    if (!Number.isFinite(impliedMid) || !Number.isFinite(ttmEpsGrowth)) {
      return 'Current and implied growth are not fully comparable with available inputs.';
    }
    const diff = ttmEpsGrowth - impliedMid;
    if (diff > 0.06) {
      return 'Current earnings growth is meaningfully above what is implied by long-term valuation assumptions, suggesting deceleration is already assumed.';
    }
    if (diff < -0.06) {
      return 'Current earnings growth is below implied long-term levels, indicating the market is pricing acceleration.';
    }
    return 'Current earnings growth is broadly in line with what is implied by long-term valuation assumptions.';
  })();

  const realitySupportCount = [
    Number.isFinite(netMargin) && netMargin >= 0.12,
    Number.isFinite(roic) && roic >= 0.12,
    Number.isFinite(recentRevenueCagr) && recentRevenueCagr >= 0.08,
    Number.isFinite(recentFcfCagr) && recentFcfCagr >= 0.08,
    Number.isFinite(debtToEbitda) && debtToEbitda <= 2.5,
  ].filter(Boolean).length;

  const businessRealityInterpretation = (() => {
    if (realitySupportCount >= 4) {
      return 'Current profitability, capital efficiency, and balance-sheet posture broadly support elevated growth assumptions in the near to medium term.';
    }
    if (realitySupportCount >= 2) {
      return 'Current fundamentals are mixed: some drivers support elevated expectations, while others suggest less room for execution error.';
    }
    return 'Current fundamentals provide limited support for elevated long-duration growth assumptions; expectation risk is high if execution slips.';
  })();

  const growthSignals = [recentRevenueCagr, recentFcfCagr, data?.favorites?.epsGrowth]
    .filter((v) => Number.isFinite(v));
  const blendedGrowth = growthSignals.length
    ? clamp(growthSignals.reduce((sum, v) => sum + v, 0) / growthSignals.length, 0, 0.22)
    : 0.08;

  const calcScenarioValue = ({ growth, requiredReturn, years, terminalMultiple }) => {
    if (!Number.isFinite(latestFcfPerShare) || latestFcfPerShare <= 0) return null;
    let pv = 0;
    for (let t = 1; t <= years; t++) {
      const fcfT = latestFcfPerShare * Math.pow(1 + growth, t);
      pv += fcfT / Math.pow(1 + requiredReturn, t);
    }
    const terminalFcf = latestFcfPerShare * Math.pow(1 + growth, years);
    const terminalValue = terminalFcf * terminalMultiple;
    pv += terminalValue / Math.pow(1 + requiredReturn, years);
    return Number.isFinite(pv) ? pv : null;
  };

  const scenarioYears = 10;
  const scenarios = {
    stress: {
      label: 'Stress Case: Growth Fades Earlier',
      value: calcScenarioValue({
        growth: clamp(blendedGrowth - 0.05, -0.02, 0.10),
        requiredReturn: 0.12,
        years: scenarioYears,
        terminalMultiple: clamp(terminalPfcf - 2, 6, 24),
      }),
    },
    base: {
      label: 'Base Case: Growth Holds',
      value: calcScenarioValue({
        growth: clamp(blendedGrowth, 0.01, 0.18),
        requiredReturn: 0.10,
        years: scenarioYears,
        terminalMultiple: terminalPfcf,
      }),
    },
    expansion: {
      label: 'Expansion Case: Growth Lasts Longer',
      value: calcScenarioValue({
        growth: clamp(blendedGrowth + 0.04, 0.03, 0.24),
        requiredReturn: 0.08,
        years: scenarioYears,
        terminalMultiple: clamp(terminalPfcf + 2, 8, 30),
      }),
    },
  };

  const references = {
    dcfComposite: data?.dcf?.compositeValue ?? null,
    meanPeValue: data?.valuationRatios?.other?.meanPEValue ?? null,
    meanPsValue: data?.valuationRatios?.other?.meanPSValue ?? null,
    analystMeanTarget: (data?.dcf?.compositeMethods || []).find((m) => m.key === 'analystTargetValue')?.rawValue ?? null,
  };

  const summaryGrowth = calcImpliedGrowth({
    basePerShare: latestEPS,
    requiredReturn: 0.1,
    years: 10,
    terminalMultiple: terminalPE,
  });

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Section 1 - Market Price and Expectations</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetricCard theme={theme} label="Current Market Price" value={safeMoney(currentPrice)} />
          <MetricCard theme={theme} label="Forward Price-to-Earnings Ratio" value={safeRatio(forwardPE)} />
          <MetricCard theme={theme} label="Forward Earnings Yield" value={Number.isFinite(forwardEarningsYield) ? `${(forwardEarningsYield * 100).toFixed(2)}%` : 'N/A'} />
        </div>
        <div className="mt-4 text-xs leading-relaxed" style={{ color: subtleText }}>{priceNarrative}</div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Section 2 - What Must Be True</h3>
        <div className="text-xs mb-4" style={{ color: subtleText }}>{impliedExpectationsText}</div>

        <div className="text-[10px] mb-2" style={{ color: subtleText }}>Implied Earnings Per Share Growth</div>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: theme.tableBg }}>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Required Return</th>
                {horizons.map((years) => (
                  <th key={`eps-h-${years}`} className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                    {years}-Year Implied Earnings Per Share Compound Annual Growth Rate
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {impliedEpsRows.map((row) => (
                <tr key={`eps-r-${row.requiredReturn}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td className="px-3 py-3" style={{ color: theme.text }}>{(row.requiredReturn * 100).toFixed(0)}%</td>
                  {row.values.map((v) => (
                    <td key={`eps-v-${row.requiredReturn}-${v.years}`} className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>
                      {Number.isFinite(v.growth) ? `${(v.growth * 100).toFixed(1)}%` : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-[10px] mb-2" style={{ color: subtleText }}>Implied Free Cash Flow Growth</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: theme.tableBg }}>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Required Return</th>
                {horizons.map((years) => (
                  <th key={`fcf-h-${years}`} className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                    {years}-Year Implied Free Cash Flow Compound Annual Growth Rate
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {impliedFcfRows.map((row) => (
                <tr key={`fcf-r-${row.requiredReturn}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td className="px-3 py-3" style={{ color: theme.text }}>{(row.requiredReturn * 100).toFixed(0)}%</td>
                  {row.values.map((v) => (
                    <td key={`fcf-v-${row.requiredReturn}-${v.years}`} className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>
                      {Number.isFinite(v.growth) ? `${(v.growth * 100).toFixed(1)}%` : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 p-4 rounded-xl border" style={{ background: theme.bg, borderColor: theme.border }}>
          <div className="text-[10px] tracking-widest uppercase mb-3" style={{ color: theme.textSecondary }}>Where We Are Today (Baseline)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border" style={{ background: theme.bgCard, borderColor: theme.border }}>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: subtleText }}>Current Earnings Growth</div>
              <div className="text-xs leading-6" style={{ color: theme.text }}>
                • Trailing Twelve Month Earnings Per Share Growth (Year-over-Year): {Number.isFinite(ttmEpsGrowth) ? `${ttmEpsGrowth >= 0 ? '+' : ''}${(ttmEpsGrowth * 100).toFixed(1)}%` : 'N/A'}<br />
                • Five-Year Earnings Per Share Compound Annual Growth Rate: {Number.isFinite(eps5yCagr) ? `${eps5yCagr >= 0 ? '+' : ''}${(eps5yCagr * 100).toFixed(1)}%` : 'N/A'}
              </div>
            </div>
            <div className="p-3 rounded-lg border" style={{ background: theme.bgCard, borderColor: theme.border }}>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: subtleText }}>Current Free Cash Flow Growth</div>
              <div className="text-xs leading-6" style={{ color: theme.text }}>
                • Trailing Twelve Month Free Cash Flow Growth (Year-over-Year): {Number.isFinite(ttmFcfGrowth) ? `${ttmFcfGrowth >= 0 ? '+' : ''}${(ttmFcfGrowth * 100).toFixed(1)}%` : 'N/A'}<br />
                • Five-Year Free Cash Flow Compound Annual Growth Rate: {Number.isFinite(fcf5yCagr) ? `${fcf5yCagr >= 0 ? '+' : ''}${(fcf5yCagr * 100).toFixed(1)}%` : 'N/A'}
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs" style={{ color: subtleText }}>
            {baselineComparisonText}
          </div>
        </div>

        <div className="mt-4 p-4 rounded-xl border text-xs" style={{ background: theme.bg, borderColor: theme.border, color: subtleText }}>
          This valuation is sensitive to growth duration, not next quarter&apos;s results.
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Section 3 - Business Reality Check</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard theme={theme} label="Net Profit Margin" value={Number.isFinite(netMargin) ? `${(netMargin * 100).toFixed(2)}%` : 'N/A'} />
          <MetricCard theme={theme} label="Return on Invested Capital" value={Number.isFinite(roic) ? `${(roic * 100).toFixed(2)}%` : 'N/A'} />
          <MetricCard theme={theme} label="Recent Revenue Growth (5-Year Compound Annual Growth Rate)" value={Number.isFinite(recentRevenueCagr) ? `${(recentRevenueCagr * 100).toFixed(2)}%` : 'N/A'} />
          <MetricCard theme={theme} label="Recent Free Cash Flow Growth (5-Year Compound Annual Growth Rate)" value={Number.isFinite(recentFcfCagr) ? `${(recentFcfCagr * 100).toFixed(2)}%` : 'N/A'} />
          <MetricCard theme={theme} label="Debt to Earnings Before Interest, Taxes, Depreciation, and Amortization" value={safeRatio(debtToEbitda)} />
        </div>
        <div className="mt-4 text-xs leading-relaxed" style={{ color: subtleText }}>{businessRealityInterpretation}</div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Section 4 - Valuation Context (Multiples)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard theme={theme} label="Price-to-Earnings Ratio (Trailing Twelve Months)" value={safeRatio(currentPE)} />
          <MetricCard theme={theme} label="Forward Price-to-Earnings Ratio" value={safeRatio(forwardPE)} />
          <MetricCard theme={theme} label="Price-to-Free-Cash-Flow Ratio (Trailing Twelve Months)" value={safeRatio(currentPfcf)} />
          <MetricCard theme={theme} label="Forward Earnings Yield" value={Number.isFinite(forwardEarningsYield) ? `${(forwardEarningsYield * 100).toFixed(2)}%` : 'N/A'} />
        </div>
        <div className="mt-4 p-3 rounded-lg border text-[10px]" style={{ background: theme.bg, borderColor: theme.border, color: subtleText }}>
          Multiples reflect market expectations for future earnings growth and durability. High multiples are not inherently positive or negative.
        </div>
        <div className="mt-3 p-3 rounded-lg border text-[10px]" style={{ background: theme.bg, borderColor: theme.border, color: subtleText }}>
          <span className="mr-2 px-2 py-0.5 rounded-full border text-[9px] tracking-wider uppercase" style={{ borderColor: theme.border, color: subtleText }}>
            Heuristic
          </span>
          Price-to-Earnings-to-Growth Ratio: {safeRatio(data?.valuationRatios?.current?.pegRatio)} | Price-to-Sales-to-Growth Ratio: {safeRatio(data?.valuationRatios?.current?.psgRatio)}
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Section 5 - Scenario Sensitivity</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetricCard theme={theme} label={scenarios.base.label} value={safeMoney(scenarios.base.value)} />
          <MetricCard theme={theme} label={scenarios.stress.label} value={safeMoney(scenarios.stress.value)} />
          <MetricCard theme={theme} label={scenarios.expansion.label} value={safeMoney(scenarios.expansion.value)} />
        </div>
        <div className="mt-4 text-xs" style={{ color: subtleText }}>
          Returns deteriorate quickly if earnings growth fades within a few years or if terminal multiples compress.
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Section 6 - Model-Based References (Assumption-Sensitive)</h3>
          <button
            onClick={() => setShowReferences((v) => !v)}
            className="px-3 py-2 rounded-lg text-[10px] font-semibold tracking-wider border"
            style={{ color: theme.text, borderColor: theme.border, background: theme.bg }}
          >
            {showReferences ? 'HIDE REFERENCES' : 'SHOW REFERENCES'}
          </button>
        </div>

        {showReferences && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard theme={theme} label="Discounted Cash Flow Composite Output" value={safeMoney(references.dcfComposite)} />
            <MetricCard theme={theme} label="Historical Mean Price-to-Earnings Anchor" value={safeMoney(references.meanPeValue)} />
            <MetricCard theme={theme} label="Historical Mean Price-to-Sales Anchor" value={safeMoney(references.meanPsValue)} />
            <MetricCard theme={theme} label="Analyst Mean Target" value={safeMoney(references.analystMeanTarget)} />
          </div>
        )}
      </div>

      <div className="p-5 rounded-2xl border text-xs leading-relaxed" style={{ background: theme.bgCard, borderColor: theme.border, color: subtleText }}>
        At today&apos;s price, investors are assuming sustained high earnings growth over many years; returns will depend primarily on whether that growth persists.
      </div>
    </div>
  );
}
function ValuationTab({ data, theme }) {
  const [showLegacy, setShowLegacy] = useState(false);
  const safeRatio = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : 'N/A');
  const safeMoney = (value, digits = 2) => (Number.isFinite(value) ? `$${value.toFixed(digits)}` : 'N/A');
  const safePercent = (value, digits = 1) => (Number.isFinite(value) ? `${value.toFixed(digits)}%` : 'N/A');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const valuationSubtleText = theme.textSecondary;

  const sectorText = `${data?.profile?.sector || ''} ${data?.profile?.industry || ''}`.toLowerCase();
  const showPB = /(bank|insurance|reit|real estate|asset|utility|industrial|energy|materials|financial)/.test(sectorText);
  const currentPrice = data?.quote?.price || data?.dcf?.currentPrice || null;
  const sharesOutstanding = data?.dcf?.assumptions?.sharesOutstanding || data?.favorites?.sharesOutstanding || null;
  const [assumptionReturn, setAssumptionReturn] = useState(10);
  const [assumptionHorizon, setAssumptionHorizon] = useState(10);

  const historicalValuationRatios = data?.valuationRatios?.historical || [];
  const latestIncome = (data?.income || [])[data?.income?.length - 1] || {};
  const latestCashflow = (data?.cashflow || [])[data?.cashflow?.length - 1] || {};
  const latestEPS = Number.isFinite(historicalValuationRatios[historicalValuationRatios.length - 1]?.eps)
    ? historicalValuationRatios[historicalValuationRatios.length - 1].eps
    : (sharesOutstanding && latestIncome?.netIncome ? latestIncome.netIncome / sharesOutstanding : null);
  const latestFCFPerShare = sharesOutstanding && Number.isFinite(latestCashflow?.freeCashFlow)
    ? latestCashflow.freeCashFlow / sharesOutstanding
    : null;

  const blendedGrowth = (() => {
    const growthSignals = [
      Number.isFinite(data?.dcf?.assumptions?.revenueGrowth) ? data.dcf.assumptions.revenueGrowth / 100 : null,
      Number.isFinite(data?.dcf?.assumptions?.netIncomeGrowth) ? data.dcf.assumptions.netIncomeGrowth / 100 : null,
      Number.isFinite(data?.favorites?.epsGrowth) ? data.favorites.epsGrowth : null,
    ].filter((v) => Number.isFinite(v));
    if (!growthSignals.length) return 0.08;
    return clamp(growthSignals.reduce((sum, v) => sum + v, 0) / growthSignals.length, 0.0, 0.22);
  })();

  const currentPE = data?.valuationRatios?.current?.peRatio || data?.quote?.pe || null;
  const defaultTerminalPE = Number.isFinite(currentPE) ? clamp(currentPE * 0.85, 10, 24) : 16;
  const [assumptionTerminalPE, setAssumptionTerminalPE] = useState(defaultTerminalPE);

  useEffect(() => {
    setAssumptionTerminalPE(defaultTerminalPE);
  }, [defaultTerminalPE, data?.profile?.symbol]);

  const baseRequiredReturn = assumptionReturn / 100;
  const terminalPEBase = assumptionTerminalPE;
  const discountRates = Array.from(new Set([0.08, baseRequiredReturn, 0.12])).sort((a, b) => a - b);
  const fadeHorizons = Array.from(new Set([5, assumptionHorizon])).sort((a, b) => a - b);

  const scenarioByName = {
    stress: { growth: clamp(blendedGrowth - 0.05, -0.02, 0.12), requiredReturn: clamp(baseRequiredReturn + 0.02, 0.08, 0.16), terminalPE: clamp(terminalPEBase - 3, 8, 20) },
    base: { growth: clamp(blendedGrowth, 0.01, 0.18), requiredReturn: baseRequiredReturn, terminalPE: terminalPEBase },
    expansion: { growth: clamp(blendedGrowth + 0.05, 0.04, 0.26), requiredReturn: clamp(baseRequiredReturn - 0.02, 0.06, 0.12), terminalPE: clamp(terminalPEBase + 3, 12, 30) },
  };

  const calcTwoStageEarningsValue = ({ growth, requiredReturn, terminalPE, years = 7 }) => {
    if (!Number.isFinite(latestEPS) || latestEPS <= 0) return null;
    let pv = 0;
    for (let t = 1; t <= years; t++) {
      const epsT = latestEPS * Math.pow(1 + growth, t);
      pv += epsT / Math.pow(1 + requiredReturn, t);
    }
    const terminalEps = latestEPS * Math.pow(1 + growth, years);
    const terminalValue = terminalEps * terminalPE;
    pv += terminalValue / Math.pow(1 + requiredReturn, years);
    return Number.isFinite(pv) && pv > 0 ? pv : null;
  };

  const scenarioValues = {
    stress: calcTwoStageEarningsValue({ ...scenarioByName.stress, years: assumptionHorizon }),
    base: calcTwoStageEarningsValue({ ...scenarioByName.base, years: assumptionHorizon }),
    expansion: calcTwoStageEarningsValue({ ...scenarioByName.expansion, years: assumptionHorizon }),
  };

  const calcImpliedGrowth = ({ basePerShare, requiredReturn, years, terminalPE }) => {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
    if (!Number.isFinite(basePerShare) || basePerShare <= 0) return null;
    if (!Number.isFinite(requiredReturn) || !Number.isFinite(terminalPE) || terminalPE <= 0) return null;
    const rhs = (currentPrice * Math.pow(1 + requiredReturn, years)) / (basePerShare * terminalPE);
    if (!Number.isFinite(rhs) || rhs <= 0) return null;
    const g = Math.pow(rhs, 1 / years) - 1;
    return Number.isFinite(g) ? g : null;
  };

  const impliedRows = discountRates.map((r) => {
    const horizonValues = fadeHorizons.map((years) => {
      const growth = calcImpliedGrowth({ basePerShare: latestEPS, requiredReturn: r, years, terminalPE: terminalPEBase });
      return { years, growth };
    });
    return { requiredReturn: r, horizonValues };
  });

  const impliedSummary = (() => {
    const baseCase = calcImpliedGrowth({
      basePerShare: latestEPS,
      requiredReturn: scenarioByName.base.requiredReturn,
      years: assumptionHorizon,
      terminalPE: scenarioByName.base.terminalPE,
    });
    if (!Number.isFinite(baseCase)) return 'Implied growth unavailable with current EPS inputs.';
    return `At today’s price, market implies about ${(baseCase * 100).toFixed(1)}% EPS CAGR for ${assumptionHorizon} years at a ${assumptionReturn.toFixed(1)}% required return.`;
  })();

  const fcfYield = Number.isFinite(latestFCFPerShare) && Number.isFinite(currentPrice) && currentPrice > 0
    ? latestFCFPerShare / currentPrice
    : null;
  const pfcfTtm = Number.isFinite(fcfYield) && fcfYield > 0 ? 1 / fcfYield : null;
  const avgFcf3y = (() => {
    if (!sharesOutstanding) return null;
    const vals = (data?.cashflow || [])
      .slice(-3)
      .map((r) => (Number.isFinite(r?.freeCashFlow) ? r.freeCashFlow : null))
      .filter((v) => Number.isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  })();
  const fcfPerShare3y = Number.isFinite(avgFcf3y) && sharesOutstanding > 0 ? avgFcf3y / sharesOutstanding : null;
  const pfcf3y = Number.isFinite(currentPrice) && Number.isFinite(fcfPerShare3y) && fcfPerShare3y > 0 ? currentPrice / fcfPerShare3y : null;
  const currentEarningsYield = Number.isFinite(currentPE) && currentPE > 0 ? 1 / currentPE : null;
  const forwardPE = data?.valuationRatios?.other?.forwardPE ?? null;
  const forwardEarningsYield = Number.isFinite(forwardPE) && forwardPE > 0 ? 1 / forwardPE : null;
  const currentPeg = data?.valuationRatios?.current?.pegRatio ?? null;
  const currentPsg = data?.valuationRatios?.current?.psgRatio ?? null;
  const growthNeededForReturn10 = Number.isFinite(fcfYield) ? Math.max(0, 0.1 - fcfYield) : null;
  const growthNeededForReturn12 = Number.isFinite(fcfYield) ? Math.max(0, 0.12 - fcfYield) : null;

  const terminalPfcfBase = clamp(terminalPEBase * 0.85, 8, 28);
  const impliedFcfRows = discountRates.map((r) => {
    const horizonValues = fadeHorizons.map((years) => {
      const growth = calcImpliedGrowth({ basePerShare: latestFCFPerShare, requiredReturn: r, years, terminalPE: terminalPfcfBase });
      return { years, growth };
    });
    return { requiredReturn: r, horizonValues };
  });

  const calcTwoStageFcfValue = ({ growth, requiredReturn, terminalPfcf, years = 7 }) => {
    if (!Number.isFinite(latestFCFPerShare) || latestFCFPerShare <= 0) return null;
    let pv = 0;
    for (let t = 1; t <= years; t++) {
      const fcfT = latestFCFPerShare * Math.pow(1 + growth, t);
      pv += fcfT / Math.pow(1 + requiredReturn, t);
    }
    const terminalFcf = latestFCFPerShare * Math.pow(1 + growth, years);
    const terminalValue = terminalFcf * terminalPfcf;
    pv += terminalValue / Math.pow(1 + requiredReturn, years);
    return Number.isFinite(pv) && pv > 0 ? pv : null;
  };

  const dcfScenarioValues = {
    stress: calcTwoStageFcfValue({
      growth: clamp(scenarioByName.stress.growth - 0.01, -0.03, 0.10),
      requiredReturn: scenarioByName.stress.requiredReturn,
      terminalPfcf: clamp(terminalPfcfBase - 2, 6, 24),
      years: assumptionHorizon,
    }),
    base: calcTwoStageFcfValue({
      growth: clamp(scenarioByName.base.growth, 0, 0.18),
      requiredReturn: scenarioByName.base.requiredReturn,
      terminalPfcf: terminalPfcfBase,
      years: assumptionHorizon,
    }),
    expansion: calcTwoStageFcfValue({
      growth: clamp(scenarioByName.expansion.growth + 0.01, 0.02, 0.24),
      requiredReturn: scenarioByName.expansion.requiredReturn,
      terminalPfcf: clamp(terminalPfcfBase + 2, 8, 30),
      years: assumptionHorizon,
    }),
  };

  const justifiedPeRange = {
    stress: Number.isFinite(scenarioValues.stress) && Number.isFinite(latestEPS) && latestEPS > 0 ? scenarioValues.stress / latestEPS : null,
    base: Number.isFinite(scenarioValues.base) && Number.isFinite(latestEPS) && latestEPS > 0 ? scenarioValues.base / latestEPS : null,
    expansion: Number.isFinite(scenarioValues.expansion) && Number.isFinite(latestEPS) && latestEPS > 0 ? scenarioValues.expansion / latestEPS : null,
  };

  const shareholderYield = Number.isFinite(data?.favorites?.dividendYield) ? data.favorites.dividendYield : 0;
  const returnDecomposition = Object.entries(scenarioByName).map(([key, s]) => {
    const multipleEffect = Number.isFinite(currentPE) && currentPE > 0
      ? Math.pow(s.terminalPE / currentPE, 1 / assumptionHorizon) - 1
      : 0;
    const expectedReturn = s.growth + shareholderYield + multipleEffect;
    return {
      key,
      growth: s.growth,
      shareholderYield,
      multipleEffect,
      expectedReturn,
    };
  });

  const meanPeAnchor = data?.valuationRatios?.other?.meanPEValue ?? null;
  const meanPsAnchor = data?.valuationRatios?.other?.meanPSValue ?? null;
  const meanPbAnchor = data?.valuationRatios?.other?.meanPBValue ?? null;
  const analystTarget = (data?.dcf?.compositeMethods || []).find((m) => m.key === 'analystTargetValue')?.rawValue || null;

  const shortMethodNameByKey = {
    dcf20Year: 'DCF 20Y (Cash Flow)',
    dfcf20Year: 'DFCF 20Y (Free Cash Flow)',
    dni20Year: 'DNI 20Y (Net Income)',
    dfcfTerminal: 'DFCF Terminal',
    meanPSValue: 'Mean PS Value',
    meanPEValue: 'Mean PE Value (ex-NRI)',
    meanPBValue: 'Mean PB Value',
    dcfOperatingCashFlow: 'DCF (Unlevered FCF)',
    dcfTerminal: 'DCF Terminal (15x FCF)',
    fairValuePS: 'Fair Value PS',
    fairValuePE: 'Fair Value PE',
    fairValuePB: 'Fair Value PB',
    earningsPowerValue: 'Earnings Power Value',
    grahamNumber: 'Graham Number',
    analystTargetValue: 'Analyst Target',
  };

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
    analystTargetValue: 'analyst',
    earningsPowerValue: 'conservative',
    grahamNumber: 'conservative',
  };

  const methodColorByType = {
    dcf: '#f59e0b',
    relative: '#f97316',
    analyst: '#22c55e',
    conservative: '#64748b',
  };

  const valuationMethodsForChart = (data?.dcf?.compositeMethods || [])
    .map((entry) => ({
      key: entry.key,
      name: shortMethodNameByKey[entry.key] || entry.label,
      fullLabel: entry.label,
      plotValue: entry.boundedValue ?? entry.value,
      rawValue: entry.rawValue,
      value: entry.value,
      weight: entry.weight,
      dynamicWeight: entry.dynamicWeight,
      type: methodTypeByKey[entry.key] || 'relative',
      calibrationFactor: entry.calibrationFactor,
    }))
    .filter((entry) =>
      Number.isFinite(entry.plotValue) &&
      entry.plotValue > 0 &&
      entry.key !== 'pegValue' &&
      entry.key !== 'psgValue'
    );

  const dcfRangeLow = Number.isFinite(dcfScenarioValues.stress) ? dcfScenarioValues.stress : dcfScenarioValues.base;
  const dcfRangeHigh = Number.isFinite(dcfScenarioValues.expansion) ? dcfScenarioValues.expansion : dcfScenarioValues.base;
  const dcfRangeUpside = Number.isFinite(currentPrice) && Number.isFinite(dcfScenarioValues.base)
    ? ((dcfScenarioValues.base - currentPrice) / currentPrice) * 100
    : null;
  const synthesisGrowth5y = calcImpliedGrowth({
    basePerShare: latestEPS,
    requiredReturn: baseRequiredReturn,
    years: 5,
    terminalPE: terminalPEBase,
  });
  const synthesisGrowth10y = calcImpliedGrowth({
    basePerShare: latestEPS,
    requiredReturn: baseRequiredReturn,
    years: 10,
    terminalPE: terminalPEBase,
  });

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-valuation" aria-labelledby="tab-valuation">
      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSecondary }}>Valuation Assumptions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-xs" style={{ color: valuationSubtleText }}>
            Required Return
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min="6"
                max="16"
                step="0.5"
                value={assumptionReturn}
                onChange={(e) => setAssumptionReturn(Number(e.target.value))}
                className="w-full"
              />
              <span className="min-w-[52px] text-right font-semibold" style={{ color: theme.text }}>{assumptionReturn.toFixed(1)}%</span>
            </div>
          </label>
          <label className="text-xs" style={{ color: valuationSubtleText }}>
            Horizon
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min="3"
                max="12"
                step="1"
                value={assumptionHorizon}
                onChange={(e) => setAssumptionHorizon(Number(e.target.value))}
                className="w-full"
              />
              <span className="min-w-[52px] text-right font-semibold" style={{ color: theme.text }}>{assumptionHorizon}Y</span>
            </div>
          </label>
          <label className="text-xs" style={{ color: valuationSubtleText }}>
            Terminal Price-to-Earnings Multiple
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min="8"
                max="35"
                step="0.5"
                value={assumptionTerminalPE}
                onChange={(e) => setAssumptionTerminalPE(Number(e.target.value))}
                className="w-full"
              />
              <span className="min-w-[52px] text-right font-semibold" style={{ color: theme.text }}>{assumptionTerminalPE.toFixed(1)}x</span>
            </div>
          </label>
        </div>
        <div className="mt-3 text-[10px]" style={{ color: valuationSubtleText }}>
          Terminal multiple captures long-term business quality after growth fades; small changes materially affect valuation.
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: theme.textSecondary }}>Section 1 - Is Today&apos;s Price Sensible?</h3>
        <div className="text-xs mb-4" style={{ color: valuationSubtleText }}>{impliedSummary}</div>
        <div className="text-[10px] mb-2" style={{ color: valuationSubtleText }}>Reverse Price-to-Earnings (Implied Earnings Per Share Growth)</div>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: theme.tableBg }}>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Required Return</th>
                {fadeHorizons.map((h) => (
                  <th key={`head-${h}`} className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                    Implied Earnings Per Share Compound Annual Growth Rate ({h} Years)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {impliedRows.map((row) => (
                <tr key={row.requiredReturn} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td className="px-3 py-3" style={{ color: theme.text }}>{(row.requiredReturn * 100).toFixed(0)}%</td>
                  {row.horizonValues.map((h) => (
                    <td key={`${row.requiredReturn}-${h.years}`} className="px-3 py-3 text-right" style={{ color: Number.isFinite(h.growth) && h.growth <= 0.12 ? theme.positive : theme.warning }}>
                      {Number.isFinite(h.growth) ? `${(h.growth * 100).toFixed(1)}%` : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[10px]" style={{ color: valuationSubtleText }}>
          Model assumptions: terminal Price-to-Earnings ratio {terminalPEBase.toFixed(1)}, earnings per share base {safeMoney(latestEPS)}.
        </div>
        <div className="mt-2 text-[10px]" style={{ color: valuationSubtleText }}>
          Implied growth reflects current earnings normalization and margin expansion; not all of this growth must come from revenue.
        </div>

        <div className="text-[10px] mt-4 mb-2" style={{ color: valuationSubtleText }}>Reverse Price-to-Free-Cash-Flow (Implied Cash Growth)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: theme.tableBg }}>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Required Return</th>
                {fadeHorizons.map((h) => (
                  <th key={`fcf-head-${h}`} className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                    Implied Free Cash Flow Compound Annual Growth Rate ({h} Years)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {impliedFcfRows.map((row) => (
                <tr key={`fcf-${row.requiredReturn}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td className="px-3 py-3" style={{ color: theme.text }}>{(row.requiredReturn * 100).toFixed(0)}%</td>
                  {row.horizonValues.map((h) => (
                    <td key={`fcf-${row.requiredReturn}-${h.years}`} className="px-3 py-3 text-right" style={{ color: Number.isFinite(h.growth) && h.growth <= 0.12 ? theme.positive : theme.warning }}>
                      {Number.isFinite(h.growth) ? `${(h.growth * 100).toFixed(1)}%` : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[10px]" style={{ color: valuationSubtleText }}>
          Cash model assumptions: terminal Price-to-Free-Cash-Flow ratio {terminalPfcfBase.toFixed(1)}x, free cash flow per share base {safeMoney(latestFCFPerShare)}.
        </div>

        <div className="text-[10px] mt-4 mb-2" style={{ color: valuationSubtleText }}>Return Decomposition (Approximate)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: theme.tableBg }}>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Scenario</th>
                <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Earnings Per Share Growth</th>
                <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Dividend Yield and Buyback Yield Proxy</th>
                <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Valuation Multiple Effect</th>
                <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Expected Return</th>
              </tr>
            </thead>
            <tbody>
              {returnDecomposition.map((row) => (
                <tr key={`decomp-${row.key}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td className="px-3 py-3 capitalize" style={{ color: theme.text }}>{row.key}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{safePercent(row.growth * 100)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{safePercent(row.shareholderYield * 100)}</td>
                  <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{safePercent(row.multipleEffect * 100)}</td>
                  <td className="px-3 py-3 text-right font-semibold" style={{ color: row.expectedReturn >= 0 ? theme.positive : theme.negative }}>{safePercent(row.expectedReturn * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: valuationSubtleText }}>Section 2 - Cashflow Scenarios (Growth and Duration Sensitivity)</div>
              <div className="text-xl font-bold" style={{ color: theme.text }}>
                {safeMoney(dcfRangeLow)} - {safeMoney(dcfRangeHigh)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest" style={{ color: valuationSubtleText }}>Base Scenario</div>
              <div className="text-xl font-bold" style={{ color: Number.isFinite(dcfRangeUpside) && dcfRangeUpside >= 0 ? theme.positive : theme.negative }}>
                {safeMoney(dcfScenarioValues.base)}
              </div>
              <div className="text-xs" style={{ color: Number.isFinite(dcfRangeUpside) && dcfRangeUpside >= 0 ? theme.positive : theme.negative }}>
                {Number.isFinite(dcfRangeUpside) ? `${dcfRangeUpside >= 0 ? '+' : ''}${dcfRangeUpside.toFixed(1)}% vs current` : 'N/A vs current'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {[
              { label: 'Stress', key: 'stress' },
              { label: 'Base', key: 'base' },
              { label: 'Expansion', key: 'expansion' },
            ].map((s) => (
              <div key={s.key} className="p-3 rounded-xl border" style={{ background: theme.bg, borderColor: theme.border }}>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: valuationSubtleText }}>{s.label}</div>
                <div className="text-base font-semibold mb-1" style={{ color: theme.text }}>{safeMoney(dcfScenarioValues[s.key])}</div>
                <div className="text-[10px]" style={{ color: valuationSubtleText }}>
                  Growth Rate={safePercent(scenarioByName[s.key].growth * 100)} | Required Return={safePercent(scenarioByName[s.key].requiredReturn * 100)} | Terminal Price-to-Free-Cash-Flow Ratio={(s.key === 'stress' ? clamp(terminalPfcfBase - 2, 6, 24) : s.key === 'expansion' ? clamp(terminalPfcfBase + 2, 8, 30) : terminalPfcfBase).toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: theme.textSecondary }}>Synthesis</div>
        <div className="text-xs leading-relaxed" style={{ color: valuationSubtleText }}>
          At {safeMoney(currentPrice)}, the market implies about {Number.isFinite(synthesisGrowth5y) ? `${(synthesisGrowth5y * 100).toFixed(1)}%` : 'N/A'} to {Number.isFinite(synthesisGrowth10y) ? `${(synthesisGrowth10y * 100).toFixed(1)}%` : 'N/A'} earnings per share compound annual growth rate (5 years to 10 years) at {assumptionReturn.toFixed(1)}% required return. Scenario outcomes stay acceptable only if elevated growth persists through the selected horizon; returns deteriorate quickly if growth fades within 3-4 years or if terminal valuation multiples compress materially.
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Section 3 - Multiples Dashboard (Context)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard theme={theme} label="Price-to-Earnings Ratio (Trailing Twelve Months)" value={safeRatio(currentPE)} />
          <MetricCard theme={theme} label="Earnings Yield (Earnings-to-Price)" value={Number.isFinite(currentEarningsYield) ? `${(currentEarningsYield * 100).toFixed(2)}%` : 'N/A'} />
          <MetricCard theme={theme} label="Forward Price-to-Earnings Ratio" value={safeRatio(forwardPE)} />
          <MetricCard theme={theme} label="Forward Earnings Yield" value={Number.isFinite(forwardEarningsYield) ? `${(forwardEarningsYield * 100).toFixed(2)}%` : 'N/A'} />
          <MetricCard theme={theme} label="Price-to-Free-Cash-Flow Ratio (Trailing Twelve Months)" value={safeRatio(pfcfTtm)} />
          <MetricCard theme={theme} label="Price-to-Free-Cash-Flow Ratio (Three-Year Average Free Cash Flow)" value={safeRatio(pfcf3y)} />
          <MetricCard theme={theme} label="Free Cash Flow Yield (Trailing Twelve Months)" value={Number.isFinite(fcfYield) ? `${(fcfYield * 100).toFixed(2)}%` : 'N/A'} />
          <MetricCard theme={theme} label="Growth Needed (10% and 12% Return Targets)" value={`${Number.isFinite(growthNeededForReturn10) ? `${(growthNeededForReturn10 * 100).toFixed(1)}%` : 'N/A'} / ${Number.isFinite(growthNeededForReturn12) ? `${(growthNeededForReturn12 * 100).toFixed(1)}%` : 'N/A'}`} />
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetricCard theme={theme} label="Justified Price-to-Earnings Ratio (Stress)" value={safeRatio(justifiedPeRange.stress)} />
          <MetricCard theme={theme} label="Justified Price-to-Earnings Ratio (Base)" value={safeRatio(justifiedPeRange.base)} />
          <MetricCard theme={theme} label="Justified Price-to-Earnings Ratio (Expansion)" value={safeRatio(justifiedPeRange.expansion)} />
        </div>
        <div className="mt-4 p-3 rounded-lg border text-[10px]" style={{ background: theme.bg, borderColor: theme.border, color: valuationSubtleText }}>
          <span className="mr-2 px-2 py-0.5 rounded-full border text-[9px] tracking-wider uppercase" style={{ borderColor: theme.border, color: valuationSubtleText }}>
            Heuristic
          </span>
          Price-to-Earnings-to-Growth Ratio and Price-to-Sales-to-Growth Ratio can break when growth exceeds ~30-40% or margins/base earnings are shifting.
          <span className="ml-2" style={{ color: valuationSubtleText }}>Price-to-Earnings-to-Growth Ratio {safeRatio(currentPeg)} | Price-to-Sales-to-Growth Ratio {safeRatio(currentPsg)}</span>
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Section 4 - Market Context</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <MetricCard theme={theme} label="Historical Mean Price-to-Earnings Value" value={safeMoney(meanPeAnchor)} />
          <MetricCard theme={theme} label="Historical Mean Price-to-Sales Value" value={safeMoney(meanPsAnchor)} />
          {showPB ? (
            <MetricCard theme={theme} label="Historical Mean Price-to-Book Value" value={safeMoney(meanPbAnchor)} />
          ) : (
            <MetricCard theme={theme} label="Price-to-Book Ratio Usage" value="Hidden (non-asset-heavy sector)" />
          )}
          <MetricCard theme={theme} label="Analyst Mean Target" value={safeMoney(analystTarget)} />
        </div>
        <div className="mt-3 text-[10px]" style={{ color: valuationSubtleText }}>
          Historical multiples and analyst targets are context anchors, not intrinsic truth.
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>[!] Legacy / Advanced</h3>
            <div className="text-[10px] mt-1" style={{ color: valuationSubtleText }}>
              Composite (Legacy) blends DCF + historical anchors + analyst target. Assumption-sensitive.
            </div>
          </div>
          <button
            onClick={() => setShowLegacy((v) => !v)}
            className="px-3 py-2 rounded-lg text-[10px] font-semibold tracking-wider border"
            style={{ color: theme.text, borderColor: theme.border, background: theme.bg }}
          >
            {showLegacy ? 'HIDE LEGACY' : 'SHOW LEGACY'}
          </button>
        </div>

        {showLegacy && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="text-[10px] tracking-wider uppercase" style={{ color: theme.textTertiary }}>Composite Output (Assumption-sensitive)</div>
                <div className="text-2xl font-bold" style={{ color: data?.dcf?.upside >= 0 ? theme.positive : theme.negative }}>
                  {safeMoney(data?.dcf?.compositeValue)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] tracking-wider uppercase" style={{ color: theme.textTertiary }}>Current</div>
                <div className="text-xl font-semibold" style={{ color: theme.text }}>{safeMoney(data?.dcf?.currentPrice)}</div>
              </div>
            </div>

            {valuationMethodsForChart.length > 0 && (
              <ResponsiveContainer width="100%" height={420}>
                <BarChart layout="vertical" data={valuationMethodsForChart} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
                  <XAxis
                    type="number"
                    domain={[0, (dataMax) => (Number.isFinite(dataMax) ? Math.ceil(dataMax * 1.15) : 100)]}
                    tick={{ fontSize: 10, fill: theme.textTertiary }}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                    axisLine={{ stroke: theme.chartGrid }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 12, fill: theme.textSecondary }}
                    width={210}
                    axisLine={{ stroke: theme.chartGrid }}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [`$${value?.toFixed(2)}`, 'Model Value']}
                    contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
                    cursor={{ fill: theme.cursorFill }}
                  />
                  <ReferenceLine
                    x={data?.dcf?.currentPrice}
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    label={{ value: `Current: $${data?.dcf?.currentPrice?.toFixed(2) || '-'}`, position: 'top', fontSize: 10, fill: '#ef4444' }}
                  />
                  <ReferenceLine
                    x={data?.dcf?.compositeValue}
                    stroke="#10b981"
                    strokeWidth={2}
                    label={{ value: `Composite: $${data?.dcf?.compositeValue?.toFixed(2) || '-'}`, position: 'top', fontSize: 10, fill: '#10b981' }}
                  />
                  <Bar dataKey="plotValue" radius={[0, 4, 4, 0]}>
                    {valuationMethodsForChart.map((entry, index) => (
                      <Cell key={`legacy-cell-${index}`} fill={methodColorByType[entry.type] || methodColorByType.relative} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            <div className="p-4 rounded-xl text-[10px] border" style={{ background: theme.bg, borderColor: theme.border, color: theme.textTertiary }}>
              <span style={{ color: theme.textSecondary }}>Assumptions:</span> Discount Rate: {safePercent(data?.dcf?.discountRate)} | Terminal Growth: {safePercent(data?.dcf?.terminalGrowth)} | Composite Source: {data?.dcf?.compositeSource || 'core'}
            </div>
          </div>
        )}
      </div>

      {historicalValuationRatios.length > 0 && (
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h3 className="text-xs font-semibold mb-5 tracking-widest uppercase" style={{ color: theme.textSecondary }}>Valuation Ratio History (Core Only)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: theme.tableBg }}>
                  <th className="px-3 py-3 text-left font-semibold sticky left-0" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, background: theme.tableBg }}>Metric</th>
                  {historicalValuationRatios.map((h) => (
                    <th key={h.year} className="px-3 py-3 text-right font-medium min-w-[60px]" style={{ color: theme.textTertiary, borderBottom: `1px solid ${theme.border}` }}>{h.year}</th>
                  ))}
                  <th className="px-3 py-3 text-right font-semibold min-w-[70px]" style={{ color: theme.accent, borderBottom: `1px solid ${theme.border}`, background: theme.accent + '0d' }}>Current</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[70px]" style={{ color: theme.accentAlt, borderBottom: `1px solid ${theme.border}`, background: theme.accentAlt + '0d' }}>10Y Avg</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Price to Earnings (P/E) Ratio', key: 'peRatio' },
                  { label: 'Price to Sales (P/S) Ratio', key: 'psRatio' },
                  ...(showPB ? [{ label: 'Price to Book (P/B) Ratio', key: 'pbRatio' }] : []),
                ].map(({ label, key }) => (
                  <tr key={key} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td className="px-3 py-3 font-medium sticky left-0" style={{ color: theme.text, background: theme.stickyBg }}>{label}</td>
                    {historicalValuationRatios.map((h) => (
                      <td key={`${h.year}-${key}`} className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{Number.isFinite(h[key]) ? h[key].toFixed(2) : '-'}</td>
                    ))}
                    <td className="px-3 py-3 text-right font-semibold" style={{ color: theme.accent, background: theme.accent + '0d' }}>{Number.isFinite(data?.valuationRatios?.current?.[key]) ? data.valuationRatios.current[key].toFixed(2) : '-'}</td>
                    <td className="px-3 py-3 text-right font-semibold" style={{ color: theme.accentAlt, background: theme.accentAlt + '0d' }}>{Number.isFinite(data?.valuationRatios?.tenYearAvg?.[key]) ? data.valuationRatios.tenYearAvg[key].toFixed(2) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="p-5 rounded-2xl border text-[10px] leading-relaxed" style={{ background: theme.warningBg, borderColor: theme.warningBorder, color: theme.warningText }}>
        <span className="font-semibold" style={{ color: theme.warningStrong }}>Transparency:</span> Core valuation now prioritizes reverse valuation, EPV floor, and 2-stage fundamentals scenarios.
        Legacy composite methods remain available under the Legacy section and are intentionally labeled assumption-sensitive.
      </div>
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
    rowFromSeries(
      'Debt Servicing Ratio',
      getMetricSeries(({ cf, bal }) => (bal?.totalDebt > 0 && Number.isFinite(cf?.operatingCashFlow) ? pct(cf.operatingCashFlow / bal.totalDebt) : null))
    ),
    rowFromSeries(
      'Interest Coverage',
      getMetricSeries(({ inc }) => (Math.abs(inc?.interestExpense || 0) > 0 && Number.isFinite(inc?.operatingIncome) ? ratio(inc.operatingIncome / Math.abs(inc.interestExpense)) : null)),
      'ratio'
    ),
    rowFromSeries(
      'Total Debt / EBITDA',
      getMetricSeries(({ inc, bal }) => {
        const ebitda = (inc?.operatingIncome || 0) + (inc?.depreciation || 0);
        return ebitda > 0 && Number.isFinite(bal?.totalDebt) ? ratio((bal.totalDebt || 0) / ebitda) : null;
      }),
      'ratio'
    ),
  ];

  const efficiencyRows = [
    rowFromSeries(
      'Fixed Asset Turnover',
      getMetricSeries(({ inc, bal }) => {
        const ppe = Number.isFinite(bal?.netPPE) && bal.netPPE > 0
          ? bal.netPPE
          : Number.isFinite(bal?.totalAssets) && Number.isFinite(bal?.currentAssets) && (bal.totalAssets - bal.currentAssets) > 0
          ? (bal.totalAssets - bal.currentAssets)
          : null;
        return ppe && Number.isFinite(inc?.revenue) && inc.revenue > 0 ? ratio(inc.revenue / ppe) : null;
      }),
      'ratio'
    ),
    rowFromSeries(
      'Days of Payables Outstanding',
      getMetricSeries(({ inc, bal, rat }) => {
        const cogs = Number.isFinite(inc?.costOfRevenue) && inc.costOfRevenue > 0
          ? inc.costOfRevenue
          : Number.isFinite(inc?.revenue) && Number.isFinite(rat?.grossProfitMargin)
          ? inc.revenue * (1 - rat.grossProfitMargin)
          : null;
        return bal?.accountsPayable > 0 && Number.isFinite(cogs) && cogs > 0 ? ratio((bal.accountsPayable / cogs) * 365) : null;
      }),
      'ratio'
    ),
    rowFromSeries(
      'Inventory Turnover',
      getMetricSeries(({ inc, bal, rat }) => {
        const cogs = Number.isFinite(inc?.costOfRevenue) && inc.costOfRevenue > 0
          ? inc.costOfRevenue
          : Number.isFinite(inc?.revenue) && Number.isFinite(rat?.grossProfitMargin)
          ? inc.revenue * (1 - rat.grossProfitMargin)
          : null;
        return bal?.inventory > 0 && Number.isFinite(cogs) && cogs > 0 ? ratio(cogs / bal.inventory) : null;
      }),
      'ratio'
    ),
    rowFromSeries(
      'Receivables Turnover',
      getMetricSeries(({ inc, bal }) => (bal?.accountsReceivable > 0 && Number.isFinite(inc?.revenue) && inc.revenue > 0 ? ratio(inc.revenue / bal.accountsReceivable) : null)),
      'ratio'
    ),
    rowFromSeries('Asset Turnover Ratio', getMetricSeries(({ inc, bal }) => (bal?.totalAssets ? ratio(inc?.revenue / bal.totalAssets) : null)), 'ratio'),
    rowFromSeries(
      'Cash Conversion Cycle',
      getMetricSeries(({ inc, bal, rat }) => {
        const cogs = Number.isFinite(inc?.costOfRevenue) && inc.costOfRevenue > 0
          ? inc.costOfRevenue
          : Number.isFinite(inc?.revenue) && Number.isFinite(rat?.grossProfitMargin)
          ? inc.revenue * (1 - rat.grossProfitMargin)
          : null;
        if (!Number.isFinite(cogs) || cogs <= 0) return null;
        const dpo = bal?.accountsPayable > 0 ? (bal.accountsPayable / cogs) * 365 : null;
        const dio = bal?.inventory > 0 ? (bal.inventory / cogs) * 365 : null;
        const dso = bal?.accountsReceivable > 0 && Number.isFinite(inc?.revenue) && inc.revenue > 0
          ? (bal.accountsReceivable / inc.revenue) * 365
          : null;
        if (![dpo, dio, dso].every((v) => Number.isFinite(v))) return null;
        return ratio(dio + dso - dpo);
      }),
      'ratio'
    ),
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
  const sixMonthTransactions = useMemo(
    () => {
      const cutoff = Date.now() - (183 * 24 * 60 * 60 * 1000);
      return transactions.filter((tx) => Number.isFinite(tx?.epochMs) && tx.epochMs >= cutoff);
    },
    [transactions]
  );

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
  const formatMoneyCompact = (num) => {
    if (num === null || num === undefined || !Number.isFinite(num)) return 'N/A';
    if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return `${num.toFixed(0)}`;
  };

  const sells = sixMonthTransactions.filter((tx) => tx.side === 'SELL');
  const buys = sixMonthTransactions.filter((tx) => tx.side === 'BUY');

  const sellShares = sells.reduce((sum, tx) => sum + (tx.shares || 0), 0);
  const buyShares = buys.reduce((sum, tx) => sum + (tx.shares || 0), 0);
  const sellValue = sells.reduce((sum, tx) => sum + (tx.value || 0), 0);
  const buyValue = buys.reduce((sum, tx) => sum + (tx.value || 0), 0);
  const netValue = buyValue - sellValue;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  monthStart.setUTCMonth(monthStart.getUTCMonth() - 5);
  const monthKeys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    return { key, label };
  });
  const monthlyMap = new Map(monthKeys.map((m) => [m.key, { label: m.label, buyValue: 0, sellValue: 0, buyCount: 0, sellCount: 0 }]));
  for (const tx of sixMonthTransactions) {
    const d = new Date(tx.epochMs);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = monthlyMap.get(key);
    if (!bucket) continue;
    if (tx.side === 'BUY') {
      bucket.buyValue += tx.value || 0;
      bucket.buyCount += 1;
    } else if (tx.side === 'SELL') {
      bucket.sellValue += tx.value || 0;
      bucket.sellCount += 1;
    }
  }
  const monthlyFlow = Array.from(monthlyMap.values()).map((m) => ({
    ...m,
    netValue: m.buyValue - m.sellValue,
  }));
  const topInsiders = Object.values(sixMonthTransactions.reduce((acc, tx) => {
    const k = tx.insider || 'Unknown';
    if (!acc[k]) acc[k] = { insider: k, buyValue: 0, sellValue: 0, txCount: 0 };
    acc[k].txCount += 1;
    if (tx.side === 'BUY') acc[k].buyValue += tx.value || 0;
    if (tx.side === 'SELL') acc[k].sellValue += tx.value || 0;
    return acc;
  }, {}))
    .map((r) => ({ ...r, netValue: r.buyValue - r.sellValue }))
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue))
    .slice(0, 5);

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-insider" aria-labelledby="tab-insider">
      <div className="text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
        Insider activity window: <b>last 6 months</b>. Green = buying pressure, red = selling pressure. Net value helps gauge insider conviction direction.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard theme={theme} label="Sell Transactions" value={String(sells.length)} subtext={formatMoney(sellValue)} tone={sells.length > buys.length ? 'negative' : 'neutral'} />
        <MetricCard theme={theme} label="Buy Transactions" value={String(buys.length)} subtext={formatMoney(buyValue)} tone={buys.length > sells.length ? 'positive' : 'neutral'} />
        <MetricCard theme={theme} label="Net Shares" value={formatShares(buyShares - sellShares)} subtext="Buys - Sells" tone={buyShares - sellShares >= 0 ? 'positive' : 'negative'} />
        <MetricCard theme={theme} label="Net Value" value={formatMoney(netValue)} subtext="Buys - Sells" tone={netValue >= 0 ? 'positive' : 'negative'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h3 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: theme.textSecondary }}>Monthly Buy vs Sell Value</h3>
          <div className="text-[11px] mb-3" style={{ color: theme.textMuted }}>
            X-axis: month. Y-axis: insider transaction value. Compare green buys vs red sells.
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyFlow} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} tickFormatter={(v) => formatMoneyCompact(v)} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
                formatter={(v, key) => [formatMoney(v), key === 'buyValue' ? 'Buy Value' : 'Sell Value']}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="buyValue" name="Buy Value" fill={theme.positive} radius={[4, 4, 0, 0]} />
              <Bar dataKey="sellValue" name="Sell Value" fill={theme.negative} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h3 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: theme.textSecondary }}>Monthly Net Insider Flow</h3>
          <div className="text-[11px] mb-3" style={{ color: theme.textMuted }}>
            Positive bars mean insiders bought more than sold in that month; negative bars mean the opposite.
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyFlow} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} tickFormatter={(v) => formatMoneyCompact(v)} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
                formatter={(v) => [formatMoney(v), 'Net Flow']}
              />
              <ReferenceLine y={0} stroke={theme.borderStrong} />
              <Bar dataKey="netValue" name="Net Flow" radius={[4, 4, 0, 0]}>
                {monthlyFlow.map((row, idx) => (
                  <Cell key={`net-${idx}`} fill={row.netValue >= 0 ? theme.positive : theme.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h3 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSecondary }}>Top Insider Net Activity (6M)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {topInsiders.length > 0 ? topInsiders.map((insider) => (
            <MetricCard
              key={insider.insider}
              theme={theme}
              label={insider.insider}
              value={formatMoney(insider.netValue)}
              subtext={`${insider.txCount} tx | Buy ${formatMoney(insider.buyValue)} / Sell ${formatMoney(insider.sellValue)}`}
              tone={insider.netValue >= 0 ? 'positive' : 'negative'}
            />
          )) : (
            <div className="text-xs" style={{ color: theme.textTertiary }}>No insider activity data in the last 6 months.</div>
          )}
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Recent Insider Transactions (6M)</h3>
          <div className="text-[10px]" style={{ color: theme.textMuted }}>Most recent filings in the last 6 months</div>
        </div>

        {sixMonthTransactions.length > 0 ? (
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
                {sixMonthTransactions.slice(0, 40).map((tx, idx) => {
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
                      <td className="px-3 py-3 text-right" style={{ color: tone }}>
                        {formatMoney(tx.value)}
                        {tx.valueIsEstimated ? ' (est.)' : ''}
                      </td>
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
        <div className="mt-3 text-[10px]" style={{ color: theme.textMuted }}>
          `Value (est.)` means filing did not include dollar amount; computed from shares × transaction price when available.
        </div>
      </div>
    </div>
  );
}

function InstitutionalOwnershipTab({ data, theme }) {
  const ownership = data?.institutionalOwnership || {};
  const holders = ownership?.largestHolders || [];
  const institutions = ownership?.institutions || [];
  const funds = ownership?.funds || [];
  const summary = ownership?.summary || {};

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
  const formatPct = (num) => {
    if (num === null || num === undefined || !Number.isFinite(num)) return 'N/A';
    return `${(num * 100).toFixed(2)}%`;
  };

  const actionBars = useMemo(
    () => [
      { action: 'Buying', count: summary.buyingCount || 0, fill: theme.positive },
      { action: 'Selling', count: summary.sellingCount || 0, fill: theme.negative },
      { action: 'No Change', count: summary.unchangedCount || 0, fill: theme.textSecondary },
      { action: 'Unknown', count: summary.unknownCount || 0, fill: theme.textTertiary },
    ],
    [summary.buyingCount, summary.sellingCount, summary.unchangedCount, summary.unknownCount, theme]
  );

  const topHoldersChart = useMemo(
    () => holders
      .slice(0, 12)
      .map((h) => ({
        holder: (h.holder || '').length > 28 ? `${h.holder.slice(0, 28)}...` : h.holder,
        value: Number.isFinite(h.marketValue) ? h.marketValue : 0,
        source: h.source === 'fund' ? 'Fund' : 'Institution',
      }))
      .reverse(),
    [holders]
  );

  const actionTone = (action) => {
    if (action === 'BUYING') return theme.positive;
    if (action === 'SELLING') return theme.negative;
    if (action === 'NO_CHANGE') return theme.textSecondary;
    return theme.textTertiary;
  };

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-institutional" aria-labelledby="tab-institutional">
      <div className="text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
        Institutional ownership shows the largest reporting institutions/funds and whether they are increasing or reducing holdings when reported changes are available.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard theme={theme} label="Total Tracked Holders" value={String(summary.totalTracked || holders.length || 0)} subtext={`${institutions.length} institutions | ${funds.length} funds`} tone="neutral" />
        <MetricCard theme={theme} label="Buying Holders" value={String(summary.buyingCount || 0)} subtext="Reported increases" tone="positive" />
        <MetricCard theme={theme} label="Selling Holders" value={String(summary.sellingCount || 0)} subtext="Reported reductions" tone="negative" />
        <MetricCard theme={theme} label="Net Share Change" value={formatShares(summary.netChangeShares)} subtext="Sum of reported share deltas" tone={summary.netChangeShares >= 0 ? 'positive' : 'negative'} />
        <MetricCard theme={theme} label="Total Reported Value" value={formatMoney(summary.totalReportedValue)} subtext={ownership?.asOfDate ? `Latest report date ${ownership.asOfDate}` : 'As reported by filings'} tone="neutral" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h3 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: theme.textSecondary }}>Largest Holders by Reported Value</h3>
          <div className="text-[11px] mb-3" style={{ color: theme.textMuted }}>
            X-axis: reported market value. Y-axis: institution/fund name. This highlights concentration among top holders.
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topHoldersChart} layout="vertical" margin={{ top: 8, right: 18, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
              <XAxis type="number" tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} tickFormatter={(v) => formatMoney(v)} />
              <YAxis dataKey="holder" type="category" width={170} tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
                formatter={(v, _, row) => [formatMoney(v), `${row?.payload?.source || 'Holder'} Value`]}
              />
              <Bar dataKey="value" name="Reported Value" radius={[0, 4, 4, 0]}>
                {topHoldersChart.map((row, idx) => (
                  <Cell key={`holder-${idx}`} fill={row.source === 'Fund' ? theme.accentAlt : theme.accent} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h3 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: theme.textSecondary }}>Holder Action Distribution</h3>
          <div className="text-[11px] mb-3" style={{ color: theme.textMuted }}>
            Based on reported share or percentage change in holdings. `Unknown` means the data source did not include change fields.
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={actionBars} margin={{ top: 8, right: 18, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
              <XAxis dataKey="action" tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
                formatter={(v) => [v, 'Holder Count']}
              />
              <ReferenceLine y={0} stroke={theme.borderStrong} />
              <Bar dataKey="count" name="Holder Count" radius={[4, 4, 0, 0]}>
                {actionBars.map((row, idx) => (
                  <Cell key={`action-${idx}`} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Largest Institutional and Fund Holders</h3>
          <div className="text-[10px]" style={{ color: theme.textMuted }}>Sorted by reported position value</div>
        </div>
        {holders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: theme.tableBg }}>
                  <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Holder</th>
                  <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Type</th>
                  <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Report Date</th>
                  <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Shares</th>
                  <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Value</th>
                  <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>% Held</th>
                  <th className="px-3 py-3 text-right font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Change</th>
                  <th className="px-3 py-3 text-left font-semibold" style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {holders.slice(0, 30).map((h, idx) => {
                  const tone = actionTone(h.action);
                  const changeText = Number.isFinite(h.changeShares)
                    ? formatShares(h.changeShares)
                    : Number.isFinite(h.changePct)
                    ? formatPct(h.changePct)
                    : 'N/A';
                  return (
                    <tr
                      key={`${h.holder}-${h.reportDate}-${idx}`}
                      style={{ borderBottom: `1px solid ${theme.border}` }}
                      onMouseEnter={(e) => e.currentTarget.style.background = theme.tableRowHover}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="px-3 py-3 font-medium" style={{ color: theme.text }}>{h.holder}</td>
                      <td className="px-3 py-3" style={{ color: theme.textSecondary }}>{h.source === 'fund' ? 'Fund' : 'Institution'}</td>
                      <td className="px-3 py-3" style={{ color: theme.textSecondary }}>{h.reportDate || 'N/A'}</td>
                      <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatShares(h.shares)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatMoney(h.marketValue)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: theme.textSecondary }}>{formatPct(h.pctHeld)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: tone }}>{changeText}</td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: `${tone}22`, color: tone }}>
                          {h.action.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs" style={{ color: theme.textTertiary }}>No institutional ownership data available for this ticker.</p>
        )}
      </div>
    </div>
  );
}

function TradingTab({ data, theme }) {
  const [timeframe, setTimeframe] = useState('1Y');

  const analysis = useMemo(() => {
    const raw = Array.isArray(data?.priceHistory) ? data.priceHistory : [];
    const history = raw.filter((r) => Number.isFinite(r?.close) && Number.isFinite(r?.high) && Number.isFinite(r?.low) && Number.isFinite(r?.volume));
    if (history.length < 220) return null;

    const smaSeries = (rows, period, key = 'close') => rows.map((_, i) => {
      if (i < period - 1) return null;
      const slice = rows.slice(i - period + 1, i + 1);
      return slice.reduce((sum, r) => sum + r[key], 0) / period;
    });

    const emaSeries = (rows, period, key = 'close') => {
      const out = new Array(rows.length).fill(null);
      const k = 2 / (period + 1);
      let prev = null;
      for (let i = 0; i < rows.length; i++) {
        const v = rows[i][key];
        if (!Number.isFinite(v)) continue;
        if (prev === null) prev = v;
        else prev = (v * k) + (prev * (1 - k));
        out[i] = prev;
      }
      return out;
    };

    const calcAnchoredVWAP = (rows, anchorIndex) => {
      const out = new Array(rows.length).fill(null);
      if (anchorIndex < 0 || anchorIndex >= rows.length) return out;
      let pv = 0;
      let vv = 0;
      for (let i = anchorIndex; i < rows.length; i++) {
        const typical = (rows[i].high + rows[i].low + rows[i].close) / 3;
        const vol = rows[i].volume || 0;
        pv += typical * vol;
        vv += vol;
        out[i] = vv > 0 ? pv / vv : null;
      }
      return out;
    };

    const calcATR = (rows, period = 14) => {
      const trs = rows.map((r, i) => {
        if (i === 0) return r.high - r.low;
        const prevClose = rows[i - 1].close;
        return Math.max(r.high - r.low, Math.abs(r.high - prevClose), Math.abs(r.low - prevClose));
      });
      return smaSeries(trs.map((t) => ({ close: t })), period, 'close');
    };

    const nowYear = new Date().getFullYear();
    const ytd = history.filter((r) => new Date(`${r.date}T00:00:00Z`).getUTCFullYear() === nowYear);
    const ytdStartIndex = Math.max(0, history.length - ytd.length);
    const ytdHigh = ytd.reduce((acc, r) => (acc === null || r.high > acc.high ? r : acc), null);
    const ytdLow = ytd.reduce((acc, r) => (acc === null || r.low < acc.low ? r : acc), null);
    const ytdHighIndex = ytdHigh ? history.findIndex((r) => r.date === ytdHigh.date) : ytdStartIndex;
    const ytdLowIndex = ytdLow ? history.findIndex((r) => r.date === ytdLow.date) : ytdStartIndex;

    let gapIndex = Math.max(1, history.length - 252);
    let maxGap = -1;
    for (let i = Math.max(1, history.length - 252); i < history.length; i++) {
      const prevClose = history[i - 1].close;
      if (!Number.isFinite(prevClose) || prevClose <= 0) continue;
      const gap = Math.abs((history[i].open - prevClose) / prevClose);
      if (gap > maxGap) {
        maxGap = gap;
        gapIndex = i;
      }
    }

    const yearlyVWAP = calcAnchoredVWAP(history, ytdStartIndex);
    const cycleLowVWAP = calcAnchoredVWAP(history, ytdLowIndex);
    const athVWAP = calcAnchoredVWAP(history, ytdHighIndex);
    const regimeVWAP = calcAnchoredVWAP(history, gapIndex);

    const ma50 = smaSeries(history, 50);
    const ma200 = smaSeries(history, 200);
    const ema20w = emaSeries(history, 100);
    const atr14 = calcATR(history, 14);
    const rollingMean60 = smaSeries(history, 60);
    const rollingStd60 = history.map((_, i) => {
      if (i < 59) return null;
      const slice = history.slice(i - 59, i + 1).map((r) => r.close).filter((v) => Number.isFinite(v));
      if (slice.length < 60) return null;
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance = slice.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / slice.length;
      return Math.sqrt(variance);
    });
    const zScoreSeries = history.map((r, i) => {
      const mean = rollingMean60[i];
      const sd = rollingStd60[i];
      const z = Number.isFinite(mean) && Number.isFinite(sd) && sd > 0 ? (r.close - mean) / sd : null;
      return { date: r.date, zScore: z };
    });
    const returns = history.map((r, i) => (i === 0 ? null : Math.log(r.close / history[i - 1].close))).filter((v) => Number.isFinite(v));
    const realizedVol20 = [];
    for (let i = 0; i < returns.length; i++) {
      if (i < 19) realizedVol20.push(null);
      else {
        const slice = returns.slice(i - 19, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
        const variance = slice.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / slice.length;
        realizedVol20.push(Math.sqrt(variance) * Math.sqrt(252));
      }
    }
    const currentVol = realizedVol20[realizedVol20.length - 1];
    const volWindow = realizedVol20.filter((v) => Number.isFinite(v));
    const volPercentile = volWindow.length
      ? (volWindow.filter((v) => v <= currentVol).length / volWindow.length) * 100
      : null;

    const vpRows = history.slice(-252);
    const minP = Math.min(...vpRows.map((r) => r.low));
    const maxP = Math.max(...vpRows.map((r) => r.high));
    const bins = 24;
    const step = (maxP - minP) / bins || 1;
    const profile = Array.from({ length: bins }, (_, i) => ({
      low: minP + (i * step),
      high: minP + ((i + 1) * step),
      vol: 0,
    }));
    for (const r of vpRows) {
      const idx = Math.max(0, Math.min(bins - 1, Math.floor((r.close - minP) / step)));
      profile[idx].vol += r.volume || 0;
    }
    const pocIdx = profile.reduce((best, b, i) => (b.vol > profile[best].vol ? i : best), 0);
    const totalProfileVol = profile.reduce((s, b) => s + b.vol, 0);
    let vaLow = pocIdx;
    let vaHigh = pocIdx;
    let covered = profile[pocIdx].vol;
    while (covered < totalProfileVol * 0.7 && (vaLow > 0 || vaHigh < bins - 1)) {
      const leftVol = vaLow > 0 ? profile[vaLow - 1].vol : -1;
      const rightVol = vaHigh < bins - 1 ? profile[vaHigh + 1].vol : -1;
      if (rightVol >= leftVol && vaHigh < bins - 1) {
        vaHigh += 1;
        covered += profile[vaHigh].vol;
      } else if (vaLow > 0) {
        vaLow -= 1;
        covered += profile[vaLow].vol;
      } else {
        break;
      }
    }

    const poc = (profile[pocIdx].low + profile[pocIdx].high) / 2;
    const vah = profile[vaHigh].high;
    const val = profile[vaLow].low;

    const recent20 = history.slice(-20);
    const prev20 = history.slice(-40, -20);
    const recent60 = history.slice(-60);
    const hhhl = recent20.length && prev20.length
      ? Math.max(...recent20.map((r) => r.high)) > Math.max(...prev20.map((r) => r.high)) &&
        Math.min(...recent20.map((r) => r.low)) > Math.min(...prev20.map((r) => r.low))
      : false;
    const lhll = recent20.length && prev20.length
      ? Math.max(...recent20.map((r) => r.high)) < Math.max(...prev20.map((r) => r.high)) &&
        Math.min(...recent20.map((r) => r.low)) < Math.min(...prev20.map((r) => r.low))
      : false;

    const latest = history[history.length - 1];
    const yearlyHigh = ytdHigh?.high ?? Math.max(...history.slice(-252).map((r) => r.high));
    const yearlyLow = ytdLow?.low ?? Math.min(...history.slice(-252).map((r) => r.low));
    const latestYearlyVWAP = yearlyVWAP[yearlyVWAP.length - 1];
    const last3 = history.slice(-3);
    const vahHold = last3.every((r) => r.close > vah);
    const rejectedVAH = last3.some((r) => r.high > vah && r.close < vah);
    const weeklyStrong = history.length > 6 ? latest.close > history[history.length - 6].close : false;

    const currentAtr = atr14[atr14.length - 1];
    const atrPrev = atr14[Math.max(0, atr14.length - 21)];
    const atrExpansion = Number.isFinite(currentAtr) && Number.isFinite(atrPrev) && currentAtr > atrPrev * 1.15;
    const latestVolume = latest?.volume;
    const prior20Volumes = history.slice(-21, -1).map((r) => r.volume).filter((v) => Number.isFinite(v));
    const avgVolume20 = prior20Volumes.length
      ? prior20Volumes.reduce((a, b) => a + b, 0) / prior20Volumes.length
      : null;
    const rvol20 = Number.isFinite(latestVolume) && Number.isFinite(avgVolume20) && avgVolume20 > 0
      ? latestVolume / avgVolume20
      : null;
    const rvolRegime = !Number.isFinite(rvol20)
      ? 'N/A'
      : rvol20 >= 1.5
      ? 'High'
      : rvol20 >= 0.8
      ? 'Normal'
      : 'Low';

    const distToPocPct = Number.isFinite(latest?.close) && Number.isFinite(poc) && poc > 0
      ? ((latest.close - poc) / poc) * 100
      : null;
    const distToVahPct = Number.isFinite(latest?.close) && Number.isFinite(vah) && vah > 0
      ? ((latest.close - vah) / vah) * 100
      : null;
    const distToValPct = Number.isFinite(latest?.close) && Number.isFinite(val) && val > 0
      ? ((latest.close - val) / val) * 100
      : null;

    const atrBand1Upper = Number.isFinite(latest?.close) && Number.isFinite(currentAtr) ? latest.close + currentAtr : null;
    const atrBand1Lower = Number.isFinite(latest?.close) && Number.isFinite(currentAtr) ? latest.close - currentAtr : null;
    const atrBand2Upper = Number.isFinite(latest?.close) && Number.isFinite(currentAtr) ? latest.close + (2 * currentAtr) : null;
    const atrBand2Lower = Number.isFinite(latest?.close) && Number.isFinite(currentAtr) ? latest.close - (2 * currentAtr) : null;

    const yearlyRange = Number.isFinite(yearlyHigh) && Number.isFinite(yearlyLow) ? (yearlyHigh - yearlyLow) : null;
    const yearlyPercentile = Number.isFinite(latest?.close) && Number.isFinite(yearlyRange) && yearlyRange > 0
      ? ((latest.close - yearlyLow) / yearlyRange) * 100
      : null;

    const ma50Latest = ma50[ma50.length - 1];
    const ma200Latest = ma200[ma200.length - 1];
    const ma50Prev20 = ma50[Math.max(0, ma50.length - 21)];
    const spreadPct = Number.isFinite(ma50Latest) && Number.isFinite(ma200Latest) && ma200Latest !== 0
      ? ((ma50Latest - ma200Latest) / ma200Latest) * 100
      : null;
    const slope50Pct = Number.isFinite(ma50Latest) && Number.isFinite(ma50Prev20) && ma50Prev20 !== 0
      ? ((ma50Latest - ma50Prev20) / ma50Prev20) * 100
      : null;
    const trendStrengthScore = Number.isFinite(spreadPct) && Number.isFinite(slope50Pct)
      ? Math.max(0, Math.min(100, (Math.abs(spreadPct) * 6) + (Math.abs(slope50Pct) * 10)))
      : null;
    const trendStrengthLabel = !Number.isFinite(trendStrengthScore)
      ? 'N/A'
      : trendStrengthScore >= 60
      ? 'Strong Trend'
      : trendStrengthScore >= 35
      ? 'Moderate Trend'
      : 'Range-like';

    const regime = latest.close > latestYearlyVWAP && vahHold && hhhl && weeklyStrong
      ? 'Bullish'
      : latest.close < latestYearlyVWAP && rejectedVAH && lhll
      ? 'Bearish / Distribution'
      : 'Chop / Neutral';

    const timeframeDays = timeframe === '6M' ? 126 : timeframe === '2Y' ? 504 : 252;
    const chartSource = history.slice(-Math.min(timeframeDays, history.length));

    const markerRows = history.map((r, i) => ({
      date: r.date,
      close: r.close,
      yearlyVWAP: yearlyVWAP[i],
      ma50: ma50[i],
      ma200: ma200[i],
      vah,
      val,
    }));

    const bullishEntry = markerRows
      .filter((r) =>
        Number.isFinite(r.close) &&
        Number.isFinite(r.yearlyVWAP) &&
        r.close > r.yearlyVWAP &&
        Math.abs((r.close - r.yearlyVWAP) / r.yearlyVWAP) <= 0.02
      )
      .slice(-1)[0] || null;

    let reclaim = null;
    for (let i = 1; i < markerRows.length - 2; i++) {
      const p = markerRows[i - 1];
      const c = markerRows[i];
      const n1 = markerRows[i + 1];
      const n2 = markerRows[i + 2];
      if (
        Number.isFinite(p.close) && Number.isFinite(p.yearlyVWAP) &&
        Number.isFinite(c.close) && Number.isFinite(c.yearlyVWAP) &&
        p.close <= p.yearlyVWAP &&
        c.close > c.yearlyVWAP &&
        Number.isFinite(n1.close) && Number.isFinite(n1.yearlyVWAP) &&
        Number.isFinite(n2.close) && Number.isFinite(n2.yearlyVWAP) &&
        n1.close > n1.yearlyVWAP &&
        n2.close > n2.yearlyVWAP
      ) {
        reclaim = c;
      }
    }

    let invalidation = null;
    if (reclaim) {
      const rIdx = markerRows.findIndex((r) => r.date === reclaim.date);
      for (let i = rIdx + 1; i < markerRows.length; i++) {
        const r = markerRows[i];
        if (Number.isFinite(r.close) && Number.isFinite(r.yearlyVWAP) && r.close < r.yearlyVWAP) {
          invalidation = r;
          break;
        }
      }
    } else {
      invalidation = markerRows
        .filter((r) => Number.isFinite(r.close) && Number.isFinite(r.ma50) && r.close < r.ma50)
        .slice(-1)[0] || null;
    }

    const chartRows = chartSource.map((r) => {
      const idx = history.findIndex((h) => h.date === r.date);
      return {
        date: r.date,
        close: r.close,
        yearlyVWAP: yearlyVWAP[idx],
        cycleLowVWAP: cycleLowVWAP[idx],
        athVWAP: athVWAP[idx],
        regimeVWAP: regimeVWAP[idx],
        ma50: ma50[idx],
        ma200: ma200[idx],
        ema20w: ema20w[idx],
        zScore60: zScoreSeries[idx]?.zScore ?? null,
      };
    });
    const zScoreRows = chartRows.map((r) => ({ date: r.date, zScore: r.zScore60 }));
    const zScoreVals = zScoreRows.map((r) => r.zScore).filter((v) => Number.isFinite(v));
    const histBins = [
      { label: '<-3', low: -Infinity, high: -3, count: 0 },
      { label: '-3:-2.5', low: -3, high: -2.5, count: 0 },
      { label: '-2.5:-2', low: -2.5, high: -2, count: 0 },
      { label: '-2:-1.5', low: -2, high: -1.5, count: 0 },
      { label: '-1.5:-1', low: -1.5, high: -1, count: 0 },
      { label: '-1:-0.5', low: -1, high: -0.5, count: 0 },
      { label: '-0.5:0', low: -0.5, high: 0, count: 0 },
      { label: '0:+0.5', low: 0, high: 0.5, count: 0 },
      { label: '+0.5:+1', low: 0.5, high: 1, count: 0 },
      { label: '+1:+1.5', low: 1, high: 1.5, count: 0 },
      { label: '+1.5:+2', low: 1.5, high: 2, count: 0 },
      { label: '+2:+2.5', low: 2, high: 2.5, count: 0 },
      { label: '+2.5:+3', low: 2.5, high: 3, count: 0 },
      { label: '>+3', low: 3, high: Infinity, count: 0 },
    ];
    for (const z of zScoreVals) {
      const idx = histBins.findIndex((b) => z >= b.low && z < b.high);
      if (idx >= 0) histBins[idx].count += 1;
    }
    const histTotal = zScoreVals.length || 1;
    const zScoreHistogram = histBins.map((b) => ({ ...b, pct: (b.count / histTotal) * 100 }));
    const within1SigmaPct = zScoreVals.length
      ? (zScoreVals.filter((z) => Math.abs(z) <= 1).length / zScoreVals.length) * 100
      : 0;
    const within2SigmaPct = zScoreVals.length
      ? (zScoreVals.filter((z) => Math.abs(z) <= 2).length / zScoreVals.length) * 100
      : 0;
    const within3SigmaPct = zScoreVals.length
      ? (zScoreVals.filter((z) => Math.abs(z) <= 3).length / zScoreVals.length) * 100
      : 0;
    const tailPct = zScoreVals.length
      ? (zScoreVals.filter((z) => Math.abs(z) >= 2).length / zScoreVals.length) * 100
      : 0;
    const currentZ = Number.isFinite(data?.tradingSignals?.zScore) ? data.tradingSignals.zScore : null;
    const currentBin = Number.isFinite(currentZ)
      ? histBins.find((b) => currentZ >= b.low && currentZ < b.high) || null
      : null;
    const currentBinLabel = currentBin?.label || null;
    const currentZone = Number.isFinite(currentZ)
      ? Math.abs(currentZ) >= 3
        ? 'Extreme Deviation'
        : Math.abs(currentZ) >= 2
        ? 'Stretch Zone'
        : Math.abs(currentZ) >= 1
        ? 'Watch Zone'
        : 'Normal Zone'
      : 'N/A';
    const deviationFromMA50Series = history
      .map((r, idx) => {
        const ma = ma50[idx];
        const deviationPct = Number.isFinite(r.close) && Number.isFinite(ma) && ma > 0
          ? ((r.close - ma) / ma) * 100
          : null;
        return { date: r.date, deviationPct };
      })
      .filter((r) => Number.isFinite(r.deviationPct));
    const deviationBins = [
      { label: '<-15', low: -Infinity, high: -15, count: 0 },
      { label: '-15:-12.5', low: -15, high: -12.5, count: 0 },
      { label: '-12.5:-10', low: -12.5, high: -10, count: 0 },
      { label: '-10:-7.5', low: -10, high: -7.5, count: 0 },
      { label: '-7.5:-5', low: -7.5, high: -5, count: 0 },
      { label: '-5:-2.5', low: -5, high: -2.5, count: 0 },
      { label: '-2.5:0', low: -2.5, high: 0, count: 0 },
      { label: '0:+2.5', low: 0, high: 2.5, count: 0 },
      { label: '+2.5:+5', low: 2.5, high: 5, count: 0 },
      { label: '+5:+7.5', low: 5, high: 7.5, count: 0 },
      { label: '+7.5:+10', low: 7.5, high: 10, count: 0 },
      { label: '+10:+12.5', low: 10, high: 12.5, count: 0 },
      { label: '+12.5:+15', low: 12.5, high: 15, count: 0 },
      { label: '>+15', low: 15, high: Infinity, count: 0 },
    ];
    for (const row of deviationFromMA50Series) {
      const idx = deviationBins.findIndex((b) => row.deviationPct >= b.low && row.deviationPct < b.high);
      if (idx >= 0) deviationBins[idx].count += 1;
    }
    const deviationTotal = deviationFromMA50Series.length || 1;
    const deviationHistogram = deviationBins.map((b) => ({ ...b, pct: (b.count / deviationTotal) * 100 }));
    const latestDeviationPct = deviationFromMA50Series.length > 0
      ? deviationFromMA50Series[deviationFromMA50Series.length - 1].deviationPct
      : null;
    const currentDeviationBin = Number.isFinite(latestDeviationPct)
      ? deviationBins.find((b) => latestDeviationPct >= b.low && latestDeviationPct < b.high) || null
      : null;
    const deviationZone = Number.isFinite(latestDeviationPct)
      ? Math.abs(latestDeviationPct) >= 10
        ? 'Extreme'
        : Math.abs(latestDeviationPct) >= 5
        ? 'Stretched'
        : 'Normal'
      : 'N/A';
    const deviationVals = deviationFromMA50Series.map((r) => r.deviationPct);
    const nDev = deviationVals.length || 1;
    const oneSidedDownProb = Number.isFinite(latestDeviationPct)
      ? (deviationVals.filter((v) => v <= latestDeviationPct).length / nDev) * 100
      : 0;
    const oneSidedUpProb = Number.isFinite(latestDeviationPct)
      ? (deviationVals.filter((v) => v >= latestDeviationPct).length / nDev) * 100
      : 0;
    const twoSidedAbsProb = Number.isFinite(latestDeviationPct)
      ? (deviationVals.filter((v) => Math.abs(v) >= Math.abs(latestDeviationPct)).length / nDev) * 100
      : 0;
    const deviationPercentile = Number.isFinite(latestDeviationPct)
      ? (deviationVals.filter((v) => v <= latestDeviationPct).length / nDev) * 100
      : 0;

    return {
      chartRows,
      zScoreRows,
      zScoreHistogram,
      within1SigmaPct,
      within2SigmaPct,
      within3SigmaPct,
      tailPct,
      currentBinLabel,
      currentZone,
      deviationHistogram,
      latestDeviationPct,
      currentDeviationBinLabel: currentDeviationBin?.label || null,
      deviationZone,
      oneSidedDownProb,
      oneSidedUpProb,
      twoSidedAbsProb,
      deviationPercentile,
      deviationSampleSize: deviationVals.length,
      latest,
      yearlyHigh,
      yearlyLow,
      yearlyVWAP: latestYearlyVWAP,
      cycleLowVWAP: cycleLowVWAP[cycleLowVWAP.length - 1],
      athVWAP: athVWAP[athVWAP.length - 1],
      regimeVWAP: regimeVWAP[regimeVWAP.length - 1],
      ma50: ma50[ma50.length - 1],
      ma200: ma200[ma200.length - 1],
      ema20w: ema20w[ema20w.length - 1],
      atrExpansion,
      rvol20,
      rvolRegime,
      distToPocPct,
      distToVahPct,
      distToValPct,
      atrBand1Upper,
      atrBand1Lower,
      atrBand2Upper,
      atrBand2Lower,
      yearlyPercentile,
      trendStrengthScore,
      trendStrengthLabel,
      volPercentile,
      poc,
      vah,
      val,
      hhhl,
      lhll,
      rangeHigh: Math.max(...recent60.map((r) => r.high)),
      rangeLow: Math.min(...recent60.map((r) => r.low)),
      regime,
      markers: {
        entry: bullishEntry,
        reclaim,
        invalidation,
      },
      notes: {
        oiFunding: 'Not available for most equities via this feed; using price/volume behavior instead.',
      },
    };
  }, [data, timeframe]);

  if (!analysis) {
    return (
      <div className="animate-fadeIn p-6 rounded-2xl border text-xs" style={{ background: theme.bgCard, borderColor: theme.border, color: theme.textTertiary }}>
        Trading section needs at least ~220 daily candles for this ticker.
      </div>
    );
  }

  const regimeTone = analysis.regime === 'Bullish'
    ? theme.positive
    : analysis.regime.startsWith('Bearish')
    ? theme.negative
    : theme.warning;

  const inValue = analysis.latest.close <= analysis.vah && analysis.latest.close >= analysis.val;
  const aboveYearlyVWAP = analysis.latest.close > analysis.yearlyVWAP;
  const signal = data?.tradingSignals || null;
  const tradePalette = {
    price: '#38bdf8',
    vwapPrimary: '#10b981',
    vwapSecondary: '#22c55e',
    vwapTertiary: '#eab308',
    vwapRegime: '#06b6d4',
    ma50: '#84cc16',
    ma200: '#ef4444',
    ema20w: '#94a3b8',
    zLine: '#22d3ee',
    histNeutral: '#0ea5e9',
    histStretch: '#f59e0b',
  };
  const actionTone = signal?.action === 'ACCUMULATE' || signal?.action === 'SCALE IN'
    ? theme.positive
    : signal?.action === 'REDUCE EXPOSURE' || signal?.action === 'TAKE PROFIT'
    ? theme.warning
    : theme.textSecondary;
  const formatPx = (v) => (Number.isFinite(v) ? `$${v.toFixed(2)}` : 'N/A');
  const formatPctSigned = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : 'N/A');
  const zScoreForLadder = Number.isFinite(signal?.zScore) ? signal.zScore : null;
  const zScoreMeaning = zScoreForLadder === null
    ? 'Unavailable'
    : Math.abs(zScoreForLadder) <= 0.5
    ? 'Near fair value (neutral)'
    : zScoreForLadder <= -2
    ? 'Deep discount zone'
    : zScoreForLadder < -0.5
    ? 'Discount zone'
    : zScoreForLadder >= 2
    ? 'Overextended zone'
    : 'Premium zone';
  const zScoreTone = zScoreForLadder === null
    ? 'neutral'
    : Math.abs(zScoreForLadder) <= 0.5
    ? 'neutral'
    : zScoreForLadder < 0
    ? 'positive'
    : 'warning';
  const ladderPositionPct = zScoreForLadder === null
    ? 50
    : Math.max(0, Math.min(100, ((zScoreForLadder + 3) / 6) * 100));
  const rvolTone = !Number.isFinite(analysis.rvol20)
    ? 'neutral'
    : analysis.rvol20 >= 1.5
    ? 'positive'
    : analysis.rvol20 >= 0.8
    ? 'neutral'
    : 'warning';
  const pocTone = !Number.isFinite(analysis.distToPocPct)
    ? 'neutral'
    : Math.abs(analysis.distToPocPct) <= 1
    ? 'positive'
    : Math.abs(analysis.distToPocPct) <= 3
    ? 'warning'
    : 'negative';
  const vahTone = !Number.isFinite(analysis.distToVahPct)
    ? 'neutral'
    : analysis.distToVahPct >= 0
    ? 'positive'
    : Math.abs(analysis.distToVahPct) <= 2
    ? 'warning'
    : 'negative';
  const valTone = !Number.isFinite(analysis.distToValPct)
    ? 'neutral'
    : analysis.distToValPct >= 0
    ? 'positive'
    : 'negative';
  const yearlyPctTone = !Number.isFinite(analysis.yearlyPercentile)
    ? 'neutral'
    : analysis.yearlyPercentile <= 20 || analysis.yearlyPercentile >= 80
    ? 'warning'
    : analysis.yearlyPercentile >= 35 && analysis.yearlyPercentile <= 65
    ? 'positive'
    : 'neutral';
  const trendTone = !Number.isFinite(analysis.trendStrengthScore)
    ? 'neutral'
    : analysis.trendStrengthScore >= 60
    ? 'positive'
    : analysis.trendStrengthScore >= 35
    ? 'warning'
    : 'neutral';
  const deviationSummary = Number.isFinite(analysis.latestDeviationPct)
    ? analysis.latestDeviationPct < 0
      ? `Price is ${Math.abs(analysis.latestDeviationPct).toFixed(2)}% below 50DMA.`
      : `Price is ${analysis.latestDeviationPct.toFixed(2)}% above 50DMA.`
    : 'Current 50DMA deviation is unavailable.';
  const raritySummary = Number.isFinite(analysis.twoSidedAbsProb)
    ? analysis.twoSidedAbsProb <= 5
      ? 'This is statistically rare versus history.'
      : analysis.twoSidedAbsProb <= 15
      ? 'This is uncommon versus history.'
      : analysis.twoSidedAbsProb <= 30
      ? 'This is moderately common versus history.'
      : 'This is common versus history.'
    : 'Rarity estimate unavailable.';
  const optimalBuyZone = signal?.entryZone?.side === 'BUY'
    ? `${formatPx(signal.entryZone.low)} - ${formatPx(signal.entryZone.high)}`
    : Number.isFinite(analysis.val) && Number.isFinite(analysis.yearlyVWAP)
    ? `${formatPx(Math.min(analysis.val, analysis.yearlyVWAP))} - ${formatPx(Math.max(analysis.val, analysis.yearlyVWAP))}`
    : 'Wait for Yearly VWAP reclaim + structure confirmation';

  return (
    <div className="animate-fadeIn space-y-6" role="tabpanel" id="tabpanel-trading" aria-labelledby="tab-trading">
      {signal && (
        <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
            <div>
              <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: theme.textTertiary }}>Optimal Entry Engine</div>
              <div className="text-lg font-bold" style={{ color: actionTone }}>{signal.action || 'WAIT'}</div>
              <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                {signal.regime || 'UNKNOWN'} regime • {signal.meanType || 'Mean not available'}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto">
              <MetricCard
                theme={theme}
                label="Z-Score"
                value={Number.isFinite(signal.zScore) ? `${signal.zScore.toFixed(2)}σ` : 'N/A'}
                helpText="Number of standard deviations current price is from the rolling mean."
                tone={zScoreTone}
              />
              <MetricCard
                theme={theme}
                label="Confidence"
                value={Number.isFinite(signal.confidence) ? `${signal.confidence}%` : 'N/A'}
                helpText="Composite confidence score from signal strength, regime fit, and trend quality."
              />
              <MetricCard
                theme={theme}
                label="Std Dev"
                value={Number.isFinite(signal.stdDev) ? `${signal.stdDev.toFixed(2)}` : 'N/A'}
                helpText="Standard deviation of recent prices used to normalize distance from the mean."
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetricCard
              theme={theme}
              label={signal.entryZone?.side === 'SELL' ? 'Reduce Zone' : 'Execution Zone'}
              value={signal.entryZone ? `${formatPx(signal.entryZone.low)} - ${formatPx(signal.entryZone.high)}` : 'No active zone'}
              helpText="Primary action range from current signal."
            />
            <MetricCard theme={theme} label="Optimal Buy Zone" value={optimalBuyZone} tone="positive" />
            <MetricCard theme={theme} label="Target 1" value={formatPx(signal.targets?.tp1)} />
            <MetricCard theme={theme} label="Target 2 (Mean)" value={formatPx(signal.targets?.tp2)} />
          </div>
          <div className="mt-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
            Z-score status: <b>{zScoreMeaning}</b>. Example: <b>0.05σ</b> is near average and usually neutral, not a strong buy/sell signal.
          </div>
          <div className="mt-4">
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: theme.textTertiary }}>Standard Deviation Ladder (Entry Context)</div>
            <div className="relative h-10 rounded-lg border overflow-hidden" style={{ borderColor: theme.border }}>
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, ${theme.negativeBg} 0%, ${theme.warningBg} 33%, ${theme.neutralPillBg} 50%, ${theme.warningBg} 67%, ${theme.positiveBg} 100%)`,
                }}
              />
              {[0, 16.67, 33.33, 50, 66.67, 83.33, 100].map((pct, i) => (
                <div
                  key={`tick-${i}`}
                  className="absolute top-0 bottom-0 border-l"
                  style={{ left: `${pct}%`, borderColor: theme.border }}
                />
              ))}
              <div
                className="absolute top-0 bottom-0 w-0.5"
                style={{ left: `${ladderPositionPct}%`, background: actionTone }}
              />
              <div
                className="absolute -top-1 text-[10px] px-1.5 py-0.5 rounded border"
                style={{ left: `calc(${ladderPositionPct}% - 20px)`, color: theme.text, borderColor: theme.border, background: theme.bgElevated }}
              >
                {zScoreForLadder === null ? 'N/A' : `${zScoreForLadder.toFixed(2)}σ`}
              </div>
            </div>
            <div className="mt-1 flex justify-between text-[10px]" style={{ color: theme.textTertiary }}>
              <span>-3σ</span><span>-2σ</span><span>-1σ</span><span>0σ</span><span>+1σ</span><span>+2σ</span><span>+3σ</span>
            </div>
            <div className="mt-1 text-[10px]" style={{ color: theme.textTertiary }}>
              Left side (negative sigma) = cheaper vs recent mean. Near 0σ = fair/neutral. Right side (positive sigma) = richer/extended.
            </div>
          </div>
          {Array.isArray(signal.rationale) && signal.rationale.length > 0 && (
            <div className="mt-4 text-xs space-y-1" style={{ color: theme.textSecondary }}>
              {signal.rationale.map((line, idx) => (
                <div key={`${line}-${idx}`}>• {line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-6 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Trading Regime (Ticker-Driven)</h3>
          <div className="flex items-center gap-2">
            {['6M', '1Y', '2Y'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className="px-3 py-1 rounded-md text-[10px] font-semibold tracking-wider border transition-all"
                style={{
                  color: timeframe === tf ? theme.bg : theme.textTertiary,
                  background: timeframe === tf ? theme.accent : theme.bg,
                  borderColor: timeframe === tf ? theme.accent : theme.border,
                }}
              >
                {tf}
              </button>
            ))}
            <div className="px-3 py-1 rounded-full text-[10px] font-semibold border" style={{ color: regimeTone, borderColor: `${regimeTone}55`, background: `${regimeTone}14` }}>
              {analysis.regime}
            </div>
          </div>
        </div>
        <div className="mb-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
          How to read this chart: <b>X-axis</b> is date. <b>Y-axis</b> is price. Colored lines are trend references (VWAP, moving averages). Dashed horizontal lines mark liquidity/value levels.
        </div>
        <div className="mb-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
          <b>Note:</b> Sigma/std-dev analytics are shown in dedicated sections below. This chart focuses on market structure and trading indicators.
        </div>
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={analysis.chartRows} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="close" stroke={tradePalette.price} dot={false} strokeWidth={2} name="Close" />
            <Line type="monotone" dataKey="yearlyVWAP" stroke={tradePalette.vwapPrimary} dot={false} strokeWidth={1.8} name="Yearly VWAP" />
            <Line type="monotone" dataKey="cycleLowVWAP" stroke={tradePalette.vwapSecondary} dot={false} strokeDasharray="6 4" name="Cycle Low VWAP" />
            <Line type="monotone" dataKey="athVWAP" stroke={tradePalette.vwapTertiary} dot={false} strokeDasharray="6 4" name="ATH VWAP" />
            <Line type="monotone" dataKey="regimeVWAP" stroke={tradePalette.vwapRegime} dot={false} strokeDasharray="3 4" name="Regime VWAP" />
            <Line type="monotone" dataKey="ma50" stroke={tradePalette.ma50} dot={false} name="50 DMA" />
            <Line type="monotone" dataKey="ma200" stroke={tradePalette.ma200} dot={false} name="200 DMA" />
            <Line type="monotone" dataKey="ema20w" stroke={tradePalette.ema20w} dot={false} strokeDasharray="4 3" name="20 EMA (weekly proxy)" />
            <ReferenceLine y={analysis.yearlyHigh} stroke="#1d4ed8" strokeDasharray="4 3" label={{ value: 'YH', position: 'insideRight', fill: '#1d4ed8', fontSize: 10 }} />
            <ReferenceLine y={analysis.yearlyLow} stroke="#1d4ed8" strokeDasharray="4 3" label={{ value: 'YL', position: 'insideRight', fill: '#1d4ed8', fontSize: 10 }} />
            <ReferenceLine y={analysis.poc} stroke="#334155" strokeDasharray="5 4" label={{ value: 'POC', position: 'insideRight', fill: '#64748b', fontSize: 10 }} />
            <ReferenceLine y={analysis.vah} stroke="#0ea5e9" strokeDasharray="5 4" label={{ value: 'VAH', position: 'insideRight', fill: '#0284c7', fontSize: 10 }} />
            <ReferenceLine y={analysis.val} stroke="#0ea5e9" strokeDasharray="5 4" label={{ value: 'VAL', position: 'insideRight', fill: '#0284c7', fontSize: 10 }} />
            {analysis?.markers?.entry?.date && (
              <ReferenceLine x={analysis.markers.entry.date} stroke="#22c55e" strokeDasharray="4 3" label={{ value: 'Entry', position: 'insideTopRight', fill: '#22c55e', fontSize: 10 }} />
            )}
            {analysis?.markers?.reclaim?.date && (
              <ReferenceLine x={analysis.markers.reclaim.date} stroke="#10b981" strokeDasharray="4 3" label={{ value: 'Reclaim', position: 'insideTopRight', fill: '#10b981', fontSize: 10 }} />
            )}
            {analysis?.markers?.invalidation?.date && (
              <ReferenceLine x={analysis.markers.invalidation.date} stroke="#ef4444" strokeDasharray="4 3" label={{ value: 'Invalid', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <h4 className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: theme.textSecondary }}>Rolling Z-Score (60d)</h4>
        <div className="mb-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
          How to read: mean here = <b>60-day rolling average price</b>. Formula: <b>z = (price - 60d mean) / 60d standard deviation</b>. `0` means near average. `+2`/`-2` means stretched. `+3`/`-3` is rare and usually extreme.
        </div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={analysis.zScoreRows} margin={{ top: 8, right: 16, left: 0, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 10, fill: theme.textTertiary }} axisLine={{ stroke: theme.chartGrid }} tickLine={false} domain={[-3.5, 3.5]} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }} formatter={(v) => [Number.isFinite(v) ? `${v.toFixed(2)}σ` : 'N/A', 'Z-Score']} />
            <ReferenceArea y1={-1} y2={1} fill={theme.positive} fillOpacity={0.08} />
            <ReferenceArea y1={1} y2={2} fill={theme.warning} fillOpacity={0.12} />
            <ReferenceArea y1={-2} y2={-1} fill={theme.warning} fillOpacity={0.12} />
            <ReferenceArea y1={2} y2={3.5} fill={theme.negative} fillOpacity={0.1} />
            <ReferenceArea y1={-3.5} y2={-2} fill={theme.negative} fillOpacity={0.1} />
            <ReferenceLine y={0} stroke={theme.accent} strokeDasharray="4 3" />
            <ReferenceLine y={2} stroke={theme.warning} strokeDasharray="3 3" />
            <ReferenceLine y={-2} stroke={theme.warning} strokeDasharray="3 3" />
            <ReferenceLine y={3} stroke={theme.negative} strokeDasharray="2 3" />
            <ReferenceLine y={-3} stroke={theme.positive} strokeDasharray="2 3" />
            <Line type="monotone" dataKey="zScore" stroke={tradePalette.zLine} dot={false} strokeWidth={1.8} name="Z-Score" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Z-Score Distribution</h4>
          {Number.isFinite(signal?.zScore) && (
            <div className="text-[10px] font-semibold px-2 py-1 rounded border" style={{ color: actionTone, borderColor: `${actionTone}55`, background: `${actionTone}14` }}>
              Current: {signal.zScore.toFixed(2)}σ
            </div>
          )}
        </div>
        <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <MetricCard
            theme={theme}
            label="Within ±1σ"
            value={`${analysis.within1SigmaPct.toFixed(1)}%`}
            helpText="Share of historical days where z-score stayed between -1 and +1."
          />
          <MetricCard
            theme={theme}
            label="Within ±2σ"
            value={`${analysis.within2SigmaPct.toFixed(1)}%`}
            helpText="Share of historical days where z-score stayed between -2 and +2."
          />
          <MetricCard
            theme={theme}
            label="Within ±3σ"
            value={`${analysis.within3SigmaPct.toFixed(1)}%`}
            helpText="Share of historical days where z-score stayed between -3 and +3."
          />
        </div>
        <div className="mb-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
          Empirical rule benchmark (normal distribution): about <b>68.3%</b> within ±1σ, <b>95.4%</b> within ±2σ, <b>99.7%</b> within ±3σ.
          Your observed tail beyond ±2σ is <b>{analysis.tailPct.toFixed(1)}%</b>.
        </div>
        <div className="mb-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
          Zone: <span style={{ color: actionTone, fontWeight: 700 }}>{analysis.currentZone}</span>
          {Number.isFinite(signal?.zScore) ? ` | Current position: ${signal.zScore.toFixed(2)}σ from mean` : ' | Current position: N/A'}
        </div>
        <div className="mb-2 text-xs" style={{ color: theme.textSecondary }}>
          What this means: each bar shows how often price stayed in that sigma bucket in the selected timeframe. <b>Y-axis</b> = bucket range (`σ`). <b>X-axis</b> = frequency (% of days). Real markets are often fat-tailed, so extremes happen more than textbook normal models.
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart
            layout="vertical"
            data={analysis.zScoreHistogram}
            margin={{ top: 10, right: 24, left: 6, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: theme.textTertiary }}
              axisLine={{ stroke: theme.chartGrid }}
              tickLine={false}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={78}
              tick={{ fontSize: 10, fill: theme.textTertiary }}
              axisLine={{ stroke: theme.chartGrid }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
              formatter={(v, k, p) => [`${Number(v).toFixed(1)}%`, `Frequency (${p.payload.count} bars)`]}
            />
            {analysis.currentBinLabel && (
              <ReferenceLine
                y={analysis.currentBinLabel}
                stroke={actionTone}
                strokeWidth={2}
                label={{ value: 'You are here', position: 'right', fill: actionTone, fontSize: 10 }}
              />
            )}
            <Bar dataKey="pct" name="% of bars" radius={[0, 4, 4, 0]} minPointSize={3}>
              {analysis.zScoreHistogram.map((b, i) => {
                const extreme = b.low <= -2 || b.high >= 2;
                const isCurrentBin = analysis.currentBinLabel === b.label;
                const fill = isCurrentBin ? actionTone : extreme ? tradePalette.histStretch : tradePalette.histNeutral;
                return <Cell key={`zbin-${i}`} fill={fill} fillOpacity={isCurrentBin ? 1 : 0.85} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: theme.textSecondary }}>Price vs 50DMA Deviation</h4>
          <div className="text-[10px] font-semibold px-2 py-1 rounded border" style={{ color: actionTone, borderColor: `${actionTone}55`, background: `${actionTone}14` }}>
            {Number.isFinite(analysis.latestDeviationPct) ? `${analysis.latestDeviationPct.toFixed(2)}%` : 'N/A'}
          </div>
        </div>
        <div className="mb-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
          How to read: `0%` means price is near 50DMA. Above `+5%` is stretched up, below `-5%` is stretched down.
          Current zone: <span style={{ color: actionTone, fontWeight: 700 }}> {analysis.deviationZone}</span>. Probabilities below are based on full available history in this data feed ({analysis.deviationSampleSize} days).
        </div>
        <div className="mb-3 text-xs rounded-lg border px-3 py-2" style={{ color: theme.textSecondary, borderColor: theme.border, background: theme.bgElevated }}>
          <div><b>Interpretation:</b> {deviationSummary} {raritySummary}</div>
          <div className="mt-1"><b>Histogram axes:</b> Y-axis = deviation buckets from 50DMA (in %). X-axis = frequency (% of historical days).</div>
          <div className="mt-1"><b>Percentile Rank:</b> fraction of historical days with deviation less than or equal to today. Lower percentile means deeper downside stretch.</div>
          <div className="mt-1"><b>One-Sided (Down):</b> probability of seeing a deviation at or below today (useful for downside oversold context).</div>
          <div className="mt-1"><b>One-Sided (Up):</b> probability of seeing a deviation at or above today (useful for upside overextension context).</div>
          <div className="mt-1"><b>Two-Sided Rarity:</b> probability of seeing an absolute deviation as large as today, in either direction.</div>
          <div className="mt-1"><b>Rule of thumb:</b> below 5% = rare, 5-15% = uncommon, 15-30% = moderate, above 30% = common.</div>
        </div>
        <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <MetricCard
            theme={theme}
            label="Percentile Rank"
            value={`${analysis.deviationPercentile.toFixed(1)}th`}
            subtext="Lower = more oversold vs 50DMA"
            helpText="Percent of historical observations less than or equal to current deviation."
          />
          <MetricCard
            theme={theme}
            label="One-Sided (Down)"
            value={`${analysis.oneSidedDownProb.toFixed(1)}%`}
            subtext="P(dev <= current)"
            helpText="Probability of seeing deviation at or below the current level (downside tail)."
          />
          <MetricCard
            theme={theme}
            label="One-Sided (Up)"
            value={`${analysis.oneSidedUpProb.toFixed(1)}%`}
            subtext="P(dev >= current)"
            helpText="Probability of seeing deviation at or above the current level (upside tail)."
          />
          <MetricCard
            theme={theme}
            label="Two-Sided Rarity"
            value={`${analysis.twoSidedAbsProb.toFixed(1)}%`}
            subtext="P(|dev| >= |current|)"
            helpText="Probability of seeing an absolute move at least as large as current, either up or down."
          />
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart
            layout="vertical"
            data={analysis.deviationHistogram}
            margin={{ top: 10, right: 24, left: 6, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: theme.textTertiary }}
              axisLine={{ stroke: theme.chartGrid }}
              tickLine={false}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={86}
              tick={{ fontSize: 10, fill: theme.textTertiary }}
              axisLine={{ stroke: theme.chartGrid }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: '8px', background: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, color: theme.text }}
              formatter={(v, k, p) => [`${Number(v).toFixed(1)}%`, `Frequency (${p.payload.count} bars)`]}
            />
            {analysis.currentDeviationBinLabel && (
              <ReferenceLine
                y={analysis.currentDeviationBinLabel}
                stroke={actionTone}
                strokeWidth={2}
                label={{ value: 'You are here', position: 'right', fill: actionTone, fontSize: 10 }}
              />
            )}
            <Bar dataKey="pct" name="% of days" radius={[0, 4, 4, 0]} minPointSize={3}>
              {analysis.deviationHistogram.map((b, i) => {
                const extreme = b.low <= -10 || b.high >= 10;
                const isCurrentBin = analysis.currentDeviationBinLabel === b.label;
                const fill = isCurrentBin ? actionTone : extreme ? tradePalette.histStretch : tradePalette.histNeutral;
                return <Cell key={`devbin-${i}`} fill={fill} fillOpacity={isCurrentBin ? 1 : 0.85} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard theme={theme} label="Yearly VWAP Bias" value={aboveYearlyVWAP ? 'Above (Long Bias)' : 'Below (Sell Rallies)'} />
        <MetricCard theme={theme} label="Value Area Status" value={inValue ? 'Inside Value (Chop)' : analysis.latest.close > analysis.vah ? 'Above VAH (Trend)' : 'Below VAL (Weakness)'} />
        <MetricCard theme={theme} label="Structure" value={analysis.hhhl ? 'HH + HL' : analysis.lhll ? 'LH + LL' : 'Mixed'} />
        <MetricCard theme={theme} label="ATR Regime" value={analysis.atrExpansion ? 'Expansion' : 'Compression'} subtext={Number.isFinite(analysis.volPercentile) ? `RV Percentile ${analysis.volPercentile.toFixed(1)}%` : 'RV N/A'} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard
          theme={theme}
          label="RVOL (20d)"
          value={Number.isFinite(analysis.rvol20) ? `${analysis.rvol20.toFixed(2)}x` : 'N/A'}
          subtext={`Volume regime: ${analysis.rvolRegime}`}
          helpText="Relative Volume = today's volume / average daily volume of the prior 20 sessions."
          tone={rvolTone}
        />
        <MetricCard
          theme={theme}
          label="Dist to POC"
          value={formatPctSigned(analysis.distToPocPct)}
          helpText="Percent distance from Point of Control (highest volume price in the profile window)."
          tone={pocTone}
        />
        <MetricCard
          theme={theme}
          label="Dist to VAH"
          value={formatPctSigned(analysis.distToVahPct)}
          helpText="Percent distance from Value Area High (upper boundary of the 70% volume area)."
          tone={vahTone}
        />
        <MetricCard
          theme={theme}
          label="Dist to VAL"
          value={formatPctSigned(analysis.distToValPct)}
          helpText="Percent distance from Value Area Low (lower boundary of the 70% volume area)."
          tone={valTone}
        />
        <MetricCard
          theme={theme}
          label="52W Percentile"
          value={Number.isFinite(analysis.yearlyPercentile) ? `${analysis.yearlyPercentile.toFixed(1)}%` : 'N/A'}
          subtext="0%=near 52W low, 100%=near 52W high"
          helpText="Current position within the 52-week high/low range."
          tone={yearlyPctTone}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          theme={theme}
          label="Trend Strength"
          value={analysis.trendStrengthLabel}
          subtext={Number.isFinite(analysis.trendStrengthScore) ? `Score ${analysis.trendStrengthScore.toFixed(0)}/100` : 'N/A'}
          helpText="Composite score from MA50-MA200 spread and MA50 slope. Higher means stronger directional trend."
          tone={trendTone}
        />
        <MetricCard
          theme={theme}
          label="ATR Band (1x)"
          value={`${formatPx(analysis.atrBand1Lower)} to ${formatPx(analysis.atrBand1Upper)}`}
          helpText="Price +/- 1 ATR from current close. Useful for near-term stop/target framing."
        />
        <MetricCard
          theme={theme}
          label="ATR Band (2x)"
          value={`${formatPx(analysis.atrBand2Lower)} to ${formatPx(analysis.atrBand2Upper)}`}
          helpText="Price +/- 2 ATR from current close. Wider risk envelope for swing scenarios."
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h4 className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: theme.textSecondary }}>Decision Tree (Auto)</h4>
          <ul className="space-y-1.5 text-xs" style={{ color: theme.textSecondary }}>
            <li>• Bullish if: above Yearly VWAP, VAH held, HH/HL, strong weekly close.</li>
            <li>• Bearish if: below Yearly VWAP, VAH rejection, LH/LL.</li>
            <li>• Otherwise: chop, reduce activity and wait for close confirmation.</li>
          </ul>
          <div className="mt-3 text-[11px] font-semibold" style={{ color: regimeTone }}>Current Classification: {analysis.regime}</div>
        </div>
        <div className="p-5 rounded-2xl border" style={{ background: theme.bgCard, borderColor: theme.border }}>
          <h4 className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: theme.textSecondary }}>Principle Mapping</h4>
          <ul className="space-y-1.5 text-xs" style={{ color: theme.textSecondary }}>
            <li>• Anchored VWAPs: Yearly, Cycle-Low, ATH, Regime anchor are auto-drawn.</li>
            <li>• Liquidity rails: Yearly High/Low are auto-drawn.</li>
            <li>• Volume profile: POC/VAH/VAL computed from 1Y volume-weighted distribution.</li>
            <li>• HTF trend: 20 EMA (weekly proxy), 50 DMA, 200 DMA are auto-drawn.</li>
            <li>• Volatility: ATR expansion + realized volatility percentile are auto-labeled.</li>
            <li>• OI/Funding: {analysis.notes.oiFunding}</li>
          </ul>
        </div>
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
      const response = await fetch(`/api/stock?ticker=${encodeURIComponent(symbol)}`, {
        headers: { Accept: 'application/json' },
      });
      const contentType = response.headers.get('content-type') || '';
      const rawBody = await response.text();
      const isJson = contentType.includes('application/json');
      const result = isJson
        ? JSON.parse(rawBody)
        : null;

      if (!response.ok) {
        const apiError = result?.error || result?.detail;
        if (apiError) throw new Error(apiError);
        if (!isJson) {
          throw new Error(`Server returned ${response.status} ${response.statusText}. Try redeploying latest API build.`);
        }
        throw new Error('Failed to fetch data');
      }

      if (!result || typeof result !== 'object') {
        throw new Error('Unexpected API response format. Expected JSON.');
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
      case 'trading': return <TradingTab data={data} theme={t} />;
      case 'institutional': return <InstitutionalOwnershipTab data={data} theme={t} />;
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
