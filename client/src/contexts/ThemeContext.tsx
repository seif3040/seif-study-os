import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const studyThemes = [
  { id: "violet", label: "لون اللافندر", mode: "light", colors: ["#f7f4ff", "#592bc4", "#d9c0ff"] },
  { id: "mint", label: "نعناع", mode: "light", colors: ["#effbf5", "#12654f", "#a9f4cd"] },
  { id: "peach", label: "غروب", mode: "light", colors: ["#fff6ef", "#a03445", "#ffcbb1"] },
  { id: "midnight", label: "ليل نيون", mode: "dark", colors: ["#101129", "#c7b5ff", "#93f4db"] },
  { id: "graphite", label: "جرافيت", mode: "dark", colors: ["#101716", "#b9f36c", "#c3f777"] },
] as const;

export type ThemeId = typeof studyThemes[number]["id"];
type Mode = "light" | "dark";
const preferenceKey = "seif-study-theme";

function getTheme(fallback: ThemeId): ThemeId {
  try {
    const saved = localStorage.getItem(preferenceKey);
    const matched = studyThemes.find(theme => theme.id === saved);
    if (matched) return matched.id;
    if (localStorage.getItem("theme") === "dark") return "midnight";
  } catch { /* Storage is optional. */ }
  return fallback;
}

const ThemeContext = createContext<{
  theme: Mode; themeId: ThemeId; setThemeId: (id: ThemeId) => void; toggleTheme?: () => void; switchable: boolean;
} | undefined>(undefined);

export function ThemeProvider({
  children, defaultTheme = "light", switchable = false,
}: { children: ReactNode; defaultTheme?: Mode; switchable?: boolean }) {
  const fallback = defaultTheme === "dark" ? "midnight" : "violet";
  const [themeId, setThemeId] = useState<ThemeId>(() => switchable ? getTheme(fallback) : fallback);
  const theme = studyThemes.find(option => option.id === themeId)?.mode ?? defaultTheme;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.studyTheme = themeId;
    root.classList.toggle("dark", theme === "dark");
    if (switchable) {
      try {
        localStorage.setItem(preferenceKey, themeId);
        localStorage.setItem("theme", theme);
      } catch { /* Storage is optional. */ }
    }
  }, [themeId, theme, switchable]);
  useEffect(() => {
    if (!switchable) return;
    const sync = (event: StorageEvent) => {
      if (event.key === preferenceKey) setThemeId(getTheme(fallback));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [fallback, switchable]);
  const toggleTheme = switchable ? () => setThemeId(theme === "dark" ? "violet" : "midnight") : undefined;
  return <ThemeContext.Provider value={{ theme, themeId, setThemeId, toggleTheme, switchable }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
