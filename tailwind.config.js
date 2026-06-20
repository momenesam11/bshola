/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) translateX(0)' },
          '50%': { transform: 'translateY(-14px) translateX(4px)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(10px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.15)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(20px, -15px)' },
          '66%': { transform: 'translate(-15px, 10px)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease-out',
        'bounce-slow': 'bounceSlow 3.5s ease-in-out infinite',
        float: 'float 5s ease-in-out infinite',
        'float-slow': 'floatSlow 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 6s ease-in-out infinite',
        drift: 'drift 12s ease-in-out infinite',
      },
      colors: {
        // Purple — primary brand color
        primary: {
          DEFAULT: '#3B0764',
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#3B0764',
          800: '#2E1065',
          900: '#1E0C42',
        },
        // Teal — accent brand color (replaces old emerald)
        accent: {
          DEFAULT: '#16B89A',
          50: '#D7F5EE',
          100: '#BFEFE3',
          200: '#8FE0CD',
          300: '#5ED0B7',
          400: '#2EC1A1',
          500: '#16B89A',
          600: '#0E8F76',
          700: '#0B7561',
          800: '#08594A',
          900: '#053D33',
        },
      },
    },
  },
  plugins: [],
}

