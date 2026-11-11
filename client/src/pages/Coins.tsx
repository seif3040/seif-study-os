import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, WalletCards } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { money, shortDate } from "@/lib/study";
import { trpc } from "@/lib/trpc";

const cairoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });

export default function Coins() {
  const { data, isLoading } = trpc.coins.ledger.useQuery();
  const rates = trpc.economy.rates.useQuery();
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  if (!data) return <EmptyState title="السجل غير متاح" description="حاول مجددًا بعد قليل." />;

  const debt = Math.max(0, -data.summary.balance);
  const hourlyRate = rates.data?.find(rate => rate.key === "pomodoro_60")?.amount;
  let runningBalance = data.summary.balance;
  const history = [...data.entries].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) || b.id - a.id).map(entry => {
    const row = { ...entry, balance: runningBalance };
    runningBalance -= entry.amount;
    return row;
  });
  const visible = history.filter(entry => {
    const day = cairoDay.format(new Date(entry.createdAt));
    return (kind === "all" || (kind === "earned" ? entry.amount > 0 : entry.amount < 0))
      && entry.reason.toLocaleLowerCase("ar-EG").includes(query.trim().toLocaleLowerCase("ar-EG"))
      && (!start || day >= start) && (!end || day <= end);
  });

  return <div className="space-y-5">
    <PageHeader title="كشف حساب الكوينز" />
    <section className="study-hero rounded-3xl p-6">
      <WalletCards className="mb-3" />
      <p className="text-sm text-white/85">الرصيد الحالي</p>
      <p className="mt-1 text-4xl font-bold" dir="ltr">{money.format(data.summary.balance)}</p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>مكتسب {money.format(data.summary.earned)}</span><span>منفق {money.format(data.summary.spent)}</span></div>
      {debt > 0 && <p className="mt-3 text-sm text-white/85">فاضل {money.format(debt)} كوينز لتسديد الرصيد{hourlyRate ? `، حوالي ${money.format(Math.ceil(debt / hourlyRate))} ساعة بومودورو بالمكافأة الحالية.` : "."}</p>}
    </section>
    <div className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Input aria-label="بحث في كشف الحساب" placeholder="ابحث عن نشاط أو هدية" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="نوع الحركة" className="h-9 rounded-lg border bg-background px-2 text-sm" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="all">كل الحركات</option><option value="earned">مكتسب</option><option value="spent">منفق</option>
      </select>
      <label className="flex items-center gap-2 text-sm">من <Input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm">إلى <Input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
    </div>
    {visible.length ? <ul className="surface divide-y overflow-hidden">
      {visible.map(entry => <li key={entry.id} className="flex items-center gap-3 p-4">
        <span className={`metric-icon shrink-0 ${entry.amount > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{entry.amount > 0 ? <ArrowDownLeft /> : <ArrowUpRight />}</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{entry.reason}</p><p className="mt-1 text-xs text-muted-foreground">{shortDate.format(new Date(entry.createdAt))}</p></div>
        <div className="text-left"><b dir="ltr">{entry.amount > 0 ? "+" : ""}{money.format(entry.amount)}</b><p className="text-xs text-muted-foreground">الرصيد {money.format(entry.balance)}</p></div>
      </li>)}
    </ul> : <EmptyState title="مفيش حركات مطابقة" description="غيّر البحث أو الفلاتر عشان تشوف حركات تانية." />}
  </div>;
}
