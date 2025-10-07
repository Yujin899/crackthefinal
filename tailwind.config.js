// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./home.html", "./src/**/*.{js,ts,jsx,tsx}"], // Adjust according to your project structure
  theme: {
    extend: {
      colors: {
        'primary-gold': '#FFD700', // Primary Accent
        'vibrant-gold': '#FFBF00', // Primary Accent (alternative)
        'deep-blue': '#004AAD',     // Main Brand Color
        'dark-royal-blue': '#192A56', // Main Brand Color (alternative)
        'action-red': '#DC143C',    // Secondary Accent
        'vivid-red': '#FF4136',     // Secondary Accent (alternative)
        'light-gray': '#F5F5F5',    // Neutral Background
        'slate-gray': '#6C7A89',    // Medium Neutral
        'charcoal': '#333333',      // Dark Neutral (for text)
        'electric-cyan': '#00FFFF', // Optional Tertiary Accent
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'Nunito Sans', 'sans-serif'], // Modern sans-serif
      },
    },
  },
  plugins: [],
}