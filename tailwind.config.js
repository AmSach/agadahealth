/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Agada brand palette
        agada: {
          green: '#0F7A5A',      // Trust, health, government
          'green-light': '#1AA97A',
          'green-dark': '#0A5740',
          saffron: '#E87722',    // India, warmth
          'saffron-light': '#F59B4B',
          navy: '#1A2B4A',       // Authority, clarity
          'navy-light': '#253B63',
          cream: '#F8F5F0',      // Clean, accessible background
          'warm-white': '#FEFDF9',
          alert: '#D32F2F',      // Fake medicine warnings
          'alert-light': '#FFEBEE',
          verified: '#1B5E20',   // CDSCO verified
          'verified-light': '#E8F5E9',
          savings: '#E65100',    // Savings highlight
          'savings-light': '#FFF3E0',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Georgia', 'serif'],
        mono: ['Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'scan-line': 'scanLine 2s linear infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(400%)' },
        },
      },
      boxShadow: {
        'card': '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
      }
    },
  },
  plugins: [],
}
