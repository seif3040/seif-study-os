import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function FloatingFocus({ seconds, status }: { seconds: number; status: string }) {
  const api = (window as Window & { documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<Window> } }).documentPictureInPicture;
  const [popup, setPopup] = useState<Window>();
  useEffect(() => {
    if (!popup) return;
    const close = () => setPopup(undefined);
    popup.addEventListener("pagehide", close, { once: true });
    return () => { popup.removeEventListener("pagehide", close); popup.close(); };
  }, [popup]);
  if (!api) return null;
  return <>
    <Button size="sm" variant="outline" className="mt-3" onClick={async () => {
      if (popup && !popup.closed) { popup.focus(); return; }
      try {
        const next = await api.requestWindow({ width: 280, height: 150 });
        next.document.title = "مؤقت المذاكرة";
        next.document.body.dir = "rtl";
        next.document.body.style.cssText = "margin:0;background:#12201d;color:white;font:16px system-ui;text-align:center";
        setPopup(next);
      } catch { toast.error("تعذّر فتح النافذة العائمة."); }
    }}>مؤقت في نافذة عائمة</Button>
    {popup && !popup.closed && createPortal(<div style={{ padding: 16 }}>
      <div>{status}</div>
      <strong dir="ltr" style={{ display: "block", fontSize: 38 }}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong>
    </div>, popup.document.body)}
  </>;
}
