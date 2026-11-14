import { useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import Pomodoro from "./Pomodoro";
import StudyVideo from "./StudyVideo";

export default function StudyStudio() {
  useEffect(() => {
    if (window.location.hash === "#pomodoro") document.getElementById("pomodoro")?.scrollIntoView();
  }, []);
  return <div className="space-y-4">
    <PageHeader title="فيديو المذاكرة + البومودورو" description="شغّل الدرس واضبط التركيز والبريك من نفس الصفحة." />
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.55fr)]">
      <div className="min-w-0"><StudyVideo embedded /></div>
      <section id="pomodoro" className="min-w-0 scroll-mt-20 space-y-3">
        <h2 className="text-lg font-bold">البومودورو والبريك</h2>
        <Pomodoro embedded />
      </section>
    </div>
  </div>;
}
