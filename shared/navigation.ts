export const defaultDesktopTabs = ["/", "/lesson-sources", "/backlog", "/study-plan", "/study-library", "/assessments", "/exams", "/study-video", "/analytics", "/calendar", "/rewards", "/coins", "/settings"] as const;
export const defaultMobileTabs = ["/", "/study-plan", "/calendar", "/study-video", "/settings"] as const;
export type NavigationPrefs = { mobile: string[]; desktop: string[]; libraryTabSeen?: boolean };
