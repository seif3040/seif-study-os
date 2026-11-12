import { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Snapshot = {
  ownerId: number;
  savedAt: number;
  tasks: { title: string; completed: boolean }[];
  exam?: string;
};
declare global {
  interface Window {
    StudyOffline?: {
      remember(snapshot: Snapshot): Promise<void>;
      forget(): Promise<void>;
      get(key: string): Promise<unknown>;
      sync(): Promise<number>;
      background(): Promise<void>;
    };
  }
}

export default function OfflineTools({ ownerId }: { ownerId: number }) {
  const utils = trpc.useUtils();
  const summary = trpc.dashboard.summary.useQuery();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!summary.data || !window.StudyOffline) return;
    const { todaysTasks, upcomingExams } = summary.data;
    void window.StudyOffline.remember({
      ownerId, savedAt: summary.dataUpdatedAt,
      tasks: todaysTasks.map(task => ({ title: task.title, completed: task.status === "completed" })),
      exam: upcomingExams[0]?.title,
    }).catch(() => undefined);
  }, [ownerId, summary.data, summary.dataUpdatedAt]);

  useEffect(() => {
    let live = true;
    const sync = async () => {
      if (!navigator.onLine) return;
      try {
        const count = await window.StudyOffline?.sync();
        if (count && live) {
          toast.success("اتزامنت جلسات البومودورو");
          await utils.invalidate();
        }
      } catch {
        void window.StudyOffline?.background().catch(() => undefined);
      }
    };
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    const timer = window.setInterval(sync, 30_000);
    void sync();
    return () => {
      live = false;
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      window.clearInterval(timer);
    };
  }, [ownerId, utils]);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let candidate: ServiceWorker | null = null;
    function inspect() {
      if (active && navigator.serviceWorker.controller) setWaiting(registration?.waiting ?? null);
    }
    function watch() {
      candidate?.removeEventListener("statechange", inspect);
      candidate = registration?.installing ?? null;
      candidate?.addEventListener("statechange", inspect);
      inspect();
    }
    const check = () => { if (navigator.onLine) void registration?.update().catch(() => undefined); };
    const controllerChanged = () => setWaiting(null);
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    void navigator.serviceWorker.register("/study-worker.js", { updateViaCache: "none" }).then(result => {
      if (!active) return;
      registration = result;
      result.addEventListener("updatefound", watch);
      watch();
      check();
    }).catch(() => undefined);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const poll = window.setInterval(check, 60_000);
    return () => {
      active = false;
      candidate?.removeEventListener("statechange", inspect);
      registration?.removeEventListener("updatefound", watch);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.clearInterval(poll);
    };
  }, []);

  async function applyUpdate() {
    if (!waiting) return;
    try {
      const activeTimer = await window.StudyOffline?.get("timer:" + ownerId);
      if (activeTimer) {
        toast.info("سيب جلسة الأوفلاين تخلص الأول، وبعدها اضغط حدّث.");
        return;
      }
    } catch {
      toast.error("تعذّر التحقق من المؤقت على الجهاز.");
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "APPLY_UPDATE" });
  }

  return <div className="flex items-center gap-1">
    {waiting && <Button size="sm" onClick={() => void applyUpdate()}><Download />حدّث</Button>}
    <Button size="sm" variant="ghost" asChild><a href="/study-offline.html"><WifiOff />بدون نت</a></Button>
  </div>;
}
