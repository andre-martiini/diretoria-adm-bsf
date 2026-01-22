/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./App.tsx",
        "./index.tsx",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./utils/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Poppins"', 'sans-serif'],
            },
            colors: {
                ifes: {
                    green: '#2f9e41',
                    red: '#cd191e',
                }
            }
        },
    },
    plugins: [],
}
