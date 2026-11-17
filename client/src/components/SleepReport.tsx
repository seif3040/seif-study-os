import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { plannerToday, shiftPlannerDay } from "@shared/studyPlanner";
import { sleepDuration, sleepTargetMinutes, type SleepLog } from "@shared/sleep";
import { minutesLabel } from "@/lib/study";
import { formatClock } from "@shared/clockFormat";

const shortDay = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", timeZone: "UTC" });

export default function SleepReport({ logs, daily, breakMilliseconds }: {
  breakMilliseconds: Record<string, number>;
  logs: Record<string, SleepLog>;
  daily: { day: string; minutes: number; videoMinutes?: number }[];
}) {
  const [range, setRange] = useState(14);
  const today = plannerToday();
  const effort = new Map(daily.map(day => [String(day.day).slice(0, 10), day]));
  const days = Array.from({ length: range }, (_, index) => {
    const day = shiftPlannerDay(today, index - range + 1);
    const record = logs[day];
    const activity = effort.get(day);
    const video = Number(activity?.videoMinutes ?? 0);
    return { day, label: shortDay.format(new Date(day)), sleep: record ? sleepDuration(record) : null,
      study: Math.max(0, Number(activity?.minutes ?? 0) - video), video, rest: (breakMilliseconds[day] ?? 0) / 60_000, record };
  });
  const restSeconds = Math.round(days.reduce((sum, day) => sum + day.rest, 0) * 60);
  const restLabel = (minutes: number) => {
    const seconds = Math.round(minutes * 60);
    const format = new Intl.NumberFormat("ar-EG");
    return [[Math.floor(seconds / 3600), "ساعة"], [Math.floor(seconds / 60) % 60, "د"], [seconds % 60, "ث"]]
      .filter(([value]) => value !== 0).map(([value, unit]) => format.format(Number(value)) + " " + unit).join(" و") || "٠ د";
  };
  const nights = days.flatMap(day => day.sleep === null ? [] : [day.sleep]);
  const average = nights.length ? Math.round(nights.reduce((sum, value) => sum + value, 0) / nights.length) : 0;
  const latest = days.filter(point => point.record).at(-1);
  return <section className="surface space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">النوم والمذاكرة والفيديو والاستراحة</h2>
      <label className="text-sm">الفترة <select className="rounded-md border bg-background p-1.5" value={range}
        onChange={event => setRange(Number(event.target.value))}><option value={14}>آخر ١٤ يوم</option><option value={30}>آخر ٣٠ يوم</option></select></label>
    </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border p-3"><p className="text-sm text-muted-foreground">متوسط النوم</p><b>{minutesLabel(average)}</b></div>
        <div className="rounded-xl border p-3"><p className="text-sm text-muted-foreground">وصلت لهدف النوم</p><b>{nights.filter(value => value >= sleepTargetMinutes).length} من {nights.length} ليالٍ</b></div>
        <div className="rounded-xl border p-3"><p className="text-sm text-muted-foreground">آخر نوم وصحيان</p><b>{latest?.record && formatClock(latest.record.bed) + " ← " + formatClock(latest.record.wake)}</b></div>
        <div className="rounded-xl border p-3"><p className="text-sm text-muted-foreground">إجمالي وقت الاستراحة</p><b>{restLabel(restSeconds / 60)}</b></div>
      </div>
      <p className="flex flex-wrap gap-4 text-sm"><span className="text-chart-1">■ مدة النوم</span><span className="text-chart-2">━ مذاكرة بدون فيديو</span><span className="text-chart-4">┄ وقت الفيديو</span><span className="text-chart-3">┅ وقت الاستراحة</span></p>
      <div className="study-analytics-chart h-64 min-w-0" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days}><CartesianGrid stroke="var(--muted-foreground)" opacity={0.22} vertical={false} /><XAxis dataKey="label" minTickGap={20} />
            <YAxis tickFormatter={value => String(value / 60)} unit=" س" />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }}
              contentStyle={{ backgroundColor: "var(--popover)", borderColor: "var(--border)", borderRadius: 12, direction: "rtl" }}
              labelStyle={{ color: "var(--popover-foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--popover-foreground)" }}
              formatter={(value, name) => [name === "وقت الاستراحة" ? restLabel(Number(value)) : minutesLabel(Number(value)), name]} />
            <Bar name="مدة النوم" dataKey="sleep" fill="var(--chart-1)" radius={[5, 5, 0, 0]} />
            <Line name="مذاكرة بدون فيديو" dataKey="study" stroke="var(--chart-2)" strokeWidth={3}
              dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 5, fill: "var(--chart-2)", stroke: "var(--card)" }} />
            <Line name="وقت الفيديو" dataKey="video" stroke="var(--chart-4)" strokeWidth={3} strokeDasharray="2 4" dot={{ r: 3 }} />
            <Line name="وقت الاستراحة" dataKey="rest" stroke="var(--chart-3)" strokeWidth={3} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    {!nights.length && <p className="text-sm text-muted-foreground">سجّل نومك من «النهارده» عشان يظهر في الرسم.</p>}
  </section>;
}
