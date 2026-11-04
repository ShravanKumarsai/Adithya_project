import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 18px 60px rgba(25, 122, 145, 0.25)',
      },
      colors: {
        midnight: '#0D1727',
        panel: '#17263A',
        accent: '#69CAD8',
        violet: '#A798F5',
        success: '#71D2B0',
        warning: '#EDB96C',
        danger: '#EF7F89',
      },
    },
  },
  plugins: [forms],
}

