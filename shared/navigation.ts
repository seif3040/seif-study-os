const librarySections = ["/homework", "/mistakes", "/year-review"] as const;

export const defaultDesktopTabs = ["/", "/lesson-sources", "/backlog", "/study-plan", "/study-library", ...librarySections, "/assessments", "/exams", "/study-video", "/analytics", "/calendar", "/rewards", "/coins", "/settings"] as const;
export const defaultMobileTabs = ["/", "/study-plan", "/calendar", "/study-video", "/settings"] as const;
export type NavigationPrefs = { mobile: string[]; desktop: string[]; libraryTabSeen?: boolean; librarySectionsSeen?: boolean };

export function desktopNavigation(prefs?: NavigationPrefs): readonly string[] {
  if (!prefs) return defaultDesktopTabs;
  if (prefs.librarySectionsSeen) return prefs.desktop;
  const missing = librarySections.filter(path => !prefs.desktop.includes(path));
  if (prefs.desktop.includes("/study-library")) {
    return prefs.desktop.flatMap(path => path === "/study-library" ? [path, ...missing] : [path]);
  }
  return prefs.desktop.flatMap(path => path === "/settings"
    ? [...(prefs.libraryTabSeen ? [] : ["/study-library"]), ...missing, path] : [path]);
}
