import { createContext, useContext, useState, type ReactNode } from "react";
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const sections = {
  overview: "النهارده وإنجاز اليوم",
  quickStart: "ابدأ المذاكرة",
  countdown: "عداد نهاية البكالوريا",
  homework: "الواجبات القادمة",
  verse: "آية اليوم",
  notices: "تنبيهات النوم والمذاكرة",
  prayers: "الصلوات",
  assessments: "التقييمات",
  yearReview: "مراجعة آخر السنة",
  dayPlan: "خطة اليوم",
  agenda: "المهام والامتحان الجاي",
  examReviews: "المراجعات المستحقة",
  progress: "تقدم المذاكرة",
};

type Section = keyof typeof sections;
type Layout = { order: Section[]; hidden: Section[] };
const defaultOrder = Object.keys(sections) as Section[];
const defaultLayout: Layout = { order: defaultOrder, hidden: [] };

function readLayout(key: string): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!Array.isArray(saved?.order) || !Array.isArray(saved.hidden)) return defaultLayout;
    const isSection = (id: Section) => defaultOrder.includes(id);
    return {
      order: [...new Set<Section>([...saved.order.filter(isSection), ...defaultOrder])],
      hidden: saved.hidden.filter(isSection),
    };
  } catch {
    return defaultLayout;
  }
}

const LayoutContext = createContext({
  layout: defaultLayout,
  update: (_layout: Layout) => {},
});

export function TodayLayoutProvider({ ownerId, children }: { ownerId: number; children: ReactNode }) {
  const key = "seif-today-layout-" + ownerId;
  const [layout, setLayout] = useState(() => readLayout(key));

  function update(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep the layout usable for this visit.
    }
  }

  return <LayoutContext.Provider value={{ layout, update }}>{children}</LayoutContext.Provider>;
}

export function TodaySections({ content }: { content: Record<Section, ReactNode> }) {
  const { layout } = useContext(LayoutContext);
  return <div className="space-y-5 wrap-anywhere">
    {layout.order.filter(id => !layout.hidden.includes(id)).map(id =>
      <div key={id} className="empty:hidden">{content[id]}</div>
    )}
    {layout.hidden.length === defaultOrder.length && <p className="surface p-5">افتح «تخصيص النهارده» عشان ترجع الأقسام اللي عايزها.</p>}
  </div>;
}

function SectionRow({ id, hidden, first, last, move, toggle }: {
  id: Section; hidden: boolean; first: boolean; last: boolean; move(offset: number): void; toggle(): void;
}) {
  const controls = useDragControls();
  const reducedMotion = useReducedMotion();
  return <Reorder.Item value={id} dragListener={false} dragControls={controls}
    transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
    whileDrag={reducedMotion ? undefined : { scale: 1.025 }}
    className="relative flex items-center gap-1 rounded-xl border bg-card px-2 py-1.5 sm:gap-2">
    <span title="اسحب لتغيير الترتيب" aria-hidden="true" className="touch-none select-none cursor-grab rounded-lg p-2 text-primary active:cursor-grabbing"
      onPointerDown={event => controls.start(event)}><GripVertical className="size-5" /></span>
    <span className="min-w-0 flex-1 text-sm font-semibold wrap-anywhere">{sections[id]}</span>
    <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={"حرّك لأعلى " + sections[id]} disabled={first} onClick={() => move(-1)}><ArrowUp /></Button>
    <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={"حرّك لأسفل " + sections[id]} disabled={last} onClick={() => move(1)}><ArrowDown /></Button>
    <Button type="button" size="icon" variant={hidden ? "outline" : "secondary"} className="size-8"
      aria-label={(hidden ? "أظهر " : "اخفي ") + sections[id]} onClick={toggle}>{hidden ? <EyeOff /> : <Eye />}</Button>
  </Reorder.Item>;
}

export function TodayLayoutControl() {
  const { layout, update } = useContext(LayoutContext);
  return <Dialog>
    <DialogTrigger asChild>
      <Button variant="ghost" size="icon" title="تخصيص النهارده" aria-label="تخصيص النهارده"><SlidersHorizontal /></Button>
    </DialogTrigger>
    <DialogContent dir="rtl" className="flex max-h-[88dvh] flex-col sm:max-w-lg">
      <DialogTitle>تخصيص النهارده</DialogTitle>
      <DialogDescription>اسحب القسم من المقبض لترتيبه، واضغط على العين لإخفائه أو إظهاره.</DialogDescription>
      <Reorder.Group axis="y" values={layout.order} onReorder={order => update({ ...layout, order })} layoutScroll className="min-h-0 space-y-2 overflow-y-auto p-1">
        {layout.order.map((id, index) => <SectionRow key={id} id={id} hidden={layout.hidden.includes(id)}
          first={index === 0} last={index === layout.order.length - 1}
          move={offset => {
            const order = [...layout.order];
            [order[index], order[index + offset]] = [order[index + offset], order[index]];
            update({ ...layout, order });
          }}
          toggle={() => update({ ...layout, hidden: layout.hidden.includes(id)
            ? layout.hidden.filter(item => item !== id) : [...layout.hidden, id] })} />)}
      </Reorder.Group>
      <Button type="button" variant="outline" onClick={() => update(defaultLayout)}>رجّع الترتيب الأصلي</Button>
    </DialogContent>
  </Dialog>;
}
