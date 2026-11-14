import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

export default function ActivityPoints() {
  const client = trpc.useUtils();
  useEffect(() => {
    const recorded = new Set<string>();
    let day = "";
    function record(event: MouseEvent) {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const control = event.target.closest("button,a[href],[role=button]");
      if (!control || control.matches(":disabled,[aria-disabled=true]")) return;
      const label = (control.getAttribute("aria-label") || control.textContent || "").trim().replace(/\s+/g, " ");
      if (!label || /خروج|حذف|إلغاء|امسح/.test(label)) return;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
      if (today !== day) { recorded.clear(); day = today; }
      const action = (location.pathname + ":" + label).slice(0, 150);
      if (recorded.has(action)) return;
      recorded.add(action);
      void client.client.economy.activity.mutate({ action }).then(result => {
        if (result.awarded) void Promise.all([client.coins.ledger.invalidate(), client.dashboard.summary.invalidate()]);
      }).catch(() => recorded.delete(action));
    }
    document.addEventListener("click", record);
    return () => document.removeEventListener("click", record);
  }, [client]);
  return null;
}
