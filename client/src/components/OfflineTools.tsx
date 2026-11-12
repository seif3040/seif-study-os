import { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Snapshot = {
  ownerId: number;
  savedAt: number;
  tasks: { id: number; title: string; completed: boolean; day: string | null; updatedAt: number }[];
  exam?: string;
  lessons?: { id: number; title: string; subject: string; completed: boolean }[];
  exams?: { id: number; title: string }[];
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
  const { mutateAsync: saveDaily } = trpc.backup.keepDaily.useMutation();
  const plan = trpc.studyPlan.list.useQuery();
  const exams = trpc.exams.list.useQuery();
  const summary = trpc.dashboard.summary.useQuery();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [deferUpdate, setDeferUpdate] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    let alive = true;
    async function backup() {
      if (!navigator.onLine) return;
      try {
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const key = "seif-last-daily-backup:" + ownerId;
        if (sessionStorage.getItem(key) === day) return;
        await saveDaily();
        if (alive) {
          sessionStorage.setItem(key, day);
          await utils.backup.daily.invalidate();
        }
      } catch { /* Keep the next automatic attempt available. */ }
    }
    void backup();
    window.addEventListener("online", backup);
    window.addEventListener("focus", backup);
    const timer = window.setInterval(backup, 3_600_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("online", backup);
      window.removeEventListener("focus", backup);
    };
  }, [ownerId, saveDaily, utils]);

  useEffect(() => {
    if (!summary.data || !window.StudyOffline) return;
    const lessons = plan.data?.rows.flatMap(row => row.lesson ? [{
      id: row.lesson.id, title: row.lesson.title, subject: row.subject.title, completed: row.progress?.status === "completed",
    }] : []);
    const examChoices = exams.data?.filter(row => !row.exam.archivedAt).map(row => ({ id: row.exam.id, title: row.exam.title }));
    const { todaysTasks, upcomingExams } = summary.data;
    void window.StudyOffline.remember({
      ownerId, savedAt: summary.dataUpdatedAt,
      tasks: todaysTasks.map(task => ({ id: task.id, title: task.title, completed: task.status === "completed", day: task.scheduledFor, updatedAt: +new Date(task.updatedAt) })),
      exam: upcomingExams[0]?.title, lessons, exams: examChoices,
    }).catch(() => undefined);
  }, [ownerId, summary.data, summary.dataUpdatedAt, plan.data, exams.data]);

  useEffect(() => {
    let live = true;
    const sync = async () => {
      if (!navigator.onLine) return;
      try {
        const count = await window.StudyOffline?.sync();
        if (count && live) {
          toast.success("اتزامنت تغييرات الأوفلاين");
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

  async function applyUpdate(afterTimer = false) {
    if (!waiting) return;
    try {
      const activeTimer = await window.StudyOffline?.get("timer:" + ownerId);
      if (activeTimer) {
        if (!afterTimer) { setDeferUpdate(true); setUpdateOpen(false); toast.info("هنطبّق التحديث بعد الجلسة."); }
        return;
      }
    } catch {
      toast.error("تعذّر التحقق من المؤقت على الجهاز.");
      return;
    }
    setDeferUpdate(false);
    setUpdateOpen(false);
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "APPLY_UPDATE" });
  }

  useEffect(() => {
    if (!deferUpdate || !waiting) return;
    const timer = window.setInterval(() => void applyUpdate(true), 3000);
    return () => window.clearInterval(timer);
  }, [deferUpdate, waiting, ownerId]);

  return <div className="flex items-center gap-1">
    {waiting && <Button size="sm" onClick={() => setUpdateOpen(true)}><Download />{deferUpdate ? "التحديث بعد الجلسة" : "حدّث"}</Button>}
    <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>تحديث Seif Study OS</DialogTitle><DialogDescription>النسخة الجديدة جاهزة. لو فيه جلسة أوفلاين شغالة، التحديث هيتطبق بعد ما تخلص.</DialogDescription></DialogHeader>
        <p className="text-sm">آخر الإضافات تشمل إكمال المهام من غير نت وتحويل أخطاء الامتحانات لمهام مراجعة.</p>
        <DialogFooter><Button variant="outline" onClick={() => { setDeferUpdate(false); setUpdateOpen(false); }}>بعد شوية</Button><Button onClick={() => void applyUpdate()}>حدّث</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Button size="sm" variant="ghost" asChild><a href="/study-offline.html"><WifiOff />بدون نت</a></Button>
  </div>;
}
