import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { videoSubject, videoSubjectNames, type VideoSubject } from "@shared/lessonSources";
import { externalVideoDeadline } from "@shared/videoTimer";
import { notifyStudy } from "@/lib/studyAlerts";
import { Button } from "@/components/ui/button";

type Activity = {
  url: string;
  title?: string;
  detectedTitle?: string;
  restartedAt?: number;
  position?: number;
  playing?: boolean;
  lastAutoAt?: number;
  lastPlayingAt?: number;
  manualSince?: number;
  manualChangedAt?: number;
  updatedAt: number;
};
type EndGrant = { sessionId: number; endToken: string };
type Choice = { subject: VideoSubject; teacherName: string };
type SyncState = "linked" | "paused" | "break" | "conflict" | "unknown" | "choose" | "error";

function platformHost(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

export default function ExtensionStudySync() {
  const sources = trpc.lessonSources.list.useQuery();
  const utils = trpc.useUtils();
  const [ambiguous, setAmbiguous] = useState<{ activity: Activity; choices: Choice[] }>();
  const choose = useRef<(activity: Activity, subject: VideoSubject) => void>(() => {});
  const [notice, setNotice] = useState<{ subject: VideoSubject; state: SyncState }>();

  useEffect(() => {
    if (!sources.data) return;
    const origin = window.location.origin;
    const id = crypto.randomUUID();
    const saved = sources.data.flatMap(source => {
      const host = source.url && platformHost(source.url);
      return source.active && source.delivery !== "in_person" && host
        ? [{ host, subject: videoSubject(source.subject), teacherName: source.teacherName }] : [];
    });
    const choices = new Map<string, VideoSubject>();
    const queued = new Map<string, { activity: Activity; subject: VideoSubject }>();
    const processed = new Map<string, { activity: Activity; state: SyncState }>();
    const sessions = new Map<string, number>();
    const ended = new Map<string, number>();
    const grants = new Map<number, { token: string; issuedAt: number }>();
    const manualSessions = new Map<number, number>();
    let running = false;
    let disposed = false;

    function publish(activity: Activity, state: SyncState, subject?: VideoSubject, timer?: { seconds: number; startedAt: number; deadline: number }, grant?: EndGrant) {
      if (disposed) return;
      window.postMessage({
        type: "seif-study-extension:status", id, url: activity.url,
        status: { state, subject: subject ? videoSubjectNames[subject] : "", subjectKey: subject ?? "", timer, ...grant },
      }, origin);
      if (subject) setNotice(previous => previous?.subject === subject && previous.state === state ? previous : { subject, state });
    }

    async function sync(activity: Activity, subject: VideoSubject) {
      const auto = activity.lastAutoAt != null && Number.isFinite(activity.position);
      const playing = activity.playing === true && Date.now() - (activity.lastPlayingAt ?? 0) < 15000;
      const canStart = playing || !!activity.manualSince;
      const cached = utils.video.current.getData({ subject });
      const session = sessions.has(activity.url) && cached?.id === sessions.get(activity.url)
        ? cached : await utils.client.video.current.query({ subject });
      const url = new URL(activity.url).href;

      const linked = session && window.localStorage.getItem("study-extension-lesson:" + session.videoUrl);
      if (session && (session.sourceMode !== "external" || (session.videoUrl !== url && linked !== activity.url))) {
        publish(activity, "conflict", subject);
        return "conflict";
      }
      if (!session && (!canStart || sessions.has(activity.url))) {
        publish(activity, "paused", subject);
        return "paused";
      }

      const current = session ?? await utils.client.video.start.mutate({
        subject, videoUrl: url, lessonTitle: (activity.detectedTitle || activity.title)?.slice(0, 220), requestedMode: "external",
      });
      sessions.set(activity.url, current.id);
      let updated = current;
      let blockCompleted = false;
      if (current.phase !== "break" && activity.manualSince) {
        const newManualStart = manualSessions.get(current.id) !== activity.manualSince;
        if ((!current.timerRunning && newManualStart) || Date.now() >= (externalVideoDeadline(current) ?? Infinity)) {
          const result = await utils.client.video.setExternalTimer.mutate({ sessionId: current.id, running: current.timerRunning ? undefined : true });
          updated = result.session;
          blockCompleted = result.blockCompleted;
        }
        manualSessions.set(current.id, activity.manualSince);
      } else if (current.phase !== "break" && (auto || (current.timerRunning && manualSessions.has(current.id)))) {
        const result = auto && !current.timerRunning
          ? await utils.client.video.extensionPlayback.mutate({
            sessionId: current.id, active: playing, playbackPosition: Math.min(172800, activity.position!),
            ...(activity.detectedTitle ? { detectedTitle: activity.detectedTitle.slice(0, 220), pageTitle: activity.title?.slice(0, 220) } : {}),
          })
          : await utils.client.video.setExternalTimer.mutate({ sessionId: current.id, running: false });
        updated = result.session;
        blockCompleted = result.blockCompleted;
      }
      if (disposed) return "paused";

      if (updated.phase === "completed") void utils.video.current.invalidate({ subject });
      else utils.video.current.setData({ subject }, updated);
      utils.video.open.setData(undefined, previous => {
        const remaining = (previous ?? []).filter(item => item.id !== updated.id);
        return updated.phase === "completed" ? remaining : [updated, ...remaining];
      });
      if (!session) window.dispatchEvent(new CustomEvent("study-extension-session", { detail: subject }));
      if (blockCompleted) {
        notifyStudy("وقت مذاكرة الفيديو خلص. بدأت استراحة ١٥ دقيقة.", "timer");
        void utils.planner.studyBreak.invalidate();
        void utils.analytics.overview.invalidate();
        void utils.coins.ledger.invalidate();
      }
      const state = updated.phase === "break" ? "break" : (activity.manualSince ? updated.timerRunning : playing) && updated.phase !== "completed" ? "linked" : "paused";
      const deadline = externalVideoDeadline(updated);
      const timer = activity.manualSince && deadline != null && updated.lastPlaybackAt
        ? { seconds: updated.activeSeconds, startedAt: +updated.lastPlaybackAt, deadline } : undefined;
      let grant = grants.get(updated.id);
      if (updated.phase !== "completed" && (!grant || Date.now() - grant.issuedAt >= 6 * 60 * 60_000)) {
        try {
          const token = await utils.client.video.extensionEndToken.mutate({ subject, sessionId: updated.id });
          grant = { token, issuedAt: Date.now() };
          grants.set(updated.id, grant);
        } catch { /* Playback still syncs if the end grant cannot be renewed. */ }
      }
      publish(activity, state, subject, timer, grant ? { sessionId: updated.id, endToken: grant.token } : undefined);
      return state;
    }

    async function drain() {
      if (running) return;
      running = true;
      try {
        while (!disposed && queued.size) {
          const [key, { activity, subject }] = queued.entries().next().value!;
          queued.delete(key);
          const previous = processed.get(key);
          if (previous && previous.activity.updatedAt >= activity.updatedAt && previous.state !== "error" && previous.state !== "conflict" && !activity.manualSince) continue;
          try {
            const run = async () => {
              if (!disposed && !queued.has(key)) {
                const state = await sync(activity, subject);
                processed.set(key, { activity, state });
              }
            };
            if (navigator.locks) await navigator.locks.request("study-extension:" + subject, { ifAvailable: true }, lock => lock ? run() : undefined);
            else await run();
          } catch {
            processed.set(key, { activity, state: "error" });
            publish(activity, "error", subject);
          }
        }
      } finally {
        running = false;
      }
    }

    function enqueue(activity: Activity, subject: VideoSubject) {
      const previous = queued.get(activity.url);
      if (!previous || previous.activity.updatedAt <= activity.updatedAt) queued.set(activity.url, { activity, subject });
      void drain();
    }
    choose.current = (activity, subject) => {
      choices.set(platformHost(activity.url), subject);
      setAmbiguous(undefined);
      enqueue(activity, subject);
    };

    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== origin || event.data?.id !== id) return;
      if (event.data.type === "seif-study-extension:ended") {
        const { url, subject, endedAt, sessionId } = event.data;
        if (typeof url !== "string" || !Object.hasOwn(videoSubjectNames, subject) || !Number.isFinite(endedAt)) return;
        ended.set(url, endedAt);
        queued.delete(url);
        grants.delete(sessionId);
        void Promise.all([
          utils.video.invalidate(), utils.planner.studyBreak.invalidate(),
          utils.analytics.overview.invalidate(), utils.dashboard.summary.invalidate(), utils.dashboard.welcome.invalidate(), utils.coins.ledger.invalidate(),
        ]);
        return;
      }
      if (event.data.type !== "seif-study-extension:activities" || !Array.isArray(event.data.data)) return;
      const activeSubjects = new Set<VideoSubject>();
      for (const activity of event.data.data as Activity[]) {
        if (typeof activity?.url !== "string" || activity.url.length > 2000 || !Number.isFinite(activity.updatedAt)
            || (!activity.lastAutoAt && !activity.manualChangedAt)) continue;
        const endedAt = ended.get(activity.url);
        if (endedAt !== undefined) {
          if (!activity.restartedAt || activity.restartedAt <= endedAt) continue;
          ended.delete(activity.url);
          sessions.delete(activity.url);
          processed.delete(activity.url);
        }
        const host = platformHost(activity.url);
        if (!host) continue;
        const matching = saved.filter(source => host === source.host || host.endsWith("." + source.host));
        const specificity = Math.max(0, ...matching.map(source => source.host.length));
        const options = Array.from(new Map(matching.filter(source => source.host.length === specificity)
          .map(source => [source.subject, source])).values());
        const subject = choices.get(host) ?? (options.length === 1 ? options[0].subject
          : options.length === 0 && (host === "sherbeniacademy.com" || host.endsWith(".sherbeniacademy.com")) ? "history" : undefined);
        if (subject) {
          if (activeSubjects.has(subject)) continue;
          activeSubjects.add(subject);
          enqueue(activity, subject);
        } else if (options.length > 1 && (activity.playing || activity.manualSince)) {
          setAmbiguous({ activity, choices: options });
          publish(activity, "choose");
        } else if (!options.length) publish(activity, "unknown");
      }
    }

    function subscribe() {
      window.postMessage({ type: "seif-study-extension:subscribe", id }, origin);
    }
    window.addEventListener("message", receive);
    window.addEventListener("focus", subscribe);
    subscribe();
    const retry = window.setInterval(subscribe, 5000);
    return () => {
      disposed = true;
      window.removeEventListener("message", receive);
      window.removeEventListener("focus", subscribe);
      window.clearInterval(retry);
      window.postMessage({ type: "seif-study-extension:unsubscribe", id }, origin);
    };
  }, [sources.data, utils]);

  if (ambiguous) return <div className="surface fixed bottom-4 left-4 z-40 max-w-sm space-y-2 p-3">
    <p className="text-sm font-semibold">المنصة دي لأكتر من مادة. بتذاكر إيه؟</p>
    <div className="flex flex-wrap gap-2">{ambiguous.choices.map(choice =>
      <Button key={choice.subject} size="sm" onClick={() => choose.current(ambiguous.activity, choice.subject)}>
        {videoSubjectNames[choice.subject]} · {choice.teacherName}
      </Button>)}</div>
  </div>;

  return notice?.state === "conflict" ? <div className="surface fixed bottom-4 left-4 z-40 max-w-sm space-y-2 p-3 text-sm" role="status">
    <p>فيه درس تاني مفتوح في {videoSubjectNames[notice.subject]}. انهي جلسته قبل ربط الفيديو الجديد.</p>
    <Link href={"/study-video?subject=" + notice.subject} className="text-primary underline">افتح الجلسة الحالية</Link>
  </div> : null;
}
