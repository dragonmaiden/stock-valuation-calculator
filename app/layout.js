import './globals.css'

export const metadata = {
  title: 'Valuation | Clarity in Numbers',
  description: 'A beautifully simple tool for finding the intrinsic value of great companies. Effortless DCF analysis and fundamental insights.',
  keywords: 'stock valuation, simple DCF, clean intrinsic value, fundamental analysis',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body className="antialiased font-sans bg-apple-bg dark:bg-appleDark-bg text-apple-text dark:text-appleDark-text transition-colors duration-300">
        {children}
      </body>
    </html>
  )
}