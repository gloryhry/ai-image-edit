/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'ios-gray': '#F2F2F7',
                'cool-gray': '#F9F9FB',
                'deep-black': '#1C1C1E',
            },
            boxShadow: {
                'soft-spread': '0 24px 48px -12px rgba(0, 0, 0, 0.08)',
                'inner-cut': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
            },
            backdropBlur: {
                'glass-40': '40px',
                'glass-60': '60px',
            },
            borderRadius: {
                'ios-lg': '24px',
                'ios-md': '24px',
                'ios-sm': '12px',
            },
            fontFamily: {
                sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
