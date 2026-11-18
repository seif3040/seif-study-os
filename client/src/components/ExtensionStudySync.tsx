import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { videoSubject } from "@shared/lessonSources";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Activity = { url: string; title: string; lastPlayingAt?: number; manualSince?: number };

export default function ExtensionStudySync() {
  const sources = trpc.lessonSources.list.useQuery();
  const utils = trpc.useUtils();
  const pending = useRef(false);
  const [ambiguous, setAmbiguous] = useState<{ activity: Activity; choices: { subject: string; teacherName: string }[] }>();
  const [last, setLast] = useState("");
  async function start(activity: Activity, subjectName: string) {
    if (pending.current) return;
    pending.current = true;
    try {
      const subject = videoSubject(subjectName);
      if (subject === "other") return;
      const open = await utils.client.video.open.query();
      const session = open.find(item => item.subject === subject);
      if (session && (session.sourceMode !== "external" || session.videoUrl !== activity.url)) {
        if (last !== activity.url) toast.info("عندك جلسة مفتوحة في " + subjectName + ". افتح فيديو المذاكرة لاختيار الدرس.");
        setLast(activity.url);
        return;
      }
      const current = session ?? await utils.client.video.start.mutate({
        subject, videoUrl: activity.url, lessonTitle: activity.title.slice(0, 220), requestedMode: "external",
      });
      if (current.phase !== "break" && !current.timerRunning) {
        await utils.client.video.setExternalTimer.mutate({ sessionId: current.id, running: true });
        await Promise.all([utils.video.invalidate(), utils.analytics.overview.invalidate()]);
        toast.success("بدأت جلسة " + subjectName + " من منصة المدرس.");
      }
    } catch { if (last !== activity.url) toast.error("تعذّر بدء جلسة المنصة. جرّب فتح فيديو المذاكرة."); setLast(activity.url); }
    finally { pending.current = false; }
  }
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!sources.data) return;
    const saved = sources.data.filter(source => source.active && source.delivery !== "in_person" && source.url);
    const id = crypto.randomUUID();
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.id !== id ||
          event.data.type !== "seif-study-extension:progress" || !event.data.list || !Array.isArray(event.data.data)) return;
      const recent = (event.data.data as Activity[]).find(item =>
        typeof item.url === "string" && (item.manualSince || Number.isFinite(item.lastPlayingAt) && Date.now() - item.lastPlayingAt! < 12000));
      if (!recent) return;
      let url: URL;
      try { url = new URL(recent.url); if (url.protocol !== "https:") return; } catch { return; }
      const matching = saved.filter(source => {
        try { return new URL(source.url!).hostname.replace(/^www\./, "") === url.hostname.replace(/^www\./, ""); } catch { return false; }
      });
      const unique = Array.from(new Map(matching.map(source => [source.subject, source])).values());
      if (unique.length === 1) void startRef.current(recent, unique[0].subject);
      else if (unique.length > 1) setAmbiguous({ activity: recent, choices: unique });
    }
    function refresh() {
      for (const source of saved) window.postMessage({ type: "seif-study-extension:request", id, url: source.url, list: true }, location.origin);
    }
    window.addEventListener("message", receive);
    window.addEventListener("focus", refresh);
    refresh();
    const timer = window.setInterval(refresh, 6000);
    return () => { window.removeEventListener("message", receive); window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [sources.data]);
  return ambiguous ? <div className="surface fixed bottom-24 left-4 z-40 max-w-sm space-y-2 p-3" role="status">
    <p className="text-sm font-semibold">المنصة دي لأكتر من مادة. بتذاكر إيه؟</p>
    <div className="flex flex-wrap gap-2">{ambiguous.choices.map(choice =>
      <Button key={choice.subject} size="sm" onClick={() => { void start(ambiguous.activity, choice.subject); setAmbiguous(undefined); }}>{choice.subject}</Button>)}</div>
    <Link href="/study-video" className="text-sm text-primary underline">افتح فيديو المذاكرة</Link>
  </div> : null;
}
