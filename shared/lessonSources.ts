export type LessonDelivery = "online" | "in_person" | "hybrid";
export type LessonSourceRole = "primary" | "review" | "support";

export type LessonSourceDraft = {
  subject: string;
  platform: string;
  teacherName: string;
  delivery: LessonDelivery;
  role: LessonSourceRole;
  url?: string;
  location?: string;
  weeklyPlan?: string;
  notes?: string;
};

export function subjectKey(value: string) {
  return value.trim().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[\u064B-\u065F]/g, "")
    .replace(/^ال/, "").toLowerCase();
}

export function hybridHomeworkSources<T extends { id: number; subject: string; delivery: LessonDelivery; active: boolean }>(
  sources: readonly T[], subject: string, sourceId?: number,
) {
  return sources.filter(source => source.active && source.delivery === "hybrid"
    && (sourceId === undefined ? subjectKey(source.subject) === subjectKey(subject) : source.id === sourceId));
}

export const seifLessonSourceDefaults: LessonSourceDraft[] = [
  {
    subject: "العربي",
    platform: "منصة بسطتهالك",
    teacherName: "محمد صلاح",
    delivery: "online",
    role: "primary",
    url: "https://bassthalk.com/userprofile/home",
    notes: "المصدر الأساسي للعربي. أضف عدد الدروس الأسبوعية لاحقًا.",
  },
  {
    subject: "التاريخ",
    platform: "حصة حضور",
    teacherName: "أحمد غنيم",
    delivery: "in_person",
    role: "primary",
    notes: "المصدر الأساسي للفهم والسؤال المباشر. أضف المكان والموعد لاحقًا.",
  },
  {
    subject: "التاريخ",
    platform: "Massar Academy",
    teacherName: "نادر الجورج",
    delivery: "online",
    role: "review",
    url: "https://app.massar-academy.net/student",
    notes: "للمراجعة، الواجبات، وسد الفجوات بعد حصة الحضور.",
  },
  {
    subject: "البرمجة",
    platform: "منصة المهندس كمال المراكبي",
    teacherName: "كمال المراكبي",
    delivery: "online",
    role: "primary",
    url: "https://kamalelmarakby.com/userprofile/home",
    notes: "يمكن تغيير أسلوب المتابعة إلى حضور أو هجين بعد حسم اختيارك.",
  },
  {
    subject: "الإنجليزي",
    platform: "منصة Mr Englishawy",
    teacherName: "إنجلشاوي",
    delivery: "online",
    role: "primary",
    url: "https://www.mrenglishawy.com/ar/dashboard",
    notes: "أضف مواعيد المحاضرات والواجبات عند استلامها.",
  },
  {
    subject: "الإنجليزي",
    platform: "منصة مناهج",
    teacherName: "جينو",
    delivery: "online",
    role: "review",
    url: "https://manaheg.com/dashboard",
    notes: "مصدر ثانٍ للإنجليزي مع إنجلشاوي؛ حدّد لاحقًا المصدر الأساسي بعد أول أسبوعين من المتابعة.",
  },
  {
    subject: "الألماني",
    platform: "Allango",
    teacherName: "فراو بسنت",
    delivery: "online",
    role: "primary",
    url: "https://www.allango.net/",
    notes: "مصدر الألماني: خصص له مفردات، واجبًا قصيرًا، ومراجعة أسبوعية دون مزاحمة مواد البكالوريا.",
  },
];
