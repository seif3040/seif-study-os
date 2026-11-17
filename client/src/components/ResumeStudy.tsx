import { resumePosition } from "@/pages/StudyVideo";
import { Link } from "wouter";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { videoSubjectNames } from "@shared/lessonSources";

export function ResumeStudy() {
  const open = trpc.video.open.useQuery();
  const latest = open.data?.[0];
  if (!latest) return null;
  const seconds = latest.sourceMode === "external" ? latest.activeSeconds : resumePosition(latest);
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
  return <section className="surface flex flex-wrap items-center justify-between gap-3 p-4">
    <div><h2 className="font-bold">كمّل آخر حاجة</h2><p className="text-sm text-muted-foreground">
      {latest.lessonTitle || videoSubjectNames[latest.subject]} · {latest.sourceMode === "external" ? "وقت الدراسة المسجّل" : "وقفت عند"} <bdi>{time}</bdi>
    </p></div>
    <Button asChild><Link href={"/study-video?subject=" + latest.subject + (latest.sourceMode === "embedded" ? "&play=1" : "")}><Play />كمّل {videoSubjectNames[latest.subject]}</Link></Button>
  </section>;
}
