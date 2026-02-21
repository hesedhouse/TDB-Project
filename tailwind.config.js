/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontWeight: {
        brand: '900',
      },
      colors: {
        'neon-orange': '#FF5F00',
        'midnight-black': '#000000',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'pixel-burst': 'pixel-burst 0.6s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)' },
          '33%': { transform: 'translateY(-20px) translateX(10px)' },
          '66%': { transform: 'translateY(10px) translateX(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 0.6, boxShadow: '0 0 10px rgba(255, 95, 0, 0.5)' },
          '50%': { opacity: 1, boxShadow: '0 0 20px rgba(255, 95, 0, 0.8)' },
        },
        'pixel-burst': {
          '0%': { transform: 'scale(1)', opacity: 1 },
          '50%': { transform: 'scale(1.2)', opacity: 0.8 },
          '100%': { transform: 'scale(0)', opacity: 0 },
        },
      },
    },
  },
  plugins: [],
}
