import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { errorText, money, rarityColor, rarityNames, uuid } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { Gift, LockKeyhole, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

const rarities = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;

export default function Rewards() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.rewards.list.useQuery();
  const [filter, setFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [rarity, setRarity] = useState<typeof rarities[number]>("common");
  const [removing, setRemoving] = useState<{ id: number; title: string } | null>(null);
  const refresh = () => utils.rewards.list.invalidate();
  const purchase = trpc.rewards.purchase.useMutation({
    onSuccess: async result => {
      if (result.purchased) toast.success("تم شراء " + result.reward);
      else toast.message("تم تسجيل هذه العملية مسبقًا.");
      await Promise.all([refresh(), utils.coins.ledger.invalidate(), utils.dashboard.summary.invalidate(), utils.analytics.overview.invalidate()]);
    },
    onError: error => toast.error(errorText(error)),
  });
  const create = trpc.rewards.create.useMutation({
    onSuccess: async () => {
      setAddOpen(false);
      setTitle("");
      setCost("");
      setRarity("common");
      setFilter("all");
      toast.success("اتضافت الهدية.");
      await refresh();
    },
    onError: error => toast.error(errorText(error)),
  });
  const setActive = trpc.rewards.setActive.useMutation({
    onSuccess: async (_, input) => {
      setRemoving(null);
      toast.success(input.active ? "الهدية رجعت للقائمة." : "الهدية اتشالت من القائمة.");
      await refresh();
    },
    onError: error => toast.error(errorText(error)),
  });

  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  if (!data) return <EmptyState title="المتجر غير متاح" description="حاول تحديث الصفحة لاحقًا." />;

  const items = data.items.filter(item => filter === "all" || item.rarity === filter);
  const price = Number(cost);
  const valid = title.trim().length > 0 && Number.isInteger(price) && price > 0 && price <= 1_000_000;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid && !create.isPending) create.mutate({ title: title.trim(), cost: price, rarity });
  }

  return (
    <div>
      <PageHeader title="الهدايا" description="استخدم Coins اللي جمعتها لشراء مكافآتك." />
      <div className="surface mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="metric-icon bg-amber-100 text-amber-800"><Gift /></span>
          <div><p className="text-xs text-muted-foreground">رصيدك المتاح</p><p className="text-2xl font-extrabold text-primary">{money.format(data.coins.balance)} Coins</p></div>
        </div>
        {data.canManage && <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button variant="outline"><Plus /> هدية جديدة</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة هدية</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
              <label className="block space-y-1"><span>اسم الهدية</span><Input value={title} onChange={e => setTitle(e.target.value)} required maxLength={220} /></label>
              <label className="block space-y-1"><span>السعر بالـCoins</span><Input type="number" value={cost} onChange={e => setCost(e.target.value)} required min={1} max={1_000_000} step={1} /></label>
              <label className="block space-y-1"><span>الفئة</span><select className="w-full rounded-md border bg-background p-2" value={rarity} onChange={e => setRarity(e.target.value as typeof rarity)}>{rarities.map(value => <option key={value} value={value}>{rarityNames[value]}</option>)}</select></label>
              <DialogFooter><Button type="submit" disabled={!valid || create.isPending}>إضافة الهدية</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>}
        <div className="mr-auto flex flex-wrap gap-1">
          {["all", ...rarities].map(value => <Button key={value} size="sm" variant={filter === value ? "default" : "ghost"} onClick={() => setFilter(value)}>{value === "all" ? "الكل" : rarityNames[value]}</Button>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(reward => {
          const afford = data.coins.balance >= reward.cost;
          return <article key={reward.id} className="surface p-4">
            <div className="mb-4 flex items-start justify-between">
              <span className="metric-icon bg-primary/10 text-primary"><ShoppingBag /></span>
              <div className="flex items-center gap-2">
                <Badge className={rarityColor[reward.rarity]}>{rarityNames[reward.rarity]}</Badge>
                {data.canManage && <Button size="icon" variant="ghost" aria-label={"إزالة " + reward.title} onClick={() => setRemoving(reward)}><Trash2 /></Button>}
              </div>
            </div>
            <h2 className="font-semibold">{reward.title}</h2>
            <div className="mt-4 flex items-center justify-between">
              <b className="text-primary">{money.format(reward.cost)} Coins</b>
              <Button size="sm" variant={afford ? "default" : "outline"} disabled={!afford || purchase.isPending} onClick={() => purchase.mutate({ rewardId: reward.id, referenceKey: uuid() })}>{afford ? "شراء" : <><LockKeyhole />غير كافٍ</>}</Button>
            </div>
          </article>;
        })}
      </div>
      {!items.length && <EmptyState title="مفيش هدايا هنا" description="اختار فئة تانية أو أضف هدية جديدة." />}
      {data.canManage && data.archived.length > 0 && <details className="surface mt-5 p-4">
        <summary className="cursor-pointer font-semibold">الهدايا المُزالة ({data.archived.length})</summary>
        <ul className="mt-3 space-y-2">{data.archived.map(item => <li key={item.id} className="flex items-center justify-between gap-3"><span>{item.title}</span><Button size="sm" variant="outline" disabled={setActive.isPending} onClick={() => setActive.mutate({ rewardId: item.id, active: true })}>استرجاع</Button></li>)}</ul>
      </details>}
      <Dialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>إزالة {removing?.title} من الهدايا؟</DialogTitle></DialogHeader>
          <p>مشتريات الهدية هتفضل في السجل، وتقدر ترجعها للقائمة بعدين.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>إلغاء</Button>
            <Button variant="destructive" disabled={setActive.isPending} onClick={() => { if (removing) setActive.mutate({ rewardId: removing.id, active: false }); }}>إزالة الهدية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
