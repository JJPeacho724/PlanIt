import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "./layout/**/*.{ts,tsx}",
    "../../packages/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        inter: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: { 
        xs: ['12px', '1.3'], 
        sm: ['13px', '1.3'], 
        base: ['14px', '1.35'],
        lg: ['18px', { lineHeight: '1.25' }],
        xl: ['20px', { lineHeight: '1.25' }],
        '2xl': ['24px', { lineHeight: '1.25' }],
      },
      spacing: { 
        1: '4px', 
        1.5: '6px', 
        2: '8px', 
        2.5: '10px', 
        3: '12px', 
        3.5: '14px', 
        4: '16px',
        '6': '24px',
        '8': '32px',
      },
      colors: {
        bg: { DEFAULT: 'hsl(220 20% 98%)', dark: 'hsl(222 30% 7%)' },
        surface: '#f8fafc',
        text: { DEFAULT: '#0f172a', muted: '#334155' },
        card: { DEFAULT: 'hsl(0 0% 100% / 0.7)', dark: 'hsl(222 20% 12% / 0.6)' },
        border: 'hsl(220 14% 90%)',
        muted: 'hsl(220 8% 94%)',
        ring: 'hsl(222 85% 53%)',
        primary: '#3a75ff',
        success: '#16a34a',
        danger: '#ef4444',
        accent: {
          50:'#eef7ff',100:'#d6ecff',200:'#add7ff',300:'#7fbaff',
          400:'#5898ff',500:'#3a75ff',600:'#285dfa',700:'#244dd2',
          800:'#1f3ea6',900:'#1b357f'
        }
      },
      borderRadius: { xl: '1rem', '2xl': '1.25rem' },
      boxShadow: {
        soft: '0 6px 24px -6px rgba(0,0,0,.08)',
        card: '0 8px 30px rgba(0,0,0,.06)'
      },
      backdropBlur: { xs: '2px' },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config

