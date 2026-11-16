const librarySections = ["/homework", "/mistakes", "/year-review"] as const;

export const defaultDesktopTabs = ["/", "/lesson-sources", "/backlog", "/study-plan", "/study-library", ...librarySections, "/assessments", "/exams", "/study-video", "/quran", "/music", "/analytics", "/calendar", "/rewards", "/coins", "/settings"] as const;
export const defaultMobileTabs = ["/", "/study-plan", "/calendar", "/study-video", "/settings"] as const;
export type NavigationPrefs = { mobile: string[]; desktop: string[]; libraryTabSeen?: boolean; librarySectionsSeen?: boolean; quranTabSeen?: boolean; musicTabSeen?: boolean };

export function desktopNavigation(prefs?: NavigationPrefs): readonly string[] {
  if (!prefs) return defaultDesktopTabs;
  const withQuran = prefs.quranTabSeen || prefs.desktop.includes("/quran") ? prefs.desktop
    : prefs.desktop.flatMap(path => path === "/settings" ? ["/quran", path] : [path]);
  const musicAnchor = withQuran.includes("/quran") ? "/quran" : withQuran[0];
  const desktop = prefs.musicTabSeen || withQuran.includes("/music") ? withQuran
    : withQuran.flatMap(path => path === musicAnchor ? [path, "/music"] : [path]);
  if (prefs.librarySectionsSeen) return desktop;
  const missing = librarySections.filter(path => !prefs.desktop.includes(path));
  if (prefs.desktop.includes("/study-library")) {
    return desktop.flatMap(path => path === "/study-library" ? [path, ...missing] : [path]);
  }
  return desktop.flatMap(path => path === "/settings"
    ? [...(prefs.libraryTabSeen ? [] : ["/study-library"]), ...missing, path] : [path]);
}
