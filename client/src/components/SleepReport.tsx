import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { plannerToday, shiftPlannerDay } from "@shared/studyPlanner";
import { sleepDuration, sleepTargetMinutes, type SleepLog } from "@shared/sleep";
import { minutesLabel } from "@/lib/study";
import { formatClock } from "@shared/clockFormat";

const shortDay = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", timeZone: "UTC" });

export default function SleepReport({ logs, daily }: {
  logs: Record<string, SleepLog>;
  daily: { day: string; minutes: number }[];
}) {
  const [range, setRange] = useState(14);
  const today = plannerToday();
  const effort = new Map(daily.map(day => [String(day.day).slice(0, 10), Number(day.minutes)]));
  const days = Array.from({ length: range }, (_, index) => {
    const day = shiftPlannerDay(today, index - range + 1);
    const record = logs[day];
    return { day, label: shortDay.format(new Date(day)), sleep: record ? sleepDuration(record) : null,
      study: effort.get(day) ?? 0, record };
  });
  const nights = days.flatMap(day => day.sleep === null ? [] : [day.sleep]);
  const average = nights.length ? Math.round(nights.reduce((sum, value) => sum + value, 0) / nights.length) : 0;
  const latest = days.filter(point => point.record).at(-1);
  return <section className="surface space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">النوم والمذاكرة</h2>
      <label className="text-sm">الفترة <select className="rounded-md border bg-background p-1.5" value={range}
        onChange={event => setRange(Number(event.target.value))}><option value={14}>آخر ١٤ يوم</option><option value={30}>آخر ٣٠ يوم</option></select></label>
    </div>
    {nights.length ? <>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border p-3"><p className="text-sm text-muted-foreground">متوسط النوم</p><b>{minutesLabel(average)}</b></div>
        <div className="rounded-xl border p-3"><p className="text-sm text-muted-foreground">وصلت لهدف النوم</p><b>{nights.filter(value => value >= sleepTargetMinutes).length} من {nights.length} ليالٍ</b></div>
        <div className="rounded-xl border p-3"><p className="text-sm text-muted-foreground">آخر نوم وصحيان</p><b>{latest?.record && formatClock(latest.record.bed) + " ← " + formatClock(latest.record.wake)}</b></div>
      </div>
      <p className="flex flex-wrap gap-4 text-sm"><span className="text-primary">■ مدة النوم</span><span className="text-sky-500">━ وقت المذاكرة</span></p>
      <div className="h-64 min-w-0" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days}><CartesianGrid opacity={0.15} vertical={false} /><XAxis dataKey="label" minTickGap={20} />
            <YAxis tickFormatter={value => String(value / 60)} unit=" س" />
            <Tooltip formatter={(value, name) => [minutesLabel(Number(value)), name]} />
            <Bar name="مدة النوم" dataKey="sleep" fill="currentColor" className="text-primary" radius={[5, 5, 0, 0]} />
            <Line name="وقت المذاكرة" dataKey="study" stroke="currentColor" className="text-sky-500" strokeWidth={3} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </> : <p className="text-sm text-muted-foreground">سجّل نومك من «النهارده» عشان يظهر الرسم.</p>}
  </section>;
}
