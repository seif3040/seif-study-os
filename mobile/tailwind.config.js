const { themeColors } = require("./theme.config");
const plugin = require("tailwindcss/plugin");

module.exports = {
  content: ["./app/**/*.{js,ts,tsx}", "./components/**/*.{js,ts,tsx}", "./hooks/**/*.{js,ts,tsx}", "./lib/**/*.{js,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: { colors: Object.fromEntries(Object.entries(themeColors).map(([name, swatch]) => [name, swatch.light])) } },
  plugins: [plugin(() => {})],
};
