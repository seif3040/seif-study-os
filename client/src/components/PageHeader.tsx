import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: { label: string; onClick: () => void } }) {
  return <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs font-bold tracking-[0.16em] text-primary">{eyebrow ?? "SEIF STUDY OS"}</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1><p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p></div>{action && <Button onClick={action.onClick} className="gap-2 self-start shadow-sm sm:self-auto"><Plus className="size-4" />{action.label}</Button>}</header>;
}

export function EmptyState({ title, description }: { title: string; description: string }) { return <div className="surface flex min-h-48 flex-col items-center justify-center p-8 text-center"><p className="font-semibold">{title}</p><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p></div>; }
