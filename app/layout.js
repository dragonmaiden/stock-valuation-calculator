import './globals.css'

export const metadata = {
  title: 'SVC — Stock Valuation Calculator',
  description: 'Professional fundamental analysis, intrinsic value estimation, and trading regime detection for any US-listed equity.',
  keywords: 'stock valuation, DCF analysis, intrinsic value, fundamental analysis, trading signals',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body className="antialiased transition-colors duration-300">
        {children}
      </body>
    </html>
  )
}