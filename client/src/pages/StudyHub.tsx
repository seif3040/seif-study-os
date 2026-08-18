import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { BookOpen, BrainCircuit, CheckSquare, GraduationCap, Layers3, NotebookPen, Search, Sparkles, Timer, Video } from "lucide-react";

const tools = [
  { href: "/notebooks", title: "مساحة النوتس", copy: "اكتب، رتّب، واعمل دفاتر لكل مادة — مكانك كله جوه الموقع.", icon: NotebookPen, color: "from-violet-500 to-fuchsia-500" },
  { href: "/assistant", title: "صاحب المذاكرة", copy: "اشرح، اسأل، خطّط، وراجع مع مساعدك بالعربي.", icon: BrainCircuit, color: "from-sky-500 to-cyan-500" },
  { href: "/study-search", title: "دوّر في مذاكرتك", copy: "ابحث في نوتاتك ودروسك وكروتك من مكان واحد.", icon: Search, color: "from-lime-500 to-emerald-500" },
  { href: "/flashcards", title: "فلاش كاردز", copy: "تكرار ذكي وأسئلة قصيرة تخلي الحفظ يثبت.", icon: Layers3, color: "from-amber-500 to-orange-500" },
  { href: "/study-plan", title: "خطة المنهج", copy: "قسّم المنهج لدروس صغيرة وخلص واحدة واحدة.", icon: BookOpen, color: "from-emerald-500 to-teal-500" },
  { href: "/tasks", title: "خطة يومك", copy: "مهامك ومواعيدك من غير توتر ولا لخبطة.", icon: CheckSquare, color: "from-rose-500 to-pink-500" },
  { href: "/pomodoro", title: "فوكَس مود", copy: "جلسات تركيز وراحة في الوقت الصح.", icon: Timer, color: "from-indigo-500 to-blue-500" },
  { href: "/exams", title: "معمل الامتحانات", copy: "حدد الدروس واعرف إنت جاهز قد إيه قبل اللجنة.", icon: GraduationCap, color: "from-red-500 to-orange-500" },
  { href: "/study-video", title: "فيديو + نوتس", copy: "شوف، علّق، وارجع لملاحظاتك بأي توقيت.", icon: Video, color: "from-cyan-500 to-blue-500" },
];

export default function StudyHub() { return <div><PageHeader title="مركز المذاكرة" description="كل أدواتك هنا — بدل ما تتوه بين عشرين موقع. امسك هدفك وابدأ، والباقي علينا." /><section className="relative mb-6 overflow-hidden rounded-3xl bg-slate-950 p-7 text-white shadow-2xl"><div className="absolute -left-16 -top-20 size-56 rounded-full bg-violet-500/30 blur-3xl" /><div className="absolute -bottom-16 right-10 size-44 rounded-full bg-cyan-400/20 blur-3xl" /><div className="relative max-w-2xl"><p className="flex items-center gap-2 text-sm font-bold text-cyan-200"><Sparkles className="size-4" />مود الجدعنة شغال</p><h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">مش محتاج تبقى مثالي،<br />محتاج تبدأ وتكمّل.</h2><p className="mt-4 leading-7 text-slate-300">النوتس، الفلاش كاردز، الأسئلة، التركيز، والخطة كلهم جوه Study OS. اختار أداة واحدة دلوقتي وخد أول خطوة.</p></div></section><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tools.map(tool => { const Icon = tool.icon; return <Link key={tool.href} href={tool.href} className="group surface block p-5 transition hover:-translate-y-1 hover:shadow-xl"><span className={`flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.color} text-white shadow-lg`}><Icon className="size-6" /></span><h2 className="mt-5 font-extrabold">{tool.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tool.copy}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary">افتح الأداة <span className="transition group-hover:translate-x-1">←</span></span></Link>})}</div></div>; }
