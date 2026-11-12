import { useEffect, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export default function WorkspaceSearch() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [text]);
  const results = trpc.workspaceSearch.useQuery({ query }, { enabled: query.length >= 2 });
  const data = results.data;
  const groups = data ? [
    { title: "المواد", rows: data.subjects.map(row => ({ ...row, detail: "", href: "/study-plan" })) },
    { title: "الدروس", rows: data.lessons.map(row => ({ ...row, detail: row.subject, href: "/study-plan" })) },
    { title: "المهام", rows: data.tasks.map(row => ({ ...row, detail: row.date, href: "/calendar?view=all" })) },
    { title: "الامتحانات", rows: data.exams.map(row => ({ ...row, detail: row.subject, href: "/exams" })) },
    { title: "محادثات جارفيس", rows: data.chats.map(row => ({ ...row, detail: "", href: "/seify?chat=" + row.id })) },
  ].filter(group => group.rows.length) : [];

  return <div className="space-y-5">
    <PageHeader title="ابحث في مذاكرتك" />
    <div className="surface flex items-center gap-3 p-4">
      <Search className="text-primary" aria-hidden />
      <Input autoFocus aria-label="البحث في الموقع" value={text} onChange={event => setText(event.target.value)} maxLength={100} placeholder="اسم مادة، درس، مهمة، امتحان أو شات…" />
    </div>
    {query.length >= 2 && <div aria-live="polite" className="space-y-4">
      {results.isError ? <p>تعذّر البحث. جرّب تاني.</p> : results.isFetching ? <p>جارٍ البحث…</p> : !groups.length ? <p>مفيش نتائج مطابقة.</p> : groups.map(group => <section key={group.title} className="surface overflow-hidden">
        <h2 className="border-b p-4 font-bold">{group.title}</h2>
        <ul className="divide-y">{group.rows.map(row => <li key={row.id}>
          <Link className="flex items-center gap-3 p-4 hover:bg-muted" href={row.href}><span className="flex-1"><b>{row.title}</b>{row.detail && <span className="block text-sm text-muted-foreground">{row.detail}</span>}</span><ArrowLeft className="size-4" /></Link>
        </li>)}</ul>
      </section>)}
    </div>}
  </div>;
}
