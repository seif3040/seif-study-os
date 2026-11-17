import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { notifyStudy, prepareStudySound, setStudyMessageOwner } from "@/lib/studyAlerts";
import { cairoPlannerTime } from "@shared/examSchedule";
import { plannerToday } from "@shared/studyPlanner";

import { externalVideoDeadline } from "@shared/videoTimer";

export default function StudyAlerts({ ownerId }: { ownerId: number }) {
  const focus = trpc.pomodoro.list.useQuery();
  const videos = trpc.video.open.useQuery();
  const schedule = trpc.planner.list.useQuery();
  const utils = trpc.useUtils();
  const attempted = useRef(new Map<number, number>());
  const advance = trpc.video.setExternalTimer.useMutation({
    onSuccess: async result => {
      if (!result.blockCompleted) return;
      const { session } = result;
      notifyStudy("خلصت ٤٥ دقيقة من الدرس الخارجي. بدأ بريك ١٥ دقيقة.", "timer",
        session.userId + ":external-block:" + session.id + ":" + session.completedBlocks);
      await Promise.all([utils.video.invalidate(), utils.dashboard.summary.invalidate(), utils.analytics.overview.invalidate(), utils.coins.ledger.invalidate()]);
    },
  });
  const tick = advance.mutate;

  useEffect(() => {
    setStudyMessageOwner(ownerId);
    return () => setStudyMessageOwner(undefined);
  }, [ownerId]);

  useEffect(() => {
    document.addEventListener("pointerdown", prepareStudySound, true);
    document.addEventListener("keydown", prepareStudySound, true);
    return () => {
      document.removeEventListener("pointerdown", prepareStudySound, true);
      document.removeEventListener("keydown", prepareStudySound, true);
    };
  }, []);

  useEffect(() => {
    function check() {
      const now = Date.now();
      const signal = (until: number, message: string, id: string) => {
        if (now >= until && now - until < 90_000) notifyStudy(message, "timer", ownerId + ":" + id + ":" + until);
      };

      const active = focus.data?.find(item => item.state === "running");
      if (active) {
        const until = +active.startedAt + (active.plannedMinutes * 60 + active.pausedSeconds) * 1000;
        signal(until, "وقت التركيز خلص", "focus:" + active.id);
      }

      try {
        const plan = JSON.parse(localStorage.getItem("study-focus-plan:" + ownerId) ?? "null");
        const finished = plan && focus.data?.find(item => item.id === plan.sessionId && item.state === "completed");
        if (finished?.completedAt && plan.round < plan.rounds && !plan.skippedBreak && plan.rest > 0) {
          signal(+finished.completedAt + plan.rest * 60_000, "بريك البومودورو خلص", "focus-break:" + finished.id);
        }
      } catch { /* Invalid local plans have no break deadline. */ }

      for (const video of videos.data ?? []) {
        if (video.phase === "break" && video.breakEndsAt) {
          signal(+video.breakEndsAt, "استراحة فيديو المذاكرة خلصت", "video-break:" + video.id);
        }
        if (video.sourceMode === "external" && video.phase === "watching") {
          const until = externalVideoDeadline(video);
          if (until !== null && now >= until && now - (attempted.current.get(video.id) ?? 0) >= 10_000) {
            attempted.current.set(video.id, now);
            tick({ sessionId: video.id });
          }
        }
      }

      const day = plannerToday();
      for (const item of schedule.data?.studySessions ?? []) {
        if (item.day === day && !item.done) signal(+cairoPlannerTime(day, item.end), "انتهى وقت المذاكرة · " + item.title, "planned:" + item.id);
      }
    }
    check();
    const timer = window.setInterval(check, 1000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [focus.data, videos.data, schedule.data, ownerId, tick]);
  return null;
}
