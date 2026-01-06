// Tailwind CSS v4 configuration
// This file is referenced via @config directive in src/styles/index.css

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        firebase: {
          dark: '#121212',
          card: '#1e1e1e',
          sidebar: '#141414',
          border: '#2c2c2c',
          blue: {
            DEFAULT: '#1a73e8', // Google Blue
            hover: '#185abc',
          },
          text: {
            primary: '#e8eaed',
            secondary: '#9aa0a6',
            muted: '#5f6368',
          },
          success: '#1e8e3e',
          warning: '#f9ab00',
          error: '#d93025',
        }
      }
    },
  },
  plugins: [],
}
