import { useState } from "react";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { Bot, Check, ChevronDown, Compass, ShieldCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const quickPrompts = ["أعمل إيه النهارده؟", "ضيف مهمة مراجعة فيزياء", "ضيف عادة مذاكرة يومية", "افتحلي صفحة الامتحانات"];
const routeLabels: Record<string, string> = { "/tasks": "المهام", "/habits": "العادات", "/goals": "الأهداف", "/study-plan": "خطة المذاكرة", "/exams": "الامتحانات", "/pomodoro": "Pomodoro", "/notebooks": "Notebook AI", "/analytics": "التحليلات" };
type Plan = { reply: string; actionType: string; title: string; targetTitle: string; priority: "urgent" | "medium" | "low"; frequency: "daily" | "weekly"; target: number; route: string; requiresConfirmation: boolean };

function ActionPreview({ plan, onConfirm, onNavigate, loading }: { plan: Plan; onConfirm: () => void; onNavigate: () => void; loading: boolean }) {
  if (plan.actionType === "none") return null;
  const isNavigation = plan.actionType === "navigate";
  const isDelete = plan.actionType.startsWith("delete");
  const isEdit = plan.actionType.startsWith("update");
  const label = isNavigation ? `افتح ${routeLabels[plan.route] ?? "الصفحة"}` : isDelete ? `حذف «${plan.title}»` : isEdit ? `تعديل «${plan.targetTitle}» إلى «${plan.title}»` : `إضافة «${plan.title}»`;
  return <div className={cn("mt-3 rounded-2xl border p-3 text-sm", isDelete ? "border-amber-200 bg-amber-50 text-amber-950" : "border-primary/20 bg-primary/5")}><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="font-bold">{label}</p><p className="mt-1 text-xs leading-5 opacity-80">{isNavigation ? "هتتنقل للصفحة دي من غير ما يتغير أي بيانات." : isDelete ? "هتتشال نهائيًا من المنصة. راجع الاسم قبل التأكيد." : isEdit ? "التعديل هيحصل بعد ما تأكد، والبيانات التانية هتفضل زي ما هي." : "هتتضاف لحسابك بعد ما تأكد."}</p></div></div><Button size="sm" className="mt-3 w-full" variant={isDelete ? "destructive" : "default"} disabled={loading} onClick={isNavigation ? onNavigate : onConfirm}>{isNavigation ? <><Compass />افتح الصفحة</> : <><Check />{loading ? "بيتنفّذ…" : "أيوه نفّذها"}</>}</Button></div>;
}

export function PersonalAssistantConversation({ height = "560px" }: { height?: string }) {
  const utils = trpc.useUtils(); const [, navigate] = useLocation(); const [messages, setMessages] = useState<Message[]>([]); const [plan, setPlan] = useState<Plan | null>(null);
  const execute = trpc.personalAssistant.execute.useMutation({ onSuccess: async result => { setMessages(previous => [...previous, { role: "assistant", content: result.message }]); setPlan(null); await Promise.all([utils.tasks.list.invalidate(), utils.habits.list.invalidate(), utils.goals.list.invalidate(), utils.dashboard.summary.invalidate()]); toast.success("تمام يا بطل، اتنفّذت."); }, onError: error => toast.error(errorText(error)) });
  const planRequest = trpc.personalAssistant.plan.useMutation({ onSuccess: result => { setMessages(previous => [...previous, { role: "assistant", content: result.reply }]); setPlan(result as Plan); }, onError: error => toast.error(errorText(error)) });
  const send = (content: string) => { setMessages(previous => [...previous, { role: "user", content }]); setPlan(null); planRequest.mutate({ request: content }); };
  return <div><AIChatBox className="overflow-hidden rounded-2xl shadow-none" height={height} messages={messages} onSendMessage={send} isLoading={planRequest.isPending} placeholder="قولي عايز تغيّر أو تعمل إيه…" emptyStateMessage="أنا سيفي، صاحبك في المذاكرة. أعملك إيه؟" suggestedPrompts={quickPrompts} />{plan && <ActionPreview plan={plan} loading={execute.isPending} onConfirm={() => execute.mutate({ plan: plan as any, confirmed: true })} onNavigate={() => { if (plan.route) navigate(plan.route); setPlan(null); }} />}</div>;
}

export function PersonalAssistantPanel() {
  const [open, setOpen] = useState(false);
  return <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-3" dir="rtl">{open && <section className="w-[calc(100vw-2rem)] max-w-[430px] overflow-hidden rounded-3xl border border-primary/20 bg-background shadow-2xl shadow-black/20"><header className="flex items-center justify-between border-b bg-gradient-to-l from-primary/15 via-primary/5 to-transparent p-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Sparkles className="size-5" /></span><div><p className="font-bold">سيفي — مساعدك الشخصي</p><p className="text-xs text-muted-foreground">قولّي عايز تعمل إيه</p></div></div><Button size="icon" variant="ghost" className="rounded-xl" aria-label="إغلاق المساعد" onClick={() => setOpen(false)}><X className="size-4" /></Button></header><div className="p-3"><PersonalAssistantConversation height="min(56vh, 480px)" /></div></section>}<Button aria-label={open ? "تصغير مساعد سيفي" : "فتح مساعد سيفي"} onClick={() => setOpen(value => !value)} className="group h-14 rounded-2xl px-4 shadow-xl shadow-primary/25"><Bot className="size-5 transition-transform group-hover:scale-110" /><span className="font-bold">{open ? "صغّر سيفي" : "نادِ سيفي"}</span><ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /></Button></div>;
}

export function PersonalAssistantWorkspace() {
  return <div className="grid gap-4 xl:grid-cols-[.34fr_1fr]"><aside className="surface bg-gradient-to-b from-primary/10 via-background to-background p-6"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Bot /></span><h2 className="mt-5 text-xl font-extrabold">أنا سيفي، معاك في كل خطوة</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">قولي اللي محتاجه بالمصري. أقدر أجهّز لك مهمة أو عادة أو هدف، أو أوديك لصفحة المذاكرة المناسبة. أي إضافة أو حذف لازم تراجعها وتأكدها بنفسك الأول.</p><div className="mt-5 rounded-2xl border border-primary/15 bg-background/70 p-4 text-sm"><p className="font-bold">أمثلة سريعة</p><p className="mt-2 leading-7 text-muted-foreground">«ضيف مهمة حل مسائل جبر»<br />«امسح عادة السهر»<br />«افتحلي Notebook AI»</p></div></aside><PersonalAssistantConversation height="min(68vh, 700px)" /></div>;
}
