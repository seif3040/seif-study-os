import { createHash } from "node:crypto";
import catalog from "./dailyQuranCatalog.json";
import { dailyQuranSignals } from "./db.js";

type Theme = "patience" | "effort" | "knowledge" | "gratitude" | "calm";
type VerseText = { text: string; explanation: string; footnotes: string };
type Signals = Awaited<ReturnType<typeof dailyQuranSignals>>;

const verses = {
  patience: [[2,153], [3,200], [11,115], [94,5], [94,6]],
  effort: [[53,39], [53,40], [29,69], [94,7], [99,7]],
  knowledge: [[20,114], [58,11], [39,9], [16,43]],
  gratitude: [[14,7], [27,19], [93,11], [16,53]],
  calm: [[13,28], [94,5], [2,286], [65,3], [3,159]],
} satisfies Record<Theme, number[][]>;

const number = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 });
const verseTexts: Record<string, VerseText> = catalog.verses;

export function studyReflection(signals: Signals): { theme: Theme; message: string } {
  const format = (value: number) => number.format(value);
  const attempts = signals.attempts;
  const latest = attempts[0];
  const previous = latest && attempts.find(item => item.subjectId === latest.subjectId && item.day < latest.day);
  const change = latest && previous ? latest.score - previous.score : 0;

  if (latest && previous && change <= -8) return { theme: "patience",
    message: `درجتك الأخيرة في ${latest.subject} كانت ${format(latest.score)}٪ بعد ${format(previous.score)}٪. خُد من الآية تذكير بالصبر، واختار سؤال واحد من اللي غلطت فيهم وافهم سبب الغلط قبل ما تعيد الحل.` };
  if (latest && previous && change >= 5) return { theme: "gratitude",
    message: `درجتك في ${latest.subject} اتحسّنت من ${format(previous.score)}٪ لـ${format(latest.score)}٪. افرح بالتقدّم، وفكّر في طريقة المذاكرة اللي ساعدتك عشان تكررها.` };
  if (latest && latest.score < 65) return { theme: "knowledge",
    message: `آخر درجة في ${latest.subject} كانت ${format(latest.score)}٪. ابدأ بجزء مش واضح ليك من الامتحان، وارجع للشرح أو اسأل المدرس عنه، وبعدها جرّب سؤال شبهه.` };
  if (signals.sleepMinutes !== null && signals.sleepMinutes < signals.sleepTarget) return { theme: "calm",
    message: `آخر نوم مسجّل كان ${format(signals.sleepMinutes / 60)} ساعة. ابدأ بحاجة صغيرة على قد طاقتك وسيب مساحة للراحة.` };
  if (signals.backlog > 0 && signals.activeDays < 4) return { theme: "effort",
    message: `عندك ${format(signals.backlog)} درس متراكم. اختار درس واحد يخدم أقرب حصة وخُد أول ٢٥ دقيقة فيه.` };
  if (signals.activeDays >= 4) return { theme: "gratitude",
    message: `ذاكرت في ${format(signals.activeDays)} أيام من آخر أسبوع وسجّلت ${format(signals.minutes / 60)} ساعة. خد لحظة تفرح بالاستمرار، واختار عادة واحدة ساعدتك تكررها الأسبوع ده.` };
  if (signals.lessons + signals.tasks > 0) return { theme: "effort",
    message: `آخر أسبوع خلّصت ${format(signals.lessons)} درس و${format(signals.tasks)} مهمة. افتكر إن خطوة صغيرة زي اللي عملتها ممكن تبقى بداية يوم كويس.` };
  return { theme: "effort", message: "ابدأ بخطوة صغيرة النهارده. افتح درس يهمّك، واكتب سؤال واحد نفسك تلاقي إجابته." };
}

export function dailyVerseReference(userId: number, day: string, theme: Theme) {
  const pool = verses[theme];
  const hash = createHash("sha256").update(JSON.stringify([day, userId, theme])).digest().readUInt32BE();
  const [surah, ayah] = pool[hash % pool.length];
  return { surah, ayah };
}

export async function dailyQuranVerse(userId: number, day: string) {
  const { theme, message } = studyReflection(await dailyQuranSignals(userId, day));
  const { surah, ayah } = dailyVerseReference(userId, day, theme);
  const verse = verseTexts[surah + ":" + ayah];
  return { ...verse, surah, ayah, reflection: message, edition: catalog.edition,
    source: "https://old.quranenc.com/ar/browse/arabic_moyassar/" + surah };
}
