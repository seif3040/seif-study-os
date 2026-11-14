import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { errorText, money } from "@/lib/study";
import { assessmentCatalog, assessmentGroups, type AssessmentStatus } from "@shared/assessments";

const labels: Record<AssessmentStatus, string> = {
  pending: "لسه مفتوح", backlog: "متراكم", completed: "مكتمل",
};

function AssessmentList({ backlogOnly = false }: { backlogOnly?: boolean }) {
  const planner = trpc.planner.list.useQuery();
  const utils = trpc.useUtils();
  const [subject, setSubject] = useState<string>(assessmentGroups[0].subject);
  const [filter, setFilter] = useState<AssessmentStatus | "all">("all");
  const change = trpc.planner.assessmentStatus.useMutation({
    onSuccess: () => utils.planner.list.invalidate(),
    onError: error => toast.error(errorText(error)),
  });
  if (planner.isLoading) return <p>جارٍ تحميل التقييمات…</p>;
  if (!planner.data) return <Button variant="outline" onClick={() => void planner.refetch()}>إعادة تحميل التقييمات</Button>;
  const statuses = planner.data.assessments ?? {};
  const items = assessmentCatalog.filter(item => {
    const status = statuses[item.id] ?? "pending";
    return backlogOnly ? status === "backlog" : item.subject === subject && (filter === "all" || status === filter);
  });
  return <section className="surface space-y-4 p-4 sm:p-5">
    {backlogOnly ? <h2 className="font-bold">التقييمات المتراكمة</h2> : <div className="flex flex-wrap items-center gap-2">
      {assessmentGroups.map(group => <Button key={group.subject} size="sm" variant={subject === group.subject ? "default" : "outline"}
        aria-pressed={subject === group.subject} onClick={() => setSubject(group.subject)}>{group.subject}</Button>)}
      <select aria-label="حالة التقييم" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}
        className="rounded-md border bg-background p-2 text-sm">
        <option value="all">كل التقييمات</option>
        {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>}
    {!items.length && <p className="text-sm text-muted-foreground">مفيش تقييمات بالقائمة دي.</p>}
    <ul className="divide-y">
      {items.map(item => {
        const status = statuses[item.id] ?? "pending";
        return <li key={item.id} className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-40 flex-1">
            <p className="font-semibold">{item.title}</p>
            <p className="text-sm text-muted-foreground">{item.subject} · صفحة {money.format(item.page)} في كتيب التقييمات · {labels[status]}</p>
          </div>
          <Button size="sm" variant="outline" disabled={change.isPending} onClick={() =>
            change.mutate({ assessmentId: item.id, status: status === "completed" ? "pending" : "completed" })}>
            {status === "completed" ? "إلغاء الإكمال" : "خلصت"}
          </Button>
          {status !== "completed" && <Button size="sm" variant="outline" disabled={change.isPending} onClick={() =>
            change.mutate({ assessmentId: item.id, status: status === "backlog" ? "pending" : "backlog" })}>
            {status === "backlog" ? "شيل من المتراكم" : "علّم كمتراكم"}
          </Button>}
        </li>;
      })}
    </ul>
  </section>;
}

export function AssessmentOverview({ backlogOnly = false }: { backlogOnly?: boolean }) {
  const { data } = trpc.planner.list.useQuery();
  if (backlogOnly) return <AssessmentList backlogOnly />;
  if (!data) return null;
  const statuses = data.assessments ?? {};
  const backlog = assessmentCatalog.filter(item => statuses[item.id] === "backlog");
  const completed = assessmentCatalog.filter(item => statuses[item.id] === "completed").length;
  return <section className="surface space-y-2 p-5">
    <h2 className="font-bold">التقييمات</h2>
    <p>{money.format(backlog.length)} تقييم متراكم · {money.format(completed)} مكتمل</p>
    {!!backlog.length && <ul className="text-sm text-muted-foreground">
      {backlog.slice(0, 3).map(item => <li key={item.id}>{item.subject} · {item.title}</li>)}
    </ul>}
    <Link href="/assessments" className="text-primary underline">افتح التقييمات</Link>
  </section>;
}

export default function Assessments() {
  return <div><PageHeader title="التقييمات" description="تقييمات الترم الأول، مرتبة حسب المادة والوحدة." /><AssessmentList /></div>;
}
