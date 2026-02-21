/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      colors: {
        apple: {
          blue: '#007aff',
          green: '#34c759',
          red: '#ff3b30',
          orange: '#ff9500',
          gray: '#8e8e93',
          lightGray: '#d1d1d6',
          bg: '#f2f2f7',
          card: '#ffffff',
          text: '#1c1c1e',
          textMuted: '#6c6c70',
          border: '#e5e5ea',
        },
        appleDark: {
          blue: '#0a84ff',
          green: '#32d74b',
          red: '#ff453a',
          orange: '#ff9f0a',
          gray: '#8e8e93',
          lightGray: '#3a3a3c',
          bg: '#000000',
          card: '#1c1c1e',
          text: '#f2f2f7',
          textMuted: '#ebebf599',
          border: '#38383a',
        },
      },
      boxShadow: {
        'apple': '0 4px 24px rgba(0, 0, 0, 0.04)',
        'apple-lg': '0 8px 32px rgba(0, 0, 0, 0.08)',
        'apple-dark': '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      }
    },
  },
  plugins: [],
}