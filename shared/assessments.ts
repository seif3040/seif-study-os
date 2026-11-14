export const assessmentGroups = [
  { subject: "عربي", units: [
    [1, "العلم والضمير", [7, 13, 17, 20, 24]],
    [2, "سلطان الكلمة الرقمية", [28, 37, 44, 50, 56]],
    [3, "الإنسان وكرامته", [62, 69, 74, 78, 84]],
  ] },
  { subject: "تاريخ", units: [
    [1, "مصر بين الماضي والحاضر", [6, 11, 16, 22, 29]],
    [2, "تحولات القوة وبناء الوعي", [37, 42, 47, 52, 56]],
    [3, "مصر وقضايا التحرر الوطني", [63, 68, 73, 78, 82]],
  ] },
  { subject: "برمجة", units: [
    [1, "تكنولوجيا المعلومات والمجتمع", [6, 13, 19, 26]],
    [2, "الأمن السيبراني", [32, 39, 45]],
    [3, "تطبيقات الويب", [50, 55, 60]],
    [4, "تصميم الويب والوسائط", [65, 71, 77, 83]],
  ] },
  { subject: "انجليزي", units: [
    [1, "Living Well in a Complex World", [6, 11, 15]],
    [2, "Leisure Time", [20, 25, 29]],
    [3, "Echoes of the Past", [39, 44, 48]],
    [4, "The Power of Choice", [53, 59, 63]],
    [5, "The Greenhouse Effect", [72, 77, 81]],
  ] },
] as const;

export const assessmentCatalog = assessmentGroups.flatMap(({ subject, units }, groupIndex) =>
  Array.from(units as readonly (readonly [number, string, readonly number[]])[]).flatMap(([unit, unitTitle, pages]) =>
    pages.map((page, index) => ({
      id: (groupIndex + 1) * 10000 + unit * 100 + index + 1,
      subject, unit, unitTitle, page, title: "تقييم " + (index + 1) + " · " + unitTitle,
    })),
  ),
);

export type AssessmentStatus = "pending" | "backlog" | "completed";
