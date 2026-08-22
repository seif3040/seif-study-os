import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { BookOpen, CalendarClock, ExternalLink, GraduationCap, MapPin, MonitorPlay, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

type SourceForm = {
  subject: string;
  platform: string;
  teacherName: string;
  delivery: "online" | "in_person" | "hybrid";
  role: "primary" | "review" | "support";
  url: string;
  location: string;
  weeklyPlan: string;
  notes: string;
};

const emptyForm: SourceForm = { subject: "", platform: "", teacherName: "", delivery: "online", role: "primary", url: "", location: "", weeklyPlan: "", notes: "" };
const subjectTones: Record<string, string> = { "العربي": "bg-amber-100 text-amber-800", "التاريخ": "bg-rose-100 text-rose-800", "الإنجليزي": "bg-sky-100 text-sky-800", "البرمجة": "bg-violet-100 text-violet-800" };
const deliveryLabel = { online: "أونلاين", in_person: "حضور", hybrid: "أونلاين + حضور" };
const roleLabel = { primary: "مصدر أساسي", review: "مراجعة", support: "دعم" };

export default function LessonSources() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.lessonSources.list.useQuery();
  const seed = trpc.lessonSources.seedDefaults.useMutation({ onSuccess: async () => { await utils.lessonSources.list.invalidate(); toast.success("تمت إضافة مصادر دروسك."); }, onError: () => toast.error("تعذرت إضافة المصادر الآن.") });
  const sources = data ?? [];
  const counts = useMemo(() => ({ subjects: new Set(sources.map(source => source.subject)).size, primary: sources.filter(source => source.role === "primary").length, review: sources.filter(source => source.role === "review").length }), [sources]);

  useEffect(() => { if (!isLoading && sources.length === 0 && !seed.isPending) seed.mutate(); }, [isLoading, sources.length]);

  if (isLoading || (sources.length === 0 && seed.isPending)) return <div className="h-80 animate-pulse rounded-3xl bg-muted" />;

  return <div>
    <PageHeader title="مصادر دروسي" description="كل مدرس ومنصة وحصة حضور في مكان واحد، مع دور واضح لكل مصدر بدل تكرار نفس الدرس." action={{ label: "مصدر جديد", onClick: () => document.getElementById("source-trigger")?.click() }} />
    <SourceDialog onDone={() => utils.lessonSources.list.invalidate()} />

    {!sources.length ? <EmptyState title="مصادرك لم تُضف بعد" description="أضف المنصة أو الحصة الحضورية، ثم حدد دورها داخل خطتك." /> : <>
      <section className="mb-6 overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-2xl sm:p-8"><div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]"><div><Badge className="border-0 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/15"><GraduationCap className="ml-1 size-3.5" />مركز التحكم في الدروس</Badge><h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">خليك على منصة واحدة،<br />حتى لو دروسك في خمس أماكن.</h2><p className="mt-4 max-w-2xl leading-7 text-slate-300">الحضور مع أحمد غنيم هو أساس التاريخ، ومراجعة نادر الجورج على Massar Academy تكمل الدرس. نفس الفكرة تنطبق على كل مادة: مصدر رئيسي ثم مراجعة عند الحاجة.</p></div><div className="grid grid-cols-3 gap-2 self-end"><MiniMetric value={counts.subjects} label="مواد" /><MiniMetric value={counts.primary} label="أساسي" /><MiniMetric value={counts.review} label="مراجعة" /></div></div></section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sources.map(source => <SourceCard key={source.id} source={source} onDone={() => utils.lessonSources.list.invalidate()} />)}</section>
    </>}
  </div>;
}

function MiniMetric({ value, label }: { value: number; label: string }) { return <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center"><p className="text-2xl font-black">{value}</p><p className="mt-1 text-xs text-slate-400">{label}</p></div>; }

function SourceCard({ source, onDone }: { source: any; onDone: () => Promise<unknown> }) {
  const remove = trpc.lessonSources.delete.useMutation({ onSuccess: async () => { await onDone(); toast.success("تم حذف المصدر."); }, onError: () => toast.error("تعذر حذف المصدر.") });
  const open = source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground transition hover:opacity-90"><ExternalLink className="size-3.5" />فتح المصدر</a> : null;
  return <article className="surface flex flex-col p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Badge className={subjectTones[source.subject] ?? "bg-secondary text-secondary-foreground"}>{source.subject}</Badge><h2 className="mt-3 text-lg font-extrabold">{source.teacherName}</h2><p className="mt-1 text-sm text-muted-foreground">{source.platform}</p></div><SourceDialog source={source} onDone={onDone} /></div><div className="mt-5 flex flex-wrap gap-2"><Badge variant="outline"><MonitorPlay className="ml-1 size-3.5" />{deliveryLabel[source.delivery as keyof typeof deliveryLabel]}</Badge><Badge variant="outline"><BookOpen className="ml-1 size-3.5" />{roleLabel[source.role as keyof typeof roleLabel]}</Badge>{!source.active && <Badge variant="secondary">متوقف مؤقتًا</Badge>}</div><div className="mt-5 space-y-3 text-sm text-muted-foreground">{source.weeklyPlan && <p className="flex gap-2"><CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />{source.weeklyPlan}</p>}{source.location && <p className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" />{source.location}</p>}{source.notes && <p className="rounded-xl bg-muted/65 p-3 leading-6">{source.notes}</p>}</div><div className="mt-auto flex items-center gap-2 pt-5">{open}<Button variant="ghost" size="icon" aria-label="حذف المصدر" disabled={remove.isPending} onClick={() => window.confirm("حذف هذا المصدر؟") && remove.mutate({ sourceId: source.id })}><Trash2 className="size-4 text-rose-600" /></Button></div></article>;
}

function SourceDialog({ source, onDone }: { source?: any; onDone: () => Promise<unknown> }) {
  const initial = source ? { subject: source.subject, platform: source.platform, teacherName: source.teacherName, delivery: source.delivery, role: source.role, url: source.url ?? "", location: source.location ?? "", weeklyPlan: source.weeklyPlan ?? "", notes: source.notes ?? "" } : emptyForm;
  const [open, setOpen] = useState(false); const [form, setForm] = useState<SourceForm>(initial);
  const utils = trpc.useUtils();
  const create = trpc.lessonSources.create.useMutation({ onSuccess: async () => { await utils.lessonSources.list.invalidate(); setOpen(false); setForm(emptyForm); toast.success("تمت إضافة المصدر."); }, onError: () => toast.error("راجع بيانات المصدر وحاول مرة أخرى.") });
  const update = trpc.lessonSources.update.useMutation({ onSuccess: async () => { await onDone(); setOpen(false); toast.success("تم تحديث المصدر."); }, onError: () => toast.error("تعذر تحديث المصدر.") });
  const set = (key: keyof SourceForm, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const submit = () => { const payload = { ...form, url: form.url || undefined, location: form.location || undefined, weeklyPlan: form.weeklyPlan || undefined, notes: form.notes || undefined }; if (source) update.mutate({ ...payload, sourceId: source.id, active: source.active }); else create.mutate(payload); };
  const pending = create.isPending || update.isPending;
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger id={source ? undefined : "source-trigger"} asChild>{source ? <Button variant="ghost" size="icon" aria-label="تعديل المصدر"><Pencil className="size-4" /></Button> : <span />}</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{source ? "تعديل مصدر" : "إضافة مصدر درس"}</DialogTitle></DialogHeader><div className="grid gap-3"><div className="grid gap-3 sm:grid-cols-2"><Input value={form.subject} onChange={event => set("subject", event.target.value)} placeholder="المادة: العربي" /><Input value={form.teacherName} onChange={event => set("teacherName", event.target.value)} placeholder="اسم المدرس" /></div><Input value={form.platform} onChange={event => set("platform", event.target.value)} placeholder="المنصة أو نوع الحصة" /><Input dir="ltr" value={form.url} onChange={event => set("url", event.target.value)} placeholder="الرابط إن وُجد" /><div className="grid gap-3 sm:grid-cols-2"><select value={form.delivery} onChange={event => set("delivery", event.target.value)} className="h-10 rounded-md border bg-background px-3"><option value="online">أونلاين</option><option value="in_person">حضور</option><option value="hybrid">أونلاين + حضور</option></select><select value={form.role} onChange={event => set("role", event.target.value)} className="h-10 rounded-md border bg-background px-3"><option value="primary">مصدر أساسي</option><option value="review">مراجعة</option><option value="support">دعم</option></select></div><Input value={form.weeklyPlan} onChange={event => set("weeklyPlan", event.target.value)} placeholder="الموعد أو عدد الدروس أسبوعيًا" /><Input value={form.location} onChange={event => set("location", event.target.value)} placeholder="مكان الحصة إن كانت حضور" /><Textarea value={form.notes} onChange={event => set("notes", event.target.value)} placeholder="دور المصدر أو واجب ما بعد الدرس" /></div><DialogFooter><Button disabled={pending || !form.subject.trim() || !form.platform.trim() || !form.teacherName.trim()} onClick={submit}><Plus />{source ? "حفظ التعديل" : "إضافة المصدر"}</Button></DialogFooter></DialogContent></Dialog>;
}
