import { NextResponse } from 'next/server';

const API_BASE = 'https://financialmodelingprep.com/api/v3';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
  }

  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    const endpoints = [
      `${API_BASE}/profile/${ticker}?apikey=${apiKey}`,
      `${API_BASE}/income-statement/${ticker}?period=annual&limit=10&apikey=${apiKey}`,
      `${API_BASE}/balance-sheet-statement/${ticker}?period=annual&limit=10&apikey=${apiKey}`,
      `${API_BASE}/cash-flow-statement/${ticker}?period=annual&limit=10&apikey=${apiKey}`,
      `${API_BASE}/ratios/${ticker}?period=annual&limit=10&apikey=${apiKey}`,
      `${API_BASE}/key-metrics/${ticker}?period=annual&limit=10&apikey=${apiKey}`,
      `${API_BASE}/quote/${ticker}?apikey=${apiKey}`,
      `${API_BASE}/discounted-cash-flow/${ticker}?apikey=${apiKey}`,
    ];

    const responses = await Promise.all(
      endpoints.map(url => fetch(url, { next: { revalidate: 300 } }))
    );

    const [profile, income, balance, cashflow, ratios, metrics, quote, dcf] = await Promise.all(
      responses.map(res => res.json())
    );

    if (!profile || profile.length === 0 || profile['Error Message']) {
      return NextResponse.json({ error: 'Invalid ticker or no data available' }, { status: 404 });
    }

    return NextResponse.json({
      profile: profile[0],
      income: income.reverse(),
      balance: balance.reverse(),
      cashflow: cashflow.reverse(),
      ratios: ratios.reverse(),
      metrics: metrics.reverse(),
      quote: quote[0],
      dcf: dcf[0]
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch stock data' }, { status: 500 });
  }
}
