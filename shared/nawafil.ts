export const nawafil = ["سنة الفجر", "الضحى", "سنة الظهر القبلية", "سنة الظهر البعدية", "سنة المغرب", "سنة العشاء", "الوتر", "قيام الليل"] as const;
export function prayerLoggingEnd(prayer: string, start: number, dhuhr: number) {
  return prayer === "Fajr" ? dhuhr : start + 60;
}
