import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { menu } from "@/lib/navigation";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { defaultDesktopTabs, defaultMobileTabs, type NavigationPrefs } from "@shared/navigation";

const defaults = { mobile: [...defaultMobileTabs], desktop: [...defaultDesktopTabs] };

export default function NavigationSettings() {
  const planner = trpc.planner.list.useQuery();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<NavigationPrefs>();
  const [device, setDevice] = useState<keyof NavigationPrefs>("mobile");
  const prefs = draft ?? planner.data?.navigation ?? defaults;
  const paths = prefs[device];
  const limit = device === "mobile" ? 5 : menu.length;
  const available = menu.filter(([, path]) => !paths.includes(path));
  const save = trpc.planner.saveNavigation.useMutation({
    onSuccess: async () => {
      await utils.planner.list.invalidate();
      setDraft(undefined);
      toast.success("اتحفظ ترتيب التبويبات.");
    },
    onError: error => toast.error(errorText(error)),
  });

  function update(next: string[]) {
    setDraft({ ...prefs, [device]: next });
  }

  function move(index: number, step: number) {
    const next = [...paths];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    update(next);
  }

  return <section className="surface space-y-3 p-4 sm:p-5">
    <h2 className="text-lg font-bold">ترتيب التبويبات</h2>
    <div className="flex gap-2">
      <Button size="sm" variant={device === "mobile" ? "default" : "outline"} aria-pressed={device === "mobile"}
        onClick={() => setDevice("mobile")}>الموبايل</Button>
      <Button size="sm" variant={device === "desktop" ? "default" : "outline"} aria-pressed={device === "desktop"}
        onClick={() => setDevice("desktop")}>اللابتوب</Button>
    </div>
    {planner.isLoading ? <p>جارٍ تحميل التبويبات…</p> : !planner.data ? <Button onClick={() => void planner.refetch()}>إعادة المحاولة</Button> :
      <fieldset disabled={save.isPending} className="space-y-3">
        <p className="text-sm text-muted-foreground">{device === "mobile"
          ? "شريط الموبايل من اليمين للشمال. تقدر تختار لحد ٥ تبويبات."
          : "ترتيب القائمة الجانبية من فوق لتحت."}</p>
        <ol className="divide-y rounded-lg border px-2">
          {paths.map((path, index) => {
            const label = menu.find(item => item[1] === path)?.[0] ?? path;
            return <li key={path} className="flex items-center gap-1 py-1.5">
              <span className="flex-1 text-sm">{label}</span>
              <Button variant="ghost" size="icon" aria-label={"قدّم " + label}
                disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
              <Button variant="ghost" size="icon" aria-label={"أخّر " + label}
                disabled={index === paths.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
              <Button size="sm" variant="ghost" aria-label={"اخفِ " + label}
                disabled={paths.length === 1 || (device === "desktop" && path === "/settings")}
                onClick={() => update(paths.filter(item => item !== path))}>إخفاء</Button>
            </li>;
          })}
        </ol>
        {available.length > 0 && paths.length < limit && <label className="block text-sm">أضف تبويب
          <select className="ms-2 rounded border bg-background p-1.5" value="" onChange={event => update([...paths, event.target.value])}>
            <option value="" disabled>اختار تبويب</option>
            {available.map(([label, path]) => <option value={path} key={path}>{label}</option>)}
          </select>
        </label>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!draft || save.isPending} onClick={() => save.mutate(prefs)}>حفظ الترتيب</Button>
          <Button size="sm" variant="outline" onClick={() => update(defaults[device])}>رجّع ترتيب الجهاز الافتراضي</Button>
        </div>
      </fieldset>}
  </section>;
}
