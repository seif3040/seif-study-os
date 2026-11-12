import { useState, type FormEvent } from "react";
import { ReminderSettings } from "@/components/StudyReminders";
import StudyBackup from "@/components/StudyBackup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { useTheme } from "@/contexts/ThemeContext";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { Coins, Gift, Moon, Palette, Sun } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();
  const rates = trpc.economy.rates.useQuery();
  const catalog = trpc.rewards.list.useQuery();
  const [query, setQuery] = useState("");
  const setRate = trpc.economy.setRate.useMutation();
  const setPrice = trpc.economy.setRewardPrice.useMutation();
  const gifts = [...(catalog.data?.items ?? []), ...(catalog.data?.archived ?? [])]
    .filter(item => item.title.toLocaleLowerCase("ar-EG").includes(query.trim().toLocaleLowerCase("ar-EG")));
  const groups = [...new Set(rates.data?.map(item => item.group) ?? [])];
  const manage = catalog.data?.canManage;
  return <div className="space-y-5">
    <PageHeader title="الإعدادات" description="عدّل مظهر الموقع وأسعار الهدايا ومكافآت Coins." />
    <StudyBackup />
    <ReminderSettings />
    <section className="surface flex flex-wrap items-center justify-between gap-3 p-5">
      <h2 className="flex items-center gap-2 font-bold"><Palette />المظهر</h2>
      <Button variant="outline" onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}{theme === "dark" ? "المظهر الفاتح" : "المظهر الداكن"}</Button>
    </section>
    {catalog.isLoading && <p className="p-3 text-sm text-muted-foreground">جارٍ تحميل إعدادات الأسعار…</p>}
    {catalog.isError && <Button variant="outline" onClick={() => void catalog.refetch()}>إعادة تحميل إعدادات الأسعار</Button>}
    {manage && <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className="surface p-4 sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><Coins />مكافآت الأنشطة</h2>
        <p className="mb-4 text-xs text-muted-foreground">السعر الجديد يطبّق عند إكمال النشاط. استخدم صفر لإيقاف مكافأة نشاط.</p>
        {rates.isError && <Button variant="outline" onClick={() => void rates.refetch()}>إعادة تحميل المكافآت</Button>}
        {groups.map(group => <div key={group} className="mb-5 last:mb-0">
          <h3 className="mb-2 text-sm font-bold text-primary">{group}</h3>
          <div className="divide-y rounded-xl border px-3">
            {rates.data?.filter(item => item.group === group).map(item =>
              <PriceRow key={item.key + ":" + item.amount} label={item.label} amount={item.amount} min={0}
                onSave={async amount => { await setRate.mutateAsync({ key: item.key, amount }); await utils.economy.rates.invalidate(); }} />)}
          </div>
        </div>)}
      </section>
      <section className="surface p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Gift />أسعار الهدايا</h2>
        <Input className="mb-3" aria-label="ابحث عن هدية" placeholder="ابحث عن هدية…" value={query} onChange={event => setQuery(event.target.value)} />
        {gifts.length ? <div className="max-h-[35rem] divide-y overflow-y-auto rounded-xl border px-3">
          {gifts.map(item => <PriceRow key={item.id + ":" + item.cost} label={item.title + (item.active ? "" : " · مؤرشفة")} amount={item.cost} min={1}
            onSave={async cost => { await setPrice.mutateAsync({ rewardId: item.id, cost }); await utils.rewards.list.invalidate(); }} />)}
        </div> : <p className="text-sm text-muted-foreground">مفيش هدايا مطابقة.</p>}
      </section>
    </div>}
  </div>;
}

function PriceRow({ label, amount, min, onSave }: { label: string; amount: number; min: number; onSave: (amount: number) => Promise<void> }) {
  const [value, setValue] = useState(String(amount));
  const [saving, setSaving] = useState(false);
  const number = Number(value);
  const valid = value !== "" && Number.isInteger(number) && number >= min && number <= 1_000_000 && number !== amount;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try { await onSave(number); toast.success("تم حفظ السعر."); }
    catch (error) { toast.error(errorText(error)); }
    finally { setSaving(false); }
  }
  return <form className="flex flex-wrap items-center gap-2 py-2" onSubmit={save}>
    <span className="min-w-24 flex-1 text-sm font-medium">{label}</span>
    <Input className="w-24" aria-label={label + " بالكوينز"} type="number" inputMode="numeric" min={min} max={1_000_000} step={1} value={value} onChange={event => setValue(event.target.value)} />
    <Button size="sm" type="submit" variant="outline" disabled={!valid || saving}>حفظ</Button>
  </form>;
}
