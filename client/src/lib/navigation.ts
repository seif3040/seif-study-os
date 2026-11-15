import { BarChart3, BookOpen, CalendarDays, ClipboardList, NotebookPen, LibraryBig, CircleDollarSign, Gift, GraduationCap, LayoutDashboard, Settings, Users, Video } from "lucide-react";
export const menu = [
  ["النهارده", "/", LayoutDashboard], ["جدول الأسبوع", "/lesson-sources", Users], ["الدروس المتراكمة", "/backlog", BookOpen], ["خطة المنهج", "/study-plan", BookOpen], ["كتبي", "/study-library", LibraryBig], ["الواجبات", "/homework", ClipboardList], ["كشكول الأخطاء", "/mistakes", NotebookPen], ["مراجعة آخر السنة", "/year-review", CalendarDays], ["التقييمات", "/assessments", GraduationCap], ["الامتحانات", "/exams", GraduationCap], ["فيديو المذاكرة + البومودورو", "/study-video", Video], ["التحليلات", "/analytics", BarChart3], ["التقويم", "/calendar", CalendarDays], ["الهدايا", "/rewards", Gift], ["Coins", "/coins", CircleDollarSign], ["الإعدادات", "/settings", Settings],
] as const;

export const mobileLabels: Record<string, string> = { "/study-plan": "المنهج", "/study-video": "المذاكرة", "/lesson-sources": "الأسبوع", "/backlog": "المتراكم", "/mistakes": "الأخطاء", "/year-review": "المراجعة" };
