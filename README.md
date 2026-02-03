# Stock Valuation Calculator

Professional stock valuation calculator with DCF, Graham Number, and multiple valuation methods. Analyze any stock with comprehensive financial metrics, charts, and intrinsic value estimation.

## Features

- **Valuation Methods**: DCF Model, Graham Number, P/E, PEG, P/S, P/B ratios
- **Key Metrics**: 12+ financial metrics including Market Cap, EV, debt ratios, yields
- **Interactive Charts**: Margins, Returns (ROE/ROIC/ROA), Income Statement, Cash Flow, Balance Sheet
- **Historical Data**: 10-year trend analysis with detailed ratio tables
- **Professional Design**: Clean monospace typography, responsive layout

## Quick Deploy to Vercel

### Step 1: Get Your API Key

1. Go to [Financial Modeling Prep](https://financialmodelingprep.com/developer/docs/)
2. Sign up for a free account (250 requests/day)
3. Copy your API key

### Step 2: Push to GitHub

```bash
# Initialize git repo
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Stock Valuation Calculator"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/stock-valuation-calculator.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New Project"
3. Import your `stock-valuation-calculator` repository
4. **IMPORTANT**: Add your environment variable:
   - Click "Environment Variables"
   - Name: `FMP_API_KEY`
   - Value: `your_api_key_from_step_1`
5. Click "Deploy"

Your site will be live at `https://stock-valuation-calculator.vercel.app` (or your custom domain)!

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local with your API key
echo "FMP_API_KEY=your_api_key" > .env.local

# Run development server
npm run dev

# Open http://localhost:3000
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `FMP_API_KEY` | Financial Modeling Prep API key | Yes |

## Tech Stack

- **Framework**: Next.js 14
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Font**: JetBrains Mono
- **API**: Financial Modeling Prep

## API Rate Limits

- **Free tier**: 250 requests/day
- **Starter**: 300 requests/min
- Each stock analysis uses ~8 API calls

## License

MIT
