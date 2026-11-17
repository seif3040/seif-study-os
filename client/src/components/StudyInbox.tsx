import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Message = { id: string; text: string; path: string; at: number; read: boolean };
const key = (owner: number) => "seif-study-inbox:" + owner;
const event = "seif-study-inbox-changed";

function read(owner: number): Message[] {
  try { return JSON.parse(localStorage.getItem(key(owner)) ?? "[]"); }
  catch { return []; }
}

function write(owner: number, messages: Message[]) {
  try { localStorage.setItem(key(owner), JSON.stringify(messages)); window.dispatchEvent(new Event(event)); }
  catch { /* The existing toast remains visible. */ }
}

export function recordStudyMessage(owner: number, text: string, path = "/today") {
  write(owner, [{ id: crypto.randomUUID(), text, path, at: Date.now(), read: false }, ...read(owner)].slice(0, 50));
}

export function StudyInbox({ owner }: { owner: number }) {
  const [messages, setMessages] = useState(() => read(owner));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sync = () => setMessages(read(owner));
    sync();
    window.addEventListener(event, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(event, sync); window.removeEventListener("storage", sync); };
  }, [owner]);
  const unread = messages.filter(item => !item.read).length;
  const date = new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Cairo" });
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="icon" variant="ghost" className="relative" aria-label={unread ? "رسائل المذاكرة، " + unread + " جديدة" : "رسائل المذاكرة"}>
      <Bell />{unread > 0 && <span className="absolute end-1 top-1 size-2 rounded-full bg-primary" aria-hidden />}
    </Button></DialogTrigger>
    <DialogContent dir="rtl" className="max-h-[85dvh] overflow-auto sm:max-w-lg" aria-describedby={undefined}>
      <DialogTitle>رسائل المذاكرة</DialogTitle>
      {unread > 0 && <Button variant="outline" size="sm" onClick={() => write(owner, messages.map(item => ({ ...item, read: true })))}>علّم الكل كمقروء</Button>}
      {messages.length ? <ul className="space-y-2">{messages.map(item => <li key={item.id}>
        <Link href={item.path} className={"block rounded-xl border p-3 text-sm " + (item.read ? "" : "border-primary/50 bg-primary/5")} onClick={() => {
          write(owner, read(owner).map(message => message.id === item.id ? { ...message, read: true } : message)); setOpen(false);
        }}>
          <p>{item.text}</p><time className="mt-1 block text-xs text-muted-foreground">{date.format(item.at)}</time>
        </Link>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">رسالة الصبح والتنبيهات الجديدة هتظهر هنا.</p>}
    </DialogContent>
  </Dialog>;
}
