const librarySections = ["/homework", "/mistakes", "/year-review"] as const;

export const defaultDesktopTabs = ["/", "/today", "/lesson-sources", "/backlog", "/study-plan", "/study-library", ...librarySections, "/assessments", "/exams", "/study-video", "/quran", "/music", "/analytics", "/calendar", "/rewards", "/coins", "/settings"] as const;
export const defaultMobileTabs = ["/today", "/study-plan", "/calendar", "/study-video", "/settings"] as const;
export type NavigationPrefs = { mobile: string[]; desktop: string[]; libraryTabSeen?: boolean; librarySectionsSeen?: boolean; quranTabSeen?: boolean; musicTabSeen?: boolean; welcomeTabSeen?: boolean; notebookTabSeen?: boolean };

export function mobileNavigation(prefs?: NavigationPrefs): readonly string[] {
  return prefs ? (prefs.welcomeTabSeen ? prefs.mobile : prefs.mobile.map(path => path === "/" ? "/today" : path)) : defaultMobileTabs;
}

export function desktopNavigation(prefs?: NavigationPrefs): readonly string[] {
  if (!prefs) return defaultDesktopTabs;
  const base = prefs.welcomeTabSeen || prefs.desktop.includes("/today") ? prefs.desktop
    : ["/", ...prefs.desktop.map(path => path === "/" ? "/today" : path)];
  const withQuran = prefs.quranTabSeen || base.includes("/quran") ? base
    : base.flatMap(path => path === "/settings" ? ["/quran", path] : [path]);
  const musicAnchor = withQuran.includes("/quran") ? "/quran" : withQuran[0];
  const withMusic = prefs.musicTabSeen || withQuran.includes("/music") ? withQuran
    : withQuran.flatMap(path => path === musicAnchor ? [path, "/music"] : [path]);
  const desktop = withMusic.filter(path => path !== "/notebooks");
  if (prefs.librarySectionsSeen) return desktop;
  const missing = librarySections.filter(path => !prefs.desktop.includes(path));
  if (prefs.desktop.includes("/study-library")) {
    return desktop.flatMap(path => path === "/study-library" ? [path, ...missing] : [path]);
  }
  return desktop.flatMap(path => path === "/settings"
    ? [...(prefs.libraryTabSeen ? [] : ["/study-library"]), ...missing, path] : [path]);
}
