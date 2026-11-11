import { useEffect, useRef, useState } from "react";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { SeifyVoiceControl } from "@/components/SeifyVoiceControl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { useArabicVoice } from "@/hooks/useArabicVoice";
import { Bot, Check, ChevronDown, Compass, Mic, ShieldCheck, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const quickPrompts = ["أعمل إيه النهارده؟", "ضيف مهمة مراجعة فيزياء", "خلّي مهمة حل الواجب بكرة", "خلّي أولوية المراجعة مهمة"];
const routeLabels: Record<string, string> = {
  "/": "لوحة التحكم", "/tasks": "كل المهام", "/calendar": "التقويم والجدول اليومي",
  "/lesson-sources": "مصادر دروسي", "/study-plan": "خطة المنهج", "/exams": "الامتحانات",
  "/pomodoro": "Pomodoro", "/focus-lounge": "استراحة محسوبة", "/study-video": "فيديو المذاكرة",
  "/habits": "العادات", "/analytics": "التحليلات", "/rewards": "الهدايا", "/coins": "Coins", "/settings": "الإعدادات",
};
const pagePrompts: Record<string, string[]> = {
  "/study-plan": ["قولي تقدّمي في خطة المنهج", "ساعدني أضيف درس"],
  "/calendar": ["رتب لي مذاكرة النهارده", "ساعدني أجدول مهمة"],
  "/exams": ["عندي كام امتحان جاي؟", "ساعدني أضيف امتحان"],
  "/pomodoro": ["ابدأ جلسة تركيز ٢٥ دقيقة", "ذاكرت كام ساعة؟"],
  "/habits": ["اقترح عادة للمراجعة", "ضيف عادة مراجعة يومية"],
  "/analytics": ["لخص تقدّمي", "اقترح خطوة لتحسين مذاكرتي"],
  "/rewards": ["رصيدي كام؟", "ساعدني أضيف هدية"],
  "/coins": ["رصيدي كام؟", "اقترح طريقة أعوّض الرصيد"],
  "/lesson-sources": ["إزاي أنظم مصادر دروسي؟"],
  "/study-video": ["ساعدني أقسّم مذاكرة الفيديو"],
  "/focus-lounge": ["اقترح استراحة قصيرة"],
  "/settings": ["إيه اللي تقدر تساعدني فيه؟"],
};
function actionDescription(plan: Plan) {
  const title = "«" + plan.title + "»";
  const parent = "«" + (plan.parentTitle ?? "") + "»";
  switch (plan.actionType) {
    case "add_task": return "إضافة مهمة " + title + (plan.scheduledFor ? " يوم " + plan.scheduledFor : "");
    case "add_subject": return "إضافة مادة " + title;
    case "add_chapter": return "إضافة فصل " + title + " في مادة " + parent;
    case "add_lesson": return "إضافة درس " + title + " في فصل " + parent;
    case "complete_task": return "إكمال مهمة " + title;
    case "complete_lesson": return "إكمال درس " + title + (plan.parentTitle ? " في " + parent : "");
    case "add_exam": return "إضافة امتحان " + title + (plan.scheduledFor ? " يوم " + plan.scheduledFor : "");
    case "archive_exam": return "أرشفة امتحان " + title;
    case "restore_exam": return "استرجاع امتحان " + title;
    case "add_reward": return "إضافة هدية " + title + " بسعر " + plan.value + " Coins";
    case "hide_reward": return "إخفاء هدية " + title;
    case "restore_reward": return "استرجاع هدية " + title;
    case "start_focus": return "بدء جلسة تركيز " + plan.value + " دقيقة";
    default: return "إضافة " + title;
  }
}
export type Plan = { reply: string; actionType: string; title: string; targetTitle: string; parentTitle?: string; value?: number; priority: "urgent" | "medium" | "low"; scheduledFor: string; frequency: "daily" | "weekly"; target: number; route: string; requiresConfirmation: boolean };

export function ActionPreview({ plan, onConfirm, onNavigate, loading }: { plan: Plan; onConfirm: () => void; onNavigate: () => void; loading: boolean }) {
  if (plan.actionType === "none") return null;
  const isNavigation = plan.actionType === "navigate"; const isDelete = plan.actionType.startsWith("delete"); const isEdit = plan.actionType.startsWith("update"); const isReschedule = plan.actionType === "reschedule_task"; const isPriority = plan.actionType === "reprioritize_task";
  const label = isNavigation ? `افتح ${routeLabels[plan.route] ?? "الصفحة"}` : isDelete ? `حذف «${plan.title}»` : isReschedule ? `نقل «${plan.targetTitle}» ليوم ${plan.scheduledFor}` : isPriority ? `تغيير أولوية «${plan.targetTitle}»` : isEdit ? `تعديل «${plan.targetTitle}» إلى «${plan.title}»` : actionDescription(plan);
  const detail = isNavigation ? "هتتنقل للصفحة دي من غير ما يتغير أي بيانات." : isDelete ? "هتتشال نهائيًا من المنصة. راجع الاسم قبل التأكيد." : isReschedule ? "الموعد الجديد مش هيتسجل غير بعد التأكيد." : isPriority ? `هتتغير الأولوية لـ ${plan.priority === "urgent" ? "مهم" : plan.priority === "low" ? "خفيف" : "متوسط"} بعد التأكيد.` : isEdit ? "التعديل هيحصل بعد ما تأكد، والبيانات التانية هتفضل زي ما هي." : "راجع الإجراء واضغط تأكيد عشان يتنفّذ.";
  return <div className={cn("mt-3 rounded-2xl border p-3 text-sm", isDelete ? "border-amber-200 bg-amber-50 text-amber-950" : "border-primary/20 bg-primary/5")}><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="font-bold">{label}</p><p className="mt-1 text-xs leading-5 opacity-80">{detail}</p></div></div><Button size="sm" className="mt-3 w-full" variant={isDelete ? "destructive" : "default"} disabled={loading} onClick={isNavigation ? onNavigate : onConfirm}>{isNavigation ? <><Compass />افتح الصفحة</> : <><Check />{loading ? "بيتنفّذ…" : "أيوه نفّذها"}</>}</Button></div>;
}

export function PersonalAssistantConversation({ height = "560px", brief }: { height?: string; brief?: string | null }) {
  const utils = trpc.useUtils(); const [page, navigate] = useLocation(); const [messages, setMessages] = useState<Message[]>([]); const [plan, setPlan] = useState<Plan | null>(null); const [voiceEnabled, setVoiceEnabled] = useState(true); const hydrated = useRef(false); const [shareWithOpenRouter, setShareWithOpenRouter] = useState(false);
  const { voices, selectedVoiceURI, chooseVoice, speak } = useArabicVoice();
  const memory = trpc.personalAssistant.memory.useQuery();
  useEffect(() => { if (!hydrated.current && memory.data) { setMessages(memory.data.map(message => ({ role: message.role, content: message.content }))); hydrated.current = true; } }, [memory.data]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  const say = (content: string) => { if (!voiceEnabled) return; const result = speak(content); if (!result.played && voices.length) toast.error(result.message); };
  const execute = trpc.personalAssistant.execute.useMutation({ onSuccess: async result => { setMessages(previous => [...previous, { role: "assistant", content: result.message }]); say(result.message); setPlan(null); await Promise.all([utils.tasks.list.invalidate(), utils.calendar.list.invalidate(), utils.habits.list.invalidate(), utils.goals.list.invalidate(), utils.studyPlan.list.invalidate(), utils.exams.list.invalidate(), utils.pomodoro.list.invalidate(), utils.rewards.list.invalidate(), utils.coins.ledger.invalidate(), utils.analytics.overview.invalidate(), utils.dashboard.summary.invalidate(), utils.personalAssistant.memory.invalidate()]); toast.success("تمام يا بطل، اتنفّذت."); }, onError: error => toast.error(errorText(error)) });
  const planRequest = trpc.personalAssistant.plan.useMutation({ onSuccess: result => { setMessages(previous => [...previous, { role: "assistant", content: result.reply }]); setPlan(result as Plan); say(result.reply); utils.personalAssistant.memory.invalidate(); }, onError: error => toast.error(errorText(error)) });
  const send = (content: string) => { if (!shareWithOpenRouter) return; setMessages(previous => [...previous, { role: "user", content }]); setPlan(null); planRequest.mutate({ request: content, page, shareWithOpenRouter }); };
  return <div>{brief && <div className="mb-3 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-bold">ملخص سيفي لليوم</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{brief}</p></div></div>}<div className="mb-3 rounded-2xl border border-primary/15 bg-primary/5 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">صوت سيفي</p><p className="text-xs text-muted-foreground">{voices.length ? "اختار صوت عربي من جهازك" : "مفيش صوت عربي متاح؛ مش هنستخدم صوت بلغة تانية."}</p></div><Button size="icon" variant="ghost" className="rounded-xl" aria-label={voiceEnabled ? "إيقاف صوت سيفي" : "تشغيل صوت سيفي"} onClick={() => { if (voiceEnabled) window.speechSynthesis?.cancel(); setVoiceEnabled(value => !value); }}>{voiceEnabled ? <Volume2 /> : <VolumeX />}</Button></div>{voices.length > 0 && <select aria-label="اختيار صوت سيفي العربي" className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-sm" value={selectedVoiceURI ?? voices[0]?.voiceURI ?? ""} onChange={event => chooseVoice(event.target.value)}>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} — {voice.lang}</option>)}</select>}</div><label className="mb-3 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs"><input type="checkbox" checked={shareWithOpenRouter} onChange={event => setShareWithOpenRouter(event.target.checked)} /><span>أوافق على إرسال رسائلي الحالية واسم الصفحة إلى OpenRouter للرد خلال المحادثة دي.</span></label>{shareWithOpenRouter && <><SeifyVoiceControl disabled={planRequest.isPending} onTranscript={send} /><AIChatBox className="overflow-hidden rounded-2xl shadow-none" height={height} messages={messages} onSendMessage={send} isLoading={planRequest.isPending} placeholder="اكتب طلبك لسيفي…" emptyStateMessage="أنا سيفي، صاحبك في المذاكرة. أعملك إيه؟" suggestedPrompts={pagePrompts[page] ?? quickPrompts} /></>}{plan && (plan.actionType !== "navigate" || Object.hasOwn(routeLabels, plan.route)) && <ActionPreview plan={plan} loading={execute.isPending} onConfirm={() => execute.mutate({ plan: plan as any, confirmed: true })} onNavigate={() => { if (plan.route) navigate(plan.route === "/tasks" ? "/calendar?view=all" : plan.route); setPlan(null); }} />}</div>;
}

export function PersonalAssistantPanel() {
  const [open, setOpen] = useState(false); const [brief, setBrief] = useState<string | null>(null); const daily = trpc.personalAssistant.dailySummary.useMutation({ onSuccess: summary => { setBrief(summary.content); if (summary.isNew) toast("ملخص سيفي لليوم جاهز", { description: summary.content }); } });
  useEffect(() => { daily.mutate(); }, []);
  return <div className="study-assistant fixed bottom-4 left-4 z-50 flex flex-col items-start gap-3" dir="rtl">{open && <section className="w-[calc(100vw-2rem)] max-w-[430px] overflow-hidden rounded-3xl border border-primary/20 bg-background shadow-2xl shadow-black/20"><header className="flex items-center justify-between border-b bg-gradient-to-l from-primary/15 via-primary/5 to-transparent p-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Sparkles className="size-5" /></span><div><p className="font-bold">سيفي — مساعدك الصوتي</p><p className="text-xs text-muted-foreground">قولّي عايز تعمل إيه</p></div></div><Button size="icon" variant="ghost" className="rounded-xl" aria-label="إغلاق المساعد" onClick={() => setOpen(false)}><X className="size-4" /></Button></header><div className="p-3"><PersonalAssistantConversation height="min(45vh, 390px)" brief={brief} /></div></section>}<Button aria-label={open ? "تصغير مساعد سيفي" : "فتح مساعد سيفي"} onClick={() => setOpen(value => !value)} className="group h-14 rounded-2xl px-4 shadow-xl shadow-primary/25"><Mic className="size-5 transition-transform group-hover:scale-110" /><span className="font-bold">{open ? "صغّر سيفي" : "كلم سيفي"}</span><ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /></Button></div>;
}

export function PersonalAssistantWorkspace() { return <div className="grid gap-4 xl:grid-cols-[.34fr_1fr]"><aside className="surface bg-gradient-to-b from-primary/10 via-background to-background p-6"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Mic /></span><h2 className="mt-5 text-xl font-extrabold">أنا سيفي، اتكلم معايا</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">دوس على المايك، احكي طلبك بالمصري، وأنا هرد عليك بصوت. بفتكر آخر كلامنا علشان ما تعيدش نفسك، وأي تعديل على مهامك لازم توافق عليه الأول.</p><div className="mt-5 rounded-2xl border border-primary/15 bg-background/70 p-4 text-sm"><p className="font-bold">أوامر تقدر تقولها</p><p className="mt-2 leading-7 text-muted-foreground">«خلّي مهمة حل المسائل بكرة»<br />«خلّي أولوية المراجعة مهمة»<br />«ضيف عادة مذاكرة يومية»</p></div></aside><PersonalAssistantConversation height="min(68vh, 700px)" /></div>; }
