export const studyEfforts = {
  light: { label: "خفيف", minutes: 25 },
  normal: { label: "عادي", minutes: 50 },
  focused: { label: "مركز", minutes: 90 },
} as const;

export type StudyEffort = keyof typeof studyEfforts;
export type StudyItem = { kind: "lesson" | "homework"; id: number };
export type WeeklyGoal = { kind: "backlog"; subjectId: number; target: number; lessonIds: number[] }
  | { kind: "homework"; taskId: number; deadline: string | null };
export type WeeklyStudy = { effort?: StudyEffort; start?: StudyItem; goal?: WeeklyGoal };
