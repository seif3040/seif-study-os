import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";

const sections = [["tasks", "المهام"], ["lessons", "الدروس"], ["chats", "محادثات جارفيس"]] as const;

export default function StudyTrash() {
  const utils = trpc.useUtils();
  const trash = trpc.trash.list.useQuery();
  const restore = trpc.trash.restore.useMutation({
    onSuccess: async () => { toast.success("السجل رجع لمكانه."); await utils.invalidate(); },
    onError: error => toast.error(errorText(error)),
  });
  const count = sections.reduce((sum, [key]) => sum + (trash.data?.[key].length ?? 0), 0);

  return <section className="surface space-y-3 p-5">
    <h2 className="flex items-center gap-2 font-bold"><Trash2 className="size-4" />سلة المحذوفات</h2>
    {trash.isLoading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : trash.isError ? <p className="text-sm text-muted-foreground">تعذّر تحميل السلة.</p> : !count ? <p className="text-sm text-muted-foreground">السلة فاضية.</p> : sections.map(([kind, label]) => {
      const rows = trash.data?.[kind] ?? [];
      return rows.length ? <details key={kind}>
        <summary className="cursor-pointer text-sm font-medium">{label} · {rows.length}</summary>
        <ul className="mt-2 max-h-56 divide-y overflow-auto">{rows.map(row => <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span>{row.title}</span>
          <Button variant="ghost" size="sm" disabled={restore.isPending} onClick={() => restore.mutate({ kind, id: row.id })}><RotateCcw />استرجاع</Button>
        </li>)}</ul>
      </details> : null;
    })}
  </section>;
}
