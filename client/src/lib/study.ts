import { toast } from "sonner";

export const money = new Intl.NumberFormat("ar-EG");
export const arabicDate = new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const shortDate = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" });

export function minutesLabel(minutes: number) { return `${money.format(Math.round(minutes / 60 * 10) / 10)} ساعة`; }
export function inputDate(value?: Date | string | null) { if (!value) return ""; return new Date(value).toISOString().slice(0, 10); }
export function errorText(error: unknown) { return error instanceof Error ? error.message : "تعذر إتمام العملية. حاول مرة أخرى."; }
export function completionToast(result: any, defaultAmount?: number) { if (result?.awarded) toast.success(`أحسنت! ربحت +${money.format(defaultAmount ?? 0)} Coins`); else if (result?.alreadyCompleted) toast.message("تم تسجيل هذا الإنجاز مسبقًا."); (result?.unlocks ?? []).forEach((unlock: any) => toast.success(`🏆 تم فتح إنجاز: ${unlock.title}`)); }
export function uuid() { return crypto.randomUUID(); }
export const rarityNames: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic" };
export const rarityColor: Record<string, string> = { common: "bg-slate-100 text-slate-700", uncommon: "bg-emerald-100 text-emerald-800", rare: "bg-sky-100 text-sky-800", epic: "bg-violet-100 text-violet-800", legendary: "bg-amber-100 text-amber-900", mythic: "bg-rose-100 text-rose-900" };
