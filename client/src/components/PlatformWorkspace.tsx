import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ExternalLink, PanelTop, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { platformFrameUrl, safeStudyUrl, sourceDomain } from "@/lib/videoSources";
import { externalVideoElapsed } from "@shared/videoTimer";
import type { VideoSubject } from "@shared/lessonSources";

type PlatformRequest = {
  url: string;
  title?: string;
  timer?: { subject: VideoSubject; sessionId: number; start?: boolean; elapsedMinutes?: number };
};

const PlatformContext = createContext<((options: PlatformRequest) => void) | null>(null);

export function usePlatformWorkspace() {
  return useContext(PlatformContext);
}

export function PlatformWorkspaceProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PlatformRequest | null>(null);
  const open = useCallback((options: PlatformRequest) => {
    const url = safeStudyUrl(options.url);
    if (!url || new URL(url).username || new URL(url).password) {
      toast.error("رابط المنصة غير صالح.");
      return;
    }
    setRequest({ ...options, url });
  }, []);

  return <PlatformContext.Provider value={open}>
    {children}
    {request && <PlatformDialog key={request.url + ":" + request.timer?.sessionId} request={request} onClose={() => setRequest(null)} />}
  </PlatformContext.Provider>;
}

export function PlatformLink({ href, title, className, children }: {
  href: string; title?: string; className?: string; children: ReactNode;
}) {
  const open = usePlatformWorkspace();
  const url = safeStudyUrl(href);
  if (!url || new URL(url).username || new URL(url).password) return null;
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!open || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open({ url: url!, title });
  }
  return <a href={url} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>{children}</a>;
}

function PlatformDialog({ request, onClose }: { request: PlatformRequest; onClose(): void }) {
  const { url, title, timer } = request;
  const host = sourceDomain(url);
  const frame = platformFrameUrl(url, window.location.origin);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [separateWindow, setSeparateWindow] = useState(false);
  const [now, setNow] = useState(Date.now);
  const startedHere = useRef(false);
  const autoStart = useRef(false);
  const utils = trpc.useUtils();
  const current = trpc.video.current.useQuery({ subject: timer?.subject ?? "other" }, { enabled: !!timer });
  const session = timer && current.data?.id === timer.sessionId ? current.data : null;
  const change = trpc.video.setExternalTimer.useMutation({
    onSuccess: (result, input) => {
      if (!timer) return;
      startedHere.current = input.running === true && result.session.timerRunning;
      utils.video.current.setData({ subject: timer.subject }, result.session);
      void Promise.all([utils.video.open.invalidate(), utils.planner.studyBreak.invalidate(),
        utils.analytics.overview.invalidate(), utils.dashboard.welcome.invalidate(), utils.dashboard.summary.invalidate()]);
    },
    onError: error => toast.error(errorText(error)),
  });

  const setTimer = change.mutate;
  useEffect(() => {
    if (!timer?.start || !session || session.phase === "break" || (!frame && !separateWindow) || session.timerRunning || autoStart.current) return;
    autoStart.current = true;
    setTimer({ sessionId: session.id, running: true, elapsedMinutes: timer.elapsedMinutes });
  }, [frame, separateWindow, session, setTimer, timer]);

  const running = !!session?.timerRunning;
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [running]);

  function openWindow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const studyWindow = window.open("about:blank", "_blank", "popup,width=1160,height=820");
    if (!studyWindow || studyWindow.closed) {
      setPopupBlocked(true);
      return;
    }
    try {
      studyWindow.opener = null;
      studyWindow.location.replace(url);
    } catch {
      studyWindow.close();
      setPopupBlocked(true);
      return;
    }
    setSeparateWindow(true);
    setPopupBlocked(false);
  }

  function close() {
    if (change.isPending) return;
    if (startedHere.current && running && session && !separateWindow) setTimer({ sessionId: session.id, running: false });
    onClose();
  }

  const heading = title || host;
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent dir="rtl" showCloseButton={false} className="flex h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[92dvh] sm:max-w-[min(96vw,1360px)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card p-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <PanelTop aria-hidden className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{heading}</DialogTitle>
            <DialogDescription dir="ltr" className="w-fit truncate text-xs">{host}</DialogDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {timer && current.isError && <Button size="sm" variant="outline" onClick={() => void current.refetch()}>أعد تحميل المؤقت</Button>}
          {session && <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1 text-sm">
            <Timer className="size-4 text-primary" aria-hidden />
            {session.phase === "break" ? <span>استراحة</span>
              : <><time dir="ltr" className="font-mono tabular-nums">{formatTime(externalVideoElapsed(session, now))}</time>
                <Button size="sm" variant="ghost" disabled={change.isPending}
                  onClick={() => setTimer({ sessionId: session.id, running: !running })}>{running ? "إيقاف مؤقت" : "ابدأ المؤقت"}</Button></>}
          </div>}
          <Button asChild size="sm" variant={frame ? "outline" : "default"}>
            <a href={url} rel="noopener noreferrer" target="_blank" onClick={openWindow}>
              <ExternalLink />{timer?.start && !frame && !running && session?.phase !== "break" ? "افتح المنصة وابدأ المؤقت" : "افتح في نافذة مذاكرة"}
            </a>
          </Button>
          <DialogClose asChild><Button size="icon" variant="ghost" disabled={change.isPending} aria-label="اقفل نافذة المنصة"><X /></Button></DialogClose>
        </div>
      </header>
      {popupBlocked && <p role="status" className="border-b bg-muted p-3 text-sm">
        المتصفح منع نافذة المذاكرة.{" "}
        <a className="font-semibold text-primary underline" href={url} target="_blank" rel="noopener noreferrer"
          onClick={() => setSeparateWindow(true)}>افتح المنصة في تابة</a>
      </p>}
      {frame ? <iframe className="min-h-0 w-full flex-1 bg-white" title={heading} src={frame}
        sandbox="allow-scripts allow-forms allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : <div className="grid min-h-0 flex-1 place-content-center overflow-auto p-6 text-center">
          <PanelTop aria-hidden className="mx-auto mb-3 size-8 text-primary" />
          <p className="font-semibold">{separateWindow ? "المنصة مفتوحة في نافذة المذاكرة" : "المنصة دي بتتفتح في نافذة مذاكرة"}</p>
          <p className="mt-2 text-sm text-muted-foreground">هتلاقي الجلسة والتحكم في الوقت هنا.</p>
        </div>}
      {frame && <p className="shrink-0 border-t bg-card px-3 py-2 text-xs text-muted-foreground">
        لو صفحة الدرس أو تسجيل الدخول مش ظاهرين، افتح المنصة في نافذة مذاكرة.
      </p>}
    </DialogContent>
  </Dialog>;
}

function formatTime(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(part => String(part).padStart(2, "0")).join(":");
}
