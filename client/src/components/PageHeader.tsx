import { Activity, BarChart3, BookOpen, CalendarDays, ClipboardList, Coins, FolderOpen, Gift, GraduationCap, Inbox, ListTodo, Plus, Settings, Sparkles, Timer, Video } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

const icons = {
  "/analytics": BarChart3, "/calendar": CalendarDays, "/coins": Coins, "/exams": GraduationCap,
  "/focus-lounge": Activity, "/habits": ListTodo, "/lesson-sources": FolderOpen,
  "/pomodoro": Timer, "/rewards": Gift, "/search": ClipboardList, "/seify": Sparkles,
  "/settings": Settings, "/study-plan": BookOpen, "/study-video": Video,
} as const;

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow?: string; title: string; description: string; action?: { label: string; onClick: () => void };
}) {
  const [location] = useLocation();
  const Icon = icons[location as keyof typeof icons] ?? Sparkles;
  return <header className="study-page-heading mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div className="flex items-start gap-3 sm:gap-4">
      <span className="study-heading-icon" aria-hidden><Icon /></span>
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
    {action && <Button onClick={action.onClick} className="study-interactive gap-2 self-start shadow-sm sm:self-auto"><Plus className="size-4" />{action.label}</Button>}
  </header>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="surface flex min-h-48 flex-col items-center justify-center p-8 text-center">
    <span className="study-heading-icon mb-3" aria-hidden><Inbox /></span>
    <p className="font-semibold">{title}</p>
    <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
  </div>;
}
