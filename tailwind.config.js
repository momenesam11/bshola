/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'sans-serif'],
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

