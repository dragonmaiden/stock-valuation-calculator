import './globals.css'

export const metadata = {
  title: 'Stock Valuation Calculator | Professional Fundamental Analysis',
  description: 'Professional stock valuation calculator with DCF, Graham Number, and multiple valuation methods. Analyze any stock with comprehensive financial metrics, charts, and intrinsic value estimation.',
  keywords: 'stock valuation, DCF calculator, Graham Number, intrinsic value, stock analysis, financial ratios, ROE, ROIC, P/E ratio',
  openGraph: {
    title: 'Stock Valuation Calculator',
    description: 'Professional fundamental analysis & intrinsic value estimation for any stock',
    type: 'website',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  )
}
