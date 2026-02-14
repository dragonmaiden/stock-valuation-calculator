
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function testAPIs() {
    console.log('--- Testing Yahoo Finance ---');
    try {
        const quote = await yahooFinance.quote('AAPL');
        console.log('✅ Yahoo Quote success:', quote.symbol, quote.regularMarketPrice);
    } catch (error) {
        console.error('❌ Yahoo Quote failed:', error.message);
        if (error.errors) console.error(JSON.stringify(error.errors, null, 2));
    }

    try {
        const period2 = new Date();
        const period1 = new Date(period2);
        period1.setFullYear(period1.getFullYear() - 10);

        console.log('Fetching 10 years of history...');
        const start = Date.now();
        const historical = await yahooFinance.historical('AAPL', {
            period1,
            period2,
            interval: '1d'
        });
        console.log(`✅ Yahoo Historical success, count: ${historical.length}, time: ${Date.now() - start}ms`);
    } catch (error) {
        console.error('❌ Yahoo Historical failed:', error.message);
    }

    console.log('--- Testing Yahoo quoteSummary ---');
    try {
        const summary = await yahooFinance.quoteSummary('AAPL', {
            modules: [
                'summaryDetail',
                'defaultKeyStatistics',
                'financialData',
                'insiderTransactions',
                'assetProfile',
                'institutionOwnership',
                'fundOwnership',
                'majorHoldersBreakdown',
            ]
        });
        console.log('✅ Yahoo quoteSummary success');
    } catch (error) {
        console.error('❌ Yahoo quoteSummary failed:', error.message);
        if (error.errors) console.error(JSON.stringify(error.errors, null, 2));
    }

    console.log('\n--- Testing SEC.gov ---');
    try {
        const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
            headers: { 'User-Agent': 'StockValuationCalculator/1.0 (admin@stockvaluationcalculator.app)' }
        });
        if (response.ok) {
            const data = await response.json();
            console.log('✅ SEC Tickers success, count:', Object.keys(data).length);
        } else {
            console.error('❌ SEC Tickers failed:', response.status, response.statusText);
            const text = await response.text();
            console.log('Response body:', text.slice(0, 200));
        }
    } catch (error) {
        console.error('❌ SEC Tickers failed (network):', error.message);
    }
}

testAPIs();
